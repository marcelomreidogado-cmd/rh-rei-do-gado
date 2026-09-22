// Utilitarios de interface (sem framework)
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, type = 'ok', ms = 4200) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
  t.className = `toast ${type} show`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Abre um modal. body: string HTML. Devolve { el, close }. */
export function openModal({ title, body, actions = [], wide = false, onMount, closable = true }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3>${closable ? '<button class="icon-btn" data-close aria-label="Fechar">✕</button>' : ''}</div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && closable) close(); };
  document.addEventListener('keydown', onKey);
  const api = { el: ov, close, $: (s) => $(s, ov), $$: (s) => $$(s, ov) };
  ov.addEventListener('click', async (e) => {
    if (e.target === ov && closable) return close();
    if (e.target.closest('[data-close]')) return close();
    const b = e.target.closest('button[data-i]');
    if (b) {
      const a = actions[+b.dataset.i];
      b.disabled = true;
      try { const r = await a.onClick?.(api); if (r !== false && !a.keepOpen) close(); } catch (err) { toast(err.message || String(err), 'err'); }
      b.disabled = false;
    }
  });
  onMount?.(api);
  const first = ov.querySelector('input,select,textarea,button.btn');
  first?.focus();
  return api;
}

export function confirmBox(message, { okLabel = 'Confirmar', danger = false, title = 'Confirmação' } = {}) {
  return new Promise((res) => {
    let done = false;
    const m = openModal({
      title, body: `<p class="pre">${esc(message)}</p>`,
      actions: [{ label: 'Cancelar', onClick: () => { done = true; res(false); } }, { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; res(true); } }],
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) res(false); } });
    obs.observe(document.body, { childList: true });
  });
}

/** Copia HTML + texto para a area de transferencia (cola como tabela no e-mail). */
export async function copyRich(html, text) {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return true;
    }
  } catch (e) { /* tenta o metodo antigo */ }
  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;';
  div.innerHTML = html;
  document.body.appendChild(div);
  const r = document.createRange();
  r.selectNodeContents(div);
  const s = getSelection();
  s.removeAllRanges(); s.addRange(r);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  s.removeAllRanges(); div.remove();
  return ok;
}

/** Copia uma imagem (dataURL) como PNG - o navegador so aceita PNG na area de transferencia. */
export async function copyImageDataUrl(dataUrl) {
  if (!(navigator.clipboard && window.ClipboardItem)) return false;
  try {
    const png = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'); };
      im.onerror = rej; im.src = dataUrl;
    });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch (e) { return false; }
}

export const dataUrlToBlob = (u) => { const [h, b] = u.split(','); const mime = h.match(/:(.*?);/)[1]; const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); };

export function downloadText(name, text, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
