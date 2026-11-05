const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../_site');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const footerOf = value => value.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0];
const sharedFooter = footerOf(html);
function verifyHeader(value, label) {
  const stylesheets = [...value.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(stylesheets, ['/assets/css/style.css'], label + ': one compiled Tailwind stylesheet');
  assert.ok(!/<style\b/i.test(value), label + ': no inline CSS overlays');
  assert.equal((value.match(/id="site-header"/g) || []).length, 1, label + ': one shared header');
  const header = value.match(/<header class="site-header"[\s\S]*?<\/header>/)?.[0];
  assert.ok(header, label + ': shared header markup');
  assert.match(header, /<form[^>]+role="search"[^>]+action="\/search\/"[^>]+method="get"/, label + ': native search navigation');
  assert.match(header, /<input[^>]+name="result"[^>]+id="searchInput"/, label + ': named search field');
  assert.match(header, /href="tel:\+995551178990"/, label + ': direct contact');
  assert.equal((value.match(/src="\/assets\/js\/global\/header.js"/g) || []).length, 1, label + ': one header controller');
  assert.equal((value.match(/data-language-picker\b/g) || []).length, 2, label + ': language selection in header and footer');
  assert.equal((value.match(/src="\/assets\/js\/global\/languages.js"/g) || []).length, 1, label + ': one shared translation controller');
  assert.equal((value.match(/id="site-translation-engine"/g) || []).length, 1, label + ': one translation engine');
  assert.ok(!value.includes('translate.google.com/translate?'), label + ': forms remain on the store origin');
}
verifyHeader(html, 'Homepage');
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
for (const forbidden of ['admin', 'node_modules', 'scripts', 'tests', 'vendor', '.local', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
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
  verifyHeader(productHtml, label);
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
  verifyHeader(pageHtml, page);
  assert.equal(footerOf(pageHtml), sharedFooter, page + ': footer must match the shared homepage footer');
  assert.ok(pageHtml.includes('class="site-breadcrumbs"'), page + ': shared breadcrumbs');
  assert.equal((pageHtml.match(/src="\/assets\/js\/global\/breadcrumbs.js"/g) || []).length, 1, page + ': one shared breadcrumb renderer');
  assert.ok(!/{%|{{/.test(pageHtml), page + ': rendered Liquid');
  assert.equal((pageHtml.match(/<h1\b/g) || []).length, 1, page + ': one h1');
  const listingIds = [...pageHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(listingIds).size, listingIds.length, page + ': unique IDs');
  const listingScripts = [...pageHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(listingScripts).size, listingScripts.length, page + ': unique scripts');
  assert.ok(listingScripts.includes('/assets/js/main/catalog-listing.js'), page + ': shared listing controller');
  assert.ok(listingScripts.includes('/assets/js/main/' + page + 'page.js'), page + ': correct page entry');
  assert.ok(!listingScripts.includes('/assets/js/main/' + (page === 'search' ? 'category' : 'search') + 'page.js'), page + ': no unrelated page controller');
  assert.match(pageHtml, /id="listingStatus"[^>]+role="status"/, page + ': announced results');
  assert.match(pageHtml, /id="sortSelect" class="listing-control"/, page + ': native sorting');
  assert.match(pageHtml, /id="mobileFilterModal" class="modal hidden" role="dialog" aria-labelledby="mobileFilterTitle"/, page + ': shared filter dialog');
  for (const id of ['minPrice', 'maxPrice', 'mobileMinPrice', 'mobileMaxPrice', 'sortSelect']) assert.ok(pageHtml.includes('for="' + id + '"'), page + ': label for ' + id);
  for (const id of ['minPrice', 'maxPrice', 'mobileMinPrice', 'mobileMaxPrice']) assert.match(pageHtml, new RegExp('<input id="' + id + '"[^>]+inputmode="numeric"[^>]+step="1"'), page + ': whole lari input ' + id);
  assert.match(pageHtml, new RegExp('rel="canonical" href="https://enkaelectronics.com.ge/' + page + '/"'), page + ': canonical URL');
  assert.ok(pageHtml.match(/<meta name="description" content="([^"]+)"/)?.[1].length > 60, page + ': useful description');
  if (page === 'search') {
    assert.match(pageHtml, /<meta name="robots" content="noindex, follow">/, page + ': search excluded from indexing');
    assert.ok(!fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').includes('/search/'), page + ': search excluded from sitemap');
    assert.match(pageHtml, /id="listingSearchInput" type="search" name="result"/, page + ': local search form');
  } else assert.match(pageHtml, /<noscript>[\s\S]*class="product-card"/, page + ': usable catalog without JavaScript');
  for (const [, resource] of pageHtml.matchAll(/(?:href|src)="(\/(?!\/)[^"#]*)"/g)) {
    const target = path.join(root, decodeURIComponent(resource.split('?')[0] || '/'));
    assert.ok([target, target + '.html', path.join(target, 'index.html')].some(candidate => fs.existsSync(candidate)), page + ': missing local resource ' + resource);
  }
}
assert.ok(!html.includes('/assets/js/main/catalog-listing.js'), 'Homepage must not load listing controllers');
console.log('Shared footer and breadcrumbs verified on product, category and search pages.');
const infoDescriptions = new Set();
for (const page of ['about', 'contacts', 'delivery', 'warranty', 'privacy']) {
  const value = fs.readFileSync(path.join(root, 'info', page + '.html'), 'utf8');
  const label = 'Info ' + page;
  verifyHeader(value, label);
  assert.ok(!/{%|{{/.test(value), label + ': rendered Liquid');
  assert.equal((value.match(/<h1\b/g) || []).length, 1, label + ': one h1');
  const infoIds = [...value.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(infoIds).size, infoIds.length, label + ': unique IDs');
  const infoScripts = [...value.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(infoScripts).size, infoScripts.length, label + ': unique scripts');
  assert.ok(infoScripts.indexOf('/assets/js/global/privacy.js') < infoScripts.indexOf('/capi.js'), label + ': consent loads before analytics');
  assert.match(value, /href="\/assets\/css\/style.css"/, label + ': shared Tailwind stylesheet');
  assert.ok(!/href="\/assets\/css\/(?:info|product)\.css"/.test(value), label + ': no standalone component stylesheet');
  assert.match(value, /class="site-breadcrumbs"/, label + ': shared breadcrumbs');
  const nav = value.match(/<nav class="info-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.equal((nav?.match(/aria-current="page"/g) || []).length, 1, label + ': one active information link');
  assert.match(nav, new RegExp('href="/info/' + page + '" aria-current="page"'), label + ': correct active page');
  const description = value.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert.ok(description?.length > 40, label + ': useful description');
  assert.ok(!infoDescriptions.has(description), label + ': distinct description');
  infoDescriptions.add(description);
  assert.match(value, new RegExp('rel="canonical" href="https://enkaelectronics.com.ge/info/' + page + '\\.html"'), label + ': preserved canonical URL');
  for (const [, href] of value.matchAll(/(?:href|src)="(\/(?!\/)[^"]*)"/g)) {
    const url = new URL(href.replace(/&amp;/g, '&'), 'https://enkaelectronics.com.ge');
    const target = path.join(root, decodeURIComponent(url.pathname));
    const resolved = [target, target + '.html', path.join(target, 'index.html')].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
    assert.ok(resolved, label + ': missing resource ' + href);
    if (url.hash) assert.ok(fs.readFileSync(resolved, 'utf8').includes('id="' + url.hash.slice(1) + '"'), label + ': missing anchor ' + href);
  }
  for (const [, fragment] of value.matchAll(/href="#([^"]+)"/g)) assert.ok(infoIds.includes(fragment), label + ': missing in-page anchor ' + fragment);
  for (const [, attributes] of value.matchAll(/<a\b([^>]*target="_blank"[^>]*)>/g)) assert.match(attributes, /rel="noopener noreferrer"/, label + ': safe external link');
}
console.log('All five information pages verified: metadata, navigation, unique IDs/scripts, local resources, anchors and download.');
console.log('Shared header and native search verified on homepage, all products, category, search and information pages.');
