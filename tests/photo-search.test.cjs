const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function api() {
  const window = {};
  vm.runInNewContext(fs.readFileSync('assets/js/main/photo-search.js', 'utf8'), { window, document: { addEventListener() {} } });
  return window.PhotoSearch;
}
test('Photo search validates type and size before loading a model or reading an image', () => {
  const { validateFile } = api();
  for (const file of [null, { type: 'image/svg+xml', size: 12 }, { type: 'image/jpeg', size: 0 }, { type: 'image/png', size: 11 * 1024 * 1024 }]) {
    assert.throws(() => validateFile(file));
  }
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.doesNotThrow(() => validateFile({ type, size: 100 }));
});
test('Visual ranking orders normalized embeddings and excludes unrelated or incompatible vectors', () => {
  const { normalize, rank } = api();
  const query = normalize([4, 0, 0]);
  const results = rank(query, [
    { product: { id: 'similar' }, vector: normalize([3, 1, 0]) },
    { product: { id: 'other' }, vector: normalize([0, 1, 0]) },
    { product: { id: 'same' }, vector: normalize([10, 0, 0]) },
    { product: { id: 'bad-model' }, vector: normalize([1, 0]) }
  ]);
  assert.equal(JSON.stringify(results.map(item => item.product.id)), '["same","similar"]');
  assert.throws(() => normalize([0, 0, 0]));
  assert.throws(() => normalize([NaN, 1]));
});
