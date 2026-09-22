import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, toast, confirmBox, downloadText } from '../ui.js';

export function renderConfig(root) {
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
  <section class="card"><h2>Segurança</h2><ul>
    <li>Acesso somente com ID e senha; a sessão fecha ao fechar a aba ou após 30 min sem uso.</li>
    <li>Usuário atual: <b>${esc(S.user?.id || '')}</b>. Novos administradores são criados no console do Firebase (veja o README).</li>
    <li>Todas as alterações ficam registradas na aba <b>Histórico</b>.</li></ul></section>`;
  $('#c_save', root).onclick = async () => {
    const vt = C.num($('#c_vt', root).value);
    if (!(vt > 0)) return toast('Valor da passagem inválido.', 'err');
    await D.saveConfig({ vt, dddPadrao: $('#c_ddd', root).value.replace(/\D/g, '') || '24', emailAssunto: $('#c_assunto', root).value.trim(), waTemplate: $('#c_wa', root).value.trim() });
    toast('Configurações salvas.');
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
