// Optional replacement for catalog-api AFTER the staging checks and backup.
// All mutations go through the authenticated admin Writer; this Worker is read-only.
import { readPublishedCatalog } from './server/published.mjs';
import { stockOf, priceOf } from './public/model.js';

const xml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
export function feed(catalog, site) {
  const items = catalog.products.map(product => {
    const price = priceOf(product.price); const old = priceOf(product.oldPrice); const discount = Number.isFinite(old) && old > price;
    const photos = (product.images || []).filter(image => /^https:\/\//.test(image) && !/youtu\.?be/.test(image));
    const stock = stockOf(product);
    const available = stock === 'in_stock' || stock === 'მარაგშია';
    const tags = { id: product.id, title: product.name, description: product.description || '', link: `${site}/product/${encodeURIComponent(product.id)}/`, image_link: photos[0] || '', price: `${(discount ? old : price).toFixed(2)} GEL`, availability: available ? 'in_stock' : 'out_of_stock', condition: 'new', brand: product.brand || '', mpn: product.sku || product.id };
    if (discount) tags.sale_price = price.toFixed(2) + ' GEL';
    return '<item>' + Object.entries(tags).map(([key, value]) => `<g:${key}>${xml(value)}</g:${key}>`).join('') + photos.slice(1, 11).map(image => `<g:additional_image_link>${xml(image)}</g:additional_image_link>`).join('') + '</item>';
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>ENKA Electronics</title><link>${xml(site)}</link><description>ENKA product feed</description>${items}</channel></rss>`;
}
export default {
  async fetch(request, env) {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=30' };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (!['GET', 'HEAD'].includes(request.method)) return Response.json({ error: 'Изменение каталога перенесено в новую защищённую админку.' }, { status: 405, headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' } });
    const url = new URL(request.url);
    if (!['/catalog', '/v1/feed.xml'].includes(url.pathname)) return Response.json({ error: 'Not Found' }, { status: 404, headers });
    try {
      const locale = ['ru', 'en'].includes(url.searchParams.get('lang')) ? url.searchParams.get('lang') : 'ka';
      const catalog = await readPublishedCatalog(key => env.CATALOG_KV.get(key, { type: 'json' }), locale);
      if (!Array.isArray(catalog.products)) throw Error('Invalid catalog');
      if (url.pathname === '/catalog') return new Response(request.method === 'HEAD' ? null : JSON.stringify(catalog), { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
      return new Response(request.method === 'HEAD' ? null : feed(catalog, (env.STOREFRONT_BASE || 'https://enkaelectronics.com.ge').replace(/\/$/, '')), { headers: { ...headers, 'Content-Type': 'application/xml; charset=utf-8' } });
    } catch { return Response.json({ error: 'Каталог временно недоступен.' }, { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } }); }
  }
};
