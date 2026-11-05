import { ApiError } from './service.mjs';
export async function readWebP(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 230000) throw new ApiError(413, 'Изображение слишком большое.');
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') throw new ApiError(400, 'Выберите изображение.');
  if (file.type !== 'image/webp' || file.size > 200 * 1024 || file.size < 12) throw new ApiError(422, 'Нужен WebP размером до 200 КБ.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (text(0, 4) !== 'RIFF' || text(8, 12) !== 'WEBP') throw new ApiError(422, 'Содержимое файла не соответствует WebP.');
  return { bytes, name: crypto.randomUUID() + '.webp' };
}
