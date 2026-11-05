import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createDocument, validateDocument, translationFor, updateEntry, approveProduct, localizedProduct, coverage, importDocument, attributeId } from '../public/model.js';
import { CatalogStore } from '../server/store.mjs';
import { CatalogService, handleApi } from '../server/service.mjs';
import { readWebP } from '../server/media.mjs';
import { authenticate, verifyAccessToken } from '../server/auth.mjs';
import { generateKeyPair, SignJWT } from 'jose';
import publicApi from '../catalog-api-v2.mjs';
import lockedApi from '../catalog-api-locked.mjs';
import { readPublishedCatalog } from '../server/published.mjs';

const fixture = () => ({ extraMetadata: { keep: 'unchanged' }, products: [{ id: 'test-device', sku: '122679', name: 'ჭკვიანი მოწყობილობა', brand: 'ENKA', price: '139', oldPrice: '', images: ['https://img.enkaelectronics.com.ge/test.webp'], categories: ['kitchen'], subcategories: ['coffee'], description: 'ხარისხიანი ტექნიკა საქართველოში.', specs: { 'სიმძლავრე': '2000 W', 'ფერი': 'ნარინჯისფერი' }, customField: { preserved: true } }] });
function harness() {
  const db = new DatabaseSync(':memory:');
  const store = new CatalogStore((query, ...values) => db.prepare(query).all(...values), callback => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  const values = new Map(); const writes = []; let fail = '';
  const service = new CatalogService(store, { async put(key, value) { writes.push(key); if (key === fail) throw Error('offline'); values.set(key, value); } }, { environment: 'local' });
  return { db, store, service, values, writes, failAt(key) { fail = key; } };
}

test('Import preserves the supplied catalog contract and unknown product metadata', () => {
  const source = fixture(); const document = createDocument(source);
  assert.deepEqual(document.catalog, source);
  assert.notEqual(document.catalog, source);
  assert.deepEqual(validateDocument(document), []);
  assert.equal(Object.keys(document.attributes).length, 2);
});

test('Approved translations are invalidated per changed source field, not by price', () => {
  const document = createDocument(fixture()); const product = document.catalog.products[0];
  const translation = translationFor(document, product.id, 'ru');
  updateEntry(translation.fields, 'name', 'Умное устройство', product.name);
  updateEntry(translation.fields, 'description', 'Техника в Грузии.', product.description);
  const color = attributeId(document, 'ფერი');
  updateEntry(translation.specs, color, 'Оранжевый', product.specs['ფერი']);
  approveProduct(document, product, 'ru');
  assert.equal(localizedProduct(document, product, 'ru').name, 'Умное устройство');
  product.price = '149';
  assert.equal(localizedProduct(document, product, 'ru').name, 'Умное устройство');
  product.name = 'ახალი სახელი';
  assert.equal(localizedProduct(document, product, 'ru').name, product.name);
  assert.equal(localizedProduct(document, product, 'ru').description, 'Техника в Грузии.');
  assert.equal(coverage(document, product, 'ru').stale, 1);
  updateEntry(translation.fields, 'name', 'Новое название', product.name);
  assert.equal(localizedProduct(document, product, 'ru').name, product.name, 'editing is not approval');
  approveProduct(document, product, 'ru');
  assert.equal(localizedProduct(document, product, 'ru').name, 'Новое название');
});

test('Raw catalog reimport preserves existing translations and stable attribute IDs', () => {
  const document = createDocument(fixture()); const product = document.catalog.products[0];
  updateEntry(translationFor(document, product.id, 'en').fields, 'name', 'Smart device', product.name);
  const source = fixture(); source.products[0].price = '155';
  const imported = importDocument(source, document);
  assert.equal(imported.translations.en.products[product.id].fields.name.text, 'Smart device');
  assert.deepEqual(imported.attributes, document.attributes);
  assert.equal(imported.catalog.products[0].customField.preserved, true);
});

test('Validation rejects duplicate IDs, unsafe images, invalid prices and malformed translation entries', () => {
  const document = createDocument(fixture());
  document.catalog.products.push(structuredClone(document.catalog.products[0]));
  document.catalog.products[0].images = ['javascript:alert(1)'];
  document.catalog.products[0].price = '-10';
  document.translations.ru.products['test-device'] = { fields: { name: { text: '<img onerror=alert(1)>', approved: true } }, specs: {} };
  const errors = validateDocument(document).join(' ');
  assert.match(errors, /повторяющийся ID/); assert.match(errors, /HTTPS/); assert.match(errors, /цена/); assert.match(errors, /перевод/);
});

test('Draft save does not publish; stale tabs cannot overwrite a newer revision', async () => {
  const h = harness(); await h.service.initialize(fixture());
  const document = structuredClone(h.service.view().document); document.catalog.products[0].price = '159';
  const saved = h.service.save({ expectedRevision: 1, document }, 'test@example.invalid');
  assert.equal(saved.revision, 2); assert.equal(h.writes.length, 0);
  assert.throws(() => h.service.save({ expectedRevision: 1, document }, 'other'), error => error.status === 409);
  assert.equal(h.store.getState().document.catalog.products[0].price, '159');
  assert.equal(h.store.getRevision(1).document.catalog.products[0].price, '139');
});

test('Publication writes the legacy catalog last and is idempotent for the same revision', async () => {
  const h = harness(); await h.service.initialize(fixture());
  const result = await h.service.publish({ expectedRevision: 1 }, 'editor');
  assert.equal(result.publishedRevision, 1);
  assert.equal(h.writes.length, 2); assert.equal(h.writes[1], 'catalog');
  const published = JSON.parse(h.values.get('catalog')); const pointer = published._enkaPublication;
  delete published._enkaPublication;
  assert.deepEqual(published, fixture());
  assert.deepEqual(JSON.parse(h.values.get(pointer.releaseKey)).document.catalog, fixture());
  await h.service.publish({ expectedRevision: 1 }, 'editor');
  assert.equal(h.writes.length, 2);
});

test('A partial publication survives a service restart and resumes without overwriting edits', async () => {
  const h = harness(); await h.service.initialize(fixture()); h.failAt('catalog');
  await assert.rejects(h.service.publish({ expectedRevision: 1 }, 'editor'), error => error.status === 503);
  assert.equal(h.store.getState().pending.step, 1);
  assert.equal(h.values.has('catalog'), false);
  assert.throws(() => h.service.save({ expectedRevision: 1, document: h.service.view().document }, 'editor'), error => error.status === 409);
  const pendingId = h.store.getState().pending.id;
  h.failAt('');
  const restarted = new CatalogService(h.store, { put: async (key, value) => { h.writes.push(key); h.values.set(key, value); } });
  await restarted.publish({ expectedRevision: 1 }, 'editor');
  assert.equal(h.store.getState().pending, null); assert.equal(h.store.getState().publishedRevision, 1);
  assert.equal(JSON.parse(h.values.get('catalog'))._enkaPublication.releaseKey, 'catalog:release:' + pendingId);
  assert.equal(h.writes.filter(key => key.startsWith('catalog:release:')).length, 1);
});

test('Restore creates a new draft and never rolls back the live catalog implicitly', async () => {
  const h = harness(); await h.service.initialize(fixture());
  const document = h.service.view().document; document.catalog.products[0].price = '159';
  h.service.save({ expectedRevision: 1, document }, 'editor');
  await h.service.publish({ expectedRevision: 2 }, 'editor');
  const restored = h.service.restore({ expectedRevision: 2, revision: 1 }, 'editor');
  assert.equal(restored.revision, 3); assert.equal(restored.publishedRevision, 2);
  assert.equal(restored.document.catalog.products[0].price, '139');
  assert.equal(JSON.parse(h.values.get('catalog')).products[0].price, '159');
});

test('Invalid saves and malformed JSON leave the existing draft and history untouched', async () => {
  const h = harness(); await h.service.initialize(fixture());
  const request = new Request('https://admin.example/api/draft', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' });
  const malformed = await handleApi(request, h.service, 'editor', {});
  assert.equal(malformed.status, 400);
  const empty = h.service.view().document; empty.catalog.products = [];
  assert.throws(() => h.service.save({ expectedRevision: 1, document: empty }, 'editor'), error => error.status === 422);
  assert.equal(h.store.history().length, 1); assert.equal(h.store.getState().revision, 1);
});

test('Access authentication fails closed without config, a token, or a valid signature', async () => {
  const request = new Request('https://admin.example/');
  assert.equal((await authenticate(request, {})).status, 503);
  const env = { ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com', ACCESS_AUD: 'test-audience' };
  assert.equal((await authenticate(request, env)).status, 401);
  const fake = new Request(request, { headers: { 'Cf-Access-Jwt-Assertion': 'untrusted' } });
  assert.equal((await authenticate(fake, env)).status, 401);
});

test('Image uploads check bytes as well as MIME type', async () => {
  const form = new FormData(); form.append('file', new Blob(['not-a-real-image'], { type: 'image/webp' }), 'test.webp');
  await assert.rejects(readWebP(new Request('https://admin.example/api/upload', { method: 'POST', body: form })), error => error.status === 422);
  const bytes = Uint8Array.from([82,73,70,70,4,0,0,0,87,69,66,80]);
  const valid = new FormData(); valid.append('file', new Blob([bytes], { type: 'image/webp' }), 'test.webp');
  const file = await readWebP(new Request('https://admin.example/api/upload', { method: 'POST', body: valid }));
  assert.match(file.name, /^[a-f0-9-]+\.webp$/);
});

test('Prototype-like product IDs are ordinary IDs, never inherited translation records', () => {
  for (const id of ['constructor', 'toString', 'hasOwnProperty']) {
    const source = fixture(); source.products[0].id = id;
    const document = createDocument(source); const product = document.catalog.products[0];
    assert.equal(coverage(document, product, 'ru').approved, 0);
    updateEntry(translationFor(document, id, 'ru').fields, 'name', 'Проверенный перевод', product.name);
    approveProduct(document, product, 'ru');
    assert.equal(localizedProduct(document, product, 'ru').name, 'Проверенный перевод');
    assert.deepEqual(validateDocument(document), []);
  }
});

test('Unsafe attribute identifiers and colliding translated labels are rejected before save', () => {
  const document = createDocument(fixture());
  document.attributes['bad" data-owned="yes'] = { source: 'malformed', labels: {} };
  assert.match(validateDocument(document).join(' '), /идентификатор характеристики/);
  delete document.attributes['bad" data-owned="yes'];
  for (const attribute of Object.values(document.attributes)) attribute.labels.ru = { text: 'Одинаковое название', source: attribute.source, approved: true };
  assert.match(validateDocument(document).join(' '), /два названия характеристик совпадают/);
});

test('Public catalog never exposes a draft; one catalog write commits source and translation pointer together', async () => {
  const h = harness(); await h.service.initialize(fixture());
  const document = h.service.view().document; const product = document.catalog.products[0]; product.price = '159';
  updateEntry(translationFor(document, product.id, 'ru').fields, 'name', 'Новое устройство', product.name);
  approveProduct(document, product, 'ru'); h.service.save({ expectedRevision: 1, document }, 'editor');
  const getJson = async key => h.values.has(key) ? JSON.parse(h.values.get(key)) : null;
  let publicData = await readPublishedCatalog(getJson, 'ru', h.store.getRevision(1).document.catalog);
  assert.equal(publicData.products[0].price, '139');
  h.failAt('catalog'); await assert.rejects(h.service.publish({ expectedRevision: 2 }, 'editor'));
  publicData = await readPublishedCatalog(getJson, 'ru', h.store.getRevision(1).document.catalog);
  assert.equal(publicData.products[0].price, '139');
  h.failAt(''); await h.service.publish({ expectedRevision: 2 }, 'editor');
  publicData = await readPublishedCatalog(getJson, 'ru');
  assert.equal(publicData.products[0].price, '159'); assert.equal(publicData.products[0].name, 'Новое устройство');
  const legacyEdit = JSON.parse(h.values.get('catalog')); legacyEdit.products[0].name = 'შეცვლილი სახელი'; legacyEdit.products[0].price = '179'; h.values.set('catalog', JSON.stringify(legacyEdit));
  publicData = await readPublishedCatalog(getJson, 'ru');
  assert.equal(publicData.products[0].price, '179'); assert.equal(publicData.products[0].name, legacyEdit.products[0].name);
});

test('A failed SQL save rolls back its history insert and leaves the old revision intact', async () => {
  const h = harness(); await h.service.initialize(fixture());
  const sql = h.store.sql;
  h.store.sql = (query, ...values) => { if (query.startsWith('UPDATE catalog_state')) throw Error('disk full'); return sql(query, ...values); };
  const document = h.service.view().document; document.catalog.products[0].price = '159';
  assert.throws(() => h.service.save({ expectedRevision: 1, document }, 'editor'), /disk full/);
  assert.equal(h.store.history().length, 1); assert.equal(h.store.getState().revision, 1);
});

test('A lost final acknowledgement can be retried without writing another release', async () => {
  const h = harness(); await h.service.initialize(fixture());
  const update = h.store.update.bind(h.store); let calls = 0;
  h.store.update = state => { if (++calls === 4) throw Error('database interrupted'); update(state); };
  await assert.rejects(h.service.publish({ expectedRevision: 1 }, 'editor'), error => error.details.code === 'PUBLISH_PENDING');
  assert.equal(h.values.has('catalog'), true); assert.equal(h.store.getState().pending.step, 2);
  await h.service.publish({ expectedRevision: 1 }, 'editor');
  assert.equal(h.store.getState().pending, null); assert.equal(h.writes.length, 2);
});

test('Access verifies signature, issuer, audience, expiry and signed editor identity', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const issuer = 'https://test.cloudflareaccess.com';
  const sign = (audience, expiration = '5m') => new SignJWT({ email: 'editor@example.com' }).setProtectedHeader({ alg: 'RS256' }).setSubject('editor').setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(privateKey);
  assert.deepEqual(await verifyAccessToken(await sign('panel'), issuer, 'panel', publicKey), { identity: 'editor@example.com' });
  await assert.rejects(verifyAccessToken(await sign('other-panel'), issuer, 'panel', publicKey));
  await assert.rejects(verifyAccessToken(await sign('panel', '-1m'), issuer, 'panel', publicKey));
  await assert.rejects(verifyAccessToken(await sign('panel'), 'https://other.cloudflareaccess.com', 'panel', publicKey));
  const other = await generateKeyPair('RS256');
  await assert.rejects(verifyAccessToken(await sign('panel'), issuer, 'panel', other.publicKey));
});

test('Optional public API retains legacy reads, serves approved translations and refuses all writes', async () => {
  const h = harness(); await h.service.initialize(fixture());
  const document = h.service.view().document; const product = document.catalog.products[0];
  product.oldPrice = '189'; product.stockStatus = 'out_of_stock';
  updateEntry(translationFor(document, product.id, 'ru').fields, 'name', 'Устройство & <ENKA>', product.name);
  approveProduct(document, product, 'ru'); h.service.save({ expectedRevision: 1, document }, 'editor');
  await h.service.publish({ expectedRevision: 2 }, 'editor');
  const env = { CATALOG_KV: { get: async key => JSON.parse(h.values.get(key) || 'null') } };
  const fetch = (path, method = 'GET') => publicApi.fetch(new Request('https://api.example' + path, { method }), env);
  assert.equal((await (await fetch('/catalog')).json()).products[0].name, product.name);
  assert.equal((await (await fetch('/catalog?lang=ru')).json()).products[0].name, 'Устройство & <ENKA>');
  const feed = await (await fetch('/v1/feed.xml?lang=ru')).text();
  assert.match(feed, /Устройство &amp; &lt;ENKA&gt;/);
  assert.match(feed, /<g:availability>out_of_stock<\/g:availability>/);
  assert.match(feed, /<g:price>189.00 GEL<\/g:price>/);
  assert.match(feed, /<g:sale_price>139.00 GEL<\/g:sale_price>/);
  assert.equal(await (await fetch('/catalog', 'HEAD')).text(), '');
  const before = h.writes.length;
  for (const path of ['/catalog', '/upload']) for (const method of ['PUT', 'POST', 'DELETE']) assert.equal((await fetch(path, method)).status, 405);
  assert.equal(h.writes.length, before);
});

test('Locked production API reads published translations and still blocks every mutation', async () => {
  const h = harness(); await h.service.initialize(fixture());
  const document = h.service.view().document; const product = document.catalog.products[0];
  updateEntry(translationFor(document, product.id, 'ru').fields, 'name', 'Название черновика', product.name);
  h.service.save({ expectedRevision: 1, document }, 'editor');
  await h.service.publish({ expectedRevision: 2 }, 'editor');
  const env = { CATALOG_KV: { get: async key => JSON.parse(h.values.get(key) || 'null') } };
  const read = (path, method = 'GET') => lockedApi.fetch(new Request('https://api.example' + path, { method }), env);
  assert.equal((await (await read('/catalog?lang=ru')).json()).products[0].name, product.name);
  approveProduct(document, product, 'ru'); h.service.save({ expectedRevision: 2, document }, 'editor');
  await h.service.publish({ expectedRevision: 3 }, 'editor');
  const response = await read('/catalog?lang=ru');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await response.json()).products[0].name, 'Название черновика');
  assert.equal(await (await read('/catalog?lang=ru', 'HEAD')).text(), '');
  const before = h.writes.length;
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await read('/catalog?lang=ru', method)).status, 405);
  assert.equal(h.writes.length, before);
});

test('Translation package import keeps live source, confirmed translations and changed-source safety', () => {
  const document = createDocument(fixture()); const product = document.catalog.products[0];
  const incoming = createDocument(fixture());
  updateEntry(translationFor(incoming, product.id, 'ru').fields, 'name', 'Новое название', product.name);
  updateEntry(translationFor(incoming, product.id, 'en').fields, 'description', 'Original translation', product.description);
  updateEntry(translationFor(document, product.id, 'ru').fields, 'name', 'Проверенное название', product.name);
  approveProduct(document, product, 'ru');
  const packageFile = { format: 'enka-translation-package', translations: incoming.translations, attributes: incoming.attributes };
  product.price = '199'; product.images = ['https://example.com/new.webp']; product.description = 'Новый исходный текст';
  const imported = importDocument(packageFile, document);
  assert.deepEqual(imported.catalog, document.catalog);
  assert.equal(translationFor(imported, product.id, 'ru').fields.name.text, 'Проверенное название');
  assert.equal(translationFor(imported, product.id, 'en').fields.description, undefined);
  product.name = 'Новый исходник';
  assert.equal(translationFor(importDocument(packageFile, document), product.id, 'ru').fields.name.text, 'Проверенное название');
});
