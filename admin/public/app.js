import { t, ui } from './studio-i18n.js';
import { LOCALES, TEXT_FIELDS, FIELD_LABELS, STOCK_LABELS, clone, priceOf, stockOf, safeMedia, validateDocument, importDocument, registerAttributes, translationFor, savedTranslation, entryState, updateEntry, attributeId, coverage, approveProduct, localizedProduct } from './model.js';
import { ensureStore, createStoreEditor } from './store-editor.js';
import { initStudioLanguage, getLocale } from './studio-i18n.js';

initStudioLanguage();

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  languages: '<path d="M3 5h12M9 3v2m4 0c-1 6-4 9-9 12m1-9c2 4 5 7 9 9m1 4 4-11 4 11m-6.5-4h5"/>',
  sliders: '<path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10M7 3v6m10 0v6M7 15v6"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7m2-4v5l3 2"/>',
  box: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m8.5 11.5 2.5 2.5 4.5-5"/>',
  'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>', 'chevron-right': '<path d="m9 5 7 7-7 7"/>', 'chevron-left': '<path d="m15 5-7 7 7 7"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.75" cy="10.75" r="7.25"/><path d="m16 16 4.5 4.5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>', upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-4-4L5 15l-1 5Z"/>', check: '<path d="m5 12 4 4L19 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  refresh: '<path d="M20 7a8 8 0 0 0-13-2L3 9m0-6v6h6m-5 8a8 8 0 0 0 13 2l4-4m0 6v-6h-6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  'arrow-up': '<path d="M12 20V4m-6 6 6-6 6 6"/>', 'arrow-down': '<path d="M12 4v16m-6-6 6 6 6-6"/>', image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>'
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`; }
function hydrateIcons() { for (const element of $$('[data-icon]')) { element.innerHTML = icon(element.dataset.icon); element.removeAttribute('data-icon'); } }
const STATE_NAMES = { missing: 'Нет перевода', stale: 'Оригинал изменён', review: 'Нужна проверка', approved: 'Проверено' };
const money = value => Number.isFinite(priceOf(value)) ? new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(priceOf(value)) + ' ₾' : '—';
const date = value => value ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone:'Asia/Tbilisi' }).format(new Date(value)) : t('Ещё не опубликован');
const state = { server: null, document: null, session: null, taxonomy: [], dirty: false, busy: false, page: 1, pageSize: 8, view: 'catalog', filter: 'all', query: '', category: '', sort: 'default', product: null, editorTab: 'base', previewLocale: 'ka', originalIds: new Set() };
const storeEditor = createStoreEditor({ state, escape:e, markDirty, toast, confirmMessage, renderApp:render, uploadImage });
let toastTimer;
function toast(message, error = false) { clearTimeout(toastTimer); $('#toast').textContent = t(message); $('#toast').classList.toggle('error', error); $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 8500 : 4300); }
function showAlert(message) {
  const target = $('#connection-alert');
  target.replaceChildren();
  target.append(document.createTextNode(t(message) + ' '));
  const button = document.createElement('button'); button.className = 'text-button'; button.textContent = t('Загрузить свежую версию'); button.onclick = () => reloadCatalog(); target.append(button); target.hidden = false;
}
async function api(route, options = {}) {
  const response = await fetch(route, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || ui`Ошибка ${response.status}`); error.status = response.status; error.details = body.details; throw error; }
  return body;
}
async function busy(message, operation) {
  if (state.busy) return;
  state.busy = true; $('#busy-text').textContent = message; $('#busy-overlay').hidden = false;
  const controls = [...$$('dialog[open] input, dialog[open] textarea, dialog[open] select, dialog[open] button')].filter(control => !control.disabled);
  controls.forEach(control => { control.disabled = true; }); updateSavebar();
  try { return await operation(); }
  catch (error) { toast(error.message, true); if (error.status === 409) showAlert(error.message); throw error; }
  finally { state.busy = false; $('#busy-overlay').hidden = true; controls.forEach(control => { if (control.isConnected) control.disabled = false; }); updateSavebar(); }
}
function confirmMessage(title, text, label = t('Продолжить')) {
  return new Promise(resolve => {
    const dialog = $('#message-dialog'); $('#message-title').textContent = t(title); $('#message-text').textContent = text; $('#message-confirm').textContent = t(label);
    let result = false;
    $('#message-confirm').onclick = () => { result = true; dialog.close(); };
    $('#message-cancel').onclick = () => dialog.close();
    dialog.addEventListener('close', () => resolve(result), { once: true }); dialog.showModal();
  });
}
function download(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function markDirty() { state.dirty = true; updateSavebar(); }
function updateSavebar() {
  if (!state.server) return;
  $('#save-draft').disabled = !state.dirty || state.busy;
  $('#review-publish').disabled = state.busy;
  $('#draft-status').textContent = state.dirty ? t('Есть несохранённые изменения') : state.server.pending ? t('Публикация требует повторной попытки') : ui`Черновик v${state.server.revision} сохранён`;
  $('#draft-description').textContent = state.dirty ? t('Сохраните их перед публикацией или выходом.') : ui`Последнее сохранение: ${date(state.server.updatedAt)}`;
  $('#sync-status').textContent = state.dirty ? t('Не сохранено') : t('Все изменения сохранены');
  $('#stat-version').textContent = 'v' + state.server.revision;
  $('#stat-version-caption').textContent = state.server.publishedRevision ? ui`Опубликована v${state.server.publishedRevision}` : t('Ещё не опубликован');
}
function acceptServer(value) { state.server = value; state.document = clone(value.document); state.originalIds = new Set(value.document.catalog.products.map(product => product.id)); state.dirty = ensureStore(state.document); $('#connection-alert').hidden = true; updateSavebar(); }
async function reloadCatalog() {
  if (state.dirty && !await confirmMessage(t('Загрузить сохранённый каталог?'), t('Несохранённые изменения будут потеряны. При необходимости сначала экспортируйте их.'), t('Загрузить'))) return;
  try { await busy(t('Загружаем каталог…'), async () => { acceptServer(await api('/api/catalog')); render(); }); } catch {}
}
function categoryLabel(id) { return state.document?.store?.categories.find(category => category.id === id)?.title[getLocale()] || state.taxonomy.find(category => category.id === id)?.name || id; }
function rowCoverage(product, locale) { return coverage(state.document, product, locale); }
function localeBadges(product) { return LOCALES.map(locale => { const progress = rowCoverage(product, locale); return ui`<span class="locale-badge ${progress.state}" title="${locale.toUpperCase()}: ${progress.approved} из ${progress.total} полей проверено">${locale.toUpperCase()}</span>`; }).join(''); }
function imageMarkup(product, className = 'product-image') {
  const image = product.images.find(value => safeMedia(value) && !/youtu\.?be/.test(value));
  return image ? `<img class="${className}" src="${e(image)}" alt="" loading="lazy" decoding="async">` : `<span class="product-image-placeholder">${icon('image')}</span>`;
}
function filteredProducts() {
  let products = state.document.catalog.products.filter(product => {
    const text = [product.name, product.id, product.sku, product.brand, ...LOCALES.map(locale => savedTranslation(state.document, product.id, locale)?.fields.name?.text || '')].join(' ').toLocaleLowerCase();
    return state.query.toLocaleLowerCase().split(/\s+/).every(term => text.includes(term)) && (!state.category || product.categories.includes(state.category)) && (state.filter !== 'in_stock' || stockOf(product) === 'in_stock') && (state.filter !== 'translation' || LOCALES.some(locale => rowCoverage(product, locale).state !== 'approved'));
  });
  if (state.sort === 'name') products = [...products].sort((a, b) => a.name.localeCompare(b.name, 'ka'));
  if (state.sort.startsWith('price-')) products = [...products].sort((a, b) => (priceOf(a.price) - priceOf(b.price)) * (state.sort === 'price-asc' ? 1 : -1));
  return products;
}
function renderCatalog() {
  const products = state.document.catalog.products;
  const translated = products.filter(product => LOCALES.every(locale => rowCoverage(product, locale).state === 'approved')).length;
  $('#title-count').textContent = products.length; $('#nav-count').textContent = products.length; $('#stat-total').textContent = products.length;
  $('#stat-stock').textContent = products.filter(product => stockOf(product) === 'in_stock').length;
  $('#stat-translations').textContent = `${translated} / ${products.length}`;
  $('#tab-all-count').textContent = products.length; $('#translations-dot').hidden = translated === products.length;
  const visible = filteredProducts(); const pages = Math.max(1, Math.ceil(visible.length / state.pageSize)); state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * state.pageSize;
  $('#product-rows').innerHTML = visible.slice(start, start + state.pageSize).map(product => ui`<tr><td><button type="button" class="product-cell" data-open-product="${e(product.id)}" aria-label="Редактировать ${e(product.name)}">${imageMarkup(product)}<div><span class="product-name" lang="ka">${e(product.name)}</span><span class="product-code">${e(product.brand || 'ENKA')}<span aria-hidden="true"> · </span>SKU ${e(product.sku || product.id)}</span></div></button></td><td><span class="category-pill">${e(categoryLabel(product.categories[0] || t('Без категории')))}</span></td><td><span class="price-current">${e(money(product.price))}</span>${product.oldPrice ? `<span class="price-old">${e(money(product.oldPrice))}</span>` : ''}</td><td><span class="stock-pill ${e(stockOf(product))}"><i></i>${e(t(STOCK_LABELS[stockOf(product)]) || t('Уточняется'))}</span></td><td><span class="locale-badges">${localeBadges(product)}</span></td><td class="last-cell"><button class="icon-button row-open" data-open-product="${e(product.id)}" aria-label="Открыть ${e(product.name)}">${icon('chevron-right')}</button></td></tr>`).join('');
  $('#catalog-empty').hidden = visible.length > 0;
  $('#table-summary').textContent = visible.length ? ui`Показано ${start + 1}–${Math.min(start + state.pageSize, visible.length)} из ${visible.length} товаров` : t('0 товаров');
  $('#page-number').textContent = `${state.page} / ${pages}`; $('#previous-page').disabled = state.page <= 1; $('#next-page').disabled = state.page >= pages;
  const categories = [...new Set([...state.taxonomy.map(category => category.id), ...products.flatMap(product => product.categories)])];
  $('#category-filter').innerHTML = t('<option value="">Все категории</option>') + categories.map(id => `<option value="${e(id)}"${state.category === id ? ' selected' : ''}>${e(categoryLabel(id))}</option>`).join('');
  for (const tab of $$('.panel-tab')) tab.classList.toggle('active', tab.dataset.tab === state.filter);
  $('#page-title').firstChild.textContent = state.view === 'translations' ? t('Переводы товаров') : t('Каталог товаров');
  $('#page-description').textContent = state.view === 'translations' ? t('Ручные переводы на русский и английский. Без автоматических подстановок.') : t('Товары, фотографии и переводы — в одном месте.');
}
function renderAttributes() {
  const query = $('#attribute-search').value.trim().toLocaleLowerCase();
  const attributes = Object.entries(state.document.attributes).filter(([, attribute]) => [attribute.source, ...Object.values(attribute.labels).map(entry => entry.text)].join(' ').toLocaleLowerCase().includes(query));
  $('#attribute-rows').innerHTML = attributes.map(([id, attribute]) => `<div class="attribute-row"><div class="attribute-source" lang="ka">${e(attribute.source)}<small>${e(id)}</small></div>${LOCALES.map(locale => { const entry = attribute.labels[locale]; const status = entryState(entry, attribute.source); return ui`<div class="field"><label class="field-label" for="attr-${e(id)}-${locale}">${locale === 'ru' ? t('Русский') : 'English'} · <span class="translation-state ${status}">${t(STATE_NAMES[status])}</span></label><input id="attr-${e(id)}-${locale}" data-attribute="${e(id)}" data-locale="${locale}" lang="${locale}" value="${e(entry?.text || '')}" placeholder="Введите перевод"><button type="button" data-approve-attribute="${e(id)}" data-locale="${locale}">Отметить как проверенное</button></div>`; }).join('')}</div>`).join('') || t('<div class="empty-state"><p>Характеристики не найдены.</p></div>');
}
async function renderHistory() {
  try {
    const { revisions } = await api('/api/history');
    $('#history-list').innerHTML = revisions.map(item => ui`<article class="history-card"><span class="history-symbol">${icon('history')}</span><div><h3>Версия ${item.revision}${item.revision === state.server.publishedRevision ? t('<span class="history-label">Опубликована</span>') : ''}${item.revision === state.server.revision ? t('<span class="history-label">Текущий черновик</span>') : ''}</h3><p>${e(item.message)} · ${e(date(item.savedAt))} · ${e(item.savedBy)}</p></div><button class="button secondary" data-restore="${item.revision}">${icon('history')}Восстановить</button></article>`).join('');
  } catch (error) { toast(error.message, true); }
}
function render() {
  if (!state.document) return;
  renderSession();
  ensureStore(state.document);
  state.taxonomy = state.document.store.categories.map(c => ({ id:c.id, name:c.title[getLocale()] || c.title.ka, subs:c.subs.map(s=>({id:s.id,name:s.title[getLocale()] || s.title.ka})) }));
  $('#catalog-view').hidden = !['catalog', 'translations'].includes(state.view); $('#attributes-view').hidden = state.view !== 'attributes'; $('#history-view').hidden = state.view !== 'history';
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === state.view));
  $('#breadcrumb-current').textContent = { catalog: t('Каталог'), translations: t('Переводы товаров'), attributes: t('Характеристики'), history: t('История изменений'), ...storeEditor.names }[state.view] || t('Каталог');
  $('#breadcrumb-current').textContent=t($('#breadcrumb-current').textContent);
  storeEditor.render();
  renderCatalog(); if (state.view === 'attributes') renderAttributes(); if (state.view === 'history') renderHistory(); updateSavebar();
}
function renderSession() {
  if(!state.session)return;
  const production=state.session.environment==='production';
  $('#environment').innerHTML=`<i></i>${t(state.session.environment==='local'?'Локальная копия':production?'Рабочий каталог':'Тестовый каталог')}`;
  $('#local-note').textContent=t(production?'После публикации запустите ручную сборку магазина для обновления страниц.':'Рабочий магазин не меняется. Это отдельная копия каталога.');
}
function switchView() {
  const hash = location.hash.slice(1); state.view = ['catalog', 'translations', 'attributes', 'history', ...Object.keys(storeEditor.names)].includes(hash) ? hash : 'catalog';
  if (state.view === 'translations') state.filter = 'translation'; else if (state.view === 'catalog') state.filter = 'all';
  state.page = 1; setMobileMenu(false); render();
}
const mobileLayout = window.matchMedia('(max-width: 680px)');
function setMobileMenu(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#sidebar').inert = mobileLayout.matches && !open;
  $('#mobile-menu').setAttribute('aria-expanded', String(open));
  $('#mobile-menu').setAttribute('aria-label', open ? t('Закрыть навигацию') : t('Открыть навигацию'));
}
mobileLayout.addEventListener('change', () => setMobileMenu(false));
function productIntro(product) { return `<div class="editor-product-intro">${imageMarkup(product)}<div><h3 lang="ka">${e(product.name || t('Новый товар'))}</h3><p>${e(product.id)} · SKU ${e(product.sku || '—')}</p></div></div>`; }
function field(label, fieldName, value, { wide = false, textarea = false, disabled = false, hint = '', type = 'text' } = {}) {
  const id = 'product-' + fieldName;
  return `<label class="field${wide ? ' wide' : ''}"><span class="field-label">${e(label)}</span>${textarea ? `<textarea id="${id}" data-product-field="${fieldName}" rows="5">${e(value)}</textarea>` : `<input id="${id}" data-product-field="${fieldName}" type="${type}" value="${e(value)}"${disabled ? ' disabled' : ''}${['price', 'oldPrice'].includes(fieldName) ? ' inputmode="decimal"' : ''}>`}${hint ? `<span class="field-hint">${e(hint)}</span>` : ''}</label>`;
}
function baseEditor(product) {
  const knownCategories = [...new Set([...state.taxonomy.map(category => category.id), ...product.categories])];
  const subcategories = state.taxonomy.filter(category => product.categories.includes(category.id)).flatMap(category => category.subs);
  for (const id of product.subcategories) if (!subcategories.some(item => item.id === id)) subcategories.push({ id, name: id });
  return ui`${productIntro(product)}<section class="form-section"><div class="form-section-heading"><h3>Общие данные</h3><span>Одинаковые для всех языков</span></div><div class="form-grid">${field(t('ID / адрес товара'), 'id', product.id, { disabled: state.originalIds.has(product.id), hint: state.originalIds.has(product.id) ? t('ID опубликованного или сохранённого товара защищён от изменения.') : t('Латиница, цифры и дефис. Определяет адрес страницы.') })}${field(t('Артикул (SKU)'), 'sku', product.sku || '')}${field(t('Бренд'), 'brand', product.brand || '')}<label class="field"><span class="field-label">Наличие</span><select data-product-field="stockStatus">${Object.entries(STOCK_LABELS).map(([value, label]) => `<option value="${value}"${stockOf(product) === value ? ' selected' : ''}>${t(label)}</option>`).join('')}</select><span class="field-hint">В исходном каталоге отсутствие поля означает «В наличии».</span></label>${field(t('Цена, ₾'), 'price', product.price)}${field(t('Старая цена, ₾'), 'oldPrice', product.oldPrice || '', { hint: t('Оставьте пустой, если скидки нет.') })}<label class="field"><span class="field-label">Категории</span><select data-product-field="categories" multiple size="4">${knownCategories.map(id => `<option value="${e(id)}"${product.categories.includes(id) ? ' selected' : ''}>${e(categoryLabel(id))}</option>`).join('')}</select></label><label class="field"><span class="field-label">Подкатегории</span><select data-product-field="subcategories" multiple size="4">${subcategories.map(item => `<option value="${e(item.id)}"${product.subcategories.includes(item.id) ? ' selected' : ''}>${e(item.name)}</option>`).join('')}</select></label></div></section><section class="form-section"><div class="form-section-heading"><h3>Грузинский оригинал</h3><span>ქართული · KA</span></div><div class="form-grid">${field(t('Название'), 'name', product.name, { wide: true })}${field(t('Описание'), 'description', product.description || '', { wide: true, textarea: true })}${field(t('Подробное описание (необязательно)'), 'longDescription', product.longDescription || '', { wide: true, textarea: true })}${field(t('Гарантия (необязательно)'), 'warranty', product.warranty || '', { wide: true })}</div></section><div class="editor-danger"><p>Удаление применяется только к черновику.<br>Из каталога товар исчезнет после публикации, страница — после сборки сайта.</p><button class="text-danger" id="delete-product">Удалить товар</button></div>`;
}
function mediaEditor(product) {
  return ui`<div class="form-section-heading"><h3>Фотографии товара</h3><span>Первая фотография — обложка</span></div><div class="media-grid">${product.images.map((url, index) => ui`<article class="media-card">${index === 0 ? t('<span class="cover-label">Обложка</span>') : ''}${/youtu\.?be/.test(url) ? `<div class="product-image-placeholder">${icon('eye')}</div>` : ui`<img src="${e(url)}" alt="Фотография ${index + 1}" loading="lazy">`}<div class="media-card-footer"><span>${index + 1} / ${product.images.length}</span><button class="icon-button" data-image-move="${index}" data-direction="-1" aria-label="Переместить фотографию ${index + 1} влево"${index === 0 ? ' disabled' : ''}>${icon('chevron-left')}</button><button class="icon-button" data-image-move="${index}" data-direction="1" aria-label="Переместить фотографию ${index + 1} вправо"${index === product.images.length - 1 ? ' disabled' : ''}>${icon('chevron-right')}</button><button class="icon-button" data-image-remove="${index}" aria-label="Убрать фотографию ${index + 1}">${icon('trash')}</button></div></article>`).join('')}</div><button class="upload-zone" id="upload-image">${icon('upload')}<span>Выбрать фотографии</span><small>JPG, PNG или WebP · подготовим WebP до 200 КБ автоматически</small></button><div class="media-url-row"><input class="plain-input" id="image-url" type="url" placeholder="Или вставьте HTTPS-ссылку на изображение / YouTube"><button class="button secondary" id="add-image-url">Добавить</button></div><p class="preview-note">Удаление из карточки убирает ссылку. Файл в хранилище автоматически не удаляется.</p>`;
}
function specsEditor(product) {
  return ui`<div class="form-section-heading"><h3>Характеристики · грузинский оригинал</h3><span>Числа и артикулы переводить не нужно</span></div><div id="spec-rows">${Object.entries(product.specs).map(([key, value], index) => ui`<div class="spec-row"><input class="plain-input" data-spec-index="${index}" data-spec-part="key" value="${e(key)}" aria-label="Название характеристики ${index + 1}"><input class="plain-input" data-spec-index="${index}" data-spec-part="value" value="${e(value)}" aria-label="Значение характеристики ${index + 1}"><button class="icon-button" data-remove-spec="${index}" aria-label="Удалить характеристику ${index + 1}">${icon('trash')}</button></div>`).join('')}</div><button class="button secondary" id="add-spec">${icon('plus')}Добавить характеристику</button><p class="preview-note">Переводы названий хранятся в общем словаре. Изменение оригинала не перезаписывает готовые переводы.</p>`;
}
function translationEditor(product, locale) {
  const translation = savedTranslation(state.document, product.id, locale) || { fields: {}, specs: {} };
  const progress = coverage(state.document, product, locale);
  const fields = TEXT_FIELDS.filter(key => product[key]?.trim() || key === 'name' || key === 'description');
  return ui`<div class="translation-intro"><div><h3>${locale === 'ru' ? t('Русский перевод') : t('Английский перевод')}</h3><p>${progress.approved} из ${progress.total} полей проверено · исходный язык — грузинский</p></div><button class="button secondary" id="approve-product-translation">${icon('check')}Подтвердить перевод</button></div>${fields.map(key => { const source = String(product[key] || ''); const entry = translation.fields[key]; const status = entryState(entry, source); return ui`<div class="translation-columns"><div><div class="translation-label-row"><span class="field-label">${t(FIELD_LABELS[key])} · KA</span><button class="text-button" data-copy-source="${key}" title="Копировать оригинал в перевод">${icon('copy')}</button></div><div class="translation-source" lang="ka">${e(source || t('Не заполнено'))}</div></div><label class="field"><span class="translation-label-row"><span class="field-label">${t(FIELD_LABELS[key])} · ${locale.toUpperCase()}</span><span class="translation-state ${status}">${t(STATE_NAMES[status])}</span></span>${key === 'name' || key === 'warranty' ? ui`<input data-translation-field="${key}" lang="${locale}" value="${e(entry?.text || '')}" placeholder="Введите перевод">` : ui`<textarea data-translation-field="${key}" lang="${locale}" rows="5" placeholder="Введите перевод">${e(entry?.text || '')}</textarea>`}${status === 'stale' ? ui`<details class="translation-warning"><summary>Оригинал изменился. Показать предыдущую версию</summary><p lang="ka">${e(entry.source)}</p></details>` : ''}</label></div>`; }).join('')}<section class="form-section"><div class="form-section-heading"><h3>Характеристики</h3><span>Название — общее, значение — для этого товара</span></div><div class="translation-table">${Object.entries(product.specs).map(([source, value]) => { const id = attributeId(state.document, source); const label = state.document.attributes[id]?.labels[locale]; const entry = translation.specs[id]; return ui`<label class="field"><span class="field-label" lang="ka">${e(source)} · название</span><input data-translation-label="${e(id)}" lang="${locale}" value="${e(label?.text || '')}" placeholder="Перевод названия"></label><label class="field"><span class="field-label" lang="ka">${e(value)} · значение</span><input data-translation-spec="${e(id)}" data-source="${e(value)}" lang="${locale}" value="${e(entry?.text || '')}" placeholder="${/[\u10a0-\u10ff\u1c90-\u1cbf]/u.test(value) ? t('Введите перевод') : t('Можно оставить исходное значение')}"></label>`; }).join('')}</div></section><div class="translation-bottom"><p>В превью и публикацию подставляются только проверенные переводы актуального оригинала. Для остальных полей используется грузинский текст.</p><button class="button primary" id="approve-product-translation-bottom">${icon('check')}Подтвердить перевод</button></div>`;
}
function previewEditor(product) {
  const localized = localizedProduct(state.document, product, state.previewLocale);
  return ui`<div class="preview-controls">${['ka', 'ru', 'en'].map(locale => `<button class="${state.previewLocale === locale ? 'active' : ''}" data-preview-locale="${locale}">${{ ka: 'ქართული', ru: 'Русский', en: 'English' }[locale]}</button>`).join('')}</div><article class="product-preview">${imageMarkup(localized)}<div><h3 lang="${state.previewLocale}">${e(localized.name)}</h3><div class="preview-price">${e(money(product.price))}</div><p lang="${state.previewLocale}">${e(localized.description || t('Описание пока не заполнено.'))}</p><dl>${Object.entries(localized.specs).map(([key, value]) => `<dt>${e(key)}</dt><dd>${e(value)}</dd>`).join('')}</dl></div></article><p class="preview-note">Это превью содержимого карточки. Цены, наличие и фотографии общие для всех языков. Непроверенные переводы показываются в редакторе, но не подставляются вместо оригинала.</p>`;
}
function renderEditor() {
  const product = state.product; if (!product) return;
  $('#editor-title').textContent = product.name || t('Новый товар');
  $$('.editor-tab').forEach(tab => { const active = tab.dataset.editorTab === state.editorTab; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; tab.id = 'editor-tab-' + tab.dataset.editorTab; tab.setAttribute('aria-controls', 'editor-body'); });
  $('#editor-body').setAttribute('aria-labelledby', 'editor-tab-' + state.editorTab);
  for (const locale of LOCALES) $(`#${locale}-tab-status`).className = 'tab-status ' + coverage(state.document, product, locale).state;
  $('#editor-body').innerHTML = state.editorTab === 'base' ? baseEditor(product) : state.editorTab === 'media' ? mediaEditor(product) : state.editorTab === 'specs' ? specsEditor(product) : LOCALES.includes(state.editorTab) ? translationEditor(product, state.editorTab) : previewEditor(product);
}
function openProduct(id, tab = 'base') {
  state.product = state.document.catalog.products.find(product => product.id === id); if (!state.product) return;
  state.editorTab = tab; state.previewLocale = 'ka'; renderEditor(); $('#product-dialog').showModal();
}
function newProduct(copy) {
  const product = copy ? clone(copy) : { id: '', sku: '', name: '', brand: '', price: '', oldPrice: '', images: [], categories: [], subcategories: [], description: '', specs: {} };
  const previous = product.id;
  product.id = (copy ? copy.id.slice(0, 110) + '-copy-' : 'new-product-') + crypto.randomUUID().slice(0, 7);
  state.document.catalog.products.unshift(product);
  if (copy) for (const locale of LOCALES) { const translation = savedTranslation(state.document, previous, locale); if (translation) state.document.translations[locale].products[product.id] = clone(translation); }
  markDirty(); renderCatalog(); state.product = product; state.editorTab = 'base'; renderEditor(); if (!$('#product-dialog').open) $('#product-dialog').showModal();
}
async function saveDraft() {
  if (!state.dirty) return state.server;
  const errors = validateDocument(state.document);
  if (errors.length) { await confirmMessage(t('Проверьте данные'), errors.map(t).join('\n'), t('Понятно')); throw new Error(t('Черновик не сохранён: исправьте отмеченные поля.')); }
  return busy(t('Сохраняем черновик…'), async () => {
    const result = await api('/api/draft', { method: 'PUT', body: JSON.stringify({ expectedRevision: state.server.revision, document: state.document }) });
    acceptServer(result); render(); toast(ui`Черновик v${result.revision} сохранён. Публикация — отдельным шагом.`); return result;
  });
}
async function reviewPublication() {
  try {
    if (state.dirty) await saveDraft();
    const review = await api('/api/review');
    const isLocal = state.session.environment === 'local'; const isStaging = state.session.environment !== 'production';
    $('#review-title').textContent = state.server.pending ? t('Повторить публикацию') : t('Проверка изменений');
    $('#review-body').innerHTML = ui`<div class="review-banner">${isLocal ? t('Вы публикуете в локальную тестовую копию. Рабочий магазин не изменится.') : isStaging ? t('Вы публикуете в отдельный тестовый каталог Cloudflare.') : t('Изменения будут опубликованы в рабочий каталог магазина.')}</div><div class="review-stat"><span>Версия черновика</span><strong>v${review.revision}</strong></div><div class="review-stat"><span>Товаров в каталоге</span><strong>${review.productCount}</strong></div><div class="review-stat"><span>Новые товары</span><strong>${review.added.length}</strong></div><div class="review-stat"><span>Изменённые товары</span><strong>${review.changed.length}</strong></div><div class="review-stat"><span>Удаляемые товары</span><strong>${review.removed.length}</strong></div><div class="review-stat"><span>Переводы и словарь</span><strong>${review.translationsChanged ? t('Есть изменения') : t('Без изменений')}</strong></div>${review.removed.length ? ui`<div class="review-items">Будут удалены: ${review.removed.map(e).join(', ')}</div>` : ''}${review.errors.length ? `<div class="review-errors">${review.errors.map(error=>e(t(error))).join('<br>')}</div>` : ''}<p class="review-note">Сохранённые версии доступны в истории. Непроверенные или устаревшие переводы не заменяют грузинский оригинал.</p><div class="review-stat"><span>Настройки магазина</span><strong>${(review.storeChanges || []).map(key=>({categories:t("Категории"),campaigns:t("Акции"),heroes:t("Баннеры"),strings:t("Тексты сайта"),company:t("Контакты")})[key]).join(", ") || t("Без изменений")}</strong></div><p class="review-note">Цены, сроки акций, категории, баннеры и тексты обновляются из публичного API. Для поисковых систем и работы без JavaScript пересоберите сайт. Новые страницы товаров тоже требуют сборки.</p><label class="confirm-checkbox"><input id="publication-confirm" type="checkbox"><span>Я проверил изменения и хочу опубликовать эту версию${isStaging ? t(' в тестовый каталог') : ''}.</span></label>`;
    $('#confirm-publish').disabled = true; $('#confirm-publish').textContent = state.server.pending ? t('Повторить публикацию') : isLocal ? t('Опубликовать в тестовую копию') : t('Опубликовать');
    $('#publication-confirm').addEventListener('change', event => { $('#confirm-publish').disabled = !event.target.checked || review.errors.length > 0; });
    $('#review-dialog').showModal();
  } catch (error) { toast(error.message, true); }
}
async function publish() {
  try {
    await busy(t('Публикуем сохранённую версию…'), async () => {
      const result = await api('/api/publish', { method: 'POST', body: JSON.stringify({ expectedRevision: state.server.revision }) });
      acceptServer(result); $('#review-dialog').close(); render(); toast(state.session.environment === 'production' ? t('Каталог опубликован. Запустите сборку сайта для новых страниц и описаний.') : t('Версия опубликована в тестовую копию. Рабочий магазин не изменился.'));
    });
  } catch (error) {
    if (error.details?.code === 'PUBLISH_PENDING') { state.server = await api('/api/catalog').catch(() => state.server); updateSavebar(); $('#review-dialog').close(); }
  }
}

document.addEventListener('input', event => {
  const target = event.target; if (state.busy || !state.document) return;
  if (target.id === 'catalog-search') { state.query = target.value.trim(); state.page = 1; renderCatalog(); return; }
  if (target.id === 'attribute-search') { renderAttributes(); return; }
  if (target.dataset.attribute) { const attribute = state.document.attributes[target.dataset.attribute]; updateEntry(attribute.labels, target.dataset.locale, target.value, attribute.source); const badge = target.closest('.field').querySelector('.translation-state'); const status = entryState(attribute.labels[target.dataset.locale], attribute.source); badge.textContent = t(STATE_NAMES[status]); badge.className = 'translation-state ' + status; markDirty(); return; }
  const product = state.product;
  if (!product || !$('#product-dialog').open) return;
  if (target.dataset.productField && target.tagName !== 'SELECT') {
    const fieldName = target.dataset.productField;
    if (fieldName === 'id' && state.originalIds.has(product.id)) return;
    const old = product.id; product[fieldName] = target.value;
    if (fieldName === 'id') for (const locale of LOCALES) { const entry = savedTranslation(state.document, old, locale); if (entry) { delete state.document.translations[locale].products[old]; state.document.translations[locale].products[product.id] = entry; } }
    markDirty(); return;
  }
  if (target.dataset.translationField) { const entries = translationFor(state.document, product.id, state.editorTab).fields; const source = String(product[target.dataset.translationField] || ''); updateEntry(entries, target.dataset.translationField, target.value, source); const badge = target.closest('.field').querySelector('.translation-state'); const status = entryState(entries[target.dataset.translationField], source); badge.textContent = t(STATE_NAMES[status]); badge.className = 'translation-state ' + status; markDirty(); return; }
  if (target.dataset.translationLabel) { const attribute = state.document.attributes[target.dataset.translationLabel]; updateEntry(attribute.labels, state.editorTab, target.value, attribute.source); markDirty(); return; }
  if (target.dataset.translationSpec) { updateEntry(translationFor(state.document, product.id, state.editorTab).specs, target.dataset.translationSpec, target.value, target.dataset.source); markDirty(); }
});
document.addEventListener('change', event => {
  const target = event.target; if (state.busy || !state.document) return;
  if (target.id === 'category-filter') { state.category = target.value; state.page = 1; renderCatalog(); }
  if (target.id === 'sort-filter') { state.sort = target.value; state.page = 1; renderCatalog(); }
  if (state.product && target.dataset.productField && target.tagName === 'SELECT') {
    state.product[target.dataset.productField] = target.multiple ? [...target.selectedOptions].map(option => option.value) : target.value;
    if (target.dataset.productField === 'categories') state.product.subcategories = state.product.subcategories.filter(id => state.taxonomy.some(c => state.product.categories.includes(c.id) && c.subs.some(s=>s.id===id)));
    markDirty(); if (target.dataset.productField === 'categories') renderEditor();
  }
  if (state.product && target.dataset.specIndex != null) {
    const pairs = Object.entries(state.product.specs); const index = Number(target.dataset.specIndex); const part = target.dataset.specPart;
    if (part === 'key' && pairs.some(([key], position) => key === target.value && position !== index)) { toast(t('Характеристика с таким названием уже существует.'), true); renderEditor(); return; }
    pairs[index][part === 'key' ? 0 : 1] = target.value; state.product.specs = Object.fromEntries(pairs); registerAttributes(state.document); markDirty();
  }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || state.busy || !state.document) return;
  if (button.dataset.openProduct) { openProduct(button.dataset.openProduct, state.view === 'translations' ? 'ru' : 'base'); return; }
  if (button.dataset.tab) { state.filter = button.dataset.tab; state.page = 1; renderCatalog(); return; }
  if (button.dataset.editorTab) { state.editorTab = button.dataset.editorTab; renderEditor(); return; }
  if (button.dataset.previewLocale) { state.previewLocale = button.dataset.previewLocale; renderEditor(); return; }
  if (button.hasAttribute('data-close-dialog')) { button.closest('dialog').close(); return; }
  if (button.dataset.restore) {
    if (!await confirmMessage(t('Восстановить версию?'), ui`Версия ${button.dataset.restore} станет новым черновиком. ${state.dirty ? t('Несохранённые изменения будут заменены. ') : ''}Для появления на сайте потребуется отдельная публикация.`, t('Восстановить в черновик'))) return;
    try { await busy(t('Восстанавливаем черновик…'), async () => { acceptServer(await api('/api/restore', { method: 'POST', body: JSON.stringify({ expectedRevision: state.server.revision, revision: Number(button.dataset.restore) }) })); render(); toast(t('Версия восстановлена в новый черновик.')); }); } catch {}
    return;
  }
  if (button.dataset.approveAttribute) {
    const attribute = state.document.attributes[button.dataset.approveAttribute]; const entry = attribute.labels[button.dataset.locale];
    if (!entry?.text.trim()) { toast(t('Сначала заполните перевод.'), true); return; }
    attribute.labels[button.dataset.locale] = { ...entry, source: attribute.source, approved: true }; markDirty(); renderAttributes(); return;
  }
  const product = state.product;
  if (!product || !$('#product-dialog').open) return;
  if (button.id === 'delete-product') {
    if (state.document.store.campaigns.some(c=>c.productIds.includes(product.id) || c.excludeIds.includes(product.id))) { toast(t('Товар используется в составе акции. Сначала уберите его оттуда.'),true); return; }
    if (!await confirmMessage(t('Убрать товар из черновика?'), ui`${product.name || product.id}\n\nИз каталога товар исчезнет после публикации, а его статическая страница — после ручной сборки сайта. Фотографии в хранилище сохранятся.`, t('Убрать из черновика'))) return;
    state.document.catalog.products = state.document.catalog.products.filter(item => item !== product);
    for (const locale of LOCALES) delete state.document.translations[locale].products[product.id];
    markDirty(); $('#product-dialog').close(); render(); return;
  }
  if (button.dataset.imageRemove != null) { product.images.splice(Number(button.dataset.imageRemove), 1); markDirty(); renderEditor(); }
  if (button.dataset.imageMove != null) { const index = Number(button.dataset.imageMove); const next = index + Number(button.dataset.direction); [product.images[index], product.images[next]] = [product.images[next], product.images[index]]; markDirty(); renderEditor(); }
  if (button.id === 'add-image-url') { const url = $('#image-url').value.trim(); if (!safeMedia(url)) { toast(t('Введите корректную HTTPS-ссылку.'), true); return; } if (!product.images.includes(url)) product.images.push(url); markDirty(); renderEditor(); }
  if (button.id === 'upload-image') $('#image-file').click();
  if (button.id === 'add-spec') { let key = 'ახალი მახასიათებელი'; let index = 2; while (Object.hasOwn(product.specs, key)) key = 'ახალი მახასიათებელი ' + index++; product.specs[key] = ''; registerAttributes(state.document); markDirty(); renderEditor(); }
  if (button.dataset.removeSpec != null) { const pairs = Object.entries(product.specs); pairs.splice(Number(button.dataset.removeSpec), 1); product.specs = Object.fromEntries(pairs); markDirty(); renderEditor(); }
  if (button.dataset.copySource) { const key = button.dataset.copySource; updateEntry(translationFor(state.document, product.id, state.editorTab).fields, key, String(product[key] || ''), String(product[key] || '')); markDirty(); renderEditor(); }
  if (['approve-product-translation', 'approve-product-translation-bottom'].includes(button.id)) { approveProduct(state.document, product, state.editorTab); markDirty(); renderEditor(); toast(t('Заполненные поля отмечены как проверенные. Сохраните черновик.')); }
});

async function uploadImage(file) {
  return busy(t('Подготавливаем и загружаем изображение…'), async () => {
    const blob=await convertImage(file);const form=new FormData();form.append('file',blob,'studio.webp');
    const response=await fetch('/api/upload',{method:'POST',body:form,credentials:'same-origin'});
    const result=await response.json();if(!response.ok)throw new Error(result.error || t('Ошибка загрузки.'));return result.url;
  });
}
async function convertImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20000000) throw new Error(t('Выберите JPG, PNG или WebP размером до 20 МБ.'));
  if (file.type === 'image/webp' && file.size <= 200 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 50000000) throw new Error(t('Изображение слишком большое по разрешению.'));
    const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
    let max = 1600;
    for (let pass = 0; pass < 3; pass++) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [.86, .74, .62, .48]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob?.type === 'image/webp' && blob.size <= 200 * 1024) return blob;
      }
      max = Math.round(max * .7);
    }
    throw new Error(t('Не удалось уменьшить фотографию до 200 КБ. Попробуйте другое изображение.'));
  } finally { bitmap.close(); }
}
$('#image-file').addEventListener('change', async event => {
  const files = [...event.target.files]; event.target.value = ''; const product = state.product; if (!files.length || !product) return;
  try { await busy(t('Подготавливаем и загружаем фотографии…'), async () => {
    for (const file of files) {
      if (product.images.length >= 30) throw new Error(t('Максимум 30 изображений на товар.'));
      const blob = await convertImage(file); const form = new FormData(); form.append('file', blob, 'product.webp');
      const response = await fetch('/api/upload', { method: 'POST', body: form, credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || t('Ошибка загрузки.'));
      product.images.push(result.url); markDirty();
    }
    renderEditor(); toast(t('Фотографии добавлены в черновик.'));
  }); } catch (error) { renderEditor(); toast(error.message, true); }
});
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 4000000) throw new Error(t('Максимум 4 МБ на импорт.'));
    const value = JSON.parse((await file.text()).replace(/^\uFEFF/, '')); const document = importDocument(value, state.document);
    const explanation = value.format === 'enka-translation-package' ? t('Будут добавлены черновые переводы только для совпадающих исходных текстов. Товары, цены, фотографии и уже подтверждённые переводы сохранятся. Проверьте переводы перед публикацией.') : ui`В файле ${document.catalog.products.length} товаров. Текущий рабочий черновик будет заменён. Переводы из отдельной резервной копии тоже будут загружены. На сайт изменения не попадут до публикации.`;
    if (!await confirmMessage(t('Импортировать в черновик?'), explanation, t('Импортировать'))) return;
    state.document = document; state.product = null; state.page = 1; markDirty(); render(); toast(t('Файл загружен в рабочий черновик. Сохраните его.'));
  } catch (error) { toast(t('Не удалось импортировать файл: ') + error.message, true); }
});
$('#save-draft').onclick = () => saveDraft().catch(error => toast(error.message, true));
$('#review-publish').onclick = reviewPublication; $('#confirm-publish').onclick = publish;
$('#export-button').onclick = () => download({ format: 'enka-admin-backup', exportedAt: new Date().toISOString(), revision: state.server.revision, document: state.document }, `enka-catalog-${new Date().toISOString().slice(0, 10)}.json`);
$('#import-button').onclick = () => $('#import-file').click();
$('#add-product').onclick = () => newProduct();
$('#duplicate-product').onclick = () => newProduct(state.product);
$('#close-editor').onclick = $('#editor-done').onclick = () => $('#product-dialog').close();
$('#product-dialog').addEventListener('close', () => { state.product = null; render(); });
$('#previous-page').onclick = () => { state.page--; renderCatalog(); }; $('#next-page').onclick = () => { state.page++; renderCatalog(); };
$('#reset-filters').onclick = () => { state.query = ''; state.category = ''; state.filter = 'all'; state.page = 1; $('#catalog-search').value = ''; renderCatalog(); };
$('#history-refresh').onclick = renderHistory;
$('#mobile-menu').onclick = () => setMobileMenu(!$('#sidebar').classList.contains('open'));
document.addEventListener('click', event => {
  if (mobileLayout.matches && $('#sidebar').classList.contains('open') && !event.target.closest('#sidebar, #mobile-menu')) setMobileMenu(false);
});
window.addEventListener('hashchange', switchView);
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#catalog-search').focus(); }
  if (event.key === 'Escape') setMobileMenu(false);
  if (event.target.matches('[data-editor-tab]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const tabs = $$('[data-editor-tab]'); const index = tabs.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    state.editorTab = tabs[next].dataset.editorTab; renderEditor(); tabs[next].focus();
  }
});
document.addEventListener('error', event => { if (event.target.tagName === 'IMG') { event.target.alt = t('Изображение недоступно'); event.target.classList.add('image-unavailable'); } }, true);
window.addEventListener('studio:language-change',()=>{render();if(state.product)renderEditor();if($('#review-dialog').open)reviewPublication();});
hydrateIcons();
try {
  const [session, catalog, taxonomy, icons] = await Promise.all([api('/api/session'), api('/api/catalog'), fetch('/taxonomy.json').then(response => response.json()), fetch('/store-icons.json').then(response=>response.json())]);
  state.session = session; state.taxonomy = taxonomy; state.storeIcons=icons; acceptServer(catalog);
  $('#profile-name').textContent = session.identity;
  $('#environment').innerHTML = `<i></i>${session.environment === 'local' ? t('Локальная копия') : session.environment === 'production' ? t('Рабочий каталог') : t('Тестовый каталог')}`;
  $('#environment').classList.toggle('production', session.environment === 'production');
  $('#local-note').textContent = session.environment === 'production' ? t('После публикации запустите ручную сборку магазина для обновления страниц.') : t('Рабочий магазин не меняется. Это отдельная копия каталога.');
  $('#store-link').href = session.storefrontBase || 'https://enkaelectronics.com.ge';
  switchView();
} catch (error) { showAlert(error.message); $('#sync-status').textContent = t('Нет подключения'); $('#draft-status').textContent = t('Каталог не загружен'); $('#review-publish').disabled = true; }
