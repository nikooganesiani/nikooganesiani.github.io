function renderOrders() {
    try {
        const list = document.getElementById('ordersList');
        const ordersRaw = localStorage.getItem('myOrders');
        const orders = ordersRaw ? JSON.parse(ordersRaw) : [];
        const countEl = document.getElementById('ordersModalCount');

        if (countEl) {
            countEl.innerText = orders.length > 0 ? `(${orders.length})` : '';
        }

        if (!list) return;

        if (!orders || orders.length === 0) {
            list.innerHTML = `
                <div class="text-center text-slate-400 py-12 font-semibold">
                    <svg class="w-16 h-16 mx-auto mb-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
                        <path d="m3.3 7 8.7 5 8.7-5"></path>
                        <path d="M12 22V12"></path>
                    </svg>
                    <br>შეკვეთები არ გაქვთ
                </div>`;
            return;
        }

        list.innerHTML = orders.map((o) => {
            if (!o) return '';
            const d = o.date ? new Date(o.date) : new Date();
            const dateStr = !isNaN(d.getTime())
                ? d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                : '';
            const priceFixed = String(o.price || '').includes('₾') ? o.price : `${String(o.price || '').trim()} ₾`;
            const oldPHtml = (o.oldPrice && o.oldPrice !== 'null' && !String(o.oldPrice).includes('undefined'))
                ? `<span class="text-[0.8rem] text-slate-400 line-through decoration-red-500 font-bold ml-1.5">${o.oldPrice}</span>`
                : '';

            return `
                <div class="flex flex-col gap-0 bg-transparent border-b border-slate-200 py-4 px-2 relative items-start transition-all duration-200 last:border-none">
                    <div class="flex justify-between w-full pb-1 mb-1">
                        <span class="text-[0.8rem] text-slate-500 font-semibold">${dateStr}</span>
                        <span class="text-[1rem] text-blue-600 font-bold flex items-center">${priceFixed} ${oldPHtml}</span>
                    </div>
                    <div class="whitespace-normal leading-snug text-[0.9rem] font-bold text-slate-900">${o.product || ''}</div>
                    <div class="text-[0.8rem] text-slate-500 mt-1 font-semibold">${o.name || ''} • ${o.phone || ''}</div>
                </div>`;
        }).join('');
    } catch (error) {
        console.error('Error rendering orders:', error);
    }
}

window.renderOrders = renderOrders;

window.openOrders = function(e) {
    if (e?.preventDefault) e.preventDefault();
    renderOrders();
    window.openAppModal?.('ordersModal');
};
