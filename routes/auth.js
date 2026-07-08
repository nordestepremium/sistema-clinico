const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET; // string aleatória longa, definida no servidor

// Cadastro de uma NOVA clínica (primeiro admin dela)
router.post('/registrar-clinica', async (req, res) => {
  const { nomeClinica, nomeAdmin, email, senha } = req.body;
  if (!nomeClinica || !nomeAdmin || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha todos os campos.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const clinica = await client.query(
      'INSERT INTO clinicas (nome) VALUES ($1) RETURNING id',
      [nomeClinica]
    );
    const clinicaId = clinica.rows[0].id;
    const hash = await bcrypt.hash(senha, 12);
    await client.query(
      `INSERT INTO usuarios (clinica_id, nome, usuario, senha_hash, role)
       VALUES ($1,$2,$3,$4,'admin')`,
      [clinicaId, nomeAdmin, email.toLowerCase(), hash]
    );
    await client.query('COMMIT');
    res.json({ sucesso: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ erro: 'E-mail já cadastrado.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar clínica.' });
  } finally {
    client.release();
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, clinica_id, nome, usuario, senha_hash, role FROM usuarios WHERE usuario = $1',
      [String(email || '').toLowerCase()]
    );
    const usuario = result.rows[0];
    if (!usuario) return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });

    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk) return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });

    const token = jwt.sign(
      { usuarioId: usuario.id, clinicaId: usuario.clinica_id, role: usuario.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, nome: usuario.nome, role: usuario.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao entrar.' });
  }
});

module.exports = router;
