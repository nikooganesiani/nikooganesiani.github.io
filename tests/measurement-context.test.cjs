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
    navigate(search) { context.location.search = search; listeners["enka:privacy-change"](); }, complete() { callbacks.splice(0).forEach(fn => fn('123')); } };
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

async function snapshot(browser) {
  const pending = browser.window.enkaMeasurement.snapshot();
  browser.complete();
  return pending;
}

test('A newer paid campaign wins; organic and direct visits do not overwrite it', async () => {
  const b = browser(null, '?utm_source=facebook&utm_id=111&utm_campaign=first');
  b.navigate('?utm_source=instagram&utm_medium=paid_social&utm_id=222&utm_campaign=second');
  b.navigate('?utm_source=instagram&utm_medium=organic&utm_id=333');
  b.navigate('?utm_source=newsletter&utm_medium=email&utm_id=444');
  b.navigate('');
  const result = await snapshot(b);
  assert.equal(result.utm.utm_id, '222');
  assert.equal(result.utm.utm_campaign, 'second');
  assert.equal(result.campaign_touches.map(entry => entry.utm_id).join(','), '111,222,333,444');
  assert.equal((await snapshot(b)).campaign_touches.length, 4);
});

test('A paid campaign with an unknown ID is skipped, but other ad platforms can win', async () => {
  const b = browser(null, '?utm_source=facebook&utm_id=111');
  b.navigate('?utm_source=meta&utm_medium=paid_social&utm_campaign=missing-id');
  assert.equal((await snapshot(b)).utm.utm_id, '111');
  b.navigate('?utm_source=google&utm_medium=cpc&utm_id=222');
  assert.equal((await snapshot(b)).utm.utm_id, '222');
});

test('History is bounded and consent revocation removes the trail', async () => {
  const b = browser({ campaign: { at: Date.now() - 31 * 86400000, utm_source: 'facebook', utm_id: 'old' } });
  for (let n = 1; n <= 12; n++) b.navigate('?utm_source=facebook&utm_id=' + n);
  const result = await snapshot(b);
  assert.equal(result.utm.utm_id, '12');
  assert.equal(result.campaign_touches.map(entry => entry.utm_id).join(','), '5,6,7,8,9,10,11,12');
  b.choice(false);
  assert.equal((await snapshot(b)).campaign_touches, undefined);
  assert.equal(b.store.size, 0);
});

test('Legacy paid metadata remains usable until a newer known campaign is observed', async () => {
  const b = browser({ campaign: { at: Date.now() - 1000, utm_source: 'fb', utm_id: 'old' } },
    '?utm_source=partner&utm_medium=referral');
  const result = await snapshot(b);
  assert.equal(result.utm.utm_id, 'old');
  assert.equal(result.campaign_touches[0].utm_id, 'old');
  assert.equal(result.campaign_touches[1].utm_source, 'partner');
});

test('An organic Meta tag is recorded in the trail without taking credit in the sales report', async () => {
  const b = browser(null, '?utm_source=instagram&utm_medium=organic&utm_id=999');
  const result = await snapshot(b);
  assert.equal(result.utm.utm_source, 'instagram');
  assert.equal(result.utm.utm_id, undefined);
  assert.equal(result.campaign_touches[0].utm_id, '999');
});
