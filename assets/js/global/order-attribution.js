(() => {
  'use strict';

  const key = 'enka_campaign_touches_v1';
  const maxTouches = 20;
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term'];
  const paidMedia = new Set(['paid', 'paid_social', 'paid_search', 'paid_display', 'cpc', 'ppc', 'cpm', 'display']);
  let touches = [];

  function clean(fieldsFromUrl) {
    const result = {};
    for (const field of fields) {
      const value = fieldsFromUrl(field);
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed || trimmed.length > 180 || /[@\u0000-\u001F\u007F]|:\/\//u.test(trimmed)) continue;
      if (field !== 'utm_id' && /(?:\d[+().\s-]*){7,}/u.test(trimmed)) continue;
      // Campaign IDs can be numeric. Accept the stable identifier format, never raw URLs or contacts.
      if (field === 'utm_id' && !/^[A-Za-z0-9_.:-]{1,120}$/.test(trimmed)) continue;
      result[field] = field === 'utm_source' || field === 'utm_medium'
        ? trimmed.toLowerCase()
        : trimmed;
    }
    return result;
  }

  function isPaidCampaign(touch) {
    const medium = touch.tags.utm_medium?.replace(/[ -]+/g, '_');
    return Boolean(touch.tags.utm_source && (touch.tags.utm_id || touch.tags.utm_campaign) && paidMedia.has(medium));
  }

  function sync(capture) {
    if (window.enkaPrivacy?.allowsAnalytics() !== true) {
      touches = [];
      try { sessionStorage.removeItem(key); } catch { /* Browser storage is optional. */ }
      return;
    }
    let saved = touches;
    try {
      const value = JSON.parse(sessionStorage.getItem(key));
      if (Array.isArray(value)) saved = value;
    } catch { /* Keep in-memory touches when browser storage is unavailable. */ }
    const now = Date.now();
    touches = saved.filter(touch => Number.isFinite(touch?.at) && touch.at <= now && now - touch.at < maxAge)
      .map(touch => ({ at: touch.at, tags: clean(field => touch.tags?.[field]) }))
      .filter(touch => Object.keys(touch.tags).length > 0)
      .slice(-maxTouches);

    if (capture) {
      const params = new URLSearchParams(location.search);
      const tags = clean(field => params.get(field));
      if (Object.keys(tags).length && JSON.stringify(tags) !== JSON.stringify(touches.at(-1)?.tags)) {
        touches = [...touches, { at: now, tags }].slice(-maxTouches);
      }
    }
    try { sessionStorage.setItem(key, JSON.stringify(touches)); } catch { /* Use in-memory touches on this page. */ }
  }

  window.enkaOrderAttribution = Object.freeze({
    current() {
      sync(false);
      const last = touches.findLast(isPaidCampaign) ?? touches.at(-1);
      return last ? { ...last.tags } : null;
    },
  });
  window.addEventListener('enka:privacy-change', () => sync(true));
  sync(true);
})();
