const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

router.get('/:pacienteId', async (req, res) => {
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      'SELECT * FROM evolucoes WHERE paciente_id=$1 ORDER BY data_atendimento DESC',
      [req.params.pacienteId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar evoluções.' });
  }
});

router.post('/', async (req, res) => {
  const e = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO evolucoes (clinica_id, usuario_id, paciente_id, data_atendimento, objetivo_consulta, relato)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.clinicaId, req.usuarioId, e.paciente_id, e.data_atendimento, e.objetivo_consulta, e.relato]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar evolução.' });
  }
});

router.put('/:id', async (req, res) => {
  const e = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `UPDATE evolucoes SET data_atendimento=$1, objetivo_consulta=$2, relato=$3 WHERE id=$4 RETURNING *`,
      [e.data_atendimento, e.objetivo_consulta, e.relato, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Evolução não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar evolução.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await queryComoClinica(req.clinicaId, 'DELETE FROM evolucoes WHERE id=$1', [req.params.id]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir evolução.' });
  }
});

module.exports = router;
