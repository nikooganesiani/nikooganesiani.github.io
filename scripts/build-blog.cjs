const fs = require('node:fs');
const path = require('node:path');

const archiveText = {
  ka: { title: 'ბლოგი', description: 'ტექნიკის შერჩევის გზამკვლევები და პრაქტიკული რჩევები ENKA Electronics-ისგან.' },
  ru: { title: 'Блог', description: 'Руководства по выбору техники и практические советы от ENKA Electronics.' },
  en: { title: 'Blog', description: 'Electronics buying guides and practical advice from ENKA Electronics.' }
};

async function buildBlog(articles, products, root) {
  const { articleMatches, blogLocales, blogPath, blogSections, publishedArticles, renderBlogBlocks, validateBlog } = await import('../admin/public/blog-model.js');
  const errors = validateBlog(articles, true);
  if (errors.length) throw new Error('Invalid published blog: ' + errors.join('; '));
  const published = publishedArticles(articles).sort((a, b) => b.rank - a.rank || b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  const directory = path.join(root, '_pages/generated-blog');
  const current = new Set();
  const pages = {};
  const cards = {};
  const byProduct = Object.create(null);
  if (published.length) fs.mkdirSync(directory, { recursive: true });
  const makePage = (file, metadata) => {
    current.add(file);
    fs.writeFileSync(path.join(directory, file), '---\ngenerated: true\n' +
      Object.entries(metadata).map(([key, value]) => key + ': ' + JSON.stringify(value)).join('\n') + '\n---\n');
  };
  const alternatePaths = (locales, slug) => Object.fromEntries(locales.map(locale => [locale, blogPath(locale, slug)]));
  for (const article of published) {
    const { slug, cover, date, author, updated } = article;
    const locales = blogLocales.filter(locale => article.editions[locale]);
    const alternates = alternatePaths(locales, slug);
    const matches = products.filter(product => articleMatches(article, product));
    const relatedProducts = matches.slice(0, 6).map(({ id, name, images }) => ({ id, name, image: images?.[0] }));
    cards[slug] = { cover, date, editions: {} };
    for (const locale of locales) {
      const edition = article.editions[locale];
      const key = locale + '-' + slug;
      const url = alternates[locale];
      cards[slug].editions[locale] = { title: edition.title, summary: edition.summary, url };
      pages[key] = { ...cards[slug].editions[locale], cover, coverAlt: edition.coverAlt, date, updated, author,
        html: renderBlogBlocks(edition.blocks), toc: blogSections(edition.blocks), products: relatedProducts };
      makePage(key + '.html', {
        layout: 'blog-article', permalink: url, blog_id: key, blog_locale: locale, blog_alternates: alternates,
        blog_title: edition.title, title: edition.seoTitle.trim() || edition.title,
        description: edition.seoDescription.trim() || edition.summary, blog_cover: cover, blog_cover_alt: edition.coverAlt,
        blog_date: date, blog_updated: updated, blog_author: author, last_modified_at: updated || date
      });
    }
    for (const { id } of matches) (byProduct[id] ||= []).push(slug);
  }
  if (published.length) {
    const alternates = alternatePaths(blogLocales);
    for (const locale of blogLocales) makePage(locale + '-index.html', {
      layout: 'blog-index', permalink: alternates[locale], blog_locale: locale, blog_alternates: alternates, ...archiveText[locale]
    });
  }
  if (fs.existsSync(directory)) {
    for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, file.name);
      if (file.isFile() && file.name.endsWith('.html') && !current.has(file.name) &&
        fs.readFileSync(target, 'utf8').startsWith('---\ngenerated: true\n')) fs.unlinkSync(target);
    }
  }
  const data = {
    cards, pages, products: byProduct,
    archive: published.map(article => article.slug),
    homepage: published.filter(article => article.homepage).slice(0, 3).map(article => article.slug)
  };
  const dataDirectory = path.join(root, '_data');
  if (fs.existsSync(dataDirectory)) fs.writeFileSync(path.join(dataDirectory, 'blog.json'), JSON.stringify(data));
  return data;
}

module.exports = { buildBlog };
