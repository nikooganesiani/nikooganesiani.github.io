import legacy from './legacy.mjs';
import { acceptOrderRequest } from './purchase.mjs';
import { proxyOrder } from './order-proxy.mjs';
export { PurchaseDelivery } from './purchase.mjs';
export { GoogleLeadDelivery } from './google-lead.mjs';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/orders') return proxyOrder(request, env);
    if (path.startsWith('/server/')) return acceptOrderRequest(request, env);
    if (env.SERVER_PURCHASE_ONLY === 'true' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => null);
      if (body?.event_name === 'Purchase') return Response.json({ error: 'Purchase requires a signed backend event' }, { status: 403 });
    }
    return legacy.fetch(request, env, ctx);
  }
};
