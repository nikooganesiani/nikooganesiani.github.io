const statusMap = { 'ასაღები': 'შეკვეთა მზად არის', 'საწყობშია': 'მივიდა საწყობში', 'გატანილია ჩასაბარებლად': 'კურიერი გზაშია', 'ჩაბარებულია': 'ჩაბარებულია' };
const statusOrder = [ 'ასაღები', 'საწყობშია', 'გატანილია ჩასაბარებლად', 'ჩაბარებულია' ];
let trackingController;
let trackingRevision = 0;
let trackingInitialized = false;

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
    const feedback = document.getElementById('trackingFeedback');
    if (feedback) feedback.textContent = '';
}

function parseGeorgianDate(dateStr) {
    if (!dateStr) return null;
    try {
        const parts = String(dateStr).trim().split(' ');
        const dateParts = parts[0].split(/[./-]/);
        if (dateParts.length === 3 && dateParts[2].length === 4) {
            const day = parseInt(dateParts[0]), month = parseInt(dateParts[1]) - 1, year = parseInt(dateParts[2]);
            let hours = 0, minutes = 0;
            if (parts.length > 1 && parts[1]) {
                const timeParts = parts[1].split(':');
                if (timeParts.length >= 2) { hours = parseInt(timeParts[0]); minutes = parseInt(timeParts[1]); }
            }
            const d = new Date(year, month, day, hours, minutes);
            return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
        }
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) { return null; }
}

function getStatusBadge(statusName) {
    const iconBox = (svg) => `<span class="inline-flex mr-2">${svg}</span>`;
    const icons = {
        box: window.EnkaIcons?.render('package', 18, 'auto', '') || '',
        truck: window.EnkaIcons?.render('truck', 18, 'loop', '') || '',
        check: window.EnkaIcons?.render('check', 18, 'auto', '') || '',
        clock: window.EnkaIcons?.render('clock', 18, 'auto', '') || ''
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

window.openTracking = function(id = '', updateURL = true, trigger) {
    initializeTracking();
    resetTrackingRequest();
    const url = new URL(window.location);
    if (id) { url.searchParams.set('orderstatus', id); } else { url.searchParams.set('orderstatus', ''); }
    if (updateURL && url.href !== window.location.href) history.pushState(history.state, '', url.pathname + url.search + url.hash);

    const trackingOrderId = document.getElementById('trackingOrderId');
    const trackingResult = document.getElementById('trackingResult');
    if (trackingOrderId) trackingOrderId.value = id;
    trackingOrderId?.removeAttribute('aria-invalid');
    if (trackingResult) {
        trackingResult.hidden = true;
        trackingResult.innerHTML = '';
    }
    window.openAppModal?.('trackingModal', trigger);
    if (id) document.getElementById('trackingCheckBtn')?.click();
};

function initializeTracking() {
    if (trackingInitialized) return;
    trackingInitialized = true;
    const trackingCheckBtn = document.getElementById('trackingCheckBtn');
    const trackingOrderId = document.getElementById('trackingOrderId');
    const trackingResult = document.getElementById('trackingResult');
    const feedback = document.getElementById('trackingFeedback');
    const announce = message => { if (feedback) feedback.textContent = message; };
    const modal = document.getElementById('trackingModal');
    modal?.addEventListener('modal:close', () => {
        resetTrackingRequest();
        const url = new URL(window.location);
        if (url.searchParams.has('orderstatus')) {
            url.searchParams.delete('orderstatus');
            history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        }
    });
    trackingOrderId?.addEventListener('input', () => {
        resetTrackingRequest();
        trackingOrderId.removeAttribute('aria-invalid');
        if (trackingResult) trackingResult.hidden = true;
    });

    if (trackingCheckBtn) {
        trackingCheckBtn.addEventListener('click', async () => {
            if (trackingCheckBtn.disabled || !modal?.classList.contains('active')) return;
            let orderIdInput = trackingOrderId?.value?.trim() || '';
            if (!orderIdInput) {
                trackingOrderId?.setAttribute('aria-invalid', 'true');
                if (trackingResult) {
                    trackingResult.hidden = false;
                    trackingResult.textContent = 'გთხოვთ, შეიყვანოთ შეკვეთის ნომერი.';
                }
                announce('გთხოვთ, შეიყვანოთ შეკვეთის ნომერი.');
                trackingOrderId?.focus();
                return;
            }
            trackingOrderId?.removeAttribute('aria-invalid');
            const url = new URL(window.location);
            url.searchParams.set('orderstatus', orderIdInput);
            if (url.href !== window.location.href) history.replaceState(history.state, '', url.pathname + url.search + url.hash);

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
            trackingCheckBtn.innerHTML = '<span class="inline-flex items-center gap-2.5">' + (window.EnkaIcons?.render('loader', 18, 'loop') || '') + 'მოწმდება…</span>';
            announce('მოწმდება…');
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
                        trackingResult.innerHTML = '<div class="p-3.5 rounded-media bg-[color:light-dark(#f7f8fa,var(--color-night-surface))] text-[color:light-dark(#475569,var(--color-night-copy))] text-[length:13px] leading-[1.8]">შეკვეთა ვერ მოიძებნა. შეამოწმეთ ნომერი და სცადეთ ხელახლა.</div>';
                    }
                    announce('შეკვეთა ვერ მოიძებნა. შეამოწმეთ ნომერი და სცადეთ ხელახლა.');
                    return;
                }

                const order = data.data[0];
                const currentStatus = order.statusName || 'უცნობი';
                const currentStep = statusOrder.indexOf(currentStatus);
                const addDate = parseGeorgianDate(order.formatted_add_date);
                const statusDate = parseGeorgianDate(order.delivery_date);
                const locale = window.enkaI18n?.locale || 'ka';
                announce(statusMap[currentStatus] || 'უცნობი');

                let timelineHtml = '';
                statusOrder.forEach((status, index) => {
                    const stepClass = index === currentStep ? 'current' : index < currentStep ? 'past' : 'future';
                    const date = index === 0 ? addDate : index === currentStep ? statusDate : null;
                    const dateStr = date?.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) || '';
                    timelineHtml += `<div class="flex items-stretch min-h-[50px] group/step ${stepClass}"${index === currentStep ? ' aria-current="step"' : ''}><div class="flex flex-col items-center mr-4 w-[14px]"><div class="w-3 h-3 rounded-full border-2 border-transparent bg-[color:light-dark(var(--color-slate-200),var(--color-night-surface))] z-10 shrink-0 group-[.past]/step:bg-slate-400 group-[.current]/step:bg-blue-600"></div><div class="w-[2px] bg-[color:light-dark(var(--color-slate-200),var(--color-night-surface))] flex-grow my-1 group-last/step:hidden group-[.past]/step:bg-slate-400"></div></div><div class="pb-6 flex flex-col justify-start -mt-[3px]"><div class="empty:hidden text-[0.75rem] font-bold text-[color:light-dark(var(--color-slate-500),var(--color-night-muted))] mb-1 group-[.current]/step:text-[color:light-dark(var(--color-blue-600),var(--color-accent))]">${dateStr}</div><div class="text-[0.95rem] font-semibold text-[color:light-dark(var(--color-slate-800),var(--color-night-ink))] group-[.current]/step:text-[color:light-dark(var(--color-slate-900),var(--color-night-ink))]">${statusMap[status] || status}</div></div></div>`;
                });

                if (trackingResult) {
                    trackingResult.innerHTML = `<div class="bg-[color:light-dark(var(--color-slate-50),var(--color-night-surface))] p-6 rounded-card"><p class="text-[0.85rem] font-bold text-[color:light-dark(var(--color-slate-500),var(--color-night-muted))] mb-2"><span class="block">${window.enkaI18n?.t('შეკვეთა #') || 'შეკვეთა #'}</span><bdi class="block mt-1 break-all notranslate" translate="no">${window.escapeHTML(order.tracking_code || orderIdInput)}</bdi></p><div class="mb-4">${getStatusBadge(currentStatus)}</div><div class="flex flex-col w-full border-t border-line pt-5">${timelineHtml}</div></div>`;
                }
            } catch (error) {
                if (revision !== trackingRevision) return;
                if (trackingResult) {
                    trackingResult.hidden = false;
                    trackingResult.textContent = 'სტატუსის შემოწმება ვერ მოხერხდა. გთხოვთ, სცადოთ ხელახლა.';
                }
                announce('სტატუსის შემოწმება ვერ მოხერხდა. გთხოვთ, სცადოთ ხელახლა.');
            } finally {
                clearTimeout(timeout);
                if (revision === trackingRevision) {
                    trackingController = null;
                    trackingCheckBtn.disabled = false;
                    trackingCheckBtn.removeAttribute('aria-busy');
                    trackingCheckBtn.textContent = 'შემოწმება';
                    if (modal.getAttribute('aria-modal') === 'true' && !modal.contains(document.activeElement)) trackingCheckBtn.focus({ preventScroll: true });
                }
            }
        });

        if (trackingOrderId) {
            trackingOrderId.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.isComposing || e.repeat) return;
                e.preventDefault();
                trackingCheckBtn.click();
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('footerTrackingBtn')?.addEventListener('click', (event) => {
        event.preventDefault();
        window.openTracking('', true, event.currentTarget);
    });
    const params = new URLSearchParams(window.location.search);
    if (params.has('orderstatus')) window.openTracking(params.get('orderstatus'), false);
});

window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('orderstatus')) window.openTracking(params.get('orderstatus') || '', false);
    else window.closeAppModal?.('trackingModal');
});
