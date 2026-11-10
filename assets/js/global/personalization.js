(() => {
  'use strict';
  const CONSENT = 'enka_personalization_consent_v1';
  const PROFILE = 'enka_personalization_profile_v1';
  const DAY = 86400000;
  const POLICY = '2026-11-10';
  const empty = () => ({ interests: [], hidden: [], events: [], impressions: {} });
  let profile = empty();
  let choice = null;
  let persistent = true;
  const validRef = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_:-]{0,159}$/.test(value);
  const list = value => Array.isArray(value) ? [...new Set(value.filter(validRef))].slice(0, 160) : [];
  function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  function remove(key) { try { localStorage.removeItem(key); } catch { /* Optional storage. */ } }
  function active() {
    if (choice && (choice.at > Date.now() || Date.now() - choice.at >= 180 * DAY)) {
      choice = null; profile = empty(); remove(PROFILE); remove(CONSENT);
      announce('enka:personalization-choice');
    }
    return choice?.allowed === true;
  }
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object') return empty();
    const now = Date.now();
    const fresh = Number.isFinite(raw.updatedAt) && now >= raw.updatedAt && now - raw.updatedAt < 90 * DAY;
    if (!fresh) return empty();
    const events = Array.isArray(raw.events) ? raw.events.filter(event => event &&
      ['view', 'engaged', 'click', 'category', 'search', 'purchase'].includes(event.kind) && validRef(event.ref) &&
      Number.isFinite(event.at) && event.at <= now && now - event.at < 90 * DAY).slice(-240).map(({ kind, ref, at }) => ({ kind, ref, at })) : [];
    const exposures = raw.impressions && typeof raw.impressions === 'object' ? Object.entries(raw.impressions).filter(([id, entry]) =>
      validRef(id) && entry && Number.isFinite(entry.at) && entry.at <= now && now - entry.at < 7 * DAY)
      .slice(-200).map(([id, entry]) => [id, { count: Math.max(0, Math.min(10, Number(entry.count) || 0)), at: entry.at }]) : [];
    return { interests: list(raw.interests), hidden: list(raw.hidden), events, impressions: Object.fromEntries(exposures), updatedAt: raw.updatedAt };
  }
  function refresh() {
    const saved = read(CONSENT);
    choice = saved && typeof saved.allowed === 'boolean' && (!saved.allowed || saved.age16Confirmed === true) && saved.policy === POLICY &&
      Number.isFinite(saved.at) && saved.at <= Date.now() && Date.now() - saved.at < 180 * DAY ? saved : null;
    const raw = active() ? read(PROFILE) : null;
    profile = active() ? sanitize(raw) : empty();
    if (raw && JSON.stringify(raw) !== JSON.stringify(profile)) persistClean();
    if (!active()) remove(PROFILE);
  }
  function persistClean() {
    if (!active()) return;
    try {
      if (profile.updatedAt) localStorage.setItem(PROFILE, JSON.stringify(profile));
      else localStorage.removeItem(PROFILE);
    } catch { persistent = false; }
  }
  function save() {
    if (!active()) return;
    profile.updatedAt = Date.now();
    profile = sanitize(profile);
    try { localStorage.setItem(PROFILE, JSON.stringify(profile)); persistent = true; } catch { persistent = false; }
  }
  function announce(name = 'enka:personalization-change') { window.dispatchEvent(new CustomEvent(name)); }
  function record(kind, ref) {
    if (!active() || !validRef(ref) || !['view', 'engaged', 'click', 'category', 'search', 'purchase'].includes(kind)) return;
    const now = Date.now();
    // Cap repeated actions to one signal per kind/ref/day, not one signal per render or refresh.
    if (profile.events.some(event => event.kind === kind && event.ref === ref && now - event.at < DAY)) return;
    profile.events.push({ kind, ref, at: now });
    save();
  }
  function snapshot() {
    const enabled = active();
    if (enabled) {
      const cleaned = sanitize(profile);
      const changed = JSON.stringify(cleaned) !== JSON.stringify(profile);
      profile = cleaned;
      if (changed) persistClean();
    }
    const result = { ...profile, events: enabled ? profile.events.slice() : [], impressions: {} };
    result.interests = profile.interests.slice();
    result.hidden = profile.hidden.slice();
    if (enabled) {
      for (const [id, entry] of Object.entries(profile.impressions)) result.impressions[id] = entry.count;
      // Favorites are repurposed only after specific personalization consent, never order/contact data.
      const favorites = read('myFavs');
      result.favorites = Array.isArray(favorites) ? list(favorites.map(item => String(item?.id || item?.sku || ''))) : [];
    }
    return result;
  }
  refresh();
  window.enkaPersonalization = Object.freeze({
    allowed: active,
    getChoice: () => { active(); return choice?.allowed ?? null; },
    isPersistent: () => persistent,
    snapshot,
    record,
    setChoice(allowed, ageConfirmed = false) {
      if (typeof allowed !== 'boolean' || (allowed && ageConfirmed !== true)) return false;
      const interests = profile.interests.slice();
      choice = { allowed, at: Date.now(), policy: POLICY, age16Confirmed: allowed };
      if (!allowed) { profile = empty(); remove(PROFILE); }
      else profile.interests = interests;
      try { localStorage.setItem(CONSENT, JSON.stringify(choice)); persistent = true; } catch { persistent = false; }
      if (allowed) save();
      announce('enka:personalization-choice');
      return true;
    },
    setInterests(interests) { profile.interests = list(interests).filter(key => /^(category|sub):[\w-]+$/.test(key)); save(); announce(); },
    hide(id) { if (!validRef(String(id))) return; profile.hidden = list([...profile.hidden, String(id)]); save(); announce(); },
    reset() { profile = empty(); remove(PROFILE); announce(); },
    impression(id) {
      if (!active() || !validRef(String(id))) return;
      const entry = profile.impressions[id];
      if (entry && Date.now() - entry.at < 30 * 60000) return;
      profile.impressions[id] = { count: Math.min(10, (entry?.count || 0) + 1), at: Date.now() };
      save();
    }
  });
  window.addEventListener('storage', event => {
    if ([CONSENT, PROFILE, 'myFavs', null].includes(event.key)) { refresh(); announce('enka:personalization-choice'); }
  });
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || !active()) return;
    try {
      const url = new URL(link.href, location.origin);
      if (url.origin !== location.origin) return;
      const match = url.pathname.match(/^\/product\/([^/]+)\/?$/);
      if (match) record('click', decodeURIComponent(match[1]));
    } catch { /* Ignore malformed links. */ }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const product = document.getElementById('productData');
    let visibleSince = 0;
    let visibleTime = 0;
    let engaged = false;
    function tick() {
      if (!active() || !product) { visibleSince = 0; visibleTime = 0; return; }
      record('view', product.dataset.id);
      const now = Date.now();
      if (visibleSince) visibleTime += now - visibleSince;
      visibleSince = document.visibilityState === 'visible' ? now : 0;
      if (!engaged && visibleTime >= 15000) { engaged = true; record('engaged', product.dataset.id); }
    }
    if (product) {
      tick();
      setInterval(tick, 5000);
      document.addEventListener('visibilitychange', tick);
      window.addEventListener('enka:personalization-choice', () => { visibleSince = 0; visibleTime = 0; engaged = false; tick(); });
    }
    // A consent can expire while a page is open. Revoke in memory and notify the feed promptly.
    setInterval(active, 60000);
    window.addEventListener('pageshow', active);
  });
})();
