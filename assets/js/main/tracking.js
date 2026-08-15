const statusMap = { 'ასაღები': 'შეკვეთა მზად არის', 'საწყობშია': 'მივიდა საწყობში', 'გატანილია ჩასაბარებლად': 'კურიერი გზაშია', 'ჩაბარებულია': 'ჩაბარებულია' };
const statusOrder = [ 'ასაღები', 'საწყობშია', 'გატანილია ჩასაბარებლად', 'ჩაბარებულია' ];

function parseGeorgianDate(dateStr) {
    if (!dateStr) return null;
    try { 
        const parts = String(dateStr).trim().split(' '); 
        const dateParts = parts[0].split(/[./-]/); 
        if (dateParts.length === 3) { 
            const day = parseInt(dateParts[0]), month = parseInt(dateParts[1]) - 1, year = parseInt(dateParts[2]); 
            let hours = 0, minutes = 0; 
            if (parts.length > 1 && parts[1]) { 
                const timeParts = parts[1].split(':'); 
                if (timeParts.length >= 2) { hours = parseInt(timeParts[0]); minutes = parseInt(timeParts[1]); } 
            } 
            const d = new Date(year, month, day, hours, minutes); 
            return isNaN(d.getTime()) ? null : d; 
        } 
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) { return null; }
}

function getStatusBadge(statusName) {
    const iconBox = (svg) => `<span class="inline-flex mr-2">${svg}</span>`;
    const icons = { 
        box: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>', 
        truck: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>', 
        check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>', 
        clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' 
    };
    const badgeMap = { 
        'ჩაბარებულია': { class: 'bg-green-400/15 text-green-400', icon: icons.check, text: 'ჩაბარებულია' }, 
        'ასაღები': { class: 'bg-blue-400/15 text-blue-400', icon: icons.clock, text: 'მზად არის' }, 
        'საწყობშია': { class: 'bg-blue-400/15 text-blue-400', icon: icons.box, text: 'საწყობშია' }, 
        'გატანილია ჩასაბარებლად': { class: 'bg-yellow-400/15 text-yellow-400', icon: icons.truck, text: 'გზაშია' } 
    };
    const badge = badgeMap[statusName] || { class: 'bg-slate-400/15 text-slate-400', icon: icons.box, text: statusName || 'უცნობი' };
    return `<span class="inline-flex items-center px-4 py-2 rounded-full text-[0.85rem] font-bold leading-none ${badge.class}">${iconBox(badge.icon)} ${badge.text}</span>`;
}

window.openTracking = function(id = '') {
    const url = new URL(window.location);
    if (id) { url.searchParams.set('orderstatus', id); } else { url.searchParams.set('orderstatus', ''); }
    history.pushState(null, '', url.pathname + '?orderstatus' + (id ? '=' + id : ''));
    
    window.openAppModal?.('trackingModal');
    
    const trackingOrderId = document.getElementById('trackingOrderId');
    const trackingResult = document.getElementById('trackingResult');
    if (trackingOrderId) trackingOrderId.value = id;
    if (trackingResult) {
        trackingResult.style.display = 'none';
        trackingResult.innerHTML = '';
    }
    if (!id && trackingOrderId) setTimeout(() => trackingOrderId.focus(), 100);
};

document.addEventListener('DOMContentLoaded', () => {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.has('orderstatus')) {
            const orderId = params.get('orderstatus');
            window.openTracking?.(orderId);
            if (orderId) {
                setTimeout(() => {
                    document.getElementById('trackingCheckBtn')?.click();
                }, 400);
            }
        }
    } catch(e) { console.error(e); }

    const footerTrackingBtn = document.getElementById('footerTrackingBtn');
    if (footerTrackingBtn) {
        footerTrackingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.openTracking();
        });
    }

    const trackingCheckBtn = document.getElementById('trackingCheckBtn');
    const trackingOrderId = document.getElementById('trackingOrderId');
    const trackingResult = document.getElementById('trackingResult');

    if (trackingCheckBtn) {
        trackingCheckBtn.addEventListener('click', async () => {
            let orderIdInput = trackingOrderId?.value?.trim() || '';
            if (!orderIdInput) {
                alert('გთხოვთ, შეიყვანოთ შეკვეთის ნომერი.');
                return;
            }
            const url = new URL(window.location);
            history.pushState(null, '', url.pathname + '?orderstatus=' + encodeURIComponent(orderIdInput));
            
            let apiOrderId = orderIdInput;
            if (!apiOrderId.toUpperCase().startsWith('TNENKAELECTRONICS')) {
                apiOrderId = 'TNENKAElectronics' + apiOrderId;
            }
            
            if (trackingResult) {
                trackingResult.style.display = 'none';
                trackingResult.innerHTML = '';
            }
            trackingCheckBtn.disabled = true;
            trackingCheckBtn.innerHTML = '<div class="animate-spin rounded-full border-[3px] border-white/30 border-t-white w-6 h-6 mx-auto"></div>';

            try {
                const response = await fetch(window.WORKER_URL_TRACKING, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: apiOrderId })
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                
                if (trackingResult) trackingResult.style.display = 'block';
                if (data.error || !data.data || !Array.isArray(data.data) || data.data.length === 0 || !data.data[0]) {
                    if (trackingResult) {
                        trackingResult.innerHTML = `<div class="flex items-center justify-center gap-2 bg-red-500/10 text-red-500 p-4 rounded-xl text-[0.9rem] font-semibold animate-[fadeIn_0.3s_ease]"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> ვერ მოიძებნა. შეამოწმეთ ნომერი.</div>`;
                    }
                    return;
                }

                const order = data.data[0];
                const currentStatus = order.statusName || 'უცნობი';
                const trackingEvents = [];
                const addDate = parseGeorgianDate(order.formatted_add_date);
                if (addDate) trackingEvents.push({ status: 'ასაღები', created_at: addDate.toISOString() });
                const safeDate = (dateString) => parseGeorgianDate(dateString) || new Date();
                
                if (currentStatus === 'საწყობშია' || currentStatus === 'გატანილია ჩასაბარებლად' || currentStatus === 'ჩაბარებულია') {
                    let d = safeDate(order.delivery_date);
                    trackingEvents.push({ status: 'საწყობშია', created_at: d.toISOString() });
                }
                if (currentStatus === 'გატანილია ჩასაბარებლად' || currentStatus === 'ჩაბარებულია') {
                    let d = safeDate(order.delivery_date);
                    trackingEvents.push({ status: 'გატანილია ჩასაბარებლად', created_at: d.toISOString() });
                }
                if (currentStatus && !trackingEvents.some(ev => ev.status === currentStatus)) {
                    let d = safeDate(order.delivery_date);
                    trackingEvents.push({ status: currentStatus, created_at: d.toISOString() });
                }

                trackingEvents.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
                const lastStatus = trackingEvents.length > 0 ? trackingEvents[trackingEvents.length - 1].status : null;
                const statusDateMap = {};
                trackingEvents.forEach(ev => { statusDateMap[ev.status] = ev.created_at; });

                let timelineHtml = '';
                statusOrder.forEach((status) => {
                    const hasEvent = statusDateMap[status] !== undefined;
                    const isPast = hasEvent && status !== lastStatus;
                    const isCurrent = status === lastStatus;
                    let stepClass = 'future';
                    if (isPast) stepClass = 'past';
                    else if (isCurrent) stepClass = 'current';
                    let dateStr = hasEvent ? new Date(statusDateMap[status]).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '—';
                    timelineHtml += `<div class="flex items-stretch min-h-[50px] group/step ${stepClass}"><div class="flex flex-col items-center mr-4 w-[14px]"><div class="w-3 h-3 rounded-full border-2 border-transparent bg-slate-200 z-10 shrink-0 group-[.past]/step:bg-slate-400 group-[.current]/step:bg-blue-600"></div><div class="w-[2px] bg-slate-200 flex-grow my-1 group-last/step:hidden group-[.past]/step:bg-slate-400"></div></div><div class="pb-6 flex flex-col justify-start -mt-[3px]"><div class="text-[0.75rem] font-bold text-slate-500 mb-1 group-[.current]/step:text-blue-600">${dateStr}</div><div class="text-[0.95rem] font-semibold text-slate-800 group-[.current]/step:text-slate-900">${statusMap[status] || status}</div></div></div>`;
                });

                if (trackingResult) {
                    trackingResult.innerHTML = `<div class="bg-slate-50 p-6 rounded-2xl border border-slate-200"><p class="text-[0.85rem] font-bold text-slate-500 mb-4 text-center uppercase tracking-wider">შეკვეთა #${order.tracking_code || orderIdInput}</p><div class="text-center mb-8">${getStatusBadge(currentStatus)}</div><div class="flex flex-col w-full mt-6">${timelineHtml}</div></div>`;
                }
            } catch (error) {
                if (trackingResult) {
                    trackingResult.style.display = 'block';
                    trackingResult.innerHTML = `<div class="flex items-center justify-center gap-2 bg-red-500/10 text-red-500 p-4 rounded-xl text-[0.9rem] font-semibold animate-[fadeIn_0.3s_ease]"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> სერვერის შეცდომა. (იხ. კონსოლი)</div>`;
                }
            } finally {
                trackingCheckBtn.disabled = false;
                trackingCheckBtn.textContent = 'შემოწმება';
            }
        });

        if (trackingOrderId) {
            trackingOrderId.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') trackingCheckBtn.click();
            });
        }
    }
});
