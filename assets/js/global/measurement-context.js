(() => {
  'use strict';
  const KEY = 'enka_measurement_v1';
  const TTL = 30 * 86400000;
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term'];
  const TOUCH_LIMIT = 8;
  const TOUCH_FIELDS = { utm_source: 40, utm_medium: 40, utm_id: 96 };
  const PAID_MEDIUM = /^(?:cpc|ppc|cpm|paid|paid[_-]?(?:social|search|display|video)|display|retargeting)$/i;
  const AD_PLATFORM = /^(?:facebook|fb|instagram|ig|meta|messenger|google)$/i;
  const allowed = () => window.enkaPrivacy?.allowsAnalytics() === true;
  const click = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,500}$/.test(value) ? value : undefined;
  const campaign = value => typeof value === 'string' && value.length <= 180 && !/@|\+?995[\s-]*5\d{8}/.test(value) ? value : undefined;
  let cached = {};
  let consentRevision = 0;
  let capturedLanding;
  const fresh = (at, now) => Number.isSafeInteger(at) && at <= now && now - at < TTL;
  function touch(entry, now) {
    if (!fresh(entry?.at, now)) return undefined;
    const result = { at: entry.at };
    for (const [key, limit] of Object.entries(TOUCH_FIELDS)) {
      const value = entry[key];
      if (typeof value === 'string' && value.length <= limit && /^[A-Za-z0-9_.-]+$/.test(value) && campaign(value)) result[key] = value;
    }
    return result.utm_source ? result : undefined;
  }
  function paid(entry) {
    const tags = touch(entry, entry?.at);
    return tags?.utm_id && (tags.utm_medium ? PAID_MEDIUM.test(tags.utm_medium) : AD_PLATFORM.test(tags.utm_source));
  }
  function sameTouch(a, b) {
    return !!a && Object.keys(TOUCH_FIELDS).every(key => a[key] === b[key]);
  }
  function cleanSaved(saved, now) {
    const result = {};
    for (const [group, keys, validate] of [
      ['google', ['gclid', 'gbraid', 'wbraid'], click],
      ['meta', ['fbclid'], click],
      ['campaign', UTM_KEYS, campaign],
      ['paid_campaign', UTM_KEYS, campaign]
    ]) {
      const entry = saved?.[group];
      if (!fresh(entry?.at, now)) continue;
      const clean = { at: entry.at };
      for (const key of keys) { const value = validate(entry[key]); if (value) clean[key] = value; }
      if (Object.keys(clean).length > 1) result[group] = clean;
    }
    const savedTouches = Array.isArray(saved?.campaign_touches) ? saved.campaign_touches.slice(-TOUCH_LIMIT) : [result.campaign];
    const touches = savedTouches.map(entry => touch(entry, now)).filter(Boolean).sort((a, b) => a.at - b.at);
    if (touches.length) result.campaign_touches = touches;
    if (!paid(result.paid_campaign)) delete result.paid_campaign;
    if (!result.paid_campaign && paid(result.campaign)) result.paid_campaign = result.campaign;
    return result;
  }
  function purge() {
    cached = {};
    capturedLanding = undefined;
    try { localStorage.removeItem(KEY); } catch { /* Optional storage. */ }
  }
  function capture() {
    if (!allowed()) { purge(); return {}; }
    try {
      const raw = localStorage.getItem(KEY) || '{}';
      cached = raw.length <= 8192 ? JSON.parse(raw) : {};
    } catch { /* Keep this page usable with blocked or corrupt storage. */ }
    const now = Date.now();
    cached = cleanSaved(cached, now);
    const params = new URLSearchParams(location.search);
    const google = {};
    for (const key of ['gclid', 'gbraid', 'wbraid']) { const value = click(params.get(key)); if (value) google[key] = value; }
    if (Object.keys(google).length) cached.google = { at: now, ...google };
    const fbclid = click(params.get('fbclid'));
    if (fbclid && cached.meta?.fbclid !== fbclid) cached.meta = { at: now, fbclid };
    if (capturedLanding !== location.search) {
      capturedLanding = location.search;
      const utm = { at: now };
      for (const key of UTM_KEYS) { const value = campaign(params.get(key)); if (value) utm[key] = value; }
      if (Object.keys(utm).length > 1) {
        cached.campaign = utm;
        if (paid(utm)) cached.paid_campaign = utm;
        const entry = touch(utm, now);
        if (entry) {
          const trail = cached.campaign_touches || [];
          const previous = trail.at(-1);
          if (!sameTouch(previous, entry) || now - previous.at >= 30 * 60000) {
            cached.campaign_touches = [...trail, entry].slice(-TOUCH_LIMIT);
          }
        }
      }
    }
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
      const selected = state.paid_campaign || state.campaign;
      for (const key of UTM_KEYS) { const value = campaign(selected?.[key]); if (value) context.utm[key] = value; }
      if (!state.paid_campaign && AD_PLATFORM.test(selected?.utm_source || '')) delete context.utm.utm_id;
      if (state.campaign_touches?.length) context.campaign_touches = state.campaign_touches;
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
