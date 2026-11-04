const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Control response order and focus without making requests to the live catalog.
function harness({ mobile = false, search = '' } = {}) {
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
      const tags = selector.split(',').map(value => value.trim().toUpperCase());
      return this.children.flatMap(child => [...(tags.includes(child.tagName) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return { top: 100, height: 48 }; }
  }
  const root = new Element(mobile ? 'modal' : 'form');
  const scope = mobile ? new Element() : root;
  if (mobile) root.append(scope);
  const input = new Element('input', mobile ? 'mobileSearchInput' : 'searchInput');
  const results = new Element('div', mobile ? 'mobileSearchResults' : 'desktopSearchResults');
  const clear = new Element('button', mobile ? 'mobileSearchClear' : 'desktopSearchClear');
  const submit = new Element('button', mobile ? 'mobileSearchBtn' : 'desktopSearchBtn');
  scope.append(input, clear, submit);
  (mobile ? root : scope).append(results);
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
  const window = { location: { search, assign: value => destinations.push(value) }, innerHeight: 800, addEventListener() {}, fetchCatalogCached: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) };
  const context = vm.createContext({ document, window, URLSearchParams, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) });
  const fetchCatalog = window.fetchCatalogCached;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/global/catalog.js'), 'utf8'), context);
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
  h.root.fire('modal:close'); await h.resolve(0);
  assert.equal(h.results.hidden, true);
  assert.equal(h.results.style.display, 'none');
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

test('Search matches Latin case, Georgian transliteration, brand, SKU and multiple terms consistently', () => {
  const context = vm.createContext({ window: {}, document: { addEventListener() {} } });
  for (const file of ['assets/js/global/catalog.js', 'assets/js/main/catalog-nav.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  const match = context.window.matchesCatalogSearch;
  const item = { id: 'z55ultra', name: 'Smart Watch Ultra 49mm', brand: 'ENKA', sku: 'SW-001' };
  for (const query of ['watch', 'WATCH', 'smart 49mm', 'enka', 'sw-001', 'z55ultra']) assert.equal(match(item, query), true, query);
  assert.equal(match({ name: 'ჭკვიანი სახლი' }, 'Wkviani'), true);
  assert.equal(match({ name: 'სახლის მოვლა' }, 'saxlis movla'), true);
  assert.equal(match(item, 'watch blender'), false);
  assert.equal(match({ ...item, stockStatus: 'out_of_stock' }, 'watch'), false);
  assert.equal(match(item, '  '), false);
  assert.equal(match(item, 'ъ'), false);
});
