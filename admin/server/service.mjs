import { createDocument, validateDocument, clone, catalogDiff, importDocument } from '../public/model.js';

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
export const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
export async function requestJson(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw new ApiError(415, 'Ожидается application/json.');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 4000000) throw new ApiError(413, 'Файл слишком большой. Максимум 4 МБ.');
  try { return JSON.parse(text); } catch { throw new ApiError(400, 'Не удалось прочитать JSON.'); }
}

export class CatalogService {
  constructor(store, publisher, { environment = 'staging' } = {}) { this.store = store; this.publisher = publisher; this.environment = environment; }
  async initialize(catalog) {
    if (!this.store.getState()) this.store.initialize({ revision: 1, publishedRevision: 0, document: createDocument(catalog), updatedAt: new Date().toISOString(), updatedBy: 'Первичный импорт', publishedAt: null, pending: null });
  }
  view() {
    const state = this.store.getState();
    if (!state) throw new ApiError(409, 'Каталог ещё не импортирован.');
    return clone(state);
  }
  checkRevision(expectedRevision) {
    const state = this.view();
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== state.revision) throw new ApiError(409, 'Каталог уже изменён в другой вкладке. Экспортируйте свои изменения и загрузите свежую версию.', { currentRevision: state.revision, code: 'REVISION_CONFLICT' });
    if (state.pending) throw new ApiError(409, 'Предыдущая публикация не завершена. Сначала повторите её.', { code: 'PUBLISH_PENDING' });
    return state;
  }
  save(body, identity) {
    const previous = this.checkRevision(body.expectedRevision);
    const errors = validateDocument(body.document);
    if (errors.length) throw new ApiError(422, 'Проверьте данные каталога.', errors);
    // Existing IDs are stable; removals are explicit in the publication review.
    const state = { ...previous, document: clone(body.document), revision: previous.revision + 1, updatedAt: new Date().toISOString(), updatedBy: identity };
    this.store.commit(state, String(body.message || 'Сохранение черновика').slice(0, 300), body.expectedRevision);
    return this.view();
  }
  restore(body, identity) {
    this.checkRevision(body.expectedRevision);
    const snapshot = this.store.getRevision(Number(body.revision));
    if (!snapshot) throw new ApiError(404, 'Версия не найдена.');
    return this.save({ expectedRevision: body.expectedRevision, document: importDocument(snapshot.document), message: `Восстановление версии ${body.revision} в черновик` }, identity);
  }
  review() {
    const state = this.view();
    const published = state.publishedRevision ? this.store.getRevision(state.publishedRevision) : this.store.getRevision(1);
    return { ...catalogDiff(published?.document, state.document), revision: state.revision, publishedRevision: state.publishedRevision, errors: validateDocument(state.document), productCount: state.document.catalog.products.length };
  }
  async publish(body, identity) {
    let state = this.view();
    if (body.expectedRevision !== state.revision) throw new ApiError(409, 'Черновик изменился. Сначала обновите просмотр изменений.');
    if (state.publishedRevision === state.revision && !state.pending) return state;
    const errors = validateDocument(state.document);
    if (errors.length) throw new ApiError(422, 'Каталог не прошёл проверку.', errors);
    if (!state.pending) {
      state.pending = { id: crypto.randomUUID(), revision: state.revision, startedAt: new Date().toISOString(), by: identity, step: 0 };
      this.store.update(state);
    }
    // One visible commit point: a pointer INSIDE the legacy catalog value.
    // Old readers ignore the optional metadata. New readers use it to load the
    // matching immutable translation release. No second public pointer to race.
    const release = { schemaVersion: 1, revision: state.revision, createdAt: state.pending.startedAt, document: state.document };
    const writes = [
      [`catalog:release:${state.pending.id}`, JSON.stringify(release)],
      ['catalog', JSON.stringify({ ...state.document.catalog, ...(state.document.store ? { _enkaStore: state.document.store } : {}), _enkaPublication: { releaseKey: `catalog:release:${state.pending.id}`, revision: state.revision } })]
    ];
    try {
      for (let index = state.pending.step; index < writes.length; index++) {
        await this.publisher.put(...writes[index]);
        state.pending.step = index + 1;
        this.store.update(state);
      }
      state.publishedRevision = state.revision;
      state.publishedAt = new Date().toISOString();
      state.pending = null;
      this.store.update(state);
    } catch {
      throw new ApiError(503, 'Не удалось подтвердить завершение публикации. Версия могла быть передана в каталог. Черновик и история сохранены; повторите публикацию, чтобы завершить её безопасно.', { code: 'PUBLISH_PENDING', revision: state.revision });
    }
    return this.view();
  }
}

export async function handleApi(request, service, identity, config) {
  const url = new URL(request.url);
  try {
    if (request.method === 'GET' && url.pathname === '/api/session') return json({ identity, environment: service.environment, ...config });
    if (request.method === 'GET' && url.pathname === '/api/catalog') return json(service.view());
    if (request.method === 'GET' && url.pathname === '/api/review') return json(service.review());
    if (request.method === 'GET' && url.pathname === '/api/history') return json({ revisions: service.store.history() });
    if (request.method === 'GET' && url.pathname === '/api/export') return json({ format: 'enka-admin-backup', exportedAt: new Date().toISOString(), ...service.view() }, 200, { 'Content-Disposition': 'attachment; filename="enka-catalog-backup.json"' });
    if (request.method === 'PUT' && url.pathname === '/api/draft') return json(service.save(await requestJson(request), identity));
    if (request.method === 'POST' && url.pathname === '/api/restore') return json(service.restore(await requestJson(request), identity));
    if (request.method === 'POST' && url.pathname === '/api/publish') return json(await service.publish(await requestJson(request), identity));
    return json({ error: 'Маршрут не найден.' }, 404);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, details: error.details }, error.status);
    console.error('Admin API error', error.name);
    return json({ error: 'Не удалось выполнить операцию. Попробуйте ещё раз.' }, 500);
  }
}
