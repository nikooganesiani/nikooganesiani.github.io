(() => {
    'use strict';

    const FALLBACK_IMAGE = '/img/no-image.svg';
    const cardImages = globalThis.EnkaCardImages;
    const cardPreviews = new WeakMap();
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

    /**
     * Генерация HTML карточки товара
     */
    window.createProductCardHTML = function (p, prefix = 'sim', purchaseLabel = 'ყიდვა') {
        if (!p || typeof p !== 'object') return '';

        if (!p.id) return '';
        const rawId = String(p.id);
        const safeId = escapeHtml(rawId);
        const uniqueId = `${String(prefix).replace(/[^a-z0-9_-]/gi, '')}-${Array.from(rawId).map(char => char.codePointAt(0).toString(16)).join('-')}`;
        const productPath = `/product/${encodeURIComponent(rawId)}/`;
        const productUrl = window.enkaRoute?.(productPath) || productPath;
        const safeName = escapeHtml(p.name || '');

        // Фильтрация валидных изображений
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
        const available = window.isProductAvailable(p);
        const buttonLabel = available ? escapeHtml(purchaseLabel) : 'არ არის მარაგში';
        let discountBadge = '';

        if (oldVal > newVal && newVal > 0) {
            const percent = Math.round(((oldVal - newVal) / oldVal) * 100);
            if (percent > 0) {
                discountBadge = `
                <span class="pointer-events-none absolute start-2 top-2 z-10 rounded-detail bg-[#bd263b] px-1.5 py-0.5 text-xs font-semibold leading-5 text-white tabular-nums">
                    -${percent}%
                </span>`;
            }
        }

        // Полоски показывают снимок, выбранный положением курсора над фото.
        const dotsHtml = hasMultipleImages ? `
            <div class="card-image-indicators" id="dots-${uniqueId}" aria-hidden="true">
                ${imgs.map((_, i) => `<span class="card-image-indicator${i === 0 ? ' active' : ''}"></span>`).join('')}
            </div>` : '';

        const formattedPrice = formatPriceDisplay(p.price);
        const formattedOldPrice = oldVal > newVal && newVal > 0 ? formatPriceDisplay(p.oldPrice) : '';

        return `
        <div class="product-card relative flex flex-col min-w-0 border-0 rounded-none bg-transparent text-[color:light-dark(#2c3644,var(--color-night-ink))] overflow-visible [.product-carousel_>_&]:[flex:0_0_calc((100%_-_72px)_/_4)] min-[1280px]:[.product-carousel_>_&]:basis-[calc((100%_-_96px)_/_5)] [.product-carousel_>_&]:snap-start min-[1440px]:[.product-carousel_>_&]:basis-[calc((100%_-_120px)_/_6)] max-[1024px]:[.product-carousel_>_&]:basis-[calc((100%_-_48px)_/_3)] max-[768px]:[.product-carousel_>_&]:basis-[calc((100%_-_32px)_/_2.5)]" data-product-id="${safeId}">

            <!-- Блок изображения -->
            <div class="product-card-media relative w-full aspect-square rounded-media overflow-hidden">
                ${discountBadge}

                <button type="button" class="btn-fav-card card-hover-action absolute end-1.5 top-1.5 z-10 size-11 items-center justify-center rounded-full bg-white text-slate-600 cursor-pointer hover:text-[#bd263b] [&.active]:text-[#bd263b] [&.active_svg]:fill-current" aria-pressed="false" aria-label="დამატება რჩეულებში: ${safeName}" title="დამატება რჩეულებში" onclick="toggleFav(event, this)">
                    ${window.EnkaIcons?.render('heart', 18, 'auto', '') || ''}
                </button>
                <button type="button" class="cursor-pointer card-hover-action card-compare-action absolute end-1.5 top-13.5 z-10 size-11 items-center justify-center rounded-full bg-white text-slate-600" data-compare-toggle="${safeId}" aria-pressed="${window.enkaCompare?.has(rawId) === true}" aria-label="შედარება" title="შედარება">
                    ${window.EnkaIcons?.render('compare', 18, 'auto', '') || ''}
                </button>

                <a href="${productUrl}" class="absolute inset-0 z-[1]" draggable="false" tabindex="-1" aria-hidden="true"></a>
                <div class="product-images-track flex w-full h-full gap-2 overflow-x-hidden snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" id="track-${uniqueId}">
                    ${imgs.map((img, index) => {
                        const source = window.safeProductImage(img);
                        const srcset = cardImages?.srcset(source, p.cardImages?.[img]);
                        return `
                        <div class="flex items-center justify-center [flex:0_0_100%] w-full h-full bg-transparent overflow-hidden snap-start">
                            <img class="block w-full h-full object-contain object-center mix-blend-multiply dark:mix-blend-normal"
                                 ${index === 0 ? 'src' : 'data-card-src'}="${escapeHtml(source)}"
                                 ${srcset ? `sizes="${cardImages.sizes}" ${index === 0 ? 'srcset' : 'data-card-srcset'}="${escapeHtml(srcset)}"` : ''}
                                 alt=""
                                 width="600"
                                 height="600"
                                 loading="lazy"
                                 decoding="async"
                                 onerror="if(this.hasAttribute('srcset'))this.removeAttribute('srcset');else{this.onerror=null;this.src='${FALLBACK_IMAGE}'}"
                                 draggable="false">
                        </div>
                    `; }).join('')}
                </div>

                ${dotsHtml}
            </div>

            <!-- Информация о товаре -->
            <div class="flex min-w-0 flex-1 flex-col gap-2 pt-3">

                <!-- Название до двух строк -->
                <a href="${productUrl}" class="product-name line-clamp-2 h-[2lh] wrap-anywhere text-[length:13px] leading-snug font-[550] text-ink no-underline underline-offset-4 hover:text-accent hover:underline focus-visible:text-accent focus-visible:underline" title="${safeName}" draggable="false">
                    ${safeName}
                </a>

                <!-- Блок цены -->
                <div class="flex min-h-6 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    ${newVal > 0 ? `
                        <span class="product-card-price ${formattedOldPrice ? 'text-accent' : 'text-ink'} whitespace-nowrap text-[length:18px] font-bold leading-6 tracking-[-.02em] tabular-nums max-[768px]:text-base"><span>${formattedPrice}</span><span class="card-price-currency">₾</span></span>
                    ` : '<span class="text-[length:13px] font-medium leading-6 text-muted">ფასი ზუსტდება</span>'}
                    ${formattedOldPrice ? `
                        <del class="whitespace-nowrap text-xs leading-snug text-muted tabular-nums">${formattedOldPrice} ₾</del>
                    ` : ''}
                </div>

                <${available ? 'a href="' + productUrl + '#inlineOrderForm"' : 'button type="button" disabled'} class="product-card-action mt-auto motion-safe:transition-colors ${available ? 'bg-brand text-white hover:bg-brand-dark' : 'border-line bg-surface text-muted'}" aria-label="${buttonLabel}: ${safeName}">
                    ${buttonLabel}
                </${available ? 'a' : 'button'}>
            </div>
        </div>`;
    };

    function loadCardSlide(slide) {
        const image = slide?.querySelector('img');
        if (image?.dataset.cardSrc) {
            if (image.dataset.cardSrcset) {
                image.srcset = image.dataset.cardSrcset;
                image.removeAttribute('data-card-srcset');
            }
            image.src = image.dataset.cardSrc;
            image.removeAttribute('data-card-src');
        }
        return image;
    }

    function scrollToCardSlide(track, index) {
        const slides = track.children;
        track.scrollTo({
            left: slides[index].offsetLeft - slides[0].offsetLeft,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
        });
    }

    function selectCardIndicator(container, index) {
        if (!container) return;
        Array.from(container.children).forEach((indicator, i) => indicator.classList.toggle('active', i === index));
    }

    function previewCardSlide(media, track, index, width) {
        const preview = { index, width };
        cardPreviews.set(track, preview);
        selectCardIndicator(media.querySelector('.card-image-indicators'), index);

        const current = Math.round(track.scrollLeft / (track.clientWidth + SLIDE_GAP));
        const first = Math.min(current, index);
        const last = Math.max(current, index);
        const pending = [];
        if (width) {
            // Decode the photos that will pass through the viewport and warm the adjacent ones.
            for (let i = first - 1; i <= last + 1; i++) {
                const image = loadCardSlide(track.children[i]);
                if (!image || image.complete) continue;
                if (image.srcset) image.sizes = `${Math.ceil(width)}px`;
                image.loading = 'eager';
                if (i >= first && i <= last && image.decode) pending.push(image.decode().catch(() => {}));
            }
        }
        const scroll = () => {
            if (track.isConnected && cardPreviews.get(track) === preview) scrollToCardSlide(track, index);
        };
        if (pending.length) Promise.all(pending).then(scroll);
        else scroll();
    }

    document.addEventListener('pointerout', event => {
        if (event.pointerType === 'touch') return;
        const media = event.target.closest?.('.product-card-media');
        if (!media || (event.relatedTarget && media.contains(event.relatedTarget))) return;
        const track = media.querySelector('.product-images-track');
        if (!cardPreviews.get(track)?.width) return;
        previewCardSlide(media, track, 0, 0);
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
        const preview = cardPreviews.get(track);
        if (preview?.index === index && preview.width === bounds.width) return;
        previewCardSlide(media, track, index, bounds.width);
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
                const index = cardPreviews.get(trackEl)?.index ?? Math.round(trackEl.scrollLeft / step);
                selectCardIndicator(document.getElementById(`dots-${uniqueId}`), index);
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
        if (slides[nextIndex]) {
            cardPreviews.delete(track);
            loadCardSlide(slides[nextIndex]);
            scrollToCardSlide(track, nextIndex);
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
        const scrollAmount = card ? card.getBoundingClientRect().width + gap : 300;
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
            const showArrows = track.querySelectorAll('.product-card').length > 5 && max > 2;
            if (left) left.hidden = !showArrows;
            if (right) right.hidden = !showArrows;
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
            if (typeof MutationObserver !== 'undefined') new MutationObserver(update).observe(track, { childList: true });
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
