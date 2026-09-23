import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, toast, confirmBox, downloadText } from '../ui.js';

export function renderConfig(root, auth) {
  const c = S.config;
  root.innerHTML = `<div class="toolbar"><strong>Configurações</strong></div>
  <section class="card"><h2>Regras da folha</h2><div class="grid3">
    <label>Passagem por dia trabalhado (R$)<input class="in" id="c_vt" inputmode="decimal" value="${C.brl(c.vt, false)}"><small>Vale para lançamentos novos. Meses já lançados mantêm o valor com que foram feitos.</small></label>
    <label>DDD padrão (telefones sem DDD)<input class="in" id="c_ddd" value="${esc(c.dddPadrao)}" maxlength="2"></label>
    <label class="span3">Assunto do e-mail para a contabilidade<input class="in" id="c_assunto" value="${esc(c.emailAssunto)}"><small>Use {mes} para o mês/ano.</small></label>
    <label class="span3">Mensagem do WhatsApp com o contracheque<textarea class="in" id="c_wa" rows="3">${esc(c.waTemplate)}</textarea><small>Use {nome} e {mes}.</small></label></div>
    <button class="btn primary" id="c_save">Salvar configurações</button></section>
  <section class="card"><h2>Dados iniciais e backup</h2>
    <p>Importe o arquivo <b>dados-iniciais-REI-DO-GADO.json</b> (gerado a partir da planilha) para carregar funcionários, meses de fevereiro a setembro e afastamentos. Nada é sobrescrito: só entra o que ainda não existe.</p>
    <input type="file" id="seed" accept="application/json,.json" hidden><button class="btn" id="seedbtn">📥 Importar dados iniciais…</button>
    <button class="btn" id="bak">💾 Baixar backup completo (JSON)</button>
    <p class="muted">O backup contém CPF e salários — guarde em local seguro.</p></section>
  <section class="card"><h2>Usuários do sistema</h2>
    <p class="muted">Quem pode entrar no sistema (ID e senha). Cada pessoa entra com o próprio usuário, e tudo o que ela altera fica no Histórico com o nome dela.</p>
    <div id="users"><p class="muted">Carregando…</p></div>
    <div class="grid3" style="margin-top:10px"><label>ID (login)<input class="in" id="u_id" autocomplete="off" autocapitalize="none" placeholder="ex.: joana"></label>
      <label>Senha (mín. 6)<input class="in" id="u_pw" type="password" autocomplete="new-password"></label>
      <label>Repetir senha<input class="in" id="u_pw2" type="password" autocomplete="new-password"></label></div>
    <button class="btn primary" id="u_add" style="margin-top:8px">＋ Incluir usuário</button></section>
  <section class="card"><h2>Segurança</h2><ul>
    <li>Acesso somente com ID e senha; a sessão fecha ao fechar a aba ou após 30 min sem uso.</li>
    <li>Usuário atual: <b>${esc(S.user?.id || '')}</b>.</li>
    <li>Todas as alterações ficam registradas na aba <b>Histórico</b>.</li></ul></section>`;
  $('#c_save', root).onclick = async () => {
    const vt = C.num($('#c_vt', root).value);
    if (!(vt > 0)) return toast('Valor da passagem inválido.', 'err');
    await D.saveConfig({ vt, dddPadrao: $('#c_ddd', root).value.replace(/\D/g, '') || '24', emailAssunto: $('#c_assunto', root).value.trim(), waTemplate: $('#c_wa', root).value.trim() });
    toast('Configurações salvas.');
  };
  const loadUsers = async () => {
    const box = $('#users', root);
    try {
      const list = await D.listAdmins();
      box.innerHTML = `<div class="table-wrap"><table class="grid mini"><thead><tr><th>ID</th><th>Incluído em</th><th>Por</th><th></th></tr></thead><tbody>${list.map((u) => `<tr><td><b>${esc(u.id || '(sem ID)')}</b>${u.id === S.user?.id ? ' <span class="badge">você</span>' : ''}</td><td>${u.criadoEm ? esc(new Date(u.criadoEm).toLocaleDateString('pt-BR')) : '—'}</td><td>${esc(u.criadoPor || '')}</td><td>${u.id === S.user?.id || !u.uid ? '' : `<button class="btn sm danger" data-rmu="${esc(u.id)}">Remover acesso</button>`}</td></tr>`).join('')}</tbody></table></div>`;
      box.onclick = async (ev) => {
        const b = ev.target.closest('[data-rmu]'); if (!b) return;
        const u = list.find((x) => x.id === b.dataset.rmu);
        if (!(await confirmBox(`Remover o acesso de "${u.id}"? A pessoa não consegue mais entrar no sistema.`, { okLabel: 'Remover', danger: true }))) return;
        try { await D.removeAdmin(u.uid); toast('Acesso removido.'); loadUsers(); } catch (e) { toast(e.code === 'permission-denied' ? 'As regras do Firestore ainda não permitem remover usuários — atualize as regras (README).' : e.message, 'err', 8000); }
      };
    } catch (e) {
      box.innerHTML = `<div class="warn-box">Para listar e incluir usuários por aqui, atualize as <b>regras do Firestore</b> uma vez (arquivo <code>firestore.rules.rh</code>, bloco <code>rh_admins</code> — passo a passo no README). Até lá, os usuários continuam sendo criados no console do Firebase.</div>`;
    }
  };
  loadUsers();
  $('#u_add', root).onclick = async () => {
    const id = $('#u_id', root).value, pw = $('#u_pw', root).value;
    if (pw !== $('#u_pw2', root).value) return toast('As senhas não conferem.', 'err');
    if (pw.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres.', 'err');
    const b = $('#u_add', root); b.disabled = true;
    try { await D.addAdmin(auth, id, pw); toast(`Usuário "${id.trim().toLowerCase()}" incluído. Já pode entrar com esse ID e senha.`); ['#u_id', '#u_pw', '#u_pw2'].forEach((s) => { $(s, root).value = ''; }); loadUsers(); }
    catch (e) { toast(e.message, 'err', 9000); }
    b.disabled = false;
  };
  $('#seedbtn', root).onclick = () => $('#seed', root).click();
  $('#seed', root).onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const seed = JSON.parse(await f.text());
      if (!(await confirmBox(`Importar ${seed.employees?.length || 0} funcionários e ${Object.keys(seed.months || {}).length} meses? Só o que ainda não existe será criado.`, { okLabel: 'Importar' }))) return;
      const r = await D.importSeed(seed);
      toast(`Importado: ${r.nEmp} funcionários, ${r.nEnt} lançamentos, ${r.nLea} afastamentos.`, 'ok', 8000);
    } catch (e) { toast(e.message, 'err', 8000); }
    ev.target.value = '';
  };
  $('#bak', root).onclick = async () => { downloadText(`backup-rh-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await D.exportBackup(), null, 1)); await D.log('backup_baixado'); };
}

export async function renderLog(root) {
  root.innerHTML = '<p class="muted">Carregando…</p>';
  const logs = await D.loadLog(400);
  root.innerHTML = `<div class="toolbar"><strong>Histórico de alterações</strong><span class="muted">últimas ${logs.length}</span></div>
  <div class="table-wrap"><table class="grid mini"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Detalhe</th></tr></thead><tbody>
  ${logs.map((l) => `<tr><td>${esc(new Date(l.ts).toLocaleString('pt-BR'))}</td><td>${esc(l.user)}</td><td>${esc(l.action)}</td><td>${esc(l.detail)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem registros.</td></tr>'}</tbody></table></div>`;
}
