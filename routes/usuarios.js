const express = require('express');
const bcrypt = require('bcrypt');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

function exigirAdmin(req, res, next) {
  if (req.role !== 'admin') return res.status(403).json({ erro: 'Apenas administradores.' });
  next();
}

// Lista enxuta de profissionais da clínica — qualquer usuário logado pode ver
// (usado pela agenda para saber quem são os profissionais disponíveis)
router.get('/profissionais', async (req, res) => {
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      "SELECT id, nome, role FROM usuarios WHERE role != 'recepcao' AND clinica_id=$1 ORDER BY nome",
      [req.clinicaId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar profissionais.' });
  }
});

router.get('/', exigirAdmin, async (req, res) => {
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      'SELECT id, nome, usuario, role, created_at FROM usuarios WHERE clinica_id=$1 ORDER BY nome',
      [req.clinicaId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar usuários.' });
  }
});

router.post('/', exigirAdmin, async (req, res) => {
  const { nome, email, senha, role } = req.body;
  try {
    const hash = await bcrypt.hash(senha, 12);
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO usuarios (clinica_id, nome, usuario, senha_hash, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, usuario, role`,
      [req.clinicaId, nome, String(email).toLowerCase(), hash, role || 'user']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ erro: 'E-mail já cadastrado nesta clínica.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar usuário.' });
  }
});

router.put('/:id/senha', exigirAdmin, async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.novaSenha, 12);
    const result = await queryComoClinica(
      req.clinicaId,
      'UPDATE usuarios SET senha_hash=$1 WHERE id=$2 AND clinica_id=$3 RETURNING id',
      [hash, req.params.id, req.clinicaId]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao redefinir senha.' });
  }
});

router.put('/:id/role', exigirAdmin, async (req, res) => {
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      'UPDATE usuarios SET role=$1 WHERE id=$2 AND clinica_id=$3 RETURNING id, nome, usuario, role',
      [req.body.role, req.params.id, req.clinicaId]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar papel do usuário.' });
  }
});

router.delete('/:id', exigirAdmin, async (req, res) => {
  try {
    await queryComoClinica(req.clinicaId, 'DELETE FROM usuarios WHERE id=$1 AND clinica_id=$2', [req.params.id, req.clinicaId]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir usuário.' });
  }
});

// Trocar a própria senha (qualquer usuário logado)
router.put('/minha-senha', async (req, res) => {
  const { senhaAtual, novaSenha } = req.body;
  try {
    const atual = await queryComoClinica(req.clinicaId, 'SELECT senha_hash FROM usuarios WHERE id=$1 AND clinica_id=$2', [req.usuarioId, req.clinicaId]);
    const ok = atual.rows[0] && await bcrypt.compare(senhaAtual, atual.rows[0].senha_hash);
    if (!ok) return res.status(401).json({ erro: 'Senha atual incorreta.' });
    const hash = await bcrypt.hash(novaSenha, 12);
    await queryComoClinica(req.clinicaId, 'UPDATE usuarios SET senha_hash=$1 WHERE id=$2 AND clinica_id=$3', [hash, req.usuarioId, req.clinicaId]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao trocar senha.' });
  }
});

module.exports = router;
