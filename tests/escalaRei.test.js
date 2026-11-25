// Escala 5x2 do Rei do Gado v1.26 — regras aprovadas em 24/11/2026 (claude/ESCALA-5x2-REGRAS.md). Dados ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/js/calc.js';
import * as E from '../public/js/escalaRei.js';

const FS = [0, 2, 3, 4, 5, 6]; // segunda fechada
const hor = { 0: ['09:00', '14:00'], 2: ['09:30', '19:00'], 3: ['09:30', '19:00'], 4: ['09:30', '19:00'], 5: ['09:30', '19:00'], 6: ['09:00', '19:30'] };
const loja = (nome, a, m) => ({ nome, abre: FS, horario: hor, minimos: { atendimento: a, manipulacao: m } });
const unidades = {
  bingen: loja('Bingen', [1, 0, 1, 1, 1, 1, 1], [1, 0, 1, 1, 1, 1, 1]),
  correas: loja('Correas', [1, 0, 1, 1, 1, 1, 1], [1, 0, 1, 1, 1, 1, 1]),
  coronel: loja('Coronel', [2, 0, 2, 2, 2, 2, 2], [1, 0, 1, 1, 2, 1, 1]), // terca 2 atend.; quinta 2 + 2
};
const P = (id, unidade, f, cobre, extra = {}) => ({ id, nome: id, unidade, funcao: f === 'h' ? 'atendimento' : f, funcoes: f === 'h' ? ['atendimento', 'manipulacao'] : [f], podeCobrir: cobre, ...extra });
const equipe = () => [P('ana', 'bingen', 'atendimento', false), P('ivo', 'bingen', 'manipulacao', true), P('joana', 'bingen', 'atendimento', true),
  P('gil', 'correas', 'atendimento', true), P('tais', 'correas', 'manipulacao', false), P('vera', 'correas', 'h', false),
  P('caio', 'coronel', 'manipulacao', true), P('jair', 'coronel', 'h', false), P('pedro', 'coronel', 'manipulacao', false)];
const mk = '2026-12';
const weeks = C.semanasDoMes(mk);
const ferias = (id, d) => (id === 'gil' && d >= '2026-12-30' ? 'férias' : '');

test('v1.26: 2 folgas por semana (segunda fechada + 1), nunca sábado, domingo a cada 3 semanas', () => {
  const ps = equipe();
  const r = E.gerarRei({ weeks, pessoas: ps, unidades, unavailable: ferias });
  for (const p of ps) {
    weeks.forEach((w) => {
      if (w.some((d) => ferias(p.id, d))) return;
      const f = w.filter((d) => r.folgas[p.id].includes(d));
      assert.equal(f.length, 1, `${p.id} semana ${w[0]}: 1 folga além da segunda (${f})`);
      assert.ok(!f.some((d) => C.weekday(d) === 6), `${p.id}: nunca folga no sábado`);
      assert.ok(!f.some((d) => C.weekday(d) === 1), `${p.id}: segunda já é fechada`);
    });
    const doms = r.folgas[p.id].filter((d) => C.weekday(d) === 0);
    for (let i = 1; i < doms.length; i++) assert.equal(C.isoDiffDays(doms[i - 1], doms[i]), 21, `${p.id}: domingo de folga a cada 3 semanas`);
  }
});

test('v1.26: quem é fixo da loja folga sempre no mesmo dia; a escolha da Equipe é respeitada', () => {
  const ps = equipe(); ps.find((p) => p.id === 'tais').folgaFixa = 3; // quarta
  const r = E.gerarRei({ weeks, pessoas: ps, unidades, unavailable: ferias });
  for (const p of ps.filter((x) => !E.ehVolante(x))) {
    const dias = new Set(r.folgas[p.id].filter((d) => C.weekday(d) !== 0).map((d) => C.weekday(d)));
    assert.equal(dias.size, 1, `${p.id}: folga fixa num só dia da semana (${[...dias]})`);
    assert.equal([...dias][0], r.plano[p.id].fixa);
  }
  assert.equal(r.plano.tais.fixa, 3, 'folga fixa escolhida na Equipe');
});

test('v1.26: só quem cobre outras lojas vai cobrir; a mesma pessoa cobre a mesma loja; abaixo do mínimo só onde não dá', () => {
  const ps = equipe();
  const r = E.gerarRei({ weeks, pessoas: ps, unidades, unavailable: ferias });
  const porLoja = {};
  for (const [id, m] of Object.entries(r.cobre)) {
    const p = ps.find((x) => x.id === id);
    assert.ok(E.ehVolante(p), `${id} não cobre outras lojas e foi cobrir`);
    for (const [d, u] of Object.entries(m)) {
      assert.notEqual(u, p.unidade); assert.ok(!r.folgas[id].includes(d), `${id} cobrindo no dia de folga ${d}`);
      ((porLoja[u] = porLoja[u] || {})[id] = (porLoja[u][id] || 0) + 1);
    }
  }
  // a Coronel tem 1 pessoa de atendimento (híbrido) para 2 no mínimo: alguém de outra loja cobre quase todo dia, sempre a mesma pessoa
  const cor = Object.values(porLoja.coronel || {}).sort((a, b) => b - a);
  assert.ok(cor[0] >= 15, `a mesma pessoa cobre a Coronel na maior parte dos dias (${JSON.stringify(porLoja.coronel)})`);
  // fora da Coronel (e das férias), todas as lojas ficam no mínimo
  const outras = r.abaixo.filter((x) => x.unidade !== 'coronel' && x.date < '2026-12-30');
  assert.deepEqual(outras, [], 'Bingen e Correas sempre no mínimo');
  assert.ok(r.abaixo.length <= 12, `poucos dias abaixo do mínimo (${r.abaixo.length})`);
});

test('v1.26: horas — compensatória fecha o mês na média de 42h/semana; a outra sugestão nunca passa de 42h na semana', () => {
  const ps = equipe();
  const r = E.gerarRei({ weeks, pessoas: ps, unidades, unavailable: ferias });
  const A = E.horasCompensatoria({ weeks, mk, pessoas: ps, unidades, folgas: r.folgas, cobre: r.cobre, unavailable: ferias });
  for (const p of ps) {
    const { min, alvo } = A[p.id].mes;
    assert.ok(min <= alvo && min > alvo - 5, `${p.id}: mês ${C.fmtH(min / 60)} de ${C.fmtH(alvo / 60)}`);
    for (const v of Object.values(A[p.id].dias)) assert.ok(v.ini >= '07:00' && v.horas <= 10, `${p.id}: entrada ${v.ini}, ${v.horas}h`);
  }
  assert.equal(A.ana.mes.alvo, Math.round(42 * 60 * 31 / 7), 'dezembro: 42h × 31 ÷ 7 = 186h');
  assert.equal(A.gil.mes.alvo, Math.round(42 * 60 * 29 / 7), 'férias tiram os dias da meta do mês');
  const B = C.turnos5x2({ weeks, pessoas: ps, unidades, folgas: r.folgas, cobre: r.cobre, unavailable: ferias, almoco: 60 });
  for (const p of ps) for (const s of B[p.id].semanas) assert.ok(s.normais <= 42 + 1e-9, `${p.id} ${s.inicio}: ${C.fmtH(s.normais)}`);
  // horário da loja sem ajuste: semana que trabalha domingo 39h45, de folga no domingo 43h30 (o lanche é dentro da jornada)
  assert.equal(C.minutosTurno(9.5, 19, 60), 510); assert.equal(C.minutosTurno(9, 19.5, 60), 570); assert.equal(C.minutosTurno(9, 14, 60), 285);
});

test('v1.27: Meu horário é ponto de partida — a entrada se ajusta e a semana não passa de 42h', () => {
  const ps = equipe();
  const r = E.gerarRei({ weeks, pessoas: ps, unidades, unavailable: ferias });
  // Meu horário 8:00–19:00 (10h de trabalho por dia) em todos os dias de semana: passaria muito de 42h
  const turnoDe = (pid, d) => (UTEIS_T.includes(C.weekday(d)) ? { ini: '08:00', fim: '19:00', idx: 0, k: 1, livre: true, fixo: false } : null);
  const B = C.turnos5x2({ weeks, pessoas: ps, unidades, folgas: r.folgas, cobre: r.cobre, unavailable: ferias, almoco: 60, turnoDe });
  for (const p of ps) for (const s of B[p.id].semanas) assert.ok(s.normais <= 42 + 1e-9, `${p.id} ${s.inicio}: ${C.fmtH(s.normais)} (entrada ajustada)`);
  assert.ok(Object.values(B.ana.dias).some((v) => v.ini > '08:00'), 'entrou mais tarde que o Meu horário para não passar');
});
const UTEIS_T = [2, 3, 4, 5];

test('v1.27: sugestão nos dias abaixo do mínimo e escala toda fixa', () => {
  const ps = equipe();
  const r = E.gerarRei({ weeks, pessoas: ps, unidades, unavailable: ferias });
  const sg = E.sugestoesAbaixo({ weeks, pessoas: ps, unidades, folgas: r.folgas, cobre: r.cobre, unavailable: ferias, abaixo: r.abaixo });
  assert.equal(sg.length, r.abaixo.length);
  for (const x of sg) {
    assert.ok(x.opcoes.length >= 1 && x.opcoes.some((o) => o.tipo === 'extra'), 'sempre tem a opção de extra');
    for (const o of x.opcoes.filter((y) => y.aplica)) {
      const depois = C.faltas5x2({ weeks, pessoas: ps, unidades, folgas: o.aplica.folgas, cobre: o.aplica.cobre, unavailable: ferias });
      assert.ok(!depois.some((y) => y.date === x.date && y.unidade === x.unidade && y.funcao === x.funcao && y.falta >= x.falta), `${o.texto}: resolve o dia`);
    }
  }
  // domingo: a rede precisa de 7 e trabalham 6 (cada um folga 1 domingo a cada 3 semanas)
  const dom = sg.find((x) => C.weekday(x.date) === 0);
  if (dom) assert.deepEqual(E.balancoDia({ pessoas: ps, unidades, folgas: r.folgas, unavailable: ferias, d: dom.date }), { precisa: 7, trabalham: 6 });
  const f = E.gerarRei({ weeks, pessoas: ps, unidades, unavailable: ferias, todasFixas: true });
  for (const p of ps) { const dd = new Set(f.folgas[p.id].filter((d) => C.weekday(d) !== 0 && !ferias(p.id, d)).map((d) => C.weekday(d))); assert.ok(dd.size <= 1, `${p.id}: fixa num só dia (${[...dd]})`); }
});

test('v1.27: a loja nunca abre descoberta — alguém abre e a diferença sai em outro dia, sem passar de 42h', () => {
  const ps = equipe();
  // todos da Correas na mesma semana de folga no domingo (entram mais tarde em todos os dias de semana)
  const r = E.gerarRei({ weeks, pessoas: ps, unidades, unavailable: ferias });
  const carga = C.turnos5x2({ weeks, pessoas: ps, unidades, folgas: r.folgas, cobre: r.cobre, unavailable: ferias, almoco: 60 });
  for (const p of ps.filter((x) => x.unidade === 'correas')) for (const [d, v] of Object.entries(carga[p.id].dias)) if ([2, 3, 4, 5].includes(C.weekday(d))) { v.ini = '09:55'; v.horas = (19 * 60 - 595 - 60) / 60; }
  E.garanteAbertura({ weeks, pessoas: ps, unidades, folgas: r.folgas, cobre: r.cobre, unavailable: ferias, carga });
  const onde = (p, d) => ((r.folgas[p.id] || []).includes(d) || ferias(p.id, d) ? null : (r.cobre[p.id] || {})[d] || p.unidade);
  let descobertos = 0;
  for (const d of weeks.flat()) for (const u of Object.keys(unidades)) {
    if (!(unidades[u].abre || []).includes(C.weekday(d))) continue;
    const ts = ps.filter((p) => onde(p, d) === u).map((p) => carga[p.id].dias[d]).filter(Boolean);
    if (ts.length && !ts.some((t) => t.ini <= unidades[u].horario[C.weekday(d)][0])) descobertos++;
  }
  assert.equal(descobertos, 0, 'toda loja tem alguém na abertura');
  for (const p of ps) for (const s of carga[p.id].semanas) assert.ok(s.normais <= 42 + 1e-9, `${p.id} ${s.inicio}: ${C.fmtH(s.normais)}`);
});
