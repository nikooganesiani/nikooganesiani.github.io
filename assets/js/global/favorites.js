// Вспомогательная функция безопасного получения ссылки
function getFavLink(btn) {
    const card = btn.closest('.product-card');
    if (card) {
        // Ищем ссылку на карточку, исключая саму кнопку избранного (если это <a>)
        const aEl = card.querySelector('a.product-link, a[href*="/product/"], a:not(.btn-fav):not(.btn-fav-card)') || card.querySelector('a');
        if (aEl && aEl.getAttribute('href')) {
            // Приводим к относительному пути без хоста для однозначного сравнения
            try {
                return new URL(aEl.getAttribute('href'), window.location.origin).pathname;
            } catch (e) {
                return aEl.getAttribute('href');
            }
        }
    }
    return window.location.pathname;
}

// Вспомогательная функция безопасного получения картинки (с поддержкой Lazy Load)
function getFavImage(element) {
    if (!element) return '';
    return element.dataset.src || element.dataset.original || element.src || '';
}

window.toggleFav = function(event, btn) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!btn) return;

    try {
        let name = "პროდუქტი", price = "0 ₾", oldPrice = null, img = "", link = getFavLink(btn);
        const card = btn.closest('.product-card');
        
        if (card) {
            // Считывание данных карточки
            let nameEl = card.querySelector('.product-name, .product-title, .card-title'); 
            if (nameEl) name = nameEl.innerText.trim();

            let priceEl = card.querySelector('.product-price, .modern-price-current, .price'); 
            if (priceEl) price = priceEl.innerText.replace(/₾/g, '').trim() + ' ₾';

            let oldPriceEl = card.querySelector('.old-price, .modern-price-old'); 
            if (oldPriceEl) oldPrice = oldPriceEl.innerText.replace(/₾/g, '').trim() + ' ₾';

            let imgEl = card.querySelector('.product-image, img'); 
            img = getFavImage(imgEl);
        } else {
            // Считывание данных на странице товара
            let titleEl = document.querySelector('.title-desktop, .title-mobile, h1.product-title-h1, h1');
            if (titleEl) name = titleEl.innerText.trim();

            let priceEl = document.querySelector('.modern-price-current, .product-price'); 
            if (priceEl) price = priceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            
            let oldPriceEl = document.querySelector('.modern-price-old, .old-price'); 
            if (oldPriceEl) oldPrice = oldPriceEl.innerText.replace(/₾/g, '').trim() + ' ₾';
            
            let imgEl = document.querySelector('.main-gallery-slide img, .product-main-img, .product-gallery img'); 
            img = getFavImage(imgEl);
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
        window.updateBadges?.();

        // Синхронизируем все одинаковые кнопки на странице
        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(otherBtn => {
            if (getFavLink(otherBtn) === link) {
                if (existingIdx > -1) otherBtn.classList.remove('active');
                else otherBtn.classList.add('active');
            }
        });
    } catch(e) { 
        console.error("Favorite toggle error:", e); 
    }
};

function syncFavButtons() {
    try {
        let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
        let favLinks = new Set(favs.map(f => f.link));

        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(btn => {
            let link = getFavLink(btn);
            if (link && favLinks.has(link)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    } catch (e) {
        console.error("Favorite sync error:", e);
    }
}

// Безопасная инициализация
function initFavorites() {
    syncFavButtons();

    if (document.body) {
        const favObserver = new MutationObserver((mutations) => {
            let hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
            if (hasAddedNodes) syncFavButtons();
        });
        favObserver.observe(document.body, { childList: true, subtree: true });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFavorites);
} else {
    initFavorites();
}
