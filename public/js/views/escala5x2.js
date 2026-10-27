// Escala 5x2 — simulacao do fim da escala 6x1. Dois modos: Rei do Gado (equipe real) e Outro negocio (cadastro livre).
// Calculo em calc.js (gerar5x2): dia fechado conta como folga, 1 folga fixa na semana, domingo a cada 3 semanas,
// sem folga nos dias marcados (sabado), cada unidade sozinha (nunca puxa gente de outra).
import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, toast, openModal, confirmBox } from '../ui.js';
import { awayReason } from './escala.js';

let root, mk, modo = 'rei', st; // st: { cfg, mes } (rei) ou { outro } (outro)
const FUN_REI = { atendimento: 'Atendimento', manipulacao: 'Manipulação' };
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // seg..dom
const nomeCurto = (n) => { const t = String(n).trim().split(/\s+/); const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase(); return cap(t[0]) + (t[1] && !['DA', 'DE', 'DO', 'DAS', 'DOS', 'da', 'de', 'do'].includes(t[1]) ? ' ' + t[1][0].toUpperCase() + '.' : ''); };
const uid = () => Math.random().toString(36).slice(2, 9);
const limpa = (n) => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '');
let siglas = {};
/** Abreviacao unica de cada unidade (Coronel e Correas nao podem virar os dois "Cor"). */
function montaSiglas(unidades) {
  siglas = {};
  const nomes = Object.values(unidades).map((u) => limpa(u.nome));
  for (const n of nomes) {
    const cands = [n.slice(0, 3), n.slice(0, 2) + n.slice(-1), n[0] + n.slice(-2), n.slice(0, 4)];
    siglas[n] = cands.find((c) => nomes.every((o) => o === n || o.slice(0, 3) !== c)) || n.slice(0, 4);
  }
}
const sigla = (n) => siglas[limpa(n)] || limpa(n).slice(0, 3);
const iniciais = (n) => { const t = String(n).trim().split(/\s+/); return (t[0][0] + (t[1] && t[1].length > 2 ? t[1][0] : (t[2] || '')[0] || '')).toUpperCase(); };

export async function render(el, month) {
  root = el; mk = month;
  try { modo = sessionStorage.getItem('5x2modo') || modo; } catch (e) { /* sem storage */ }
  if (modo === 'outro') st = { outro: await D.load5x2Outro() };
  else st = await D.load5x2(mk);
  draw();
}

// ---------- modelo comum (Rei do Gado ou Outro negocio) ----------
function modelo() {
  if (modo === 'outro') {
    const o = st.outro;
    const unidades = Object.fromEntries(o.unidades.map((u) => [u.id, { nome: u.nome, abre: u.abre, minimos: u.minimos || {} }]));
    const funcoes = Object.fromEntries(o.funcoes.map((f) => [f.id, f.nome]));
    return { unidades, funcoes, pessoas: o.pessoas.filter((p) => unidades[p.unidade] && funcoes[p.funcao]), semFolga: o.semFolga || [6], domingo3: o.domingo3 !== false, folgas: o.meses?.[mk]?.folgas || null, cobre: o.meses?.[mk]?.cobre || {}, unavailable: () => '' };
  }
  const cfg = st.cfg;
  const equipe = new Set(st.mes?.equipe || []);
  const unidades = Object.fromEntries(C.STORES.map((s) => [s.id, { nome: s.nome, ...cfg.lojas[s.id] }]));
  const pessoas = S.employees.filter((e) => C.inEscala(e) && equipe.has(e.id)).map((e) => ({ id: e.id, nome: e.nome, unidade: C.workStore(e), funcao: e.categoria }));
  return { unidades, funcoes: FUN_REI, pessoas, semFolga: cfg.semFolga || [6], domingo3: cfg.domingo3 !== false, folgas: st.mes?.folgas || null, cobre: st.mes?.cobre || {}, unavailable: awayReason };
}

// ---------- tela ----------
function draw() {
  const top = `<div class="toolbar x5-top"><strong>Escala 5x2</strong>
    <div class="seg"><button class="${modo === 'rei' ? 'on' : ''}" data-act="modo" data-m="rei">Rei do Gado</button><button class="${modo === 'outro' ? 'on' : ''}" data-act="modo" data-m="outro">Outro negócio</button></div>
    <span class="spacer"></span>
    <button class="btn" data-act="ajustes">${modo === 'outro' ? '✏️ Cadastro do negócio' : '⚙ Ajustes'}</button>
    ${temEscala() ? '<button class="btn" data-act="print">🖨 Imprimir</button>' : ''}</div>`;
  let body;
  if (modo === 'rei' && !st.mes) body = telaEquipe();
  else if (modo === 'outro' && !(st.outro.pessoas || []).length) body = `<div class="empty"><p>Cadastre as unidades, as funções e as pessoas do negócio.</p><button class="btn primary" data-act="ajustes">✏️ Cadastrar</button></div>`;
  else body = telaEscala();
  root.innerHTML = top + body;
  wire();
}
const temEscala = () => (modo === 'rei' ? !!st.mes : !!st.outro.meses?.[mk]?.folgas);

/** Passo 1 (Rei do Gado): confirmar quem entra na escala do mes. */
function telaEquipe() {
  return `<section class="card x5-equipe"><h2>Quem entra na escala de ${esc(C.monthLabel(mk))}?</h2>
    <div class="x5-cols">${C.STORES.map((s) => {
      const eq = S.employees.filter((e) => C.inEscala(e) && C.workStore(e) === s.id).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
      return `<div><h3>${esc(s.nome)}</h3>${eq.map((e) => { const af = afastamentoNoMes(e.id); return `<label class="x5-pessoa"><input type="checkbox" value="${esc(e.id)}" checked> <span>${esc(nomeCurto(e.nome))}</span> <small class="muted">${FUN_REI[e.categoria]}</small>${af ? ` <span class="badge warn">${esc(af)}</span>` : ''}</label>`; }).join('') || '<p class="muted">Ninguém.</p>'}</div>`; }).join('')}</div>
    <div class="x5-acoes"><button class="btn primary" data-act="gerar">Confirmar e gerar escala</button></div></section>`;
}

/** Afastamento do funcionario dentro do mes, em texto curto (ex.: "atestado até 10/12"). */
function afastamentoNoMes(id) {
  const dias = []; for (let d = C.monthStart(mk); d <= C.monthEnd(mk); d = C.isoAddDays(d, 1)) { const w = awayReason(id, d); if (w && w !== 'fora do quadro') dias.push([d, w]); }
  if (!dias.length) return '';
  const [d0, w0] = dias[0], dl = dias[dias.length - 1][0];
  return dias.length === C.daysInMonth(mk) ? `${w0} o mês todo` : `${w0} ${C.fmtDM(d0)}${dl !== d0 ? ' a ' + C.fmtDM(dl) : ''}`;
}

/** Passo 2: a escala do mes. */
function telaEscala() {
  const m = modelo();
  const weeks = C.semanasDoMes(mk);
  if (!m.folgas) return `<div class="empty"><button class="btn primary" data-act="gerar">Gerar escala de ${esc(C.monthLabel(mk))}</button></div>`;
  const faltas = C.faltas5x2({ weeks, pessoas: m.pessoas, unidades: m.unidades, folgas: m.folgas, cobre: m.cobre, unavailable: m.unavailable }).filter((x) => x.date.slice(0, 7) === mk);
  const dias = []; for (let d = C.monthStart(mk); d <= C.monthEnd(mk); d = C.isoAddDays(d, 1)) dias.push(d);
  const avisos = C.gerar5x2({ weeks, pessoas: m.pessoas, unidades: m.unidades, semFolga: m.semFolga, domingo3: m.domingo3, unavailable: m.unavailable }).avisos;
  const resumo = resumoFaltas(faltas, m, avisos);
  montaSiglas(m.unidades);
  return `${resumo}
    ${Object.entries(m.unidades).map(([u, un]) => {
      const gente = m.pessoas.filter((p) => p.unidade === u).sort((a, b) => Object.keys(m.funcoes).indexOf(a.funcao) - Object.keys(m.funcoes).indexOf(b.funcao) || a.nome.localeCompare(b.nome));
      if (!gente.length) return '';
      const abre = new Set(un.abre);
      const contaSem = (p) => weeks.map((w) => w.filter((d) => !abre.has(C.weekday(d)) || (m.folgas[p.id] || []).includes(d) || m.unavailable(p.id, d)).length);
      return `<section class="store x5"><h2>${esc(un.nome)}</h2><div class="table-wrap"><table class="x5grid"><thead><tr><th class="nm"></th>${dias.map((d) => { const w = C.weekday(d); return `<th class="${abre.has(w) ? '' : 'fech'} ${w === 1 ? 'sem' : ''} ${w === 0 ? 'dom' : ''}" ${abre.has(w) ? '' : 'title="fechado"'}><small>${C.DIAS_SEM[w][0]}</small>${d.slice(8)}</th>`; }).join('')}<th class="tt" title="Folgas no mês (sem contar dia fechado)">Folgas</th><th class="tt" title="Domingos de folga no mês">Dom.</th></tr></thead><tbody>
      ${gente.map((p) => { const fs = (m.folgas[p.id] || []).filter((d) => d.slice(0, 7) === mk);
        const ruins = weeks.map((w, i) => ({ w, n: contaSem(p)[i] })).filter((x) => x.n !== 2 && x.w.every((d) => !m.unavailable(p.id, d)));
        const sab = fs.filter((d) => m.semFolga.includes(C.weekday(d)));
        const avisos = [...ruins.map((x) => `semana de ${C.fmtDM(x.w[0])}: ${x.n} folga(s)`), ...sab.map((d) => `folga em ${C.DIAS_SEM_LONGO[C.weekday(d)].toLowerCase()} ${C.fmtDM(d)}`)];
        return `<tr><td class="nm">${esc(nomeCurto(p.nome))} <small>${esc(m.funcoes[p.funcao] || '')}</small>${avisos.length ? ` <span class="x5-av" title="${esc(avisos.join('\n'))}">⚠</span>` : ''}</td>${dias.map((d) => { const w = C.weekday(d); const sem = w === 1 ? 'sem' : ''; const dom = w === 0 ? 'dom' : '';
        if (!abre.has(w)) return `<td class="fech ${sem}"></td>`;
        const af = m.unavailable(p.id, d); if (af) return `<td class="af ${sem} ${dom}" title="${esc(af)}">A</td>`;
        const f = (m.folgas[p.id] || []).includes(d);
        const vai = (m.cobre[p.id] || {})[d];
        if (vai && m.unidades[vai]) return `<td class="c cob ${sem} ${dom}" data-p="${esc(p.id)}" data-d="${d}" title="Cobrindo ${esc(m.unidades[vai].nome)} — clique para mudar">${esc(sigla(m.unidades[vai].nome))}</td>`;
        return `<td class="c ${f ? 'f' : ''} ${sem} ${dom}" data-p="${esc(p.id)}" data-d="${d}" title="${f ? 'Folga — clique para cobrir outra loja ou trabalhar' : 'Clique para dar folga'}">${f ? 'F' : ''}</td>`; }).join('')}<td class="tt">${fs.length}</td><td class="tt">${fs.filter((d) => C.weekday(d) === 0).length}</td></tr>`; }).join('')}
      ${Object.keys(m.funcoes).filter((f) => gente.some((p) => p.funcao === f)).map((f) => `<tr class="cont"><td class="nm">${esc(m.funcoes[f])} na loja</td>${dias.map((d) => { const w = C.weekday(d); if (!abre.has(w)) return `<td class="fech ${w === 1 ? 'sem' : ''}"></td>`;
        const tem = C.naUnidade5x2({ pessoas: m.pessoas, unidade: u, funcao: f, d, folgas: m.folgas, cobre: m.cobre, unavailable: m.unavailable }); const min = ((un.minimos || {})[f] || [])[w] || 0;
        return `<td class="${tem < min ? 'baixo' : ''} ${w === 0 ? 'dom' : ''}" title="mínimo ${min}">${tem}</td>`; }).join('')}<td></td><td></td></tr>`).join('')}
      ${(() => { const vem = (d) => m.pessoas.filter((p) => p.unidade !== u && (m.cobre[p.id] || {})[d] === u); if (!dias.some((d) => vem(d).length)) return '';
        return `<tr class="vem"><td class="nm">Vem cobrir</td>${dias.map((d) => { const w = C.weekday(d); const l = vem(d); return `<td class="${w === 1 ? 'sem' : ''} ${w === 0 ? 'dom' : ''}" title="${esc(l.map((p) => `${p.nome} (${m.unidades[p.unidade]?.nome || ''})`).join('\n'))}">${l.map((p) => esc(iniciais(p.nome))).join(' ')}</td>`; }).join('')}<td></td><td></td></tr>`; })()}
      </tbody></table></div></section>`; }).join('')}
    <p class="x5-leg">Clique num dia para trocar: <b>trabalha → folga → cobre outra loja</b>. <span class="lg f">F</span> folga <span class="lg cob">${esc(sigla(Object.values(m.unidades)[0]?.nome || 'Loja'))}</span> cobrindo outra loja <span class="lg af">A</span> afastado <span class="lg fech"></span> fechado <span class="lg baixo">2</span> abaixo do mínimo ${modo === 'rei' ? '· <a href="#" data-act="refazer">alterar equipe</a>' : ''} · <a href="#" data-act="gerar">gerar de novo</a></p>`;
}

function resumoFaltas(faltas, m, avisos = []) {
  const dom = avisos.map((a) => `<div><b>${esc(m.unidades[a.unidade].nome)}</b> · ${esc(m.funcoes[a.funcao])}: com ${a.pessoas} pessoa${a.pessoas > 1 ? 's' : ''} e mínimo de ${a.minDomingo} no domingo, nem todos conseguem folgar um domingo a cada 3 semanas</div>`).join('');
  if (!faltas.length && !dom) return '<div class="x5-ok">✓ Todas as unidades cobertas, com 2 folgas por semana para cada um.</div>';
  const grupos = {};
  for (const x of faltas) { const k = `${x.unidade}|${x.funcao}`; (grupos[k] = grupos[k] || []).push(x); }
  return `<div class="x5-falta">${Object.entries(grupos).map(([k, l]) => { const [u, f] = k.split('|'); const max = Math.max(...l.map((x) => x.falta));
    const porDia = [...new Set(l.map((x) => C.DIAS_SEM_LONGO[C.weekday(x.date)].toLowerCase()))];
    return `<div><b>${esc(m.unidades[u].nome)}</b> · ${esc(m.funcoes[f])}: falta${max > 1 ? 'm' : ''} ${max} pessoa${max > 1 ? 's' : ''} em ${l.length} dia${l.length > 1 ? 's' : ''} (${porDia.join(', ')})</div>`; }).join('')}${dom}</div>`;
}

// ---------- acoes ----------
let wiredRoot = null;
function wire() {
  if (wiredRoot === root) return; wiredRoot = root;
  root.addEventListener('click', async (ev) => {
    const cel = ev.target.closest('td.c[data-p]');
    if (cel) { await alternar(cel.dataset.p, cel.dataset.d); return; }
    const b = ev.target.closest('[data-act]'); if (!b) return;
    ev.preventDefault();
    try {
      const act = b.dataset.act;
      if (act === 'modo') { modo = b.dataset.m; try { sessionStorage.setItem('5x2modo', modo); } catch (e) { /* ok */ } await render(root, mk); }
      else if (act === 'gerar') await gerar();
      else if (act === 'refazer') { if (await confirmBox('Voltar para a confirmação da equipe? A escala deste mês será refeita.', { okLabel: 'Alterar equipe' })) { await D.clear5x2Mes(mk); st.mes = null; draw(); } }
      else if (act === 'ajustes') (modo === 'outro' ? abrirCadastro() : abrirAjustes());
      else if (act === 'print') { document.body.classList.add('print-5x2'); window.print(); setTimeout(() => document.body.classList.remove('print-5x2'), 500); }
    } catch (e) { toast(e.message, 'err'); }
  });
}

async function gerar() {
  if (modo === 'rei') {
    const marcados = [...root.querySelectorAll('.x5-equipe input[type=checkbox]')];
    const equipe = marcados.length ? marcados.filter((i) => i.checked).map((i) => i.value) : (st.mes?.equipe || []);
    if (!equipe.length) return toast('Marque pelo menos uma pessoa.', 'err');
    st.mes = { equipe, confirmado: true, folgas: {} };
  }
  const m = modelo();
  const r = C.gerar5x2({ weeks: C.semanasDoMes(mk), pessoas: m.pessoas, unidades: m.unidades, semFolga: m.semFolga, domingo3: m.domingo3, unavailable: m.unavailable });
  const cobre = C.cobrir5x2({ weeks: C.semanasDoMes(mk), pessoas: m.pessoas, unidades: m.unidades, folgas: r.folgas, unavailable: m.unavailable });
  await salvar(r.folgas, cobre);
  if (modo === 'rei') await D.log('escala_5x2_gerada', mk);
  draw();
}

async function salvar(folgas, cobre) {
  if (modo === 'rei') { st.mes.folgas = folgas; st.mes.cobre = cobre; await D.save5x2Mes(mk, st.mes); }
  else { st.outro.meses = { ...(st.outro.meses || {}), [mk]: { folgas, cobre } }; await D.save5x2Outro(st.outro); }
}

/** Clique na celula: trabalha -> folga -> cobre outra loja (cada uma aberta no dia) -> trabalha. */
async function alternar(pid, d) {
  const m = modelo();
  const p = m.pessoas.find((x) => x.id === pid); if (!p) return;
  const outras = Object.entries(m.unidades).filter(([u, un]) => u !== p.unidade && (un.abre || []).includes(C.weekday(d))).map(([u]) => u);
  const estados = ['T', 'F', ...outras];
  const folga = (m.folgas[pid] || []).includes(d), vai = (m.cobre[pid] || {})[d];
  const atual = vai || (folga ? 'F' : 'T');
  const prox = estados[(estados.indexOf(atual) + 1) % estados.length];
  const fl = new Set(m.folgas[pid] || []); prox === 'F' ? fl.add(d) : fl.delete(d);
  const cb = { ...(m.cobre[pid] || {}) }; if (prox !== 'T' && prox !== 'F') cb[d] = prox; else delete cb[d];
  await salvar({ ...m.folgas, [pid]: [...fl].sort() }, { ...m.cobre, [pid]: cb });
  draw();
}

// ---------- ajustes (Rei do Gado) ----------
const chipsDias = (name, sel) => `<div class="x5-dias">${ORDEM_DIAS.map((d) => `<label><input type="checkbox" name="${name}" value="${d}" ${sel.includes(d) ? 'checked' : ''}><span>${C.DIAS_SEM[d]}</span></label>`).join('')}</div>`;
const tabelaMin = (prefix, funcoes, minimos, abre) => `<table class="x5-min"><thead><tr><th></th>${ORDEM_DIAS.map((d) => `<th>${C.DIAS_SEM[d]}</th>`).join('')}</tr></thead><tbody>${Object.entries(funcoes).map(([f, nome]) => `<tr><td>${esc(nome)}</td>${ORDEM_DIAS.map((d) => `<td><input class="in" type="number" min="0" max="30" data-min="${esc(prefix)}|${esc(f)}|${d}" value="${(minimos[f] || [])[d] ?? 1}" ${abre.includes(d) ? '' : 'disabled'}></td>`).join('')}</tr>`).join('')}</tbody></table>`;
const lerDias = (m, name) => m.$$(`input[name="${name}"]:checked`).map((i) => +i.value);
const lerMin = (m, prefix, funcoes) => { const o = {}; for (const f of Object.keys(funcoes)) o[f] = [0, 0, 0, 0, 0, 0, 0]; m.$$(`input[data-min^="${prefix}|"]`).forEach((i) => { const [, f, d] = i.dataset.min.split('|'); if (o[f]) o[f][+d] = Math.max(0, Math.floor(+i.value || 0)); }); return o; };
const ligaAbre = (m) => m.el.addEventListener('change', (ev) => { const i = ev.target; if (!i.name?.startsWith('abre-')) return; const pre = i.name.slice(5); m.$$(`input[data-min^="${pre}|"]`).forEach((x) => { if (x.dataset.min.endsWith('|' + i.value)) x.disabled = !i.checked; }); });

function abrirAjustes() {
  const c = st.cfg;
  openModal({
    title: 'Ajustes da escala 5x2', wide: true,
    body: `${C.STORES.map((s) => `<div class="x5-aj"><h3>${esc(s.nome)}</h3><p class="muted small">Dias que abre</p>${chipsDias('abre-' + s.id, c.lojas[s.id].abre)}<p class="muted small">Mínimo de pessoas por dia</p>${tabelaMin(s.id, FUN_REI, c.lojas[s.id].minimos, c.lojas[s.id].abre)}</div>`).join('')}
      <div class="x5-aj"><h3>Folgas</h3><p class="muted small">Dias em que ninguém folga</p>${chipsDias('semfolga', c.semFolga || [6])}
      <label class="inline"><input type="checkbox" id="dom3" ${c.domingo3 !== false ? 'checked' : ''}> Folga no domingo a cada 3 semanas</label></div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      const lojas = {}; for (const s of C.STORES) lojas[s.id] = { abre: lerDias(m, 'abre-' + s.id), minimos: lerMin(m, s.id, FUN_REI) };
      st.cfg = { lojas, semFolga: lerDias(m, 'semfolga'), domingo3: m.$('#dom3').checked };
      await D.save5x2Cfg(st.cfg);
      if (st.mes) await gerar(); else draw();
      toast('Ajustes salvos.');
    } }],
    onMount: ligaAbre,
  });
}

// ---------- cadastro (Outro negocio) ----------
function abrirCadastro() {
  const o = JSON.parse(JSON.stringify(st.outro));
  if (!o.unidades.length) o.unidades.push({ id: uid(), nome: 'Unidade 1', abre: [1, 2, 3, 4, 5, 6, 0], minimos: {} });
  if (!o.funcoes.length) o.funcoes.push({ id: uid(), nome: 'Atendimento' });
  const corpo = () => `
    <div class="x5-aj"><h3>Funções</h3><div class="x5-lista">${o.funcoes.map((f) => `<span class="x5-item"><input class="in" data-fn="${f.id}" value="${esc(f.nome)}"><button type="button" class="icon-btn" data-del-fn="${f.id}" title="Remover">✕</button></span>`).join('')}<button type="button" class="btn sm" data-add="fn">＋ função</button></div></div>
    <div class="x5-aj"><h3>Pessoas</h3><table class="x5-pes"><tbody>${o.pessoas.map((p) => `<tr><td><input class="in" data-pn="${p.id}" value="${esc(p.nome)}" placeholder="Nome"></td><td><select class="in" data-pf="${p.id}">${o.funcoes.map((f) => `<option value="${f.id}" ${p.funcao === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></td><td><select class="in" data-pu="${p.id}">${o.unidades.map((u) => `<option value="${u.id}" ${p.unidade === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></td><td><button type="button" class="icon-btn" data-del-p="${p.id}" title="Remover">✕</button></td></tr>`).join('')}</tbody></table><button type="button" class="btn sm" data-add="p">＋ pessoa</button></div>
    ${o.unidades.map((u) => `<div class="x5-aj"><h3><input class="in x5-un" data-un="${u.id}" value="${esc(u.nome)}">${o.unidades.length > 1 ? `<button type="button" class="icon-btn" data-del-un="${u.id}" title="Remover">✕</button>` : ''}</h3><p class="muted small">Dias que abre</p>${chipsDias('abre-' + u.id, u.abre)}<p class="muted small">Mínimo de pessoas por dia</p>${tabelaMin(u.id, Object.fromEntries(o.funcoes.map((f) => [f.id, f.nome])), u.minimos || {}, u.abre)}</div>`).join('')}
    <button type="button" class="btn sm" data-add="un">＋ unidade</button>
    <div class="x5-aj"><h3>Folgas</h3><p class="muted small">Dias em que ninguém folga</p>${chipsDias('semfolga', o.semFolga || [6])}<label class="inline"><input type="checkbox" id="dom3" ${o.domingo3 !== false ? 'checked' : ''}> Folga no domingo a cada 3 semanas</label></div>`;
  const ler = (m) => {
    o.funcoes.forEach((f) => { const i = m.$(`[data-fn="${f.id}"]`); if (i) f.nome = i.value.trim() || f.nome; });
    const fnMap = Object.fromEntries(o.funcoes.map((f) => [f.id, f.nome]));
    o.unidades.forEach((u) => { const i = m.$(`[data-un="${u.id}"]`); if (i) u.nome = i.value.trim() || u.nome; u.abre = lerDias(m, 'abre-' + u.id); u.minimos = lerMin(m, u.id, fnMap); });
    o.pessoas.forEach((p) => { const n = m.$(`[data-pn="${p.id}"]`), f = m.$(`[data-pf="${p.id}"]`), u = m.$(`[data-pu="${p.id}"]`); if (n) p.nome = n.value.trim(); if (f) p.funcao = f.value; if (u) p.unidade = u.value; });
    o.semFolga = lerDias(m, 'semfolga'); const d3 = m.$('#dom3'); if (d3) o.domingo3 = d3.checked;
  };
  const modal = openModal({
    title: 'Cadastro do negócio', wide: true, body: `<div id="cad">${corpo()}</div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      ler(m); o.pessoas = o.pessoas.filter((p) => p.nome);
      st.outro = o; await D.save5x2Outro(o);
      if (o.meses?.[mk]?.folgas) await gerar(); else draw();
      toast('Cadastro salvo.');
    } }],
    onMount: ligaAbre,
  });
  modal.el.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t || t.dataset.i !== undefined) return;
    ler(modal);
    if (t.dataset.add === 'fn') o.funcoes.push({ id: uid(), nome: `Função ${o.funcoes.length + 1}` });
    else if (t.dataset.add === 'un') o.unidades.push({ id: uid(), nome: `Unidade ${o.unidades.length + 1}`, abre: [1, 2, 3, 4, 5, 6, 0], minimos: {} });
    else if (t.dataset.add === 'p') o.pessoas.push({ id: uid(), nome: '', funcao: o.funcoes[0]?.id, unidade: o.unidades[0]?.id });
    else if (t.dataset.delFn) { o.funcoes = o.funcoes.filter((f) => f.id !== t.dataset.delFn); }
    else if (t.dataset.delUn) { o.unidades = o.unidades.filter((u) => u.id !== t.dataset.delUn); }
    else if (t.dataset.delP) { o.pessoas = o.pessoas.filter((p) => p.id !== t.dataset.delP); }
    else return;
    modal.$('#cad').innerHTML = corpo();
    const nova = modal.$$('[data-pn]').pop(); if (t.dataset.add === 'p' && nova) nova.focus();
  });
}
