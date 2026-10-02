// Serves site/ locally (after build:site) with the same security headers as
// production, so CSP problems show up before deploying.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png',
};

// Headers for every path, taken from the "/*" block of site/_headers.
const headers = {};
const block = fs.readFileSync(path.join(SITE, '_headers'), 'utf8').split(/\n(?=\S)/)[0];
for (const line of block.split('\n').slice(1)) {
  const i = line.indexOf(':');
  if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
delete headers['Strict-Transport-Security']; // not meaningful on http://localhost

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`CR8 website: http://localhost:${PORT}  (Ctrl+C to stop)`));
