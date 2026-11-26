import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CatalogStore } from './server/store.mjs';
import { CatalogService, handleApi, json, ApiError } from './server/service.mjs';
import { readWebP, saveProductPhoto } from './server/media.mjs';
import { readPublishedCatalog } from './server/published.mjs';
import { publishedArticles } from './public/blog-model.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const defaultDirectory = path.resolve(root, '../.local/admin');
const directoryFlag = process.argv.indexOf('--data-dir');
const directory = directoryFlag >= 0 ? path.resolve(process.argv[directoryFlag + 1]) : defaultDirectory;
const portFlag = process.argv.indexOf('--port');
const port = Number(portFlag >= 0 ? process.argv[portFlag + 1] : 4175);
const seedFlag = process.argv.indexOf('--catalog-file');
const seed = seedFlag >= 0 ? path.resolve(process.argv[seedFlag + 1]) : path.join(defaultDirectory, 'seed.catalog.json');
if (!fs.existsSync(seed)) throw new Error('Не найдена копия каталога. Запустите node admin/dev.mjs --catalog-file ПУТЬ_К_JSON');
const mediaDirectory = path.join(directory, 'media');
fs.mkdirSync(mediaDirectory, { recursive: true });
const photoStorage = {
  read(name) {
    try { return fs.readFileSync(path.join(mediaDirectory, name)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  },
  create(name, bytes) {
    const temporary = path.join(mediaDirectory, `${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: 'wx' });
      try { fs.linkSync(temporary, path.join(mediaDirectory, name)); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    } finally { fs.rmSync(temporary, { force: true }); }
  }
};
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
  if (key === 'catalog') {
    const catalog = JSON.parse(value);
    const release = JSON.parse(publication[catalog._enkaPublication.releaseKey]);
    fs.writeFileSync(path.join(directory, 'published.catalog.json'), JSON.stringify({ ...catalog, _enkaBlog: publishedArticles(release.document.blog) }));
  }
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
      const catalog = await readPublishedCatalog(async key => publication[key] ? JSON.parse(publication[key]) : null, url.searchParams.get('lang'), store.getRevision(1).document.catalog, url.searchParams.get('include') === 'blog');
      res.setHeader('Content-Type', types['.json']); res.end(JSON.stringify(catalog)); return;
    }
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 4000000) throw new ApiError(413, 'Запрос слишком большой.'); chunks.push(chunk); }
      const request = new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
      let response;
      if (url.pathname === '/api/upload' && req.method === 'POST') {
        const file = await readWebP(request);
        photoStorage.create(file.name, file.bytes);
        response = json({ url: '/media/' + file.name });
      } else if (url.pathname === '/api/product-photo' && req.method === 'POST') {
        response = json(await saveProductPhoto(request, photoStorage));
      } else response = await runSerialized(() => handleApi(request, service, 'Локальный редактор', { publicImagesBase: '', storefrontBase: 'http://127.0.0.1:4173' }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    let target;
    if (/^\/img\/(categories|banners|blog)\//.test(url.pathname)) {
      const imageRoot=path.resolve(root,'../img',url.pathname.split('/')[2]);
      target=path.resolve(imageRoot,decodeURIComponent(url.pathname.split('/').slice(3).join('/')));
      if(!target.startsWith(imageRoot+path.sep)){res.writeHead(403).end();return;}
    } else if (url.pathname.startsWith('/media/')) {
      const name = url.pathname.slice(7);
      if (!globalThis.EnkaCardImages.mediaName(name)) { res.writeHead(404).end(); return; }
      target = path.join(mediaDirectory, name);
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
