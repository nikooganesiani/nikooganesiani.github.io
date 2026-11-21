const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildCategoryPages } = require('../scripts/build-category-pages.cjs');

test('Static category pages support direct opening, aliases and removal of retired routes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enka-category-routes-'));
  const directory = path.join(root, '_pages/generated-categories');
  assert.equal(buildCategoryPages([{ id: 'homecare', aliases: ['home'], subs: [{ id: 'vacuum', aliases: ['cleaner'] }] }], root), 6);
  assert.match(fs.readFileSync(path.join(directory, 'homecare--vacuum.html'), 'utf8'), /permalink: \/category\/homecare\/vacuum\//);
  assert.match(fs.readFileSync(path.join(directory, 'home--cleaner.html'), 'utf8'), /listing_mode: category/);
  assert.match(fs.readFileSync(path.join(directory, 'home--cleaner.html'), 'utf8'), /listing_category: "homecare"\s+listing_subcategory: "vacuum"/);
  buildCategoryPages([{ id: 'homecare', subs: [] }], root);
  assert.deepEqual(fs.readdirSync(directory), ['homecare.html']);
});
