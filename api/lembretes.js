// /api/lembretes — única função da Vercel: os e-mails (precisam da senha da conta de e-mail).
// Os dados vêm do Supabase pela publishable key (public/config.js); não precisa da senha do banco.
//
//   Agendamento (pg_cron do Supabase), com Authorization: Bearer CRON_SECRET:
//     GET ou POST sem "acao" → envia se hoje for o dia/horário configurado e ainda não enviou hoje.
//   Pela tela de E-mails, POST { acao }:
//     "status"                           → se a conta de e-mail está configurada
//     "previa"    { pessoa_id }          → HTML do e-mail daquela pessoa (ou "resumo")
//     "teste"     { pessoa_id, email }   → envia a prévia para um e-mail já cadastrado
//     "verificar"                        → testa a conexão SMTP
import { rota, ehAgendamento, corpo, urlDoSite, HttpError } from '../lib/http.js';
import { rpc } from '../public/supabase.js';
import { agoraSP } from '../lib/regras.js';
import {
  montarLembrete, montarResumo, criarTransporte, enviar, enviarTodos, smtpConfigurado,
} from '../lib/email.js';

async function agendado(req) {
  if (!ehAgendamento(req)) throw new HttpError(401, 'Não autorizado');
  const agora = agoraSP();
  const dados = await rpc('carregar_dados');
  const cfg = dados.config;
  if (!cfg.envio_ativo) return { enviado: false, motivo: 'Envio automático desativado' };
  if (agora.diaSemana !== cfg.dia_semana || agora.hora < cfg.horario) {
    return { enviado: false, motivo: 'Fora do dia/horário configurado', agora };
  }

  // Reserva o envio de hoje antes de mandar, para duas chamadas seguidas não duplicarem
  const reserva = await rpc('reservar_envio_semanal');
  if (!reserva.reservado) return { enviado: false, motivo: 'Já enviado hoje' };

  let resultados;
  try {
    resultados = await enviarTodos(dados, urlDoSite(req));
  } catch (e) {
    resultados = [{ ok: false, erro: e.message }];
  }
  if (resultados.length && !resultados.some((r) => r.ok)) {
    await rpc('liberar_envio_semanal', { p_anterior: reserva.anterior ?? null });
  }
  return { enviado: true, total: resultados.length, falhas: resultados.filter((r) => !r.ok) };
}

async function pelaTela(req) {
  const b = corpo(req);
  const site = urlDoSite(req);

  if (b.acao === 'status') {
    return {
      smtp_configurado: smtpConfigurado(),
      smtp_usuario: process.env.SMTP_USER || null,
      agendamento_configurado: Boolean(process.env.CRON_SECRET),
    };
  }

  if (b.acao === 'verificar') {
    const t = criarTransporte();
    try {
      await t.verify();
      return { ok: true, mensagem: `Conexão com ${process.env.SMTP_HOST} funcionando.` };
    } catch (e) {
      throw new HttpError(400, `Não conectou: ${e.message}`);
    } finally {
      t.close();
    }
  }

  if (b.acao === 'previa' || b.acao === 'teste') {
    const dados = await rpc('carregar_dados');
    // a prévia usa o horário configurado (ex.: "Bom dia" se o envio é às 9h)
    const agora = { ...agoraSP(), hora: dados.config.horario };
    let msg;
    let pessoaId = null;
    if (b.pessoa_id === 'resumo') {
      msg = montarResumo(dados, dados.config, site, agora);
    } else {
      const pessoa = dados.pessoas.find((p) => p.id === Number(b.pessoa_id));
      if (!pessoa) throw new HttpError(404, 'Pessoa não encontrada');
      pessoaId = pessoa.id;
      msg = montarLembrete(dados, pessoa, dados.config, site, agora);
      if (!msg) throw new HttpError(400, `${pessoa.nome} não tem atividades em aberto — não receberia e-mail.`);
    }
    if (b.acao === 'previa') return { assunto: msg.assunto, para: msg.para, html: msg.html };

    const email = String(b.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Informe um e-mail válido para o teste');
    // O site é aberto: o teste só vai para e-mails já cadastrados (evita uso para spam)
    const cfg = dados.config;
    const conhecidos = new Set([
      ...dados.pessoas.map((p) => p.email),
      cfg.remetente_email,
      ...String(cfg.resumo_email || '').split(/[;,]/),
    ].filter(Boolean).map((e) => e.trim().toLowerCase()));
    if (!conhecidos.has(email.toLowerCase())) {
      throw new HttpError(400, 'O teste só pode ir para um e-mail cadastrado na lista de destinatários (salve o seu primeiro).');
    }
    const t = criarTransporte();
    try {
      const r = await enviar(t, dados.config, { ...msg, para: email, assunto: `[Teste] ${msg.assunto}` }, { tipo: 'teste', pessoaId });
      if (!r.ok) throw new HttpError(400, `Falhou: ${r.erro}`);
      return { ok: true, mensagem: `Teste enviado para ${email}.` };
    } finally {
      t.close();
    }
  }

  throw new HttpError(400, 'Ação desconhecida');
}

export default rota({
  GET: agendado,
  POST: (req) => (corpo(req).acao ? pelaTela(req) : agendado(req)),
});
