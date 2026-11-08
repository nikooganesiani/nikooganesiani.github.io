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
                <div class="absolute top-2.5 left-2.5 z-[10] py-1 px-2 rounded-md text-[length:12px] leading-[1.5] font-semibold bg-[#ef4444] text-white pointer-events-none select-none">
                    -${percent}%
                </div>`;
            }
        }

        // Полоски показывают снимок, выбранный положением курсора над фото.
        const dotsHtml = hasMultipleImages ? `
            <div class="card-image-indicators" id="dots-${uniqueId}" aria-hidden="true">
                ${imgs.map((_, i) => `<span class="card-image-indicator${i === 0 ? ' active' : ''}"></span>`).join('')}
            </div>` : '';

        const formattedPrice = formatPriceDisplay(p.price);
        const formattedOldPrice = oldVal > newVal ? formatPriceDisplay(p.oldPrice) : '';

        return `
        <div class="product-card relative flex flex-col min-w-0 border-0 rounded-none bg-transparent text-[#2c3644] overflow-visible [.product-carousel_>_&]:[flex:0_0_calc((100%_-_96px)_/_5)] [.product-carousel_>_&]:snap-start max-[1024px]:[.product-carousel_>_&]:basis-[calc((100%_-_48px)_/_3)] max-[768px]:[.product-carousel_>_&]:basis-[calc((100%_-_32px)_/_2.5)]" data-product-id="${safeId}">

            <!-- Блок изображения -->
            <div class="product-card-media relative w-full aspect-square bg-transparent rounded-xl overflow-hidden">
                ${discountBadge}

                <button type="button" class="btn-fav-card card-hover-favorite absolute top-1.5 right-1.5 z-[10] flex items-center justify-center w-11 h-11 border-0 rounded-[50%] bg-transparent text-[#8893a1] cursor-pointer [transition:color_.2s,_background_.2s] hover:text-[#d14b62] [&.active]:text-[#d14b62] [&.active_svg]:fill-current" aria-pressed="false" aria-label="დამატება რჩეულებში: ${safeName}" title="დამატება რჩეულებში" onclick="toggleFav(event, this)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>

                <!-- overflow-x-hidden не перехватывает свайп пальцем/тачпадом у родительской карусели, а gap-2 исключает попадание края соседнего фото -->
                <div class="product-images-track flex w-full h-full gap-2 overflow-x-hidden snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" id="track-${uniqueId}">
                    ${imgs.map((img) => `
                        <div class="flex items-center justify-center [flex:0_0_100%] w-full h-full bg-transparent overflow-hidden snap-start">
                            <a href="${productUrl}" class="block w-full h-full" draggable="false" tabindex="-1" aria-hidden="true">
                                <img class="block w-full h-full object-contain object-center mix-blend-multiply"
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
            <div class="flex flex-col pt-4 pr-[1px] pb-0 pl-[1px] min-w-0">

                <!-- Название до двух строк -->
                <a href="${productUrl}" class="product-name block overflow-hidden whitespace-nowrap text-ellipsis text-[length:13px] leading-[1.65] font-[550] text-[#414b59] mb-2 no-underline hover:text-brand max-[768px]:text-[length:12px]" title="${safeName}">
                    ${safeName}
                </a>

                <!-- Блок цены -->
                <div class="flex items-baseline flex-wrap gap-1.5 mb-3">
                    <div class="product-card-price ${oldVal > newVal && newVal > 0 ? 'text-brand' : 'text-black'} whitespace-nowrap text-[length:18px] font-bold leading-6 tracking-[-.02em] tabular-nums max-[768px]:text-[length:16px]">
                        ${newVal > 0 ? `<span>${formattedPrice}</span><span class="card-price-currency">₾</span>` : 'ფასი ზუსტდება'}
                    </div>
                    ${formattedOldPrice ? `
                        <span class="text-[#929ba8] text-[length:12px] leading-[1.4] line-through [text-decoration-thickness:1px]">
                            ${formattedOldPrice}₾
                        </span>
                    ` : ''}
                </div>

                <!-- Кнопка с плавной анимацией (transition-all duration-200 ease-out active:scale-95) и соосным скруглением rounded-lg -->
                <button type="button" ${available ? 'aria-haspopup="dialog" aria-controls="orderFormModal" aria-expanded="false"' : 'disabled'} class="flex items-center justify-center gap-1.5 w-full mt-0 bg-brand border border-solid border-brand rounded-lg text-white min-h-10 py-[9px] px-3 text-[length:12px] leading-[1.5] font-[550] no-underline cursor-pointer shadow-none [transition:border-color_.2s,_color_.2s,_background_.2s] hover:bg-[#104dce] hover:border-[#104dce] hover:text-white disabled:border-[#eceff3] disabled:text-[#929ba8] disabled:bg-[#f7f8fa] disabled:cursor-default [&_svg]:shrink-0" aria-label="${available ? 'ყიდვა: ' : 'არ არის მარაგში: '}${safeName}" onclick="window.triggerCardOrder('${uniqueId}', event)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    <span>${available ? 'ყიდვა' : 'არ არის მარაგში'}</span>
                </button>
            </div>
        </div>`;
    };

    // Restore the cover when the pointer leaves the image, including late-loaded cards.
    document.addEventListener('pointerout', event => {
        const media = event.target.closest?.('.product-card-media');
        if (!media || (event.relatedTarget && media.contains(event.relatedTarget))) return;
        const track = media.querySelector('.product-images-track');
        if (!track || track.children.length < 2) return;
        track._previewIndex = undefined;
        track._previewWidth = undefined;
        track.scrollTo({ left: 0, behavior: 'instant' });
        const indicators = media.querySelector('.card-image-indicators');
        if (indicators) Array.from(indicators.children).forEach((indicator, i) => indicator.classList.toggle('active', i === 0));
    });

    // Delegation covers cards rendered after catalog requests and load-more.
    document.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch' || !window.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)').matches) return;
        const media = event.target.closest?.('.product-card-media');
        const track = media?.querySelector('.product-images-track');
        if (!track || track.children.length < 2) return;
        const bounds = media.getBoundingClientRect();
        if (!bounds.width) return;
        const index = Math.max(0, Math.min(track.children.length - 1,
            Math.floor((event.clientX - bounds.left) / bounds.width * track.children.length)));
        if (track._previewIndex === index && track._previewWidth === bounds.width) return;
        track._previewIndex = index;
        track._previewWidth = bounds.width;
        track.scrollTo({ left: track.children[index].offsetLeft - track.children[0].offsetLeft, behavior: 'instant' });
        const indicators = media.querySelector('.card-image-indicators');
        if (indicators) Array.from(indicators.children).forEach((indicator, i) => indicator.classList.toggle('active', i === index));
    });

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
