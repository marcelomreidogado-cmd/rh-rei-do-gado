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

test('rede inteira: folgas planejadas contando com a troca de loja no dia (todas as lojas cobrem e sao cobertas)', () => {
  const weeks = C.semanasDoMes('2026-12');
  const un = { coronel: { abre: FECHA_SEG, minimos: { atendimento: [1, 0, 2, 2, 2, 2, 2], manipulacao: [1, 0, 1, 1, 1, 1, 1] } },
    bingen: { abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1], manipulacao: [1, 0, 1, 1, 1, 1, 1] } },
    correas: { abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1], manipulacao: [1, 0, 1, 1, 1, 1, 1] } } };
  const gente = [P('bruno', 'coronel', 'atendimento'), P('leticia', 'coronel', 'atendimento'), P('carlos', 'coronel', 'manipulacao'), P('igor', 'coronel', 'manipulacao'), P('paulo', 'coronel', 'manipulacao'),
    P('teste', 'bingen', 'atendimento'), P('gustavo', 'bingen', 'manipulacao'), { ...P('jef', 'bingen', 'atendimento'), funcoes: ['atendimento', 'manipulacao'] },
    P('vand', 'correas', 'atendimento'), P('thais', 'correas', 'manipulacao')];
  const r = C.gerar5x2({ weeks, pessoas: gente, unidades: un });
  const sem = C.faltas5x2({ weeks, pessoas: gente, unidades: un, folgas: r.folgas }).length;
  const cobre = C.cobrir5x2({ weeks, pessoas: gente, unidades: un, folgas: r.folgas });
  const com = C.faltas5x2({ weeks, pessoas: gente, unidades: un, folgas: r.folgas, cobre });
  // 5 pessoas fazem atendimento para 4 vagas de ter a sex: no maximo 1 dia com falta por semana
  assert.ok(com.length <= weeks.length && com.length < sem, `faltas ${sem} -> ${com.length}`);
  const origem = new Set(Object.keys(cobre).map((id) => gente.find((p) => p.id === id).unidade));
  const destino = new Set(Object.values(cobre).flatMap((m) => Object.values(m)));
  assert.ok(origem.size >= 2 && destino.size >= 2, `de ${[...origem]} para ${[...destino]}`);
});

test('carga horaria: turno menos intervalo, limite semanal da EC 141 e horas por semana', () => {
  assert.equal(C.horasTurno('08:00', '17:00', 60), 8);
  assert.equal(C.horasTurno('08:00', '13:00', 60), 4.75); // ate 6h: 15 min
  assert.equal(C.horasTurno('08:00', '12:00', 60), 4);
  assert.equal(C.fmtH(7.5), '7h30');
  assert.equal(C.limiteSemanal('2026-12-14'), 44); assert.equal(C.limiteSemanal('2026-12-21'), 42); assert.equal(C.limiteSemanal('2027-12-20'), 40);
  const weeks = C.semanasDoMes('2026-12');
  const horario = { 0: ['08:00', '13:00'], 2: ['08:00', '18:00'], 3: ['08:00', '18:00'], 4: ['08:00', '18:00'], 5: ['08:00', '18:00'], 6: ['08:00', '18:00'] };
  const un = { a: { abre: FECHA_SEG, minimos: {}, horario }, b: { abre: FECHA_SEG, minimos: {}, horario: { ...horario, 3: ['10:00', '14:00'] } } };
  const ps = [P('x', 'a', 'atendimento')];
  const folgas = { x: weeks.map((w) => w[1]) }; // folga toda terca
  const c = C.carga5x2({ weeks, pessoas: ps, unidades: un, folgas, cobre: { x: { [weeks[1][2]]: 'b' } } });
  assert.equal(c.x.semanas[0].horas, 4 * 9 + 4.75); // qua-sab 9h + domingo 4h45
  assert.equal(c.x.semanas[1].horas, 3 * 9 + 4 + 4.75); // quarta cobrindo a outra loja (10-14)
  assert.equal(c.x.dias[weeks[1][2]], 4);
  const proprio = C.carga5x2({ weeks, pessoas: ps, unidades: un, folgas, horariosPessoa: { x: { 4: ['12:00', '18:00'] } } });
  assert.equal(proprio.x.dias[weeks[0][3]], 5.75); // 6h de turno com 15 min de intervalo
});

test('abertura extra: a segunda que a loja abre vira dia aberto, com horario e minimo da terca', () => {
  const weeks = C.semanasDoMes('2026-12');
  const seg = weeks[1][0]; // 07/12
  const un = { a: { abre: FECHA_SEG, minimos: { atendimento: [1, 0, 2, 2, 2, 2, 2] }, horario: { 2: ['08:00', '18:00'] }, extras: { [seg]: { ini: '08:00', fim: '13:00', obs: 'feriado' } } } };
  assert.ok(C.abreEm(un.a, seg) && !C.abreEm(un.a, weeks[2][0]));
  const ps = [P('x', 'a', 'atendimento')];
  const f = C.faltas5x2({ weeks: [weeks[1]], pessoas: ps, unidades: un, folgas: {} });
  assert.ok(f.some((x) => x.date === seg && x.falta === 1), 'minimo da terca (2) vale na segunda aberta');
  const c = C.carga5x2({ weeks: [weeks[1]], pessoas: ps, unidades: un, folgas: {} });
  assert.equal(c.x.dias[seg], 4.75);
});

test('abertura extra na geracao: so o minimo trabalha na segunda e ganha folga de compensacao', () => {
  const weeks = C.semanasDoMes('2026-12');
  const seg = weeks[1][0];
  const un = { a: { abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1] }, extras: { [seg]: { ini: '08:00', fim: '13:00' } } } };
  const ps = [P('x', 'a', 'atendimento'), P('y', 'a', 'atendimento'), P('z', 'a', 'atendimento')];
  const r = C.gerar5x2({ weeks, pessoas: ps, unidades: un, semFolga: [6] });
  const trab = ps.filter((p) => !r.folgas[p.id].includes(seg));
  assert.equal(trab.length, 1, 'so 1 trabalha na segunda');
  for (const p of ps) assert.equal(weeks[1].filter((d) => r.folgas[p.id].includes(d)).length, 2, `${p.id}: 2 folgas na semana`);
  assert.deepEqual(r.faltas, []);
});

test('turnos sugeridos: fecham 42h na semana entrando mais cedo, com almoco 1h + lanche 15 min, dentro do horario da loja', () => {
  const weeks = C.semanasDoMes('2026-12');
  const hor = { 0: ['09:00', '14:00'], 2: ['10:00', '19:00'], 3: ['10:00', '19:00'], 4: ['10:00', '19:00'], 5: ['10:00', '19:00'], 6: ['09:00', '19:00'] };
  assert.equal(C.horasTurno('10:00', '19:00', 60, 15), 7.75);
  assert.equal(C.horasTurno('09:00', '14:00', 60, 15), 4.75);
  assert.equal(C.metaSemanal('2026-12-07'), 42); assert.equal(C.metaSemanal('2027-12-20'), 40); assert.equal(C.metaSemanal('2026-12-07', 40), 40);
  const un = { a: { abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1] }, horario: hor }, b: { abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1] }, horario: hor } };
  const ps = [P('x', 'a', 'atendimento'), P('y', 'a', 'atendimento')];
  const folgas = { x: weeks.map((w) => w[3]), y: weeks.map((w, i) => (i === 1 ? w[6] : w[2])).concat(weeks[1][3]) }; // y: domingo + quinta na 2a semana
  const cobre = { x: { [weeks[2][1]]: 'b' } }; // x cobre a loja b numa terca
  const t = C.turnos5x2({ weeks, pessoas: ps, unidades: un, folgas, cobre, almoco: 60, lanche: 15 });
  for (const id of ['x', 'y']) for (const s of t[id].semanas) if (s.dias === 5) assert.ok(s.horas >= 42 && s.horas < 42.09, `${id} semana ${s.inicio}: ${s.horas}`);
  // sabado e domingo ficam no horario da loja; so ter-sex entram mais cedo
  for (const [d, v] of Object.entries(t.x.dias)) if ([0, 6].includes(C.weekday(d))) assert.equal(v.ini, hor[C.weekday(d)][0]);
  for (const [d, v] of Object.entries(t.x.dias)) {
    assert.ok(v.fim === hor[C.weekday(d)][1], 'sai no fechamento da loja');
    assert.ok(v.ini <= hor[C.weekday(d)][0] && v.ini >= '07:00', `entra no horario ou mais cedo: ${d} ${v.ini}`);
    assert.ok(v.horas <= 9.5);
  }
  assert.ok(t.x.dias[weeks[2][1]], 'dia cobrindo outra loja tem turno');
  // horario de 40h a partir de 16/12/2027
  const t40 = C.turnos5x2({ weeks, pessoas: ps, unidades: un, folgas, jornada: 40 });
  assert.ok(t40.x.semanas[0].horas >= 40 && t40.x.semanas[0].horas < 40.09, 'fecha 40h (passa no maximo 5 min)');
});

test('quem nao cobre outras lojas nunca e chamado; feriado muda horario e minimo do dia', () => {
  const weeks = [C.semanasDoMes('2026-12')[0]];
  const un = { a: { abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1] } }, b: { abre: FECHA_SEG, minimos: { atendimento: [1, 0, 1, 1, 1, 1, 1] } } };
  const ps = [P('a1', 'a', 'atendimento'), { ...P('b1', 'b', 'atendimento'), podeCobrir: false }, P('b2', 'b', 'atendimento')];
  const folgas = { a1: ['2026-12-02'] };
  const c1 = C.cobrir5x2({ weeks, pessoas: ps, unidades: un, folgas });
  assert.ok(!c1.b1, 'b1 nao cobre');
  assert.equal(c1.b2?.['2026-12-02'], 'a');
  const fer = { ...un, a: { ...un.a, extras: { '2026-12-03': { ini: '09:00', fim: '14:00', tipo: 'feriado', minimos: { atendimento: 2 } } } } };
  const nd = C.unidadesNoDia(fer, '2026-12-03').a;
  assert.deepEqual(nd.horario[4], ['09:00', '14:00']); assert.equal(nd.minimos.atendimento[4], 2);
  assert.ok(C.faltas5x2({ weeks, pessoas: ps, unidades: fer, folgas: {} }).some((x) => x.date === '2026-12-03' && x.unidade === 'a'), 'feriado pede 2 e so tem 1');
  assert.deepEqual(C.feriadosNacionais(2026).filter((f) => f.date.startsWith('2026-11')).map((f) => f.date), ['2026-11-02', '2026-11-15', '2026-11-20']);
});

// ---------- loja de shopping (10h-22h seg-sab, 11h-21h dom): turnos de abertura e fechamento ----------
const SHOP = { 0: ['11:00', '21:00'], 1: ['10:00', '22:00'], 2: ['10:00', '22:00'], 3: ['10:00', '22:00'], 4: ['10:00', '22:00'], 5: ['10:00', '22:00'], 6: ['10:00', '22:00'] };
const fini = { fini: { nome: 'Fini', abre: [0, 1, 2, 3, 4, 5, 6], horario: SHOP, minimos: { atendimento: [2, 2, 2, 2, 2, 3, 4] } } };

test('turnos do dia: loja longa vira abertura + fechamento de 8h24; loja curta e turno unico', () => {
  const o = { meta: 42, almoco: 60, lanche: 15 };
  assert.deepEqual(C.turnosDoHorario('10:00', '22:00', o), [['10:00', '19:39'], ['12:21', '22:00']]);
  assert.equal(C.horasTurno('10:00', '19:39', 60, 15), 8.4);
  assert.deepEqual(C.turnosDoHorario('11:00', '21:00', o), [['11:00', '21:00']]); // 8h45: uma pessoa cobre
  assert.deepEqual(C.turnosDoHorario('10:00', '19:00', o), [['10:00', '19:00']]); // Rei do Gado continua turno unico
  assert.equal(C.turnosDoHorario('07:00', '23:00', { meta: 30, almoco: 60, lanche: 15 }).length, 3); // sobra buraco no meio -> intermediario
});

test('shopping 10h-22h: todo dia alguem abre e alguem fecha, mesmo turno na semana, 42h por semana', () => {
  const weeks = C.semanasDoMes('2026-12');
  const gente = ['ana', 'bia', 'caio', 'duda', 'eva', 'fabi'].map((n) => P(n, 'fini', 'atendimento'));
  const r = C.gerar5x2({ weeks, pessoas: gente, unidades: fini, semFolga: [6] });
  const meta = 42, almoco = 60, lanche = 15;
  const turnosDe = (u, d) => { const h = fini[u].horario[C.weekday(d)]; return C.turnosDoHorario(h[0], h[1], { meta, almoco, lanche }); };
  const at = C.atribuiTurnos({ weeks, pessoas: gente, unidades: fini, folgas: r.folgas, turnosDe });
  const turnoDe = (pid, d, u) => { const T = turnosDe(u, d); if (T.length < 2) return null; const i = at[pid][d] ?? 0; const h = fini[u].horario[C.weekday(d)]; return { ini: T[i][0], fim: T[i][1], idx: i, k: T.length, lado: i === 0 ? 'fim' : 'ini' }; };
  const cg = C.turnos5x2({ weeks, pessoas: gente, unidades: fini, folgas: r.folgas, almoco, lanche, turnoDe });
  for (const w of weeks) for (const d of w) {
    if (C.weekday(d) === 0) continue; // domingo: turno unico 11-21
    const pres = gente.filter((p) => !(r.folgas[p.id] || []).includes(d));
    const ab = pres.filter((p) => at[p.id][d] === 0), fe = pres.filter((p) => at[p.id][d] === 1);
    assert.ok(ab.length >= 1 && fe.length >= 1, `${d}: abre ${ab.length}, fecha ${fe.length}`);
    for (const p of ab) assert.equal(cg[p.id].dias[d].ini, '10:00', `${d} ${p.id} abre as 10`);
    for (const p of fe) assert.equal(cg[p.id].dias[d].fim, '22:00', `${d} ${p.id} fecha as 22`);
    for (const p of pres) assert.ok(cg[p.id].dias[d].horas <= 9.5, `${d} ${p.id} ${cg[p.id].dias[d].horas}h`);
  }
  let trocasTot = 0;
  for (const p of gente) {
    for (const s of cg[p.id].semanas) if (s.dias === 5) assert.ok(Math.abs(s.normais - 42) <= 5 / 60 + 1e-9, `${p.id} semana ${s.inicio}: ${s.normais}`);
    // mesmo turno na semana (dias de seg a sab)
    for (const w of weeks) { const seq = w.map((d) => at[p.id][d]).filter((x) => x !== undefined); const trocas = seq.filter((x, i) => i && x !== seq[i - 1]).length; trocasTot += trocas; assert.ok(trocas <= 1, `${p.id} troca ${trocas}x de turno na semana ${w[0]}`); }
  }
  assert.ok(trocasTot <= 6, `trocas de turno no meio da semana: ${trocasTot}`);
  // reveza: quem abriu numa semana fecha na outra (na maioria das trocas de semana)
  let mud = 0, tot = 0;
  for (const p of gente) { const t = weeks.map((w) => w.map((d) => at[p.id][d]).find((x) => x !== undefined)); for (let i = 1; i < t.length; i++) if (t[i] !== undefined && t[i - 1] !== undefined) { tot++; if (t[i] !== t[i - 1]) mud++; } }
  assert.ok(mud / tot >= 0.5, `revezamento ${mud}/${tot}`);
});
