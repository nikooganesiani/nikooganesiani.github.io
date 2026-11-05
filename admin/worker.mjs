import { DurableObject } from 'cloudflare:workers';
import { authenticate } from './server/auth.mjs';
import { CatalogService, handleApi, json, ApiError } from './server/service.mjs';
import { CatalogStore } from './server/store.mjs';
import { readWebP } from './server/media.mjs';

const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY'
};
function secure(response) {
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY)) result.headers.set(key, value);
  return result;
}

export class CatalogWriter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.store = new CatalogStore((query, ...values) => [...ctx.storage.sql.exec(query, ...values)], callback => ctx.storage.transactionSync(callback));
    this.service = new CatalogService(this.store, env.CATALOG_KV, { environment: env.APP_ENV || 'staging' });
    this.queue = Promise.resolve();
  }
  fetch(request) {
    // Explicitly serialize external KV awaits too; DO input gates alone do not.
    const operation = this.queue.catch(() => {}).then(() => this.handle(request));
    this.queue = operation.catch(() => {});
    return operation;
  }
  async handle(request) {
    try {
      if (this.env.APP_ENV === 'staging' && (!this.env.STAGING_MARKER || await this.env.CATALOG_KV.get('enka-admin:staging-marker') !== this.env.STAGING_MARKER)) return json({ error: 'Привязка тестового хранилища не подтверждена. Проверьте подготовку staging; рабочий каталог не изменялся.' }, 503);
      if (!this.store.getState()) {
        const catalog = await this.env.CATALOG_KV.get('catalog', { type: 'json' });
        if (!catalog) return json({ error: 'Тестовый KV пуст. Сначала импортируйте каталог по инструкции подключения.' }, 409);
        await this.service.initialize(catalog);
      }
      if (new URL(request.url).pathname === '/api/publish' && this.env.APP_ENV === 'production' && this.env.ALLOW_PRODUCTION_PUBLISH !== 'true') return json({ error: 'Публикация в рабочий каталог ещё не включена. Завершите проверку перехода.' }, 403);
      if (new URL(request.url).pathname === '/api/publish' && this.env.APP_ENV === 'production') {
        const products = this.service.view().document.catalog.products;
        if (products.some(product => product.images.some(image => new URL(image, 'https://local.invalid').pathname.startsWith('/media/')))) return json({ error: 'В каталоге есть тестовые ссылки /media/. Перед рабочей публикацией загрузите эти фотографии в рабочий R2 с публичным адресом.' }, 422);
      }
      return await handleApi(request, this.service, request.headers.get('X-Enka-Editor') || 'Редактор', { publicImagesBase: this.env.PUBLIC_IMAGES_BASE || '', storefrontBase: this.env.STOREFRONT_BASE || 'https://enkaelectronics.com.ge' });
    } catch { return json({ error: 'Не удалось прочитать хранилище каталога.' }, 503); }
  }
}

export default {
  async fetch(request, env) {
    const auth = await authenticate(request, env);
    if (!auth.identity) return secure(json({ error: auth.error }, auth.status));
    if (!['staging', 'production'].includes(env.APP_ENV)) return secure(json({ error: 'Не задано корректное окружение панели.' }, 503));
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) return secure(json({ error: 'Запрос должен быть отправлен из этой панели.' }, 403));
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      try {
        if (env.APP_ENV === 'production' && !env.PUBLIC_IMAGES_BASE?.startsWith('https://')) return secure(json({ error: 'Сначала настройте публичный адрес рабочего хранилища изображений.' }, 503));
        const { bytes, name } = await readWebP(request);
        await env.IMAGES_BUCKET.put(name, bytes, { httpMetadata: { contentType: 'image/webp' } });
        const base = env.PUBLIC_IMAGES_BASE?.replace(/\/$/, '');
        return secure(json({ url: base ? `${base}/${name}` : `/media/${name}` }));
      } catch (error) { return secure(json({ error: error instanceof ApiError ? error.message : 'Не удалось загрузить изображение.' }, error.status || 500)); }
    }
    if (url.pathname.startsWith('/media/') && request.method === 'GET') {
      const name = url.pathname.slice(7);
      if (!/^[a-f0-9-]+\.webp$/.test(name)) return secure(new Response('Not found', { status: 404 }));
      const object = await env.IMAGES_BUCKET.get(name);
      return secure(object ? new Response(object.body, { headers: { 'Content-Type': 'image/webp' } }) : new Response('Not found', { status: 404 }));
    }
    if (url.pathname.startsWith('/api/')) {
      const forwarded = new Request(request);
      forwarded.headers.delete('X-Enka-Editor');
      forwarded.headers.set('X-Enka-Editor', auth.identity);
      return secure(await env.CATALOG_WRITER.get(env.CATALOG_WRITER.idFromName(env.APP_ENV === 'production' ? 'catalog-production-v1' : 'catalog-v1')).fetch(forwarded));
    }
    return secure(await env.ASSETS.fetch(request));
  }
};
