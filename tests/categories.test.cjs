const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page(controller = true, available = true) {
  const handlers = {};
  const opened = [];
  const window = {};
  if (controller) window.openCatalogCategory = (id, trigger) => { opened.push({ id, trigger }); return available; };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/homepage/mini-categories.js'), 'utf8'), {
    window,
    document: { addEventListener: (type, handler) => { handlers[type] = handler; } },
  });
  handlers.DOMContentLoaded();
  const trigger = { dataset: { cat: 'kitchen' } };
  const click = overrides => {
    const event = { button: 0, target: { closest: () => trigger }, preventDefault() { this.prevented = true; }, ...overrides };
    handlers.click(event);
    return event;
  };
  return { click, trigger, opened };
}

test('Homepage tiles open the shared visual catalog at the clicked category and retain the return trigger', () => {
  const p = page();
  assert.equal(p.click().prevented, true);
  assert.equal(p.opened.length, 1);
  assert.equal(p.opened[0].id, 'kitchen');
  assert.equal(p.opened[0].trigger, p.trigger);
});

test('Modified clicks, secondary clicks and unavailable catalog controllers preserve native navigation', () => {
  for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    const p = page();
    assert.equal(p.click(overrides).prevented, undefined);
    assert.equal(p.opened.length, 0);
  }
  assert.equal(page(false).click().prevented, undefined);
  assert.equal(page(true, false).click().prevented, undefined);
});

test('Homepage tiles use the current catalog structure rather than embedded or stale subcategory lists', () => {
  for (const subs of ['[]', '{broken', '{}']) {
    const p = page();
    p.trigger.dataset.subs = subs;
    assert.equal(p.click().prevented, true);
    assert.equal(p.opened[0].id, 'kitchen');
  }
});
