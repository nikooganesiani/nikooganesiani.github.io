/* Content-based ranking. Scores are relevance signals, not calibrated click probabilities. */
((root, factory) => {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.enkaRecommendationEngine = engine;
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';
  const DAY = 86400000;
  const WEIGHTS = { view: 3, engaged: 6, click: 4, favorite: 10, category: 2, search: 3, purchase: 8 };
  const values = value => (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).map(String);
  const price = value => Number(String(value ?? '').replace(/₾|\s/g, '').replace(',', '.')) || 0;
  const idOf = product => String(product.id);
  const categories = product => values(product.categories);
  const subs = product => values(product.subcategories);
  const available = product => product && product.id && price(product.price) > 0 &&
    ['in_stock', 'მარაგშია'].includes(String(product.stockStatus || 'in_stock').trim().toLowerCase());
  const decay = (at, now, halfLife = 14) => Math.pow(0.5, Math.max(0, now - at) / (halfLife * DAY));
  function hash(value) {
    let result = 2166136261;
    for (const char of String(value)) result = Math.imul(result ^ char.codePointAt(0), 16777619);
    return result >>> 0;
  }
  function rank(catalog, profile = {}, options = {}) {
    const now = options.now ?? Date.now();
    const unique = new Map();
    for (const product of catalog || []) if (available(product) && !unique.has(idOf(product))) unique.set(idOf(product), product);
    const all = [...unique.values()];
    const lookup = new Map((catalog || []).filter(p => p?.id).map(p => [idOf(p), p]));
    const interests = new Map();
    const evidence = new Map();
    const seeds = [];
    const hidden = new Set(values(profile.hidden));
    const purchased = new Set();
    function add(key, weight, reason) {
      interests.set(key, Math.min(60, (interests.get(key) || 0) + weight));
      if (!evidence.has(key) || reason.type === 'chosen') evidence.set(key, reason);
    }
    function seed(product, weight, type) {
      if (!product) return;
      categories(product).forEach(key => add('category:' + key, weight * 0.45, { type, key: 'category:' + key }));
      subs(product).forEach(key => add('sub:' + key, weight, { type, key: 'sub:' + key }));
      seeds.push({ product, weight, type });
    }
    for (const key of values(profile.interests)) {
      if (!/^(category|sub):[\w-]+$/.test(key)) continue;
      add(key, key.startsWith('sub:') ? 48 : 24, { type: 'chosen', key });
      if (key.startsWith('sub:')) {
        const parents = new Set((catalog || []).filter(p => p && subs(p).includes(key.slice(4))).flatMap(categories));
        parents.forEach(parent => add('category:' + parent, 14, { type: 'chosen', key }));
      }
    }
    // A current favorite is stronger than an incidental view; removing it removes its signal.
    for (const id of values(profile.favorites).slice(0, 100)) seed(lookup.get(id), WEIGHTS.favorite, 'favorite');
    // Context belongs to this navigation only; it is never added to the stored behavioral profile.
    for (const ref of values(options.context).slice(0, 3)) {
      if (/^(category|sub):[\w-]+$/.test(ref)) add(ref, 8, { type: 'context', key: ref });
      else seed(lookup.get(ref), 8, 'context');
    }
    for (const event of (profile.events || []).slice(-240)) {
      if (!event || !WEIGHTS[event.kind] || !Number.isFinite(event.at) || event.at > now || now - event.at > 90 * DAY) continue;
      const weight = WEIGHTS[event.kind] * decay(event.at, now);
      if (event.kind === 'purchase') purchased.add(event.ref);
      if (event.ref?.startsWith('category:') || event.ref?.startsWith('sub:')) {
        add(event.ref, weight, { type: event.kind === 'search' ? 'search' : 'browse', key: event.ref });
      } else seed(lookup.get(event.ref), weight, event.kind === 'search' ? 'search' : 'browse');
    }
    const popular = new Set(values(options.popular));
    return all.filter(product => !hidden.has(idOf(product)) && !purchased.has(idOf(product))).map(product => {
      const signals = [...categories(product).map(key => 'category:' + key), ...subs(product).map(key => 'sub:' + key)]
        .map(key => ({ key, value: interests.get(key) || 0 })).sort((a, b) => b.value - a.value);
      const strongest = signals[0];
      let score = (strongest?.value || 0) + signals.slice(1).reduce((sum, signal) => sum + signal.value * 0.3, 0);
      let similarity = 0;
      for (const { product: source, weight } of seeds) {
        if (idOf(source) === idOf(product)) continue;
        const sameSub = subs(source).some(key => subs(product).includes(key));
        if (!sameSub) continue;
        const brand = source.brand && source.brand === product.brand ? 0.12 : 0;
        const distance = price(source.price) > 0 ? Math.abs(Math.log(price(product.price) / price(source.price))) : 1;
        similarity = Math.max(similarity, weight * (0.3 + brand + 0.2 / (1 + distance)));
      }
      score += similarity;
      const impressions = Math.min(10, Number(profile.impressions?.[idOf(product)]) || 0);
      score -= impressions * 0.7;
      // Small deterministic rotation breaks ties without generating a visitor identifier.
      score += (hash(idOf(product) + ':' + Math.floor(now / DAY)) % 1000) / 10000;
      if (!interests.size && popular.has(idOf(product))) score += 0.25;
      return { product, score, relevant: (strongest?.value || 0) > 0,
        reason: strongest?.value > 0 ? evidence.get(strongest.key) : { type: 'discover', key: '' } };
    }).sort((a, b) => b.score - a.score || idOf(a.product).localeCompare(idOf(b.product)));
  }
  function rows(ranked, size = 8) {
    size = Math.max(2, Math.min(12, Math.floor(size) || 8));
    let remaining = ranked.slice();
    const result = [];
    const usedTopics = new Set();
    const topics = new Set(ranked.flatMap(item => [
      ...subs(item.product).map(id => 'sub:' + id),
      ...categories(item.product).map(id => 'category:' + id)
    ]));
    while (remaining.length) {
      const candidates = [];
      for (const key of topics) {
        if (usedTopics.has(key)) continue;
        const isSub = key.startsWith('sub:');
        const id = key.slice(key.indexOf(':') + 1);
        const items = remaining.filter(item => (isSub ? subs(item.product) : categories(item.product)).includes(id)).slice(0, size);
        if (items.length < (isSub ? 2 : 4)) continue;
        const score = items.reduce((sum, item) => sum + item.score, 0) / items.length + (isSub ? 0.12 : 0);
        candidates.push({ key, items, score });
      }
      candidates.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
      // Introduce another topic between rows instead of mixing unrelated goods into a specific row.
      let next = candidates[0];
      if (result.length > 0 && result.length % 4 === 3) next = candidates.find(row => row.items.every(item => !item.relevant)) || next;
      const items = next?.items || remaining.slice(0, size);
      const used = new Set(items.map(item => idOf(item.product)));
      result.push({ key: next?.key || '', items });
      if (next) usedTopics.add(next.key);
      remaining = remaining.filter(item => !used.has(idOf(item.product)));
    }
    return result;
  }
  function navigationContext(referrer, origin, structure = {}) {
    try {
      const url = new URL(referrer);
      if (url.origin !== origin) return [];
      const product = url.pathname.match(/^\/product\/([^/]+)\/?$/);
      if (product) return [decodeURIComponent(product[1])];
      if (!/^\/category\/?$/.test(url.pathname)) return [];
      const id = url.searchParams.get('category') || Object.keys(structure).find(key => url.searchParams.has(key));
      const category = structure[id];
      if (!category) return [];
      const sub = url.searchParams.get('sub');
      if (category.subs?.some(item => item.id === sub)) return ['sub:' + sub, 'category:' + id];
      return ['category:' + id];
    } catch { return []; }
  }
  return Object.freeze({ rank, rows, navigationContext, available, hash });
});
