// Chamada às funções do banco (03_funcoes.sql) pela API do Supabase.
// Usado pela página (navegador) e pela função de e-mail da Vercel (Node).
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const supabaseConfigurado = () =>
  !/SEU-PROJETO/.test(SUPABASE_URL) && !/COLE_AQUI/.test(SUPABASE_PUBLISHABLE_KEY);

export class ErroSupabase extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

function mensagemAmigavel(status, json) {
  const msg = json?.message || json?.msg || json?.error || '';
  if (status === 401 || /invalid api key|jwt/i.test(msg)) {
    return 'A publishable key não foi aceita. Confira public/config.js.';
  }
  if (json?.code === 'PGRST202' || json?.code === '42883' || json?.code === '42501' || status === 404) {
    return 'As funções do banco não foram encontradas. Rode o script supabase/03_funcoes.sql no SQL Editor do Supabase.';
  }
  return msg || `Erro ${status} no Supabase`;
}

export async function rpc(funcao, args = {}) {
  const chave = SUPABASE_PUBLISHABLE_KEY;
  const headers = { apikey: chave, 'Content-Type': 'application/json' };
  // Chaves antigas ("anon", formato JWT) também vão no Authorization
  if (chave.startsWith('eyJ')) headers.Authorization = `Bearer ${chave}`;

  let r;
  try {
    r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${funcao}`, {
      method: 'POST', headers, body: JSON.stringify(args),
    });
  } catch {
    throw new ErroSupabase('Sem conexão com o Supabase. Verifique a internet e a URL em public/config.js.', 0);
  }
  let json = null;
  try { json = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) throw new ErroSupabase(mensagemAmigavel(r.status, json), r.status);
  return json;
}
