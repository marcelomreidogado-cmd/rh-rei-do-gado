// Testes ponta a ponta no navegador (Chromium) em modo demo (memoria). Rodar com:
//   SEED_JSON=dados-iniciais.json PAYSLIP_DIR=pasta_dos_pdfs node --test tests/e2e.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './e2e/server.js';

const SEED = process.env.SEED_JSON, PDFS = process.env.PAYSLIP_DIR, FERIAS_IMG = process.env.FERIAS_IMG;
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
  assert.equal(await txt(`${row('bruno-jose')} [data-cell=passagem]`), 'R$ 295,00');
  assert.equal(await txt(`${row('thais-carmo')} [data-cell=passagem]`), 'R$ 200,60'); // 17 dias
  assert.equal(await txt(`${row('carlos-rodrigo')} [data-cell=passagem]`), 'R$ 106,20'); // 9 dias
  // dias -> passagem recalcula na hora
  await edit(`${row('bruno-jose')} [data-f=dias]`, '20');
  assert.equal(await txt(`${row('bruno-jose')} [data-cell=passagem]`), 'R$ 236,00');
  await edit(`${row('bruno-jose')} [data-f=dias]`, '25');
  assert.equal(await txt(`${row('bruno-jose')} [data-cell=passagem]`), 'R$ 295,00');
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
  // entrada/admissao/funcao/salario sairam da folha (ficam no cadastro); observacao no fim da linha
  for (const c of ['salario', 'entrada', 'admissao', 'funcao', 'cod']) assert.equal(await page.locator(`th[data-col=${c}]`).count(), 0, c);
  assert.equal(await page.locator('table.grid thead th[data-col]').last().getAttribute('data-col'), 'obs');
  assert.equal(await page.locator('[data-f=descAdicNota]').count(), 0);
  assert.equal(await val(`${bruno} [data-f=premio]`), 'R$ 500,00');
  assert.equal(await val(`${bruno} [data-f=adiantamento]`), 'R$ 750,00');
  assert.equal(await val(`${bruno} [data-f=assiduidade]`), 'R$ 90,00');
  assert.equal(await val(`${bruno} [data-f=dias]`), '');
  assert.equal(await val(`${bruno} [data-f=consumo]`), '');
  assert.equal(await txt(`${bruno} [data-cell=passagem]`), '');
  // Gustavo Felix: INSS ate 24/10 -> assiduidade zerada e afastamento aparece em outubro
  assert.match(await txt(`${row('gustavo-felix')} [data-cell=atestado]`), /INSS 01\/10 a 24\/10/);
  // volta para setembro e altera premio + salario (recorrentes) e consumo (nao recorrente)
  await page.click('.mchip[data-m="2026-09"]'); await page.waitForSelector(`${bruno} [data-f=premio]`);
  await edit(`${bruno} [data-f=premio]`, '600,00');
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Outubro/2026'));
  await edit(`${bruno} [data-f=obs]`, 'teste de observação');
  await edit(`${bruno} [data-f=consumo]`, '359,13');
  await page.click('.mchip[data-m="2026-10"]'); await page.waitForSelector(`${bruno} [data-f=premio]`);
  assert.equal(await val(`${bruno} [data-f=premio]`), 'R$ 600,00');
  assert.equal(await val(`${bruno} [data-f=obs]`), '');
  assert.equal(await val(`${bruno} [data-f=consumo]`), '');
  // mes ja fechado (agosto) nao e alterado
  await page.click('.mchip[data-m="2026-08"]'); await page.waitForSelector(`${bruno} [data-f=premio]`);
  assert.equal(await val(`${bruno} [data-f=premio]`), 'R$ 500,00');
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
  assert.ok(t.startsWith('ESCALA DE DOMINGO - OUTUBRO/2026') && t.includes('Atendimento:') && t.includes('Folga:') && !t.includes('Cobre') && t.includes('Domingo 04/10') && t.includes('Domingo 25/10'));
  // cada pessoa da escala tem exatamente 1 folga no mes
  const folgas = await page.$$eval('section.store table tbody tr', (trs) => trs.map((tr) => tr.lastElementChild.innerText));
  assert.ok(folgas.length > 5 && folgas.every((f) => f.startsWith('1') || f.includes('afastado')), JSON.stringify(folgas));
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

test('E2E: funcionario novo entra sozinho na folha e escala usa a loja onde trabalha', { skip, timeout: 90000 }, async () => {
  await page.click('#nav a[data-v=funcionarios]'); await page.waitForSelector('table.grid');
  // Melissa (Assist Financeiro) ja aparece como administrativo
  assert.equal(await page.locator('tr[data-emp="melissa-garcia"] [data-inl=lojaTrabalho]').inputValue(), 'adm');
  // Bruno e registrado em Bingen, mas trabalha em Coronel
  await page.selectOption('tr[data-emp="bruno-jose"] [data-inl=lojaTrabalho]', 'coronel');
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('trabalha em Coronel'));
  // cadastro novo
  await page.click('[data-act=new]');
  await page.fill('#f_nome', 'Teste Novo Funcionario'); await page.selectOption('#f_loja', 'correas'); await page.fill('#f_ent', '2026-09-01');
  await page.selectOption('#f_cat', 'atendimento'); await page.fill('#f_sal', '1.900,00');
  await page.click('.modal-foot button:has-text("Salvar")');
  await page.waitForSelector('tr:has-text("TESTE NOVO FUNCIONARIO")');
  await page.click('#nav a[data-v=folha]'); await page.click('.mchip[data-m="2026-09"]');
  await page.waitForSelector('tr[data-row="teste-novo"]');
  assert.match(await page.locator('section.store', { has: page.locator('tr[data-row="teste-novo"]') }).locator('h2').innerText(), /Correas/);
  // escala: sugestao coloca Bruno em Coronel e nunca a Melissa
  await page.click('#nav a[data-v=escala]'); await page.click('.mchip[data-m="2026-11"]'); await page.waitForSelector('.sundays');
  await page.click('[data-act=suggest]'); await page.waitForSelector('.sun-store.ok, .sun-store.short');
  const card = await page.locator('#escalaCard').innerText();
  assert.ok(!/Melissa/.test(card), card);
  const cells = await page.$$eval('#escalaCard tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((t) => t.innerText)));
  assert.ok(cells.every((r) => !/Folga:[^\n]*Bruno/.test(r[1])), 'folga do Bruno nao aparece em Bingen'); // coluna 1 = Bingen
  assert.ok(cells.every((r) => r.slice(1).every((c) => /Atendimento:/.test(c) && /Manipulação:/.test(c) && /Folga:/.test(c) && !/Cobre/.test(c))));
  assert.equal(cells.filter((r) => /Folga:[^\n]*Bruno/.test(r[3])).length, 1, 'Bruno folga 1 domingo no Coronel');
  assert.ok(!(await page.locator('section.store').last().innerText()).includes('MELISSA'));
  // edicao manual pelo nome
  await page.locator('.sun-store .person').first().click(); await page.waitForSelector('.modal .checklist');
  await page.click('.modal [data-close]');
  // imagem para WhatsApp
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=img]')]);
  assert.match(dl.suggestedFilename(), /escala-domingo-2026-11\.png/);
});

test('E2E: configuracoes — incluir e remover usuario do sistema', { skip, timeout: 60000 }, async () => {
  await page.click('#nav a[data-v=config]'); await page.waitForSelector('#u_add');
  await page.waitForSelector('#users table');
  await page.fill('#u_id', 'Joana'); await page.fill('#u_pw', '123456'); await page.fill('#u_pw2', '123456');
  await page.click('#u_add');
  await page.waitForSelector('#users tr:has-text("joana")');
  assert.match(await txt('#users'), /admin[\s\S]*você/);
  await page.click('#users tr:has-text("joana") [data-rmu]'); await page.click('.modal-foot button:has-text("Remover")');
  await page.waitForFunction(() => !document.querySelector('#users')?.innerText.includes('joana'));
});

test('E2E: usuario so de Escala e Ferias ve apenas essas abas e nao carrega dados sensiveis', { skip, timeout: 90000 }, async () => {
  await page.click('#nav a[data-v=config]'); await page.waitForSelector('#users table');
  await page.fill('#u_id', 'escala1'); await page.fill('#u_pw', 'senha123'); await page.fill('#u_pw2', 'senha123');
  await page.selectOption('#u_perfil', 'escala_ferias');
  await page.click('#u_add'); await page.waitForSelector('#users tr:has-text("escala1")');
  assert.equal(await page.locator('#users tr:has-text("escala1") [data-perfil]').inputValue(), 'escala_ferias');
  await page.click('#logout'); await page.waitForSelector('#lf');
  await page.fill('#lid', 'escala1'); await page.fill('#lpw', 'senha123'); await page.click('#lgo');
  await page.waitForSelector('#nav');
  const abas = await page.$$eval('#nav a', (as) => as.map((a) => a.dataset.v));
  assert.deepEqual(abas, ['escala', 'ferias']);
  await page.waitForSelector('.sundays');
  assert.equal(await page.locator('[data-act=team]').count(), 0);
  const sens = await page.evaluate(() => ({ cpf: window.__D.S.employees.some((e) => e.cpf || e.telefone || e.salarioBase), entries: window.__D.S.entries.size, n: window.__D.S.employees.length }));
  assert.deepEqual(sens, { cpf: false, entries: 0, n: sens.n }); assert.ok(sens.n >= 13);
  await page.click('.mchip[data-m="2026-12"]'); await page.click('[data-act=suggest]'); await page.waitForSelector('#escalaCard');
  await page.click('#nav a[data-v=ferias]'); await page.waitForSelector('table.grid.fer');
  // tentar abrir a folha pelo endereco nao funciona
  await page.evaluate(() => { location.hash = '#folha/2026-09'; }); await page.waitForTimeout(300);
  assert.equal(await page.locator('#nav a.on').getAttribute('data-v'), 'ferias');
  await page.click('#logout'); await page.waitForSelector('#lf');
  await page.fill('#lid', 'admin'); await page.fill('#lpw', 'admin'); await page.click('#lgo'); await page.waitForSelector('#nav');
  assert.ok((await page.$$eval('#nav a', (as) => as.length)) >= 7);
});

test('E2E: ferias — alertas, ajuste do periodo, registro e escala de domingo', { skip, timeout: 90000 }, async () => {
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00'));
  await page.click('#nav a[data-v=ferias]'); await page.waitForSelector('table.grid.fer');
  const vand = 'tr[data-emp="vanderlei-zocateli"]';
  // sem ajuste, o sistema conta desde a admissao (01/12/2022): periodo de 2023 com prazo estourado
  assert.equal(await page.getAttribute(vand, 'data-nivel'), 'dobro');
  assert.ok(+(await page.textContent('#ferbadge')) >= 1);
  // ajusta para o periodo em aberto do relatorio da contabilidade (vcto 30/11/2025)
  await page.click(`${vand} [data-act=adj]`); await page.click('.modal .chip:has-text("30/11/2025")');
  await page.click('.modal-foot button:has-text("Salvar")');
  await page.waitForFunction((s) => document.querySelector(s)?.dataset.nivel === 'urgente', vand);
  assert.match(await txt(vand), /29\/10\/2026/);
  // registra 30 dias a partir de 05/10/2026
  await page.click(`${vand} [data-act=reg]`); await page.fill('#r_ini', '2026-10-05'); await page.fill('#r_dias', '30');
  assert.match(await txt('#r_info'), /03\/11\/2026.*04\/11\/2026/);
  await page.click('.modal-foot button:has-text("Salvar")');
  await page.waitForFunction((s) => document.querySelector(s)?.dataset.nivel === 'aquisicao', vand);
  assert.match(await txt('section.store'), /VANDERLEI[\s\S]*05\/10\/2026[\s\S]*03\/11\/2026/);
  // escala de outubro: aparece como ferias e nao pode ser escalado
  await page.click('#nav a[data-v=escala]'); await page.click('.mchip[data-m="2026-10"]'); await page.waitForSelector('.sundays');
  await page.click('.sunday:nth-child(2) [data-act=edit][data-s=correas]');
  assert.match(await page.locator('.modal label', { hasText: 'VANDERLEI' }).innerText(), /férias/);
  await page.click('.modal [data-close]');
  // historico e exclusao
  await page.click('#nav a[data-v=ferias]'); await page.waitForSelector(vand);
  await page.click(`${vand} [data-act=hist]`); await page.click('.modal [data-del]'); await page.click('.modal-foot button:has-text("Excluir")');
  await page.waitForFunction((s) => document.querySelector(s)?.dataset.nivel === 'urgente', vand);
});

test('E2E: importa o relatorio de ferias da contabilidade (OCR no navegador)', { skip: skip || !FERIAS_IMG || !fs.existsSync(FERIAS_IMG), timeout: 300000 }, async () => {
  await page.setInputFiles('#ff', FERIAS_IMG);
  await page.waitForSelector('#rv', { timeout: 240000 });
  const n = await page.locator('#rv tbody tr').count();
  const semFunc = await page.locator('#rv tbody tr.bad').count();
  console.log(`  relatorio: ${n} linhas, ${semFunc} sem funcionario`);
  assert.ok(n >= 8 && semFunc === 0);
  const paulo = page.locator('#rv tbody tr').filter({ has: page.locator('td:first-child', { hasText: 'PAULO' }) });
  assert.equal(await paulo.locator('[data-f=emp]').inputValue(), 'paulo-giovani');
  assert.equal(await paulo.locator('[data-f=venc]').inputValue(), '2026-05-31');
  const lidos = await page.$$eval('#rv tbody tr', (trs) => trs.map((t) => `${t.querySelector('[data-f=emp]').value}=${t.querySelector('[data-f=venc]').value}`));
  console.log('  ' + lidos.join(' '));
  await page.click('.modal-foot button:has-text("Aplicar")');
  await page.waitForFunction(() => document.querySelector('tr[data-emp="paulo-giovani"]')?.innerText.includes('31/05/2026'));
  assert.match(await txt('tr[data-emp="paulo-giovani"]'), /29\/04\/2027[\s\S]*Pode tirar/);
  assert.match(await txt('tr[data-emp="gustavo-henrique"]'), /31\/01\/2026[\s\S]*30\/12\/2026/);
});

test('E2E: encerra e nao houve erros de JavaScript', { skip, timeout: 30000 }, async () => {
  await browser?.close(); srv?.close();
  assert.deepEqual(errors, []);
});
