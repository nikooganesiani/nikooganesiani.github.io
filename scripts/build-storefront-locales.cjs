const fs = require('node:fs');
const path = require('node:path');
const { editCatalogProduct, hasGeorgian } = require('../assets/js/global/catalog-editorial.js');

const locales = ['ru', 'en'];
const catalogURL = 'https://api.enkaelectronics.com.ge/catalog';
const revisionsAgree = (base, localized) =>
  base._enkaPublication?.revision === localized._enkaPublication?.revision &&
  base._enkaPublication?.releaseKey === localized._enkaPublication?.releaseKey;

async function fetchPublishedCatalog() {
  async function request(query) {
    const response = await fetch(catalogURL + query, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Catalog HTTP ' + response.status + ' for ' + query);
    return response.json();
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const [data, ru, en] = await Promise.all([request('?include=blog'), request('?lang=ru'), request('?lang=en')]);
    if (revisionsAgree(data, ru) && revisionsAgree(data, en)) return { data, translations: { ru, en } };
  }
  throw new Error('The published catalog changed while fetching its language versions.');
}

function buildStorefrontLocales(root, base, translations, products, productFrontMatter) {
  const localized = {};
  if (!fs.existsSync(path.join(root, 'index.html'))) return localized;
  const editorial = JSON.parse(fs.readFileSync(path.join(root, '_data/catalog_editorial.json'), 'utf8'));
  const directory = path.join(root, '_pages/generated-storefront');
  const files = new Map();
  localized.ka = Object.fromEntries(products.map(product => [product.id, { name: product.name }]));
  const sources = [
    ['index.html', '/'],
    ['_pages/category.html', '/category/'],
    ['_pages/search.html', '/search/'],
    ...fs.readdirSync(path.join(root, 'info')).filter(file => file.endsWith('.html')).map(file => ['info/' + file, '/info/' + path.basename(file, '.html')])
  ];
  const categories = path.join(root, '_pages/generated-categories');
  if (fs.existsSync(categories)) {
    for (const file of fs.readdirSync(categories).filter(file => file.endsWith('.html'))) {
      const source = path.join('_pages/generated-categories', file);
      const header = fs.readFileSync(path.join(root, source), 'utf8').split(/^---\s*$/m)[1];
      const route = header?.match(/^permalink: (\/\S+)$/m)?.[1]?.trim();
      if (route && !/^canonical_path:/m.test(header)) sources.push([source, route]);
    }
  }
  for (const locale of locales) {
    for (const [file, route] of sources) {
      const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
      const permalink = '/' + locale + route;
      files.set(locale + '-' + file.replace(/[\\/]/g, '-'), source.replace(/^---\n([\s\S]*?)\n---\n/, (_, header) =>
        '---\n' + header.replace(/^permalink:.*\n?/m, '').replace(/^generated:.*\n?/m, '') +
        '\ngenerated: true\nstorefront_locale: ' + locale + '\npermalink: ' + permalink + '\n---\n'));
    }
    const published = translations[locale];
    if (published && (!revisionsAgree(base, published) || !Array.isArray(published.products))) {
      throw new Error('Invalid or mismatched ' + locale + ' catalog snapshot');
    }
    const byId = new Map(published?.products.map(product => [product.id, product]));
    if (published && (byId.size !== published.products.length || byId.size !== products.length || products.some(product => !byId.has(product.id)))) {
      throw new Error('Product IDs do not match in the ' + locale + ' catalog snapshot');
    }
    localized[locale] = {};
    for (const baseProduct of products) {
      if (!byId.has(baseProduct.id)) continue;
      const product = editCatalogProduct(byId.get(baseProduct.id), editorial, locale);
      if (!product.name?.trim() || hasGeorgian(product)) continue;
      const route = '/' + locale + '/product/' + product.id + '/';
      // Price, stock and product identity come from the same base used by the Georgian store.
      const { name, description, longDescription, warranty, specs } = product;
      files.set(locale + '-product-' + product.id + '.html', productFrontMatter(
        { ...baseProduct, name, description, longDescription, warranty, specs }, { permalink: route, storefront_locale: locale }
      ));
      localized[locale][product.id] = { name, url: route };
    }
    console.log('Localized ' + locale + ' product pages: ' + Object.keys(localized[locale]).length + '/' + products.length);
  }
  fs.mkdirSync(directory, { recursive: true });
  for (const [file, contents] of files) fs.writeFileSync(path.join(directory, file), contents);
  for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!file.isFile() || files.has(file.name) || !file.name.endsWith('.html')) continue;
    const target = path.join(directory, file.name);
    const frontMatter = fs.readFileSync(target, 'utf8').split(/^---\s*$/m)[1];
    if (/^generated: true\s*$/m.test(frontMatter || '')) fs.unlinkSync(target);
  }
  fs.writeFileSync(path.join(root, '_data/storefront_products.json'), JSON.stringify(localized));
  return localized;
}

module.exports = { buildStorefrontLocales, fetchPublishedCatalog };
