// Escala 5x2 — simulacao do fim da escala 6x1. Dois modos: Rei do Gado (equipe real) e Outro negocio (cadastro livre).
// Calculo em calc.js (gerar5x2): dia fechado conta como folga, 1 folga fixa na semana, domingo a cada 3 semanas,
// sem folga nos dias marcados (sabado); as folgas sao planejadas olhando todas as lojas juntas, com troca de loja no
// dia (cobrir5x2). Carga horaria (carga5x2) pelo horario de funcionamento de cada loja/dia.
import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, toast, openModal, confirmBox } from '../ui.js';
import { awayReason } from './escala.js';

let root, mk, modo = 'rei', st; // st: { cfg, mes } (rei) ou { outro } (outro)
const FUN_REI = { atendimento: 'Atendimento', manipulacao: 'Manipulação' };
const ROT_HIBRIDO = 'Atend./Manip.';
const rotuloCat = (cat) => (cat === C.HIBRIDO ? ROT_HIBRIDO : FUN_REI[cat] || '');
/** Funcao mostrada ao lado do nome (hibrido = faz as duas). */
const rotulo = (p, m) => (C.funcoesP(p).length > 1 ? (modo === 'rei' ? ROT_HIBRIDO : 'Qualquer função') : m.funcoes[p.funcao] || '');
const ehHib = (p) => C.funcoesP(p).length > 1;
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
    const unidades = Object.fromEntries(o.unidades.map((u) => [u.id, { nome: u.nome, abre: u.abre, minimos: u.minimos || {}, horario: u.horario || {}, extras: extrasDe(u.id) }]));
    const funcoes = Object.fromEntries(o.funcoes.map((f) => [f.id, f.nome]));
    const pes = o.pessoas.filter((p) => unidades[p.unidade] && (funcoes[p.funcao] || p.funcao === '*')).map((p) => (p.funcao === '*' ? { ...p, funcao: Object.keys(funcoes)[0], funcoes: Object.keys(funcoes) } : p));
    return { unidades, funcoes, pessoas: pes, semFolga: o.semFolga || [6], domingo3: o.domingo3 !== false, folgas: o.meses?.[mk]?.folgas || null, cobre: o.meses?.[mk]?.cobre || {}, unavailable: () => '', ...cargaCfg(o) };
  }
  const cfg = st.cfg;
  const equipe = new Set(st.mes?.equipe || []);
  const hor = horarioRei(cfg);
  const unidades = Object.fromEntries(C.STORES.map((s) => [s.id, { nome: s.nome, ...cfg.lojas[s.id], horario: hor, extras: extrasDe(s.id) }]));
  const lista = equipeLista().filter((p) => equipe.has(p.id) && unidades[p.unidade]);
  const pessoas = lista.map((p) => ({ id: p.id, nome: p.nome, unidade: p.unidade, funcao: p.funcao === C.HIBRIDO ? 'atendimento' : p.funcao, funcoes: p.funcao === C.HIBRIDO ? ['atendimento', 'manipulacao'] : [p.funcao], podeCobrir: p.podeCobrir !== false, empId: p.empId || null, extra: !!p.extra }));
  const porId = Object.fromEntries(pessoas.map((p) => [p.id, p]));
  // afastamento (atestado, ferias...) so para quem veio do cadastro de funcionarios
  const unavailable = (id, d) => (porId[id]?.empId ? awayReason(porId[id].empId, d) : '');
  return { unidades, funcoes: FUN_REI, pessoas, semFolga: cfg.semFolga || [6], domingo3: cfg.domingo3 !== false, folgas: st.mes?.folgas || null, cobre: st.mes?.cobre || {}, unavailable, ...cargaCfg(cfg) };
}
/** Almoco, lanche e jornada semanal (vazio = 42h na transicao, 40h a partir de 16/12/2027). */
// almoco: 1h (o valor antigo "intervalo" de 75 min juntava almoco + lanche; so vale o que foi salvo depois da v1.19)
const cargaCfg = (c) => ({ almoco: c.almocoOk ? (c.almoco ?? 60) : 60, lanche: c.lanche ?? 15, jornada: Number(c.jornada) || 0, inicioMin: c.inicioMin || '07:00', horariosPessoa: c.horariosPessoa || {} });

/**
 * Equipe da escala 5x2 (Rei do Gado): lista PROPRIA da aba (nome, loja, funcao, cobre outras lojas). Na primeira vez
 * vem com os nomes do cadastro de funcionarios; depois e editada aqui, com extras que nao sao funcionarios.
 */
function equipeLista() {
  if (!st.cfg.equipe) {
    st.cfg.equipe = S.employees.filter((e) => C.inEscala(e)).sort((a, b) => a.nome.localeCompare(b.nome))
      .map((e) => ({ id: e.id, nome: nomeCurto(e.nome), unidade: C.workStore(e), funcao: e.categoria, podeCobrir: true, empId: e.id }));
  }
  return st.cfg.equipe;
}

/** Horario de funcionamento do Rei do Gado: o mesmo para todas as lojas (antes era por loja: usa o primeiro preenchido). */
const horarioRei = (cfg) => (cfg.horario && Object.keys(cfg.horario).length ? cfg.horario : (Object.values(cfg.lojas || {}).find((l) => l.horario && Object.keys(l.horario).length) || {}).horario || {});
/** Aberturas extras do mes (dia em que a loja normalmente fecha): [{id, date, lojas, ini, fim, obs}] */
const extrasMes = () => (modo === 'rei' ? st.mes?.extras : st.outro.meses?.[mk]?.extras) || [];
const extrasDe = (u) => { const o = {}; for (const x of extrasMes()) if ((x.lojas || []).includes(u)) o[x.date] = { ini: x.ini, fim: x.fim, obs: x.obs || '', tipo: x.tipo || 'extra', minimos: x.minimos || null }; return o; };

// ---------- tela ----------
function draw() {
  const top = `<div class="toolbar x5-top"><strong>Escala 5x2</strong>
    <div class="seg"><button class="${modo === 'rei' ? 'on' : ''}" data-act="modo" data-m="rei">Rei do Gado</button><button class="${modo === 'outro' ? 'on' : ''}" data-act="modo" data-m="outro">Outro negócio</button></div>
    <span class="spacer"></span>
    <button class="btn" data-act="ajustes">${modo === 'outro' ? '✏️ Cadastro do negócio' : '⚙ Ajustes'}</button>
    ${temEscala() ? `${modo === 'rei' ? '<button class="btn" data-act="equipe">👥 Equipe</button>' : ''}<button class="btn" data-act="extra">📅 Feriado / dia especial</button><button class="btn" data-act="print">🖨 Imprimir</button>` : ''}</div>`;
  let body;
  if (modo === 'rei' && !st.mes) body = telaEquipe();
  else if (modo === 'outro' && !(st.outro.pessoas || []).length) body = `<div class="empty"><p>Cadastre as unidades, as funções e as pessoas do negócio.</p><button class="btn primary" data-act="ajustes">✏️ Cadastrar</button></div>`;
  else body = telaEscala();
  root.innerHTML = top + body;
  lerEquipeTela = null;
  const eqb = root.querySelector('#eqbox');
  if (eqb) lerEquipeTela = editorEquipe(eqb, JSON.parse(JSON.stringify(equipeLista())), new Set(st.mes?.equipe || equipeLista().map((p) => p.id)));
  wire();
}
const temEscala = () => (modo === 'rei' ? !!st.mes : !!st.outro.meses?.[mk]?.folgas);

/** Passo 1 (Rei do Gado): a equipe da escala (lista da propria aba) e quem entra no mes. */
function telaEquipe() {
  return `<section class="card x5-equipe"><h2>Equipe da escala de ${esc(C.monthLabel(mk))}</h2>
    <div id="eqbox"></div>
    <div class="x5-acoes"><button class="btn primary" data-act="gerar">Confirmar e gerar escala</button></div></section>`;
}
const FUN_EQ = { atendimento: 'Atendimento', manipulacao: 'Manipulação', hibrido: 'Atend./Manip.' };
/** Editor da equipe: marca quem entra no mes, troca nome/loja/funcao, "cobre outras lojas", inclui extra, remove. */
function editorEquipe(box, lista, marcados) {
  const linhas = () => lista.map((p) => { const af = p.empId ? afastamentoNoMes(p.empId) : '';
    return `<tr data-eq="${esc(p.id)}"><td><input type="checkbox" class="eq-mes" ${marcados.has(p.id) ? 'checked' : ''} title="Entra na escala deste mês"></td>
      <td><input class="in eq-nome" value="${esc(p.nome)}" placeholder="Nome">${p.extra ? ' <span class="badge">extra</span>' : ''}${af ? ` <span class="badge warn">${esc(af)}</span>` : ''}</td>
      <td><select class="in eq-loja">${C.STORES.map((s) => `<option value="${s.id}" ${p.unidade === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></td>
      <td><select class="in eq-fun">${Object.entries(FUN_EQ).map(([k, v]) => `<option value="${k}" ${p.funcao === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td class="c"><input type="checkbox" class="eq-cobre" ${p.podeCobrir !== false ? 'checked' : ''}></td>
      <td><button type="button" class="icon-btn" data-eq-del="${esc(p.id)}" title="Tirar da lista">✕</button></td></tr>`; }).join('');
  const desenha = () => { box.innerHTML = `<div class="table-wrap"><table class="grid x5-eq"><thead><tr><th title="Entra no mês">Mês</th><th>Nome</th><th>Loja</th><th>Função</th><th title="Pode ir a outra loja cobrir folga">Cobre outras lojas</th><th></th></tr></thead><tbody>${linhas()}</tbody></table></div>
    <button type="button" class="btn sm" data-eq-add="1">＋ Incluir extra</button>`; };
  const ler = () => {
    for (const tr of box.querySelectorAll('tr[data-eq]')) {
      const p = lista.find((x) => x.id === tr.dataset.eq); if (!p) continue;
      p.nome = tr.querySelector('.eq-nome').value.trim(); p.unidade = tr.querySelector('.eq-loja').value; p.funcao = tr.querySelector('.eq-fun').value;
      p.podeCobrir = tr.querySelector('.eq-cobre').checked;
      if (tr.querySelector('.eq-mes').checked) marcados.add(p.id); else marcados.delete(p.id);
    }
  };
  box.onclick = (ev) => {
    const add = ev.target.closest('[data-eq-add]'), del = ev.target.closest('[data-eq-del]');
    if (!add && !del) return;
    ler();
    if (add) { const p = { id: 'x' + uid(), nome: '', unidade: C.STORES[0].id, funcao: 'atendimento', podeCobrir: true, extra: true }; lista.push(p); marcados.add(p.id); desenha(); const ins = box.querySelectorAll('.eq-nome'); ins[ins.length - 1]?.focus(); }
    else { const k = lista.findIndex((x) => x.id === del.dataset.eqDel); if (k >= 0) { marcados.delete(lista[k].id); lista.splice(k, 1); } desenha(); }
  };
  desenha();
  return () => { ler(); return { lista: lista.filter((p) => p.nome), marcados: new Set([...marcados].filter((id) => lista.some((p) => p.id === id && p.nome))) }; };
}
let lerEquipeTela = null;
async function salvaEquipe(lista, marcados) {
  st.cfg = { ...st.cfg, equipe: lista };
  await D.save5x2Cfg(st.cfg);
  return [...marcados];
}
function abrirEquipe() {
  const lista = JSON.parse(JSON.stringify(equipeLista()));
  const marcados = new Set(st.mes?.equipe || []);
  let ler = null;
  openModal({
    title: `Equipe da escala — ${C.monthLabel(mk)}`, wide: true, body: '<div id="eqmodal"></div><p class="muted small">Salvar refaz a escala do mês com essa equipe.</p>',
    onMount: (m) => { ler = editorEquipe(m.$('#eqmodal'), lista, marcados); },
    actions: [{ label: 'Cancelar' }, { label: 'Salvar e gerar de novo', kind: 'primary', onClick: async () => {
      const r = ler(); if (!r.marcados.size) { toast('Marque pelo menos uma pessoa.', 'err'); return false; }
      const ids = await salvaEquipe(r.lista, r.marcados);
      st.mes = { ...(st.mes || {}), equipe: ids }; await gerar(ids);
    } }],
  });
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
  const temHorario = Object.values(m.unidades).some((u) => Object.values(u.horario || {}).some((h) => h && h[0] && h[1]));
  // turnos sugeridos: horario da loja do dia + entrada mais cedo para fechar a jornada semanal (42h/40h)
  const carga = temHorario ? C.turnos5x2({ weeks, pessoas: m.pessoas, unidades: m.unidades, folgas: m.folgas, cobre: m.cobre, unavailable: m.unavailable, almoco: m.almoco, lanche: m.lanche, jornada: m.jornada, horariosPessoa: m.horariosPessoa, inicioMin: m.inicioMin }) : null;
  const resumo = resumoFaltas(faltas, m, avisos) + (carga ? resumoCarga(carga, m) : '');
  montaSiglas(m.unidades);
  // depois de cada domingo (e no fim do mes) uma coluna com as horas da semana: quanto fez, quanto falta ou passa
  const fimSem = new Set(dias.filter((d, i) => C.weekday(d) === 0 || i === dias.length - 1));
  const diasCols = carga ? dias.flatMap((d) => (fimSem.has(d) ? [d, 'S' + d] : [d])) : dias;
  const segDe = (d) => C.isoAddDays(d, -((C.weekday(d) + 6) % 7));
  const semCol = (tipo, d, p) => {
    if (tipo === 'th') return `<th class="ws" title="Horas da semana de ${C.fmtDM(segDe(d))} (meta ${C.metaSemanal(segDe(d), m.jornada)}h)"><small>sem.</small>h</th>`;
    const s = tipo === 'p' && carga?.[p.id] ? carga[p.id].semanas.find((x) => x.inicio === segDe(d)) : null;
    if (!s) return '<td class="ws"></td>';
    if (s.afastado && !s.normais) return '<td class="ws af" title="Afastado na semana">A</td>';
    if (!s.dias && !s.especiais) return '<td class="ws">—</td>';
    const dif = Math.round((s.normais - s.meta) * 100) / 100;
    const cls = s.afastado ? 'info' : Math.abs(dif) <= 0.26 ? 'ok' : dif < 0 ? 'falta' : 'passa';
    const tip = `Semana de ${C.fmtDM(s.inicio)}: ${C.fmtH(s.normais)} de ${C.fmtH(s.meta)}${Math.abs(dif) > 0.26 ? ` — ${dif < 0 ? 'faltam' : 'passam'} ${C.fmtH(Math.abs(dif))}` : ' ✓'}${s.especiais ? ` · + ${C.fmtH(s.especiais)} em feriado/dia extra (pago à parte)` : ''}${s.dias < 5 ? ` · ${s.dias} dia(s) de trabalho, meta proporcional` : ''}${s.afastado ? ' · afastado em parte da semana' : ''}${s.proprio ? ' · horário próprio' : ''}`;
    const sub = cls === 'falta' || cls === 'passa' ? `<small>${dif < 0 ? '−' : '+'}${esc(C.fmtH(Math.abs(dif)))}</small>` : s.especiais ? `<small class="wfer">+${esc(C.fmtH(s.especiais))} fer.</small>` : s.dias < 5 && s.dias > 0 ? `<small class="wfer">${s.dias} dias</small>` : '';
    return `<td class="ws ${cls}" title="${esc(tip)}">${esc(C.fmtH(s.normais))}${sub}</td>`;
  };
  const ext = extrasMes().filter((x) => x.date.slice(0, 7) === mk).sort((a, b) => a.date.localeCompare(b.date));
  const linhaExtras = ext.length ? `<div class="x5-extras">${ext.map((x) => `<span class="x5-ext ${x.tipo === 'feriado' ? 'fer' : ''}"><b>${x.tipo === 'feriado' ? 'Feriado' : 'Abre'} ${C.DIAS_SEM[C.weekday(x.date)]} ${C.fmtDM(x.date)}</b> · ${esc((x.lojas || []).map((l) => m.unidades[l]?.nome || l).join(', '))}${x.ini && x.fim ? ` · ${esc(curtoH(x.ini))}–${esc(curtoH(x.fim))}` : ''}${x.minimos && (x.minimos.atendimento || x.minimos.manipulacao) ? ` · mín. ${x.minimos.atendimento ?? '–'} atend. + ${x.minimos.manipulacao ?? '–'} manip.` : ''}${x.obs ? ` · <i>${esc(x.obs)}</i>` : ''} <button class="icon-btn" data-act="rmextra" data-id="${esc(x.id)}" title="Tirar">✕</button></span>`).join('')}</div>` : '';
  return `${resumo}${linhaExtras}${carga ? painelHorario(m, weeks, ext) : ''}
    ${Object.entries(m.unidades).map(([u, un]) => {
      const gente = m.pessoas.filter((p) => p.unidade === u).sort((a, b) => ehHib(a) - ehHib(b) || Object.keys(m.funcoes).indexOf(a.funcao) - Object.keys(m.funcoes).indexOf(b.funcao) || a.nome.localeCompare(b.nome));
      if (!gente.length) return '';
      const aD = (d) => C.abreEm(un, d); // aberta na data (dia normal ou abertura extra)
      const nd = (d) => C.unidadesNoDia(m.unidades, d)[u];
      const contaSem = (p) => weeks.map((w) => w.filter((d) => !aD(d) || (m.folgas[p.id] || []).includes(d) || m.unavailable(p.id, d)).length);
      return `<section class="store x5"><h2>${esc(un.nome)}</h2><div class="table-wrap"><table class="x5grid"><thead><tr><th class="nm"></th>${diasCols.map((d) => { if (d[0] === 'S') return semCol('th', d.slice(1)); const w = C.weekday(d); const ab = aD(d); const ex = (un.extras || {})[d]; const h = (nd(d).horario || {})[w]; const hTxt = ab && h && h[0] && h[1] ? `${h[0]}–${h[1]}` : '';
        return `<th class="${ab ? '' : 'fech'} ${ex ? (ex.tipo === 'feriado' ? 'feriado' : 'extra') : ''} ${w === 1 ? 'sem' : ''} ${w === 0 ? 'dom' : ''}" title="${ab ? `${ex ? (ex.tipo === 'feriado' ? 'Feriado' : 'Abertura extra') : 'Aberta'}${hTxt ? ` ${hTxt}` : ''}${ex?.obs ? ` — ${ex.obs}` : ''}` : 'fechado'}"><small>${C.DIAS_SEM[w][0]}</small>${d.slice(8)}</th>`; }).join('')}<th class="tt" title="Folgas no mês (sem contar dia fechado)">Folgas</th><th class="tt" title="Domingos de folga no mês">Dom.</th></tr></thead><tbody>
      ${gente.map((p) => { const fs = (m.folgas[p.id] || []).filter((d) => d.slice(0, 7) === mk);
        const ruins = weeks.map((w, i) => ({ w, n: contaSem(p)[i] })).filter((x) => x.n !== 2 && x.w.every((d) => !m.unavailable(p.id, d)));
        const sab = fs.filter((d) => m.semFolga.includes(C.weekday(d)));
        const avisos = [...ruins.map((x) => `semana de ${C.fmtDM(x.w[0])}: ${x.n} folga(s)`), ...sab.map((d) => `folga em ${C.DIAS_SEM_LONGO[C.weekday(d)].toLowerCase()} ${C.fmtDM(d)}`)];
        const cg = carga?.[p.id];
        return `<tr><td class="nm" data-hp="${esc(p.id)}" title="${esc(p.nome)}${carga ? ' — clique para um horário próprio' : ''}">${esc(nomeCurto(p.nome))} <small>${esc(rotulo(p, m))}</small>${(m.horariosPessoa[p.id] && Object.keys(m.horariosPessoa[p.id]).length) ? ' <small class="x5-hp" title="Tem horário próprio">⏱</small>' : ''}${avisos.length ? ` <span class="x5-av" title="${esc(avisos.join('\n'))}">⚠</span>` : ''}</td>${diasCols.map((d) => { if (d[0] === 'S') return semCol('p', d.slice(1), p); const w = C.weekday(d); const sem = w === 1 ? 'sem' : ''; const dom = w === 0 ? 'dom' : '';
        if (!aD(d)) return `<td class="fech ${sem}"></td>`;
        const af = m.unavailable(p.id, d); if (af) return `<td class="af ${sem} ${dom}" title="${esc(af)}">A</td>`;
        const f = (m.folgas[p.id] || []).includes(d);
        const vai = (m.cobre[p.id] || {})[d];
        const tn = cg?.dias[d];
        if (vai && m.unidades[vai]) return `<td class="c cob ${sem} ${dom}" data-p="${esc(p.id)}" data-d="${d}" title="Cobrindo ${esc(m.unidades[vai].nome)}${tn ? ` · ${tn.ini}–${tn.fim} (${C.fmtH(tn.horas)})` : ''} — clique para mudar">${esc(sigla(m.unidades[vai].nome))}</td>`;
        // hibrido trabalhando: mostra se no dia faz atendimento (a) ou manipulacao (m)
        const papel = !f && ehHib(p) ? C.contagem5x2({ pessoas: m.pessoas, unidade: u, unidades: m.unidades, d, folgas: m.folgas, cobre: m.cobre, unavailable: m.unavailable }).papel[p.id] : '';
        const pTxt = papel ? (m.funcoes[papel] || papel) : '';
        const hd = tn?.horas || 0; const hx = hd > C.MAX_DIARIO;
        const tTxt = tn && !f ? `${tn.ini}–${tn.fim} · ${C.fmtH(hd)} (almoço ${m.almoco} min + lanche ${m.lanche} min)${tn.cedo ? ' · entra mais cedo para fechar a jornada' : ''} · ` : '';
        return `<td class="c ${f ? 'f' : ''} ${hx ? 'hx' : ''} ${sem} ${dom}" data-p="${esc(p.id)}" data-d="${d}" title="${f ? 'Folga — clique para cobrir outra loja ou trabalhar' : esc(tTxt) + (pTxt ? `Faz ${esc(pTxt.toLowerCase())} — ` : '') + 'Clique para dar folga'}">${f ? 'F' : pTxt ? `<span class="x5-pap">${esc(pTxt[0].toLowerCase())}</span>` : ''}</td>`; }).join('')}<td class="tt">${fs.length}</td><td class="tt">${fs.filter((d) => C.weekday(d) === 0).length}</td></tr>`; }).join('')}
      ${Object.keys(m.funcoes).filter((f) => gente.some((p) => C.funcoesP(p).includes(f))).map((f) => `<tr class="cont"><td class="nm">${esc(m.funcoes[f])} na loja</td>${diasCols.map((d) => { if (d[0] === 'S') return semCol('v'); const w = C.weekday(d); if (!aD(d)) return `<td class="fech ${w === 1 ? 'sem' : ''}"></td>`;
        const tem = C.naUnidade5x2({ pessoas: m.pessoas, unidade: u, unidades: m.unidades, funcao: f, d, folgas: m.folgas, cobre: m.cobre, unavailable: m.unavailable }); const min = ((nd(d).minimos || {})[f] || [])[w] || 0;
        return `<td class="${tem < min ? 'baixo' : ''} ${w === 0 ? 'dom' : ''}" title="mínimo ${min}">${tem}</td>`; }).join('')}<td></td><td></td></tr>`).join('')}
      ${(() => { // quem vem de outra loja cobrir: uma linha com o NOME de cada um e o horario nos dias que vem
        const visit = m.pessoas.filter((p) => p.unidade !== u && dias.some((d) => (m.cobre[p.id] || {})[d] === u)).sort((a, b) => a.nome.localeCompare(b.nome));
        if (!visit.length) return '';
        return `<tr class="vem-tit"><td class="nm" colspan="${diasCols.length + 1}">Vem cobrir de outra loja</td><td></td><td></td></tr>` + visit.map((p) => `<tr class="vem"><td class="nm" title="${esc(p.nome)}">${esc(nomeCurto(p.nome))} <small>de ${esc(m.unidades[p.unidade].nome)} · ${esc(rotulo(p, m))}</small></td>${diasCols.map((d) => { if (d[0] === 'S') return semCol('v'); const w = C.weekday(d); const sem = w === 1 ? 'sem' : ''; const dom = w === 0 ? 'dom' : '';
          if (!aD(d)) return `<td class="fech ${sem}"></td>`;
          if ((m.cobre[p.id] || {})[d] !== u) return `<td class="${sem} ${dom}"></td>`;
          const tn = carga?.[p.id]?.dias[d];
          return `<td class="vem-c ${sem} ${dom}" title="${esc(p.nome)} vem de ${esc(m.unidades[p.unidade].nome)}${tn ? ` · ${tn.ini}–${tn.fim}` : ''}">✓</td>`; }).join('')}<td></td><td></td></tr>`).join(''); })()}
      </tbody></table></div></section>`; }).join('')}
    <p class="x5-leg">Clique num dia para trocar: <b>trabalha → folga → cobre outra loja</b>. <span class="lg f">F</span> folga <span class="lg cob">${esc(sigla(Object.values(m.unidades)[0]?.nome || 'Loja'))}</span> cobrindo outra loja <span class="lg af">A</span> afastado <span class="lg fech"></span> fechado <span class="lg baixo">2</span> abaixo do mínimo ${carga ? `coluna <b>h</b> depois de cada domingo = horas da semana (meta ${C.metaSemanal(weeks[0][0], m.jornada)}h): <span class="lg wsf">−2h</span> falta <span class="lg wsp">+1h</span> passa <span class="lg fer">&nbsp;</span> feriado` : '· <a href="#" data-act="ajustes">cadastre o horário de funcionamento</a> para ver a carga horária'} ${modo === 'rei' ? '· <a href="#" data-act="refazer">alterar equipe</a>' : ''} · <a href="#" data-act="gerar">gerar de novo</a></p>`;
}

const minDe = (t) => { const [h, mi] = String(t).split(':').map(Number); return h * 60 + (mi || 0); };
const hDe = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
/**
 * Horario sugerido (fora da grade): como fica a semana de 42h com o horario das lojas. Sabado e domingo no horario
 * da loja; nos dias de semana todos entram no mesmo horario, mais cedo o necessario para fechar a jornada.
 * Duas semanas-tipo: a que trabalha domingo e a de folga no domingo (a cada 3 semanas).
 */
function painelHorario(m, weeks, ext) {
  const u = Object.values(m.unidades).find((x) => Object.values(x.horario || {}).some((h) => h && h[0] && h[1]));
  if (!u) return '';
  const hor = u.horario, abre = new Set(u.abre || []);
  const ok = (d) => abre.has(d) && hor[d] && hor[d][0] && hor[d][1];
  const meta = C.metaSemanal(weeks[Math.min(1, weeks.length - 1)][0], m.jornada);
  const H = (a, b) => { const sp = minDe(b) - minDe(a); return (sp - (sp > 360 ? m.almoco + m.lanche : sp > 240 ? Math.max(15, m.lanche) : 0)) / 60; }; // em minutos exatos
  const ORD = [1, 2, 3, 4, 5, 6, 0];
  const fds = [6, 0].filter(ok), uteis = [1, 2, 3, 4, 5].filter(ok);
  const fechados = ORD.filter((d) => !abre.has(d)).length;
  const minIni = minDe(m.inicioMin || '07:00');
  /** mesmo horario nos dias de semana para fechar a meta: retorna {d: {ini, fim, horas}} */
  const util = (n, horasFds) => {
    const need = (meta - horasFds) / n; const o = {};
    for (const d of uteis) {
      const fim = hor[d][1]; let ini = minDe(hor[d][0]);
      while (H(hDe(ini), fim) < need - 1e-6 && ini - 5 >= minIni) ini -= 5;
      while (ini + 5 < minDe(fim) - 60 && H(hDe(ini + 5), fim) >= need - 1e-6) ini += 5;
      o[d] = { ini: hDe(ini), fim, horas: H(hDe(ini), fim) };
    }
    return o;
  };
  const tipos = [];
  const folgasUteisA = Math.max(0, 2 - fechados - (fds.includes(0) ? 0 : 0));
  const nA = uteis.length - folgasUteisA;
  if (nA > 0) {
    const hF = fds.reduce((a, d) => a + H(hor[d][0], hor[d][1]), 0);
    tipos.push({ nome: fds.includes(0) ? 'Semana que trabalha domingo' : 'Semana', nota: '', u: util(nA, hF), fdsFolga: [], folgaUtil: uteis.slice(0, folgasUteisA), n: nA, hF });
  }
  if (fds.includes(0) && m.domingo3 !== false) {
    const nB = uteis.length - Math.max(0, folgasUteisA - 1);
    const hF = fds.filter((d) => d !== 0).reduce((a, d) => a + H(hor[d][0], hor[d][1]), 0);
    tipos.push({ nome: 'Semana de folga no domingo', nota: 'a cada 3 semanas', u: util(nB, hF), fdsFolga: [0], folgaUtil: uteis.slice(0, Math.max(0, folgasUteisA - 1)), n: nB, hF });
  }
  const cel = (t, d) => {
    if (!abre.has(d)) return '<td class="hs-folga">Folga<small>loja fechada</small></td>';
    if (t.fdsFolga.includes(d)) return '<td class="hs-folga">Folga</td>';
    if (t.folgaUtil.includes(d)) return `<td class="hs-folga">Folga<small>1 dia de ${esc(C.DIAS_SEM[uteis[0]].toLowerCase())} a ${esc(C.DIAS_SEM[uteis[uteis.length - 1]].toLowerCase())}</small></td>`;
    const x = t.u[d] || (ok(d) ? { ini: hor[d][0], fim: hor[d][1], horas: H(hor[d][0], hor[d][1]) } : null);
    if (!x) return '<td></td>';
    return `<td><b>${esc(curtoH(x.ini))} às ${esc(curtoH(x.fim))}</b><small>${esc(C.fmtH(x.horas))} de trabalho</small></td>`;
  };
  const total = (t) => t.hF + uteis.filter((d) => !t.folgaUtil.includes(d)).reduce((a, d) => a + (t.u[d]?.horas || 0), 0);
  const fer = ext.filter((x) => x.tipo === 'feriado');
  return `<section class="hs-card"><div class="hs-top"><h3>Horário sugerido</h3><span>${meta}h por semana · média ${esc(C.fmtH(meta / 5))} por dia · almoço ${m.almoco >= 60 ? C.fmtH(m.almoco / 60) : m.almoco + ' min'} + lanche ${m.lanche} min</span></div>
    <div class="table-wrap"><table class="hs"><thead><tr><th></th>${ORD.map((d) => `<th>${C.DIAS_SEM[d]}</th>`).join('')}<th>Semana</th></tr></thead><tbody>
    ${tipos.map((t) => `<tr><th class="hs-nome">${esc(t.nome)}${t.nota ? `<small>${esc(t.nota)}</small>` : ''}</th>${ORD.map((d) => cel(t, d)).join('')}<td class="hs-tot"><b>${esc(C.fmtH(total(t)))}</b><small>${ORD.filter((d) => abre.has(d) && !t.fdsFolga.includes(d) && !t.folgaUtil.includes(d)).length} dias · 2 folgas</small></td></tr>`).join('')}
    </tbody></table></div>${fer.length ? `<p class="hs-fer">Feriado${fer.length > 1 ? 's' : ''}: ${fer.map((x) => `${C.fmtDM(x.date)} ${esc(curtoH(x.ini))} às ${esc(curtoH(x.fim))}`).join(' · ')} — fora da conta da semana (pago à parte).</p>` : ''}</section>`;
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

const curtoH = (t) => String(t).replace(/^0(\d)/, '$1').replace(/:00$/, '');
/** Semana que nao fecha a jornada (sem afastamento). */
const fora = (x) => !x.afastado && x.dias > 0 && Math.abs(x.normais - x.meta) > 0.26;
/** Uma linha por loja quando alguem nao consegue fechar a jornada (horario da loja nao permite) ou passa de 10h. */
function resumoCarga(carga, m) {
  const linhas = [];
  for (const [u, un] of Object.entries(m.unidades)) {
    const gente = m.pessoas.filter((p) => p.unidade === u && carga[p.id]);
    const ruins = gente.filter((p) => carga[p.id].semanas.some(fora));
    const dia10 = gente.filter((p) => Object.values(carga[p.id].dias).some((t) => t.horas > C.MAX_DIARIO));
    if (!ruins.length && !dia10.length) continue;
    const partes = [];
    if (ruins.length) partes.push(`<span title="${esc(ruins.map((p) => p.nome).join('\n'))}">${ruins.length} pessoa${ruins.length > 1 ? 's' : ''} sem fechar a jornada da semana (horário próprio ou limite de entrada)</span>`);
    if (dia10.length) partes.push(`<span title="${esc(dia10.map((p) => p.nome).join('\n'))}">${dia10.length} com dia de mais de 10h</span>`);
    linhas.push(`<div><b>${esc(un.nome)}</b> · carga horária: ${partes.join(', ')}</div>`);
  }
  return linhas.length ? `<div class="x5-falta x5-carga">${linhas.join('')}</div>` : '';
}

/** Horario proprio da pessoa (quando nao fica o horario inteiro da loja). Vazio = horario da loja. */
function abrirHorarioPessoa(pid) {
  const m = modelo(); const p = m.pessoas.find((x) => x.id === pid); if (!p) return;
  const un = m.unidades[p.unidade]; const meu = m.horariosPessoa[pid] || {};
  openModal({
    title: `Horário de ${nomeCurto(p.nome)}`,
    body: `<p class="muted small">Deixe em branco para usar o horário da loja (${esc(un.nome)}).</p>${tabelaHorario('hp', meu, un.abre || [], un.horario || {})}`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (md) => {
      const h = lerHorario(md, 'hp'); const todos = { ...m.horariosPessoa };
      if (Object.keys(h).length) todos[pid] = h; else delete todos[pid];
      if (modo === 'rei') { st.cfg = { ...st.cfg, horariosPessoa: todos }; await D.save5x2Cfg(st.cfg); } else { st.outro.horariosPessoa = todos; await D.save5x2Outro(st.outro); }
      draw();
    } }],
  });
}

// ---------- acoes ----------
let wiredRoot = null;
function wire() {
  if (wiredRoot === root) return; wiredRoot = root;
  root.addEventListener('click', async (ev) => {
    const cel = ev.target.closest('td.c[data-p]');
    if (cel) { await alternar(cel.dataset.p, cel.dataset.d); return; }
    const nmc = ev.target.closest('td.nm[data-hp]');
    if (nmc) { abrirHorarioPessoa(nmc.dataset.hp); return; }
    const b = ev.target.closest('[data-act]'); if (!b) return;
    ev.preventDefault();
    try {
      const act = b.dataset.act;
      if (act === 'modo') { modo = b.dataset.m; try { sessionStorage.setItem('5x2modo', modo); } catch (e) { /* ok */ } await render(root, mk); }
      else if (act === 'gerar') await gerar();
      else if (act === 'refazer') { if (await confirmBox('Voltar para a confirmação da equipe? A escala deste mês será refeita.', { okLabel: 'Alterar equipe' })) { await D.clear5x2Mes(mk); st.mes = null; draw(); } }
      else if (act === 'ajustes') (modo === 'outro' ? abrirCadastro() : abrirAjustes());
      else if (act === 'extra') abrirExtra();
      else if (act === 'equipe') abrirEquipe();
      else if (act === 'rmextra') { if (await confirmBox('Tirar este dia especial? A escala do mês será gerada de novo.', { okLabel: 'Tirar' })) { await gravaExtras(extrasMes().filter((x) => x.id !== b.dataset.id)); await gerar(); } }
      else if (act === 'print') { document.body.classList.add('print-5x2'); window.print(); setTimeout(() => document.body.classList.remove('print-5x2'), 500); }
    } catch (e) { toast(e.message, 'err'); }
  });
}

async function gerar(ids = null) {
  if (modo === 'rei') {
    let equipe = ids || st.mes?.equipe || [];
    if (!ids && lerEquipeTela) { const r = lerEquipeTela(); if (!r.lista.length) return toast('Inclua pelo menos uma pessoa.', 'err'); equipe = await salvaEquipe(r.lista, r.marcados); }
    if (!equipe.length) return toast('Marque pelo menos uma pessoa.', 'err');
    st.mes = { equipe, confirmado: true, folgas: {}, extras: st.mes?.extras || [] };
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
  else { st.outro.meses = { ...(st.outro.meses || {}), [mk]: { ...(st.outro.meses?.[mk] || {}), folgas, cobre } }; await D.save5x2Outro(st.outro); }
}

async function gravaExtras(lista) {
  if (modo === 'rei') { st.mes = { ...st.mes, extras: lista }; await D.save5x2Mes(mk, st.mes); }
  else { st.outro.meses = { ...(st.outro.meses || {}), [mk]: { ...(st.outro.meses?.[mk] || {}), extras: lista } }; await D.save5x2Outro(st.outro); }
}

/**
 * Feriado / dia especial: marca o dia nas lojas escolhidas com horario proprio (feriado padrao 9h as 14h), minimo de
 * pessoas do dia (pode precisar de mais gente) e observacao. Tambem abre loja num dia em que ela fecha (ex.: segunda).
 */
function abrirExtra() {
  const m = modelo();
  const y = +mk.slice(0, 4);
  const feriados = C.feriadosNacionais(y).filter((f) => f.date.slice(0, 7) === mk);
  const ja = new Set(extrasMes().map((x) => x.date));
  const minNormal = (d, f) => { const u = Object.values(m.unidades)[0]; const w = C.weekday(d); const ref = (u.abre || []).includes(w) ? w : 2; return ((u.minimos || {})[f] || [])[ref] ?? ''; };
  openModal({
    title: 'Feriado / dia especial',
    body: `${feriados.length ? `<p class="muted small">Feriados nacionais do mês</p><div class="x5-fer">${feriados.map((f) => `<button type="button" class="chip" data-fer="${f.date}" data-nome="${esc(f.nome)}">${C.fmtDM(f.date)} ${esc(f.nome)}${ja.has(f.date) ? ' ✓' : ''}</button>`).join('')}</div>` : ''}
      <div class="grid2"><label>Dia<input class="in" type="date" id="ex_d" min="${C.monthStart(mk)}" max="${C.monthEnd(mk)}"></label>
      <label>Tipo<select class="in" id="ex_t"><option value="feriado">Feriado (horário diferente)</option><option value="extra">Abrir num dia que fecha (ex.: segunda)</option></select></label>
      <label>Abre<input class="in" type="time" step="900" id="ex_i" value="09:00"></label><label>Fecha<input class="in" type="time" step="900" id="ex_f" value="14:00"></label>
      <label>Mínimo de atendimento por loja<input class="in" type="number" min="0" max="20" id="ex_ma"></label><label>Mínimo de manipulação por loja<input class="in" type="number" min="0" max="20" id="ex_mm"></label></div>
      <p class="muted small">Lojas</p><div class="x5-dias" id="ex_l">${Object.entries(m.unidades).map(([id, un]) => `<label><input type="checkbox" value="${esc(id)}" checked><span>${esc(un.nome)}</span></label>`).join('')}</div>
      <label>Observação<input class="in" id="ex_o" maxlength="80" placeholder="ex.: Proclamação da República"></label>
      <p class="lack" id="ex_err"></p>`,
    onMount: (md) => {
      const preenche = () => { const d = md.$('#ex_d').value; if (!d) return; const w = C.weekday(d);
        const fecha = Object.values(m.unidades).every((u) => !(u.abre || []).includes(w));
        if (fecha && md.$('#ex_t').value === 'feriado') md.$('#ex_t').value = 'extra';
        if (!md.$('#ex_ma').value) md.$('#ex_ma').value = minNormal(d, 'atendimento');
        if (!md.$('#ex_mm').value) md.$('#ex_mm').value = minNormal(d, 'manipulacao'); };
      md.$('#ex_d').addEventListener('change', preenche);
      md.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-fer]'); if (!b) return;
        md.$('#ex_d').value = b.dataset.fer; md.$('#ex_o').value = b.dataset.nome; md.$('#ex_t').value = 'feriado'; md.$('#ex_i').value = '09:00'; md.$('#ex_f').value = '14:00'; md.$('#ex_ma').value = ''; md.$('#ex_mm').value = ''; preenche(); });
      md.$('#ex_t').addEventListener('change', () => { if (md.$('#ex_t').value === 'extra') { const h = (Object.values(m.unidades)[0]?.horario || {})[2] || []; if (h[0]) { md.$('#ex_i').value = h[0]; md.$('#ex_f').value = h[1]; } } else { md.$('#ex_i').value = '09:00'; md.$('#ex_f').value = '14:00'; } });
    },
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (md) => {
      const date = md.$('#ex_d').value, lojas = md.$$('#ex_l input:checked').map((i) => i.value), tipo = md.$('#ex_t').value;
      const ini = md.$('#ex_i').value, fim = md.$('#ex_f').value;
      const abertas = new Set(Object.entries(m.unidades).filter(([, u]) => date && (u.abre || []).includes(C.weekday(date))).map(([id]) => id));
      const erro = !date ? 'Escolha o dia.' : !lojas.length ? 'Marque pelo menos uma loja.' : !ini || !fim ? 'Informe o horário.' : (tipo === 'extra' && lojas.some((l) => abertas.has(l))) ? 'Essa loja já abre nesse dia — use o tipo Feriado para mudar o horário.' : '';
      if (erro) { md.$('#ex_err').textContent = erro; return false; }
      const num = (v) => (v === '' ? null : Math.max(0, Math.floor(+v || 0)));
      const novo = { id: uid(), date, lojas, ini, fim, tipo, minimos: { atendimento: num(md.$('#ex_ma').value), manipulacao: num(md.$('#ex_mm').value) }, obs: md.$('#ex_o').value.trim() };
      await gravaExtras([...extrasMes().filter((x) => !(x.date === date && x.lojas.some((l) => lojas.includes(l)))), novo]);
      await gerar();
      toast(`${tipo === 'feriado' ? 'Feriado' : 'Abertura'} de ${C.fmtDM(date)} marcado e escala refeita.`);
    } }],
  });
}

/** Clique na celula: trabalha -> folga -> cobre outra loja (cada uma aberta no dia) -> trabalha. */
async function alternar(pid, d) {
  const m = modelo();
  const p = m.pessoas.find((x) => x.id === pid); if (!p) return;
  const outras = Object.entries(m.unidades).filter(([u, un]) => u !== p.unidade && C.abreEm(un, d)).map(([u]) => u);
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
/** Horario de funcionamento: linha Abre e Fecha por dia da semana (placeholder = valor da loja, quando houver). */
const tabelaHorario = (prefix, horario, abre, base = null) => `<table class="x5-min x5-hor"><thead><tr><th></th>${ORDEM_DIAS.map((d) => `<th>${C.DIAS_SEM[d]}</th>`).join('')}</tr></thead><tbody>${[['Abre', 0], ['Fecha', 1]].map(([lab, k]) => `<tr><td>${lab}</td>${ORDEM_DIAS.map((d) => `<td><input class="in" type="time" step="900" data-hor="${esc(prefix)}|${d}|${k}" value="${esc((horario[d] || [])[k] || '')}" ${base ? `placeholder="${esc(((base[d] || [])[k]) || '')}"` : ''} ${abre.includes(d) ? '' : 'disabled'}></td>`).join('')}</tr>`).join('')}</tbody></table>`;
const lerHorario = (m, prefix) => { const o = {}; m.$$(`input[data-hor^="${prefix}|"]`).forEach((i) => { const [, d, k] = i.dataset.hor.split('|'); if (i.disabled || !i.value) return; (o[d] = o[d] || ['', ''])[+k] = i.value; }); for (const d of Object.keys(o)) if (!o[d][0] || !o[d][1]) delete o[d]; return o; };
const lerDias = (m, name) => m.$$(`input[name="${name}"]:checked`).map((i) => +i.value);
const lerMin = (m, prefix, funcoes) => { const o = {}; for (const f of Object.keys(funcoes)) o[f] = [0, 0, 0, 0, 0, 0, 0]; m.$$(`input[data-min^="${prefix}|"]`).forEach((i) => { const [, f, d] = i.dataset.min.split('|'); if (o[f]) o[f][+d] = Math.max(0, Math.floor(+i.value || 0)); }); return o; };
const ligaAbre = (m) => m.el.addEventListener('change', (ev) => { const i = ev.target; if (!i.name?.startsWith('abre-')) return; const pre = i.name.slice(5); m.$$(`input[data-min^="${pre}|"]`).forEach((x) => { if (x.dataset.min.endsWith('|' + i.value)) x.disabled = !i.checked; }); m.$$(`input[data-hor^="${pre}|${i.value}|"]`).forEach((x) => { x.disabled = !i.checked; }); });
const campoIntervalo = (c) => { const k = cargaCfg(c || {}); return `<div class="x5-carga-cfg"><label class="inline">Almoço <input class="in" type="number" id="intervalo" min="0" max="180" step="15" value="${k.almoco}" style="width:70px"> min</label>
  <label class="inline">Lanche <input class="in" type="number" id="lanche" min="0" max="60" step="5" value="${k.lanche}" style="width:70px"> min</label>
  <label class="inline">Jornada semanal <input class="in" type="number" id="jornada" min="20" max="44" step="1" value="${k.jornada || ''}" placeholder="${C.metaSemanal(C.monthStart(mk))}" style="width:70px"> h</label>
  <label class="inline">Entrar no máximo a partir de <input class="in" type="time" step="900" id="inicioMin" value="${esc(k.inicioMin)}"></label></div>
  <p class="muted small">Jornada vazia = ${C.metaSemanal('2027-01-01')}h na transição e ${C.metaSemanal('2028-01-01')}h a partir de 16/12/2027. A escala sugere entrar mais cedo quando o horário da loja não fecha a jornada.</p>`; };
const lerCarga = (m) => ({ almocoOk: true, almoco: Math.max(0, +m.$('#intervalo').value || 0), intervalo: Math.max(0, +m.$('#intervalo').value || 0), lanche: Math.max(0, +m.$('#lanche').value || 0), jornada: Math.max(0, +m.$('#jornada').value || 0), inicioMin: m.$('#inicioMin').value || '07:00' });

function abrirAjustes() {
  const c = st.cfg;
  openModal({
    title: 'Ajustes da escala 5x2', wide: true,
    body: `${C.STORES.map((s) => `<div class="x5-aj"><h3>${esc(s.nome)}</h3><p class="muted small">Dias que abre</p>${chipsDias('abre-' + s.id, c.lojas[s.id].abre)}<p class="muted small">Mínimo de pessoas por dia</p>${tabelaMin(s.id, FUN_REI, c.lojas[s.id].minimos, c.lojas[s.id].abre)}</div>`).join('')}
      <div class="x5-aj"><h3>Folgas</h3><p class="muted small">Dias em que ninguém folga</p>${chipsDias('semfolga', c.semFolga || [6])}
      <label class="inline"><input type="checkbox" id="dom3" ${c.domingo3 !== false ? 'checked' : ''}> Folga no domingo a cada 3 semanas</label></div>
      <div class="x5-aj"><h3>Horário de funcionamento (todas as lojas)</h3>${tabelaHorario('todas', horarioRei(c), ORDEM_DIAS)}<p class="muted small">Feriado ou loja abrindo numa segunda: botão “Feriado / dia especial” na escala do mês.</p></div>
      <div class="x5-aj"><h3>Carga horária</h3>${campoIntervalo(c)}</div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      const lojas = {}; for (const s of C.STORES) lojas[s.id] = { abre: lerDias(m, 'abre-' + s.id), minimos: lerMin(m, s.id, FUN_REI) };
      st.cfg = { ...c, lojas, horario: lerHorario(m, 'todas'), semFolga: lerDias(m, 'semfolga'), domingo3: m.$('#dom3').checked, ...lerCarga(m) };
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
    <div class="x5-aj"><h3>Pessoas</h3><table class="x5-pes"><tbody>${o.pessoas.map((p) => `<tr><td><input class="in" data-pn="${p.id}" value="${esc(p.nome)}" placeholder="Nome"></td><td><select class="in" data-pf="${p.id}">${o.funcoes.map((f) => `<option value="${f.id}" ${p.funcao === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}<option value="*" ${p.funcao === '*' ? 'selected' : ''}>Qualquer função (híbrido)</option></select></td><td><select class="in" data-pu="${p.id}">${o.unidades.map((u) => `<option value="${u.id}" ${p.unidade === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></td><td><button type="button" class="icon-btn" data-del-p="${p.id}" title="Remover">✕</button></td></tr>`).join('')}</tbody></table><button type="button" class="btn sm" data-add="p">＋ pessoa</button></div>
    ${o.unidades.map((u) => `<div class="x5-aj"><h3><input class="in x5-un" data-un="${u.id}" value="${esc(u.nome)}">${o.unidades.length > 1 ? `<button type="button" class="icon-btn" data-del-un="${u.id}" title="Remover">✕</button>` : ''}</h3><p class="muted small">Dias que abre</p>${chipsDias('abre-' + u.id, u.abre)}<p class="muted small">Horário de funcionamento</p>${tabelaHorario(u.id, u.horario || {}, u.abre)}<p class="muted small">Mínimo de pessoas por dia</p>${tabelaMin(u.id, Object.fromEntries(o.funcoes.map((f) => [f.id, f.nome])), u.minimos || {}, u.abre)}</div>`).join('')}
    <button type="button" class="btn sm" data-add="un">＋ unidade</button>
    <div class="x5-aj"><h3>Folgas</h3><p class="muted small">Dias em que ninguém folga</p>${chipsDias('semfolga', o.semFolga || [6])}<label class="inline"><input type="checkbox" id="dom3" ${o.domingo3 !== false ? 'checked' : ''}> Folga no domingo a cada 3 semanas</label></div>
    <div class="x5-aj"><h3>Carga horária</h3>${campoIntervalo(o)}</div>`;
  const ler = (m) => {
    o.funcoes.forEach((f) => { const i = m.$(`[data-fn="${f.id}"]`); if (i) f.nome = i.value.trim() || f.nome; });
    const fnMap = Object.fromEntries(o.funcoes.map((f) => [f.id, f.nome]));
    o.unidades.forEach((u) => { const i = m.$(`[data-un="${u.id}"]`); if (i) u.nome = i.value.trim() || u.nome; u.abre = lerDias(m, 'abre-' + u.id); u.minimos = lerMin(m, u.id, fnMap); u.horario = lerHorario(m, u.id); });
    o.pessoas.forEach((p) => { const n = m.$(`[data-pn="${p.id}"]`), f = m.$(`[data-pf="${p.id}"]`), u = m.$(`[data-pu="${p.id}"]`); if (n) p.nome = n.value.trim(); if (f) p.funcao = f.value; if (u) p.unidade = u.value; });
    o.semFolga = lerDias(m, 'semfolga'); const d3 = m.$('#dom3'); if (d3) o.domingo3 = d3.checked;
    if (m.$('#intervalo')) Object.assign(o, lerCarga(m));
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
