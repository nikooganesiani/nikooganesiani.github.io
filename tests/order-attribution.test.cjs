const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '../assets/js/global', file), 'utf8');
const sample = { name: 'Fixture', phone: '+995500000000', product_id: 'fixture' };

function browser({ blocked = false } = {}) {
  let consent = false;
  let now = Date.UTC(2026, 10, 15);
  const storage = new Map();
  const listeners = new Map();
  const requests = [];
  const location = { search: '' };
  let callback;
  const window = {
    enkaPrivacy: { allowsAnalytics: () => consent },
    ENKA_TURNSTILE_SITE_KEY: 'fixture',
    turnstile: {
      render(_, options) { callback = options.callback; return 'widget'; },
      execute() { callback('challenge'); },
      remove() {},
    },
    addEventListener(name, fn) { listeners.set(name, [...(listeners.get(name) ?? []), fn]); },
  };
  const context = vm.createContext({
    window, location, URLSearchParams, AbortSignal, TextEncoder, Uint8Array,
    setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    Date: class extends Date { static now() { return now; } },
    document: { createElement() { return { remove() {} }; } },
    sessionStorage: {
      getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); },
      removeItem(key) { if (blocked) throw Error('blocked'); storage.delete(key); },
    },
    async fetch(_, options) {
      requests.push({ key: options.headers['Idempotency-Key'], body: JSON.parse(options.body) });
      return Response.json({ error: 'temporary' }, { status: 503 });
    },
  });
  const emit = () => (listeners.get('enka:privacy-change') ?? []).forEach(fn => fn({ detail: { analytics: consent } }));
  vm.runInContext(read('order-intake.js'), context);
  return {
    requests, storage,
    visit(search) {
      location.search = search;
      // Site navigation loads the attribution script again in the same tab.
      vm.runInContext(read('order-attribution.js'), context);
    },
    choose(value) { consent = value; emit(); },
    attribution() { return JSON.parse(JSON.stringify(window.enkaOrderAttribution.current())); },
    advance(ms) { now += ms; },
    submit() { return window.submitEnkaOrder({ append() {} }, sample); },
  };
}

test('uses the latest eligible paid campaign across navigation and clears history on withdrawal', async () => {
  const page = browser();
  page.visit('?utm_source=Facebook&utm_medium=paid_social&utm_id=100001234567&utm_campaign=First');
  assert.equal(page.attribution(), null);
  assert.equal(page.storage.size, 0);
  page.choose(true);
  page.visit('?utm_source=facebook&utm_medium=cpc&utm_id=200001234567&utm_campaign=Second&utm_term=someone%40example.invalid&fbclid=excluded');
  page.visit('?utm_source=newsletter&utm_medium=email&utm_campaign=Organic');
  page.visit('');
  assert.deepEqual(page.attribution(), {
    utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'Second', utm_id: '200001234567',
  });
  await page.submit();
  assert.deepEqual(page.requests[0].body.attribution, page.attribution());
  page.visit('?utm_source=facebook&utm_medium=cpc&utm_id=300001234567');
  await page.submit();
  assert.equal(page.requests[1].key, page.requests[0].key);
  assert.equal(page.requests[1].body.attribution.utm_id, '200001234567');
  page.choose(false);
  await page.submit();
  assert.equal(page.requests[2].key, page.requests[0].key);
  assert.equal('attribution' in page.requests[2].body, false);
  assert.equal(page.attribution(), null);
  assert.equal(page.storage.has('enka_campaign_touches_v1'), false);
});

test('discards expired touches and still submits with blocked storage', async () => {
  const page = browser();
  page.choose(true);
  page.visit('?utm_source=email&utm_campaign=Launch');
  page.advance(7 * 24 * 60 * 60 * 1000);
  assert.equal(page.attribution(), null);
  const blocked = browser({ blocked: true });
  blocked.choose(true);
  blocked.visit('?utm_source=facebook&utm_medium=paid_social&utm_id=1001');
  await blocked.submit();
  assert.equal(blocked.requests[0].body.attribution.utm_id, '1001');
});
