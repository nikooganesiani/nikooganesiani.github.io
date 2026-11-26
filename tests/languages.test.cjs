const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function browser({ saved, blocked = false, native = false } = {}) {
  class Element {
    constructor() { this.events = {}; this.attrs = {}; this.dataset = {}; this.hidden = false; this.open = false; this.textContent = ''; }
    addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
    removeEventListener(name, callback) { this.events[name] = this.events[name]?.filter(value => value !== callback); }
    dispatchEvent(event) {
      event.currentTarget = this;
      for (const callback of this.events[event.type] || []) callback(event);
    }
    setAttribute(name, value) { this.attrs[name] = value; }
    getAttribute(name) { return this.attrs[name]; }
    focus() {}
    remove() { this.removed = true; }
  }
  const store = new Map(saved ? [['enka_language', saved]] : []);
  const scripts = [];
  const fonts = [];
  const timers = new Map();
  const observers = [];
  function languageButton(code) {
    const button = new Element();
    button.dataset.language = code;
    button.textContent = code;
    const flag = new Element(); flag.attrs.src = '/img/flags/' + code + '.svg';
    const name = new Element(); name.textContent = code;
    const abbreviation = new Element();
    button.querySelector = selector => ({ img: flag, '[dir]': name, '[data-language-abbreviation]': abbreviation })[selector];
    return button;
  }
  const pickers = Array.from({ length: 2 }, () => {
    const picker = new Element();
    picker.parts = Object.fromEntries(['.language-trigger', '[data-language-flag]', '[data-language-code]', '[data-language-status]', '[data-language-retry]', '[data-language-search]', '.language-empty', '.language-more', '.language-list'].map(selector => [selector, new Element()]));
    picker.querySelector = selector => picker.parts[selector];
    picker.buttons = ['ka', 'en', 'ru'].map(code => {
      const button = languageButton(code);
      button.closest = () => picker;
      return button;
    });
    picker.parts['.language-list'].append = fragment => {
      for (const button of fragment.children) {
        button.closest = () => picker;
        picker.buttons.push(button);
      }
    };
    picker.querySelectorAll = () => picker.buttons.slice(3);
    picker.contains = node => picker === node || picker.buttons.includes(node);
    return picker;
  });
  let combo;
  const engine = { id: 'site-translation-engine', querySelector: () => combo || null };
  const document = new Element();
  document.cookie = '';
  document.fonts = { load: async font => fonts.push(font) };
  document.documentElement = { classList: { contains: () => true } };
  document.head = { append: script => scripts.push(script) };
  document.createElement = () => new Element();
  document.createDocumentFragment = () => ({ children: [], append(node) { this.children.push(node); } });
  const elements = {
    'site-language-option': {
      dataset: { flagDirectory: '/img/flags/' },
      content: { firstElementChild: { cloneNode: () => languageButton('') } }
    },
    'site-automatic-languages': { textContent: JSON.stringify([{ code: 'de', flag: 'de', name: 'Deutsch' }]) },
    'site-translation-engine': engine
  };
  document.getElementById = id => elements[id];
  document.querySelectorAll = selector => selector === '[data-language-picker]' ? pickers : pickers.flatMap(picker => picker.buttons);
  const window = native ? { enkaI18n: { locale: ['ru', 'en'].includes(saved) ? saved : 'ka' } } : {};
  let reloads = 0;
  const context = vm.createContext({
    document, window, location: { protocol: 'https:', hostname: 'shop.example.com', reload() { reloads++; } }, Intl,
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} },
    setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    localStorage: {
      getItem: key => { if (blocked) throw Error('blocked'); return store.get(key); },
      setItem: (key, value) => { if (blocked) throw Error('blocked'); store.set(key, value); }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/global/languages.js'), 'utf8'), context);
  const selections = [];
  return {
    document, window, pickers, scripts, fonts, store, selections,
    get reloads() { return reloads; },
    click(code, position = 0) {
      const picker = pickers[position];
      if (code === 'de') {
        picker.parts['.language-more'].open = true;
        picker.parts['.language-more'].dispatchEvent({ type: 'toggle' });
      }
      picker.buttons.find(button => button.dataset.language === code).dispatchEvent({ type: 'click' });
    },
    async flush() { await Promise.resolve(); await Promise.resolve(); },
    ready() {
      window.google = { translate: { TranslateElement: function(options) {
        assert.equal(options.pageLanguage, 'ka');
        assert.equal(options.autoDisplay, false);
        combo = new Element(); combo.options = ['ka', 'en', 'ru', 'de'].map(value => ({ value }));
        combo.addEventListener('change', () => selections.push(combo.value));
      } } };
      window.enkaTranslationReady();
      observers.forEach(observer => observer.callback());
    },
    timeout() { [...timers.values()].forEach(callback => callback()); }
  };
}

test('Original Georgian loads no external translation script', () => {
  const page = browser();
  assert.equal(page.scripts.length, 0);
  assert.deepEqual(page.fonts, []);
});

test('Native Russian and English restore without Google and synchronize both pickers', () => {
  for (const saved of ['ru', 'en']) {
    const page = browser({ saved, native: true });
    assert.equal(page.scripts.length, 0);
    assert.deepEqual(page.fonts, []);
    assert.equal(page.document.documentElement.lang, saved);
    for (const picker of page.pickers) assert.equal(picker.parts['[data-language-code]'].textContent, saved.toUpperCase());
    page.click('ka');
    assert.equal(page.store.get('enka_language'), 'ka');
    assert.equal(page.reloads, 1);
    assert.equal(page.scripts.length, 0);
  }
});

test('An automatic translation starts the full font before the Google widget responds', async () => {
  const page = browser({ native: true });
  assert.ok(page.pickers.every(picker => picker.buttons.length === 3));
  page.click('de');
  assert.deepEqual(page.pickers.map(picker => picker.buttons.length), [4, 3]);
  assert.equal(page.pickers[0].buttons[3].querySelector('[dir]').textContent, 'Deutsch');
  assert.deepEqual(page.fonts, ['400 1em "Google Sans Full"']);
  assert.equal(page.document.documentElement.lang, 'ka');
  page.ready(); await page.flush();
  assert.equal(page.document.documentElement.lang, 'de');
});

test('Choosing a native language cancels a pending external translation', async () => {
  const page = browser({ native: true });
  page.click('de');
  page.click('ru');
  page.ready(); await page.flush();
  assert.deepEqual(page.selections, []);
  assert.equal(page.store.get('enka_language'), 'ru');
  assert.equal(page.reloads, 1);
});

test('Header and footer share one on-page engine and persist the same selection', async () => {
  const page = browser();
  page.click('ru'); page.click('en', 1);
  assert.equal(page.scripts.length, 1);
  assert.match(page.scripts[0].src, /^https:\/\/translate.google.com\/translate_a\/element.js\?/);
  page.ready(); await page.flush();
  assert.deepEqual(page.selections, ['en']);
  assert.equal(page.store.get('enka_language'), 'en');
  for (const picker of page.pickers) {
    assert.equal(picker.parts['[data-language-code]'].textContent, 'EN');
    assert.equal(picker.buttons.find(button => button.dataset.language === 'en').attrs['aria-pressed'], 'true');
  }
  page.click('ka'); await page.flush();
  assert.deepEqual(page.selections, ['en', 'ka']);
  assert.equal(page.document.documentElement.lang, 'ka');
});

test('Returning to Georgian cancels an older choice while Google is loading', async () => {
  const page = browser();
  page.click('ru'); page.click('ka');
  page.ready(); await page.flush();
  assert.deepEqual(page.selections, []);
  assert.equal(page.store.get('enka_language'), 'ka');
});

test('A blocked provider leaves the current page intact and supports retry', async () => {
  const page = browser();
  page.click('ru'); page.scripts[0].onerror(); await page.flush();
  assert.equal(page.pickers[0].parts['[data-language-retry]'].hidden, false);
  assert.equal(page.store.has('enka_language'), false);
  page.pickers[0].parts['[data-language-retry]'].dispatchEvent({ type: 'click' });
  assert.equal(page.scripts.length, 2);
  page.ready(); await page.flush();
  assert.deepEqual(page.selections, ['ru']);
});

test('Stored preferences restore; blocked storage and a timeout do not break the page', async () => {
  const restored = browser({ saved: 'ru' });
  assert.equal(restored.scripts.length, 1);
  restored.ready(); await restored.flush();
  assert.deepEqual(restored.selections, ['ru']);
  const page = browser({ blocked: true });
  page.click('en'); page.timeout(); await page.flush();
  assert.equal(page.pickers[1].parts['[data-language-retry]'].hidden, false);
  page.click('ka'); await page.flush();
  assert.match(page.document.cookie, /enka_language=ka/);
  assert.equal(page.pickers[0].parts['[data-language-status]'].hidden, true);
});
