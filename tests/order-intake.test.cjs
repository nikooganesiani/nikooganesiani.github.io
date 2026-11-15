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
  return { requests, submit: () => window.submitEnkaOrder({ append() {} }, { name: ' Test ', phone: '+995555000000', product_id: 'product' }), accept() { accept = true; } };
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
