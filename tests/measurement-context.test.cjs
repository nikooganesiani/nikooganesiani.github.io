const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function browser(saved, search = '') {
  let granted = true;
  const listeners = {}, callbacks = [];
  const store = new Map(saved ? [['enka_measurement_v1', JSON.stringify(saved)]] : []);
  const window = { enkaPrivacy: { allowsAnalytics: () => granted },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    gtag: (...args) => callbacks.push(args[3]) };
  const context = { window, URLSearchParams, Date, setTimeout, clearTimeout,
    location: { origin: 'https://enkaelectronics.com.ge', pathname: '/product/', search },
    document: { cookie: '', getElementById: () => ({ dataset: { measurementId: 'G-TEST' } }) },
    localStorage: { getItem: key => store.get(key), setItem: (key, val) => store.set(key, val), removeItem: key => store.delete(key) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/global/measurement-context.js'), 'utf8'), context);
  return { window, store, callbacks, choice(value) { granted = value; listeners['enka:privacy-change'](); },
    complete() { callbacks.splice(0).forEach(fn => fn('123')); } };
}
test('Stored attribution is bounded, whitelisted and expires after 30 days', async () => {
  const b = browser({ private: 'secret', google: { at: Date.now(), gclid: 'valid', unexpected: 'secret' },
    meta: { at: Date.now() - 31 * 86400000, fbclid: 'expired' }, campaign: { at: Date.now(), utm_source: 'mail@example.com' } });
  const promise = b.window.enkaMeasurement.snapshot(); b.complete();
  const value = await promise;
  assert.equal(value.clicks.gclid, 'valid');
  assert.ok(!JSON.stringify([...b.store.values()]).match(/secret|expired|example/));
  assert.equal(value.meta.fbc, undefined);
});
test('Revocation during gtag callbacks strips every identifier and clears storage', async () => {
  const b = browser(null, '?gclid=click&fbclid=meta&utm_source=ads');
  const promise = b.window.enkaMeasurement.snapshot(); b.choice(false); b.complete();
  const value = await promise;
  assert.equal(value.consent.ad_storage, 'denied');
  assert.equal(value.clicks, undefined); assert.equal(value.google, undefined);
  assert.equal(b.store.size, 0);
});
test('Regrant during an outstanding snapshot cannot revive identifiers captured before revocation', async () => {
  const b = browser(null, '?gclid=click');
  const promise = b.window.enkaMeasurement.snapshot(); b.choice(false); b.choice(true); b.complete();
  const value = await promise;
  assert.equal(value.consent.ad_storage, 'denied'); assert.equal(value.google, undefined);
});
test('Oversized local storage is discarded', () => {
  const b = browser({ garbage: 'x'.repeat(9000) });
  assert.equal(b.store.get('enka_measurement_v1'), '{}');
});
