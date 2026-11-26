import { getLocale, t } from './studio-i18n.js';
import { articleMatches, blogImage, blogLocales, blogPath, blockTypes, brandKey, emptyEdition, escapeBlog as e, newArticle, renderBlogBlocks, validSlug } from './blog-model.js';

const statuses = { draft: 'Черновик', published: 'Для сайта', archived: 'В архиве' };
const panels = { content: 'Текст', placements: 'Размещение', settings: 'Настройки', preview: 'Предпросмотр' };
const labels = {
  paragraph: 'Абзац', heading: 'Заголовок раздела', subheading: 'Подзаголовок', list: 'Маркированный список',
  numbered: 'Нумерованный список', quote: 'Цитата', image: 'Изображение', link: 'Ссылка'
};
const blockMarks = { paragraph: '¶', heading: 'H2', subheading: 'H3', list: '•', numbered: '1.', quote: '“' };
const placementLabels = { productIds: 'Товары', brands: 'Бренды', subcategoryIds: 'Подкатегории', categoryIds: 'Категории', excludeIds: 'Исключения' };
const langLabel = { ka: 'ქართული', ru: 'Русский', en: 'English' };
const pageSize = 20;
const l = value => e(t(value));
const field = (label, control) => `<label class="field"><span class="field-label">${l(label)}</span>${control}</label>`;
const input = (key, value, limit, type = 'text') => `<input type="${type}" data-blog-field="${key}" value="${e(value)}" maxlength="${limit}">`;
const statusBadge = status => `<span class="blog-status" data-status="${status}">${l(statuses[status])}</span>`;
const dateLabel = date => date ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z')) : '';
const contains = (values, query) => values.join(' ').toLowerCase().includes(query.trim().toLowerCase());

export function createBlogEditor({ state, markDirty, toast, confirmMessage, studioMedia, icon }) {
  const root = document.querySelector('#blog-view');
  const button = (label, attr, style = 'secondary', name = '') =>
    `<button type="button" class="button ${style}" ${attr}>${name ? icon(name) : ''}${l(label)}</button>`;
  const iconButton = (label, name, attr) =>
    `<button type="button" class="blog-icon-button" aria-label="${l(label)}" title="${l(label)}" ${attr}>${icon(name)}</button>`;
  const marker = type => blockMarks[type] || icon(type === 'image' ? 'image' : 'arrow-up-right');
  const searchBox = (label, attr, value) => `<label class="blog-search">${icon('search')}<input type="search" ${attr}
    aria-label="${l(label)}" placeholder="${l(label)}" autocomplete="off" value="${e(value)}"></label>`;

  let selected = '';
  let locale = 'ka';
  let panel = 'content';
  let query = '';
  let status = '';
  let targetKey = 'productIds';
  let targetQuery = '';
  let targetLimit = pageSize;
  let matchLimit = pageSize;
  let matchOpen = false;
  let previewKind = 'article';
  let previewSize = 'desktop';
  let removedBlock;
  let editorFocus;
  let targetOptions;
  let matches = [];
  const articles = () => state.document.blog || [];
  const current = () => articles().find(article => article.id === selected);
  const edition = () => current().editions[locale] || emptyEdition();
  const editableEdition = () => current().editions[locale] ||= emptyEdition();
  const targetProducts = () => state.document.catalog.products;
  const titleOf = article => article.editions[getLocale()]?.title || article.editions.ka.title || article.slug || t('Новая статья');
  const coverSource = value => value.startsWith('/img/') && state.session?.storefrontBase?.startsWith('https://')
    ? new URL(value, state.session.storefrontBase).href : value;
  function cover(article, className, alt = '') {
    if (!blogImage(article.cover)) return `<span class="${className} blog-cover-placeholder" aria-hidden="true">${icon('image')}</span>`;
    const small = className === 'blog-thumbnail';
    const card = small || className === 'blog-card-cover';
    const srcset = card && globalThis.EnkaCardImages.srcset(article.cover, article.coverWidth, 'cover');
    return `<img class="${className}" src="${e(coverSource(article.cover))}" alt="${e(alt)}"${srcset ? ` loading="lazy" srcset="${e(srcset)}" sizes="auto, ${small ? 58 : 400}px"` : ''}>`;
  }

  function render() {
    root.hidden = state.view !== 'blog';
    if (root.hidden) return;
    const [, id = ''] = location.hash.slice(1).split('/');
    const changedArticle = id !== selected;
    if (changedArticle) {
      selected = id;
      locale = 'ka';
      panel = 'content';
      targetKey = 'productIds';
      targetQuery = '';
      targetLimit = matchLimit = pageSize;
      matchOpen = false;
      removedBlock = undefined;
    }
    const article = current();
    root.innerHTML = article ? renderArticle(article) : renderLibrary();
    if (article && changedArticle) window.scrollTo(0, 0);
    if (!article) renderList();
    if (editorFocus) {
      const focus = article ? root.querySelector(editorFocus === 'title' ? '[data-blog-edition="title"]' : '[data-blog-title]') :
        root.querySelector(`[data-blog-open="${CSS.escape(editorFocus)}"]`) || root.querySelector('[data-blog-action="new"]');
      focus?.focus({ preventScroll: !!article });
      editorFocus = undefined;
    }
  }

  function renderLibrary() {
    return `<div class="blog-library">
      <header class="blog-library-header"><div><h1>${l('Блог')}</h1><p>${l('Статьи для главной, каталога и раздела блога.')}</p></div>
        ${button('Создать статью', 'data-blog-action="new"', 'primary', 'plus')}
      </header>
      <div class="blog-surface">
        <nav class="blog-library-tabs" aria-label="${l('Статус')}">${[['', 'Все статьи'], ...Object.entries(statuses)].map(([key, label]) => {
          const count = key ? articles().filter(article => article.status === key).length : articles().length;
          return `<button type="button" data-blog-filter="${key}" aria-pressed="${status === key}">${l(label)} <span>${count}</span></button>`;
        }).join('')}</nav>
        <div class="blog-library-tools">${searchBox('Поиск по статьям', 'data-blog-search', query)}</div>
        <div data-blog-list></div>
      </div>
    </div>`;
  }

  function renderList() {
    const results = [...articles()].reverse().filter(article => (!status || article.status === status) &&
      contains([article.slug, article.author, ...Object.values(article.editions).map(value => value.title)], query));
    const list = root.querySelector('[data-blog-list]');
    if (!results.length) {
      list.innerHTML = `<div class="blog-empty"><span class="blog-empty-icon">${icon(articles().length ? 'search' : 'edit')}</span>
        <h2>${l(articles().length ? 'Статей не найдено.' : 'В блоге пока нет статей')}</h2>
        ${articles().length ? button('Сбросить фильтры', 'data-blog-action="reset"') : ''}</div>`;
      return;
    }
    list.innerHTML = `<div class="blog-list">
      <div class="blog-list-labels" aria-hidden="true"><span>${l('Статья')}</span><span>${l('Статус')}</span><span>${l('Дата публикации')}</span><span></span></div>
      ${results.map(article => `<a class="blog-row" href="#blog/${e(article.id)}" data-blog-open="${e(article.id)}">
        <span class="blog-row-main">${cover(article, 'blog-thumbnail')}<span><strong>${e(titleOf(article))}</strong>
          <small>${validSlug(article.slug) ? e(blogPath('ka', article.slug)) : ''}${article.homepage ? `<span class="blog-row-home">${l('На главной')}</span>` : ''}</small>
        </span></span>
        ${statusBadge(article.status)}<span class="blog-row-date">${e(dateLabel(article.date) || '—')}</span>${icon('chevron-right')}</a>`).join('')}
    </div>`;
  }

  function renderArticle(article) {
    return `<div class="blog-editor-page">
      <header class="blog-editor-header" data-panel="${panel}">
        <a class="blog-back" href="#blog" data-blog-back>${icon('chevron-left')}${l('Все статьи')}</a>
        <div class="blog-editor-heading"><h1 tabindex="-1" data-blog-title>${e(titleOf(article))}</h1>
          <div class="blog-header-actions">${statusBadge(article.status)}
            <details class="blog-menu"><summary aria-label="${l('Действия со статьёй')}" title="${l('Действия со статьёй')}">···</summary>
              <div>${button('Дублировать', 'data-blog-action="duplicate"', 'blog-quiet', 'copy')}
              ${button('Удалить', 'data-blog-action="delete"', 'blog-danger', 'trash')}</div>
            </details>
          </div>
        </div>
      </header>
      <nav class="blog-editor-nav" aria-label="${l('Редактор статей')}">${Object.entries(panels).map(([key, label]) =>
        `<button type="button" data-blog-panel="${key}" aria-pressed="${panel === key}">${key === 'preview' ? icon('eye') : ''}${l(label)}</button>`).join('')}</nav>
      <div class="blog-panel">${panel === 'content' ? content(article) : panel === 'placements' ? placements(article) : panel === 'settings' ? settings(article) : preview(article)}</div>
    </div>`;
  }

  function languages(article) {
    return `<div class="blog-segmented" role="group" aria-label="${l('Язык статьи')}">${blogLocales.map(key =>
      `<button type="button" lang="${key}" data-blog-locale="${key}" aria-pressed="${key === locale}">${langLabel[key]}
        ${key !== 'ka' && article.editions[key]?.enabled ? icon('check') : ''}</button>`).join('')}</div>`;
  }

  function mediaUpload(key, label = 'Загрузить изображение') {
    return `<label class="button secondary studio-upload">${icon('upload')}${l(label)}
      <input type="file" data-blog-upload="${key}" accept="image/jpeg,image/png,image/webp" aria-label="${l(label)}"></label>`;
  }

  function coverPreview(article) {
    return cover(article, 'blog-cover-preview');
  }

  function content(article) {
    const value = edition();
    return `<div class="blog-content-grid">
      <section class="blog-surface blog-compose">
        <div class="blog-compose-top">${languages(article)}
          <button type="button" class="blog-inline-button blog-cover-jump" data-blog-action="jump-cover">${icon('image')}${l('Обложка')}</button>
          ${locale === 'ka' ? '' : `<label class="blog-check"><input type="checkbox" data-blog-edition="enabled"${value.enabled ? ' checked' : ''}>${l('Опубликовать эту языковую версию')}</label>`}
        </div>
        <div class="blog-manuscript">
          <label class="blog-title-field"><span class="sr-only">${l('Заголовок статьи')}</span><textarea rows="1" data-blog-edition="title"
            maxlength="200" lang="${locale}" placeholder="${l('Заголовок статьи')}">${e(value.title)}</textarea></label>
          <label class="blog-intro-field"><span class="sr-only">${l('Краткое описание для карточек')}</span><textarea rows="2"
            data-blog-edition="summary" maxlength="500" lang="${locale}" placeholder="${l('Краткое описание для карточек')}">${e(value.summary)}</textarea></label>
          <div class="blog-body-tools"><h2>${l('Текст статьи')}</h2>
            <button type="button" class="blog-inline-button" data-blog-action="undo-block"${removedBlock?.locale === locale ? '' : ' hidden'}>${icon('history')}${l('Вернуть блок')}</button>
          </div>
          <div class="blog-blocks">${value.blocks.map(renderBlock).join('')}</div>
          ${insertBlock(value.blocks.length)}
        </div>
      </section>
      <aside class="blog-content-aside">
        <section class="blog-surface blog-side-card"><h2 tabindex="-1" data-blog-cover-heading>${l('Обложка')}</h2>
          <div data-blog-cover-preview>${coverPreview(article)}</div>
          <div class="blog-cover-actions">${mediaUpload('cover')}
            ${button('Подготовить миниатюры', `data-blog-action="prepare-cover"${studioMedia.canPrepare(article.cover, article.coverWidth) ? '' : ' hidden'}`)}
            ${iconButton('Убрать обложку', 'trash', `data-blog-action="remove-cover"${article.cover ? '' : ' hidden'}`)}</div>
          <details class="blog-options" data-blog-cover-options><summary>${l('Адрес и описание')}${icon('chevron-down')}</summary>
            <div class="blog-fields-stack">
              ${field('Ссылка на обложку', input('cover', article.cover, 2000, 'url'))}
              ${field('Описание обложки (alt)', `<input data-blog-edition="coverAlt" maxlength="300" lang="${locale}" value="${e(value.coverAlt)}">`)}
            </div>
          </details>
        </section>
        <details class="blog-surface blog-side-card blog-options"><summary>SEO${icon('chevron-down')}</summary>
          <div class="blog-fields-stack">
            ${field('SEO-заголовок', `<input data-blog-edition="seoTitle" maxlength="200" lang="${locale}" value="${e(value.seoTitle)}">`)}
            ${field('SEO-описание', `<textarea rows="3" data-blog-edition="seoDescription" maxlength="500" lang="${locale}">${e(value.seoDescription)}</textarea>`)}
            <p class="blog-hint">${l('Если SEO-поля пустые, сайт использует заголовок и краткое описание статьи.')}</p>
          </div>
        </details>
      </aside>
    </div>`;
  }

  function insertBlock(index, compact = false) {
    return `<div class="blog-insert${compact ? ' blog-insert-between' : ''}">
      ${compact ? '' : button('Абзац', `data-blog-add="paragraph" data-blog-index="${index}"`, 'secondary', 'plus')}
      <details class="blog-block-menu"><summary aria-label="${l('Добавить блок')}" title="${l('Добавить блок')}">
        ${icon('plus')}${compact ? '' : `<span>${l('Добавить блок')}</span>`}</summary>
        <div>${blockTypes.map(type => `<button type="button" data-blog-add="${type}" data-blog-index="${index}">
          <span class="blog-block-mark">${marker(type)}</span>${l(labels[type])}</button>`).join('')}</div>
      </details>
    </div>`;
  }

  function renderBlock(block, index, blocks) {
    const image = block.type === 'image';
    const link = block.type === 'link';
    const short = ['heading', 'subheading', 'image', 'link'].includes(block.type);
    const label = image ? 'Подпись к изображению' : link ? 'Текст ссылки' : labels[block.type];
    const placeholder = ['list', 'numbered'].includes(block.type) ? 'Каждый пункт с новой строки' : label;
    return `${index === 0 ? '' : insertBlock(index, true)}
      <section class="blog-block" data-blog-block="${index}" data-block-type="${block.type}">
        <div class="blog-block-head"><span class="blog-block-label"><span class="blog-block-mark">${marker(block.type)}</span>${l(labels[block.type])}</span>
          <div class="blog-block-actions">
            ${!image && !link ? `<button type="button" class="blog-icon-button blog-format" data-blog-format="bold" aria-label="${l('Жирный')}" title="${l('Жирный')} (Ctrl+B)"><b>B</b></button>
              <button type="button" class="blog-icon-button blog-format" data-blog-format="italic" aria-label="${l('Курсив')}" title="${l('Курсив')} (Ctrl+I)"><i>I</i></button>` : ''}
            ${iconButton('Выше', 'arrow-up', `data-blog-move="-1"${index === 0 ? ' disabled' : ''}`)}
            ${iconButton('Ниже', 'arrow-down', `data-blog-move="1"${index + 1 === blocks.length ? ' disabled' : ''}`)}
            ${iconButton('Удалить блок', 'trash', 'data-blog-action="remove-block"')}
          </div>
        </div>
        ${image ? `<div class="blog-block-media"><div data-blog-image-preview>${blockImage(block)}</div>${mediaUpload(index)}</div>` : ''}
        ${image || link ? `<div class="blog-fields">${field(image ? 'Адрес изображения' : 'Адрес ссылки', `<input data-blog-block-field="url" maxlength="2000" value="${e(block.url)}">`)}
          ${image ? field('Описание изображения (alt)', `<input data-blog-block-field="alt" maxlength="300" lang="${locale}" value="${e(block.alt)}">`) : ''}</div>` : ''}
        <label class="blog-block-text-label"><span class="sr-only">${l(label)}</span><textarea class="blog-block-text" rows="${short ? 1 : 3}"
          data-blog-block-field="text" lang="${locale}" maxlength="12000" placeholder="${l(placeholder)}">${e(block.text)}</textarea></label>
      </section>`;
  }

  function blockImage(block) {
    return blogImage(block.url) ? `<img src="${e(block.url)}" alt="" loading="lazy">` : '';
  }

  function settings(article) {
    const locked = state.server.blogSlugs?.[article.id] === article.slug;
    return `<section class="blog-surface blog-form-card">
      <h2>${l('Публикация')}</h2>
      <div class="blog-fields">
        ${field('Статус', `<select data-blog-field="status">${Object.entries(statuses).map(([key, label]) => `<option value="${key}"${key === article.status ? ' selected' : ''}>${l(label)}</option>`).join('')}</select>`)}
        ${field('Автор', input('author', article.author, 150))}
        ${field('Дата публикации', input('date', article.date, 10, 'date'))}
        ${field('Дата обновления', input('updated', article.updated, 10, 'date'))}
        <div class="blog-wide">${field('Адрес статьи (slug)', `<input data-blog-field="slug" value="${e(article.slug)}" maxlength="100"
          autocapitalize="off" spellcheck="false"${locked ? ' readonly' : ''} aria-describedby="blog-path-hint">`)}
          <p class="blog-hint" id="blog-path-hint"><span data-blog-path>${validSlug(article.slug) ? e(blogPath('ka', article.slug)) : l('Пример адреса: /blog/kak-vybrat-kofemashinu/')}</span>
          ${locked ? ' · ' + l('Адрес закреплён после первой публикации.') : ''}</p>
        </div>
      </div>
      <p class="blog-callout">${l('Статус «Для сайта» включает статью в следующую публикацию Studio. Чтобы обновить страницы и sitemap, запустите сборку магазина.')}</p>
    </section>`;
  }

  function placements(article) {
    const products = targetProducts().map(p => [p.id, p.name, [p.brand, p.sku, p.id].filter(Boolean).join(' · ')]);
    const brands = new Map(targetProducts().filter(p => brandKey(p.brand)).map(p => [brandKey(p.brand), p.brand.trim()]));
    targetOptions = {
      productIds: products, excludeIds: products, brands: [...brands].sort((a, b) => a[1].localeCompare(b[1])),
      categoryIds: state.taxonomy.map(c => [c.id, c.name]),
      subcategoryIds: state.taxonomy.flatMap(c => c.subs.map(s => [s.id, s.name, c.name]))
    };
    updateMatches(article);
    return `<div class="blog-placement-layout">
      <section class="blog-surface blog-form-card blog-place-products">
        <header><h2>${l('Страницы товаров')}</h2><p class="blog-hint">${l('Статья появится у товаров, подходящих хотя бы под одну привязку. Исключения имеют приоритет.')}</p></header>
        <div class="blog-placement-tabs" role="group" aria-label="${l('Привязки к товарам')}">${Object.entries(placementLabels).map(([key, label]) =>
          `<button type="button" data-blog-placement="${key}" aria-pressed="${key === targetKey}">${l(label)}
            <span data-blog-target-count="${key}"${article.placements[key].length ? '' : ' hidden'}>${article.placements[key].length}</span></button>`).join('')}</div>
        <div class="blog-picks" data-blog-selected>${selectedTargets(article)}</div>
        ${searchBox('Поиск по каталогу', 'data-blog-target="' + targetKey + '"', targetQuery)}
        <div class="blog-target-results" data-blog-results="${targetKey}">${targetResults(article)}</div>
      </section>
      <aside class="blog-placement-aside">
        <section class="blog-surface blog-side-card blog-reach">
          <p data-blog-match-count aria-live="polite">${matchCount()}</p>
          <details data-blog-matches${matchOpen ? ' open' : ''}><summary>${l('Посмотреть товары')}${icon('chevron-down')}</summary>
            <div data-blog-match-list>${matchedProducts()}</div></details>
        </section>
        <section class="blog-surface blog-side-card"><h2>${l('Главная страница')}</h2>
          <label class="blog-check"><input type="checkbox" data-blog-field="homepage"${article.homepage ? ' checked' : ''}>${l('Показывать на главной странице')}</label>
          <div data-blog-rank${article.homepage ? '' : ' hidden'}>
            ${field('Приоритет показа', `<input data-blog-field="rank" type="number" min="0" max="9999" value="${article.rank}">`)}
            <p class="blog-hint">${l('При одинаковом приоритете выше показываются более свежие статьи.')}</p>
          </div>
        </section>
      </aside>
    </div>`;
  }

  function updateMatches(article) {
    matches = targetProducts().filter(product => articleMatches(article, product));
  }

  function matchCount() {
    return `<span>${l('Подходящих страниц товаров')}</span> <strong>${matches.length}</strong>`;
  }

  function matchedProducts() {
    return matches.length ? `<ul>${matches.slice(0, matchLimit).map(product =>
      `<li><strong>${e(product.name)}</strong><small>${e([product.brand, product.sku || product.id].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>
      ${matches.length > matchLimit ? button('Показать ещё', 'data-blog-action="more-matches"', 'secondary') : ''}`
      : `<p class="blog-hint">${l('Совпадений нет.')}</p>`;
  }

  function selectedTargets(article) {
    const ids = article.placements[targetKey];
    if (!ids.length) return '';
    const names = new Map(targetOptions[targetKey].map(([id, name]) => [id, name]));
    return ids.map(id => `<button class="blog-chip" type="button" data-blog-remove-target="${e(id)}"
      aria-label="${l('Убрать привязку')} · ${e(names.get(id) || id)}">${e(names.get(id) || id)}${icon('close')}</button>`).join('');
  }

  function targetResults(article) {
    const found = targetOptions[targetKey].filter(option => contains(option, targetQuery));
    const selectedIds = new Set(article.placements[targetKey]);
    return found.length ? found.slice(0, targetLimit).map(([id, label, detail]) => `<label class="blog-target-row">
      <input type="checkbox" data-blog-target-change value="${e(id)}"${selectedIds.has(id) ? ' checked' : ''}>
      <span><strong>${e(label)}</strong>${detail ? '<small>' + e(detail) + '</small>' : ''}</span></label>`).join('') +
      (found.length > targetLimit ? button('Показать ещё', 'data-blog-action="more-targets"') : '')
      : `<p class="blog-hint">${l('Совпадений нет.')}</p>`;
  }

  function preview(article) {
    const value = edition();
    const title = e(value.title || t('Заголовок статьи'));
    const summary = e(value.summary);
    const date = article.date ? `<time datetime="${e(article.date)}">${e(dateLabel(article.date))}</time>` : '';
    return `<div class="blog-preview">
      <div class="blog-preview-tools">${languages(article)}
        <div class="blog-segmented" role="group" aria-label="${l('Вид предпросмотра')}">
          <button type="button" data-blog-preview-kind="article" aria-pressed="${previewKind === 'article'}">${l('Статья')}</button>
          <button type="button" data-blog-preview-kind="card" aria-pressed="${previewKind === 'card'}">${l('Карточка')}</button>
        </div>
        ${previewKind === 'article' ? `<div class="blog-segmented" role="group" aria-label="${l('Ширина экрана')}">
          <button type="button" data-blog-preview-size="desktop" aria-pressed="${previewSize === 'desktop'}">${l('Компьютер')}</button>
          <button type="button" data-blog-preview-size="mobile" aria-pressed="${previewSize === 'mobile'}">${l('Телефон')}</button>
        </div>` : ''}
      </div>
      ${previewKind === 'card' ? `<div class="blog-reading-card"><article class="blog-card${blogImage(article.cover) ? '' : ' blog-card--text'}" lang="${locale}">
        <div class="blog-card-sample">${blogImage(article.cover) ? `<div class="blog-card-media">${cover(article, 'blog-card-cover')}</div>` : ''}
          <div class="blog-card-copy">${date}<h2>${title}</h2><p>${summary}</p></div></div></article></div>`
        : `<article class="blog-reading-preview blog-surface" data-size="${previewSize}" lang="${locale}">
          <header class="blog-article-hero${blogImage(article.cover) ? ' blog-article-hero--cover' : ''}">
            <div class="blog-article-header"><h1>${title}</h1><p class="blog-article-lead">${summary}</p>
              <div class="blog-article-meta"><span>${e(article.author || 'ENKA Electronics')}</span>${date}</div></div>
            ${blogImage(article.cover) ? cover(article, 'blog-article-cover', value.coverAlt) : ''}
          </header>
          <div class="blog-article-body">${renderBlogBlocks(value.blocks)}</div></article>`}
    </div>`;
  }

  function changeTarget(id, add) {
    const article = current();
    const values = article.placements[targetKey];
    article.placements[targetKey] = add ? [...new Set([...values, id])] : values.filter(value => value !== id);
    updateMatches(article);
    const count = root.querySelector(`[data-blog-target-count="${targetKey}"]`);
    count.textContent = article.placements[targetKey].length;
    count.hidden = !article.placements[targetKey].length;
    root.querySelector('[data-blog-selected]').innerHTML = selectedTargets(article);
    root.querySelector('[data-blog-match-count]').innerHTML = matchCount();
    root.querySelector('[data-blog-match-list]').innerHTML = matchedProducts();
    markDirty();
  }

  function formatBlock(text, type) {
    if (!text) return;
    const mark = type === 'bold' ? '**' : '*';
    const start = text.selectionStart;
    const end = text.selectionEnd;
    const selectedText = text.value.slice(start, end);
    if (selectedText.includes('\n') || selectedText.includes('*')) { text.focus(); return; }
    const wrapped = start !== end && text.value.slice(start - mark.length, start) === mark &&
      text.value.slice(end, end + mark.length) === mark &&
      (mark === '**' || (text.value[start - 2] !== '*' && text.value[end + 1] !== '*'));
    if (!wrapped && text.value.length + mark.length * 2 > text.maxLength) return;
    text.focus();
    const from = wrapped ? start - mark.length : start;
    text.setRangeText(wrapped ? selectedText : mark + selectedText + mark, from, wrapped ? end + mark.length : end);
    const inner = wrapped ? from : start + mark.length;
    text.setSelectionRange(inner, inner + selectedText.length);
    text.dispatchEvent(new Event('input', { bubbles: true }));
  }

  root.addEventListener('input', event => {
    const { target } = event;
    if (target.matches('[data-blog-search]')) { query = target.value; renderList(); return; }
    const article = current();
    if (!article || state.busy) return;
    const value = target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value;
    if (target.dataset.blogTarget) {
      targetQuery = value;
      targetLimit = pageSize;
      root.querySelector('[data-blog-results]').innerHTML = targetResults(article);
      return;
    }
    if (target.dataset.blogField) {
      const key = target.dataset.blogField;
      if (key === 'cover' && article.cover !== value) delete article.coverWidth;
      article[key] = value;
      if (key === 'status') {
        if (value === 'published' && !article.date) {
          article.date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tbilisi' }).format(new Date());
          root.querySelector('[data-blog-field="date"]').value = article.date;
        }
        root.querySelector('.blog-header-actions .blog-status').outerHTML = statusBadge(value);
      }
      if (key === 'slug') root.querySelector('[data-blog-path]').textContent = validSlug(value) ? blogPath('ka', value) : t('Пример адреса: /blog/kak-vybrat-kofemashinu/');
      if (key === 'cover') {
        refreshCover(article);
      }
      if (key === 'homepage') root.querySelector('[data-blog-rank]').hidden = !value;
    } else if (target.dataset.blogEdition) {
      editableEdition()[target.dataset.blogEdition] = target.dataset.blogEdition === 'title' ? value.replace(/\n/g, ' ') : value;
      if (target.dataset.blogEdition === 'title') {
        if (target.value !== editableEdition().title) target.value = editableEdition().title;
        root.querySelector('[data-blog-title]').textContent = titleOf(article);
      }
      if (target.dataset.blogEdition === 'enabled') {
        root.querySelector(`[data-blog-locale="${locale}"]`).innerHTML = langLabel[locale] + (value ? icon('check') : '');
      }
    } else if (target.dataset.blogBlockField) {
      const section = target.closest('[data-blog-block]');
      const block = edition().blocks[Number(section.dataset.blogBlock)];
      block[target.dataset.blogBlockField] = value;
      if (block.type === 'image' && target.dataset.blogBlockField === 'url') section.querySelector('[data-blog-image-preview]').innerHTML = blockImage(block);
    } else return;
    markDirty();
  });

  root.addEventListener('change', async event => {
    const { target } = event;
    const article = current();
    if (!article || state.busy) return;
    if (target.matches('[data-blog-target-change]')) { changeTarget(target.value, target.checked); return; }
    if (target.dataset.blogUpload === undefined || !target.files?.length) return;
    const block = target.dataset.blogUpload === 'cover' ? null : edition().blocks[Number(target.dataset.blogUpload)];
    try {
      const file = target.files[0];
      if (block) {
        const url = await studioMedia.upload(file);
        if (!url) return;
        block.url = url;
        const section = target.closest('[data-blog-block]');
        section.querySelector('[data-blog-image-preview]').innerHTML = blockImage(block);
        section.querySelector('[data-blog-block-field="url"]').value = url;
      } else {
        const result = await studioMedia.uploadResponsive(file, 'cover');
        if (!result?.url) return;
        if (article.cover !== result.url) delete article.coverWidth;
        article.cover = result.url;
        if (result.width) article.coverWidth = result.width;
        root.querySelector('[data-blog-field="cover"]').value = result.url;
        refreshCover(article);
      }
      markDirty();
      target.value = '';
    } catch { target.value = ''; }
  });

  function refreshCover(article) {
    root.querySelector('[data-blog-cover-preview]').innerHTML = coverPreview(article);
    root.querySelector('[data-blog-action="remove-cover"]').hidden = !article.cover;
    root.querySelector('[data-blog-action="prepare-cover"]').hidden = !studioMedia.canPrepare(article.cover, article.coverWidth);
  }

  root.addEventListener('toggle', event => {
    if (event.target.matches('[data-blog-matches]')) matchOpen = event.target.open;
  }, true);

  root.addEventListener('pointerdown', event => {
    // Keep the textarea selection until the formatting button applies it.
    if (event.target.closest('[data-blog-format]') && event.pointerType === 'mouse') event.preventDefault();
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && event.target.closest('details[open]')?.matches('.blog-menu, .blog-block-menu')) {
      const menu = event.target.closest('details');
      menu.open = false;
      menu.querySelector('summary').focus();
    }
    if (event.target.matches('.blog-title-field textarea') && event.key === 'Enter') {
      event.preventDefault();
      root.querySelector('[data-blog-edition="summary"]').focus();
    }
    if (!state.busy && event.target.matches('.blog-block-text') && event.target.closest('.blog-block').querySelector('[data-blog-format]') &&
        (event.ctrlKey || event.metaKey) && ['b', 'i'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      formatBlock(event.target, event.key.toLowerCase() === 'b' ? 'bold' : 'italic');
    }
  });
  root.addEventListener('click', async event => {
    if (event.target.closest('.blog-reading-preview a')) { event.preventDefault(); return; }
    for (const menu of root.querySelectorAll('.blog-menu[open], .blog-block-menu[open]')) {
      if (!menu.contains(event.target)) menu.open = false;
    }
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      if (event.target.closest('[data-blog-back]')) editorFocus = selected;
      if (event.target.closest('[data-blog-open]')) editorFocus = 'heading';
    }
    const target = event.target.closest('button');
    if (!target || state.busy) return;
    const { blogAction: action, blogFilter, blogPanel, blogLocale, blogPlacement, blogRemoveTarget, blogAdd, blogIndex,
      blogPreviewKind, blogPreviewSize, blogFormat, blogMove } = target.dataset;
    const article = current();
    if (blogFilter !== undefined || action === 'reset') {
      status = blogFilter ?? '';
      if (action === 'reset') query = '';
      render();
      root.querySelector(action === 'reset' ? '[data-blog-search]' : `[data-blog-filter="${status}"]`).focus({ preventScroll: true });
      return;
    }
    if (action === 'new' || action === 'duplicate') {
      const next = action === 'new' ? newArticle() : { ...structuredClone(article), id: crypto.randomUUID(), slug: '', status: 'draft', date: '', updated: '', homepage: false };
      (state.document.blog ||= []).push(next);
      query = ''; status = ''; markDirty();
      editorFocus = 'title';
      location.hash = 'blog/' + next.id;
      return;
    }
    if (!article) return;
    if (action === 'prepare-cover') {
      if (!studioMedia.canPrepare(article.cover, article.coverWidth)) return;
      try {
        article.coverWidth = await studioMedia.prepare(article.cover, 'cover');
        markDirty();
        root.querySelector('[data-blog-upload="cover"]').focus();
        target.hidden = true;
        toast(t('Миниатюры готовы. Сохраните черновик.'));
      } catch { /* The upload status already shows the error. */ }
      return;
    }
    if (action === 'jump-cover') {
      const heading = root.querySelector('[data-blog-cover-heading]');
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'center' });
      return;
    }
    if (blogPanel || blogLocale || blogPreviewKind || blogPreviewSize || blogPlacement) {
      if (blogPanel) panel = blogPanel;
      if (blogLocale) locale = blogLocale;
      if (blogPreviewKind) previewKind = blogPreviewKind;
      if (blogPreviewSize) previewSize = blogPreviewSize;
      if (blogPlacement) { targetKey = blogPlacement; targetQuery = ''; targetLimit = pageSize; }
      const attribute = target.getAttributeNames().find(name => name.startsWith('data-blog-'));
      render();
      root.querySelector(`[${attribute}="${target.getAttribute(attribute)}"]`).focus({ preventScroll: true });
      return;
    }
    if (blogRemoveTarget) {
      changeTarget(blogRemoveTarget, false);
      for (const item of root.querySelectorAll('[data-blog-target-change]')) if (item.value === blogRemoveTarget) item.checked = false;
      root.querySelector('[data-blog-target]').focus({ preventScroll: true });
      return;
    }
    if (action === 'more-targets' || action === 'more-matches') {
      const list = root.querySelector(action === 'more-targets' ? '[data-blog-results]' : '[data-blog-match-list]');
      const firstNew = action === 'more-targets' ? targetLimit : matchLimit;
      if (action === 'more-targets') { targetLimit += pageSize; list.innerHTML = targetResults(article); }
      else { matchLimit += pageSize; list.innerHTML = matchedProducts(); }
      const item = action === 'more-targets' ? list.querySelectorAll('input')[firstNew] : list.querySelectorAll('li')[firstNew];
      if (item?.matches('li')) item.tabIndex = -1;
      item?.focus();
      return;
    }
    if (action === 'delete') {
      if (!await confirmMessage(t('Удалить статью?'), t('Статья будет удалена из черновика. Опубликованная страница исчезнет после публикации и сборки сайта.'), t('Удалить'))) return;
      state.document.blog = articles().filter(item => item.id !== selected);
      editorFocus = selected;
      markDirty(); location.hash = 'blog'; return;
    }
    if (action === 'remove-cover') {
      root.querySelector('[data-blog-field="cover"]').value = '';
      root.querySelector('[data-blog-field="cover"]').dispatchEvent(new Event('input', { bubbles: true }));
      root.querySelector('[data-blog-upload="cover"]').focus(); return;
    }
    const blocks = edition().blocks;
    const section = target.closest('[data-blog-block]');
    let index = Number(section?.dataset.blogBlock);
    if (blogFormat) { formatBlock(section.querySelector('.blog-block-text'), blogFormat); return; }
    if (blogAdd) {
      if (blocks.length >= 100) { toast(t('В языковой версии может быть до 100 блоков.'), true); return; }
      index = Number(blogIndex);
      const block = { type: blogAdd, text: '', ...(blogAdd === 'image' ? { url: '', alt: '' } : blogAdd === 'link' ? { url: '' } : {}) };
      editableEdition().blocks.splice(index, 0, block);
    } else if (action === 'remove-block') {
      removedBlock = { locale, index, block: blocks.splice(index, 1)[0] };
    } else if (action === 'undo-block') {
      if (!removedBlock || removedBlock.locale !== locale || blocks.length >= 100) return;
      index = Math.min(removedBlock.index, blocks.length);
      editableEdition().blocks.splice(index, 0, removedBlock.block);
      removedBlock = undefined;
    } else if (blogMove) {
      const next = index + Number(blogMove);
      [blocks[index], blocks[next]] = [blocks[next], blocks[index]];
      index = next;
    } else return;
    const openDetails = [...root.querySelectorAll('.blog-options')].map(details => details.open);
    markDirty(); render();
    root.querySelectorAll('.blog-options').forEach((details, position) => { details.open = openDetails[position]; });
    const next = root.querySelector(`[data-blog-block="${index}"]`);
    (action === 'remove-block' ? root.querySelector('[data-blog-action="undo-block"]') :
      next?.querySelector(blogMove ? `[data-blog-move="${blogMove}"]:not(:disabled)` : '.blog-block-text') ||
      next?.querySelector(blogMove ? '[data-blog-move]:not(:disabled)' : '[data-blog-block-field]'))?.focus();
    if (blogAdd === 'image' || blogAdd === 'link') next?.querySelector(blogAdd === 'image' ? '[data-blog-upload]' : '[data-blog-block-field="url"]').focus();
  });
  return { render };
}
