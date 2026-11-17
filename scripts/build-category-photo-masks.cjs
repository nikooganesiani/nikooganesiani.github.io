// Display masks preserve the original photograph and its light-colored product parts.
// Only near-white pixels connected to the outside of the image are excluded.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

function photoKey(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function foregroundMask(pixels, width, height) {
  const background = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let start = 0, end = 0;
  const add = index => {
    if (background[index]) return;
    const offset = index * 4;
    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    if (pixels[offset + 3] > 0 && (Math.min(r, g, b) < 247 || Math.max(r, g, b) - Math.min(r, g, b) > 10)) return;
    background[index] = 1; queue[end++] = index;
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (start < end) {
    const index = queue[start++], x = index % width;
    if (x > 0) add(index - 1);
    if (x < width - 1) add(index + 1);
    if (index >= width) add(index - width);
    if (index < (height - 1) * width) add(index + width);
  }
  return background.map(value => 1 - value);
}

function maskSVG(mask, width, height) {
  const stride = width + 1;
  const edges = new Map();
  const add = (a, b) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push(b); };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x; if (!mask[i]) continue;
    const a = y * stride + x, b = a + 1, d = (y + 1) * stride + x, c = d + 1;
    if (y === 0 || !mask[i - width]) add(a, b);
    if (x === width - 1 || !mask[i + 1]) add(b, c);
    if (y === height - 1 || !mask[i + width]) add(c, d);
    if (x === 0 || !mask[i - 1]) add(d, a);
  }
  const paths = [];
  for (const [first, list] of edges) while (list.length) {
    const points = []; let current = first;
    do {
      points.push([current % stride, Math.floor(current / stride)]);
      const next = edges.get(current)?.pop();
      if (next === undefined) break;
      current = next;
    } while (current !== first);
    if (points.length < 4) continue;
    const simplified = points.filter((point, i) => {
      const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
      return (point[0] - a[0]) * (b[1] - point[1]) !== (point[1] - a[1]) * (b[0] - point[0]);
    });
    paths.push(simplified.map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join('') + 'Z');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="white" fill-rule="evenodd" d="${paths.join('')}"/></svg>\n`;
}

async function buildCategoryPhotoMasks(products, root = process.cwd()) {
  const directory = path.join(root, 'img/categories/photo-masks');
  fs.mkdirSync(directory, { recursive: true });
  const cacheFile = path.join(directory, 'unmasked.json');
  let unmasked;
  try { unmasked = new Set(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).filter(key => /^[a-f0-9]{8}$/.test(key))); } catch { unmasked = new Set(); }
  const images = [...new Set(products.flatMap(p => p.images || []))].filter(value => typeof value === 'string' && (/^https:\/\//.test(value) || /^\/img\//.test(value)) && !/youtu\.?be/i.test(value));
  let next = 0, created = 0; const failures = [];
  async function worker() {
    while (next < images.length) {
      const image = images[next++], key = photoKey(image), file = path.join(directory, key + '.svg');
      if (fs.existsSync(file) || unmasked.has(key)) continue;
      try {
        let bytes;
        if (image.startsWith('/img/')) {
          const imagePath = path.resolve(root, '.' + image);
          if (!imagePath.startsWith(path.resolve(root, 'img') + path.sep)) throw Error('Image outside project assets');
          bytes = fs.readFileSync(imagePath);
        }
        else { const response = await fetch(image, { signal: AbortSignal.timeout(15000) }); if (!response.ok) throw Error(response.status); bytes = Buffer.from(await response.arrayBuffer()); }
        const { data, info } = await sharp(bytes).rotate().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        // Preserve photos that already have a real transparent background.
        if (data.some((value, i) => i % 4 === 3 && value < 255)) { unmasked.add(key); continue; }
        const mask = foregroundMask(data, info.width, info.height);
        const count = mask.reduce((sum, value) => sum + value, 0);
        if (count < 4 || count > mask.length * .98) { unmasked.add(key); continue; }
        fs.writeFileSync(file, maskSVG(mask, info.width, info.height)); created++;
      } catch { failures.push(key); }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  const rules = fs.readdirSync(directory).filter(file => /^[a-f0-9]{8}\.svg$/.test(file)).sort().map(file => `.enka-subcategory-image[data-photo-key="${file.slice(0, -4)}"]{-webkit-mask-image:url('/img/categories/photo-masks/${file}');mask-image:url('/img/categories/photo-masks/${file}')}`);
  fs.writeFileSync(path.join(directory, 'masks.css'), '/* Generated display masks for product photographs. */\n' + rules.join('\n') + '\n');
  fs.writeFileSync(cacheFile, JSON.stringify([...unmasked].sort()) + '\n');
  console.log(`Category photo masks: ${rules.length} available, ${created} created, ${failures.length} unavailable.`);
  return { available: rules.length, created, failures };
}

module.exports = { photoKey, foregroundMask, maskSVG, buildCategoryPhotoMasks };
if (require.main === module) {
  const flag = process.argv.indexOf('--catalog-file');
  if (flag < 0) throw Error('Pass --catalog-file PATH');
  const data = JSON.parse(fs.readFileSync(process.argv[flag + 1], 'utf8'));
  buildCategoryPhotoMasks(Array.isArray(data) ? data : data.products).catch(error => { console.error(error.message); process.exitCode = 1; });
}
