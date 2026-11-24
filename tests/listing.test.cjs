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
  for (const file of ['admin/public/store-engine.js', 'assets/js/global/catalog.js', 'assets/js/global/catalog-search.js', 'assets/js/main/catalog-listing.js']) vm.runInContext(read(file), scope);
  return scope;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('Category paths open the selected section and retain filter parameters', () => {
  const api = context().window.CatalogListing;
  const state = api.readState('?max=200&utm_source=ad', 'category', '/category/homecare/vacuum/');
  assert.equal(state.category, 'homecare');
  assert.equal(state.sub, 'vacuum');
  assert.equal(api.routeURL(state, 'category', '?max=200&utm_source=ad'), '/category/homecare/vacuum/?utm_source=ad&max=200');
  assert.equal(api.readState('', 'category', '/category/homecare').sub, 'all');
});

test('Listing routes use whole lari, accept old links and aliases, and reject invalid state', () => {
  const api = context().window.CatalogListing;
  const state = api.readState('?kitchen&sub=COFFEE&min=149&max=49&sort=price-asc&page=2', 'category');
  assert.deepEqual(plain(state), { category: 'kitchen', sub: 'coffee', query: '', min: '49', max: '149', brands: [], stock: [], sale: false, specs: [], sort: 'price-asc', page: 2 });
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
    assert.deepEqual(plain(api.readState(new URL(url, 'https://shop.test').search, mode, new URL(url, 'https://shop.test').pathname)), plain(state));
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
  for (const query of ['SOKANY', 'sk-1', 'coffee-a', 'coffee sokany', 'Wkviani', 'cof fee', 'coffe grnider', 'ъ', 'missing']) {
    const state = api.readState('?result=' + encodeURIComponent(query), 'search');
    const result = api.selectProducts(products, state, 'search');
    assert.deepEqual(Array.from(result, p => p.id), Array.from(scope.window.searchCatalog(catalog, query), p => p.id), query);
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

test('Facets preserve URL state and combine search scope, OR selections, availability and real discounts', () => {
  const api = context().window.CatalogListing;
  const products = api.prepareProducts([
    { ...catalog[0], oldPrice: '99' },
    { ...catalog[1], brand: 'Tiffany', oldPrice: '159' },
    { ...catalog[5], brand: 'SOKANY', subcategories: ['coffee'], oldPrice: '59' },
    { ...catalog[3], brand: 'Tiffany', oldPrice: '99', subcategories: ['coffee'] }
  ]);
  const state = api.readState('?result=coffee&cat=kitchen&sub=coffee&brand=Sokany&brand=Tiffany&brand=sokany&stock=in_stock&stock=soon&stock=other&sale=1&sort=discount-desc', 'search');
  assert.deepEqual(plain(state.brands), ['sokany', 'tiffany']);
  assert.deepEqual(plain(state.stock), ['in_stock', 'soon']);
  const url = new URL(api.routeURL(state, 'search', '?utm_source=ad'), 'https://shop.test');
  assert.deepEqual(plain(api.readState(url.search, 'search')), plain(state));
  assert.deepEqual(Array.from(api.selectProducts(products, state), p => p.id), ['coffee-a', 'coffee-b']);
  assert.deepEqual(Array.from(api.selectProducts(products, { ...state, sale: false, stock: ['soon'] }), p => p.id), ['soon']);
});

// A minimal DOM exercises async loading, UI events, history, pagination and staged mobile filters.
function harness({ mode = 'category', search = '', blockedStorage = false, width = 390 } = {}) {
  let document;
  class Element {
    constructor(tag = 'div', id = '') { this.tagName = tag; this.id = id; this.children = []; this.dataset = {}; this.attributes = {}; this.style = {}; this.listeners = {}; this.value = ''; this.textContent = ''; this.hidden = false; this.classes = new Set();
      this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), contains: name => this.classes.has(name) || Boolean(this.className?.split(' ').includes(name)), toggle: (name, force) => { const add = force ?? !this.classes.has(name); add ? this.classes.add(name) : this.classes.delete(name); return add; } };
      if (tag === 'template') this.content = new Element('fragment');
    }
    append(...nodes) { for (const node of nodes) { if (node.tagName === 'fragment') this.append(...node.children); else {
      if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node);
      this.children.push(node); node.parent = this;
    } } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = null;
    }
    insertBefore(node, next) {
      node.remove();
      this.children.splice(next ? this.children.indexOf(next) : this.children.length, 0, node);
      node.parent = this;
    }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key]; }
    focus() { document.activeElement = this; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type, data = {}) { const event = { target: this, currentTarget: this, button: 0, preventDefault() {}, ...data }; (this.listeners[type] || []).forEach(fn => fn(event)); }
    click() { this.fire('click'); }
    closest(selector) { return selector.includes('data-listing-field') && this.dataset.listingField ? this : this.parent?.closest(selector); }
    querySelector(selector) { return this.children.flatMap(child => [child, ...child.descendants()]).find(child => selector.includes('.product-name') && child.className === 'product-name' || (selector.includes('button') || selector.includes('.listing-button')) && child.tagName === 'button') || null; }
    querySelectorAll(selector) { return this.descendants().filter(child => selector === '.price-preset-btn' && child.className === 'price-preset-btn'); }
    setCustomValidity(message) { this.validationMessage = message; }
    checkValidity() { return true; }
    reportValidity() { return this.checkValidity(); }
    animate(frames, timing) {
      const animation = { frames, timing, cancel() {} };
      this.animation = animation;
      return animation;
    }
    getBoundingClientRect() { return { top: this.offsetTop, left: this.offsetLeft }; }
    get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
    get parentElement() { return this.parent?.tagName !== 'fragment' ? this.parent : null; }
    get firstElementChild() { return this.children[0] || null; }
    get nextElementSibling() { return this.parent?.children[this.parent.children.indexOf(this) + 1] || null; }
    get offsetTop() { return Math.floor((this.parent?.children.indexOf(this) || 0) / 4) * 270; }
    get offsetLeft() { return ((this.parent?.children.indexOf(this) || 0) % 4) * 220; }
    get offsetWidth() { return 200; }
    get offsetHeight() { return 250; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    set innerHTML(html) {
      const target = this.content || this;
      target.children = [];
      target.insertAdjacentHTML('beforeend', html);
    }
    insertAdjacentHTML(_position, html) { for (const [, id] of html.matchAll(/CARD\[([^\]]+)\]/g)) { const card = new Element('article'); card.dataset.productId = id; const name = new Element('a'); name.className = 'product-name'; card.append(name); this.append(card); } }
    get selectedOptions() { return [{ textContent: this.value }]; }
  }
  const ids = [
    'listingStatus', 'productCountBadge', 'searchResultCount', 'listingPills', 'listingPillsWrapper',
    'listingScrollLeft', 'listingScrollRight', 'mobileFilterModal', 'listingMobileFacets', 'minPrice', 'maxPrice', 'sortSelect',
    'listingResults', 'listingSidebar', 'listingFacets', 'listingPriceForm', 'priceSlider', 'priceSelection', 'rangeMin', 'rangeMax', 'sortMenu', 'specFacets', 'listingBrandQuery', 'listingBrands',
    'listingStock', 'listingOffers', 'activeFilters', 'activeFiltersText', 'mobileFilterDot', 'categoryMainTitle', 'filtersBar',
    'loadMoreContainer', 'loadMoreBtn', 'paginationCounterText', 'paginationProgressBar', 'resetFilters',
    'mobileFilterBtn', 'mobileFilterPreview', 'mobileApplyBtn', 'mobileResetBtn', 'gridToggleBtn', 'gridIconCompact', 'gridIconSingle',
    ...(mode === 'search' ? ['searchResultsGrid', 'listingSearchInput', 'listingSearchTitle', 'listingSearchForm', 'listingDiscovery'] : ['catalogContainer'])
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element('div', id)]));
  const preset = new Element('button');
  preset.className = 'price-preset-btn'; preset.dataset = { min: '', max: '50' };
  nodes.listingPriceForm.append(nodes.minPrice, nodes.maxPrice);
  nodes.listingFacets.append(nodes.listingPriceForm, preset);
  nodes.listingSidebar.append(nodes.listingFacets);
  nodes.mobileFilterModal.append(nodes.listingMobileFacets);
  document = { activeElement: null, addEventListener() {}, getElementById: id => nodes[id] || null, querySelector: () => null, createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment') };
  const pending = [], handlers = {}, history = [];
  const breakpoints = new Map();
  const matchMedia = query => {
    const min = Number(/min-width: (\d+)px/.exec(query)?.[1] || Infinity);
    return {
      get matches() { return width >= min; },
      addEventListener(_type, listener) { breakpoints.set(min, listener); }
    };
  };
  const location = { search, hash: '', pathname: '/' + mode + '/' };
  const updateURL = (method, url) => { const parsed = new URL(url, 'https://shop.test'); location.search = parsed.search; location.pathname = parsed.pathname; history.push({ method, url }); };
  const window = { location, innerHeight: 990, CATALOG_STRUCTURE: structure, addEventListener: (type, fn) => { handlers[type] = fn; }, matchMedia,
    history: { pushState: (_state, _title, url) => updateURL('push', url), replaceState: (_state, _title, url) => updateURL('replace', url) },
    createProductCardHTML: product => 'CARD[' + product.id + ']PRICE[' + product.price + ']',
    openAppModal: () => nodes.mobileFilterModal.classList.toggle('active', true), closeAppModal: () => {
      nodes.mobileFilterModal.classList.toggle('active', false);
      nodes.mobileFilterModal.fire('modal:close');
    } };
  const scope = context({ document, window, requestAnimationFrame: fn => fn(), localStorage: { getItem() { if (blockedStorage) throw Error('blocked'); return null; }, setItem() { if (blockedStorage) throw Error('blocked'); } } });
  window.fetchCatalogCached = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  window.CatalogListing.mount(mode);
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return { nodes, preset, pending, history, location, document, grid: nodes[mode === 'search' ? 'searchResultsGrid' : 'catalogContainer'],
    async resolve(products,store) { pending.at(-1).resolve({ products,store }); await flush(); }, async reject() { pending.at(-1).reject(Error('offline')); await flush(); },
    backTo(search) { location.search = search; location.pathname = '/' + mode + '/'; handlers.popstate(); },
    resize(nextWidth) {
      const previous = width;
      width = nextWidth;
      for (const [min, listener] of breakpoints) {
        if ((previous >= min) !== (width >= min)) listener({ matches: width >= min });
      }
    },
    refreshPrices(products) { handlers['enka:prices-change']({ detail: { products } }); },
    closeModal: window.closeAppModal };
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
  h.nodes.maxPrice.value = '5'; h.nodes.maxPrice.fire('input');
  h.nodes.sortMenu.fire('change', { target: { value: 'price-desc' } });
  assert.equal(h.nodes.maxPrice.value, '5', 'Sorting preserves a price draft');
  assert.ok(!h.location.search.includes('max='));
  h.nodes.listingPriceForm.fire('submit');
  assert.equal(h.grid.children.length, 5); assert.equal(h.grid.children[0].dataset.productId, 'item-4');
  assert.ok(!h.location.search.includes('page=')); assert.ok(h.location.search.includes('max=5'));
});

test('Responsive page sizes apply to results, Load More and history', async () => {
  const h = harness({ mode: 'search', search: '?result=Item', width: 1864 });
  await h.resolve(Array.from({ length: 57 }, (_, i) => ({ id: 'item-' + i, name: 'Item ' + i, price: i + 1 })));
  const firstBatch = [...h.grid.children];
  assert.equal(firstBatch.length, 20);
  assert.match(h.nodes.loadMoreBtn.textContent, /\(20\)$/);
  h.nodes.loadMoreBtn.click();
  assert.equal(h.grid.children.length, 40);
  assert.deepEqual(h.grid.children.slice(0, 20), firstBatch);
  assert.match(h.nodes.loadMoreBtn.textContent, /\(17\)$/);
  assert.ok(h.location.search.includes('page=2'));

  h.resize(900);
  assert.equal(h.grid.children.length, 36);
  assert.equal(h.nodes.paginationProgressBar.value, 36);
  h.resize(390);
  assert.equal(h.grid.children.length, 32);
  assert.ok(h.location.search.includes('page=2'));
  h.backTo('?result=Item');
  assert.equal(h.grid.children.length, 16);
  h.resize(1100);
  assert.deepEqual(h.grid.children.slice(0, 16), firstBatch.slice(0, 16));
  assert.equal(h.grid.children.length, 20);
});

test('Listing motion keeps existing cards and moves them to the new grid positions immediately', async () => {
  const h = harness();
  const products = Array.from({ length: 20 }, (_, i) => ({ id: 'item-' + i, name: 'Item ' + i, price: i + 1 }));
  await h.resolve(products);
  const animates = card => card.classList.contains('listing-result-enter');
  const firstBatch = [...h.grid.children];
  assert.ok(firstBatch.every(animates));

  h.nodes.maxPrice.value = '20';
  h.nodes.listingPriceForm.fire('submit');
  assert.deepEqual(h.grid.children, firstBatch);
  assert.ok(h.nodes.activeFiltersText.firstElementChild.classList.contains('listing-control-enter'));

  h.nodes.loadMoreBtn.click();
  assert.deepEqual(h.grid.children.slice(0, 16), firstBatch);
  assert.equal(h.grid.children.slice(16).filter(animates).length, 4);
  const lastCard = h.grid.children[19];

  h.nodes.sortMenu.fire('change', { target: { value: 'price-desc' } });
  assert.equal(h.grid.firstElementChild, lastCard);
  assert.equal(h.grid.children[4], firstBatch[15]);
  assert.equal(lastCard.animation.timing.duration, 340);
  assert.deepEqual(plain(lastCard.animation.frames), [{ translate: '0 .875rem' }, { translate: '0 0' }]);

  const beforeRefresh = [...h.grid.children];
  h.refreshPrices(products);
  assert.deepEqual(h.grid.children, beforeRefresh);
  h.refreshPrices(products.map(product => product.id === 'item-19' ? { ...product, price: 19.99 } : product));
  assert.notEqual(h.grid.firstElementChild, lastCard);
  assert.deepEqual(h.grid.children.slice(1), beforeRefresh.slice(1));

  h.nodes.maxPrice.value = '0';
  h.nodes.listingPriceForm.fire('submit');
  assert.equal(h.grid.children.length, 1);
  assert.ok(h.grid.firstElementChild.classList.contains('listing-empty'));
  assert.ok(h.grid.firstElementChild.classList.contains('listing-result-enter'));
});

test('Mobile price changes apply to the grid and history without a second confirmation', async () => {
  const h = harness(); await h.resolve(catalog);
  const original = h.grid.children.length;
  h.nodes.mobileFilterBtn.click();
  h.nodes.maxPrice.value = '50';
  h.nodes.maxPrice.fire('change');
  assert.equal(h.grid.children.length, 2);
  assert.equal(h.nodes.mobileFilterPreview.textContent, '(2)');
  assert.ok(h.location.search.includes('max=50'));
  h.closeModal(); h.nodes.mobileFilterBtn.click();
  assert.equal(h.nodes.maxPrice.value, '50');
  h.nodes.mobileResetBtn.click();
  assert.equal(h.grid.children.length, original);
  assert.equal(h.location.search, '');
});

test('Specification filters compose with price, group choices by attribute and survive a shared URL', () => {
  const api = context().window.CatalogListing;
  const products = api.prepareProducts(['12 ლ', '13 ლ', '12 ლ'].map((size, i) => ({
    id: 'air-' + i, name: 'Air fryer', categories: ['kitchen'], subcategories: ['airfryer'],
    price: String(100 + 50 * i), specs: { 'მოცულობა': size, 'ფერი': i === 2 ? 'white' : 'black' }
  })));
  const state = api.readState('?max=150', 'category', '/category/kitchen/airfryer/');
  state.specs = [JSON.stringify(['მოცულობა', '12 ლ'])];
  assert.deepEqual(Array.from(api.selectProducts(products, state), p => p.id), ['air-0']);
  state.specs.push(JSON.stringify(['მოცულობა', '13 ლ']), JSON.stringify(['ფერი', 'black']));
  const url = new URL(api.routeURL(state, 'category'), 'https://shop.test');
  assert.deepEqual(plain(api.readState(url.search, 'category', url.pathname)), plain(state));
  assert.deepEqual(Array.from(api.selectProducts(products, state), p => p.id), ['air-0', 'air-1']);
});

test('Empty queries do not fetch, and an unknown search category stays visible and can be reset', async () => {
  const empty = harness({ mode: 'search' }); assert.equal(empty.pending.length, 0); assert.equal(empty.nodes.filtersBar.hidden, true);
  const h = harness({ mode: 'search', search: '?result=coffee&cat=missing' }); await h.resolve(catalog);
  assert.equal(h.nodes.listingPillsWrapper.hidden, false);
  assert.ok(h.nodes.listingPills.children.some(link => link.dataset.listingValue === 'missing'));
  h.nodes.resetFilters.click();
  assert.equal(h.grid.children.length, 4); assert.ok(!h.location.search.includes('cat='));
});

test('History navigation from discovery loads results and Back restores discovery', async () => {
  const h = harness({ mode: 'search' });
  h.backTo('?result=Coffee');
  assert.equal(h.pending.length, 1);
  await h.resolve(catalog);
  assert.equal(h.grid.children.length, 4);
  assert.equal(h.nodes.listingDiscovery.hidden, true);
  h.backTo('');
  assert.equal(h.nodes.listingDiscovery.hidden, false);
  h.backTo('?result=Coffee');
  assert.equal(h.grid.children.length, 4);
  assert.equal(h.pending.length, 1);
});
const renamedStore={categories:[{id:'appliances',aliases:['kitchen'],subs:[{id:'espresso',aliases:['coffee']}]}]};
test('Renamed category links resolve canonical IDs while retaining filters and campaign parameters',()=>{
  const scope=context();scope.window.ENKA_STORE=renamedStore;const api=scope.window.CatalogListing;
  for(const search of ['?kitchen&sub=coffee&max=99&utm_source=ad','?category=kitchen&sub=coffee&max=99&utm_source=ad']){
    const state=api.readState(search,'category');assert.equal(state.category,'appliances');assert.equal(state.sub,'espresso');assert.equal(state.max,'99');
    const url=new URL(api.routeURL(state,'category',search),'https://shop.test');assert.equal(url.pathname,'/category/appliances/espresso/');assert.equal(url.searchParams.get('utm_source'),'ad');
  }
  assert.equal(api.readState('?result=coffee&cat=kitchen','search').category,'appliances');
});
test('A category alias fetched after mount replaces the old URL and selects renamed product assignments',async()=>{
  const h=harness({search:'?kitchen&sub=coffee&max=99&utm_source=ad'});
  await h.resolve([{id:'coffee-new',name:'Coffee',price:'49',categories:['appliances'],subcategories:['espresso']}],renamedStore);
  assert.equal(h.grid.children.length,1);assert.equal(h.grid.children[0].dataset.productId,'coffee-new');
  const params=new URLSearchParams(h.location.search);assert.equal(h.location.pathname,'/category/appliances/espresso/');assert.equal(params.get('max'),'99');assert.equal(params.get('utm_source'),'ad');
});
