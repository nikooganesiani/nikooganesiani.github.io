const quickForm = document.getElementById('quickOrderForm');
const quickName = document.getElementById('quickName');
const quickPhone = document.getElementById('quickPhone');

let isQuickOrderSubmitting = false;

// Настройки анти-спама для защиты бота заказов
const ORDER_RATE_LIMIT = {
    MAX_PER_MINUTE: 3,        // Максимум 3 заказа в минуту с одного устройства
    MAX_PER_15_MIN: 5,        // Максимум 5 заказов за 15 минут
    MIN_INTERVAL_MS: 4000,    // Минимум 4 секунды между любыми двумя кликами
    SAME_DATA_TTL_MS: 300000  // 5 минут блокировки на отправку 100% идентичных данных
};

function getOrderHistory() {
    try {
        const raw = localStorage.getItem('_enka_order_guard') || '';
        const parsed = raw ? JSON.parse(raw) : { ts: [], sigs: {} };
        return {
            ts: Array.isArray(parsed.ts) ? parsed.ts : [],
            sigs: parsed.sigs && typeof parsed.sigs === 'object' ? parsed.sigs : {}
        };
    } catch (e) {
        return { ts: [], sigs: {} };
    }
}

function saveOrderHistory(history) {
    try {
        localStorage.setItem('_enka_order_guard', JSON.stringify(history));
    } catch (e) {}
}

/**
 * Проверяет, можно ли отправлять заказ боту
 * Возвращает: { allowed: boolean, reason: 'ok' | 'duplicate_exact' | 'cooldown' | 'rate_limit' }
 */
function checkOrderSpamGuard(name, phone, productKey) {
    const now = Date.now();
    const history = getOrderHistory();

    // Очищаем старые записи (старше 15 минут)
    history.ts = history.ts.filter(t => now - t < 900000);
    for (const k of Object.keys(history.sigs)) {
        if (now - history.sigs[k] > ORDER_RATE_LIMIT.SAME_DATA_TTL_MS) {
            delete history.sigs[k];
        }
    }

    // 1. Проверка на 100% идентичный заказ (тот же телефон + то же имя + тот же товар)
    const exactSignature = `${name.toLowerCase()}|${phone}|${productKey}`;
    if (history.sigs[exactSignature] && (now - history.sigs[exactSignature] < ORDER_RATE_LIMIT.SAME_DATA_TTL_MS)) {
        saveOrderHistory(history);
        return { allowed: false, reason: 'duplicate_exact' };
    }

    // 2. Проверка минимального интервала (защита от макросов/кликеров каждую секунду)
    const lastTs = history.ts.length ? history.ts[history.ts.length - 1] : 0;
    if (lastTs && (now - lastTs < ORDER_RATE_LIMIT.MIN_INTERVAL_MS)) {
        saveOrderHistory(history);
        return { allowed: false, reason: 'cooldown' };
    }

    // 3. Лимит: не более 3 заказов в минуту (и не более 5 за 15 минут)
    const lastMinuteCount = history.ts.filter(t => now - t < 60000).length;
    if (lastMinuteCount >= ORDER_RATE_LIMIT.MAX_PER_MINUTE || history.ts.length >= ORDER_RATE_LIMIT.MAX_PER_15_MIN) {
        saveOrderHistory(history);
        return { allowed: false, reason: 'rate_limit' };
    }

    return { allowed: true, reason: 'ok', exactSignature, history };
}

function recordSuccessfulOrder(exactSignature) {
    const now = Date.now();
    const history = getOrderHistory();
    history.ts.push(now);
    if (exactSignature) {
        history.sigs[exactSignature] = now;
    }
    saveOrderHistory(history);
}

function showSpamError(form, message) {
    let errEl = form.querySelector('.enka-rate-limit-msg');
    if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'enka-rate-limit-msg text-red-500 text-sm text-center mt-2 font-medium';
        errEl.style.color = '#ef4444';
        errEl.style.marginTop = '8px';
        errEl.style.textAlign = 'center';
        errEl.style.fontSize = '13px';
        form.appendChild(errEl);
    }
    errEl.textContent = message;
    setTimeout(() => {
        if (errEl) errEl.textContent = '';
    }, 5000);
}

window.openOrderForm = function(product) {
    try {
        isQuickOrderSubmitting = false;
        if (quickName) quickName.value = '';
        if (quickPhone) quickPhone.value = '';
        document.getElementById('quickFormWrapperName')?.classList.remove('error-border'); 
        document.getElementById('quickFormWrapperPhone')?.classList.remove('error-border');
        
        const errEl = quickForm?.querySelector('.enka-rate-limit-msg');
        if (errEl) errEl.textContent = '';

        const submitBtn = quickForm?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = false;

        const modal = document.getElementById('orderFormModal');
        if (modal) {
            modal.dataset.product = JSON.stringify(product || {});
        }
        window.openAppModal?.('orderFormModal');
    } catch(e) { console.error(e); }
};

if (quickPhone) {
    quickPhone.addEventListener('input', function() {
        window.formatPhoneInput(this);
    });
}

if (quickForm) {
    quickForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        if (isQuickOrderSubmitting) return;

        const hp = document.getElementById('quickEmailHp');
        if (hp && hp.value) return; 

        const name = quickName?.value?.trim() || '';
        const phoneRaw = (quickPhone?.value || '').replace(/\D/g, '');
        const phoneWrapper = document.getElementById('quickFormWrapperPhone');
        const nameWrapper = document.getElementById('quickFormWrapperName');
        
        nameWrapper?.classList.remove('error-border');
        phoneWrapper?.classList.remove('error-border');

        if (!name) { nameWrapper?.classList.add('error-border'); return; }
        if (phoneRaw.length !== 9) { phoneWrapper?.classList.add('error-border'); return; }
        
        let product = {};
        try {
            const modal = document.getElementById('orderFormModal');
            product = JSON.parse(modal?.dataset?.product || '{}');
        } catch (err) {}

        const fullPhone = '+995' + phoneRaw;
        const slugFromUrl = window.location.pathname.replace(/^\/product\/|\/$/g, '') || 'item';
        const productKey = String(product.id || slugFromUrl || product.name || 'item');

        // Проверка анти-спама перед отправкой к боту
        const guard = checkOrderSpamGuard(name, fullPhone, productKey);

        if (!guard.allowed) {
            if (guard.reason === 'duplicate_exact') {
                // Если человек отправил на 100% те же данные (не меняя телефон) — не спамим бота, просто показываем подтверждение
                window.closeAppModal?.('orderFormModal');
                setTimeout(() => {
                    window.showOrderConfirm?.({
                        name: name,
                        phone: fullPhone,
                        product: product.name,
                        price: product.price,
                        oldPrice: product.oldPrice || product.old_price
                    });
                }, 300);
                return;
            }
            if (guard.reason === 'cooldown') {
                showSpamError(quickForm, 'გთხოვთ მოითმინოთ რამდენიმე წამი...');
                return;
            }
            if (guard.reason === 'rate_limit') {
                showSpamError(quickForm, 'შეკვეთების ლიმიტი ამოწურულია. გთხოვთ სცადოთ 1 წუთში.');
                return;
            }
        }

        isQuickOrderSubmitting = true;

        const submitBtn = quickForm.querySelector('button[type="submit"]');
        const originalContent = submitBtn ? submitBtn.innerHTML : ''; 
        
        if (submitBtn) {
            submitBtn.innerHTML = '<div class="animate-spin rounded-full border-[3px] border-white/30 border-t-white w-6 h-6 mx-auto"></div>'; 
            submitBtn.disabled = true;
        }
        
        try {
            const eventId = 'purchase_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const numericPrice = parseFloat(String(product.price || 0).replace(/[^\d.]/g, '')) || 0;
            
            const response = await fetch(window.WORKER_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'EnkaOrderForm'
                },
                body: JSON.stringify({
                    event_name: 'Purchase',
                    name: name,
                    phone: fullPhone,
                    product: product.name || '',
                    price: product.price || 0,
                    product_id: product.id || slugFromUrl,
                    event_id: eventId,
                    source: 'Быстрый заказ'
                })
            });
            
            if (response.ok) {
                // Записываем успешную отправку в историю анти-спама
                recordSuccessfulOrder(guard.exactSignature);

                // Отправляем в CAPI (capi.js сам заблокирует повтор, если это было просто исправление опечатки в номере!)
                if (typeof window.sendCapiEvent === 'function') {
                    window.sendCapiEvent(
                        'Purchase',
                        {
                            value: numericPrice,
                            currency: 'GEL',
                            content_name: product.name || '',
                            content_ids: [productKey],
                            content_type: 'product',
                            num_items: 1
                        },
                        eventId,
                        {
                            name: name,
                            phone: fullPhone
                        }
                    );
                }
                
                window.closeAppModal?.('orderFormModal');
                setTimeout(() => {
                    window.showOrderConfirm?.({
                        name: name,
                        phone: fullPhone,
                        product: product.name,
                        price: product.price,
                        oldPrice: product.oldPrice || product.old_price
                    });
                    if (submitBtn) {
                        submitBtn.innerHTML = originalContent;
                        submitBtn.disabled = false;
                    }
                    isQuickOrderSubmitting = false;
                }, 400);
            } else {
                if (submitBtn) {
                    submitBtn.innerHTML = originalContent;
                    submitBtn.disabled = false;
                }
                isQuickOrderSubmitting = false;
            }
        } catch(error) {
            console.error(error);
            if (submitBtn) {
                submitBtn.innerHTML = originalContent;
                submitBtn.disabled = false;
            }
            isQuickOrderSubmitting = false;
        }
    });
}

window.showOrderConfirm = function(data = {}) {
    try {
        const confirmName = document.getElementById('confirmName');
        const confirmPhone = document.getElementById('confirmPhone');
        const confirmProduct = document.getElementById('confirmProduct');
        const confirmPrice = document.getElementById('confirmPrice');

        if (confirmName) confirmName.textContent = data.name || '-';
        if (confirmPhone) confirmPhone.textContent = data.phone || '-';
        if (confirmProduct) confirmProduct.textContent = data.product || '-';
        
        const rawConfirmPrice = String(data.price || '').replace(/₾/g, '').trim();
        if (confirmPrice) confirmPrice.textContent = rawConfirmPrice ? `${rawConfirmPrice} ₾` : '-';
        
        let oldPrice = (data.oldPrice && data.oldPrice !== 'null' && data.oldPrice !== 'undefined') 
            ? String(data.oldPrice).replace(/₾/g, '').trim() + ' ₾' 
            : null;
        
        let orders = JSON.parse(localStorage.getItem('myOrders') || '[]');
        orders.unshift({
            name: data.name || '',
            phone: data.phone || '',
            product: data.product || '',
            price: rawConfirmPrice ? (rawConfirmPrice + ' ₾') : '',
            oldPrice: oldPrice,
            date: new Date().toISOString()
        });
        localStorage.setItem('myOrders', JSON.stringify(orders));
        window.updateBadges?.();

        window.openAppModal?.('orderConfirmModal');
    } catch(e) { console.error(e); }
};

window.formatPhoneInput = function(input) {
    if (!input) return;
    let value = input.value.replace(/\D/g, '');
    if (value.startsWith('995')) value = value.substring(3);
    if (value.startsWith('0')) value = value.substring(1);
    if (value.length > 9) value = value.slice(0, 9);
    let formatted = '';
    for (let i = 0; i < value.length; i++) {
        if (i === 3 || i === 5 || i === 7) formatted += ' ';
        formatted += value[i];
    }
    input.value = formatted;
};

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.order-form').forEach(form => {
        const nameInput = form.querySelector('input[placeholder*="სახელი"], input[name="name"]');
        const phoneInput = form.querySelector('input[type="tel"], input[name="phone"]');
        if (nameInput && phoneInput) {
            if (!nameInput.id) nameInput.id = 'n' + Math.random().toString(36).slice(2, 7);
            if (!phoneInput.id) phoneInput.id = 'p' + Math.random().toString(36).slice(2, 7);
            phoneInput.addEventListener('input', function() { window.formatPhoneInput(this); });
        }
    });
});