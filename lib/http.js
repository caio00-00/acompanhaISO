import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Monta um handler da Vercel a partir de { GET: fn, POST: fn, ... }. */
export function rota(metodos) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const fn = metodos[req.method];
    if (!fn) return res.status(405).json({ erro: 'Método não permitido' });
    try {
      const saida = await fn(req, res);
      if (!res.headersSent) res.status(200).json(saida ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) res.status(status).json({ erro: e.message || 'Erro interno' });
    }
  };
}

function iguais(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Senha da equipe (ACESSO_SENHA), enviada pelo front no cabeçalho x-senha. */
export function exigirSenha(req) {
  const senha = process.env.ACESSO_SENHA;
  if (!senha) throw new HttpError(500, 'Defina ACESSO_SENHA nas variáveis de ambiente.');
  let enviada = req.headers['x-senha'] || '';
  try { enviada = decodeURIComponent(enviada); } catch { /* mantém como veio */ }
  if (!iguais(enviada, senha)) throw new HttpError(401, 'Senha incorreta');
}

/** Chamadas do agendamento (pg_cron ou Vercel Cron) usam Authorization: Bearer CRON_SECRET. */
export function ehAgendamento(req) {
  const segredo = process.env.CRON_SECRET;
  return Boolean(segredo) && iguais(req.headers.authorization || '', `Bearer ${segredo}`);
}

export function corpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { throw new HttpError(400, 'JSON inválido'); }
  }
  return req.body;
}

export function textoOuNulo(v, max = 2000) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function urlDoSite(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}
