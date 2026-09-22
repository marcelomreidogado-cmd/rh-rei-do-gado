import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, $$, toast, openModal, confirmBox, copyImageDataUrl, downloadText } from '../ui.js';
import { periodoToMonth } from '../payslip.js';

let mk, root;
const firstName = (n) => { const t = String(n).trim().split(/\s+/)[0] || ''; return t.charAt(0) + t.slice(1).toLowerCase(); };
const msgFor = (e) => S.config.waTemplate.replace('{nome}', firstName(e.nome)).replace('{mes}', C.monthLabel(mk));

export async function render(el, month) {
  root = el; mk = month;
  root.innerHTML = '<p class="muted">Carregando…</p>';
  const map = await D.loadPayslips(mk);
  // funcionarios do mes = com lancamento ou com contracheque
  const ids = new Set([...D.entriesOf(mk).filter((e) => !e.excluded).map((e) => e.empId), ...map.keys()]);
  const groups = C.STORES.map((st) => ({ st, emps: S.employees.filter((e) => ids.has(e.id) && e.loja === st.id) }));
  let tot = { liquido: 0, inss: 0, fgts: 0 };
  const rowHtml = (e) => {
    const p = map.get(e.id);
    const ph = C.normalizePhone(e.telefone, S.config.dddPadrao);
    if (p) { tot.liquido += C.num(p.liquido); tot.inss += C.num(p.inss); tot.fgts += C.num(p.fgts); }
    const warn = p && p.issues && p.issues.length ? `<span class="badge warn" title="${esc(p.issues.join('; '))}">conferir</span>` : '';
    return `<tr data-emp="${esc(e.id)}">
      <td class="c-nome">${esc(e.nome)}</td>
      <td class="num">${p ? C.brl(p.liquido, false) : '<span class="muted">—</span>'}</td><td class="num">${p ? C.brl(p.inss, false) : ''}</td><td class="num">${p ? C.brl(p.fgts, false) : ''}</td>
      <td>${p ? `<span class="badge ${p.sent ? 'closed' : 'open'}">${p.sent ? '✔ enviado' : p.waOpenedAt ? 'aberto no WhatsApp' : 'pendente'}</span> ${warn}` : '<span class="muted">sem contracheque</span>'}</td>
      <td class="phone ${ph.ok ? '' : 'bad'}">${ph.ok ? esc(ph.display) : 'sem telefone'}</td>
      <td class="acts">
        <button class="btn sm" data-act="view" ${p ? '' : 'disabled'}>Ver</button>
        <button class="btn sm" data-act="edit">${p ? 'Editar' : 'Lançar'}</button>
        <button class="btn sm success" data-act="wa" ${p && ph.ok ? '' : 'disabled'} title="${ph.ok ? 'Copia a imagem e abre a conversa no WhatsApp Web' : 'Cadastre o telefone na aba Funcionários'}">WhatsApp</button>
        <button class="btn sm" data-act="sent" ${p ? '' : 'disabled'}>${p?.sent ? 'Desmarcar' : 'Marcar enviado'}</button>
      </td></tr>`;
  };
  const body = groups.filter((g) => g.emps.length).map((g) => `<section class="store"><h2>${esc(g.st.nome)}</h2><div class="table-wrap"><table class="grid"><thead><tr><th>Funcionário</th><th>Valor líquido</th><th>INSS</th><th>FGTS</th><th>Situação</th><th>WhatsApp</th><th></th></tr></thead><tbody>${g.emps.map(rowHtml).join('')}</tbody></table></div></section>`).join('');
  root.innerHTML = `<div class="toolbar"><strong>${esc(C.monthLabel(mk))}</strong><span class="muted">${map.size} contracheque(s) lançado(s)</span><span class="spacer"></span>
    <button class="btn" data-act="export" ${map.size ? '' : 'disabled'} title="Baixa CSV com líquido, INSS e FGTS">Exportar CSV</button>
    <button class="btn primary" data-act="import">📥 Importar contracheques (PDF)</button><input type="file" id="pf" accept="application/pdf,image/*" multiple hidden></div>
    ${map.size ? `<div class="totals"><div><small>Total líquido a pagar</small><b>R$ ${C.brl(tot.liquido, false)}</b></div><div><small>Total INSS</small><b>R$ ${C.brl(tot.inss, false)}</b></div><div><small>Total FGTS</small><b>R$ ${C.brl(tot.fgts, false)}</b></div></div>` : ''}
    ${body || '<p class="muted">Crie o mês na aba Folha ou importe os contracheques.</p>'}`;
  wire();
}

let wiredRoot = null;
function wire() {
  if (wiredRoot === root) return; wiredRoot = root;
  root.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, empId = b.closest('tr')?.dataset.emp;
    try {
      if (act === 'import') $('#pf', root).click();
      else if (act === 'view') openView(empId);
      else if (act === 'edit') openEdit(empId);
      else if (act === 'sent') { const p = D.payslipOf(mk, empId); await D.patchPayslip(mk, empId, { sent: !p.sent, sentAt: p.sent ? null : new Date().toISOString() }); render(root, mk); }
      else if (act === 'wa') await sendWhatsApp(empId);
      else if (act === 'export') exportCsv();
    } catch (e) { toast(e.message, 'err'); }
  });
  root.addEventListener('change', async (ev) => {
    if (ev.target.id !== 'pf' || !ev.target.files.length) return;
    const files = [...ev.target.files]; ev.target.value = '';
    await importFlow(files);
  });
}

async function sendWhatsApp(empId) {
  const e = D.emp(empId), ph = C.normalizePhone(e.telefone, S.config.dddPadrao);
  const img = await D.payslipImage(mk, empId);
  let copied = false;
  if (img) copied = await copyImageDataUrl(img);
  const url = `https://web.whatsapp.com/send?phone=${ph.wa}&text=${encodeURIComponent(msgFor(e))}`;
  window.open(url, '_blank', 'noopener');
  await D.patchPayslip(mk, empId, { waOpenedAt: new Date().toISOString() });
  await D.log('whatsapp_aberto', `${mk} ${e.nome}`);
  if (!img) toast('WhatsApp aberto. Este contracheque não tem imagem salva para colar.', 'err', 7000);
  else if (copied) toast('Imagem copiada. No WhatsApp, clique na conversa e cole (Ctrl/⌘+V) para enviar o contracheque.', 'ok', 9000);
  else { toast('Não consegui copiar a imagem automaticamente. Use “Ver” > “Baixar imagem” e anexe na conversa.', 'err', 9000); }
  render(root, mk);
}

function exportCsv() {
  const map = S.payslips.get(mk);
  const rows = [['Loja', 'Funcionario', 'Liquido', 'INSS', 'FGTS', 'Total vencimentos', 'Total descontos']];
  for (const st of C.STORES) for (const e of S.employees.filter((x) => x.loja === st.id)) { const p = map.get(e.id); if (p) rows.push([st.nome, e.nome, p.liquido, p.inss, p.fgts, p.totalVenc ?? '', p.totalDesc ?? ''].map((v) => String(v).replace('.', ',')).map((v) => (/[;"]/.test(v) ? `"${v}"` : v))); }
  downloadText(`contracheques-${mk}.csv`, '﻿' + rows.map((r) => r.join(';')).join('\n'), 'text/csv;charset=utf-8');
}

async function openView(empId) {
  const e = D.emp(empId), p = D.payslipOf(mk, empId);
  const img = await D.payslipImage(mk, empId);
  openModal({
    title: `Contracheque — ${e.nome}`, wide: true,
    body: `<div class="grid2 top">${img ? `<div><img class="slipimg" src="${img}" alt="Contracheque de ${esc(e.nome)}"></div>` : '<p class="muted">Sem imagem (lançamento manual).</p>'}
      <div><table class="mini"><tbody><tr><th>Valor líquido</th><td class="num"><b>R$ ${C.brl(p.liquido, false)}</b></td></tr><tr><th>INSS</th><td class="num">${C.brl(p.inss, false)}</td></tr><tr><th>FGTS do mês</th><td class="num">${C.brl(p.fgts, false)}</td></tr>
      <tr><th>Total vencimentos</th><td class="num">${C.brl(p.totalVenc, false)}</td></tr><tr><th>Total descontos</th><td class="num">${C.brl(p.totalDesc, false)}</td></tr>${p.emprestimos ? `<tr><th>Empréstimos (consignado)</th><td class="num">${C.brl(p.emprestimos, false)}</td></tr>` : ''}</tbody></table>
      ${p.itens?.length ? `<h4>Itens</h4><table class="mini"><tbody>${p.itens.map((i) => `<tr><td>${esc(i.cod)}</td><td>${esc(i.desc)}</td><td class="num ${i.tipo === 'desc' ? 'neg' : ''}">${i.tipo === 'desc' ? '−' : ''}${C.brl(i.valor, false)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${p.notas?.length ? `<h4>Observações do recibo</h4><ul class="small">${p.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${p.fixes?.length ? `<p class="muted">Correções automáticas: ${esc(p.fixes.join('; '))}</p>` : ''}${p.issues?.length ? `<p class="warn-box">Conferir: ${esc(p.issues.join('; '))}</p>` : ''}</div></div>`,
    actions: [
      ...(img ? [{ label: 'Baixar imagem', keepOpen: true, onClick: () => { const a = document.createElement('a'); a.href = img; a.download = `contracheque-${mk}-${empId}.jpg`; a.click(); return false; } }] : []),
      { label: 'Fechar' },
    ],
  });
}

function openEdit(empId) {
  const e = D.emp(empId), p = D.payslipOf(mk, empId) || {};
  openModal({
    title: `${p.liquido != null ? 'Editar' : 'Lançar'} contracheque — ${e.nome}`,
    body: `<div class="grid2"><label>Valor líquido (R$)<input class="in" id="pl" inputmode="decimal" value="${C.brl(p.liquido, false)}"></label><label>INSS (R$)<input class="in" id="pi" inputmode="decimal" value="${C.brl(p.inss, false)}"></label>
      <label>FGTS do mês (R$)<input class="in" id="pf2" inputmode="decimal" value="${C.brl(p.fgts, false)}"></label></div><p class="muted">Use para lançar à mão ou corrigir algo que a leitura automática errou.</p>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      const { id: _id, ...pRest } = p;
      await D.savePayslip(mk, empId, { ...pRest, liquido: C.num(m.$('#pl').value), inss: C.num(m.$('#pi').value), fgts: C.num(m.$('#pf2').value), fonte: p.fonte || 'manual', issues: [], editadoManual: true });
      render(root, mk);
    } }],
  });
}

// ---------- importacao ----------
async function importFlow(files) {
  const prog = openModal({ title: 'Lendo contracheques…', body: '<p id="pmsg">Preparando leitura (a primeira vez carrega o reconhecimento de texto, ~10 s)…</p><progress id="pbar" style="width:100%"></progress>', actions: [], closable: false });
  let slips;
  try {
    const { readPayslips } = await import('../pdfocr.js');
    slips = await readPayslips(files, (p) => { const m = prog.$('#pmsg'); if (m && p.file) m.textContent = `${p.stage === 'render' ? 'Abrindo' : 'Lendo'} ${p.file} — página ${p.page}/${p.pages}`; });
  } catch (e) { prog.close(); toast('Falha na leitura: ' + e.message, 'err', 9000); console.error(e); return; }
  prog.close();
  if (!slips.length) return toast('Não encontrei contracheques nesses arquivos.', 'err');
  reviewSlips(slips);
}

function reviewSlips(slips) {
  const rows = slips.map((s, i) => {
    const match = C.bestEmployeeMatch(s.nome, S.employees, s.storeId);
    const slipMonth = periodoToMonth(s.periodo);
    return { s, i, empId: match?.emp.id || '', month: slipMonth || mk, use: true };
  });
  const opt = (sel) => `<option value="">— escolher —</option>${S.employees.map((e) => `<option value="${esc(e.id)}" ${e.id === sel ? 'selected' : ''}>${esc(e.nome)} (${esc(C.storeById(e.loja)?.nome || '')})</option>`).join('')}`;
  const m = openModal({
    title: `Conferir ${slips.length} contracheque(s) lido(s)`, wide: true,
    body: `<p class="muted">Confira os valores com a imagem. O sistema já validou as somas (vencimentos − descontos = líquido); linhas com <span class="badge warn">conferir</span> tiveram divergência.</p>
    <div class="table-wrap"><table class="grid review"><thead><tr><th></th><th>Lido no recibo</th><th>Funcionário</th><th>Mês</th><th>Líquido</th><th>INSS</th><th>FGTS</th><th>Situação</th></tr></thead><tbody>
    ${rows.map(({ s, i, empId, month }) => `<tr data-i="${i}" class="${s.issues.length ? 'bad' : ''}"><td><input type="checkbox" class="use" checked></td>
      <td><img class="thumb" src="${s.img}" alt="" data-zoom="${i}"><div class="small">${esc(s.nome || '(nome não lido)')}<br><span class="muted">${esc(s.cargo || '')} · ${esc(C.storeById(s.storeId)?.nome || '?')}</span></div></td>
      <td><select class="in emp">${opt(empId)}</select></td><td><input class="in mon" type="month" value="${month}"></td>
      <td><input class="in liq" inputmode="decimal" value="${C.brl(s.liquido, false)}"></td><td><input class="in inss" inputmode="decimal" value="${C.brl(s.inss, false)}"></td><td><input class="in fgts" inputmode="decimal" value="${C.brl(s.fgts, false)}"></td>
      <td class="small">${s.issues.length ? `<span class="badge warn">conferir</span><br>${esc(s.issues.join('; '))}` : '<span class="badge closed">ok</span>'}${s.fixes.length ? `<br><span class="muted">${esc(s.fixes.join('; '))}</span>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar contracheques marcados', kind: 'primary', onClick: async (mm) => {
      let n = 0; const miss = [];
      for (const tr of mm.$$('tbody tr')) {
        if (!$('.use', tr).checked) continue;
        const r = rows[+tr.dataset.i]; const empId = $('.emp', tr).value; const month = $('.mon', tr).value;
        if (!empId) { miss.push(r.s.nome || 'sem nome'); continue; }
        if (!month) { miss.push(`${r.s.nome} (mês)`); continue; }
        const { img, bbox, ...rest } = r.s;
        await D.savePayslip(month, empId, { ...rest, liquido: C.num($('.liq', tr).value), inss: C.num($('.inss', tr).value), fgts: C.num($('.fgts', tr).value), fonte: 'ocr', importedAt: new Date().toISOString(), matriculaRecibo: r.s.matricula }, img);
        // memoriza a matricula do recibo no cadastro (ajuda nas proximas importacoes)
        const emp = D.emp(empId); if (r.s.matricula && emp && emp.matriculaRecibo !== r.s.matricula && r.s.issues.length === 0) await D.saveEmployee({ ...emp, matriculaRecibo: r.s.matricula });
        n++;
      }
      if (miss.length) { toast(`Escolha o funcionário/mês de: ${miss.join(', ')}`, 'err', 8000); return false; }
      toast(`${n} contracheque(s) salvo(s).`); render(root, mk);
    } }],
    onMount: (mm) => {
      mm.el.addEventListener('click', (ev) => { const z = ev.target.closest('[data-zoom]'); if (z) openModal({ title: 'Contracheque', wide: true, body: `<img class="slipimg" src="${slips[+z.dataset.zoom].img}" alt="">`, actions: [{ label: 'Fechar' }] }); });
    },
  });
}
