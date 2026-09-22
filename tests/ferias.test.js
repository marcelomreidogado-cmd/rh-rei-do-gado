import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/js/calc.js';

// Datas conferidas com o relatorio "Previsao de Vencimento de Ferias" da contabilidade (01/09/2026).
test('vencimento e "conceder ate" batem com o relatorio da contabilidade', () => {
  const casos = [ // [admissao, vencimento do 1o periodo, conceder ate]
    ['2025-10-13', '2026-10-12', '2027-09-10'],
    ['2025-11-01', '2026-10-31', '2027-09-29'],
    ['2024-07-10', '2025-07-09', '2026-06-07'],
    ['2025-11-07', '2026-11-06', '2027-10-05'],
    ['2025-07-01', '2026-06-30', '2027-05-29'],
  ];
  for (const [adm, venc, ate] of casos) {
    assert.equal(C.primeiroVencFerias(adm), venc, adm);
    assert.equal(C.concederAte(venc), ate, venc);
  }
  assert.equal(C.concederAte('2026-05-31'), '2027-04-29');
  assert.equal(C.concederAte('2026-01-31'), '2026-12-30');
  assert.equal(C.concederAte('2025-11-30'), '2026-10-29');
  assert.equal(C.addYearsIso('2024-02-29', 1), '2025-02-28');
});

test('periodo em aberto avanca quando os 30 dias sao usados (ferias + abono ou quitacao)', () => {
  const e = { admissao: '2023-03-01', ferias: [] };
  assert.equal(C.vencAberto(e), '2024-02-29');
  e.ferias.push({ venc: '2024-02-29', inicio: '2024-06-01', dias: 20, abono: true });
  assert.equal(C.vencAberto(e), '2025-02-28');
  e.ferias.push({ venc: '2025-02-28', inicio: '2025-05-01', dias: 15 });
  assert.equal(C.vencAberto(e), '2025-02-28'); // ainda restam 15 dias
  assert.equal(C.feriasStatus(e, '2025-06-01').saldo, 15);
  e.ferias.push({ venc: '2025-02-28', inicio: '2025-09-01', dias: 15 });
  assert.equal(C.vencAberto(e), '2026-02-28');
  // ajuste manual/relatorio define o periodo em aberto
  assert.equal(C.vencAberto({ admissao: '2019-06-01', feriasVenc: '2026-05-31' }), '2026-05-31');
});

test('situacao: em aquisicao, pode tirar, urgente e prazo estourado', () => {
  const s1 = C.feriasStatus({ admissao: '2025-10-13' }, '2026-09-22');
  assert.equal(s1.nivel, 'aquisicao'); assert.equal(s1.avos, 11);
  assert.equal(C.feriasStatus({ admissao: '2019-06-01', feriasVenc: '2026-05-31' }, '2026-09-22').nivel, 'vencida');
  const urg = C.feriasStatus({ admissao: '2022-12-01', feriasVenc: '2025-11-30' }, '2026-09-22');
  assert.equal(urg.nivel, 'urgente'); assert.equal(urg.diasPrazo, 37);
  const dob = C.feriasStatus({ admissao: '2022-12-01', feriasVenc: '2025-11-30' }, '2026-12-05');
  assert.equal(dob.nivel, 'dobro'); assert.equal(dob.vencidos, 2);
  assert.equal(C.feriasStatus({}, '2026-09-22').nivel, 'sem_dados');
});

test('emFerias cobre inicio..fim (inclusive)', () => {
  const e = { ferias: [{ venc: '2026-01-31', inicio: '2026-10-05', dias: 30 }] };
  assert.equal(C.fimFerias(e.ferias[0]), '2026-11-03');
  assert.ok(C.emFerias(e, '2026-10-05')); assert.ok(C.emFerias(e, '2026-11-03'));
  assert.ok(!C.emFerias(e, '2026-11-04')); assert.ok(!C.emFerias(e, '2026-10-04'));
});

test('le o relatorio de ferias mesmo com erros tipicos do OCR', () => {
  // texto como sai do OCR (nomes ficticios): datas sem barras, ano trocado, tracos soltos
  const txt = `Empresa: EMPRESA TESTE LTDA (00001) CNPJ/CPF: 00000000000100
Previsão de Vencimento de Férias Emissão: 11:17 01/09/2026
Código Nome Admissão —Vcto, Férias Conceder até Jan Fev Mar
Departamento: Todos
000001 JOSE DA SILVA TESTE 0106/2019 31/05/2026 29/04/2027 A 06 4 do IA A
000025 MARIA SOUZA EXEMPLO 13/10/2025 12/10/2026 10092027 LS os
000007 PEDRO ALVES MODELO -— 01/02/2024 31/01/2026 30122028 4 q 4 4 2
000010 ANA LIMA FICTICIA 07/11/2025 06/11/2028 05/10/2027 ua
000COS CARLOS PEREIRA DEMO 10/07/2024 09/07/2026 07/06/2027 CRE E`;
  const r = C.parseRelatorioFerias(txt, { hoje: '2026-09-22' });
  assert.deepEqual(r.map((x) => [x.nome, x.venc, x.concederAte]), [
    ['JOSE DA SILVA TESTE', '2026-05-31', '2027-04-29'],
    ['MARIA SOUZA EXEMPLO', '2026-10-12', '2027-09-10'],
    ['PEDRO ALVES MODELO', '2026-01-31', '2026-12-30'], // "conceder ate" ilegivel: usa o vencimento
    ['ANA LIMA FICTICIA', '2026-11-06', '2027-10-05'], // ano do vencimento errado: corrige pelo "conceder ate"
    ['CARLOS PEREIRA DEMO', '2026-07-09', '2027-06-07'],
  ]);
});

test('relatorio: letras no lugar de numeros e mes invalido', () => {
  const txt = `0O0COS FULANO DE TAL EXEMPLO            10/07/2024 09/07/202S 0706/2027   4 A
000005 BELTRANO SILVA MODELO              01/12/2022 30/19/2025 29102026 4 4 4`;
  const r = C.parseRelatorioFerias(txt, { hoje: '2026-09-22' });
  assert.deepEqual(r.map((x) => x.venc), ['2026-07-09', '2025-11-30']);
});
