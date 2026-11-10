const quickForm = document.getElementById('quickOrderForm');
const quickName = document.getElementById('quickName');
const quickPhone = document.getElementById('quickPhone');

let isQuickOrderSubmitting = false;
let orderHistoryMemory = { ts: [], sigs: {} };

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
        const parsed = raw ? JSON.parse(raw) : orderHistoryMemory;
        return {
            ts: Array.isArray(parsed.ts) ? parsed.ts : [],
            sigs: parsed.sigs && typeof parsed.sigs === 'object' ? parsed.sigs : {}
        };
    } catch (e) {
        return orderHistoryMemory;
    }
}

function saveOrderHistory(history) {
    orderHistoryMemory = history;
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
        errEl.className = 'enka-rate-limit-msg text-[#ef4444] text-[13px] text-center mt-2 font-medium';
        form.appendChild(errEl);
    }
    errEl.textContent = message;
    setTimeout(() => {
        if (errEl) errEl.textContent = '';
    }, 5000);
}

window.openOrderForm = function(product, trigger) {
    try {
        if (isQuickOrderSubmitting || window.enkaOrderPending) return;
        if (window.ENKA_STORE && globalThis.EnkaStoreEngine && product) product=globalThis.EnkaStoreEngine.applyProducts([product],window.ENKA_STORE)[0];
        if (!product?.id || !window.isProductAvailable(product)) return;
        product = { ...product, price: String(window.productPrice(product.price)), oldPrice: window.productPrice(product.oldPrice) > window.productPrice(product.price) ? String(window.productPrice(product.oldPrice)) : '' };
        document.getElementById('quickProductName').textContent = product.name || '';
        document.getElementById('quickProductPrice').textContent = String(product.price).replace(/₾/g, '').trim() + ' ₾';
        document.getElementById('quickOrderError').textContent = '';
        quickName?.removeAttribute('aria-invalid');
        quickPhone?.removeAttribute('aria-invalid');
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
        window.openAppModal?.('orderFormModal', trigger);
    } catch(e) { console.error(e); }
};

window.addEventListener?.('enka:prices-change', event => {
    if(isQuickOrderSubmitting || window.enkaOrderPending)return;
    const modal=document.getElementById('orderFormModal');
    if(!modal?.dataset.product)return;
    let saved;try{saved=JSON.parse(modal.dataset.product);}catch{return;}
    const product=event.detail.products.find(p=>String(p.id)===String(saved.id));
    if(product){modal.dataset.product=JSON.stringify(product);document.getElementById('quickProductPrice').textContent=product.price+' ₾';}
});

if (quickPhone) {
    quickPhone.addEventListener('input', function() {
        window.formatPhoneInput(this);
    });
}

if (quickForm) {
    quickForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        if (isQuickOrderSubmitting || window.enkaOrderPending) return;

        const hp = document.getElementById('quickEmailHp');
        if (hp && hp.value) return;

        const name = quickName?.value?.trim() || '';
        const phoneRaw = (quickPhone?.value || '').replace(/\D/g, '');
        const phoneWrapper = document.getElementById('quickFormWrapperPhone');
        const nameWrapper = document.getElementById('quickFormWrapperName');

        nameWrapper?.classList.remove('error-border');
        phoneWrapper?.classList.remove('error-border');

        const errorEl = document.getElementById('quickOrderError');
        if (errorEl) errorEl.textContent = '';
        quickName?.removeAttribute('aria-invalid');
        quickPhone?.removeAttribute('aria-invalid');
        if (name.length < 2) {
            nameWrapper?.classList.add('error-border');
            quickName?.setAttribute('aria-invalid', 'true');
            if (errorEl) errorEl.textContent = 'გთხოვთ, მიუთითოთ თქვენი სახელი.';
            quickName?.focus();
            return;
        }
        if (!/^5\d{8}$/.test(phoneRaw)) {
            phoneWrapper?.classList.add('error-border');
            quickPhone?.setAttribute('aria-invalid', 'true');
            if (errorEl) errorEl.textContent = 'მიუთითეთ 9-ნიშნა მობილურის ნომერი, რომელიც იწყება 5-ით.';
            quickPhone?.focus();
            return;
        }

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
                window.showOrderConfirm?.({
                    save: false,
                    name: name,
                    phone: fullPhone,
                    product: product.name,
                    price: product.price,
                    oldPrice: product.oldPrice || product.old_price
                });
                window.closeAppModal?.('orderFormModal');
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
        window.enkaOrderPending = true;

        const submitBtn = quickForm.querySelector('button[type="submit"]');
        const originalContent = submitBtn ? submitBtn.innerHTML : '';

        if (submitBtn) {
            submitBtn.innerHTML = '<span class="inline-flex items-center gap-2.5"><span class="w-4.5 h-4.5 border-[2px] border-solid border-[rgb(255_255_255_/_.4)] [border-top-color:#fff] rounded-[50%] animate-spin [animation-duration:.8s] motion-reduce:animate-none motion-reduce:border-white motion-reduce:border-dotted" aria-hidden="true"></span>იგზავნება…</span>';
            submitBtn.disabled = true;
            submitBtn.setAttribute('aria-label', 'შეკვეთა იგზავნება');
        }
        quickForm.setAttribute('aria-busy', 'true');

        try {
            const eventId = 'purchase_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const numericPrice = parseFloat(String(product.price || 0).replace(/[^\d.]/g, '')) || 0;

            const response = await window.submitEnkaOrder(quickForm, {
                name,
                phone: fullPhone,
                product_id: product.id || slugFromUrl
            });

            const result = await response.clone().json().catch(() => null);
            if (response.ok && result?.ok !== false && result?.success !== false && !result?.error) {
                try { window.enkaPersonalization?.record('purchase', String(product.id || slugFromUrl)); } catch { /* Recommendations must not affect an accepted order. */ }
                // Записываем успешную отправку в историю анти-спама
                recordSuccessfulOrder(guard.exactSignature);

                // Отправляем в CAPI (capi.js сам заблокирует повтор, если это было просто исправление опечатки в номере!)
                if (typeof window.sendCapiEvent === 'function') {
                    try {
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
                    } catch (analyticsError) { console.error(analyticsError); }
                }

                window.showOrderConfirm?.({
                    name: name,
                    phone: fullPhone,
                    product: product.name,
                    price: product.price,
                    oldPrice: product.oldPrice || product.old_price
                });
                window.closeAppModal?.('orderFormModal');
                quickForm.reset();
                if (submitBtn) {
                    submitBtn.innerHTML = originalContent;
                    submitBtn.disabled = false;
                }
                isQuickOrderSubmitting = false;
            } else {
                if (errorEl) errorEl.textContent = 'შეკვეთა ვერ გაიგზავნა. სცადეთ ხელახლა ან დაგვირეკეთ: +995 551 17 89 90.';
                if (submitBtn) {
                    submitBtn.innerHTML = originalContent;
                    submitBtn.disabled = false;
                }
                isQuickOrderSubmitting = false;
            }
        } catch(error) {
            console.error(error);
            if (errorEl) errorEl.textContent = 'სერვერთან კავშირი ვერ დამყარდა. სცადეთ ხელახლა ან დაგვირეკეთ: +995 551 17 89 90.';
            if (submitBtn) {
                submitBtn.innerHTML = originalContent;
                submitBtn.disabled = false;
            }
            isQuickOrderSubmitting = false;
        } finally {
            window.enkaOrderPending = false;
            quickForm.removeAttribute('aria-busy');
            submitBtn?.removeAttribute('aria-label');
            const modal = document.getElementById('orderFormModal');
            if (modal?.classList.contains('active') && !modal.contains(document.activeElement)) submitBtn?.focus({ preventScroll: true });
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

        if (data.save !== false) {
        try {
        let orders;
        try { orders = JSON.parse(localStorage.getItem('myOrders') || '[]'); } catch { orders = []; }
        if (!Array.isArray(orders)) orders = [];
        orders.unshift({
            name: data.name || '',
            phone: data.phone || '',
            product: data.product || '',
            price: rawConfirmPrice ? (rawConfirmPrice + ' ₾') : '',
            oldPrice: oldPrice,
            date: new Date().toISOString()
        });
        localStorage.setItem('myOrders', JSON.stringify(orders));
        } catch { /* A completed order must still be confirmed when storage is unavailable. */ }
        }
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
