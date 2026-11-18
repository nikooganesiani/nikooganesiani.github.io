import './store-engine.js';

const engine = globalThis.EnkaStoreEngine;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit) => typeof value === 'string' && value.length <= limit;
export const escapeBlog = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
export const blogLocales = ['ka', 'ru', 'en'];
export const placementKeys = ['productIds', 'brands', 'subcategoryIds', 'categoryIds', 'excludeIds'];
export const blockTypes = ['paragraph', 'heading', 'subheading', 'list', 'numbered', 'quote', 'image', 'link'];
export const brandKey = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export const blogPath = (locale = 'ka', slug = '') => (locale === 'ka' ? '' : '/' + locale) + '/blog/' + (slug ? slug + '/' : '');
export const emptyEdition = () => ({ enabled: false, title: '', summary: '', seoTitle: '', seoDescription: '', coverAlt: '', blocks: [] });
export const validSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100
  && !/^(?:index|aux|con|prn|nul|com[0-9]|lpt[0-9])$/.test(value);
export const blogImage = value => engine.safeImage(value) && (/^https:\/\//i.test(value) || /^\/(?:img\/|media\/)/.test(value));
export const authorLink = value => engine.safeLink(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function newArticle() {
  return {
    id: crypto.randomUUID(), slug: '', status: 'draft', date: '', updated: '', author: '', cover: '',
    homepage: false, rank: 0,
    placements: Object.fromEntries(placementKeys.map(key => [key, []])),
    editions: Object.fromEntries(blogLocales.map(locale => [locale, emptyEdition()]))
  };
}

export function articleMatches(article, product) {
  const targets = article.placements;
  if (targets.excludeIds.includes(product.id)) return false;
  return targets.productIds.includes(product.id) || targets.brands.includes(brandKey(product.brand))
    || product.subcategories?.some(id => targets.subcategoryIds.includes(id))
    || product.categories?.some(id => targets.categoryIds.includes(id)) || false;
}

export function validateBlog(articles, publishing = false) {
  if (articles === undefined) return [];
  if (!Array.isArray(articles) || articles.length > 500) return ['Блог: требуется список из максимум 500 статей.'];
  const errors = [];
  const ids = new Set();
  const slugs = new Set();
  for (const article of articles) {
    const title = article?.editions?.ka?.title;
    const name = text(title, 200) && title.trim() || text(article?.slug, 100) && article.slug || 'Новая статья';
    const report = message => errors.push(`Блог · ${name}: ${message}`);
    if (!object(article) || typeof article.id !== 'string' || !/^[a-f0-9-]{36}$/.test(article.id)) {
      report('неверный ID статьи.');
      continue;
    }
    if (ids.has(article.id)) report('повторяющийся ID статьи.');
    ids.add(article.id);
    if (article.slug !== '' && (!validSlug(article.slug) || slugs.has(article.slug))) report('укажите уникальный адрес из латиницы, цифр и дефисов.');
    if (article.slug) slugs.add(article.slug);
    const live = publishing && article.status === 'published';
    if (!['draft', 'published', 'archived'].includes(article.status)) report('неизвестный статус статьи.');
    if ((live || article.date !== '') && !validDate(article.date)) report('укажите дату публикации.');
    if (article.updated !== '' && (!validDate(article.updated) || article.updated < article.date)) report('дата обновления должна быть не раньше даты публикации.');
    if (!text(article.author, 150) || (article.cover !== '' && !blogImage(article.cover))) report('проверьте автора и ссылку на обложку.');
    if (typeof article.homepage !== 'boolean' || !Number.isInteger(article.rank) || article.rank < 0 || article.rank > 9999) report('приоритет показа должен быть от 0 до 9999.');
    if (!object(article.placements) || placementKeys.some(key => !Array.isArray(article.placements[key]) ||
      article.placements[key].length > 2000 || article.placements[key].some(value => !text(value, 300) || !value.trim()))) report('проверьте привязки к каталогу.');
    if (live && !article.slug) report('укажите адрес статьи.');
    if (!object(article.editions) || !object(article.editions.ka)) { report('отсутствует грузинская версия.'); continue; }
    if (Object.keys(article.editions).some(locale => !blogLocales.includes(locale))) report('проверьте языковые версии.');
    for (const locale of blogLocales) {
      const edition = article.editions[locale];
      if (edition === undefined) continue;
      const required = live && (locale === 'ka' || edition?.enabled);
      if (!object(edition) || typeof edition.enabled !== 'boolean' ||
        !text(edition.title, 200) || !text(edition.summary, 500) || !text(edition.seoTitle, 200) ||
        !text(edition.seoDescription, 500) || !text(edition.coverAlt, 300) || !Array.isArray(edition.blocks) || edition.blocks.length > 100) {
        report(`${locale.toUpperCase()} — проверьте поля и количество блоков (до 100).`);
        continue;
      }
      if (required && (!edition.title.trim() || !edition.summary.trim() ||
        !edition.blocks.some(block => ['paragraph', 'list', 'numbered', 'quote'].includes(block?.type) && typeof block.text === 'string' && block.text.trim())))
        report(`${locale.toUpperCase()} — заполните заголовок, краткое описание и текст.`);
      for (const [index, block] of edition.blocks.entries()) {
        if (!object(block) || !blockTypes.includes(block.type) || !text(block.text, 12000) ||
          (block.type === 'image' && (!text(block.alt, 300) || (block.url !== '' && !blogImage(block.url)))) ||
          (block.type === 'link' && block.url !== '' && !authorLink(block.url))) {
          report(`${locale.toUpperCase()} — проверьте содержимое блока №${index + 1}.`);
          continue;
        }
        if (required && (block.type === 'image' ? !block.url || !block.alt.trim()
          : !block.text.trim() || (block.type === 'link' && !block.url)))
          report(`${locale.toUpperCase()} — заполните блок №${index + 1}.`);
      }
    }
  }
  return errors;
}

export function publishedArticles(articles = []) {
  return articles.filter(article => article.status === 'published').map(article => {
    const { id, slug, status, date, updated, author, cover, homepage, rank, placements } = article;
    const editions = Object.fromEntries(blogLocales.filter(locale => locale === 'ka' || article.editions[locale]?.enabled).map(locale => {
      const { enabled, title, summary, seoTitle, seoDescription, coverAlt, blocks } = article.editions[locale];
      return [locale, { enabled, title, summary, seoTitle, seoDescription, coverAlt, blocks: blocks.map(({ type, text, url, alt }) => ({ type, text, url, alt })) }];
    }));
    return { id, slug, status, date, updated, author, cover, homepage, rank, placements: Object.fromEntries(placementKeys.map(key => [key, placements[key]])), editions };
  });
}

const emphasis = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
const sectionId = index => 'section-' + (index + 1);

export function blogSections(blocks) {
  return blocks.flatMap((block, index) => block.type === 'heading'
    ? [{ id: sectionId(index), text: block.text.replace(emphasis, '$1$2').trim() }] : []);
}

function inline(value) {
  return escapeBlog(value).replace(emphasis,
    (_, bold, italic) => bold ? '<strong>' + bold + '</strong>' : '<em>' + italic + '</em>');
}

export function renderBlogBlocks(blocks) {
  return blocks.map((block, index) => {
    const content = inline(block.text);
    if (block.type === 'heading') return '<h2 id="' + sectionId(index) + '">' + content + '</h2>';
    if (block.type === 'subheading') return '<h3>' + content + '</h3>';
    if (block.type === 'quote') return '<blockquote>' + content + '</blockquote>';
    if (block.type === 'image') return blogImage(block.url) ? `<figure><img src="${escapeBlog(block.url)}" alt="${escapeBlog(block.alt)}" loading="lazy" decoding="async">${content ? '<figcaption>' + content + '</figcaption>' : ''}</figure>` : '';
    if (block.type === 'link') return authorLink(block.url) ? `<p><a href="${escapeBlog(block.url)}">${content}</a></p>` : '';
    if (block.type === 'list' || block.type === 'numbered') {
      const tag = block.type === 'list' ? 'ul' : 'ol';
      return `<${tag}>${block.text.split('\n').filter(line => line.trim()).map(line => '<li>' + inline(line) + '</li>').join('')}</${tag}>`;
    }
    return '<p>' + content.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');
}
