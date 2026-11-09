// /api/lembretes
//   Agendamento (pg_cron do Supabase ou Vercel Cron), com Authorization: Bearer CRON_SECRET:
//     GET ou POST sem "acao" → envia se hoje for o dia/horário configurado e ainda não enviou hoje.
//   Pela tela de E-mails (com a senha da equipe), POST { acao }:
//     "previa"    { pessoa_id }          → HTML do e-mail daquela pessoa (ou do resumo, pessoa_id = "resumo")
//     "teste"     { pessoa_id, email }   → envia a prévia para o e-mail informado
//     "verificar"                        → testa a conexão SMTP
import { rota, exigirSenha, senhaAtiva, ehAgendamento, corpo, urlDoSite, HttpError } from '../lib/http.js';
import { db } from '../lib/db.js';
import { carregarDados } from '../lib/dados.js';
import { agoraSP } from '../lib/regras.js';
import { montarLembrete, montarResumo, criarTransporte, enviar, enviarTodos } from '../lib/email.js';

async function agendado(req) {
  if (!ehAgendamento(req)) throw new HttpError(401, 'Não autorizado');
  const agora = agoraSP();
  const { rows } = await db().query('select * from config where id = 1');
  const cfg = rows[0];
  if (!cfg.envio_ativo) return { enviado: false, motivo: 'Envio automático desativado' };
  if (agora.diaSemana !== cfg.dia_semana || agora.hora < cfg.horario) {
    return { enviado: false, motivo: 'Fora do dia/horário configurado', agora };
  }

  // "Reserva" o envio de hoje antes de mandar, para duas chamadas seguidas não duplicarem
  const reserva = await db().query(
    `with antes as (select ultimo_envio_em from config where id = 1 for update)
     update config c set ultimo_envio_em = now()
       from antes
      where c.id = 1
        and (antes.ultimo_envio_em is null
             or (antes.ultimo_envio_em at time zone 'America/Sao_Paulo')::date
                < (now() at time zone 'America/Sao_Paulo')::date)
     returning antes.ultimo_envio_em as anterior`,
  );
  if (!reserva.rowCount) return { enviado: false, motivo: 'Já enviado hoje' };

  let resultados;
  try {
    resultados = await enviarTodos(await carregarDados(), urlDoSite(req));
  } catch (e) {
    resultados = [{ ok: false, erro: e.message }];
  }
  // Se nada saiu (ex.: SMTP fora do ar), libera para tentar de novo na próxima hora
  if (resultados.length && !resultados.some((r) => r.ok)) {
    await db().query('update config set ultimo_envio_em = $1 where id = 1', [reserva.rows[0].anterior]);
  }
  return { enviado: true, total: resultados.length, falhas: resultados.filter((r) => !r.ok) };
}

async function pelaTela(req) {
  exigirSenha(req);
  const b = corpo(req);
  const site = urlDoSite(req);

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
    const dados = await carregarDados();
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
    if (!senhaAtiva()) {
      // Sem senha, o site é aberto: o teste só vai para e-mails já cadastrados (evita uso para spam)
      const cfg = dados.config;
      const conhecidos = new Set([
        ...dados.pessoas.map((p) => p.email),
        cfg.remetente_email,
        ...String(cfg.resumo_email || '').split(/[;,]/),
      ].filter(Boolean).map((e) => e.trim().toLowerCase()));
      if (!conhecidos.has(email.toLowerCase())) {
        throw new HttpError(400, 'O teste só pode ir para um e-mail cadastrado na lista de destinatários (salve o seu primeiro).');
      }
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
