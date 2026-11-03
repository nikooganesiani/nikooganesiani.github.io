(() => {
  'use strict';
  const TTL = 5 * 60 * 1000;
  const CACHE_KEY = 'catalogCache_v2';
  let cached = null;
  let promise = null;

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
    promise = fetch(window.CATALOG_API_URL, { signal: controller.signal, credentials: 'omit' })
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
