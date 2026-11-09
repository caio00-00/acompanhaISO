// PATCH /api/atividade → altera status, prazo, responsáveis e observação de UMA atividade.
// As atividades em si são fixas (vêm do documento): aqui não se cria nem se apaga nenhuma.
import { rota, exigirSenha, corpo, textoOuNulo, HttpError } from '../lib/http.js';
import { transacao } from '../lib/db.js';
import { STATUS } from '../lib/regras.js';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export default rota({
  PATCH: async (req) => {
    exigirSenha(req);
    const b = corpo(req);
    const id = Number(b.id);
    const autor = textoOuNulo(b.autor, 120);
    if (!Number.isInteger(id)) throw new HttpError(400, 'Atividade inválida');
    if (!autor) throw new HttpError(400, 'Informe quem está fazendo a alteração');

    return transacao(async (c) => {
      const { rows } = await c.query('select * from atividades where id = $1 for update', [id]);
      const at = rows[0];
      if (!at) throw new HttpError(404, 'Atividade não encontrada');

      const hist = [];
      const set = {};

      // --- status ------------------------------------------------------
      if (b.status !== undefined && b.status !== at.status) {
        if (!STATUS[b.status]) throw new HttpError(400, 'Status inválido');
        set.status = b.status;
        set.concluido_em = b.status === 'concluido' ? new Date() : null;
        hist.push(['status', at.status, b.status, null]);
      }

      // --- prazo -------------------------------------------------------
      if (b.prazo !== undefined) {
        const novo = b.prazo || null;
        if (novo && !DATA_ISO.test(novo)) throw new HttpError(400, 'Data de prazo inválida');
        if (novo !== at.prazo) {
          if (at.dia_recorrente && !at.prazo) {
            throw new HttpError(400, `Esta atividade é recorrente (todo dia ${at.dia_recorrente}); o prazo não muda por aqui.`);
          }
          if (!at.prazo && !at.prazo_original) {
            // Atividade ainda sem prazo: é a primeira definição, sem marca de "data alterada"
            set.prazo = novo;
            set.prazo_original = novo;
            hist.push(['prazo_definido', null, novo, null]);
          } else {
            const motivo = textoOuNulo(b.motivo, 1000);
            if (!motivo || motivo.length < 3) {
              throw new HttpError(400, 'Informe o motivo da alteração do prazo');
            }
            set.prazo = novo;
            hist.push(['prazo_alterado', at.prazo, novo, motivo]);
          }
        }
      }

      // --- observação --------------------------------------------------
      if (b.observacao !== undefined) {
        const nova = textoOuNulo(b.observacao, 2000);
        if (nova !== (at.observacao || null)) {
          set.observacao = nova;
          hist.push(['observacao', at.observacao, nova, null]);
        }
      }

      // --- responsáveis ------------------------------------------------
      if (Array.isArray(b.responsaveis)) {
        const novos = [...new Set(b.responsaveis.map(Number).filter(Number.isInteger))];
        const atuais = await c.query(
          `select r.pessoa_id, p.nome from atividade_responsaveis r
             join pessoas p on p.id = r.pessoa_id where r.atividade_id = $1 order by p.nome`, [id]);
        const idsAtuais = atuais.rows.map((r) => r.pessoa_id);
        const mudou = novos.length !== idsAtuais.length || novos.some((n) => !idsAtuais.includes(n));
        if (mudou) {
          const nomes = novos.length
            ? (await c.query('select id, nome from pessoas where id = any($1::int[]) order by nome', [novos])).rows
            : [];
          if (nomes.length !== novos.length) throw new HttpError(400, 'Responsável inválido');
          await c.query('delete from atividade_responsaveis where atividade_id = $1', [id]);
          if (novos.length) {
            await c.query(
              `insert into atividade_responsaveis (atividade_id, pessoa_id)
               select $1, unnest($2::int[])`, [id, novos]);
          }
          hist.push([
            'responsavel',
            atuais.rows.map((r) => r.nome).join(', ') || null,
            nomes.map((r) => r.nome).join(', ') || null,
            null,
          ]);
        }
      }

      if (!hist.length) return { ok: true, alterado: false };

      const colunas = Object.keys(set);
      const valores = Object.values(set);
      await c.query(
        `update atividades set ${[...colunas.map((k, i) => `${k} = $${i + 2}`), 'atualizado_em = now()', `atualizado_por = $${colunas.length + 2}`].join(', ')}
          where id = $1`,
        [id, ...valores, autor],
      );
      for (const [tipo, anterior, novo, motivo] of hist) {
        await c.query(
          `insert into historico (atividade_id, tipo, valor_anterior, valor_novo, motivo, autor)
           values ($1, $2, $3, $4, $5, $6)`,
          [id, tipo, anterior, novo, motivo, autor],
        );
      }
      return { ok: true, alterado: true };
    });
  },
});
