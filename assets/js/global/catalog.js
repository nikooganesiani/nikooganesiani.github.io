(() => {
  'use strict';
  const TTL = 5 * 60 * 1000;
  const locale = window.enkaI18n?.locale || 'ka';
  const CACHE_KEY = 'catalogCache_v4_' + locale;
  let cached = null;
  let promise = null;

  window.productPrice = value => {
    const raw = String(value ?? '').replace(/₾/g, '').replace(/\s/g, '').replace(',', '.');
    return /^\d+(?:\.\d{1,2})?$/.test(raw) ? Number(raw) : 0;
  };
  window.productStock = value => {
    const stock = String(value || 'in_stock').trim().toLowerCase();
    if (stock === 'out_of_stock' || stock === 'მარაგი ამოიწურა') return 'out_of_stock';
    if (stock === 'soon' || stock.includes('მალე')) return 'soon';
    return ['in_stock', 'მარაგშია'].includes(stock) ? 'in_stock' : 'unavailable';
  };
  window.isProductAvailable = product => !!product && window.productStock(product.stockStatus) === 'in_stock' && window.productPrice(product.price) > 0;

  // Suggestions and the full results page must agree, including Latin model names.
  window.matchesCatalogSearch = (product, query) => {
    if (!product || window.productStock(product.stockStatus) === 'out_of_stock') return false;
    const raw = String(query || '').trim();
    if (!raw) return false;
    const lower = value => String(value ?? '').toLocaleLowerCase('ka');
    const normalize = value => window.normalizeQuery?.(value) || value;
    const text = [product.name, product.brand, product.sku, product.id].map(lower).join(' ');
    const normalizedText = normalize(text);
    const normalizedTerms = normalize(raw).split(/\s+/);
    return lower(raw).split(/\s+/).every((term, index) => text.includes(term) ||
      [normalizedTerms[index], normalize(term)].some(value => value && normalizedText.includes(value)));
  };

  window.escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  window.safeProductImage = value => {
    if (typeof value !== 'string' || !value.trim()) return '/img/no-image.svg';
    try {
      const url = new URL(value, location.origin);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '/img/no-image.svg';
    } catch { return '/img/no-image.svg'; }
  };
  window.safeProductLink = value => {
    try {
      const url = new URL(value, location.origin);
      return url.origin === location.origin && /^\/product\/[^/]+\/?$/.test(url.pathname) ? url.pathname : '/';
    } catch { return '/'; }
  };

  window.fetchCatalogCached = function() {
    if (!cached) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(CACHE_KEY));
        if (saved && Array.isArray(saved.products) && Date.now() - saved.ts < TTL) cached = saved;
      } catch { /* Storage is optional. */ }
    }
    if (cached && Date.now() - cached.ts < TTL) return Promise.resolve(cached);
    if (promise) return promise;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const url = new URL(window.CATALOG_API_URL, location.origin);
    if (['ru', 'en'].includes(locale)) url.searchParams.set('lang', locale);
    promise = fetch(url.href, { signal: controller.signal, credentials: 'omit' })
      .then(response => {
        if (!response.ok) throw new Error('Catalog HTTP ' + response.status);
        return response.json();
      })
      .then(data => {
        const products = Array.isArray(data) ? data : data?.products;
        if (!Array.isArray(products)) throw new Error('Invalid catalog');
        cached = { products: products.filter(p => p && p.id && typeof p.name === 'string'), ts: Date.now() };
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached)); } catch { /* Storage is optional. */ }
        return cached;
      })
      .finally(() => { clearTimeout(timer); promise = null; });
    return promise;
  };
})();
