const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

router.get('/', async (req, res) => {
  const { dataInicio, dataFim } = req.query;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `SELECT * FROM despesas
       WHERE usuario_id=$1 AND clinica_id=$2
         AND ($3::text IS NULL OR data_despesa >= $3)
         AND ($4::text IS NULL OR data_despesa <= $4)
       ORDER BY data_despesa DESC`,
      [req.usuarioId, req.clinicaId, dataInicio || null, dataFim || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar despesas.' });
  }
});

router.post('/', async (req, res) => {
  const d = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO despesas (clinica_id, usuario_id, data_despesa, categoria, descricao, valor)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.clinicaId, req.usuarioId, d.data_despesa, d.categoria, d.descricao, d.valor]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar despesa.' });
  }
});

router.put('/:id', async (req, res) => {
  const d = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `UPDATE despesas SET data_despesa=$1, categoria=$2, descricao=$3, valor=$4 WHERE id=$5 AND usuario_id=$6 AND clinica_id=$7 RETURNING *`,
      [d.data_despesa, d.categoria, d.descricao, d.valor, req.params.id, req.usuarioId, req.clinicaId]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Despesa não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar despesa.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await queryComoClinica(req.clinicaId, 'DELETE FROM despesas WHERE id=$1 AND usuario_id=$2 AND clinica_id=$3', [req.params.id, req.usuarioId, req.clinicaId]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir despesa.' });
  }
});

module.exports = router;
