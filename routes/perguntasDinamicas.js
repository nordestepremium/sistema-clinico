const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

router.get('/', async (req, res) => {
  const { contexto } = req.query;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `SELECT * FROM perguntas_dinamicas
       WHERE usuario_id=$1 AND ($2::text IS NULL OR contexto=$2) AND ativo=true
       ORDER BY categoria, ordem`,
      [req.usuarioId, contexto || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar perguntas.' });
  }
});

router.post('/', async (req, res) => {
  const p = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO perguntas_dinamicas
        (clinica_id, usuario_id, contexto, categoria, pergunta, tipo, opcoes, obrigatoria, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.clinicaId, req.usuarioId, p.contexto, p.categoria, p.pergunta,
       p.tipo || 'textarea', p.opcoes || null, !!p.obrigatoria, p.ordem || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar pergunta.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await queryComoClinica(
      req.clinicaId,
      'UPDATE perguntas_dinamicas SET ativo=false WHERE id=$1',
      [req.params.id]
    );
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir pergunta.' });
  }
});

module.exports = router;
