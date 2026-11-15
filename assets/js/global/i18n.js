(() => {
  'use strict';
  let locale = '';
  try { locale = localStorage.getItem('enka_language') || ''; } catch {}
  if (!locale) {
    try { locale = document.cookie.split('; ').find(v => v.startsWith('enka_language='))?.split('=')[1] || 'ka'; } catch {}
  }
  if (!['ru', 'en'].includes(locale)) locale = 'ka';
  let dictionary; let matcher;
  const textSources = new WeakMap(); const attributeSources = new WeakMap();
  function configure(store) {
    const values = Object.fromEntries(Object.entries(window.ENKA_TRANSLATIONS || {}).map(([source,entries])=>[source,{...entries}]));
    for(const [source,entries] of Object.entries(store?.strings || {})) {
      const merged={...(Object.hasOwn(values,source)?values[source]:{})};
      for(const [locale,value] of Object.entries(entries))if(value.trim())merged[locale]=value;
      Object.defineProperty(values,source,{value:merged,enumerable:true,configurable:true,writable:true});
    }
    const titles=[...(store?.categories || []).flatMap(c=>[c.title,...c.subs.map(s=>s.title)]),...(store?.campaigns || []).map(c=>c.title),...(store?.heroes || []).map(h=>h.title)];
    for(const title of titles)if(title.ka){
      const entries={...(Object.hasOwn(values,title.ka)?values[title.ka]:{})};
      for(const key of ['ru','en'])if(title[key]?.trim())entries[key]=title[key];
      Object.defineProperty(values,title.ka,{value:entries,enumerable:true,configurable:true,writable:true});
    }
    dictionary = new Map(Object.entries(values).map(([source, entries]) => [source, entries[locale]]).filter(([, text]) => typeof text === 'string' && text.trim()));
    const fragments = [...dictionary.keys()].filter(source => /[\u10a0-\u10ff]/.test(source) && !/[<>]/.test(source)).sort((a,b)=>b.length-a.length);
    const escaped = fragments.map(source => source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    matcher = escaped.length ? new RegExp('(?<![\\u10a0-\\u10ff])(?:'+escaped.join('|')+')(?![\\u10a0-\\u10ff])','g') : null;
  }
  configure(window.ENKA_STORE);
  const t = (value, exact=false) => {
    const text=String(value ?? '');
    if(dictionary.has(text))return dictionary.get(text);
    if(dictionary.has(text.trim()))return text.replace(text.trim(),dictionary.get(text.trim()));
    return !exact && matcher ? text.replace(matcher,source=>dictionary.get(source)) : text;
  };
  window.enkaI18n = {locale,t,setStore(store){ configure(store); translate(document.head); translate(document.body); }};
  if(locale !== 'ka')document.documentElement.lang=locale;
  // Catalog content is localized exclusively by the published admin API.
  const excluded = 'script,style,textarea,[translate="no"],.notranslate,[contenteditable="true"],.product-specs,.product-highlights,[data-product-name],.product-description,.product-name,.search-result-name,.modal-product-name,.modal-order-name,#confirmProduct,[data-product-warranty],[data-catalog-content]';
  function translate(root) {
    if (!root) return;
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
    if (root.nodeType !== 1 || root.closest(excluded)) return;
    for (const name of ['placeholder', 'aria-label', 'title', 'alt', 'data-count-label', 'content']) {
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
  translate(document.head);
  translate(document.body);
  const download = document.querySelector?.('[download][href$="withdrawal-form.txt"]');
  if (download && locale !== 'ka') download.href = download.href.replace('withdrawal-form.txt', 'withdrawal-form.' + locale + '.txt');
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(translate);
      else translate(record.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder','aria-label','title','alt','data-count-label'] });
})();
