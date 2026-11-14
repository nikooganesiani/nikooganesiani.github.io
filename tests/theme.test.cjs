const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/js/global/theme.js'), 'utf8');

function setup({ saved = null, blocked = false, writeBlocked = false } = {}) {
  const events = {};
  const toggleEvents = {};
  const root = { dataset: {} };
  const chrome = {};
  let ready = false;
  let stored = saved;
  const storage = { getItem: () => stored, setItem(key, value) {
    assert.equal(key, 'enka_theme');
    if (writeBlocked) throw Error('Storage disabled');
    stored = value;
  } };
  const toggle = { checked: false, addEventListener: (name, handler) => { toggleEvents[name] = handler; } };
  const window = { addEventListener: (name, handler) => { events[name] = handler; } };
  Object.defineProperty(window, 'localStorage', { get() { if (blocked) throw Error('Storage disabled'); return storage; } });
  const document = {
    documentElement: root,
    querySelector: selector => selector.includes('meta') ? chrome : ready ? toggle : null,
    addEventListener: (name, handler) => { events[name] = handler; }
  };
  vm.runInNewContext(source, { window, document });
  return { root, chrome, toggle, storage, events,
    get saved() { return stored; },
    ready() { ready = true; events.DOMContentLoaded(); },
    change(dark) { toggle.checked = dark; toggleEvents.change(); },
    external(value, key = 'enka_theme') { stored = value; events.storage({ key, newValue: value, storageArea: storage }); }
  };
}

test('Saved dark theme applies in head before the footer is parsed', () => {
  const page = setup({ saved: 'dark' });
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.chrome.content, '#101720');
  page.ready();
  assert.equal(page.toggle.checked, true);
});

test('Default and corrupt preferences retain light theme; both choices persist', () => {
  for (const saved of [null, 'unknown', 'light']) {
    const page = setup({ saved });
    assert.equal(page.root.dataset.theme, 'light');
    page.ready();
    page.change(true);
    assert.equal(page.saved, 'dark');
    page.change(false);
    assert.equal(page.saved, 'light');
    assert.equal(page.chrome.content, '#155dfc');
  }
});

test('Storage denial never prevents switching for the current page', () => {
  for (const options of [{ blocked: true }, { writeBlocked: true }]) {
    const page = setup(options);
    page.ready();
    page.change(true);
    assert.equal(page.root.dataset.theme, 'dark');
    page.change(false);
    assert.equal(page.root.dataset.theme, 'light');
  }
});

test('Other tabs synchronize theme and checkbox, including preference removal', () => {
  const page = setup(); page.ready();
  page.external('dark');
  assert.equal(page.toggle.checked, true);
  page.external('light', 'unrelated');
  assert.equal(page.root.dataset.theme, 'dark');
  page.external(null);
  assert.equal(page.toggle.checked, false);
  page.external('dark');
  page.external(null, null);
  assert.equal(page.root.dataset.theme, 'light');
});

test('History cache restoration re-reads the current preference', () => {
  const page = setup(); page.ready();
  page.external('dark', 'unrelated');
  page.events.pageshow({ persisted: true });
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.toggle.checked, true);
});
