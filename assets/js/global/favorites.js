(function () {
    var STORAGE_KEY = 'myFavs';
    var BTN_SELECTOR = '.btn-fav, .btn-fav-card';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function absUrl(url) {
        if (!url) return '';
        var cleaned = String(url).trim();
        if (!cleaned || cleaned.indexOf('data:') === 0) return cleaned;
        try {
            return new URL(cleaned, window.location.origin).href;
        } catch (e) {
            return cleaned;
        }
    }

    function formatPrice(value) {
        if (value == null) return '';
        var raw = String(value).replace(/\u00a0/g, ' ').trim();
        if (!raw || raw === 'null' || raw === 'undefined') return '';
        if (raw.indexOf('₾') !== -1) return raw;
        return raw + ' ₾';
    }

    function productLink(sku, explicit) {
        if (explicit) return explicit;
        if (sku) return '/product/' + encodeURIComponent(sku) + '/';
        return window.location.pathname || '';
    }

    function readElData(el) {
        if (!el) return null;
        var d = el.dataset || {};
        var sku = d.sku || d.id || d.productId || '';
        if (!sku) return null;

        var oldPrice = formatPrice(d.oldPrice || d.regularPrice);
        var price = formatPrice(d.price || d.currentPrice) || '0 ₾';
        if (oldPrice && oldPrice === price) oldPrice = '';

        return {
            id: String(sku).toLowerCase(),
            name: d.name || d.title || 'პროდუქტი',
            price: price,
            oldPrice: oldPrice || null,
            img: absUrl(d.img || d.image || d.thumbnail || ''),
            link: productLink(sku, d.url || d.href || d.link)
        };
    }

    function collectProductData(btn) {
        var fromBtn = readElData(btn);
        if (fromBtn) return fromBtn;

        var page = readElData(document.getElementById('productData'));
        if (page) return page;

        if (btn && btn.closest) {
            var fromCard = readElData(btn.closest('[data-sku], [data-id], [data-product-id]'));
            if (fromCard) return fromCard;
        }

        return null;
    }

    function getButtonKey(btn) {
        var data = collectProductData(btn);
        return data ? data.id : '';
    }

    function itemKey(item) {
        return item && item.id ? String(item.id).toLowerCase() : '';
    }

    function readFavs() {
        var parsed = [];
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) parsed = [];
        } catch (e) {
            parsed = [];
        }

        var seen = {};
        var out = [];
        for (var i = 0; i < parsed.length; i++) {
            var item = parsed[i];
            if (!item) continue;
            var key = itemKey(item);
            if (!key || seen[key]) continue;
            seen[key] = true;
            out.push({
                id: key,
                name: item.name || 'პროდუქტი',
                price: formatPrice(item.price) || '0 ₾',
                oldPrice: formatPrice(item.oldPrice) || null,
                img: item.img || '',
                link: item.link || productLink(key)
            });
        }
        return out;
    }

    function writeFavs(favs) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
    }

    function renderFavs() {
        var list = document.getElementById('favList');
        var favs = readFavs();
        var countEl = document.getElementById('favModalCount');

        if (countEl) countEl.innerText = favs.length ? '(' + favs.length + ')' : '';
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
            var priceFixed = formatPrice(item.price) || '0 ₾';
            var oldFormatted = formatPrice(item.oldPrice);
            var oldPHtml = oldFormatted && oldFormatted !== priceFixed
                ? '<span class="text-[0.8rem] text-slate-400 line-through decoration-red-500 font-bold ml-1.5">' + esc(oldFormatted) + '</span>'
                : '';
            var imgSrc = item.img ? absUrl(item.img) : '';
            var href = item.link || '#';
            var name = item.name || 'პროდუქტი';

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
    }

    function syncFavButtons() {
        var favKeys = {};
        readFavs().forEach(function (item) {
            var key = itemKey(item);
            if (key) favKeys[key] = true;
        });

        document.querySelectorAll(BTN_SELECTOR).forEach(function (btn) {
            var key = getButtonKey(btn);
            btn.classList.toggle('active', !!(key && favKeys[key]));
        });
    }

    function toggleFav(event, btn) {
        if (event) {
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
        }
        if (!btn) return;

        var data = collectProductData(btn);
        if (!data || !data.id) return;

        var favs = readFavs();
        var existingIdx = -1;
        for (var i = 0; i < favs.length; i++) {
            if (itemKey(favs[i]) === data.id) {
                existingIdx = i;
                break;
            }
        }

        if (existingIdx > -1) {
            favs.splice(existingIdx, 1);
            btn.classList.remove('active');
            if (window.showToast) window.showToast('წაშლილია რჩეულებიდან');
        } else {
            favs.unshift(data);
            btn.classList.add('active');
            if (window.showToast) window.showToast('დამატებულია რჩეულებში', 'fav');
        }

        writeFavs(favs);
        syncFavButtons();
        if (window.updateBadges) window.updateBadges();
        if (document.getElementById('favList')) renderFavs();
    }

    function openFavs(e) {
        if (e && e.preventDefault) e.preventDefault();
        renderFavs();
        if (window.openAppModal) window.openAppModal('favModal');
    }

    function removeFavByIdx(idx, e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        var favs = readFavs();
        if (idx < 0 || idx >= favs.length) return;
        favs.splice(idx, 1);
        writeFavs(favs);
        renderFavs();
        syncFavButtons();
        if (window.updateBadges) window.updateBadges();
        if (window.showToast) window.showToast('წაშლილია რჩეულებიდან');
    }

    function boot() {
        writeFavs(readFavs());
        syncFavButtons();

        if (window.__favMo || !document.documentElement) return;
        window.__favMo = new MutationObserver(function () {
            clearTimeout(window.__favSyncT);
            window.__favSyncT = setTimeout(syncFavButtons, 200);
        });
        window.__favMo.observe(document.documentElement, { childList: true, subtree: true });
    }

    window.renderFavs = renderFavs;
    window.syncFavButtons = syncFavButtons;
    window.toggleFav = toggleFav;
    window.openFavs = openFavs;
    window.openFavorites = openFavs;
    window.removeFavByIdx = removeFavByIdx;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
    window.addEventListener('load', syncFavButtons);
})();
