const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../workers/capi/google-lead.mjs');
const order = () => ({ order_id: 'one', created_at: new Date().toISOString(), value: 89, currency: 'GEL', google_delivery: 'server',
  phone: 'PRIVATE', measurement: { google_server_capable: true, consent: { analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'denied' }, google: { client_id: '123.456', session_id: '123' } } });
function storage() { const data = new Map(); return { data, async get(k) { return structuredClone(data.get(k)); }, async put(k,v) { data.set(k,structuredClone(v)); }, async setAlarm() {}, async deleteAll() { data.clear(); }, async transaction(fn) { return fn(this); } }; }
test('Google payload uses real client/session IDs and the existing lead, without contact or Meta fields', async () => {
  const { googleLead } = await load(); const payload = googleLead(order());
  assert.equal(payload.events[0].name, 'generate_lead'); assert.equal(payload.consent.ad_personalization, 'DENIED');
  assert.ok(!JSON.stringify(payload).includes('PRIVATE'));
  assert.throws(() => googleLead({ ...order(), google_delivery: 'browser' }));
  const denied = order(); denied.measurement.consent.analytics_storage = 'denied'; assert.throws(() => googleLead(denied));
  const legacy = order(); delete legacy.measurement.google_server_capable; assert.throws(() => googleLead(legacy));
});
test('Google delivery stores once, sends once and keeps only a receipt tombstone', async t => {
  const { GoogleLeadDelivery, googleLead } = await load(), store = storage(); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: 204 }); });
  const object = new GoogleLeadDelivery({ storage: store }, { GA4_API_SECRET: 'test', GA4_MEASUREMENT_ID: 'G-TEST' });
  const enqueue = () => object.fetch(new Request('https://local/enqueue', { method: 'POST', body: JSON.stringify(googleLead(order())) }));
  assert.equal((await enqueue()).status, 202); assert.equal((await enqueue()).status, 200);
  await object.alarm(); assert.equal(calls, 1); assert.equal(store.data.get('job').state, 'http_accepted');
  assert.equal(store.data.get('job').payload, undefined); assert.equal((await enqueue()).status, 200);
});
test('Unknown network outcomes are never automatically resent as duplicate leads', async t => {
  const { GoogleLeadDelivery, googleLead } = await load(), store = storage(); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw Error('timeout'); });
  const object = new GoogleLeadDelivery({ storage: store }, { GA4_API_SECRET: 'test', GA4_MEASUREMENT_ID: 'G-TEST' });
  await object.fetch(new Request('https://local/enqueue', { method: 'POST', body: JSON.stringify(googleLead(order())) }));
  await object.alarm(); assert.equal(calls, 1); assert.equal(store.data.get('job').state, 'uncertain');
  assert.equal(store.data.get('job').payload, undefined);
  // Recovery after interruption likewise records uncertainty without a network call.
  await store.put('job', { state: 'sending', event_id: 'lead_interrupted' }); await object.alarm();
  assert.equal(calls, 1); assert.equal(store.data.get('job').state, 'uncertain');
});
