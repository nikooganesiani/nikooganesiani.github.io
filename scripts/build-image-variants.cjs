const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
require('../admin/public/card-images.js');

const { variantWidths } = globalThis.EnkaCardImages;

async function buildLocalImageSrcset(root, source, profile) {
  if (!/^\/img\/(?:[\w-]+\/)*[\w.-]+\.(?:webp|png|jpe?g)$/i.test(source)) return '';
  const file = path.join(root, source);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile()) return '';
  const original = sharp(file);
  const metadata = await original.metadata();
  const width = metadata.autoOrient?.width || metadata.width;
  const widths = variantWidths(width, profile);
  if (!widths.length || metadata.pages > 1) return '';

  const directory = path.join(root, 'assets/compiled');
  fs.mkdirSync(directory, { recursive: true });
  const candidates = [];
  for (const size of widths) {
    const bytes = await original.clone().autoOrient().resize({ width: size }).webp({ quality: 80, effort: 5 }).toBuffer();
    if (bytes.length >= stat.size) continue;
    const name = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16) + '.webp';
    fs.writeFileSync(path.join(directory, name), bytes);
    candidates.push(`/assets/compiled/${name} ${size}w`);
  }
  if (!candidates.length) return '';
  return [...candidates, `${source} ${width}w`].join(', ');
}

module.exports = { buildLocalImageSrcset };
