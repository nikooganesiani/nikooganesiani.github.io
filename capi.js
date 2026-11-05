const CAPI_WORKER_URL = 'https://capi.enkaelectronics.com.ge/';

const IDS = { fbp: null, fbc: null, eid: null };
const SENT_EVENT_IDS = new Set();
let lastPurchaseTimestamp = 0;

// Настройки защиты бота от спама (работает глобально для всех форм на сайте)
const BOT_GUARD_CONFIG = {
  MAX_PER_MINUTE: 3,       // Макс. 3 заказа в минуту с одного устройства
  MAX_PER_15_MIN: 5,       // Макс. 5 заказов за 15 минут
  MIN_COOLDOWN_MS: 4000,   // Минимум 4 секунды между кликами
  SAME_ORDER_TTL: 300000,  // 5 минут блокировки на 100% одинаковые данные (имя + телефон + товар)
};

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
  if (!window.enkaPrivacy?.allowsAnalytics()) return {};
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

// ============================================================================
// ГЛОБАЛЬНАЯ ЗАЩИТА БОТА ЗАКАЗОВ ОТ СПАМА (ПЕРЕХВАТЧИК ДЛЯ ВСЕХ ФОРМ САЙТА)
// ============================================================================

function showOrderGuardToast(message, isWarning = true) {
  try {
    let toast = document.getElementById('enka-guard-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'enka-guard-toast';
      toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[999999] py-3 px-5 rounded-[10px] text-white text-[14px] font-semibold shadow-[0_10px_25px_rgb(0_0_0/0.25)] transition-opacity duration-300 ease-[ease] text-center max-w-[90vw] opacity-0 data-[warning=true]:bg-[#dc2626] data-[warning=false]:bg-[#16a34a]';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.dataset.warning = String(isWarning);
    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');
    toast.textContent = message;

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      if (toast) { toast.classList.remove('opacity-100'); toast.classList.add('opacity-0'); }
    }, 4000);
  } catch (e) {}
}

function checkAndRecordBotOrder(name, phone, productKey) {
  const now = Date.now();
  let history = { ts: [], sigs: {} };

  try {
    const raw = readStored('_enka_bot_guard');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.ts)) history.ts = parsed.ts;
      if (parsed.sigs && typeof parsed.sigs === 'object') history.sigs = parsed.sigs;
    }
  } catch (e) {}

  // Очистка старых записей
  history.ts = history.ts.filter((t) => now - t < 900000);
  for (const k of Object.keys(history.sigs)) {
    if (now - history.sigs[k] > BOT_GUARD_CONFIG.SAME_ORDER_TTL) {
      delete history.sigs[k];
    }
  }

  // 1. Защита от быстрых кликов (< 4 секунд)
  const lastTs = history.ts.length ? history.ts[history.ts.length - 1] : 0;
  if (lastTs && now - lastTs < BOT_GUARD_CONFIG.MIN_COOLDOWN_MS) {
    return {
      allowed: false,
      reason: 'cooldown',
      message: 'გთხოვთ მოითმინოთ რამდენიმე წამი...',
    };
  }

  // 2. Блокировка 100% идентичного заказа (те же имя + телефон + товар в течение 5 минут)
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-9);
  const cleanName = String(name || '').trim().toLowerCase();
  const sig = `${cleanName}|${cleanPhone}|${productKey}`;

  if (history.sigs[sig] && now - history.sigs[sig] < BOT_GUARD_CONFIG.SAME_ORDER_TTL) {
    return {
      allowed: false,
      reason: 'duplicate_exact',
      message: 'თქვენი შეკვეთა უკვე მიღებულია!',
    };
  }

  // 3. Лимит: максимум 3 заказа в минуту (и 5 за 15 минут) с одного устройства
  const lastMinCount = history.ts.filter((t) => now - t < 60000).length;
  if (
    lastMinCount >= BOT_GUARD_CONFIG.MAX_PER_MINUTE ||
    history.ts.length >= BOT_GUARD_CONFIG.MAX_PER_15_MIN
  ) {
    return {
      allowed: false,
      reason: 'rate_limit',
      message: 'შეკვეთების ლიმიტი ამოწურულია (მაქს. 3 წუთში). გთხოვთ სცადოთ 1 წუთში.',
    };
  }

  // Записываем СРАЗУ (до завершения сети), чтобы параллельные клики не проскочили
  history.ts.push(now);
  history.sigs[sig] = now;
  persist('_enka_bot_guard', JSON.stringify(history), 1);

  return { allowed: true, reservation: { sig, timestamp: now } };
}

function releaseBotOrderReservation(reservation) {
  if (!reservation) return;
  try {
    const history = JSON.parse(readStored('_enka_bot_guard') || '{}');
    if (!Array.isArray(history.ts) || !history.sigs) return;
    const index = history.ts.indexOf(reservation.timestamp);
    if (index !== -1) history.ts.splice(index, 1);
    if (history.sigs[reservation.sig] === reservation.timestamp) delete history.sigs[reservation.sig];
    persist('_enka_bot_guard', JSON.stringify(history), 1);
  } catch (e) {}
}

// Перехватываем отправку заказов во все воркеры бота на всех страницах сайта
if (typeof window.fetch === 'function' && !window.__enkaFetchGuarded) {
  window.__enkaFetchGuarded = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    let reservation = null;
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = (init?.method || input?.method || 'GET').toUpperCase();

      // Проверяем все POST-запросы кроме самого CAPI-воркера
      if (
        method === 'POST' &&
        url &&
        !url.includes('capi.enkaelectronics.com.ge') &&
        init?.body &&
        typeof init.body === 'string'
      ) {
        let bodyObj = null;
        try {
          bodyObj = JSON.parse(init.body);
        } catch (e) {}

        // Определяем, что это запрос заказа в бот (есть поле phone)
        if (bodyObj && (bodyObj.phone || bodyObj.tel || bodyObj.customer_phone)) {
          const phone = bodyObj.phone || bodyObj.tel || bodyObj.customer_phone || '';
          const name = bodyObj.name || bodyObj.customer_name || '';
          const prodKey =
            bodyObj.product_id || bodyObj.product || location.pathname.replace(/^\/|\/$/g, '') || 'item';

          const guard = checkAndRecordBotOrder(name, phone, prodKey);
          if (!guard.allowed) {
            showOrderGuardToast(guard.message, guard.reason !== 'duplicate_exact');
            console.warn('[OrderGuard] Запрос к боту заблокирован:', guard.reason);

            return new Response(
              JSON.stringify({ ok: false, error: guard.reason, message: guard.message }),
              {
                status: 429,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
          reservation = guard.reservation;
        }
      }
    } catch (e) {}

    try {
      const response = await originalFetch(input, init);
      let rejected = !response.ok;
      if (reservation && response.ok) {
        const result = await response.clone().json().catch(() => null);
        rejected = result?.ok === false || result?.success === false || !!result?.error;
      }
      if (rejected) releaseBotOrderReservation(reservation);
      return response;
    } catch (error) {
      releaseBotOrderReservation(reservation);
      throw error;
    }
  };
}

// ============================================================================
// ДЕДУПЛИКАЦИЯ И ОТПРАВКА CAPI
// ============================================================================

function isDuplicatePurchaseOnClient(customData) {
  const now = Date.now();
  const PURCHASE_TTL = 1800000; // 30 минут замок на тот же товар

  if (now - lastPurchaseTimestamp < 15000) {
    return true;
  }

  const contentKey =
    Array.isArray(customData?.content_ids) && customData.content_ids.length
      ? customData.content_ids.join(',')
      : customData?.content_name || location.pathname;
  const valKey = String(customData?.value || 0);
  const productFingerprint = `${contentKey}|${valKey}`;

  try {
    const raw = readStored('_capi_recent_purchases');
    const recent = raw ? JSON.parse(raw) : {};

    for (const k of Object.keys(recent)) {
      if (now - recent[k] > PURCHASE_TTL) delete recent[k];
    }

    if (recent[productFingerprint] && now - recent[productFingerprint] < PURCHASE_TTL) {
      return true;
    }

    if (recent['__last_any__'] && now - recent['__last_any__'] < 15000) {
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

window.addEventListener?.('enka:privacy-change', () => {
  if (window.enkaPrivacy?.allowsAnalytics()) return;
  IDS.fbp = IDS.fbc = IDS.eid = null;
  SENT_EVENT_IDS.clear();
});

function sendCapiEvent(eventName, customData = {}, eventId = null, userInfo = {}) {
  if (!window.enkaPrivacy?.allowsAnalytics()) return null;
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
