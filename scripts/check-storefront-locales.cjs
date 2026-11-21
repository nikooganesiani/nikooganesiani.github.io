const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse, parseFragment } = require('parse5');
const georgian = /[\u10a0-\u10ff\u1c90-\u1cbf]/u;

const attribute = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
function* elements(node) {
  yield node;
  for (const child of node.childNodes || []) yield* elements(child);
}
const content = node => [...elements(node)].filter(child => child.nodeName === '#text').map(child => child.value).join('').trim();

function checkStorefrontLocales(root = '_site') {
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const indexed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]));
  const heads = new Map();
  const origin = 'https://enkaelectronics.com.ge';
  const available = new Set(fs.readdirSync(root, { recursive: true }).map(file => file.split(path.sep).join('/')));
  const fileFor = route => route.slice(1) + (route.endsWith('/') ? 'index.html' : '.html');
  function metadata(route) {
    if (heads.has(route)) return heads.get(route);
    assert.ok(available.has(fileFor(route)), 'Language link leads to a missing page: ' + route);
    const html = fs.readFileSync(path.join(root, fileFor(route)), 'utf8');
    const nodes = [...elements(parse(html.slice(0, html.indexOf('</head>') + 7)))];
    const canonical = nodes.find(node => attribute(node, 'rel') === 'canonical');
    const robots = nodes.find(node => attribute(node, 'name') === 'robots');
    const alternates = Object.fromEntries(nodes.filter(node => node.tagName === 'link' && attribute(node, 'hreflang'))
      .map(node => [attribute(node, 'hreflang'), attribute(node, 'href')]));
    const meta = {
      locale: attribute(nodes.find(node => node.tagName === 'html'), 'lang'),
      canonical: attribute(canonical, 'href'),
      noindex: /\bnoindex\b/i.test(attribute(robots, 'content') || ''),
      title: content(nodes.find(node => node.tagName === 'title') || {}),
      description: attribute(nodes.find(node => attribute(node, 'name') === 'description'), 'content'),
      alternates
    };
    heads.set(route, meta);
    return meta;
  }
  const totals = { ru: 0, en: 0 };
  for (const file of available) {
    const locale = file.match(/^(ru|en)\/.*\.html$/)?.[1];
    if (!locale) continue;
    const route = '/' + file.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    const url = origin + route;
    const page = metadata(route);
    assert.equal(page.locale, locale, route);
    assert.equal(page.canonical, url, route + ' canonical');
    assert.ok(page.title && page.description && !georgian.test(page.title + page.description), route + ' localized title and description');
    assert.equal(indexed.has(url), !page.noindex, route + ' sitemap entry matches robots');
    if (page.noindex) continue;
    totals[locale]++;
    assert.equal(page.alternates[locale], url, route + ' self hreflang');
    assert.ok(page.alternates.ka, route + ' Georgian counterpart');
    assert.equal(page.alternates['x-default'], page.alternates.ka, route + ' x-default');
    for (const [language, alternate] of Object.entries(page.alternates)) {
      if (language === 'x-default') continue;
      const target = new URL(alternate);
      assert.equal(target.origin, origin, route + ' alternate origin');
      const other = metadata(target.pathname);
      assert.equal(other.locale, language, route + ' alternate language');
      assert.equal(other.alternates[locale], url, route + ' return hreflang');
      assert.equal(other.canonical, alternate, route + ' alternate canonical');
    }
    if (!route.startsWith('/' + locale + '/product/')) continue;
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const heading = html.match(/<h1 data-product-name>([\s\S]*?)<\/h1>/)?.[1];
    const schema = JSON.parse(html.match(/id="productSchema">([\s\S]*?)<\/script>/)?.[1]);
    assert.equal(content(parseFragment(heading || '')), schema.name, route + ' product heading and structured name');
    assert.ok(!/\.html$/.test(schema.name) && !georgian.test(schema.name + schema.description), route + ' localized product content');
    if (schema.offers) assert.equal(schema.offers.url, url, route + ' offer URL');
    assert.doesNotMatch(html, /<dt>\s*(?:власть|food source)\s*<\/dt>/iu, route + ' appliance terminology');
  }
  for (const [locale, total] of Object.entries(totals)) {
    assert.ok(total > 0, 'Missing indexable ' + locale + ' storefront');
    const html = fs.readFileSync(path.join(root, locale, 'index.html'), 'utf8');
    assert.match(html, new RegExp('href="/' + locale + '/info/about"'), locale + ' localized footer links');
    const search = metadata('/' + locale + '/search/');
    assert.ok(search.noindex, locale + ' search stays out of the index');
  }
  console.log('Localized SEO verified for ' + totals.ru + ' Russian and ' + totals.en + ' English indexable pages.');
}

module.exports = { checkStorefrontLocales };
if (require.main === module) checkStorefrontLocales();
