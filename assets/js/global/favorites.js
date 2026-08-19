const getFavs = () => {
    try {
        return JSON.parse(localStorage.getItem('myFavs')) || [];
    } catch {
        return [];
    }
};

const saveFavs = (favs) => localStorage.setItem('myFavs', JSON.stringify(favs));

const syncFavButtons = () => {
    const favSkus = new Set(getFavs().map(f => f.sku));
    document.querySelectorAll('.btn-fav, .btn-fav-card').forEach(btn => {
        if (btn.dataset.sku && favSkus.has(btn.dataset.sku)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};

const renderFavs = () => {
    const list = document.getElementById('favList');
    const countEl = document.getElementById('favModalCount');
    const favs = getFavs();

    if (countEl) countEl.innerText = favs.length ? `(${favs.length})` : '';
    if (!list) return;

    if (!favs.length) {
        list.innerHTML = `
            <div class="text-center text-slate-400 py-12 font-semibold">
                <svg class="w-16 h-16 mx-auto mb-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
                </svg>
                რჩეულები ცარიელია
            </div>`;
        return;
    }

    list.innerHTML = favs.map(item => {
        const oldPHtml = item.oldPrice && item.oldPrice !== item.price
            ? `<span class="text-[0.8rem] text-slate-400 line-through decoration-red-500 font-bold ml-1.5">${item.oldPrice} ₾</span>`
            : '';

        return `
            <div class="flex items-center gap-3 bg-transparent border-b border-slate-200 py-3 px-2 relative transition-all duration-200 last:border-none">
                <a href="${item.url || '#'}" class="w-14 h-14 rounded-2xl bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-100">
                    ${item.image ? `<img src="${item.image}" alt="${item.name}" class="w-full h-full object-cover">` : ''}
                </a>
                <div class="flex-1 min-w-0 pr-1">
                    <a href="${item.url || '#'}" class="block whitespace-normal leading-snug text-[0.88rem] font-bold text-slate-900 line-clamp-2 hover:text-blue-600 transition-colors">
                        ${item.name || 'პროდუქტი'}
                    </a>
                    <div class="text-[0.95rem] text-blue-600 font-bold flex items-center mt-1">
                        ${item.price || '0'} ₾ ${oldPHtml}
                    </div>
                </div>
                <button type="button" data-remove-sku="${item.sku}" class="btn-remove-fav w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="წაშლა">
                    <svg class="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
};

document.addEventListener('click', (e) => {
    const favBtn = e.target.closest('.btn-fav, .btn-fav-card');
    if (favBtn) {
        e.preventDefault();
        e.stopPropagation();

        const sku = favBtn.dataset.sku;
        if (!sku) return;

        const favs = getFavs();
        const index = favs.findIndex(f => f.sku === sku);

        if (index > -1) {
            favs.splice(index, 1);
            favBtn.classList.remove('active');
            if (window.showToast) window.showToast('წაშლილია რჩეულებიდან');
        } else {
            favs.unshift({
                sku: sku,
                name: favBtn.dataset.name || '',
                price: favBtn.dataset.price || '',
                oldPrice: favBtn.dataset.oldPrice || '',
                cat: favBtn.dataset.cat || '',
                subcat: favBtn.dataset.subcat || '',
                image: favBtn.dataset.image || favBtn.dataset.img || '',
                url: favBtn.dataset.url || favBtn.dataset.link || ''
            });
            favBtn.classList.add('active');
            if (window.showToast) window.showToast('დამატებულია რჩეულებში', 'fav');
        }

        saveFavs(favs);
        syncFavButtons();
        if (window.updateBadges) window.updateBadges();
        if (document.getElementById('favList')) renderFavs();
        return;
    }

    const removeBtn = e.target.closest('.btn-remove-fav');
    if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        
        const sku = removeBtn.dataset.removeSku;
        const favs = getFavs();
        const index = favs.findIndex(f => f.sku === sku);
        
        if (index > -1) {
            favs.splice(index, 1);
            saveFavs(favs);
            renderFavs();
            syncFavButtons();
            if (window.updateBadges) window.updateBadges();
            if (window.showToast) window.showToast('წაშლილია რჩეულებიდან');
        }
        return;
    }

    const openFavsBtn = e.target.closest('.btn-open-favs');
    if (openFavsBtn) {
        e.preventDefault();
        renderFavs();
        if (window.openAppModal) window.openAppModal('favModal');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    syncFavButtons();
});

window.renderFavs = renderFavs;
window.syncFavButtons = syncFavButtons;
