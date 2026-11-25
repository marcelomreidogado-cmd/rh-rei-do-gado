// Escala 5x2 do Rei do Gado (v1.26) — regras aprovadas pelo Marcelo em 24/11/2026 (claude/ESCALA-5x2-REGRAS.md).
// Funcoes puras (sem tela, sem banco):
//  - gerarRei: folgas (segunda fechada + 1 folga de ter a sex; domingo a cada 3 semanas), folga FIXA de quem e fixo
//    da loja (sugerida pelo sistema, ajustavel), folga SOLTA de quem cobre outras lojas (gira para encaixar as
//    coberturas) e cobertura entre lojas com preferencia pela MESMA pessoa na mesma loja.
//  - horasCompensatoria: segue o horario da loja e fecha o MES na media de 42h por semana (42h x dias do mes / 7).
import * as C from './calc.js';

const UTEIS = [2, 3, 4, 5]; // a folga da semana cai de terca a sexta
const minimosDia = (u, dow) => { const o = {}; for (const [f, arr] of Object.entries((u && u.minimos) || {})) o[f] = (arr || [])[dow] || 0; return o; };
const somaMin = (u, dow) => Object.values(minimosDia(u, dow)).reduce((a, n) => a + n, 0);
export const ehVolante = (p) => p.podeCobrir !== false;

/** Dias de folga da semana possiveis para uma loja (abre, nao e dia sem folga, de terca a sexta). */
const candidatos = (un, semFolga) => UTEIS.filter((d) => (un.abre || []).includes(d) && !semFolga.includes(d));

/**
 * Gera a escala do mes.
 * pessoas: [{id, nome, unidade, funcao, funcoes, podeCobrir, folgaFixa?}] · unidades: {id: {abre, minimos, horario, extras}}
 * Retorna { folgas: {id: [datas]}, cobre: {id: {data: loja}}, abaixo: [{date, unidade, funcao, falta}], plano: {id: {grupoDomingo, fixa, volante}} }
 */
export function gerarRei({ weeks, pessoas, unidades, semFolga = [6], unavailable = () => '' }) {
  const dias = weeks.flat();
  const fora0 = new Set(pessoas.filter((p) => dias.filter((d) => unavailable(p.id, d)).length * 2 >= dias.length).map((p) => p.id));
  const ativos = pessoas.filter((p) => !fora0.has(p.id) && unidades[p.unidade]);
  const rede = (dow, fora, d = null) => C.simulaDia({ pessoas, unidades: d ? C.unidadesNoDia(unidades, d) : unidades, dow, fora }).total;
  const ordem = [...ativos].sort((a, b) => a.unidade.localeCompare(b.unidade) || ehVolante(a) - ehVolante(b) || C.funcoesP(a).length - C.funcoesP(b).length || a.funcao.localeCompare(b.funcao) || a.nome.localeCompare(b.nome));
  const plano = {};

  // 1) grupo do domingo de folga (a cada 3 semanas): espalha cada loja/funcao pelos 3 grupos, com a rede coberta
  const grupos = [new Set(fora0), new Set(fora0), new Set(fora0)];
  const vistos = {};
  for (const p of ordem) {
    const un = unidades[p.unidade];
    let g = null;
    if ((un.abre || []).includes(0) && !semFolga.includes(0)) {
      const k = p.unidade + '|' + (C.funcoesP(p).length > 1 ? '*' : p.funcao); const i = vistos[k] = (vistos[k] ?? -1) + 1;
      const mesmo = (gi) => [...grupos[gi]].filter((id) => { const o = pessoas.find((x) => x.id === id); return o && o.unidade === p.unidade && o.funcao === p.funcao; }).length;
      const nota = (gi) => rede(0, new Set([...grupos[gi], p.id])) * 1000 + mesmo(gi) * 10 + grupos[gi].size + ((gi - i + 30) % 3) * 0.01;
      g = [0, 1, 2].sort((a, b) => nota(a) - nota(b))[0];
      grupos[g].add(p.id);
    }
    plano[p.id] = { grupoDomingo: g, volante: ehVolante(p), fixa: null };
  }

  // 2) folga FIXA de quem e fixo da loja: a escolhida na Equipe; senao o sistema sugere o dia em que a rede fica
  // mais coberta (com as coberturas), espalhando a mesma loja/funcao por dias diferentes
  const fixaDia = {}; for (const d of UTEIS) fixaDia[d] = new Set(fora0);
  for (const p of ordem.filter((x) => !ehVolante(x))) {
    const cands = candidatos(unidades[p.unidade], semFolga);
    if (!cands.length) continue;
    let d = cands.includes(Number(p.folgaFixa)) ? Number(p.folgaFixa) : null;
    if (d === null) {
      const mesmaFuncao = (x) => [...fixaDia[x]].filter((id) => { const o = pessoas.find((q) => q.id === id); return o && o.unidade === p.unidade && C.funcoesP(o).some((f) => C.funcoesP(p).includes(f)); }).length;
      const nota = (x) => rede(x, new Set([...fixaDia[x], p.id])) * 1000 + mesmaFuncao(x) * 10 - (somaMin(unidades[p.unidade], 3) - somaMin(unidades[p.unidade], x)) - cands.indexOf(x) * 0.01;
      d = [...cands].sort((a, b) => nota(a) - nota(b))[0];
    }
    fixaDia[d].add(p.id); plano[p.id].fixa = d;
  }

  // 3) semana a semana: domingo de folga (grupo), folga fixa e folga solta dos volantes (onde a rede fica coberta)
  const folgas = {}; for (const p of pessoas) folgas[p.id] = [];
  const anterior = {};
  weeks.forEach((week, w) => {
    const data = (dow) => week[(dow + 6) % 7];
    const foraSem = {}; for (let dow = 0; dow < 7; dow++) foraSem[dow] = new Set([...fora0, ...pessoas.filter((p) => unavailable(p.id, data(dow))).map((p) => p.id)]);
    const domOff = (p) => plano[p.id]?.grupoDomingo != null && (C.semanaCorrida(week[0]) + plano[p.id].grupoDomingo) % 3 === 0;
    const dele = {};
    for (const p of ativos) {
      dele[p.id] = [];
      if (domOff(p)) { dele[p.id].push(0); foraSem[0].add(p.id); continue; }
      if (!ehVolante(p) && plano[p.id].fixa != null) { dele[p.id].push(plano[p.id].fixa); foraSem[plano[p.id].fixa].add(p.id); }
    }
    // volantes: quem tem menos opcao escolhe primeiro; a ordem gira a cada semana
    const vol = ativos.filter((p) => ehVolante(p) && !domOff(p)).map((p, k) => ({ p, k }))
      .sort((x, y) => candidatos(unidades[x.p.unidade], semFolga).length - candidatos(unidades[y.p.unidade], semFolga).length || ((x.k + w) % 97) - ((y.k + w) % 97)).map((x) => x.p);
    for (const p of vol) {
      const cands = candidatos(unidades[p.unidade], semFolga);
      if (!cands.length) continue;
      const sobra = (dow, fora) => { const un = unidades[p.unidade]; const min = somaMin(un, dow); return (pessoas.filter((o) => o.unidade === p.unidade && !fora.has(o.id)).length - min) / Math.max(1, min); };
      const nota = (dow) => { const fora = new Set([...foraSem[dow], p.id]); return rede(dow, fora, data(dow)) * 1000 - sobra(dow, fora) * 10 + (anterior[p.id] === dow ? 3 : 0) + ((cands.indexOf(dow) + w) % cands.length) * 0.01; };
      const d = [...cands].sort((a, b) => nota(a) - nota(b))[0];
      dele[p.id].push(d); foraSem[d].add(p.id); anterior[p.id] = d;
    }
    for (const [id, l] of Object.entries(dele)) for (const dow of l) folgas[id].push(data(dow));
  });
  for (const id of Object.keys(folgas)) folgas[id].sort();
  C.aplicaExtras({ weeks, pessoas, unidades, folgas, semFolga, unavailable });

  const cobre = cobrirRei({ weeks, pessoas, unidades, folgas, unavailable });
  const abaixo = C.faltas5x2({ weeks, pessoas, unidades, folgas, cobre, unavailable });
  return { folgas, cobre, abaixo, plano };
}

/**
 * Cobertura entre lojas: onde a loja fica abaixo do minimo, vem alguem que COBRE OUTRAS LOJAS, trabalhando no dia,
 * cuja loja nao fica pior sem ele. Prefere quem ja cobriu AQUELA loja (mesma pessoa), depois quem cobriu menos.
 * Coberturas ja lancadas (inicial) ficam. Retorna {pessoaId: {data: loja}}.
 */
export function cobrirRei({ weeks, pessoas, unidades, folgas, cobre: inicial = {}, unavailable = () => '' }) {
  const cobre = JSON.parse(JSON.stringify(inicial || {}));
  const vezes = {}, afin = {};
  const conta = (id, u) => { vezes[id] = (vezes[id] || 0) + 1; (afin[id] = afin[id] || {})[u] = (afin[id][u] || 0) + 1; };
  for (const [id, m] of Object.entries(cobre)) for (const u of Object.values(m)) conta(id, u);
  const pref = (p, u) => (afin[p.id] || {})[u] || 0;
  for (const week of weeks) for (const d of week) {
    const fora = new Set(pessoas.filter((p) => unavailable(p.id, d) || (folgas[p.id] || []).includes(d)).map((p) => p.id));
    const fixo = {}; for (const [id, m] of Object.entries(cobre)) if (m && m[d]) fixo[id] = m[d];
    const r = C.simulaDia({ pessoas, unidades: C.unidadesNoDia(unidades, d), dow: C.weekday(d), fora, cobre: fixo, vezes, pref });
    for (const [id, u] of Object.entries(r.cobre)) if (!(cobre[id] || {})[d]) { (cobre[id] = cobre[id] || {})[d] = u; conta(id, u); }
  }
  return cobre;
}

/**
 * Horas na sugestao COMPENSATORIA: cada dia no horario da loja onde a pessoa esta; o MES fecha a media da jornada
 * (42h x dias do mes / 7, sem os dias de afastamento). A diferenca vai nos dias de semana (ter-sex) de 5 em 5 min,
 * sempre no dia com menos horas (falta: entra mais cedo, nunca antes de inicioMin e no maximo maxDia de trabalho)
 * ou com mais horas (sobra: entra mais tarde). Nunca passa da meta do mes. Feriado/abertura extra: fixo e fora da
 * conta. Mesmo formato de C.turnos5x2 + mes: {min, alvo}.
 */
export function horasCompensatoria({ weeks, mk, pessoas, unidades, folgas, cobre = {}, unavailable = () => '', almoco = 60, jornada = 0, inicioMin = '07:00', maxDia = 10 }) {
  const out = {};
  const hm = (t) => { const m = /^(\d{1,2}):?(\d{2})?$/.exec(String(t || '').trim()); return m ? +m[1] * 60 + +(m[2] || 0) : null; };
  const hhmm = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  const ini0 = hm(inicioMin) ?? 420;
  const trab = (t) => { let dur = t.b - t.a; if (dur > 360) dur -= almoco; else if (dur > 240) dur -= 15; return dur; };
  const noMes = (d) => d.slice(0, 7) === mk;
  for (const p of pessoas) {
    const lista = [];
    let afastadoDias = 0;
    for (const week of weeks) for (const d of week) {
      if (unavailable(p.id, d)) { if (noMes(d)) afastadoDias++; continue; }
      if ((folgas[p.id] || []).includes(d)) continue;
      const u = (cobre[p.id] || {})[d] || p.unidade;
      const un = C.unidadesNoDia(unidades, d)[u];
      if (!un || !(un.abre || []).includes(C.weekday(d))) continue;
      const h = (un.horario || {})[C.weekday(d)] || [];
      const a = hm(h[0]), b = hm(h[1]); if (a === null || b === null) continue;
      const especial = !!(unidades[u]?.extras || {})[d];
      lista.push({ d, a, b, abre: a, especial, ajusta: !especial && noMes(d) && UTEIS.includes(C.weekday(d)) });
    }
    const dm = C.daysInMonth(mk);
    const alvo = Math.round(C.metaSemanal(C.monthStart(mk), jornada) * 60 * (dm - afastadoDias) / 7);
    const doMes = lista.filter((t) => noMes(t.d) && !t.especial);
    const soma = () => doMes.reduce((s, t) => s + trab(t), 0);
    const aj = lista.filter((t) => t.ajusta);
    for (let g = 0; g < 4000 && soma() < alvo; g++) {
      const c = aj.filter((t) => t.a - 5 >= ini0 && trab({ ...t, a: t.a - 5 }) <= maxDia * 60 && soma() - trab(t) + trab({ ...t, a: t.a - 5 }) <= alvo)
        .sort((x, y) => trab(x) - trab(y) || x.d.localeCompare(y.d))[0];
      if (!c) break; c.a -= 5;
    }
    for (let g = 0; g < 4000 && soma() > alvo; g++) {
      const c = aj.filter((t) => t.a + 5 < t.b - 60 && trab({ ...t, a: t.a + 5 }) > 360).sort((x, y) => trab(y) - trab(x) || x.d.localeCompare(y.d))[0];
      if (!c) break; c.a += 5;
    }
    const dias = {};
    for (const t of lista) dias[t.d] = { ini: hhmm(t.a), fim: hhmm(t.b), horas: trab(t) / 60, cedo: t.a < t.abre, tarde: t.a > t.abre };
    const semanas = weeks.map((week) => {
      const ts = lista.filter((t) => week.includes(t.d));
      const norm = ts.filter((t) => !t.especial).reduce((s, t) => s + trab(t), 0), esp = ts.filter((t) => t.especial).reduce((s, t) => s + trab(t), 0);
      const n = ts.filter((t) => !t.especial).length;
      return { inicio: week[0], horas: (norm + esp) / 60, normais: norm / 60, especiais: esp / 60, meta: C.metaSemanal(week[0], jornada) * Math.min(n, 5) / 5, metaCheia: C.metaSemanal(week[0], jornada), afastado: week.some((d) => unavailable(p.id, d)), dias: n, proprio: false, comp: true };
    });
    out[p.id] = { dias, semanas, mes: { min: soma(), alvo } };
  }
  return out;
}
