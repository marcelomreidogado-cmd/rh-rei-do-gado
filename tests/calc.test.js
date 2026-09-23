import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../public/js/calc.js';

// ---------- passagem: R$ 11,80 por dia trabalhado (valores reais da planilha) ----------
test('passagem = dias x 11,80 (confere com todos os valores da planilha)', () => {
  const casos = [[25, 295], [26, 306.8], [24, 283.2], [23, 271.4], [22, 259.6], [21, 247.8], [20, 236], [17, 200.6], [14, 165.2], [9, 106.2], [3, 35.4], [0, 0]];
  for (const [dias, esperado] of casos) assert.equal(C.passagem(dias), esperado, `${dias} dias`);
});
test('passagem usa valor configuravel e ignora dias invalidos', () => {
  assert.equal(C.passagem(10, 12), 120);
  assert.equal(C.passagem(-3), 0);
  assert.equal(C.passagem('abc'), 0);
  assert.equal(C.passagem(7.9), 82.6); // 7 dias inteiros
});

test('num/brl aceitam formato brasileiro', () => {
  assert.equal(C.num('1.234,56'), 1234.56);
  assert.equal(C.num('47,97'), 47.97);
  assert.equal(C.num('R$ 2.166,56'), 2166.56);
  assert.equal(C.num('1234.5'), 1234.5);
  assert.equal(C.num(''), 0);
  assert.equal(C.num('-'), 0);
  assert.equal(C.num('1.945'), 1945); // ponto + 3 digitos = milhar (padrao BR)
  assert.equal(C.num('1.234.567'), 1234567);
  assert.equal(C.brl(2166.56), '2.166,56');
  assert.equal(C.brl(0), '');
});

// ---------- meses / datas ----------
test('meses e domingos', () => {
  assert.equal(C.addMonths('2026-12', 1), '2027-01');
  assert.equal(C.addMonths('2026-01', -1), '2025-12');
  assert.equal(C.monthLabel('2026-09'), 'Setembro/2026');
  assert.equal(C.daysInMonth('2026-02'), 28);
  assert.deepEqual(C.sundaysOf('2026-09'), ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']);
  assert.deepEqual(C.sundaysOf('2026-08'), ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30']);
  assert.equal(C.sundaysOf('2026-11').length, 5); // 01,08,15,22,29
});

// ---------- atestado: inicio + dias / fim / em aberto ----------
test('atestado de 7 dias: fim calculado e virada de mes', () => {
  assert.equal(C.endFromDays('2026-09-25', 7), '2026-10-01');
  assert.equal(C.daysFromRange('2026-09-25', '2026-10-01'), 7);
  const at = { empId: 'x', type: 'atestado', start: '2026-09-25', end: '2026-10-01' };
  assert.equal(C.leaveDaysInMonth(at, '2026-09').length, 6);
  assert.equal(C.leaveDaysInMonth(at, '2026-10').length, 1);
  assert.equal(C.leaveDaysInMonth(at, '2026-11').length, 0);
  assert.equal(C.formatLeave(at, '2026-09'), '25/09 a 30/09');
  assert.equal(C.formatLeave(at, '2026-10'), '01/10 (cont.)');
});
test('atestado dentro do mes mostra periodo e total de dias', () => {
  const at = { empId: 'x', type: 'atestado', start: '2026-08-01', end: '2026-08-06' };
  assert.equal(C.formatLeave(at, '2026-08'), '01/08 a 06/08 (6d)');
});
test('licenca em aberto (sem fim) vale para todos os meses seguintes', () => {
  const l = { empId: 'j', type: 'licenca', start: '2026-04-27', end: null };
  assert.equal(C.leaveDaysInMonth(l, '2026-03').length, 0);
  assert.equal(C.leaveDaysInMonth(l, '2026-09').length, 30);
  assert.equal(C.formatLeave(l, '2026-09'), 'Licença desde 27/04');
});
test('falta com varias datas', () => {
  const f = { empId: 'x', type: 'falta', dates: ['2026-09-15', '2026-09-02', '2026-10-01'] };
  assert.deepEqual(C.leaveDaysInMonth(f, '2026-09'), ['2026-09-02', '2026-09-15']);
  assert.equal(C.formatLeave(f, '2026-09'), '02/09, 15/09');
});

// ---------- assiduidade ----------
test('assiduidade zera com falta/atestado no mes e volta no mes seguinte', () => {
  const leaves = [{ empId: 'leticia', type: 'atestado', start: '2026-08-01', end: '2026-08-06' }];
  const e = { empId: 'leticia', assiduidade: 90 };
  assert.equal(C.assiduidadeEfetiva(e, leaves, '2026-08'), 0);
  assert.equal(C.assiduidadeEfetiva(e, leaves, '2026-09'), 90);
  assert.equal(C.assiduidadeEfetiva({ ...e, assiduidadeManual: true }, leaves, '2026-08'), 90);
  assert.equal(C.assiduidadeEfetiva({ empId: 'x', assiduidade: 90, faltaTxt: '02/09' }, [], '2026-09'), 0);
});

// ---------- recorrencia / propagacao ----------
test('novo mes herda so campos recorrentes', () => {
  const prev = { ...C.emptyEntry('2026-09', 'bruno', 1945), premio: 500, adiantamento: 750, assiduidade: 90, consumo: 359.13, dias: 25, faltaTxt: '02/09', horaExtra: 10, descAdic: 5 };
  const n = C.carryOver(prev, '2026-10', 'bruno', 0);
  assert.equal(n.salario, 1945);
  assert.equal(n.premio, 500);
  assert.equal(n.adiantamento, 750);
  assert.equal(n.assiduidade, 90);
  assert.equal(n.consumo, 0);
  assert.equal(n.dias, 0);
  assert.equal(n.faltaTxt, '');
  assert.equal(n.horaExtra, 0);
  assert.equal(n.descAdic, 0);
  assert.equal(n.excluded, false);
});
test('alteracao no mes atualiza apenas meses seguintes abertos', () => {
  const entries = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'].map((m) => ({ ...C.emptyEntry(m, 'igor'), id: C.entryId(m, 'igor') }));
  entries.push({ ...C.emptyEntry('2026-10', 'outro'), id: C.entryId('2026-10', 'outro') });
  entries.push({ ...C.emptyEntry('2026-12', 'igor'), id: 'dup', excluded: true });
  const alvos = C.propagationTargets(entries, 'igor', '2026-09', new Set(['2026-08', '2026-11']));
  assert.deepEqual(alvos.sort(), ['2026-10_igor', '2026-12_igor']);
});
test('funcionario aparece no mes conforme ativo/entrada/demissao', () => {
  const e = { ativo: true, entrada: '2026-08-18' };
  assert.equal(C.activeInMonth(e, '2026-07'), false);
  assert.equal(C.activeInMonth(e, '2026-08'), true);
  assert.equal(C.activeInMonth({ ativo: false, demissao: '2026-05-10' }, '2026-06'), false);
  assert.equal(C.activeInMonth({ ativo: false, demissao: '2026-05-10' }, '2026-05'), true);
  assert.equal(C.activeInMonth({ ativo: false }, '2026-09'), false);
});

// ---------- telefone / CPF ----------
test('telefones da planilha viram numeros de WhatsApp validos', () => {
  const casos = { '2499293-2577': '5524992932577', '24 -97834-0132': '5524978340132', '24 99272-9879': '5524992729879', '21 97216-7394': '5521972167394', 24992671302: '5524992671302', '2498819-7724': '5524988197724', '(24) 99243-8342': '5524992438342', '+55 24 98163-4906': '5524981634906' };
  for (const [raw, wa] of Object.entries(casos)) assert.equal(C.normalizePhone(raw).wa, wa, String(raw));
  assert.equal(C.normalizePhone('99243-8342').wa, '5524992438342'); // sem DDD -> padrao 24
  assert.equal(C.normalizePhone('2432431234').display, '(24) 3243-1234'); // fixo
  assert.equal(C.normalizePhone('123').ok, false);
  assert.equal(C.normalizePhone('').ok, false);
});
test('CPF: formatacao, zeros a esquerda e digitos verificadores', () => {
  assert.equal(C.cpfDigits(3255392780), '03255392780');
  assert.equal(C.cpfFmt('11144477735'), '111.444.777-35');
  assert.equal(C.cpfValid('111.444.777-35'), true);
  assert.equal(C.cpfValid('111.444.777-36'), false);
  assert.equal(C.cpfValid('111.111.111-11'), false);
});

// ---------- casamento de nomes (contracheque x cadastro) ----------
test('nomes com grafia/OCR diferentes casam com o funcionario certo', () => {
  const emps = [
    { id: 'bruno', nome: 'BRUNO JOSE TELLES MATOS', loja: 'bingen' },
    { id: 'gh', nome: 'GUSTAVO HENRIQUE PEREIRA BERNARDES', loja: 'bingen' },
    { id: 'gf', nome: 'GUSTAVO FELIX DA SILVA SANTOS', loja: 'bingen' },
    { id: 'paulo', nome: 'PAULO GIOVANI PEREIRA', loja: 'coronel' },
  ];
  assert.equal(C.bestEmployeeMatch('BRUNO JOSE TELES MATOS', emps, 'bingen').emp.id, 'bruno');
  assert.equal(C.bestEmployeeMatch('GUSTAVO FELIX DA SILVA SANTOS', emps, 'bingen').emp.id, 'gf');
  assert.equal(C.bestEmployeeMatch('GUSTAVO HENRIQUE PEREIRA BERNARDES', emps, 'bingen').emp.id, 'gh');
  assert.equal(C.bestEmployeeMatch('PAULO GIOVANNE PEREIRA', emps, 'coronel').emp.id, 'paulo');
  assert.equal(C.bestEmployeeMatch('FULANO DE TAL', emps, 'bingen'), null);
});

// ---------- escala de domingo ----------
const EMPS = [
  { id: 'a1', nome: 'Ana', loja: 'coronel', categoria: 'atendimento' }, { id: 'a2', nome: 'Bia', loja: 'coronel', categoria: 'atendimento' }, { id: 'a3', nome: 'Cris', loja: 'coronel', categoria: 'atendimento' },
  { id: 'm1', nome: 'Davi', loja: 'coronel', categoria: 'manipulacao' }, { id: 'm2', nome: 'Edu', loja: 'coronel', categoria: 'manipulacao' },
  { id: 'b1', nome: 'Fabi', loja: 'bingen', categoria: 'atendimento' }, { id: 'b2', nome: 'Gui', loja: 'bingen', categoria: 'manipulacao' },
  { id: 'c1', nome: 'Hugo', loja: 'correas', categoria: 'atendimento' },
];
// ---------- dados reais (so roda se SEED_JSON apontar para o arquivo gerado da planilha) ----------
const SEED = process.env.SEED_JSON;
test('dados iniciais da planilha: cadastro e lancamentos consistentes', { skip: !SEED || !fs.existsSync(SEED) }, () => {
  const d = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const ids = new Set(d.employees.map((e) => e.id));
  assert.equal(ids.size, d.employees.length, 'ids unicos');
  const ativos = d.employees.filter((e) => e.ativo);
  assert.equal(ativos.length, 13); // Rei do Gado: 13 funcionarios em setembro
  assert.equal(d.employees.filter((e) => e.loja === 'coronel' && e.ativo).length, 6);
  assert.equal(d.employees.filter((e) => e.loja === 'bingen' && e.ativo).length, 4);
  assert.equal(d.employees.filter((e) => e.loja === 'correas' && e.ativo).length, 3);
  const semCpf = [], cpfRuim = [], semFone = [];
  for (const e of ativos) {
    if (!e.cpf) semCpf.push(e.nome); else if (!C.cpfValid(e.cpf)) cpfRuim.push(e.nome);
    if (!C.normalizePhone(e.telefone).ok) semFone.push(e.nome);
  }
  console.log('  sem CPF cadastrado:', semCpf, '| CPF com digito verificador invalido:', cpfRuim, '| sem telefone valido:', semFone);
  // Achado dos dados reais: CPF de Bruno nao passa nos digitos verificadores (provavel erro de digitacao no cadastro).
  assert.deepEqual(cpfRuim, ['BRUNO JOSE TELLES MATOS']);
  assert.deepEqual(semCpf, ['MARCIO GONCALVES BERNARDINO']);
  for (const [mk, m] of Object.entries(d.months)) {
    for (const e of m.entries) {
      assert.ok(ids.has(e.empId), `${mk} ${e.empId} nao cadastrado`);
      assert.ok(e.salario > 1000 && e.salario < 4000, `${mk} ${e.empId} salario ${e.salario}`);
      assert.ok(e.dias >= 0 && e.dias <= 31);
    }
    assert.equal(new Set(m.entries.map((e) => e.empId)).size, m.entries.length, `${mk} duplicados`);
  }
  // Agosto: passagem calculada = valor da planilha (295 / 200,60 / 247,80 / 106,20)
  const ago = Object.fromEntries(d.months['2026-08'].entries.map((e) => [e.empId, e]));
  assert.equal(C.passagem(ago['thais-carmo'].dias), 200.6);
  assert.equal(C.passagem(ago['melissa-garcia'].dias), 247.8);
  assert.equal(C.passagem(ago['carlos-rodrigo'].dias), 106.2);
  assert.equal(C.passagem(ago['bruno-jose'].dias), 295);
});
test('afastamentos iniciais deixam assiduidade correta em agosto e setembro', { skip: !SEED || !fs.existsSync(SEED) }, () => {
  const d = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const ent = (mk, id) => d.months[mk].entries.find((e) => e.empId === id);
  // Agosto: Leticia (atestado 1-6), Jaiane (licenca) e Gustavo Felix (INSS) = 0; Bruno = 90
  for (const id of ['leticia-rodrigues', 'jaiane-vitoria', 'gustavo-felix']) assert.equal(C.assiduidadeEfetiva(ent('2026-08', id), d.leaves, '2026-08'), 0, id);
  assert.equal(C.assiduidadeEfetiva(ent('2026-08', 'bruno-jose'), d.leaves, '2026-08'), 90);
  // Setembro: Carlos tem falta em 02/09 -> 0 ; Leticia ja voltou -> paga o valor base
  assert.equal(C.assiduidadeEfetiva(ent('2026-09', 'carlos-rodrigo'), d.leaves, '2026-09'), 0);
  assert.equal(C.leaveText(d.leaves, 'carlos-rodrigo', '2026-09', 'falta'), '02/09');
  assert.equal(C.leaveText(d.leaves, 'jaiane-vitoria', '2026-09', 'atestado'), 'Licença desde 05/05');
  assert.equal(C.leaveText(d.leaves, 'gustavo-felix', '2026-09', 'atestado'), 'INSS 01/09 a 30/09 (cont.)');
  assert.equal(C.leaveText(d.leaves, 'gustavo-felix', '2026-10', 'atestado'), 'INSS 01/10 a 24/10 (cont.)');
  assert.equal(C.leaveText(d.leaves, 'gustavo-felix', '2026-11', 'atestado'), '');
});

test('escala: todo mundo trabalha, cada um com 1 folga no mes, folgas espalhadas', () => {
  const required = { coronel: { atendimento: 1, manipulacao: 1 }, bingen: { atendimento: 1, manipulacao: 1 }, correas: { atendimento: 1, manipulacao: 0 } };
  const sundays = C.sundaysOf('2026-09');
  const { assignments, folgas, shortages } = C.suggestSchedule({ sundays, employees: EMPS, required });
  const trab = {}, folg = {};
  for (const d of sundays) { for (const ids of Object.values(assignments[d])) for (const id of ids) trab[id] = (trab[id] || 0) + 1; for (const id of folgas[d]) folg[id] = (folg[id] || 0) + 1; }
  for (const e of EMPS) { assert.equal(folg[e.id], 1, e.id); assert.equal(trab[e.id], sundays.length - 1, e.id); }
  // os 3 atendentes do Coronel folgam em domingos diferentes
  const dias = ['a1', 'a2', 'a3'].map((id) => sundays.find((d) => folgas[d].includes(id)));
  assert.equal(new Set(dias).size, 3);
  // Bingen tem 1 atendente e 1 manipulador: na folga deles alguem do Coronel (com sobra) cobre
  const dFabi = sundays.find((d) => folgas[d].includes('b1'));
  const cob = assignments[dFabi].bingen.filter((id) => id[0] === 'a');
  assert.equal(cob.length, 1);
  assert.ok(!assignments[dFabi].coronel.includes(cob[0]), 'quem cobre sai da propria loja naquele dia');
  // Correas so tem o Hugo: na folga dele ninguem sobra? Coronel tem 3 atend (1 folga) -> sobra 1 -> cobre
  const dHugo = sundays.find((d) => folgas[d].includes('c1'));
  assert.equal(assignments[dHugo].correas.length, 1);
  assert.ok(shortages.every((x) => x.store !== 'correas'));
});

test('escala: afastado nao trabalha e ninguem vai para duas lojas', () => {
  const required = { coronel: { atendimento: 1, manipulacao: 1 }, bingen: { atendimento: 1, manipulacao: 1 }, correas: { atendimento: 0, manipulacao: 0 } };
  const sundays = ['2026-09-06', '2026-09-13'];
  const unavailable = (id, d) => id === 'a1' && d === '2026-09-06';
  const { assignments, folgas } = C.suggestSchedule({ sundays, employees: EMPS, required, unavailable });
  assert.ok(!Object.values(assignments['2026-09-06']).flat().includes('a1'));
  assert.equal(folgas['2026-09-13'].includes('a1'), true); // folga no domingo em que esta disponivel
  for (const d of sundays) { const all = Object.values(assignments[d]).flat(); assert.equal(all.length, new Set(all).size); }
  assert.deepEqual(C.folgasDoDia(assignments['2026-09-13'], 'coronel', EMPS, () => false, '2026-09-13').sort(), folgas['2026-09-13'].filter((id) => ['a1', 'a2', 'a3', 'm1', 'm2'].includes(id)).sort());
});

test('escala usa a loja onde trabalha e tira administrativo', () => {
  const emps = [
    { id: 'x1', nome: 'Xa', loja: 'bingen', lojaTrabalho: 'coronel', categoria: 'atendimento' },
    { id: 'x2', nome: 'Xb', loja: 'bingen', categoria: 'atendimento' },
    { id: 'x3', nome: 'Xc', loja: 'coronel', categoria: 'atendimento', funcao: 'Assist Financeiro' },
  ];
  assert.equal(C.workStore(emps[0]), 'coronel'); assert.equal(C.workStore(emps[2]), C.ADM); assert.equal(C.inEscala(emps[2]), false);
  const { assignments } = C.suggestSchedule({ sundays: ['2026-09-06', '2026-09-13'], employees: emps, required: {} });
  const all = Object.values(assignments).flatMap((d) => [...d.coronel.map((id) => ['coronel', id]), ...d.bingen.map((id) => ['bingen', id])]);
  assert.ok(all.every(([s, id]) => id !== 'x3' && (id !== 'x1' || s === 'coronel')));
});
