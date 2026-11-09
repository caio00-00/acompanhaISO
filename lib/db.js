// Conexão com o Postgres do Supabase (string de conexão do "Transaction pooler").
import pg from 'pg';
import { HttpError } from './http.js';

// Colunas "date" voltam como texto 'AAAA-MM-DD' (sem conversão de fuso)
pg.types.setTypeParser(1082, (v) => v);

let pool;

export function db() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new HttpError(500, 'DATABASE_URL não configurada nas variáveis de ambiente.');
    }
    pool = new pg.Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
    pool.on('error', (e) => console.error('Erro no pool do Postgres:', e.message));
  }
  return pool;
}

/** Executa fn(client) dentro de uma transação. */
export async function transacao(fn) {
  const client = await db().connect();
  try {
    await client.query('begin');
    const resultado = await fn(client);
    await client.query('commit');
    return resultado;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
