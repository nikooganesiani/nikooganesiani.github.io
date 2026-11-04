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
    list.innerHTML = '<div class="modal-empty"><span class="modal-empty-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v9"/></svg></span><h3>შეკვეთები ჯერ არ გაქვთ</h3><p>გაფორმებული შეკვეთები აქ გამოჩნდება. სხვა მოწყობილობაზე შეკვეთილი ამანათი შეგიძლიათ ნომრით შეამოწმოთ.</p><button type="button" class="modal-button modal-button--secondary" data-close-modal>პროდუქტების ნახვა</button></div>';
    return;
  }
  list.innerHTML = orders.map(order => {
    const date = new Date(order.date || '');
    const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ka-GE', { day: 'numeric', month: 'short', year: 'numeric' });
    const price = String(order.price || '').replace(/₾/g, '').trim();
    return '<article class="modal-order"><div class="modal-order-meta"><span>' + escape(dateText) + '</span><span class="modal-order-price">' + escape(price ? price + ' ₾' : '—') + '</span></div><h3 class="modal-order-name">' + escape(order.product || '') + '</h3><p class="modal-order-contact">' + escape(order.name || '') + ' · ' + escape(order.phone || '') + '</p></article>';
  }).join('');
}
window.renderOrders = renderOrders;
window.openOrders = function(event) {
  event?.preventDefault?.();
  renderOrders();
  window.openAppModal?.('ordersModal', event?.currentTarget);
};
