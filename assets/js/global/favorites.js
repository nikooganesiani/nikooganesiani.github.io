/**
 * Favorites Manager with Direct API Integration
 * API Catalog: https://api.enkaelectronics.com.ge/
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'myFavs';
    const API_URL = 'https://api.enkaelectronics.com.ge/';
    const CACHE_STORAGE_KEY = 'enka_catalog_cache';

    let catalogMemoryCache = null;
    let catalogFetchPromise = null;

    /* ==========================================================================
       1. CATALOG API & CACHING LAYER
       ========================================================================== */

    /**
     * Фоновая загрузка и кэширование каталога товаров
     * @returns {Promise<Array>}
     */
    async function getCatalog() {
        if (catalogMemoryCache && catalogMemoryCache.length > 0) {
            return catalogMemoryCache;
        }

        if (catalogFetchPromise) {
            return catalogFetchPromise;
        }

        // Проверка локального кэша сессии для мгновенного доступа
        try {
            const sessionData = sessionStorage.getItem(CACHE_STORAGE_KEY);
            if (sessionData) {
                catalogMemoryCache = JSON.parse(sessionData);
                return catalogMemoryCache;
            }
        } catch (e) {
            console.warn('[Favorites] SessionStorage read error:', e);
        }

        catalogFetchPromise = fetch(API_URL)
            .then((res) => {
                if (!res.ok) throw new Error(`API HTTP Error: ${res.status}`);
                return res.json();
            })
            .then((data) => {
                const list = Array.isArray(data) ? data : (data.products || []);
                catalogMemoryCache = list;
                try {
                    sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(list));
                } catch (e) {
                    console.warn('[Favorites] SessionStorage quota exceeded or disabled');
                }
                return list;
            })
            .catch((err) => {
                console.error('[Favorites] Catalog fetch failed:', err);
                return [];
            })
            .finally(() => {
                catalogFetchPromise = null;
            });

        return catalogFetchPromise;
    }

    /**
     * Поиск товара в API каталоге по SKU или ID
     * @param {string} sku 
     * @returns {Promise<Object|null>}
     */
    async function findProductInApi(sku) {
        if (!sku) return null;
        const catalog = await getCatalog();
        const cleanSku = String(sku).trim();

        return catalog.find((item) => {
            return (item.sku && String(item.sku).trim() === cleanSku) ||
                   (item.id && String(item.id).trim() === cleanSku);
        }) || null;
    }

    /**
     * Извлечение первого доступного изображения товара
     * @param {any} images 
     * @returns {string}
     */
    function extractFirstImage(images) {
        if (!images) return '';
        if (Array.isArray(images)) return images[0] || '';
        if (typeof images === 'string') {
            try {
                const parsed = JSON.parse(images);
                if (Array.isArray(parsed)) return parsed[0] || '';
            } catch (e) {
                // Если строка разделена запятыми
                return images.split(',')[0].trim();
            }
            return images.trim();
        }
        return '';
    }

    /**
     * Форматирование цены со знаком валюты
     * @param {string|number} price 
     * @returns {string}
     */
    function formatPrice(price) {
        if (price === undefined || price === null || price === '') return '0 ₾';
        const strPrice = String(price).replace(/₾/g, '').trim();
        return `${strPrice} ₾`;
    }

    /* ==========================================================================
       2. DOM & DATA HELPERS
       ========================================================================== */

    /**
     * Безопасное получение SKU из элемента или родительской карточки
     * @param {HTMLElement} btn 
     * @returns {string}
     */
    function getProductSku(btn) {
        if (!btn) return '';

        // 1. Атрибут на самой кнопке
        if (btn.dataset.sku) return btn.dataset.sku.trim();

        // 2. Ближайший контейнер с data-sku
        const parentWithSku = btn.closest('[data-sku]');
        if (parentWithSku && parentWithSku.dataset.sku) {
            return parentWithSku.dataset.sku.trim();
        }

        // 3. Поиск в карточке товара
        const card = btn.closest('.product-card, [data-product-card]');
        if (card && card.dataset.sku) {
            return card.dataset.sku.trim();
        }

        // 4. Поиск на странице товара (глобальный контейнер)
        const pageContainer = document.querySelector('[data-sku]');
        if (pageContainer && pageContainer.dataset.sku) {
            return pageContainer.dataset.sku.trim();
        }

        return '';
    }

    /**
     * Безопасное получение URL страницы товара
     * @param {HTMLElement} btn 
     * @param {string} sku 
     * @returns {string}
     */
    function getProductLink(btn, sku) {
        if (btn && btn.dataset.url) return btn.dataset.url;

        const card = btn ? btn.closest('.product-card, [data-product-card]') : null;
        if (card) {
            if (card.dataset.url) return card.dataset.url;
            const aEl = card.querySelector('a.product-link, a[href*="/product/"], a:not(.btn-fav):not(.btn-fav-card)') || card.querySelector('a');
            if (aEl && aEl.getAttribute('href')) {
                try {
                    return new URL(aEl.getAttribute('href'), window.location.origin).pathname;
                } catch (e) {
                    return aEl.getAttribute('href');
                }
            }
        }

        if (window.location.pathname.includes('/product/') || (sku && window.location.pathname.includes(sku))) {
            return window.location.pathname;
        }

        return sku ? `/product/${sku}/` : window.location.pathname;
    }

    /**
     * Получение резервного изображения из DOM
     * @param {HTMLElement} btn 
     * @returns {string}
     */
    function getFallbackImage(btn) {
        const card = btn ? btn.closest('.product-card, [data-product-card]') : null;
        const imgEl = card 
            ? card.querySelector('.product-image, img')
            : document.querySelector('.main-gallery-slide img, .product-main-img, .product-gallery img, img');

        if (!imgEl) return '';
        return imgEl.dataset.src || imgEl.dataset.original || imgEl.src || '';
    }

    /* ==========================================================================
       3. STORAGE & STATE MANAGEMENT
       ========================================================================== */

    function getStoredFavorites() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            console.error('[Favorites] LocalStorage read error:', e);
            return [];
        }
    }

    function saveStoredFavorites(favs) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
        } catch (e) {
            console.error('[Favorites] LocalStorage save error:', e);
        }
    }

    /**
     * Сборка финального объекта товара с приоритетом данных из API
     * @param {HTMLElement} btn 
     * @param {string} sku 
     * @param {Object|null} apiProduct 
     * @returns {Object}
     */
    function buildProductData(btn, sku, apiProduct) {
        const link = getProductLink(btn, sku);

        if (apiProduct) {
            return {
                id: apiProduct.id || null,
                sku: String(apiProduct.sku || sku).trim(),
                name: apiProduct.name || btn.dataset.name || 'პროდუქტი',
                brand: apiProduct.brand || '',
                price: formatPrice(apiProduct.price || btn.dataset.price),
                oldPrice: apiProduct.oldPrice ? formatPrice(apiProduct.oldPrice) : (btn.dataset.oldPrice ? formatPrice(btn.dataset.oldPrice) : null),
                img: extractFirstImage(apiProduct.images) || getFallbackImage(btn),
                link: link,
                category: apiProduct.categories || btn.dataset.cat || '',
                subcategory: apiProduct.subcategories || btn.dataset.subcat || ''
            };
        }

        // Fallback: считывание строго из HTML dataset
        return {
            id: null,
            sku: sku,
            name: btn.dataset.name || 'პროდუქტი',
            brand: '',
            price: formatPrice(btn.dataset.price),
            oldPrice: btn.dataset.oldPrice ? formatPrice(btn.dataset.oldPrice) : null,
            img: getFallbackImage(btn),
            link: link,
            category: btn.dataset.cat || '',
            subcategory: btn.dataset.subcat || ''
        };
    }

    /* ==========================================================================
       4. CORE ACTION: TOGGLE FAVORITE
       ========================================================================== */

    /**
     * Переключение статуса избранного
     * @param {Event} [event] 
     * @param {HTMLElement} [buttonElement] 
     */
    async function toggleFavorite(event, buttonElement) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const btn = buttonElement || (event ? event.target.closest('.btn-fav, .btn-fav-card, [data-fav-btn]') : null);
        if (!btn) return;

        const sku = getProductSku(btn);
        const link = getProductLink(btn, sku);
        let favs = getStoredFavorites();

        // Поиск существующего элемента по SKU (в приоритете) или по URL
        const existingIndex = favs.findIndex((f) => {
            if (sku && f.sku) return String(f.sku).trim() === String(sku).trim();
            return f.link === link;
        });

        const isRemoving = existingIndex > -1;

        if (isRemoving) {
            // Удаление из избранного
            favs.splice(existingIndex, 1);
            saveStoredFavorites(favs);
            updateButtonVisualState(btn, false);
            syncAllButtons(sku, link, false);

            if (typeof window.showToast === 'function') {
                window.showToast('წაშლილია რჩეულებიდან');
            }
        } else {
            // Оптимистичное визуальное включение
            updateButtonVisualState(btn, true);
            syncAllButtons(sku, link, true);

            // Получение гарантированно актуальных данных из API
            let apiProduct = null;
            if (sku) {
                apiProduct = await findProductInApi(sku);
            }

            const newFavItem = buildProductData(btn, sku, apiProduct);

            // Добавление в начало списка
            favs = getStoredFavorites();
            favs.unshift(newFavItem);
            saveStoredFavorites(favs);

            if (typeof window.showToast === 'function') {
                window.showToast('დამატებულია რჩეულებში', 'fav');
            }
        }

        // Обновление бейджей и вызов внешних слушателей
        if (typeof window.updateBadges === 'function') {
            window.updateBadges();
        }

        window.dispatchEvent(new CustomEvent('favorites:updated', {
            detail: { favs: favs, count: favs.length, sku: sku }
        }));
    }

    /* ==========================================================================
       5. UI SYNCHRONIZATION
       ========================================================================== */

    /**
     * Обновление состояния конкретной кнопки
     * @param {HTMLElement} btn 
     * @param {boolean} isActive 
     */
    function updateButtonVisualState(btn, isActive) {
        if (!btn) return;

        const outlineIcon = btn.querySelector('.icon-outline');
        const filledIcon = btn.querySelector('.icon-filled');

        if (isActive) {
            btn.classList.add('active', 'text-[#155dfc]', 'border-[#155dfc]');
            btn.setAttribute('aria-pressed', 'true');
            if (outlineIcon) outlineIcon.classList.add('hidden');
            if (filledIcon) filledIcon.classList.remove('hidden');
        } else {
            btn.classList.remove('active', 'text-[#155dfc]', 'border-[#155dfc]');
            btn.setAttribute('aria-pressed', 'false');
            if (outlineIcon) outlineIcon.classList.remove('hidden');
            if (filledIcon) filledIcon.classList.add('hidden');
        }
    }

    /**
     * Синхронизация всех кнопок на странице, привязанных к конкретному товару
     * @param {string} sku 
     * @param {string} link 
     * @param {boolean} isActive 
     */
    function syncAllButtons(sku, link, isActive) {
        const buttons = document.querySelectorAll('.btn-fav, .btn-fav-card, [data-fav-btn]');
        buttons.forEach((btn) => {
            const btnSku = getProductSku(btn);
            const btnLink = getProductLink(btn, btnSku);

            if ((sku && btnSku && String(btnSku) === String(sku)) || (link && btnLink === link)) {
                updateButtonVisualState(btn, isActive);
            }
        });
    }

    /**
     * Полная синхронизация состояния всех кнопок на странице
     */
    function syncFavButtons() {
        const favs = getStoredFavorites();
        const favSkus = new Set(favs.filter((f) => f.sku).map((f) => String(f.sku).trim()));
        const favLinks = new Set(favs.map((f) => f.link));

        const buttons = document.querySelectorAll('.btn-fav, .btn-fav-card, [data-fav-btn]');
        buttons.forEach((btn) => {
            const sku = getProductSku(btn);
            const link = getProductLink(btn, sku);

            const isFav = (sku && favSkus.has(String(sku).trim())) || (link && favLinks.has(link));
            updateButtonVisualState(btn, Boolean(isFav));
        });
    }

    /* ==========================================================================
       6. INITIALIZATION & EVENT DELEGATION
       ========================================================================== */

    function initFavorites() {
        // Фоновый прогрев кэша API при первой загрузке
        getCatalog();

        // Синхронизация состояния кнопок в DOM
        syncFavButtons();

        // Делегирование событий клика (поддержка динамически созданных карточек)
        document.addEventListener('click', (event) => {
            const targetBtn = event.target.closest('.btn-fav, .btn-fav-card, [data-fav-btn]');
            if (targetBtn) {
                toggleFavorite(event, targetBtn);
            }
        });

        // Отслеживание динамической подгрузки элементов (пагинация, фильтрация)
        if (document.body) {
            let debounceTimer = null;
            const observer = new MutationObserver((mutations) => {
                const hasNewNodes = mutations.some((m) => m.addedNodes.length > 0);
                if (hasNewNodes) {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(syncFavButtons, 50);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // Экспорт в глобальное пространство для обратной совместимости
    window.toggleFav = toggleFavorite;
    window.syncFavButtons = syncFavButtons;
    window.Favorites = {
        get: getStoredFavorites,
        toggle: toggleFavorite,
        sync: syncFavButtons,
        getCatalog: getCatalog
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFavorites);
    } else {
        initFavorites();
    }
})();
