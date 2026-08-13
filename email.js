const nodemailer = require('nodemailer');

// Usa o e-mail profissional do seu Hostinger para mandar os avisos automáticos.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: true, // porta 465 usa conexão já criptografada
  auth: {
    user: process.env.SMTP_USER, // ex: contato@seusite.com.br
    pass: process.env.SMTP_PASS  // senha da caixa de e-mail (a mesma do webmail)
  }
});

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

  await transporter.sendMail({
    from: `"Nordeste Premium" <${process.env.SMTP_USER}>`,
    to: para,
    subject: 'Seu acesso ao Sistema Clínico está pronto! 🎉',
    html
  });
}

async function enviarEmailRenovacao({ para, nomeAdmin, novaDataExpiracao }) {
  const dataFormatada = new Date(novaDataExpiracao).toLocaleDateString('pt-BR');
  await transporter.sendMail({
    from: `"Nordeste Premium" <${process.env.SMTP_USER}>`,
    to: para,
    subject: 'Sua assinatura foi renovada ✅',
    html: `<p>Olá, ${nomeAdmin}!</p><p>Recebemos seu pagamento e sua assinatura foi renovada até <strong>${dataFormatada}</strong>.</p>`
  });
}

async function enviarEmailFalhaPagamento({ para, nomeAdmin }) {
  await transporter.sendMail({
    from: `"Nordeste Premium" <${process.env.SMTP_USER}>`,
    to: para,
    subject: '⚠️ Não conseguimos processar seu pagamento',
    html: `<p>Olá, ${nomeAdmin}!</p><p>Tentamos cobrar sua assinatura mensal, mas o pagamento não foi aprovado. Verifique os dados do seu cartão para continuar com o acesso ativo.</p>`
  });
}

module.exports = { enviarEmailBoasVindas, enviarEmailRenovacao, enviarEmailFalhaPagamento };
