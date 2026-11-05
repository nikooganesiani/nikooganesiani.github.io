(() => {
  'use strict';
  let locale = '';
  try { locale = localStorage.getItem('enka_language') || ''; } catch {}
  if (!locale) {
    try { locale = document.cookie.split('; ').find(v => v.startsWith('enka_language='))?.split('=')[1] || 'ka'; } catch {}
  }
  if (!['ru', 'en'].includes(locale)) locale = 'ka';
  // Saved translations are served from this site's own static assets.
  const dictionary = new Map(Object.entries(window.ENKA_TRANSLATIONS || {}).map(([source, entries]) => [source, entries[locale]]).filter(([, text]) => typeof text === 'string'));
  const fragments = [...dictionary.keys()].filter(source => /[\u10a0-\u10ff]/.test(source) && !/[<>]/.test(source)).sort((a, b) => b.length - a.length);
  const escaped = fragments.map(source => source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const matcher = escaped.length ? new RegExp('(?<![\u10a0-\u10ff])(?:' + escaped.join('|') + ')(?![\u10a0-\u10ff])', 'g') : null;
  const t = (text, exact = false) => {
    text = String(text ?? '');
    if (locale === 'ka') return text;
    if (dictionary.has(text)) return dictionary.get(text);
    if (dictionary.has(text.trim())) return text.replace(text.trim(), dictionary.get(text.trim()));
    return !exact && matcher ? text.replace(matcher, source => dictionary.get(source)) : text;
  };
  window.enkaI18n = { locale, t };
  if (locale === 'ka') return;
  document.documentElement.lang = locale;
  // Catalog content is localized exclusively by the published admin API.
  const excluded = 'script,style,textarea,[translate="no"],.notranslate,[contenteditable="true"],.product-specs,.product-highlights,[data-product-name],.product-description,.product-name,.search-result-name,.modal-product-name,.modal-order-name,#confirmProduct,[data-product-warranty],[data-catalog-content]';
  function translate(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      if (root.parentElement?.closest(excluded)) return;
      const source = root.nodeValue;
      const trimmed = source.trim();
      const exact = Boolean(root.parentElement?.closest('.product-specs,.product-highlights,[data-product-name],.product-description,.product-name'));
      const result = t(trimmed, exact);
      if (result !== trimmed) root.nodeValue = source.replace(trimmed, result);
      return;
    }
    if (root.nodeType !== 1 || root.closest(excluded)) return;
    for (const name of ['placeholder', 'aria-label', 'title', 'alt', 'data-count-label', 'content']) {
      if (root.hasAttribute(name)) {
        const source = root.getAttribute(name);
        const result = t(source);
        if (result !== source) root.setAttribute(name, result);
      }
    }
    for (const child of root.childNodes) translate(child);
  }
  translate(document.head);
  translate(document.body);
  const download = document.querySelector?.('[download][href$="withdrawal-form.txt"]');
  if (download) download.href = download.href.replace('withdrawal-form.txt', 'withdrawal-form.' + locale + '.txt');
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(translate);
      else translate(record.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder','aria-label','title','alt','data-count-label'] });
})();
