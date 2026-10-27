// Escala 5x2 — SIMULACAO (EC 141/2026, fim da escala 6x1). Separada da escala de domingo atual.
// Cada funcionario trabalha 5 dias e folga 2 por semana; a loja precisa ter o minimo de atendimento e
// manipulacao em cada dia. Os dados ficam em rh_sundays/5x2-AAAA-MM (folgas) e rh_sundays/5x2-config (minimos).
import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, toast, openModal, confirmBox } from '../ui.js';
import { awayReason } from './escala.js';

let root, mk, st; // st = { folgas, minimos, domingo3, existe }
const CATS = ['atendimento', 'manipulacao'];
const CAT_CURTO = { atendimento: 'Atend.', manipulacao: 'Manip.' };
const short = (n) => { const t = String(n).split(/\s+/); const a = t[0].charAt(0) + t[0].slice(1).toLowerCase(); const b = t[1] && !['DA', 'DE', 'DO', 'DAS', 'DOS'].includes(t[1].toUpperCase()) ? ' ' + t[1][0].toUpperCase() + '.' : ''; return a + b; };
const equipe = (sid) => S.employees.filter((e) => C.inEscala(e) && C.workStore(e) === sid).sort((a, b) => CATS.indexOf(a.categoria) - CATS.indexOf(b.categoria) || a.nome.localeCompare(b.nome));
const isFolga = (id, d) => (st.folgas[id] || []).includes(d);

export async function render(el, month) {
  root = el; mk = month;
  st = await D.load5x2(mk);
  const weeks = C.semanasDoMes(mk);
  const days = weeks.flat();
  const chk = C.conferir5x2({ weeks, employees: S.employees, minimos: st.minimos, folgas: st.folgas, unavailable: awayReason, domingo3: st.domingo3 });
  const defKey = new Set(chk.deficits.map((x) => `${x.store}|${x.date}|${x.cat}`));
  const avisosDe = (id) => chk.avisos.filter((a) => a.empId === id);

  root.innerHTML = `<div class="toolbar"><strong>Escala 5x2 — simulação — ${esc(C.monthLabel(mk))}</strong><span class="spacer"></span>
    <button class="btn" data-act="min">⚙ O que cada loja precisa por dia</button>
    <button class="btn primary" data-act="suggest">✨ Sugerir folgas 5x2</button><button class="btn" data-act="clear" ${st.existe ? '' : 'disabled'}>Limpar</button>
    <button class="btn" data-act="print">🖨 Imprimir</button></div>
    <details class="warn-box regras5x2"><summary><b>Regras usadas na simulação</b> (EC 141/2026 — fim da escala 6x1)</summary><ul>
      <li>Cada funcionário <b>trabalha 5 dias e folga 2 por semana</b> (semana de segunda a domingo).</li>
      <li>Jornada: <b>42 h por semana</b> a partir do início da 5x2 (60 dias após 16/10/2026 → meados de dez/2026), cerca de <b>8h24 por dia</b> em 5 dias; <b>40 h</b> (8 h/dia) 12 meses depois. Sem redução de salário.</li>
      <li>Comércio: a folga precisa cair num <b>domingo pelo menos 1 vez a cada 3 semanas</b> ${st.domingo3 ? '(ligado)' : '<b>(desligado)</b>'}.</li>
      <li>Outro arranjo (ex.: 6x1) só com acordo/convenção coletiva, compensando no mesmo mês. Confirme os detalhes com a contabilidade antes de aplicar.</li></ul></details>
    <div class="cards5x2">${C.STORES.map((s) => { const eq = equipe(s.id); return `<div class="card5x2"><h3>${esc(s.nome)}</h3>${CATS.map((c) => {
      const tem = eq.filter((e) => e.categoria === c).length, precisa = C.equipeMinima5x2(st.minimos, s.id, c);
      return `<p><b>${C.CATEGORIAS[c]}</b>: tem <b>${tem}</b>, precisa de pelo menos <b>${precisa}</b> ${tem >= precisa ? '<span class="badge closed">ok</span>' : `<span class="badge warn">faltam ${precisa - tem}</span>`}<br><small class="muted">por dia: ${Object.keys(C.TIPOS_DIA).map((t) => `${C.TIPOS_DIA[t]} ${st.minimos[s.id][t][c]}`).join(' · ')}</small></p>`; }).join('')}</div>`; }).join('')}</div>
    ${st.existe ? '' : '<div class="empty"><p>Nenhuma simulação neste mês. Confira <b>o que cada loja precisa por dia</b> e clique em <b>✨ Sugerir folgas 5x2</b>. Depois clique nos dias para trocar folga ↔ trabalho.</p></div>'}
    ${chk.deficits.length && st.existe ? `<div class="warn-box">⚠ <b>${chk.deficits.length}</b> dia(s)/função abaixo do mínimo — veja em vermelho nas linhas de total. Com a equipe atual não fecha: precisa contratar, mudar alguém de loja ou ajustar o mínimo.</div>` : ''}
    ${st.existe ? C.STORES.map((s) => { const eq = equipe(s.id); if (!eq.length) return ''; return `<section class="store"><h2>${esc(s.nome)}</h2><div class="table-wrap"><table class="grid g5x2"><thead><tr><th class="c-nome">Funcionário</th>${days.map((d) => `<th class="${C.weekday(d) === 0 ? 'dom' : ''} ${d.slice(0, 7) !== mk ? 'fora' : ''} ${weeks.some((w) => w[0] === d) ? 'ini' : ''}"><small>${C.DIAS_SEM[C.weekday(d)]}</small><br>${d.slice(8)}</th>`).join('')}<th>Folgas</th><th>Dom. folga</th></tr></thead><tbody>
      ${eq.map((e) => { const av = avisosDe(e.id); return `<tr><td class="c-nome" title="${esc(e.nome)}">${esc(short(e.nome))} <small class="muted">${CAT_CURTO[e.categoria]}</small>${av.length ? ` <span class="badge warn" title="${esc(av.map((a) => a.texto).join('\n'))}">⚠ ${av.length}</span>` : ''}</td>${days.map((d) => { const why = awayReason(e.id, d); const f = isFolga(e.id, d);
        return `<td class="cel ${why ? 'afast' : f ? 'folga' : 'trab'} ${C.weekday(d) === 0 ? 'dom' : ''} ${d.slice(0, 7) !== mk ? 'fora' : ''} ${weeks.some((w) => w[0] === d) ? 'ini' : ''}" ${why ? `title="${esc(why)}"` : `data-e="${esc(e.id)}" data-d="${d}" title="${f ? 'Folga — clique para trabalhar' : 'Trabalha — clique para folgar'}"`}>${why ? 'A' : f ? 'F' : 'T'}</td>`; }).join('')}
        <td class="num">${days.filter((d) => d.slice(0, 7) === mk && isFolga(e.id, d)).length}</td><td class="num">${days.filter((d) => d.slice(0, 7) === mk && C.weekday(d) === 0 && isFolga(e.id, d)).length}</td></tr>`; }).join('')}
      ${CATS.map((c) => `<tr class="tot"><td class="c-nome">${C.CATEGORIAS[c]} trabalhando</td>${days.map((d) => { const tem = eq.filter((e) => e.categoria === c && !awayReason(e.id, d) && !isFolga(e.id, d)).length; const min = st.minimos[s.id][C.tipoDia(d)][c]; const bad = defKey.has(`${s.id}|${d}|${c}`);
        return `<td class="num ${bad ? 'falta' : ''} ${d.slice(0, 7) !== mk ? 'fora' : ''}" title="mínimo ${min}">${tem}/${min}</td>`; }).join('')}<td></td><td></td></tr>`).join('')}
      </tbody></table></div></section>`; }).join('') : ''}
    <p class="muted small">T = trabalha · F = folga · A = afastado (falta, atestado, licença, INSS ou férias). Colunas em cinza são de semanas que entram no mês seguinte/anterior. Usa a loja onde a pessoa <b>trabalha</b> (Escala de domingo → Equipe por loja). Esta simulação não muda a escala de domingo atual.</p>`;
  wire();
}

let wiredRoot = null;
function wire() {
  if (wiredRoot === root) return; wiredRoot = root;
  root.addEventListener('click', async (ev) => {
    const cel = ev.target.closest('td.cel[data-e]');
    if (cel) {
      const id = cel.dataset.e, d = cel.dataset.d;
      const l = new Set(st.folgas[id] || []);
      if (l.has(d)) l.delete(d); else l.add(d);
      st.folgas = { ...st.folgas, [id]: [...l].sort() };
      try { await D.save5x2(mk, st.folgas); render(root, mk); } catch (e) { toast(e.message, 'err'); }
      return;
    }
    const b = ev.target.closest('[data-act]'); if (!b) return;
    try {
      if (b.dataset.act === 'suggest') await suggest();
      else if (b.dataset.act === 'clear') { if (await confirmBox('Apagar a simulação 5x2 deste mês?', { danger: true, okLabel: 'Apagar' })) { await D.clear5x2(mk); render(root, mk); } }
      else if (b.dataset.act === 'min') openMin();
      else if (b.dataset.act === 'print') window.print();
    } catch (e) { toast(e.message, 'err'); }
  });
}

async function suggest() {
  if (st.existe && !(await confirmBox('Já existe simulação neste mês. Sugerir de novo substitui as folgas lançadas. Continuar?', { okLabel: 'Substituir' }))) return;
  const { folgas, deficits } = C.sugerir5x2({ weeks: C.semanasDoMes(mk), employees: S.employees, minimos: st.minimos, unavailable: awayReason, domingo3: st.domingo3, offset: C.parseMonth(mk).m });
  await D.save5x2(mk, folgas);
  await D.log('escala_5x2_sugerida', mk);
  await render(root, mk);
  toast(deficits.length ? `Folgas sugeridas, mas em ${deficits.length} dia(s)/função a loja fica abaixo do mínimo (em vermelho).` : 'Folgas 5x2 sugeridas: 2 por semana para cada um, com todos os mínimos cobertos. Clique nos dias para ajustar.', deficits.length ? 'err' : 'ok', 9000);
}

function openMin() {
  const m = st.minimos;
  openModal({
    title: 'O que cada loja precisa por dia (escala 5x2)', wide: true,
    body: `<p class="muted">Mínimo de pessoas trabalhando em cada dia. A simulação dá 2 folgas por semana para cada um sem deixar a loja abaixo disso.</p>
      <div class="table-wrap"><table class="mini"><thead><tr><th>Loja</th>${Object.values(C.TIPOS_DIA).map((t) => `<th colspan="2">${t}</th>`).join('')}</tr><tr><th></th>${Object.keys(C.TIPOS_DIA).map(() => '<th>Atend.</th><th>Manip.</th>').join('')}</tr></thead><tbody>
      ${C.STORES.map((s) => `<tr><td><b>${esc(s.nome)}</b></td>${Object.keys(C.TIPOS_DIA).map((t) => CATS.map((c) => `<td><input class="in" type="number" min="0" max="20" style="width:64px" data-s="${s.id}" data-t="${t}" data-c="${c}" value="${m[s.id][t][c]}"></td>`).join('')).join('')}</tr>`).join('')}
      </tbody></table></div>
      <label class="inline" style="margin-top:10px"><input type="checkbox" id="m_dom" ${st.domingo3 ? 'checked' : ''}> Folga no domingo pelo menos 1 vez a cada 3 semanas (regra do comércio)</label>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (mm) => {
      const n = {}; for (const s of C.STORES) { n[s.id] = {}; for (const t of Object.keys(C.TIPOS_DIA)) n[s.id][t] = {}; }
      mm.$$('input[data-s]').forEach((i) => { n[i.dataset.s][i.dataset.t][i.dataset.c] = Math.max(0, Math.floor(+i.value || 0)); });
      await D.save5x2Config(n, mm.$('#m_dom').checked);
      await render(root, mk); toast('Mínimos salvos. Clique em “Sugerir folgas 5x2” para refazer a simulação.');
    } }],
  });
}
