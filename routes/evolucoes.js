const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');
const { uploadArquivo, baixarArquivo, excluirArquivo } = require('../storage');

const EXTENSOES_PERMITIDAS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

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
       WHERE e.paciente_id=$1 AND p.usuario_id=$2 AND e.clinica_id=$3
       ORDER BY e.data_atendimento DESC`,
      [req.params.pacienteId, req.usuarioId, req.clinicaId]
    );
    const evolucoes = result.rows;
    if (evolucoes.length) {
      const ids = evolucoes.map(e => e.id);
      const docs = await queryComoClinica(
        req.clinicaId,
        `SELECT id, evolucao_id, nome_original, mime_type, tamanho, created_at
           FROM evolucao_documentos WHERE evolucao_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
        [ids]
      );
      const porEvolucao = {};
      docs.rows.forEach(d => {
        (porEvolucao[d.evolucao_id] = porEvolucao[d.evolucao_id] || []).push(d);
      });
      evolucoes.forEach(e => { e.documentos = porEvolucao[e.id] || []; });
    }
    res.json(evolucoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar evoluções.' });
  }
});

router.post('/', async (req, res) => {
  const e = req.body;
  try {
    const dono = await queryComoClinica(req.clinicaId, 'SELECT id FROM pacientes WHERE id=$1 AND usuario_id=$2 AND clinica_id=$3', [e.paciente_id, req.usuarioId, req.clinicaId]);
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
      `UPDATE evolucoes SET data_atendimento=$1, objetivo_consulta=$2, relato=$3 WHERE id=$4 AND usuario_id=$5 AND clinica_id=$6 RETURNING *`,
      [e.data_atendimento, e.objetivo_consulta, e.relato, req.params.id, req.usuarioId, req.clinicaId]
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
    await queryComoClinica(req.clinicaId, 'DELETE FROM evolucoes WHERE id=$1 AND usuario_id=$2 AND clinica_id=$3', [req.params.id, req.usuarioId, req.clinicaId]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir evolução.' });
  }
});

module.exports = router;

// ── Documentos anexados (Supabase Storage) ──────────────────

// Enviar um ou mais documentos para uma evolução
router.post('/:evolucaoId/documentos', async (req, res) => {
  const files = Array.isArray(req.body.files) ? req.body.files : [];
  if (!files.length) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
  try {
    const evolucao = await queryComoClinica(
      req.clinicaId,
      'SELECT id, paciente_id FROM evolucoes WHERE id=$1 AND usuario_id=$2 AND clinica_id=$3',
      [req.params.evolucaoId, req.usuarioId, req.clinicaId]
    );
    if (!evolucao.rows[0]) return res.status(404).json({ erro: 'Evolução não encontrada.' });
    const pacienteId = evolucao.rows[0].paciente_id;

    const inseridos = [];
    for (const [index, file] of files.entries()) {
      const mimeType = file.mimeType || 'application/octet-stream';
      const ext = EXTENSOES_PERMITIDAS[mimeType];
      if (!ext) return res.status(400).json({ erro: 'Formato inválido. Envie somente PDF, JPG ou PNG.' });

      const buffer = Buffer.from(String(file.base64 || '').replace(/^data:.*;base64,/, ''), 'base64');
      if (buffer.length > 8 * 1024 * 1024) return res.status(400).json({ erro: 'Cada arquivo deve ter no máximo 8MB.' });

      const nomeOriginal = String(file.name || `documento.${ext}`).slice(0, 200);
      const caminho = `clinicas/${req.clinicaId}/evolucoes/${req.params.evolucaoId}/${Date.now()}_${index}.${ext}`;
      await uploadArquivo(caminho, buffer, mimeType);

      const result = await queryComoClinica(
        req.clinicaId,
        `INSERT INTO evolucao_documentos
          (clinica_id, usuario_id, paciente_id, evolucao_id, nome_original, nome_arquivo, mime_type, tamanho, caminho_arquivo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, evolucao_id, nome_original, mime_type, tamanho, created_at`,
        [req.clinicaId, req.usuarioId, pacienteId, req.params.evolucaoId, nomeOriginal, caminho, mimeType, buffer.length, caminho]
      );
      inseridos.push(result.rows[0]);
    }
    res.status(201).json({ documentos: inseridos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao enviar documentos.' });
  }
});

// Baixar o conteúdo de um documento (em base64)
router.get('/documentos/:docId/conteudo', async (req, res) => {
  try {
    const doc = await queryComoClinica(
      req.clinicaId,
      'SELECT * FROM evolucao_documentos WHERE id=$1 AND usuario_id=$2 AND clinica_id=$3',
      [req.params.docId, req.usuarioId, req.clinicaId]
    );
    if (!doc.rows[0]) return res.status(404).json({ erro: 'Documento não encontrado.' });
    const buffer = await baixarArquivo(doc.rows[0].caminho_arquivo);
    res.json({
      nome_original: doc.rows[0].nome_original,
      mime_type: doc.rows[0].mime_type,
      base64: buffer.toString('base64')
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao baixar documento.' });
  }
});

router.delete('/documentos/:docId', async (req, res) => {
  try {
    const doc = await queryComoClinica(
      req.clinicaId,
      'SELECT * FROM evolucao_documentos WHERE id=$1 AND usuario_id=$2 AND clinica_id=$3',
      [req.params.docId, req.usuarioId, req.clinicaId]
    );
    if (!doc.rows[0]) return res.status(404).json({ erro: 'Documento não encontrado.' });
    await excluirArquivo(doc.rows[0].caminho_arquivo);
    await queryComoClinica(req.clinicaId, 'DELETE FROM evolucao_documentos WHERE id=$1 AND clinica_id=$2', [req.params.docId, req.clinicaId]);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao excluir documento.' });
  }
});

module.exports = router;
