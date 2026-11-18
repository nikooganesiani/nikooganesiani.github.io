const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('assets/js/global/page-transition.js');
const origin = 'https://shop.test';
const href = origin + '/product/test/';

function setup({ saved, blocked = false, reduced = false, writeBlocked = false, images = [], animationTime = 315, fadePromise } = {}) {
  let now = 100000;
  let sequence = 0;
  const tasks = new Map();
  const events = {};
  const calls = [];
  const styles = new Map();
  const store = new Map(saved ? [['enka:page-transition', JSON.stringify(saved)]] : []);
  const root = { dataset: {}, style: { setProperty: (k, v) => styles.set(k, v), getPropertyValue: k => styles.get(k) } };
  const storage = { getItem: k => store.get(k), removeItem: k => store.delete(k), setItem(k, v) {
    if (writeBlocked) throw Error('blocked');
    store.set(k, v);
  } };
  function schedule(fn, delay = 0) { const id = ++sequence; tasks.set(id, { fn, at: now + delay }); return id; }
  const window = {
    location: { href, origin, pathname: '/product/test/', search: '', assign: url => calls.push(url), reload: () => calls.push('reload') },
    innerHeight: 800, matchMedia: () => ({ matches: reduced }),
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  Object.defineProperty(window, 'sessionStorage', { get() { if (blocked) throw Error('blocked'); return storage; } });
  const document = { documentElement: root, images, fonts: { ready: Promise.resolve() },
    getElementById: () => fadePromise ? { getAnimations: () => [{ transitionProperty: 'opacity', finished: fadePromise }] } : null,
    querySelector: selector => selector === '.page-loader__ball' ? { getAnimations: () => [{ currentTime: animationTime }] } : null,
    addEventListener: (name, fn) => { events[name] = fn; } };
  vm.runInNewContext(source, { document, window, URL, Date: { now: () => now }, Promise,
    setTimeout: schedule, clearTimeout: id => tasks.delete(id), requestAnimationFrame: fn => schedule(fn, 16) });
  async function tick(ms) {
    const end = now + ms;
    for (let i = 0; i < 100; i++) {
      await Promise.resolve(); await Promise.resolve();
      const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) { now = end; await Promise.resolve(); return; }
      tasks.delete(next[0]); now = next[1].at; next[1].fn();
    }
    throw Error('Timer loop');
  }
  function click(url, options = {}, attrs = {}) {
    const anchor = { href: url, rel: attrs.rel || '', hasAttribute: k => k in attrs, getAttribute: k => attrs[k] || null };
    const event = { button: 0, defaultPrevented: false, target: { closest: () => anchor }, preventDefault() { this.defaultPrevented = true; }, ...options };
    events.click(event);
    return event;
  }
  return { root, styles, calls, events, tick, click, store, api: window.EnkaPageTransition };
}

test('Direct loads stay visible; handoff covers the incoming document before DCL and preserves animation phase', () => {
  assert.equal(setup().root.dataset.pageTransition, undefined);
  const page = setup({ saved: { href, started: 99750, phase: 370 } });
  assert.equal(page.root.dataset.pageTransition, 'arriving');
  assert.equal(page.styles.get('--page-loader-phase'), '-370ms');
  assert.equal(page.store.size, 0);
  for (const saved of [{ href, started: 1 }, { href, started: 100001 }, { href: origin + '/other/', started: 99750 }]) {
    assert.equal(setup({ saved }).root.dataset.pageTransition, undefined);
  }
});

test('Navigation waits for the opaque cover, retains URL/hash and ignores duplicate clicks', async () => {
  const page = setup();
  const url = origin + '/category/?type=test#results';
  assert.equal(page.click(url).defaultPrevented, true);
  assert.equal(page.root.dataset.pageTransition, 'leaving');
  assert.equal(JSON.parse(page.store.get('enka:page-transition')).href, url);
  page.click(origin + '/other/');
  await page.tick(131); assert.equal(page.calls.length, 0);
  await page.tick(1); assert.deepEqual(page.calls, [url]);
});

test('Anchors, modified clicks, cancelled handlers, downloads and external/new-tab links remain native', () => {
  const page = setup();
  for (const [url, options, attrs] of [
    [href + '#details'], [origin + '/next/', { ctrlKey: true }], [origin + '/next/', { button: 1 }],
    [origin + '/next/', { defaultPrevented: true }], ['https://elsewhere.test/'], ['mailto:test@example.test'],
    [origin + '/file.pdf'], [origin + '/next/', {}, { download: '' }],
    [origin + '/next/', {}, { target: '_blank' }], [origin + '/next/', {}, { 'data-no-transition': '' }],
  ]) page.click(url, options, attrs);
  assert.equal(page.root.dataset.pageTransition, undefined);
  assert.equal(page.calls.length, 0);
});

test('Unavailable storage falls back immediately; reduced motion skips the fade delay', async () => {
  for (const option of [{ blocked: true }, { writeBlocked: true }]) {
    const page = setup(option); page.api.navigate('/next/');
    assert.deepEqual(page.calls, [origin + '/next/']);
    assert.equal(page.root.dataset.pageTransition, undefined);
  }
  const page = setup({ reduced: true }); page.api.reload(); await page.tick(32);
  assert.deepEqual(page.calls, ['reload']);
});

test('Reveal waits for page initialization and two paint frames without an artificial minimum display', async () => {
  const page = setup({ saved: { href, started: 99800, phase: 200 } });
  page.events.DOMContentLoaded();
  let finish;
  page.api.hold(new Promise(resolve => { finish = resolve; }));
  await page.tick(400); assert.equal(page.root.dataset.pageTransition, 'arriving');
  finish();
  for (let i = 0; i < 8; i++) await page.tick(16);
  assert.equal(page.root.dataset.pageTransition, 'revealing');
  await page.tick(260);
  assert.equal(page.root.dataset.pageTransition, undefined);
  assert.equal(page.styles.get('--page-loader-phase'), '-200ms');
});

test('Stalled content is bounded; cancelled navigation and history restoration release the cover', async () => {
  const page = setup({ saved: { href, started: 99800 } });
  page.api.hold(new Promise(() => {})); page.events.DOMContentLoaded();
  await page.tick(449); assert.equal(page.root.dataset.pageTransition, 'arriving');
  for (let i = 0; i < 8; i++) await page.tick(16);
  await page.tick(260);
  assert.equal(page.root.dataset.pageTransition, undefined);
  page.api.navigate('/next/'); await page.tick(10000);
  assert.equal(page.root.dataset.pageTransition, undefined);
  page.api.navigate('/next/'); page.events.pagehide(); page.events.pageshow({ persisted: true });
  assert.equal(page.root.dataset.pageTransition, undefined);
  assert.equal(page.store.size, 0);
});

test('A late reveal cannot hide a newer departure', async () => {
  const page = setup({ saved: { href, started: 99800 } });
  page.events.DOMContentLoaded(); await page.tick(0);
  page.api.navigate('/next/');
  for (let i = 0; i < 8; i++) await page.tick(100);
  assert.equal(page.root.dataset.pageTransition, 'leaving');
});

test('Snapshot keeps the opaque cover on pagehide and hands off the animation clock, excluding network time', async () => {
  const page = setup({ animationTime: 315 });
  page.api.navigate('/next/'); await page.tick(212);
  page.events.pageswap();
  const saved = JSON.parse(page.store.get('enka:page-transition'));
  assert.equal(saved.phase, 315);
  await page.tick(1200); page.events.pagehide();
  assert.equal(page.root.dataset.pageTransition, 'leaving');
  assert.equal(JSON.parse(page.store.get('enka:page-transition')).phase, 315);
  const incoming = setup({ saved: { ...saved, href, started: 98000 } });
  assert.equal(incoming.styles.get('--page-loader-phase'), '-315ms');
});

test('Navigation awaits the actual cover animation, even if it takes longer than the nominal duration', async () => {
  let finish;
  const page = setup({ fadePromise: new Promise(resolve => { finish = resolve; }) });
  page.api.navigate('/next/'); await page.tick(1000);
  assert.equal(page.calls.length, 0);
  finish();
  for (let i = 0; i < 8; i++) await page.tick(1);
  assert.deepEqual(page.calls, [origin + '/next/']);
});

test('Handoff retains complete cycles so delayed groups do not restart at a loop boundary', async () => {
  const page = setup({ animationTime: 1010 });
  page.api.navigate('/next/'); await page.tick(212); page.events.pageswap();
  const saved = JSON.parse(page.store.get('enka:page-transition'));
  assert.equal(saved.phase, 1010);
  const incoming = setup({ saved: { ...saved, href } });
  assert.equal(incoming.styles.get('--page-loader-phase'), '-1010ms');
  // Group 3 has already completed 810 ms, instead of waiting 190 ms to start.
  assert.equal(-parseFloat(incoming.styles.get('--page-loader-phase')) - 200, 810);
});

test('A click during reveal carries the already running phase and cached restoration cleans up before painting', async () => {
  const page = setup({ saved: { href, started: 99800, phase: 370 }, animationTime: 315 });
  page.api.navigate('/next/');
  await page.tick(212); page.events.pageswap();
  assert.equal(JSON.parse(page.store.get('enka:page-transition')).phase, 685);
  page.events.pagehide();
  assert.equal(page.root.dataset.pageTransition, 'leaving');
  page.events.pagereveal({});
  assert.equal(page.root.dataset.pageTransition, undefined);
});

test('Critical loader is included before the stylesheet and the old progress controller is disconnected', () => {
  const head = read('_includes/head.html');
  assert.ok(head.indexOf('/assets/js/global/page-transition.js') < head.indexOf('/assets/css/style.css'));
  assert.match(read('_layouts/default.html'), /include page-transition.html/);
  assert.doesNotMatch(read('_includes/scripts_main.html'), /topProgressBar|progressBar.js/);
});
