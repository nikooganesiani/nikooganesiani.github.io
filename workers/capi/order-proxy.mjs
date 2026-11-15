const INTAKE = 'https://zilumtvyowzgpwswewtj.supabase.co/functions/v1/enka-intake/public';
const ORIGIN = 'https://enkaelectronics.com.ge';
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,500}$/.test(value) ? value : undefined;

export function cleanMeasurement(input, request) {
  const consent = {};
  for (const key of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization']) consent[key] = input?.consent?.[key] === 'granted' ? 'granted' : 'denied';
  const context = { version: 1, consent, page_url: ORIGIN + '/' };
  try { const url = new URL(input?.page_url); if (url.origin === ORIGIN && url.pathname.length <= 500) context.page_url = url.origin + url.pathname; } catch { /* Safe canonical fallback. */ }
  const ua = request.headers.get('User-Agent');
  if (ua && ua.length <= 1024 && !/[\r\n]/.test(ua)) context.client_user_agent = ua;
  // Cloudflare sets CF-Connecting-IP; do not trust a browser-supplied body or X-Forwarded-For.
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip && ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip)) context.client_ip_address = ip;
  if (consent.ad_storage === 'granted') {
    context.clicks = {};
    for (const key of ['gclid', 'gbraid', 'wbraid']) { const value = safeId(input?.clicks?.[key]); if (value) context.clicks[key] = value; }
    context.meta = {};
    const { fbp, fbc } = input?.meta || {};
    if (typeof fbp === 'string' && fbp.length <= 128 && /^fb\.\d+\.\d+\.\d+$/.test(fbp)) context.meta.fbp = fbp;
    if (typeof fbc === 'string' && fbc.length <= 550 && /^fb\.\d+\.\d+\.[A-Za-z0-9_-]{1,500}$/.test(fbc)) context.meta.fbc = fbc;
  }
  if (consent.analytics_storage === 'granted') {
    context.google = {};
    const { client_id, session_id } = input?.google || {};
    if (typeof client_id === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(client_id)) context.google.client_id = client_id;
    if (typeof session_id === 'string' && /^\d{1,20}$/.test(session_id)) context.google.session_id = session_id;
  }
  context.utm = {};
  for (const key of consent.analytics_storage === 'granted' ? ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term'] : []) {
    const value = input?.utm?.[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 180 && !/@|\+?995[\s-]*5\d{8}/.test(value)) context.utm[key] = value;
  }
  return context;
}

export async function proxyOrder(request, env, fetchImpl = fetch) {
  const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key', Vary: 'Origin', 'Cache-Control': 'no-store' };
  const fail = (error, status) => Response.json({ error }, { status, headers: cors });
  if (request.headers.get('Origin') !== ORIGIN) return fail('origin_not_allowed', 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('method_not_allowed', 405);
  if (!env.ORDER_WEBHOOK_SECRET) return fail('intake_unavailable', 503);
  const key = request.headers.get('Idempotency-Key')?.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key || '')) return fail('invalid_idempotency_key', 400);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return fail('expected_json', 415);
  let payload;
  try {
    const reader = request.body?.getReader(); if (!reader) throw Error();
    const chunks = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 12000) { await reader.cancel(); return fail('payload_too_large', 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(k => !['name', 'phone', 'items', 'source', 'turnstile_token', 'measurement'].includes(k))) throw Error();
  } catch { return fail('invalid_order', 400); }
  const { measurement, ...order } = payload;
  const context = cleanMeasurement(measurement, request);
  const raw = JSON.stringify(context);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signingKey = await crypto.subtle.importKey('raw', encoder.encode(env.ORDER_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC', signingKey, encoder.encode('intake.' + timestamp + '.' + key + '.' + raw)));
  order.attribution = { ...context.utm, __enka_measurement: raw, __enka_timestamp: timestamp, __enka_signature: signature };
  try {
    const response = await fetchImpl(INTAKE, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(order), signal: AbortSignal.timeout(18000), redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) return fail('intake_unavailable', 503);
    const headers = new Headers(cors); headers.set('Content-Type', 'application/json');
    if (response.headers.has('Retry-After')) headers.set('Retry-After', response.headers.get('Retry-After'));
    return new Response(await response.text(), { status: response.status, headers });
  } catch (error) {
    console.error('Order intake upstream unavailable', { type: error?.name, code: error?.cause?.code });
    return fail('intake_unavailable', 503);
  }
}
