const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function browser({ initial = {}, blocked = false } = {}) {
  const store = new Map(Object.entries(initial));
  const cookies = new Map();
  const requests = [];
  const listeners = new Map();
  let now = Date.now();
  const fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return new Response('{}'); };
  const location = { hostname: 'enkaelectronics.com.ge', protocol: 'https:', pathname: '/', search: '', href: 'https://enkaelectronics.com.ge/' };
  const window = {
    location,
    fetch,
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); }
  };
  const context = vm.createContext({
    window, fetch, Response, URL, navigator: { webdriver: false }, crypto: require('node:crypto').webcrypto,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    Date: class extends Date { static now() { return now; } },
    location,
    localStorage: {
      getItem(key) { if (blocked) throw Error('blocked'); return store.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error('blocked'); store.set(key, value); },
      removeItem(key) { if (blocked) throw Error('blocked'); store.delete(key); }
    },
    document: {
      get cookie() { return [...cookies].map(([key, value]) => key + '=' + value).join('; '); },
      set cookie(value) { const [key, data] = value.split(';')[0].split('='); if (value.includes('Max-Age=0;')) cookies.delete(key); else cookies.set(key, data); },
      referrer: '', getElementById(id) { return id === 'productData' ? { dataset: { id: 'x', name: 'Example', price: '89' } } : { style: {}, textContent: '' }; }
    },
    console: { warn() {}, error() {}, info() {} }, setTimeout: () => 0, clearTimeout() {}
  });
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  run('assets/js/global/privacy.js');
  run('capi.js');
  return { window, store, cookies, requests, run, advance(ms) { now += ms; } };
}

test('Analytics defaults to off and an old one-button notice does not count as consent', () => {
  const b = browser({ initial: { cookie_consent_accepted: 'true', _fbp: 'old', _capi_last_user: 'private', myOrders: 'keep' } });
  assert.equal(b.window.enkaPrivacy.getChoice(), null);
  assert.equal(b.window.sendCapiEvent('PageView'), null);
  assert.equal(b.requests.length, 0);
  assert.equal(b.cookies.size, 0);
  assert.ok(!b.store.has('_fbp') && !b.store.has('_capi_last_user'));
  assert.equal(b.store.get('myOrders'), 'keep');
});

test('Explicit consent allows events; revocation purges identifiers and blocks further events', () => {
  const b = browser();
  assert.equal(b.window.enkaPrivacy.setChoice(true), true);
  b.window.sendCapiEvent('PageView');
  assert.equal(b.requests.length, 1);
  assert.ok(b.cookies.has('_fbp') && b.cookies.has('_capi_uid'));
  b.window.sendCapiEvent('Purchase', { content_ids: ['x'] }, 'purchase-1', { name: 'Test', phone: '+995555123456' });
  assert.equal(b.requests.at(-1).body.phone, '+995555123456');
  b.window.enkaPrivacy.setChoice(false);
  assert.equal(b.cookies.size, 0);
  for (const key of ['_fbp', '_capi_uid', '_capi_last_user', '_capi_recent_purchases']) assert.ok(!b.store.has(key), key);
  const count = b.requests.length;
  assert.equal(b.window.sendCapiEvent('Purchase', {}, 'purchase-2'), null);
  assert.equal(b.requests.length, count);
  b.window.enkaPrivacy.setChoice(true);
  b.window.sendCapiEvent('PageView');
  assert.equal(b.requests.length, count + 1);
});

test('Consent expiration, corrupt storage and another tab revoking consent fail closed', () => {
  const b = browser({ initial: { enka_privacy_v1: '{broken' } });
  assert.equal(b.window.enkaPrivacy.allowsAnalytics(), false);
  b.window.enkaPrivacy.setChoice(true);
  b.advance(181 * 86400000);
  assert.equal(b.window.sendCapiEvent('PageView'), null);
  assert.equal(b.window.enkaPrivacy.getChoice(), null);
  b.window.enkaPrivacy.setChoice(true);
  b.store.set('enka_privacy_v1', JSON.stringify({ ...JSON.parse(b.store.get('enka_privacy_v1')), analytics: false }));
  b.window.dispatchEvent({ type: 'storage', key: 'enka_privacy_v1' });
  assert.equal(b.window.enkaPrivacy.getChoice(), false);
  assert.equal(b.window.sendCapiEvent('PageView'), null);
});

test('Blocked storage keeps a choice in memory and never interferes with ordinary orders', async () => {
  const b = browser({ blocked: true });
  assert.equal(b.window.enkaPrivacy.setChoice(false), false);
  assert.equal(b.window.enkaPrivacy.getChoice(), false);
  const response = await b.window.fetch('https://form-handler.enkaelectronics.com.ge', {
    method: 'POST', body: JSON.stringify({ name: 'Test', phone: '+995555123456', product_id: 'x' })
  });
  assert.equal(response.status, 200);
  assert.equal(b.requests.length, 1);
  assert.equal(b.window.enkaPrivacy.setChoice(true), false);
  b.window.sendCapiEvent('PageView');
  assert.equal(b.requests.length, 2);
});

test('A first product view waits for consent and is recorded only once after opting in', () => {
  const b = browser();
  b.run('assets/js/product/tracking.js');
  assert.equal(b.requests.length, 0);
  b.window.enkaPrivacy.setChoice(true);
  assert.deepEqual(b.requests.map(request => request.body.event_name), ['PageView', 'ViewContent']);
  assert.equal(b.requests[1].body.custom_data.value, 89);
  b.window.enkaPrivacy.setChoice(false);
  b.window.enkaPrivacy.setChoice(true);
  assert.equal(b.requests.length, 2);
});
