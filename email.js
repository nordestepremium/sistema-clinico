/**
 * email.js — envia e-mails via API HTTP do Resend (resend.com), não via SMTP.
 * Isso é necessário porque o plano gratuito do Render bloqueia as portas de
 * SMTP (25, 465, 587) desde setembro de 2025 — a API do Resend usa HTTPS
 * comum (porta 443), que não tem essa restrição.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const REMETENTE = process.env.EMAIL_REMETENTE || 'onboarding@resend.dev';

async function enviarEmail({ para, assunto, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Nordeste Premium <${REMETENTE}>`,
      to: [para],
      subject: assunto,
      html
    })
  });
  if (!resp.ok) {
    const erro = await resp.text();
    throw new Error(`Falha ao enviar e-mail (${resp.status}): ${erro}`);
  }
}

async function enviarEmailBoasVindas({ para, nomeClinica, nomeAdmin, email, senhaProvisoria, urlSistema }) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b;">
      <h2 style="color:#2c3f4c;">Bem-vindo(a), ${nomeAdmin}! 🎉</h2>
      <p>Sua assinatura do <strong>Sistema Clínico</strong> para a clínica <strong>${nomeClinica}</strong> foi ativada com sucesso.</p>
      <p>Use os dados abaixo para acessar pela primeira vez:</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:16px 0;">
        <p style="margin:4px 0;"><strong>E-mail:</strong> ${email}</p>
        <p style="margin:4px 0;"><strong>Senha provisória:</strong> ${senhaProvisoria}</p>
      </div>
      <p style="color:#b91c1c;font-size:13px;">⚠️ Por segurança, troque essa senha assim que entrar pela primeira vez (Configurações → Alterar Senha).</p>
      <p style="margin-top:24px;"><a href="${urlSistema}" style="background:#2c7a5f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Acessar o sistema</a></p>
      <p style="margin-top:24px;font-size:12px;color:#64748b;">Qualquer dúvida, é só responder este e-mail.</p>
    </div>`;
  await enviarEmail({ para, assunto: 'Seu acesso ao Sistema Clínico está pronto! 🎉', html });
}

async function enviarEmailRenovacao({ para, nomeAdmin, novaDataExpiracao }) {
  const dataFormatada = new Date(novaDataExpiracao).toLocaleDateString('pt-BR');
  await enviarEmail({
    para,
    assunto: 'Sua assinatura foi renovada ✅',
    html: `<p>Olá, ${nomeAdmin}!</p><p>Recebemos seu pagamento e sua assinatura foi renovada até <strong>${dataFormatada}</strong>.</p>`
  });
}

async function enviarEmailFalhaPagamento({ para, nomeAdmin }) {
  await enviarEmail({
    para,
    assunto: '⚠️ Não conseguimos processar seu pagamento',
    html: `<p>Olá, ${nomeAdmin}!</p><p>Tentamos cobrar sua assinatura mensal, mas o pagamento não foi aprovado. Verifique os dados do seu cartão para continuar com o acesso ativo.</p>`
  });
}

module.exports = { enviarEmailBoasVindas, enviarEmailRenovacao, enviarEmailFalhaPagamento };
