function renderOrders() {
  const list = document.getElementById('ordersList');
  if (!list) return;
  let orders;
  try { orders = JSON.parse(localStorage.getItem('myOrders') || '[]'); } catch { orders = []; }
  orders = Array.isArray(orders) ? orders.filter(order => order && typeof order === 'object') : [];
  const escape = window.escapeHTML;
  const count = document.getElementById('ordersModalCount');
  if (count) count.textContent = orders.length ? '(' + orders.length + ')' : '';
  if (!orders.length) {
    list.replaceChildren(document.getElementById("ordersEmpty").content.cloneNode(true));
    return;
  }
  list.innerHTML = orders.map(order => {
    const date = new Date(order.date || '');
    const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString((window.enkaI18n?.locale || 'ka'), { day: 'numeric', month: 'short', year: 'numeric' });
    const price = String(order.price || '').replace(/₾/g, '').trim();
    return '<article class="rounded-card bg-page p-4 wrap-anywhere"><div class="flex items-baseline justify-between flex-wrap gap-2 mb-2 text-[color:light-dark(#637082,var(--color-night-copy))] text-[length:12px]"><span>' + escape(dateText) + '</span><span class="text-[color:light-dark(#202a37,var(--color-night-ink))] text-[length:16px] font-semibold whitespace-nowrap">' + escape(price ? price + ' ₾' : '—') + '</span></div><h3 class="modal-order-name m-0 text-[length:14px] font-semibold leading-[1.7]">' + escape(order.product || '') + '</h3><p class="notranslate mt-1.5 mr-0 mb-0 ml-0 text-[color:light-dark(#637082,var(--color-night-copy))] text-[length:12px] leading-[1.7]" translate="no">' + [order.name, order.phone].filter(Boolean).map(escape).join(' · ') + '</p></article>';
  }).join('');
}
window.renderOrders = renderOrders;
window.openOrders = function(event) {
  event?.preventDefault?.();
  renderOrders();
  window.openAppModal?.('ordersModal', event?.currentTarget);
};
