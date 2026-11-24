((createTranslator) => {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = createTranslator;
    return;
  }
  const pageLocale = document.documentElement.dataset?.enkaLocale;
  let locale = pageLocale || '';
  if (!locale) try { locale = localStorage.getItem('enka_language') || ''; } catch {}
  if (!locale) {
    try { locale = document.cookie.split('; ').find(v => v.startsWith('enka_language='))?.split('=')[1] || document.documentElement.dataset?.blogLocale || 'ka'; } catch {}
  }
  if (!['ru', 'en'].includes(locale)) locale = 'ka';
  let translator;
  let store = window.ENKA_STORE;
  let active = true;
  const textSources = new WeakMap(); const attributeSources = new WeakMap();
  function configure(store) { translator = createTranslator(locale, window.ENKA_TRANSLATIONS, store); }
  configure(window.ENKA_STORE);
  const t = (value, exact = false) => translator.t(value, exact);
  window.enkaRoute = value => {
    if (locale === 'ka' || typeof value !== 'string' || !/^(?:\/[^/]|\/$|https?:)/.test(value)) return value;
    let url;
    try { url = new URL(value, location.origin); } catch { return value; }
    if (url.origin !== location.origin) return value;
    const routes = window.ENKA_LOCALIZED_ROUTES || {};
    const target = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : routes[url.pathname + '/'];
    return target ? target + url.search + url.hash : value;
  };
  window.enkaI18n = {locale,t,setStore(value){
    store = value;
    const previous = active;
    configure(store);
    active = previous || translator.size > 0 || locale !== 'ka';
    translate(document.head); translate(document.body);
    active = translator.size > 0 || locale !== 'ka';
  }};
  if(locale !== 'ka')document.documentElement.lang=locale;
  // Catalog content is localized exclusively by the published admin API.
  const excluded = 'script,style,textarea,[translate="no"],.notranslate,[contenteditable="true"],.product-specs,.product-highlights,[data-product-name],.product-description,.product-name,.search-result-name,.modal-product-name,.modal-order-name,#confirmProduct,[data-product-warranty],[data-catalog-content]';
  function translate(root) {
    if (!root || !active) return;
    if (root.nodeType === 3) {
      if (root.parentElement?.closest(excluded)) return;
      const previous = textSources.get(root);
      const source = previous && root.nodeValue === previous.rendered ? previous.source : root.nodeValue;
      const trimmed = source.trim();
      const exact = Boolean(root.parentElement?.closest('.product-specs,.product-highlights,[data-product-name],.product-description,.product-name'));
      const result = t(trimmed, exact);
      const rendered = source.replace(trimmed, result);
      textSources.set(root, {source, rendered});
      if (rendered !== root.nodeValue) root.nodeValue = rendered;
      return;
    }
    if (root.nodeType !== 1) return;
    for (const name of ['href', 'action']) {
      if (root.hasAttribute(name) && !root.hasAttribute('hreflang') && !root.hasAttribute('data-language')) {
        const value = root.getAttribute(name);
        const routed = window.enkaRoute(value);
        if (routed !== value) root.setAttribute(name, routed);
      }
    }
    if (root.closest(excluded)) return;
    for (const name of ['placeholder', 'aria-label', 'title', 'alt', 'data-count-label', 'aria-roledescription', 'content']) {
      if (root.hasAttribute(name)) {
        const saved = attributeSources.get(root) || {};
        const previous = saved[name];
        const current = root.getAttribute(name);
        const source = previous && current === previous.rendered ? previous.source : current;
        const result = t(source);
        saved[name] = {source, rendered:result}; attributeSources.set(root, saved);
        if (result !== current) root.setAttribute(name, result);
      }
    }
    for (const child of root.childNodes) translate(child);
  }
  active = translator.size > 0 || locale !== 'ka';
  function applyTranslations() { configure(store); translate(document.head); translate(document.body); }
  if (locale !== 'ka' && !window.ENKA_TRANSLATIONS && window.ENKA_I18N_URLS?.[locale]) {
    // The selected language was preloaded in head. Georgian never downloads or
    // parses an editorial translation dictionary.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const ready = fetch(window.ENKA_I18N_URLS[locale], { signal: controller.signal }).then(response => {
      if (!response.ok) throw Error('Translation HTTP ' + response.status);
      return response.json();
    }).then(data => { window.ENKA_TRANSLATIONS = data; applyTranslations(); }).catch(() => {}).finally(() => clearTimeout(timer));
    window.enkaI18n.ready = ready;
  } else {
    translate(document.head);
    translate(document.body);
    window.enkaI18n.ready = Promise.resolve();
  }
  const download = document.querySelector?.('[download][href$="withdrawal-form.txt"]');
  if (download && locale !== 'ka') download.href = download.href.replace('withdrawal-form.txt', 'withdrawal-form.' + locale + '.txt');
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(translate);
      else translate(record.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href','action','placeholder','aria-label','title','alt','data-count-label','aria-roledescription'] });
})((locale, dictionary, store) => {
  const values = new Map();
  const set = (source, entries) => {
    const value = entries?.[locale];
    if (source && typeof value === 'string' && value.trim()) values.set(source, value);
  };
  if (locale !== 'ka') for (const [source, entries] of Object.entries(dictionary || {})) set(source, entries);
  for (const [source, entries] of Object.entries(store?.strings || {})) set(source, entries);
  if (locale !== 'ka') {
    const titles = [
      ...(store?.categories || []).flatMap(category => [category.title, ...category.subs.map(sub => sub.title)]),
      ...(store?.campaigns || []).map(campaign => campaign.title),
      ...(store?.heroes || []).map(hero => hero.title)
    ];
    for (const title of titles) set(title?.ka, title);
  }
  const fragments = [...values.keys()].filter(source => /[\u10a0-\u10ff]/.test(source) && !/[<>]/.test(source)).sort((a, b) => b.length - a.length);
  const escaped = fragments.map(source => source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const matcher = escaped.length ? new RegExp('(?<![\\u10a0-\\u10ff])(?:' + escaped.join('|') + ')(?![\\u10a0-\\u10ff])', 'g') : null;
  return {
    size: values.size,
    t(value, exact = false) {
      const text = String(value ?? '');
      if (values.has(text)) return values.get(text);
      const trimmed = text.trim();
      if (values.has(trimmed)) return text.replace(trimmed, () => values.get(trimmed));
      return !exact && matcher && /[\u10a0-\u10ff]/.test(text) ? text.replace(matcher, source => values.get(source)) : text;
    }
  };
});
