// Roda no WhatsApp Web: quando ha um contracheque pendente, cola a imagem na conversa,
// escreve a mensagem na legenda e clica em Enviar.
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visivel = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)].filter(visivel);
  const naFooter = (el) => !!el.closest('footer');
  async function esperar(fn, ms, erro) {
    const fim = Date.now() + ms;
    for (;;) { const v = fn(); if (v) return v; if (Date.now() > fim) throw new Error(erro); await sleep(250); }
  }
  const composer = () => qa('footer div[contenteditable="true"]')[0];
  // legenda = caixa de texto que APARECE depois de colar (a busca da lateral tambem e contenteditable)
  let antes = new Set();
  const marcar = () => { antes = new Set(document.querySelectorAll('[contenteditable="true"]')); };
  const legenda = () => qa('div[contenteditable="true"]').find((el) => !naFooter(el) && !antes.has(el) && !el.closest('#side'));
  const SEND = '[data-icon="send"], [data-icon="wds-ic-send-filled"], [data-icon="send-light"], [aria-label="Enviar"], [aria-label="Send"]';
  const botaoEnviar = (fora) => qa(SEND).map((el) => el.closest('button, [role="button"]') || el).find((el) => (fora ? !naFooter(el) && !el.closest('#side') : naFooter(el)));
  const erroNumero = () => qa('[role="dialog"], [data-animate-modal-popup="true"]').find((d) => /inv[aá]lid|invalid/i.test(d.textContent || ''));
  const arquivo = (job) => {
    const [h, b] = job.image.split(','); const mime = (h.match(/:(.*?);/) || [])[1] || 'image/png';
    const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new File([a], job.filename || 'contracheque.png', { type: mime });
  };
  const escrever = (el, texto) => { el.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, texto); };

  async function colar(file) {
    const c = composer(); c.focus();
    const dt = new DataTransfer(); dt.items.add(file);
    c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    try { return await esperar(() => legenda() || botaoEnviar(true), 8000, 'x'); } catch (e) { return null; }
  }
  async function anexar(file) { // plano B: botao de anexo + campo de arquivo de fotos
    const plus = qa('[data-icon="plus"], [data-icon="plus-rounded"], [data-icon="attach-menu-plus"], [data-icon="clip"], [aria-label="Anexar"], [title="Anexar"], [aria-label="Attach"], [title="Attach"]')[0];
    if (plus) (plus.closest('button, [role="button"]') || plus).click();
    const input = await esperar(() => [...document.querySelectorAll('input[type="file"]')].find((i) => /image/.test(i.accept || '')) || document.querySelector('input[type="file"]'), 6000, 'Não achei onde anexar a imagem no WhatsApp Web');
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return esperar(() => legenda() || botaoEnviar(true), 8000, 'O WhatsApp não abriu a imagem para envio');
  }

  async function enviar(job) {
    await esperar(() => composer() || (erroNumero() && 'erro'), 90000, 'A conversa não abriu. O WhatsApp Web está conectado?');
    if (erroNumero()) throw new Error('O WhatsApp diz que este número é inválido. Confira o telefone no cadastro.');
    await sleep(600);
    const file = arquivo(job);
    marcar();
    let ok = await colar(file);
    if (!ok) ok = await anexar(file);
    await sleep(400);
    const leg = legenda();
    if (leg && job.text) escrever(leg, job.text);
    await sleep(300);
    const btn = await esperar(() => botaoEnviar(true), 6000, 'Não achei o botão de enviar da imagem');
    btn.click();
    await esperar(() => !legenda() && !botaoEnviar(true), 20000, 'A imagem não saiu. Confira a conversa no WhatsApp.');
    if (!leg && job.text) { // sem legenda: manda a mensagem logo depois
      escrever(composer(), job.text); await sleep(300);
      const b2 = await esperar(() => botaoEnviar(false), 5000, 'A imagem foi, mas não consegui enviar a mensagem.');
      b2.click();
    }
    await sleep(800);
  }

  (async () => {
    const { pendente: job } = await chrome.storage.local.get('pendente');
    if (!job || Date.now() - job.criadoEm > 3 * 60 * 1000) return;
    const fim = (ok, erro) => chrome.runtime.sendMessage({ type: 'resultado', rhTab: job.rhTab, resultado: { id: job.id, ok, erro: erro || '' } });
    try { await enviar(job); fim(true); } catch (e) { fim(false, e.message); }
  })();
})();
