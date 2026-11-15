import './store-engine.js';
export const storeEngine = globalThis.EnkaStoreEngine;
export const LOCALES = ['ru', 'en'];
export const TEXT_FIELDS = ['name', 'description', 'longDescription', 'warranty'];
export const FIELD_LABELS = { name: 'Название', description: 'Описание', longDescription: 'Подробное описание', warranty: 'Гарантия' };
export const STOCK_LABELS = { in_stock: 'В наличии', out_of_stock: 'Нет в наличии', soon: 'Скоро', unavailable: 'Уточняется' };
export const clone = value => structuredClone(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
export const sourceText = (product, field) => String(product?.[field] ?? '');
export const stockOf = product => product.stockStatus || 'in_stock';
export const priceOf = value => {
  const text = String(value ?? '').trim().replace(',', '.');
  return /^\d+(?:\.\d{1,2})?$/.test(text) ? Number(text) : NaN;
};
export function safeMedia(value) {
  if (typeof value !== 'string') return false;
  if (/^\/media\/[a-f0-9-]+\.webp$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function validateDocument(document) {
  const errors = [];
  if (!plain(document) || !plain(document.catalog) || !Array.isArray(document.catalog.products)) return ['Ожидается каталог с массивом products.'];
  const products = document.catalog.products;
  if (!products.length) errors.push('Пустой каталог нельзя сохранить или опубликовать.');
  if (products.length > 2000) errors.push('Максимум 2000 товаров в этой версии панели.');
  const ids = new Set();
  for (const [index, product] of products.entries()) {
    const label = `Товар ${product?.id || index + 1}`;
    if (!plain(product)) { errors.push(`${label}: неверная структура.`); continue; }
    if (typeof product.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,149}$/.test(product.id)) errors.push(`${label}: ID должен содержать латиницу, цифры, дефис или подчёркивание.`);
    if (ids.has(product.id)) errors.push(`${label}: повторяющийся ID.`);
    ids.add(product.id);
    if (typeof product.name !== 'string' || !product.name.trim() || product.name.length > 500) errors.push(`${label}: заполните название (до 500 символов).`);
    if (!Number.isFinite(priceOf(product.price)) || priceOf(product.price) < 0) errors.push(`${label}: некорректная цена.`);
    if (product.oldPrice !== '' && product.oldPrice != null && (!Number.isFinite(priceOf(product.oldPrice)) || priceOf(product.oldPrice) <= priceOf(product.price))) errors.push(`${label}: старая цена должна быть больше текущей.`);
    if (product.stockStatus && !Object.hasOwn(STOCK_LABELS, product.stockStatus)) errors.push(`${label}: неизвестный статус наличия.`);
    if (!Array.isArray(product.images) || product.images.length > 30 || product.images.some(image => !safeMedia(image))) errors.push(`${label}: изображения должны быть HTTPS-ссылками; максимум 30.`);
    for (const field of TEXT_FIELDS.slice(1)) if (product[field] != null && (typeof product[field] !== 'string' || product[field].length > 30000)) errors.push(`${label}: поле «${FIELD_LABELS[field]}» слишком длинное или имеет неверный тип.`);
    for (const field of ['sku', 'brand']) if (product[field] != null && (typeof product[field] !== 'string' || product[field].length > 300)) errors.push(`${label}: неверное поле ${field}.`);
    for (const field of ['categories', 'subcategories']) if (!Array.isArray(product[field]) || product[field].some(value => typeof value !== 'string' || value.length > 150)) errors.push(`${label}: неверное поле ${field}.`);
    if (!plain(product.specs) || Object.keys(product.specs).length > 120 || Object.entries(product.specs).some(([key, value]) => !key.trim() || key.length > 300 || typeof value !== 'string' || value.length > 3000)) errors.push(`${label}: проверьте названия и значения характеристик.`);
  }
  if (!plain(document.translations) || !plain(document.attributes)) errors.push('Не найдена структура переводов и словаря характеристик.');
  for (const locale of LOCALES) {
    const translations = document.translations?.[locale];
    if (!plain(translations) || !plain(translations.products)) { errors.push(`Неверная структура переводов ${locale}.`); continue; }
    for (const [id, translation] of Object.entries(translations.products)) {
      if (!ids.has(id)) continue;
      if (!plain(translation) || !plain(translation.fields) || !plain(translation.specs)) { errors.push(`Неверный перевод ${locale}: ${id}.`); continue; }
      for (const entry of [...Object.values(translation.fields), ...Object.values(translation.specs)]) {
        if (!validEntry(entry)) errors.push(`Проверьте перевод ${locale}: ${id}.`);
      }
    }
  }
  const attributeSources = new Set();
  for (const attribute of Object.values(document.attributes || {})) {
    if (!plain(attribute) || typeof attribute.source !== 'string' || !attribute.source.trim() || attribute.source.length > 300 || !plain(attribute.labels)) { errors.push('Неверная запись словаря характеристик.'); continue; }
    for (const entry of Object.values(attribute.labels)) if (!validEntry(entry)) errors.push(`Проверьте перевод характеристики «${attribute.source}».`);
    if (attributeSources.has(attribute.source)) errors.push(`Повторяющееся название в словаре характеристик: «${attribute.source}».`);
    attributeSources.add(attribute.source);
  }
  for (const id of Object.keys(document.attributes || {})) if (!/^attribute-[a-z0-9-]+$/.test(id)) errors.push('Неверный идентификатор характеристики.');
  const attributes = Object.values(document.attributes || {}).filter(attribute => plain(attribute) && typeof attribute.source === 'string' && plain(attribute.labels));
  for (const product of products) {
    if (!plain(product?.specs)) continue;
    for (const locale of LOCALES) {
      const labels = new Set();
      for (const source of Object.keys(product.specs)) {
        const entry = attributes.find(attribute => attribute.source === source)?.labels[locale];
        const label = validEntry(entry) && entry.approved && entry.source === source && entry.text.trim() ? entry.text : source;
        if (labels.has(label)) errors.push(`Товар ${product.id}: два названия характеристик совпадают в переводе ${locale.toUpperCase()}: «${label}».`);
        labels.add(label);
      }
    }
  }
  if (document.store !== undefined && !errors.length) errors.push(...storeEngine.validate(document.store, products));
  if (new TextEncoder().encode(JSON.stringify(document)).length > 3500000) errors.push('Каталог с переводами превышает 3,5 МБ. Разделите импорт.');
  return [...new Set(errors)].slice(0, 100);
}
function validEntry(entry) {
  return plain(entry) && typeof entry.text === 'string' && entry.text.length <= 30000 && typeof entry.source === 'string' && entry.source.length <= 30000 && typeof entry.approved === 'boolean';
}
export function registerAttributes(document) {
  const bySource = new Map(Object.entries(document.attributes).map(([id, attribute]) => [attribute.source, id]));
  let index = Object.keys(document.attributes).length + 1;
  for (const product of document.catalog.products) for (const source of Object.keys(product.specs || {})) {
    if (bySource.has(source)) continue;
    let id;
    do { id = 'attribute-' + index++; } while (Object.hasOwn(document.attributes, id));
    document.attributes[id] = { source, labels: {} };
    bySource.set(source, id);
  }
  return document;
}
export function createDocument(catalog) {
  const source = Array.isArray(catalog) ? { products: catalog } : clone(catalog);
  // This pointer belongs to publication, never to editable source content.
  if (plain(source)) delete source._enkaPublication;
  const store = source?._enkaStore;
  if (plain(source)) delete source._enkaStore;
  // An API export may contain calculated prices; restore the editable base values.
  for (const product of source?.products || []) if (product._enkaBase) {
    Object.assign(product, product._enkaBase); delete product._enkaBase; delete product._enkaCampaign;
  }
  const document = { schemaVersion: 1, catalog: source, translations: { ru: { products: {} }, en: { products: {} } }, attributes: {} };
  if (store) { document.store = store; storeEngine.migrateBanners(store); }
  if (!plain(source) || !Array.isArray(source.products)) throw new Error('В файле нет массива products.');
  registerAttributes(document);
  const errors = validateDocument(document);
  if (errors.length) throw new Error(errors.join('\n'));
  return document;
}
export function importDocument(value, existing) {
  if (value?.format === 'enka-translation-package') return importTranslations(value, existing);
  const document = value?.document?.schemaVersion === 1 ? clone(value.document) : value?.schemaVersion === 1 ? clone(value) : createDocument(value);
  if (!value?.schemaVersion && !value?.document?.schemaVersion && existing) {
    document.attributes = clone(existing.attributes);
    for (const locale of LOCALES) document.translations[locale] = clone(existing.translations[locale]);
    if (existing.store) document.store = clone(existing.store);
    registerAttributes(document);
  }
  storeEngine.migrateBanners(document.store);
  const errors = validateDocument(document);
  if (errors.length) throw new Error(errors.join('\n'));
  return document;
}
export function importTranslations(value, existing) {
  if (!existing || !plain(value.translations) || !plain(value.attributes)) throw new Error('Пакет переводов требует открытого каталога.');
  const document = registerAttributes(clone(existing));
  const sources = new Map(Object.entries(value.attributes).map(([id, item]) => [item.source, id]));
  const copy = (target, key, incoming, source) => {
    if (!validEntry(incoming) || incoming.source !== source || entryState(target[key], source) === 'approved') return;
    target[key] = { text: incoming.text, source, approved: false };
  };
  for (const locale of LOCALES) for (const product of document.catalog.products) {
    const records = value.translations[locale]?.products;
    if (!plain(records) || !Object.hasOwn(records, product.id)) continue;
    const incoming = records[product.id];
    const target = translationFor(document, product.id, locale);
    for (const field of TEXT_FIELDS) copy(target.fields, field, incoming.fields?.[field], sourceText(product, field));
    for (const [label, content] of Object.entries(product.specs || {})) {
      const oldId = sources.get(label); const id = attributeId(document, label);
      copy(target.specs, id, incoming.specs?.[oldId], content);
      copy(document.attributes[id].labels, locale, value.attributes[oldId]?.labels?.[locale], label);
    }
  }
  storeEngine.migrateBanners(document.store);
  const errors = validateDocument(document);
  if (errors.length) throw new Error(errors.join('\n'));
  return document;
}
export function translationFor(document, productId, locale) {
  const products = document.translations[locale].products;
  if (!Object.hasOwn(products, productId)) products[productId] = { fields: {}, specs: {} };
  return products[productId];
}
export function savedTranslation(document, productId, locale) {
  const products = document.translations[locale]?.products;
  return products && Object.hasOwn(products, productId) ? products[productId] : undefined;
}
export function entryState(entry, source) {
  if (!entry?.text?.trim()) return 'missing';
  if (entry.source !== source) return 'stale';
  return entry.approved ? 'approved' : 'review';
}
export function updateEntry(entries, key, text, source) {
  const previous = entries[key];
  // Editing a translation never silently reapproves a changed source.
  entries[key] = { text, source: previous?.source ?? source, approved: false };
}
export function attributeId(document, source) { return Object.keys(document.attributes).find(id => document.attributes[id].source === source); }
export function requiredEntries(document, product, locale) {
  const translation = savedTranslation(document, product.id, locale) || { fields: {}, specs: {} };
  const result = [];
  for (const field of TEXT_FIELDS) if (sourceText(product, field).trim()) result.push({ kind: 'field', key: field, source: sourceText(product, field), entry: translation.fields[field] });
  for (const [source, value] of Object.entries(product.specs || {})) {
    const id = attributeId(document, source);
    if (!id) continue;
    result.push({ kind: 'label', key: id, source, entry: document.attributes[id].labels[locale] });
    if (/[\u10a0-\u10ff\u1c90-\u1cbf]/u.test(value)) result.push({ kind: 'spec', key: id, source: value, entry: translation.specs[id] });
  }
  return result;
}
export function coverage(document, product, locale) {
  const entries = requiredEntries(document, product, locale);
  const counts = { total: entries.length, approved: 0, missing: 0, stale: 0, review: 0 };
  for (const item of entries) counts[entryState(item.entry, item.source)]++;
  counts.state = counts.stale ? 'stale' : counts.missing ? 'missing' : counts.review ? 'review' : 'approved';
  counts.percent = counts.total ? Math.round(counts.approved / counts.total * 100) : 100;
  return counts;
}
export function approveProduct(document, product, locale) {
  const translation = translationFor(document, product.id, locale);
  for (const item of requiredEntries(document, product, locale)) {
    if (!item.entry?.text.trim()) continue;
    const entry = { ...item.entry, source: item.source, approved: true };
    if (item.kind === 'field') translation.fields[item.key] = entry;
    else if (item.kind === 'spec') translation.specs[item.key] = entry;
    else document.attributes[item.key].labels[locale] = entry;
  }
}
export function localizedProduct(document, product, locale) {
  if (!LOCALES.includes(locale)) return clone(product);
  const result = clone(product);
  const translation = savedTranslation(document, product.id, locale);
  for (const field of TEXT_FIELDS) {
    const entry = translation?.fields[field];
    if (entryState(entry, sourceText(product, field)) === 'approved') result[field] = entry.text;
  }
  result.specs = Object.create(null);
  for (const [source, value] of Object.entries(product.specs || {})) {
    const id = attributeId(document, source);
    const label = document.attributes[id]?.labels[locale];
    const entry = translation?.specs[id];
    const translatedLabel = entryState(label, source) === 'approved' ? label.text : source;
    result.specs[translatedLabel] = entryState(entry, value) === 'approved' ? entry.text : value;
  }
  return result;
}
export function catalogDiff(before, after) {
  const previous = new Map((before?.catalog.products || []).map(product => [product.id, product]));
  const next = new Map(after.catalog.products.map(product => [product.id, product]));
  const added = [...next.keys()].filter(id => !previous.has(id));
  const removed = [...previous.keys()].filter(id => !next.has(id));
  const changed = [...next.keys()].filter(id => previous.has(id) && JSON.stringify(previous.get(id)) !== JSON.stringify(next.get(id)));
  const translationsChanged = JSON.stringify(before?.translations || {}) !== JSON.stringify(after.translations) || JSON.stringify(before?.attributes || {}) !== JSON.stringify(after.attributes);
  const storeChanges = ['categories', 'campaigns', 'heroes', 'strings', 'company'].filter(key => JSON.stringify(before?.store?.[key]) !== JSON.stringify(after.store?.[key]));
  return { added, removed, changed, translationsChanged, storeChanges };
}
