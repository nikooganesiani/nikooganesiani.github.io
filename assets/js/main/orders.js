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
