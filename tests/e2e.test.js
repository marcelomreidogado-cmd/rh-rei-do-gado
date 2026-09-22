// Testes ponta a ponta no navegador (Chromium) em modo demo (memoria). Rodar com:
//   SEED_JSON=dados-iniciais.json PAYSLIP_DIR=pasta_dos_pdfs node --test tests/e2e.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './e2e/server.js';

const SEED = process.env.SEED_JSON, PDFS = process.env.PAYSLIP_DIR;
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_BIN].find((p) => p && fs.existsSync(p));
const skip = !SEED || !fs.existsSync(SEED) || !CHROME;

let srv, base, browser, ctx, page;
const errors = [];
const txt = async (sel) => (await page.locator(sel).first().innerText()).trim();
const val = async (sel) => page.locator(sel).first().inputValue();
const edit = async (sel, v) => { await page.fill(sel, v); await page.press(sel, 'Tab'); await page.waitForTimeout(150); };
const row = (id) => `tr[data-row="${id}"]`;

test('E2E: prepara navegador e faz login', { skip, timeout: 120000 }, async () => {
  ({ srv, url: base } = await startServer(SEED));
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'pt-BR', permissions: ['clipboard-read', 'clipboard-write'] });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/?demo#folha/2026-09');
  await page.waitForSelector('#lf');
  await page.fill('#lid', 'admin'); await page.fill('#lpw', 'errada'); await page.click('#lgo');
  await page.waitForFunction(() => document.querySelector('#lerr')?.textContent.includes('incorretos'));
  await page.fill('#lpw', 'admin'); await page.click('#lgo');
  await page.waitForSelector('#nav');
  await page.waitForSelector('table.grid');
});

test('E2E: folha de setembro mostra os 13 funcionarios e passagem = dias x 11,80', { skip, timeout: 60000 }, async () => {
  assert.equal(await page.locator('tr[data-row]').count(), 13);
  assert.equal(await page.locator('section.store').count(), 3);
  assert.equal(await txt(`${row('bruno-jose')} [data-cell=passagem]`), '295,00');
  assert.equal(await txt(`${row('thais-carmo')} [data-cell=passagem]`), '200,60'); // 17 dias
  assert.equal(await txt(`${row('carlos-rodrigo')} [data-cell=passagem]`), '106,20'); // 9 dias
  // dias -> passagem recalcula na hora
  await edit(`${row('bruno-jose')} [data-f=dias]`, '20');
  assert.equal(await txt(`${row('bruno-jose')} [data-cell=passagem]`), '236,00');
  await edit(`${row('bruno-jose')} [data-f=dias]`, '25');
  assert.equal(await txt(`${row('bruno-jose')} [data-cell=passagem]`), '295,00');
  // Carlos tem falta em 02/09 -> assiduidade perdida
  assert.match(await txt(`${row('carlos-rodrigo')} [data-cell=falta]`), /02\/09/);
  assert.equal(await val(`${row('carlos-rodrigo')} [data-f=assiduidade]`), '');
});

test('E2E: mes novo herda salario/premio/adiantamento/assiduidade e alteracao propaga', { skip, timeout: 90000 }, async () => {
  await page.click('.mchip[data-m="2026-10"]');
  await page.waitForSelector('[data-act=createmonth]');
  await page.click('[data-act=createmonth]');
  await page.waitForSelector('table.grid');
  const bruno = row('bruno-jose');
  assert.equal(await val(`${bruno} [data-f=salario]`), '1.945,00');
  assert.equal(await val(`${bruno} [data-f=premio]`), '500,00');
  assert.equal(await val(`${bruno} [data-f=adiantamento]`), '750,00');
  assert.equal(await val(`${bruno} [data-f=assiduidade]`), '90,00');
  assert.equal(await val(`${bruno} [data-f=dias]`), '');
  assert.equal(await val(`${bruno} [data-f=consumo]`), '');
  assert.equal(await txt(`${bruno} [data-cell=passagem]`), '');
  // Gustavo Felix: INSS ate 24/10 -> assiduidade zerada e afastamento aparece em outubro
  assert.match(await txt(`${row('gustavo-felix')} [data-cell=atestado]`), /INSS 01\/10 a 24\/10/);
  // volta para setembro e altera premio + salario (recorrentes) e consumo (nao recorrente)
  await page.click('.mchip[data-m="2026-09"]'); await page.waitForSelector(`${bruno} [data-f=premio]`);
  await edit(`${bruno} [data-f=premio]`, '600,00');
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Outubro/2026'));
  await edit(`${bruno} [data-f=salario]`, '2.000,00');
  await edit(`${bruno} [data-f=consumo]`, '359,13');
  await page.click('.mchip[data-m="2026-10"]'); await page.waitForSelector(`${bruno} [data-f=premio]`);
  assert.equal(await val(`${bruno} [data-f=premio]`), '600,00');
  assert.equal(await val(`${bruno} [data-f=salario]`), '2.000,00');
  assert.equal(await val(`${bruno} [data-f=consumo]`), '');
  // mes ja fechado (agosto) nao e alterado
  await page.click('.mchip[data-m="2026-08"]'); await page.waitForSelector(`${bruno} [data-f=premio]`);
  assert.equal(await val(`${bruno} [data-f=premio]`), '500,00');
  assert.equal(await page.locator(`${bruno} [data-f=premio]`).isDisabled(), true);
});

test('E2E: faltas com varias datas e atestado de 7 dias (inicio + dias) virando o mes', { skip, timeout: 90000 }, async () => {
  await page.click('.mchip[data-m="2026-09"]'); await page.waitForSelector('table.grid');
  const igor = row('igor-querente');
  await page.click(`${igor} [data-cell=falta]`);
  for (const d of ['2026-09-10', '2026-09-15']) { await page.fill('#fd', d); await page.click('#fadd'); }
  await page.click('.modal-foot button:has-text("Salvar faltas")');
  await page.waitForFunction(() => !document.querySelector('.overlay'));
  assert.equal(await txt(`${igor} [data-cell=falta]`), '10/09, 15/09');
  assert.equal(await val(`${igor} [data-f=assiduidade]`), '');
  // atestado: comecou 25/09, 7 dias
  const jef = row('jeferson-soares');
  await page.click(`${jef} [data-cell=atestado]`);
  await page.fill('#lstart', '2026-09-25');
  await page.check('input[name=lmode][value=dias]'); await page.fill('#ldias', '7');
  assert.match(await txt('#lprev'), /7 dia\(s\): 25\/09\/2026 a 01\/10\/2026/);
  await page.click('#lsave');
  await page.waitForTimeout(200);
  await page.click('.modal-foot button:has-text("Fechar")');
  assert.equal(await txt(`${jef} [data-cell=atestado]`), '25/09 a 30/09');
  // em outubro aparece a continuacao
  await page.click('.mchip[data-m="2026-10"]'); await page.waitForSelector('table.grid');
  assert.equal(await txt(`${row('jeferson-soares')} [data-cell=atestado]`), '01/10 (cont.)');
  assert.equal(await val(`${row('jeferson-soares')} [data-f=assiduidade]`), '');
  // atestado sem data final ("a partir de")
  await page.click('.mchip[data-m="2026-09"]'); await page.waitForSelector('table.grid');
  await page.click(`${row('melissa-garcia')} [data-cell=atestado]`);
  await page.fill('#lstart', '2026-09-28'); await page.check('input[name=lmode][value=aberto]');
  await page.click('#lsave'); await page.waitForTimeout(200);
  await page.click('.modal-foot button:has-text("Fechar")');
  assert.match(await txt(`${row('melissa-garcia')} [data-cell=atestado]`), /desde 28\/09|28\/09 a 30\/09/);
});

test('E2E: excluir coluna/linha, restaurar e copiar tabela para e-mail', { skip, timeout: 90000 }, async () => {
  // coluna Hora Extra e Feriado ja vem ocultas; exclui "Descontos Adicionais" (ha dado em Jaiane -> pede confirmacao)
  assert.equal(await page.locator('th[data-col=horaExtra]').count(), 0);
  await page.click('th[data-col=descAdic] .th-x');
  await page.waitForTimeout(200);
  const ask = page.getByRole('button', { name: 'Excluir coluna', exact: true });
  if (await ask.count()) await ask.click(); // so pergunta quando a coluna tem informacao
  await page.waitForSelector('.chips-row .chip:has-text("Descontos Adicionais")');
  assert.equal(await page.locator('th[data-col=descAdic]').count(), 0);
  // linha do Marcio (motofretista) - exclui
  await page.click(`${row('marcio-goncalves')} .row-x`);
  const conf = page.locator('.modal-foot button:has-text("Excluir linha")');
  if (await conf.count()) await conf.click();
  await page.waitForFunction(() => !document.querySelector('tr[data-row="marcio-goncalves"]'));
  assert.equal(await page.locator('tr[data-row]').count(), 12);
  // e-mail
  await page.click('[data-act=send]');
  await page.waitForSelector('.preview table');
  const html = await page.locator('.preview').innerHTML();
  assert.ok(html.includes('REI DO GADO - SETEMBRO/2026'));
  assert.ok(!html.includes('MARCIO GONCALVES'), 'linha excluida nao vai no e-mail');
  assert.ok(!html.includes('Descontos Adicionais'), 'coluna excluida nao vai no e-mail');
  assert.ok(html.includes('BRUNO JOSE TELLES MATOS') && html.includes('295,00'));
  await page.click('.modal-foot button:has-text("Copiar tabela")');
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('copiada'));
  const clip = await page.evaluate(async () => { const items = await navigator.clipboard.read(); const out = {}; for (const it of items) for (const t of it.types) out[t] = await (await it.getType(t)).text(); return out; });
  assert.ok(clip['text/html'].includes('<table') && clip['text/html'].includes('BRUNO JOSE'));
  assert.ok(clip['text/plain'].includes('BRUNO JOSE TELLES MATOS\t'));
  assert.ok(!clip['text/plain'].includes('MARCIO'));
  await page.locator('.modal-foot button', { hasText: /^Fechar$/ }).click();
  // restaurar linha e coluna
  await page.click('.chips-row .chip:has-text("Marcio")'); await page.waitForSelector(row('marcio-goncalves'));
  await page.click('.chips-row .chip:has-text("Descontos Adicionais")'); await page.waitForSelector('th[data-col=descAdic]');
  assert.equal(await page.locator('tr[data-row]').count(), 13);
});

test('E2E: enviar/fechar mes trava a edicao; reabrir libera', { skip, timeout: 60000 }, async () => {
  await page.click('.mchip[data-m="2026-10"]'); await page.waitForSelector('table.grid');
  await page.click('[data-act=send]'); await page.click('.modal-foot button:has-text("Marcar como enviado")');
  await page.waitForSelector('.badge.closed');
  assert.equal(await page.locator(`${row('bruno-jose')} [data-f=premio]`).isDisabled(), true);
  await page.click('[data-act=send]'); await page.getByRole('button', { name: 'Reabrir mês', exact: true }).click();
  await page.getByRole('button', { name: 'Reabrir', exact: true }).click();
  await page.waitForSelector('.badge.open');
  assert.equal(await page.locator(`${row('bruno-jose')} [data-f=premio]`).isDisabled(), false);
});

test('E2E: escala de domingo sugere rodizio e respeita quantidades', { skip, timeout: 90000 }, async () => {
  await page.click('#nav a[data-v=escala]'); await page.waitForSelector('.sundays');
  await page.click('[data-act=req]');
  // Coronel 2 atendimento + 2 manipulacao; Bingen 1+1; Correas 1+1
  await page.fill('input[data-s=coronel][data-c=atendimento]', '2'); await page.fill('input[data-s=coronel][data-c=manipulacao]', '2');
  await page.click('.modal-foot button:has-text("Salvar")');
  await page.waitForSelector('.req-line .pill:has-text("Coronel")');
  await page.click('[data-act=suggest]');
  await page.waitForSelector('.sun-store.ok, .sun-store.short');
  const st = await page.evaluate(() => ({ dom: document.querySelectorAll('.sunday').length, ok: document.querySelectorAll('.sun-store.ok').length, short: document.querySelectorAll('.sun-store.short').length }));
  assert.equal(st.dom, 4); // mes ativo aqui: outubro/2026 (criado no teste 3), 4 domingos; Coronel fica 1/2 em atendimento porque Melissa esta de atestado (teste 4) e Jaiane de licenca
  const dbg = await page.evaluate(() => [...document.querySelectorAll('.sun-store.short')].map((e) => e.innerText.replace(/\n/g, ' | ')));
  console.log('  domingos com alerta:', dbg.length, dbg.slice(0, 3));
  // cada domingo/loja deve ter as pessoas pedidas (quando ha gente): coronel 2+2 disponiveis?
  const cor = await page.evaluate(() => document.querySelector('.sunday .sun-store:nth-child(3)').innerText);
  assert.match(cor, /Coronel/);
  await page.click('[data-act=copy]'); await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Escala copiada'));
  const t = await page.evaluate(() => navigator.clipboard.readText());
  console.log(JSON.stringify(t.slice(0,80)));
  assert.ok(t.startsWith('ESCALA DE DOMINGO - OUTUBRO/2026') && t.includes('Domingo 04/10') && t.includes('Domingo 25/10'));
});

test('E2E: funcionarios (CPF/telefone) e configuracoes', { skip, timeout: 60000 }, async () => {
  await page.click('#nav a[data-v=funcionarios]'); await page.waitForSelector('table.grid');
  const bruno = page.locator('tr', { hasText: 'BRUNO JOSE TELLES MATOS' });
  assert.match(await bruno.innerText(), /CPF\?/); // digito verificador nao confere
  assert.match(await bruno.innerText(), /\(24\) 99293-2577/);
  assert.match(await page.locator('tr', { hasText: 'MARCIO GONCALVES' }).innerText(), /falta CPF/);
  await page.click('#nav a[data-v=config]'); await page.waitForSelector('#c_vt');
  assert.equal(await val('#c_vt'), '11,80');
  await page.click('#nav a[data-v=historico]'); await page.waitForSelector('table.grid');
  const h = await page.locator('table.grid').innerText();
  assert.ok(h.includes('lancamento') && h.includes('mes_criado'));
});

test('E2E: importa os contracheques reais (OCR no navegador), confere e envia por WhatsApp', { skip: skip || !PDFS || !fs.existsSync(PDFS), timeout: 900000 }, async () => {
  await page.click('#nav a[data-v=contracheques]'); await page.waitForSelector('.toolbar');
  await page.click('.mchip[data-m="2026-08"]'); await page.waitForSelector('[data-act=import]');
  const files = fs.readdirSync(PDFS).filter((f) => f.endsWith('.pdf')).map((f) => path.join(PDFS, f));
  await page.setInputFiles('#pf', files);
  await page.waitForSelector('table.review', { timeout: 880000 });
  const n = await page.locator('table.review tbody tr').count();
  assert.equal(n, 13);
  const bad = await page.locator('table.review tbody tr.bad').count();
  assert.equal(bad, 0, 'todos os contracheques devem fechar as somas');
  // todos casados com um funcionario
  const unmatched = await page.locator('table.review select.emp').evaluateAll((els) => els.filter((e) => !e.value).length);
  assert.equal(unmatched, 0);
  const lines = await page.locator('table.review tbody tr').evaluateAll((trs) => trs.map((tr) => [tr.querySelector('select.emp').selectedOptions[0].textContent, tr.querySelector('.liq').value, tr.querySelector('.inss').value, tr.querySelector('.fgts').value]));
  const get = (name) => lines.find((l) => l[0].includes(name));
  assert.deepEqual(get('BRUNO JOSE').slice(1), ['781,96', '158,21', '162,25']);
  assert.deepEqual(get('JEFERSON').slice(1), ['740,65', '150,73', '155,60']);
  assert.deepEqual(get('GUSTAVO FELIX').slice(1), ['0,00', '14,11', '15,05']); // liquido zero (afastado o mes todo)
  await page.click('.modal-foot button:has-text("Salvar contracheques marcados")');
  await page.waitForSelector('.totals');
  const tot = await txt('.totals');
  console.log('  totais:', tot.replace(/\n/g, ' '));
  assert.match(await page.locator('tr', { hasText: 'BRUNO JOSE TELLES MATOS' }).innerText(), /781,96/);
  // WhatsApp: abre a conversa com o telefone cadastrado + copia a imagem
  // (a sandbox de testes nao tem acesso a internet ate web.whatsapp.com; interceptamos a navegacao
  //  para conferir a URL pedida sem depender de rede externa)
  await ctx.route('https://web.whatsapp.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click(`tr[data-emp="bruno-jose"] [data-act=wa]`)]);
  await popup.waitForLoadState('domcontentloaded');
  assert.match(popup.url(), /web\.whatsapp\.com\/send\?phone=5524992932577&text=Ol%C3%A1%2C%20Bruno!/);
  await popup.close();
  await ctx.unroute('https://web.whatsapp.com/**');
  const clip = await page.evaluate(async () => { const it = await navigator.clipboard.read(); return it.map((i) => i.types).flat(); });
  assert.ok(clip.includes('image/png'), 'imagem do contracheque copiada: ' + clip);
  await page.click('tr[data-emp="bruno-jose"] [data-act=view]'); await page.waitForSelector('.slipimg');
  assert.ok((await page.locator('.slipimg').evaluate((i) => i.naturalWidth)) > 500);
  await page.screenshot({ path: process.env.SHOT_DIR ? path.join(process.env.SHOT_DIR, 'contracheque.png') : undefined });
});

test('E2E: encerra e nao houve erros de JavaScript', { skip, timeout: 30000 }, async () => {
  await browser?.close(); srv?.close();
  assert.deepEqual(errors, []);
});
