import { db } from './db.js';

/** Carrega tudo o que as telas precisam (o volume é pequeno: ~40 atividades). */
export async function carregarDados() {
  const q = (sql) => db().query(sql).then((r) => r.rows);
  const [config, areas, pessoas, atividades, historico, observacoes, envios] = await Promise.all([
    q('select * from config where id = 1'),
    q('select * from areas order by ordem'),
    q('select id, nome, email, recebe from pessoas order by nome'),
    q(`select t.*,
              coalesce(array_agg(r.pessoa_id order by p.nome) filter (where r.pessoa_id is not null), '{}') as responsaveis
         from atividades t
         join areas a on a.id = t.area_id
         left join atividade_responsaveis r on r.atividade_id = t.id
         left join pessoas p on p.id = r.pessoa_id
        group by t.id, a.ordem
        order by a.ordem, t.ordem`),
    q('select * from historico order by criado_em, id'),
    q('select grupo, texto from observacoes_gerais order by grupo desc, ordem'),
    q('select criado_em, tipo, destinatario, assunto, ok, erro from envios order by criado_em desc limit 15'),
  ]);
  return { config: config[0] || {}, areas, pessoas, atividades, historico, observacoes, envios };
}
