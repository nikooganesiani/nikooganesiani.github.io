const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const load = () => import('../workers/capi/order-proxy.mjs');
const origin = 'https://enkaelectronics.com.ge';
const key = 'ABCDEF00-1234-4321-8765-123456789ABC';
function request(body, headers = {}) {
  return new Request('https://capi.enkaelectronics.com.ge/orders', { method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key,
    'CF-Connecting-IP': '203.0.113.1', 'User-Agent': 'Actual browser', ...headers }, body: JSON.stringify(body) });
}
test('Proxy signs canonical context and preserves order/challenge without trusting client IP or prices', async () => {
  const { proxyOrder } = await load(); let sent;
  const result = await proxyOrder(request({ name: 'Test', phone: '+995555000000', items: [{ site_id: '1', quantity: 1 }], turnstile_token: 'token',
    measurement: { client_ip_address: 'spoof', client_user_agent: 'spoof', consent: { ad_storage: 'granted', analytics_storage: 'granted' },
      clicks: { gclid: 'click' }, utm: { utm_source: 'ads' }, page_url: origin + '/product/?phone=private' } }),
    { ORDER_WEBHOOK_SECRET: 'secret' }, async (url, options) => { sent = options; return Response.json({ id: 'one' }); });
  assert.equal(result.status, 200);
  const body = JSON.parse(sent.body), attr = body.attribution, context = JSON.parse(attr.__enka_measurement);
  assert.equal(context.client_ip_address, '203.0.113.1'); assert.equal(context.client_user_agent, 'Actual browser');
  assert.equal(context.page_url, origin + '/product/'); assert.equal(body.turnstile_token, 'token');
  assert.equal(sent.headers['Idempotency-Key'], key.toLowerCase());
  assert.equal(attr.__enka_signature, createHmac('sha256', 'secret').update('intake.' + attr.__enka_timestamp + '.' + key.toLowerCase() + '.' + attr.__enka_measurement).digest('hex'));
});
test('Denied consent strips Google/Meta identifiers and UTM regardless of browser body', async () => {
  const { cleanMeasurement } = await load();
  const value = cleanMeasurement({ clicks: { gclid: 'private' }, google: { client_id: 'private' }, meta: { fbp: 'fb.1.1.1' }, utm: { utm_source: 'ads' } }, request({}));
  assert.equal(value.clicks, undefined); assert.equal(value.google, undefined); assert.equal(value.meta, undefined);
  assert.deepEqual(value.utm, {});
});
test('Proxy rejects foreign origins, extra fields and oversized bodies before any upstream call', async () => {
  const { proxyOrder } = await load(); let calls = 0;
  const send = req => proxyOrder(req, { ORDER_WEBHOOK_SECRET: 'secret' }, async () => { calls++; return Response.json({}); });
  assert.equal((await send(request({}, { Origin: 'https://evil.example' }))).status, 403);
  assert.equal((await send(request({ price: 1 }))).status, 400);
  assert.equal((await send(request({ name: 'x'.repeat(13000) }))).status, 413);
  assert.equal(calls, 0);
});

test('Proxy signs a bounded, ordered campaign trail without adding new attribution keys', async () => {
  const { proxyOrder } = await load();
  const now = Date.now();
  let forwarded;
  const result = await proxyOrder(request({ measurement: {
    consent: { analytics_storage: 'granted' },
    utm: { utm_source: 'facebook', utm_id: '200' },
    campaign_touches: [
      { at: now - 1000, utm_source: 'facebook', utm_id: '200', page: 'contains-private' },
      { at: now - 2000, utm_source: 'instagram', utm_id: '100', fbclid: 'private' },
      { at: now - 2500, utm_source: 'newsletter', utm_id: '995555123456' },
      { at: now - 32 * 86400000, utm_source: 'facebook', utm_id: 'expired' }
    ]
  } }), { ORDER_WEBHOOK_SECRET: 'secret' }, async (_url, options) => {
    forwarded = JSON.parse(options.body);
    return Response.json({ id: 'one' });
  });
  assert.equal(result.status, 200);
  const attr = forwarded.attribution;
  const signed = JSON.parse(attr.__enka_measurement);
  assert.deepEqual(signed.campaign_touches, [
    { at: now - 2500, utm_source: 'newsletter' },
    { at: now - 2000, utm_source: 'instagram', utm_id: '100' },
    { at: now - 1000, utm_source: 'facebook', utm_id: '200' }
  ]);
  assert.equal(attr.campaign_touches, undefined);
  assert.equal(attr.utm_id, '200');
  assert.equal(attr.__enka_signature, createHmac('sha256', 'secret').update('intake.' + attr.__enka_timestamp + '.' + key.toLowerCase() + '.' + attr.__enka_measurement).digest('hex'));
});

test('Denied analytics consent strips the campaign trail from the payload', async () => {
  const { cleanMeasurement } = await load();
  const value = cleanMeasurement({ campaign_touches: [{ at: Date.now(), utm_source: 'facebook', utm_id: '123' }] }, request({}));
  assert.equal(value.campaign_touches, undefined);
});
