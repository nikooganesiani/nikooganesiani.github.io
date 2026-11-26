const fs = require('node:fs');
const path = require('node:path');
const { buildLocalizations } = require('./scripts/build-localizations.cjs');
const { buildStoreContent } = require('./scripts/build-store-content.cjs');
const { buildBlog } = require('./scripts/build-blog.cjs');
const { buildStorefrontLocales, fetchPublishedCatalog } = require('./scripts/build-storefront-locales.cjs');
require('./admin/public/card-images.js');

function parsePrice(value) {
  const raw = String(value ?? '').replace(/₾/g, '').replace(/\s/g, '').replace(',', '.');
  return /^\d+(?:\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
}

function normalizeStock(value) {
  const stock = String(value || 'in_stock').trim().toLowerCase();
  if (stock === 'out_of_stock' || stock === 'მარაგი ამოიწურა') return 'out_of_stock';
  if (stock === 'soon' || stock.includes('მალე')) return 'soon';
  return ['in_stock', 'მარაგშია'].includes(stock) ? 'in_stock' : 'unavailable';
}

function normalizeMedia(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, 'https://enkaelectronics.com.ge');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname)) {
      const id = url.hostname.endsWith('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      return /^[\w-]{11}$/.test(id || '') ? 'https://www.youtube.com/watch?v=' + id : null;
    }
    return url.href;
  } catch { return null; }
}

function normalizeCatalog(data) {
  const products = Array.isArray(data) ? data : data?.products;
  if (!Array.isArray(products) || !products.length) throw new Error('Catalog must contain products; refusing to build an empty shop.');
  const seen = new Set();
  for (const product of products) {
    if (!product || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(String(product.id || ''))) throw new Error('Invalid product ID.');
    if (seen.has(String(product.id))) throw new Error('Duplicate product ID: ' + product.id);
    if (typeof product.name !== 'string' || !product.name.trim()) throw new Error('Product name is required: ' + product.id);
    if (!Number.isFinite(parsePrice(product.price))) throw new Error('Invalid product price: ' + product.id);
    seen.add(String(product.id));
  }
  return products;
}

function productFrontMatter(product, page = {}) {
  const rawImages = Array.isArray(product.images) ? product.images : [product.image];
  const cardImages = globalThis.EnkaCardImages;
  const cardSrcsets = Object.fromEntries(rawImages.flatMap(source => {
    const normalized = normalizeMedia(source);
    const candidates = cardImages.srcset(source, product.cardImages?.[source]);
    return normalized && candidates ? [[normalized, candidates]] : [];
  }));
  // JSON is valid YAML and safely preserves quotes, newlines and Georgian text.
  const metadata = {
    generated: true,
    layout: 'product',
    id: product.id,
    product_id: product.id,
    sku: product.sku || product.id,
    name: product.name,
    product_name: product.name,
    title: product.name,
    brand: product.brand || 'ENKA Electronics',
    price: String(parsePrice(product.price)),
    oldPrice: parsePrice(product.oldPrice) > parsePrice(product.price) ? String(parsePrice(product.oldPrice)) : '',
    stockStatus: normalizeStock(product.stockStatus),
    images: [...new Set(rawImages.map(normalizeMedia).filter(Boolean))],
    ...(Object.keys(cardSrcsets).length ? { card_srcsets: cardSrcsets, card_image_sizes: cardImages.sizes } : {}),
    specs: product.specs && typeof product.specs === 'object' ? product.specs : {},
    description: product.description || '',
    longDescription: product.longDescription || product.description || '',
    warranty: product.warranty || '',
    categories: Array.isArray(product.categories) ? product.categories.filter(value => typeof value === 'string') : [],
    subcategories: Array.isArray(product.subcategories) ? product.subcategories.filter(value => typeof value === 'string') : [],
    ...page
  };
  return '---\n' + Object.entries(metadata).map(([key, value]) => key + ': ' + JSON.stringify(value)).join('\n') + '\n---\n';
}

async function generatePages({ catalogFile, localeFiles = {}, root = process.cwd() } = {}) {
  let data;
  let translations;
  if (catalogFile) {
    data = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
    translations = Object.fromEntries(Object.entries(localeFiles).filter(([, file]) => file)
      .map(([locale, file]) => [locale, JSON.parse(fs.readFileSync(file, 'utf8'))]));
  } else ({ data, translations } = await fetchPublishedCatalog());
  normalizeCatalog(data);
  if (data._enkaPublication?.blog && !Array.isArray(data._enkaBlog)) throw new Error('Published blog is missing. Use the blog-enabled catalog API or a published Studio export.');
  const products = await buildStoreContent(data, root);
  const localizedProducts = buildStorefrontLocales(root, data, translations, products, productFrontMatter);
  await buildBlog(data._enkaBlog, products, root, localizedProducts);
  buildLocalizations(root);
  const productsDir = path.join(root, '_products');
  fs.mkdirSync(productsDir, { recursive: true });
  for (const product of products) fs.writeFileSync(path.join(productsDir, product.id + '.md'), productFrontMatter(product));
  const current = new Set(products.map(product => product.id + '.md'));
  for (const file of fs.readdirSync(productsDir)) {
    if (!file.endsWith('.md') || current.has(file)) continue;
    const fullPath = path.join(productsDir, file);
    if (/^---\r?\ngenerated: true\r?\n/.test(fs.readFileSync(fullPath, 'utf8'))) fs.unlinkSync(fullPath);
  }
  console.log('Generated ' + products.length + ' product pages.');
  return products;
}

module.exports = { normalizeCatalog, productFrontMatter, generatePages, parsePrice, normalizeStock, normalizeMedia };
if (require.main === module) {
  const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
  generatePages({ catalogFile: option('--catalog-file'), localeFiles: { ru: option('--catalog-ru'), en: option('--catalog-en') } })
    .then(async products => { await require('./scripts/build-category-photo-masks.cjs').buildCategoryPhotoMasks(products); return products; })
    .then(products => require('./scripts/build-photo-index.cjs').buildPhotoIndex(products, require('sharp')))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
