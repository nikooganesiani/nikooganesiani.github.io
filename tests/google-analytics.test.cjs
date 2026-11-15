const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function browser({ id = 'G-TEST123', host = 'enkaelectronics.com.ge', consent = false } = {}) {
  const listeners = new Map(), scripts = [];
  let enabled = consent;
  const window = {
    enkaPrivacy: { allowsAnalytics: () => enabled },
    addEventListener(name, fn) { listeners.set(name, fn); }
  };
  const document = {
    title: 'ENKA', referrer: 'https://example.com/?phone=private#secret',
    getElementById(key) { return key === 'enka-google-analytics' ? { dataset: { measurementId: id } } : key === 'productData' ? { dataset: { id: 'sku1', name: 'Kettle', price: '89' } } : null; },
    createElement() { return {}; }, head: { appendChild(script) { scripts.push(script); } },
    addEventListener() {}
  };
  const location = { hostname: host, href: 'https://' + host + '/product/kettle/?gclid=click123&phone=private&name=private#private', pathname: '/product/kettle/' };
  vm.runInNewContext(fs.readFileSync('assets/js/global/google-analytics.js', 'utf8'), { window, document, location, URL, URLSearchParams, Date, setInterval() {} });
  return {
    window, scripts,
    commands: () => Array.from(window.dataLayer || [], args => Array.from(args)),
    choose(value) { enabled = value; listeners.get('enka:privacy-change')?.(); }
  };
}
test('Advanced mode loads before consent with denied defaults and sends each view once', () => {
  const b = browser();
  assert.equal(b.scripts.length, 1);
  assert.deepEqual(b.commands()[0].slice(0, 2), ['consent', 'default']);
  assert.ok(Object.values(b.commands()[0][2]).every(value => value === 'denied'));
  assert.ok(b.commands().findIndex(c => c[0] === 'config') > 0);
  assert.equal(b.commands().find(c => c[0] === 'set' && c[1] === 'ads_data_redaction')[2], true);
  b.choose(true);
  assert.equal(b.scripts.length, 1);
  assert.deepEqual(b.commands().filter(c => c[0] === 'event').map(c => c[1]), ['page_view', 'view_item']);
  const config = b.commands().find(c => c[0] === 'config')[2];
  const defaults = b.commands().findIndex(c => c[0] === 'set' && typeof c[1] === 'object');
  assert.ok(defaults >= 0 && defaults < b.commands().findIndex(c => c[0] === 'js'), 'automatic destinations receive defaults before initialization');
  assert.equal(b.commands()[defaults][1].send_page_view, false);
  assert.equal(b.commands()[defaults][1].page_location, config.page_location);
  assert.equal(config.page_location, 'https://enkaelectronics.com.ge/product/kettle/?gclid=click123');
  assert.equal(config.page_referrer, 'https://example.com/');
  b.choose(true);
  assert.equal(b.scripts.length, 1);
  assert.equal(b.commands().filter(c => c[0] === 'event').length, 2);
});
test('Accepted COD order is one lead without contact data; refusal keeps cookieless conversions', () => {
  const b = browser({ consent: true });
  const api = b.window.enkaGoogleAnalytics;
  const product = { id: 'sku1', name: 'Kettle', price: 89, phone: 'private', customer_name: 'private' };
  api.beginCheckout(product);
  api.beginCheckout(product);
  api.orderAccepted(product, 'order1');
  api.orderAccepted(product, 'order1');
  const events = b.commands().filter(c => c[0] === 'event');
  assert.equal(events.filter(c => c[1] === 'begin_checkout').length, 1);
  assert.equal(events.filter(c => c[1] === 'generate_lead').length, 1);
  const lead = events.find(c => c[1] === 'generate_lead')[2];
  assert.equal(lead.currency, 'GEL');
  assert.equal(lead.value, 89);
  assert.ok(!JSON.stringify(lead).includes('private'));
  b.choose(false);
  assert.equal(b.window['ga-disable-G-TEST123'], undefined);
  assert.ok(Object.values(b.commands().filter(c => c[0] === 'consent').at(-1)[2]).every(value => value === 'denied'));
  api.orderAccepted(product, 'order2');
  assert.equal(b.commands().filter(c => c[0] === 'event').length, events.length + 1);
});
test('Checkout and accepted orders are measured before consent without replay on acceptance', () => {
  const b = browser();
  const product = { id: 'sku1', name: 'Kettle', price: 89 };
  b.window.enkaGoogleAnalytics.beginCheckout(product);
  b.window.enkaGoogleAnalytics.orderAccepted(product, 'order1');
  b.choose(true);
  b.window.enkaGoogleAnalytics.orderAccepted(product, 'order1');
  assert.deepEqual(b.commands().filter(c => c[0] === 'event').map(c => c[1]), ['page_view', 'view_item', 'begin_checkout', 'generate_lead']);
});
test('Missing IDs and development hosts do not initialize Google', () => {
  for (const options of [{ id: '' }, { id: 'UA-123' }, { host: 'localhost' }]) {
    const b = browser({ ...options, consent: true });
    assert.equal(b.scripts.length, 0);
    assert.equal(b.commands().length, 0);
  }
});

test('Server-owned lead is never replayed in the browser after consent changes', () => {
  const b = browser({ consent: true }), product = { id: 'sku1', name: 'Kettle', price: 89 };
  b.window.enkaGoogleAnalytics.orderAccepted(product, 'server-order', 'server');
  b.choose(false);
  b.window.enkaGoogleAnalytics.orderAccepted(product, 'server-order');
  assert.equal(b.commands().filter(c => c[0] === 'event' && c[1] === 'generate_lead').length, 0);
});
