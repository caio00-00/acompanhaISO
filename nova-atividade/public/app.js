// Plano de Ação · Auditoria Interna — front (HTML + JS puro, sem build)
import { rpc, supabaseConfigurado } from './supabase.js';

// ============================================================================
// utilidades
// ============================================================================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const juntarNomes = (l) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);

const guardar = {
  ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
  gravar(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch { /* sem storage */ } },
};

const ICONE_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICONE_ALERTA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01" stroke-linecap="round"/></svg>';

// ============================================================================
// regras (mesma lógica de lib/regras.js no servidor)
// ============================================================================
const FUSO = 'America/Sao_Paulo';
const STATUS = { a_fazer: 'A fazer', fazendo: 'Fazendo', concluido: 'Concluído' };
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const DIAS_CURTO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function agoraSP(base = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(base).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), diaSemana: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday] };
}
const dataSP = (ts) => agoraSP(new Date(ts)).data;
function fmtData(iso) { if (!iso) return ''; const [a, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${a}`; }
function fmtCurta(iso) { if (!iso) return ''; const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}`; }
function fmtDataHora(ts) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)).replace(',', '');
}
function somarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function proximaRecorrencia(dia, hoje) {
  let [a, m, d] = hoje.split('-').map(Number);
  const ultimo = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  let alvo = Math.min(dia, ultimo(a, m));
  if (alvo < d) { m += 1; if (m > 12) { m = 1; a += 1; } alvo = Math.min(dia, ultimo(a, m)); }
  return `${a}-${String(m).padStart(2, '0')}-${String(alvo).padStart(2, '0')}`;
}
const prazoEfetivo = (at, hoje) => at.prazo || (at.dia_recorrente ? proximaRecorrencia(at.dia_recorrente, hoje) : null);
const estaAtrasada = (at, hoje) => at.status !== 'concluido' && Boolean(at.prazo) && at.prazo < hoje;
const dataAlterada = (at) => Boolean(at.prazo_original) && at.prazo !== at.prazo_original;
const aberta = (at) => at.status !== 'concluido';

// ============================================================================
// estado e API
// ============================================================================
const estado = {
  dados: null,
  servidor: null,
  euId: Number(guardar.ler('pa_eu')) || null,
  painelPessoa: guardar.ler('pa_painel_pessoa') || 'todas',
  rascunhoEmails: null,
  ultimaAba: null,
};

// Só para os e-mails (função da Vercel em /api/lembretes); os dados vão direto ao Supabase
async function api(caminho, { metodo = 'GET', corpo } = {}) {
  let r;
  try {
    r = await fetch(`/api/${caminho}`, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }
  let json = {};
  try { json = await r.json(); } catch { /* resposta sem JSON */ }
  if (!r.ok) throw new Error(json.erro || `Erro ${r.status}`);
  return json;
}

function preparar(d) {
  d.areasPorId = new Map(d.areas.map((a) => [a.id, a]));
  d.pessoasPorId = new Map(d.pessoas.map((p) => [p.id, p]));
  d.hist = new Map();
  for (const h of d.historico) {
    if (!d.hist.has(h.atividade_id)) d.hist.set(h.atividade_id, []);
    d.hist.get(h.atividade_id).push(h);
  }
  return d;
}

async function carregar() {
  const [dados, servidor] = await Promise.all([
    rpc('carregar_dados'),
    estado.servidor || api('lembretes', { metodo: 'POST', corpo: { acao: 'status' } }).catch(() => ({ indisponivel: true })),
  ]);
  estado.servidor = servidor;
  dados.servidor = servidor;
  estado.dados = preparar(dados);
}

const eu = () => estado.dados?.pessoasPorId.get(estado.euId) || null;
const nomeDe = (id) => estado.dados.pessoasPorId.get(id)?.nome || '?';
function dePessoa(at, pessoa) {
  if (!pessoa || pessoa === 'todas') return true;
  if (pessoa === 'sem') return at.responsaveis.length === 0;
  return at.responsaveis.includes(Number(pessoa));
}
const pessoasComAtividade = () => estado.dados.pessoas.filter((p) => estado.dados.atividades.some((a) => a.responsaveis.includes(p.id)));

// ============================================================================
// toast e modais
// ============================================================================
let toastTimer;
function toast(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `on${erro ? ' erro' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, erro ? 5000 : 2800);
}

function abrirModal(html, { largo = false, fixo = false, aoFechar } = {}) {
  const fundo = document.createElement('div');
  fundo.className = 'fundo';
  fundo.innerHTML = `<div class="modal${largo ? ' largo' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); aoFechar?.(); };
  const tecla = (e) => { if (e.key === 'Escape' && !fixo) fechar(); };
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo && !fixo) fechar(); });
  fundo.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) fechar(); });
  document.addEventListener('keydown', tecla);
  $('#modais').appendChild(fundo);
  fundo.fechar = fechar;
  return fundo;
}

const cabModal = (titulo, eyebrow = '') => `<div class="modal-cab"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h2>${titulo}</h2></div><button class="fechar" data-fechar aria-label="Fechar">${ICONE_X}</button></div>`;

// Seletor de responsáveis em "chips" (usado no Editar e na Nova atividade)
function chipsResponsaveis(caixa, lista) {
  const desenhar = () => {
    const disponiveis = estado.dados.pessoas.filter((p) => !lista.includes(p.id));
    caixa.innerHTML = lista.map((pid) => `<span class="chip">${esc(nomeDe(pid))}<button type="button" data-rm="${pid}" aria-label="Remover ${esc(nomeDe(pid))}">${ICONE_X}</button></span>`).join('')
      + (disponiveis.length ? `<select aria-label="Adicionar responsável"><option value="">${lista.length ? '+ adicionar' : 'Selecione…'}</option>${disponiveis.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>` : '');
    $$('[data-rm]', caixa).forEach((b) => b.addEventListener('click', () => { lista.splice(lista.indexOf(Number(b.dataset.rm)), 1); desenhar(); }));
    $('select', caixa)?.addEventListener('change', (e) => { if (e.target.value) { lista.push(Number(e.target.value)); desenhar(); } });
  };
  desenhar();
}

// ============================================================================
// identificação
// ============================================================================
function pedirIdentidade(depois, podeFechar = true) {
  const opcoes = estado.dados.pessoas.map((p) => `<option value="${p.id}" ${p.id === estado.euId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  const m = abrirModal(`${cabModal('Quem é você?')}
    <div class="modal-corpo">
      <p class="sub" style="margin:0 0 14px">Seu nome fica registrado no histórico quando você altera uma atividade.</p>
      <div class="campo"><label for="qs-pessoa">Pessoa</label>
        <select id="qs-pessoa"><option value="">Selecione…</option>${opcoes}</select></div>
      <p class="nota">Seu nome não está na lista? Escolha qualquer um por enquanto e inclua o seu na aba E-mails → Adicionar pessoa.</p>
    </div>
    <div class="modal-rod">${podeFechar ? '<button class="link" id="qs-sair" type="button" style="margin-right:auto">Esquecer neste aparelho</button>' : ''}
      <button class="btn btn-azul" id="qs-ok" type="button">Continuar</button></div>`, { fixo: !podeFechar });
  if (!podeFechar) $('.fechar', m).remove();
  $('#qs-ok', m).addEventListener('click', () => {
    const v = Number($('#qs-pessoa', m).value);
    if (!v) { $('#qs-pessoa', m).focus(); return; }
    estado.euId = v;
    guardar.gravar('pa_eu', v);
    m.fechar();
    atualizarBotaoEu();
    depois?.();
  });
  $('#qs-sair', m)?.addEventListener('click', () => {
    guardar.gravar('pa_eu', null);
    location.reload();
  });
}

function atualizarBotaoEu() {
  const b = $('#btn-eu');
  const p = eu();
  b.hidden = !p;
  if (p) { b.innerHTML = `<span class="eu-lbl">Você: </span><b>${esc(p.nome)}</b>`; b.title = 'Trocar de pessoa'; }
}
$('#btn-eu').addEventListener('click', () => pedirIdentidade(() => render()));

// ============================================================================
// roteamento
// ============================================================================
function rotaAtual() {
  const [p, q = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { aba: ['painel', 'atividades', 'emails'].includes(p) ? p : 'painel', params: new URLSearchParams(q) };
}

function render() {
  if (!estado.dados) return;
  const { aba, params } = rotaAtual();
  $$('.abas a').forEach((a) => a.classList.toggle('ativa', a.dataset.aba === aba));
  if (estado.ultimaAba !== aba) { window.scrollTo(0, 0); estado.ultimaAba = aba; }
  ({ painel: renderPainel, atividades: renderAtividades, emails: renderEmails })[aba](params);
}
window.addEventListener('hashchange', () => {
  $$('#modais .fundo').forEach((f) => f.fechar?.());
  render();
});

// ============================================================================
// PAINEL
// ============================================================================
function renderPainel() {
  const d = estado.dados;
  const hoje = agoraSP().data;
  let pessoa = estado.painelPessoa;
  if (pessoa !== 'todas' && !d.pessoasPorId.get(Number(pessoa))) pessoa = 'todas';
  const lista = d.atividades.filter((a) => dePessoa(a, pessoa));
  const conta = (f) => lista.filter(f).length;
  const base = `#/atividades?pessoa=${pessoa}`;

  const kpis = [
    [lista.length, 'Atividades', '', base],
    [conta((a) => a.status === 'a_fazer'), 'A fazer', 'c-cinza', `${base}&status=a_fazer`],
    [conta((a) => a.status === 'fazendo'), 'Fazendo', 'c-laranja', `${base}&status=fazendo`],
    [conta((a) => a.status === 'concluido'), 'Concluídas', 'c-azul', `${base}&status=concluido`],
    [conta((a) => !a.responsaveis.length), 'Sem responsável', '', '#/atividades?pessoa=sem'],
    [conta(dataAlterada), 'Com data alterada', '', `${base}&alterada=1`],
    [conta((a) => estaAtrasada(a, hoje)), 'Atrasadas', 'c-vermelho', `${base}&atrasada=1`],
  ];

  const cards = d.areas.map((ar) => {
    const la = lista.filter((a) => a.area_id === ar.id);
    if (!la.length && pessoa !== 'todas') return '';
    const n = la.length || 1;
    const af = la.filter((a) => a.status === 'a_fazer').length;
    const fz = la.filter((a) => a.status === 'fazendo').length;
    const cc = la.filter((a) => a.status === 'concluido').length;
    const proximo = la.filter(aberta).map((a) => prazoEfetivo(a, hoje)).filter((p) => p && p >= hoje).sort()[0];
    const semResp = la.filter((a) => !a.responsaveis.length).length;
    const atr = la.filter((a) => estaAtrasada(a, hoje)).length;
    return `<a class="card area" href="#/atividades?pessoa=${pessoa}&area=${ar.id}">
      <div class="area-top"><h3>${esc(ar.nome)}</h3><small>${la.length} ativ.</small></div>
      <div class="barra" title="${cc} concluída(s), ${fz} em andamento"><i class="b-conc" style="width:${(cc / n) * 100}%"></i><i class="b-faz" style="width:${(fz / n) * 100}%"></i></div>
      <div class="trio">
        <div><b class="c-cinza">${af}</b><span>A fazer</span></div>
        <div><b class="c-laranja">${fz}</b><span>Fazendo</span></div>
        <div><b class="c-azul">${cc}</b><span>Concluído</span></div>
      </div>
      <dl class="area-rod">
        <div><dt>Próximo prazo</dt><dd>${proximo ? fmtData(proximo) : 'Sem prazo'}</dd></div>
        <div><dt>Sem responsável</dt><dd>${semResp}</dd></div>
        ${atr ? `<div class="atr"><dt>Atrasadas</dt><dd>${atr}</dd></div>` : ''}
      </dl>
    </a>`;
  }).join('');

  const grupos = {};
  for (const o of d.observacoes) (grupos[o.grupo] ||= []).push(o.texto);

  $('#app').innerHTML = `
    <section class="cab">
      <div><h1>Painel por área</h1>${d.config.aviso_painel ? `<p class="sub">${esc(d.config.aviso_painel)}</p>` : ''}</div>
      <label class="campo-mini"><span class="rotulo">Ver atividades de</span>
        <select id="painel-pessoa">
          <option value="todas">Todas as pessoas</option>
          ${pessoasComAtividade().map((p) => `<option value="${p.id}" ${String(p.id) === String(pessoa) ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
        </select></label>
    </section>
    <section class="kpis">${kpis.map(([n, r, c, h]) => `<a class="card kpi" href="${h}"><b class="${c}">${n}</b><span>${r}</span></a>`).join('')}</section>
    <section class="grade-areas">${cards || '<div class="card vazio" style="grid-column:1/-1">Nenhuma atividade para esta pessoa.</div>'}</section>
    ${Object.keys(grupos).length ? `<section class="card obs">${Object.entries(grupos).map(([g, itens]) => `<div><h3>${esc(g)}</h3><ul>${itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</section>` : ''}`;

  $('#painel-pessoa').addEventListener('change', (e) => {
    estado.painelPessoa = e.target.value;
    guardar.gravar('pa_painel_pessoa', e.target.value);
    renderPainel();
  });
}

// ============================================================================
// ATIVIDADES
// ============================================================================
function renderAtividades(params) {
  const d = estado.dados;
  const hoje = agoraSP().data;
  let pessoa = params.get('pessoa');
  if (!pessoa) pessoa = estado.euId && d.atividades.some((a) => a.responsaveis.includes(estado.euId)) ? String(estado.euId) : 'todas';
  const area = params.get('area') || 'todas';
  const status = params.get('status') || 'todos';
  const soAlterada = params.get('alterada') === '1';
  const soAtrasada = params.get('atrasada') === '1';

  const lista = d.atividades.filter((a) => dePessoa(a, pessoa)
    && (area === 'todas' || a.area_id === Number(area))
    && (status === 'todos' || a.status === status)
    && (!soAlterada || dataAlterada(a))
    && (!soAtrasada || estaAtrasada(a, hoje)));

  const pessoaNome = d.pessoasPorId.get(Number(pessoa))?.nome;
  const titulo = pessoa === 'todas' ? 'Todas as atividades' : pessoa === 'sem' ? 'Atividades sem responsável' : `Atividades de ${esc(pessoaNome || '?')}`;
  const nAreas = new Set(lista.map((a) => a.area_id)).size;
  const sub = `${plural(lista.length, 'atividade', 'atividades')} em ${plural(nAreas, 'área', 'áreas')}${pessoaNome ? ' · inclui as que divide com outra pessoa' : ''}`;

  const grupos = d.areas.map((ar) => {
    const la = lista.filter((a) => a.area_id === ar.id);
    if (!la.length) return '';
    return `<h2 class="grupo">${esc(ar.nome)} <small>${plural(la.length, 'atividade', 'atividades')}</small></h2>
      <div class="card tabela">
        <div class="linha cabec"><span>Nº</span><span>Ação</span><span>Responsável</span><span>Prazo</span><span>Status</span><span></span></div>
        ${la.map((a) => linhaAtividade(a, hoje)).join('')}
      </div>`;
  }).join('');

  $('#app').innerHTML = `
    <section class="cab"><div><h1>${titulo}</h1><p class="sub">${sub}</p></div>
      <button class="btn btn-azul" type="button" id="btn-nova">+ Nova atividade</button></section>
    <section class="card filtros">
      <label class="f-sel"><span class="rotulo">Pessoa</span>
        <select data-f="pessoa">
          <option value="todas">Todas as pessoas</option>
          <option value="sem" ${pessoa === 'sem' ? 'selected' : ''}>Sem responsável</option>
          ${d.pessoas.map((p) => `<option value="${p.id}" ${String(p.id) === pessoa ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
        </select></label>
      <label class="f-sel"><span class="rotulo">Área</span>
        <select data-f="area">
          <option value="todas">Todas as áreas</option>
          ${d.areas.map((a) => `<option value="${a.id}" ${String(a.id) === area ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}
        </select></label>
      <div><span class="rotulo">Status</span>
        <div class="seg">${[['todos', 'Todos'], ...Object.entries(STATUS)].map(([v, r]) => `<button type="button" data-status="${v}" class="${status === v ? 'on' : ''}">${r}</button>`).join('')}</div></div>
      <label class="chk"><input type="checkbox" data-f="alterada" ${soAlterada ? 'checked' : ''}> Só com data alterada</label>
      <label class="chk"><input type="checkbox" data-f="atrasada" ${soAtrasada ? 'checked' : ''}> Só atrasadas</label>
    </section>
    ${grupos || '<div class="card vazio">Nenhuma atividade com esses filtros.</div>'}`;

  const mudar = (k, v) => {
    const p = rotaAtual().params;
    p.set('pessoa', pessoa);
    if (v && v !== 'todas' && v !== 'todos') p.set(k, v); else p.delete(k);
    if (k === 'pessoa') p.set('pessoa', v);
    location.hash = `#/atividades?${p}`;
  };
  $$('select[data-f]').forEach((s) => s.addEventListener('change', () => mudar(s.dataset.f, s.value)));
  $$('input[data-f]').forEach((c) => c.addEventListener('change', () => mudar(c.dataset.f, c.checked ? '1' : '')));
  $$('[data-status]').forEach((b) => b.addEventListener('click', () => mudar('status', b.dataset.status)));
  $$('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirEditar(Number(b.dataset.editar))));
  $('#btn-nova').addEventListener('click', () => abrirNovaAtividade({ area, pessoa }));
}

// ---------- nova atividade ----------
function abrirNovaAtividade({ area, pessoa }) {
  const d = estado.dados;
  if (!eu()) { pedirIdentidade(() => abrirNovaAtividade({ area, pessoa })); return; }
  const responsaveis = /^\d+$/.test(pessoa || '') && d.pessoasPorId.get(Number(pessoa)) ? [Number(pessoa)] : [];
  const m = abrirModal(`${cabModal('Nova atividade')}
    <div class="modal-corpo">
      <div class="campo"><label for="na-area">Área</label>
        <select id="na-area"><option value="">Selecione…</option>
          ${d.areas.map((a) => `<option value="${a.id}" ${String(a.id) === String(area) ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}
          <option value="nova">+ Nova área…</option></select>
        <input type="text" id="na-area-nova" placeholder="Nome da nova área" style="margin-top:8px" hidden></div>
      <div class="campo"><label for="na-acao">Ação</label>
        <textarea id="na-acao" rows="3" placeholder="O que precisa ser feito"></textarea></div>
      <div class="dupla dupla-m">
        <div class="campo"><span class="lbl">Responsável</span><div class="chips" id="na-resp"></div></div>
        <div class="campo"><label for="na-prazo">Prazo</label><input type="date" id="na-prazo"></div>
      </div>
      <div class="campo" style="margin:0"><label for="na-obs">Observação <span style="font-weight:400;color:var(--muted)">(opcional)</span></label>
        <textarea id="na-obs" rows="2" placeholder="Combinados, evidências, onde está o documento…"></textarea></div>
    </div>
    <div class="modal-rod"><p class="erro-form" id="na-erro"></p>
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-azul" type="button" id="na-ok">Adicionar atividade</button></div>`);

  chipsResponsaveis($('#na-resp', m), responsaveis);
  const selArea = $('#na-area', m);
  const novaArea = $('#na-area-nova', m);
  selArea.addEventListener('change', () => { novaArea.hidden = selArea.value !== 'nova'; if (!novaArea.hidden) novaArea.focus(); });
  (selArea.value ? $('#na-acao', m) : selArea).focus();

  $('#na-ok', m).addEventListener('click', async () => {
    const erro = $('#na-erro', m);
    erro.textContent = '';
    const acao = $('#na-acao', m).value.trim();
    if (!selArea.value || (selArea.value === 'nova' && !novaArea.value.trim())) { erro.textContent = 'Escolha a área.'; selArea.focus(); return; }
    if (acao.length < 5) { erro.textContent = 'Descreva a ação.'; $('#na-acao', m).focus(); return; }
    const btn = $('#na-ok', m);
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      const r = await rpc('adicionar_atividade', {
        p_autor: eu().nome,
        p_acao: acao,
        p_area_id: selArea.value === 'nova' ? null : Number(selArea.value),
        p_area_nova: selArea.value === 'nova' ? novaArea.value.trim() : null,
        p_prazo: $('#na-prazo', m).value || null,
        p_responsaveis: responsaveis,
        p_observacao: $('#na-obs', m).value.trim() || null,
      });
      await carregar();
      m.fechar();
      const destino = `#/atividades?pessoa=todas&area=${r.area_id}`;
      if (location.hash === destino) render(); else location.hash = destino;
      toast(`Atividade adicionada: ${d.areasPorId.get(r.area_id)?.nome || estado.dados.areasPorId.get(r.area_id)?.nome} nº ${r.numero}`);
    } catch (e) {
      erro.textContent = e.message;
      btn.disabled = false; btn.textContent = 'Adicionar atividade';
    }
  });
}

function celulaPrazo(at, hoje) {
  const atr = estaAtrasada(at, hoje);
  let html;
  if (at.prazo) html = `<b class="${atr ? 'venc' : ''}">${fmtData(at.prazo)}</b>`;
  else if (at.dia_recorrente) html = `<b>Todo dia ${at.dia_recorrente}</b><small>Próximo: ${fmtData(proximaRecorrencia(at.dia_recorrente, hoje))}</small>`;
  else html = '<b class="sem">Sem prazo</b>';
  const tags = [atr ? '<span class="tag atrasada">Atrasada</span>' : '', dataAlterada(at) ? '<span class="tag alterada">Data alterada</span>' : ''].join('');
  if (tags) html += `<span class="tags">${tags}</span>`;
  if (dataAlterada(at)) html += `<small>Antes: ${fmtData(at.prazo_original)}</small>`;
  return html;
}

function linhaAtividade(at, hoje) {
  const nomes = at.responsaveis.map(nomeDe);
  return `<div class="linha${at.status === 'concluido' ? ' concluida' : ''}">
    <span class="num">${at.numero ?? '—'}</span>
    <div class="acao">${esc(at.acao)}${at.observacao ? `<span class="obs-at">${esc(at.observacao)}</span>` : ''}</div>
    <div class="resp"><span class="m-lbl">Responsável: </span>${nomes.length ? esc(juntarNomes(nomes)) : '<span class="sem">Sem responsável</span>'}</div>
    <div class="prazo"><span class="m-lbl">Prazo: </span>${celulaPrazo(at, hoje)}</div>
    <div class="st"><span class="selo ${at.status}">${STATUS[at.status]}</span></div>
    <div class="acoes"><button class="btn" type="button" data-editar="${at.id}">Editar</button></div>
  </div>`;
}

// ---------- modal de edição ----------
function textoHistorico(h) {
  switch (h.tipo) {
    case 'criada': return `<b>Atividade incluída</b>${h.valor_novo ? ` · responsável: ${esc(h.valor_novo)}` : ''}`;
    case 'prazo_definido': return `<b>${h.valor_novo ? fmtData(h.valor_novo) : 'Sem prazo'}</b> · prazo definido`;
    case 'prazo_alterado': return `<b>${h.valor_anterior ? fmtCurta(h.valor_anterior) : 'sem prazo'} para ${h.valor_novo ? fmtData(h.valor_novo) : 'sem prazo'}</b> · ${esc(h.motivo || '')}`;
    case 'status': return `Status: ${STATUS[h.valor_anterior] || '—'} → <b>${STATUS[h.valor_novo] || '—'}</b>`;
    case 'responsavel': return `Responsável: ${esc(h.valor_anterior || 'ninguém')} → <b>${esc(h.valor_novo || 'ninguém')}</b>`;
    case 'observacao': return h.valor_novo ? `Observação: “${esc(h.valor_novo)}”` : 'Observação removida';
    default: return esc(h.tipo);
  }
}

function abrirEditar(id) {
  const d = estado.dados;
  const at = d.atividades.find((a) => a.id === id);
  if (!at) return;
  if (!eu()) { pedirIdentidade(() => abrirEditar(id)); return; }
  const area = d.areasPorId.get(at.area_id);
  const ed = { status: at.status, prazo: at.prazo || '', motivo: '', responsaveis: [...at.responsaveis], observacao: at.observacao || '' };
  const recorrente = Boolean(at.dia_recorrente && !at.prazo);

  const m = abrirModal(`${cabModal(esc(at.acao), `${esc(area.nome)} · Nº ${at.numero ?? '—'}`)}
    <div class="modal-corpo">
      <div class="dupla dupla-m">
        <div class="campo"><span class="lbl">Responsável</span><div class="chips" id="ed-resp"></div></div>
        <div class="campo"><label for="ed-prazo">Prazo</label>
          ${recorrente ? `<div class="campo-ro">Todo dia ${at.dia_recorrente} de cada mês</div>` : `<input type="date" id="ed-prazo" value="${ed.prazo}">`}</div>
      </div>
      <div id="ed-aviso"></div>
      <div class="campo"><span class="lbl">Status</span>
        <div class="seg3">${Object.entries(STATUS).map(([v, r]) => `<button type="button" class="${v}" data-st="${v}">${r}</button>`).join('')}</div></div>
      <div class="campo"><label for="ed-obs">Observação</label>
        <textarea id="ed-obs" rows="2" placeholder="Combinados, evidências, onde está o documento…">${esc(ed.observacao)}</textarea></div>
      <div class="campo" style="margin:0"><span class="lbl">Histórico</span><div class="hist" id="ed-hist"></div></div>
    </div>
    <div class="modal-rod"><p class="erro-form" id="ed-erro"></p>
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-azul" type="button" id="ed-salvar">Salvar alterações</button></div>`);

  const prazoMudou = () => !recorrente && ed.prazo !== (at.prazo || '');
  const precisaMotivo = () => prazoMudou() && !(!at.prazo && !at.prazo_original);

  const desenharResp = () => chipsResponsaveis($('#ed-resp', m), ed.responsaveis);

  function desenharAviso() {
    const caixa = $('#ed-aviso', m);
    if (!prazoMudou()) { caixa.innerHTML = ''; return; }
    if (!precisaMotivo()) {
      caixa.innerHTML = `<div class="aviso-prazo aviso-info"><p style="margin:0">${ICONE_ALERTA}<span>Definindo o primeiro prazo desta atividade: <b>${fmtData(ed.prazo)}</b>. Não precisa de motivo.</span></p></div>`;
      return;
    }
    const de = at.prazo ? fmtData(at.prazo) : 'sem prazo';
    let txt;
    if (!ed.prazo) txt = `Você está removendo o prazo definido de <b>${de}</b>.`;
    else if (ed.prazo === at.prazo_original) txt = `Você está voltando ao prazo original, <b>${fmtData(ed.prazo)}</b> (antes estava <b>${de}</b>).`;
    else txt = `Você está mudando o prazo definido de <b>${de}</b> para <b>${fmtData(ed.prazo)}</b>. A atividade vai aparecer com a marca "Data alterada".`;
    caixa.innerHTML = `<div class="aviso-prazo"><p>${ICONE_ALERTA}<span>${txt}</span></p>
      <label for="ed-motivo">Motivo da alteração (obrigatório)</label>
      <textarea id="ed-motivo" rows="2" placeholder="Ex.: aguardando retorno da ISG sobre o modelo">${esc(ed.motivo)}</textarea></div>`;
    $('#ed-motivo', m).addEventListener('input', (e) => { ed.motivo = e.target.value; desenharHist(); });
  }

  function desenharHist() {
    const itens = (d.hist.get(at.id) || []).map((h) => `<div><span>${textoHistorico(h)}</span><span class="quem">${esc(h.autor || '—')} · ${fmtData(dataSP(h.criado_em))}</span></div>`);
    if (precisaMotivo()) {
      itens.push(`<div class="pendente"><span>${textoHistorico({ tipo: 'prazo_alterado', valor_anterior: at.prazo, valor_novo: ed.prazo || null, motivo: ed.motivo.trim() || '…' })}</span><span class="quem">${esc(eu().nome)} · ao salvar</span></div>`);
    }
    $('#ed-hist', m).innerHTML = itens.join('') || '<div class="vazio-h">Nenhuma alteração ainda.</div>';
  }

  function desenharStatus() {
    $$('[data-st]', m).forEach((b) => b.classList.toggle('on', b.dataset.st === ed.status));
  }

  desenharResp(); desenharAviso(); desenharHist(); desenharStatus();
  $('#ed-prazo', m)?.addEventListener('change', (e) => { ed.prazo = e.target.value; desenharAviso(); desenharHist(); });
  $$('[data-st]', m).forEach((b) => b.addEventListener('click', () => { ed.status = b.dataset.st; desenharStatus(); }));
  $('#ed-obs', m).addEventListener('input', (e) => { ed.observacao = e.target.value; });

  $('#ed-salvar', m).addEventListener('click', async () => {
    const erro = $('#ed-erro', m);
    erro.textContent = '';
    const args = { p_id: at.id, p_autor: eu().nome };
    if (ed.status !== at.status) args.p_status = ed.status;
    if (prazoMudou()) {
      args.p_alterar_prazo = true;
      args.p_prazo = ed.prazo || null;
      if (precisaMotivo()) {
        if (ed.motivo.trim().length < 3) { erro.textContent = 'Informe o motivo da alteração do prazo.'; $('#ed-motivo', m).focus(); return; }
        args.p_motivo = ed.motivo.trim();
      }
    }
    const mesmos = ed.responsaveis.length === at.responsaveis.length && ed.responsaveis.every((x) => at.responsaveis.includes(x));
    if (!mesmos) args.p_responsaveis = ed.responsaveis;
    if ((ed.observacao.trim() || null) !== (at.observacao || null)) {
      args.p_alterar_observacao = true;
      args.p_observacao = ed.observacao.trim();
    }
    if (Object.keys(args).length === 2) { m.fechar(); return; }

    const btn = $('#ed-salvar', m);
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await rpc('atualizar_atividade', args);
      await carregar();
      m.fechar();
      render();
      toast('Alterações salvas');
    } catch (e) {
      erro.textContent = e.message;
      btn.disabled = false; btn.textContent = 'Salvar alterações';
    }
  });
}

// ============================================================================
// E-MAILS
// ============================================================================
const CAMPOS_CONFIG = ['remetente_email', 'remetente_nome', 'envio_ativo', 'dia_semana', 'horario', 'destacar_atrasadas', 'avisar_prazo_alterado', 'incluir_sem_prazo', 'resumo_email'];

function rascunho() {
  if (!estado.rascunhoEmails) {
    const c = estado.dados.config;
    estado.rascunhoEmails = { config: Object.fromEntries(CAMPOS_CONFIG.map((k) => [k, c[k]])), pessoas: {}, sujo: false };
  }
  return estado.rascunhoEmails;
}
const pessoaRasc = (p) => ({ email: p.email || '', recebe: p.recebe, ...rascunho().pessoas[p.id] });

function proximoEnvio(cfg) {
  if (!cfg.envio_ativo) return null;
  const ag = agoraSP();
  const ultimo = estado.dados.config.ultimo_envio_em;
  const enviouHoje = ultimo && dataSP(ultimo) === ag.data;
  let dias = (Number(cfg.dia_semana) - ag.diaSemana + 7) % 7;
  if (dias === 0 && enviouHoje) dias = 7;
  const alvo = somarDias(ag.data, dias);
  const atrasado = dias === 0 && ag.hora >= Number(cfg.horario);
  return `${DIAS_CURTO[cfg.dia_semana]}, ${fmtData(alvo)}, ${cfg.horario}h${atrasado ? ' (sai na próxima execução)' : ''}`;
}

function renderEmails() {
  const d = estado.dados;
  const r = rascunho();
  const c = r.config;
  const srv = d.servidor;
  const pend = (p) => d.atividades.filter((a) => aberta(a) && a.responsaveis.includes(p.id)).length;
  const prox = proximoEnvio(c);

  $('#app').innerHTML = `
    <section class="cab"><div><h1>E-mails de lembrete</h1>
      <p class="sub">Toda semana, cada pessoa recebe a lista das atividades dela que ainda não foram concluídas.</p></div></section>
    <div class="grade-emails">
      <div class="col">
        <section class="card bloco">
          <div class="bloco-cab"><h2>Remetente</h2></div>
          <div class="campo"><label for="em-rem">E-mail que envia</label>
            <input type="email" id="em-rem" data-c="remetente_email" value="${esc(c.remetente_email || '')}" placeholder="${esc(srv.smtp_usuario || 'ex.: planodeacao@oroseducacao.com.br')}"></div>
          <div class="campo"><label for="em-nome">Nome que aparece para quem recebe</label>
            <input type="text" id="em-nome" data-c="remetente_nome" value="${esc(c.remetente_nome || '')}"></div>
          ${srv.smtp_configurado
            ? `<div class="conexao ok"><span><span class="ponto"></span>Conta conectada · ${esc(srv.smtp_usuario)}</span><button class="btn btn-contorno" type="button" id="em-verificar">Testar conexão</button></div>`
            : `<div class="conexao"><span><span class="ponto"></span>Conta ainda não conectada</span><button class="btn btn-contorno" type="button" id="em-conectar">Conectar conta</button></div>`}
        </section>

        <section class="card bloco">
          <div class="bloco-cab"><h2>Envio automático</h2>
            <label class="chk" style="min-height:0;color:var(--azul);font-weight:600"><input type="checkbox" data-c="envio_ativo" ${c.envio_ativo ? 'checked' : ''}> Ativo</label></div>
          <div class="dupla">
            <div class="campo"><label for="em-dia">Dia</label>
              <select id="em-dia" data-c="dia_semana">${DIAS.map((n, i) => `<option value="${i}" ${Number(c.dia_semana) === i ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
            <div class="campo"><label for="em-hora">Horário</label>
              <select id="em-hora" data-c="horario">${Array.from({ length: 16 }, (_, i) => i + 6).map((h) => `<option value="${h}" ${Number(c.horario) === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></div>
          </div>
          <div class="opcoes">
            <label class="chk"><input type="checkbox" data-c="destacar_atrasadas" ${c.destacar_atrasadas ? 'checked' : ''}> Destacar atividades atrasadas</label>
            <label class="chk"><input type="checkbox" data-c="avisar_prazo_alterado" ${c.avisar_prazo_alterado ? 'checked' : ''}> Avisar quando o prazo foi alterado</label>
            <label class="chk"><input type="checkbox" data-c="incluir_sem_prazo" ${c.incluir_sem_prazo ? 'checked' : ''}> Incluir atividades sem prazo</label>
          </div>
          <div class="campo"><label for="em-resumo">Resumo geral, com as atividades sem responsável, para</label>
            <input type="text" id="em-resumo" data-c="resumo_email" value="${esc(c.resumo_email || '')}" placeholder="e-mail de quem acompanha o plano"></div>
          <div class="prox"><span>${prox ? `Próximo envio: <b>${prox}</b>` : 'Envio automático desativado'}</span><button class="link" type="button" id="em-previa">Ver prévia</button></div>
          ${srv.agendamento_configurado ? '' : '<p class="nota alerta">Falta configurar o agendamento (CRON_SECRET na Vercel + script 04 no Supabase). Veja o LEIA-ME.</p>'}
          <p class="nota">${d.config.ultimo_envio_em ? `Último envio automático: ${fmtDataHora(d.config.ultimo_envio_em)}` : 'Nenhum envio automático ainda.'}</p>
        </section>

        ${d.envios.length ? `<section class="card bloco"><div class="bloco-cab" style="margin-bottom:8px"><h2>Últimos envios</h2></div>
          <ul class="envios">${d.envios.map((e) => `<li title="${esc(e.erro || e.assunto || '')}"><span class="${e.ok ? 'ok' : 'erro'}">${e.ok ? '✓' : '✕'}</span><span class="para">${esc(e.destinatario || '—')}${e.tipo !== 'lembrete' ? ` · ${e.tipo}` : ''}${e.ok ? '' : ` · ${esc(e.erro || 'erro')}`}</span><span class="quando">${fmtDataHora(e.criado_em)}</span></li>`).join('')}</ul></section>` : ''}
      </div>

      <section class="card dest">
        <div class="bloco-cab"><div><h2>Destinatários</h2><p class="nota" style="margin-top:2px">Os nomes vêm dos responsáveis cadastrados nas atividades</p></div>
          <button class="btn btn-azul" type="button" id="em-add">Adicionar pessoa</button></div>
        <div class="dest-linha cabec" style="margin-top:14px"><span>Pessoa</span><span>E-mail</span><span>Pendentes</span><span>Recebe</span></div>
        ${d.pessoas.map((p) => { const pr = pessoaRasc(p); return `<div class="dest-linha">
          <span class="nome">${esc(p.nome)}</span>
          <span class="email"><input type="email" data-p="${p.id}" data-k="email" value="${esc(pr.email)}" placeholder="nome@oroseducacao.com.br" aria-label="E-mail de ${esc(p.nome)}"></span>
          <span class="pend">${pend(p)}</span>
          <span class="rec"><input type="checkbox" data-p="${p.id}" data-k="recebe" ${pr.recebe ? 'checked' : ''} aria-label="${esc(p.nome)} recebe"></span>
        </div>`; }).join('')}
        <div class="dest-rod"><span class="sujo" id="em-sujo" ${r.sujo ? '' : 'hidden'}>Alterações não salvas</span>
          <button class="btn" type="button" id="em-teste">Enviar teste para mim</button>
          <button class="btn btn-azul" type="button" id="em-salvar">Salvar</button></div>
      </section>
    </div>`;

  const marcarSujo = () => { r.sujo = true; $('#em-sujo').hidden = false; };
  $$('[data-c]').forEach((el) => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
    const k = el.dataset.c;
    r.config[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? Number(el.value) : el.value;
    marcarSujo();
    if (['envio_ativo', 'dia_semana', 'horario'].includes(k)) {
      const p = proximoEnvio(r.config);
      $('.prox span').innerHTML = p ? `Próximo envio: <b>${p}</b>` : 'Envio automático desativado';
    }
  }));
  $$('[data-p]').forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
    const id = Number(el.dataset.p);
    r.pessoas[id] = { ...pessoaRasc(d.pessoasPorId.get(id)), [el.dataset.k]: el.type === 'checkbox' ? el.checked : el.value };
    marcarSujo();
  }));

  $('#em-salvar').addEventListener('click', () => salvarEmails(true));
  $('#em-add').addEventListener('click', abrirAddPessoa);
  $('#em-previa').addEventListener('click', abrirPrevia);
  $('#em-teste').addEventListener('click', abrirTeste);
  $('#em-conectar')?.addEventListener('click', abrirComoConectar);
  $('#em-verificar')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Testando…';
    try { toast((await api('lembretes', { metodo: 'POST', corpo: { acao: 'verificar' } })).mensagem); } catch (err) { toast(err.message, true); }
    b.disabled = false; b.textContent = 'Testar conexão';
  });
}

async function salvarEmails(avisar) {
  const r = rascunho();
  const btn = $('#em-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    await rpc('salvar_config', { p_config: r.config });
    await rpc('salvar_pessoas', { p_pessoas: estado.dados.pessoas.map((p) => ({ id: p.id, ...pessoaRasc(p) })) });
    estado.rascunhoEmails = null;
    await carregar();
    if (rotaAtual().aba === 'emails') renderEmails();
    if (avisar) toast('Configurações salvas');
    return true;
  } catch (e) {
    toast(e.message, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    return false;
  }
}

async function salvarSeSujo() {
  if (estado.rascunhoEmails?.sujo) return salvarEmails(false);
  return true;
}

function abrirAddPessoa() {
  const m = abrirModal(`${cabModal('Adicionar pessoa')}
    <div class="modal-corpo">
      <div class="campo"><label for="ap-nome">Nome</label><input type="text" id="ap-nome" placeholder="Como aparece nas atividades"></div>
      <div class="campo" style="margin:0"><label for="ap-email">E-mail</label><input type="email" id="ap-email" placeholder="nome@oroseducacao.com.br"></div>
    </div>
    <div class="modal-rod"><p class="erro-form" id="ap-erro"></p><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn btn-azul" type="button" id="ap-ok">Adicionar</button></div>`);
  $('#ap-nome', m).focus();
  $('#ap-ok', m).addEventListener('click', async () => {
    try {
      await rpc('adicionar_pessoa', { p_nome: $('#ap-nome', m).value, p_email: $('#ap-email', m).value });
      await carregar();
      m.fechar();
      render();
      toast('Pessoa adicionada');
    } catch (e) { $('#ap-erro', m).textContent = e.message; }
  });
}

function opcoesSimulacao(selecionado) {
  const d = estado.dados;
  const comAbertas = d.pessoas.filter((p) => d.atividades.some((a) => aberta(a) && a.responsaveis.includes(p.id)));
  return comAbertas.map((p) => `<option value="${p.id}" ${p.id === selecionado ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')
    + `<option value="resumo" ${selecionado === 'resumo' ? 'selected' : ''}>Resumo geral</option>`;
}
function simulacaoPadrao() {
  const d = estado.dados;
  const meu = eu() && d.atividades.some((a) => aberta(a) && a.responsaveis.includes(estado.euId));
  return meu ? estado.euId : (d.pessoas.find((p) => d.atividades.some((a) => aberta(a) && a.responsaveis.includes(p.id)))?.id ?? 'resumo');
}

async function abrirPrevia() {
  if (!(await salvarSeSujo())) return;
  const m = abrirModal(`${cabModal('Prévia do e-mail')}
    <div class="modal-corpo">
      <div class="campo"><label for="pv-p">Ver o e-mail de</label><select id="pv-p">${opcoesSimulacao(simulacaoPadrao())}</select></div>
      <div class="meta-previa" id="pv-meta"></div>
      <iframe class="previa" id="pv-f" title="Prévia do e-mail" sandbox></iframe>
    </div>`, { largo: true });
  const carregarPrevia = async () => {
    const pid = $('#pv-p', m).value;
    $('#pv-meta', m).textContent = 'Carregando…';
    try {
      const r = await api('lembretes', { metodo: 'POST', corpo: { acao: 'previa', pessoa_id: pid === 'resumo' ? 'resumo' : Number(pid) } });
      const c = estado.dados.config;
      const prox = proximoEnvio(c);
      $('#pv-meta', m).innerHTML = `<b>De:</b> ${esc(c.remetente_nome)} &lt;${esc(c.remetente_email || estado.dados.servidor.smtp_usuario || 'e-mail cadastrado na aba E-mails')}&gt;<br>
        <b>Para:</b> ${esc(r.para || '(sem e-mail cadastrado)')}<br><b>Assunto:</b> ${esc(r.assunto)}${prox ? `<br><b>Envio:</b> ${prox}` : ''}`;
      $('#pv-f', m).srcdoc = r.html;
    } catch (e) { $('#pv-meta', m).textContent = e.message; $('#pv-f', m).srcdoc = ''; }
  };
  $('#pv-p', m).addEventListener('change', carregarPrevia);
  carregarPrevia();
}

async function abrirTeste() {
  if (!estado.dados.servidor.smtp_configurado) { abrirComoConectar(); return; }
  if (!(await salvarSeSujo())) return;
  const meuEmail = eu()?.email || '';
  const m = abrirModal(`${cabModal('Enviar teste')}
    <div class="modal-corpo">
      <div class="campo"><label for="te-email">Enviar para</label><input type="email" id="te-email" value="${esc(meuEmail)}" placeholder="seu e-mail"></div>
      <div class="campo" style="margin:0"><label for="te-p">Simular o e-mail de</label><select id="te-p">${opcoesSimulacao(simulacaoPadrao())}</select></div>
    </div>
    <div class="modal-rod"><p class="erro-form" id="te-erro"></p><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn btn-azul" type="button" id="te-ok">Enviar teste</button></div>`);
  $('#te-ok', m).addEventListener('click', async () => {
    const b = $('#te-ok', m); b.disabled = true; b.textContent = 'Enviando…';
    try {
      const pid = $('#te-p', m).value;
      const r = await api('lembretes', { metodo: 'POST', corpo: { acao: 'teste', email: $('#te-email', m).value, pessoa_id: pid === 'resumo' ? 'resumo' : Number(pid) } });
      await carregar();
      m.fechar();
      render();
      toast(r.mensagem);
    } catch (e) { $('#te-erro', m).textContent = e.message; b.disabled = false; b.textContent = 'Enviar teste'; }
  });
}

function abrirComoConectar() {
  if (estado.servidor?.indisponivel) {
    toast('A parte de e-mails só funciona no site publicado na Vercel.', true);
    return;
  }
  abrirModal(`${cabModal('Conectar a conta que envia')}
    <div class="modal-corpo" style="font-size:13px;line-height:1.55">
      <p style="margin-top:0">Por segurança, a senha da conta não fica nesta página: ela vai nas variáveis de ambiente da Vercel (<b>Settings → Environment Variables</b>). Depois de salvar, faça um novo deploy.</p>
      <div class="hist" style="margin:12px 0"><div><span><b>SMTP_HOST</b></span><span class="quem">smtp.gmail.com · smtp.office365.com</span></div>
        <div><span><b>SMTP_PORT</b></span><span class="quem">465 (Gmail) · 587 (Microsoft 365)</span></div>
        <div><span><b>SMTP_USER</b></span><span class="quem">o e-mail que envia</span></div>
        <div><span><b>SMTP_PASS</b></span><span class="quem">senha de app da conta</span></div></div>
      <p style="margin:0">No Google Workspace/Gmail, crie uma <b>senha de app</b> (precisa da verificação em duas etapas ligada). No Microsoft 365, o administrador precisa liberar o "SMTP autenticado" para a caixa.</p>
    </div>
    <div class="modal-rod"><button class="btn btn-azul" type="button" data-fechar>Entendi</button></div>`);
}

// ============================================================================
// início
// ============================================================================
async function iniciar() {
  if (!supabaseConfigurado()) {
    $('#app').innerHTML = `<div class="card vazio">Falta ligar a página ao Supabase.<br><small>Preencha a URL e a publishable key em <b>public/config.js</b> e envie para o GitHub.</small></div>`;
    return;
  }
  try {
    await carregar();
  } catch (e) {
    $('#app').innerHTML = `<div class="card vazio">Não foi possível carregar os dados.<br><small>${esc(e.message)}</small><br><br><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
    return;
  }
  if (!eu()) pedirIdentidade(() => render(), false);
  atualizarBotaoEu();
  render();
}

// Recarrega os dados ao voltar para a aba do navegador (para ver o que os outros marcaram)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !estado.dados || $('.fundo') || estado.rascunhoEmails?.sujo) return;
  try { await carregar(); render(); } catch { /* ignora */ }
});

iniciar();
