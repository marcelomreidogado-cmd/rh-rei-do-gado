// Extensao "RH Rei do Gado — WhatsApp": um clique no RH -> conversa aberta, imagem colada, mensagem na legenda, enviado.
// O WhatsApp Web e simulado (tests/e2e/wa-mock.html) porque a sandbox nao acessa web.whatsapp.com.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './e2e/server.js';

const SEED = process.env.SEED_JSON;
const pwChrome = () => { try { for (const d of fs.readdirSync('/opt/pw-browsers').filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) for (const s of ['chrome-linux64/chrome', 'chrome-linux/chrome']) { const p = `/opt/pw-browsers/${d}/${s}`; if (fs.existsSync(p)) return p; } } catch (e) { /* sem pasta */ } return null; };
const CHROME = [process.env.CHROME_BIN, pwChrome()].find((p) => p && fs.existsSync(p));
const EXT = path.resolve('extensao-whatsapp');
const MOCK = fs.readFileSync(path.resolve('tests/e2e/wa-mock.html'), 'utf8');

test('extensao WhatsApp: 1 clique envia a imagem do contracheque com a mensagem', { skip: !SEED || !fs.existsSync(SEED) || !CHROME, timeout: 120000 }, async () => {
  const { srv, url } = await startServer(SEED);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhwa-'));
  const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, viewport: { width: 1500, height: 900 },
    args: ['--no-sandbox', '--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  try {
    await ctx.route('https://web.whatsapp.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOCK }));
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(url + '/?demo#contracheques/2026-10');
    await page.waitForSelector('#lf'); await page.fill('#lid', 'admin'); await page.fill('#lpw', 'admin'); await page.click('#lgo');
    await page.waitForSelector('#nav');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.rhWhatsapp), '1', 'extensao detectada na pagina do RH');
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 500; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 500); g.fillStyle = '#000'; g.font = '30px sans-serif'; g.fillText('CONTRACHEQUE BRUNO', 40, 200);
      if (!window.__D.monthDoc('2026-10')) await window.__D.createMonth('2026-10');
      await window.__D.savePayslip('2026-10', 'bruno-jose', { liquido: 945.93, inss: 158.21, fgts: 162.25, totalVenc: 2618.21, itens: [] }, c.toDataURL('image/jpeg', 0.85));
    });
    await page.click('#nav a[data-v=folha]'); await page.click('#nav a[data-v=contracheques]');
    await page.click('.mchip[data-m="2026-10"]');
    await page.waitForSelector('tr[data-emp="bruno-jose"] [data-act=wa]:not([disabled])');
    await page.click('tr[data-emp="bruno-jose"] [data-act=wa]'); await page.waitForSelector('#wa_enviar');
    assert.equal(await page.locator('.wa-envio button').count(), 1, 'um botao so');
    assert.equal(await page.locator('#wa_enviar').isDisabled(), false);
    await page.fill('#wamsg', 'Olá, Bruno! Segue o seu contracheque de Outubro/2026.');
    const waPage = ctx.waitForEvent('page');
    await page.click('#wa_enviar');
    const wa = await waPage; await wa.waitForURL(/web\.whatsapp\.com/);
    assert.match(wa.url(), /web\.whatsapp\.com\/send\?phone=55\d{10,11}/);
    await wa.waitForFunction(() => window.__sent && window.__sent.length >= 1, null, { timeout: 30000 });
    const sent = await wa.evaluate(() => window.__sent);
    assert.equal(sent.length, 1, JSON.stringify(sent));
    assert.equal(sent[0].tipo, 'imagem');
    assert.match(sent[0].nome, /contracheque-2026-10-Bruno\.jpg/);
    assert.ok(sent[0].tamanho > 5000, 'imagem de verdade');
    assert.equal(sent[0].legenda, 'Olá, Bruno! Segue o seu contracheque de Outubro/2026.');
    // volta no RH: marcado como enviado
    await page.waitForFunction(() => document.querySelector('tr[data-emp="bruno-jose"]')?.textContent.includes('✔ enviado'), null, { timeout: 15000 });
    // segundo funcionario: reaproveita a mesma aba do WhatsApp
    await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 700; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, 700, 400); g.fillText('THAIS', 50, 50);
      await window.__D.savePayslip('2026-10', 'thais-carmo', { liquido: 1200, inss: 100, fgts: 120, totalVenc: 1600, itens: [] }, c.toDataURL('image/jpeg', 0.9)); });
    await page.click('#nav a[data-v=folha]'); await page.click('#nav a[data-v=contracheques]');
    await page.waitForSelector('tr[data-emp="thais-carmo"] [data-act=wa]:not([disabled])');
    await page.click('tr[data-emp="thais-carmo"] [data-act=wa]'); await page.waitForSelector('#wa_enviar');
    await page.click('#wa_enviar');
    await page.waitForFunction(() => document.querySelector('tr[data-emp="thais-carmo"]')?.textContent.includes('✔ enviado'), null, { timeout: 30000 });
    const abas = ctx.pages().filter((p) => p.url().includes('web.whatsapp.com'));
    assert.equal(abas.length, 1, 'uma aba do WhatsApp so');
    const s2 = await abas[0].evaluate(() => window.__sent);
    assert.equal(s2.length, 1); assert.match(s2[0].nome, /Thais/); assert.match(s2[0].legenda, /Thais/i);
    assert.deepEqual(erros, []);
  } finally { await ctx.close(); srv.close(); }
});
