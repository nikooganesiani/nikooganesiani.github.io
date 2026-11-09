// Build-time only: CORS on the public image bucket prevents browser-side indexing.
// Uses the same model and white letterbox preprocessing as photo-search.js.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tf = require('../assets/vendor/photo-search/tf.min.js');

async function buildPhotoIndex(products, sharp) {
  const output = path.resolve(__dirname, '../assets/data/photo-search-index.json');
  const modelID = 'mobilenet-v2-100-224-v1';
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(output, 'utf8')); } catch {}
  const cache = new Map(previous.model === modelID ? previous.items.map(item => [item.image, item.vector]) : []);
  const sandbox = { tf, console, fetch, URL, performance, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../assets/vendor/photo-search/mobilenet.min.js'), 'utf8'), sandbox);
  let model;
  const items = [];
  for (const product of products) {
    const image = (Array.isArray(product.images) ? product.images : [product.image]).find(value =>
      typeof value === 'string' && /^https?:\/\//.test(value) && !/youtu(?:be\.com|\.be)/.test(value));
    if (!image) continue;
    let vector = cache.get(image);
    if (!vector) {
      if (!model) { await tf.setBackend('cpu'); model = await sandbox.mobilenet.load({ version: 2, alpha: 1.0 }); }
      const response = await fetch(image, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error('Photo index: image HTTP '+response.status+' for '+product.id);
      const buffer = Buffer.from(await response.arrayBuffer());
      const pixels = await sharp(buffer).rotate().resize(224, 224, { fit: 'contain', background: '#fff' }).flatten({ background: '#fff' }).removeAlpha().raw().toBuffer();
      const input = tf.tensor3d(new Uint8Array(pixels), [224, 224, 3], 'int32');
      let embedding;
      try {
        embedding = model.infer(input, true);
        const raw = Array.from(await embedding.data());
        const norm = Math.hypot(...raw);
        vector = raw.map(value => Math.round(value / norm * 1000000) / 1000000);
      } finally { input.dispose(); embedding?.dispose(); }
      console.log('Indexed photo:', product.id);
    }
    items.push({ id: String(product.id), image, vector });
  }
  model?.model?.dispose();
  if (!items.length) throw Error('Photo index is empty');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ model: modelID, items })+'\n');
  console.log('Photo search index:', items.length, 'products.');
}
module.exports = { buildPhotoIndex };
if (require.main === module) {
  const sharp = require('sharp');
  const catalog = JSON.parse(fs.readFileSync(process.argv[2] || '.local/catalog.json', 'utf8'));
  buildPhotoIndex(catalog.products || catalog, sharp).catch(error => { console.error(error.message); process.exitCode = 1; });
}
