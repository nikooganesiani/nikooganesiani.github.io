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
    list.innerHTML = '<div class="modal-empty flex flex-col items-center pt-6 pr-2 pb-4 pl-2 text-center [&_h3]:mt-0 [&_h3]:mr-0 [&_h3]:mb-2 [&_h3]:ml-0 [&_h3]:text-[#374151] [&_h3]:text-[length:16px] [&_h3]:leading-[1.6] [&_h3]:font-semibold [&_p]:max-w-75 [&_p]:mt-0 [&_p]:mr-0 [&_p]:mb-6 [&_p]:ml-0 [&_p]:text-[#637082] [&_p]:text-[length:13px] [&_p]:leading-[1.8]"><span class="flex items-center justify-center w-16 h-16 mb-5 rounded-[20px] bg-[#f3f5f8] text-[#7c8795]" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="m12 2-3.5 1.9 8.7 5L21 7zm-5.5 3L3 7l9 5 3.2-1.8zM2 8.7v9a1 1 0 0 0 .5.9l8.5 4.7V13.7zm11 5v9.6l8.5-4.7a1 1 0 0 0 .5-.9v-9z"/></svg></span><h3>შეკვეთები ჯერ არ გაქვთ</h3><p>გაფორმებული შეკვეთები აქ გამოჩნდება. სხვა მოწყობილობაზე შეკვეთილი ამანათი შეგიძლიათ ნომრით შეამოწმოთ.</p><button type="button" class="[.listing-filter-actions_&]:min-w-0 [.listing-filter-actions_&]:px-3 [.listing-filter-actions_&]:text-[length:14px] inline-flex items-center justify-center gap-2.5 w-full min-h-12.5 py-3 px-4.5 border border-solid rounded-xl text-[length:15px] font-semibold leading-[1.6] cursor-pointer text-center no-underline [transition:background-color_150ms] disabled:bg-[#416fcb] disabled:cursor-wait bg-[#f1f4f8] text-[#334155] border-[#e4e9ef] active:bg-[#e4e9ef] [.modal-empty_&]:w-auto [.modal-empty_&]:min-w-45 [@media(hover:_hover)]:hover:bg-[#e9edf3]" data-close-modal>პროდუქტების ნახვა</button></div>';
    return;
  }
  list.innerHTML = orders.map(order => {
    const date = new Date(order.date || '');
    const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString((window.enkaI18n?.locale || 'ka'), { day: 'numeric', month: 'short', year: 'numeric' });
    const price = String(order.price || '').replace(/₾/g, '').trim();
    return '<article class="py-4.5 px-0 border-b border-solid border-b-[#edf0f3] [overflow-wrap:anywhere] [&:first-child]:pt-0 [&:last-child]:pb-0 [&:last-child]:border-b-0"><div class="flex items-baseline justify-between flex-wrap gap-2 mb-2 text-[#637082] text-[length:12px]"><span>' + escape(dateText) + '</span><span class="text-[#202a37] text-[length:16px] font-semibold whitespace-nowrap">' + escape(price ? price + ' ₾' : '—') + '</span></div><h3 class="modal-order-name m-0 text-[length:14px] font-semibold leading-[1.7]">' + escape(order.product || '') + '</h3><p class="notranslate mt-1.5 mr-0 mb-0 ml-0 text-[#637082] text-[length:12px] leading-[1.7]" translate="no">' + escape(order.name || '') + ' · ' + escape(order.phone || '') + '</p></article>';
  }).join('');
}
window.renderOrders = renderOrders;
window.openOrders = function(event) {
  event?.preventDefault?.();
  renderOrders();
  window.openAppModal?.('ordersModal', event?.currentTarget);
};
