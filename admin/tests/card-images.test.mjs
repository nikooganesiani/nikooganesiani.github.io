import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { saveProductPhoto } from '../server/media.mjs';
import { createDocument, validateDocument } from '../public/model.js';

const { srcset, variantName, variantWidths } = globalThis.EnkaCardImages;
const base = 'https://img.example.test';
const name = '0ad4c817-c4e4-47ef-be7b-6d76ba7a9db3.webp';
const url = `${base}/${name}`;
const createWebP = (width, height, options) => sharp({ create: { width, height, channels: 4, background: '#cc632d80' } }).webp(options).toBuffer();

async function photoRequest({ existing, width = 800, height = 600, includeVariants = true, invalidWidth } = {}) {
  const form = new FormData();
  if (existing) form.set('source', existing);
  else form.set('file', new Blob([await createWebP(width, height)], { type: 'image/webp' }), 'original.webp');
  if (includeVariants) for (const size of variantWidths(width)) {
    const image = await createWebP(invalidWidth === size ? size + 1 : size, Math.round(height * size / width), { lossless: size === 160 });
    form.set(`w${size}`, new Blob([image], { type: 'image/webp' }), `${size}.webp`);
  }
  return new Request('http://localhost/api/product-photo', { method: 'POST', body: form });
}

test('Partial thumbnail writes leave a usable original, and concurrent retries reuse the same files', async () => {
  const files = new Map();
  let fail = true;
  const storage = { async create(key, bytes) {
    if (fail && key.endsWith('-320.webp')) throw new Error('R2 unavailable');
    if (!files.has(key)) files.set(key, bytes);
  } };
  const first = await saveProductPhoto(await photoRequest(), storage, base);
  const original = first.url.split('/').at(-1);
  assert.equal(first.width, undefined);
  assert.ok(files.has(original));
  assert.ok(!files.has(variantName(original, 320)));
  const priorThumbnail = files.get(variantName(original, 160));
  fail = false;
  const requests = await Promise.all([photoRequest(), photoRequest()]);
  const [second, third] = await Promise.all(requests.map(request => saveProductPhoto(request, storage, base)));
  assert.deepEqual(second, { url: first.url, width: 800 });
  assert.deepEqual(third, second);
  assert.equal(files.get(variantName(original, 160)), priorThumbnail);
  assert.equal(files.size, variantWidths(800).length + 1);
});

test('Backfill writes only the variants and validates their dimensions against the stored original', async () => {
  const written = [];
  const original = await createWebP(480, 640);
  const storage = { read: key => key === name ? original : null, create: async key => written.push(key) };
  await assert.rejects(saveProductPhoto(await photoRequest({ existing: url, width: 480, height: 640, invalidWidth: 240 }), storage, base), { status: 422 });
  await assert.rejects(saveProductPhoto(await photoRequest({ existing: 'https://other.example/' + name }), storage, base), { status: 422 });
  assert.deepEqual(written, []);
  assert.deepEqual(await saveProductPhoto(await photoRequest({ existing: url, width: 480, height: 640 }), storage, base), { url, width: 480 });
  assert.deepEqual(written, [160, 240, 320].map(width => variantName(name, width)));
  assert.match(srcset(url, 480), /-320\.webp 320w, https:\/\/img\.example\.test\/[^,]+\.webp 480w$/);
  assert.doesNotMatch(srcset(url, 1600), /1600w/);
  assert.equal(srcset(url, 120), '');
});

test('Catalog metadata associates thumbnails with the original URL across reordering', () => {
  const other = 'https://other.example/photo.webp';
  const document = createDocument({ products: [{ id: 'test', name: 'Photo', price: '10', images: [url, other], categories: [], subcategories: [], specs: {} }] });
  const product = document.catalog.products[0];
  product.cardImages = { [url]: 800 };
  product.images.reverse();
  assert.deepEqual(validateDocument(document), []);
  product.images.pop();
  assert.match(validateDocument(document).join(), /миниатюр/);
});
