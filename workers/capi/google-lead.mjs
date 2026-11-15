const RETENTION = 90 * 86400000;
const MAX_AGE = 72 * 3600000;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function googleLead(order, now = Date.now()) {
  const m = order?.measurement;
  if (order?.google_delivery !== 'server' || m?.google_server_capable !== true || m?.consent?.analytics_storage !== 'granted'
    || m?.consent?.ad_user_data !== 'granted') throw Error('Google consent missing');
  const client = m.google?.client_id, session = m.google?.session_id;
  if (typeof client !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(client)
    || typeof session !== 'string' || !/^\d{1,16}$/.test(session) || !Number.isSafeInteger(Number(session))) throw Error('Google identifiers missing');
  if (typeof order.order_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(order.order_id)) throw Error('Invalid order_id');
  const created = Date.parse(order.created_at);
  if (!Number.isFinite(created) || created > now + 60000 || now - created >= 7 * 86400000) throw Error('Invalid Google event time');
  if (order.currency !== 'GEL' || !Number.isFinite(order.value) || order.value <= 0) throw Error('Invalid Google value');
  // Contact fields and Meta/IP/UA context never enter the Google payload.
  return { client_id: client, timestamp_micros: created * 1000,
    consent: { ad_user_data: 'GRANTED', ad_personalization: m.consent.ad_personalization === 'granted' ? 'GRANTED' : 'DENIED' },
    events: [{ name: 'generate_lead', params: { currency: 'GEL', value: order.value,
      session_id: Number(session), event_id: 'lead_' + order.order_id,
      lead_source: 'website_order', delivery_source: 'server' } }] };
}

// MP has no documented idempotency key for generate_lead. Persist the send attempt
// before I/O; uncertain outcomes require review, never blind automatic resending.
export class GoogleLeadDelivery {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    if (new URL(request.url).pathname === '/status') {
      const job = await this.ctx.storage.get('job');
      return job ? json({ state: job.state, event_id: job.event_id, last_error: job.last_error }) : json({ error: 'Not found' }, 404);
    }
    const payload = await request.json(); let duplicate = false;
    const job = await this.ctx.storage.transaction(async txn => {
      const existing = await txn.get('job'); if (existing) { duplicate = true; return existing; }
      const job = { state: 'pending', event_id: payload.events[0].params.event_id, payload };
      await txn.put('job', job); await txn.setAlarm(Date.now() + 1000); return job;
    });
    return json({ ok: true, event_id: job.event_id, state: job.state, duplicate }, duplicate ? 200 : 202);
  }
  async alarm() {
    const job = await this.ctx.storage.get('job'); if (!job) return;
    if (job.state === 'sending') return this.finish(job, 'uncertain', 'interrupted_send');
    if (job.state !== 'pending') { await this.ctx.storage.deleteAll(); return; }
    if (!this.env.GA4_API_SECRET || !/^G-[A-Z0-9]+$/.test(this.env.GA4_MEASUREMENT_ID || '')) return this.finish(job, 'failed', 'configuration_missing');
    if (Date.now() - job.payload.timestamp_micros / 1000 >= MAX_AGE) return this.finish(job, 'failed', 'event_expired');
    await this.ctx.storage.transaction(async txn => {
      await txn.put('job', { ...job, state: 'sending' });
      await txn.setAlarm(Date.now() + 60000);
    });
    try {
      const url = new URL('https://www.google-analytics.com/mp/collect');
      url.searchParams.set('measurement_id', this.env.GA4_MEASUREMENT_ID);
      url.searchParams.set('api_secret', this.env.GA4_API_SECRET);
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job.payload), signal: AbortSignal.timeout(15000), redirect: 'manual' });
      // HTTP receipt is not a claim that GA4 processed or attributed the event.
      return this.finish(job, response.ok ? 'http_accepted' : 'failed', response.ok ? undefined : 'http_' + response.status);
    } catch { return this.finish(job, 'uncertain', 'network_outcome_unknown'); }
  }
  async finish(job, state, last_error) {
    await this.ctx.storage.transaction(async txn => {
      await txn.put('job', { state, event_id: job.event_id, last_error });
      await txn.setAlarm(Date.now() + RETENTION);
    });
    if (state !== 'http_accepted') console.error('Google lead needs review', { event_id: job.event_id, state, code: last_error });
  }
}
