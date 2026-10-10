// Local static server for development: `npm start` (source) or `npm run start:dist` (the built site).
// No dependencies, nothing cached, so a reload always picks up edited simulation code.
//   --dist          serve dist/ instead of the repo root
//   --port <n>      first port to try (default 8000, or $PORT); the next free one is used if it is taken
//   --host <addr>   interface to bind (default 127.0.0.1; use 0.0.0.0 to open it to your network)
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = args.includes('--dist') ? join(repo, 'dist') : repo;
const host = opt('host', '127.0.0.1');
let port = +opt('port', process.env.PORT || 8000);

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No index.html in ${root}` + (root.endsWith('dist') ? ' — run `npm run build` first.' : ''));
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

const server = createServer((req, res) => {
  const send = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(text); };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(400, 'Bad request'); }
  // resolve inside the served directory only, and never expose dotfiles (.git, .vercel, …)
  const file = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path));
  if (!(file + sep).startsWith(root + sep) && file !== root) return send(403, 'Forbidden');
  if (path.split('/').some((p) => p.startsWith('.'))) return send(404, 'Not found');
  let st;
  try { st = statSync(file); } catch { return send(404, 'Not found'); }
  if (st.isDirectory()) { res.writeHead(301, { Location: path.replace(/\/?$/, '/') }); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
});

server.on('request', (req, res) => res.on('finish', () => console.log(`${res.statusCode} ${req.method} ${req.url}`)));
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && port < 65535) { console.log(`port ${port} is busy, trying ${port + 1}`); server.listen(++port, host); return; }
  console.error(e.message);
  process.exit(1);
});
server.on('listening', () => {
  const where = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`WareTrack ${root === repo ? '(source)' : '(dist)'} → http://${where}:${port}/   (Ctrl+C to stop)`);
});
server.listen(port, host);

const stop = () => { console.log('\nstopped'); server.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
