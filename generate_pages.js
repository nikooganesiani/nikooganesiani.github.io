const fs = require('node:fs');
const path = require('node:path');
const { buildLocalizations } = require('./scripts/build-localizations.cjs');

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

function productFrontMatter(product) {
  // JSON is valid YAML and safely preserves quotes, newlines and Georgian text.
  const metadata = {
    generated: true,
    layout: 'product',
    id: product.id,
    product_id: product.id,
    sku: product.sku || product.id,
    name: product.name,
    title: product.name,
    brand: product.brand || 'ENKA Electronics',
    price: String(parsePrice(product.price)),
    oldPrice: parsePrice(product.oldPrice) > parsePrice(product.price) ? String(parsePrice(product.oldPrice)) : '',
    stockStatus: normalizeStock(product.stockStatus),
    images: [...new Set((Array.isArray(product.images) ? product.images : [product.image]).map(normalizeMedia).filter(Boolean))],
    specs: product.specs && typeof product.specs === 'object' ? product.specs : {},
    description: product.description || '',
    longDescription: product.longDescription || product.description || '',
    warranty: product.warranty || '',
    categories: Array.isArray(product.categories) ? product.categories.filter(value => typeof value === 'string') : [],
    subcategories: Array.isArray(product.subcategories) ? product.subcategories.filter(value => typeof value === 'string') : []
  };
  return '---\n' + Object.entries(metadata).map(([key, value]) => key + ': ' + JSON.stringify(value)).join('\n') + '\n---\n';
}

async function generatePages({ catalogFile, root = process.cwd() } = {}) {
  let data;
  if (catalogFile) data = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  else {
    const response = await fetch('https://api.enkaelectronics.com.ge/catalog', { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Catalog HTTP ' + response.status);
    data = await response.json();
  }
  const products = normalizeCatalog(data);
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
}

module.exports = { normalizeCatalog, productFrontMatter, generatePages, parsePrice, normalizeStock, normalizeMedia };
if (require.main === module) {
  const flag = process.argv.indexOf('--catalog-file');
  generatePages({ catalogFile: flag >= 0 ? process.argv[flag + 1] : undefined }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
