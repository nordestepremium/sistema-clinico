const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);
router.use((req, res, next) => {
  if (req.role === 'recepcao') return res.status(403).json({ erro: 'O perfil Recepção não pode acessar prontuários clínicos.' });
  next();
});

// Todas as colunas de texto da anamnese, iguais às do schema_postgres.sql
const COLUNAS = [
  'queixa_principal','inicio_queixa','como_comecou','mudancas_observadas','principais_sintomas',
  'queixas_cognitivas','detalhes_cognitivas','queixas_afetivo_emocionais','detalhes_afetivo_emocionais',
  'psicomotricidade','habitos_rotina','estado_saude_fisica','historico_escolar_profissional',
  'historico_familiar','alguem_doente_familia','qual_doenca_familia','alguem_internado_familia',
  'especificar_internacao','doenca_hereditaria','qual_doenca_hereditaria',
  'historico_transtorno_mental_familia','qual_transtorno_familia','quem_transtorno_familia',
  'automutilacao','motivo_automutilacao','pensamento_suicida','motivo_pensamento_suicida',
  'detalhes_tentativa_suicidio','vicios_familia','possui_doenca','qual_doenca','cirurgia',
  'especificar_cirurgia','hospitalizado','quando_hospitalizado','motivo_hospitalizacao',
  'tontura_convulsao','motivo_tontura','deficiencia','qual_deficiencia','dores_cabeca',
  'motivo_dores_cabeca','ouve_vozes','experiencia_vozes','dorme_bem','dificuldade_sono',
  'sono_qualidade','motivo_sono_ruim','usa_medicamento','quais_medicamentos','fuma',
  'detalhes_fumo','bebe_alcool','qual_bebida','detalhes_alcool','situacoes_bebe',
  'alteracoes_comportamento_alcool','outras_drogas','quais_drogas','detalhes_drogas',
  'bebe_cafe','detalhes_cafe','tratamento_anterior','detalhes_tratamento','violencia_fisica',
  'detalhes_violencia','abuso_sexual','detalhes_abuso','ultima_consulta_medica','desmaio',
  'motivo_desmaio','como_se_ve','relacionamento_social','como_e_visto','perdeu_controle',
  'situacao_perdeu_controle','situacoes_irritacao','atividades_lazer','religiao',
  'hipotese_diagnostica','resumo_sessao','data_sessao','objetivo_sessao','resultados_obtidos',
  'informacoes_complementares','local_assinatura','data_assinatura','nome_psicologo','crp',
  'dynamic_answers_json'
];

router.get('/:pacienteId', async (req, res) => {
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `SELECT a.* FROM anamneses a
       JOIN pacientes p ON p.id = a.paciente_id
       WHERE a.paciente_id=$1 AND p.usuario_id=$2
       ORDER BY a.created_at DESC LIMIT 1`,
      [req.params.pacienteId, req.usuarioId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar anamnese.' });
  }
});

router.post('/', async (req, res) => {
  const body = req.body;
  try {
    const dono = await queryComoClinica(req.clinicaId, 'SELECT id FROM pacientes WHERE id=$1 AND usuario_id=$2', [body.paciente_id, req.usuarioId]);
    if (!dono.rows[0]) return res.status(403).json({ erro: 'Paciente não encontrado ou não pertence a você.' });

    const campos = COLUNAS.filter(c => body[c] !== undefined);
    const colunas = ['clinica_id', 'usuario_id', 'paciente_id', ...campos];
    const valores = [req.clinicaId, req.usuarioId, body.paciente_id, ...campos.map(c => body[c])];
    const placeholders = colunas.map((_, i) => `$${i + 1}`).join(',');
    const result = await queryComoClinica(
      req.clinicaId,
      `INSERT INTO anamneses (${colunas.join(',')}) VALUES (${placeholders}) RETURNING *`,
      valores
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar anamnese.' });
  }
});

router.put('/:id', async (req, res) => {
  const body = req.body;
  const campos = COLUNAS.filter(c => body[c] !== undefined);
  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar.' });
  const sets = campos.map((c, i) => `${c}=$${i + 1}`).join(',');
  const valores = campos.map(c => body[c]);
  try {
    const result = await queryComoClinica(
      req.clinicaId,
      `UPDATE anamneses SET ${sets}, updated_at=now() WHERE id=$${campos.length + 1} AND usuario_id=$${campos.length + 2} RETURNING *`,
      [...valores, req.params.id, req.usuarioId]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Anamnese não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar anamnese.' });
  }
});

module.exports = router;
