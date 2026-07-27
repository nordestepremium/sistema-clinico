const express = require('express');
const { queryComoClinica } = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

// ── Funções auxiliares puras (sem dependência de banco) ──────────────────

function safeJsonParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function normalizeAgendaConfig(cfg) {
  const base = { clinic: '', prof: '', logo: '', waMsg: '', bdayMsg: '' };
  return cfg && typeof cfg === 'object' ? { ...base, ...cfg } : base;
}

function clinicConfigKey(chave) { return `clinic::${chave}`; }
function scopedConfigKey(userId, chave) { return `${userId}::${chave}`; }

function normalizeAgendaPatient(raw = {}) {
  const id = raw.id != null ? String(raw.id) : String(Date.now());
  const telefone = String(raw.wa || raw.telefone || '').replace(/\D/g, '');
  return {
    id,
    name: String(raw.name || raw.nome_completo || raw.patName || '').trim(),
    wa: telefone,
    birth: String(raw.birth || raw.data_nascimento || '').trim(),
    cpf: String(raw.cpf || '').replace(/\D/g, ''),
    obs: String(raw.obs || raw.observacoes || '').trim()
  };
}

function mergeAgendaPatients(...groups) {
  const merged = new Map();
  groups.flat().forEach(item => {
    if (!item) return;
    const normalized = normalizeAgendaPatient(item);
    if (!normalized.name) return;
    const key = normalized.cpf || `id:${normalized.id}`;
    const previous = merged.get(key) || {};
    merged.set(key, { ...previous, ...normalized, id: previous.id || normalized.id });
  });
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function parseCompetenciaFromDate(dateText) {
  const cleaned = String(dateText || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned.slice(0, 7) : '';
}

function buildRecebimentoReferenciaAgendamento(agendamentoId) {
  return `recebimento:agendamento:${String(agendamentoId || '').trim()}`;
}

function normalizeLookupText(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function encontrarPacienteFinanceiro(pacientes, { cpf = '', nome = '' } = {}) {
  const cpfDigits = String(cpf || '').replace(/\D/g, '');
  if (cpfDigits) {
    const byCpf = pacientes.find(p => String(p.cpf || '').replace(/\D/g, '') === cpfDigits);
    if (byCpf) return byCpf;
  }
  const normalizedName = normalizeLookupText(nome);
  if (!normalizedName) return null;
  return pacientes.find(p => normalizeLookupText(p.nome_completo) === normalizedName) || null;
}

function buildRecebimentoDescricaoPadrao({ dataAgendamento = '', horaAgendamento = '' } = {}) {
  if (!dataAgendamento) return 'Sessão agendada';
  const partes = String(dataAgendamento).split('-');
  const dataBr = partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataAgendamento;
  const hora = String(horaAgendamento || '').trim();
  return `Sessão agendada para ${dataBr}${hora ? ` às ${hora}` : ''}`;
}

// ── Acesso ao banco (direto, sem HTTP interno — roda tudo no mesmo processo) ──

async function buscarConfig(clinicaId, chave) {
  const r = await queryComoClinica(clinicaId, 'SELECT valor FROM configuracoes WHERE chave=$1 AND clinica_id=$2', [chave, clinicaId]);
  return r.rows[0]?.valor ?? null;
}

async function salvarConfig(clinicaId, chave, valor) {
  await queryComoClinica(
    clinicaId,
    `INSERT INTO configuracoes (clinica_id, chave, valor) VALUES ($1,$2,$3)
     ON CONFLICT (clinica_id, chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [clinicaId, chave, valor]
  );
}

async function buscarPacientes(clinicaId, usuarioId, role) {
  const isRecepcao = role === 'recepcao';
  const r = await queryComoClinica(
    clinicaId,
    isRecepcao
      ? 'SELECT * FROM pacientes WHERE clinica_id=$1'
      : 'SELECT * FROM pacientes WHERE usuario_id=$1 AND clinica_id=$2',
    isRecepcao ? [clinicaId] : [usuarioId, clinicaId]
  );
  return r.rows;
}

async function buscarProfissionais(clinicaId) {
  const r = await queryComoClinica(clinicaId, "SELECT id, nome, role FROM usuarios WHERE role != 'recepcao' AND clinica_id=$1 ORDER BY nome", [clinicaId]);
  return r.rows;
}

async function sincronizarRecebimentos(clinicaId, usuarioId, agenda) {
  const apts = Array.isArray(agenda.apts) ? agenda.apts : [];
  const pacs = Array.isArray(agenda.pacs) ? agenda.pacs : [];
  const pacMap = new Map(pacs.map(item => [String(item?.id || ''), item || {}]));
  const activeIds = new Set();

  const [pagamentosRes, recebimentosRes, pacientesRes] = await Promise.all([
    queryComoClinica(clinicaId, 'SELECT * FROM pagamentos WHERE usuario_id=$1 AND clinica_id=$2', [usuarioId, clinicaId]),
    queryComoClinica(clinicaId, 'SELECT * FROM recebimentos_status WHERE usuario_id=$1 AND clinica_id=$2', [usuarioId, clinicaId]),
    queryComoClinica(clinicaId, 'SELECT * FROM pacientes WHERE usuario_id=$1 AND clinica_id=$2', [usuarioId, clinicaId])
  ]);
  const todosPagamentos = pagamentosRes.rows;
  const existentes = recebimentosRes.rows;
  const todosPacientes = pacientesRes.rows;

  const pagamentosPorReferencia = new Map();
  todosPagamentos.forEach(p => { if (p.referencia) pagamentosPorReferencia.set(p.referencia, p); });
  const pagamentosPorId = new Map(todosPagamentos.map(p => [String(p.id), p]));
  const existentesPorAgendamento = new Map(existentes.map(r => [String(r.agendamento_id), r]));

  const meusApts = apts.filter(apt => apt && String(apt.professionalId) === String(usuarioId));

  for (const apt of meusApts) {
    if (!apt.id || !apt.date || !apt.time || apt.status === 'cancelled') continue;
    const competencia = parseCompetenciaFromDate(apt.date);
    if (!competencia) continue;

    const agendamentoId = String(apt.id);
    activeIds.add(agendamentoId);

    const agendaPatient = pacMap.get(String(apt.patId || '')) || {};
    const pacienteNome = String(agendaPatient.name || apt.patName || '').trim();
    if (!pacienteNome) continue;

    const pacienteCpf = String(agendaPatient.cpf || '').replace(/\D/g, '');
    const pacienteDb = encontrarPacienteFinanceiro(todosPacientes, { cpf: pacienteCpf, nome: pacienteNome });
    const valorPrevisto = Number(pacienteDb?.valor_sessao || 0);
    const referencia = buildRecebimentoReferenciaAgendamento(agendamentoId);
    const existing = existentesPorAgendamento.get(agendamentoId);

    let pagamento = existing?.pagamento_id ? pagamentosPorId.get(String(existing.pagamento_id)) : null;
    if (!pagamento) pagamento = pagamentosPorReferencia.get(referencia) || null;

    await queryComoClinica(
      clinicaId,
      `INSERT INTO recebimentos_status
        (clinica_id, usuario_id, paciente_id, competencia, descricao, pago, pagamento_id,
         agendamento_id, paciente_nome, paciente_cpf, data_agendamento, hora_agendamento,
         valor_previsto, referencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (clinica_id, agendamento_id) DO UPDATE SET
         competencia = EXCLUDED.competencia, pago = EXCLUDED.pago, pagamento_id = EXCLUDED.pagamento_id,
         paciente_nome = EXCLUDED.paciente_nome, paciente_cpf = EXCLUDED.paciente_cpf,
         data_agendamento = EXCLUDED.data_agendamento, hora_agendamento = EXCLUDED.hora_agendamento,
         valor_previsto = EXCLUDED.valor_previsto, referencia = EXCLUDED.referencia, updated_at = now()`,
      [clinicaId, usuarioId, pacienteDb?.id || null, competencia,
       existing?.descricao || pagamento?.descricao || buildRecebimentoDescricaoPadrao({ dataAgendamento: apt.date, horaAgendamento: apt.time }),
       !!pagamento, pagamento?.id || null, agendamentoId, pacienteNome, pacienteCpf,
       apt.date, apt.time, valorPrevisto, referencia]
    );
  }

  const paraExcluir = existentes.filter(r => r.agendamento_id && !activeIds.has(String(r.agendamento_id)));
  for (const r of paraExcluir) {
    await queryComoClinica(clinicaId, 'DELETE FROM recebimentos_status WHERE id=$1 AND clinica_id=$2', [r.id, clinicaId]);
  }
}

// ── Rotas ──────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const pacsChave = req.role === 'recepcao' ? clinicConfigKey('agenda_pacs') : scopedConfigKey(req.usuarioId, 'agenda_pacs');

    const [pacsValor, aptsValor, cfgValor, pacientesCloud, profissionais] = await Promise.all([
      buscarConfig(req.clinicaId, pacsChave),
      buscarConfig(req.clinicaId, clinicConfigKey('agenda_apts')),
      buscarConfig(req.clinicaId, scopedConfigKey(req.usuarioId, 'agenda_cfg')),
      buscarPacientes(req.clinicaId, req.usuarioId, req.role),
      buscarProfissionais(req.clinicaId)
    ]);

    let pacs = safeJsonParse(pacsValor, null);
    if (pacs == null && req.role !== 'recepcao') {
      const legacy = safeJsonParse(await buscarConfig(req.clinicaId, clinicConfigKey('agenda_pacs')), []);
      const meusIds = new Set(pacientesCloud.map(p => String(p.id)));
      pacs = (Array.isArray(legacy) ? legacy : []).filter(item => meusIds.has(String(item?.id)));
    }
    if (!Array.isArray(pacs)) pacs = [];

    let apts = safeJsonParse(aptsValor, []);
    if (!Array.isArray(apts)) apts = [];
    const cfg = normalizeAgendaConfig(safeJsonParse(cfgValor, null));

    const idsValidos = new Set(profissionais.map(p => String(p.id)));
    let precisaSalvar = false;
    apts = apts.map(apt => {
      if (!apt) return apt;
      if (!idsValidos.has(String(apt.professionalId))) {
        precisaSalvar = true;
        return { ...apt, professionalId: req.usuarioId };
      }
      return apt;
    });
    if (precisaSalvar) await salvarConfig(req.clinicaId, clinicConfigKey('agenda_apts'), JSON.stringify(apts));

    const pacsMerged = mergeAgendaPatients(
      pacs,
      pacientesCloud.map(p => ({ id: p.id, name: p.nome_completo, wa: p.telefone, birth: p.data_nascimento, cpf: p.cpf }))
    );

    res.json({ pacs: pacsMerged, apts, cfg, professionals: profissionais });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao buscar agenda.' });
  }
});

router.put('/', async (req, res) => {
  try {
    const pacsChave = req.role === 'recepcao' ? clinicConfigKey('agenda_pacs') : scopedConfigKey(req.usuarioId, 'agenda_pacs');
    const pacs = Array.isArray(req.body.pacs) ? req.body.pacs : [];
    const apts = Array.isArray(req.body.apts) ? req.body.apts : [];

    await Promise.all([
      salvarConfig(req.clinicaId, pacsChave, JSON.stringify(pacs)),
      salvarConfig(req.clinicaId, clinicConfigKey('agenda_apts'), JSON.stringify(apts)),
      salvarConfig(req.clinicaId, scopedConfigKey(req.usuarioId, 'agenda_cfg'), JSON.stringify(normalizeAgendaConfig(req.body.cfg)))
    ]);

    await sincronizarRecebimentos(req.clinicaId, req.usuarioId, { pacs, apts });

    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao salvar agenda.' });
  }
});

router.post('/sincronizar-recebimentos', async (req, res) => {
  try {
    const pacsChave = req.role === 'recepcao' ? clinicConfigKey('agenda_pacs') : scopedConfigKey(req.usuarioId, 'agenda_pacs');
    const [pacsValor, aptsValor] = await Promise.all([
      buscarConfig(req.clinicaId, pacsChave),
      buscarConfig(req.clinicaId, clinicConfigKey('agenda_apts'))
    ]);
    const pacs = safeJsonParse(pacsValor, []);
    const apts = safeJsonParse(aptsValor, []);
    await sincronizarRecebimentos(req.clinicaId, req.usuarioId, {
      pacs: Array.isArray(pacs) ? pacs : [],
      apts: Array.isArray(apts) ? apts : []
    });
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao sincronizar recebimentos.' });
  }
});

module.exports = router;
