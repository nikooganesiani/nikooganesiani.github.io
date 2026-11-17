const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { photoKey, foregroundMask, maskSVG, buildCategoryPhotoMasks } = require('../scripts/build-category-photo-masks.cjs');

function photograph() {
  const pixels = new Uint8Array(7 * 7 * 4).fill(255);
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) {
    if (x !== 1 && x !== 5 && y !== 1 && y !== 5) continue;
    const offset = (y * 7 + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 180;
  }
  return pixels;
}

test('Display masks remove only the outside white background and preserve enclosed white product highlights', async () => {
  const pixels = photograph(), before = pixels.slice();
  const mask = foregroundMask(pixels, 7, 7);
  assert.equal(mask[0], 0);
  assert.equal(mask[8], 1);
  assert.equal(mask[3 * 7 + 3], 1);
  assert.deepEqual(pixels, before, 'product colors are not modified');
  const { data } = await sharp(Buffer.from(maskSVG(mask, 7, 7))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0);
  assert.equal(data[(3 * 7 + 3) * 4 + 3], 255);
});

test('Local image masks are reusable SVG assets with matching photo selectors', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enka-photo-masks-'));
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'img'));
  await sharp(Buffer.from(photograph()), { raw: { width: 7, height: 7, channels: 4 } }).png().toFile(path.join(root, 'img/photo.png'));
  const products = [{ images: ['/img/photo.png'] }];
  const first = await buildCategoryPhotoMasks(products, root);
  assert.equal(first.created, 1);
  const directory = path.join(root, 'img/categories/photo-masks');
  assert.ok(fs.existsSync(path.join(directory, photoKey('/img/photo.png') + '.svg')));
  assert.ok(fs.readFileSync(path.join(directory, 'masks.css'), 'utf8').includes(`data-photo-key="${photoKey('/img/photo.png')}"`));
  assert.equal((await buildCategoryPhotoMasks(products, root)).created, 0);
});

test('Subcategory patterns remain stable by ID and differ between subcategories, including in static HTML', async () => {
  await import('../admin/public/store-engine.js');
  await import('../admin/public/store-visuals.js');
  const visuals = globalThis.EnkaStoreVisuals;
  assert.equal(visuals.photoKey('https://images.test/photo.webp'), photoKey('https://images.test/photo.webp'));
  const settings = id => visuals.subcategory('kitchen', { id, name: id }, null, true).match(/ style="([^"]+)"/)[1];
  const coffee = settings('coffee');
  assert.equal(settings('coffee'), coffee);
  assert.notEqual(settings('juicer'), coffee);
  assert.notEqual(settings('mixer'), settings('juicer'));
});
