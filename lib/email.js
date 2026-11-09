// Montagem e envio dos e-mails de lembrete (SMTP configurado nas variáveis da Vercel).
import nodemailer from 'nodemailer';
import { db } from './db.js';
import {
  STATUS, agoraSP, fmtData, fmtDataCurta, prazoEfetivo, estaAtrasada, textoPrazo,
} from './regras.js';

export function smtpConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function criarTransporte() {
  if (!smtpConfigurado()) {
    const e = new Error('Conta de e-mail não conectada: defina SMTP_HOST, SMTP_USER e SMTP_PASS na Vercel.');
    e.status = 400;
    throw e;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export function remetente(cfg) {
  return { name: cfg.remetente_nome || 'Plano de Ação OROS', address: cfg.remetente_email || process.env.SMTP_USER };
}

// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const CORES = {
  fazendo: ['#fdecdf', '#c2410c'],
  a_fazer: ['#eceef2', '#4b5563'],
  concluido: ['#e6edfd', '#1d4ed8'],
  atrasada: ['#fde8e8', '#b91c1c'],
};
const badge = (rotulo, tipo) => {
  const [bg, cor] = CORES[tipo];
  return `<span style="display:inline-block;background:${bg};color:${cor};font-size:11px;font-weight:bold;padding:3px 8px;border-radius:5px;white-space:nowrap">${esc(rotulo)}</span>`;
};
const FONTE = "font-family:Arial,Helvetica,sans-serif";

function moldura(titulo, saudacao, miolo, rodape) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#eef0f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:10px;overflow:hidden;${FONTE}">
  <tr><td style="background:#1f4ed8;color:#ffffff;padding:20px 24px">
    <div style="font-size:11px;letter-spacing:1px;opacity:.85">${esc(titulo)}</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">${esc(saudacao)}</div>
  </td></tr>
  <tr><td style="padding:20px 24px 8px;color:#111827;font-size:14px;line-height:1.5">${miolo}</td></tr>
  <tr><td style="padding:12px 24px 20px;color:#9ca3af;font-size:11px;line-height:1.4">${rodape}</td></tr>
</table></td></tr></table></body></html>`;
}

function aviso(html, tipo = 'laranja') {
  const [bg, borda, cor] = tipo === 'vermelho' ? ['#fde8e8', '#f5b5b5', '#991b1b'] : ['#fdf0e6', '#f3c9a5', '#9a3412'];
  return `<div style="background:${bg};border:1px solid ${borda};color:${cor};border-radius:8px;padding:10px 14px;margin:0 0 14px;font-size:13px">${html}</div>`;
}

function botao(href, rotulo) {
  return `<div style="margin:18px 0 8px"><a href="${esc(href)}" style="display:inline-block;background:#1f4ed8;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:7px;font-weight:bold;font-size:14px">${esc(rotulo)}</a></div>`;
}

function saudacaoPorHora(hora) {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function prazosAlteradosNaSemana(dados, ids) {
  const limite = Date.now() - 7 * 24 * 3600 * 1000;
  return dados.historico.filter((h) => h.tipo === 'prazo_alterado' && ids.has(h.atividade_id) && new Date(h.criado_em).getTime() >= limite);
}

function ordenar(lista, areasPorId, hoje, destacarAtrasadas) {
  return [...lista].sort((a, b) => {
    if (destacarAtrasadas) {
      const d = Number(estaAtrasada(b, hoje)) - Number(estaAtrasada(a, hoje));
      if (d) return d;
    }
    const pa = prazoEfetivo(a, hoje) || '9999';
    const pb = prazoEfetivo(b, hoje) || '9999';
    if (pa !== pb) return pa < pb ? -1 : 1;
    return areasPorId[a.area_id].ordem - areasPorId[b.area_id].ordem || a.ordem - b.ordem;
  });
}

/** E-mail semanal de uma pessoa. Devolve null se ela não tem nada em aberto. */
export function montarLembrete(dados, pessoa, cfg, site, agora = agoraSP()) {
  const hoje = agora.data;
  const areasPorId = Object.fromEntries(dados.areas.map((a) => [a.id, a]));
  const pessoasPorId = Object.fromEntries(dados.pessoas.map((p) => [p.id, p]));

  const abertas = dados.atividades.filter((a) => a.status !== 'concluido' && a.responsaveis.includes(pessoa.id));
  if (!abertas.length) return null;

  const listadas = ordenar(
    cfg.incluir_sem_prazo ? abertas : abertas.filter((a) => prazoEfetivo(a, hoje)),
    areasPorId, hoje, cfg.destacar_atrasadas,
  );
  const semPrazoOcultas = abertas.length - listadas.length;
  const fazendo = abertas.filter((a) => a.status === 'fazendo').length;
  const atrasadas = abertas.filter((a) => estaAtrasada(a, hoje));
  const proxima = abertas.map((a) => prazoEfetivo(a, hoje)).filter((p) => p && p >= hoje).sort()[0];

  const primeiroNome = pessoa.nome.split(' ')[0];
  let miolo = `<p style="margin:0 0 14px">Você tem <b>${plural(abertas.length, 'atividade em aberto', 'atividades em aberto')}</b>: `
    + `${fazendo} em andamento e ${abertas.length - fazendo} a fazer.`
    + (proxima ? ` A mais próxima vence em <b>${fmtData(proxima)}</b>.` : '')
    + (semPrazoOcultas ? ` ${plural(semPrazoOcultas, 'atividade está', 'atividades estão')} sem prazo definido e não aparece${semPrazoOcultas > 1 ? 'm' : ''} abaixo.` : '')
    + '</p>';

  if (cfg.destacar_atrasadas && atrasadas.length) {
    miolo += aviso(`<b>${plural(atrasadas.length, 'atividade atrasada', 'atividades atrasadas')}.</b> Atualize o status ou combine um novo prazo.`, 'vermelho');
  }
  if (cfg.avisar_prazo_alterado) {
    // várias mudanças na mesma atividade viram uma só: do primeiro prazo da semana ao atual
    const porAtividade = new Map();
    for (const h of prazosAlteradosNaSemana(dados, new Set(abertas.map((a) => a.id)))) {
      const atual = porAtividade.get(h.atividade_id);
      porAtividade.set(h.atividade_id, { de: atual ? atual.de : h.valor_anterior, para: h.valor_novo });
    }
    const itens = [...porAtividade].filter(([, v]) => v.de !== v.para).map(([id, v]) => {
      const at = abertas.find((a) => a.id === id);
      return `${esc(areasPorId[at.area_id].nome)} nº ${at.numero ?? '—'} passou de ${v.de ? fmtData(v.de) : 'sem prazo'} para ${v.para ? fmtData(v.para) : 'sem prazo'}`;
    });
    if (itens.length) {
      miolo += aviso(`<b>Prazo alterado nesta semana:</b> ${itens.join('; ')}.`);
    }
  }

  for (const at of listadas) {
    const atrasada = estaAtrasada(at, hoje);
    const outros = at.responsaveis.filter((id) => id !== pessoa.id).map((id) => pessoasPorId[id]?.nome).filter(Boolean);
    miolo += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin:0 0 10px"><tr><td style="padding:12px 14px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px;font-weight:bold;letter-spacing:.5px;color:#4b5563">${esc(areasPorId[at.area_id].nome.toUpperCase())} · Nº ${at.numero ?? '—'}</td>
        <td align="right">${atrasada && cfg.destacar_atrasadas ? badge('Atrasada', 'atrasada') + ' ' : ''}${badge(STATUS[at.status], at.status)}</td>
      </tr></table>
      <div style="margin:6px 0 4px;font-size:14px;color:#111827">${esc(at.acao)}</div>
      ${at.observacao ? `<div style="font-size:12px;color:#6b7280;margin-bottom:4px">${esc(at.observacao)}</div>` : ''}
      <div style="font-size:12px;color:#6b7280">Prazo: <b style="color:${atrasada ? '#b91c1c' : '#111827'}">${esc(textoPrazo(at))}</b>${outros.length ? ` · com ${esc(outros.join(', '))}` : ''}</div>
    </td></tr></table>`;
  }
  miolo += botao(`${site}/#/atividades?pessoa=${pessoa.id}`, 'Abrir minhas atividades');

  const html = moldura(
    'PLANO DE AÇÃO · AUDITORIA INTERNA',
    `${saudacaoPorHora(agora.hora)}, ${primeiroNome}`,
    miolo,
    'Você recebe este e-mail porque é responsável por atividades do Plano de Ação da Auditoria Interna. Para atualizar o andamento, abra o painel pelo botão acima.',
  );
  const texto = [
    `${saudacaoPorHora(agora.hora)}, ${primeiroNome}`,
    `Você tem ${plural(abertas.length, 'atividade em aberto', 'atividades em aberto')}.`,
    '',
    ...listadas.map((a) => `- ${areasPorId[a.area_id].nome} nº ${a.numero ?? '—'} [${STATUS[a.status]}${estaAtrasada(a, hoje) ? ', ATRASADA' : ''}] ${a.acao} — prazo: ${textoPrazo(a)}`),
    '',
    `Abrir minhas atividades: ${site}/#/atividades?pessoa=${pessoa.id}`,
  ].join('\n');

  return { assunto: 'Suas atividades da semana · Plano de Ação da Auditoria', html, texto, para: pessoa.email };
}

/** Resumo geral para quem acompanha o plano. */
export function montarResumo(dados, cfg, site, agora = agoraSP()) {
  const hoje = agora.data;
  const areasPorId = Object.fromEntries(dados.areas.map((a) => [a.id, a]));
  const at = dados.atividades;
  const cont = (f) => at.filter(f).length;
  const atrasadas = ordenar(at.filter((a) => estaAtrasada(a, hoje)), areasPorId, hoje, false);
  const semResp = at.filter((a) => a.status !== 'concluido' && !a.responsaveis.length);
  const alteradas = prazosAlteradosNaSemana(dados, new Set(at.map((a) => a.id)));
  const rotulo = (a) => `${esc(areasPorId[a.area_id].nome)} nº ${a.numero ?? '—'}`;

  const kpi = (n, r, cor = '#111827') => `<td style="padding:10px 8px;border:1px solid #e5e7eb;border-radius:8px;text-align:center"><div style="font-size:20px;font-weight:bold;color:${cor}">${n}</div><div style="font-size:11px;color:#6b7280">${r}</div></td>`;
  let miolo = `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:0 0 14px"><tr>
    ${kpi(at.length, 'Atividades')}${kpi(cont((a) => a.status === 'a_fazer'), 'A fazer', '#4b5563')}${kpi(cont((a) => a.status === 'fazendo'), 'Fazendo', '#c2410c')}${kpi(cont((a) => a.status === 'concluido'), 'Concluídas', '#1d4ed8')}${kpi(atrasadas.length, 'Atrasadas', '#b91c1c')}
  </tr></table>`;

  miolo += '<div style="font-weight:bold;margin:4px 0 6px">Por área</div><table role="presentation" width="100%" cellpadding="6" cellspacing="0" style="font-size:13px;border-collapse:collapse;margin-bottom:14px">';
  for (const ar of dados.areas) {
    const da = at.filter((a) => a.area_id === ar.id);
    const atr = da.filter((a) => estaAtrasada(a, hoje)).length;
    miolo += `<tr style="border-bottom:1px solid #eef0f4"><td>${esc(ar.nome)}</td><td align="right" style="color:#6b7280">${da.filter((a) => a.status === 'concluido').length}/${da.length} concluídas</td><td align="right" style="color:${atr ? '#b91c1c' : '#9ca3af'}">${atr ? plural(atr, 'atrasada', 'atrasadas') : '—'}</td></tr>`;
  }
  miolo += '</table>';

  const lista = (titulo, itens) => (itens.length
    ? `<div style="font-weight:bold;margin:4px 0 6px">${titulo}</div><ul style="margin:0 0 14px;padding-left:18px;font-size:13px">${itens.map((i) => `<li style="margin-bottom:4px">${i}</li>`).join('')}</ul>`
    : '');
  const nomes = Object.fromEntries(dados.pessoas.map((p) => [p.id, p.nome]));
  miolo += lista('Atrasadas', atrasadas.map((a) => `<b>${rotulo(a)}</b> — ${esc(a.acao)} <span style="color:#b91c1c">(prazo ${fmtData(a.prazo)})</span> · ${esc(a.responsaveis.map((id) => nomes[id]).join(', ') || 'sem responsável')}`));
  miolo += lista('Sem responsável', semResp.map((a) => `<b>${rotulo(a)}</b> — ${esc(a.acao)}${a.observacao ? ` <span style="color:#6b7280">(${esc(a.observacao)})</span>` : ''}`));
  miolo += lista('Prazos alterados nos últimos 7 dias', alteradas.map((h) => {
    const a = at.find((x) => x.id === h.atividade_id);
    return `<b>${rotulo(a)}</b>: ${h.valor_anterior ? fmtDataCurta(h.valor_anterior) : 'sem prazo'} → ${h.valor_novo ? fmtData(h.valor_novo) : 'sem prazo'} — ${esc(h.motivo || '')} <span style="color:#6b7280">(${esc(h.autor || '')})</span>`;
  }));
  miolo += botao(`${site}/#/painel`, 'Abrir o painel');

  return {
    assunto: 'Resumo da semana · Plano de Ação da Auditoria',
    html: moldura('PLANO DE AÇÃO · AUDITORIA INTERNA', 'Resumo da semana', miolo, 'Resumo enviado para quem acompanha o plano (campo "Resumo geral" na aba E-mails).'),
    texto: `Resumo do Plano de Ação: ${at.length} atividades, ${atrasadas.length} atrasadas, ${semResp.length} sem responsável.\n${site}/#/painel`,
    para: cfg.resumo_email,
  };
}

async function registrar(tipo, destinatario, pessoaId, assunto, ok, erro) {
  await db().query(
    'insert into envios (tipo, destinatario, pessoa_id, assunto, ok, erro) values ($1, $2, $3, $4, $5, $6)',
    [tipo, destinatario, pessoaId, assunto, ok, erro],
  ).catch((e) => console.error('Falha ao registrar envio:', e.message));
}

export async function enviar(transporte, cfg, msg, { tipo, pessoaId = null }) {
  try {
    await transporte.sendMail({ from: remetente(cfg), to: msg.para, subject: msg.assunto, html: msg.html, text: msg.texto });
    await registrar(tipo, msg.para, pessoaId, msg.assunto, true, null);
    return { para: msg.para, ok: true };
  } catch (e) {
    await registrar(tipo, msg.para, pessoaId, msg.assunto, false, e.message);
    return { para: msg.para, ok: false, erro: e.message };
  }
}

/** Envia o lembrete para todo mundo marcado como "recebe" e o resumo geral. */
export async function enviarTodos(dados, site) {
  const cfg = dados.config;
  const transporte = criarTransporte();
  const agora = agoraSP();
  const resultados = [];
  try {
    for (const p of dados.pessoas) {
      if (!p.recebe || !p.email) continue;
      const msg = montarLembrete(dados, p, cfg, site, agora);
      if (msg) resultados.push(await enviar(transporte, cfg, msg, { tipo: 'lembrete', pessoaId: p.id }));
    }
    if (cfg.resumo_email) {
      resultados.push(await enviar(transporte, cfg, montarResumo(dados, cfg, site, agora), { tipo: 'resumo' }));
    }
  } finally {
    transporte.close();
  }
  return resultados;
}
