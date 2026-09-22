import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMoney, cleanLines, parsePage, dedupeSlips, periodoToMonth } from '../public/js/payslip.js';

test('parseMoney tolera virgula/ponto perdidos ou trocados pelo OCR', () => {
  assert.equal(parseMoney('2.618,21'), 2618.21);
  assert.equal(parseMoney('1,836.25'), 1836.25); // virgula/ponto trocados
  assert.equal(parseMoney('2.02821'), 2028.21); // virgula perdida
  assert.equal(parseMoney('0,00'), 0);
  assert.equal(parseMoney('7,80'), 7.8);
  assert.ok(Number.isNaN(parseMoney('12')));
});

test('cleanLines apaga linhas longas e preserva o texto', () => {
  const w = 200, h = 160;
  const g = new Uint8Array(w * h).fill(255);
  for (let x = 5; x < 195; x++) g[10 * w + x] = 0; // linha horizontal
  for (let y = 5; y < 155; y++) g[y * w + 100] = 0; // linha vertical
  for (let x = 20; x < 30; x++) for (let y = 30; y < 40; y++) g[y * w + x] = 0; // "texto" 10x10
  const c = cleanLines(g, w, h);
  assert.equal(c[10 * w + 50], 255);
  assert.equal(c[30 * w + 100], 255);
  assert.equal(c[35 * w + 25], 0);
});

// ---- contracheque sintetico (mesma geometria do recibo real @200dpi) ----
const W = (t, x0, y, wd = 60) => ({ t, x0, y0: y, x1: x0 + wd, y1: y + 28 });
function slip(y0, { totalDesc = '1.974,35', liq = '740,65', nome = 'JEFERSON SOARES DE ANDRADE OLIVEIRA' } = {}) {
  const w = [];
  w.push(W('00001', 166, y0), W('AIM', 239, y0), W('CASA', 310, y0), W('DE', 375, y0), W('CARNES', 459, y0), W('BINGEN', 577, y0), W('LTDA', 674, y0), W('Demonstrativo', 1048, y0, 120), W('de', 1168, y0), W('Pagamento', 1267, y0));
  w.push(W('01/08/2026', 203, y0 + 69), W('a', 302, y0 + 69), W('31/08/2026', 400, y0 + 69));
  w.push(W('|000008', 166, y0 + 111), ...nome.split(' ').map((t, i) => W(t, 303 + i * 120, y0 + 111, 100)), W('AÇOUGUEIRO', 1399, y0 + 111, 160));
  w.push(W('Cód.', 169, y0 + 153), W('Descrição', 487, y0 + 153), W('Referência', 847, y0 + 153, 100), W('Vencimentos', 1094, y0 + 153, 140), W('Descontos', 1373, y0 + 153, 120));
  const it = [['001', 'Salário Base', '1.945,00', 'v'], ['064', 'Prêmio', '680,00', 'v'], ['058', 'Assiduidade', '90,00', 'v'], ['622', 'Desconto de Consumo', '368,52', 'd'], ['604', 'Vale Transporte', '97,25', 'd'], ['606', 'Adiantamento', '750,00', 'd'], ['903', 'INSS Folha', '150,73', 'd'], ['624', 'Empréstimo (Crédito Trabalhador) Parc. 5/12', '103,94', 'd'], ['624', 'Empréstimo (Crédito Trabalhador) Parc. 6/12', '482,85', 'd'], ['624', 'Empréstimo (Crédito Trabalhador) Parc. 4/24', '21,06', 'd']];
  it.forEach(([c, d, v, k], i) => { const y = y0 + 191 + i * 37; w.push(W(c, 166, y, 40), W(d.split(' ')[0], 265, y, 100), ...d.split(' ').slice(1).map((t, j) => W(t, 380 + j * 110, y, 90)), W(v, k === 'v' ? 1130 : 1410, y, 90)); });
  w.push(W('2.715,00', 1140, y0 + 730, 90), W(totalDesc, 1410, y0 + 730, 90));
  w.push(W('Valor', 1058, y0 + 787), W('Líquido', 1133, y0 + 787), W(liq, 1420, y0 + 787, 90));
  w.push(W('Salário', 255, y0 + 828), W('Base', 300, y0 + 828), W('Sal.', 434, y0 + 828), W('Contr.', 475, y0 + 828), W('INSS', 527, y0 + 828), W('Base', 716, y0 + 828), W('Cál.', 755, y0 + 828), W('FGTS', 796, y0 + 828));
  ['1.945,00', '1.945,00', '7,75', '1.945,00', '155,60', '1.337,80', '0,00'].forEach((v, i) => w.push(W(v, [236, 463, 606, 736, 986, 1213, 1444][i], y0 + 859, 70)));
  w.push(W('DECLARO', 171, y0 + 896), W('TER', 242, y0 + 896), W('ASSINATURA', 971, y0 + 962), W('DO', 1053, y0 + 962));
  return w;
}
test('parsePage le contracheque sintetico e confere as somas', () => {
  const [s] = parsePage(slip(94));
  assert.equal(s.storeId, 'bingen');
  assert.equal(s.nome, 'JEFERSON SOARES DE ANDRADE OLIVEIRA');
  assert.equal(s.matricula, '8');
  assert.equal(s.liquido, 740.65);
  assert.equal(s.inss, 150.73);
  assert.equal(s.fgts, 155.6);
  assert.equal(s.emprestimos, 607.85);
  assert.equal(s.itens.length, 10);
  assert.deepEqual(s.issues, []);
  assert.equal(periodoToMonth(s.periodo), '2026-08');
});
test('total ilegivel e reparado quando o resto fecha; erro real e sinalizado', () => {
  const [ok] = parsePage(slip(94, { totalDesc: '1.274,35' })); // total errado, mas soma dos itens = liquido
  assert.equal(ok.totalDesc, 1974.35);
  assert.equal(ok.fixes.length, 1);
  assert.deepEqual(ok.issues, []);
  const [bad] = parsePage(slip(94, { totalDesc: '1.274,35', liq: '540,65' })); // nada fecha
  assert.ok(bad.issues.length >= 1);
});
test('duas vias na mesma pagina viram um contracheque', () => {
  const slips = parsePage([...slip(94), ...slip(1195)]);
  assert.equal(slips.length, 2);
  assert.equal(dedupeSlips(slips).length, 1);
});

// ---- PDFs reais (rode com PAYSLIP_DIR=pasta_com_os_PDFs; exige pdftoppm + tesseract) ----
const DIR = process.env.PAYSLIP_DIR;
test('contracheques reais de agosto/2026: OCR le liquido, INSS e FGTS de todos os 13 funcionarios', { skip: !DIR || !fs.existsSync(DIR), timeout: 300000 }, async () => {
  const { pdfPagesToWords } = await import('./helpers/ocr-node.js');
  const all = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.pdf'))) {
    for (const pg of pdfPagesToWords(path.join(DIR, f))) all.push(...parsePage(pg.words));
  }
  const slips = dedupeSlips(all);
  assert.equal(slips.length, 13);
  for (const s of slips) assert.deepEqual(s.issues, [], `${s.nome}: ${s.issues}`);
  const by = (part) => slips.find((s) => s.nome.includes(part));
  // valores conferidos visualmente nos PDFs
  const esperado = {
    'BRUNO JOSE': [781.96, 158.21, 162.25], 'JEFERSON': [740.65, 150.73, 155.6], 'GUSTAVO FELIX': [0, 14.11, 15.05], 'JAIANE': [867.24, 150.73, 155.6],
    'MARCIO': [2126.16, 183.55, 184.77], 'VANDERLEI': [2632.61, 200.34, 199.7],
  };
  for (const [n, [liq, inss, fgts]] of Object.entries(esperado)) { const s = by(n); assert.ok(s, n); assert.deepEqual([s.liquido, s.inss, s.fgts], [liq, inss, fgts], n); }
  assert.deepEqual(new Set(slips.map((s) => s.storeId)), new Set(['bingen', 'correas', 'coronel']));
  assert.equal(slips.filter((s) => s.storeId === 'coronel').length, 6);
  assert.ok(slips.every((s) => periodoToMonth(s.periodo) === '2026-08'));
});
