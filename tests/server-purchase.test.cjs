const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, createHash } = require('node:crypto');
const load = () => import('../workers/capi/purchase.mjs');
test('Purchase uses signed backend context and only consented Meta cookies', async () => {
  const { purchaseEvent } = await load();
  const measurement = { version: 1, consent: { ad_storage: 'granted' }, client_ip_address: '203.0.113.1',
    client_user_agent: 'Browser', meta: { fbp: 'fb.1.123.456', fbc: 'fb.1.123.click' }, page_url: 'https://enkaelectronics.com.ge/item/?private=1' };
  const event = await purchaseEvent({ ...order(), measurement });
  assert.equal(event.user_data.fbc, measurement.meta.fbc);
  assert.equal(event.user_data.client_ip_address, '203.0.113.1');
  assert.equal(event.event_source_url, 'https://enkaelectronics.com.ge/item/');
  const denied = await purchaseEvent({ ...order(), measurement: { ...measurement, consent: { ad_storage: 'denied' } } });
  assert.equal(denied.user_data.fbc, undefined); assert.equal(denied.user_data.fbp, undefined);
});
const order = (id = 'order-1') => ({ order_id: id, created_at: new Date().toISOString(), currency: 'GEL', value: 89, phone: '+995 555 12 34 56', items: [{ id: 'sku-1', quantity: 1, item_price: 89 }] });
function store() {
  const data = new Map();
  return { data, alarm: null, async get(key) { return structuredClone(data.get(key)); }, async put(key, value) { data.set(key, structuredClone(value)); }, async setAlarm(at) { this.alarm = at; }, async deleteAll() { data.clear(); }, async transaction(fn) { return fn(this); } };
}
const signed = (payload, secret = 'test-secret', path = '/server/order-created', timestamp = Math.floor(Date.now() / 1000)) => {
  const body = JSON.stringify(payload);
  return new Request('https://capi.enkaelectronics.com.ge' + path, { method: 'POST', body, headers: { 'X-Enka-Timestamp': String(timestamp), 'X-Enka-Signature': createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex') } });
};
function backend(mod) {
  const objects = new Map(), env = { ORDER_WEBHOOK_SECRET: 'test-secret', FB_ACCESS_TOKEN: 'test-token', PIXEL_ID: '123' };
  env.PURCHASE_DELIVERY = { idFromName: id => id, get(id) { if (!objects.has(id)) { const storage = store(); objects.set(id, { storage, object: new mod.PurchaseDelivery({ storage }, env) }); } return { fetch: (url, options) => objects.get(id).object.fetch(new Request(url, options)) }; } };
  return { objects, env };
}
test('Server purchase hashes normalized phone and whitelists canonical order fields', async () => {
  const { purchaseEvent } = await load();
  const event = await purchaseEvent({ ...order(), name: 'PRIVATE', email: 'PRIVATE', fbp: 'PRIVATE', event_source_url: 'PRIVATE' });
  assert.equal(event.event_id, 'purchase_order-1');
  assert.equal(event.user_data.ph[0], createHash('sha256').update('995555123456').digest('hex'));
  assert.ok(!JSON.stringify(event).includes('PRIVATE'));
  assert.ok(!JSON.stringify(event).includes('995555123456'));
  assert.deepEqual(Object.keys(event.user_data), ['ph']);
  assert.equal(event.custom_data.value, 89);
  for (const patch of [{ value: 1 }, { created_at: 'bad' }, { created_at: new Date(Date.now() - 8 * 86400000).toISOString() }, { currency: 'USD' }, { phone: 'bad' }, { items: [] }, { items: [{ id: 'x', quantity: 0, item_price: 89 }] }]) await assert.rejects(purchaseEvent({ ...order(), ...patch }));
});
test('Only authenticated backend requests enqueue, with permanent order-ID deduplication', async () => {
  const mod = await load(), b = backend(mod);
  assert.equal((await mod.acceptOrderRequest(signed(order(), 'wrong'), b.env)).status, 401);
  assert.equal((await mod.acceptOrderRequest(signed(order(), 'test-secret', undefined, 1), b.env)).status, 401);
  assert.equal(b.objects.size, 0);
  assert.equal((await mod.acceptOrderRequest(signed(order()), b.env)).status, 202);
  assert.equal((await mod.acceptOrderRequest(signed(order()), b.env)).status, 200);
  // Two real orders for the same phone/product must both be counted.
  assert.equal((await mod.acceptOrderRequest(signed(order('order-2')), b.env)).status, 202);
  assert.equal(b.objects.size, 2);
  const job = b.objects.get('order-1');
  assert.equal(job.storage.data.get('job').state, 'pending');
  assert.ok(job.storage.alarm);
  const status = await mod.acceptOrderRequest(signed({ order_id: 'order-1' }, 'test-secret', '/server/order-status'), b.env);
  assert.ok(!JSON.stringify(await status.json()).includes('user_data'));
});
test('Meta outage retries the original event; delivery clears hashes and retains a dedupe tombstone', async t => {
  const mod = await load(), b = backend(mod);
  await mod.acceptOrderRequest(signed(order()), b.env);
  const job = b.objects.get('order-1'), requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { requests.push({ url, options }); return Response.json(requests.length === 1 ? { error: { code: 2, is_transient: true } } : { events_received: 1 }, { status: requests.length === 1 ? 400 : 200 }); });
  await job.object.alarm();
  assert.equal(job.storage.data.get('job').state, 'pending');
  assert.equal(job.storage.data.get('job').attempts, 1);
  await job.object.alarm();
  assert.equal(requests[0].options.body, requests[1].options.body);
  assert.ok(!requests[0].url.includes('test-token'));
  assert.equal(job.storage.data.get('job').state, 'delivered');
  assert.equal(job.storage.data.get('job').event, undefined);
  assert.equal((await mod.acceptOrderRequest(signed(order()), b.env)).status, 200);
});
test('Permanent rejection and expired events do not retry forever', async t => {
  const mod = await load(), b = backend(mod);
  await mod.acceptOrderRequest(signed(order()), b.env);
  const job = b.objects.get('order-1');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 100 } }, { status: 400 }));
  await job.object.alarm();
  assert.equal(job.storage.data.get('job').state, 'failed');
  assert.equal(job.storage.data.get('job').event, undefined);
  await job.object.alarm();
  assert.equal(job.storage.data.size, 0);
});
test('A network failure or malformed success does not mark a job delivered', async t => {
  const mod = await load(), b = backend(mod);
  await mod.acceptOrderRequest(signed(order()), b.env);
  const job = b.objects.get('order-1');
  t.mock.method(globalThis, 'fetch', async () => { throw Error('offline'); });
  await job.object.alarm();
  assert.equal(job.storage.data.get('job').state, 'pending');
  globalThis.fetch = async () => Response.json({});
  await job.object.alarm();
  assert.equal(job.storage.data.get('job').state, 'pending');
});

test('Backend signer interoperates with Worker verification', async () => {
  const mod = await load(), b = backend(mod);
  const { signedRequest } = await import('../workers/capi/sign-request.mjs');
  const request = await signedRequest('https://capi.enkaelectronics.com.ge/server/order-created', order(), 'test-secret');
  assert.equal((await mod.acceptOrderRequest(request, b.env)).status, 202);
});

