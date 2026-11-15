const FB_API_VERSION = 'v21.0';

const DEFAULT_ALLOWED_HOSTS = ['enkaelectronics.com.ge', 'localhost', '127.0.0.1', 'pages.dev'];

const BOT_UA_REGEX = /\b(googlebot|bingbot|yandexbot|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|headlesschrome|lighthouse|gtmetrix|pagespeed|pingdom|python-requests|curl|wget|postmanruntime|insomnia)\b/i;

async function sha256(str) {
  if (!str) return null;
  const msgUint8 = new TextEncoder().encode(String(str).trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizePhone(phone) {
  if (phone === null || phone === undefined) return null;
  let d = String(phone).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('9950') && d.length === 13) {
    d = '995' + d.slice(4);
  }
  if (d.startsWith('995') && d.length >= 12) return d.slice(0, 12);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 9) return '995' + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

function splitName(name) {
  if (!name || typeof name !== 'string') return { fn: null, ln: null };
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return { fn: null, ln: null };
  return {
    fn: parts[0],
    ln: parts.length > 1 ? parts[parts.length - 1] : null,
  };
}

function isValidFbp(s) {
  return typeof s === 'string' && /^fb\.\d+\.\d+\.\d+$/.test(s.trim());
}

function isValidFbc(s) {
  return typeof s === 'string' && /^fb\.\d+\.\d+\..+/.test(s.trim());
}

function isHostMatch(urlStr, allowedList) {
  if (!urlStr) return false;
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    return allowedList.some(
      (allowed) => hostname === allowed || hostname.endsWith('.' + allowed)
    );
  } catch {
    return false;
  }
}

function isRequestAllowed(request, env, bodySourceUrl) {
  const allowedList = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim().toLowerCase())
    : DEFAULT_ALLOWED_HOSTS;

  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');

  if (origin && origin !== 'null' && isHostMatch(origin, allowedList)) return true;
  if (referer && isHostMatch(referer, allowedList)) return true;
  if (!origin && !referer && bodySourceUrl && isHostMatch(bodySourceUrl, allowedList)) return true;

  return false;
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowOrigin =
    origin && origin !== 'null' && isRequestAllowed(request, env, null)
      ? origin
      : 'https://enkaelectronics.com.ge';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function checkEdgeCache(workerOrigin, cacheKeyStr) {
  try {
    const cache = caches.default;
    const req = new Request(`${workerOrigin}/__dedup/${encodeURIComponent(cacheKeyStr)}`, {
      method: 'GET',
    });
    const cached = await cache.match(req);
    return Boolean(cached);
  } catch {
    return false;
  }
}

async function putEdgeCache(workerOrigin, cacheKeyStr, ttlSeconds) {
  try {
    const cache = caches.default;
    const req = new Request(`${workerOrigin}/__dedup/${encodeURIComponent(cacheKeyStr)}`, {
      method: 'GET',
    });
    const res = new Response('1', {
      headers: { 'Cache-Control': `public, max-age=${ttlSeconds}` },
    });
    await cache.put(req, res);
  } catch {}
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.json().catch(() => null);

      if (!body || typeof body.event_name !== 'string' || !body.event_name.trim()) {
        return new Response(JSON.stringify({ error: 'event_name must be a non-empty string' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!env.FB_TEST_EVENT_CODE && !isRequestAllowed(request, env, body.event_source_url)) {
        console.warn(`[CAPI] BLOCKED_ORIGIN | Origin: ${request.headers.get('Origin')}`);
        return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userAgent = request.headers.get('User-Agent') || '';
      const isPurchaseWithPhone = body.event_name.trim() === 'Purchase' && Boolean(body.phone);
      if (!isPurchaseWithPhone && (!userAgent || BOT_UA_REGEX.test(userAgent))) {
        return new Response(JSON.stringify({ ok: true, skipped: 'bot_filtered' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await sendToCAPI(body, env, request, ctx);
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : (result.status || 400),
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error(`[CAPI] INTERNAL_ERROR: ${err.message}`);
      return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function sendToCAPI(body, env, request, ctx) {
  const pixelId = env.PIXEL_ID || env.FB_PIXEL_ID;
  const accessToken = env.FB_ACCESS_TOKEN || env.ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return { ok: false, status: 500, error: 'Missing PIXEL_ID/FB_PIXEL_ID or FB_ACCESS_TOKEN in Worker variables' };
  }

  const workerOrigin = new URL(request.url).origin;

  const {
    event_name,
    event_id,
    event_source_url,
    event_time,
    fbp,
    fbc,
    phone,
    name,
    email,
    external_id,
    custom_data,
  } = body;

  const cleanEventName = event_name.trim();
  const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const cfCountry = request.headers.get('CF-IPCountry');

  const userData = {};
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;
  if (isValidFbp(fbp)) userData.fbp = fbp.trim();
  if (isValidFbc(fbc)) userData.fbc = fbc.trim();

  const cleanPhone = normalizePhone(phone);
  const names = splitName(name);
  const cleanEmail = email && typeof email === 'string' ? email.trim().toLowerCase() : null;
  const cleanExternalId = external_id && typeof external_id === 'string' ? external_id.trim() : null;
  const countryRaw =
    cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1'
      ? cfCountry.trim().toLowerCase()
      : 'ge';

  const [ph, fn, ln, em, ext, country] = await Promise.all([
    cleanPhone ? sha256(cleanPhone) : null,
    names.fn ? sha256(names.fn) : null,
    names.ln ? sha256(names.ln) : null,
    cleanEmail ? sha256(cleanEmail) : null,
    cleanExternalId ? sha256(cleanExternalId) : null,
    countryRaw ? sha256(countryRaw) : null,
  ]);

  if (ph) userData.ph = [ph];
  if (fn) userData.fn = [fn];
  if (ln) userData.ln = [ln];
  if (em) userData.em = [em];
  if (ext) userData.external_id = [ext];
  if (country) userData.country = [country];

  const safeCustomData = custom_data && typeof custom_data === 'object' ? { ...custom_data } : {};

  if (cleanEventName === 'Purchase') {
    const rawVal = safeCustomData.value !== undefined ? safeCustomData.value : body.price;
    const numericVal = parseFloat(String(rawVal ?? 0).replace(/[^\d.]/g, '')) || 0;
    safeCustomData.value = numericVal;
    safeCustomData.currency =
      typeof safeCustomData.currency === 'string' && safeCustomData.currency.trim()
        ? safeCustomData.currency.trim().toUpperCase()
        : 'GEL';

    if (numericVal <= 0 && !ph) {
      return { ok: false, status: 400, error: 'Invalid Purchase event: missing value and phone' };
    }
  }

  const finalEventId =
    event_id && typeof event_id === 'string' && event_id.trim()
      ? event_id.trim()
      : `${cleanEventName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // 1. Проверка дубля по event_id (48 часов)
  const eidKey = `eid_${pixelId}_${cleanEventName}_${finalEventId}`;
  if (await checkEdgeCache(workerOrigin, eidKey)) {
    console.log(`[CAPI] DEDUPLICATED (same event_id) | ${cleanEventName} | id: ${finalEventId}`);
    return {
      ok: true,
      deduplicated: true,
      reason: 'duplicate_event_id',
      event_id: finalEventId,
    };
  }

  // 2. Многоуровневая серверная защита от дублей Purchase (независимо проверяет устройство, IP и телефон)
  const keysToCacheOnSuccess = [{ key: eidKey, ttl: 172800 }];

  if (cleanEventName === 'Purchase') {
    const contentKey =
      Array.isArray(safeCustomData.content_ids) && safeCustomData.content_ids.length
        ? safeCustomData.content_ids.join(',')
        : safeCustomData.content_name || String(safeCustomData.value || 0);

    const deviceId = userData.fbp || ext || null;
    const checks = [];

    // Замок А: То же устройство (fbp / external_id) + тот же товар (30 минут = 1800 сек)
    // Защищает, даже если клиент исправил цифру в номере телефона!
    if (deviceId) {
      const devProductKey = `pur_dev_${pixelId}_${deviceId}_${contentKey}`;
      const devBurstKey = `pur_dev_burst_${pixelId}_${deviceId}`;
      checks.push(checkEdgeCache(workerOrigin, devProductKey));
      checks.push(checkEdgeCache(workerOrigin, devBurstKey));
      keysToCacheOnSuccess.push({ key: devProductKey, ttl: 1800 });
      keysToCacheOnSuccess.push({ key: devBurstKey, ttl: 20 }); // Не чаще 1 покупки в 20 сек с устройства
    }

    // Замок Б: Тот же IP + тот же товар (15 минут = 900 сек)
    if (clientIp) {
      const ipProductKey = `pur_ip_${pixelId}_${clientIp}_${contentKey}`;
      const ipBurstKey = `pur_ip_burst_${pixelId}_${clientIp}`;
      checks.push(checkEdgeCache(workerOrigin, ipProductKey));
      checks.push(checkEdgeCache(workerOrigin, ipBurstKey));
      keysToCacheOnSuccess.push({ key: ipProductKey, ttl: 900 });
      keysToCacheOnSuccess.push({ key: ipBurstKey, ttl: 15 });
    }

    // Замок В: Тот же номер телефона + тот же товар (30 минут = 1800 сек)
    if (ph) {
      const phProductKey = `pur_ph_${pixelId}_${ph}_${contentKey}`;
      checks.push(checkEdgeCache(workerOrigin, phProductKey));
      keysToCacheOnSuccess.push({ key: phProductKey, ttl: 1800 });
    }

    const checkResults = await Promise.all(checks);
    if (checkResults.some(Boolean)) {
      console.log(`[CAPI] DEDUPLICATED (same device/IP/phone) | Purchase | id: ${finalEventId} | IP: ${clientIp}`);
      return {
        ok: true,
        deduplicated: true,
        reason: 'duplicate_purchase_device_or_ip',
        event_id: finalEventId,
      };
    }
  }

  const serverNow = Math.floor(Date.now() / 1000);
  const ts =
    Number.isInteger(event_time) && event_time <= serverNow && serverNow - event_time < 300
      ? event_time
      : serverNow;

  const eventData = {
    event_name: cleanEventName,
    event_time: ts,
    event_id: finalEventId,
    event_source_url: event_source_url || request.headers.get('Referer') || 'https://enkaelectronics.com.ge/',
    action_source: 'website',
    user_data: userData,
    custom_data: safeCustomData,
  };

  const payload = { data: [eventData] };
  if (env.FB_TEST_EVENT_CODE) {
    payload.test_event_code = env.FB_TEST_EVENT_CODE;
  }

  const url = `https://graph.facebook.com/${FB_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('[CAPI] META_API_ERROR:', JSON.stringify(result));
    return { ok: false, status: response.status, event_id: finalEventId, error: result.error };
  }

  const cacheWrites = keysToCacheOnSuccess.map((item) =>
    putEdgeCache(workerOrigin, item.key, item.ttl)
  );

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(Promise.all(cacheWrites));
  } else {
    await Promise.all(cacheWrites);
  }

  console.log(`[CAPI] SENT_TO_META | ${cleanEventName} | id: ${finalEventId} | val: ${safeCustomData.value || 0}`);

  return {
    ok: true,
    event_id: finalEventId,
    events_received: result.events_received,
    message: 'Success',
  };
}
