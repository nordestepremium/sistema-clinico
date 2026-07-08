const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

// Buscar uma configuração específica (ex: chave=agenda, chave=logo)
router.get('/:chave', async (req, res) => {
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      'SELECT valor FROM configuracoes WHERE chave=$1',
      [req.params.chave]
    );
    res.json({ valor: result.rows[0]?.valor ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configuração.' });
  }
});

// Listar todas as configurações da clínica
router.get('/', async (req, res) => {
  try {
    const result = await queryComoClinica(req.clinicaId, 'SELECT chave, valor FROM configuracoes');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configurações.' });
  }
});

// Salvar/atualizar uma configuração (ex: a agenda inteira, em JSON, vai como texto em "valor")
router.put('/:chave', async (req, res) => {
  const { valor } = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO configuracoes (clinica_id, chave, valor) VALUES ($1,$2,$3)
       ON CONFLICT (clinica_id, chave) DO UPDATE SET valor = EXCLUDED.valor
       RETURNING *`,
      [req.clinicaId, req.params.chave, valor]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configuração.' });
  }
});

module.exports = router;
