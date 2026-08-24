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
            console.error(e); 
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

            const name = quickName?.value?.trim() || '';
            const phoneRaw = (quickPhone?.value || '').replace(/\s/g, '');
            const phoneWrapper = document.getElementById('quickFormWrapperPhone');
            const nameWrapper = document.getElementById('quickFormWrapperName');
            
            if (!name) { 
                nameWrapper?.classList.add('error-border'); 
                return; 
            }
            if (phoneRaw.length !== 9) { 
                phoneWrapper?.classList.add('error-border'); 
                return; 
            }
            
            const modal = document.getElementById('orderFormModal');
            const product = JSON.parse(modal?.dataset?.product || '{}');
            const fullPhone = '+995' + phoneRaw;
            const submitBtn = quickForm.querySelector('button[type="submit"]');
            const originalContent = submitBtn ? submitBtn.innerHTML : ''; 
            
            if (submitBtn) {
                submitBtn.innerHTML = '<div class="animate-spin rounded-full border-[3px] border-white/30 border-t-white w-6 h-6 mx-auto"></div>'; 
                submitBtn.disabled = true;
            }
            
            try {
                const eventId = 'purchase_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
                const numericPrice = parseFloat(String(product.price || 0).replace(/[^\d.]/g, '')) || 0;
                const productId = product.sku || product.id || '';
                
                const response = await fetch(window.WORKER_URL, {
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
                
                if (response.ok) {
                    // 1. Google Tag (gtag.js) - Отправка конверсии в Google Ads
                    if (typeof window.gtag === 'function') {
                        window.gtag('event', 'conversion', {
                            'send_to': 'AW-18407942518/qFjICJX3_-YcEPbSy8lE',
                            'value': numericPrice,
                            'currency': 'GEL',
                            'transaction_id': eventId
                        });

                        // Стандартное событие purchase для Google Tag / GA4
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
                    }

                    // 2. Facebook Pixel
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

                    // 3. Facebook CAPI
                    if (typeof window.sendCapiEvent === 'function') {
                        window.sendCapiEvent('Purchase', {
                            value: numericPrice,
                            currency: 'GEL',
                            content_name: product.name,
                            content_ids: productId ? [String(productId)] : [],
                            content_type: 'product'
                        }, eventId);
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
            } catch(error) {
                console.error(error);
            } finally {
                if (submitBtn) {
                    submitBtn.innerHTML = originalContent;
                    submitBtn.disabled = false;
                }
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
