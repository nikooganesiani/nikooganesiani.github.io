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
            window.openOrderForm(product);
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
                <div class="absolute top-2.5 left-2.5 bg-red-500 text-white px-2 py-1 rounded-md text-[0.75rem] max-sm:text-[0.7rem] font-bold z-10 pointer-events-none select-none">
                    -${percent}%
                </div>`;
            }
        }

        // Индикаторы (точки) и стрелки навигации (только для десктопа, чтобы не мешать свайпу карусели)
        let dotsHtml = '';
        let arrowsHtml = '';

        if (hasMultipleImages) {
            dotsHtml = `
            <div class="absolute bottom-2.5 left-0 right-0 flex justify-center items-center gap-1.5 z-10 pointer-events-none max-lg:hidden" id="dots-${uniqueId}">
                ${imgs.map((_, i) => `
                    <div class="w-1.5 h-1.5 rounded-full bg-slate-900/20 transition-all duration-300 dot ${i === 0 ? 'active !bg-blue-600 scale-[1.25]' : ''}"></div>
                `).join('')}
            </div>`;

            arrowsHtml = `
            <button type="button" class="absolute top-1/2 -translate-y-1/2 left-2 w-7 h-7 bg-white/95 border border-slate-200/70 rounded-full flex items-center justify-center cursor-pointer text-slate-900 opacity-0 transition-all duration-200 z-20 outline-none hover:text-blue-600 active:scale-90 max-lg:hidden card-nav-arrow prev group-hover/card:opacity-100" aria-label="წინა" onclick="scrollCardGallery('${uniqueId}', -1, event)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button type="button" class="absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 bg-white/95 border border-slate-200/70 rounded-full flex items-center justify-center cursor-pointer text-slate-900 opacity-0 transition-all duration-200 z-20 outline-none hover:text-blue-600 active:scale-90 max-lg:hidden card-nav-arrow next group-hover/card:opacity-100" aria-label="შემდეგი" onclick="scrollCardGallery('${uniqueId}', 1, event)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m9 18 6-6-6-6"/></svg>
            </button>`;
        }

        const formattedPrice = formatPriceDisplay(p.price);
        const formattedOldPrice = oldVal > newVal ? formatPriceDisplay(p.oldPrice) : '';

        return `
        <div class="flex-[0_0_calc(25%-12px)] max-lg:flex-[0_0_calc(33.333%-8px)] max-sm:flex-[0_0_calc(50%-6px)] snap-start min-w-0 flex flex-col relative group/card product-card bg-white rounded-2xl overflow-hidden" data-product-id="${safeId}">

            <!-- Блок изображения -->
            <div class="relative w-full aspect-square overflow-hidden rounded-t-2xl bg-white">
                ${discountBadge}

                <button type="button" class="absolute top-1.5 right-1.5 w-11 h-11 bg-white/95 border-none rounded-full flex items-center justify-center cursor-pointer text-slate-500 transition-all duration-200 outline-none z-10 hover:text-red-500 active:scale-85 btn-fav-card [&.active]:text-red-500 [&.active>svg]:fill-current" aria-pressed="false" aria-label="დამატება რჩეულებში: ${safeName}" title="დამატება რჩეულებში" onclick="toggleFav(event, this)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>

                ${arrowsHtml}

                <!-- overflow-x-hidden не перехватывает свайп пальцем/тачпадом у родительской карусели, а gap-2 исключает попадание края соседнего фото -->
                <div class="flex w-full h-full gap-2 overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden product-images-track" id="track-${uniqueId}">
                    ${imgs.map((img) => `
                        <div class="flex-[0_0_100%] w-full h-full shrink-0 flex items-center justify-center overflow-hidden bg-white">
                            <a href="${productUrl}" class="w-full h-full block" draggable="false" tabindex="-1" aria-hidden="true">
                                <img class="w-full h-full object-contain block p-2"
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
            <div class="bg-white rounded-b-2xl pt-3 pb-4 px-4 max-sm:pt-2.5 max-sm:pb-3 max-sm:px-3 flex flex-col flex-1 product-info">

                <!-- Название строго в 1 строку -->
                <a href="${productUrl}" class="product-name block text-[0.95rem] max-sm:text-[0.82rem] font-semibold text-slate-900 leading-snug tracking-tight line-clamp-2 min-h-[2.75em] mb-3 no-underline transition-opacity duration-200 hover:opacity-75" title="${safeName}">
                    ${safeName}
                </a>

                <!-- Блок цены -->
                <div class="flex flex-row items-baseline gap-1.5 flex-wrap mb-3.5 max-sm:mb-2.5">
                    <div class="text-[1.45rem] max-sm:text-[1.15rem] font-bold text-blue-600 tracking-tight leading-none">
                        ${newVal > 0 ? formattedPrice + ' ₾' : 'ფასი ზუსტდება'}
                    </div>
                    ${formattedOldPrice ? `
                        <span class="text-[0.85rem] max-sm:text-[0.75rem] leading-none line-through decoration-slate-400 decoration-[1px] text-slate-400">
                            ${formattedOldPrice}₾
                        </span>
                    ` : ''}
                </div>

                <!-- Кнопка с плавной анимацией (transition-all duration-200 ease-out active:scale-95) и соосным скруглением rounded-lg -->
                <button type="button" ${available ? '' : 'disabled'} class="bg-blue-600 text-white border-none min-h-11 py-2.5 px-3 rounded-xl cursor-pointer font-bold text-[0.95rem] max-sm:text-[0.8rem] transition-all duration-200 ease-out flex items-center justify-center gap-1.5 hover:bg-blue-700 active:scale-95 outline-none w-full mt-auto disabled:bg-slate-200 disabled:text-slate-600" aria-label="${available ? 'ყიდვა: ' : 'არ არის მარაგში: '}${safeName}" onclick="window.triggerCardOrder('${uniqueId}', event)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="max-sm:w-3.5 max-sm:h-3.5 shrink-0"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
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
                        dots[i].classList.toggle('!bg-blue-600', isActive);
                        dots[i].classList.toggle('scale-[1.25]', isActive);
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
