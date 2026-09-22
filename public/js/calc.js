// Regras de negocio puras (sem DOM / sem Firebase) - testadas em tests/calc.test.js
export const VT_DIARIO = 11.8;

export const STORES = [
  { id: 'bingen', nome: 'Bingen', cod: '00001', cnpj: '39.305.061/0001-00', empresa: 'AIM CASA DE CARNES BINGEN LTDA' },
  { id: 'correas', nome: 'Correas', cod: '00002', cnpj: '36.148.327/0001-52', empresa: 'AIM CASA DE CARNES CORREAS LTDA' },
  { id: 'coronel', nome: 'Coronel', cod: '00003', cnpj: '33.148.048/0001-09', empresa: 'AIM CASA DE CARNES LTDA' },
];
export const storeById = (id) => STORES.find((s) => s.id === id);

export const CATEGORIAS = { atendimento: 'Atendimento', manipulacao: 'Manipulação', nenhum: 'Fora da escala' };

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
 * Sugere escala justa: para cada domingo/loja/categoria escolhe os funcionarios da loja com menos domingos
 * trabalhados (contando historico), evitando repetir quem trabalhou no domingo anterior e quem esta afastado.
 * unavailable(empId, isoDate) -> boolean.  Retorna { assignments, shortages }
 */
export function suggestSchedule({ sundays, employees, required, unavailable = () => false, history = {}, keep = {} }) {
  const counts = { ...history };
  const assignments = {};
  const shortages = [];
  let prev = {};
  for (const d of sundays) {
    assignments[d] = {};
    const now = {};
    for (const s of STORES) {
      const ids = new Set(keep[d]?.[s.id] || []);
      const req = required[s.id] || {};
      for (const cat of ['atendimento', 'manipulacao']) {
        const already = [...ids].filter((id) => employees.find((e) => e.id === id)?.categoria === cat).length;
        const need = (req[cat] || 0) - already;
        if (need <= 0) continue;
        // menos domingos trabalhados primeiro; empate: quem descansou no domingo anterior; depois ordem alfabetica
        const pool = employees
          .filter((e) => e.loja === s.id && e.categoria === cat && e.ativo !== false && !ids.has(e.id) && !unavailable(e.id, d))
          .sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0) || ((prev[a.id] ? 1 : 0) - (prev[b.id] ? 1 : 0)) || a.nome.localeCompare(b.nome));
        for (let i = 0; i < need && i < pool.length; i++) { ids.add(pool[i].id); }
        const got = Math.min(need, pool.length);
        if (got < need) shortages.push({ date: d, store: s.id, cat, falta: need - got });
      }
      assignments[d][s.id] = [...ids];
      for (const id of ids) { now[id] = true; }
    }
    for (const id of Object.keys(now)) counts[id] = (counts[id] || 0) + 1;
    prev = now;
  }
  return { assignments, shortages };
}
