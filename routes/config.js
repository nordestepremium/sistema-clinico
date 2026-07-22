const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');
const { uploadArquivo, baixarArquivo, excluirArquivo } = require('../storage');

const router = express.Router();
router.use(exigirLogin);

// Logo da clínica — compartilhado entre todos os profissionais.
// Precisa vir ANTES das rotas genéricas /:chave para não ser interpretado como uma config comum.
router.get('/logo', async (req, res) => {
  try {
    const config = await queryComoClinica(req.clinicaId, "SELECT valor FROM configuracoes WHERE chave='logo_path'");
    const caminho = config.rows[0]?.valor;
    if (!caminho) return res.json({ base64: null });
    const buffer = await baixarArquivo(caminho);
    res.json({ base64: 'data:image/png;base64,' + buffer.toString('base64') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar logo.' });
  }
});

router.put('/logo', async (req, res) => {
  if (req.role === 'recepcao') return res.status(403).json({ erro: 'O perfil Recepção não pode alterar configurações administrativas.' });
  try {
    const config = await queryComoClinica(req.clinicaId, "SELECT valor FROM configuracoes WHERE chave='logo_path'");
    const caminhoAtual = config.rows[0]?.valor;

    if (!req.body.base64Data) {
      if (caminhoAtual) await excluirArquivo(caminhoAtual);
      await queryComoClinica(req.clinicaId, "DELETE FROM configuracoes WHERE chave='logo_path'");
      return res.json({ sucesso: true });
    }

    const buffer = Buffer.from(String(req.body.base64Data).replace(/^data:image\/\w+;base64,/, ''), 'base64');
    if (buffer.length > 3 * 1024 * 1024) return res.status(400).json({ erro: 'A logo deve ter no máximo 3MB.' });

    const caminho = `clinicas/${req.clinicaId}/logo.png`;
    await uploadArquivo(caminho, buffer, 'image/png');
    await queryComoClinica(
      req.clinicaId,
      `INSERT INTO configuracoes (clinica_id, chave, valor) VALUES ($1,'logo_path',$2)
       ON CONFLICT (clinica_id, chave) DO UPDATE SET valor = EXCLUDED.valor`,
      [req.clinicaId, caminho]
    );
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao salvar logo.' });
  }
});

// Buscar uma configuração específica (ex: chave=agenda_cfg)
router.get('/:chave', async (req, res) => {
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      'SELECT valor FROM configuracoes WHERE chave=$1',
      [req.params.chave]
    );
    res.json({ valor: result.rows[0]?.valor ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configuração.' });
  }
});

// Listar todas as configurações da clínica
router.get('/', async (req, res) => {
  try {
    const result = await queryComoClinica(req.clinicaId, 'SELECT chave, valor FROM configuracoes');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar configurações.' });
  }
});

// Salvar/atualizar uma configuração (ex: a agenda inteira, em JSON, vai como texto em "valor")
router.put('/:chave', async (req, res) => {
  const { valor } = req.body;
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO configuracoes (clinica_id, chave, valor) VALUES ($1,$2,$3)
       ON CONFLICT (clinica_id, chave) DO UPDATE SET valor = EXCLUDED.valor
       RETURNING *`,
      [req.clinicaId, req.params.chave, valor]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configuração.' });
  }
});

module.exports = router;
