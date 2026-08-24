document.addEventListener('DOMContentLoaded', function() {
    const quickForm = document.getElementById('quickOrderForm');
    const quickName = document.getElementById('quickName');
    const quickPhone = document.getElementById('quickPhone');

    window.openOrderForm = function(product) {
        try {
            if (quickName) quickName.value = '';
            if (quickPhone) quickPhone.value = '';
            document.getElementById('quickFormWrapperName')?.classList.remove('error-border'); 
            document.getElementById('quickFormWrapperPhone')?.classList.remove('error-border');
            
            const modal = document.getElementById('orderFormModal');
            if (modal) {
                modal.dataset.product = JSON.stringify(product || {});
            }
            window.openAppModal?.('orderFormModal');
        } catch(e) { 
            console.error('[Modal Open Error]', e); 
        }
    };

    if (quickPhone) {
        quickPhone.addEventListener('input', function() {
            let val = this.value.replace(/\D/g, '');
            if (val.startsWith('995')) val = val.substring(3);
            if (val.length > 9) val = val.slice(0, 9);
            let formatted = '';
            for (let i = 0; i < val.length; i++) {
                if (i === 3 || i === 5 || i === 7) formatted += ' ';
                formatted += val[i];
            }
            this.value = formatted;
        });
    }

    if (quickForm) {
        quickForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const hp = document.getElementById('quickEmailHp');
            if (hp && hp.value) return; 

            const name = quickName?.value?.trim() || 'Покупатель';
            let rawDigits = (quickPhone?.value || '').replace(/\D/g, '');
            if (rawDigits.startsWith('995')) rawDigits = rawDigits.substring(3);
            
            const phoneWrapper = document.getElementById('quickFormWrapperPhone');
            const nameWrapper = document.getElementById('quickFormWrapperName');
            
            if (quickName && !quickName.value.trim()) { 
                nameWrapper?.classList.add('error-border'); 
                return; 
            }
            if (rawDigits.length !== 9) { 
                phoneWrapper?.classList.add('error-border'); 
                return; 
            }
            
            const modal = document.getElementById('orderFormModal');
            const product = JSON.parse(modal?.dataset?.product || '{}');
            const fullPhone = '+995' + rawDigits;
            const submitBtn = quickForm.querySelector('button[type="submit"]');
            const originalContent = submitBtn ? submitBtn.innerHTML : ''; 
            
            if (submitBtn) {
                submitBtn.innerHTML = '<div class="animate-spin rounded-full border-[3px] border-white/30 border-t-white w-6 h-6 mx-auto"></div>'; 
                submitBtn.disabled = true;
            }
            
            const eventId = 'purchase_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            const numericPrice = parseFloat(String(product.price || 0).replace(/[^\d.]/g, '')) || 0;
            const productId = product.sku || product.id || '';

            // --- 1. ОТПРАВКА В GOOGLE ADS (GTAG) ---
            try {
                if (typeof window.gtag === 'function') {
                    window.gtag('event', 'conversion', {
                        'send_to': 'AW-18407942518/UmJiCP-njuccEPbSy8lE',
                        'value': numericPrice,
                        'currency': 'GEL',
                        'transaction_id': eventId
                    });
                    window.gtag('event', 'purchase', {
                        'transaction_id': eventId,
                        'value': numericPrice,
                        'currency': 'GEL',
                        'items': [{
                            'item_id': productId,
                            'item_name': product.name || '',
                            'price': numericPrice,
                            'quantity': 1
                        }]
                    });
                } else {
                    window.dataLayer = window.dataLayer || [];
                    window.dataLayer.push([
                        'event', 'conversion', {
                            'send_to': 'AW-18407942518/UmJiCP-njuccEPbSy8lE',
                            'value': numericPrice,
                            'currency': 'GEL',
                            'transaction_id': eventId
                        }
                    ]);
                }
                console.log('%c[Google Ads Conversion Sent]', 'background: #155dfc; color: #fff; padding: 4px;', {
                    send_to: 'AW-18407942518/UmJiCP-njuccEPbSy8lE',
                    value: numericPrice,
                    currency: 'GEL',
                    transaction_id: eventId
                });
            } catch (gErr) {
                console.error('[Google Ads Error]', gErr);
            }

            // --- 2. FACEBOOK PIXEL ---
            try {
                if (typeof fbq === 'function') {
                    fbq('track', 'Purchase', {
                        value: numericPrice,
                        currency: 'GEL',
                        content_name: product.name,
                        content_ids: productId ? [String(productId)] : [],
                        content_type: 'product',
                        num_items: 1
                    }, { eventID: eventId });
                }
            } catch (fbErr) {
                console.error('[FB Error]', fbErr);
            }

            // --- 3. ОТПРАВКА НА СЕРВЕР / WORKER ---
            try {
                const workerUrl = window.WORKER_URL || '/api/order';
                await fetch(workerUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        phone: fullPhone,
                        product: product.name || '',
                        price: product.price || 0,
                        product_id: productId,
                        event_id: eventId
                    })
                });

                if (typeof window.sendCapiEvent === 'function') {
                    window.sendCapiEvent('Purchase', {
                        value: numericPrice,
                        currency: 'GEL',
                        content_name: product.name,
                        content_ids: productId ? [String(productId)] : [],
                        content_type: 'product'
                    }, eventId);
                }
            } catch (workerErr) {
                console.warn('[Worker Notice]', workerErr);
            } finally {
                if (submitBtn) {
                    submitBtn.innerHTML = originalContent;
                    submitBtn.disabled = false;
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
                }, 400);
            }
        });
    }

    document.querySelectorAll('.order-form').forEach(form => {
        const nameInput = form.querySelector('input[placeholder*="სახელი"], input[name="name"]');
        const phoneInput = form.querySelector('input[type="tel"], input[name="phone"]');
        if (nameInput && phoneInput) {
            if (!nameInput.id) nameInput.id = 'n' + Math.random().toString(36).substr(2, 5);
            if (!phoneInput.id) phoneInput.id = 'p' + Math.random().toString(36).substr(2, 5);
            phoneInput.addEventListener('input', function() { window.formatPhoneInput(this); });
        }
    });
});

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
    } catch(e) { 
        console.error(e); 
    }
};

window.formatPhoneInput = function(input) {
    if (!input) return;
    let value = input.value.replace(/\s/g, '');
    if (value.startsWith('+995')) value = value.substring(4);
    value = value.replace(/\D/g, '');
    if (value.length > 9) value = value.slice(0, 9);
    let formatted = '';
    for (let i = 0; i < value.length; i++) {
        if (i === 3 || i === 5 || i === 7) formatted += ' ';
        formatted += value[i];
    }
    input.value = formatted;
};
