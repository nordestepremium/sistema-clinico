const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Stripe = require('stripe');
const { pool } = require('../db');
const { enviarEmailBoasVindas, enviarEmailRenovacao, enviarEmailFalhaPagamento } = require('../email');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

function gerarSenhaProvisoria() {
  // Senha fácil de digitar/ler no e-mail, mas com bastante entropia.
  return crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
}

// Cria a clínica + usuário admin a partir de um pagamento aprovado.
async function provisionarClinica({ email, nome, stripeCustomerId, stripeSubscriptionId, acessoExpiraEm }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const clinicaRes = await client.query(
      `INSERT INTO clinicas (nome, stripe_customer_id, stripe_subscription_id, assinatura_status, acesso_expira_em)
       VALUES ($1,$2,$3,'ativa',$4) RETURNING id`,
      [nome || 'Minha Clínica', stripeCustomerId, stripeSubscriptionId, acessoExpiraEm]
    );
    const clinicaId = clinicaRes.rows[0].id;

    const senhaProvisoria = gerarSenhaProvisoria();
    const hash = await bcrypt.hash(senhaProvisoria, 12);
    await client.query(
      `INSERT INTO usuarios (clinica_id, nome, usuario, senha_hash, role) VALUES ($1,$2,$3,$4,'admin')`,
      [clinicaId, nome || 'Administrador(a)', email.toLowerCase(), hash]
    );

    await client.query('COMMIT');
    return { clinicaId, senhaProvisoria };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// O Stripe precisa do corpo "cru" da requisição (sem JSON.parse) pra verificar a assinatura.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Assinatura do webhook inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // Primeiro pagamento aprovado — cria a clínica do zero.
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_details?.email || session.customer_email;
        const nome = session.customer_details?.name || '';
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const acessoExpiraEm = new Date(subscription.current_period_end * 1000);

        const jaExiste = await pool.query('SELECT id FROM clinicas WHERE stripe_customer_id=$1', [session.customer]);
        if (jaExiste.rows[0]) break; // evita duplicar se o Stripe reenviar o mesmo evento

        const emailJaCadastrado = await pool.query('SELECT id FROM usuarios WHERE usuario=$1', [String(email || '').toLowerCase()]);
        if (emailJaCadastrado.rows[0]) {
          console.error(`[billing] E-mail "${email}" já tem cadastro no sistema — pagamento aprovado, mas não foi possível criar uma clínica nova automaticamente. Verifique manualmente.`);
          break;
        }

        const { senhaProvisoria } = await provisionarClinica({
          email, nome,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          acessoExpiraEm
        });

        await enviarEmailBoasVindas({
          para: email,
          nomeClinica: nome || 'Sua clínica',
          nomeAdmin: nome || 'Profissional',
          email,
          senhaProvisoria,
          urlSistema: process.env.URL_SISTEMA || 'https://seusistema.netlify.app'
        });
        break;
      }

      // Cobrança recorrente aprovada — renova o acesso.
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.billing_reason === 'subscription_create') break; // já tratado no checkout.session.completed
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const acessoExpiraEm = new Date(subscription.current_period_end * 1000);

        const result = await pool.query(
          `UPDATE clinicas SET assinatura_status='ativa', acesso_expira_em=$1 WHERE stripe_customer_id=$2 RETURNING id`,
          [acessoExpiraEm, invoice.customer]
        );
        if (result.rows[0]) {
          const usuario = await pool.query('SELECT nome, usuario FROM usuarios WHERE clinica_id=$1 ORDER BY created_at LIMIT 1', [result.rows[0].id]);
          if (usuario.rows[0]) {
            await enviarEmailRenovacao({ para: usuario.rows[0].usuario, nomeAdmin: usuario.rows[0].nome, novaDataExpiracao: acessoExpiraEm });
          }
        }
        break;
      }

      // Cobrança falhou — avisa, mas só bloqueia de fato se a assinatura for cancelada depois.
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const result = await pool.query(
          `UPDATE clinicas SET assinatura_status='inadimplente' WHERE stripe_customer_id=$1 RETURNING id`,
          [invoice.customer]
        );
        if (result.rows[0]) {
          const usuario = await pool.query('SELECT nome, usuario FROM usuarios WHERE clinica_id=$1 ORDER BY created_at LIMIT 1', [result.rows[0].id]);
          if (usuario.rows[0]) {
            await enviarEmailFalhaPagamento({ para: usuario.rows[0].usuario, nomeAdmin: usuario.rows[0].nome });
          }
        }
        break;
      }

      // Assinatura cancelada (pelo cliente ou após falhas repetidas) — bloqueia o acesso.
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await pool.query(
          `UPDATE clinicas SET assinatura_status='cancelada' WHERE stripe_customer_id=$1`,
          [subscription.customer]
        );
        break;
      }
    }

    res.json({ recebido: true });
  } catch (err) {
    console.error('Erro ao processar webhook do Stripe:', err);
    res.status(500).json({ erro: 'Erro ao processar evento.' });
  }
});

module.exports = router;
