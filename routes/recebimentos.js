const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

router.get('/', async (req, res) => {
  const { competencia } = req.query;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `SELECT * FROM recebimentos_status
       WHERE usuario_id=$1 AND ($2::text IS NULL OR competencia=$2)
       ORDER BY data_agendamento`,
      [req.usuarioId, competencia || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar recebimentos.' });
  }
});

router.put('/:id', async (req, res) => {
  const { descricao, pago } = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `UPDATE recebimentos_status SET
        descricao = COALESCE($1, descricao),
        pago = COALESCE($2, pago),
        updated_at = now()
       WHERE id=$3 RETURNING *`,
      [descricao ?? null, pago ?? null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar recebimento.' });
  }
});

module.exports = router;
