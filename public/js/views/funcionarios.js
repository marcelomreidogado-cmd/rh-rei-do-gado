import * as C from '../calc.js';
import * as D from '../data.js';
import { S } from '../data.js';
import { esc, $, toast, openModal } from '../ui.js';

let root, showInactive = false;
const mask = (cpf) => { const d = C.cpfDigits(cpf); return d.length === 11 ? `•••.•••.•••-${d.slice(9)}` : '—'; };

export function render(el) {
  root = el;
  const list = S.employees.filter((e) => showInactive || e.ativo !== false);
  const sel = (e, f, opts, val) => `<select class="in sm" data-inl="${f}" data-id="${esc(e.id)}">${opts.map(([k, v]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  root.innerHTML = `<div class="toolbar"><strong>Funcionários</strong><span class="muted">${S.employees.filter((e) => e.ativo !== false).length} ativos · o cadastro alimenta a folha (pela loja do registro) e a escala de domingo (pela loja onde trabalha)</span><span class="spacer"></span>
    <label class="inline"><input type="checkbox" id="inact" ${showInactive ? 'checked' : ''}> mostrar desligados</label><button class="btn primary" data-act="new">＋ Novo funcionário</button></div>
    ${C.STORES.map((st) => `<section class="store"><h2>${esc(st.nome)} <small>registro / imposto · CNPJ ${esc(st.cnpj)}</small></h2><div class="table-wrap"><table class="grid"><thead><tr><th>Nome</th><th>Função</th><th>Entrada</th><th>Admissão</th><th>Salário</th><th>Trabalha em</th><th>Escala de domingo</th><th>CPF</th><th>Telefone</th><th></th></tr></thead><tbody>
    ${list.filter((e) => e.loja === st.id).map((e) => { const ph = C.normalizePhone(e.telefone, S.config.dddPadrao); const cpfOk = !e.cpf || C.cpfValid(e.cpf);
      return `<tr class="${e.ativo === false ? 'off' : ''}" data-emp="${esc(e.id)}"><td class="c-nome">${esc(e.nome)}${e.ativo === false ? ' <span class="badge">desligado</span>' : ''}</td><td>${esc(e.funcao || '')}</td><td class="c-dt">${C.fmtDMY(e.entrada)}</td><td class="c-dt">${C.fmtDMY(e.admissao)}</td><td class="num">${C.brl(e.salarioBase)}</td>
      <td>${sel(e, 'lojaTrabalho', C.WORK_PLACES.map((w) => [w.id, w.nome]), C.workStore(e))}</td><td>${sel(e, 'categoria', Object.entries(C.CATEGORIAS), e.categoria)}</td>
      <td>${mask(e.cpf)}${cpfOk ? '' : ' <span class="badge warn" title="Os dígitos verificadores não conferem: provável erro de digitação">CPF?</span>'}${e.cpf ? '' : ' <span class="badge warn">falta CPF</span>'}</td>
      <td class="${ph.ok ? '' : 'bad'}">${ph.ok ? esc(ph.display) : 'sem telefone'}</td><td><button class="btn sm" data-act="edit" data-id="${esc(e.id)}">Editar</button></td></tr>`; }).join('') || '<tr><td colspan="10" class="muted">Nenhum.</td></tr>'}
    </tbody></table></div></section>`).join('')}
    <p class="muted small"><b>Loja do registro</b> (seções acima) é a empresa/CNPJ usada na folha e nos impostos. <b>Trabalha em</b> é onde a pessoa está de verdade — é o que a escala de domingo usa. Administrativo não entra na escala.</p>`;
  root.onchange = async (ev) => {
    const t = ev.target.closest('[data-inl]'); if (!t) return;
    const e = D.emp(t.dataset.id);
    await D.saveEmployee({ ...e, [t.dataset.inl]: t.value });
    toast(`${e.nome.split(' ')[0]}: ${t.dataset.inl === 'lojaTrabalho' ? 'trabalha em ' + C.workPlaceName(t.value) : 'escala de domingo — ' + C.CATEGORIAS[t.value]}.`);
  };
  $('#inact', root).onchange = (ev) => { showInactive = ev.target.checked; render(root); };
  if (!root.__w) { root.__w = 1; root.addEventListener('click', (ev) => { const b = ev.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'new') openForm(null); if (b.dataset.act === 'edit') openForm(D.emp(b.dataset.id)); }); }
}

function openForm(e) {
  const n = e || { nome: '', loja: 'bingen', funcao: '', categoria: 'atendimento', ativo: true, cpf: '', telefone: '', admissao: '', entrada: '', nascimento: '', salarioBase: '', demissao: '' };
  openModal({
    title: e ? `Editar — ${e.nome}` : 'Novo funcionário', wide: true,
    body: `<div class="grid3">
      <label class="span2">Nome completo<input class="in" id="f_nome" value="${esc(n.nome)}"></label>
      <label>Loja do registro (folha/imposto)<select class="in" id="f_loja">${C.STORES.map((s) => `<option value="${s.id}" ${n.loja === s.id ? 'selected' : ''}>${s.nome}</option>`).join('')}</select></label>
      <label>Trabalha em (escala)<select class="in" id="f_lt">${C.WORK_PLACES.map((w) => `<option value="${w.id}" ${C.workStore(n) === w.id ? 'selected' : ''}>${w.nome}</option>`).join('')}</select></label>
      <label>Função<input class="in" id="f_funcao" value="${esc(n.funcao || '')}"></label>
      <label>Escala de domingo<select class="in" id="f_cat">${Object.entries(C.CATEGORIAS).map(([k, v]) => `<option value="${k}" ${n.categoria === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Salário base (R$)<input class="in" id="f_sal" inputmode="decimal" value="${C.brl(n.salarioBase, false)}"></label>
      <label>Entrada<input class="in" type="date" id="f_ent" value="${n.entrada || ''}"></label>
      <label>Admissão (registro)<input class="in" type="date" id="f_adm" value="${n.admissao || ''}"></label>
      <label>Nascimento<input class="in" type="date" id="f_nasc" value="${n.nascimento || ''}"></label>
      <label>CPF<input class="in" id="f_cpf" inputmode="numeric" value="${esc(C.cpfFmt(n.cpf))}"><small id="cpfmsg"></small></label>
      <label>Telefone (WhatsApp)<input class="in" id="f_tel" inputmode="tel" value="${esc(n.telefone || '')}"><small id="telmsg"></small></label>
      <label>Situação<select class="in" id="f_ativo"><option value="1" ${n.ativo !== false ? 'selected' : ''}>Ativo</option><option value="0" ${n.ativo === false ? 'selected' : ''}>Desligado</option></select></label>
      <label>Data de desligamento<input class="in" type="date" id="f_dem" value="${n.demissao || ''}"></label></div>
      <p class="muted">Funcionário novo entra sozinho na folha do mês aberto, na loja do registro. Desligados deixam de aparecer nos meses novos; os meses antigos continuam intactos.</p>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', kind: 'primary', onClick: async (m) => {
      const nome = m.$('#f_nome').value.trim().toUpperCase();
      if (!nome) { toast('Informe o nome.', 'err'); return false; }
      const cpf = C.cpfDigits(m.$('#f_cpf').value);
      if (cpf && cpf.length !== 11) { toast('CPF deve ter 11 dígitos.', 'err'); return false; }
      const tel = m.$('#f_tel').value.trim();
      if (tel && !C.normalizePhone(tel, S.config.dddPadrao).ok) { toast('Telefone inválido. Use DDD + número.', 'err'); return false; }
      await D.saveEmployee({ ...(e || {}), id: e?.id, nome, loja: m.$('#f_loja').value, lojaTrabalho: m.$('#f_lt').value, funcao: m.$('#f_funcao').value.trim(), categoria: m.$('#f_cat').value, salarioBase: C.num(m.$('#f_sal').value), entrada: m.$('#f_ent').value || null, admissao: m.$('#f_adm').value || null, nascimento: m.$('#f_nasc').value || null, cpf, telefone: tel, ativo: m.$('#f_ativo').value === '1', demissao: m.$('#f_dem').value || null });
      render(root); toast('Funcionário salvo.');
    } }],
    onMount: (m) => {
      const chk = () => {
        const c = C.cpfDigits(m.$('#f_cpf').value); m.$('#cpfmsg').textContent = !c ? '' : c.length !== 11 ? 'CPF incompleto' : C.cpfValid(c) ? '✔ válido' : '⚠ dígitos verificadores não conferem — confira o número';
        const p = C.normalizePhone(m.$('#f_tel').value, S.config.dddPadrao); m.$('#telmsg').textContent = !m.$('#f_tel').value ? '' : p.ok ? `✔ WhatsApp: +${p.wa}` : '⚠ telefone inválido';
      };
      m.el.addEventListener('input', chk); chk();
    },
  });
}
