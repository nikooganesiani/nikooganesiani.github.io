function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function readFavs() {
    try {
        const raw = localStorage.getItem('myFavs');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (e) {
        return [];
    }
}

function writeFavs(favs) {
    localStorage.setItem('myFavs', JSON.stringify(favs));
}

function normalizeLink(href) {
    if (!href) return '';
    try {
        const u = new URL(href, window.location.origin);
        const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
        return path + (u.search || '');
    } catch (e) {
        return String(href).split('#')[0].replace(/\/+$/, '');
    }
}

function isProductPath(link) {
    return /\/product\//i.test(link || '');
}

function formatPrice(value) {
    if (value == null) return '';
    let raw = String(value).replace(/\u00a0/g, ' ').trim();
    if (!raw || raw === 'null' || raw === 'undefined') return '';
    raw = raw.replace(/\s*₾\s*/g, ' ').trim();
    raw = raw.replace(/[^\d.,\s-]/g, '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    return raw + ' ₾';
}

function parseLariAmounts(text) {
    if (!text) return [];
    const src = String(text).replace(/\u00a0/g, ' ');
    const found = [];
    const re = /(\d(?:[\d\s.,]*\d)?|\d)\s*₾/g;
    let m;
    while ((m = re.exec(src))) {
        const num = formatPrice(m[1]);
        if (num) found.push(num);
    }
    return found;
}

function isUselessImage(url) {
    if (!url) return true;
    const u = url.toLowerCase();
    if (u.startsWith('data:image/svg')) return true;
    if (u.startsWith('data:image/gif;base64,r0lgodlh')) return true;
    return /logo|favicon|sprite|placeholder|blank\.|pixel|1x1|spacer|dummy|loading\.|spinner|icon-heart|heart\.svg/i.test(u);
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

function absUrl(url) {
    if (!url) return '';
    const cleaned = String(url).trim().replace(/^['"]|['"]$/g, '');
    if (!cleaned || cleaned.indexOf('data:') === 0) return cleaned;
    try {
        return new URL(cleaned, window.location.origin).href;
    } catch (e) {
        return cleaned;
    }
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
        const url = absUrl(el.dataset.srcset && urlFromSrcset(el.dataset.srcset) || urlFromSrcset(el.getAttribute('srcset')) || el.getAttribute('src'));
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

function findCard(btn) {
    if (!btn) return null;

    const explicit = btn.closest('.product-card, .product-item, .card-product, .card, [data-product-id], [data-product], [data-id]');
    if (explicit && explicit !== document.body) return explicit;

    const scrollChild = btn.closest('#subcatScroll > *, #catScroll > *, #recentScroll > *, [id*="Scroll"] > *');
    if (scrollChild && scrollChild !== document.body) {
        const text = scrollChild.innerText || '';
        if (scrollChild.querySelector('img, picture, [style*="background-image"]') || text.indexOf('₾') !== -1) {
            return scrollChild;
        }
    }

    let el = btn.parentElement;
    let best = null;
    while (el && el !== document.body && el !== document.documentElement) {
        if (el.id === 'favModal' || el.id === 'ordersModal') break;

        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
        const tooHuge = rect.width > window.innerWidth * 0.98 && rect.height > window.innerHeight * 0.8;
        const tooTiny = rect.width < 70 || rect.height < 70;
        const hasMedia = !!el.querySelector('img, picture, [style*="background-image"]');
        const hasPrice = (el.innerText || '').indexOf('₾') !== -1;
        const hasProductLink = !!el.querySelector('a[href*="/product/"]');

        if (!tooHuge && !tooTiny && hasMedia && (hasPrice || hasProductLink)) {
            best = el;
            if (rect.width <= 560 && hasMedia && (hasPrice || hasProductLink)) return el;
        }
        el = el.parentElement;
    }

    return best;
}

function getLink(card, btn) {
    const scopes = [];
    if (btn) scopes.push(btn);
    if (card) scopes.push(card);

    for (let s = 0; s < scopes.length; s++) {
        const scope = scopes[s];
        const direct = scope.getAttribute && (scope.getAttribute('data-url') || scope.getAttribute('data-href') || scope.getAttribute('href'));
        if (direct && isProductPath(direct)) return normalizeLink(direct);
    }

    if (card) {
        const preferred = card.querySelector('a[href*="/product/"], a.product-link');
        if (preferred && preferred.getAttribute('href')) return normalizeLink(preferred.getAttribute('href'));

        const links = card.querySelectorAll('a[href]');
        for (let i = 0; i < links.length; i++) {
            const a = links[i];
            if (a.closest('.btn-fav, .btn-fav-card, button')) continue;
            const href = a.getAttribute('href') || '';
            if (!href || href === '#' || href.indexOf('javascript:') === 0) continue;
            if (isProductPath(href)) return normalizeLink(href);
        }
    }

    if (isProductPath(window.location.pathname)) return normalizeLink(window.location.href);
    return '';
}

function queryFirst(root, selector) {
    try {
        return (root || document).querySelector(selector);
    } catch (e) {
        return null;
    }
}

function getImage(card, btn) {
    const tryList = [];

    if (btn) {
        const gallery = btn.closest('.product-gallery, .main-gallery, .gallery, .swiper, .slick-slider, [class*="gallery"], [class*="Gallery"]');
        if (gallery) tryList.push(gallery);
    }

    if (card) tryList.push(card);

    if (isProductPath(window.location.pathname)) {
        const pageGallery = queryFirst(document, '.product-gallery, .main-gallery, .product-main-gallery, .woocommerce-product-gallery, [class*="product-gallery"]');
        if (pageGallery) tryList.push(pageGallery);
        tryList.push(document);
    }

    const activeSelectors = [
        '.swiper-slide-active img',
        '.swiper-slide-active source',
        '.slick-current img',
        '.slick-active img',
        '.is-selected img',
        '.is-active img',
        '.lg-current img',
        '.main-gallery-slide img',
        '.product-main-img',
        '.product-image',
        'img.product-image',
        '.product-gallery img',
        'picture img',
        'img'
    ];

    for (let r = 0; r < tryList.length; r++) {
        const root = tryList[r];
        if (!root || root.nodeType !== 1 && root !== document) continue;

        for (let i = 0; i < activeSelectors.length; i++) {
            const nodes = root.querySelectorAll(activeSelectors[i]);
            for (let j = 0; j < nodes.length; j++) {
                const url = imageFromEl(nodes[j]);
                if (url) return url;
            }
        }

        const bgNodes = root.querySelectorAll('[style*="background-image"]');
        for (let k = 0; k < bgNodes.length; k++) {
            const url = imageFromEl(bgNodes[k]);
            if (url) return url;
        }
    }

    const og = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    if (og && og.getAttribute('content')) {
        const url = absUrl(og.getAttribute('content'));
        if (url && !isUselessImage(url)) return url;
    }

    return '';
}

function getTitle(card) {
    function cleanTitle(text) {
        if (!text) return '';
        let t = String(text).replace(/\s+/g, ' ').trim();
        if (!t || t.indexOf('₾') !== -1) return '';
        if (!isNaN(Number(t))) return '';
        if (t.length < 2) return '';
        return t;
    }

    if (card) {
        const direct = card.querySelector('.product-name, .product-title, .card-title, h1, h2, h3, h4, .title, [data-name], [data-title]');
        if (direct) {
            const fromData = cleanTitle(direct.getAttribute('data-name') || direct.getAttribute('data-title'));
            if (fromData) return fromData;
            const fromText = cleanTitle(direct.innerText);
            if (fromText) return fromText;
        }

        const links = card.querySelectorAll('a:not(.btn-fav):not(.btn-fav-card)');
        for (let i = 0; i < links.length; i++) {
            const t = cleanTitle(links[i].innerText);
            if (t && t.length > 2) return t;
        }

        const img = card.querySelector('img[alt]');
        const alt = img && cleanTitle(img.getAttribute('alt'));
        if (alt) return alt;
    }

    const mainH1 = document.querySelector('h1.product-title-h1, h1.product-title, h1, .title-desktop, .title-mobile, .product-name');
    if (mainH1) {
        const t = cleanTitle(mainH1.innerText);
        if (t) return t;
    }

    const og = document.querySelector('meta[property="og:title"], meta[name="og:title"]');
    if (og) {
        const t = cleanTitle(og.getAttribute('content'));
        if (t) return t;
    }

    return 'პროდუქტი';
}

function isOldPriceEl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'DEL' || el.tagName === 'S') return true;
    const cls = el.className && String(el.className) || '';
    if (/(line-through|old-price|price-old|modern-price-old|text-slate-400|text-gray-400)/i.test(cls)) return true;
    if (el.closest('del, s, .line-through, .old-price, .price-old, .modern-price-old')) return true;
    try {
        const deco = window.getComputedStyle(el).textDecorationLine || '';
        if (deco.indexOf('line-through') !== -1) return true;
    } catch (e) {}
    return false;
}

function getPrices(card) {
    let price = '';
    let oldPrice = '';

    const scoped = card || queryFirst(document, '.product-info, .product-details, .product-page, .product-summary, .modern-product, main') || document;

    const currentEl = queryFirst(scoped, '.modern-price-current, .price-current, .current-price, .product-price-current, [data-price], .product-price .price, .product-price');
    const oldEl = queryFirst(scoped, '.modern-price-old, .price-old, .old-price, del, s');

    if (currentEl) {
        const dataPrice = currentEl.getAttribute('data-price');
        if (dataPrice && /\d/.test(dataPrice)) price = formatPrice(dataPrice);
        if (!price) {
            const amounts = parseLariAmounts(currentEl.innerText);
            if (amounts.length) price = amounts[0];
            else price = formatPrice(currentEl.innerText);
        }
    }

    if (oldEl) {
        const amounts = parseLariAmounts(oldEl.innerText);
        if (amounts.length) oldPrice = amounts[0];
        else oldPrice = formatPrice(oldEl.innerText);
    }

    if (!price || !oldPrice) {
        const nodes = scoped.querySelectorAll('span, b, strong, del, s, p, div, em, i, small');
        const currentFound = [];
        const oldFound = [];

        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (el.closest('#favModal, #ordersModal, .btn-fav, .btn-fav-card')) continue;
            const text = (el.childElementCount ? '' : (el.textContent || '')).replace(/\u00a0/g, ' ').trim();
            if (!text || text.indexOf('₾') === -1) continue;
            const amounts = parseLariAmounts(text);
            if (!amounts.length) continue;
            if (isOldPriceEl(el)) {
                if (!oldFound.length) oldFound.push(amounts[0]);
            } else {
                currentFound.push(amounts[0]);
            }
        }

        if (!price && currentFound.length) price = currentFound[0];
        if (!oldPrice && oldFound.length) oldPrice = oldFound[0];

        if (!price) {
            const all = parseLariAmounts(scoped.innerText || '');
            if (all.length === 1) price = all[0];
            else if (all.length > 1) {
                if (!oldPrice) oldPrice = all[0];
                price = all[1] || all[0];
            }
        }
    }

    if (price && oldPrice && price === oldPrice) oldPrice = '';
    if (!price) price = '0 ₾';
    return { price: price, oldPrice: oldPrice || null };
}

function isWeakExtract(data) {
    return !data.img || !data.link || !data.price || data.price === '0 ₾' || data.name === 'პროდუქტი';
}

function collectProductData(btn) {
    const card = findCard(btn);
    let link = getLink(card, btn);
    let name = getTitle(card);
    let img = getImage(card, btn);
    let prices = getPrices(card);

    if (isProductPath(window.location.pathname) || isWeakExtract({ img: img, link: link, price: prices.price, name: name })) {
        if (!img) img = getImage(null, btn);
        if (!name || name === 'პროდუქტი') name = getTitle(null);
        if (!prices.price || prices.price === '0 ₾') prices = getPrices(null);
        if (!link && isProductPath(window.location.pathname)) link = normalizeLink(window.location.href);
    }

    return {
        name: name || 'პროდუქტი',
        price: prices.price || '0 ₾',
        oldPrice: prices.oldPrice || null,
        img: img || '',
        link: link || normalizeLink(window.location.pathname)
    };
}

function renderFavs() {
    try {
        const list = document.getElementById('favList');
        const favs = readFavs();
        const countEl = document.getElementById('favModalCount');

        if (countEl) {
            countEl.innerText = favs.length > 0 ? '(' + favs.length + ')' : '';
        }

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
            if (!item) return '';

            const priceFixed = formatPrice(item.price) || '0 ₾';
            const oldFormatted = formatPrice(item.oldPrice);
            const oldPHtml = oldFormatted
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
                            esc(priceFixed) + ' ' + oldPHtml +
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
        const favLinks = new Set(favs.map(function (f) { return normalizeLink(f.link); }));

        document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(function (btn) {
            const card = findCard(btn);
            const link = getLink(card, btn);
            if (link && favLinks.has(link)) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    } catch (e) {}
}
window.syncFavButtons = syncFavButtons;

window.toggleFav = function (event, btn) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!btn) return;

    try {
        const data = collectProductData(btn);
        const favs = readFavs();
        const existingIdx = favs.findIndex(function (f) {
            return normalizeLink(f.link) === normalizeLink(data.link);
        });

        if (existingIdx > -1) {
            favs.splice(existingIdx, 1);
            btn.classList.remove('active');
            if (window.showToast) window.showToast('წაშლილია რჩეულებიდან');
        } else {
            favs.unshift({
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
    syncFavButtons();
    if (window.__favMo) return;
    if (!document.documentElement) return;
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
