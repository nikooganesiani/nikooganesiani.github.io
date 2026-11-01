(() => {
    'use strict';

    // Хранилище данных товаров в памяти (избавляет от сериализации JSON в HTML-атрибуты)
    const productStore = new Map();

    const FALLBACK_IMAGE = '/img/no-image.png';

    // Безопасное экранирование строк для вставки в HTML/атрибуты
    const escapeHtml = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // Корректный парсинг цены (поддерживает дробные значения, например "79.90 ₾")
    const parsePrice = (val) => {
        if (val === null || val === undefined) return 0;
        const cleaned = String(val).replace(/,/g, '.').replace(/[^0-9.]/g, '');
        return parseFloat(cleaned) || 0;
    };

    // Форматирование цены для вывода
    const formatPriceDisplay = (val) => {
        if (val === null || val === undefined) return '';
        return escapeHtml(String(val).replace(/₾/g, '').trim());
    };

    // Безопасный вызов формы заказа по ключу товара
    window.triggerCardOrder = function (storeKey, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const product = productStore.get(String(storeKey));
        if (product && typeof window.openOrderForm === 'function') {
            window.openOrderForm(product);
        }
    };

    /**
     * Генерация HTML карточки товара
     * @param {Object} p - Объект товара
     * @param {string} prefix - Префикс для уникальности ID в разных каруселях
     */
    window.createProductCardHTML = function (p, prefix = 'sim') {
        if (!p || typeof p !== 'object') return '';

        const rawId = p.id ?? Math.random().toString(36).slice(2, 9);
        const safeId = escapeHtml(rawId);
        const uniqueId = `${escapeHtml(prefix)}-${safeId}`;
        const productUrl = `/product/${encodeURIComponent(rawId)}/`;
        const safeName = escapeHtml(p.name || '');

        // Сохраняем оригинальный объект товара в память
        productStore.set(uniqueId, p);

        // Фильтрация изображений (исключаем видео-ссылки и пустые значения)
        const rawImages = Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []);
        const imgs = rawImages.filter(
            (img) => typeof img === 'string' && img.trim() !== '' && !img.includes('youtube.com') && !img.includes('youtu.be')
        );
        if (imgs.length === 0) {
            imgs.push(FALLBACK_IMAGE);
        }

        const hasMultipleImages = imgs.length > 1;

        // Расчет скидки
        const oldVal = parsePrice(p.oldPrice);
        const newVal = parsePrice(p.price);
        let discountBadge = '';

        if (oldVal > newVal && newVal > 0) {
            const percent = Math.round(((oldVal - newVal) / oldVal) * 100);
            if (percent > 0) {
                discountBadge = `
                <div class="absolute top-3 left-3 max-sm:top-2 max-sm:left-2 bg-red-500 text-white px-2.5 py-1 max-sm:px-2 max-sm:py-0.5 rounded-lg text-[0.75rem] max-sm:text-[0.68rem] font-extrabold tracking-tight z-10 shadow-[0_4px_12px_rgba(239,68,68,0.3)] pointer-events-none select-none leading-none flex items-center">
                    -${percent}%
                </div>`;
            }
        }

        // Индикаторы (точки) и стрелки навигации
        let dotsHtml = '';
        let arrowsHtml = '';

        if (hasMultipleImages) {
            dotsHtml = `
            <div class="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full bg-white/75 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.06)] z-10 pointer-events-none" id="dots-${uniqueId}">
                ${imgs.map((_, i) => `
                    <span class="h-1.5 rounded-full transition-all duration-300 dot ${i === 0 ? 'active w-4 bg-blue-600' : 'w-1.5 bg-slate-400/50'}"></span>
                `).join('')}
            </div>`;

            arrowsHtml = `
            <button type="button" class="absolute top-1/2 -translate-y-1/2 left-2.5 w-8 h-8 bg-white/90 backdrop-blur-md border border-slate-200/60 shadow-md rounded-full flex items-center justify-center cursor-pointer text-slate-700 opacity-0 translate-x-1 transition-all duration-200 z-20 outline-none hover:bg-white hover:text-blue-600 hover:scale-105 active:scale-95 max-lg:hidden card-nav-arrow prev group-hover/card:opacity-100 group-hover/card:translate-x-0" aria-label="წინა" onclick="scrollCardGallery('${uniqueId}', -1, event)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 -ml-0.5"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button type="button" class="absolute top-1/2 -translate-y-1/2 right-2.5 w-8 h-8 bg-white/90 backdrop-blur-md border border-slate-200/60 shadow-md rounded-full flex items-center justify-center cursor-pointer text-slate-700 opacity-0 -translate-x-1 transition-all duration-200 z-20 outline-none hover:bg-white hover:text-blue-600 hover:scale-105 active:scale-95 max-lg:hidden card-nav-arrow next group-hover/card:opacity-100 group-hover/card:translate-x-0" aria-label="შემდეგი" onclick="scrollCardGallery('${uniqueId}', 1, event)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 ml-0.5"><path d="m9 18 6-6-6-6"/></svg>
            </button>`;
        }

        const formattedPrice = formatPriceDisplay(p.price);
        const formattedOldPrice = oldVal > newVal ? formatPriceDisplay(p.oldPrice) : '';

        return `
        <article class="flex-[0_0_calc(25%-12px)] max-lg:flex-[0_0_calc(33.333%-8px)] max-sm:flex-[0_0_calc(50%-6px)] snap-start min-w-0 flex flex-col relative group/card product-card bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.04)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.09)] hover:border-slate-200/80 transition-all duration-300 overflow-hidden" data-product-id="${safeId}">
            
            <!-- Галерея товара -->
            <div class="relative w-full aspect-square overflow-hidden bg-white select-none">
                ${discountBadge}
                
                <button type="button" class="absolute top-3 right-3 max-sm:top-2 max-sm:right-2 w-8 h-8 max-sm:w-7 max-sm:h-7 bg-white/85 backdrop-blur-md border border-slate-200/50 shadow-sm rounded-full flex items-center justify-center cursor-pointer text-slate-400 transition-all duration-200 outline-none z-10 hover:text-red-500 hover:bg-white hover:scale-105 active:scale-90 btn-fav-card [&.active]:text-red-500 [&.active]:border-red-100 [&.active]:bg-red-50/90 [&.active>svg]:fill-current" aria-label="დამატება რჩეულებში" title="დამატება რჩეულებში" onclick="toggleFav(event, this)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="max-sm:w-3.5 max-sm:h-3.5 transition-transform duration-200"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>

                ${arrowsHtml}

                <div class="flex w-full h-full overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden product-images-track" id="track-${uniqueId}">
                    ${imgs.map((img, idx) => `
                        <div class="flex-[0_0_100%] w-full h-full snap-start flex items-center justify-center overflow-hidden">
                            <a href="${productUrl}" class="w-full h-full block focus:outline-none" draggable="false" tabindex="-1">
                                <img class="w-full h-full object-cover transition-transform duration-500 ease-out lg:group-hover/card:scale-[1.03]" 
                                     src="${escapeHtml(img)}" 
                                     alt="${safeName}" 
                                     width="600" 
                                     height="600" 
                                     loading="${idx === 0 ? 'lazy' : 'lazy'}" 
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
            <div class="pt-3.5 pb-4 px-4 max-sm:pt-2.5 max-sm:pb-3 max-sm:px-3 flex flex-col flex-1 justify-between bg-white product-info">
                <div>
                    <!-- Название товара (семантическая ссылка) -->
                    <h3 class="m-0 p-0 mb-2 max-sm:mb-1.5 min-h-[2.5rem] max-sm:min-h-[2.15rem] flex items-start">
                        <a href="${productUrl}" class="text-[0.95rem] max-sm:text-[0.82rem] font-bold text-slate-800 leading-[1.32] tracking-tight line-clamp-2 overflow-hidden text-ellipsis no-underline transition-colors duration-200 hover:text-blue-600 focus:outline-none focus:text-blue-600" title="${safeName}">
                            ${safeName}
                        </a>
                    </h3>

                    <!-- Блок цены -->
                    <div class="flex flex-row items-baseline gap-2 flex-wrap mb-3.5 max-sm:mb-2.5">
                        <div class="text-[1.4rem] max-sm:text-[1.15rem] font-extrabold text-blue-600 tracking-tight leading-none">
                            ${formattedPrice}<span class="text-[0.85em] font-bold ml-0.5">₾</span>
                        </div>
                        ${formattedOldPrice ? `
                            <span class="text-[0.85rem] max-sm:text-[0.75rem] font-medium leading-none line-through decoration-slate-400/80 text-slate-400 select-none">
                                ${formattedOldPrice}₾
                            </span>
                        ` : ''}
                    </div>
                </div>

                <!-- Кнопка покупки -->
                <button type="button" class="bg-blue-600 text-white border-none py-2.5 px-4 max-sm:py-2 max-sm:px-3 rounded-xl max-sm:rounded-lg cursor-pointer font-bold text-[0.92rem] max-sm:text-[0.8rem] transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(37,99,235,0.2)] hover:bg-blue-700 hover:shadow-[0_6px_16px_rgba(37,99,235,0.3)] active:scale-[0.97] outline-none w-full mt-auto select-none" aria-label="ყიდვა" onclick="window.triggerCardOrder('${uniqueId}', event)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="max-sm:w-3.5 max-sm:h-3.5 shrink-0"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    <span>ყიდვა</span>
                </button>
            </div>
        </article>`;
    };

    /**
     * Обновление активного индикатора (точки) при скролле галереи
     */
    window.updateDots = function (uniqueId, trackEl) {
        if (!trackEl || trackEl._isUpdating) return;
        trackEl._isUpdating = true;

        window.requestAnimationFrame(() => {
            const width = trackEl.clientWidth;
            if (width > 0) {
                const index = Math.round(trackEl.scrollLeft / width);
                const dotsContainer = document.getElementById(`dots-${uniqueId}`);
                if (dotsContainer) {
                    const dots = dotsContainer.children;
                    for (let i = 0; i < dots.length; i++) {
                        const isActive = i === index;
                        dots[i].classList.toggle('active', isActive);
                        dots[i].classList.toggle('w-4', isActive);
                        dots[i].classList.toggle('bg-blue-600', isActive);
                        dots[i].classList.toggle('w-1.5', !isActive);
                        dots[i].classList.toggle('bg-slate-400/50', !isActive);
                    }
                }
            }
            trackEl._isUpdating = false;
        });
    };

    /**
     * Переключение слайдов внутри карточки стрелками
     */
    window.scrollCardGallery = function (id, dir, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const track = document.getElementById(`track-${id}`);
        if (!track) return;

        const width = track.clientWidth;
        const maxScroll = track.scrollWidth - width;

        if (dir === 1 && track.scrollLeft >= maxScroll - 5) {
            track.scrollTo({ left: 0, behavior: 'smooth' });
        } else if (dir === -1 && track.scrollLeft <= 5) {
            track.scrollTo({ left: maxScroll, behavior: 'smooth' });
        } else {
            track.scrollBy({ left: dir * width, behavior: 'smooth' });
        }
    };

    /**
     * Прокрутка внешней карусели карточек (с точным вычислением gap)
     */
    window.scrollCarousel = function (containerId, direction) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const card = container.querySelector('.product-card');
        const gap = parseFloat(window.getComputedStyle(container).columnGap || window.getComputedStyle(container).gap) || 16;
        const scrollAmount = card ? card.offsetWidth + gap : 300;
        const maxScroll = container.scrollWidth - container.clientWidth;

        if (direction === 1 && container.scrollLeft >= maxScroll - 10) {
            container.scrollTo({ left: 0, behavior: 'smooth' });
        } else if (direction === -1 && container.scrollLeft <= 10) {
            container.scrollTo({ left: maxScroll, behavior: 'smooth' });
        } else {
            container.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
        }
    };

    // Делегированный слушатель скролла для всех треков изображений (passive для 60 FPS)
    document.addEventListener(
        'scroll',
        (e) => {
            const target = e.target;
            if (target && target.classList && target.classList.contains('product-images-track')) {
                const uniqueId = target.id.slice(6); // Быстрее чем .replace('track-', '')
                window.updateDots(uniqueId, target);
            }
        },
        { capture: true, passive: true }
    );
})();
