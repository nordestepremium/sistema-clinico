require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const pacientesRoutes = require('./routes/pacientes');

const app = express();

app.use(helmet());
app.use(cors({
  origin: true, // aceita a origem que fizer a requisição (o app desktop e o teste local)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors()); // responde manualmente qualquer checagem de "preflight"
app.use(express.json({ limit: '5mb' }));

// Limita tentativas de login para dificultar ataques de força bruta
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/auth/login', loginLimiter);

app.use('/auth', authRoutes);
app.use('/pacientes', pacientesRoutes);

app.get('/', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
