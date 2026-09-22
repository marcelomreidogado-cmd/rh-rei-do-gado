// Servico de dados: estado em memoria + regras de negocio que gravam no store.
import * as C from './calc.js';

export const COL = {
  emp: 'rh_employees', entries: 'rh_entries', months: 'rh_months', leaves: 'rh_leaves', payslips: 'rh_payslips',
  payslipImgs: 'rh_payslip_imgs', sundays: 'rh_sundays', config: 'rh_config', log: 'rh_log', admins: 'rh_admins',
};

export const DEFAULT_CONFIG = {
  vt: C.VT_DIARIO, dddPadrao: '24', required: C.DEFAULT_REQUIRED,
  waTemplate: 'Olá, {nome}! Segue o seu contracheque de {mes}. Qualquer dúvida é só falar com a gente. 🙂',
  emailAssunto: 'Folha de pagamento Rei do Gado - {mes}',
};

export const S = {
  store: null, user: null, employees: [], entries: new Map(), months: new Map(), leaves: [], config: { ...DEFAULT_CONFIG },
  payslips: new Map(), sundays: new Map(),
};

export function init(store) { S.store = store; }

const nowIso = () => new Date().toISOString();

export async function log(action, detail = '') {
  try { await S.store.set(COL.log, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, { ts: nowIso(), user: S.user?.id || '?', action, detail }); } catch (e) { /* log nao pode travar a operacao */ }
}

export async function loadAll() {
  const [emp, ent, mon, lea, cfg] = await Promise.all([
    S.store.list(COL.emp), S.store.list(COL.entries), S.store.list(COL.months), S.store.list(COL.leaves), S.store.get(COL.config, 'settings'),
  ]);
  S.employees = emp.sort((a, b) => a.nome.localeCompare(b.nome));
  S.entries = new Map(ent.map((e) => [e.id, e]));
  S.months = new Map(mon.map((m) => [m.id, m]));
  S.leaves = lea;
  S.config = { ...DEFAULT_CONFIG, ...(cfg || {}), required: { ...DEFAULT_CONFIG.required, ...((cfg && cfg.required) || {}) } };
}

// ---------- consultas ----------
export const emp = (id) => S.employees.find((e) => e.id === id);
export const monthDoc = (mk) => S.months.get(mk) || null;
export const monthClosed = (mk) => monthDoc(mk)?.status === 'closed';
export const closedSet = () => new Set([...S.months.values()].filter((m) => m.status === 'closed').map((m) => m.id));
export const entriesOf = (mk) => [...S.entries.values()].filter((e) => e.month === mk);
export const entryFor = (mk, empId) => S.entries.get(C.entryId(mk, empId)) || null;
export const monthsKnown = () => [...S.months.keys()].sort();
export const leavesOfEmp = (empId) => S.leaves.filter((l) => l.empId === empId);

/** Linhas do mes agrupadas por loja, na ordem Bingen, Correas, Coronel. */
export function rowsByStore(mk, { includeExcluded = false } = {}) {
  const out = [];
  for (const st of C.STORES) {
    const rows = entriesOf(mk)
      .filter((e) => (includeExcluded || !e.excluded) && emp(e.empId)?.loja === st.id)
      .map((e) => ({ entry: e, emp: emp(e.empId) }))
      .sort((a, b) => a.emp.nome.localeCompare(b.emp.nome));
    out.push({ store: st, rows });
  }
  return out;
}

// ---------- meses ----------
function previousEntry(empId, mk) {
  let best = null;
  for (const e of S.entries.values()) if (e.empId === empId && e.month < mk && !e.excluded && (!best || e.month > best.month)) best = e;
  if (!best) for (const e of S.entries.values()) if (e.empId === empId && e.month < mk && (!best || e.month > best.month)) best = e;
  return best;
}

/** Cria (se preciso) os lancamentos do mes para quem esta ativo, herdando so os campos recorrentes. */
export async function ensureMonthEntries(mk) {
  const ops = [];
  for (const e of S.employees) {
    if (!C.activeInMonth(e, mk) || entryFor(mk, e.id)) continue;
    const ent = C.carryOver(previousEntry(e.id, mk), mk, e.id, e.salarioBase || 0);
    if (!ent.salario) ent.salario = e.salarioBase || 0;
    ent.vt = S.config.vt;
    ops.push({ op: 'set', col: COL.entries, id: C.entryId(mk, e.id), data: ent });
    S.entries.set(C.entryId(mk, e.id), { id: C.entryId(mk, e.id), ...ent });
  }
  if (ops.length) await S.store.batch(ops);
  return ops.length;
}

export async function createMonth(mk) {
  if (monthDoc(mk)) return monthDoc(mk);
  const prev = monthDoc(C.addMonths(mk, -1));
  const doc = { status: 'open', hiddenCols: prev?.hiddenCols || ['horaExtra', 'feriado'], consumoPeriodo: '', note: '', createdAt: nowIso(), createdBy: S.user?.id || '' };
  await S.store.set(COL.months, mk, doc);
  S.months.set(mk, { id: mk, ...doc });
  const n = await ensureMonthEntries(mk);
  await log('mes_criado', `${mk} (${n} lançamentos)`);
  return S.months.get(mk);
}

export async function updateMonth(mk, patch) {
  await S.store.set(COL.months, mk, patch, true);
  S.months.set(mk, { ...S.months.get(mk), ...patch });
}

export async function setMonthStatus(mk, status) {
  const patch = status === 'closed' ? { status, sentAt: nowIso(), sentBy: S.user?.id || '' } : { status, reopenedAt: nowIso(), reopenedBy: S.user?.id || '' };
  await updateMonth(mk, patch);
  await log(status === 'closed' ? 'mes_enviado_fechado' : 'mes_reaberto', mk);
}

// ---------- lancamentos ----------
const MONEY = ['salario', 'consumo', 'horaExtra', 'feriado', 'assiduidade', 'adiantamento', 'premio', 'descAdic'];
export const hasAbsence = (empId, mk, entry) => C.leavesOf(S.leaves, empId, mk).length > 0 || !!(entry && (entry.faltaTxt || entry.atestadoTxt));

/**
 * Grava um campo do lancamento. Campos recorrentes (salario, premio, adiantamento, assiduidade) tambem sao
 * repassados aos meses seguintes ja criados e ainda abertos. Devolve os meses atualizados.
 */
export async function setEntryField(mk, empId, field, raw) {
  if (monthClosed(mk)) throw new Error('Este mês já foi enviado. Reabra o mês para editar.');
  const id = C.entryId(mk, empId);
  const e = S.entries.get(id);
  if (!e) throw new Error('Lançamento não encontrado.');
  let value = raw;
  if (MONEY.includes(field)) value = C.round2(C.num(raw));
  else if (field === 'dias') value = Math.max(0, Math.min(31, Math.floor(C.num(raw))));
  else value = String(raw ?? '').trim();
  const patch = { [field]: value };
  let propagate = C.RECURRING.includes(field);
  if (field === 'assiduidade') {
    if (hasAbsence(empId, mk, e)) { patch.assiduidadeManual = true; propagate = false; } // ajuste so deste mes
    else patch.assiduidadeManual = false;
  }
  if (field === 'dias' && !e.vt) patch.vt = S.config.vt;
  const ops = [{ op: 'set', col: COL.entries, id, data: patch, merge: true }];
  const targets = propagate ? C.propagationTargets([...S.entries.values()], empId, mk, closedSet()) : [];
  for (const t of targets) ops.push({ op: 'set', col: COL.entries, id: t, data: { [field]: value }, merge: true });
  await S.store.batch(ops);
  S.entries.set(id, { ...e, ...patch });
  for (const t of targets) S.entries.set(t, { ...S.entries.get(t), [field]: value });
  if (e[field] !== value) await log('lancamento', `${mk} ${emp(empId)?.nome}: ${field} ${e[field] ?? ''} → ${value}${targets.length ? ` (repassado a ${targets.length} mês(es))` : ''}`);
  return targets.map((t) => S.entries.get(t).month).sort();
}

export async function setRowExcluded(mk, empId, excluded) {
  if (monthClosed(mk)) throw new Error('Mês fechado.');
  const id = C.entryId(mk, empId);
  await S.store.set(COL.entries, id, { excluded }, true);
  S.entries.set(id, { ...S.entries.get(id), excluded });
  await log(excluded ? 'linha_excluida' : 'linha_restaurada', `${mk} ${emp(empId)?.nome}`);
}

export async function addEntryFor(mk, empId) {
  const id = C.entryId(mk, empId);
  const e = entryFor(mk, empId);
  if (e) return setRowExcluded(mk, empId, false);
  const ent = C.carryOver(previousEntry(empId, mk), mk, empId, emp(empId)?.salarioBase || 0);
  ent.vt = S.config.vt;
  await S.store.set(COL.entries, id, ent);
  S.entries.set(id, { id, ...ent });
}

export async function setHiddenCols(mk, cols) { await updateMonth(mk, { hiddenCols: cols }); await log('colunas_ocultas', `${mk}: ${cols.join(', ') || '(nenhuma)'}`); }

export async function repeatDias(mk) {
  const prev = C.addMonths(mk, -1);
  const ops = [];
  for (const e of entriesOf(mk)) {
    const p = entryFor(prev, e.empId);
    if (p && p.dias && !e.dias) { ops.push({ op: 'set', col: COL.entries, id: e.id, data: { dias: p.dias }, merge: true }); S.entries.set(e.id, { ...e, dias: p.dias }); }
  }
  if (ops.length) { await S.store.batch(ops); await log('dias_repetidos', `${mk}: ${ops.length} funcionário(s)`); }
  return ops.length;
}

// ---------- afastamentos ----------
export async function saveLeave(leave) {
  const id = leave.id || `l-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const doc = { ...leave }; delete doc.id;
  await S.store.set(COL.leaves, id, doc);
  const i = S.leaves.findIndex((l) => l.id === id);
  const full = { id, ...doc };
  if (i >= 0) S.leaves[i] = full; else S.leaves.push(full);
  await log('afastamento', `${emp(leave.empId)?.nome}: ${leave.type} ${leave.dates ? leave.dates.join(',') : `${leave.start || '?'} → ${leave.end || 'em aberto'}`}`);
  return full;
}
export async function deleteLeave(id) {
  const l = S.leaves.find((x) => x.id === id);
  await S.store.del(COL.leaves, id);
  S.leaves = S.leaves.filter((x) => x.id !== id);
  if (l) await log('afastamento_removido', `${emp(l.empId)?.nome}: ${l.type}`);
}

// ---------- funcionarios ----------
export async function saveEmployee(e) {
  const id = e.id || slugify(e.nome);
  const doc = { ...e }; delete doc.id;
  doc.cpf = C.cpfDigits(doc.cpf);
  await S.store.set(COL.emp, id, doc);
  const full = { id, ...doc };
  const i = S.employees.findIndex((x) => x.id === id);
  if (i >= 0) S.employees[i] = full; else S.employees.push(full);
  S.employees.sort((a, b) => a.nome.localeCompare(b.nome));
  await log('funcionario', `${doc.nome} (${i >= 0 ? 'alterado' : 'novo'})`);
  return full;
}
// ---------- ferias (ficam dentro do cadastro do funcionario: rh_employees) ----------
export async function setFeriasVenc(empId, venc, origem = 'manual') {
  const e = emp(empId); if (!e) throw new Error('Funcionário não encontrado.');
  await saveEmployee({ ...e, feriasVenc: venc, feriasVencOrigem: origem, feriasVencEm: nowIso() });
  await log('ferias_vencimento', `${e.nome}: período em aberto vence ${C.fmtDMY(venc)} (${origem})`);
}
export async function addFerias(empId, reg) {
  const e = emp(empId); if (!e) throw new Error('Funcionário não encontrado.');
  const r = { id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, criadoEm: nowIso(), criadoPor: S.user?.id || '', ...reg };
  await saveEmployee({ ...e, ferias: [...(e.ferias || []), r] });
  await log('ferias', `${e.nome}: ${r.inicio ? C.fmtDMY(r.inicio) + ' a ' + C.fmtDMY(C.fimFerias(r)) : 'período quitado'} (${r.dias} dias${r.abono ? ' + abono 10' : ''}) — período venc. ${C.fmtDMY(r.venc)}`);
  return r;
}
export async function removeFerias(empId, regId) {
  const e = emp(empId); if (!e) return;
  const r = (e.ferias || []).find((x) => x.id === regId);
  await saveEmployee({ ...e, ferias: (e.ferias || []).filter((x) => x.id !== regId) });
  if (r) await log('ferias_removida', `${e.nome}: ${r.inicio ? C.fmtDMY(r.inicio) : 'quitação'} (${r.dias} dias)`);
}

export function slugify(nome) {
  const t = C.normName(nome).split(' ').filter((x) => x && !['DA', 'DE', 'DO', 'DAS', 'DOS', 'E'].includes(x));
  let base = t.slice(0, 2).join('-').toLowerCase() || 'func';
  let id = base, n = 2;
  while (S.employees.some((e) => e.id === id)) id = `${base}-${n++}`;
  return id;
}

// ---------- contracheques ----------
export async function loadPayslips(mk) {
  const list = await S.store.listWhere(COL.payslips, 'month', mk);
  S.payslips.set(mk, new Map(list.map((p) => [p.empId, p])));
  return S.payslips.get(mk);
}
export const payslipOf = (mk, empId) => S.payslips.get(mk)?.get(empId) || null;
export async function savePayslip(mk, empId, data, img) {
  const id = C.entryId(mk, empId);
  const doc = { ...data, month: mk, empId };
  await S.store.set(COL.payslips, id, doc, true);
  if (img) await S.store.set(COL.payslipImgs, id, { img, month: mk, empId });
  if (!S.payslips.has(mk)) S.payslips.set(mk, new Map());
  S.payslips.get(mk).set(empId, { id, ...(S.payslips.get(mk).get(empId) || {}), ...doc });
  await log('contracheque', `${mk} ${emp(empId)?.nome}: líquido ${data.liquido ?? ''} INSS ${data.inss ?? ''} FGTS ${data.fgts ?? ''}`);
}
export async function patchPayslip(mk, empId, patch) {
  const id = C.entryId(mk, empId);
  await S.store.set(COL.payslips, id, patch, true);
  S.payslips.get(mk).set(empId, { ...S.payslips.get(mk).get(empId), ...patch });
}
export async function payslipImage(mk, empId) { const d = await S.store.get(COL.payslipImgs, C.entryId(mk, empId)); return d?.img || null; }

// ---------- escala de domingo ----------
export async function loadSundays(mk) {
  const d = await S.store.get(COL.sundays, mk);
  S.sundays.set(mk, d || { id: mk, assignments: {} });
  return S.sundays.get(mk);
}
export async function saveSundays(mk, assignments) {
  await S.store.set(COL.sundays, mk, { assignments, updatedAt: nowIso(), updatedBy: S.user?.id || '' });
  S.sundays.set(mk, { id: mk, assignments });
  await log('escala_domingo', mk);
}
/** Quantos domingos cada pessoa ja trabalhou (meses anteriores do mesmo ano) para equilibrar a escala. */
export async function sundayHistory(mk) {
  const counts = {};
  const { y } = C.parseMonth(mk);
  for (let m = 1; m < C.parseMonth(mk).m; m++) {
    const k = C.monthKey(y, m);
    const d = S.sundays.get(k) || (await S.store.get(COL.sundays, k));
    if (!d) continue;
    for (const day of Object.values(d.assignments || {})) for (const ids of Object.values(day)) for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

// ---------- configuracoes / backup ----------
export async function saveConfig(patch) {
  S.config = { ...S.config, ...patch };
  await S.store.set(COL.config, 'settings', S.config);
  await log('configuracao', Object.keys(patch).join(', '));
}

export async function importSeed(seed, { overwrite = false } = {}) {
  if (!seed || !seed.employees || !seed.months) throw new Error('Arquivo inválido: não parece o JSON de dados iniciais.');
  const ops = [];
  let nEmp = 0, nEnt = 0, nLea = 0;
  for (const e of seed.employees) {
    if (!overwrite && S.employees.some((x) => x.id === e.id)) continue;
    const { id, ...doc } = e; doc.cpf = C.cpfDigits(doc.cpf);
    ops.push({ op: 'set', col: COL.emp, id, data: doc }); nEmp++;
  }
  for (const [mk, m] of Object.entries(seed.months)) {
    if (!S.months.has(mk) || overwrite) ops.push({ op: 'set', col: COL.months, id: mk, data: { status: m.status, consumoPeriodo: m.consumoPeriodo || '', note: m.note || '', hiddenCols: ['horaExtra', 'feriado'], importedAt: nowIso() } });
    for (const e of m.entries) {
      const id = C.entryId(mk, e.empId);
      if (!overwrite && S.entries.has(id)) continue;
      ops.push({ op: 'set', col: COL.entries, id, data: { ...C.emptyEntry(mk, e.empId), ...e, month: mk } }); nEnt++;
    }
  }
  for (const l of seed.leaves || []) {
    if (!overwrite && S.leaves.some((x) => x.id === l.id)) continue;
    const { id, ...doc } = l; ops.push({ op: 'set', col: COL.leaves, id, data: doc }); nLea++;
  }
  await S.store.batch(ops);
  await log('importacao_inicial', `${nEmp} funcionários, ${nEnt} lançamentos, ${nLea} afastamentos`);
  await loadAll();
  return { nEmp, nEnt, nLea };
}

export async function exportBackup() {
  const out = { geradoEm: nowIso(), employees: S.employees, entries: [...S.entries.values()], months: [...S.months.values()], leaves: S.leaves, config: S.config };
  out.payslips = await S.store.list(COL.payslips);
  out.sundays = await S.store.list(COL.sundays);
  return out;
}

export async function loadLog(limit = 300) {
  const l = await S.store.list(COL.log);
  return l.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, limit);
}
