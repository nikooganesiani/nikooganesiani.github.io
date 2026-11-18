const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { optimizeSite, digest } = require('../scripts/optimize-site.cjs');

test('Production bundling preserves classic globals, ordered execution and analytics attributes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enka-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (name, code) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, code); };
  put('assets/css/style.css', 'body{color:blue}');
  put('assets/js/global/theme.js', 'window.order = ["theme"];');
  put('assets/js/global/page-transition.js', 'window.order.push("transition");');
  put('assets/a.js', 'const shared = 5; function inlineHandler() { return shared; } window.order.push("a");');
  put('assets/b.js', 'window.order.push("b"); window.answer = inlineHandler();');
  put('assets/c.js', 'window.order.push("c");');
  put('index.html', '<head><script src="/assets/js/global/theme.js"></script><script src="/assets/js/global/page-transition.js"></script><link rel="stylesheet" href="/assets/css/style.css"></head><script>window.CATALOG_STRUCTURE = {}; window.ENKA_STORE = null;</script><script src="/assets/a.js" defer></script>\n<script src="/assets/b.js" defer></script><script id="analytics" data-id="test" src="/assets/analytics.js" defer></script><script>window.order.push("inline");</script><script src="/assets/c.js" defer></script>');
  const manifest = optimizeSite(root);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="analytics" data-id="test" src="\/assets\/analytics.js" defer/);
  assert.deepEqual(Object.values(manifest.bundles), [['/assets/c.js'], ['/assets/a.js', '/assets/b.js']]);
  const context = vm.createContext({window:{}});
  for (const [, code] of html.matchAll(/<script data-enka-source="[^"]+">([\s\S]*?)<\/script>/g)) vm.runInContext(code, context);
  const deferred = [...html.matchAll(/<script src="(\/assets\/compiled\/[^"?]+\.js)" defer><\/script>/g)].map(m=>m[1]);
  for (const url of deferred) {
    const code = fs.readFileSync(path.join(root,url),'utf8');
    assert.equal(path.basename(url).split('.')[0],digest(code));
    vm.runInContext(code,context);
  }
  assert.deepEqual([...context.window.order], ['theme','transition','a','b','c']);
  assert.equal(context.window.answer,5);
  assert.equal(vm.runInContext('inlineHandler()',context),5);
  assert.equal(context.window.ENKA_STORE,null);
  assert.deepEqual(optimizeSite(root), manifest, 'A second packaging pass is harmless');
});
