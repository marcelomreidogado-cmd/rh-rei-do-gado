// Guarda o pedido (imagem + mensagem + telefone) e abre a conversa no WhatsApp Web.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'enviar') {
    (async () => {
      const job = { ...msg.job, criadoEm: Date.now(), rhTab: sender.tab ? sender.tab.id : null };
      await chrome.storage.local.set({ pendente: job });
      const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(job.phone)}`;
      const [tab] = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      if (tab) { await chrome.tabs.update(tab.id, { url, active: true }); try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) { /* ok */ } }
      else await chrome.tabs.create({ url, active: true });
      reply({ ok: true });
    })().catch((e) => reply({ ok: false, erro: String(e && e.message || e) }));
    return true;
  }
  if (msg.type === 'resultado') {
    (async () => {
      await chrome.storage.local.remove('pendente');
      await chrome.storage.local.set({ resultado: { ...msg.resultado, em: Date.now() } });
      if (msg.resultado.ok && msg.rhTab != null) { try { const t = await chrome.tabs.update(msg.rhTab, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); } catch (e) { /* aba do RH fechada */ } }
    })();
  }
  return false;
});
