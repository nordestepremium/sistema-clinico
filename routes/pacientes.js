const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin); // toda rota abaixo exige login

// Listar pacientes: cada profissional só vê os que ele mesmo cadastrou.
// Recepção vê todos os pacientes da clínica (para agendar e cadastrar novos).
router.get('/', async (req, res) => {
  try {
    const isRecepcao = req.role === 'recepcao';
    const result = await queryComoClinica(
      req.clinicaId,
      isRecepcao
        ? 'SELECT * FROM pacientes ORDER BY nome_completo'
        : 'SELECT * FROM pacientes WHERE usuario_id=$1 ORDER BY nome_completo',
      isRecepcao ? [] : [req.usuarioId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pacientes.' });
  }
});

// Criar paciente.
// Recepção deve informar a quem (usuario_id) o paciente pertence, já que ela cadastra
// em nome de um profissional. Os demais perfis sempre cadastram para si mesmos.
router.post('/', async (req, res) => {
  const p = req.body;
  try {
    let donoId = req.usuarioId;
    if (req.role === 'recepcao') {
      if (!p.usuario_id) return res.status(400).json({ erro: 'Selecione o profissional responsável pelo paciente.' });
      const dono = await queryComoClinica(req.clinicaId, "SELECT id FROM usuarios WHERE id=$1 AND role != 'recepcao'", [p.usuario_id]);
      if (!dono.rows[0]) return res.status(400).json({ erro: 'Profissional responsável inválido.' });
      donoId = p.usuario_id;
    }
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO pacientes
        (clinica_id, usuario_id, nome_completo, cpf, sexo, data_nascimento, idade, telefone,
         contato_emergencia, nome_contato_emergencia, valor_sessao, dynamic_answers_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [req.clinicaId, donoId, p.nome_completo, p.cpf, p.sexo, p.data_nascimento,
       p.idade || null, p.telefone, p.contato_emergencia, p.nome_contato_emergencia,
       p.valor_sessao || null, p.dynamic_answers_json || '{}']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ erro: 'CPF já cadastrado nesta clínica.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar paciente.' });
  }
});

// Atualizar paciente — recepção não pode editar dados clínicos; profissional só edita os próprios.
router.put('/:id', async (req, res) => {
  if (req.role === 'recepcao') return res.status(403).json({ erro: 'O perfil Recepção não pode editar dados de pacientes.' });
  const p = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `UPDATE pacientes SET
        nome_completo=$1, sexo=$2, data_nascimento=$3, idade=$4, telefone=$5,
        contato_emergencia=$6, nome_contato_emergencia=$7, valor_sessao=$8,
        dynamic_answers_json=$9, updated_at=now()
       WHERE id=$10 AND usuario_id=$11 RETURNING *`,
      [p.nome_completo, p.sexo, p.data_nascimento, p.idade || null, p.telefone,
       p.contato_emergencia, p.nome_contato_emergencia, p.valor_sessao || null,
       p.dynamic_answers_json || '{}', req.params.id, req.usuarioId]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Paciente não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar paciente.' });
  }
});

// Excluir paciente — mesma regra: recepção não pode, profissional só exclui os próprios.
router.delete('/:id', async (req, res) => {
  if (req.role === 'recepcao') return res.status(403).json({ erro: 'O perfil Recepção não pode excluir pacientes.' });
  try {
    await queryComoClinica(req.clinicaId, 'DELETE FROM pacientes WHERE id=$1 AND usuario_id=$2', [req.params.id, req.usuarioId]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir paciente.' });
  }
});

module.exports = router;
