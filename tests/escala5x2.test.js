import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/js/calc.js';

const P = (id, unidade, funcao) => ({ id, nome: id, unidade, funcao });
const FECHA_SEG = [0, 2, 3, 4, 5, 6];
const lojas = {
  coronel: { nome: 'Coronel', abre: FECHA_SEG, minimos: { atendimento: [1, 0, 2, 2, 2, 2, 2], manipulacao: [1, 0, 1, 1, 1, 1, 1] } },
  bingen: { nome: 'Bingen', abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1], manipulacao: [1, 0, 1, 1, 1, 1, 1] } },
};
const pessoas = [P('a1', 'coronel', 'atendimento'), P('a2', 'coronel', 'atendimento'), P('a3', 'coronel', 'atendimento'), P('a4', 'coronel', 'atendimento'),
  P('m1', 'coronel', 'manipulacao'), P('m2', 'coronel', 'manipulacao'), P('m3', 'coronel', 'manipulacao'),
  P('b1', 'bingen', 'atendimento'), P('b2', 'bingen', 'atendimento'), P('b3', 'bingen', 'manipulacao'), P('b4', 'bingen', 'manipulacao')];

test('semanas de segunda a domingo cobrindo o mes', () => {
  const w = C.semanasDoMes('2026-12');
  assert.equal(w[0][0], '2026-11-30'); assert.equal(C.weekday(w[0][0]), 1);
  assert.equal(w.at(-1)[6], '2027-01-03');
});

test('loja fechada na segunda: segunda + 1 folga por semana, nunca no sabado, domingo a cada 3 semanas, cada loja sozinha', () => {
  const weeks = C.semanasDoMes('2026-12');
  const r = C.gerar5x2({ weeks, pessoas, unidades: lojas, semFolga: [6] });
  for (const p of pessoas) {
    for (const w of weeks) {
      const f = w.filter((d) => r.folgas[p.id].includes(d));
      assert.equal(f.length, 1, `${p.id} ${w[0]}: 1 folga além da segunda`);
      assert.ok(f.every((d) => ![1, 6].includes(C.weekday(d))), `${p.id}: folga nunca na segunda (já fechada) nem no sábado`);
    }
    let seguidos = 0;
    for (const w of weeks) { seguidos = r.folgas[p.id].includes(w[6]) ? 0 : seguidos + 1; assert.ok(seguidos < 3, `${p.id}: 3 domingos seguidos`); }
  }
  assert.deepEqual(r.faltas, []); assert.deepEqual(r.avisos, []);
  // dia fixo: a folga de semana (sem ser domingo) cai sempre no mesmo dia da semana para cada pessoa
  for (const p of pessoas) assert.ok(new Set(r.folgas[p.id].map(C.weekday).filter((d) => d !== 0)).size <= 1, p.id);
});

test('equipe que nao fecha: aponta a falta na propria loja (nunca puxa de outra)', () => {
  const weeks = C.semanasDoMes('2026-12');
  const poucos = pessoas.filter((p) => !['a3', 'a4'].includes(p.id)); // Coronel com 2 atendentes e minimo 2
  const r = C.gerar5x2({ weeks, pessoas: poucos, unidades: lojas, semFolga: [6] });
  assert.ok(r.faltas.length > 0 && r.faltas.every((x) => x.unidade === 'coronel' && x.funcao === 'atendimento'));
  for (const p of poucos.filter((x) => x.unidade === 'bingen')) assert.ok(r.folgas[p.id].length > 0);
});

test('loja aberta todos os dias: 2 folgas por semana, juntas quando possivel', () => {
  const weeks = C.semanasDoMes('2026-12');
  const u = { x: { nome: 'X', abre: [0, 1, 2, 3, 4, 5, 6], minimos: { caixa: [1, 1, 1, 1, 1, 1, 1] } } };
  const gente = ['c1', 'c2', 'c3', 'c4'].map((id) => P(id, 'x', 'caixa'));
  const r = C.gerar5x2({ weeks, pessoas: gente, unidades: u, semFolga: [6] });
  for (const p of gente) for (const w of weeks) assert.equal(w.filter((d) => r.folgas[p.id].includes(d)).length, 2);
  assert.deepEqual(r.faltas, []);
  assert.deepEqual(C.faltas5x2({ weeks, pessoas: gente, unidades: u, folgas: r.folgas }), []);
});

test('afastado nao conta como gente trabalhando', () => {
  const weeks = C.semanasDoMes('2026-12');
  const un = (id, d) => (id === 'b1' && d >= '2026-12-01' && d <= '2026-12-31' ? 'atestado' : '');
  const r = C.gerar5x2({ weeks, pessoas, unidades: lojas, semFolga: [6], unavailable: un });
  assert.ok(r.faltas.some((x) => x.unidade === 'bingen' && x.funcao === 'atendimento'));
});

test('cobertura entre lojas: quem sobra numa loja cobre a folga da outra so naquele dia', () => {
  const weeks = C.semanasDoMes('2026-12');
  const pouca = [P('c1', 'correas', 'atendimento'), P('k1', 'coronel', 'atendimento'), P('k2', 'coronel', 'atendimento'), P('k3', 'coronel', 'atendimento'), P('k4', 'coronel', 'atendimento')];
  const un = { correas: { nome: 'Correas', abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1] } }, coronel: { nome: 'Coronel', abre: FECHA_SEG, minimos: { atendimento: [1, 0, 2, 2, 2, 2, 2] } } };
  const r = C.gerar5x2({ weeks, pessoas: pouca, unidades: un, semFolga: [6] });
  assert.ok(C.faltas5x2({ weeks, pessoas: pouca, unidades: un, folgas: r.folgas }).length > 0, 'sem cobertura a Correas fica descoberta');
  const cobre = C.cobrir5x2({ weeks, pessoas: pouca, unidades: un, folgas: r.folgas });
  assert.deepEqual(C.faltas5x2({ weeks, pessoas: pouca, unidades: un, folgas: r.folgas, cobre }), []);
  for (const [id, m] of Object.entries(cobre)) { assert.ok(id.startsWith('k')); for (const [d, u] of Object.entries(m)) { assert.equal(u, 'correas'); assert.ok(!r.folgas[id].includes(d)); } }
  assert.equal(pouca.find((p) => p.id === 'k1').unidade, 'coronel', 'ninguem muda de loja no cadastro');
});

test('hibrido: cobre a funcao que estiver faltando (na propria loja e em outra)', () => {
  assert.deepEqual(C.alocar({ atendimento: 1, manipulacao: 1 }, [{ id: 'a', funcoes: ['atendimento'] }, { id: 'j', funcoes: ['atendimento', 'manipulacao'] }]).papel, { a: 'atendimento', j: 'manipulacao' });
  const weeks = C.semanasDoMes('2026-12');
  const H = (id, unidade) => ({ id, nome: id, unidade, funcao: 'atendimento', funcoes: ['atendimento', 'manipulacao'] });
  // Bingen: 1 atendente, 1 manipulador e o hibrido -> folgas de qualquer um sao cobertas pelo hibrido
  const gente = [P('ba', 'bingen', 'atendimento'), P('bm', 'bingen', 'manipulacao'), H('jef', 'bingen')];
  const un = { bingen: { nome: 'Bingen', abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1], manipulacao: [1, 0, 1, 1, 1, 1, 1] } } };
  const r = C.gerar5x2({ weeks, pessoas: gente, unidades: un, semFolga: [6] });
  for (const p of gente) for (const w of weeks) assert.equal(w.filter((d) => r.folgas[p.id].includes(d)).length, 1, `${p.id}: 1 folga além da segunda`);
  // so falta quando duas pessoas folgam no mesmo dia; hibrido nunca folga junto com os dois fixos
  const dia = weeks.flat().find((d) => r.folgas.bm.includes(d) && !r.folgas.jef.includes(d));
  assert.ok(dia, 'existe dia de folga do manipulador com o hibrido trabalhando');
  assert.equal(C.naUnidade5x2({ pessoas: gente, unidade: 'bingen', unidades: un, funcao: 'manipulacao', d: dia, folgas: r.folgas }), 1, 'hibrido vira manipulador no dia');
  // hibrido de outra loja cobre manipulacao
  // (na Coronel so ele faz manipulacao, mas la o minimo de manipulacao e zero nesse teste)
  const dois = [P('ca', 'correas', 'atendimento'), P('cm', 'correas', 'manipulacao'), P('ka', 'coronel', 'atendimento'), P('kb', 'coronel', 'atendimento'), H('jef', 'coronel')];
  const u2 = { correas: { nome: 'Correas', abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1], manipulacao: [1, 0, 1, 1, 1, 1, 1] } }, coronel: { nome: 'Coronel', abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1], manipulacao: [0, 0, 0, 0, 0, 0, 0] } } };
  const folgas = { cm: ['2026-12-02'] };
  const cobre = C.cobrir5x2({ weeks: [weeks[0]], pessoas: dois, unidades: u2, folgas });
  assert.equal(cobre.jef?.['2026-12-02'], 'correas', 'o hibrido vai fazer manipulacao na Correas');
  assert.deepEqual(C.faltas5x2({ weeks: [weeks[0]], pessoas: dois, unidades: u2, folgas, cobre }), []);
  // com um manipulador fixo sobrando, ele vai antes e o hibrido fica de reserva na loja dele
  const tres = [...dois, P('km', 'coronel', 'manipulacao')];
  assert.equal(C.cobrir5x2({ weeks: [weeks[0]], pessoas: tres, unidades: u2, folgas }).km?.['2026-12-02'], 'correas');
});
