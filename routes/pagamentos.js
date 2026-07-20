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
      `SELECT * FROM pagamentos
       WHERE usuario_id=$1
         AND ($2::text IS NULL OR data_pagamento >= $2)
         AND ($3::text IS NULL OR data_pagamento <= $3)
       ORDER BY data_pagamento DESC`,
      [req.usuarioId, dataInicio || null, dataFim || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pagamentos.' });
  }
});

router.post('/', async (req, res) => {
  const p = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO pagamentos
        (clinica_id, usuario_id, paciente_id, paciente_nome, data_pagamento, competencia,
         valor, descricao, tipo, origem, referencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.clinicaId, req.usuarioId, p.paciente_id || null, p.paciente_nome, p.data_pagamento,
       p.competencia, p.valor, p.descricao, p.tipo || 'sessao', p.origem || 'manual', p.referencia]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar pagamento.' });
  }
});

router.put('/:id', async (req, res) => {
  const p = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `UPDATE pagamentos SET
        paciente_nome = COALESCE($1, paciente_nome),
        data_pagamento = COALESCE($2, data_pagamento),
        competencia = COALESCE($3, competencia),
        valor = COALESCE($4, valor),
        descricao = COALESCE($5, descricao),
        tipo = COALESCE($6, tipo),
        auto_recebimento = COALESCE($7, auto_recebimento),
        referencia = COALESCE($8, referencia),
        recibo_gerado = COALESCE($9, recibo_gerado)
       WHERE id=$10 AND usuario_id=$11 RETURNING *`,
      [p.paciente_nome ?? null, p.data_pagamento ?? null, p.competencia ?? null, p.valor ?? null,
       p.descricao ?? null, p.tipo ?? null, p.auto_recebimento ?? null, p.referencia ?? null,
       p.recibo_gerado ?? null, req.params.id, req.usuarioId]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar pagamento.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await queryComoClinica(req.clinicaId, 'DELETE FROM pagamentos WHERE id=$1 AND usuario_id=$2', [req.params.id, req.usuarioId]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir pagamento.' });
  }
});

module.exports = router;
