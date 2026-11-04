(() => {
  'use strict';
  const KEY = 'enka_privacy_v1';
  const TTL = 180 * 86400000;
  const analyticsKeys = ['_fbp', '_fbc', '_capi_uid', '_capi_last_user', '_capi_recent_purchases'];
  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      if (typeof value?.analytics === 'boolean' && Number.isFinite(value.updatedAt) && value.updatedAt <= Date.now() && Date.now() - value.updatedAt < TTL) return value;
    } catch { /* A blocked store must not enable analytics. */ }
    return null;
  }
  function purgeAnalytics() {
    const host = location.hostname;
    const parts = host.split('.');
    const domains = new Set(['']);
    // Delete both host-only and legacy parent-domain cookies.
    if (host !== 'localhost' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      domains.add(host);
      domains.add('.' + host);
      const parent = host.endsWith('.com.ge') ? parts.slice(-3) : parts.slice(-2);
      if (parent.length >= 2) domains.add('.' + parent.join('.'));
    }
    for (const key of analyticsKeys) {
      try { localStorage.removeItem(key); } catch { /* Storage is optional. */ }
      for (const domain of domains) {
        try { document.cookie = key + '=; Path=/; Max-Age=0; SameSite=Lax' + (domain ? '; Domain=' + domain : '') + (location.protocol === 'https:' ? '; Secure' : ''); } catch { /* Cookies may be blocked. */ }
      }
    }
  }
  let record = read();
  function getChoice() {
    if (record && Date.now() - record.updatedAt >= TTL) { record = null; purgeAnalytics(); announce(); }
    return record?.analytics ?? null;
  }
  function announce() {
    window.dispatchEvent(new CustomEvent('enka:privacy-change', { detail: { analytics: getChoice() } }));
  }
  window.enkaPrivacy = Object.freeze({
    getChoice,
    allowsAnalytics: () => getChoice() === true,
    setChoice(analytics) {
      if (typeof analytics !== 'boolean') return false;
      record = { analytics, updatedAt: Date.now() };
      let saved = false;
      try { localStorage.setItem(KEY, JSON.stringify(record)); saved = true; } catch { /* Keep the choice in memory on this page. */ }
      if (!analytics) purgeAnalytics();
      announce();
      return saved;
    }
  });
  // The old notice did not offer a refusal; it cannot establish this consent.
  try { localStorage.removeItem('cookie_consent_accepted'); } catch { /* Storage is optional. */ }
  if (getChoice() !== true) purgeAnalytics();
  function refresh() {
    record = read();
    if (getChoice() !== true) purgeAnalytics();
    announce();
  }
  window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) refresh(); });
  // Expired consent is rechecked by allowsAnalytics before every event.
})();
