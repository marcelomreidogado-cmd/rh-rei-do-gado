// Roda na pagina do RH: avisa que a extensao esta instalada e repassa os pedidos de envio.
document.documentElement.dataset.rhWhatsapp = '1';
window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (ev.source !== window || !d || d.source !== 'rh-rdg' || d.type !== 'wa-enviar') return;
  chrome.runtime.sendMessage({ type: 'enviar', job: d.job }, (r) => {
    const erro = chrome.runtime.lastError ? chrome.runtime.lastError.message : (r && r.erro) || '';
    window.postMessage({ source: 'rh-rdg-ext', type: 'wa-aceito', id: d.job.id, ok: !!(r && r.ok), erro }, '*');
  });
});
chrome.storage.onChanged.addListener((ch) => {
  if (ch.resultado && ch.resultado.newValue) window.postMessage({ source: 'rh-rdg-ext', type: 'wa-resultado', ...ch.resultado.newValue }, '*');
});
