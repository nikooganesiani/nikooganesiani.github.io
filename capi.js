const CAPI_WORKER_URL = 'https://capi.enkaelectronics.com.ge/';

const IDS = { fbp: null, fbc: null, eid: null };
const SENT_EVENT_IDS = new Set();
let lastPurchaseTimestamp = 0;

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

/**
 * Дедупликация Purchase на устройстве:
 * НЕ зависит от введенного номера телефона! Если клиент исправил ошибку в номере и отправил
 * заказ повторно, в CAPI второй раз покупка этого товара НЕ отправится (замок 30 минут).
 */
function isDuplicatePurchaseOnClient(customData) {
  const now = Date.now();
  const PURCHASE_TTL = 1800000; // 30 минут на один и тот же товар с одного устройства

  // 1. Защита от быстрых повторных отправок на одной странице (15 секунд)
  if (now - lastPurchaseTimestamp < 15000) {
    return true;
  }

  const contentKey = Array.isArray(customData?.content_ids) && customData.content_ids.length
    ? customData.content_ids.join(',')
    : (customData?.content_name || location.pathname);
  const valKey = String(customData?.value || 0);
  // Ключ строится ТОЛЬКО по товару и цене (смена цифры в телефоне не создает новый Purchase!)
  const productFingerprint = `${contentKey}|${valKey}`;

  try {
    const raw = readStored('_capi_recent_purchases');
    const recent = raw ? JSON.parse(raw) : {};

    for (const k of Object.keys(recent)) {
      if (now - recent[k] > PURCHASE_TTL) delete recent[k];
    }

    // Проверка: покупали ли уже этот товар с этого браузера за последние 30 минут
    if (recent[productFingerprint] && (now - recent[productFingerprint] < PURCHASE_TTL)) {
      return true;
    }

    // Проверка: не было ли вообще любой покупки с этого браузера за последние 15 секунд
    if (recent['__last_any__'] && (now - recent['__last_any__'] < 15000)) {
      return true;
    }

    recent[productFingerprint] = now;
    recent['__last_any__'] = now;
    persist('_capi_recent_purchases', JSON.stringify(recent), 1);
  } catch (e) {}

  lastPurchaseTimestamp = now;
  return false;
}

function resolveUserInfo(userInfo = {}, isPurchase = false) {
  const resolved = {
    phone: userInfo?.phone ? String(userInfo.phone).trim() : '',
    name: userInfo?.name ? String(userInfo.name).trim() : '',
    email: userInfo?.email ? String(userInfo.email).trim() : '',
  };

  if (isPurchase && (!resolved.phone || !resolved.name)) {
    try {
      if (!resolved.phone) {
        const phoneInputs = document.querySelectorAll('#quickPhone, input[type="tel"], input[name="phone"]');
        for (const el of phoneInputs) {
          const digits = (el.value || '').replace(/\D/g, '');
          if (digits.length >= 9) {
            resolved.phone = '+995' + digits.slice(-9);
            break;
          }
        }
      }
      if (!resolved.name) {
        const nameInputs = document.querySelectorAll('#quickName, input[name="name"], input[placeholder*="სახელი"]');
        for (const el of nameInputs) {
          if (el.value && el.value.trim()) {
            resolved.name = el.value.trim();
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (resolved.phone || resolved.name) {
    lsSet('_capi_last_user', JSON.stringify(resolved));
    return resolved;
  }

  try {
    const cached = JSON.parse(lsGet('_capi_last_user') || '{}');
    if (!resolved.phone && cached.phone) resolved.phone = cached.phone;
    if (!resolved.name && cached.name) resolved.name = cached.name;
    if (!resolved.email && cached.email) resolved.email = cached.email;
  } catch (e) {}

  return resolved;
}

ensureIdentifiers();

function sendCapiEvent(eventName, customData = {}, eventId = null, userInfo = {}) {
  if (navigator.webdriver) return null;

  if (!eventName || typeof eventName !== 'string' || !eventName.trim()) {
    console.warn('CAPI: event_name must be a non-empty string');
    return null;
  }

  const validEventName = eventName.trim();
  const finalEventId =
    eventId && typeof eventId === 'string' && eventId.trim()
      ? eventId.trim()
      : `${validEventName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  if (SENT_EVENT_IDS.has(finalEventId)) {
    return finalEventId;
  }

  const isPurchase = validEventName === 'Purchase';
  const finalUser = resolveUserInfo(userInfo, isPurchase);

  if (isPurchase) {
    if (isDuplicatePurchaseOnClient(customData)) {
      console.info('CAPI: Duplicate Purchase suppressed on client (already tracked for this device/product)');
      return finalEventId;
    }
  }

  SENT_EVENT_IDS.add(finalEventId);
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

    if (finalUser.phone) payload.phone = finalUser.phone;
    if (finalUser.name) payload.name = finalUser.name;
    if (finalUser.email) payload.email = finalUser.email;

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