const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Control response order and focus without making requests to the live catalog.
function harness({ mobile = false, search = '', storage = new Map() } = {}) {
  let document;
  class Element {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.children = [];
      this.events = {}; this.attrs = new Map(); this.style = {}; this.value = '';
      const classes = new Set();
      this.classList = { toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }, remove(name) { classes.delete(name); }, contains: name => classes.has(name) };
    }
    append(...nodes) {
      for (const node of nodes) {
        if (node.tagName === 'FRAGMENT') { this.append(...node.children); continue; }
        node.parentElement = this; this.children.push(node);
      }
    }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    closest(selector) { return (selector === 'form' && this.tagName === 'FORM') || (selector === '.modal' && this.tagName === 'MODAL') || (selector === '[aria-controls="searchModalMobile"]' && this.getAttribute('aria-controls') === 'searchModalMobile') ? this : this.parentElement?.closest(selector) || null; }
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    removeAttribute(key) { this.attrs.delete(key); }
    addEventListener(type, handler) { (this.events[type] ||= []).push(handler); }
    fire(type, values = {}) {
      const event = { target: this, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
      for (const handler of this.events[type] || []) handler(event);
      return event;
    }
    focus() {
      const old = document.activeElement;
      document.activeElement = this;
      for (let node = old; node; node = node.parentElement) node.fire('focusout', { relatedTarget: this });
      this.fire('focus');
    }
    querySelectorAll(selector) {
      const matches = child => selector.split(',').some(value => {
        const item = value.trim();
        return item.startsWith('.') ? child.className?.split(' ').includes(item.slice(1)) : child.tagName === item.toUpperCase();
      });
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return { top: 100, height: 48 }; }
  }
  const root = new Element(mobile ? 'modal' : 'form');
  const scope = mobile ? new Element('form') : root;
  if (mobile) root.append(scope);
  const input = new Element('input', mobile ? 'mobileSearchInput' : 'searchInput');
  const results = new Element('div', mobile ? 'mobileSearchResults' : 'desktopSearchResults');
  results.hidden = true;
  const clear = new Element('button', mobile ? 'mobileSearchClear' : 'desktopSearchClear');
  const submit = new Element('button', mobile ? 'mobileSearchBtn' : 'desktopSearchBtn');
  scope.append(input, clear, submit, results);
  const outside = new Element('button');
  const nodes = [input, results, clear, submit];
  document = new Element('document');
  document.activeElement = outside;
  document.getElementById = id => nodes.find(node => node.id === id) || null;
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => new Element('fragment');
  const timers = new Map();
  let timerId = 0;
  const pending = [];
  const destinations = [];
  const window = { location: { search, assign: value => destinations.push(value) }, innerHeight: 800, addEventListener() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetchCatalogCached: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) };
  const context = vm.createContext({ document, window, URLSearchParams, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) });
  const fetchCatalog = window.fetchCatalogCached;
  for (const file of ['catalog.js', 'catalog-search.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/global', file), 'utf8'), context);
  }
  window.fetchCatalogCached = fetchCatalog;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/main/search.js'), 'utf8'), context);
  document.fire('DOMContentLoaded');
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  return { document, input, results, clear, submit, root, scope, outside, pending, destinations,
    async runTimers() { const tasks = [...timers.values()]; timers.clear(); tasks.forEach(fn => fn()); await flush(); },
    type(value) { input.focus(); input.value = value; input.fire('input'); },
    async resolve(index, products = [{ id: 'sokany', name: 'Sokany', price: 79 }]) { pending[index].resolve({ products }); await flush(); },
    async reject(index) { pending[index].reject(new Error('offline')); await flush(); }
  };
}

test('Search debounces typing and ignores an older response after the query changes', async () => {
  const h = harness();
  h.type('s'); h.type('so'); await h.runTimers();
  assert.equal(h.pending.length, 1);
  h.type('watch'); await h.runTimers();
  await h.resolve(1, [{ id: 'watch', name: 'Watch', price: 99 }]);
  await h.resolve(0);
  assert.equal(h.results.querySelector('a').href, '/product/watch/');
});

test('Both search surfaces show a previous price only for a real discount', async () => {
  for (const mobile of [false, true]) {
    for (const [oldPrice, discounted] of [['99', true], ['59', false], ['49', false], ['', false], ['invalid', false]]) {
      const h = harness({ mobile });
      h.type('tiffany'); await h.runTimers();
      await h.resolve(0, [{ id: 'tiffany', name: 'Tiffany', price: '59', oldPrice }]);
      assert.equal(h.results.querySelector('strong').textContent, '59 ₾');
      const old = h.results.querySelector('del');
      assert.equal(!!old, discounted, 'oldPrice=' + oldPrice + ', mobile=' + mobile);
      if (old) {
        assert.equal(old.textContent, '99 ₾');
        assert.match(old.getAttribute('aria-label'), /ძველი ფასი/);
      }
    }
  }
});

test('Escape and focus leaving the search invalidate pending work', async () => {
  for (const close of [h => h.input.fire('keydown', { key: 'Escape' }), h => h.outside.focus()]) {
    const h = harness(); h.type('sokany'); await h.runTimers();
    close(h); await h.resolve(0);
    assert.equal(h.results.hidden, true);
    assert.equal(h.results.querySelector('a'), null);
    h.input.focus(); h.input.fire('focus'); await h.runTimers();
    await h.resolve(1);
    assert.equal(h.results.hidden, false, 'An interrupted search must be retryable on refocus');
  }
});

test('Keyboard navigation enters results, returns to the field, and consumes only the first Escape', async () => {
  const h = harness({ mobile: true }); h.type('sokany'); await h.runTimers(); await h.resolve(0);
  h.input.fire('keydown', { key: 'ArrowDown' });
  assert.equal(h.results.hidden, false);
  const first = h.results.querySelector('a');
  first.focus();
  const escape = h.results.fire('keydown', { key: 'Escape' });
  assert.equal(escape.stopped, true);
  assert.equal(h.results.hidden, true);
  assert.equal(h.input.fire('keydown', { key: 'Escape' }).stopped, undefined);
});

test('Closing the mobile dialog prevents a late result from repopulating it', async () => {
  const h = harness({ mobile: true }); h.type('sokany'); await h.runTimers();
  h.root.fire('modal:close');
  const contentBeforeResponse = [...h.results.children];
  await h.resolve(0);
  assert.equal(h.results.hidden, true);
  assert.deepEqual(h.results.children, contentBeforeResponse);
});

test('The click that opens a prefilled mobile dialog does not cancel its search', async () => {
  const h = harness({ mobile: true });
  h.type('sokany');
  h.outside.setAttribute('aria-controls', 'searchModalMobile');
  h.document.fire('click', { target: h.outside });
  await h.runTimers();
  assert.equal(h.pending.length, 1);
  await h.resolve(0);
  assert.equal(h.results.hidden, false);
});

test('IME composition does not request or submit an unfinished query', async () => {
  const h = harness(); h.input.focus(); h.input.fire('compositionstart');
  h.type('sokany'); await h.runTimers(); h.root.fire('submit');
  assert.equal(h.pending.length, 0); assert.equal(h.destinations.length, 0);
  h.input.fire('compositionend'); await h.runTimers();
  assert.equal(h.pending.length, 1);
  h.root.fire('submit');
  assert.equal(h.destinations[0], '/search/?result=sokany');
});

test('An offline search offers a usable retry and empty results remain informative', async () => {
  const h = harness(); h.type('sokany'); await h.runTimers(); await h.reject(0);
  const retry = h.results.querySelector('button'); assert.ok(retry);
  retry.focus(); retry.fire('click'); await h.resolve(1, []);
  await h.runTimers();
  assert.equal(h.pending.length, 2, 'Retry must not leave a second scheduled request');
  assert.equal(h.results.hidden, false);
  assert.match(h.results.querySelector('p').textContent, /ვერაფერი/);
  h.clear.fire('click');
  assert.equal(h.input.value, ''); assert.equal(h.results.hidden, true);
});

test('Query parameters populate both the input and the clear control without a request', () => {
  for (const key of ['result', 'q', 'search']) {
    const h = harness({ search: '?' + key + '=watch%20%26%20more' });
    assert.equal(h.input.value, 'watch & more');
    assert.equal(h.clear.classList.contains('show'), true);
    assert.equal(h.pending.length, 0);
  }
});

test('Search history persists across desktop and mobile, deduplicates queries and keeps products separate', async () => {
  const storage = new Map();
  const desktop = harness({ storage });
  desktop.type('  Sokany  600  ');
  desktop.scope.fire('submit');
  await desktop.runTimers();
  assert.equal(desktop.pending.length, 0);
  assert.deepEqual(desktop.destinations, ['/search/?result=Sokany%20600']);
  desktop.type('sokany 600');
  await desktop.runTimers();
  await desktop.resolve(0, [{ id: 'sokany-600', name: 'Sokany 600' }]);
  desktop.results.querySelectorAll('a')[0].fire('click');
  desktop.results.querySelectorAll('a')[1].fire('click');
  desktop.type('never submitted');

  const mobile = harness({ storage, mobile: true });
  mobile.input.focus();
  assert.deepEqual(mobile.results.querySelectorAll('a').map(link => link.href), ['/search/?result=sokany%20600', '/product/sokany-600/']);
  const removeQuery = mobile.results.querySelector('.site-search-remove');
  removeQuery.focus();
  removeQuery.fire('click');
  const reopened = harness({ storage });
  reopened.input.focus();
  assert.deepEqual(reopened.results.querySelectorAll('a').map(link => link.href), ['/product/sokany-600/']);
  reopened.results.querySelector('button').fire('click');
  assert.equal(reopened.results.querySelector('a'), null);
});

function catalogSearch(settings) {
  const context = vm.createContext({ window: { ...settings } });
  for (const file of ['catalog.js', 'catalog-search.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/global', file), 'utf8'), context);
  }
  return (products, query) => Array.from(context.window.searchCatalog(products, query), product => product.id);
}

test('Search matches Latin case, Georgian transliteration, brand, SKU and multiple terms consistently', () => {
  const search = catalogSearch();
  const item = { id: 'z55ultra', name: 'Smart Watch Ultra 49mm', brand: 'ENKA', sku: 'SW-001' };
  for (const query of ['watch', 'WATCH', 'smart 49mm', 'enka', 'sw-001', 'z55ultra']) assert.deepEqual(search([item], query), ['z55ultra'], query);
  assert.deepEqual(search([{ id: 'smart-home', name: 'ჭკვიანი სახლი' }], 'Wkviani'), ['smart-home']);
  assert.deepEqual(search([{ id: 'home-care', name: 'სახლის მოვლა' }], 'saxlis movla'), ['home-care']);
  for (const query of ['watch blender', '  ', 'ъ', '., —', 'SW-002']) assert.deepEqual(search([item], query), [], query);
  assert.deepEqual(search([{ ...item, stockStatus: 'out_of_stock' }], 'watch'), []);
});

test('Search uses every catalog language and recovers typos and separators without confusing similar product types', () => {
  const names = {
    ka: { fryer: { name: 'აეროგრილი 12ლ Sokany SK-10099' }, blender: { name: 'ხელის ბლენდერი' } },
    ru: { fryer: { name: 'Аэрогриль 12 л Sokany SK-10099' }, blender: { name: 'Погружной блендер' } },
    en: { fryer: { name: '12 L air fryer Sokany SK-10099' }, blender: { name: 'Hand blender' } }
  };
  for (const locale of Object.keys(names)) {
    const search = catalogSearch({ enkaI18n: { locale }, ENKA_CATALOG_LABELS_BY_LOCALE: names });
    const products = [
      { id: 'hair-dryer', name: 'Hair dryer Sokany', brand: 'Sokany' },
      { id: 'blender', name: names[locale].blender.name },
      { id: 'fryer', name: names[locale].fryer.name, brand: 'Sokany', sku: 'SK-10099' }
    ];
    for (const query of ['აეროგრილი', 'აეროგრილ', 'АЭРОГРИЛЬ', 'аэро гриль', 'аерогрль', 'aerogrili', 'airfryer', '  ＡＩＲ , — fryer! ',
      'air fryre', 'airfryr', 'air fryer 12л', 'SK 10-099', 'სოკანი air fryer', 'сокани air fryer']) {
      assert.deepEqual(search(products, query), ['fryer'], locale + ' ' + query);
    }
    for (const query of ['handblnder', 'погружной блендр', 'ხელის ბლენდეირ']) {
      assert.deepEqual(search(products, query), ['blender'], locale + ' ' + query);
    }
    for (const query of ['air fryer 13l', 'SK-10098', 'air fryer blender', 'xzqzw']) {
      assert.deepEqual(search(products, query), [], locale + ' ' + query);
    }
  }
});

test('Translated taxonomy and live titles apply to products without build-time names', () => {
  const search = catalogSearch({ ENKA_STORE: { categories: [{ id: 'kitchen', title: { ka: 'სამზარეულო', ru: 'Кухня', en: 'Kitchen' },
    subs: [{ id: 'coffee', title: { ka: 'ყავის აპარატი', ru: 'Кофемашина', en: 'Coffee machine' } }] }] } });
  const products = [{ id: 'tf-1622', name: 'Tiffany TF-1622', brand: 'Tiffany', categories: ['kitchen'], subcategories: ['coffee'] }];
  for (const query of ['кофе машина tiffnay', 'coffeemachne', 'ყავის აპარატი', 'кухня']) assert.deepEqual(search(products, query), ['tf-1622'], query);
  assert.deepEqual(search([{ ...products[0], name: 'Tiffany Espresso' }], 'espresso'), ['tf-1622']);
});

test('Spelling recovery handles sound-alike letters, short words and multiple errors across the catalog', () => {
  const names = {
    ka: { fryer: { name: 'აეროგრილი' }, toaster: { name: 'ტოსტერი' }, iron: { name: 'უთო' }, straightener: { name: 'თმის უთო' },
      kettle: { name: 'ელექტრო ჩაიდანი' } },
    ru: { fryer: { name: 'Аэрогриль' }, iron: { name: 'Утюг' }, blender: { name: 'Погружной блендер' }, hairdryer: { name: 'Фен' },
      juicer: { name: 'Соковыжималка' }, grinder: { name: 'Мясорубка' } }
  };
  const search = catalogSearch({ ENKA_CATALOG_LABELS_BY_LOCALE: names });
  const products = [
    { id: 'straightener', name: 'Hair straightener' }, { id: 'hairdryer', name: 'Hair dryer' },
    { id: 'fryer', name: 'Air fryer 12 L', sku: 'AF-10099' }, { id: 'toaster', name: 'Toaster' },
    { id: 'iron', name: 'Clothes iron' }, { id: 'kettle', name: 'Electric kettle' },
    { id: 'blender', name: 'Hand blender', brand: 'Sokany' }, { id: 'juicer', name: 'Juicer' },
    { id: 'grinder', name: 'Meat grinder' }, { id: 'dehydrator', name: 'Fruit dehydrator' }
  ];
  for (const [query, expected] of [
    ['аирагрил', 'fryer'], ['თოსთერი', 'toaster'], ['უტო', 'iron'],
    ['ელექთრო ჩაითანი', 'kettle'], ['сокавыжымалка', 'juicer'], ['фне', 'hairdryer'],
    ['месарупка', 'grinder'], ['dehideratir', 'dehydrator'],
    ['пгружной блэндр', 'blender'], ['soknay blneder', 'blender'], ['blned', 'blender'],
    ['фшк акнук', 'fryer'], ['аir frуеr', 'fryer']
  ]) assert.equal(search(products, query)[0], expected, query);
  assert.deepEqual(search(products, 'air fryer'), ['fryer']);
  assert.deepEqual(search(products, 'hairdryer'), ['hairdryer']);
  for (const query of ['фне чайდანი', 'air frayar 13 L', 'AF-10098', 'xzqwvy', 'жщъуф']) assert.deepEqual(search(products, query), [], query);
});

test('One product with a literal prefix does not hide a better short-word correction', () => {
  const search = catalogSearch();
  const products = [{ id: 'iron', name: 'უთო' }, { id: 'headphones', name: 'უტოლა ყურსასმენები' }];
  assert.ok(search(products, 'უტო').includes('iron'));
  assert.deepEqual(search(products, 'უთო'), ['iron']);
});
