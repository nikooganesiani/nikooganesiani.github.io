/**
 * Wishlist / Favorites Module
 * Полная поддержка карточек товаров, страниц товаров, галерей и различных e-commerce разметок (WooCommerce, Tailwind и др.)
 */

// ==========================================
// 1. УТИЛИТЫ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isProductPage() {
    return /\/product\//i.test(window.location.pathname || '');
}

function absUrl(url) {
    if (!url) return '';
    const cleaned = String(url).trim().replace(/^['"]|['"]$/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('data:')) return cleaned;
    try {
        return new URL(cleaned, window.location.origin).href;
    } catch (e) {
        return cleaned;
    }
}

function normalizeLink(href) {
    if (!href) return '';
    try {
        const u = new URL(href, window.location.origin);
        return (u.pathname || '/').replace(/\/+$/, '') || '/';
    } catch (e) {
        return String(href).split('#')[0].split('?')[0].replace(/\/+$/, '');
    }
}

function extractProductSlug(link) {
    const path = normalizeLink(link);
    const m = path.match(/\/product\/([^/]+)/i);
    if (!m) return '';
    try {
        return decodeURIComponent(m[1]).toLowerCase();
    } catch (e) {
        return String(m[1]).toLowerCase();
    }
}

function productKeyFromLink(link) {
    return extractProductSlug(link) || normalizeLink(link);
}

function itemKey(item) {
    if (!item) return '';
    if (item.id) return String(item.id).toLowerCase();
    return productKeyFromLink(item.link);
}

// ==========================================
// 2. ПАРСИНГ И ОБРАБОТКА ЦЕН
// ==========================================

/**
 * Очищает строку до валидного числового формата
 */
function cleanPriceString(value) {
    if (value == null) return '';
    let str = String(value)
        .replace(/\u00a0/g, ' ')
        .replace(/[₾$€£]|GEL|gel|ლარი|лари/gi, '')
        .trim();

    // Поиск первого вхождения цифр с разделителями
    const match = str.match(/\d+(?:[\s.,]\d+)*/);
    if (!match) return '';
    
    // Удаляем лишние точки/запятые по краям
    return match[0].trim().replace(/^[.,]+|[.,]+$/g, '');
}

/**
 * Преобразует любую цену к формату "120 ₾" / "120.50 ₾"
 */
function formatPrice(value) {
    const cleaned = cleanPriceString(value);
    if (!cleaned || !/\d/.test(cleaned)) return '';
    return cleaned + ' ₾';
}

/**
 * Преобразует строковую цену в числовое значение (float) для сравнения
 */
function parseNumericPrice(value) {
    const raw = cleanPriceString(value);
    if (!raw) return 0;

    let num = raw.replace(/\s+/g, '');
    if (num.includes(',') && num.includes('.')) {
        if (num.indexOf(',') < num.indexOf('.')) {
            num = num.replace(/,/g, ''); // 1,250.50 -> 1250.50
        } else {
            num = num.replace(/\./g, '').replace(',', '.'); // 1.250,50 -> 1250.50
        }
    } else if (num.includes(',')) {
        num = num.replace(',', '.');
    }

    const val = parseFloat(num);
    return isNaN(val) ? 0 : val;
}

/**
 * Извлекает все возможные суммы из текста
 */
function extractAmountsFromText(text) {
    if (!text) return [];
    const src = String(text).replace(/\u00a0/g, ' ');
    const found = [];
    
    // 1. Поиск с символом/словом валюты
    const currencyRe = /(?:₾|GEL|gel|ლარი)\s*(\d+(?:[\s.,]\d+)*)|(\d+(?:[\s.,]\d+)*)\s*(?:₾|GEL|gel|ლარი)/gi;
    let m;
    while ((m = currencyRe.exec(src))) {
        const val = cleanPriceString(m[1] || m[2]);
        if (val) found.push(val);
    }

    // 2. Если с валютой не найдено, ищем просто числа
    if (!found.length) {
        const plainRe = /\b\d+(?:[.,]\d{2})?\b/g;
        while ((m = plainRe.exec(src))) {
            const val = cleanPriceString(m[0]);
            if (val) found.push(val);
        }
    }

    return found;
}

// ==========================================
// 3. РАБОТА С DOM И СЕЛЕКТОРАМИ
// ==========================================

function isDisplayed(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hidden || el.getAttribute('hidden') !== null || el.getAttribute('aria-hidden') === 'true') return false;
    const cls = el.className && String(el.className) || '';
    if (/\bhidden\b|\binvisible\b|\bsr-only\b|\bscreen-reader/.test(cls)) return false;
    try {
        const cs = window.getComputedStyle(el);
        if (!cs) return true;
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (parseFloat(cs.opacity) === 0) return false;
    } catch (e) {}
    return true;
}

function closestAny(el, selector) {
    try {
        return el && el.closest ? el.closest(selector) : null;
    } catch (e) {
        return null;
    }
}

function isIgnoredScope(el) {
    return !!closestAny(el, '#favModal, #ordersModal, #cartModal');
}

function isListingScope(el) {
    return !!closestAny(el, '#subcatScroll, #catScroll, #recentScroll, [id$="Scroll"], .related-products, .similar-products, .recently-viewed, [class*="related"], [class*="similar"], [class*="recent-"]');
}

function isGalleryScope(el) {
    return !!closestAny(el, '.product-gallery, .main-gallery, .product-main-gallery, .woocommerce-product-gallery, [class*="product-gallery"], [class*="main-gallery"]');
}

function isHuge(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    return r.width > window.innerWidth * 0.92 || r.height > window.innerHeight * 0.75;
}

function findListingCard(btn) {
    if (!btn) return null;
    const scrollItem = closestAny(btn, '#subcatScroll > *, #catScroll > *, #recentScroll > *, [id$="Scroll"] > *');
    if (scrollItem && !isGalleryScope(scrollItem) && !isHuge(scrollItem)) return scrollItem;

    const card = closestAny(btn, '.product-card, .product-item, .card-product, [data-product-id], [data-product]');
    if (card && !isHuge(card) && card !== document.body) return card;

    if (isGalleryScope(btn)) return null;

    const snap = closestAny(btn, '.snap-start, .swiper-slide, .slick-slide');
    if (snap && !isGalleryScope(snap) && !isHuge(snap) && isListingScope(snap)) return snap;

    return null;
}

function isListingButton(btn) {
    return !!findListingCard(btn);
}

function queryAllSafe(root, selector) {
    try {
        return Array.prototype.slice.call((root || document).querySelectorAll(selector));
    } catch (e) {
        return [];
    }
}

function queryFirstSafe(root, selector) {
    try {
        return (root || document).querySelector(selector);
    } catch (e) {
        return null;
    }
}

function firstUseful(root, selectors, extraCheck) {
    for (let i = 0; i < selectors.length; i++) {
        const nodes = queryAllSafe(root, selectors[i]);
        for (let j = 0; j < nodes.length; j++) {
            const el = nodes[j];
            if (isIgnoredScope(el)) continue;
            if (root === document && isListingScope(el)) continue;
            if (!isDisplayed(el)) continue;
            if (extraCheck && !extraCheck(el)) continue;
            return el;
        }
    }
    return null;
}

function attrData(el) {
    const out = { id: '', name: '', price: '', oldPrice: '', img: '', link: '' };
    if (!el || !el.getAttribute) return out;
    out.id = el.getAttribute('data-product-id') || el.getAttribute('data-product') || el.getAttribute('data-id') || '';
    out.name = el.getAttribute('data-name') || el.getAttribute('data-title') || '';
    out.price = el.getAttribute('data-price') || el.getAttribute('data-current-price') || '';
    out.oldPrice = el.getAttribute('data-old-price') || el.getAttribute('data-regular-price') || el.getAttribute('data-compare-at-price') || '';
    out.img = el.getAttribute('data-img') || el.getAttribute('data-image') || el.getAttribute('data-thumbnail') || '';
    out.link = el.getAttribute('data-url') || el.getAttribute('data-href') || el.getAttribute('href') || '';
    return out;
}

function mergeData(a, b) {
    return {
        id: a.id || b.id || '',
        name: a.name || b.name || '',
        price: a.price || b.price || '',
        oldPrice: a.oldPrice || b.oldPrice || '',
        img: a.img || b.img || '',
        link: a.link || b.link || ''
    };
}

// ==========================================
// 4. ИЗВЛЕЧЕНИЕ ДАННЫХ О ТОВАРЕ
// ==========================================

function isExplicitOldPriceEl(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return true;
    const cls = el.className && String(el.className) || '';
    if (/(?:^|[\s-])(?:old-price|price-old|modern-price-old|regular-price|compare-at-price|was-price)(?:$|[\s-])/i.test(cls)) return true;
    if (/\bline-through\b/.test(cls)) return true;
    if (closestAny(el, 'del, s, strike, .old-price, .price-old, .modern-price-old, .line-through')) return true;
    return false;
}

function parsePriceFromEl(el) {
    if (!el || !isDisplayed(el)) return '';
    const dataPrice = el.getAttribute('data-price') || el.getAttribute('data-current-price') || el.getAttribute('data-old-price') || '';
    if (dataPrice && /\d/.test(dataPrice)) return formatPrice(dataPrice);
    
    const amounts = extractAmountsFromText(el.innerText || el.textContent || '');
    if (!amounts.length) return '';
    return formatPrice(amounts[0]);
}

/**
 * Надежное извлечение обычной и акционной цены
 */
function getPricesFrom(root, allowPageFallback) {
    let scope = root;
    if (!scope || scope === document) {
        scope = firstUseful(document, [
            '.modern-price',
            '.product-price-box',
            '.product-prices',
            '.price-box',
            '.product-info .price',
            '.product-summary .price',
            '.product-details [class*="price"]',
            '[class*="product-price"]'
        ]) || document;
    }

    // 1. Поиск явной старой цены (скидочной)
    const oldPriceEl = firstUseful(scope, [
        'del',
        's',
        'strike',
        '.modern-price-old',
        '.price-old',
        '.old-price',
        '.regular-price',
        '.was-price',
        '.compare-at-price',
        '[class*="old-price"]',
        '[class*="price-old"]',
        '.line-through'
    ], isExplicitOldPriceEl);

    // 2. Поиск явной текущей цены
    const currentPriceEl = firstUseful(scope, [
        'ins',
        '.modern-price-current',
        '.price-current',
        '.current-price',
        '.product-price-current',
        '.special-price',
        '.sale-price',
        '[class*="current-price"]',
        '[class*="price-current"]',
        '[data-price]:not(del):not(s)',
        '.product-price:not(del):not(s)',
        '.price:not(del):not(s)'
    ], function (el) { return !isExplicitOldPriceEl(el); });

    let oldPriceStr = parsePriceFromEl(oldPriceEl);
    let priceStr = '';

    if (currentPriceEl) {
        // Если текущий элемент содержит внутри старую цену (например <p class="price"><del>...</del> 120 ₾</p>)
        // клонируем его и удаляем del/s, чтобы исключить старую цену
        const hasNestedOld = queryFirstSafe(currentPriceEl, 'del, s, strike, .line-through, [class*="old"]');
        if (hasNestedOld) {
            const clone = currentPriceEl.cloneNode(true);
            queryAllSafe(clone, 'del, s, strike, .line-through, [class*="old"]').forEach(function (n) {
                if (n && n.parentNode) n.parentNode.removeChild(n);
            });
            const amounts = extractAmountsFromText(clone.textContent || '');
            if (amounts.length) priceStr = formatPrice(amounts[0]);
        } else {
            priceStr = parsePriceFromEl(currentPriceEl);
        }
    }

    // 3. Fallback: если цены не найдены селекторами, сканируем все числа внутри контейнера
    if (!priceStr && scope && scope !== document) {
        const text = scope.innerText || scope.textContent || '';
        const allAmounts = extractAmountsFromText(text);
        if (allAmounts.length === 1) {
            priceStr = formatPrice(allAmounts[0]);
        } else if (allAmounts.length >= 2) {
            if (oldPriceEl) {
                priceStr = formatPrice(allAmounts[allAmounts.length - 1]);
            } else {
                const p1 = parseNumericPrice(allAmounts[0]);
                const p2 = parseNumericPrice(allAmounts[1]);
                if (p1 > p2) {
                    oldPriceStr = formatPrice(p1);
                    priceStr = formatPrice(p2);
                } else {
                    priceStr = formatPrice(p1);
                }
            }
        }
    }

    // 4. Fallback страницы товара
    if (!priceStr && allowPageFallback && (!root || root === document || isHuge(root))) {
        const pageCurrent = firstUseful(document, ['.modern-price-current', '.price-current', '[data-price]', '.product-price', '.price']);
        priceStr = parsePriceFromEl(pageCurrent);
        if (!oldPriceStr) {
            const pageOld = firstUseful(document, ['.modern-price-old', '.price-old', '.old-price', 'del', 's'], isExplicitOldPriceEl);
            oldPriceStr = parsePriceFromEl(pageOld);
        }
    }

    // 5. Числовая валидация цен
    const curVal = parseNumericPrice(priceStr);
    const oldVal = parseNumericPrice(oldPriceStr);

    if (oldVal <= curVal || curVal === 0) {
        oldPriceStr = null;
    }

    return {
        price: curVal > 0 ? (formatPrice(curVal) || priceStr) : '0 ₾',
        oldPrice: oldPriceStr ? (formatPrice(oldVal) || oldPriceStr) : null
    };
}

function getLinkFrom(card, btn, allowPageFallback) {
    const fromBtn = attrData(btn);
    if (fromBtn.link && extractProductSlug(fromBtn.link)) return normalizeLink(fromBtn.link);

    const fromCard = attrData(card);
    if (fromCard.link && extractProductSlug(fromCard.link)) return normalizeLink(fromCard.link);

    if (card) {
        const preferred = firstUseful(card, ['a[href*="/product/"]', 'a.product-link', 'a[href*="/shop/"]', 'a']);
        if (preferred) {
            const href = preferred.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('javascript:')) return normalizeLink(href);
        }
    }

    if (allowPageFallback && isProductPage()) return normalizeLink(window.location.pathname);
    return '';
}

function isUselessImage(url) {
    if (!url) return true;
    const u = String(url).toLowerCase();
    if (u.startsWith('data:image/svg')) return true;
    if (u.includes('data:image/gif;base64,r0lgodlh')) return true;
    return /logo|favicon|sprite|placeholder|blank\.|pixel|1x1|spacer|dummy|spinner|icon-heart|heart\.svg/i.test(u);
}

function urlFromSrcset(srcset) {
    if (!srcset) return '';
    const parts = String(srcset).split(',').map(function (chunk) {
        const bits = chunk.trim().split(/\s+/);
        const url = bits[0] || '';
        const w = bits[1] || '';
        let score = 0;
        if (/w$/i.test(w)) score = parseInt(w, 10) || 0;
        else if (/x$/i.test(w)) score = (parseFloat(w) || 0) * 1000;
        return { url: url, score: score };
    }).filter(function (p) { return p.url; });
    if (!parts.length) return '';
    parts.sort(function (a, b) { return a.score - b.score; });
    return parts[parts.length - 1].url;
}

function imageFromEl(el) {
    if (!el) return '';
    if (el.tagName === 'IMG') {
        const candidates = [
            el.currentSrc,
            el.dataset.src,
            el.dataset.lazySrc,
            el.dataset.lazy,
            el.dataset.original,
            el.dataset.large,
            el.dataset.zoom,
            el.dataset.full,
            el.dataset.image,
            el.dataset.srcset && urlFromSrcset(el.dataset.srcset),
            el.getAttribute('srcset') && urlFromSrcset(el.getAttribute('srcset')),
            el.getAttribute('src'),
            el.src
        ];
        for (let i = 0; i < candidates.length; i++) {
            const url = absUrl(candidates[i]);
            if (url && !isUselessImage(url) && url !== window.location.href) return url;
        }
        return '';
    }
    if (el.tagName === 'SOURCE') {
        const url = absUrl(
            (el.dataset.srcset && urlFromSrcset(el.dataset.srcset)) ||
            urlFromSrcset(el.getAttribute('srcset')) ||
            el.getAttribute('src')
        );
        if (url && !isUselessImage(url)) return url;
    }
    const bg = (el.style && el.style.backgroundImage) || '';
    const bgMatch = bg.match(/url\((['"]?)(.*?)\1\)/i);
    if (bgMatch && bgMatch[2]) {
        const url = absUrl(bgMatch[2]);
        if (url && !isUselessImage(url)) return url;
    }
    return '';
}

function getImageFrom(root, allowOg) {
    if (!root) return '';

    const selectors = [
        '.swiper-slide-active img',
        '.slick-current img',
        '.slick-active img',
        '.is-selected img',
        '.is-active img',
        '.main-gallery-slide img',
        '.product-main-img',
        '.product-image',
        'img.product-image',
        '.product-gallery img',
        'picture img',
        'img'
    ];

    for (let i = 0; i < selectors.length; i++) {
        const nodes = queryAllSafe(root, selectors[i]);
        for (let j = 0; j < nodes.length; j++) {
            const el = nodes[j];
            if (isIgnoredScope(el)) continue;
            if (root === document && isListingScope(el)) continue;
            const url = imageFromEl(el);
            if (url) return url;
        }
    }

    const bgNodes = queryAllSafe(root, '[style*="background-image"]');
    for (let k = 0; k < bgNodes.length; k++) {
        if (root === document && isListingScope(bgNodes[k])) continue;
        const url = imageFromEl(bgNodes[k]);
        if (url) return url;
    }

    if (allowOg) {
        const og = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
        if (og && og.getAttribute('content')) {
            const url = absUrl(og.getAttribute('content'));
            if (url && !isUselessImage(url)) return url;
        }
    }

    return '';
}

function cleanTitle(text) {
    if (!text) return '';
    const t = String(text).replace(/\s+/g, ' ').trim();
    if (!t || t.includes('₾') || /^\d+$/.test(t) || t.length < 2) return '';
    return t;
}

function getTitleFrom(root, allowPageFallback) {
    if (root && root !== document) {
        const direct = firstUseful(root, [
            '.product-name',
            '.product-title',
            '.card-title',
            'h1',
            'h2',
            'h3',
            'h4',
            '.title',
            '[data-name]',
            '[data-title]'
        ]);
        if (direct) {
            const fromData = cleanTitle(direct.getAttribute('data-name') || direct.getAttribute('data-title'));
            if (fromData) return fromData;
            const fromText = cleanTitle(direct.innerText || direct.textContent);
            if (fromText) return fromText;
        }

        const links = queryAllSafe(root, 'a:not(.btn-fav):not(.btn-fav-card)');
        for (let i = 0; i < links.length; i++) {
            const t = cleanTitle(links[i].innerText || links[i].textContent);
            if (t && t.length > 2) return t;
        }

        const img = queryFirstSafe(root, 'img[alt]');
        const alt = img && cleanTitle(img.getAttribute('alt'));
        if (alt) return alt;
    }

    if (allowPageFallback) {
        const mainH1 = firstUseful(document, [
            'h1.product-title-h1',
            'h1.product-title',
            'h1',
            '.title-desktop',
            '.title-mobile',
            '.product-name'
        ]);
        if (mainH1) {
            const t = cleanTitle(mainH1.innerText || mainH1.textContent);
            if (t) return t;
        }
        const og = document.querySelector('meta[property="og:title"], meta[name="og:title"]');
        if (og) {
            const t = cleanTitle(og.getAttribute('content'));
            if (t) return t;
        }
    }

    return 'პროდუქტი';
}

function getButtonKey(btn) {
    const listing = findListingCard(btn);
    if (listing) {
        const data = mergeData(attrData(btn), attrData(listing));
        if (data.id) return String(data.id).toLowerCase();
        const link = getLinkFrom(listing, btn, false);
        return productKeyFromLink(link);
    }

    const own = attrData(btn);
    if (own.id) return String(own.id).toLowerCase();
    if (own.link && extractProductSlug(own.link)) return extractProductSlug(own.link);

    if (isProductPage() && !listing) {
        return extractProductSlug(window.location.pathname);
    }

    const generic = closestAny(btn, '.product-card, .product-item, .card-product, [data-product-id]');
    if (generic && !isHuge(generic)) {
        const data = mergeData(own, attrData(generic));
        if (data.id) return String(data.id).toLowerCase();
        const link = getLinkFrom(generic, btn, false);
        return productKeyFromLink(link);
    }

    return '';
}

function collectProductData(btn) {
    const listing = findListingCard(btn);
    const pageFallback = !listing && isProductPage();
    const root = listing || (pageFallback ? document : closestAny(btn, '.product-card, .product-item, .card-product') || null);

    const data = mergeData(attrData(btn), attrData(listing || root));
    const allowPage = pageFallback;

    let link = '';
    if (data.link && extractProductSlug(data.link)) link = normalizeLink(data.link);
    else link = getLinkFrom(root, btn, allowPage);

    const name = cleanTitle(data.name) || getTitleFrom(root && root !== document ? root : null, allowPage);
    
    let img = data.img ? absUrl(data.img) : '';
    if (!img) {
        if (listing) img = getImageFrom(listing, false);
        else if (allowPage) {
            const gallery = queryFirstSafe(document, '.product-gallery, .main-gallery, .product-main-gallery, .woocommerce-product-gallery, [class*="product-gallery"]');
            img = getImageFrom(gallery || document, true);
        } else if (root) {
            img = getImageFrom(root, false);
        }
    }

    let prices;
    if (data.price && /\d/.test(String(data.price))) {
        const cur = formatPrice(data.price);
        const old = data.oldPrice ? formatPrice(data.oldPrice) : null;
        const curNum = parseNumericPrice(cur);
        const oldNum = parseNumericPrice(old);
        prices = {
            price: cur || '0 ₾',
            oldPrice: (oldNum > curNum && oldNum > 0) ? old : null
        };
    } else {
        prices = getPricesFrom(listing || (allowPage ? document : root), allowPage);
    }

    let id = data.id ? String(data.id).toLowerCase() : '';
    if (!id) id = productKeyFromLink(link);
    if (!id && allowPage) id = extractProductSlug(window.location.pathname);

    if (!link && allowPage) link = normalizeLink(window.location.pathname);

    return {
        id: id,
        name: name || 'პროდუქტი',
        price: prices.price || '0 ₾',
        oldPrice: prices.oldPrice || null,
        img: img || '',
        link: link || ''
    };
}

// ==========================================
// 5. УПРАВЛЕНИЕ STORAGE И СОСТОЯНИЕМ
// ==========================================

function readFavs() {
    let parsed = [];
    try {
        const raw = localStorage.getItem('myFavs');
        parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) parsed = [];
    } catch (e) {
        parsed = [];
    }

    const seen = new Set();
    const out = [];
    for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (!item) continue;
        const key = itemKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        
        const price = formatPrice(item.price) || '0 ₾';
        const oldPrice = formatPrice(item.oldPrice);
        const curVal = parseNumericPrice(price);
        const oldVal = parseNumericPrice(oldPrice);

        out.push({
            id: key,
            name: item.name || 'პროდუქტი',
            price: price,
            oldPrice: (oldVal > curVal && oldVal > 0) ? oldPrice : null,
            img: item.img || '',
            link: item.link || ''
        });
    }
    return out;
}

function writeFavs(favs) {
    try {
        localStorage.setItem('myFavs', JSON.stringify(favs));
    } catch (e) {
        console.error('LocalStorage write error:', e);
    }
}

function persistCleanFavs() {
    const favs = readFavs();
    writeFavs(favs);
    return favs;
}

// ==========================================
// 6. РЕНДЕРИНГ И СОБЫТИЯ
// ==========================================

function renderFavs() {
    try {
        const list = document.getElementById('favList');
        const favs = readFavs();
        const countEl = document.getElementById('favModalCount');

        if (countEl) countEl.innerText = favs.length > 0 ? '(' + favs.length + ')' : '';
        if (!list) return;

        if (!favs.length) {
            list.innerHTML =
                '<div class="text-center text-slate-400 py-12 font-semibold">' +
                    '<svg class="w-16 h-16 mx-auto mb-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                        '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>' +
                    '</svg>' +
                    'რჩეულები ცარიელია' +
                '</div>';
            return;
        }

        list.innerHTML = favs.map(function (item, idx) {
            const priceFixed = formatPrice(item.price) || '0 ₾';
            const oldFormatted = formatPrice(item.oldPrice);
            const oldPHtml = oldFormatted && oldFormatted !== priceFixed
                ? '<span class="text-[0.8rem] text-slate-400 line-through decoration-red-500 font-bold ml-1.5">' + esc(oldFormatted) + '</span>'
                : '';
            const imgSrc = item.img ? absUrl(item.img) : '';
            const href = item.link || '#';
            const name = item.name || 'პროდუქტი';

            return (
                '<div class="flex items-center gap-3 bg-transparent border-b border-slate-200 py-3 px-2 relative transition-all duration-200 last:border-none">' +
                    '<a href="' + esc(href) + '" class="w-14 h-14 rounded-2xl bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-100">' +
                        (imgSrc ? '<img src="' + esc(imgSrc) + '" alt="' + esc(name) + '" class="w-full h-full object-cover">' : '') +
                    '</a>' +
                    '<div class="flex-1 min-w-0 pr-1">' +
                        '<a href="' + esc(href) + '" class="block whitespace-normal leading-snug text-[0.88rem] font-bold text-slate-900 line-clamp-2 hover:text-blue-600 transition-colors">' +
                            esc(name) +
                        '</a>' +
                        '<div class="text-[0.95rem] text-blue-600 font-bold flex items-center mt-1">' +
                            esc(priceFixed) + (oldPHtml ? ' ' + oldPHtml : '') +
                        '</div>' +
                    '</div>' +
                    '<button type="button" onclick="window.removeFavByIdx(' + idx + ', event)" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="წაშლა">' +
                        '<svg class="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<path d="M18 6L6 18M6 6l12 12"></path>' +
                        '</svg>' +
                    '</button>' +
                '</div>'
            );
        }).join('');
    } catch (error) {
        console.error('Error rendering favorites:', error);
    }
}
window.renderFavs = renderFavs;

window.openFavs = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    renderFavs();
    if (window.openAppModal) window.openAppModal('favModal');
};
window.openFavorites = window.openFavs;

window.removeFavByIdx = function (idx, e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    const favs = readFavs();
    if (idx >= 0 && idx < favs.length) {
        favs.splice(idx, 1);
        writeFavs(favs);
        renderFavs();
        syncFavButtons();
        if (window.updateBadges) window.updateBadges();
        if (window.showToast) window.showToast('წაშლილია რჩეულებიდან');
    }
};

function syncFavButtons() {
    try {
        const favs = readFavs();
        const favKeys = new Set(favs.map(itemKey).filter(Boolean));
        const pageKey = isProductPage() ? extractProductSlug(window.location.pathname) : '';

        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(function (btn) {
            const key = getButtonKey(btn);
            const on = !!(key && favKeys.has(key));
            if (on) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        if (pageKey) {
            document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(function (btn) {
                if (isListingButton(btn)) return;
                if (isListingScope(btn) && !isGalleryScope(btn)) return;
                const key = getButtonKey(btn);
                if (!key || key === pageKey) {
                    if (favKeys.has(pageKey)) btn.classList.add('active');
                    else btn.classList.remove('active');
                }
            });
        }
    } catch (e) {}
}
window.syncFavButtons = syncFavButtons;

window.toggleFav = function (event, btn) {
    if (event) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
    }
    if (!btn) return;

    try {
        const data = collectProductData(btn);
        const key = data.id || productKeyFromLink(data.link);
        if (!key) return;

        const favs = readFavs();
        const existingIdx = favs.findIndex(function (f) { return itemKey(f) === key; });

        if (existingIdx > -1) {
            favs.splice(existingIdx, 1);
            btn.classList.remove('active');
            if (window.showToast) window.showToast('წაშლილია რჩეულებიდან');
        } else {
            favs.unshift({
                id: key,
                name: data.name,
                price: data.price,
                oldPrice: data.oldPrice,
                img: data.img,
                link: data.link
            });
            btn.classList.add('active');
            if (window.showToast) window.showToast('დამატებულია რჩეულებში', 'fav');
        }

        writeFavs(favs);
        syncFavButtons();
        if (window.updateBadges) window.updateBadges();
        if (document.getElementById('favList')) renderFavs();
    } catch (e) {
        console.error('Error toggling favorite:', e);
    }
};

// ==========================================
// 7. ИНИЦИАЛИЗАЦИЯ
// ==========================================

function bootFavSync() {
    persistCleanFavs();
    syncFavButtons();
    if (window.__favMo || !document.documentElement) return;
    window.__favMo = new MutationObserver(function () {
        clearTimeout(window.__favSyncT);
        window.__favSyncT = setTimeout(syncFavButtons, 200);
    });
    window.__favMo.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFavSync);
} else {
    bootFavSync();
}
window.addEventListener('load', syncFavButtons);
