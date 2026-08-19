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
    if (cleaned.indexOf('data:') === 0) return cleaned;
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
        const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
        return path;
    } catch (e) {
        return String(href).split('#')[0].split('?')[0].replace(/\/+$/, '');
    }
}

function extractProductSlug(link) {
    const path = normalizeLink(link);
    const m = path.match(/\/product\/([^/]+)\/?$/i) || path.match(/\/product\/([^/]+)/i);
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

function formatPrice(value) {
    if (value == null) return '';
    let raw = String(value).replace(/\u00a0/g, ' ').trim();
    if (!raw || raw === 'null' || raw === 'undefined') return '';
    raw = raw.replace(/₾/g, ' ').replace(/[^\d.,\s-]/g, '').replace(/\s+/g, ' ').trim();
    if (!raw || !/\d/.test(raw)) return '';
    return raw + ' ₾';
}

function parseLariAmounts(text) {
    if (!text) return [];
    const src = String(text).replace(/\u00a0/g, ' ');
    const found = [];
    const re = /₾\s*(\d(?:[\d\s.,]*\d)?|\d)|(\d(?:[\d\s.,]*\d)?|\d)\s*₾/g;
    let m;
    while ((m = re.exec(src))) {
        const num = formatPrice(m[1] || m[2]);
        if (num) found.push(num);
    }
    return found;
}

function isDisplayed(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hidden || el.getAttribute('hidden') !== null) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
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
    return r.width > window.innerWidth * 0.88 || r.height > window.innerHeight * 0.62;
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
    out.id = el.getAttribute('data-product-id') || el.getAttribute('data-product') || '';
    out.name = el.getAttribute('data-name') || el.getAttribute('data-title') || '';
    out.price = el.getAttribute('data-price') || el.getAttribute('data-current-price') || '';
    out.oldPrice = el.getAttribute('data-old-price') || el.getAttribute('data-regular-price') || '';
    out.img = el.getAttribute('data-img') || el.getAttribute('data-image') || el.getAttribute('data-thumbnail') || '';
    out.link = el.getAttribute('data-url') || el.getAttribute('data-href') || el.getAttribute('href') || '';
    if (!out.id && /^\d+$/.test(el.getAttribute('data-id') || '')) out.id = el.getAttribute('data-id');
    return out;
}

function mergeData(a, b) {
    const out = {
        id: a.id || b.id || '',
        name: a.name || b.name || '',
        price: a.price || b.price || '',
        oldPrice: a.oldPrice || b.oldPrice || '',
        img: a.img || b.img || '',
        link: a.link || b.link || ''
    };
    return out;
}

function getLinkFrom(card, btn, allowPageFallback) {
    const fromBtn = attrData(btn);
    if (fromBtn.link && extractProductSlug(fromBtn.link)) return normalizeLink(fromBtn.link);

    const fromCard = attrData(card);
    if (fromCard.link && extractProductSlug(fromCard.link)) return normalizeLink(fromCard.link);

    if (card) {
        const preferred = firstUseful(card, ['a[href*="/product/"]', 'a.product-link']);
        if (preferred) {
            const href = preferred.getAttribute('href');
            if (href) return normalizeLink(href);
        }
    }

    if (allowPageFallback && isProductPage()) return normalizeLink(window.location.pathname);
    return '';
}

function isUselessImage(url) {
    if (!url) return true;
    const u = String(url).toLowerCase();
    if (u.startsWith('data:image/svg')) return true;
    if (u.indexOf('data:image/gif;base64,r0lgodlh') === 0) return true;
    return /logo|favicon|sprite|placeholder|blank\.|pixel|1x1|spacer|dummy|spinner|icon-heart|heart\.svg|data:image\/gif/i.test(u);
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
    if (!t || t.indexOf('₾') !== -1) return '';
    if (!isNaN(Number(t))) return '';
    if (t.length < 2) return '';
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
            const fromText = cleanTitle(direct.innerText);
            if (fromText) return fromText;
        }

        const links = queryAllSafe(root, 'a:not(.btn-fav):not(.btn-fav-card)');
        for (let i = 0; i < links.length; i++) {
            const t = cleanTitle(links[i].innerText);
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
            const t = cleanTitle(mainH1.innerText);
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

function isExplicitOldPriceEl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'DEL' || el.tagName === 'S') return true;
    const cls = el.className && String(el.className) || '';
    if (/(?:^|[\s-])(?:old-price|price-old|modern-price-old|regular-price)(?:$|[\s-])/i.test(cls)) return true;
    if (/\bline-through\b/.test(cls)) return true;
    if (closestAny(el, 'del, s, .old-price, .price-old, .modern-price-old')) return true;
    return false;
}

function parsePriceFromEl(el, preferLast) {
    if (!el || !isDisplayed(el)) return '';
    const dataPrice = el.getAttribute('data-price') || el.getAttribute('data-current-price') || '';
    if (dataPrice && /\d/.test(dataPrice)) return formatPrice(dataPrice);
    const amounts = parseLariAmounts(el.innerText || el.textContent || '');
    if (!amounts.length) return '';
    if (amounts.length === 1) return amounts[0];
    return preferLast ? amounts[amounts.length - 1] : amounts[0];
}

function getPricesFrom(root, allowPageFallback) {
    let scope = root;
    if (!scope || scope === document) {
        scope = firstUseful(document, [
            '.modern-price',
            '.product-price-box',
            '.product-prices',
            '.price-box',
            '.product-info .price',
            '.product-summary',
            '.product-info',
            '.product-details',
            '[class*="product-price"]'
        ]) || document;
    }

    const currentEl = firstUseful(scope, [
        '.modern-price-current',
        '.price-current',
        '.current-price',
        '.product-price-current',
        '[data-price]',
        '.product-price .price',
        '.product-price'
    ], function (el) { return !isExplicitOldPriceEl(el); });

    const oldEl = firstUseful(scope, [
        '.modern-price-old',
        '.price-old',
        '.old-price',
        'del',
        's'
    ], isExplicitOldPriceEl);

    let price = parsePriceFromEl(currentEl, true);
    let oldPrice = parsePriceFromEl(oldEl, false);

    if ((!price || !oldPrice) && scope && scope !== document) {
        const nodes = queryAllSafe(scope, 'span, b, strong, del, s, p, em, i, small');
        const currentFound = [];
        const oldFound = [];
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (el.childElementCount > 0) continue;
            if (isIgnoredScope(el) || !isDisplayed(el)) continue;
            const amounts = parseLariAmounts(el.textContent || '');
            if (!amounts.length) continue;
            if (isExplicitOldPriceEl(el)) oldFound.push(amounts[0]);
            else currentFound.push(amounts[0]);
        }
        if (!price && currentFound.length) price = currentFound[0];
        if (!oldPrice && oldFound.length) oldPrice = oldFound[0];
    }

    if (!price && allowPageFallback && (!root || root === document || isHuge(root))) {
        const pageCurrent = firstUseful(document, ['.modern-price-current', '[data-price]', '.price-current', '.product-price']);
        price = parsePriceFromEl(pageCurrent, true);
        if (!oldPrice) {
            const pageOld = firstUseful(document, ['.modern-price-old', '.price-old', '.old-price', 'del', 's'], isExplicitOldPriceEl);
            oldPrice = parsePriceFromEl(pageOld, false);
        }
    }

    if (price && oldPrice && price === oldPrice) oldPrice = '';
    if (!price) price = '0 ₾';
    return { price: price, oldPrice: oldPrice || null };
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

    if (isProductPage() && (!listing)) {
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

    let name = cleanTitle(data.name) || getTitleFrom(root && root !== document ? root : null, allowPage);
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
        prices = {
            price: formatPrice(data.price) || '0 ₾',
            oldPrice: formatPrice(data.oldPrice) || null
        };
        if (prices.price && prices.oldPrice && prices.price === prices.oldPrice) prices.oldPrice = null;
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
        out.push({
            id: key,
            name: item.name || 'პროდუქტი',
            price: formatPrice(item.price) || '0 ₾',
            oldPrice: formatPrice(item.oldPrice) || null,
            img: item.img || '',
            link: item.link || ''
        });
    }
    return out;
}

function writeFavs(favs) {
    localStorage.setItem('myFavs', JSON.stringify(favs));
}

function persistCleanFavs() {
    const favs = readFavs();
    writeFavs(favs);
    return favs;
}

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
