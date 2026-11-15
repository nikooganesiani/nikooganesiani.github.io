import legacy from './legacy.mjs';
import { acceptOrderRequest } from './purchase.mjs';
export { PurchaseDelivery } from './purchase.mjs';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/server/')) return acceptOrderRequest(request, env);
    if (env.SERVER_PURCHASE_ONLY === 'true' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => null);
      if (body?.event_name === 'Purchase') return Response.json({ error: 'Purchase requires a signed backend event' }, { status: 403 });
    }
    return legacy.fetch(request, env, ctx);
  }
};
