(function () {
    'use strict';

    const STORAGE_KEY = 'myFavs';
    const API_URL = 'https://api.enkaelectronics.com.ge/';
    const CACHE_KEY = 'enka_catalog_cache';

    let apiCatalogCache = null;
    let apiCatalogPromise = null;

    /* ==========================================================================
       1. CATALOG API LAYER (ASYNC & CACHED)
       ========================================================================== */

    /**
     * Загрузка каталога с автоматическим кэшированием в sessionStorage
     */
    async function loadCatalog() {
        if (apiCatalogCache && apiCatalogCache.length > 0) {
            return apiCatalogCache;
        }

        if (apiCatalogPromise) {
            return apiCatalogPromise;
        }

        try {
            const localCached = sessionStorage.getItem(CACHE_KEY);
            if (localCached) {
                apiCatalogCache = JSON.parse(localCached);
                return apiCatalogCache;
            }
        } catch (e) {}

        apiCatalogPromise = fetch(API_URL)
            .then(res => {
                if (!res.ok) throw new Error('API network error');
                return res.json();
            })
            .then(data => {
                const list = Array.isArray(data) ? data : (data.products || []);
                apiCatalogCache = list;
                try {
                    sessionStorage.setItem(CACHE_KEY, JSON.stringify(list));
                } catch (e) {}
                return list;
            })
            .catch(err => {
                console.warn('[Favorites API] Failed to fetch:', err);
                return [];
            })
            .finally(() => {
                apiCatalogPromise = null;
            });

        return apiCatalogPromise;
    }

    /**
     * Поиск товара в API по артикулу (SKU), ID или ссылке
     */
    async function findInApi(sku, link, name) {
        const catalog = await loadCatalog();
        if (!catalog || catalog.length === 0) return null;

        const cleanSku = sku ? String(sku).trim() : null;

        return catalog.find(item => {
            if (cleanSku && item.sku && String(item.sku).trim() === cleanSku) return true;
            if (cleanSku && item.id && String(item.id).trim() === cleanSku) return true;
            if (link && item.url && item.url === link) return true;
            if (name && item.name && item.name.trim() === name.trim()) return true;
            return false;
        }) || null;
    }

    function extractApiImage(images) {
        if (!images) return '';
        if (Array.isArray(images)) return images[0] || '';
        if (typeof images === 'string') {
            try {
                const parsed = JSON.parse(images);
                if (Array.isArray(parsed)) return parsed[0] || '';
            } catch (e) {
                return images.split(',')[0].trim();
            }
            return images.trim();
        }
        return '';
    }

    function formatPrice(val) {
        if (val === undefined || val === null || val === '') return '0 ₾';
        const str = String(val).replace(/₾/g, '').trim();
        return `${str} ₾`;
    }

    /* ==========================================================================
       2. LOCAL STORAGE MANAGEMENT
       ========================================================================== */

    function getFavs() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveFavs(items) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (e) {}
    }

    /* ==========================================================================
       3. DOM DATA EXTRACTION (NO WRONG TARGETS)
       ========================================================================== */

    /**
     * Определяет, находится ли кнопка внутри каталожной карточки
     */
    function getParentCard(btn) {
        if (!btn) return null;
        return btn.closest('.product-card, [data-product-card], article, .card');
    }

    /**
     * Извлечение SKU конкретного товара
     */
    function getItemSku(btn, card) {
        if (btn && btn.dataset.sku) return btn.dataset.sku.trim();
        if (card && card.dataset.sku) return card.dataset.sku.trim();

        const skuContainer = btn ? btn.closest('[data-sku]') : null;
        if (skuContainer && skuContainer.dataset.sku) return skuContainer.dataset.sku.trim();

        // Если это страница товара (gallery.html)
        if (!card) {
            const pageEl = document.querySelector('[data-sku]');
            if (pageEl && pageEl.dataset.sku) return pageEl.dataset.sku.trim();

            const skuEl = document.querySelector('#sku, .product-sku, [itemprop="sku"]');
            if (skuEl) return skuEl.textContent.replace(/[^\d]/g, '').trim();
        }

        return '';
    }

    /**
     * Извлечение относительной ссылки товара (без хоста)
     */
    function getItemLink(btn, card, sku) {
        if (btn && btn.dataset.url) return btn.dataset.url.trim();
        if (card && card.dataset.url) return card.dataset.url.trim();

        if (card) {
            const a = card.querySelector('a.product-link, a[href*="/product/"], a:not(.btn-fav)');
            if (a && a.getAttribute('href')) {
                try {
                    return new URL(a.getAttribute('href'), window.location.origin).pathname;
                } catch (e) {
                    return a.getAttribute('href');
                }
            }
        }

        // Если это страница товара
        if (!card) {
            return window.location.pathname;
        }

        return sku ? `/product/${sku}/` : '';
    }

    function getItemFallbackName(btn, card) {
        if (btn && btn.dataset.name) return btn.dataset.name.trim();
        if (card) {
            if (card.dataset.name) return card.dataset.name.trim();
            const nameEl = card.querySelector('.product-name, .product-title, .card-title, h3, h2');
            if (nameEl) return nameEl.textContent.trim();
        }
        const titleEl = document.querySelector('h1.product-title-h1, h1, .title-desktop, .title-mobile');
        return titleEl ? titleEl.textContent.trim() : 'პროდუქტი';
    }

    function getItemFallbackPrice(btn, card) {
        if (btn && btn.dataset.price) return btn.dataset.price;
        if (card) {
            if (card.dataset.price) return card.dataset.price;
            const priceEl = card.querySelector('.product-price, .modern-price-current, .price');
            if (priceEl) return priceEl.textContent;
        }
        const priceEl = document.querySelector('.modern-price-current, .product-price, [data-price]');
        return priceEl ? (priceEl.dataset.price || priceEl.textContent) : '0';
    }

    function getItemFallbackOldPrice(btn, card) {
        if (btn && btn.dataset.oldPrice) return btn.dataset.oldPrice;
        if (card) {
            if (card.dataset.oldPrice) return card.dataset.oldPrice;
            const el = card.querySelector('.old-price, .modern-price-old');
            if (el) return el.textContent;
        }
        const el = document.querySelector('.modern-price-old, .old-price, [data-old-price]');
        return el ? (el.dataset.oldPrice || el.textContent) : null;
    }

    function getItemFallbackImage(btn, card) {
        const imgEl = card 
            ? card.querySelector('.product-image, img')
            : document.querySelector('.main-gallery-slide img, .product-main-img, .product-gallery img, img');

        if (!imgEl) return '';
        return imgEl.dataset.src || imgEl.dataset.original || imgEl.src || '';
    }

    /* ==========================================================================
       4. BUTTON SYNCHRONIZATION (STRICT ISOLATION)
       ========================================================================== */

    /**
     * Точечная синхронизация активности кнопок
     */
    function syncFavButtons() {
        const favs = getFavs();
        const favSkus = new Set(favs.map(f => String(f.sku || '').trim()).filter(Boolean));
        const favLinks = new Set(favs.map(f => f.link).filter(Boolean));

        const buttons = document.querySelectorAll('.btn-fav, .btn-fav-card');

        buttons.forEach(btn => {
            const card = getParentCard(btn);
            const sku = getItemSku(btn, card);
            const link = getItemLink(btn, card, sku);

            let isActive = false;

            if (card) {
                // Внутри карточки каталога: сравниваем строго SKU карточки или ссылку карточки
                if (sku && favSkus.has(sku)) {
                    isActive = true;
                } else if (link && link !== window.location.pathname && favLinks.has(link)) {
                    isActive = true;
                }
            } else {
                // На отдельной странице товара (gallery.html)
                if (sku && favSkus.has(sku)) {
                    isActive = true;
                } else if (favLinks.has(window.location.pathname)) {
                    isActive = true;
                }
            }

            if (isActive) {
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-pressed', 'false');
            }
        });
    }

    /* ==========================================================================
       5. BADGES & COUNTERS
       ========================================================================== */

    function updateBadges() {
        const favs = getFavs();
        const count = favs.length;

        // Обновляем все элементы счетчиков в хедере и навигации
        const badges = document.querySelectorAll('#favCount, #favBadge, .fav-count, .fav-badge, [data-fav-count], [data-badge-fav]');
        badges.forEach(badge => {
            badge.textContent = count;
            if (count > 0) {
                badge.classList.remove('hidden');
            }
        });

        // Счетчик в заголовке модального окна
        const modalCount = document.getElementById('favModalCount');
        if (modalCount) {
            modalCount.textContent = count > 0 ? `(${count})` : '';
        }

        if (typeof window.updateBadges === 'function' && window.updateBadges !== updateBadges) {
            try { window.updateBadges(); } catch (e) {}
        }
    }

    /* ==========================================================================
       6. MODAL WINDOW LOGIC (#favModal)
       ========================================================================== */

    function renderFavModalList() {
        const listContainer = document.getElementById('favList');
        if (!listContainer) return;

        const favs = getFavs();

        if (favs.length === 0) {
            listContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-center text-slate-400">
                    <svg class="w-12 h-12 mb-3 text-slate-300 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                    </svg>
                    <p class="font-bold text-slate-700 text-base">სია ცარიელია</p>
                    <p class="text-xs text-slate-400 mt-1">თქვენ არ გაქვთ დამატებული პროდუქტები</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = favs.map(item => `
            <div class="flex items-center gap-3 py-3 border-b border-slate-100 last:border-b-0 group/fav" data-fav-sku="${item.sku || ''}" data-fav-link="${item.link || ''}">
                <a href="${item.link || '#'}" class="w-16 h-16 flex-shrink-0 bg-slate-50 rounded-2xl overflow-hidden p-1 flex items-center justify-center border border-slate-100">
                    <img src="${item.img || ''}" alt="${item.name || ''}" class="w-full h-full object-contain" onerror="this.style.opacity='0.2'">
                </a>
                <div class="flex-1 min-w-0">
                    <a href="${item.link || '#'}" class="block text-sm font-bold text-slate-900 truncate hover:text-[#155dfc] transition-colors" title="${item.name}">
                        ${item.name || 'პროდუქტი'}
                    </a>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-sm font-extrabold text-[#155dfc]">${item.price || '0 ₾'}</span>
                        ${item.oldPrice ? `<span class="text-xs text-slate-400 line-through">${item.oldPrice}</span>` : ''}
                    </div>
                </div>
                <button type="button" 
                        class="btn-fav-item-remove w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border-none bg-transparent cursor-pointer"
                        data-remove-sku="${item.sku || ''}" 
                        data-remove-link="${item.link || ''}"
                        title="წაშლა">
                    <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            </div>
        `).join('');
    }

    function openFavModal(e) {
        if (e) e.preventDefault();
        const modal = document.getElementById('favModal');
        if (!modal) return;

        renderFavModalList();
        updateBadges();

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Вызов reflow для срабатывания CSS-анимации Tailwind
        void modal.offsetWidth;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeFavModal(e) {
        if (e) e.preventDefault();
        const modal = document.getElementById('favModal');
        if (!modal) return;

        modal.classList.remove('active');
        document.body.style.overflow = '';

        setTimeout(() => {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }, 400);
    }

    function removeFavItem(sku, link) {
        let favs = getFavs();
        favs = favs.filter(item => {
            if (sku && item.sku) return String(item.sku).trim() !== String(sku).trim();
            if (link && item.link) return item.link !== link;
            return true;
        });

        saveFavs(favs);
        renderFavModalList();
        syncFavButtons();
        updateBadges();

        if (typeof window.showToast === 'function') {
            window.showToast('წაშლილია რჩეულებიდან');
        }

        window.dispatchEvent(new CustomEvent('favorites:updated', { detail: { favs } }));
    }

    /* ==========================================================================
       7. TOGGLE FAVORITES CORE
       ========================================================================== */

    window.toggleFav = async function (event, btnElement) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const btn = btnElement || (event ? event.target.closest('.btn-fav, .btn-fav-card') : null);
        if (!btn) return;

        const card = getParentCard(btn);
        const sku = getItemSku(btn, card);
        const link = getItemLink(btn, card, sku);
        const fallbackName = getItemFallbackName(btn, card);

        let favs = getFavs();

        // Проверяем, есть ли товар уже в избранном
        const existingIdx = favs.findIndex(f => {
            if (sku && f.sku) return String(f.sku).trim() === String(sku).trim();
            if (link && f.link) return f.link === link;
            return false;
        });

        const isRemoving = existingIdx > -1;

        if (isRemoving) {
            // Удаляем
            favs.splice(existingIdx, 1);
            saveFavs(favs);
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');

            if (typeof window.showToast === 'function') {
                window.showToast('წაშლილია რჩეულებიდან');
            }
        } else {
            // Оптимистично активируем кнопку сразу
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');

            // Запрашиваем точные данные из API каталога
            const apiItem = await findInApi(sku, link, fallbackName);

            const newItem = {
                id: apiItem ? apiItem.id : null,
                sku: sku || (apiItem ? String(apiItem.sku) : ''),
                name: (apiItem && apiItem.name) || fallbackName,
                brand: (apiItem && apiItem.brand) || '',
                price: formatPrice((apiItem && apiItem.price) || getItemFallbackPrice(btn, card)),
                oldPrice: (apiItem && apiItem.oldPrice) ? formatPrice(apiItem.oldPrice) : (getItemFallbackOldPrice(btn, card) ? formatPrice(getItemFallbackOldPrice(btn, card)) : null),
                img: (apiItem && extractApiImage(apiItem.images)) || getItemFallbackImage(btn, card),
                link: link || (sku ? `/product/${sku}/` : window.location.pathname),
                category: (apiItem && apiItem.categories) || (btn.dataset.cat || ''),
                subcategory: (apiItem && apiItem.subcategories) || (btn.dataset.subcat || '')
            };

            favs = getFavs();
            // Исключаем дубликаты
            favs = favs.filter(f => !(sku && f.sku === sku));
            favs.unshift(newItem);
            saveFavs(favs);

            if (typeof window.showToast === 'function') {
                window.showToast('დამატებულია რჩეულებში', 'fav');
            }
        }

        syncFavButtons();
        updateBadges();

        const modal = document.getElementById('favModal');
        if (modal && !modal.classList.contains('hidden')) {
            renderFavModalList();
        }

        window.dispatchEvent(new CustomEvent('favorites:updated', { detail: { favs } }));
    };

    /* ==========================================================================
       8. GLOBAL EVENT DELEGATION
       ========================================================================== */

    function initFavorites() {
        // Фоновый прогрев каталога API
        loadCatalog();

        // Синхронизация при загрузке
        syncFavButtons();
        updateBadges();

        // Делегирование кликов
        document.addEventListener('click', function (e) {
            // Клик по кнопке открытия модалки избранного в шапке / меню
            const openTrigger = e.target.closest('a[href="#favModal"], [data-open-fav-modal], #openFavModal, .header-fav-btn, a[href*="favModal"]');
            if (openTrigger) {
                e.preventDefault();
                openFavModal(e);
                return;
            }

            // Клик по кнопке удаления товара внутри модалки
            const removeBtn = e.target.closest('.btn-fav-item-remove');
            if (removeBtn) {
                e.preventDefault();
                e.stopPropagation();
                removeFavItem(removeBtn.dataset.removeSku, removeBtn.dataset.removeLink);
                return;
            }

            // Клик по фону (backdrop) для закрытия модалки
            const modal = document.getElementById('favModal');
            if (modal && e.target === modal) {
                closeFavModal(e);
                return;
            }

            // Клик по кнопке закрытия модалки
            if (e.target.closest('[data-close-fav-modal], .btn-close-fav, .close-modal')) {
                closeFavModal(e);
                return;
            }
        });

        // Закрытие модалки по клавише ESC
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeFavModal();
            }
        });

        // Отслеживание динамической подгрузки товаров (пагинация/фильтры)
        if (document.body) {
            let debounceTimer = null;
            const observer = new MutationObserver(mutations => {
                const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
                if (hasAddedNodes) {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        syncFavButtons();
                        updateBadges();
                    }, 50);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // Экспорт в глобальную область видимости
    window.openFavModal = openFavModal;
    window.closeFavModal = closeFavModal;
    window.toggleFavModal = function () {
        const modal = document.getElementById('favModal');
        if (modal && modal.classList.contains('active')) {
            closeFavModal();
        } else {
            openFavModal();
        }
    };
    window.syncFavButtons = syncFavButtons;
    window.updateBadges = updateBadges;
    window.removeFromFavs = removeFavItem;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFavorites);
    } else {
        initFavorites();
    }
})();
