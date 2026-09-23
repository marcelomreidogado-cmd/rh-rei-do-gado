// Regras de negocio puras (sem DOM / sem Firebase) - testadas em tests/calc.test.js
export const VT_DIARIO = 11.8;

export const STORES = [
  { id: 'bingen', nome: 'Bingen', cod: '00001', cnpj: '39.305.061/0001-00', empresa: 'AIM CASA DE CARNES BINGEN LTDA' },
  { id: 'correas', nome: 'Correas', cod: '00002', cnpj: '36.148.327/0001-52', empresa: 'AIM CASA DE CARNES CORREAS LTDA' },
  { id: 'coronel', nome: 'Coronel', cod: '00003', cnpj: '33.148.048/0001-09', empresa: 'AIM CASA DE CARNES LTDA' },
];
export const storeById = (id) => STORES.find((s) => s.id === id);

export const CATEGORIAS = { atendimento: 'Atendimento', manipulacao: 'Manipulação', nenhum: 'Não trabalha domingo' };

// Onde a pessoa trabalha de verdade (pode ser diferente da loja do registro/imposto, usada na folha).
export const ADM = 'adm';
export const WORK_PLACES = [...STORES.map((s) => ({ id: s.id, nome: s.nome })), { id: ADM, nome: 'Administrativo (seg. a sex.)' }];
const FUNCAO_ADM = /financ|administ|escrit|contab|\bRH\b|recursos humanos/i;
/** Loja onde trabalha: o que foi cadastrado; se vazio, administrativo pela função ou a loja do registro. */
export const workStore = (e) => (e ? e.lojaTrabalho || (FUNCAO_ADM.test(e.funcao || '') ? ADM : e.loja) : null);
export const workPlaceName = (id) => WORK_PLACES.find((w) => w.id === id)?.nome || '';
/** Entra na escala de domingo? (ativo, trabalha em loja e tem funcao de atendimento/manipulacao) */
export const inEscala = (e) => !!e && e.ativo !== false && workStore(e) !== ADM && ['atendimento', 'manipulacao'].includes(e.categoria);

// Campos que se repetem para os meses seguintes quando alterados
export const RECURRING = ['salario', 'premio', 'adiantamento', 'assiduidade'];

// ---------- numeros ----------
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Aceita 1234.5, "1.234,56", "1234,56", "R$ 47,97", "" -> number */
export function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).replace(/R\$/g, '').replace(/\s/g, '');
  if (!s || s === '-') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.945 / 1.234.567 = milhar (padrao BR)
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
export const brl = (n, dash = true) => {
  const v = round2(num(n));
  if (!v && dash) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const passagem = (dias, vt = VT_DIARIO) => round2(Math.max(0, Math.floor(num(dias))) * num(vt));

// ---------- datas / meses ----------
export const pad = (n) => String(n).padStart(2, '0');
export const monthKey = (y, m) => `${y}-${pad(m)}`;
export const parseMonth = (k) => { const [y, m] = k.split('-').map(Number); return { y, m }; };
export function addMonths(k, n) {
  const { y, m } = parseMonth(k);
  const t = y * 12 + (m - 1) + n;
  return monthKey(Math.floor(t / 12), (t % 12) + 1);
}
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const monthLabel = (k) => { const { y, m } = parseMonth(k); return `${MESES[m - 1]}/${y}`; };
export const daysInMonth = (k) => { const { y, m } = parseMonth(k); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const monthStart = (k) => `${k}-01`;
export const monthEnd = (k) => `${k}-${pad(daysInMonth(k))}`;
export const isoAddDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isoDiffDays = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
export const fmtDM = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
export const fmtDMY = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export function parseDateBR(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
}
export function sundaysOf(k) {
  const out = [];
  for (let d = 1; d <= daysInMonth(k); d++) {
    const iso = `${k}-${pad(d)}`;
    if (new Date(iso + 'T00:00:00Z').getUTCDay() === 0) out.push(iso);
  }
  return out;
}

// ---------- afastamentos (falta / atestado / licenca / inss) ----------
// leave: { type:'falta', dates:[iso...] } | { type:'atestado'|'licenca'|'inss', start:iso|null, end:iso|null }
export const LEAVE_LABEL = { falta: 'Falta', atestado: 'Atestado', licenca: 'Licença', inss: 'INSS' };

/** Fim de um atestado a partir do inicio + quantidade de dias corridos (inclui o dia inicial). */
export const endFromDays = (start, dias) => isoAddDays(start, Math.max(1, Math.floor(num(dias))) - 1);
export const daysFromRange = (start, end) => isoDiffDays(start, end) + 1;

/** Dias (iso) do afastamento que caem dentro do mes. Inicio/fim nulos = em aberto. */
export function leaveDaysInMonth(leave, mk) {
  const ms = monthStart(mk), me = monthEnd(mk);
  if (leave.type === 'falta') return (leave.dates || []).filter((d) => d >= ms && d <= me).sort();
  const s = leave.start && leave.start > ms ? leave.start : ms;
  const e = leave.end && leave.end < me ? leave.end : me;
  if (s > e) return [];
  const out = [];
  for (let d = s; d <= e; d = isoAddDays(d, 1)) out.push(d);
  return out;
}
export const leavesOf = (leaves, empId, mk, types) =>
  leaves.filter((l) => l.empId === empId && (!types || types.includes(l.type)) && leaveDaysInMonth(l, mk).length > 0);

export function formatLeave(leave, mk) {
  const days = leaveDaysInMonth(leave, mk);
  if (!days.length) return '';
  if (leave.type === 'falta') return days.map(fmtDM).join(', ');
  const open = !leave.end;
  const tag = leave.type === 'atestado' ? '' : `${LEAVE_LABEL[leave.type]} `;
  const from = leave.start ? fmtDM(days[0]) : null;
  if (leave.start && leave.start >= monthStart(mk) && leave.end && leave.end <= monthEnd(mk)) {
    const n = daysFromRange(leave.start, leave.end);
    return n === 1 ? `${tag}${fmtDM(leave.start)}` : `${tag}${fmtDM(leave.start)} a ${fmtDM(leave.end)} (${n}d)`;
  }
  if (open) return `${tag}${from ? 'desde ' + fmtDM(leave.start) : '(informar início)'}`.trim();
  const cont = leave.start && leave.start < monthStart(mk) ? ' (cont.)' : '';
  const a = fmtDM(days[0]), b = fmtDM(days[days.length - 1]);
  return `${tag}${a === b ? a : a + ' a ' + b}${cont}`;
}
export function leaveText(leaves, empId, mk, kind) {
  const types = kind === 'falta' ? ['falta'] : ['atestado', 'licenca', 'inss'];
  return leavesOf(leaves, empId, mk, types).map((l) => formatLeave(l, mk)).filter(Boolean).join(' | ');
}

/** Assiduidade paga no mes: perde-se com qualquer falta/atestado/licenca/INSS no mes (a menos que haja ajuste manual). */
export function assiduidadeEfetiva(entry, leaves, mk) {
  if (entry.assiduidadeManual) return num(entry.assiduidade);
  const has = leavesOf(leaves, entry.empId, mk).length > 0;
  const hasLegacy = !!(entry.faltaTxt || entry.atestadoTxt);
  return has || hasLegacy ? 0 : num(entry.assiduidade);
}

// ---------- lancamento do mes ----------
export const emptyEntry = (month, empId, salario = 0) => ({
  month, empId, salario, consumo: 0, horaExtra: 0, feriado: 0, assiduidade: 0, adiantamento: 0, premio: 0,
  descAdic: 0, descAdicNota: '', dias: 0, vt: VT_DIARIO, faltaTxt: '', atestadoTxt: '', obs: '', excluded: false,
});

/** Novo mes herda SOMENTE campos recorrentes do mes anterior; o resto zera. */
export function carryOver(prev, month, empId, fallbackSalario = 0) {
  const e = emptyEntry(month, empId, fallbackSalario);
  if (!prev) return e;
  for (const f of RECURRING) e[f] = prev[f] ?? e[f];
  if (prev.assiduidadeManual) e.assiduidadeManual = false;
  return e;
}

export const entryId = (month, empId) => `${month}_${empId}`;

/** Funcionario deve aparecer no mes? (ativo e ja admitido/entrou; nao desligado antes do mes) */
export function activeInMonth(emp, mk) {
  if (emp.ativo === false && !emp.demissao) return false;
  const start = emp.entrada || emp.admissao;
  if (start && start > monthEnd(mk)) return false;
  if (emp.demissao && emp.demissao < monthStart(mk)) return false;
  return true;
}

/**
 * Propagacao: uma alteracao de campo recorrente no mes M vale para todos os meses seguintes
 * ja existentes e ainda ABERTOS. Devolve os ids a atualizar.
 */
export function propagationTargets(entries, empId, fromMonth, closedMonths = new Set()) {
  return entries
    .filter((e) => e.empId === empId && e.month > fromMonth && !closedMonths.has(e.month) && !e.excluded)
    .map((e) => e.id || entryId(e.month, e.empId));
}

/** Totais para a linha de conferencia */
export function rowView(entry, leaves, mk, vtDefault = VT_DIARIO) {
  const vt = entry.vt ?? vtDefault;
  return {
    assiduidade: assiduidadeEfetiva(entry, leaves, mk),
    passagem: passagem(entry.dias, vt),
    faltas: entry.faltaTxt ? entry.faltaTxt : leaveText(leaves, entry.empId, mk, 'falta'),
    atestado: entry.atestadoTxt ? entry.atestadoTxt : leaveText(leaves, entry.empId, mk, 'atestado'),
  };
}

// ---------- telefone / CPF ----------
export function normalizePhone(raw, dddPadrao = '24') {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return { ok: false, digits: '', wa: '', display: '' };
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length === 8 || d.length === 9) d = dddPadrao + d;
  if (d.length === 10 && /^[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2); // celular sem o 9
  const ok = d.length === 11 || d.length === 10;
  const display = d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : raw;
  return { ok, digits: d, wa: ok ? '55' + d : '', display };
}
export function cpfDigits(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 10) d = d.padStart(11, '0');
  return d;
}
export function cpfValid(raw) {
  const d = cpfDigits(raw);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === +d[9] && calc(10) === +d[10];
}
export const cpfFmt = (raw) => { const d = cpfDigits(raw); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(raw ?? ''); };

// ---------- nomes (casamento com contracheque) ----------
export const normName = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
export function lev(a, b) {
  const p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = p[0]; p[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = p[j];
      p[j] = Math.min(p[j] + 1, p[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return p[b.length];
}
const PART = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
/** 0..1: quanto os nomes se parecem (tolerante a erros de OCR e grafias diferentes) */
export function nameScore(a, b) {
  const ta = normName(a).split(' ').filter((t) => t && !PART.has(t));
  const tb = normName(b).split(' ').filter((t) => t && !PART.has(t));
  if (!ta.length || !tb.length) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let sum = 0;
  for (const t of short) {
    let best = 0;
    for (const u of long) best = Math.max(best, 1 - lev(t, u) / Math.max(t.length, u.length));
    sum += best;
  }
  return sum / short.length;
}
export function bestEmployeeMatch(name, employees, storeId) {
  const scored = employees.map((e) => ({ emp: e, score: nameScore(name, e.nome) + (storeId && e.loja === storeId ? 0.05 : 0) }));
  scored.sort((x, y) => y.score - x.score);
  return scored[0] && scored[0].score >= 0.8 ? scored[0] : null;
}

// ---------- escala de domingo ----------
export const DEFAULT_REQUIRED = { bingen: { atendimento: 1, manipulacao: 1 }, correas: { atendimento: 1, manipulacao: 1 }, coronel: { atendimento: 1, manipulacao: 1 } };

export function countAssigned(assign, storeId, emps) {
  const ids = (assign && assign[storeId]) || [];
  const c = { atendimento: 0, manipulacao: 0, nenhum: 0 };
  for (const id of ids) { const e = emps.find((x) => x.id === id); c[e ? e.categoria || 'nenhum' : 'nenhum']++; }
  return c;
}
/** Situacao de uma loja num domingo: faltam / sobram por categoria */
export function checkDay(assign, storeId, emps, required) {
  const c = countAssigned(assign, storeId, emps);
  const req = (required && required[storeId]) || { atendimento: 0, manipulacao: 0 };
  return ['atendimento', 'manipulacao'].map((cat) => ({ cat, tem: c[cat], precisa: req[cat] || 0, falta: Math.max(0, (req[cat] || 0) - c[cat]), sobra: Math.max(0, c[cat] - (req[cat] || 0)) }));
}

/**
 * Sugere a escala: para cada domingo/loja/funcao escolhe PRIMEIRO quem trabalha naquela loja (workStore),
 * com menos domingos no ano (historico + mes) e, no empate, quem nao trabalhou no domingo anterior.
 * So se faltar gente da propria loja chama alguem de outra loja (nunca a mesma pessoa em duas lojas no dia).
 * unavailable(empId, isoDate) -> motivo/true quando nao pode. Retorna { assignments, shortages }.
 */
export function suggestSchedule({ sundays, employees, required, unavailable = () => false, history = {}, keep = {} }) {
  const counts = { ...history };
  const assignments = {};
  const shortages = [];
  const staff = employees.filter(inEscala);
  const catOf = (id) => employees.find((e) => e.id === id)?.categoria;
  let prev = {};
  for (const d of sundays) {
    const day = {}; const used = new Set();
    for (const s of STORES) { day[s.id] = [...(keep[d]?.[s.id] || [])]; day[s.id].forEach((id) => used.add(id)); }
    const order = (a, b) => (counts[a.id] || 0) - (counts[b.id] || 0) || ((prev[a.id] ? 1 : 0) - (prev[b.id] ? 1 : 0)) || a.nome.localeCompare(b.nome);
    const need = (sid, cat) => ((required[sid] || {})[cat] || 0) - day[sid].filter((id) => catOf(id) === cat).length;
    const free = (e, cat) => e.categoria === cat && !used.has(e.id) && !unavailable(e.id, d);
    // 1) gente da propria loja
    for (const s of STORES) for (const cat of ['atendimento', 'manipulacao']) {
      const pool = staff.filter((e) => workStore(e) === s.id && free(e, cat)).sort(order);
      for (let i = 0, n = need(s.id, cat); i < n && i < pool.length; i++) { day[s.id].push(pool[i].id); used.add(pool[i].id); }
    }
    // 2) cobertura de outra loja so onde ainda falta
    for (const s of STORES) for (const cat of ['atendimento', 'manipulacao']) {
      let n = need(s.id, cat);
      if (n <= 0) continue;
      const pool = staff.filter((e) => workStore(e) !== s.id && free(e, cat)).sort(order);
      for (let i = 0; n > 0 && i < pool.length; i++, n--) { day[s.id].push(pool[i].id); used.add(pool[i].id); }
      if (n > 0) shortages.push({ date: d, store: s.id, cat, falta: n });
    }
    assignments[d] = day;
    for (const id of used) counts[id] = (counts[id] || 0) + 1;
    prev = Object.fromEntries([...used].map((id) => [id, true]));
  }
  return { assignments, shortages };
}

// ---------- ferias (CLT) ----------
// Periodo aquisitivo: 12 meses a partir da admissao. "Vencimento" = ultimo dia do aquisitivo.
// Periodo concessivo: 12 meses depois do vencimento. "Conceder ate" (igual ao relatorio da contabilidade)
// = fim do concessivo - 32 dias: ultimo dia para INICIAR 30 dias de ferias sem cair em dobro.
export const addYearsIso = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y + n, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0); // 29/02 -> 28/02
  return dt.toISOString().slice(0, 10);
};
/** Vencimento do 1o periodo aquisitivo a partir da admissao. */
export const primeiroVencFerias = (admissao) => (admissao ? isoAddDays(addYearsIso(admissao, 1), -1) : null);
export const concederAte = (venc) => isoAddDays(addYearsIso(venc, 1), -32);
export const limiteConcessivo = (venc) => addYearsIso(venc, 1);
export const inicioAquisitivo = (venc) => isoAddDays(addYearsIso(venc, -1), 1);
export const FERIAS_DIAS = 30, FERIAS_ABONO = 10;

/** Dias ja usados (gozo + abono) de um periodo, pelos registros de ferias do funcionario. */
export function feriasUsadas(registros, venc) {
  return (registros || []).filter((r) => r.venc === venc).reduce((s, r) => s + Math.max(0, Math.floor(num(r.dias))) + (r.abono ? FERIAS_ABONO : 0), 0);
}
/** Vencimento do periodo mais antigo ainda em aberto. */
export function vencAberto(emp) {
  let v = emp.feriasVenc || primeiroVencFerias(emp.admissao || emp.entrada);
  if (!v) return null;
  for (let i = 0; i < 60 && feriasUsadas(emp.ferias, v) >= FERIAS_DIAS; i++) v = addYearsIso(v, 1);
  return v;
}
/** Fim das ferias (inclui o dia inicial). */
export const fimFerias = (r) => isoAddDays(r.inicio, Math.max(1, Math.floor(num(r.dias))) - 1);

/**
 * Situacao das ferias de um funcionario numa data (hoje).
 * nivel: dobro (prazo estourado) | urgente (menos de 60 dias para o prazo) | vencida (pode tirar) | aquisicao | sem_dados
 */
export function feriasStatus(emp, hoje) {
  const venc = vencAberto(emp);
  if (!venc) return { nivel: 'sem_dados', texto: 'Sem data de admissão' };
  const ate = concederAte(venc), lim = limiteConcessivo(venc), ini = inicioAquisitivo(venc);
  const usados = feriasUsadas(emp.ferias, venc), saldo = FERIAS_DIAS - usados;
  let vencidos = 0;
  for (let v = venc; v < hoje && vencidos < 20; v = addYearsIso(v, 1)) vencidos++;
  const avos = hoje <= ini ? 0 : Math.min(12, Math.floor(monthsBetween(ini, isoAddDays(hoje, 1))));
  const diasPrazo = isoDiffDays(hoje, ate);
  let nivel, texto;
  if (hoje > ate) { nivel = 'dobro'; texto = hoje > lim ? 'Prazo estourado — férias em dobro' : `Passou do prazo para iniciar (${fmtDMY(ate)}) — risco de pagar em dobro`; }
  else if (hoje > venc && diasPrazo <= 60) { nivel = 'urgente'; texto = `Marcar férias até ${fmtDMY(ate)} (${diasPrazo} dias)`; }
  else if (hoje > venc) { nivel = 'vencida'; texto = `Pode tirar férias — prazo para iniciar até ${fmtDMY(ate)}`; }
  else { nivel = 'aquisicao'; texto = `Em aquisição: ${avos}/12 avos — vence em ${fmtDMY(venc)}`; }
  if (vencidos > 1) texto += ` · ${vencidos} períodos vencidos`;
  return { nivel, texto, venc, concederAte: ate, limite: lim, inicioAquisitivo: ini, usados, saldo, vencidos, avos, diasPrazo };
}
function monthsBetween(a, b) { // meses completos de a ate b
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}
/** Ferias registradas que cobrem a data iso (para escala de domingo etc.). */
export const emFerias = (emp, iso) => (emp?.ferias || []).some((r) => r.inicio && r.inicio <= iso && fimFerias(r) >= iso);

/**
 * Leitura do relatorio "Previsao de Vencimento de Ferias" da contabilidade (texto do OCR).
 * Devolve [{nome, venc, concederAte}] — datas corrigidas usando a relacao venc <-> conceder ate.
 */
export function parseRelatorioFerias(text, { hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const out = [];
  const toIso = (s) => {
    if ((s.match(/\d/g) || []).length < 5) return null;
    const d = s.replace(/O/g, '0').replace(/S/g, '5').replace(/[Il|]/g, '1').replace(/\D/g, '');
    if (d.length !== 8) return null;
    const iso = `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
    const t = new Date(iso + 'T00:00:00Z');
    return Number.isNaN(+t) || t.toISOString().slice(0, 10) !== iso ? null : iso;
  };
  const perto = (iso) => { if (!iso) return false; const d = isoDiffDays(hoje, iso); return d >= -800 && d <= 400; }; // vencimento em aberto: ate ~2 anos atras e no maximo ~1 ano a frente
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/[—–]/g, ' ');
    const D8 = '([\\dOSIl|][\\dOSIl|/]{5,9}[\\dOSIl|])'; // OCR troca 0->O, 5->S, 1->I/l
    const m = line.match(new RegExp(`^\\s*\\S{3,8}\\s+([A-ZÀ-Ú][A-ZÀ-Ú' ]{5,}?)\\s+[-\\s]*${D8}\\s+${D8}\\s+${D8}`));
    if (!m) continue;
    const nome = m[1].trim().replace(/\s+/g, ' ');
    if (/^(EMPRESA|DEPARTAMENTO|CODIGO|CÓDIGO|PREVIS)/.test(nome)) continue;
    const vRaw = toIso(m[3]), cRaw = toIso(m[4]);
    const vDeC = cRaw ? addYearsIso(isoAddDays(cRaw, 32), -1) : null;
    // o relatorio sempre tem "conceder ate" = vencimento + 1 ano - 32 dias; quando as duas leituras discordam,
    // vale a que o OCR leu sem trocar letras por numeros e que cai numa data plausivel
    const limpo = (t) => /^[\d/]+$/.test(t);
    let venc = null;
    if (vRaw && vDeC && vRaw === vDeC) venc = vRaw;
    else {
      const cands = [[vRaw, limpo(m[3])], [vDeC, limpo(m[4])]].filter(([v]) => perto(v));
      venc = (cands.find(([, l]) => l) || cands[0] || [null])[0];
    }
    if (!venc) continue;
    out.push({ nome, venc, concederAte: concederAte(venc) });
  }
  return out;
}
