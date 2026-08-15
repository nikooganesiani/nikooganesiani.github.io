window.showInputError = function(el) {
    if (el) {
        el.classList.add('error-border');
        const input = el.querySelector('input');
        if (input) {
            const removeError = () => {
                el.classList.remove('error-border');
                input.removeEventListener('input', removeError);
            };
            input.addEventListener('input', removeError);
        }
    }
};

document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'inlinePhone') {
        let val = e.target.value.replace(/\D/g, '');
        if (val.startsWith('995')) val = val.substring(3);
        if (val.length > 9) val = val.slice(0, 9);
        let formatted = '';
        for (let i = 0; i < val.length; i++) {
            if (i === 3 || i === 5 || i === 7) formatted += ' ';
            formatted += val[i];
        }
        e.target.value = formatted;
    }
});

document.addEventListener('submit', function(e) {
    if (e.target && e.target.id === 'inlineOrderForm') {
        e.preventDefault();
        
        const hp = document.getElementById('inlineEmailHp');
        if (hp && hp.value) return; 

        const nameInput = document.getElementById('inlineName');
        const phoneInput = document.getElementById('inlinePhone');
        const btn = document.getElementById('submitInlineOrderBtn');
        const icon = document.getElementById('inlineOrderIcon');
        const text = document.getElementById('inlineOrderText');

        if (!nameInput || !phoneInput) return;

        const name = nameInput.value.trim();
        let phoneRaw = phoneInput.value.replace(/\s/g, '');

        if (!name) { window.showInputError(document.getElementById('inlineNameWrapper')); return; }
        if (phoneRaw.length !== 9) { window.showInputError(document.getElementById('inlinePhoneWrapper')); return; }

        const fullPhone = '+995' + phoneRaw;
        const pDataset = document.getElementById('productData')?.dataset || {};
        
        const product = {
            name: pDataset.name || "",
            price: pDataset.price || "",
            id: pDataset.sku || ""
        };

        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.8';
        const originalIcon = icon.outerHTML;
        icon.outerHTML = `<div class="animate-spin rounded-full border-[3px] border-white/30 border-t-white w-5 h-5" id="inlineOrderIcon"></div>`;
        text.innerText = 'იგზავნება...';

        const eventId = 'purchase_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const numericPrice = parseFloat(String(product.price).replace(/[^\d.]/g, '')) || 0;
        const targetWorker = window.WORKER_URL;
        
        fetch(targetWorker, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: name, 
                phone: fullPhone, 
                product: product.name, 
                price: product.price,
                product_id: product.id,
                event_id: eventId
            })
        }).catch(console.error);

        setTimeout(() => {
            try {
                if (typeof fbq === 'function') {
                    fbq('track', 'Purchase', { value: numericPrice, currency: 'GEL', content_name: product.name, content_ids: product.id ? [String(product.id)] : [], content_type: 'product', num_items: 1 }, { eventID: eventId });
                }
                if (typeof window.sendCapiEvent === 'function') {
                    window.sendCapiEvent('Purchase', { value: numericPrice, currency: 'GEL', content_name: product.name, content_ids: product.id ? [String(product.id)] : [], content_type: 'product' }, eventId); 
                }
            } catch(err) { console.error(err); }
        }, 50);

        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
        document.getElementById('inlineOrderIcon').outerHTML = originalIcon;
        text.innerText = 'ყიდვა';
        
        if (window.showOrderConfirm) {
            window.showOrderConfirm({ name: name, phone: fullPhone, product: product.name, price: product.price, oldPrice: pDataset.oldPrice || "" });
        }
    }
});
