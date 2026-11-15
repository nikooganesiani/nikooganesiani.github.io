const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../assets/js/global/recommendation-engine.js');
const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 10);
const product = (id, sub, category = 'kitchen', extra = {}) => ({ id, name: id, price: '100', categories: [category], subcategories: [sub], ...extra });
const catalog = [product('air-a', 'airfryer'), product('air-b', 'airfryer'), product('coffee', 'coffee'), product('vacuum', 'vacuum', 'homecare'), product('lamp', 'lighting', 'smarthome')];
const rank = profile => engine.rank(catalog, profile, { now: NOW });
const ids = ranked => ranked.map(item => item.product.id);

test('Exact interests outrank broad category interests and explanations reflect actual evidence', () => {
  const result = rank({ interests: ['category:kitchen', 'sub:airfryer'] });
  assert.deepEqual(new Set(ids(result.slice(0, 2))), new Set(['air-a', 'air-b']));
  assert.equal(result[0].reason.type, 'chosen');
  assert.equal(result[0].reason.key, 'sub:airfryer');
  assert.ok(ids(result).indexOf('coffee') < ids(result).indexOf('vacuum'));
  assert.equal(result.find(item => item.product.id === 'lamp').reason.type, 'discover');
  const exactOnly = ids(rank({ interests: ['sub:airfryer'] }));
  assert.ok(exactOnly.indexOf('coffee') < exactOnly.indexOf('vacuum'), 'An exact interest also discovers its parent category');
});

test('Views, engagement, searches and favorites generalize to similar products; new interests beat old ones', () => {
  for (const kind of ['view', 'engaged', 'search', 'click']) {
    const result = rank({ events: [{ kind, ref: 'air-a', at: NOW }] });
    assert.ok(result.find(item => item.product.id === 'air-b').score > result.find(item => item.product.id === 'vacuum').score);
  }
  assert.equal(rank({ favorites: ['air-a'] })[0].reason.type, 'favorite');
  const result = rank({ events: [{ kind: 'engaged', ref: 'air-a', at: NOW - 70 * DAY }, { kind: 'view', ref: 'vacuum', at: NOW }] });
  assert.equal(result[0].product.id, 'vacuum');
  assert.ok(rank({ events: [{ kind: 'view', ref: 'air-a', at: NOW - 91 * DAY }] }).every(item => !item.relevant));
});

test('Unavailable, hidden, already ordered and duplicate products never enter the feed', () => {
  const input = [...catalog, catalog[0], null, product('soon', 'airfryer', 'kitchen', { stockStatus: 'soon' }), product('sold', 'airfryer', 'kitchen', { stockStatus: 'out_of_stock' }), product('zero', 'coffee', 'kitchen', { price: '0' }), product('unknown', 'coffee', 'kitchen', { stockStatus: '??' })];
  const result = engine.rank(input, { hidden: ['air-b'], events: [{ kind: 'purchase', ref: 'air-a', at: NOW }] }, { now: NOW });
  assert.deepEqual(new Set(ids(result)), new Set(['coffee', 'vacuum', 'lamp']));
});

test('Diversity introduces new topics without dropping products or creating an artificial feed limit', () => {
  const products = Array.from({ length: 150 }, (_, i) => product('item-' + i, i < 100 ? 'airfryer' : 'vacuum', i < 100 ? 'kitchen' : 'homecare'));
  const rows = engine.rows(engine.rank(products, { interests: ['sub:airfryer'] }, { now: NOW }));
  const result = rows.flatMap(row => row.items);
  assert.equal(result.length, 150);
  assert.equal(new Set(ids(result)).size, 150);
  assert.equal(result[0].product.subcategories[0], 'airfryer');
  assert.ok(rows[3].items.every(item => !item.relevant));
});

test('Ranking ignores margin, promotions and vendor benefit; repeated impressions reduce fatigue', () => {
  const base = ids(rank({ interests: ['sub:airfryer'] }));
  const modified = catalog.map((p, i) => ({ ...p, margin: i * 999, commission: 5000 - i, oldPrice: '9999', sponsored: true }));
  assert.deepEqual(ids(engine.rank(modified, { interests: ['sub:airfryer'] }, { now: NOW })), base);
  const before = rank({}).find(item => item.product.id === 'air-a').score;
  const after = rank({ impressions: { 'air-a': 3 } }).find(item => item.product.id === 'air-a').score;
  assert.ok(after < before);
});

test('Automatic rows keep topics coherent, put the strongest interest first, and exhaust the unique catalog', () => {
  const products = [...catalog, ...Array.from({ length: 35 }, (_, i) => product('coffee-' + i, 'coffee'))];
  const ranked = engine.rank(products, { interests: ['sub:airfryer'] }, { now: NOW });
  const rows = engine.rows(ranked);
  assert.equal(rows[0].key, 'sub:airfryer');
  assert.deepEqual(new Set(ids(rows[0].items)), new Set(['air-a', 'air-b']));
  assert.ok(rows.length > 3);
  const selected = rows.flatMap(row => ids(row.items));
  assert.equal(selected.length, products.length);
  assert.equal(new Set(selected).size, products.length);
  for (const row of rows) {
    assert.ok(row.items.length <= 8);
    if (row.key) {
      const [type, key] = row.key.split(':');
      assert.ok(row.items.every(item => item.product[type === 'sub' ? 'subcategories' : 'categories'].includes(key)));
    }
  }
});

test('Current navigation provides useful context without importing outside history or storing search text', () => {
  const structure = { kitchen: { subs: [{ id: 'airfryer' }] } };
  const origin = 'https://shop.test';
  assert.deepEqual(engine.navigationContext(origin + '/product/air-a/', origin, structure), ['air-a']);
  assert.deepEqual(engine.navigationContext(origin + '/category/?kitchen&sub=airfryer', origin, structure), ['sub:airfryer', 'category:kitchen']);
  assert.deepEqual(engine.navigationContext('https://elsewhere.test/product/air-a/', origin, structure), []);
  assert.deepEqual(engine.navigationContext(origin + '/search/?result=private+text', origin, structure), []);
  assert.deepEqual(engine.navigationContext('bad url', origin, structure), []);
  const profile = { events: [] };
  const result = engine.rank(catalog, profile, { now: NOW, context: ['air-a'] });
  assert.equal(engine.rows(result)[0].key, 'sub:airfryer');
  assert.deepEqual(profile.events, []);
});

function browser({ initial = {}, blocked = false } = {}) {
  const store = new Map(Object.entries(initial));
  const reads = [];
  const listeners = new Map();
  let now = NOW;
  const window = {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); }
  };
  const context = vm.createContext({ window, URL,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    Date: class extends Date { static now() { return now; } },
    localStorage: {
      getItem(key) { reads.push(key); if (blocked) throw Error('blocked'); return store.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error('blocked'); store.set(key, value); },
      removeItem(key) { if (blocked) throw Error('blocked'); store.delete(key); }
    },
    document: { addEventListener() {} },
    location: { origin: 'https://shop.test' }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../assets/js/global/personalization.js'), 'utf8'), context);
  return { api: window.enkaPersonalization, store, reads, window, advance(ms) { now += ms; } };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('No behavioral collection or reuse of favorites, viewing history or orders before separate consent', () => {
  const b = browser({ initial: { enka_privacy_v1: JSON.stringify({ analytics: true, updatedAt: NOW }), myFavs: '[{"id":"air-a"}]', recentIds: '["air-a"]', myOrders: 'private' } });
  b.api.record('view', 'air-a'); b.api.impression('air-a'); b.api.snapshot();
  assert.equal(b.api.allowed(), false);
  assert.equal(b.store.has('enka_personalization_profile_v1'), false);
  assert.ok(!b.reads.includes('myFavs') && !b.reads.includes('myOrders') && !b.reads.includes('recentIds'));
  b.api.setInterests(['sub:airfryer']);
  assert.deepEqual(plain(b.api.snapshot().interests), ['sub:airfryer']);
  assert.equal(b.store.has('enka_personalization_profile_v1'), false);
});

test('Consent is explicit, versioned, age gated and independent of advertising analytics', () => {
  const b = browser();
  assert.equal(b.api.setChoice(true), false);
  assert.equal(b.api.setChoice(true, true), true);
  b.api.record('search', 'air-a');
  b.api.record('view', 'air-a'); b.api.record('view', 'air-a');
  b.api.record('view', 'someone@example.com');
  b.api.record('arbitrary', 'air-a');
  const saved = JSON.parse(b.store.get('enka_personalization_profile_v1'));
  assert.equal(saved.events.length, 2);
  assert.deepEqual(Object.keys(saved.events[0]).sort(), ['at', 'kind', 'ref']);
  const consent = JSON.parse(b.store.get('enka_personalization_consent_v1'));
  assert.equal(consent.policy, '2026-11-10'); assert.equal(consent.age16Confirmed, true);
  assert.equal(b.store.has('enka_privacy_v1'), false);
});

test('Withdrawal immediately removes the profile, stops collection and preserves orders and favorites', () => {
  const b = browser({ initial: { myOrders: 'keep', myFavs: '[{"id":"air-a"}]' } });
  b.api.setChoice(true, true); b.api.record('view', 'air-a');
  b.api.setChoice(false); b.api.record('view', 'vacuum');
  assert.equal(b.store.has('enka_personalization_profile_v1'), false);
  assert.deepEqual(plain(b.api.snapshot().events), []);
  assert.equal(b.store.get('myOrders'), 'keep'); assert.equal(b.store.get('myFavs'), '[{"id":"air-a"}]');
});

test('Expired consent and cross-tab withdrawal fail closed; profiles do not resurrect when re-enabling', () => {
  const b = browser(); b.api.setChoice(true, true); b.api.record('view', 'air-a');
  b.advance(181 * DAY);
  assert.equal(b.api.allowed(), false); assert.equal(b.store.has('enka_personalization_profile_v1'), false);
  b.api.setChoice(true, true); assert.deepEqual(plain(b.api.snapshot().events), []);
  b.api.record('view', 'air-a');
  b.store.set('enka_personalization_consent_v1', JSON.stringify({ allowed: false, at: NOW + 181 * DAY, policy: '2026-11-10' }));
  b.window.dispatchEvent({ type: 'storage', key: 'enka_personalization_consent_v1' });
  assert.equal(b.api.allowed(), false); assert.equal(b.store.has('enka_personalization_profile_v1'), false);
});

test('Blocked/corrupt storage remains usable in memory and never silently enables personalization', () => {
  const b = browser({ blocked: true });
  assert.equal(b.api.allowed(), false);
  b.api.setChoice(true, true); b.api.record('view', 'air-a');
  assert.equal(b.api.isPersistent(), false); assert.equal(b.api.snapshot().events.length, 1);
  b.api.setChoice(false); assert.equal(b.api.snapshot().events.length, 0);
  assert.equal(browser({ initial: { enka_personalization_consent_v1: '{broken' } }).api.allowed(), false);
  assert.equal(browser({ initial: { enka_personalization_consent_v1: JSON.stringify({ allowed: true, at: NOW, policy: '2026-11-10' }) } }).api.allowed(), false);
});

test('Retention, deduplication and reset bound the behavioral profile', () => {
  const b = browser(); b.api.setChoice(true, true); b.api.record('view', 'air-a'); b.api.impression('air-a'); b.api.impression('air-a');
  assert.equal(b.api.snapshot().impressions['air-a'], 1);
  b.advance(8 * DAY); assert.equal(b.api.snapshot().impressions['air-a'], undefined);
  b.advance(83 * DAY); assert.equal(b.api.snapshot().events.length, 0);
  b.api.record('click', 'coffee'); b.api.hide('air-a'); b.api.reset();
  assert.equal(b.store.has('enka_personalization_profile_v1'), false);
  assert.equal(b.api.snapshot().hidden.length, 0);
});

test('The existing privacy notice keeps personalization and advertising independently selectable', () => {
  for (const [button, expected] of [['cookie-decline-btn', [false, false]], ['cookie-personalize-btn', [false, true]], ['cookie-accept-btn', [true, true]]]) {
    let analytics = null; let personalization = null;
    const clicks = new Map();
    const listeners = new Map();
    const banner = { hidden: true, contains: () => false };
    const window = {
      enkaPrivacy: { getChoice: () => analytics, setChoice(value) { analytics = value; listeners.get('enka:privacy-change')?.(); } },
      enkaPersonalization: { getChoice: () => personalization, setChoice(value, age) { assert.equal(age, value); personalization = value; listeners.get('enka:personalization-choice')?.(); } },
      addEventListener(name, callback) { listeners.set(name, callback); }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/global/cookie-banner.js'), 'utf8'), { window,
      document: {
        addEventListener(name, callback) { if (name === 'DOMContentLoaded') callback(); },
        getElementById(id) { return id === 'cookie-banner' ? banner : { addEventListener(name, callback) { if (name === 'click') clicks.set(id, callback); } }; }
      }
    });
    assert.equal(banner.hidden, false);
    clicks.get(button)();
    assert.deepEqual([analytics, personalization], expected);
    assert.equal(banner.hidden, true);
  }
});
