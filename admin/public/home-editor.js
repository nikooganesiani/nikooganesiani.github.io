import { t, getLocale } from './studio-i18n.js';
import { clone, localizedProduct, storeEngine as engine } from './model.js';

const labels = {
  banner: 'Баннер', categories: 'Плитки категорий', campaign: 'Акционные товары',
  blog: 'Блог', products: 'Подборка товаров', category: 'Товары категории',
  recommendations: 'Персональные рекомендации'
};
const descriptions = {
  banner: 'Один баннер или карусель из всех включённых баннеров.',
  categories: 'Быстрый переход в видимые категории магазина.',
  campaign: 'Одна акция или все активные акции с включённым товарным рядом.',
  blog: 'Статьи, отмеченные для главной, и подборка из архива.',
  products: 'Выбранные вручную товары в заданном порядке.',
  category: 'Горизонтальный ряд доступных товаров из выбранной категории.',
  recommendations: 'Автоматическая лента, которая подстраивается под посетителя.'
};
const icons = { banner: 'image', categories: 'grid', campaign: 'tag', blog: 'edit', products: 'box', category: 'folder', recommendations: 'sparkles' };
const locales = ['ka', 'ru', 'en'];

export function createHomeEditor({ root, state, escape: e, icon, markDirty, confirmMessage, toast }) {
  const visuals = globalThis.EnkaStoreVisuals;
  const store = () => state.document.store;
  const products = () => state.document.catalog.products;
  const blocks = () => engine.homeLayout(store());
  const editable = () => store().home ??= engine.defaultHome();
  const tr = value => e(t(value));
  const name = item => engine.text(item?.title, getLocale());
  const titleOf = product => localizedProduct(state.document, product, getLocale()).name || product.id;
  const itemId = () => 'block-' + crypto.randomUUID();
  let selected = '';
  let panel = 'edit';
  let locale = 'ka';
  let device = 'desktop';
  let search = '';
  let drag;

  function action(key, label, symbol, attrs = '') {
    return `<button type="button" class="button secondary" data-home-action="${key}" ${attrs}>${symbol ? icon(symbol) : ''}${tr(label)}</button>`;
  }
  function iconAction(key, label, symbol, attrs = '') {
    return `<button type="button" class="icon-button home-icon-button" data-home-action="${key}" aria-label="${tr(label)}" title="${tr(label)}" ${attrs}>${icon(symbol)}</button>`;
  }
  function select(label, field, value, options) {
    return `<label class="field"><span class="field-label">${tr(label)}</span><select data-home-field="${field}">${options.map(([key, label]) => `<option value="${e(key)}"${value === key ? ' selected' : ''}>${e(label)}</option>`).join('')}</select></label>`;
  }
  function sourceLabel(block) {
    if (block.type === 'banner') return name(store().heroes.find(item => item.id === block.sourceId)) || t('Все включённые баннеры');
    if (block.type === 'campaign') return name(store().campaigns.find(item => item.id === block.sourceId)) || t('Все активные акции');
    if (block.type === 'category') return name(store().categories.find(item => item.id === block.sourceId)) || t('Выберите категорию');
    if (block.type === 'products') return name(block);
    return '';
  }
  function listItem(block, index, total) {
    const source = sourceLabel(block);
    const label = t(labels[block.type]);
    return `<li class="home-block${block.id === selected ? ' is-selected' : ''}" data-home-id="${e(block.id)}">
      <span class="home-drag" aria-hidden="true" title="${tr('Перетащить блок')}">${icon('grip')}</span>
      <button type="button" class="home-block-select" data-home-action="select" aria-pressed="${block.id === selected}">
        <span class="home-block-icon">${icon(icons[block.type])}</span><span class="home-block-label"><strong>${e(label)}</strong><small data-home-summary>${e(source)}</small></span>
      </button>
      ${block.enabled ? '' : `<span class="home-hidden-label">${tr('Скрыт')}</span>`}
      <div class="home-moves">${iconAction('up', 'Поднять блок', 'arrow-up', index === 0 ? 'disabled' : '')}${iconAction('down', 'Опустить блок', 'arrow-down', index === total - 1 ? 'disabled' : '')}</div>
    </li>`;
  }
  function productChoices(block) {
    const selectedIds = new Set(block.productIds);
    const query = search.trim().toLowerCase();
    const matches = products().filter(product => !selectedIds.has(product.id) && [product.name, titleOf(product), product.sku, product.id].join(' ').toLowerCase().includes(query));
    if (!matches.length) return `<p class="home-hint">${tr('Товары не найдены')}</p>`;
    return `<div class="home-choices">${matches.slice(0, 12).map(product => `<button type="button" data-home-action="add-product" data-product="${e(product.id)}" ${block.productIds.length >= 100 ? 'disabled' : ''}><span><strong>${e(titleOf(product))}</strong><small>${e(product.sku || product.id)}</small></span>${icon('plus')}</button>`).join('')}</div>${matches.length > 12 ? `<p class="home-hint">${tr('Уточните поиск, чтобы увидеть другие товары.')}</p>` : ''}`;
  }
  function productPicker(block) {
    const byId = new Map(products().map(product => [product.id, product]));
    return `<div class="home-product-picker"><h3>${tr('Состав подборки')}</h3>
      ${block.productIds.length ? `<ol class="home-selected-products">${block.productIds.map((id, index) => `<li data-product="${e(id)}"><span>${e(byId.has(id) ? titleOf(byId.get(id)) : id)}</span>${iconAction('product-up', 'Поднять товар', 'arrow-up', index === 0 ? 'disabled' : '')}${iconAction('product-down', 'Опустить товар', 'arrow-down', index === block.productIds.length - 1 ? 'disabled' : '')}${iconAction('remove-product', 'Убрать товар из подборки', 'close')}</li>`).join('')}</ol>` : `<p class="home-hint">${tr('Найдите товар и добавьте его в подборку.')}</p>`}
      <label class="field"><span class="field-label">${tr('Найти товар по названию, ID или артикулу')}</span><input type="search" data-home-field="search" value="${e(search)}" autocomplete="off"></label>
      <div data-home-choices>${productChoices(block)}</div></div>`;
  }
  function contentFields(block) {
    switch (block.type) {
      case 'banner':
        return select('Баннеры', 'sourceId', block.sourceId, [['', t('Все включённые баннеры')], ...store().heroes.map(item => [item.id, name(item)])]) + `<a class="home-link" href="#banners">${tr('Настроить баннеры')}</a>`;
      case 'campaign':
        return select('Акция', 'sourceId', block.sourceId, [['', t('Все активные акции')], ...store().campaigns.filter(item => !item.isTemplate).map(item => [item.id, name(item)])]) + `<a class="home-link" href="#campaigns">${tr('Настроить акции')}</a>`;
      case 'categories': return `<a class="home-link" href="#categories">${tr('Настроить категории')}</a>`;
      case 'blog': return `<a class="home-link" href="#blog">${tr('Настроить статьи блога')}</a>`;
      case 'category':
      case 'products':
        return `${block.type === 'category' ? select('Категория', 'sourceId', block.sourceId, [['', t('Выберите категорию')], ...store().categories.map(item => [item.id, name(item)])]) : ''}
          <fieldset class="home-titles"><legend>${tr(block.type === 'category' ? 'Свой заголовок (необязательно)' : 'Заголовок на витрине')}</legend><div>${locales.map(lang => `<label class="field"><span class="field-label" lang="${lang}">${lang.toUpperCase()}</span><input type="text" maxlength="200" lang="${lang}" data-home-field="title" data-locale="${lang}" value="${e(block.title[lang])}"></label>`).join('')}</div></fieldset>
          <label class="field home-limit"><span class="field-label">${tr('Максимум товаров в ряду')}</span><input type="number" data-home-field="limit" min="1" max="48" step="1" value="${block.limit}"></label>
          ${block.type === 'products' ? productPicker(block) : `<p class="home-hint">${tr('Если заголовок пуст, используется название категории.')}</p>`}`;
      default: return '';
    }
  }
  function inspector(block, total) {
    return `<section class="home-pane home-inspector" aria-labelledby="home-inspector-title"><header class="home-pane-header"><span class="home-block-icon">${icon(icons[block.type])}</span><div><h2 id="home-inspector-title" tabindex="-1">${tr(labels[block.type])}</h2><p>${tr(descriptions[block.type])}</p></div>${iconAction('block-list', 'К списку блоков', 'arrow-up', 'data-home-return')}</header>
      <div class="home-inspector-body"><label class="home-toggle"><input type="checkbox" data-home-field="enabled"${block.enabled ? ' checked' : ''}><span>${tr('Показывать на главной')}</span></label>${contentFields(block)}</div>
      <footer class="home-inspector-actions">${engine.homeSingletons.includes(block.type) ? '' : action('copy', 'Дублировать', 'copy', total >= engine.homeLimit ? 'disabled' : '')}${action('remove', 'Удалить блок', 'trash', 'data-tone="danger"')}</footer></section>`;
  }
  function thumb(url, alt = '') {
    return engine.safeImage(url) ? `<img src="${e(url)}" alt="${e(alt)}" loading="lazy">` : icon('image');
  }
  function previewRow(row) {
    const frame = visuals.campaignFrame(row, locale);
    const cards = row.products.slice(0, 8).map(product => {
      const localized = localizedProduct(state.document, product, locale);
      return `<article class="studio-campaign-card"><div class="home-thumb">${thumb(product.images?.find(engine.safeImage))}</div><strong>${e(localized.name)}</strong><span>${e(product.price)} ₾</span></article>`;
    }).join('');
    return frame.start + cards + frame.end;
  }
  function previewContent(block, priced, rows) {
    if (block.type === 'banner') {
      const banners = engine.banners(store()).filter(banner => !block.sourceId || banner.id === block.sourceId).map(banner => {
        const mobile = device === 'mobile' && engine.safeImage(banner.mobileImage);
        return visuals.hero(mobile ? { ...banner, image: banner.mobileImage } : banner, locale);
      }).join('');
      return banners ? `<div class="home-preview-banners" tabindex="0" aria-label="${tr('Баннеры')}">${banners}</div>` : '';
    }
    if (block.type === 'campaign') return rows.filter(row => block.sourceId ? row.id === block.sourceId : row.showRow).map(previewRow).join('');
    if (block.type === 'products' || block.type === 'category') {
      const shelf = engine.homeProducts(block, priced, store(), locale);
      return shelf.products.length ? previewRow({ ...shelf, id: block.id, title: { ka: shelf.title }, template: 'cards' }) : '';
    }
    if (block.type === 'categories') return `<div class="home-preview-categories">${store().categories.filter(item => item.visible !== false).map(item => visuals.category(item, locale, state.storeIcons?.[item.icon]?.icon || '')).join('')}</div>`;
    if (block.type === 'blog') {
      const published = (state.document.blog || []).filter(article => article.status === 'published').sort((a, b) => b.rank - a.rank || b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
      const featured = published.filter(article => article.homepage);
      if (!featured.length) return '';
      return `<div class="home-preview-blog">${[...featured, ...published.filter(article => !article.homepage)].slice(0, 8).map(article => `<article><div class="home-thumb">${thumb(article.cover)}</div><strong>${e((article.editions[locale]?.enabled ? article.editions[locale] : article.editions.ka).title)}</strong></article>`).join('')}</div>`;
    }
    return `<p class="home-preview-note">${tr('Состав этой ленты зависит от посетителя.')}</p>`;
  }
  function preview(list) {
    const now = Date.now();
    const priced = engine.applyProducts(products(), store(), now);
    const rows = engine.rows(priced, store(), now, true);
    return `<section class="home-pane home-preview"><header class="home-pane-header"><div><h2>${tr('Витрина из черновика')}</h2><p>${tr('Показаны включённые блоки. Акции рассчитаны на текущий момент.')}</p></div><div class="home-preview-controls">${select('Язык витрины', 'locale', locale, [['ka', 'ქართული'], ['ru', 'Русский'], ['en', 'English']])}${select('Экран', 'device', device, [['desktop', t('Компьютер')], ['mobile', t('Телефон')]])}</div></header>
      <div class="home-preview-canvas studio-preview-device" data-device="${device}" data-home-preview>
        ${list.filter(block => block.enabled).map(block => `<section class="home-preview-block"><h3>${tr(labels[block.type])}</h3>${previewContent(block, priced, rows) || `<p class="home-preview-note">${tr('Сейчас блок скрыт на витрине, потому что в нём нет содержимого.')}</p>`}</section>`).join('') || `<p class="home-preview-note">${tr('Включите хотя бы один блок для предпросмотра.')}</p>`}
      </div></section>`;
  }
  function addMenu(list, current) {
    if (list.length >= engine.homeLimit) return `<button type="button" class="button primary" disabled>${icon('plus')}${tr('Добавить блок')}</button>`;
    return `<details class="home-add"><summary class="button primary">${icon('plus')}${tr('Добавить блок')}</summary><div class="home-types">
      <p>${tr(current ? 'Новый блок появится после выбранного.' : 'Выберите тип блока.')}</p>
      ${engine.homeTypes.map(type => `<button type="button" data-home-action="add" data-type="${type}"${engine.homeSingletons.includes(type) && list.some(block => block.type === type) ? ' disabled' : ''}><span class="home-block-icon">${icon(icons[type])}</span><span><strong>${tr(labels[type])}</strong><small>${tr(descriptions[type])}</small></span></button>`).join('')}
      </div></details>`;
  }
  function render(focus) {
    const target = root.querySelector('#home-editor');
    if (!target) return;
    const list = blocks();
    const current = list.find(block => block.id === selected) || list[0];
    selected = current?.id || '';
    const activeCount = list.filter(block => block.enabled).length;
    target.innerHTML = `<div class="home-toolbar"><div class="home-mode" role="group" aria-label="${tr('Режим редактора')}">${action('edit', 'Редактирование', 'edit', `aria-pressed="${panel === 'edit'}"`)}${action('preview', 'Предпросмотр', 'eye', `aria-pressed="${panel === 'preview'}"`)}</div>${store().home ? action('reset', 'Стандартный порядок', 'refresh') : ''}</div>
      ${panel === 'preview' ? preview(list) : `<div class="home-workspace"><section class="home-pane" aria-labelledby="home-list-title"><header class="home-pane-header home-list-header"><div><h2 id="home-list-title" tabindex="-1">${tr('Порядок блоков')}</h2><p>${activeCount} / ${list.length} ${tr('включено')}</p></div>${addMenu(list, current)}</header>
        <p class="home-list-hint">${tr('Перетащите блок или используйте кнопки перемещения.')}</p>
        <ol class="home-block-list">${list.map((block, index) => listItem(block, index, list.length)).join('')}</ol>
        ${list.length ? '' : `<p class="home-list-hint">${tr('Главная страница пуста. Добавьте первый блок.')}</p>`}
        </section>${current ? inspector(current, list.length) : ''}</div>`}`;
    if (panel === 'preview') {
      const base = state.session?.storefrontBase || '';
      visuals.apply(target.querySelector('[data-home-preview]'), base.startsWith('https://') ? base : '');
    }
    if (focus) {
      const button = target.querySelector(focus);
      const fallback = target.querySelector('[aria-pressed="true"].home-block-select') || target.querySelector('.home-add summary');
      (button?.disabled ? fallback : button || fallback)?.focus({ preventScroll: true });
    }
  }
  function commit(focus) {
    markDirty();
    render(focus);
  }
  function move(id, to, actionName = 'select') {
    const list = editable();
    const from = list.findIndex(block => block.id === id);
    if (from < 0 || from === to || to < 0 || to >= list.length) return;
    const [block] = list.splice(from, 1);
    list.splice(to, 0, block);
    if (selected !== id) search = '';
    selected = id;
    commit(`[data-home-id="${id}"] [data-home-action="${actionName}"]`);
  }
  function focusInspector(id) {
    if (matchMedia('(max-width: 1080px)').matches) {
      const heading = root.querySelector('#home-inspector-title');
      heading?.focus();
      heading?.closest('.home-inspector').scrollIntoView({ block: 'nearest' });
    } else root.querySelector(`[data-home-id="${id}"] .home-block-select`)?.focus();
  }
  root.addEventListener('click', async event => {
    if (event.target.closest('[data-home-preview] a')) { event.preventDefault(); return; }
    const button = event.target.closest('[data-home-action]');
    if (!button || state.busy) return;
    const actionName = button.dataset.homeAction;
    const list = blocks();
    const id = button.closest('[data-home-id]')?.dataset.homeId || selected;
    const index = list.findIndex(block => block.id === id);
    if (actionName === 'block-list') { root.querySelector('#home-list-title').focus(); return; }
    if (actionName === 'select') { selected = id; search = ''; render(); focusInspector(id); return; }
    if (actionName === 'edit' || actionName === 'preview') { panel = actionName; render(`[data-home-action="${actionName}"]`); return; }
    if (actionName === 'reset') {
      if (!await confirmMessage(t('Вернуть стандартный порядок?'), t('Пользовательские блоки и их настройки будут убраны из черновика главной.'), t('Вернуть порядок'))) return;
      delete store().home;
      selected = ''; search = ''; panel = 'edit'; commit('[data-home-action="edit"]'); return;
    }
    if (actionName === 'up' || actionName === 'down') { move(id, index + (actionName === 'up' ? -1 : 1), actionName); return; }
    if (actionName === 'add' || actionName === 'copy') {
      if (list.length >= engine.homeLimit) return;
      const type = button.dataset.type || list[index].type;
      const block = actionName === 'copy' ? clone(list[index]) : { type, enabled: true };
      block.id = itemId();
      if (actionName === 'add') {
        if (type === 'banner' || type === 'campaign') block.sourceId = '';
        if (type === 'products' || type === 'category') Object.assign(block, { title: {}, limit: 8 });
        if (type === 'products') Object.assign(block, { productIds: [], title: { ka: 'რეკომენდებული პროდუქტები', ru: 'Рекомендуемые товары', en: 'Recommended products' } });
        if (type === 'category') Object.assign(block, { sourceId: store().categories[0]?.id || '', enabled: Boolean(store().categories.length) });
      }
      editable().splice(index + 1, 0, block);
      selected = block.id; search = ''; commit(); focusInspector(selected); return;
    }
    if (actionName === 'remove') {
      if (!await confirmMessage(t('Удалить блок с главной?'), t('Блок будет убран из черновика. Исходное содержимое останется в Studio.'), t('Удалить блок'))) return;
      editable().splice(index, 1);
      selected = blocks()[index]?.id || blocks()[index - 1]?.id || ''; search = ''; commit('.home-block-select[aria-pressed="true"]'); return;
    }
    const productId = button.closest('[data-product]')?.dataset.product;
    if (!productId) return;
    const chosen = editable()[index].productIds;
    const from = chosen.indexOf(productId);
    if (actionName === 'add-product' && from < 0 && chosen.length < 100) chosen.push(productId);
    if (actionName === 'remove-product' && from >= 0) chosen.splice(from, 1);
    if (actionName === 'product-up' || actionName === 'product-down') {
      const to = from + (actionName === 'product-up' ? -1 : 1);
      if (from >= 0 && to >= 0 && to < chosen.length) [chosen[to], chosen[from]] = [chosen[from], chosen[to]];
      commit(`li[data-product="${CSS.escape(productId)}"] [data-home-action="${actionName}"]`); return;
    }
    commit('[data-home-field="search"]');
  });
  root.addEventListener('keydown', event => {
    const menu = event.target.closest('.home-add[open]');
    if (event.key === 'Escape' && menu) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  root.addEventListener('input', event => {
    const field = event.target;
    const key = field.dataset.homeField;
    if (state.busy || !['title', 'search', 'limit'].includes(key)) return;
    const index = blocks().findIndex(block => block.id === selected);
    if (key === 'search') {
      search = field.value;
      root.querySelector('[data-home-choices]').innerHTML = productChoices(blocks()[index]);
      return;
    }
    if (key === 'limit' && (!field.validity.valid || !field.value)) return;
    const block = editable()[index];
    if (key === 'title') block.title[field.dataset.locale] = field.value;
    else block.limit = field.valueAsNumber;
    root.querySelector(`[data-home-id="${selected}"] [data-home-summary]`).textContent = sourceLabel(block);
    markDirty();
  });
  root.addEventListener('change', event => {
    const field = event.target;
    const key = field.dataset.homeField;
    if (!key || state.busy) return;
    if (key === 'locale' || key === 'device') {
      if (key === 'locale') locale = field.value; else device = field.value;
      render(`[data-home-field="${key}"]`); return;
    }
    const index = blocks().findIndex(block => block.id === selected);
    if (key === 'limit' && (!field.validity.valid || !field.value)) field.value = blocks()[index].limit;
    if (key !== 'sourceId' && key !== 'enabled') return;
    const block = editable()[index];
    if (key === 'sourceId') {
      block.sourceId = field.value;
      if (block.type === 'category' && !block.sourceId) block.enabled = false;
    } else {
      if (block.type === 'category' && !block.sourceId && field.checked) { field.checked = false; toast(t('Сначала выберите категорию.'), true); return; }
      block.enabled = field.checked;
    }
    commit(`[data-home-field="${key}"]`);
  });
  function clearDrop() {
    root.querySelectorAll('[data-home-drop]').forEach(item => delete item.dataset.homeDrop);
  }
  function dragTarget(event) {
    return document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-home-id]');
  }
  root.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.home-drag');
    if (!handle || event.button !== 0 || state.busy) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    drag = { row: handle.closest('[data-home-id]'), pointer: event.pointerId };
  });
  root.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    const row = dragTarget(event);
    clearDrop();
    if (!row || row === drag.row) return;
    const rect = row.getBoundingClientRect();
    row.dataset.homeDrop = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  });
  root.addEventListener('pointerup', event => {
    if (drag?.pointer !== event.pointerId) return;
    const id = drag.row.dataset.homeId;
    const row = dragTarget(event);
    drag = undefined;
    clearDrop();
    if (!row || row.dataset.homeId === id || state.busy) return;
    const list = blocks();
    const from = list.findIndex(block => block.id === id);
    const target = list.findIndex(block => block.id === row.dataset.homeId);
    const rect = row.getBoundingClientRect();
    const offset = Number(event.clientY >= rect.top + rect.height / 2) - Number(from < target);
    move(id, target + offset);
  });
  root.addEventListener('lostpointercapture', () => { drag = undefined; clearDrop(); });
  return { render };
}
