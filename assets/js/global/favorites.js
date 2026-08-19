(function () {
    'use strict';

    const STORAGE_KEY = 'site:favorites:v1';
    const BTN_SELECTOR = '.btn-fav, .btn-fav-card';

    const qs = (s, ctx) => (ctx || document).querySelector(s);
    const qsa = (s, ctx) => Array.prototype.slice.call((ctx || document).querySelectorAll(s));

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toAbsoluteUrl(url) {
        if (!url) return '';
        try {
            return new URL(String(url), window.location.origin).href;
        } catch (e) {
            return String(url);
        }
    }

    function formatPrice(raw) {
        if (raw == null) return '';
        const s = String(raw).replace(/\u00a0/g, ' ').trim();
        if (!s || s === 'null' || s === 'undefined') return '';
        return s.indexOf('₾') !== -1 ? s : s + ' ₾';
    }

    function normalizeId(id) {
        return id == null ? '' : String(id).trim().toLowerCase();
    }

    function readDataset(el) {
        if (!el) return null;
        const d = el.dataset || {};
        const id = d.sku || d.id || d.productId || d.product || d.s || '';
        if (!id) return null;

        const name = d.name || d.title || el.getAttribute('title') || 'პროდუქტი';
        const price = formatPrice(d.price || d.currentPrice || d.pr || '');
        const oldPrice = formatPrice(d.oldPrice || d.regularPrice || '');
        const img = toAbsoluteUrl(d.img || d.image || d.thumbnail || '');
        const link = d.url || d.href || d.link || el.getAttribute('href') || '';

        return {
            id: normalizeId(id),
            name: name,
            price: price || '0 ₾',
            oldPrice: oldPrice || null,
            img: img || '',
            link: link || ('/product/' + encodeURIComponent(normalizeId(id)) + '/')
        };
    }

    function collectProductData(btn) {
        if (!btn) return null;
        // try the button itself
        const fromBtn = readDataset(btn);
        if (fromBtn) return fromBtn;

        // try page-level product data element
        const pageData = qs('#productData');
        const fromPage = readDataset(pageData);
        if (fromPage) return fromPage;

        // try closest card/container with dataset
        const card = btn.closest && btn.closest('[data-sku], [data-id], [data-product-id], [data-product]');
        const fromCard = readDataset(card);
        if (fromCard) return fromCard;

        return null;
    }

    function safeParse(raw) {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function getFavs() {
        const raw = localStorage.getItem(STORAGE_KEY);
        const items = safeParse(raw);
        const seen = new Set();
        const out = [];
        for (const it of items) {
            if (!it || !it.id) continue;
            const id = normalizeId(it.id);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push({
                id: id,
                name: it.name || 'პროდუქტი',
                price: formatPrice(it.price) || '0 ₾',
                oldPrice: formatPrice(it.oldPrice) || null,
                img: it.img || '',
                link: it.link || ('/product/' + encodeURIComponent(id) + '/')
            });
        }
        return out;
    }

    function saveFavs(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('favorites: failed to save', e);
        }
    }

    function isFavorited(id) {
        if (!id) return false;
        const nid = normalizeId(id);
        return getFavs().some(i => i.id === nid);
    }

    function addFav(data) {
        if (!data || !data.id) return false;
        const list = getFavs();
        const nid = normalizeId(data.id);
        if (list.some(i => i.id === nid)) return false;
        list.unshift({
            id: nid,
            name: data.name || 'პროდუქტი',
            price: data.price || '0 ₾',
            oldPrice: data.oldPrice || null,
            img: data.img || '',
            link: data.link || ('/product/' + encodeURIComponent(nid) + '/')
        });
        saveFavs(list);
        return true;
    }

    function removeFav(id) {
        const nid = normalizeId(id);
        const list = getFavs().filter(i => i.id !== nid);
        saveFavs(list);
        return true;
    }

    function removeFavByIndex(idx) {
        const list = getFavs();
        if (idx < 0 || idx >= list.length) return false;
        list.splice(idx, 1);
        saveFavs(list);
        return true;
    }

    function updateBadgesAndSync() {
        // update any badge callbacks
        if (typeof window.updateBadges === 'function') {
            try { window.updateBadges(); } catch (e) { /* ignore */ }
        }
        syncFavButtons();
    }

    function renderFavs() {
        const listEl = qs('#favList');
        const countEl = qs('#favModalCount');
        const favs = getFavs();

        if (countEl) countEl.textContent = favs.length ? `(${favs.length})` : '';
        if (!listEl) return;

        if (!favs.length) {
            listEl.innerHTML = '<div class="text-center text-slate-400 py-12 font-semibold">' +
                '<svg class="w-16 h-16 mx-auto mb-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>' +
                '</svg>რჩეულები ცარიელია</div>';
            return;
        }

        const html = favs.map((item, idx) => {
            const href = escapeHtml(item.link || '#');
            const name = escapeHtml(item.name || 'პროდუქტი');
            const img = item.img ? escapeHtml(toAbsoluteUrl(item.img)) : '';
            const price = escapeHtml(item.price || '0 ₾');
            const old = (item.oldPrice && item.oldPrice !== item.price) ? escapeHtml(item.oldPrice) : '';

            const oldHtml = old ? `<span class="text-[0.8rem] text-slate-400 line-through decoration-red-500 font-bold ml-1.5">${old}</span>` : '';

            return (`<div class="flex items-center gap-3 bg-transparent border-b border-slate-200 py-3 px-2 relative transition-all duration-200 last:border-none">` +
                `<a href="${href}" class="w-14 h-14 rounded-2xl bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-100">` +
                (img ? `<img src="${img}" alt="${name}" class="w-full h-full object-cover">` : '') +
                `</a>` +
                `<div class="flex-1 min-w-0 pr-1">` +
                `<a href="${href}" class="block whitespace-normal leading-snug text-[0.88rem] font-bold text-slate-900 line-clamp-2 hover:text-blue-600 transition-colors">${name}</a>` +
                `<div class="text-[0.95rem] text-blue-600 font-bold flex items-center mt-1">${price}${oldHtml ? ' ' + oldHtml : ''}</div>` +
                `</div>` +
                `<button type="button" data-fav-remove-index="${idx}" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="წაშლა">` +
                `<svg class="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg></button></div>`);
        }).join('');

        listEl.innerHTML = html;
    }

    function syncFavButtons() {
        const favs = getFavs();
        const favSet = new Set(favs.map(i => i.id));
        qsa(BTN_SELECTOR).forEach(btn => {
            const data = collectProductData(btn);
            const id = data && data.id ? data.id : '';
            const active = id && favSet.has(id);
            btn.classList.toggle('active', !!active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function toggleFav(event, btn) {
        if (event) {
            if (typeof event.preventDefault === 'function') event.preventDefault();
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
        }
        const data = collectProductData(btn);
        if (!data || !data.id) return;

        if (isFavorited(data.id)) {
            removeFav(data.id);
            if (btn) btn.classList.remove('active');
            if (typeof window.showToast === 'function') window.showToast('წაშლილია რჩეულებიდან');
        } else {
            addFav(data);
            if (btn) btn.classList.add('active');
            if (typeof window.showToast === 'function') window.showToast('დამატებულია რჩეულებში', 'fav');
        }

        updateBadgesAndSync();
        if (qs('#favList')) renderFavs();
    }

    function openFavs(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        renderFavs();
        if (typeof window.openAppModal === 'function') window.openAppModal('favModal');
    }

    // Delegated click handlers
    function onDocumentClick(e) {
        const btn = e.target.closest && e.target.closest(BTN_SELECTOR);
        if (btn) return toggleFav(e, btn);

        const removeBtn = e.target.closest && e.target.closest('[data-fav-remove-index]');
        if (removeBtn) {
            const idx = Number(removeBtn.getAttribute('data-fav-remove-index'));
            if (!Number.isNaN(idx) && removeFavByIndex(idx)) {
                renderFavs();
                updateBadgesAndSync();
                if (typeof window.showToast === 'function') window.showToast('წაშლილია რჩეულებიდან');
            }
        }
    }

    function removeFavByIndex(idx) {
        return removeFavByIndexInner(idx);
    }

    // small inner function to avoid name clash
    function removeFavByIndexInner(idx) {
        const ok = removeFavByIndexInnerImpl(idx);
        return ok;
    }

    function removeFavByIndexInnerImpl(idx) {
        const success = removeFavByIndexCore(idx);
        return success;
    }

    function removeFavByIndexCore(idx) {
        return removeFavByIndexActual(idx);
    }

    function removeFavByIndexActual(idx) {
        return (function () { return removeFavByIndexActualImpl(idx); })();
    }

    function removeFavByIndexActualImpl(idx) {
        const list = getFavs();
        if (idx < 0 || idx >= list.length) return false;
        list.splice(idx, 1);
        saveFavs(list);
        return true;
    }

    function boot() {
        // ensure favorites array exists
        saveFavs(getFavs());
        syncFavButtons();

        // delegated click for buttons and remove actions
        document.removeEventListener('click', onDocumentClick);
        document.addEventListener('click', onDocumentClick);

        // observe DOM changes to sync dynamically added buttons
        if (!window.__favObserver && document.documentElement) {
            window.__favObserver = new MutationObserver(() => {
                clearTimeout(window.__favSyncTimeout);
                window.__favSyncTimeout = setTimeout(syncFavButtons, 150);
            });
            window.__favObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
    }

    // expose public API
    window.Favorites = {
        getAll: getFavs,
        add: addFav,
        remove: removeFav,
        toggle: toggleFav,
        render: renderFavs,
        sync: syncFavButtons,
        open: openFavs
    };

    // backwards compatible helpers
    window.renderFavs = renderFavs;
    window.syncFavButtons = syncFavButtons;
    window.toggleFav = function (e, el) { return toggleFav(e, el || (e && e.target && e.target.closest ? e.target.closest(BTN_SELECTOR) : null)); };
    window.openFavs = openFavs;
    window.openFavorites = openFavs;
    window.removeFavByIdx = function (idx) { if (removeFavByIndexActualImpl(idx)) { renderFavs(); syncFavButtons(); if (typeof window.updateBadges === 'function') window.updateBadges(); return true; } return false; };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.addEventListener('load', syncFavButtons);
})();
