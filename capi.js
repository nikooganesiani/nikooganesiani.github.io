const CAPI_WORKER_URL = 'https://capi.enkaelectronics.com.ge/';

const IDS = { fbp: null, fbc: null, eid: null };

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
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

function setCookie(name, value, days) {
  let cookie = name + '=' + encodeURIComponent(value) +
    '; Path=/; Max-Age=' + (days * 86400) + '; SameSite=Lax';
  if (location.protocol === 'https:') cookie += '; Secure';
  const domain = cookieDomain();
  if (domain) cookie += '; Domain=' + domain;
  document.cookie = cookie;
}

function getFbclid() {
  try {
    return new URLSearchParams(location.search).get('fbclid') || '';
  } catch (e) {
    return '';
  }
}

function ensureIdentifiers() {
  let fbp = getCookie('_fbp') || IDS.fbp;
  if (!fbp || !/^fb\.\d+\.\d+\.\d+$/.test(fbp)) {
    fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e13);
    setCookie('_fbp', fbp, 90);
  }
  IDS.fbp = fbp;

  const fbclid = getFbclid();
  let fbc = getCookie('_fbc') || IDS.fbc || '';
  if (fbclid) {
    if (!fbc || fbc.split('.').slice(3).join('.') !== fbclid) {
      fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      setCookie('_fbc', fbc, 90);
    }
  }
  IDS.fbc = fbc || null;

  let eid = getCookie('_capi_uid') || IDS.eid;
  if (!eid) {
    eid = (crypto.randomUUID && crypto.randomUUID()) ||
      (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
    setCookie('_capi_uid', eid, 365);
  }
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
