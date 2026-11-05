import { localizedProduct } from '../public/model.js';

export async function readPublishedCatalog(getJson, locale = 'ka', fallback) {
  const catalog = await getJson('catalog') || fallback || { products: [] };
  const pointer = catalog._enkaPublication;
  if (!['ru', 'en'].includes(locale) || !pointer || !/^catalog:release:[a-f0-9-]+$/.test(pointer.releaseKey)) return catalog;
  let release;
  try { release = await getJson(pointer.releaseKey); } catch { /* Georgian source is always a usable fallback. */ }
  if (release?.revision !== pointer.revision || !release.document) return catalog;
  // Current base data stays authoritative even after a manual legacy KV edit.
  // Per-field source comparison prevents reusing stale approved translations.
  return { ...catalog, products: catalog.products.map(product => localizedProduct(release.document, product, locale)) };
}
