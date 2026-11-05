(() => {
  'use strict';
  const pickers = [...document.querySelectorAll('[data-language-picker]')];
  if (!pickers.length) return;
  const buttons = [...document.querySelectorAll('[data-language]')];
  const languages = new Map(buttons.map(button => [button.dataset.language, button]));
  const engine = document.getElementById('site-translation-engine');
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
    return 'ka';
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
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.language === code));
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
    if (!['ka', 'ru', 'en'].includes(code) && window.enkaI18n?.locale !== undefined && window.enkaI18n.locale !== 'ka') {
      clearGoogleChoice();
      saveChoice(code);
      location.reload();
      return;
    }
    if (['ka', 'ru', 'en'].includes(code) && window.enkaI18n) {
      clearGoogleChoice();
      saveChoice(code);
      if (applied !== 'ka' || window.enkaI18n.locale !== code) { location.reload(); return; }
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
  for (const button of buttons) button.addEventListener('click', () => {
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
  if (window.enkaI18n && ['ka', 'ru', 'en'].includes(saved)) { clearGoogleChoice(); sync(saved); }
  else if (saved !== 'ka') choose(saved);
})();
