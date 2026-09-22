import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, $$, toast, openModal, confirmBox, copyRich } from '../ui.js';

let mk, root, data;
const CATS = ['atendimento', 'manipulacao'];

/** Motivo pelo qual a pessoa nao pode trabalhar naquele dia (falta/atestado/licenca) ou '' */
export function awayReason(empId, iso) {
  for (const l of S.leaves) {
    if (l.empId !== empId) continue;
    if (l.type === 'falta') { if ((l.dates || []).includes(iso)) return 'falta'; continue; }
    if ((!l.start || l.start <= iso) && (!l.end || l.end >= iso)) return C.LEAVE_LABEL[l.type].toLowerCase();
  }
  const emp = D.emp(empId);
  if (emp && (emp.ativo === false || (emp.entrada || emp.admissao) > iso)) return 'fora do quadro';
  return '';
}

const short = (n) => { const t = n.split(/\s+/); return `${t[0]} ${t[1] && !['DA', 'DE', 'DO', 'DAS', 'DOS'].includes(t[1].toUpperCase()) ? t[1][0] + '.' : ''}`.trim(); };
const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();

export async function render(el, month) {
  root = el; mk = month;
  data = await D.loadSundays(mk);
  const sundays = C.sundaysOf(mk);
  const req = S.config.required;
  const emps = S.employees.filter((e) => e.ativo !== false);
  const counts = {};
  for (const d of sundays) for (const ids of Object.values(data.assignments[d] || {})) for (const id of ids) counts[id] = (counts[id] || 0) + 1;

  root.innerHTML = `<div class="toolbar"><strong>Escala de domingo — ${esc(C.monthLabel(mk))}</strong><span class="spacer"></span>
    <button class="btn" data-act="req">⚙ Quantidade por loja</button>
    <button class="btn" data-act="suggest">✨ Sugerir escala</button><button class="btn" data-act="clear">Limpar</button>
    <button class="btn" data-act="copy">📋 Copiar</button><button class="btn" data-act="print">🖨 Imprimir</button></div>
    <div class="req-line">${C.STORES.map((s) => `<span class="pill"><b>${esc(s.nome)}</b> precisa de ${req[s.id]?.atendimento ?? 0} atend. + ${req[s.id]?.manipulacao ?? 0} manip.</span>`).join('')}</div>
    <div class="sundays">${sundays.map((d) => `<article class="sunday"><h3>Domingo ${C.fmtDM(d)}</h3><div class="sun-stores">${C.STORES.map((s) => {
      const ids = data.assignments[d]?.[s.id] || [];
      const chk = C.checkDay(data.assignments[d], s.id, S.employees, req);
      const ok = chk.every((x) => x.falta === 0);
      return `<div class="sun-store ${ids.length || chk.some((x) => x.precisa) ? (ok ? 'ok' : 'short') : ''}"><header><b>${esc(s.nome)}</b><button class="btn sm" data-act="edit" data-d="${d}" data-s="${s.id}">Editar</button></header>
        ${CATS.map((cat) => { const list = ids.filter((id) => D.emp(id)?.categoria === cat); const c = chk.find((x) => x.cat === cat); return `<div class="cat"><span class="catname">${C.CATEGORIAS[cat]} <em class="${c.falta ? 'lack' : c.sobra ? 'extra' : 'fine'}">${c.tem}/${c.precisa}</em></span>${list.map((id) => `<span class="person ${D.emp(id).loja !== s.id ? 'cover' : ''}" title="${esc(D.emp(id).nome)}">${esc(cap(short(D.emp(id).nome)))}${D.emp(id).loja !== s.id ? ' ↔' : ''}</span>`).join('') || '<span class="muted">—</span>'}</div>`; }).join('')}
        ${ids.filter((id) => !CATS.includes(D.emp(id)?.categoria)).map((id) => `<div class="cat"><span class="person cover">${esc(cap(short(D.emp(id).nome)))} (fora da escala)</span></div>`).join('')}
        ${chk.some((x) => x.falta) ? `<p class="lack">Faltam: ${chk.filter((x) => x.falta).map((x) => `${x.falta} ${C.CATEGORIAS[x.cat].toLowerCase()}`).join(', ')}</p>` : ''}</div>`;
    }).join('')}</div></article>`).join('')}</div>
    <section class="store"><h2>Domingos por pessoa em ${esc(C.monthLabel(mk))}</h2><div class="table-wrap"><table class="grid mini"><thead><tr><th>Funcionário</th><th>Loja</th><th>Função na escala</th><th>Domingos</th></tr></thead><tbody>${emps.filter((e) => e.categoria !== 'nenhum').map((e) => `<tr><td>${esc(e.nome)}</td><td>${esc(C.storeById(e.loja)?.nome || '')}</td><td>${C.CATEGORIAS[e.categoria] || ''}</td><td class="num">${counts[e.id] || 0}</td></tr>`).join('')}</tbody></table></div></section>`;
  wire();
}

let wiredRoot = null;
function wire() {
  if (wiredRoot === root) return; wiredRoot = root;
  root.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    try {
      const act = b.dataset.act;
      if (act === 'edit') openEdit(b.dataset.d, b.dataset.s);
      else if (act === 'req') openReq();
      else if (act === 'suggest') await suggest();
      else if (act === 'clear') { if (await confirmBox('Limpar toda a escala deste mês?', { danger: true, okLabel: 'Limpar' })) { await D.saveSundays(mk, {}); render(root, mk); } }
      else if (act === 'copy') { const t = asText(); const ok = await copyRich(`<pre style="font:13px monospace">${esc(t)}</pre>`, t); toast(ok ? 'Escala copiada.' : 'Não foi possível copiar.', ok ? 'ok' : 'err'); }
      else if (act === 'print') window.print();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function asText() {
  const lines = [`ESCALA DE DOMINGO - ${C.monthLabel(mk).toUpperCase()}`];
  for (const d of C.sundaysOf(mk)) {
    lines.push('', `Domingo ${C.fmtDM(d)}`);
    for (const s of C.STORES) {
      const ids = data.assignments[d]?.[s.id] || [];
      const part = (cat) => ids.filter((id) => D.emp(id)?.categoria === cat).map((id) => cap(short(D.emp(id).nome))).join(', ') || '-';
      lines.push(`${s.nome}: Atendimento: ${part('atendimento')} | Manipulação: ${part('manipulacao')}`);
    }
  }
  return lines.join('\n');
}

async function suggest() {
  const has = Object.values(data.assignments || {}).some((d) => Object.values(d).some((a) => a.length));
  if (has && !(await confirmBox('Já existe escala neste mês. Sugerir novamente substitui tudo o que está lançado. Continuar?', { okLabel: 'Substituir' }))) return;
  const history = await D.sundayHistory(mk);
  const { assignments, shortages } = C.suggestSchedule({ sundays: C.sundaysOf(mk), employees: S.employees, required: S.config.required, unavailable: awayReason, history });
  await D.saveSundays(mk, assignments);
  render(root, mk);
  if (shortages.length) toast(`Escala sugerida, mas faltam pessoas em ${shortages.length} posição(ões) — veja os alertas em vermelho. Você pode cobrir com alguém de outra loja (botão Editar).`, 'err', 9000);
  else toast('Escala sugerida com rodízio equilibrado. Ajuste o que precisar em “Editar”.');
}

function openReq() {
  const req = S.config.required;
  openModal({
    title: 'Quantidade de pessoas por domingo',
    body: `<table class="mini"><thead><tr><th>Loja</th><th>Atendimento</th><th>Manipulação</th></tr></thead><tbody>${C.STORES.map((s) => `<tr><td>${esc(s.nome)}</td>${CATS.map((c) => `<td><input class="in" type="number" min="0" max="20" data-s="${s.id}" data-c="${c}" value="${req[s.id]?.[c] ?? 0}" style="width:70px"></td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="muted">Vale para todos os meses. A escala sugerida e os alertas usam esses números.</p>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      const r = {}; for (const s of C.STORES) r[s.id] = {};
      m.$$('input').forEach((i) => { r[i.dataset.s][i.dataset.c] = Math.max(0, Math.floor(+i.value || 0)); });
      await D.saveConfig({ required: r }); render(root, mk);
    } }],
  });
}

function openEdit(d, storeId) {
  const st = C.storeById(storeId);
  const cur = new Set(data.assignments[d]?.[storeId] || []);
  const elsewhere = {};
  for (const [sid, ids] of Object.entries(data.assignments[d] || {})) if (sid !== storeId) for (const id of ids) elsewhere[id] = C.storeById(sid).nome;
  const list = (cat, home) => S.employees.filter((e) => e.ativo !== false && e.categoria === cat && (home ? e.loja === storeId : e.loja !== storeId));
  const item = (e) => { const why = awayReason(e.id, d) || (elsewhere[e.id] ? `escalado em ${elsewhere[e.id]}` : ''); return `<label class="${why ? 'dis' : ''}"><input type="checkbox" value="${esc(e.id)}" ${cur.has(e.id) ? 'checked' : ''} ${why && !cur.has(e.id) ? 'disabled' : ''}> ${esc(e.nome)} ${why ? `<small class="lack">(${esc(why)})</small>` : ''}${e.loja !== storeId ? `<small> · ${esc(C.storeById(e.loja)?.nome)}</small>` : ''}</label>`; };
  openModal({
    title: `${st.nome} — domingo ${C.fmtDM(d)}`, wide: true,
    body: `<div class="grid2 top">${CATS.map((cat) => `<div><h4>${C.CATEGORIAS[cat]} <small>(precisa de ${S.config.required[storeId]?.[cat] ?? 0})</small></h4><div class="checklist">${list(cat, true).map(item).join('') || '<p class="muted">Ninguém cadastrado.</p>'}</div>
      <details><summary>Cobertura de outras lojas</summary><div class="checklist">${list(cat, false).map(item).join('')}</div></details></div>`).join('')}</div>
      <p class="muted">Pessoas com falta, atestado, licença ou já escaladas em outra loja no mesmo domingo aparecem bloqueadas.</p>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      const next = { ...data.assignments, [d]: { ...(data.assignments[d] || {}), [storeId]: m.$$('input:checked').map((i) => i.value) } };
      await D.saveSundays(mk, next); render(root, mk);
    } }],
  });
}
