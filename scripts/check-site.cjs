const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../_site');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(!/{%|{{/.test(html), 'Unrendered Liquid on homepage');
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'Homepage needs one h1');
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(scripts).size, scripts.length, 'Duplicate scripts');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate DOM IDs');
let checked = 0;
for (const [, resource] of html.matchAll(/(?:href|src)="(\/(?!\/)[^"#]*)"/g)) {
  let resourcePath = resource.split('?')[0];
  if (!resourcePath) resourcePath = '/';
  const file = path.join(root, decodeURIComponent(resourcePath));
  assert.ok([file, file + '.html', path.join(file, 'index.html')].some(candidate => fs.existsSync(candidate)), 'Missing homepage resource: ' + resource);
  checked++;
}
assert.ok((html.match(/class="product-card /g) || []).length > 0, 'Popular products need a server-rendered fallback');
assert.ok(!html.includes('Halloween'), 'Outdated promo campaign on homepage');
for (const forbidden of ['node_modules', 'scripts', 'tests', 'vendor', '.local', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
  assert.ok(!fs.existsSync(path.join(root, forbidden)), 'Development file published: ' + forbidden);
}
console.log('Homepage artifact verified: ' + checked + ' local references, unique scripts and IDs, rendered product fallback.');
