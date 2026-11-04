const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the shared lifecycle without loading the catalog or sending orders.
function harness({ reducedMotion = false } = {}) {
  let context;
  class Element {
    constructor(id, parent = null, classes = []) {
      this.id = id;
      this.parentElement = parent;
      this.children = [];
      parent?.children.push(this);
      this.attrs = new Map();
      this.style = {};
      this.inert = false;
      this.tabIndex = -1;
      this.isConnected = true;
      this.offsetHeight = 100;
      this.value = '';
      this.events = {};
      const tokens = new Set(classes);
      this.classList = {
        add: (...names) => names.forEach(name => tokens.add(name)),
        remove: (...names) => names.forEach(name => tokens.delete(name)),
        contains: name => tokens.has(name),
        toggle(name, force = !tokens.has(name)) { if (force) tokens.add(name); else tokens.delete(name); return force; }
      };
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    hasAttribute(name) { return this.attrs.has(name); }
    removeAttribute(name) { this.attrs.delete(name); }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    getClientRects() { return this.classList.contains('hidden') ? [] : [{}]; }
    matches(selector) {
      if (selector === ':disabled') return !!this.disabled;
      if (selector === '.modal') return this.classList.contains('modal');
      return false;
    }
    closest(selector) {
      if (selector.includes('.modal') && this.classList.contains('modal')) return this;
      if (selector.includes('[inert]') && this.inert) return this;
      if (selector.includes('[hidden]') && this.hidden) return this;
      if (selector.includes('[aria-hidden="true"]') && this.getAttribute('aria-hidden') === 'true') return this;
      if (selector.includes('[data-close-modal]') && this.hasAttribute('data-close-modal')) return this;
      return this.parentElement?.closest(selector) || null;
    }
    querySelector(selector) {
      if (selector.includes('data-modal-initial-focus')) return this.initial || null;
      if (selector === 'form') return this.form || null;
      if (selector === 'h2, h3') return this.heading || null;
      return null;
    }
    querySelectorAll(selector) {
      if (selector === '.modal-body') return [];
      if (selector.startsWith('input:not')) return this.inputs || [];
      return this.focusables || [];
    }
    focus() { document.activeElement = this; }
    blur() { document.activeElement = document.body; }
    dispatchEvent(event) { this.events[event.type]?.(event); }
  }
  const body = new Element('body');
  const main = new Element('main', body);
  const trigger = new Element('trigger', main);
  trigger.tabIndex = 0;
  const first = new Element('first', body, ['modal', 'hidden']);
  const second = new Element('second', body, ['modal', 'hidden']);
  for (const modal of [first, second]) {
    modal.initial = new Element(modal.id + '-title', modal);
    const close = new Element(modal.id + '-close', modal);
    const action = new Element(modal.id + '-action', modal);
    close.tabIndex = action.tabIndex = 0;
    close.setAttribute('data-close-modal', '');
    modal.focusables = [close, action];
  }
  trigger.setAttribute('aria-controls', first.id);
  const events = {};
  const document = {
    body, activeElement: trigger,
    documentElement: new Element('html'),
    addEventListener: (name, handler) => { (events[name] ||= []).push(handler); },
    getElementById: id => [first, second].find(element => element.id === id),
    querySelectorAll: selector => selector === '.modal' ? [first, second] : selector.includes('first') ? [trigger] : []
  };
  document.documentElement.style.setProperty = function(name, value) { this[name] = value; };
  document.documentElement.style.removeProperty = function(name) { delete this[name]; };
  const timers = new Map();
  let timerId = 0;
  const window = {
    scrollX: 0, scrollY: 830, innerHeight: 800,
    location: { href: 'https://example.test/' },
    addEventListener() {},
    matchMedia: () => ({ matches: reducedMotion }),
    scrollTo(options) { this.restoredScroll = options; }
  };
  context = vm.createContext({
    window, document, HTMLElement: Element, URL,
    CustomEvent: class { constructor(type) { this.type = type; } },
    getComputedStyle: () => ({ visibility: 'visible' }),
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: callback => callback()
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/global/modals.js'), 'utf8'), context);
  const emit = (name, target, details = {}) => {
    const event = { target, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...details };
    for (const handler of events[name] || []) handler(event);
    return event;
  };
  return { window, document, first, second, main, trigger, emit, timers, Element };
}

test('Opening and closing locks background, sets semantics, and restores scroll and focus', () => {
  const h = harness();
  h.window.openAppModal(h.first, h.trigger);
  assert.equal(h.main.inert, true);
  assert.equal(h.document.body.style.position, 'fixed');
  assert.equal(h.document.body.style.top, '-830px');
  assert.equal(h.first.getAttribute('aria-modal'), 'true');
  assert.equal(h.first.getAttribute('aria-hidden'), null);
  assert.equal(h.document.activeElement, h.first.initial);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'true');
  h.window.closeAppModal(h.first);
  assert.equal(h.main.inert, false);
  assert.equal(h.first.inert, true);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.window.restoredScroll.top, 830);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
});

test('Nested dialogs isolate the top layer and keep a return target when the parent is replaced', () => {
  const h = harness();
  h.window.openAppModal(h.first, h.trigger);
  h.window.openAppModal(h.second, h.first.focusables[1]);
  assert.equal(h.first.inert, true);
  assert.equal(h.first.getAttribute('aria-modal'), null);
  assert.equal(h.second.getAttribute('aria-modal'), 'true');
  h.window.closeAppModal(h.first);
  assert.equal(h.main.inert, true);
  assert.equal(h.document.activeElement, h.second.initial);
  h.window.closeAppModal(h.second);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.main.inert, false);
});

test('Tab wraps both ways and Escape dismisses only the top dialog', () => {
  const h = harness();
  h.window.openAppModal(h.first);
  const [first, last] = h.first.focusables;
  h.emit('keydown', h.first.initial, { key: 'Tab', shiftKey: true });
  assert.equal(h.document.activeElement, last);
  last.focus();
  assert.equal(h.emit('keydown', last, { key: 'Tab' }).prevented, true);
  assert.equal(h.document.activeElement, first);
  h.emit('keydown', first, { key: 'Tab', shiftKey: true });
  assert.equal(h.document.activeElement, last);
  h.window.openAppModal(h.second);
  h.emit('keydown', h.second, { key: 'Escape', isComposing: true });
  assert.equal(h.second.classList.contains('active'), true);
  h.emit('keydown', h.second, { key: 'Escape' });
  assert.equal(h.second.classList.contains('active'), false);
  assert.equal(h.first.classList.contains('active'), true);
});

test('Confirmation retains the return target when disabling submit has blurred to body', () => {
  const h = harness();
  h.window.openAppModal(h.first, h.trigger);
  h.document.activeElement = h.document.body;
  h.window.openAppModal(h.second);
  h.window.closeAppModal(h.first);
  h.window.closeAppModal(h.second);
  assert.equal(h.document.activeElement, h.trigger);
});

test('An Escape already handled by a nested control keeps its dialog open', () => {
  const h = harness();
  h.window.openAppModal(h.first, h.trigger);
  h.emit('keydown', h.first.initial, { key: 'Escape', defaultPrevented: true });
  assert.equal(h.first.classList.contains('active'), true);
  h.emit('keydown', h.first.initial, { key: 'Escape' });
  assert.equal(h.first.classList.contains('active'), false);
});

test('Reopening cancels an unfinished close, including reduced motion', () => {
  for (const reducedMotion of [false, true]) {
    const h = harness({ reducedMotion });
    h.window.openAppModal(h.first);
    h.window.closeAppModal(h.first);
    assert.equal([...h.timers.values()][0].delay, reducedMotion ? 0 : 220);
    h.window.openAppModal(h.first);
    assert.equal(h.timers.size, 0);
    assert.equal(h.first.inert, false);
    assert.equal(h.first.classList.contains('active'), true);
  }
});

test('Backdrop dismissal requires a complete outside gesture and preserves a draft', () => {
  const h = harness();
  h.window.openAppModal(h.first);
  h.emit('pointerdown', h.first.focusables[0]);
  h.emit('click', h.first);
  assert.equal(h.first.classList.contains('active'), true);
  h.first.form = new h.Element('form', h.first);
  h.first.form.inputs = [{ value: 'Draft name' }];
  h.emit('pointerdown', h.first);
  h.emit('click', h.first);
  assert.equal(h.first.classList.contains('active'), true);
  h.first.form.inputs[0].value = '';
  h.emit('pointerdown', h.first);
  h.emit('click', h.first);
  assert.equal(h.first.classList.contains('active'), false);
});
