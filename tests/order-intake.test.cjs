const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto').webcrypto;
function browser(snapshot) {
  const requests = [], store = new Map(); let accept = false;
  const window = { ENKA_TURNSTILE_SITE_KEY: 'test', enkaMeasurement: { snapshot },
    turnstile: { render(node, options) { options.callback('challenge'); return 1; }, execute() {}, remove() {} } };
  const context = { window, crypto, TextEncoder, AbortSignal, setTimeout, clearTimeout,
    sessionStorage: { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) },
    document: { createElement: () => ({ remove() {} }) },
    fetch: async (url, options) => { requests.push({ url, options }); return Response.json(accept ? { id: 'order', order_no: 1 } : { error: 'retry' }, { status: accept ? 200 : 503 }); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/global/order-intake.js'), 'utf8'), context);
  return {
    requests,
    submit: expected_price => window.submitEnkaOrder({ append() {} }, { name: ' Test ', phone: '+995555000000', product_id: 'product', expected_price }),
    accept() { accept = true; },
  };
}
test('Order proxy receives challenge and context; retries retain the order key', async () => {
  const b = browser(async () => ({ version: 1, consent: { analytics_storage: 'denied' } }));
  await b.submit(); b.accept(); await b.submit();
  assert.equal(b.requests[0].url, 'https://capi.enkaelectronics.com.ge/orders');
  assert.equal(b.requests[0].options.headers['Idempotency-Key'], b.requests[1].options.headers['Idempotency-Key']);
  const body = JSON.parse(b.requests[0].options.body);
  assert.equal(body.turnstile_token, 'challenge'); assert.equal(body.measurement.version, 1);
  assert.deepEqual(body.items, [{ site_id: 'product', quantity: 1 }]);
});
test('Unavailable measurement never blocks the order', async () => {
  const b = browser(async () => { throw Error('blocked'); }); b.accept();
  assert.equal((await b.submit()).status, 200);
  assert.equal(JSON.parse(b.requests[0].options.body).measurement, undefined);
});

test('Refreshing a quote keeps the pending key and sends the price the customer now sees', async () => {
  const b = browser(async () => ({ version: 1 }));
  assert.equal((await b.submit(19.95)).status, 503);
  b.accept();
  assert.equal((await b.submit(21.50)).status, 200);
  const [first, retry] = b.requests.map(({ options }) => options);
  assert.equal(first.headers['Idempotency-Key'], retry.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(first.body).items, [{ site_id: 'product', quantity: 1, expected_price: 19.95 }]);
  assert.deepEqual(JSON.parse(retry.body).items, [{ site_id: 'product', quantity: 1, expected_price: 21.50 }]);
  assert.equal(JSON.parse(retry.body).measurement.version, 1);
  await b.submit(21.50);
  assert.notEqual(b.requests[2].options.headers['Idempotency-Key'], retry.headers['Idempotency-Key']);
});
