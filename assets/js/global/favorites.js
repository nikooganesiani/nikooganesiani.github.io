// ==========================================
// 1. Отрисовка модального окна избранного
// ==========================================
function renderFavs() {
    try {
        const list = document.getElementById('favList');
        const favsRaw = localStorage.getItem('myFavs');
        const favs = favsRaw ? JSON.parse(favsRaw) : [];
        const countEl = document.getElementById('favModalCount');

        if (countEl) {
            countEl.innerText = favs.length > 0 ? `(${favs.length})` : '';
        }

        if (!list) return;

        if (!favs || favs.length === 0) {
            list.innerHTML = `
                <div class="text-center text-slate-400 py-12 font-semibold">
                    <svg class="w-16 h-16 mx-auto mb-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
                    </svg>
                    რჩეულები ცარიელია
                </div>`;
            return;
        }

        list.innerHTML = favs.map((item, idx) => {
            if (!item) return '';

            const priceFixed = String(item.price || '').includes('₾') 
                ? item.price 
                : `${String(item.price || '0').trim()} ₾`;

            const oldPHtml = (item.oldPrice && item.oldPrice !== 'null' && !String(item.oldPrice).includes('undefined'))
                ? `<span class="text-[0.8rem] text-slate-400 line-through decoration-red-500 font-bold ml-1.5">${item.oldPrice}</span>`
                : '';

            const imgSrc = item.img || 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f1f5f9%22%2F%3E%3C%2Fsvg%3E';

            return `
                <div class="flex items-center gap-3 bg-transparent border-b border-slate-200 py-3 px-2 relative transition-all duration-200 last:border-none group">
                    <a href="${item.link || '#'}" class="w-14 h-14 rounded-2xl bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-100">
                        <img src="${imgSrc}" alt="${item.name || ''}" class="w-full h-full object-cover">
                    </a>
                    
                    <div class="flex-1 min-w-0">
                        <a href="${item.link || '#'}" class="block whitespace-normal leading-snug text-[0.88rem] font-bold text-slate-900 line-clamp-2 hover:text-blue-600 transition-colors">
                            ${item.name || 'პროდუქტი'}
                        </a>
                        <div class="text-[0.95rem] text-blue-600 font-bold flex items-center mt-1">
                            ${priceFixed} ${oldPHtml}
                        </div>
                    </div>

                    <button onclick="window.removeFavByIdx(${idx}, event)" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="წაშლა">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>`;
        }).join('');
    } catch (error) {
        console.error('Error rendering favorites:', error);
    }
}

window.renderFavs = renderFavs;

// ==========================================
// 2. Открытие модального окна избранного
// ==========================================
window.openFavs = function(e) {
    if (e?.preventDefault) e.preventDefault();
    renderFavs();
    window.openAppModal?.('favModal');
};
window.openFavorites = window.openFavs;

// ==========================================
// 3. Удаление товара прямо из модалки
// ==========================================
window.removeFavByIdx = function(idx, e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
    if (idx >= 0 && idx < favs.length) {
        favs.splice(idx, 1);
        localStorage.setItem('myFavs', JSON.stringify(favs));
        renderFavs();
        syncFavButtons();
        window.updateBadges?.();
        window.showToast?.('წაშლილია რჩეულებიდან');
    }
};

// ==========================================
// 4. Добавление / Удаление по кнопке на товаре
// ==========================================
function getCardLink(btn) {
    const card = btn.closest('.product-card');
    if (card) {
        const aEl = card.querySelector('a.product-link, a[href*="/product/"], a:not(.btn-fav):not(.btn-fav-card)') || card.querySelector('a');
        if (aEl && aEl.getAttribute('href')) {
            try {
                return new URL(aEl.getAttribute('href'), window.location.origin).pathname;
            } catch (e) {
                return aEl.getAttribute('href');
            }
        }
    }
    return window.location.pathname;
}

function getCardImage(el) {
    if (!el) return '';
    return el.dataset.src || el.dataset.original || el.src || '';
}

window.toggleFav = function(event, btn) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!btn) return;

    try {
        let name = "პროდუქტი", price = "0 ₾", oldPrice = null, img = "", link = getCardLink(btn);
        const card = btn.closest('.product-card');

        if (card) {
            let nameEl = card.querySelector('.product-name, .product-title, .card-title');
            if (nameEl) name = nameEl.innerText.trim();

            let priceEl = card.querySelector('.product-price, .modern-price-current, .price');
            if (priceEl) price = priceEl.innerText.replace(/₾/g, '').trim() + ' ₾';

            let oldPriceEl = card.querySelector('.old-price, .modern-price-old');
            if (oldPriceEl) oldPrice = oldPriceEl.innerText.replace(/₾/g, '').trim() + ' ₾';

            let imgEl = card.querySelector('.product-image, img');
            img = getCardImage(imgEl);
        } else {
            let titleEl = document.querySelector('.title-desktop, .title-mobile, h1.product-title-h1, h1');
            if (titleEl) name = titleEl.innerText.trim();

            let priceEl = document.querySelector('.modern-price-current, .product-price');
            if (priceEl) price = priceEl.innerText.replace(/₾/g, '').trim() + ' ₾';

            let oldPriceEl = document.querySelector('.modern-price-old, .old-price');
            if (oldPriceEl) oldPrice = oldPriceEl.innerText.replace(/₾/g, '').trim() + ' ₾';

            let imgEl = document.querySelector('.main-gallery-slide img, .product-main-img, .product-gallery img');
            img = getCardImage(imgEl);
        }

        let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
        let existingIdx = favs.findIndex(f => f.link === link);

        if (existingIdx > -1) {
            favs.splice(existingIdx, 1);
            btn.classList.remove('active');
            window.showToast?.('წაშლილია რჩეულებიდან');
        } else {
            favs.unshift({ name, price, oldPrice, img, link });
            btn.classList.add('active');
            window.showToast?.('დამატებულია რჩეულებში', 'fav');
        }

        localStorage.setItem('myFavs', JSON.stringify(favs));
        syncFavButtons();
        renderFavs();
        window.updateBadges?.();
    } catch (e) {
        console.error('Favorite toggle error:', e);
    }
};

// ==========================================
// 5. Синхронизация активного состояния кнопок
// ==========================================
function syncFavButtons() {
    try {
        const favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
        const favLinks = new Set(favs.map(f => f.link));

        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(btn => {
            const link = getCardLink(btn);
            if (link && favLinks.has(link)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Также сразу обновляем счетчик в заголовке модалки если элемент есть
        const countEl = document.getElementById('favModalCount');
        if (countEl) {
            countEl.innerText = favs.length > 0 ? `(${favs.length})` : '';
        }
    } catch (e) {
        console.error('Favorites sync error:', e);
    }
}

// ==========================================
// 6. Инициализация
// ==========================================
function initFavs() {
    syncFavButtons();

    if (document.body) {
        const favObserver = new MutationObserver((mutations) => {
            if (mutations.some(m => m.addedNodes.length > 0)) {
                syncFavButtons();
            }
        });
        favObserver.observe(document.body, { childList: true, subtree: true });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFavs);
} else {
    initFavs();
}
