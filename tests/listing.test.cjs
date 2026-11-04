const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const structure = { kitchen: { title: 'სამზარეულო', subs: [{ id: 'coffee', name: 'ყავა' }] }, home: { title: 'სახლი', subs: [] } };
function context(extra = {}) {
  const scope = vm.createContext({ URL, URLSearchParams, setTimeout, clearTimeout,
    document: { addEventListener() {} }, window: { location: { search: '', hash: '' }, CATALOG_STRUCTURE: structure }, ...extra });
  for (const file of ['assets/js/global/catalog.js', 'assets/js/main/catalog-nav.js', 'assets/js/main/catalog-listing.js']) vm.runInContext(read(file), scope);
  return scope;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('Listing routes use whole lari, accept old links and aliases, and reject invalid state', () => {
  const api = context().window.CatalogListing;
  const state = api.readState('?kitchen&sub=COFFEE&min=149&max=49&sort=price-asc&page=2', 'category');
  assert.deepEqual(plain(state), { category: 'kitchen', sub: 'coffee', query: '', min: '49', max: '149', sort: 'price-asc', page: 2 });
  assert.deepEqual(plain(api.priceRange('49.99', '149,50')), { min: '', max: '' });
  for (const query of ['?utm_source=ad&fbclid=abc', '?gclid', '?sort=%22%5D%3Cscript%3E&min=-1&max=Infinity&page=2x']) {
    const result = api.readState(query, 'category');
    assert.equal(result.category, 'all'); assert.equal(result.sort, 'default'); assert.equal(result.page, 1);
  }
  assert.equal(api.readState('?min=0', 'category').min, '0');
  assert.equal(api.readState('?min=1e3&max=1000000001', 'category').min, '');
  for (const key of ['result', 'q', 'search']) assert.equal(api.readState('?' + key + '=Sokany+coffee', 'search').query, 'Sokany coffee');
  assert.equal(api.readState('?result=&q=watch&cat=HOME', 'search').query, 'watch');
  assert.equal(api.readState('?result=' + 'a'.repeat(500), 'search').query.length, 200);
});

test('Listing URL round trips retain campaign parameters, hash, query and complete filter state', () => {
  const scope = context(); scope.window.location.hash = '#main-content';
  const api = scope.window.CatalogListing;
  const all = api.readState('', 'category');
  assert.equal(api.readState(new URL(api.routeURL(all, 'category', '?kitchen&home'), 'https://shop.test').search, 'category').category, 'all');
  for (const [mode, search] of [['category', '?kitchen&sub=coffee&min=0&max=99&sort=name-asc&page=3&utm_source=ad'], ['search', '?q=watch+%26+more&cat=home&max=99&page=2&utm_source=ad']]) {
    const state = api.readState(search, mode);
    const url = api.routeURL(state, mode, search);
    assert.ok(url.endsWith('#main-content')); assert.ok(url.includes('utm_source=ad'));
    assert.deepEqual(plain(api.readState(new URL(url, 'https://shop.test').search, mode)), plain(state));
    if (mode === 'search') assert.ok(url.includes('result=watch+%26+more'));
  }
});

const catalog = [
  { id: 'coffee-a', name: 'Coffee Maker', price: '49 ₾', categories: ['kitchen'], subcategories: ['coffee'], brand: 'Sokany', sku: 'SK-1' },
  { id: 'coffee-b', name: 'Sokany Coffee Grinder', price: '149', category: 'KITCHEN', subcategory: 'coffee' },
  { id: 'lamp', name: 'ჭკვიანი სახლი', price: '9', categories: ['home', 'home'] },
  { id: 'unknown-price', name: 'Coffee Unpriced', price: 'invalid', categories: ['kitchen'] },
  { id: 'sold', name: 'Coffee Sold', price: '10', categories: ['kitchen'], stockStatus: 'მარაგი ამოიწურა' },
  { id: 'soon', name: 'Coffee Soon', price: '59', categories: ['kitchen'], stockStatus: 'soon' }
];
test('Category filtering uses catalog prices in lari, normalizes availability and handles array/scalar fields', () => {
  const scope = context(); const api = scope.window.CatalogListing;
  const products = api.prepareProducts([...catalog, catalog[0], null, { id: 'bad' }]);
  assert.equal(products.length, 5);
  assert.equal(products[0].priceValue, 49);
  const state = api.readState('?kitchen&sub=coffee&max=50', 'category');
  assert.deepEqual(Array.from(api.selectProducts(products, state, 'category'), p => p.id), ['coffee-a']);
  state.min = '50'; state.max = '148'; state.sub = 'all';
  assert.deepEqual(Array.from(api.selectProducts(products, state, 'category'), p => p.id), ['soon']);
  assert.equal(scope.window.isProductAvailable(products.find(p => p.id === 'soon')), false);
});

test('Full search agrees with suggestions on brand, SKU, ID, terms and Georgian transliteration', () => {
  const scope = context(); const api = scope.window.CatalogListing;
  const products = api.prepareProducts(catalog);
  for (const query of ['SOKANY', 'sk-1', 'coffee-a', 'coffee sokany', 'Wkviani', 'ъ', 'missing']) {
    const state = api.readState('?result=' + encodeURIComponent(query), 'search');
    const result = api.selectProducts(products, state, 'search').map(p => p.id).sort();
    assert.deepEqual(Array.from(result), Array.from(products.filter(p => scope.window.matchesCatalogSearch(p, query)), p => p.id).sort(), query);
  }
  const state = api.readState('?result=coffee&cat=home', 'search');
  assert.equal(api.selectProducts(products, state, 'search').length, 0);
});

test('All sorting modes are stable, prices with no value sort last, and exact SKU matches rank first', () => {
  const api = context().window.CatalogListing;
  const products = api.prepareProducts(catalog);
  const state = api.readState('', 'category');
  for (const [sort, expected] of [['price-asc', ['lamp', 'coffee-a', 'soon', 'coffee-b', 'unknown-price']], ['price-desc', ['coffee-b', 'soon', 'coffee-a', 'lamp', 'unknown-price']]]) {
    state.sort = sort;
    assert.deepEqual(Array.from(api.selectProducts(products, state, 'category'), p => p.id), expected);
  }
  for (const sort of ['name-asc', 'name-desc']) {
    state.sort = sort;
    const expected = [...products].sort((a, b) => a.name.localeCompare(b.name, 'ka') * (sort === 'name-asc' ? 1 : -1));
    assert.deepEqual(Array.from(api.selectProducts(products, state, 'category'), p => p.id), expected.map(p => p.id));
  }
  const ranked = api.prepareProducts([{ id: 'loose', name: 'SK-1 compatible cable', price: '10' }, catalog[0]]);
  assert.equal(api.selectProducts(ranked, api.readState('?result=sk-1', 'search'), 'search')[0].id, 'coffee-a');
  assert.equal(products[0].id, 'coffee-a', 'Sorting must not mutate the shared catalog');
});

// A minimal DOM exercises async loading, UI events, history, pagination and staged mobile filters.
function harness({ mode = 'category', search = '', blockedStorage = false } = {}) {
  let document;
  class Element {
    constructor(tag = 'div', id = '') { this.tagName = tag; this.id = id; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.value = ''; this.textContent = ''; this.hidden = false; this.classes = new Set();
      this.classList = { contains: name => this.classes.has(name), toggle: (name, force) => { const add = force ?? !this.classes.has(name); add ? this.classes.add(name) : this.classes.delete(name); return add; } };
    }
    append(...nodes) { for (const node of nodes) { if (node.tagName === 'fragment') this.append(...node.children); else { this.children.push(node); node.parent = this; } } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key]; }
    focus() { document.activeElement = this; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type, data = {}) { const event = { target: this, currentTarget: this, button: 0, preventDefault() {}, ...data }; (this.listeners[type] || []).forEach(fn => fn(event)); }
    click() { this.fire('click'); }
    closest(selector) { return selector.includes('data-listing-field') && this.dataset.listingField ? this : this.parent?.closest(selector); }
    querySelector(selector) { return this.children.flatMap(child => [child, ...child.descendants()]).find(child => selector.includes('.product-name') && child.className === 'product-name' || (selector.includes('button') || selector.includes('.listing-button')) && child.tagName === 'button') || null; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    set innerHTML(html) { this.children = []; this.insertAdjacentHTML('beforeend', html); }
    insertAdjacentHTML(_position, html) { for (const [, id] of html.matchAll(/CARD\[([^\]]+)\]/g)) { const card = new Element('article'); card.dataset.productId = id; const name = new Element('a'); name.className = 'product-name'; card.append(name); this.append(card); } }
    get selectedOptions() { return [{ textContent: this.value }]; }
  }
  const ids = ['listingStatus', 'productCountBadge', 'searchResultCount', 'listingPills', 'listingPillsWrapper', 'listingScrollLeft', 'listingScrollRight', 'mobileFilterModal', 'minPrice', 'maxPrice', 'mobileMinPrice', 'mobileMaxPrice', 'sortSelect', 'listingSearchInput', 'activeFilters', 'activeFiltersText', 'mobileFilterDot', 'categoryMainTitle', 'searchQueryDisplay', 'filtersBar', 'loadMoreContainer', 'loadMoreBtn', 'paginationCounterText', 'paginationProgressBar', 'resetFilters', 'mobileFilterBtn', 'mobileFilterPreview', 'mobileApplyBtn', 'mobileResetBtn', 'gridToggleBtn', 'gridIconCompact', 'gridIconSingle', mode === 'search' ? 'searchResultsGrid' : 'catalogContainer'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element('div', id)]));
  nodes.mobileFilterModal.append(nodes.mobileMinPrice, nodes.mobileMaxPrice);
  const presets = [false, true].map(mobile => { const button = new Element('button'); button.dataset = { min: '', max: '50' }; if (mobile) nodes.mobileFilterModal.append(button); return button; });
  document = { activeElement: null, addEventListener() {}, getElementById: id => nodes[id] || null, querySelector: () => null, querySelectorAll: () => presets, createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment') };
  const pending = [], handlers = {}, history = [], timers = new Map(); let timerId = 0;
  const location = { search, hash: '', pathname: '/' + mode + '/' };
  const updateURL = (method, url) => { const parsed = new URL(url, 'https://shop.test'); location.search = parsed.search; history.push({ method, url }); };
  const window = { location, CATALOG_STRUCTURE: structure, addEventListener: (type, fn) => { handlers[type] = fn; }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    history: { pushState: (_state, _title, url) => updateURL('push', url), replaceState: (_state, _title, url) => updateURL('replace', url) },
    createProductCardHTML: product => 'CARD[' + product.id + ']',
    openAppModal: () => nodes.mobileFilterModal.classList.toggle('active', true), closeAppModal: () => nodes.mobileFilterModal.classList.toggle('active', false) };
  const scope = context({ document, window, requestAnimationFrame: fn => fn(), localStorage: { getItem() { if (blockedStorage) throw Error('blocked'); return null; }, setItem() { if (blockedStorage) throw Error('blocked'); } }, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) });
  window.fetchCatalogCached = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  window.CatalogListing.mount(mode);
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return { nodes, presets, pending, history, location, document, grid: nodes[mode === 'search' ? 'searchResultsGrid' : 'catalogContainer'],
    async resolve(products) { pending.at(-1).resolve({ products }); await flush(); }, async reject() { pending.at(-1).reject(Error('offline')); await flush(); },
    backTo(search) { location.search = search; handlers.popstate(); }, runTimers() { const tasks = [...timers.values()]; timers.clear(); tasks.forEach(fn => fn()); } };
}

test('Both listings recover from failed loading, clear busy state and preserve route filters on retry', async () => {
  for (const mode of ['category', 'search']) {
    const h = harness({ mode, search: mode === 'search' ? '?result=coffee&max=50' : '?kitchen&max=50', blockedStorage: true });
    await h.reject();
    assert.equal(h.grid.getAttribute('aria-busy'), 'false'); assert.equal(h.nodes.filtersBar.hidden, true);
    h.grid.querySelector('button').focus(); h.grid.querySelector('button').click();
    assert.equal(h.pending.length, 2);
    await h.resolve(catalog);
    assert.equal(h.nodes.filtersBar.hidden, false); assert.equal(h.grid.children.length, 1);
    assert.equal(h.grid.children[0].dataset.productId, 'coffee-a');
    assert.equal(h.document.activeElement.className, 'product-name');
  }
});

test('Pagination appends unique cards, restores on Back, and resets after filters change', async () => {
  const h = harness();
  await h.resolve(Array.from({ length: 35 }, (_, i) => ({ id: 'item-' + i, name: 'Item ' + i, price: String(i + 1) })));
  assert.equal(h.grid.children.length, 16);
  h.nodes.loadMoreBtn.click(); assert.equal(h.grid.children.length, 32); assert.ok(h.location.search.includes('page=2'));
  h.nodes.loadMoreBtn.click(); assert.equal(h.grid.children.length, 35); assert.equal(h.nodes.loadMoreBtn.hidden, true);
  assert.equal(new Set(h.grid.children.map(child => child.dataset.productId)).size, 35);
  h.backTo('?page=2'); assert.equal(h.grid.children.length, 32);
  h.nodes.maxPrice.value = '5'; h.nodes.maxPrice.fire('input'); h.nodes.sortSelect.value = 'price-desc'; h.nodes.sortSelect.fire('change'); h.runTimers();
  assert.equal(h.grid.children.length, 5); assert.equal(h.grid.children[0].dataset.productId, 'item-4');
  assert.ok(!h.location.search.includes('page=')); assert.ok(h.location.search.includes('max=5'));
});

test('Mobile filter drafts never change results until Apply; reopening discards cancelled changes', async () => {
  const h = harness(); await h.resolve(catalog);
  const original = h.grid.children.length;
  h.nodes.mobileFilterBtn.click(); h.nodes.mobileMaxPrice.value = '50'; h.nodes.mobileMaxPrice.fire('input');
  assert.equal(h.grid.children.length, original); assert.equal(h.location.search, '');
  h.nodes.mobileFilterModal.classList.toggle('active', false); h.nodes.mobileFilterBtn.click();
  assert.equal(h.nodes.mobileMaxPrice.value, '');
  h.presets[1].click(); h.nodes.mobileApplyBtn.click();
  assert.equal(h.grid.children.length, 2); assert.ok(h.location.search.includes('max=50'));
  assert.equal(h.nodes.mobileFilterDot.hidden, false);
  h.nodes.mobileFilterBtn.click(); h.nodes.mobileResetBtn.click();
  assert.equal(h.grid.children.length, 2, 'Draft reset is staged too');
  h.nodes.mobileApplyBtn.click(); assert.equal(h.grid.children.length, original);
});

test('Empty queries do not fetch, and an unknown search category stays visible and can be reset', async () => {
  const empty = harness({ mode: 'search' }); assert.equal(empty.pending.length, 0); assert.equal(empty.nodes.filtersBar.hidden, true);
  const h = harness({ mode: 'search', search: '?result=coffee&cat=missing' }); await h.resolve(catalog);
  assert.equal(h.nodes.listingPillsWrapper.hidden, false);
  assert.ok(h.nodes.listingPills.children.some(link => link.dataset.listingValue === 'missing'));
  h.nodes.resetFilters.click();
  assert.equal(h.grid.children.length, 4); assert.ok(!h.location.search.includes('cat='));
});
