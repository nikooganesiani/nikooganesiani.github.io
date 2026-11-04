const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(fetch) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', innerHTML: '', disabled: false, style: {}, attrs: {}, events: {},
      addEventListener(name, callback) { this.events[name] = callback; },
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this.attrs[name]; },
      classList: { contains: () => true }, contains: () => true, focus() {}
    });
    return elements.get(id);
  }
  const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    window: { location: new URL('https://example.test/'), openAppModal() {}, addEventListener() {}, WORKER_URL_TRACKING: '/tracking' },
    document: { getElementById: element, addEventListener(name, callback) { if (name === 'DOMContentLoaded') callback(); } },
    history: { pushState() {}, replaceState() {} },
    fetch, URL, URLSearchParams, AbortController, console,
    setTimeout: (callback, delay) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/main/tracking.js'), 'utf8'), context);
  return { element, context, timers, check: () => element('trackingCheckBtn').events.click() };
}

test('Closing and reopening tracking aborts old work and ignores late responses', async () => {
  const requests = [];
  const h = harness((url, options) => new Promise(resolve => requests.push({ options, resolve })));
  h.element('trackingOrderId').value = 'first';
  const first = h.check();
  assert.equal(h.element('trackingCheckBtn').disabled, true);
  await h.check();
  assert.equal(requests.length, 1);
  h.element('trackingModal').events['modal:close']();
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(h.element('trackingCheckBtn').disabled, false);
  h.context.window.openTracking('second');
  const second = h.check();
  requests[0].resolve(new Response('{"data":[]}'));
  await first;
  assert.equal(h.element('trackingResult').innerHTML, '');
  assert.equal(h.element('trackingCheckBtn').disabled, true);
  requests[1].resolve(new Response('{"data":[]}'));
  await second;
  assert.match(h.element('trackingResult').innerHTML, /შეკვეთა ვერ მოიძებნა/);
  assert.equal(h.element('trackingCheckBtn').disabled, false);
  assert.equal(h.timers.size, 0);
});

test('Tracking failures retain the number and allow retry; empty numbers never fetch', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return new Response('{}', { status: 503 }); });
  await h.check();
  assert.equal(calls, 0);
  assert.equal(h.element('trackingOrderId').attrs['aria-invalid'], 'true');
  h.element('trackingOrderId').value = 'retry-me';
  await h.check();
  assert.equal(h.element('trackingOrderId').value, 'retry-me');
  assert.equal(h.element('trackingCheckBtn').disabled, false);
  assert.match(h.element('trackingResult').textContent, /ვერ მოხერხდა/);
  await h.check();
  assert.equal(calls, 2);
});
