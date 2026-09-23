import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, $$, toast, openModal, confirmBox, copyRich, copyImageDataUrl } from '../ui.js';

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
  if (C.emFerias(emp, iso)) return 'férias';
  if (emp && (emp.ativo === false || (emp.entrada || emp.admissao) > iso)) return 'fora do quadro';
  return '';
}

const short = (n) => { const t = n.split(/\s+/); return `${t[0]} ${t[1] && !['DA', 'DE', 'DO', 'DAS', 'DOS'].includes(t[1].toUpperCase()) ? t[1][0] + '.' : ''}`.trim(); };
const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();

const nm = (id) => { const e = D.emp(id); if (!e) return '?'; const [a, b] = short(e.nome).split(' '); return cap(a) + (b ? ' ' + b.toUpperCase() : ''); };
const catNames = (ids, cat) => ids.filter((id) => D.emp(id)?.categoria === cat).map(nm);

/** Situacao de uma loja num domingo: quem folga, quem cobre (de outra loja), quem esta afastado e quem trabalha. */
function dayInfo(d, sid) {
  const ids = data.assignments[d]?.[sid] || [];
  const folga = C.folgasDoDia(data.assignments[d], sid, S.employees, awayReason, d);
  const cobre = ids.filter((id) => C.workStore(D.emp(id)) !== sid);
  const afast = S.employees.filter((e) => C.inEscala(e) && C.workStore(e) === sid && awayReason(e.id, d) && !ids.includes(e.id)).map((e) => ({ id: e.id, why: awayReason(e.id, d) }));
  const foraCobrindo = Object.entries(data.assignments[d] || {}).filter(([o]) => o !== sid).flatMap(([o, l]) => l.filter((id) => C.workStore(D.emp(id)) === sid).map((id) => ({ id, para: o })));
  return { ids, folga, cobre, afast, foraCobrindo };
}
const lista = (ids) => ids.map(nm).join(', ');

export async function render(el, month) {
  root = el; mk = month;
  data = await D.loadSundays(mk);
  const sundays = C.sundaysOf(mk);
  const req = S.config.required;
  const emps = S.employees.filter(C.inEscala);
  const has = sundays.some((d) => Object.values(data.assignments[d] || {}).some((l) => l.length));
  const trab = {}, folg = {};
  if (has) for (const d of sundays) {
    for (const ids of Object.values(data.assignments[d] || {})) for (const id of ids) trab[id] = (trab[id] || 0) + 1;
    for (const s of C.STORES) for (const id of dayInfo(d, s.id).folga) folg[id] = (folg[id] || 0) + 1;
  }
  const shortOf = (d, sid) => C.checkDay(data.assignments[d], sid, S.employees, req).some((x) => x.falta);

  root.innerHTML = `<div class="toolbar"><strong>Escala de domingo — ${esc(C.monthLabel(mk))}</strong><span class="spacer"></span>
    ${S.perfil === 'total' ? '<button class="btn" data-act="team">👥 Equipe por loja</button><button class="btn" data-act="req">⚙ Mínimo por loja</button>' : ''}
    <button class="btn" data-act="suggest">✨ Sugerir folgas</button><button class="btn" data-act="clear">Limpar</button>
    <button class="btn primary" data-act="img">📷 Imagem para WhatsApp</button><button class="btn" data-act="copy">📋 Copiar texto</button><button class="btn" data-act="print">🖨 Imprimir (1 folha)</button></div>
    <div class="req-line"><span class="muted">Todos trabalham no domingo, cada um com <b>1 folga no mês</b>. Mínimo por domingo:</span>${C.STORES.map((s) => `<span class="pill"><b>${esc(s.nome)}</b> ${req[s.id]?.atendimento ?? 0} atend. + ${req[s.id]?.manipulacao ?? 0} manip.</span>`).join('')}</div>
    ${has ? `<div class="escala-card" id="escalaCard"><h2>FOLGAS DE DOMINGO — ${esc(C.monthLabel(mk).toUpperCase())}</h2>
      <table><thead><tr><th>Domingo</th>${C.STORES.map((s) => `<th>${esc(s.nome)}</th>`).join('')}</tr></thead><tbody>
      ${sundays.map((d) => `<tr><td class="dom">${C.fmtDM(d)}</td>${C.STORES.map((s) => { const x = dayInfo(d, s.id);
        return `<td class="${shortOf(d, s.id) ? 'short' : ''}"><p class="cat"><b>Folga:</b> ${esc(lista(x.folga) || '—')}</p>${x.cobre.length ? `<p class="cat cob"><b>Cobre:</b> ${esc(x.cobre.map((id) => `${nm(id)} (${C.workPlaceName(C.workStore(D.emp(id)))})`).join(', '))}</p>` : ''}${x.afast.length ? `<p class="cat"><b>Afastado:</b> ${esc(x.afast.map((a) => `${nm(a.id)} (${a.why})`).join(', '))}</p>` : ''}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table><p class="muted small" style="margin:6px 0 0">Os demais trabalham normalmente na sua loja.</p></div>` : '<div class="empty"><p>Nenhuma escala neste mês. Clique em <b>✨ Sugerir folgas</b>: o sistema dá 1 folga para cada um e mostra quem de outra loja cobre.</p></div>'}
    <p class="muted">Para trocar a folga de alguém ou quem cobre, clique em <b>Editar</b> (ou no nome). Marcado = trabalha; desmarcado = folga.</p>
    <div class="sundays">${sundays.map((d) => `<article class="sunday"><h3>Domingo ${C.fmtDM(d)}</h3><div class="sun-stores">${C.STORES.map((s) => {
      const x = dayInfo(d, s.id);
      const chk = C.checkDay(data.assignments[d], s.id, S.employees, req);
      const ok = chk.every((c) => c.falta === 0);
      const pessoa = (id, cls, title) => `<span class="person ${cls}" data-act="edit" data-d="${d}" data-s="${s.id}" title="${esc(title)}">${esc(nm(id))}</span>`;
      return `<div class="sun-store ${has ? (ok ? 'ok' : 'short') : ''}"><header><b>${esc(s.nome)}</b><button class="btn sm" data-act="edit" data-d="${d}" data-s="${s.id}">✏️ Editar</button></header>
        <div class="cat"><span class="catname">Folga</span>${x.folga.map((id) => pessoa(id, 'folga', D.emp(id).nome + ' — folga')).join('') || '<span class="muted">—</span>'}</div>
        ${x.cobre.length ? `<div class="cat"><span class="catname">Cobrindo (de outra loja)</span>${x.cobre.map((id) => pessoa(id, 'cover', `${D.emp(id).nome} — vem de ${C.workPlaceName(C.workStore(D.emp(id)))}`) + '').join('')}</div>` : ''}
        ${x.foraCobrindo.length ? `<div class="cat"><span class="catname">Emprestado</span>${x.foraCobrindo.map((f) => `<span class="person cover" title="cobrindo ${esc(C.storeById(f.para).nome)}">${esc(nm(f.id))} → ${esc(C.storeById(f.para).nome)}</span>`).join('')}</div>` : ''}
        ${x.afast.length ? `<div class="cat"><span class="catname">Afastado</span>${x.afast.map((a) => `<span class="person off">${esc(nm(a.id))} <small>(${esc(a.why)})</small></span>`).join('')}</div>` : ''}
        ${CATS.map((cat) => { const c = chk.find((y) => y.cat === cat); return `<div class="cat"><span class="catname">${C.CATEGORIAS[cat]} trabalhando <em class="${c.falta ? 'lack' : 'fine'}">${c.tem} (mín. ${c.precisa})</em></span><small>${esc(lista(x.ids.filter((id) => D.emp(id)?.categoria === cat)) || '—')}</small></div>`; }).join('')}
        ${chk.some((c) => c.falta) ? `<p class="lack">Abaixo do mínimo: ${chk.filter((c) => c.falta).map((c) => `${c.falta} ${C.CATEGORIAS[c.cat].toLowerCase()}`).join(', ')}</p>` : ''}</div>`;
    }).join('')}</div></article>`).join('')}</div>
    <section class="store"><h2>Folgas por pessoa em ${esc(C.monthLabel(mk))}</h2><div class="table-wrap"><table class="grid mini"><thead><tr><th>Funcionário</th><th>Trabalha em</th><th>Função</th><th>Domingos trabalhados</th><th>Folgas</th></tr></thead><tbody>${emps.map((e) => `<tr><td>${esc(e.nome)}</td><td>${esc(C.workPlaceName(C.workStore(e)))}</td><td>${C.CATEGORIAS[e.categoria] || ''}</td><td class="num">${trab[e.id] || 0}</td>${(() => { const fora = sundays.every((d) => awayReason(e.id, d)); const n = folg[e.id] || 0; return fora ? '<td class="num muted">afastado no mês</td>' : `<td class="num ${has && n !== 1 ? 'bad' : ''}">${n}${has && !n ? ' ⚠ sem folga' : has && n > 1 ? ' ⚠ mais de 1' : ''}</td>`; })()}</tr>`).join('')}</tbody></table></div></section>`;
  wire();
}

/** Desenha a escala numa imagem (PNG) de uma pagina, para mandar no WhatsApp. */
function escalaPng() {
  const sundays = C.sundaysOf(mk), W = 1080, pad = 30, dw = 110, cw = (W - pad * 2 - dw) / 3, lh = 28;
  const rows = sundays.map((d) => {
    const cells = C.STORES.map((s) => { const x = dayInfo(d, s.id); const out = [['Folga', x.folga.map(nm), '#b91c1c']];
      if (x.cobre.length) out.push(['Cobre', x.cobre.map((id) => `${nm(id)} (${C.storeById(C.workStore(D.emp(id)))?.nome || ''})`), '#1d4ed8']);
      if (x.afast.length) out.push(['Afast.', x.afast.map((a) => `${nm(a.id)} (${a.why})`), '#6b7280']);
      return out; });
    const lines = Math.max(...cells.map((c) => c.reduce((n, [, names]) => n + Math.max(1, names.length), 0)));
    return { d, cells, h: lines * lh + 24 };
  });
  const H = pad * 2 + 70 + 46 + rows.reduce((a, r) => a + r.h, 0) + 40;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#b91c1c'; g.font = 'bold 34px Arial'; g.textAlign = 'center';
  g.fillText(`FOLGAS DE DOMINGO — ${C.monthLabel(mk).toUpperCase()}`, W / 2, pad + 40);
  g.fillStyle = '#374151'; g.font = '18px Arial'; g.fillText('Rei do Gado · os demais trabalham normalmente', W / 2, pad + 64);
  let y = pad + 80;
  g.fillStyle = '#b91c1c'; g.fillRect(pad, y, W - pad * 2, 46);
  g.fillStyle = '#fff'; g.font = 'bold 22px Arial';
  g.fillText('Domingo', pad + dw / 2, y + 31);
  C.STORES.forEach((s, i) => g.fillText(s.nome, pad + dw + cw * i + cw / 2, y + 31));
  y += 46; g.textAlign = 'left';
  rows.forEach((r, ri) => {
    g.fillStyle = ri % 2 ? '#f9fafb' : '#fff'; g.fillRect(pad, y, W - pad * 2, r.h);
    g.strokeStyle = '#d1d5db'; g.lineWidth = 1; g.strokeRect(pad, y, W - pad * 2, r.h);
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(pad + dw + cw * i, y); g.lineTo(pad + dw + cw * i, y + r.h); g.stroke(); }
    g.fillStyle = '#111827'; g.font = 'bold 24px Arial'; g.fillText(C.fmtDM(r.d), pad + 16, y + 38);
    r.cells.forEach((cell, i) => {
      let yy = y + 34; const x = pad + dw + cw * i + 12;
      for (const [lab, names, cor] of cell) {
        g.fillStyle = cor; g.font = 'bold 16px Arial'; g.fillText(lab, x, yy);
        g.fillStyle = '#111827'; g.font = '19px Arial';
        (names.length ? names : ['—']).forEach((n) => { g.fillText(n, x + 62, yy); yy += lh; });
      }
    });
    y += r.h;
  });
  return c.toDataURL('image/png');
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
      else if (act === 'print') { document.body.classList.add('print-escala'); window.print(); setTimeout(() => document.body.classList.remove('print-escala'), 500); }
      else if (act === 'img') {
        const url = escalaPng();
        const a = document.createElement('a'); a.href = url; a.download = `escala-domingo-${mk}.png`; document.body.appendChild(a); a.click(); a.remove();
        const ok = await copyImageDataUrl(url);
        toast(ok ? 'Imagem copiada — cole direto na conversa do WhatsApp (e também foi baixada).' : 'Imagem baixada — anexe no WhatsApp.');
      }
      else if (act === 'team') openTeam();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function asText() {
  const lines = [`FOLGAS DE DOMINGO - ${C.monthLabel(mk).toUpperCase()}`, '(os demais trabalham normalmente)'];
  for (const d of C.sundaysOf(mk)) {
    lines.push('', `Domingo ${C.fmtDM(d)}`);
    for (const s of C.STORES) {
      const x = dayInfo(d, s.id);
      lines.push(`${s.nome}: Folga: ${lista(x.folga) || '-'}${x.cobre.length ? ` | Cobre: ${x.cobre.map((id) => `${nm(id)} (${C.storeById(C.workStore(D.emp(id)))?.nome || ''})`).join(', ')}` : ''}${x.afast.length ? ` | Afastado: ${x.afast.map((a) => nm(a.id)).join(', ')}` : ''}`);
    }
  }
  return lines.join('\n');
}

async function suggest() {
  const has = Object.values(data.assignments || {}).some((d) => Object.values(d).some((a) => a.length));
  if (has && !(await confirmBox('Já existe escala neste mês. Sugerir novamente substitui tudo o que está lançado. Continuar?', { okLabel: 'Substituir' }))) return;
  const { assignments, shortages } = C.suggestSchedule({ sundays: C.sundaysOf(mk), employees: S.employees, required: S.config.required, unavailable: awayReason, offset: C.parseMonth(mk).m });
  await D.saveSundays(mk, assignments);
  render(root, mk);
  if (shortages.length) toast(`Folgas sugeridas, mas em ${shortages.length} caso(s) a loja fica abaixo do mínimo e nenhuma outra loja tem sobra — veja em vermelho e ajuste em Editar.`, 'err', 9000);
  else toast('Folgas sugeridas: 1 por pessoa no mês, com cobertura de outra loja quando precisa. Ajuste em “Editar”.');
}

function openTeam() {
  const emps = S.employees.filter((e) => e.ativo !== false).sort((a, b) => (C.workStore(a) || '').localeCompare(C.workStore(b) || '') || a.nome.localeCompare(b.nome));
  openModal({
    title: 'Equipe por loja (onde cada um trabalha)', wide: true,
    body: `<p class="muted">A folha continua separada pela loja do <b>registro</b> (imposto). Aqui vale onde a pessoa trabalha de verdade — é o que a escala de domingo usa. Administrativo e “Não trabalha domingo” ficam fora da escala.</p>
      <div class="table-wrap"><table class="grid mini equipe"><thead><tr><th>Funcionário</th><th>Registro (folha)</th><th>Trabalha em</th><th>Função na escala</th></tr></thead><tbody>
      ${emps.map((e) => `<tr data-id="${esc(e.id)}"><td>${esc(e.nome)}</td><td class="muted">${esc(C.storeById(e.loja)?.nome || '')}</td>
        <td><select class="in" data-f="lojaTrabalho">${C.WORK_PLACES.map((w) => `<option value="${w.id}" ${C.workStore(e) === w.id ? 'selected' : ''}>${esc(w.nome)}</option>`).join('')}</select></td>
        <td><select class="in" data-f="categoria">${Object.entries(C.CATEGORIAS).map(([k, v]) => `<option value="${k}" ${e.categoria === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table></div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      let n = 0;
      for (const tr of m.$$('tr[data-id]')) {
        const e = D.emp(tr.dataset.id), lt = tr.querySelector('[data-f=lojaTrabalho]').value, cat = tr.querySelector('[data-f=categoria]').value;
        if (lt === C.workStore(e) && cat === e.categoria) continue;
        await D.saveEmployee({ ...e, lojaTrabalho: lt, categoria: cat }); n++;
      }
      render(root, mk); toast(n ? `Equipe atualizada (${n}). Clique em “Sugerir escala” para refazer com as lojas certas.` : 'Nada mudou.');
    } }],
  });
}

function openReq() {
  const req = S.config.required;
  openModal({
    title: 'Mínimo de pessoas por domingo',
    body: `<table class="mini"><thead><tr><th>Loja</th><th>Atendimento</th><th>Manipulação</th></tr></thead><tbody>${C.STORES.map((s) => `<tr><td>${esc(s.nome)}</td>${CATS.map((c) => `<td><input class="in" type="number" min="0" max="20" data-s="${s.id}" data-c="${c}" value="${req[s.id]?.[c] ?? 0}" style="width:70px"></td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="muted">Mínimo em cada loja por domingo. Se uma folga deixa a loja abaixo disso, a sugestão chama alguém de outra loja que esteja com sobra. Vale para todos os meses.</p>`,
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
  const list = (cat, home) => S.employees.filter((e) => C.inEscala(e) && e.categoria === cat && (home ? C.workStore(e) === storeId : C.workStore(e) !== storeId));
  const item = (e) => { const why = awayReason(e.id, d) || (elsewhere[e.id] ? `escalado em ${elsewhere[e.id]}` : ''); return `<label class="${why ? 'dis' : ''}"><input type="checkbox" value="${esc(e.id)}" ${cur.has(e.id) ? 'checked' : ''} ${why && !cur.has(e.id) ? 'disabled' : ''}> ${esc(e.nome)} ${why ? `<small class="lack">(${esc(why)})</small>` : ''}${C.workStore(e) !== storeId ? `<small> · ${esc(C.workPlaceName(C.workStore(e)))}</small>` : ''}</label>`; };
  openModal({
    title: `${st.nome} — domingo ${C.fmtDM(d)}`, wide: true,
    body: `<div class="grid2 top">${CATS.map((cat) => `<div><h4>${C.CATEGORIAS[cat]} <small>(mínimo ${S.config.required[storeId]?.[cat] ?? 0})</small></h4><div class="checklist">${list(cat, true).map(item).join('') || '<p class="muted">Ninguém cadastrado.</p>'}</div>
      <details ${list(cat, false).some((e) => cur.has(e.id)) ? 'open' : ''}><summary>Cobertura de outras lojas</summary><div class="checklist">${list(cat, false).map(item).join('')}</div></details></div>`).join('')}</div>
      <p class="muted"><b>Marcado = trabalha neste domingo · desmarcado = folga.</b> Para alguém de outra loja cobrir, abra “Cobertura de outras lojas” (tire a pessoa da loja dela primeiro). Afastados aparecem bloqueados.</p>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      const next = { ...data.assignments, [d]: { ...(data.assignments[d] || {}), [storeId]: m.$$('input:checked').map((i) => i.value) } };
      await D.saveSundays(mk, next); render(root, mk);
    } }],
  });
}
