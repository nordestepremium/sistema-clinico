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

// Cria ou atualiza o registro de um agendamento (usado pela sincronização automática com a agenda)
router.post('/', async (req, res) => {
  const r = req.body;
  if (!r.agendamentoId) return res.status(400).json({ erro: 'agendamentoId é obrigatório.' });
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO recebimentos_status
        (clinica_id, usuario_id, paciente_id, competencia, descricao, pago, pagamento_id,
         agendamento_id, paciente_nome, paciente_cpf, data_agendamento, hora_agendamento,
         valor_previsto, referencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (clinica_id, agendamento_id) DO UPDATE SET
         competencia = EXCLUDED.competencia,
         pago = EXCLUDED.pago,
         pagamento_id = EXCLUDED.pagamento_id,
         paciente_nome = EXCLUDED.paciente_nome,
         paciente_cpf = EXCLUDED.paciente_cpf,
         data_agendamento = EXCLUDED.data_agendamento,
         hora_agendamento = EXCLUDED.hora_agendamento,
         valor_previsto = EXCLUDED.valor_previsto,
         referencia = EXCLUDED.referencia,
         updated_at = now()
       RETURNING *`,
      [req.clinicaId, req.usuarioId, r.pacienteId || null, r.competencia, r.descricao || '',
       !!r.pago, r.pagamentoId || null, r.agendamentoId, r.pacienteNome || '', r.pacienteCpf || '',
       r.dataAgendamento || '', r.horaAgendamento || '', r.valorPrevisto || 0, r.referencia || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar recebimento.' });
  }
});

// Atualização parcial: descrição, status de pago, e o pagamento vinculado (ou desvincular com null)
router.put('/:id', async (req, res) => {
  const body = req.body;
  const temDescricao = Object.prototype.hasOwnProperty.call(body, 'descricao');
  const temPago = Object.prototype.hasOwnProperty.call(body, 'pago');
  const temPagamentoId = Object.prototype.hasOwnProperty.call(body, 'pagamentoId');
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `UPDATE recebimentos_status SET
        descricao = CASE WHEN $1 THEN $2 ELSE descricao END,
        pago = CASE WHEN $3 THEN $4 ELSE pago END,
        pagamento_id = CASE WHEN $5 THEN $6 ELSE pagamento_id END,
        updated_at = now()
       WHERE id=$7 AND usuario_id=$8 RETURNING *`,
      [temDescricao, body.descricao ?? null, temPago, !!body.pago, temPagamentoId, body.pagamentoId ?? null, req.params.id, req.usuarioId]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar recebimento.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await queryComoClinica(req.clinicaId, 'DELETE FROM recebimentos_status WHERE id=$1 AND usuario_id=$2', [req.params.id, req.usuarioId]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir recebimento.' });
  }
});

module.exports = router;
