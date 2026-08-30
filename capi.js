const CAPI_WORKER_URL = 'https://capi.enkaelectronics.com.ge/';

const IDS = { fbp: null, fbc: null, eid: null };

const FBP_RE = /^fb\.\d+\.\d+\.\d+$/;
const FBC_RE = /^fb\.\d+\.\d+\..+/;

function cookieDomain() {
  const host = location.hostname;
  if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return '';
  if (host.endsWith('.com.ge')) {
    const parts = host.split('.');
    return parts.length >= 3 ? '.' + parts.slice(-3).join('.') : '';
  }
  const parts = host.split('.');
  return parts.length >= 2 ? '.' + parts.slice(-2).join('.') : '';
}

function getCookie(name) {
  try {
    const match = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)')
    );
    if (!match) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch (e) {
      return match[1];
    }
  } catch (e) {
    return '';
  }
}

function setCookie(name, value, days) {
  let cookie = name + '=' + encodeURIComponent(value) +
    '; Path=/; Max-Age=' + (days * 86400) + '; SameSite=Lax';
  if (location.protocol === 'https:') cookie += '; Secure';
  const domain = cookieDomain();
  if (domain) cookie += '; Domain=' + domain;
  document.cookie = cookie;
}

function lsGet(key) {
  try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}

function persist(name, value, days) {
  if (!value) return;
  setCookie(name, value, days);
  lsSet(name, value);
}

function readStored(name) {
  return getCookie(name) || lsGet(name) || '';
}

function extractFbclid(search) {
  if (!search) return '';
  const m = String(search).match(/[?&]fbclid=([^&#]+)/);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1].replace(/\+/g, '%2B'));
  } catch (e) {
    return m[1];
  }
}

function getFbclid() {
  try {
    const fromUrl = extractFbclid(location.search);
    if (fromUrl) return fromUrl;
    if (document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.hostname === location.hostname) {
          const fromRef = extractFbclid(ref.search);
          if (fromRef) return fromRef;
        }
      } catch (e) {}
    }
    return '';
  } catch (e) {
    return '';
  }
}

function fbclidFromFbc(fbc) {
  if (!fbc) return '';
  const a = fbc.indexOf('.');
  const b = fbc.indexOf('.', a + 1);
  const c = fbc.indexOf('.', b + 1);
  if (a === -1 || b === -1 || c === -1) return '';
  return fbc.slice(c + 1);
}

function ensureIdentifiers() {
  let fbp = IDS.fbp || readStored('_fbp');
  if (!fbp || !FBP_RE.test(fbp)) {
    fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e13);
  }
  persist('_fbp', fbp, 90);
  IDS.fbp = fbp;

  const fbclid = getFbclid();
  let fbc = IDS.fbc || readStored('_fbc') || '';
  if (fbc && !FBC_RE.test(fbc)) fbc = '';

  if (fbclid) {
    const existingClickId = fbclidFromFbc(fbc);
    if (!fbc || existingClickId !== fbclid) {
      fbc = 'fb.1.' + Date.now() + '.' + fbclid;
    }
  }

  if (fbc && FBC_RE.test(fbc)) {
    persist('_fbc', fbc, 90);
    IDS.fbc = fbc;
  } else {
    IDS.fbc = null;
  }

  let eid = IDS.eid || readStored('_capi_uid');
  if (!eid) {
    eid = (crypto.randomUUID && crypto.randomUUID()) ||
      (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  }
  persist('_capi_uid', eid, 365);
  IDS.eid = eid;

  return { fbp: IDS.fbp, fbc: IDS.fbc, external_id: IDS.eid };
}

ensureIdentifiers();

function sendCapiEvent(eventName, customData = {}, eventId = null, userInfo = {}) {
  if (!eventName || typeof eventName !== 'string' || !eventName.trim()) {
    console.warn('CAPI: event_name must be a non-empty string');
    return null;
  }

  const validEventName = eventName.trim();
  const finalEventId = eventId || (Date.now() + '_' + Math.random().toString(36).substring(2, 9));
  const ids = ensureIdentifiers();

  try {
    const payload = {
      event_name: validEventName,
      event_id: finalEventId,
      event_source_url: window.location.href,
      event_time: Math.floor(Date.now() / 1000),
      fbp: ids.fbp || undefined,
      fbc: ids.fbc || undefined,
      external_id: ids.external_id || undefined,
      custom_data: customData && typeof customData === 'object' ? customData : {},
    };

    if (userInfo && typeof userInfo === 'object') {
      if (userInfo.phone) payload.phone = String(userInfo.phone);
      if (userInfo.name) payload.name = String(userInfo.name);
      if (userInfo.email) payload.email = String(userInfo.email);
    }

    fetch(CAPI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function (error) {
      console.warn('CAPI error:', error);
    });

    return finalEventId;
  } catch (e) {
    console.error('CAPI execution error:', e);
    return finalEventId;
  }
}

window.sendCapiEvent = sendCapiEvent;
