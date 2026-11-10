const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { parsePrice, normalizeStock, normalizeMedia, productFrontMatter, normalizeCatalog } = require('../generate_pages.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Prices preserve decimals and reject empty, negative, malformed and infinite values', () => {
  assert.equal(parsePrice('1 299,95 ₾'), 1299.95);
  for (const value of ['', ' ', null, undefined, '-1', 'NaN', 'Infinity', '1abc', '1.2.3', '1.234']) assert.ok(Number.isNaN(parsePrice(value)), String(value));
  assert.throws(() => normalizeCatalog([{ id: 'test', name: 'Test', price: '' }]), /Invalid product price/);
});

test('Stock is normalized consistently and unknown states cannot be purchased', () => {
  const context = vm.createContext({ window: {}, document: { addEventListener() {} } });
  vm.runInContext(read('assets/js/global/catalog.js'), context);
  for (const value of [undefined, null, 'in_stock', 'მარაგშია', 'out_of_stock', 'მარაგი ამოიწურა', 'soon', 'მალე იქნება', 'unexpected']) {
    assert.equal(context.window.productStock(value), normalizeStock(value));
    assert.equal(context.window.isProductAvailable({ stockStatus: value, price: '19.95' }), normalizeStock(value) === 'in_stock');
  }
  assert.equal(context.window.isProductAvailable({ price: '0' }), false);
  assert.equal(context.window.isProductAvailable({ price: 'free 123' }), false);
  assert.equal(context.window.isProductAvailable({ price: '19.95', stockStatus: 'out_of_stock', orderable: true }), true);
});

test('Media accepts safe photos and canonical YouTube URLs, deduplicates and drops executable URLs', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'https://user:pass@example.com/x', 'https://youtu.be/invalid', '']) assert.equal(normalizeMedia(value), null);
  assert.equal(normalizeMedia('https://youtu.be/abcdefghijk?t=1'), 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(normalizeMedia('https://www.youtube.com/shorts/abcdefghijk'), 'https://www.youtube.com/watch?v=abcdefghijk');
  const yaml = productFrontMatter({ id: 'test', name: 'Test', price: '19,95 ₾', oldPrice: '10', images: ['javascript:x', 'https://example.com/photo.webp', 'https://example.com/photo.webp'] });
  assert.match(yaml, /price: "19.95"/);
  assert.match(yaml, /oldPrice: ""/);
  assert.match(yaml, /warranty: ""/);
  assert.match(yaml, /images: \["https:\/\/example.com\/photo.webp"\]/);
});

function harness(submitEnkaOrder, overrides = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', hidden: false, disabled: false, textContent: '', dataset: {}, attrs: {}, events: {},
      addEventListener(type, handler) { this.events[type] = handler; },
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this.attrs[name]; },
      toggleAttribute(name, active) { if (active) this.attrs[name] = ''; else delete this.attrs[name]; },
      focus() { context.focused = id; }
    });
    return elements.get(id);
  }
  const confirmations = [], analytics = [], recorded = [], directFetches = [];
  const context = vm.createContext({
    window: {
      submitEnkaOrder,
      currentProduct: { id: 'canonical-slug', sku: 'different-sku', name: 'Test', price: '19.95', oldPrice: '', stockStatus: 'in_stock' },
      formatPhoneInput() {},
      showOrderConfirm: data => confirmations.push(data),
      sendCapiEvent: (...args) => analytics.push(args),
      ...overrides
    },
    document: { getElementById: element, addEventListener(type, fn) { if (type === 'DOMContentLoaded') fn(); } },
    checkOrderSpamGuard: () => ({ allowed: true, exactSignature: 'signature' }),
    recordSuccessfulOrder: signature => recorded.push(signature),
    fetch(...args) { directFetches.push(args); throw new Error('Unexpected direct fetch'); }, AbortSignal, Promise, console
  });
  element('inlineOrderForm').dataset.available = 'true';
  element('inlineName').value = 'Test Name';
  element('inlinePhone').value = '+995 555 12 34 56';
  vm.runInContext(read('assets/js/product/inline-order.js'), context);
  const submit = () => element('inlineOrderForm').events.submit({ preventDefault() {} });
  return { context, element, submit, confirmations, analytics, recorded, directFetches };
}

test('Inline order waits for acceptance, blocks repeated submit, and preserves canonical identity and the analytics price', async () => {
  let resolve, calls = 0, body;
  const h = harness((form, data) => { calls++; body = data; return new Promise(r => { resolve = r; }); });
  const pending = h.submit();
  await h.submit();
  assert.equal(calls, 1);
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.element('submitInlineOrderBtn').disabled, true);
  assert.equal(h.element('inlineOrderForm').attrs['aria-busy'], 'true');
  assert.equal(body.product_id, 'canonical-slug');
  assert.equal(body.expected_price, 19.95);
  assert.equal(body.phone, '+995555123456');
  resolve(new Response('{"success":true}'));
  await pending;
  assert.equal(h.confirmations.length, 1);
  assert.equal(h.analytics.length, 1);
  assert.equal(h.analytics[0][1].value, 19.95);
  assert.deepEqual(h.recorded, ['signature']);
  assert.equal(h.context.window.enkaOrderPending, false);
  assert.equal(h.element('submitInlineOrderBtn').disabled, false);
});

test('Missing order adapter shows an error without submitting or tracking an order', async () => {
  const h = harness(undefined, { WORKER_URL: 'https://example.test/order', ENKA_TURNSTILE_SITE_KEY: 'fixture' });
  await h.submit();
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.analytics.length, 0);
  assert.equal(h.directFetches.length, 0);
  assert.equal(h.element('inlineOrderError').hidden, false);
  assert.equal(h.element('submitInlineOrderBtn').disabled, false);
});

test('HTTP, application, network and timeout failures never confirm or track a purchase and allow retry', async () => {
  for (const failure of [() => new Response('{}', { status: 503 }), () => new Response('{"success":false}'), () => new Response('{"ok":false}'), () => new Response('{"error":"unavailable"}'), () => { throw new Error('offline'); }, () => { throw new DOMException('Timed out', 'TimeoutError'); }]) {
    let calls = 0;
    const h = harness(async () => ++calls === 1 ? failure() : new Response('{"success":true}'));
    await h.submit();
    assert.equal(h.confirmations.length, 0);
    assert.equal(h.analytics.length, 0);
    assert.equal(h.recorded.length, 0);
    assert.equal(h.element('inlineOrderError').hidden, false);
    assert.equal(h.element('inlineName').value, 'Test Name');
    assert.equal(h.element('submitInlineOrderBtn').disabled, false);
    await h.submit();
    assert.equal(calls, 2);
    assert.equal(h.confirmations.length, 1);
  }
});

test('Invalid fields announce errors and focus the first invalid input without a request', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return new Response('{}'); });
  h.element('inlineName').value = 'a';
  h.element('inlinePhone').value = '123456789';
  await h.submit();
  assert.equal(calls, 0);
  assert.equal(h.context.focused, 'inlineName');
  assert.equal(h.element('inlineName').attrs['aria-invalid'], 'true');
  assert.equal(h.element('inlinePhone').attrs['aria-invalid'], 'true');
  assert.equal(h.element('inlinePhoneError').hidden, false);
});

test('Unavailable products, honeypots and an order pending in the quick form cannot submit', async () => {
  for (const change of [h => h.element('inlineOrderForm').dataset.available = 'false', h => h.element('inlineOrderFields').disabled = true, h => h.element('inlineEmailHp').value = 'bot', h => h.context.window.enkaOrderPending = true]) {
    let calls = 0;
    const h = harness(async () => { calls++; return new Response('{}'); });
    change(h);
    await h.submit();
    assert.equal(calls, 0);
  }
});

test('Analytics exceptions, rejections and stalled analytics never prevent an accepted confirmation', async () => {
  for (const analytics of [() => { throw Error('analytics blocked'); }, () => Promise.reject(Error('offline')), () => new Promise(() => {})]) {
    const h = harness(async () => new Response('{}'), { sendCapiEvent: analytics });
    await h.submit();
    assert.equal(h.confirmations.length, 1);
    assert.equal(h.element('inlineOrderError').hidden, true);
  }
});

test('A previously accepted duplicate reopens confirmation without resending or resaving', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return new Response('{}'); });
  h.context.checkOrderSpamGuard = () => ({ allowed: false, reason: 'duplicate_exact' });
  await h.submit();
  assert.equal(calls, 0);
  assert.equal(h.confirmations.length, 1);
  assert.equal(h.confirmations[0].save, false);
  assert.equal(h.analytics.length, 0);
});

test('The shared duplicate guard retains accepted orders when browser storage is blocked', () => {
  const context = vm.createContext({
    window: {}, document: { getElementById() { return null; }, addEventListener() {} },
    localStorage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }, console
  });
  vm.runInContext(read('assets/js/main/orders.js'), context);
  const guard = context.checkOrderSpamGuard('Test', '+995555123456', 'product-id');
  assert.equal(guard.allowed, true);
  context.recordSuccessfulOrder(guard.exactSignature);
  const duplicate = context.checkOrderSpamGuard('Test', '+995555123456', 'product-id');
  assert.equal(duplicate.allowed, false);
  assert.equal(duplicate.reason, 'duplicate_exact');
});
