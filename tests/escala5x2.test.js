import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/js/calc.js';

const E = (id, loja, cat) => ({ id, nome: id, loja, categoria: cat });
const coronel = [E('a1', 'coronel', 'atendimento'), E('a2', 'coronel', 'atendimento'), E('a3', 'coronel', 'atendimento'), E('a4', 'coronel', 'atendimento'),
  E('m1', 'coronel', 'manipulacao'), E('m2', 'coronel', 'manipulacao')];

test('semanas do mes vao de segunda a domingo e cobrem o mes', () => {
  const w = C.semanasDoMes('2026-12');
  assert.equal(w[0][0], '2026-11-30'); assert.equal(C.weekday(w[0][0]), 1);
  assert.equal(w.at(-1)[6], '2027-01-03'); assert.equal(C.weekday(w.at(-1)[6]), 0);
  assert.equal(C.tipoDia('2026-12-06'), 'domingo'); assert.equal(C.tipoDia('2026-12-05'), 'sabado'); assert.equal(C.tipoDia('2026-12-07'), 'semana');
});

test('equipe minima em 5x2 (Coronel: 2 atend + 1 manip na semana)', () => {
  const m = C.DEFAULT_MIN_5X2;
  assert.equal(C.equipeMinima5x2(m, 'coronel', 'atendimento'), 3); // 2*6 + 1 = 13 pessoa-dia / 5 = 2,6 -> 3
  assert.equal(C.equipeMinima5x2(m, 'coronel', 'manipulacao'), 2); // 7/5 -> 2
  assert.equal(C.equipeMinima5x2({ x: { semana: { atendimento: 1 } } }, 'x', 'atendimento'), 1);
});

test('sugestao 5x2: 2 folgas por semana, minimos respeitados e domingo a cada 3 semanas', () => {
  const weeks = C.semanasDoMes('2026-12');
  const minimos = { coronel: C.DEFAULT_MIN_5X2.coronel, bingen: {}, correas: {} };
  const { folgas, deficits } = C.sugerir5x2({ weeks, employees: coronel, minimos });
  for (const e of coronel) for (const w of weeks) assert.equal(w.filter((d) => folgas[e.id].includes(d)).length, 2, `${e.id} ${w[0]}`);
  assert.deepEqual(deficits, []);
  const chk = C.conferir5x2({ weeks, employees: coronel, minimos, folgas });
  assert.deepEqual(chk.deficits, []); assert.deepEqual(chk.avisos, []);
  // folgas juntas na maioria das semanas
  let juntas = 0, total = 0;
  for (const e of coronel) for (const w of weeks) { const k = w.map((d, i) => (folgas[e.id].includes(d) ? i : -1)).filter((i) => i >= 0); total++; if (k[1] - k[0] === 1) juntas++; }
  assert.ok(juntas / total >= 0.5, `${juntas}/${total}`);
});

test('sugestao 5x2 aponta falta de gente quando a equipe nao fecha', () => {
  const weeks = C.semanasDoMes('2026-12');
  const pouca = coronel.filter((e) => ['a1', 'a2', 'm1'].includes(e.id)); // 2 atend + 1 manip: nao cobre 2+1 todo dia com 2 folgas
  const { deficits } = C.sugerir5x2({ weeks, employees: pouca, minimos: { coronel: C.DEFAULT_MIN_5X2.coronel } });
  assert.ok(deficits.length > 0 && deficits.every((x) => x.store === 'coronel'));
});

test('afastado: dias fora contam como folga da semana', () => {
  const weeks = C.semanasDoMes('2026-12');
  const unavailable = (id, d) => id === 'a1' && d >= '2026-12-07' && d <= '2026-12-13';
  const { folgas } = C.sugerir5x2({ weeks, employees: coronel, minimos: { coronel: C.DEFAULT_MIN_5X2.coronel }, unavailable });
  assert.equal(weeks[1].filter((d) => folgas.a1.includes(d)).length, 0);
});
