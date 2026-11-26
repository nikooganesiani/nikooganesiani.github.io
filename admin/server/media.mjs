import { ApiError } from './service.mjs';
import '../public/card-images.js';

const { originalName, variantName, variantWidths } = globalThis.EnkaCardImages;
const maxFileSize = 200 * 1024;

async function webpBytes(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new ApiError(400, 'Выберите изображение.');
  if (file.type !== 'image/webp' || file.size > maxFileSize || file.size < 12) throw new ApiError(422, 'Нужен WebP размером до 200 КБ.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WEBP') throw new ApiError(422, 'Содержимое файла не соответствует WebP.');
  return bytes;
}

const tag = (bytes, offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));

function webpDimensions(bytes) {
  if (bytes.length < 25 || tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) return null;
  const size = view.getUint32(16, true);
  if (20 + size + (size % 2) > bytes.length) return null;
  switch (tag(bytes, 12)) {
    case 'VP8X': {
      if (size !== 10) return null;
      const read = offset => 1 + (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16);
      return { width: read(24), height: read(27) };
    }
    case 'VP8L': {
      if (size < 5 || bytes[20] !== 0x2f) return null;
      const dimensions = view.getUint32(21, true);
      return { width: (dimensions & 0x3fff) + 1, height: ((dimensions >> 14) & 0x3fff) + 1 };
    }
    case 'VP8 ':
      if (size < 10 || (bytes[20] & 1) || bytes[23] !== 0x9d || bytes[24] !== 1 || bytes[25] !== 0x2a) return null;
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    default:
      return null;
  }
}

export async function readWebP(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 230000) throw new ApiError(413, 'Изображение слишком большое.');
  const form = await request.formData();
  return { bytes: await webpBytes(form.get('file')), name: crypto.randomUUID() + '.webp' };
}

export async function saveProductPhoto(request, storage, base = '/media') {
  if (Number(request.headers.get('content-length')) > 7 * maxFileSize + 8192) throw new ApiError(413, 'Изображение слишком большое.');
  const form = await request.formData();
  const existing = form.get('source');
  let name, bytes;
  if (existing !== null) {
    name = originalName(existing);
    if (!name || existing !== `${base}/${name}` || form.has('file')) throw new ApiError(422, 'Выберите фотографию из хранилища Studio.');
    bytes = await storage.read(name);
    if (!bytes) throw new ApiError(404, 'Оригинал фотографии не найден.');
  } else {
    bytes = await webpBytes(form.get('file'));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    name = [...digest].map(value => value.toString(16).padStart(2, '0')).join('') + '.webp';
  }
  const dimensions = webpDimensions(bytes);
  if (!dimensions?.width || !dimensions.height || dimensions.width > 16384 || dimensions.height > 16384) throw new ApiError(422, 'Не удалось прочитать размер фотографии.');

  const widths = variantWidths(dimensions.width);
  const submitted = [...form.keys()].filter(key => key !== 'file' && key !== 'source');
  const complete = widths.length === submitted.length && widths.every(width => form.getAll(`w${width}`).length === 1);
  if (!complete && (existing !== null || submitted.length)) throw new ApiError(422, 'Неполный набор миниатюр.');
  const variants = [];
  if (complete) for (const width of widths) {
    const image = await webpBytes(form.get(`w${width}`));
    const size = webpDimensions(image);
    const height = Math.max(1, Math.round(dimensions.height * width / dimensions.width));
    if (size?.width !== width || size.height !== height) throw new ApiError(422, 'Размер миниатюры не соответствует оригиналу.');
    variants.push([variantName(name, width), image]);
  }

  if (existing === null) await storage.create(name, bytes);
  const writes = await Promise.allSettled(variants.map(async ([key, image]) => storage.create(key, image)));
  const ready = complete && writes.every(result => result.status === 'fulfilled');
  return { url: `${base}/${name}`, ...(ready ? { width: dimensions.width } : {}) };
}
