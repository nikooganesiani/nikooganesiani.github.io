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
test('Google loads only after consent, sends one page/product view, and strips private URL parameters', () => {
  const b = browser();
  assert.equal(b.scripts.length, 0);
  assert.equal(b.commands().filter(c => c[0] === 'event').length, 0);
  b.choose(true);
  assert.equal(b.scripts.length, 1);
  assert.deepEqual(b.commands().filter(c => c[0] === 'event').map(c => c[1]), ['page_view', 'view_item']);
  const config = b.commands().find(c => c[0] === 'config')[2];
  assert.equal(config.page_location, 'https://enkaelectronics.com.ge/product/kettle/?gclid=click123');
  assert.equal(config.page_referrer, 'https://example.com/');
  b.choose(true);
  assert.equal(b.scripts.length, 1);
  assert.equal(b.commands().filter(c => c[0] === 'event').length, 2);
});
test('Accepted COD order is one lead without contact data; revocation blocks further conversions', () => {
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
  assert.equal(b.window['ga-disable-G-TEST123'], true);
  api.orderAccepted(product, 'order2');
  assert.equal(b.commands().filter(c => c[0] === 'event').length, events.length);
});
test('Missing IDs and development hosts do not initialize Google', () => {
  for (const options of [{ id: '' }, { id: 'UA-123' }, { host: 'localhost' }]) {
    const b = browser({ ...options, consent: true });
    assert.equal(b.scripts.length, 0);
    assert.equal(b.commands().length, 0);
  }
});
