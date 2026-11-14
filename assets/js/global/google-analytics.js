(() => {
  'use strict';
  const id = document.getElementById('enka-google-analytics')?.dataset.measurementId || '';
  if (!/^G-[A-Z0-9]+$/.test(id)) return;
  // Keep development traffic out of the production property.
  if (!['enkaelectronics.com.ge', 'www.enkaelectronics.com.ge'].includes(location.hostname)) return;
  window.dataLayer = window.dataLayer || [];
  const gtag = window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  gtag('consent', 'default', denied);
  let loaded = false;
  let viewSent = false;
  const orders = new Set();
  const checkouts = new Set();
  const allowed = () => window.enkaPrivacy?.allowsAnalytics() === true;
  // Only campaign identifiers are allowed in URLs; never send arbitrary search/form text.
  function cleanUrl(raw) {
    try {
      const url = new URL(raw);
      const params = new URLSearchParams();
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term', 'gclid', 'dclid', 'gbraid', 'wbraid']) {
        const value = url.searchParams.get(key);
        if (value && !/@|%40|\+?995[\s-]*5\d{8}/i.test(value)) params.set(key, value.slice(0, 200));
      }
      return url.origin + url.pathname + (params.size ? '?' + params : '');
    } catch { return ''; }
  }
  function item(product) {
    const price = Number(product?.price);
    if (!product?.id || !Number.isFinite(price) || price <= 0) return null;
    return { item_id: String(product.id), item_name: String(product.name || '').slice(0, 100), price, quantity: 1 };
  }
  function send(name, params) {
    if (!allowed()) return false;
    sync();
    gtag('event', name, { send_to: id, ...params });
    return true;
  }
  function sync() {
    const granted = allowed();
    window['ga-disable-' + id] = !granted;
    if (!granted) {
      if (loaded) gtag('consent', 'update', denied);
      return;
    }
    gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
    if (!loaded) {
      loaded = true;
      const settings = {
        send_page_view: false,
        page_location: cleanUrl(location.href),
        page_referrer: cleanUrl(document.referrer),
        page_title: location.pathname.startsWith('/search') ? 'ENKA Search' : document.title,
        cookie_expires: 15552000,
        cookie_update: false
      };
      // New Google tag containers initialize before legacy config commands.
      // Set defaults before loading the container, including the page-view opt-out.
      gtag('set', settings);
      gtag('js', new Date());
      gtag('config', id, settings);
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
      document.head.appendChild(script);
      gtag('event', 'page_view', { send_to: id });
    }
    if (!viewSent) {
      const data = document.getElementById('productData')?.dataset;
      const product = item(data);
      if (product) {
        viewSent = true;
        gtag('event', 'view_item', { send_to: id, currency: 'GEL', value: product.price, items: [product] });
      }
    }
  }
  window.enkaGoogleAnalytics = Object.freeze({
    beginCheckout(product) {
      const data = item(product);
      if (!data || !allowed() || checkouts.has(data.item_id)) return;
      if (send('begin_checkout', { currency: 'GEL', value: data.price, items: [data] })) checkouts.add(data.item_id);
    },
    orderAccepted(product, eventId) {
      const data = item(product);
      if (!data || !eventId || !allowed() || orders.has(eventId)) return;
      // COD order acceptance is a lead, not collected revenue. Never pass contact fields.
      if (send('generate_lead', { currency: 'GEL', value: data.price, event_id: String(eventId), items: [data], lead_source: 'website_order' })) orders.add(eventId);
    }
  });
  window.addEventListener('enka:privacy-change', sync);
  // Stop Google's automatic events too if consent expires in an open tab.
  window.addEventListener('focus', sync);
  setInterval(sync, 60000);
  document.addEventListener('DOMContentLoaded', sync);
  sync();
})();
