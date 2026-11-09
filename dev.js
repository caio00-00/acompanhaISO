// Servidor local para testar sem a Vercel:  npm install && npm run dev  →  http://localhost:3000
// Lê as variáveis do arquivo .env (mesmos nomes usados na Vercel).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.dirname(fileURLToPath(import.meta.url));

if (fs.existsSync(path.join(raiz, '.env'))) {
  for (const linha of fs.readFileSync(path.join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function adaptar(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = (s) => { res.end(s); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  adaptar(res);
  if (url.pathname.startsWith('/api/')) {
    const nome = url.pathname.slice(5).replace(/[^a-z0-9_-]/gi, '');
    const arquivo = path.join(raiz, 'api', `${nome}.js`);
    if (!fs.existsSync(arquivo)) return res.status(404).json({ erro: 'Rota não encontrada' });
    let bruto = '';
    for await (const parte of req) bruto += parte;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = bruto ? JSON.parse(bruto) : undefined; } catch { req.body = bruto; }
    const { default: handler } = await import(pathToFileURL(arquivo).href);
    return handler(req, res);
  }
  const alvo = path.normalize(path.join(raiz, 'public', url.pathname === '/' ? 'index.html' : url.pathname));
  if (!alvo.startsWith(path.join(raiz, 'public')) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) {
    res.statusCode = 404; return res.end('Não encontrado');
  }
  res.setHeader('Content-Type', TIPOS[path.extname(alvo)] || 'application/octet-stream');
  fs.createReadStream(alvo).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log(`Rodando em http://localhost:${process.env.PORT || 3000}`));
