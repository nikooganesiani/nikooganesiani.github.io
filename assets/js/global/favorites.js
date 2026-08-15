function renderFavorites() {
    try {
        const list = document.getElementById('favList');
        const favsRaw = localStorage.getItem('myFavs');
        const favs = favsRaw ? JSON.parse(favsRaw) : [];
        const countEl = document.getElementById('favModalCount');

        if (countEl) {
            countEl.innerText = favs.length > 0 ? `(${favs.length})` : '';
        }

        if (!list) return;

        if (!favs || favs.length === 0) {
            list.innerHTML = `
                <div class="text-center text-slate-400 py-12 font-semibold">
                    <svg class="w-16 h-16 mx-auto mb-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <br>რჩეულები ცარიელია
                </div>`;
            return;
        }

        list.innerHTML = favs.map((f, i) => {
            const oldPHtml = (f?.oldPrice && f.oldPrice !== 'null' && !String(f.oldPrice).includes('undefined'))
                ? `<span class="text-[0.8rem] text-slate-400 line-through decoration-red-500 font-bold ml-1.5">${f.oldPrice}</span>`
                : '';
            const link = f?.link || '#';
            const img = f?.img || '/img/no-image.png';
            const name = f?.name || '';
            const price = f?.price || '';

            return `
                <div class="flex gap-3 bg-transparent border-b border-slate-200 py-4 px-2 relative items-center transition-all duration-200 last:border-none cursor-pointer hover:bg-slate-50" onclick="location.href='${link}'">
                    <img class="w-16 h-16 rounded-lg object-contain bg-transparent shrink-0 border-none" src="${img}" alt="${name}">
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-[0.95rem] text-slate-900 leading-snug mb-1 line-clamp-2 overflow-hidden text-ellipsis">${name}</div>
                        <div class="font-bold text-blue-600 text-[1.1rem] flex items-center flex-wrap gap-1.5">${price} ${oldPHtml}</div>
                    </div>
                    <button type="button" class="bg-transparent text-red-500 w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-300 outline-none shrink-0 border-none active:scale-85 active:bg-red-100" onclick="event.stopPropagation(); window.removeFav(${i})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                        </svg>
                    </button>
                </div>`;
        }).join('');
    } catch (error) {
        console.error('Error rendering favorites:', error);
    }
}

window.renderFavorites = renderFavorites;

window.openFavorites = function(e) {
    if (e?.preventDefault) e.preventDefault();
    renderFavorites();
    window.openAppModal?.('favModal');
};

window.removeFav = function(index) {
    try {
        let favs = JSON.parse(localStorage.getItem('myFavs') || '[]');
        const removedLink = favs[index] ? favs[index].link : null;
        favs.splice(index, 1);
        localStorage.setItem('myFavs', JSON.stringify(favs));
        
        renderFavorites();
        window.updateBadges?.();

        if (removedLink) {
            document.querySelectorAll('.btn-fav, .btn-fav-card').forEach((btn) => {
                if (!btn) return;
                let link = '';
                const card = btn.closest('.product-card');
                if (card) {
                    const a = card.querySelector('a');
                    if (a) link = a.getAttribute('href') || '';
                } else {
                    link = window.location.pathname;
                }
                if (link === removedLink) {
                    btn.classList.remove('active');
                }
            });
        }
    } catch (error) {
        console.error('Error removing favorite:', error);
    }
};
