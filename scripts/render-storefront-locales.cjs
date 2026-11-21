const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('parse5');
const createTranslator = require('../assets/js/global/i18n.js');

const languages = ['ka', 'ru', 'en'];
const localizedAttributes = new Set(['placeholder', 'aria-label', 'aria-roledescription', 'title', 'alt', 'data-count-label', 'data-name', 'data-title', 'content']);
const exactContent = new Set(['product-specs', 'product-highlights', 'product-name']);
const escapeText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = value => escapeText(value).replace(/"/g, '&quot;');
const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;
const parseHTML = html => parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: false });

function* descendants(node) {
  yield node;
  for (const child of node.childNodes || []) yield* descendants(child);
}

function* pages(directory) {
  for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, file.name);
    if (file.isDirectory() && file.name !== 'assets') yield* pages(target);
    else if (file.isFile() && file.name.endsWith('.html')) yield target;
  }
}

function renderStorefrontLocales(destination = path.resolve(__dirname, '../_site'), source = path.resolve(__dirname, '..')) {
  if (fs.existsSync(path.join(destination, 'assets/build-manifest.json'))) return;
  const dictionary = JSON.parse(fs.readFileSync(path.join(source, 'assets/i18n/translations.json'), 'utf8'));
  const studioPath = path.join(source, '_data/studio.json');
  const store = fs.existsSync(studioPath) ? JSON.parse(fs.readFileSync(studioPath, 'utf8')).store : undefined;
  const translators = Object.fromEntries(languages.map(locale => [locale, createTranslator(locale, dictionary, store)]));

  const routes = new Map();
  const groups = new Map();
  for (const file of pages(destination)) {
    const html = fs.readFileSync(file, 'utf8');
    const headEnd = html.indexOf('</head>');
    if (headEnd < 0) continue;
    const nodes = [...descendants(parse(html.slice(0, headEnd + 7)))];
    const locale = attr(nodes.find(node => node.tagName === 'html'), 'data-enka-locale');
    if (!languages.includes(locale)) continue;
    const canonical = nodes.find(node => node.tagName === 'link' && attr(node, 'rel') === 'canonical');
    const url = new URL(attr(canonical, 'href'));
    const relative = path.relative(destination, file).split(path.sep).join('/');
    const route = '/' + relative.replace(/(^|\/)index\.html$/, '$1').replace(/^((?:(?:ru|en)\/)?info\/.+)\.html$/, '$1');
    const base = locale === 'ka' ? url.pathname : url.pathname.slice(locale.length + 1) || '/';
    const noindex = nodes.some(node => node.tagName === 'meta' && attr(node, 'name') === 'robots' && /\bnoindex\b/i.test(attr(node, 'content')));
    routes.set(route, { file, url, base, locale, noindex, canonical: url.pathname === route });
    if (url.pathname === route) {
      if (!groups.has(base)) groups.set(base, {});
      groups.get(base)[locale] = route;
    }
  }
  const linksByLocale = {};
  for (const locale of languages.slice(1)) {
    linksByLocale[locale] = Object.fromEntries([...routes].flatMap(([route, page]) => {
      const target = groups.get(page.base)?.[locale];
      if (page.locale !== 'ka' || !target) return [];
      return route.startsWith('/info/') ? [[route, target], [route + '.html', target]] : [[route, target]];
    }));
  }
  for (const page of routes.values()) {
    const { file, url, base, locale, noindex } = page;
    const html = fs.readFileSync(file, 'utf8');
    const document = parseHTML(html);
    const alternates = groups.get(base);
    const t = translators[locale].t;
    const edits = [];
    const rewriteAttribute = (node, attribute, value) => {
      const start = node.sourceCodeLocation?.attrs?.[attribute.name];
      if (start && attribute.value !== value) edits.push({ ...start, replacement: attribute.name + '="' + escapeAttribute(value) + '"' });
    };

    function visit(node, excluded = false) {
      const tag = node.tagName;
      const location = node.sourceCodeLocation;
      const classes = attr(node, 'class')?.split(/\s+/) || [];
      const skip = excluded || ['script', 'style', 'textarea'].includes(tag) || attr(node, 'translate') === 'no' ||
        classes.includes('notranslate') || classes.some(value => exactContent.has(value)) || attr(node, 'data-catalog-content') !== undefined;
      if (node.nodeName === '#text' && location && !skip && locale !== 'ka') {
        const translated = t(node.value);
        if (translated !== node.value) edits.push({ ...location, replacement: escapeText(translated) });
      }
      if (tag === 'head' && location?.endTag && page.canonical && !noindex &&
          alternates && Object.keys(alternates).length > 1 &&
          !node.childNodes.some(child => child.tagName === 'link' && attr(child, 'hreflang'))) {
        const targets = { ...alternates, 'x-default': alternates.ka };
        const entries = [...languages, 'x-default'].filter(code => targets[code]).map(code => [code, targets[code]]);
        const replacement = entries.map(([code, target]) =>
          '    <link rel="alternate" hreflang="' + code + '" href="' + escapeAttribute(new URL(target, url).href) + '">\n'
        ).join('');
        edits.push({ startOffset: location.endTag.startOffset, endOffset: location.endTag.startOffset, replacement });
      }
      if (tag === 'script' && locale !== 'ka' && node.childNodes[0]?.value?.trimStart().startsWith('window.CATALOG_STRUCTURE =')) {
        const registry = JSON.stringify(linksByLocale[locale]).replace(/</g, '\\u003c');
        edits.push({ startOffset: location.endTag.startOffset, endOffset: location.endTag.startOffset,
          replacement: 'window.ENKA_LOCALIZED_ROUTES = ' + registry + ';\n' });
      }
      for (const attribute of node.attrs || []) {
        const { name, value } = attribute;
        if (tag === 'a' && name === 'href' && attr(node, 'data-language') !== undefined) {
          const code = attr(node, 'data-language');
          rewriteAttribute(node, attribute, alternates?.[code] || value);
        } else if (locale !== 'ka' && (name === 'href' && tag === 'a' || name === 'action' && tag === 'form') && !attr(node, 'hreflang')) {
          if (!/^(?:\/[^/]|\/$|https?:)/i.test(value) || !URL.canParse(value, url)) continue;
          const link = new URL(value, url);
          if (link.origin !== url.origin) continue;
          let target = linksByLocale[locale][link.pathname] || linksByLocale[locale][link.pathname + '/'];
          if (attr(node, 'download') !== undefined && link.pathname === '/assets/documents/withdrawal-form.txt') {
            target = '/assets/documents/withdrawal-form.' + locale + '.txt';
          }
          if (target) rewriteAttribute(node, attribute, target + link.search + link.hash);
        } else if (locale !== 'ka' && localizedAttributes.has(name) && (!skip || tag === 'img' && name === 'alt' && !excluded)) {
          rewriteAttribute(node, attribute, t(value));
        }
      }
      for (const child of node.childNodes || []) visit(child, skip);
    }
    visit(document);
    if (edits.length) {
      let last = 0;
      const parts = [];
      for (const edit of edits.sort((a, b) => a.startOffset - b.startOffset)) {
        parts.push(html.slice(last, edit.startOffset), edit.replacement);
        last = edit.endOffset;
      }
      parts.push(html.slice(last));
      fs.writeFileSync(file, parts.join(''));
    }
  }
  console.log('Rendered ' + [...routes.values()].filter(page => page.locale !== 'ka').length + ' RU/EN HTML pages.');
}

module.exports = { renderStorefrontLocales };
if (require.main === module) renderStorefrontLocales();
