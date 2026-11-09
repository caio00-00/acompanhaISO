// POST /api/pessoas → adiciona uma pessoa   { nome, email }
// PUT  /api/pessoas → salva e-mail e "recebe" de várias   { pessoas: [{ id, email, recebe }] }
import { rota, exigirSenha, corpo, textoOuNulo, HttpError } from '../lib/http.js';
import { db, transacao } from '../lib/db.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarEmail(v) {
  const email = textoOuNulo(v, 200);
  if (email && !EMAIL.test(email)) throw new HttpError(400, `E-mail inválido: ${email}`);
  return email ? email.toLowerCase() : null;
}

export default rota({
  POST: async (req) => {
    exigirSenha(req);
    const b = corpo(req);
    const nome = textoOuNulo(b.nome, 120);
    if (!nome) throw new HttpError(400, 'Informe o nome');
    const email = validarEmail(b.email);
    try {
      const { rows } = await db().query(
        'insert into pessoas (nome, email, recebe) values ($1, $2, true) returning id, nome, email, recebe',
        [nome, email],
      );
      return rows[0];
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, `Já existe uma pessoa chamada ${nome}`);
      throw e;
    }
  },

  PUT: async (req) => {
    exigirSenha(req);
    const lista = corpo(req).pessoas;
    if (!Array.isArray(lista)) throw new HttpError(400, 'Lista de pessoas inválida');
    const limpas = lista.map((p) => ({
      id: Number(p.id),
      email: validarEmail(p.email),
      recebe: Boolean(p.recebe),
    }));
    await transacao(async (c) => {
      for (const p of limpas) {
        if (!Number.isInteger(p.id)) continue;
        await c.query('update pessoas set email = $2, recebe = $3 where id = $1', [p.id, p.email, p.recebe]);
      }
    });
    return { ok: true };
  },
});
