(() => {
    'use strict';

    // Хранилище объектов товаров в памяти (безопасная замена инлайн-JSON в onclick)
    const productStore = new Map();
    const FALLBACK_IMAGE = '/img/no-image.svg';
    const SLIDE_GAP = 8; // 8px (gap-2) — буфер против субпиксельного наложения соседних фото

    // Экранирование спецсимволов для безопасной вставки в HTML
    const escapeHtml = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // Парсинг цены (поддерживает целые и дробные значения)
    const parsePrice = (val) => {
        return window.productPrice(val);
    };

    // Форматирование цены для отображения
    const formatPriceDisplay = (val) => {
        if (val === null || val === undefined) return '';
        return escapeHtml(String(val).replace(/₾/g, '').trim());
    };

    // Вызов формы заказа по ключу из памяти
    window.triggerCardOrder = function (storeKey, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const product = productStore.get(String(storeKey));
        if (window.isProductAvailable(product) && typeof window.openOrderForm === 'function') {
            window.openOrderForm(product, event?.currentTarget);
        }
    };

    /**
     * Генерация HTML карточки товара
     */
    window.createProductCardHTML = function (p, prefix = 'sim') {
        if (!p || typeof p !== 'object') return '';

        if (!p.id) return '';
        const rawId = String(p.id);
        const safeId = escapeHtml(rawId);
        const uniqueId = `${String(prefix).replace(/[^a-z0-9_-]/gi, '')}-${Array.from(rawId).map(char => char.codePointAt(0).toString(16)).join('-')}`;
        const productUrl = `/product/${encodeURIComponent(rawId)}/`;
        const safeName = escapeHtml(p.name || '');

        productStore.set(uniqueId, p);

        // Фильтрация валидных изображений
        const rawImages = Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []);
        const imgs = rawImages.filter(
            (img) => typeof img === 'string' && img.trim() !== '' && !img.includes('youtube.com') && !img.includes('youtu.be')
        ).map(img => window.safeProductImage(img));
        if (imgs.length === 0) {
            imgs.push(FALLBACK_IMAGE);
        }

        const hasMultipleImages = imgs.length > 1;

        // Расчет скидки
        const oldVal = parsePrice(p.oldPrice);
        const newVal = parsePrice(p.price);
        const available = window.isProductAvailable(p);
        let discountBadge = '';

        if (oldVal > newVal && newVal > 0) {
            const percent = Math.round(((oldVal - newVal) / oldVal) * 100);
            if (percent > 0) {
                discountBadge = `
                <div class="product-card-discount">
                    -${percent}%
                </div>`;
            }
        }

        // Индикаторы (точки) и стрелки навигации (только для десктопа, чтобы не мешать свайпу карусели)
        let dotsHtml = '';
        let arrowsHtml = '';

        if (hasMultipleImages) {
            dotsHtml = `
            <div class="product-card-dots" id="dots-${uniqueId}">
                ${imgs.map((_, i) => `
                    <div class="dot ${i === 0 ? 'active' : ''}"></div>
                `).join('')}
            </div>`;

            arrowsHtml = `
            <button type="button" class="card-nav-arrow prev" aria-label="წინა" onclick="scrollCardGallery('${uniqueId}', -1, event)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button type="button" class="card-nav-arrow next" aria-label="შემდეგი" onclick="scrollCardGallery('${uniqueId}', 1, event)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m9 18 6-6-6-6"/></svg>
            </button>`;
        }

        const formattedPrice = formatPriceDisplay(p.price);
        const formattedOldPrice = oldVal > newVal ? formatPriceDisplay(p.oldPrice) : '';

        return `
        <div class="product-card" data-product-id="${safeId}">

            <!-- Блок изображения -->
            <div class="product-card-media">
                ${discountBadge}

                <button type="button" class="product-card-favorite btn-fav-card" aria-pressed="false" aria-label="დამატება რჩეულებში: ${safeName}" title="დამატება რჩეულებში" onclick="toggleFav(event, this)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>

                ${arrowsHtml}

                <!-- overflow-x-hidden не перехватывает свайп пальцем/тачпадом у родительской карусели, а gap-2 исключает попадание края соседнего фото -->
                <div class="product-images-track" id="track-${uniqueId}">
                    ${imgs.map((img) => `
                        <div class="product-card-slide">
                            <a href="${productUrl}" class="product-card-image-link" draggable="false" tabindex="-1" aria-hidden="true">
                                <img class="product-card-image"
                                     src="${escapeHtml(img)}"
                                     alt="${safeName}"
                                     width="600"
                                     height="600"
                                     loading="lazy"
                                     decoding="async"
                                     onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}';"
                                     draggable="false">
                            </a>
                        </div>
                    `).join('')}
                </div>

                ${dotsHtml}
            </div>

            <!-- Информация о товаре -->
            <div class="product-info">

                <!-- Название до двух строк -->
                <a href="${productUrl}" class="product-name" title="${safeName}">
                    ${safeName}
                </a>

                <!-- Блок цены -->
                <div class="product-card-prices">
                    <div class="product-card-price">
                        ${newVal > 0 ? formattedPrice + ' ₾' : 'ფასი ზუსტდება'}
                    </div>
                    ${formattedOldPrice ? `
                        <span class="product-card-old-price">
                            ${formattedOldPrice}₾
                        </span>
                    ` : ''}
                </div>

                <!-- Кнопка с плавной анимацией (transition-all duration-200 ease-out active:scale-95) и соосным скруглением rounded-lg -->
                <button type="button" ${available ? 'aria-haspopup="dialog" aria-controls="orderFormModal" aria-expanded="false"' : 'disabled'} class="product-card-action" aria-label="${available ? 'ყიდვა: ' : 'არ არის მარაგში: '}${safeName}" onclick="window.triggerCardOrder('${uniqueId}', event)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="product-card-action-icon"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    <span>${available ? 'ყიდვა' : 'არ არის მარაგში'}</span>
                </button>
            </div>
        </div>`;
    };

    /**
     * Обновление активной точки при переключении фото
     */
    window.updateDots = function (uniqueId, trackEl) {
        if (!trackEl || trackEl._isUpdating) return;
        trackEl._isUpdating = true;

        window.requestAnimationFrame(() => {
            const step = trackEl.clientWidth + SLIDE_GAP;
            if (step > SLIDE_GAP) {
                const index = Math.round(trackEl.scrollLeft / step);
                const dotsContainer = document.getElementById(`dots-${uniqueId}`);
                if (dotsContainer) {
                    const dots = dotsContainer.children;
                    for (let i = 0; i < dots.length; i++) {
                        const isActive = i === index;
                        dots[i].classList.toggle('active', isActive);
                    }
                }
            }
            trackEl._isUpdating = false;
        });
    };

    /**
     * Точное переключение слайдов по их реальному offsetLeft (без субпиксельной погрешности)
     */
    window.scrollCardGallery = function (id, dir, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const track = document.getElementById(`track-${id}`);
        if (!track || track.children.length <= 1) return;

        const slides = track.children;
        const total = slides.length;
        const step = track.clientWidth + SLIDE_GAP;

        const currentIndex = typeof track._targetIndex === 'number'
            ? track._targetIndex
            : Math.round(track.scrollLeft / step);

        const nextIndex = (currentIndex + dir + total) % total;
        track._targetIndex = nextIndex;

        const targetSlide = slides[nextIndex];
        if (targetSlide) {
            track.scrollTo({ left: targetSlide.offsetLeft - slides[0].offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }

        clearTimeout(track._resetTimer);
        track._resetTimer = setTimeout(() => {
            track._targetIndex = undefined;
        }, 350);
    };

    /**
     * Прокрутка внешней карусели товаров
     */
    window.scrollCarousel = function (containerId, direction) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const card = container.querySelector('.product-card');
        const gap = parseFloat(window.getComputedStyle(container).columnGap || window.getComputedStyle(container).gap) || 16;
        const scrollAmount = card ? card.offsetWidth + gap : 300;
        const maxScroll = container.scrollWidth - container.clientWidth;

        container.scrollTo({ left: Math.max(0, Math.min(maxScroll, container.scrollLeft + direction * scrollAmount)), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };

    window.bindProductCarousel = function(id, leftId, rightId) {
        const track = document.getElementById(id);
        if (!track) return;
        const update = () => {
            const max = Math.max(0, track.scrollWidth - track.clientWidth);
            const left = document.getElementById(leftId);
            const right = document.getElementById(rightId);
            if (left) left.disabled = track.scrollLeft <= 2;
            if (right) right.disabled = track.scrollLeft >= max - 2;
        };
        if (!track.dataset.carouselBound) {
            track.dataset.carouselBound = 'true';
            track.addEventListener('scroll', update, { passive: true });
            track.addEventListener('keydown', event => {
                if (event.target !== track || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                if (event.key === 'Home' || event.key === 'End') track.scrollTo({ left: event.key === 'Home' ? 0 : track.scrollWidth, behavior: 'auto' });
                else window.scrollCarousel(id, event.key === 'ArrowRight' ? 1 : -1);
            });
            if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(track);
        }
        requestAnimationFrame(update);
    };

    // Слушатель скролла для синхронизации точек
    document.addEventListener(
        'scroll',
        (e) => {
            const target = e.target;
            if (target && target.classList && target.classList.contains('product-images-track')) {
                const uniqueId = target.id.slice(6);
                window.updateDots(uniqueId, target);
            }
        },
        { capture: true, passive: true }
    );
})();
