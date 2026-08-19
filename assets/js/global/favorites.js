// ==========================================
// 1. Отрисовка списка избранного в модалке
// ==========================================
function renderFavs() {
    try {
        const list = document.getElementById('favList');
        const favsRaw = localStorage.getItem('myFavs');
        let favs = [];
        try { favs = favsRaw ? JSON.parse(favsRaw) : []; } catch(e) { favs = []; }
        
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

            const imgSrc = item.img || '';

            return `
                <div class="flex items-center gap-3 bg-transparent border-b border-slate-200 py-3 px-2 relative transition-all duration-200 last:border-none">
                    <a href="${item.link || '#'}" class="w-14 h-14 rounded-2xl bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-100">
                        ${imgSrc ? `<img src="${imgSrc}" alt="${item.name || ''}" class="w-full h-full object-cover">` : ''}
                    </a>
                    
                    <div class="flex-1 min-w-0 pr-1">
                        <a href="${item.link || '#'}" class="block whitespace-normal leading-snug text-[0.88rem] font-bold text-slate-900 line-clamp-2 hover:text-blue-600 transition-colors">
                            ${item.name || 'პროდუქტი'}
                        </a>
                        <div class="text-[0.95rem] text-blue-600 font-bold flex items-center mt-1">
                            ${priceFixed} ${oldPHtml}
                        </div>
                    </div>

                    <button type="button" onclick="window.removeFavByIdx(${idx}, event)" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="წაშლა">
                        <svg class="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
// 2. Открытие модалки избранного
// ==========================================
window.openFavs = function(e) {
    if (e?.preventDefault) e.preventDefault();
    renderFavs();
    window.openAppModal?.('favModal');
};
window.openFavorites = window.openFavs;

// ==========================================
// 3. Удаление товара из модалки
// ==========================================
window.removeFavByIdx = function(idx, e) {
    if (e?.preventDefault) e.preventDefault();
    if (e?.stopPropagation) e.stopPropagation();

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
// 4. Умный поиск карточки и извлечение данных
// ==========================================

// Поиск родительской карточки товара
function findCard(btn) {
    if (!btn) return null;

    // 1. Проверяем ваши блоки каруселей: subcatScroll, catScroll, recentScroll
    const scrollItem = btn.closest('#subcatScroll > *, #catScroll > *, #recentScroll > *, [id*="Scroll"] > *');
    if (scrollItem) return scrollItem;

    // 2. Стандартные карточки и Tailwind-слайды
    const genericCard = btn.closest('.product-card, .product-item, .card-product, .card, .snap-start, .flex-shrink-0');
    if (genericCard && genericCard !== document.body) return genericCard;

    return null;
}

// Извлечение ссылки
function getLink(card) {
    if (card) {
        const a = card.querySelector('a[href*="/product/"], a.product-link') || 
                  card.querySelector('a:not(.btn-fav):not(.btn-fav-card)');
        if (a && a.getAttribute('href')) {
            try {
                return new URL(a.getAttribute('href'), window.location.origin).pathname;
            } catch (e) {
                return a.getAttribute('href');
            }
        }
    }
    return window.location.pathname;
}

// Извлечение картинки
function getImage(card) {
    const root = card || document;
    const img = root.querySelector('.product-image, .main-gallery-slide img, .product-main-img, .product-gallery img, img');
    if (!img) return '';
    return img.dataset.src || img.dataset.original || img.getAttribute('src') || img.src || '';
}

// Извлечение названия
function getTitle(card) {
    if (card) {
        // Ищем явные селекторы
        const direct = card.querySelector('.product-name, .product-title, .card-title, h1, h2, h3, h4, .title');
        if (direct && direct.innerText.trim() && !direct.innerText.includes('₾')) {
            return direct.innerText.trim();
        }

        // Ищем текст внутри ссылок
        const links = card.querySelectorAll('a:not(.btn-fav):not(.btn-fav-card)');
        for (let a of links) {
            const txt = a.innerText.trim();
            if (txt && txt.length > 2 && !txt.includes('₾') && isNaN(Number(txt))) {
                return txt;
            }
        }

        // Ищем в alt картинки
        const img = card.querySelector('img');
        if (img && img.alt && img.alt.trim().length > 2) {
            return img.alt.trim();
        }
    } else {
        // На странице самого товара
        const mainH1 = document.querySelector('h1.product-title-h1, h1.product-title, h1, .title-desktop, .title-mobile, .product-name');
        if (mainH1 && mainH1.innerText.trim()) return mainH1.innerText.trim();
    }
    return "პროდუქტი";
}

// Извлечение цены и старой цены (сканирует элементы с символом ₾)
function getPrices(card) {
    const root = card || document;
    let price = "0 ₾";
    let oldPrice = null;

    // 1. Ищем все конечные текстовые элементы со знаком ₾
    const allElements = Array.from(root.querySelectorAll('*'));
    const lariElements = allElements.filter(el => {
        const txt = el.innerText || '';
        return txt.includes('₾') && el.children.length === 0 && !el.closest('#favModal') && !el.closest('#ordersModal');
    });

    if (lariElements.length > 0) {
        let currentPrices = [];

        lariElements.forEach(el => {
            const isOld = el.classList.contains('line-through') || 
                          el.closest('.line-through') || 
                          el.tagName === 'DEL' || 
                          el.tagName === 'S' ||
                          el.classList.contains('text-slate-400') ||
                          el.classList.contains('text-gray-400') ||
                          el.classList.contains('old-price') ||
                          el.classList.contains('modern-price-old');

            const val = el.innerText.replace(/₾/g, '').trim();
            if (val) {
                if (isOld && !oldPrice) {
                    oldPrice = val + ' ₾';
                } else {
                    currentPrices.push(val);
                }
            }
        });

        if (currentPrices.length > 0) {
            price = currentPrices[0] + ' ₾';
        }
    }

    // 2. Если на детальной странице цена не нашлась, проверяем основные контейнеры цены
    if (price === "0 ₾" && !card) {
        const pagePriceEl = document.querySelector('.modern-price-current, [class*="price-current"], [class*="product-price"], [data-price]');
        if (pagePriceEl) {
            const val = pagePriceEl.innerText.replace(/₾/g, '').trim();
            if (val) price = val + ' ₾';
        }
    }

    return { price, oldPrice };
}

// ==========================================
// 5. Подсветка кнопок-сердечек на странице
// ==========================================
function syncFavButtons() {
    try {
        const favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
        const favLinks = new Set(favs.map(f => f.link));

        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(btn => {
            const card = findCard(btn);
            const link = getLink(card);
            
            if (link && favLinks.has(link)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    } catch (e) {}
}
window.syncFavButtons = syncFavButtons;

// ==========================================
// 6. Добавление / Удаление при клике на сердечко
// ==========================================
window.toggleFav = function(event, btn) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!btn) return;

    try {
        const card = findCard(btn);
        
        const link = getLink(card);
        const name = getTitle(card);
        const img = getImage(card);
        const { price, oldPrice } = getPrices(card);

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
        window.updateBadges?.();
    } catch (e) {
        console.error('Error toggling favorite:', e);
    }
};

// Запуск подсветки кнопок при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncFavButtons);
} else {
    syncFavButtons();
}
