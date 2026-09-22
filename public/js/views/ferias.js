// Tela de ferias: vencimentos (periodo aquisitivo/concessivo), alertas de prazo, registro de ferias
// e importacao do relatorio "Previsao de Vencimento de Ferias" da contabilidade (OCR no navegador).
import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, toast, openModal, confirmBox } from '../ui.js';

let root;
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${C.pad(d.getMonth() + 1)}-${C.pad(d.getDate())}`; }; // data local (Brasil), nao UTC
const ORDEM = { dobro: 0, urgente: 1, vencida: 2, aquisicao: 3, sem_dados: 4 };
const BADGE = { dobro: 'fer-dobro', urgente: 'fer-urg', vencida: 'fer-venc', aquisicao: 'fer-ok', sem_dados: '' };
const ROTULO = { dobro: 'PRAZO ESTOURADO', urgente: 'URGENTE', vencida: 'Pode tirar', aquisicao: 'Em aquisição', sem_dados: 'Sem dados' };
const ativos = () => S.employees.filter((e) => e.ativo !== false);

/** Quantos funcionarios precisam de atencao (para o aviso no menu). */
export function alertCount(h = hoje()) {
  return ativos().filter((e) => ['dobro', 'urgente'].includes(C.feriasStatus(e, h).nivel)).length;
}

export function updateBadge() {
  const b = document.getElementById('ferbadge'); if (!b) return;
  const n = alertCount();
  b.hidden = !n; b.textContent = n; b.title = `${n} funcionário(s) com férias urgentes ou com prazo estourado`;
}

export function render(el) {
  root = el; updateBadge();
  const h = hoje();
  const lista = ativos().map((e) => ({ e, st: C.feriasStatus(e, h) }));
  const n = (nv) => lista.filter((x) => x.st.nivel === nv).length;
  const marcadas = [];
  for (const e of ativos()) for (const r of e.ferias || []) if (r.inicio && C.fimFerias(r) >= h) marcadas.push({ e, r });
  marcadas.sort((a, b) => a.r.inicio.localeCompare(b.r.inicio));

  root.innerHTML = `<div class="toolbar"><strong>Férias</strong><span class="muted">situação em ${C.fmtDMY(h)}</span><span class="spacer"></span>
    <button class="btn primary" data-act="import">📥 Importar relatório da contabilidade</button><input type="file" id="ff" accept="application/pdf,image/*" multiple hidden>
    <button class="btn" data-act="print">🖨 Imprimir</button></div>
    <div class="req-line">
      <span class="pill fer-dobro">${n('dobro')} com prazo estourado</span>
      <span class="pill fer-urg">${n('urgente')} urgentes (menos de 60 dias)</span>
      <span class="pill fer-venc">${n('vencida')} podem tirar</span>
      <span class="pill fer-ok">${n('aquisicao')} em aquisição</span></div>
    ${marcadas.length ? `<section class="store"><h2>Férias marcadas / em andamento</h2><div class="table-wrap"><table class="grid mini"><thead><tr><th>Funcionário</th><th>Loja</th><th>Início</th><th>Fim</th><th>Dias</th><th>Retorno</th></tr></thead><tbody>
      ${marcadas.map(({ e, r }) => `<tr><td>${esc(e.nome)}${r.inicio <= h ? ' <span class="badge closed">de férias</span>' : ''}</td><td>${esc(C.storeById(e.loja)?.nome || '')}</td><td>${C.fmtDMY(r.inicio)}</td><td>${C.fmtDMY(C.fimFerias(r))}</td><td class="num">${r.dias}${r.abono ? ' + 10 abono' : ''}</td><td>${C.fmtDMY(C.isoAddDays(C.fimFerias(r), 1))}</td></tr>`).join('')}
    </tbody></table></div></section>` : ''}
    ${C.STORES.map((st) => {
      const rows = lista.filter((x) => x.e.loja === st.id).sort((a, b) => ORDEM[a.st.nivel] - ORDEM[b.st.nivel] || (a.st.venc || '').localeCompare(b.st.venc || ''));
      return `<section class="store"><h2>${esc(st.nome)}</h2><div class="table-wrap"><table class="grid fer"><thead><tr><th>Funcionário</th><th>Admissão</th><th>Período aquisitivo</th><th>Vencimento</th><th>Conceder até</th><th>Saldo</th><th>Situação</th><th></th></tr></thead><tbody>
      ${rows.map(({ e, st: s }) => `<tr data-emp="${esc(e.id)}" data-nivel="${s.nivel}"><td class="c-nome">${esc(e.nome)}</td><td class="c-dt">${C.fmtDMY(e.admissao || e.entrada)}</td>
        <td class="c-dt">${s.venc ? `${C.fmtDMY(s.inicioAquisitivo)} a ${C.fmtDMY(s.venc)}` : '—'}</td><td>${C.fmtDMY(s.venc)}${e.feriasVencOrigem === 'relatorio' ? ' <span class="badge" title="Conferido com o relatório da contabilidade">contab.</span>' : ''}</td>
        <td><b>${C.fmtDMY(s.concederAte)}</b></td><td class="num">${s.venc ? `${s.saldo} dias` : ''}</td>
        <td><span class="badge ${BADGE[s.nivel]}">${ROTULO[s.nivel]}</span> <small>${esc(s.texto)}</small></td>
        <td class="acts"><button class="btn sm primary" data-act="reg" ${s.venc ? '' : 'disabled'}>Registrar férias</button> <button class="btn sm" data-act="adj">Ajustar</button> <button class="btn sm" data-act="hist" ${(e.ferias || []).length ? '' : 'disabled'}>Histórico</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Ninguém.</td></tr>'}
      </tbody></table></div></section>`;
    }).join('')}
    <p class="muted small">Regras (CLT): 12 meses de trabalho dão direito a 30 dias de férias, que precisam começar em até 12 meses depois do vencimento — senão são pagas em dobro. “Conceder até” é o último dia para iniciar 30 dias de férias (igual ao relatório da contabilidade). Avise o funcionário com 30 dias de antecedência e pague até 2 dias antes do início.</p>`;
  wire();
}

let wiredRoot = null;
function wire() {
  if (wiredRoot === root) return; wiredRoot = root;
  root.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const empId = b.closest('tr')?.dataset.emp;
    try {
      if (b.dataset.act === 'import') $('#ff', root).click();
      else if (b.dataset.act === 'print') window.print();
      else if (b.dataset.act === 'reg') openRegistrar(empId);
      else if (b.dataset.act === 'adj') openAjustar(empId);
      else if (b.dataset.act === 'hist') openHistorico(empId);
    } catch (e) { toast(e.message, 'err'); }
  });
  root.addEventListener('change', async (ev) => {
    if (ev.target.id !== 'ff' || !ev.target.files.length) return;
    const files = [...ev.target.files]; ev.target.value = '';
    await importar(files);
  });
}

function openRegistrar(empId) {
  const e = D.emp(empId), s = C.feriasStatus(e, hoje());
  const temAbono = (e.ferias || []).some((r) => r.venc === s.venc && r.abono);
  openModal({
    title: `Registrar férias — ${e.nome}`,
    body: `<p>Período aquisitivo <b>${C.fmtDMY(s.inicioAquisitivo)} a ${C.fmtDMY(s.venc)}</b> · saldo <b>${s.saldo} dias</b> · iniciar até <b>${C.fmtDMY(s.concederAte)}</b></p>
      <div class="radios"><label><input type="radio" name="tp" value="gozo" checked> Férias (com datas)</label>
      <label><input type="radio" name="tp" value="quitado"> Período já quitado (férias tiradas antes de usar o sistema)</label></div>
      <div class="grid3" id="gz"><label>Início<input class="in" type="date" id="r_ini"></label>
      <label>Dias de férias<input class="in" id="r_dias" inputmode="numeric" value="${s.saldo}"></label>
      <label class="inline" style="align-self:end"><input type="checkbox" id="r_abono" ${temAbono || s.saldo < 30 ? 'disabled' : ''}> vender 10 dias (abono)</label>
      <label class="span3">Observação<input class="in" id="r_obs"></label></div>
      <p id="r_info" class="muted"></p><div id="r_warn"></div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      const tipo = m.$('input[name=tp]:checked').value;
      if (tipo === 'quitado') { await D.addFerias(empId, { venc: s.venc, dias: s.saldo, quitado: true, obs: m.$('#r_obs').value.trim() }); render(root); toast('Período marcado como quitado.'); return; }
      const ini = m.$('#r_ini').value, dias = Math.floor(C.num(m.$('#r_dias').value)), abono = m.$('#r_abono').checked;
      if (!ini) { toast('Informe a data de início.', 'err'); return false; }
      if (dias < 5) { toast('Cada período de férias precisa ter pelo menos 5 dias.', 'err'); return false; }
      if (dias + (abono ? 10 : 0) > s.saldo) { toast(`Passa do saldo: restam ${s.saldo} dias neste período.`, 'err'); return false; }
      await D.addFerias(empId, { venc: s.venc, inicio: ini, dias, abono, obs: m.$('#r_obs').value.trim() });
      render(root); toast(`Férias registradas: ${C.fmtDMY(ini)} a ${C.fmtDMY(C.fimFerias({ inicio: ini, dias }))}.`);
    } }],
    onMount: (m) => {
      const upd = () => {
        const q = m.$('input[name=tp]:checked').value === 'quitado';
        m.$('#gz').querySelectorAll('input').forEach((i) => { if (i.id !== 'r_obs') i.disabled = q || (i.id === 'r_abono' && (temAbono || s.saldo < 30)); });
        const ini = m.$('#r_ini').value, dias = Math.floor(C.num(m.$('#r_dias').value)), abono = m.$('#r_abono').checked;
        const w = [];
        if (!q && ini && dias > 0) {
          const fim = C.fimFerias({ inicio: ini, dias });
          m.$('#r_info').textContent = `De ${C.fmtDMY(ini)} a ${C.fmtDMY(fim)} · volta ao trabalho em ${C.fmtDMY(C.isoAddDays(fim, 1))} · pagar até ${C.fmtDMY(C.isoAddDays(ini, -2))}`;
          if (ini > s.limite) w.push('Começa depois do fim do prazo legal: férias em dobro.');
          else if (ini > s.concederAte && dias + (abono ? 10 : 0) >= 30) w.push(`Começa depois de ${C.fmtDMY(s.concederAte)}: parte das férias cai fora do prazo (paga em dobro).`);
          if (C.isoDiffDays(hoje(), ini) < 30) w.push('Menos de 30 dias até o início: a CLT pede aviso de férias com 30 dias de antecedência.');
          if (dias < 14 && dias + (abono ? 10 : 0) < s.saldo) w.push('Se dividir as férias, um dos períodos precisa ter pelo menos 14 dias.');
          if (dias + (abono ? 10 : 0) > s.saldo) w.push(`Passa do saldo (${s.saldo} dias).`);
        } else m.$('#r_info').textContent = '';
        m.$('#r_warn').innerHTML = w.length ? `<div class="warn-box"><ul>${w.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
      };
      m.$('#r_abono').addEventListener('change', (ev) => { const d = m.$('#r_dias'); d.value = ev.target.checked ? Math.max(5, s.saldo - 10) : s.saldo; });
      m.el.addEventListener('input', upd); m.el.addEventListener('change', upd); upd();
    },
  });
}

function openAjustar(empId) {
  const e = D.emp(empId), s = C.feriasStatus(e, hoje());
  const base = C.primeiroVencFerias(e.admissao || e.entrada);
  const opts = [];
  if (base) for (let v = base; v <= C.addYearsIso(hoje(), 1) && opts.length < 40; v = C.addYearsIso(v, 1)) opts.push(v);
  openModal({
    title: `Ajustar período em aberto — ${e.nome}`,
    body: `<p>Informe o <b>vencimento do período de férias mais antigo ainda não tirado</b> (coluna “Vcto. Férias” do relatório da contabilidade). Os períodos anteriores contam como quitados.</p>
      ${opts.length ? `<div class="chips-row">${opts.map((v) => `<button type="button" class="chip" data-v="${v}">${C.fmtDMY(v)}</button>`).join('')}</div>` : ''}
      <label>Vencimento do período em aberto<input class="in" type="date" id="a_venc" value="${s.venc || ''}"></label>
      <p class="muted small">Faltas e afastamentos longos (ex.: INSS) podem mudar o vencimento — por isso vale conferir com o relatório da contabilidade.</p>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      const v = m.$('#a_venc').value;
      if (!v) { toast('Informe a data.', 'err'); return false; }
      await D.setFeriasVenc(empId, v, 'manual'); render(root); toast('Vencimento ajustado.');
    } }],
    onMount: (m) => m.el.addEventListener('click', (ev) => { const c = ev.target.closest('[data-v]'); if (c) m.$('#a_venc').value = c.dataset.v; }),
  });
}

function openHistorico(empId) {
  const e = D.emp(empId);
  const regs = [...(e.ferias || [])].sort((a, b) => (b.inicio || b.venc).localeCompare(a.inicio || a.venc));
  const m = openModal({
    title: `Histórico de férias — ${e.nome}`, wide: true,
    body: `<div class="table-wrap"><table class="grid mini"><thead><tr><th>Período (venc.)</th><th>Férias</th><th>Dias</th><th>Obs.</th><th>Registrado</th><th></th></tr></thead><tbody>
      ${regs.map((r) => `<tr><td>${C.fmtDMY(r.venc)}</td><td>${r.inicio ? `${C.fmtDMY(r.inicio)} a ${C.fmtDMY(C.fimFerias(r))}` : '<i>período quitado</i>'}</td><td class="num">${r.dias}${r.abono ? ' + 10 abono' : ''}</td><td>${esc(r.obs || '')}</td><td class="muted small">${esc(r.criadoPor || '')} ${r.criadoEm ? C.fmtDMY(r.criadoEm.slice(0, 10)) : ''}</td><td><button class="btn sm danger" data-del="${esc(r.id)}">Excluir</button></td></tr>`).join('')}
    </tbody></table></div>`,
    actions: [{ label: 'Fechar' }],
  });
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-del]'); if (!b) return;
    if (!(await confirmBox('Excluir este registro de férias?', { okLabel: 'Excluir', danger: true }))) return;
    await D.removeFerias(empId, b.dataset.del); m.close(); render(root); toast('Registro excluído.');
  });
}

async function importar(files) {
  const prog = openModal({ title: 'Lendo relatório de férias…', body: '<p id="pmsg">Preparando leitura (a primeira vez carrega o reconhecimento de texto, ~10 s)…</p><progress style="width:100%"></progress>', actions: [], closable: false });
  let linhas;
  try {
    const { readText } = await import('../pdfocr.js');
    const text = await readText(files, (p) => { const el = prog.$('#pmsg'); if (el && p.file) el.textContent = `Lendo ${p.file} — página ${p.page}/${p.pages}`; });
    linhas = C.parseRelatorioFerias(text, { hoje: hoje() });
  } catch (e) { prog.close(); toast('Não consegui ler o arquivo: ' + e.message, 'err'); return; }
  prog.close();
  if (!linhas.length) { toast('Não encontrei funcionários no relatório. Confira se é a “Previsão de Vencimento de Férias”.', 'err'); return; }
  revisar(linhas);
}

/** Tela de conferencia antes de aplicar (tambem usada nos testes). */
export function revisar(linhas) {
  const emps = ativos();
  const itens = linhas.map((l) => { const mt = C.bestEmployeeMatch(l.nome, emps); return { ...l, empId: mt?.emp.id || '' }; });
  const opt = (sel) => `<option value="">— ignorar —</option>${emps.map((e) => `<option value="${esc(e.id)}" ${e.id === sel ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}`;
  const semRelatorio = emps.filter((e) => !itens.some((i) => i.empId === e.id));
  openModal({
    title: 'Conferir relatório de férias', wide: true,
    body: `<p>Confira as datas lidas do relatório. Ao aplicar, o <b>vencimento do período em aberto</b> de cada funcionário passa a ser o da contabilidade.</p>
      <div class="table-wrap"><table class="grid review" id="rv"><thead><tr><th>Nome no relatório</th><th>Funcionário</th><th>Vcto. férias</th><th>Conceder até</th><th>No sistema hoje</th></tr></thead><tbody>
      ${itens.map((it, i) => { const e = D.emp(it.empId); const atual = e ? C.feriasStatus(e, hoje()).venc : null;
        return `<tr data-i="${i}" class="${it.empId ? '' : 'bad'}"><td>${esc(it.nome)}</td><td><select class="in" data-f="emp">${opt(it.empId)}</select></td><td><input class="in" type="date" data-f="venc" value="${it.venc}"></td><td data-c="ate">${C.fmtDMY(it.concederAte)}</td><td>${atual ? C.fmtDMY(atual) + (atual === it.venc ? ' ✔' : ' <span class="badge warn">muda</span>') : '—'}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${semRelatorio.length ? `<p class="muted small">Não estão no relatório (continuam como estão): ${semRelatorio.map((e) => esc(e.nome)).join(', ')}.</p>` : ''}`,
    actions: [{ label: 'Cancelar' }, { label: 'Aplicar', kind: 'primary', onClick: async (m) => {
      let n = 0;
      for (const tr of m.$$('#rv tbody tr')) {
        const empId = tr.querySelector('[data-f=emp]').value, venc = tr.querySelector('[data-f=venc]').value;
        if (!empId || !venc) continue;
        const e = D.emp(empId);
        if (e.feriasVenc === venc && e.feriasVencOrigem === 'relatorio') continue;
        await D.setFeriasVenc(empId, venc, 'relatorio'); n++;
      }
      render(root); toast(n ? `${n} funcionário(s) atualizado(s) com o relatório.` : 'Nada mudou — tudo já estava igual ao relatório.');
    } }],
    onMount: (m) => m.el.addEventListener('input', (ev) => {
      const tr = ev.target.closest('tr[data-i]'); if (!tr) return;
      const v = tr.querySelector('[data-f=venc]').value; tr.querySelector('[data-c=ate]').textContent = v ? C.fmtDMY(C.concederAte(v)) : '';
      tr.classList.toggle('bad', !tr.querySelector('[data-f=emp]').value);
    }),
  });
}
