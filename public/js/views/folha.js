import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, $$, toast, openModal, confirmBox, copyRich } from '../ui.js';

export const COLS = [
  // entrada, admissao, funcao e salario ficam so no cadastro (aba Funcionarios)
  { k: 'cod', label: 'Cód', fixed: true, mailOnly: true }, { k: 'loja', label: 'Loja', mailOnly: true }, { k: 'nome', label: 'Funcionário', fixed: true },
  // salario: so leitura, vem do cadastro (Funcionarios); telaOnly = nao vai no e-mail da contabilidade
  { k: 'salario', label: 'Salário', money: true, telaOnly: true },
  { k: 'consumo', label: 'Consumo loja', money: true },
  { k: 'falta', label: 'Falta' }, { k: 'atestado', label: 'Atestado' },
  { k: 'horaExtra', label: 'Hora Extra 50%', money: true }, { k: 'feriado', label: 'Feriado', money: true },
  { k: 'assiduidade', label: 'Assiduidade', money: true, rec: true }, { k: 'adiantamento', label: 'Adiantamento', money: true, rec: true },
  { k: 'vale', label: 'Vale', money: true },
  { k: 'premio', label: 'Prêmio', money: true, rec: true }, { k: 'descAdic', label: 'Descontos Adicionais', money: true },
  // so aparecem na tabela da loja que tem motoboy (e so na linha dele)
  { k: 'periculosidade', label: 'Periculosidade', money: true, soMoto: true }, { k: 'aluguelMoto', label: 'Aluguel moto', money: true, rec: true, soMoto: true },
  { k: 'passagem', label: 'Passagem' }, { k: 'dias', label: 'Dias' },
  // valor liquido recebido no mes (digitado; se vazio usa o do contracheque importado)
  { k: 'liquido', label: 'Líquido', money: true, telaOnly: true },
  { k: 'obs', label: 'Observação', fixed: true },
];

let mk = null;
let root = null;

const hidden = () => new Set(D.monthDoc(mk)?.hiddenCols || []);
const closed = () => D.monthClosed(mk);
const visibleCols = (forMail = false) => COLS.filter((c) => (forMail ? !c.telaOnly : !c.mailOnly) && !hidden().has(c.k));
const salarioDe = (emp, e) => C.num(emp.salarioBase) || C.num(e.salario);
/** Liquido do mes: o digitado na folha; se vazio, o do contracheque importado. */
const liquidoDe = (emp, e) => (e.liquido != null && e.liquido !== '' ? C.num(e.liquido) : C.num(D.payslipOf(mk, emp.id)?.liquido));
// colunas que somam no total da loja e no total geral
const SOMA = ['salario', 'consumo', 'horaExtra', 'feriado', 'assiduidade', 'adiantamento', 'vale', 'premio', 'descAdic', 'periculosidade', 'aluguelMoto', 'passagem', 'liquido'];
function valorNum(k, { entry: e, emp }) {
  const v = C.rowView(e, S.leaves, mk, S.config.vt);
  switch (k) {
    case 'salario': return salarioDe(emp, e);
    case 'assiduidade': return C.num(v.assiduidade);
    case 'passagem': return C.num(v.passagem);
    case 'periculosidade': return C.periculosidade(emp, e);
    case 'liquido': return liquidoDe(emp, e);
    default: return C.num(e[k]);
  }
}
const somaRows = (k, rows) => C.round2(rows.reduce((a, r) => a + valorNum(k, r), 0));
/** Colunas de uma loja: as de motoboy so entram se a loja tem motoboy no mes. */
const colsDoGrupo = (cols, rows) => (rows.some((r) => C.ehMotoboy(r.emp)) ? cols : cols.filter((c) => !c.soMoto));

// valor textual de uma celula (usado no e-mail e na conferencia de colunas vazias)
function cellValue(col, { entry: e, emp }) {
  const v = C.rowView(e, S.leaves, mk, S.config.vt);
  switch (col.k) {
    case 'cod': return C.storeById(emp.loja)?.cod || '';
    case 'loja': return C.storeById(emp.loja)?.nome || '';
    case 'nome': return emp.nome;
    case 'obs': return e.obs || '';
    case 'falta': return v.faltas;
    case 'atestado': return v.atestado;
    case 'assiduidade': return C.money(v.assiduidade);
    case 'passagem': return C.money(v.passagem);
    case 'dias': return e.dias ? String(e.dias) : '';
    case 'descAdic': return C.money(e.descAdic);
    case 'vale': return C.valeTexto(e);
    case 'periculosidade': return C.money(C.periculosidade(emp, e));
    case 'salario': return C.money(salarioDe(emp, e));
    case 'liquido': return C.money(liquidoDe(emp, e));
    case 'aluguelMoto': return C.ehMotoboy(emp) ? C.money(e.aluguelMoto) : '';
    default: return col.money ? C.money(e[col.k]) : '';
  }
}
const isEmptyCol = (col, rows) => rows.every((r) => !cellValue(col, r));

// ---------- e-mail para a contabilidade ----------
export function buildEmail() {
  const all = D.rowsByStore(mk).flatMap((g) => g.rows);
  const colsAll = visibleCols(true).filter((c) => c.k !== 'obs' || all.some((r) => r.entry.obs));
  const md = D.monthDoc(mk) || {};
  const groups = D.rowsByStore(mk).filter((g) => g.rows.length);
  const th = 'border:1px solid #9aa0a6;background:#e8eaed;padding:4px 6px;font:bold 12px Arial,sans-serif;text-align:center;white-space:nowrap';
  const td = (right) => `border:1px solid #c4c7ca;padding:3px 6px;font:12px Arial,sans-serif;${right ? 'text-align:right;' : ''}white-space:nowrap`;
  let html = `<div style="font-family:Arial,sans-serif"><p style="font:bold 15px Arial,sans-serif;margin:0 0 6px">REI DO GADO - ${esc(C.monthLabel(mk).toUpperCase())}</p>`;
  let text = `REI DO GADO - ${C.monthLabel(mk).toUpperCase()}\n`;
  for (const g of groups) {
    const cols = colsDoGrupo(colsAll, g.rows);
    const head = cols.map((c) => (c.k === 'consumo' && md.consumoPeriodo ? `Consumo loja ${md.consumoPeriodo}` : c.label));
    html += `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 14px"><tr><td colspan="${cols.length}" style="${th};text-align:left;background:#f1f3f4">${esc(g.store.nome.toUpperCase())} - CNPJ ${esc(g.store.cnpj)}</td></tr><tr>${head.map((h) => `<th style="${th}">${esc(h)}</th>`).join('')}</tr>`;
    text += `\n${g.store.nome.toUpperCase()} - CNPJ ${g.store.cnpj}\n${head.join('\t')}\n`;
    for (const r of g.rows) {
      const vals = cols.map((c) => cellValue(c, r));
      html += `<tr>${vals.map((v, i) => `<td style="${td(cols[i].money || ['dias', 'passagem'].includes(cols[i].k))}">${esc(v)}</td>`).join('')}</tr>`;
      text += vals.join('\t') + '\n';
    }
    html += '</table>';
  }
  const notes = [md.note].filter(Boolean);
  if (notes.length) { html += `<p style="font:12px Arial,sans-serif">Obs.: ${esc(notes.join(' | '))}</p>`; text += `\nObs.: ${notes.join(' | ')}\n`; }
  html += '</div>';
  return { html, text, subject: S.config.emailAssunto.replace('{mes}', C.monthLabel(mk)) };
}

// ---------- conferencia ----------
function warnings() {
  const out = [];
  for (const g of D.rowsByStore(mk)) for (const r of g.rows) {
    const { entry: e, emp } = r;
    const away = C.leavesOf(S.leaves, emp.id, mk).length > 0 || e.faltaTxt || e.atestadoTxt;
    if (!e.dias && !away && emp.categoria !== 'nenhum') out.push(`${emp.nome}: dias de passagem em branco.`);
    for (const l of C.leavesOf(S.leaves, emp.id, mk, ['atestado', 'licenca', 'inss'])) if (!l.start) out.push(`${emp.nome}: afastamento sem data de início.`);
  }
  return out;
}

// ---------- renderizacao ----------
export function render(el, month) {
  root = el; mk = month;
  const md = D.monthDoc(mk);
  if (!md) { renderNoMonth(); return; }
  const isClosed = closed();
  // funcionario novo cadastrado na aba Funcionarios entra sozinho nos meses abertos (pela loja do registro)
  if (!isClosed && !root.__adding) {
    const novos = S.employees.filter((e) => C.activeInMonth(e, mk) && !D.entryFor(mk, e.id));
    if (novos.length) {
      root.__adding = true;
      D.ensureMonthEntries(mk).then((n) => { root.__adding = false; if (n) toast(`${novos.map((e) => e.nome.split(' ')[0]).join(', ')} incluído(s) na folha de ${C.monthLabel(mk)}.`); render(root, mk); }).catch((e) => { root.__adding = false; toast(e.message, 'err'); });
      root.innerHTML = '<p class="muted">Incluindo funcionários novos…</p>';
      return;
    }
  }
  // contracheques do mes (liquido importado) — carrega uma vez e redesenha
  if (!S.payslips.has(mk) && !root.__psLoading) { root.__psLoading = true; D.loadPayslips(mk).then(() => { root.__psLoading = false; if (mk === month) render(root, mk); }).catch(() => { root.__psLoading = false; S.payslips.set(mk, new Map()); }); }
  const vcolsAll = visibleCols();
  const groups = D.rowsByStore(mk);
  const allRows = groups.flatMap((g) => g.rows);
  const excluded = D.entriesOf(mk).filter((e) => e.excluded);
  const missing = S.employees.filter((e) => C.activeInMonth(e, mk) && !D.entryFor(mk, e.id));
  const hiddenList = COLS.filter((c) => hidden().has(c.k));
  const warns = warnings();

  root.innerHTML = `
  <div class="toolbar">
    <span class="badge ${isClosed ? 'closed' : 'open'}">${isClosed ? '🔒 Mês fechado' : '✏️ Em preenchimento'}</span>
    <label class="inline">Período do consumo <input class="in" id="consumoPeriodo" style="width:150px" value="${esc(md.consumoPeriodo || '')}" placeholder="ex.: 29/08 a 30/09" ${isClosed ? 'disabled' : ''}></label>
    <span class="spacer"></span>
    ${isClosed ? '' : '<button class="btn" data-act="repeatdias" title="Preenche os dias de passagem em branco com os do mês anterior">Repetir dias do mês anterior</button>'}
    <button class="btn" data-act="autohide" ${isClosed ? 'disabled' : ''} title="Oculta as colunas sem nenhuma informação neste mês">Ocultar colunas vazias</button>
    <button class="btn primary" data-act="send">📧 Enviar à contabilidade</button>
    ${isClosed
      ? '<button class="btn reopen" data-act="reopen" title="Libera o mês para correções. Depois é só fechar novamente.">🔓 Reabrir mês para editar</button>'
      : '<button class="btn" data-act="closemonth" title="Trava a edição do mês. Pode ser reaberto quando precisar.">🔒 Fechar mês</button>'}
  </div>
  ${isClosed ? `<div class="closed-box">🔒 <b>${esc(C.monthLabel(mk))} está fechado</b> — os valores estão travados. Precisa corrigir alguma coisa? Clique em <b>Reabrir mês para editar</b>, faça a correção e depois clique em <b>Fechar mês</b> de novo. Pode reabrir e fechar quantas vezes precisar.</div>` : ''}
  ${!isClosed && md.reopenedAt ? `<div class="reopen-box">🔓 Mês <b>reaberto para correção</b>. Quando terminar, clique em <b>Fechar mês</b>${md.sentAt ? ' (e reenvie a tabela à contabilidade, se os valores mudaram)' : ''}.</div>` : ''}
  ${warns.length ? `<details class="warn-box"><summary>⚠ ${warns.length} ponto(s) para conferir antes de enviar</summary><ul>${warns.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
  <div class="chips-row">
    ${hiddenList.length ? `<span class="muted">Colunas excluídas:</span> ${hiddenList.map((c) => `<button class="chip" data-act="showcol" data-col="${c.k}" title="Restaurar coluna">${esc(c.label)} ↩</button>`).join('')}` : ''}
    ${excluded.length ? `<span class="muted">Linhas excluídas:</span> ${excluded.map((e) => `<button class="chip" data-act="restorerow" data-emp="${esc(e.empId)}" title="Restaurar linha">${esc(D.emp(e.empId)?.nome.split(' ').slice(0, 2).join(' '))} ↩</button>`).join('')}` : ''}
    ${!isClosed && missing.length ? `<button class="chip add" data-act="addrow">＋ Incluir funcionário no mês (${missing.length})</button>` : ''}
  </div>
  ${groups.map((g) => { const vcols = colsDoGrupo(vcolsAll, g.rows); return `<section class="store"><h2>${esc(g.store.nome)} <small>cód ${g.store.cod} · ${g.rows.length} funcionário(s)</small></h2>
    <div class="table-wrap folha"><table class="grid"><thead><tr>${vcols.map((c) => `<th data-col="${c.k}">${esc(c.label)}${c.fixed || isClosed ? '' : ` <button class="th-x" data-act="hidecol" data-col="${c.k}" title="Excluir esta coluna do mês" aria-label="Excluir coluna ${esc(c.label)}">×</button>`}</th>`).join('')}<th class="act"></th></tr></thead>
    <tbody>${g.rows.map((r) => rowHtml(r, vcols, isClosed)).join('') || `<tr><td colspan="${vcols.length + 1}" class="muted">Nenhum funcionário nesta loja no mês.</td></tr>`}</tbody>${g.rows.length ? `<tfoot><tr class="tot">${vcols.map((c) => (c.k === 'nome' ? '<th class="c-nome">Total da loja</th>' : SOMA.includes(c.k) ? `<th class="num" data-tot="${g.store.id}|${c.k}">${C.money(somaRows(c.k, g.rows))}</th>` : '<th></th>')).join('')}<th></th></tr></tfoot>` : ''}</table></div></section>${g.store.id === 'coronel' ? notaFacilHtml(md, isClosed) : ''}`; }).join('')}
  ${groups.some((g) => g.store.id === 'coronel') ? '' : notaFacilHtml(md, isClosed)}
  ${allRows.length ? totalGeralHtml(groups) : ''}
  ${md.note !== undefined ? `<label class="block">Observações do mês (vai no rodapé do e-mail)<textarea class="in" id="monthNote" rows="2" ${isClosed ? 'disabled' : ''}>${esc(md.note || '')}</textarea></label>` : ''}
  ${allRows.length ? '' : '<p class="muted">Nenhum lançamento neste mês.</p>'}`;
  wire();
}

// ---------- total geral de todas as lojas ----------
const TOTAL_GERAL = [['salario', 'Salários'], ['assiduidade', 'Assiduidade'], ['premio', 'Prêmio'], ['vale', 'Vale'], ['adiantamento', 'Adiantamento'], ['passagem', 'Passagem'], ['liquido', 'Líquido']];
function totalGeralHtml(groups) {
  const lojas = groups.filter((g) => g.rows.length);
  const all = lojas.flatMap((g) => g.rows);
  return `<section class="store tg"><h2>Total geral <small>todas as lojas · ${all.length} funcionário(s)</small></h2>
    <div class="table-wrap tg-wrap"><table class="grid tg-tab"><thead><tr><th></th>${TOTAL_GERAL.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
    ${lojas.map((g) => `<tr><td class="c-nome">${esc(g.store.nome)}</td>${TOTAL_GERAL.map(([k]) => `<td class="num" data-tgl="${g.store.id}|${k}">${C.money(somaRows(k, g.rows)) || '—'}</td>`).join('')}</tr>`).join('')}
    </tbody><tfoot><tr><th class="c-nome">Total</th>${TOTAL_GERAL.map(([k]) => `<th class="num" data-tg="${k}">${C.money(somaRows(k, all)) || '—'}</th>`).join('')}</tr></tfoot></table></div></section>`;
}
/** Atualiza os totais (da loja e geral) depois de editar um valor, sem redesenhar a tela. */
function patchTotais() {
  const groups = D.rowsByStore(mk);
  for (const g of groups) for (const k of SOMA) {
    const c = $(`[data-tot="${g.store.id}|${k}"]`, root); if (c) c.textContent = C.money(somaRows(k, g.rows));
    const l = $(`[data-tgl="${g.store.id}|${k}"]`, root); if (l) l.textContent = C.money(somaRows(k, g.rows)) || '—';
  }
  const all = groups.flatMap((g) => g.rows);
  for (const [k] of TOTAL_GERAL) { const c = $(`[data-tg="${k}"]`, root); if (c) c.textContent = C.money(somaRows(k, all)) || '—'; }
}

// ---------- Consumo Nota Facil (controle interno; nao vai no e-mail da contabilidade) ----------
function notaFacilHtml(md, isClosed) {
  const nf = C.notaFacil(S.config.notaFacil, md.notaFacil);
  if (!nf.linhas.length) return '';
  const dis = isClosed ? 'disabled' : '';
  return `<section class="store nf"><h2>Consumo Nota Fácil <small>${esc(C.money(nf.limite))} por pessoa</small>${isClosed ? '' : ' <button class="btn sm" data-act="nfcfg" title="Pessoas e valor disponível">✏️</button>'}</h2>
    <div class="table-wrap nf-wrap"><table class="grid nf-tab"><thead><tr><th>Nome</th><th>Consumo</th><th>Disponível</th><th>Devido no mês</th></tr></thead><tbody>
    ${nf.linhas.map((l) => `<tr data-nf="${esc(l.id)}"><td class="c-nome">${esc(l.nome)}</td><td class="num"><input class="in money" inputmode="decimal" data-nf="${esc(l.id)}" value="${C.money(l.consumo)}" ${dis}></td><td class="num">${C.money(l.limite)}</td><td class="num nf-dev ${l.devido ? 'deve' : ''}" data-nfdev="${esc(l.id)}">${C.money(l.devido) || '—'}</td></tr>`).join('')}
    </tbody><tfoot><tr><th>Total</th><th class="num" data-nftot="consumo">${C.money(nf.total.consumo)}</th><th></th><th class="num" data-nftot="devido">${C.money(nf.total.devido) || '—'}</th></tr></tfoot></table></div></section>`;
}
async function salvarNotaFacil(id, valor) {
  const md = D.monthDoc(mk) || {};
  const atual = md.notaFacil || {};
  const valores = { ...(atual.valores || {}), [id]: C.round2(C.num(valor)) };
  await D.updateMonth(mk, { notaFacil: { ...atual, limite: atual.limite ?? S.config.notaFacil?.limite ?? 850, valores } });
  const nf = C.notaFacil(S.config.notaFacil, D.monthDoc(mk).notaFacil);
  for (const l of nf.linhas) { const c = $(`[data-nfdev="${CSS.escape(l.id)}"]`, root); if (c) { c.textContent = C.money(l.devido) || '—'; c.classList.toggle('deve', !!l.devido); } }
  const tc = $('[data-nftot=consumo]', root), td = $('[data-nftot=devido]', root);
  if (tc) tc.textContent = C.money(nf.total.consumo); if (td) td.textContent = C.money(nf.total.devido) || '—';
  return nf.linhas.find((l) => l.id === id);
}
function openNotaFacilCfg() {
  const md = D.monthDoc(mk) || {};
  const cfg = S.config.notaFacil || { limite: 850, pessoas: [] };
  let pessoas = cfg.pessoas.map((p) => ({ ...p }));
  const lim = md.notaFacil?.limite ?? cfg.limite;
  const lista = () => pessoas.map((p, i) => `<div class="row"><input class="in" data-pn="${i}" value="${esc(p.nome)}" placeholder="Nome"><button class="icon-btn" type="button" data-pdel="${i}" title="Remover">✕</button></div>`).join('');
  openModal({
    title: 'Consumo Nota Fácil',
    body: `<label>Valor disponível por pessoa (a partir de ${esc(C.monthLabel(mk))})<input class="in money" id="nf_lim" inputmode="decimal" value="${C.money(lim)}" style="width:140px"></label>
      <p class="muted small">Pessoas</p><div id="nf_p">${lista()}</div><button class="btn sm" type="button" id="nf_add">＋ pessoa</button>`,
    onMount: (m) => {
      const ler = () => { m.$$('[data-pn]').forEach((i) => { pessoas[+i.dataset.pn].nome = i.value.trim(); }); };
      m.$('#nf_add').onclick = () => { ler(); pessoas.push({ id: 'p' + Math.random().toString(36).slice(2, 8), nome: '' }); m.$('#nf_p').innerHTML = lista(); m.$$('[data-pn]').pop()?.focus(); };
      m.$('#nf_p').onclick = (ev) => { const b = ev.target.closest('[data-pdel]'); if (b) { ler(); pessoas.splice(+b.dataset.pdel, 1); m.$('#nf_p').innerHTML = lista(); } };
      m.el.__ler = ler;
    },
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      m.el.__ler(); pessoas = pessoas.filter((p) => p.nome);
      const limite = C.round2(C.num(m.$('#nf_lim').value));
      await D.saveConfig({ notaFacil: { limite, pessoas } });
      // o limite novo vale deste mes em diante (meses abertos seguintes tambem)
      for (const k of D.monthsKnown().filter((x) => x >= mk && !D.monthClosed(x))) { const d = D.monthDoc(k); if (d) await D.updateMonth(k, { notaFacil: { ...(d.notaFacil || {}), limite } }); }
      render(root, mk); toast('Consumo Nota Fácil atualizado.');
    } }],
  });
}

function renderNoMonth() {
  const prev = D.monthDoc(C.addMonths(mk, -1));
  root.innerHTML = `<div class="empty"><h2>${esc(C.monthLabel(mk))} ainda não foi criado</h2>
    <p>${prev ? 'Ao criar, o mês já vem preenchido com <b>salário, prêmio, adiantamento e assiduidade</b> do mês anterior. Vales, faltas, atestados, consumo e dias de passagem começam em branco.' : 'O mês anterior ainda não existe. Crie os meses em ordem para herdar os valores.'}</p>
    <button class="btn primary" data-act="createmonth">Criar ${esc(C.monthLabel(mk))}</button></div>`;
  $('[data-act=createmonth]', root).onclick = async () => {
    try { await D.createMonth(mk); render(root, mk); toast(`${C.monthLabel(mk)} criado.`); } catch (e) { toast(e.message, 'err'); }
  };
}

function rowHtml(r, vcols, isClosed) {
  const { entry: e, emp } = r;
  const v = C.rowView(e, S.leaves, mk, S.config.vt);
  const dis = isClosed ? 'disabled' : '';
  const cell = (c) => {
    switch (c.k) {
      case 'cod': return `<td class="c-cod">${C.storeById(emp.loja)?.cod || ''}</td>`;
      case 'nome': return `<td class="c-nome" title="${esc(emp.nome)}">${esc(emp.nome)}</td>`;
      case 'obs': return `<td class="c-obs"><input class="in obs" data-f="obs" data-emp="${esc(emp.id)}" value="${esc(e.obs || (e.descAdicNota && !/^[\d.,\s]+$/.test(e.descAdicNota) ? e.descAdicNota : ''))}" placeholder="observação" ${dis}></td>`;
      case 'falta': {
        const nf = C.leavesOf(S.leaves, emp.id, mk, ['falta']).flatMap((l) => C.leaveDaysInMonth(l, mk)).length;
        const curto = v.faltas && v.faltas.length > 16 ? `${nf} falta${nf > 1 ? 's' : ''}` : v.faltas; // muitas datas: mostra so a quantidade (as datas ficam no balao e no e-mail)
        return `<td><button class="leave-btn ${v.faltas ? 'has' : ''}" data-act="leave" data-kind="falta" data-emp="${esc(emp.id)}" data-cell="falta" title="${esc(v.faltas || '')}">${esc(curto) || '＋'}</button></td>`;
      }
      case 'atestado': return `<td><button class="leave-btn ${v.atestado ? 'has' : ''}" data-act="leave" data-kind="atestado" data-emp="${esc(emp.id)}" data-cell="atestado" title="${esc(v.atestado || '')}">${esc(v.atestado) || '＋'}</button></td>`;
      case 'assiduidade': {
        const lost = v.assiduidade === 0 && C.num(e.assiduidade) > 0 && !e.assiduidadeManual;
        return `<td class="num"><input class="in money" inputmode="decimal" data-f="assiduidade" data-emp="${esc(emp.id)}" value="${C.money(v.assiduidade)}" ${dis} title="${lost ? 'Perdida por falta/atestado no mês (base: ' + C.money(e.assiduidade) + '). Digite um valor para ajustar só este mês.' : ''}">${lost ? '<span class="lost" title="Perdida por falta/atestado">↓</span>' : ''}</td>`;
      }
      case 'passagem': return `<td class="num" data-cell="passagem">${C.money(v.passagem)}</td>`;
      case 'dias': return `<td class="num"><input class="in dias" inputmode="numeric" data-f="dias" data-emp="${esc(emp.id)}" value="${e.dias || ''}" ${dis}></td>`;
      case 'vale': return `<td class="num">${valeBtn(e, emp)}</td>`;
      case 'salario': return `<td class="num" title="Altere o salário na aba Funcionários">${C.money(salarioDe(emp, e))}</td>`;
      case 'liquido': { const ps = D.payslipOf(mk, emp.id); const dig = e.liquido != null && e.liquido !== '';
        return `<td class="num"><input class="in money ${!dig && ps?.liquido != null ? 'auto' : ''}" inputmode="decimal" data-f="liquido" data-emp="${esc(emp.id)}" value="${C.money(liquidoDe(emp, e))}" ${dis} title="${!dig && ps?.liquido != null ? 'Valor do contracheque importado — digite para trocar' : 'Valor líquido recebido no mês'}"></td>`; }
      case 'periculosidade': { const p = C.periculosidade(emp, e); return `<td class="num" title="${p ? `${emp.periculosidadePct ?? 30}% de ${esc(C.money(C.num(emp.salarioBase) || C.num(e.salario)))}` : ''}">${C.money(p)}</td>`; }
      case 'aluguelMoto': return C.ehMotoboy(emp) ? `<td class="num"><input class="in money" inputmode="decimal" data-f="aluguelMoto" data-emp="${esc(emp.id)}" value="${C.money(e.aluguelMoto)}" ${dis}></td>` : '<td class="na"></td>';
      case 'descAdic': return `<td class="num"><input class="in money" inputmode="decimal" data-f="descAdic" data-emp="${esc(emp.id)}" value="${C.money(e.descAdic)}" ${dis}></td>`;
      default: return `<td class="num"><input class="in money" inputmode="decimal" data-f="${c.k}" data-emp="${esc(emp.id)}" value="${C.money(e[c.k])}" ${dis}></td>`;
    }
  };
  return `<tr data-row="${esc(emp.id)}">${vcols.map(cell).join('')}<td class="act">${isClosed ? '' : `<button class="row-x" data-act="exclrow" data-emp="${esc(emp.id)}" title="Excluir esta linha do mês" aria-label="Excluir linha de ${esc(emp.nome)}">✕</button>`}</td></tr>`;
}

function valeBtn(e, emp) {
  const vs = C.normVales(e.vales), tot = C.money(e.vale);
  const tip = vs.length ? 'Vales: ' + vs.map((v) => `${C.fmtDMY(v.data)} ${C.money(v.valor)}`).join('; ') : 'Lançar vale (dia e valor)';
  return `<button class="leave-btn vale-btn ${tot ? 'has' : ''}" data-act="vale" data-emp="${esc(emp.id)}" title="${esc(tip)}">${tot ? `${tot}${vs.length > 1 ? ` <small>(${vs.length})</small>` : ''}` : '＋'}</button>`;
}

function patchRow(empId) {
  const tr = $(`tr[data-row="${CSS.escape(empId)}"]`, root);
  if (!tr) return;
  const e = D.entryFor(mk, empId);
  const v = C.rowView(e, S.leaves, mk, S.config.vt);
  const p = $('[data-cell=passagem]', tr); if (p) p.textContent = C.money(v.passagem);
  const a = $('[data-f=assiduidade]', tr); if (a && document.activeElement !== a) a.value = C.money(v.assiduidade);
}

let wired = false;
function wire() {
  if (root.__wired) return; root.__wired = true;
  root.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (t.id === 'consumoPeriodo') { await D.updateMonth(mk, { consumoPeriodo: t.value.trim() }); render(root, mk); return; }
    if (t.id === 'monthNote') { await D.updateMonth(mk, { note: t.value.trim() }); return; }
    if (t.dataset.nf) { try { const l = await salvarNotaFacil(t.dataset.nf, t.value); t.value = C.money(l?.consumo); } catch (e) { toast(e.message, 'err'); } return; }
    const f = t.dataset.f; if (!f) return;
    const empId = t.dataset.emp;
    try {
      const months = await D.setEntryField(mk, empId, f, t.value);
      const e = D.entryFor(mk, empId);
      if (f === 'dias') t.value = e.dias || '';
      else if (f === 'liquido') { t.value = C.money(liquidoDe(D.emp(empId), e)); t.classList.toggle('auto', e.liquido == null && D.payslipOf(mk, empId)?.liquido != null); }
      else if (f !== 'descAdicNota' && f !== 'obs') t.value = C.money(f === 'assiduidade' ? C.rowView(e, S.leaves, mk, S.config.vt).assiduidade : e[f]);
      patchRow(empId); patchTotais();
      if (months.length) toast(`${COLS.find((c) => c.k === f).label} de ${D.emp(empId).nome.split(' ')[0]} também atualizado em: ${months.map((m) => C.monthLabel(m)).join(', ')}.`, 'ok', 6000);
    } catch (e) { toast(e.message, 'err'); render(root, mk); }
  });
  root.addEventListener('focusin', (ev) => { if (ev.target.classList?.contains('in') && ev.target.select) ev.target.select(); });
  root.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, empId = b.dataset.emp;
    try {
      if (act === 'hidecol') {
        const col = COLS.find((c) => c.k === b.dataset.col);
        const has = D.rowsByStore(mk).flatMap((g) => g.rows).filter((r) => cellValue(col, r));
        if (has.length && !(await confirmBox(`A coluna "${col.label}" tem informação em ${has.length} funcionário(s). Excluir do mês mesmo assim? Os valores continuam salvos, mas a coluna sai da tela e do e-mail.`, { okLabel: 'Excluir coluna' }))) return;
        await D.setHiddenCols(mk, [...hidden(), col.k]); render(root, mk);
      } else if (act === 'showcol') { await D.setHiddenCols(mk, [...hidden()].filter((k) => k !== b.dataset.col)); render(root, mk); }
      else if (act === 'exclrow') {
        const r = { entry: D.entryFor(mk, empId), emp: D.emp(empId) };
        const has = COLS.filter((c) => !c.fixed && c.k !== 'loja' && cellValue(c, r)).length + (r.entry.obs ? 1 : 0);
        if (has && !(await confirmBox(`${r.emp.nome} tem informações lançadas neste mês. Excluir a linha mesmo assim? Você pode restaurar depois.`, { okLabel: 'Excluir linha' }))) return;
        await D.setRowExcluded(mk, empId, true); render(root, mk);
      } else if (act === 'restorerow') { await D.setRowExcluded(mk, empId, false); render(root, mk); }
      else if (act === 'addrow') openAddRow();
      else if (act === 'leave') openLeave(empId, b.dataset.kind);
      else if (act === 'vale') openVales(empId);
      else if (act === 'repeatdias') { const n = await D.repeatDias(mk); render(root, mk); toast(n ? `Dias repetidos para ${n} funcionário(s).` : 'Nada a repetir.'); }
      else if (act === 'autohide') {
        const rows = D.rowsByStore(mk).flatMap((g) => g.rows);
        const empty = COLS.filter((c) => !c.fixed && !c.mailOnly && !hidden().has(c.k) && isEmptyCol(c, rows));
        if (!empty.length) return toast('Não há colunas vazias.');
        await D.setHiddenCols(mk, [...hidden(), ...empty.map((c) => c.k)]); render(root, mk); toast(`Colunas ocultadas: ${empty.map((c) => c.label).join(', ')}.`);
      } else if (act === 'send') openSend();
      else if (act === 'reopen') await reabrirMes();
      else if (act === 'nfcfg') openNotaFacilCfg();
      else if (act === 'closemonth') await fecharMes();
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ---------- fechar / reabrir o mes (pode alternar quantas vezes precisar) ----------
const statusChanged = () => { render(root, mk); window.dispatchEvent(new CustomEvent('rh:mes')); };
async function fecharMes() {
  if (!(await confirmBox(`Fechar ${C.monthLabel(mk)}?\n\nA edição fica travada. Se precisar corrigir algo depois, é só clicar em “Reabrir mês para editar”.`, { okLabel: 'Fechar mês', title: 'Fechar mês' }))) return false;
  await D.setMonthStatus(mk, 'closed'); statusChanged();
  toast('Mês fechado. Para corrigir algo, use “Reabrir mês para editar”.', 'ok', 6000);
  return true;
}
async function reabrirMes() {
  await D.setMonthStatus(mk, 'open'); statusChanged();
  toast(`${C.monthLabel(mk)} reaberto. Faça as correções e depois clique em “Fechar mês”.`, 'ok', 6000);
  return true;
}

function openAddRow() {
  const cand = S.employees.filter((e) => C.activeInMonth(e, mk) && !D.entryFor(mk, e.id));
  openModal({
    title: 'Incluir funcionário no mês',
    body: `<p class="muted">Funcionários ativos que ainda não têm lançamento em ${esc(C.monthLabel(mk))}.</p><div class="checklist">${cand.map((e) => `<label><input type="checkbox" value="${esc(e.id)}"> ${esc(e.nome)} <small>${esc(C.storeById(e.loja)?.nome || '')}</small></label>`).join('')}</div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Incluir', kind: 'primary', onClick: async (m) => { const ids = m.$$('input:checked').map((i) => i.value); for (const id of ids) await D.addEntryFor(mk, id); render(root, mk); } }],
  });
}

function openSend() {
  const mail = buildEmail();
  const isClosed = closed();
  const w = warnings();
  const m = openModal({
    title: `Enviar à contabilidade — ${C.monthLabel(mk)}`, wide: true,
    body: `${w.length ? `<div class="warn-box"><b>Atenção:</b> ${w.length} ponto(s) para conferir:<ul>${w.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <p class="muted">Assunto sugerido: <b>${esc(mail.subject)}</b></p><div class="preview">${mail.html}</div>
      <p class="muted">Clique em <b>Copiar tabela</b> e cole (Ctrl/⌘+V) no corpo do e-mail. Depois de enviar, marque o mês como enviado: ele fica travado para conferência. Se precisar corrigir algo, é só reabrir o mês (aqui ou no botão <b>Reabrir mês para editar</b> da tela) e fechar de novo.</p>`,
    actions: [
      { label: 'Copiar assunto', keepOpen: true, onClick: async () => { await navigator.clipboard?.writeText(mail.subject); toast('Assunto copiado.'); return false; } },
      { label: '📋 Copiar tabela', kind: 'primary', keepOpen: true, onClick: async () => { const ok = await copyRich(mail.html, mail.text); toast(ok ? 'Tabela copiada! Cole no e-mail.' : 'Não foi possível copiar automaticamente. Selecione a tabela e copie com Ctrl/⌘+C.', ok ? 'ok' : 'err'); return false; } },
      isClosed
        ? { label: '🔓 Reabrir mês para editar', kind: 'reopen', onClick: () => reabrirMes() }
        : { label: '✔ Marcar como enviado (fechar mês)', kind: 'success', onClick: () => fecharMes() },
      { label: 'Fechar' },
    ],
  });
}

// ---------- vales (dia + valor; pode ter varios no mes) ----------
function openVales(empId) {
  if (closed()) return toast('Mês fechado. Clique em “Reabrir mês para editar” para alterar.', 'err');
  const e = D.emp(empId), entry = D.entryFor(mk, empId);
  let vales = C.normVales(entry.vales);
  // vale antigo so com valor (sem dia): aparece para informar o dia
  const semDia = !vales.length && C.num(entry.vale) > 0 ? C.num(entry.vale) : 0;
  const hj = new Date(); const hoje = `${hj.getFullYear()}-${C.pad(hj.getMonth() + 1)}-${C.pad(hj.getDate())}`;
  const sugestao = hoje >= C.monthStart(mk) && hoje <= C.monthEnd(mk) ? hoje : C.monthStart(mk);
  openModal({
    title: `Vales — ${e.nome}`,
    body: `<p class="muted">Vales pegos por <b>${esc(e.nome)}</b> (folha de ${esc(C.monthLabel(mk))}). Informe o <b>dia</b> e o <b>valor</b> de cada vale — pode lançar vários.</p>
      ${semDia ? `<div class="warn-box">Já havia ${C.money(semDia)} de vale sem o dia. Lance de novo com a data (o valor antigo é substituído ao salvar).</div>` : ''}
      <div class="row" style="align-items:end;flex-wrap:wrap"><label>Dia<input type="date" class="in" id="vdata" value="${sugestao}"></label>
        <label>Valor<input class="in money" id="vvalor" inputmode="decimal" placeholder="R$ 0,00" style="width:120px"></label>
        <button class="btn" id="vadd" type="button">＋ Adicionar vale</button></div>
      <div id="vlist"></div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar vales', kind: 'primary', onClick: async () => {
      if (C.num(document.querySelector('#vvalor')?.value) > 0 && !(await confirmBox('Tem um valor digitado que não foi adicionado. Salvar sem ele?', { okLabel: 'Salvar sem ele' }))) return false;
      await D.setVales(mk, empId, vales); render(root, mk);
      toast(vales.length ? `Vales de ${e.nome.split(' ')[0]}: ${C.money(C.valeTotal(vales))}.` : `Vales de ${e.nome.split(' ')[0]} removidos.`);
    } }],
    onMount: (mm) => {
      const show = () => {
        vales = C.normVales(vales);
        mm.$('#vlist').innerHTML = vales.length
          ? `<table class="mini"><thead><tr><th>Dia</th><th class="num">Valor</th><th></th></tr></thead><tbody>${vales.map((v, i) => `<tr><td>${C.fmtDMY(v.data)}</td><td class="num">${C.money(v.valor)}</td><td><button class="btn sm danger" data-del="${i}" type="button" aria-label="Remover vale de ${C.fmtDMY(v.data)}">Remover</button></td></tr>`).join('')}</tbody>
             <tfoot><tr><th>Total</th><th class="num">${C.money(C.valeTotal(vales))}</th><th></th></tr></tfoot></table>`
          : '<p class="muted">Nenhum vale lançado.</p>';
      };
      const add = () => {
        const data = mm.$('#vdata').value, valor = C.round2(C.num(mm.$('#vvalor').value));
        if (!data) return toast('Informe o dia do vale.', 'err');
        if (!(valor > 0)) return toast('Informe o valor do vale.', 'err');
        vales.push({ data, valor }); mm.$('#vvalor').value = ''; mm.$('#vvalor').focus(); show();
      };
      mm.$('#vadd').onclick = add;
      mm.$('#vvalor').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
      mm.$('#vlist').onclick = (ev) => { const b = ev.target.closest('[data-del]'); if (b) { vales.splice(+b.dataset.del, 1); show(); } };
      show(); mm.$('#vvalor').focus();
    },
  });
}

// ---------- afastamentos (falta / atestado) ----------
function openLeave(empId, kind) {
  if (closed()) return toast('Mês fechado. Clique em “Reabrir mês para editar” para alterar.', 'err');
  const e = D.emp(empId);
  const entry = D.entryFor(mk, empId);
  const isFalta = kind === 'falta';
  const legacy = isFalta ? entry.faltaTxt : entry.atestadoTxt;
  let faltaDates = isFalta ? C.leavesOf(S.leaves, empId, mk, ['falta']).flatMap((l) => C.leaveDaysInMonth(l, mk)) : [];
  faltaDates = [...new Set(faltaDates)].sort();
  const existing = isFalta ? [] : C.leavesOf(S.leaves, empId, mk, ['atestado', 'licenca', 'inss']);
  const { y, m } = C.parseMonth(mk);
  const body = isFalta
    ? `<p>Datas de falta de <b>${esc(e.nome)}</b> em ${esc(C.monthLabel(mk))}. Pode informar uma ou várias datas.</p>
       <div class="row"><input type="date" class="in" id="fd" min="${C.monthStart(mk)}" max="${C.monthEnd(mk)}"><button class="btn" id="fadd" type="button">Adicionar data</button></div>
       <div id="fchips" class="chips-row"></div>${legacy ? `<p class="muted">Texto antigo da planilha: <b>${esc(legacy)}</b> <button class="btn sm" id="clearleg" type="button">Limpar texto</button></p>` : ''}`
    : `<p>Afastamentos de <b>${esc(e.nome)}</b>. Informe as datas — ou <b>a partir de quando</b>, se ainda não tem data de término.</p>
       <div id="exist"></div>
       <fieldset class="fs"><legend id="formtitle">Novo afastamento</legend>
        <div class="grid2">
         <label>Tipo<select class="in" id="ltype"><option value="atestado">Atestado</option><option value="licenca">Licença (ex.: maternidade)</option><option value="inss">Afastamento INSS</option></select></label>
         <label>Início<input type="date" class="in" id="lstart"></label>
        </div>
        <div class="radios"><label><input type="radio" name="lmode" value="fim" checked> Data de término <input type="date" class="in" id="lend"></label>
         <label><input type="radio" name="lmode" value="dias"> Quantidade de dias <input type="number" min="1" max="400" class="in" id="ldias" style="width:80px"></label>
         <label><input type="radio" name="lmode" value="aberto"> Em aberto (a partir de…)</label></div>
        <label>Observação<input class="in" id="lnote" placeholder="opcional"></label>
        <p class="muted" id="lprev"></p>
        <button class="btn primary" id="lsave" type="button">Salvar afastamento</button> <button class="btn" id="lcancel" type="button" hidden>Cancelar edição</button>
       </fieldset>${legacy ? `<p class="muted">Texto antigo da planilha: <b>${esc(legacy)}</b> <button class="btn sm" id="clearleg" type="button">Limpar texto</button></p>` : ''}`;
  let editing = null;
  const mod = openModal({
    title: isFalta ? 'Faltas' : 'Atestado / afastamento', body, wide: !isFalta,
    actions: isFalta ? [{ label: 'Cancelar' }, { label: 'Salvar faltas', kind: 'primary', onClick: async () => {
      // remove as datas deste mes dos documentos antigos e grava um documento unico do mes
      for (const l of C.leavesOf(S.leaves, empId, mk, ['falta'])) {
        const keep = l.dates.filter((d) => d < C.monthStart(mk) || d > C.monthEnd(mk));
        if (keep.length) await D.saveLeave({ ...l, dates: keep }); else await D.deleteLeave(l.id);
      }
      if (faltaDates.length) await D.saveLeave({ id: `f-${mk}-${empId}`, empId, type: 'falta', dates: faltaDates });
      render(root, mk);
    } }] : [{ label: 'Fechar' }],
    onMount: (mm) => {
      const refreshChips = () => { const c = mm.$('#fchips'); if (c) c.innerHTML = faltaDates.map((d) => `<button class="chip" data-d="${d}" type="button">${C.fmtDMY(d)} ✕</button>`).join('') || '<span class="muted">Nenhuma falta lançada.</span>'; };
      if (isFalta) {
        refreshChips();
        mm.$('#fadd').onclick = () => { const v = mm.$('#fd').value; if (v && !faltaDates.includes(v)) { faltaDates.push(v); faltaDates.sort(); refreshChips(); } mm.$('#fd').value = ''; };
        mm.$('#fchips').onclick = (ev) => { const b = ev.target.closest('[data-d]'); if (b) { faltaDates = faltaDates.filter((d) => d !== b.dataset.d); refreshChips(); } };
      } else {
        const showExisting = () => {
          const list = C.leavesOf(S.leaves, empId, mk, ['atestado', 'licenca', 'inss']);
          mm.$('#exist').innerHTML = list.length ? `<table class="mini"><thead><tr><th>Tipo</th><th>Período</th><th>Obs.</th><th></th></tr></thead><tbody>${list.map((l) => `<tr><td>${esc(C.LEAVE_LABEL[l.type])}</td><td>${l.start ? C.fmtDMY(l.start) : '<i>sem início</i>'} → ${l.end ? C.fmtDMY(l.end) + ` (${l.start ? C.daysFromRange(l.start, l.end) + ' dias' : ''})` : '<b>em aberto</b>'}</td><td>${esc(l.note || '')}</td><td><button class="btn sm" data-edit="${l.id}" type="button">Editar</button> <button class="btn sm danger" data-del="${l.id}" type="button">Excluir</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nenhum afastamento neste mês.</p>';
        };
        const mode = () => mm.$$('input[name=lmode]').find((r) => r.checked).value;
        const calc = () => {
          const s = mm.$('#lstart').value; if (!s) return { err: 'Informe a data de início.' };
          if (mode() === 'fim') { const en = mm.$('#lend').value; if (!en) return { err: 'Informe a data de término.' }; if (en < s) return { err: 'O término é anterior ao início.' }; return { start: s, end: en }; }
          if (mode() === 'dias') { const d = +mm.$('#ldias').value; if (!(d >= 1)) return { err: 'Informe a quantidade de dias.' }; return { start: s, end: C.endFromDays(s, d) }; }
          return { start: s, end: null };
        };
        const preview = () => { const r = calc(); mm.$('#lprev').textContent = r.err ? r.err : r.end ? `${C.LEAVE_LABEL[mm.$('#ltype').value]} de ${C.daysFromRange(r.start, r.end)} dia(s): ${C.fmtDMY(r.start)} a ${C.fmtDMY(r.end)}` : `${C.LEAVE_LABEL[mm.$('#ltype').value]} em aberto, a partir de ${C.fmtDMY(r.start)}`; };
        mm.el.addEventListener('input', preview); mm.el.addEventListener('change', preview);
        showExisting(); preview();
        const reset = () => { editing = null; mm.$('#formtitle').textContent = 'Novo afastamento'; mm.$('#lcancel').hidden = true; mm.$('#lstart').value = ''; mm.$('#lend').value = ''; mm.$('#ldias').value = ''; mm.$('#lnote').value = ''; preview(); };
        mm.$('#lcancel').onclick = reset;
        mm.$('#exist').onclick = async (ev) => {
          const ed = ev.target.closest('[data-edit]'), del = ev.target.closest('[data-del]');
          if (ed) { const l = S.leaves.find((x) => x.id === ed.dataset.edit); editing = l; mm.$('#formtitle').textContent = 'Editando afastamento'; mm.$('#lcancel').hidden = false; mm.$('#ltype').value = l.type; mm.$('#lstart').value = l.start || ''; mm.$('#lend').value = l.end || ''; mm.$('#lnote').value = l.note || ''; mm.$$('input[name=lmode]').forEach((r) => { r.checked = r.value === (l.end ? 'fim' : 'aberto'); }); preview(); }
          if (del && await confirmBox('Excluir este afastamento?', { danger: true, okLabel: 'Excluir' })) { await D.deleteLeave(del.dataset.del); showExisting(); render(root, mk); }
        };
        mm.$('#lsave').onclick = async () => {
          const r = calc(); if (r.err) return toast(r.err, 'err');
          await D.saveLeave({ ...(editing ? { id: editing.id } : {}), empId, type: mm.$('#ltype').value, start: r.start, end: r.end, note: mm.$('#lnote').value.trim() });
          reset(); showExisting(); render(root, mk); toast('Afastamento salvo.');
        };
      }
      const cl = mm.$('#clearleg');
      if (cl) cl.onclick = async () => { await D.setEntryField(mk, empId, isFalta ? 'faltaTxt' : 'atestadoTxt', ''); cl.parentElement.remove(); render(root, mk); };
    },
  });
}
