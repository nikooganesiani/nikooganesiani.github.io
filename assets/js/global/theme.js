(() => {
  'use strict';
  const key = 'enka_theme';
  const root = document.documentElement;
  let theme = 'light';
  let storage;
  try {
    storage = window.localStorage;
    if (storage.getItem(key) === 'dark') theme = 'dark';
  } catch {}

  function apply(value) {
    theme = value === 'dark' ? 'dark' : 'light';
    root.dataset.theme = theme;
    const toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) toggle.checked = theme === 'dark';
    const chrome = document.querySelector('meta[name="theme-color"]');
    if (chrome) chrome.content = theme === 'dark' ? '#101720' : '#155dfc';
  }

  // This file deliberately runs before the stylesheet, without defer.
  apply(theme);
  document.addEventListener('DOMContentLoaded', () => {
    apply(theme);
    const toggle = document.querySelector('[data-theme-toggle]');
    if (!toggle) return;
    toggle.addEventListener('change', () => {
      apply(toggle.checked ? 'dark' : 'light');
      try { storage?.setItem(key, theme); } catch {}
    });
  }, { once: true });
  window.addEventListener('storage', event => {
    if ((event.key === key || event.key === null) && event.storageArea === storage) apply(event.newValue);
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    try { if (storage) apply(storage.getItem(key)); } catch {}
  });
})();
