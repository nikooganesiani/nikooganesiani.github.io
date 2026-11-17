import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDocument, clone, validateDocument, importDocument, storeEngine as engine } from '../public/model.js';
import { ensureStore } from '../public/store-editor.js';
import { CatalogStore } from '../server/store.mjs';
import { CatalogService } from '../server/service.mjs';
import { readPublishedCatalog } from '../server/published.mjs';
import { buildStoreContent } from '../../scripts/build-store-content.cjs';

const product = (id, price, extra = {}) => ({ id, name: id, price, oldPrice: '', images: [`https://images.test/${id}.webp`], categories: ['kitchen'], subcategories: ['coffee'], specs: {}, ...extra });
const products = () => [product('budget', '19.90'), product('premium', '100'), product('other-sub', '999', { subcategories: ['kettle'] })];
const document = () => { const d = createDocument({ products: products() }); ensureStore(d); return d; };
const coffee = d => d.store.categories.find(c => c.id === 'kitchen').subs.find(s => s.id === 'coffee');

test('Automatic photos use the most expensive product in both the category and subcategory, without changing catalog order', () => {
  const source = products(); const before = clone(source);
  source.push(product('other-parent', '1000', { categories: ['gadget'] }));
  assert.equal(engine.subcategoryImage(source, 'kitchen', { id: 'coffee' }).productId, 'premium');
  assert.deepEqual(source.slice(0, 3), before);
  source[1] = { ...source[1], price: '9', _enkaBase: { price: '100' } };
  assert.equal(engine.subcategoryImage(source, 'kitchen', { id: 'coffee' }).productId, 'premium', 'promotions do not unexpectedly change category artwork');
});

test('Automatic photos skip missing images, unsafe URLs and videos, and use deterministic ties', () => {
  const source = [product('none', '999', { images: [] }), product('video', '999', { images: ['https://youtu.be/test', 'javascript:alert(1)'] }), product('z', '100'), product('a', '100')];
  assert.equal(engine.subcategoryImage(source, 'kitchen', { id: 'coffee' }).productId, 'a');
  assert.equal(engine.subcategoryImage(source.reverse(), 'kitchen', { id: 'coffee' }).productId, 'a');
  assert.equal(engine.subcategoryImage([], 'kitchen', { id: 'coffee' }), null);
});

test('An explicit product and gallery photo take precedence; removed or reassigned media fall back safely', () => {
  const source = products(); source[0].images.push('https://images.test/second.webp');
  const sub = { id: 'coffee', imageProductId: 'budget', imageIndex: 1 };
  assert.deepEqual(engine.subcategoryImage(source, 'kitchen', sub), { productId: 'budget', imageIndex: 1, image: 'https://images.test/second.webp' });
  source[0].images.pop();
  assert.equal(engine.subcategoryImage(source, 'kitchen', sub).imageIndex, 0);
  source[0].subcategories = ['kettle'];
  assert.equal(engine.subcategoryImage(source, 'kitchen', sub).productId, 'premium');
  assert.equal(engine.subcategoryImage(source, 'kitchen', { id: 'coffee', imageProductId: 'other-sub' }).productId, 'premium');
});

test('Validation rejects cross-category photo references and malformed gallery indexes, while old stores remain valid', () => {
  assert.deepEqual(validateDocument(document()), []);
  for (const reference of ['missing', 'other-sub', 12, null, {}]) {
    const d = document(); coffee(d).imageProductId = reference;
    assert.ok(validateDocument(d).some(message => message.startsWith('Фото подкатегории:')));
  }
  for (const index of [-1, 0.5, '1', null, 50]) {
    const d = document(); Object.assign(coffee(d), { imageProductId: 'budget', imageIndex: index });
    assert.ok(validateDocument(d).some(message => message.startsWith('Фото подкатегории:')));
  }
  const d = document(); Object.assign(coffee(d), { imageProductId: 'budget', imageIndex: 0 });
  engine.renameSection(d.store, d.catalog.products, 'category', 'kitchen', 'appliances');
  engine.renameSection(d.store, d.catalog.products, 'sub', 'coffee', 'espresso');
  assert.deepEqual(validateDocument(d), []);
  assert.equal(engine.subcategoryImage(d.catalog.products, 'appliances', d.store.categories.find(c => c.id === 'appliances').subs.find(s => s.id === 'espresso')).productId, 'budget');
});

test('Photo selections survive draft saving, publication, backup import and static generation', async t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  const store = new CatalogStore((sql, ...values) => db.prepare(sql).all(...values), callback => {
    db.exec('BEGIN IMMEDIATE'); try { const value = callback(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  const kv = new Map(); const service = new CatalogService(store, { async put(key, value) { kv.set(key, JSON.parse(value)); } });
  const d = document(); Object.assign(coffee(d), { imageProductId: 'budget', imageIndex: 0 });
  const kettle = d.store.categories.find(c => c.id === 'kitchen').subs.find(s => s.id === 'kettle');
  kettle.image = 'https://images.test/custom-kettle.webp';
  await service.initialize(d.catalog);
  service.save({ expectedRevision: 1, document: d }, 'test');
  await service.publish({ expectedRevision: 2 }, 'test');
  const published = await readPublishedCatalog(async key => clone(kv.get(key)), 'ka');
  const restored = importDocument({ document: d });
  assert.equal(coffee(restored).imageProductId, 'budget');
  assert.equal(restored.store.categories.find(c => c.id === 'kitchen').subs.find(s => s.id === 'kettle').image, kettle.image);
  assert.equal(engine.subcategoryImage(published.products, 'kitchen', coffee({ store: published._enkaStore })).productId, 'budget');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enka-subcategory-images-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_data'));
  await buildStoreContent(published, root);
  const output = JSON.parse(fs.readFileSync(path.join(root, '_data/catalog_navigation.json')));
  assert.equal(output.images.kitchen.coffee.productId, 'budget');
  assert.equal(output.images.kitchen.kettle.image, kettle.image);
  assert.match(output.panels.find(p => p.id === 'kitchen').html, /https:\/\/images.test\/custom-kettle.webp/);
  assert.match(output.panels.find(p => p.id === 'kitchen').html, /data-subcategory-product="budget"/);
  assert.match(output.panels.find(p => p.id === 'kitchen').html, /\/category\/\?kitchen&amp;sub=coffee/);
  await buildStoreContent(d.catalog, root);
  const legacy = JSON.parse(fs.readFileSync(path.join(root, '_data/catalog_navigation.json')));
  assert.equal(legacy.images.kitchen.coffee.productId, 'premium', 'legacy catalogs also have static automatic photos');
});

test('The shared tile renderer escapes titles and ignores unsafe image sources', () => {
  const html = globalThis.EnkaStoreVisuals.subcategory('kitchen & home', { id: 'coffee & tea', name: '<script>bad</script>' }, { image: 'javascript:alert(1)', productId: '"bad' });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /kitchen%20%26%20home&amp;sub=coffee%20%26%20tea/);
  assert.match(html, /src="\/img\/categories\/no-photo.svg"/);
});


test('Custom subcategory images override product photos and clearing them restores the product selection', () => {
  const sub = { id: 'coffee', imageProductId: 'budget', imageIndex: 0, image: '/img/custom-coffee.webp' };
  assert.deepEqual(engine.subcategoryImage([], 'kitchen', sub), { image: sub.image });
  sub.image = '';
  assert.equal(engine.subcategoryImage(products(), 'kitchen', sub).productId, 'budget');
  sub.image = 'javascript:alert(1)';
  assert.equal(engine.subcategoryImage(products(), 'kitchen', sub).productId, 'budget');
  for (const image of [null, 123, 'javascript:alert(1)', '//images.test/photo.png', 'https://youtu.be/video']) {
    const d = document(); coffee(d).image = image;
    assert.ok(validateDocument(d).some(message => message.startsWith('Фото подкатегории:')));
  }
});
