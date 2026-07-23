const express = require('express');
const { pool } = require('../db');
const { uploadArquivo, listarArquivos, excluirArquivo } = require('../storage');

const router = express.Router();

const TABELAS = [
  'clinicas', 'usuarios', 'configuracoes', 'pacientes', 'anamneses',
  'perguntas_dinamicas', 'evolucoes', 'evolucao_documentos', 'pagamentos',
  'despesas', 'recebimentos_status'
];

const DIAS_PARA_MANTER = 14; // apaga backups com mais de 14 dias automaticamente

function checarSegredo(req, res, next) {
  const segredo = req.headers['x-backup-secret'];
  if (!process.env.BACKUP_SECRET || segredo !== process.env.BACKUP_SECRET) {
    return res.status(401).json({ erro: 'Não autorizado.' });
  }
  next();
}

// Executa o backup: exporta todas as tabelas para um único arquivo JSON no Storage.
// Protegida por uma chave secreta própria (BACKUP_SECRET), não pelo login normal —
// isso permite disparar automaticamente por um agendador externo (cron), sem senha de usuário.
router.post('/', checarSegredo, async (req, res) => {
  try {
    const dump = { geradoEm: new Date().toISOString(), tabelas: {} };
    for (const tabela of TABELAS) {
      const result = await pool.query(`SELECT * FROM ${tabela}`);
      dump.tabelas[tabela] = result.rows;
    }

    const conteudo = Buffer.from(JSON.stringify(dump), 'utf-8');
    const nomeArquivo = `backups/backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await uploadArquivo(nomeArquivo, conteudo, 'application/json');

    // Limpa backups antigos (mantém só os últimos DIAS_PARA_MANTER dias)
    const existentes = await listarArquivos('backups');
    const limite = Date.now() - DIAS_PARA_MANTER * 24 * 60 * 60 * 1000;
    const antigos = (existentes || []).filter(item => {
      const criadoEm = new Date(item.created_at || item.updated_at || 0).getTime();
      return criadoEm && criadoEm < limite;
    });
    for (const item of antigos) {
      await excluirArquivo(`backups/${item.name}`);
    }

    res.json({
      sucesso: true,
      arquivo: nomeArquivo,
      totalRegistros: Object.values(dump.tabelas).reduce((s, rows) => s + rows.length, 0),
      backupsAntigosRemovidos: antigos.length
    });
  } catch (err) {
    console.error('Erro ao gerar backup:', err);
    res.status(500).json({ erro: err.message || 'Erro ao gerar backup.' });
  }
});

// Lista os backups existentes (útil para conferir se está rodando certinho)
router.get('/', checarSegredo, async (req, res) => {
  try {
    const arquivos = await listarArquivos('backups');
    res.json((arquivos || []).map(a => ({ nome: a.name, criadoEm: a.created_at, tamanho: a.metadata?.size })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar backups.' });
  }
});

module.exports = router;
