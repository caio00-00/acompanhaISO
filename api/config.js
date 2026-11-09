// PUT /api/config → salva as opções da tela de E-mails
import { rota, exigirSenha, corpo, textoOuNulo, HttpError } from '../lib/http.js';
import { db } from '../lib/db.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default rota({
  PUT: async (req) => {
    exigirSenha(req);
    const b = corpo(req);

    const remetente_email = textoOuNulo(b.remetente_email, 200);
    const resumo_email = textoOuNulo(b.resumo_email, 500);
    if (remetente_email && !EMAIL.test(remetente_email)) throw new HttpError(400, 'E-mail do remetente inválido');
    if (resumo_email && !resumo_email.split(/[;,]/).every((e) => EMAIL.test(e.trim()))) {
      throw new HttpError(400, 'E-mail do resumo geral inválido (separe vários por vírgula)');
    }
    const dia = Number(b.dia_semana);
    const hora = Number(b.horario);
    if (!(dia >= 0 && dia <= 6)) throw new HttpError(400, 'Dia inválido');
    if (!(hora >= 0 && hora <= 23)) throw new HttpError(400, 'Horário inválido');

    await db().query(
      `update config set
          remetente_email = $1, remetente_nome = $2, envio_ativo = $3, dia_semana = $4, horario = $5,
          destacar_atrasadas = $6, avisar_prazo_alterado = $7, incluir_sem_prazo = $8, resumo_email = $9,
          aviso_painel = coalesce($10, aviso_painel)
        where id = 1`,
      [
        remetente_email,
        textoOuNulo(b.remetente_nome, 120) || 'Plano de Ação OROS',
        Boolean(b.envio_ativo),
        dia,
        hora,
        Boolean(b.destacar_atrasadas),
        Boolean(b.avisar_prazo_alterado),
        Boolean(b.incluir_sem_prazo),
        resumo_email,
        b.aviso_painel === undefined ? null : String(b.aviso_painel).slice(0, 300),
      ],
    );
    return { ok: true };
  },
});
