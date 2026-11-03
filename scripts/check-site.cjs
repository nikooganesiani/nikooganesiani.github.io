const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../_site');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const footerOf = value => value.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
const sharedFooter = footerOf(html);
assert.ok(sharedFooter?.includes('class="site-footer"'), 'Homepage must use the shared footer');
assert.ok(!/{%|{{/.test(html), 'Unrendered Liquid on homepage');
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'Homepage needs one h1');
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(scripts).size, scripts.length, 'Duplicate scripts');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate DOM IDs');
let checked = 0;
for (const [, resource] of html.matchAll(/(?:href|src)="(\/(?!\/)[^"#]*)"/g)) {
  let resourcePath = resource.split('?')[0];
  if (!resourcePath) resourcePath = '/';
  const file = path.join(root, decodeURIComponent(resourcePath));
  assert.ok([file, file + '.html', path.join(file, 'index.html')].some(candidate => fs.existsSync(candidate)), 'Missing homepage resource: ' + resource);
  checked++;
}
assert.ok((html.match(/class="product-card(?:\s|")/g) || []).length > 0, 'Popular products need a server-rendered fallback');
assert.ok(!html.includes('Halloween'), 'Outdated promo campaign on homepage');
for (const forbidden of ['node_modules', 'scripts', 'tests', 'vendor', '.local', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
  assert.ok(!fs.existsSync(path.join(root, forbidden)), 'Development file published: ' + forbidden);
}
console.log('Homepage artifact verified: ' + checked + ' local references, unique scripts and IDs, rendered product fallback.');

const productsDir = path.join(root, 'product');
let productCount = 0;
for (const entry of fs.readdirSync(productsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(productsDir, entry.name, 'index.html');
  const productHtml = fs.readFileSync(file, 'utf8');
  const label = 'Product ' + entry.name + ': ';
  assert.equal(footerOf(productHtml), sharedFooter, label + 'footer must match the shared homepage footer');
  assert.ok(productHtml.includes('class="site-breadcrumbs"'), label + 'shared breadcrumbs');
  assert.ok(!/{%|{{/.test(productHtml), label + 'unrendered Liquid');
  assert.equal((productHtml.match(/<h1\b/g) || []).length, 1, label + 'needs one h1');
  const productIds = [...productHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(productIds).size, productIds.length, label + 'duplicate DOM IDs');
  const productScripts = [...productHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(productScripts).size, productScripts.length, label + 'duplicate scripts');
  const head = productHtml.match(/<head>[\s\S]*?<\/head>/)?.[0];
  for (const property of ['og:title', 'og:type', 'og:image', 'og:url']) assert.equal((head.match(new RegExp('property="' + property + '"', 'g')) || []).length, 1, label + property + ' must be unique in head');
  assert.match(head, /property="og:type" content="product"/, label + 'product social metadata');
  assert.match(head, /rel="preload" as="image"/, label + 'preload primary image in head');
  const schema = JSON.parse(productHtml.match(/<script type="application\/ld\+json" id="productSchema">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema['@type'], 'Product', label + 'product schema');
  assert.ok(schema.name && schema.sku, label + 'schema identity');
  assert.ok(schema.image.length && schema.image.every(img => /^https?:\/\//.test(img) && !img.includes('youtube.com')), label + 'schema photo URLs');
  if (schema.offers) {
    assert.ok(Number(schema.offers.price) > 0, label + 'positive offer price');
    assert.equal(schema.offers.priceCurrency, 'GEL');
    const stock = productHtml.match(/id="productData"[^>]+data-stock="([^"]*)"/)?.[1];
    const canBuy = stock === 'in_stock' || stock === 'მარაგშია';
    assert.equal(schema.offers.availability, 'https://schema.org/' + (canBuy ? 'InStock' : 'OutOfStock'), label + 'availability matches purchase state');
  }
  for (const id of ['inlineName', 'inlinePhone', 'inlineOrderError', 'submitInlineOrderBtn', 'productAvailability', 'imageZoomModal']) assert.ok(productIds.includes(id), label + 'missing ' + id);
  assert.match(productHtml, /<label for="inlineName"/, label + 'name label');
  assert.match(productHtml, /<label for="inlinePhone"/, label + 'phone label');
  assert.ok(!productHtml.includes('/img/no-image.png'), label + 'broken fallback image');
  for (const [, resource] of productHtml.matchAll(/(?:href|src)="(\/(?!\/)[^"#]*)"/g)) {
    const localPath = decodeURIComponent(resource.split('?')[0] || '/');
    const target = path.join(root, localPath);
    assert.ok([target, target + '.html', path.join(target, 'index.html')].some(candidate => fs.existsSync(candidate)), label + 'missing local resource ' + resource);
  }
  productCount++;
}
assert.ok(productCount > 0, 'No product pages built');
console.log('Verified ' + productCount + ' product pages: metadata, schema, availability, forms, unique scripts/IDs and local links.');
for (const page of ['category', 'search']) {
  const pageHtml = fs.readFileSync(path.join(root, page, 'index.html'), 'utf8');
  assert.equal(footerOf(pageHtml), sharedFooter, page + ': footer must match the shared homepage footer');
  assert.ok(pageHtml.includes('class="site-breadcrumbs"'), page + ': shared breadcrumbs');
  assert.equal((pageHtml.match(/src="\/assets\/js\/global\/breadcrumbs.js"/g) || []).length, 1, page + ': one shared breadcrumb renderer');
}
console.log('Shared footer and breadcrumbs verified on product, category and search pages.');
