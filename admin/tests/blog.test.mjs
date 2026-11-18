import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { articleMatches, newArticle, publishedArticles, renderBlogBlocks, validateBlog } from '../public/blog-model.js';
import { importDocument } from '../public/model.js';
import { CatalogService } from '../server/service.mjs';
import { CatalogStore } from '../server/store.mjs';
import api from '../catalog-api-locked.mjs';
import { buildBlog } from '../../scripts/build-blog.cjs';

const products = [
  { id: 'a', name: 'First', brand: ' Acme ', categories: ['kitchen'], subcategories: ['coffee'] },
  { id: 'b', name: 'Second', brand: 'ACME', categories: ['kitchen'], subcategories: ['kettles'] },
  { id: 'c', name: 'Third', brand: 'Other', categories: ['gadget'], subcategories: ['cables'] },
  { id: 'd', name: 'Fourth', brand: 'Other', categories: ['gadget'], subcategories: ['coffee'] }
].map(product => ({ price: '10', images: [], specs: {}, ...product }));

function liveArticle(slug = 'coffee-guide') {
  const article = { ...newArticle(), slug, status: 'published', date: '2026-11-19', homepage: true };
  Object.assign(article.editions.ka, { title: 'ტესტი', summary: 'მოკლე აღწერა', blocks: [{ type: 'paragraph', text: 'სტატიის ტექსტი' }] });
  return article;
}

test('Blog targets match distinct catalog dimensions, with explicit veto and no implicit placement', () => {
  const article = liveArticle();
  for (const [key, value, expected] of [
    ['productIds', 'c', ['c']], ['brands', 'acme', ['a', 'b']],
    ['subcategoryIds', 'coffee', ['a', 'd']], ['categoryIds', 'gadget', ['c', 'd']]
  ]) {
    assert.deepEqual(products.filter(product => articleMatches(article, product)).map(product => product.id), []);
    article.placements[key] = [value];
    assert.deepEqual(products.filter(product => articleMatches(article, product)).map(product => product.id), expected);
    article.placements[key] = [];
  }
  Object.assign(article.placements, { productIds: ['c', 'b'], brands: ['acme'], categoryIds: ['kitchen'], excludeIds: ['b'] });
  assert.deepEqual(products.filter(product => articleMatches(article, product)).map(product => product.id), ['a', 'c']);
});

test('Unfinished editions are saved as drafts, and published markup accepts only editorial blocks and safe URLs', () => {
  const article = newArticle();
  assert.deepEqual(validateBlog([article]), []);
  article.status = 'published';
  assert.ok(validateBlog([article], true).length);
  const valid = liveArticle();
  valid.editions.en.title = 'Unfinished translation';
  assert.deepEqual(validateBlog([valid], true), []);
  assert.deepEqual(Object.keys(publishedArticles([valid])[0].editions), ['ka']);
  valid.editions.en.enabled = true;
  assert.ok(validateBlog([valid], true).some(error => error.includes('EN')));
  valid.editions.ka.blocks.push({ type: 'link', text: 'External', url: '//example.org' });
  assert.ok(validateBlog([valid]).length);
  assert.equal(renderBlogBlocks([
    { type: 'paragraph', text: '<strong> & **bold**' },
    { type: 'image', url: 'https://example.org/photo.webp', alt: '"photo"', text: 'Caption' },
    { type: 'link', text: 'External', url: 'javascript:alert(0)' }
  ]), '<p>&lt;strong&gt; &amp; <strong>bold</strong></p>\n<figure><img src="https://example.org/photo.webp" alt="&quot;photo&quot;" loading="lazy" decoding="async"><figcaption>Caption</figcaption></figure>\n');
});

test('The public catalog gives the build a matching release while keeping drafts and the storefront payload private', async t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const store = new CatalogStore((query, ...values) => db.prepare(query).all(...values), callback => callback());
  const kv = new Map();
  const service = new CatalogService(store, { async put(key, value) { kv.set(key, JSON.parse(value)); } });
  const env = { CATALOG_KV: { async get(key) { return kv.get(key); } } };
  const getCatalog = suffix => api.fetch(new Request('https://catalog.example/catalog' + suffix), env);
  const article = liveArticle();
  const hidden = liveArticle('hidden');
  hidden.status = 'archived';
  const draft = newArticle();
  await service.initialize({ products });
  const document = service.view().document;
  document.blog = [article, hidden, draft];
  service.save({ document, expectedRevision: 1 }, 'Editor');
  assert.equal(service.review().blogChanges.length, 3);
  assert.deepEqual(importDocument({ products }, document).blog, document.blog);
  await service.publish({ expectedRevision: 2 }, 'Editor');
  assert.equal((await (await getCatalog('')).json())._enkaBlog, undefined);
  assert.deepEqual((await (await getCatalog('?include=blog')).json())._enkaBlog.map(post => post.slug), ['coffee-guide']);
  assert.equal((await (await getCatalog('')).json())._enkaBlog, undefined);
  const changed = service.view().document;
  changed.blog[0].slug = 'new-address';
  service.save({ document: changed, expectedRevision: 2 }, 'Editor');
  await assert.rejects(service.publish({ expectedRevision: 3 }, 'Editor'), { status: 422 });
  assert.equal((await (await getCatalog('?include=blog')).json())._enkaBlog[0].slug, 'coffee-guide');
  kv.delete(kv.get('catalog')._enkaPublication.releaseKey);
  assert.equal((await getCatalog('?include=blog')).status, 503);
  assert.equal((await getCatalog('')).status, 200);
});

test('Static generation makes localized article routes, sorts cards and removes retired generated pages', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enka-blog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_data'));
  const article = liveArticle();
  article.placements.categoryIds = ['kitchen'];
  article.placements.excludeIds = ['b'];
  Object.assign(article.editions.en, { enabled: true, title: 'Coffee guide', summary: 'Short summary',
    blocks: [{ type: 'paragraph', text: 'Practical advice.' }, { type: 'heading', text: 'Check the **size**' },
      { type: 'heading', text: 'Check the *filter*' }] });
  const priority = liveArticle('priority-guide');
  priority.rank = 10;
  priority.homepage = false;
  const data = await buildBlog([article, priority, newArticle()], products, root);
  assert.deepEqual(data.archive, ['priority-guide', 'coffee-guide']);
  assert.deepEqual(data.homepage, ['coffee-guide']);
  assert.deepEqual(data.products.a, ['coffee-guide']);
  assert.equal(data.products.b, undefined);
  assert.equal(data.cards['coffee-guide'].editions.en.url, '/en/blog/coffee-guide/');
  const page = data.pages['en-coffee-guide'];
  assert.equal(page.products[0].id, 'a');
  assert.deepEqual(page.toc, [{ id: 'section-2', text: 'Check the size' }, { id: 'section-3', text: 'Check the filter' }]);
  for (const { id } of page.toc) assert.ok(page.html.includes('<h2 id="' + id + '">'));
  const directory = path.join(root, '_pages/generated-blog');
  assert.match(fs.readFileSync(path.join(directory, 'en-coffee-guide.html'), 'utf8'), /permalink: "\/en\/blog\/coffee-guide\/"/);
  assert.equal(fs.existsSync(path.join(directory, 'ru-coffee-guide.html')), false);
  fs.writeFileSync(path.join(directory, 'handwritten.html'), 'Keep this page');
  await buildBlog([], products, root);
  assert.deepEqual(fs.readdirSync(directory), ['handwritten.html']);
});
