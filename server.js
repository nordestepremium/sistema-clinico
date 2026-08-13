require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool } = require('./db');

const authRoutes = require('./routes/auth');
const pacientesRoutes = require('./routes/pacientes');
const configRoutes = require('./routes/config');
const perguntasRoutes = require('./routes/perguntasDinamicas');
const anamnesesRoutes = require('./routes/anamneses');
const evolucoesRoutes = require('./routes/evolucoes');
const pagamentosRoutes = require('./routes/pagamentos');
const despesasRoutes = require('./routes/despesas');
const recebimentosRoutes = require('./routes/recebimentos');
const usuariosRoutes = require('./routes/usuarios');
const backupRoutes = require('./routes/backup');
const agendaRoutes = require('./routes/agenda');
const billingRoutes = require('./routes/billing');

// Rede de segurança: um erro inesperado em algum lugar não deve derrubar o
// servidor inteiro. Só registra no log e segue rodando.
process.on('unhandledRejection', (err) => console.error('Erro não tratado (promise):', err));
process.on('uncaughtException', (err) => console.error('Erro não tratado (exception):', err));

const app = express();

app.set('trust proxy', 1); // necessário no Render (e em qualquer host atrás de proxy/load balancer)

app.use(helmet());
app.use(cors({
  origin: true, // aceita a origem que fizer a requisição (o app desktop e o teste local)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors()); // responde manualmente qualquer checagem de "preflight"

// Nunca deixa o navegador guardar respostas em cache. Sem isso, ao trocar de
// usuário/clínica no mesmo navegador, dados antigos (como logo e configurações)
// podiam "vazar" de uma sessão pra outra por causa do cache do próprio navegador.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// O webhook do Stripe precisa vir ANTES do express.json() — ele exige o corpo
// "cru" da requisição pra conferir a assinatura de segurança do evento.
app.use('/billing', billingRoutes);

app.use(express.json({ limit: '5mb' }));

// Limita tentativas de login para dificultar ataques de força bruta
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/auth/login', loginLimiter);

app.use('/auth', authRoutes);
app.use('/pacientes', pacientesRoutes);
app.use('/config', configRoutes);
app.use('/perguntas-dinamicas', perguntasRoutes);
app.use('/anamneses', anamnesesRoutes);
app.use('/evolucoes', evolucoesRoutes);
app.use('/pagamentos', pagamentosRoutes);
app.use('/despesas', despesasRoutes);
app.use('/recebimentos', recebimentosRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/sistema/backup', backupRoutes);
app.use('/agenda', agendaRoutes);

app.get('/', (req, res) => res.json({ status: 'ok' }));

// Usada por um robô externo (a cada poucos minutos) para o servidor nunca ficar
// tempo demais sem uso e "dormir". Faz uma consulta bem leve ao banco de propósito,
// pra também manter o projeto do Supabase ativo (ele pausa sozinho após dias sem uso).
app.get('/keep-alive', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', em: new Date().toISOString() });
  } catch (err) {
    console.error('Erro no keep-alive:', err);
    res.status(500).json({ status: 'erro' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
