(() => {
  'use strict';
  const KEY = 'enka_measurement_v1';
  const TTL = 30 * 86400000;
  const allowed = () => window.enkaPrivacy?.allowsAnalytics() === true;
  const click = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,500}$/.test(value) ? value : undefined;
  const campaign = value => typeof value === 'string' && value.length <= 180 && !/@|\+?995[\s-]*5\d{8}/.test(value) ? value : undefined;
  let cached = {};
  let consentRevision = 0;
  function cleanSaved(saved, now) {
    const result = {};
    for (const [group, keys, validate] of [
      ['google', ['gclid', 'gbraid', 'wbraid'], click],
      ['meta', ['fbclid'], click],
      ['campaign', ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term'], campaign]
    ]) {
      const entry = saved?.[group];
      if (!Number.isFinite(entry?.at) || entry.at > now || now - entry.at >= TTL) continue;
      const clean = { at: entry.at };
      for (const key of keys) { const value = validate(entry[key]); if (value) clean[key] = value; }
      if (Object.keys(clean).length > 1) result[group] = clean;
    }
    return result;
  }
  function purge() {
    cached = {};
    try { localStorage.removeItem(KEY); } catch { /* Optional storage. */ }
  }
  function capture() {
    if (!allowed()) { purge(); return {}; }
    try {
      const raw = localStorage.getItem(KEY) || '{}';
      cached = raw.length <= 8192 ? cleanSaved(JSON.parse(raw), Date.now()) : {};
    } catch { /* Keep this page usable with blocked or corrupt storage. */ }
    const now = Date.now();
    for (const key of ['google', 'meta', 'campaign']) {
      if (!Number.isFinite(cached[key]?.at) || cached[key].at > now || now - cached[key].at >= TTL) delete cached[key];
    }
    const params = new URLSearchParams(location.search);
    const google = {};
    for (const key of ['gclid', 'gbraid', 'wbraid']) { const value = click(params.get(key)); if (value) google[key] = value; }
    if (Object.keys(google).length) cached.google = { at: now, ...google };
    const fbclid = click(params.get('fbclid'));
    if (fbclid && cached.meta?.fbclid !== fbclid) cached.meta = { at: now, fbclid };
    const utm = {};
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term']) { const value = campaign(params.get(key)); if (value) utm[key] = value; }
    if (Object.keys(utm).length) cached.campaign = { at: now, ...utm };
    try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch { /* In-memory fallback. */ }
    return cached;
  }
  function cookie(name) {
    try { return decodeURIComponent(document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || ''); } catch { return ''; }
  }
  function googleField(field) {
    const id = document.getElementById('enka-google-analytics')?.dataset.measurementId;
    if (!id || typeof window.gtag !== 'function' || !allowed()) return Promise.resolve(undefined);
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(undefined), 300);
      try { window.gtag('get', id, field, value => { clearTimeout(timer); resolve(typeof value === 'string' || typeof value === 'number' ? String(value) : undefined); }); }
      catch { clearTimeout(timer); resolve(undefined); }
    });
  }
  window.enkaMeasurement = Object.freeze({
    async snapshot() {
      const revision = consentRevision;
      const state = capture();
      const [clientId, sessionId] = await Promise.all([googleField('client_id'), googleField('session_id')]);
      const granted = allowed() && revision === consentRevision;
      const status = granted ? 'granted' : 'denied';
      const context = { version: 1, page_url: location.origin + location.pathname,
        consent: { analytics_storage: status, ad_storage: status, ad_user_data: status, ad_personalization: status } };
      if (!granted) { purge(); return context; }
      context.clicks = {};
      for (const key of ['gclid', 'gbraid', 'wbraid']) { const value = click(state.google?.[key]); if (value) context.clicks[key] = value; }
      context.utm = {};
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term']) { const value = campaign(state.campaign?.[key]); if (value) context.utm[key] = value; }
      const fbp = cookie('_fbp'), fbc = cookie('_fbc');
      context.meta = {};
      if (/^fb\.\d+\.\d+\.\d+$/.test(fbp)) context.meta.fbp = fbp;
      if (/^fb\.\d+\.\d+\.[A-Za-z0-9_-]{1,500}$/.test(fbc)) context.meta.fbc = fbc;
      else if (click(state.meta?.fbclid)) context.meta.fbc = 'fb.1.' + state.meta.at + '.' + state.meta.fbclid;
      context.google = {};
      if (clientId && /^[A-Za-z0-9_.-]{1,128}$/.test(clientId)) context.google.client_id = clientId;
      if (sessionId && /^\d{1,20}$/.test(sessionId)) context.google.session_id = sessionId;
      return context;
    }
  });
  window.addEventListener('enka:privacy-change', () => { consentRevision++; capture(); });
  window.addEventListener('storage', event => { if (event.key === null || event.key === 'enka_privacy_v1') capture(); });
  capture();
})();
