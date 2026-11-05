import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CatalogStore } from './server/store.mjs';
import { CatalogService, handleApi, json, ApiError } from './server/service.mjs';
import { readWebP } from './server/media.mjs';
import { readPublishedCatalog } from './server/published.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const defaultDirectory = path.resolve(root, '../.local/admin');
const directoryFlag = process.argv.indexOf('--data-dir');
const directory = directoryFlag >= 0 ? path.resolve(process.argv[directoryFlag + 1]) : defaultDirectory;
const portFlag = process.argv.indexOf('--port');
const port = Number(portFlag >= 0 ? process.argv[portFlag + 1] : 4175);
const seedFlag = process.argv.indexOf('--catalog-file');
const seed = seedFlag >= 0 ? path.resolve(process.argv[seedFlag + 1]) : path.join(defaultDirectory, 'seed.catalog.json');
if (!fs.existsSync(seed)) throw new Error('Не найдена копия каталога. Запустите node admin/dev.mjs --catalog-file ПУТЬ_К_JSON');
fs.mkdirSync(path.join(directory, 'media'), { recursive: true });
const db = new DatabaseSync(path.join(directory, 'catalog.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
const store = new CatalogStore((query, ...values) => db.prepare(query).all(...values), callback => {
  db.exec('BEGIN IMMEDIATE');
  try { const value = callback(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; }
});
const publicationFile = path.join(directory, 'published-kv.json');
let publication = fs.existsSync(publicationFile) ? JSON.parse(fs.readFileSync(publicationFile, 'utf8')) : {};
const publisher = { async put(key, value) {
  publication[key] = value;
  fs.writeFileSync(publicationFile + '.tmp', JSON.stringify(publication));
  fs.renameSync(publicationFile + '.tmp', publicationFile);
  if (key === 'catalog') fs.writeFileSync(path.join(directory, 'published.catalog.json'), value);
} };
const service = new CatalogService(store, publisher, { environment: 'local' });
await service.initialize(JSON.parse(fs.readFileSync(seed, 'utf8').replace(/^\uFEFF/, '')));
let queue = Promise.resolve();
const runSerialized = callback => { const result = queue.catch(() => {}).then(callback); queue = result.catch(() => {}); return result; };
const publicRoot = path.join(root, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const security = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};

const server = http.createServer(async (req, res) => {
  for (const [key, value] of Object.entries(security)) res.setHeader(key, value);
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(403).end('Forbidden'); return; }
  const origin = 'http://' + req.headers.host;
  try {
    const url = new URL(req.url, origin);
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin) { res.writeHead(403).end('Только запросы из локальной панели.'); return; }
    if (url.pathname === '/published/catalog') {
      const catalog = await readPublishedCatalog(async key => publication[key] ? JSON.parse(publication[key]) : null, url.searchParams.get('lang'), store.getRevision(1).document.catalog);
      res.setHeader('Content-Type', types['.json']); res.end(JSON.stringify(catalog)); return;
    }
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1800000) throw new ApiError(413, 'Запрос слишком большой.'); chunks.push(chunk); }
      const request = new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
      let response;
      if (url.pathname === '/api/upload' && req.method === 'POST') {
        const file = await readWebP(request);
        fs.writeFileSync(path.join(directory, 'media', file.name), file.bytes, { flag: 'wx' });
        response = json({ url: '/media/' + file.name });
      } else response = await runSerialized(() => handleApi(request, service, 'Локальный редактор', { publicImagesBase: '', storefrontBase: 'http://127.0.0.1:4173' }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    let target;
    if (url.pathname.startsWith('/media/')) {
      const name = url.pathname.slice(7);
      if (!/^[a-f0-9-]+\.webp$/.test(name)) { res.writeHead(404).end(); return; }
      target = path.join(directory, 'media', name);
    } else {
      target = path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
      if (target !== publicRoot && !target.startsWith(publicRoot + path.sep)) { res.writeHead(403).end(); return; }
      if (target === publicRoot || (fs.existsSync(target) && fs.statSync(target).isDirectory())) target = path.join(target, 'index.html');
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end('Not found'); return; }
    res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(error.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error instanceof ApiError ? error.message : 'Не удалось выполнить операцию.' }));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port} (копия каталога, production не подключён)`));
