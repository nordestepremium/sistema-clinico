const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);
router.use((req, res, next) => {
  if (req.role === 'recepcao') return res.status(403).json({ erro: 'O perfil Recepção não pode acessar evoluções clínicas.' });
  next();
});

router.get('/:pacienteId', async (req, res) => {
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `SELECT e.* FROM evolucoes e
       JOIN pacientes p ON p.id = e.paciente_id
       WHERE e.paciente_id=$1 AND p.usuario_id=$2
       ORDER BY e.data_atendimento DESC`,
      [req.params.pacienteId, req.usuarioId]
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
    const dono = await queryComoClinica(req.clinicaId, 'SELECT id FROM pacientes WHERE id=$1 AND usuario_id=$2', [e.paciente_id, req.usuarioId]);
    if (!dono.rows[0]) return res.status(403).json({ erro: 'Paciente não encontrado ou não pertence a você.' });

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
      `UPDATE evolucoes SET data_atendimento=$1, objetivo_consulta=$2, relato=$3 WHERE id=$4 AND usuario_id=$5 RETURNING *`,
      [e.data_atendimento, e.objetivo_consulta, e.relato, req.params.id, req.usuarioId]
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
    await queryComoClinica(req.clinicaId, 'DELETE FROM evolucoes WHERE id=$1 AND usuario_id=$2', [req.params.id, req.usuarioId]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir evolução.' });
  }
});

module.exports = router;
