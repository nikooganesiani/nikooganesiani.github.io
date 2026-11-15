const WEEK = 7 * 86400000;
const RETENTION = 90 * 86400000;
const encoder = new TextEncoder();
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const orderIdValid = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('Empty body');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32768) { await reader.cancel(); throw Error('Body too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function authenticated(request, body, secret) {
  const timestamp = request.headers.get('X-Enka-Timestamp') || '';
  const signature = request.headers.get('X-Enka-Signature') || '';
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp) * 1000) > 300000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g), h => parseInt(h, 16));
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(timestamp + '.' + body));
}

// Accept only canonical facts supplied by the order backend, never browser prices.
export async function purchaseEvent(order, now = Date.now()) {
  if (!orderIdValid(order?.order_id)) throw Error('Invalid order_id');
  const created = typeof order.created_at === 'string' ? Date.parse(order.created_at) : NaN;
  if (!Number.isFinite(created) || created > now + 60000 || now - created >= WEEK) throw Error('Invalid created_at');
  if (order.currency !== 'GEL' || typeof order.value !== 'number' || !Number.isFinite(order.value) || order.value <= 0 || order.value > 10000000) throw Error('Invalid amount');
  if (!Array.isArray(order.items) || !order.items.length || order.items.length > 100) throw Error('Invalid items');
  const contents = order.items.map(item => {
    if (typeof item.id !== 'string' || !item.id || item.id.length > 128 || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000 || typeof item.item_price !== 'number' || !Number.isFinite(item.item_price) || item.item_price <= 0 || item.item_price > 10000000) throw Error('Invalid item');
    return { id: item.id, quantity: item.quantity, item_price: item.item_price };
  });
  const total = contents.reduce((sum, item) => sum + Math.round(item.item_price * 100) * item.quantity, 0);
  if (Math.abs(total - Math.round(order.value * 100)) > 1) throw Error('Item total does not match value');
  const phone = typeof order.phone === 'string' ? order.phone.replace(/[\s()+-]/g, '') : '';
  if (!/^9955\d{8}$/.test(phone)) throw Error('Invalid phone');
  const ph = hex(await crypto.subtle.digest('SHA-256', encoder.encode(phone)));
  const userData = { ph: [ph] };
  const measurement = order.measurement;
  let sourceUrl = 'https://enkaelectronics.com.ge/';
  if (measurement?.version === 1) {
    const ip = measurement.client_ip_address, ua = measurement.client_user_agent;
    if (typeof ip === 'string' && ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip)) userData.client_ip_address = ip;
    if (typeof ua === 'string' && ua.length > 0 && ua.length <= 1024 && !/[\r\n]/.test(ua)) userData.client_user_agent = ua;
    if (measurement.consent?.ad_storage === 'granted') {
      const { fbp, fbc } = measurement.meta || {};
      if (typeof fbp === 'string' && fbp.length <= 128 && /^fb\.\d+\.\d+\.\d+$/.test(fbp)) userData.fbp = fbp;
      if (typeof fbc === 'string' && fbc.length <= 550 && /^fb\.\d+\.\d+\.[A-Za-z0-9_-]{1,500}$/.test(fbc)) userData.fbc = fbc;
    }
    try {
      const url = new URL(measurement.page_url);
      if (url.origin === 'https://enkaelectronics.com.ge' && url.pathname.length <= 500) sourceUrl = url.origin + url.pathname;
    } catch { /* Keep canonical source URL. */ }
  }
  return {
    event_name: 'Purchase', event_id: 'purchase_' + order.order_id,
    event_time: Math.floor(created / 1000), action_source: 'website',
    event_source_url: sourceUrl,
    user_data: userData,
    custom_data: { order_id: order.order_id, currency: 'GEL', value: order.value,
      content_type: 'product', content_ids: contents.map(item => item.id), contents,
      num_items: contents.reduce((sum, item) => sum + item.quantity, 0) }
  };
}

export async function acceptOrderRequest(request, env) {
  const path = new URL(request.url).pathname;
  if (!['/server/order-created', '/server/order-status'].includes(path)) return json({ error: 'Not found' }, 404);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.ORDER_WEBHOOK_SECRET || !env.PURCHASE_DELIVERY || !env.FB_ACCESS_TOKEN || !env.PIXEL_ID) return json({ error: 'Server delivery is not configured' }, 503);
  let body;
  try { body = await readBody(request); } catch { return json({ error: 'Invalid body' }, 400); }
  if (!await authenticated(request, body, env.ORDER_WEBHOOK_SECRET)) return json({ error: 'Unauthorized' }, 401);
  let order;
  try { order = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!orderIdValid(order?.order_id)) return json({ error: 'Invalid order_id' }, 400);
  const stub = env.PURCHASE_DELIVERY.get(env.PURCHASE_DELIVERY.idFromName(order.order_id));
  if (path === '/server/order-status') return stub.fetch('https://delivery/status');
  let event;
  try { event = await purchaseEvent(order); } catch (error) { return json({ error: error.message }, 400); }
  // Await durable storage before acknowledging to the backend outbox.
  try {
    return await stub.fetch('https://delivery/enqueue', { method: 'POST', body: JSON.stringify(event) });
  } catch { return json({ error: 'Delivery storage unavailable; retry this order_id' }, 503); }
}

export class PurchaseDelivery {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    if (new URL(request.url).pathname === '/status') {
      const job = await this.ctx.storage.get('job');
      return job ? json({ event_id: job.event_id, state: job.state, attempts: job.attempts, last_error: job.last_error }) : json({ error: 'Not found' }, 404);
    }
    const event = await request.json();
    let duplicate = false;
    const job = await this.ctx.storage.transaction(async txn => {
      const existing = await txn.get('job');
      if (existing) { duplicate = true; return existing; }
      const job = { event_id: event.event_id, state: 'pending', attempts: 0, event, expires_at: event.event_time * 1000 + WEEK };
      await txn.put('job', job);
      await txn.setAlarm(Date.now() + 1000);
      return job;
    });
    return json({ ok: true, event_id: job.event_id, state: job.state, duplicate }, duplicate ? 200 : 202);
  }
  async alarm() {
    const job = await this.ctx.storage.get('job');
    if (!job) return;
    if (job.state !== 'pending') { await this.ctx.storage.deleteAll(); return; }
    if (Date.now() >= job.expires_at) return this.finish(job, 'failed', 'event_expired');
    job.attempts++;
    // Persist a recovery alarm before network I/O, including process interruption.
    await this.ctx.storage.setAlarm(Date.now() + 60000);
    let response, result;
    try {
      const payload = { data: [job.event] };
      if (this.env.FB_TEST_EVENT_CODE) payload.test_event_code = this.env.FB_TEST_EVENT_CODE;
      response = await fetch(`https://graph.facebook.com/v21.0/${this.env.PIXEL_ID}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.env.FB_ACCESS_TOKEN },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
      });
      result = await response.json();
      if (response.ok && result.events_received === 1 && !result.error) return this.finish(job, 'delivered');
    } catch { /* Network and malformed responses are retried with the same ID. */ }
    const errorCode = Number(result?.error?.code) || response?.status || 0;
    // Meta can return transient errors as HTTP 400; honor its explicit retry flag.
    if (response && response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status) && !result?.error?.is_transient && ![1, 2, 4, 17, 32, 613].includes(errorCode)) {
      return this.finish(job, 'failed', 'meta_' + errorCode);
    }
    job.last_error = 'meta_' + errorCode;
    await this.ctx.storage.transaction(async txn => {
      await txn.put('job', job);
      await txn.setAlarm(Math.min(job.expires_at, Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(job.attempts - 1, 6))));
    });
  }
  async finish(job, state, last_error) {
    // Keep only the deduplication tombstone, never contact hashes after delivery.
    await this.ctx.storage.transaction(async txn => {
      await txn.put('job', { event_id: job.event_id, state, attempts: job.attempts, last_error });
      await txn.setAlarm(Date.now() + RETENTION);
    });
    if (state === 'failed') console.error('Purchase delivery failed', { event_id: job.event_id, code: last_error });
  }
}
