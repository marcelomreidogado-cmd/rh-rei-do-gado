// Regras de negocio puras (sem DOM / sem Firebase) - testadas em tests/calc.test.js
export const VT_DIARIO = 11.8;

export const STORES = [
  { id: 'bingen', nome: 'Bingen', cod: '00001', cnpj: '39.305.061/0001-00', empresa: 'AIM CASA DE CARNES BINGEN LTDA' },
  { id: 'correas', nome: 'Correas', cod: '00002', cnpj: '36.148.327/0001-52', empresa: 'AIM CASA DE CARNES CORREAS LTDA' },
  { id: 'coronel', nome: 'Coronel', cod: '00003', cnpj: '33.148.048/0001-09', empresa: 'AIM CASA DE CARNES LTDA' },
];
export const storeById = (id) => STORES.find((s) => s.id === id);

export const CATEGORIAS = { atendimento: 'Atendimento', manipulacao: 'Manipulação', hibrido: 'Híbrido (atendimento e manipulação)', nenhum: 'Não trabalha domingo' };
export const HIBRIDO = 'hibrido';
/** Funcoes que a pessoa pode fazer no dia (hibrido = atendimento ou manipulacao). */
export const funcoesDe = (e) => (!e ? [] : e.categoria === HIBRIDO ? ['atendimento', 'manipulacao'] : [e.categoria]);
/**
 * Distribui as pessoas de um dia entre as funcoes: quem so faz uma funcao fica nela; o hibrido vai para a funcao
 * em que estiver faltando mais gente (empate: a primeira da lista dele).
 * minimos: {funcao: n}; pessoas: [{id, funcoes:[...]}]. Retorna { papel:{id:funcao}, tem:{funcao:n}, falta:{funcao:n} }.
 */
export function alocar(minimos, pessoas) {
  const tem = {}, papel = {};
  for (const f of Object.keys(minimos || {})) tem[f] = 0;
  const fixos = pessoas.filter((p) => p.funcoes.length === 1), flex = pessoas.filter((p) => p.funcoes.length > 1);
  for (const p of fixos) { papel[p.id] = p.funcoes[0]; tem[p.funcoes[0]] = (tem[p.funcoes[0]] || 0) + 1; }
  for (const p of flex) {
    const f = [...p.funcoes].sort((a, b) => (((minimos || {})[b] || 0) - (tem[b] || 0)) - (((minimos || {})[a] || 0) - (tem[a] || 0)))[0];
    papel[p.id] = f; tem[f] = (tem[f] || 0) + 1;
  }
  const falta = {};
  for (const [f, n] of Object.entries(minimos || {})) falta[f] = Math.max(0, n - (tem[f] || 0));
  return { papel, tem, falta };
}

// Onde a pessoa trabalha de verdade (pode ser diferente da loja do registro/imposto, usada na folha).
export const ADM = 'adm';
export const WORK_PLACES = [...STORES.map((s) => ({ id: s.id, nome: s.nome })), { id: ADM, nome: 'Administrativo (seg. a sex.)' }];
const FUNCAO_ADM = /financ|administ|escrit|contab|\bRH\b|recursos humanos/i;
/** Loja onde trabalha: o que foi cadastrado; se vazio, administrativo pela função ou a loja do registro. */
export const workStore = (e) => (e ? e.lojaTrabalho || (FUNCAO_ADM.test(e.funcao || '') ? ADM : e.loja) : null);
export const workPlaceName = (id) => WORK_PLACES.find((w) => w.id === id)?.nome || '';
/** Entra na escala de domingo? (ativo, trabalha em loja e tem funcao de atendimento/manipulacao) */
export const inEscala = (e) => !!e && e.ativo !== false && workStore(e) !== ADM && ['atendimento', 'manipulacao', HIBRIDO].includes(e.categoria);

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

/** Valor em dinheiro para mostrar: R$ 1.234,56 (vazio quando zero). */
export const money = (n) => { const b = brl(n); return b ? `R$ ${b}` : ''; };
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

/** Datas seguidas viram faixa: [18,19,20,25] -> "18/10 a 20/10, 25/10". */
export function faixasDatas(days) {
  const ds = [...new Set(days)].sort(), out = [];
  for (let i = 0; i < ds.length; i++) {
    let j = i; while (j + 1 < ds.length && isoAddDays(ds[j], 1) === ds[j + 1]) j++;
    out.push(j > i ? `${fmtDM(ds[i])} a ${fmtDM(ds[j])}` : fmtDM(ds[i])); i = j;
  }
  return out.join(', ');
}
export function formatLeave(leave, mk) {
  const days = leaveDaysInMonth(leave, mk);
  if (!days.length) return '';
  if (leave.type === 'falta') return faixasDatas(days);
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
  month, empId, salario, consumo: 0, horaExtra: 0, feriado: 0, assiduidade: 0, adiantamento: 0, vale: 0, vales: [], premio: 0,
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

// ---------- vales (cada vale tem dia e valor; nao passa para o mes seguinte) ----------
/** Limpa a lista de vales: so os que tem data e valor, em ordem de data. */
export const normVales = (vales) => (vales || []).map((v) => ({ data: String(v.data || ''), valor: round2(num(v.valor)) }))
  .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.data) && v.valor > 0).sort((a, b) => a.data.localeCompare(b.data));
export const valeTotal = (vales) => round2(normVales(vales).reduce((s, v) => s + v.valor, 0));
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Texto do vale para o e-mail: "R$ 50,00 (05/10)" ou "R$ 150,00 (05/10 R$ 50,00; 12/10 R$ 100,00)". */
export function valeTexto(entry) {
  const vs = normVales(entry?.vales);
  if (!vs.length) return money(entry?.vale);
  const tot = money(valeTotal(vs));
  return vs.length === 1 ? `${tot} (${dm(vs[0].data)})` : `${tot} (${vs.map((v) => `${dm(v.data)} ${money(v.valor)}`).join('; ')})`;
}

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

const reqOf = (required, storeId) => ({ atendimento: 0, manipulacao: 0, ...((required && required[storeId]) || {}) });
/** Quem trabalha numa loja no domingo, separado por funcao (hibrido entra onde falta). */
export function papeisDoDia(assign, storeId, emps, required) {
  const ids = (assign && assign[storeId]) || [];
  const pessoas = ids.map((id) => emps.find((x) => x.id === id)).filter(Boolean).map((e) => ({ id: e.id, funcoes: funcoesDe(e).filter((f) => ['atendimento', 'manipulacao'].includes(f)) })).filter((p) => p.funcoes.length);
  const r = alocar(reqOf(required, storeId), pessoas);
  const out = { atendimento: [], manipulacao: [] };
  for (const id of ids) if (r.papel[id]) out[r.papel[id]].push(id);
  return { ...out, tem: r.tem, falta: r.falta };
}
export function countAssigned(assign, storeId, emps, required) {
  const p = papeisDoDia(assign, storeId, emps, required);
  return { atendimento: p.tem.atendimento || 0, manipulacao: p.tem.manipulacao || 0 };
}
/** Situacao de uma loja num domingo: faltam / sobram por categoria */
export function checkDay(assign, storeId, emps, required) {
  const req = reqOf(required, storeId);
  const p = papeisDoDia(assign, storeId, emps, required);
  return ['atendimento', 'manipulacao'].map((cat) => { const tem = p.tem[cat] || 0; return { cat, tem, precisa: req[cat] || 0, falta: Math.max(0, (req[cat] || 0) - tem), sobra: Math.max(0, tem - (req[cat] || 0)) }; });
}

/**
 * Escala de domingo — regra da empresa: TODO MUNDO trabalha todo domingo na sua loja, exceto 1 FOLGA por mes.
 * 1) distribui a folga de cada funcionario num domingo diferente dos colegas da mesma loja/funcao (quando da);
 * 2) se a folga deixa a loja abaixo do minimo (required = minimo por domingo), chama alguem de OUTRA loja
 *    que esteja com sobra naquele domingo para cobrir.
 * unavailable(empId, iso) -> motivo (ferias/atestado...) quando nao pode trabalhar.
 * Retorna { assignments: {dia: {loja: [ids que trabalham]}}, folgas: {dia: [ids]}, covers: {dia: {id: lojaOrigem}}, shortages }.
 */
export function suggestSchedule({ sundays, employees, required, unavailable = () => false, offset = 0 }) {
  const staff = employees.filter(inEscala).sort((a, b) => a.nome.localeCompare(b.nome));
  const folgas = Object.fromEntries(sundays.map((d) => [d, []]));
  const folgaDe = {};
  // 1) folgas
  // lojas com menos gente primeiro: as folgas delas precisam de cobertura, entao as lojas maiores evitam folgar nesses dias
  const lojas = [...STORES].sort((a, b) => staff.filter((e) => workStore(e) === a.id).length - staff.filter((e) => workStore(e) === b.id).length);
  const who = (id) => staff.find((x) => x.id === id);
  for (const s of lojas) {
    const team = staff.filter((e) => workStore(e) === s.id);
    team.forEach((e, i) => {
      const cands = sundays.map((d, k) => ({ d, k })).filter(({ d }) => !unavailable(e.id, d));
      if (!cands.length) return; // afastado o mes todo
      const score = ({ d, k }) => {
        const f = folgas[d].map(who);
        const junto = (o) => funcoesDe(o).some((c) => funcoesDe(e).includes(c)); // faz alguma funcao em comum
        const same = f.filter((o) => workStore(o) === s.id && junto(o)).length; // colega da mesma loja e funcao
        const sameCat = f.filter(junto).length; // mesma funcao em qualquer loja (tira quem poderia cobrir)
        const store = f.filter((o) => workStore(o) === s.id).length;
        const rot = (k - (i + offset) % sundays.length + sundays.length) % sundays.length; // gira a semana da folga a cada mes
        // quanto a loja fica abaixo do minimo nesse domingo se ele folgar (o hibrido conta onde faltar)
        const sobra = team.filter((o) => o.id !== e.id && !folgas[d].includes(o.id) && !unavailable(o.id, d)).map((o) => o.id);
        const deficit = Object.values(papeisDoDia({ [s.id]: sobra }, s.id, staff, required).falta).reduce((a, n) => a + n, 0);
        return deficit * 100000 + same * 10000 + sameCat * 1000 + store * 100 + f.length * 10 + rot;
      };
      const best = cands.sort((x, y) => score(x) - score(y))[0];
      folgas[best.d].push(e.id); folgaDe[e.id] = best.d;
    });
  }
  // 2) quem trabalha + cobertura
  const assignments = {}, covers = {}, shortages = [], nCover = {};
  for (const d of sundays) {
    const day = {}; covers[d] = {};
    for (const s of STORES) day[s.id] = staff.filter((e) => workStore(e) === s.id && folgaDe[e.id] !== d && !unavailable(e.id, d)).map((e) => e.id);
    const who2 = (id) => staff.find((e) => e.id === id);
    const faltaEm = (sid, c, dia = day) => papeisDoDia(dia, sid, staff, required).falta[c] || 0;
    const somaFalta = (sid, dia = day) => faltaEm(sid, 'atendimento', dia) + faltaEm(sid, 'manipulacao', dia);
    for (const s of STORES) for (const c of ['atendimento', 'manipulacao']) {
      while (faltaEm(s.id, c) > 0) {
        // doador: alguem de outra loja que faz essa funcao (ou hibrido) e cuja loja nao fica com falta a mais sem ele
        const pool = [];
        for (const o of STORES) {
          if (o.id === s.id) continue;
          for (const id of day[o.id]) {
            if (covers[d][id] || !funcoesDe(who2(id)).includes(c)) continue;
            const teste = { ...day, [o.id]: day[o.id].filter((x) => x !== id) };
            if (somaFalta(o.id, teste) <= somaFalta(o.id)) pool.push({ id, from: o.id, hib: who2(id).categoria === HIBRIDO ? 1 : 0 });
          }
        }
        if (!pool.length) break;
        pool.sort((x, y) => (nCover[x.id] || 0) - (nCover[y.id] || 0) || x.hib - y.hib || x.id.localeCompare(y.id));
        const p = pool[0];
        day[p.from] = day[p.from].filter((id) => id !== p.id); day[s.id].push(p.id);
        covers[d][p.id] = p.from; nCover[p.id] = (nCover[p.id] || 0) + 1;
      }
      const falta = faltaEm(s.id, c);
      if (falta > 0) shortages.push({ date: d, store: s.id, cat: c, falta });
    }
    assignments[d] = day;
  }
  return { assignments, folgas, covers, shortages };
}

/** Quem folga no dia (derivado do que esta lancado): equipe da loja que nao esta escalada em lugar nenhum e nao esta afastada. */
export function folgasDoDia(assign, storeId, employees, unavailable = () => false, d) {
  const busy = new Set(Object.values(assign || {}).flat());
  return employees.filter((e) => inEscala(e) && workStore(e) === storeId && !busy.has(e.id) && !unavailable(e.id, d)).map((e) => e.id);
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

// ---------- escala 5x2 (EC 141/2026 — fim da 6x1) — SIMULACAO ----------
// Modelo usado no varejo: cada pessoa tem 2 folgas por semana (seg a dom). Dia em que a loja nao abre conta como
// folga para todos. A outra folga e um DIA FIXO da semana (previsivel para o funcionario) e, a cada 3 semanas,
// troca para o DOMINGO (comercio: folga no domingo pelo menos 1 vez a cada 3 semanas — Lei 10.101/2000, art. 6º).
// Dias marcados como "sem folga" (ex.: sabado) nunca recebem folga. Cada unidade e calculada sozinha:
// a sugestao NUNCA tira gente de uma unidade para cobrir outra.
export const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DIAS_SEM_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const weekday = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 = domingo
/** Semanas (segunda a domingo) que cobrem o mes inteiro: [[7 datas], ...] */
export function semanasDoMes(mk) {
  let d = monthStart(mk);
  d = isoAddDays(d, -((weekday(d) + 6) % 7));
  const out = [];
  while (d <= monthEnd(mk)) { out.push(Array.from({ length: 7 }, (_, i) => isoAddDays(d, i))); d = isoAddDays(d, 7); }
  return out;
}
/** Numero da semana corrida (continua entre meses) para o rodizio de domingo. */
export const semanaCorrida = (seg) => Math.floor(isoDiffDays('2024-01-01', seg) / 7); // 01/01/2024 foi segunda

/** Funcoes que a pessoa da 5x2 pode fazer (hibrido tem mais de uma). */
export const funcoesP = (p) => (p.funcoes && p.funcoes.length ? p.funcoes : [p.funcao]);
const minimosDia = (u, dow) => { const o = {}; for (const [f, arr] of Object.entries((u && u.minimos) || {})) o[f] = (arr || [])[dow] || 0; return o; };

/**
 * Gera a escala 5x2.
 * pessoas: [{id, nome, unidade, funcao, funcoes?}] (funcoes com 2+ itens = hibrido, cobre a funcao que faltar)
 * unidades: {id: {abre: [dias da semana 0..6], minimos: {funcao: [7 numeros, indice = dia da semana]}}}
 * semFolga: dias da semana que nunca recebem folga (ex.: [6] = sabado)
 * Retorna { folgas: {id: [datas]}, plano: {id: {fixo:[dias], grupoDomingo}}, faltas: [{date, unidade, funcao, falta}], avisos: [texto] }
 */
export function gerar5x2({ weeks, pessoas, unidades, semFolga = [6], domingo3 = true, unavailable = () => '' }) {
  const folgas = {}, plano = {}, avisos = [];
  for (const [uid, u] of Object.entries(unidades)) {
    const abre = new Set(u.abre || [0, 1, 2, 3, 4, 5, 6]);
    const fechados = 7 - abre.size;
    const precisa = Math.max(0, 2 - fechados); // folgas a dar alem dos dias fechados
    const domAberto = abre.has(0);
    const ordemF = Object.keys(u.minimos || {});
    const daUnidade = pessoas.filter((p) => p.unidade === uid);
    // fixos primeiro (por funcao e nome); hibridos por ultimo, encaixados onde sobra gente
    const gente = [...daUnidade].sort((a, b) => (funcoesP(a).length > 1) - (funcoesP(b).length > 1)
      || ordemF.indexOf(a.funcao) - ordemF.indexOf(b.funcao) || a.nome.localeCompare(b.nome));
    const minF = (f, dow) => (abre.has(dow) ? ((u.minimos || {})[f] || [])[dow] || 0 : 0);
    const minimosD = (dow) => (abre.has(dow) ? minimosDia(u, dow) : {});
    const somaMin = (dow) => Object.values(minimosD(dow)).reduce((x, n) => x + n, 0);
    // quanto falta no dia da semana se "fora" estiver de folga
    const deficit = (dow, fora) => Object.values(alocar(minimosD(dow), daUnidade.filter((p) => !fora.has(p.id)).map((p) => ({ id: p.id, funcoes: funcoesP(p) }))).falta).reduce((x, n) => x + n, 0);
    const cands = [2, 3, 4, 5, 6, 1].filter((d) => abre.has(d) && !semFolga.includes(d)); // ter..sab, seg por ultimo
    const usaRodizio = domAberto && precisa > 0 && domingo3 && !semFolga.includes(0);
    const foraDia = {}; for (const d of cands) foraDia[d] = new Set();
    const gruposDom = [new Set(), new Set(), new Set()];
    const idx = {}; // posicao da pessoa dentro do seu grupo (funcao / hibridos) para girar os dias
    const funcoesVistas = {};
    for (const p of gente) { const k = funcoesP(p).length > 1 ? '*' : p.funcao; idx[p.id] = funcoesVistas[k] = (funcoesVistas[k] ?? -1) + 1; }
    for (const p of gente) {
      const i = idx[p.id];
      const fixo = [];
      for (let k = 0; k < precisa && cands.length; k++) {
        const nota = (d) => {
          const fora = new Set([...foraDia[d], p.id]);
          return -deficit(d, fora) * 1000 + (daUnidade.length - fora.size - somaMin(d)) * 10
            + (fixo.some((x) => Math.abs(x - d) === 1) ? 3 : 0) - ((cands.indexOf(d) - i + 70) % cands.length) * 0.01;
        };
        const d = cands.filter((x) => !fixo.includes(x)).sort((a, b) => nota(b) - nota(a))[0];
        if (d === undefined) break;
        fixo.push(d); foraDia[d].add(p.id);
      }
      let grupoDomingo = null;
      if (usaRodizio && fixo.length) {
        const notaG = (g) => -deficit(0, new Set([...gruposDom[g], p.id])) * 1000 - gruposDom[g].size * 10 - ((g - i + 30) % 3) * 0.01;
        grupoDomingo = [0, 1, 2].sort((a, b) => notaG(b) - notaG(a))[0];
        gruposDom[grupoDomingo].add(p.id);
      }
      plano[p.id] = { fixo, grupoDomingo };
      folgas[p.id] = [];
      for (const week of weeks) {
        const dias = [...fixo];
        if (grupoDomingo !== null && (semanaCorrida(week[0]) + grupoDomingo) % 3 === 0) dias[dias.length - 1] = 0; // domingo no lugar do ultimo dia fixo
        for (const dow of dias) folgas[p.id].push(week[(dow + 6) % 7]);
      }
      folgas[p.id].sort();
    }
    // aviso: alguma funcao fica sem gente num domingo de rodizio (equipe pequena demais para folgar 1 domingo a cada 3 semanas)
    if (usaRodizio) {
      for (const f of ordemF) {
        const n = daUnidade.filter((p) => funcoesP(p).length === 1 && p.funcao === f).length;
        if (!n || !minF(f, 0)) continue;
        if (gruposDom.some((g) => alocar(minimosD(0), daUnidade.filter((p) => !g.has(p.id)).map((p) => ({ id: p.id, funcoes: funcoesP(p) }))).falta[f] > 0)) {
          avisos.push({ unidade: uid, funcao: f, pessoas: n, minDomingo: minF(f, 0) });
        }
      }
    }
  }
  const faltas = faltas5x2({ weeks, pessoas, unidades, folgas, unavailable });
  return { folgas, plano, faltas, avisos };
}

/** Quem esta trabalhando numa unidade no dia (contando quem foi emprestado e quem veio cobrir), ja com a funcao do dia. */
export function contagem5x2({ pessoas, unidade, unidades = {}, d, folgas, cobre = {}, unavailable = () => '' }) {
  const presentes = pessoas.filter((p) => !unavailable(p.id, d) && !(folgas[p.id] || []).includes(d)
    && ((cobre[p.id] || {})[d] ? cobre[p.id][d] === unidade : p.unidade === unidade)).map((p) => ({ id: p.id, funcoes: funcoesP(p) }));
  return alocar(minimosDia(unidades[unidade], weekday(d)), presentes);
}

/** Quantos de uma funcao estao trabalhando numa unidade no dia (hibrido conta onde for alocado). */
export function naUnidade5x2({ funcao, ...a }) {
  return contagem5x2(a).tem[funcao] || 0;
}

/** Faltas de gente por unidade/funcao/dia (ja considera as coberturas entre unidades). */
export function faltas5x2({ weeks, pessoas, unidades, folgas, cobre = {}, unavailable = () => '' }) {
  const out = [];
  for (const [uid, u] of Object.entries(unidades)) {
    const abre = new Set(u.abre || []);
    for (const week of weeks) for (const d of week) {
      if (!abre.has(weekday(d))) continue;
      const { falta } = contagem5x2({ pessoas, unidade: uid, unidades, d, folgas, cobre, unavailable });
      for (const [f, n] of Object.entries(falta)) if (n > 0) out.push({ date: d, unidade: uid, funcao: f, falta: n });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.unidade.localeCompare(b.unidade));
}

/**
 * Cobertura entre unidades: onde faltar gente num dia, chama alguem que faca aquela funcao (ou hibrido) de outra
 * unidade que esteja trabalhando naquele dia e cuja unidade nao fique com falta a mais sem ele. Prefere quem cobriu menos
 * vezes no mes e, no empate, quem nao e hibrido (o hibrido fica de reserva na propria loja).
 * Retorna cobre: {pessoaId: {data: unidadeDestino}} (so para aquele dia — ninguem muda de unidade).
 */
export function cobrir5x2({ weeks, pessoas, unidades, folgas, cobre: inicial = {}, unavailable = () => '' }) {
  const cobre = JSON.parse(JSON.stringify(inicial || {}));
  const vezes = {}; for (const [id, m] of Object.entries(cobre)) vezes[id] = Object.keys(m).length;
  const abre = (u, d) => (unidades[u]?.abre || []).includes(weekday(d));
  const cont = (u, d, c = cobre) => contagem5x2({ pessoas, unidade: u, unidades, d, folgas, cobre: c, unavailable });
  const somaFalta = (u, d, c) => Object.values(cont(u, d, c).falta).reduce((a, n) => a + n, 0);
  for (const week of weeks) for (const d of week) for (const u of Object.keys(unidades)) {
    if (!abre(u, d)) continue;
    for (const f of Object.keys(unidades[u].minimos || {})) {
      for (let guarda = 0; guarda < 20 && (cont(u, d).falta[f] || 0) > 0; guarda++) {
        const doadores = pessoas.filter((p) => funcoesP(p).includes(f) && p.unidade !== u && unidades[p.unidade] && abre(p.unidade, d)
          && !unavailable(p.id, d) && !(folgas[p.id] || []).includes(d) && !(cobre[p.id] || {})[d]
          && somaFalta(p.unidade, d, { ...cobre, [p.id]: { ...(cobre[p.id] || {}), [d]: u } }) <= somaFalta(p.unidade, d, cobre))
          .sort((a, b) => (vezes[a.id] || 0) - (vezes[b.id] || 0) || funcoesP(a).length - funcoesP(b).length || a.nome.localeCompare(b.nome));
        if (!doadores.length) break;
        const p = doadores[0];
        (cobre[p.id] = cobre[p.id] || {})[d] = u; vezes[p.id] = (vezes[p.id] || 0) + 1;
      }
    }
  }
  return cobre;
}
