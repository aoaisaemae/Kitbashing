import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be between 1 and 65535.');
const types = { '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };
const files = new Set((await readdir(root)).filter(name => types[path.extname(name)]));

http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!files.has(name)) { res.writeHead(404).end('Not found'); return; }
    const file = path.join(root, name);
    const info = await stat(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end('Unable to serve request');
  }
}).listen(port, '127.0.0.1', () => console.log(`POPMARKIT studio: http://127.0.0.1:${port}`));
