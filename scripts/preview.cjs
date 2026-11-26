const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
require('../admin/public/card-images.js');
const rootFlag = process.argv.indexOf('--root');
const root = rootFlag >= 0 ? path.resolve(process.argv[rootFlag + 1]) : path.resolve(__dirname, '../_site');
const compress = process.argv.includes('--compress');
const port = Number(process.env.PORT || 4173);
const mock = process.argv.includes('--mock-services');
const studio = process.argv.includes('--studio');
const studioOrigin = 'http://127.0.0.1:4175';
const catalogError = process.argv.includes('--catalog-error');
const catalogFlag = process.argv.indexOf('--catalog-file');
const catalogFile = catalogFlag >= 0 ? path.resolve(process.argv[catalogFlag + 1]) : path.join(__dirname, '../.local/catalog.json');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
if (studio && (!mock || catalogFlag >= 0)) throw new Error('--studio requires --mock-services and replaces --catalog-file');

function proxyStudio(target, res, type) {
  const request = http.get(new URL(target, studioOrigin), upstream => {
    res.writeHead(upstream.statusCode, { 'Content-Type': type });
    upstream.on('error', () => res.destroy());
    upstream.pipe(res);
  });
  request.setTimeout(5000, () => request.destroy());
  request.on('error', () => {
    if (res.headersSent) res.destroy();
    else res.writeHead(503).end();
  });
  res.on('close', () => request.destroy());
}

http.createServer((req, res) => {
  let url, pathname;
  try { url = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (studio && req.method === 'GET' && pathname.startsWith('/media/') && globalThis.EnkaCardImages.mediaName(pathname.slice(7))) {
    proxyStudio(pathname, res, types['.webp']);
    return;
  }
  if (mock && pathname.startsWith('/__preview/')) {
    res.setHeader('Content-Type', 'application/json');
    if (pathname === '/__preview/catalog') {
      if (catalogError) { res.writeHead(503).end('{}'); return; }
      if (studio) {
        const target = new URL('/published/catalog', studioOrigin);
        const locale = url.searchParams.get('lang');
        if (['ru', 'en'].includes(locale)) target.searchParams.set('lang', locale);
        proxyStudio(target, res, types['.json']);
        return;
      }
      try { res.end(fs.readFileSync(catalogFile)); } catch { res.writeHead(503).end('{}'); } return;
    }
    if (req.method !== 'POST') { res.writeHead(405).end('{}'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // Only local QA: no orders or customer details leave this machine.
      const failed = body.includes('555000000');
      setTimeout(() => res.writeHead(failed ? 503 : 200).end(JSON.stringify(pathname.endsWith('/tracking') ? { data: [] } : { success: !failed })), 400);
    });
    return;
  }
  let target = path.resolve(root, '.' + pathname);
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) && !path.extname(target)) target += '.html';
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end('Not found'); return; }
  res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
  if (mock && pathname === '/assets/js/main/config.js') {
    res.end("window.CATALOG_API_URL='/__preview/catalog'; window.WORKER_URL_TRACKING='/__preview/tracking';" +
      (studio ? ' window.CATALOG_SESSION_CACHE=false;' : ''));
  } else if (mock && pathname === '/assets/js/global/order-intake.js') {
    res.end("window.submitEnkaOrder = (_form, order) => fetch('/__preview/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) });");
  } else if (mock && pathname === '/capi.js') {
    res.end('// Analytics disabled in isolated local QA.');
  } else if (compress && /\b(?:gzip)\b/.test(req.headers['accept-encoding'] || '') && /\.(?:html|css|js|json|svg|xml|txt)$/.test(target)) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    fs.createReadStream(target).pipe(zlib.createGzip()).pipe(res);
  } else fs.createReadStream(target).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + port + (mock ? ' (isolated service mocks)' : '')));
