(() => {
  'use strict';
  const pickers = [...document.querySelectorAll('[data-language-picker]')];
  if (!pickers.length) return;
  const buttons = [...document.querySelectorAll('[data-language]')];
  const languages = new Map(buttons.map(button => [button.dataset.language, button]));
  const engine = document.getElementById('site-translation-engine');
  const pageLocale = document.documentElement.dataset?.enkaLocale;
  const native = ['ka', 'ru', 'en'];
  const storageKey = 'enka_language';
  let requested = 'ka';
  let applied = 'ka';
  let revision = 0;
  let enginePromise;
  let engineCreated = false;
  let translationObserver;
  let translationTimer;

  function readChoice() {
    try {
      const stored = localStorage.getItem(storageKey);
      if (languages.has(stored)) return stored;
    } catch {}
    try {
      const cookie = document.cookie.split('; ').find(value => value.startsWith(storageKey + '='));
      if (languages.has(cookie?.split('=')[1])) return cookie.split('=')[1];
    } catch {}
    return document.documentElement.dataset?.blogLocale || 'ka';
  }

  function saveChoice(code) {
    try { localStorage.setItem(storageKey, code); } catch {}
    try { document.cookie = storageKey + '=' + code + '; Path=/; Max-Age=31536000; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch {}
  }

  function status(message = '', retry = false) {
    for (const picker of pickers) {
      const output = picker.querySelector('[data-language-status]');
      output.textContent = message;
      output.hidden = !message;
      picker.querySelector('[data-language-retry]').hidden = !retry;
      picker.setAttribute('aria-busy', String(Boolean(message) && !retry));
    }
  }

  function sync(code) {
    const language = languages.get(code);
    const flag = language.querySelector('img');
    for (const button of buttons) {
      const selected = button.dataset.language === code;
      if (button.tagName === 'A') {
        if (selected) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      } else button.setAttribute('aria-pressed', String(selected));
    }
    for (const picker of pickers) {
      const summary = picker.querySelector('.language-trigger');
      picker.querySelector('[data-language-flag]').src = flag.getAttribute('src');
      picker.querySelector('[data-language-code]').textContent = code.toUpperCase();
      const attribution = picker.querySelector('.language-attribution');
      if (attribution) attribution.hidden = ['ka', 'ru', 'en'].includes(code);
      summary.setAttribute('aria-label', ({ru:'Язык',en:'Language',ka:'ენა'}[code] || 'Language') + ': ' + language.querySelector('[dir]').textContent);
    }
    document.documentElement.lang = code === 'iw' ? 'he' : code;
    document.documentElement.dir = ['ar', 'iw', 'fa', 'ur'].includes(code) ? 'rtl' : 'ltr';
  }

  function clearTranslationWatch() {
    translationObserver?.disconnect();
    clearTimeout(translationTimer);
  }

  function watchTranslation(code, current) {
    if (code === 'ka') { status(); return; }
    const check = () => {
      if (current !== revision) { clearTranslationWatch(); return; }
      if (document.documentElement.classList.contains('translated-ltr') || document.documentElement.classList.contains('translated-rtl')) {
        clearTranslationWatch();
        status();
      }
    };
    translationObserver = new MutationObserver(check);
    translationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    translationTimer = setTimeout(() => {
      clearTranslationWatch();
      if (current === revision) status('Translation is unavailable. Please try again.', true);
    }, 30000);
    check();
  }

  function clearGoogleChoice() {
    // Remove only Google's language preference, including a cookie on a parent
    // domain. This also cancels automatic restoration during a pending load.
    try {
      const expiry = 'googtrans=; Path=/; Max-Age=0; SameSite=Lax';
      document.cookie = expiry;
      const parts = location.hostname.split('.');
      for (let index = 0; index < parts.length - 1; index++) document.cookie = expiry + '; Domain=.' + parts.slice(index).join('.');
    } catch {}
  }

  // Load only after a visitor chooses translation. No proxy, keys or paid API.
  function loadEngine() {
    const ready = engine.querySelector('select.goog-te-combo');
    if (ready?.options.length > 1) return Promise.resolve(ready);
    if (enginePromise) return enginePromise;
    enginePromise = new Promise((resolve, reject) => {
      let script;
      const finish = error => {
        clearTimeout(timeout);
        observer.disconnect();
        if (error) {
          script?.remove();
          reject(error);
        } else resolve(engine.querySelector('select.goog-te-combo'));
      };
      const check = () => { if (engine.querySelector('select.goog-te-combo')?.options.length > 1) finish(); };
      const observer = new MutationObserver(check);
      const timeout = setTimeout(() => finish(new Error('Translation service timed out')), 20000);
      observer.observe(engine, { childList: true, subtree: true });
      window.enkaTranslationReady = () => {
        try {
          if (!engineCreated) {
            new window.google.translate.TranslateElement({
              pageLanguage: 'ka',
              includedLanguages: [...languages.keys()].filter(code => !['ru', 'en'].includes(code)).join(','),
              autoDisplay: false,
              multilanguagePage: true
            }, engine.id);
            engineCreated = true;
          }
          check();
        } catch (error) { finish(error); }
      };
      if (window.google?.translate?.TranslateElement) window.enkaTranslationReady();
      else {
        script = document.createElement('script');
        script.src = 'https://translate.google.com/translate_a/element.js?cb=enkaTranslationReady';
        script.async = true;
        script.onerror = () => finish(new Error('Translation service unavailable'));
        document.head.append(script);
      }
    }).catch(error => { enginePromise = null; throw error; });
    return enginePromise;
  }

  async function choose(code) {
    if (!languages.has(code)) return;
    requested = code;
    const current = ++revision;
    clearTranslationWatch();
    if (pageLocale && pageLocale !== 'ka' && !native.includes(code)) {
      clearGoogleChoice();
      saveChoice(code);
      const target = new URL(languages.get('ka').href);
      target.search = location.search;
      target.hash = location.hash;
      location.assign(target.href);
      return;
    }
    if (!['ka', 'ru', 'en'].includes(code) && window.enkaI18n?.locale !== undefined && window.enkaI18n.locale !== 'ka') {
      clearGoogleChoice();
      saveChoice(code);
      if (window.EnkaPageTransition) window.EnkaPageTransition.reload();
      else location.reload();
      return;
    }
    if (['ka', 'ru', 'en'].includes(code) && window.enkaI18n) {
      clearGoogleChoice();
      saveChoice(code);
      const alternate = document.querySelector?.(`link[data-blog-alternate][hreflang="${code}"]`);
      const alternatePath = alternate && new URL(alternate.href).pathname;
      if (alternatePath && alternatePath !== location.pathname) {
        location.assign(alternatePath);
        return;
      }
      if (applied !== 'ka' || window.enkaI18n.locale !== code) {
        if (window.EnkaPageTransition) window.EnkaPageTransition.reload();
        else location.reload();
        return;
      }
      sync(code);
      status();
      return;
    }
    if (code === 'ka') clearGoogleChoice();
    // Returning to the original while a script is loading cancels its pending choice.
    if (code === 'ka' && applied === 'ka') {
      saveChoice(code);
      sync(code);
      status();
      return;
    }
    status('Translating…');
    try {
      const combo = await loadEngine();
      if (current !== revision) return;
      if (![...combo.options].some(option => option.value === code)) throw new Error('Language unavailable');
      combo.value = code;
      combo.dispatchEvent(new Event('change', { bubbles: true }));
      applied = code;
      saveChoice(code);
      sync(code);
      watchTranslation(code, current);
    } catch {
      if (current !== revision) return;
      status('Translation is unavailable. Please try again.', true);
    }
  }

  const displayNames = [];
  if (typeof Intl.DisplayNames === 'function') {
    for (const locale of ['ka', 'en', 'ru']) displayNames.push(new Intl.DisplayNames([locale], { type: 'language' }));
  }
  for (const picker of pickers) {
    const summary = picker.querySelector('.language-trigger');
    picker.addEventListener('toggle', () => {
      summary.setAttribute('aria-expanded', String(picker.open));
      if (picker.open) for (const other of pickers) { if (other !== picker) other.open = false; }
    });
    summary.setAttribute('aria-expanded', 'false');
    picker.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); picker.open = false; summary.focus(); }
    });
    picker.querySelector('[data-language-search]').addEventListener('input', event => {
      const query = event.target.value.trim().toLocaleLowerCase();
      let count = 0;
      for (const button of picker.querySelectorAll('.language-list [data-language]')) {
        const code = button.dataset.language;
        const names = displayNames.map(names => names.of(code === 'iw' ? 'he' : code));
        button.hidden = ![button.textContent, ...names].join(' ').toLocaleLowerCase().includes(query);
        if (!button.hidden) count++;
      }
      picker.querySelector('.language-empty').hidden = count > 0;
    });
    picker.querySelector('[data-language-retry]').addEventListener('click', () => choose(requested));
  }
  for (const button of buttons) button.addEventListener('click', event => {
    if (pageLocale && button.tagName === 'A') {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (pageLocale === 'ka' && button.dataset.language === 'ka' && (!native.includes(applied) || !native.includes(requested))) {
        event.preventDefault();
        choose('ka');
        return;
      }
      clearGoogleChoice();
      saveChoice(button.dataset.language);
      const target = new URL(button.href);
      const basePath = pathname => pathname.replace(/^\/(?:ru|en)(?=\/)/, '').replace(/\.html$/, '');
      const samePage = basePath(target.pathname) === basePath(location.pathname);
      if (samePage) {
        target.search = location.search;
        if (pageLocale !== button.dataset.language && target.searchParams.has('spec')) target.searchParams.delete('spec');
        target.hash = location.hash;
        button.href = target.href;
      }
      return;
    }
    choose(button.dataset.language);
    const picker = button.closest('[data-language-picker]');
    picker.open = false;
    picker.querySelector('.language-trigger').focus({ preventScroll: true });
  });
  document.addEventListener('click', event => {
    for (const picker of pickers) if (!picker.contains(event.target)) picker.open = false;
  });
  document.addEventListener('focusin', event => {
    for (const picker of pickers) if (!picker.contains(event.target)) picker.open = false;
  });
  // Native locales use the editorial dictionary and published catalog translations.
  // Other languages start from the Georgian page and load Google on demand.
  const saved = readChoice();
  if (pageLocale && (pageLocale !== 'ka' || native.includes(saved))) { clearGoogleChoice(); sync(pageLocale); }
  else if (window.enkaI18n && native.includes(saved)) { clearGoogleChoice(); sync(saved); }
  else if (saved !== 'ka') choose(saved);
})();
