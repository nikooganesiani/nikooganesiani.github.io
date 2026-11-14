const statusMap = { 'ასაღები': 'შეკვეთა მზად არის', 'საწყობშია': 'მივიდა საწყობში', 'გატანილია ჩასაბარებლად': 'კურიერი გზაშია', 'ჩაბარებულია': 'ჩაბარებულია' };
const statusOrder = [ 'ასაღები', 'საწყობშია', 'გატანილია ჩასაბარებლად', 'ჩაბარებულია' ];
let trackingController;
let trackingRevision = 0;

function resetTrackingRequest() {
    ++trackingRevision;
    trackingController?.abort();
    trackingController = null;
    const button = document.getElementById('trackingCheckBtn');
    if (button) {
        button.disabled = false;
        button.textContent = 'შემოწმება';
        button.removeAttribute('aria-busy');
    }
}

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
        box: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="m12 2-3.5 1.9 8.7 5L21 7zm-5.5 3L3 7l9 5 3.2-1.8zM2 8.7v9a1 1 0 0 0 .5.9l8.5 4.7V13.7zm11 5v9.6l8.5-4.7a1 1 0 0 0 .5-.9v-9z"/></svg>',
        truck: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h.2a3 3 0 0 0 5.6 0h6.4a3 3 0 0 0 5.6 0H22a1 1 0 0 0 1-1v-4a1 1 0 0 0-.3-.7l-4-4A1 1 0 0 0 18 7h-3V5a1 1 0 0 0-1-1zm12 5v4h6l-4-4zm-9 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2m12 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2" clip-rule="evenodd"/></svg>',
        check: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20.7 5.3a1 1 0 0 1 0 1.4l-11 11a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.4l4.3 4.3L19.3 5.3a1 1 0 0 1 1.4 0"/></svg>',
        clock: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 4h-2v7l5 3 1-1.7-4-2.4z" clip-rule="evenodd"/></svg>'
    };
    const badgeMap = {
        'ჩაბარებულია': { class: 'bg-[color:light-dark(var(--color-green-50),var(--color-night-success-surface))] text-[color:light-dark(var(--color-green-800),var(--color-night-success))]', icon: icons.check, text: 'ჩაბარებულია' },
        'ასაღები': { class: 'bg-[color:light-dark(var(--color-blue-50),var(--color-night-blue))] text-[color:light-dark(var(--color-blue-800),var(--color-accent))]', icon: icons.clock, text: 'მზად არის' },
        'საწყობშია': { class: 'bg-[color:light-dark(var(--color-blue-50),var(--color-night-blue))] text-[color:light-dark(var(--color-blue-800),var(--color-accent))]', icon: icons.box, text: 'საწყობშია' },
        'გატანილია ჩასაბარებლად': { class: 'bg-[color:light-dark(var(--color-amber-50),var(--color-night-warning-surface))] text-[color:light-dark(var(--color-amber-800),var(--color-night-warning))]', icon: icons.truck, text: 'გზაშია' }
    };
    const badge = badgeMap[statusName] || { class: 'bg-[color:light-dark(var(--color-slate-100),var(--color-night-surface))] text-[color:light-dark(var(--color-slate-700),var(--color-night-copy))]', icon: icons.box, text: window.escapeHTML(statusName || 'უცნობი') };
    return `<span class="inline-flex items-center px-4 py-2 rounded-full text-[0.85rem] font-bold leading-none ${badge.class}">${iconBox(badge.icon)} ${badge.text}</span>`;
}

window.openTracking = function(id = '', updateURL = true) {
    resetTrackingRequest();
    const url = new URL(window.location);
    if (id) { url.searchParams.set('orderstatus', id); } else { url.searchParams.set('orderstatus', ''); }
    if (updateURL && url.href !== window.location.href) history.pushState(null, '', url.pathname + url.search + url.hash);

    window.openAppModal?.('trackingModal');

    const trackingOrderId = document.getElementById('trackingOrderId');
    const trackingResult = document.getElementById('trackingResult');
    if (trackingOrderId) trackingOrderId.value = id;
    trackingOrderId?.removeAttribute('aria-invalid');
    if (trackingResult) {
        trackingResult.hidden = true;
        trackingResult.innerHTML = '';
    }
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
    document.getElementById('trackingModal')?.addEventListener('modal:close', resetTrackingRequest);

    if (trackingCheckBtn) {
        trackingCheckBtn.addEventListener('click', async () => {
            if (trackingCheckBtn.disabled) return;
            let orderIdInput = trackingOrderId?.value?.trim() || '';
            if (!orderIdInput) {
                trackingOrderId?.setAttribute('aria-invalid', 'true');
                if (trackingResult) {
                    trackingResult.hidden = false;
                    trackingResult.textContent = 'გთხოვთ, შეიყვანოთ შეკვეთის ნომერი.';
                }
                trackingOrderId?.focus();
                return;
            }
            trackingOrderId?.removeAttribute('aria-invalid');
            const url = new URL(window.location);
            url.searchParams.set('orderstatus', orderIdInput);
            history.replaceState(null, '', url.pathname + url.search + url.hash);

            let apiOrderId = orderIdInput;
            if (!apiOrderId.toUpperCase().startsWith('TNENKAELECTRONICS')) {
                apiOrderId = 'TNENKAElectronics' + apiOrderId;
            }

            if (trackingResult) {
                trackingResult.hidden = true;
                trackingResult.innerHTML = '';
            }
            trackingCheckBtn.disabled = true;
            trackingCheckBtn.setAttribute('aria-busy', 'true');
            trackingCheckBtn.innerHTML = '<span class="inline-flex items-center gap-2.5"><span class="w-4.5 h-4.5 border-[2px] border-solid border-[rgb(255_255_255_/_.4)] [border-top-color:#fff] rounded-[50%] animate-spin [animation-duration:.8s] motion-reduce:animate-none motion-reduce:border-canvas motion-reduce:border-dotted" aria-hidden="true"></span>მოწმდება…</span>';
            const revision = ++trackingRevision;
            const controller = new AbortController();
            trackingController = controller;
            const timeout = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch(window.WORKER_URL_TRACKING, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: apiOrderId })
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (revision !== trackingRevision) return;

                if (trackingResult) trackingResult.hidden = false;
                if (data.error || !data.data || !Array.isArray(data.data) || data.data.length === 0 || !data.data[0]) {
                    if (trackingResult) {
                        trackingResult.innerHTML = '<div class="p-3.5 border border-solid border-[color:light-dark(#e2e8f0,var(--color-night-line))] rounded-xl bg-[color:light-dark(#f7f8fa,var(--color-night-surface))] text-[color:light-dark(#475569,var(--color-night-copy))] text-[length:13px] leading-[1.8]">შეკვეთა ვერ მოიძებნა. შეამოწმეთ ნომერი და სცადეთ ხელახლა.</div>';
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
                    timelineHtml += `<div class="flex items-stretch min-h-[50px] group/step ${stepClass}"><div class="flex flex-col items-center mr-4 w-[14px]"><div class="w-3 h-3 rounded-full border-2 border-transparent bg-[color:light-dark(var(--color-slate-200),var(--color-night-surface))] z-10 shrink-0 group-[.past]/step:bg-slate-400 group-[.current]/step:bg-blue-600"></div><div class="w-[2px] bg-[color:light-dark(var(--color-slate-200),var(--color-night-surface))] flex-grow my-1 group-last/step:hidden group-[.past]/step:bg-slate-400"></div></div><div class="pb-6 flex flex-col justify-start -mt-[3px]"><div class="text-[0.75rem] font-bold text-[color:light-dark(var(--color-slate-500),var(--color-night-muted))] mb-1 group-[.current]/step:text-[color:light-dark(var(--color-blue-600),var(--color-accent))]">${dateStr}</div><div class="text-[0.95rem] font-semibold text-[color:light-dark(var(--color-slate-800),var(--color-night-ink))] group-[.current]/step:text-[color:light-dark(var(--color-slate-900),var(--color-night-ink))]">${statusMap[status] || status}</div></div></div>`;
                });

                if (trackingResult) {
                    trackingResult.innerHTML = `<div class="bg-[color:light-dark(var(--color-slate-50),var(--color-night-surface))] p-6 rounded-2xl border border-[color:light-dark(var(--color-slate-200),var(--color-night-line))]"><p class="text-[0.85rem] font-bold text-[color:light-dark(var(--color-slate-500),var(--color-night-muted))] mb-4 text-center uppercase tracking-wider">შეკვეთა #<span class="notranslate" translate="no">${window.escapeHTML(order.tracking_code || orderIdInput)}</span></p><div class="text-center mb-8">${getStatusBadge(currentStatus)}</div><div class="flex flex-col w-full mt-6">${timelineHtml}</div></div>`;
                }
            } catch (error) {
                if (revision !== trackingRevision) return;
                if (trackingResult) {
                    trackingResult.hidden = false;
                    trackingResult.textContent = 'სტატუსის შემოწმება ვერ მოხერხდა. გთხოვთ, სცადოთ ხელახლა.';
                }
            } finally {
                clearTimeout(timeout);
                if (revision === trackingRevision) {
                    trackingController = null;
                    trackingCheckBtn.disabled = false;
                    trackingCheckBtn.removeAttribute('aria-busy');
                    trackingCheckBtn.textContent = 'შემოწმება';
                    const modal = document.getElementById('trackingModal');
                    if (modal?.classList.contains('active') && !modal.contains(document.activeElement)) trackingCheckBtn.focus({ preventScroll: true });
                }
            }
        });

        if (trackingOrderId) {
            trackingOrderId.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') trackingCheckBtn.click();
            });
        }
    }
});

window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('orderstatus')) window.openTracking(params.get('orderstatus') || '', false);
    else window.closeAppModal?.('trackingModal');
});
