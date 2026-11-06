const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page(controller = true) {
  const handlers = {};
  const element = () => ({
    dataset: {}, children: [],
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
  });
  const elements = Object.fromEntries(['categoryModal', 'categoryModalBox', 'categoryModalTitle', 'categoryModalList'].map(id => [id, element()]));
  const list = elements.categoryModalList;
  list.appendChild = fragment => list.children.push(...fragment.children);
  list.prepend = node => list.children.unshift(node);
  const opened = [];
  const window = { location: { href: '' } };
  if (controller) window.openAppModal = (...args) => opened.push(args);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/homepage/mini-categories.js'), 'utf8'), {
    window,
    document: {
      addEventListener: (type, handler) => { handlers[type] = handler; },
      getElementById: id => elements[id],
      createElement: element,
      createDocumentFragment: element,
    },
  });
  handlers.DOMContentLoaded();
  const trigger = { dataset: { cat: 'kitchen', name: '<Kitchen>', subs: JSON.stringify([{ id: 'coffee & tea', name: '<Coffee>' }]) } };
  const click = overrides => {
    const event = { button: 0, target: { closest: () => trigger }, preventDefault() { this.prevented = true; }, ...overrides };
    handlers.click(event);
    return event;
  };
  return { click, trigger, opened, window, list, elements };
}

test('Category tiles open the shared modal with a native all-products link and encoded subcategory links', () => {
  const p = page();
  assert.equal(p.click().prevented, true);
  assert.equal(p.opened.length, 1);
  assert.equal(p.opened[0][1], p.trigger);
  assert.equal(p.elements.categoryModalTitle.textContent, '<Kitchen>');
  assert.equal(p.list.children[0].href, '/category/?kitchen');
  assert.equal(p.list.children[1].href, '/category/?kitchen&sub=coffee%20%26%20tea');
  assert.equal(p.list.children[1].children[0].textContent, '<Coffee>');
});

test('Modified clicks, secondary clicks and an unavailable modal controller preserve native navigation', () => {
  for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    const p = page();
    assert.equal(p.click(overrides).prevented, undefined);
    assert.equal(p.opened.length, 0);
  }
  assert.equal(page(false).click().prevented, undefined);
});

test('Empty or malformed subcategories fall back to the category page', () => {
  for (const subs of ['[]', '{broken', '{}']) {
    const p = page();
    p.trigger.dataset.subs = subs;
    p.click();
    assert.equal(p.window.location.href, '/category/?kitchen');
    assert.equal(p.opened.length, 0);
  }
});
