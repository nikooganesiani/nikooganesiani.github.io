const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { normalizeCatalog, productFrontMatter, generatePages } = require('../generate_pages.js');
const product = { id: 'test-item', name: 'ტესტი "quoted"\nNew line', sku: '12345', price: '79', oldPrice: '99', images: [] };
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('All storefront scripts parse before shipping', () => {
  function check(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) check(full);
      else if (entry.name.endsWith('.js')) new vm.Script(fs.readFileSync(full, 'utf8'), { filename: full });
    }
  }
  check(path.join(__dirname, '../assets/js'));
  new vm.Script(read('capi.js'));
});

test('Catalog generation rejects missing, duplicate and unsafe product IDs', () => {
  assert.throws(() => normalizeCatalog({ products: [] }), /empty shop/);
  assert.throws(() => normalizeCatalog({ products: [product, product] }), /Duplicate/);
  assert.throws(() => normalizeCatalog({ products: [{ ...product, id: '../escape' }] }), /Invalid product ID/);
  assert.throws(() => normalizeCatalog({ products: [{ ...product, price: '-1' }] }), /Invalid product price/);
  assert.equal(normalizeCatalog({ products: [product] }).length, 1);
});

test('Generated YAML preserves Georgian text, quotes, line breaks and canonical product identity', () => {
  const result = productFrontMatter(product);
  const values = Object.fromEntries(result.split('\n').filter(line => line.includes(': ')).map(line => {
    const index = line.indexOf(': ');
    return [line.slice(0, index), JSON.parse(line.slice(index + 2))];
  }));
  assert.equal(values.name, product.name);
  assert.equal(values.product_id, product.id);
  assert.equal(values.price, '79');
});

test('Regeneration removes stale generated pages and preserves manually authored pages', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enka-generator-'));
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_products'));
  fs.writeFileSync(path.join(root, '_products/stale.md'), productFrontMatter({ ...product, id: 'stale' }));
  fs.writeFileSync(path.join(root, '_products/manual.md'), '---\nlayout: product\n---\nManual');
  const catalogFile = path.join(root, 'catalog.json');
  fs.writeFileSync(catalogFile, JSON.stringify({ products: [product] }));
  await generatePages({ root, catalogFile });
  assert.ok(fs.existsSync(path.join(root, '_products/test-item.md')));
  assert.ok(fs.existsSync(path.join(root, '_products/manual.md')));
  assert.ok(!fs.existsSync(path.join(root, '_products/stale.md')));
});

function catalogContext(fetch, storage = { getItem: () => null, setItem() {} }, locale = 'ka') {
  const context = vm.createContext({ window: { CATALOG_API_URL: 'https://example.test/catalog' }, location: { origin: 'https://example.test' }, sessionStorage: storage, fetch, AbortController, URL, setTimeout, clearTimeout, document: { addEventListener() {} } });
  context.window.enkaI18n = { locale };
  vm.runInContext(read('assets/js/global/catalog.js'), context);
  return context;
}

test('Concurrent homepage, search and favorites requests share one catalog request', async () => {
  let calls = 0;
  const context = catalogContext(async () => { calls++; return { ok: true, json: async () => ({ products: [product] }) }; });
  const [first, second] = await Promise.all([context.window.fetchCatalogCached(), context.window.fetchCatalogCached()]);
  assert.equal(calls, 1);
  assert.equal(first, second);
  await context.window.fetchCatalogCached();
  assert.equal(calls, 1);
});

test('Catalog requests and cached responses stay separate for each native language', async () => {
  const cache = new Map(); const requests = [];
  const storage = { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) };
  const fetch = async url => { requests.push(url); return { ok: true, json: async () => ({ products: [product] }) }; };
  for (const locale of ['ru', 'en', 'ka']) {
    await catalogContext(fetch, storage, locale).window.fetchCatalogCached();
    await catalogContext(fetch, storage, locale).window.fetchCatalogCached();
  }
  assert.deepEqual(requests, ['https://example.test/catalog?lang=ru', 'https://example.test/catalog?lang=en', 'https://example.test/catalog']);
  assert.equal(cache.size, 3);
});

test('Failed and malformed catalog responses remain retryable', async () => {
  let calls = 0;
  const context = catalogContext(async () => { calls++; return calls === 1 ? { ok: false, status: 503 } : calls === 2 ? { ok: true, json: async () => ({ nope: [] }) } : { ok: true, json: async () => [product] }; });
  await assert.rejects(context.window.fetchCatalogCached(), /503/);
  await assert.rejects(context.window.fetchCatalogCached(), /Invalid catalog/);
  assert.equal((await context.window.fetchCatalogCached()).products.length, 1);
  assert.equal(calls, 3);
});

test('Catalog and product cards work with blocked storage and escape untrusted content', async () => {
  const context = catalogContext(async () => ({ ok: true, json: async () => [product] }), { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  await context.window.fetchCatalogCached();
  vm.runInContext(read('assets/js/product/card.js'), context);
  const html = context.window.createProductCardHTML({ ...product, id: "unsafe'\"", name: '<script>alert(1)</script>', images: ['javascript:alert(1)'] });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('/img/no-image.svg'));
  const unavailable = context.window.createProductCardHTML({ ...product, stockStatus: 'out_of_stock' });
  assert.match(unavailable, /<button type="button" disabled/);
  assert.equal(context.window.safeProductLink('javascript:alert(1)'), '/');
});

function orderGuardContext(fetch) {
  const store = new Map();
  const context = vm.createContext({
    window: { fetch }, Response, URL, crypto: require('node:crypto').webcrypto, console: { warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
    document: { get cookie() { return ''; }, set cookie(_) {}, getElementById() { return { style: {}, textContent: '' }; } },
    location: { hostname: 'localhost', protocol: 'http:', pathname: '/' }
  });
  vm.runInContext(read('capi.js'), context);
  return context;
}
const request = { method: 'POST', body: JSON.stringify({ name: 'Test', phone: '+995555123456', product_id: 'test-item' }) };

test('Failed order requests release the duplicate guard so a retry can succeed', async () => {
  let calls = 0;
  const context = orderGuardContext(async () => new Response('{}', { status: ++calls === 1 ? 503 : 200 }));
  assert.equal((await context.window.fetch('https://form-handler.enkaelectronics.com.ge', request)).status, 503);
  assert.equal((await context.window.fetch('https://form-handler.enkaelectronics.com.ge', request)).status, 200);
  assert.equal(calls, 2);
  assert.equal((await context.window.fetch('https://form-handler.enkaelectronics.com.ge', request)).status, 429);
  assert.equal(calls, 2);
});

test('Network errors release the order guard and allow a fresh attempt', async () => {
  let calls = 0;
  const context = orderGuardContext(async () => { if (++calls === 1) throw Error('offline'); return new Response('{}'); });
  await assert.rejects(context.window.fetch('https://form-handler.enkaelectronics.com.ge', request), /offline/);
  assert.equal((await context.window.fetch('https://form-handler.enkaelectronics.com.ge', request)).status, 200);
});

test('Explicit application errors with HTTP 200 release the order guard', async () => {
  let calls = 0;
  const context = orderGuardContext(async () => new Response(JSON.stringify(++calls === 1 ? { success: false, error: 'unavailable' } : { success: true })));
  await context.window.fetch('https://form-handler.enkaelectronics.com.ge', request);
  const response = await context.window.fetch('https://form-handler.enkaelectronics.com.ge', request);
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('Published catalog translations remain authoritative without any interface-dictionary overlay', async () => {
  const approved = { ...product, name: 'Server approved name', description: 'Server approved description', specs: { Power: '900 W' } };
  const context = catalogContext(async () => ({ ok: true, json: async () => ({ products: [approved] }) }), undefined, 'en');
  context.window.enkaI18n.product = () => { throw Error('Static catalog overlay must not run'); };
  const result = await context.window.fetchCatalogCached();
  assert.equal(result.products[0].name, approved.name);
  assert.equal(result.products[0].description, approved.description);
  assert.deepEqual(result.products[0].specs, approved.specs);
});
