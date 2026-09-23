import { firebaseConfig, APP_VERSION } from './config.js';
import * as C from './calc.js';
import * as D from './data.js';
import { S, COL } from './data.js';
import { firestoreStore, firebaseAuth, memoryStore, memoryAuth } from './store.js';
import { esc, $, $$, toast } from './ui.js';
import * as Folha from './views/folha.js';
import * as Contra from './views/contracheques.js';
import * as Escala from './views/escala.js';
import * as Func from './views/funcionarios.js';
import * as Ferias from './views/ferias.js';
import * as Ajustes from './views/ajustes.js';

const DEMO = new URLSearchParams(location.search).has('demo') && ['localhost', '127.0.0.1'].includes(location.hostname);
const ALL_VIEWS = [['folha', 'Folha de pagamento', true], ['contracheques', 'Contracheques', true], ['escala', 'Escala de domingo', true], ['ferias', 'Férias', false], ['funcionarios', 'Funcionários', false], ['config', 'Configurações', false], ['historico', 'Histórico', false]];
let VIEWS = ALL_VIEWS;
const IDLE_MS = 30 * 60 * 1000;

let auth, view = 'folha', month = null, year = null, idleTimer = null;
const app = () => $('#app');

async function boot() {
  try {
    if (DEMO) {
      let seed = {};
      try { const r = await fetch('/demo-seed.json'); if (r.ok) seed = await r.json(); } catch (e) { /* sem seed */ }
      const store = memoryStore({ [COL.admins]: { 'demo-admin': { id: 'admin' } } });
      D.init(store); auth = memoryAuth();
      window.__store = store; window.__D = D; window.__C = C;
      if (seed.employees) { D.S.user = { id: 'admin', uid: 'demo-admin' }; await D.importSeed(seed); D.S.user = null; }
    } else {
      if (!window.firebase) throw new Error('Não foi possível carregar o Firebase. Verifique a internet e recarregue.');
      firebase.initializeApp(firebaseConfig);
      D.init(firestoreStore(firebase)); auth = firebaseAuth(firebase);
    }
    await auth.init();
    showLogin();
    auth.onChange(onUser);
    if (!DEMO) checkOpenRules();
  } catch (e) { app().innerHTML = `<div class="login"><div class="card"><h1>Erro ao iniciar</h1><p class="lack">${esc(e.message)}</p></div></div>`; console.error(e); }
}

/** Alerta se o Firestore aceita leitura sem login (regras abertas = dados de RH expostos). */
async function checkOpenRules() {
  try {
    await S.store.get(COL.config, 'settings');
    const b = $('#openrules'); if (b) b.hidden = false;
    window.__openRules = true;
  } catch (e) { window.__openRules = false; /* permission-denied = regras protegendo, ok */ }
}

async function onUser(user) {
  if (!user) { S.user = null; clearTimeout(idleTimer); showLogin(); return; }
  try {
    const adm = await S.store.get(COL.admins, user.uid);
    if (!adm) { await auth.signOut(); showLogin('Este usuário não tem permissão de administrador do RH.'); return; }
    S.user = user;
    S.perfil = D.PERFIS[adm.perfil] ? adm.perfil : 'total';
    await D.loadAll();
    initMonth();
    startIdle();
    showShell();
    route();
  } catch (e) {
    console.error(e);
    await auth.signOut();
    showLogin(e.code === 'permission-denied' ? 'Sem permissão para ler os dados. Confira as regras do Firestore (README).' : 'Erro ao carregar dados: ' + e.message);
  }
}

function startIdle() {
  const reset = () => { clearTimeout(idleTimer); idleTimer = setTimeout(async () => { toast('Sessão encerrada por inatividade.', 'err'); await auth.signOut(); }, IDLE_MS); };
  ['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, reset, { passive: true }));
  reset();
}

function initMonth() {
  const allow = D.PERFIL_VIEWS[S.perfil];
  VIEWS = allow ? ALL_VIEWS.filter((v) => allow.includes(v[0])) : ALL_VIEWS;
  if (!VIEWS.some((v) => v[0] === view)) view = VIEWS[0][0];
  const today = new Date();
  const cur = C.monthKey(today.getFullYear(), today.getMonth() + 1);
  const known = D.monthsKnown();
  month = known.includes(cur) || !known.length ? cur : known[known.length - 1];
  year = C.parseMonth(month).y;
  const h = location.hash.replace('#', '').split('/');
  if (VIEWS.some((v) => v[0] === h[0])) view = h[0];
  else if (!VIEWS.some((v) => v[0] === view)) view = VIEWS[0][0];
  if (/^\d{4}-\d{2}$/.test(h[1] || '')) { month = h[1]; year = C.parseMonth(month).y; }
}

function showLogin(msg = '') {
  let fails = +sessionStorage.getItem('fails') || 0;
  app().innerHTML = `<div class="login"><form class="card" id="lf" autocomplete="on">
    <div class="brand big"><span class="logo">RH</span><div><h1>Folha de Pagamento</h1><small>Rei do Gado · acesso restrito</small></div></div>
    <div id="openrules" class="warn-box" hidden><b>ATENÇÃO — regras do banco abertas.</b> O Firestore deste projeto aceita leitura sem login. Os dados de RH ficam expostos até você aplicar as regras de segurança (veja o README, seção “Regras”).</div>
    ${msg ? `<p class="lack" role="alert">${esc(msg)}</p>` : ''}
    <label>ID<input class="in" id="lid" name="username" autocomplete="username" autocapitalize="none" required autofocus></label>
    <label>Senha<input class="in" id="lpw" name="password" type="password" autocomplete="current-password" required></label>
    <p class="lack" id="lerr" role="alert"></p>
    <button class="btn primary block" id="lgo">Entrar</button></form></div>`;
  if (window.__openRules) $('#openrules').hidden = false;
  $('#lf').onsubmit = async (ev) => {
    ev.preventDefault();
    const until = +sessionStorage.getItem('lockUntil') || 0;
    if (Date.now() < until) { $('#lerr').textContent = `Aguarde ${Math.ceil((until - Date.now()) / 1000)}s para tentar de novo.`; return; }
    const btn = $('#lgo'); btn.disabled = true; btn.textContent = 'Entrando…';
    try { await auth.signIn($('#lid').value, $('#lpw').value); sessionStorage.removeItem('fails'); }
    catch (e) {
      fails++; sessionStorage.setItem('fails', fails);
      if (fails >= 5) { sessionStorage.setItem('lockUntil', Date.now() + 60000); sessionStorage.setItem('fails', 0); }
      $('#lerr').textContent = e.message; btn.disabled = false; btn.textContent = 'Entrar';
    }
  };
}

function showShell() {
  app().innerHTML = `<header class="top"><div class="brand"><span class="logo">RH</span><div><b>Folha de Pagamento</b><small>Rei do Gado</small></div></div>
    <nav id="nav">${VIEWS.map(([k, l]) => `<a href="#${k}" data-v="${k}">${l}${k === 'ferias' ? '<span class="navbadge" id="ferbadge" hidden></span>' : ''}</a>`).join('')}</nav>
    <div class="user"><span>${esc(S.user.id)}</span><button class="btn sm" id="logout">Sair</button></div></header>
    <div id="monthbar" class="monthbar"></div><main id="main"></main><footer class="foot">v${APP_VERSION} · dados protegidos por login · ${DEMO ? 'MODO DEMONSTRAÇÃO (memória)' : 'Firebase'}</footer>`;
  $('#logout').onclick = () => auth.signOut();
  $('#nav').onclick = (ev) => { const a = ev.target.closest('a'); if (a) { ev.preventDefault(); go(a.dataset.v, month); } };
  window.onhashchange = () => { const h = location.hash.replace('#', '').split('/'); if (VIEWS.some((v) => v[0] === h[0]) && (h[0] !== view || h[1] !== month)) { view = h[0]; if (/^\d{4}-\d{2}$/.test(h[1] || '')) month = h[1]; route(); } };
}

function go(v, m) { view = v; month = m; history.replaceState(null, '', `#${v}${VIEWS.find((x) => x[0] === v)[2] ? '/' + m : ''}`); route(); }

function monthBar() {
  const bar = $('#monthbar');
  const uses = VIEWS.find((v) => v[0] === view)[2];
  bar.hidden = !uses;
  if (!uses) return;
  bar.innerHTML = `<button class="btn sm" data-y="-1" aria-label="Ano anterior">‹</button><b class="yr">${year}</b><button class="btn sm" data-y="1" aria-label="Próximo ano">›</button>
    ${C.MESES.map((n, i) => { const k = C.monthKey(year, i + 1), d = D.monthDoc(k); if (S.perfil !== 'total') return `<button class="mchip ${k === month ? 'on' : ''}" data-m="${k}">${n.slice(0, 3)}</button>`; return `<button class="mchip ${k === month ? 'on' : ''} ${d ? d.status : 'none'}" data-m="${k}" title="${d ? (d.status === 'closed' ? 'Enviado' : 'Em preenchimento') : 'Ainda não criado'}">${n.slice(0, 3)}${d ? (d.status === 'closed' ? ' ✔' : ' ●') : ''}</button>`; }).join('')}`;
  bar.onclick = (ev) => {
    const y = ev.target.closest('[data-y]'), m = ev.target.closest('[data-m]');
    if (y) { year += +y.dataset.y; monthBar(); }
    if (m) go(view, m.dataset.m);
  };
}

async function route() {
  Ferias.updateBadge();
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.v === view));
  year = C.parseMonth(month).y;
  monthBar();
  const holder = $('#main');
  holder.innerHTML = '';
  const main = document.createElement('div'); // container novo a cada tela: evita listeners duplicados entre telas
  holder.appendChild(main);
  try {
    if (view === 'folha') Folha.render(main, month);
    else if (view === 'contracheques') await Contra.render(main, month);
    else if (view === 'escala') await Escala.render(main, month);
    else if (view === 'ferias') Ferias.render(main);
    else if (view === 'funcionarios') Func.render(main);
    else if (view === 'config') Ajustes.renderConfig(main, auth);
    else if (view === 'historico') await Ajustes.renderLog(main);
  } catch (e) { console.error(e); main.innerHTML = `<p class="lack">Erro ao abrir a tela: ${esc(e.message)}</p>`; }
}

window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast(e.reason?.message || 'Erro inesperado.', 'err'); });
boot();
