function setupSearch(inputId, resultsId, clearId) {
    try {
        const s = document.getElementById(inputId);
        const r = document.getElementById(resultsId);
        const c = document.getElementById(clearId);
        if (!s) return;
        
        const renderResults = () => {
            let q = s.value.trim();
            if (c) {
                if (q.length > 0) c.classList.add('show');
                else c.classList.remove('show');
            }
            if (!q) {
                if (r) {
                    r.innerHTML = '';
                    r.classList.remove('show');
                    if (inputId === 'mobileSearchInput') r.style.display = 'none';
                    else r.style.display = '';
                }
                return;
            }
            
            window.fetchCatalogCached().then(d => {
                if (s.value.trim() !== q) return;
                if (!d || !Array.isArray(d.products)) return;

                let qLower = q.toLowerCase();
                let normalizedQ = window.normalizeQuery(q);
                let f = d.products.filter(p => p && p.stockStatus !== 'out_of_stock' && 
                    (((p.name || '').toLowerCase().includes(qLower)) || 
                     ((p.name || '').toLowerCase().includes(normalizedQ)))
                );
                
                if (r) {
                    if (inputId === 'mobileSearchInput') {
                        r.innerHTML = f.length ? f.map(p => {
                            let catText = '';
                            let mainCatId = (Array.isArray(p.categories) && p.categories.length > 0) ? p.categories[0] : (p.category || p.categories);
                            if (mainCatId && window.CATALOG_STRUCTURE?.[mainCatId]) {
                                catText = window.CATALOG_STRUCTURE[mainCatId].title || '';
                            }
                            let oldP = (p.oldPrice || p.old_price) ? `<span class="text-[0.8rem] text-slate-400 line-through decoration-red-500 font-bold ml-1.5">${String(p.oldPrice || p.old_price).replace(/₾/g, '')}₾</span>` : '';
                            let imgSrc = (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : (p.image || '/img/no-image.png');
                            return `<div class="flex gap-3 bg-transparent border-b border-slate-200 py-4 px-2 relative items-center transition-all duration-200 last:border-none cursor-pointer mb-2 hover:bg-slate-50" onclick="location.href='/product/${p.id}/'"><img class="w-16 h-16 rounded-lg object-contain bg-transparent shrink-0" src="${imgSrc}" onerror="this.src='/img/no-image.png'"><div class="flex-1 min-w-0"><div class="font-bold text-[0.95rem] text-slate-900 leading-snug mb-0.5 line-clamp-2 overflow-hidden text-ellipsis">${p.name || ''}</div><div class="text-[0.75rem] text-slate-400 mt-0.5 font-semibold">${catText}</div><div class="font-bold text-blue-600 text-[1.1rem] flex items-center flex-wrap gap-1.5">${String(p.price || 0).replace(/₾/g, '')}₾ ${oldP}</div></div></div>`;
                        }).join('') : '<div class="text-center p-8 text-slate-400 font-semibold">ვერაფერი მოიძებნა</div>';
                        r.style.display = 'flex';
                    } else {
                        r.innerHTML = f.length ? f.map(p => {
                            let catText = '';
                            let mainCatId = (Array.isArray(p.categories) && p.categories.length > 0) ? p.categories[0] : (p.category || p.categories);
                            let subCatId = (Array.isArray(p.subcategories) && p.subcategories.length > 0) ? p.subcategories[0] : (p.subcategory || p.sub || p.subcategories);
                            if (mainCatId && window.CATALOG_STRUCTURE?.[mainCatId]) {
                                catText = window.CATALOG_STRUCTURE[mainCatId].title || '';
                                if (subCatId) {
                                    let sub = window.CATALOG_STRUCTURE[mainCatId].subs?.find(sb => sb.id === subCatId);
                                    if (sub) catText += ` <span class="text-slate-300 mx-1">&bull;</span> ${sub.name} `;
                                }
                            }
                            let oldPriceValue = p.oldPrice || p.old_price;
                            let oldPriceHtml = oldPriceValue ? `<span class="text-[0.8rem] text-slate-400 line-through font-semibold ml-2">${String(oldPriceValue).replace(/₾/g, '')}₾</span>` : '';
                            let imgSrc = (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : (p.image || '/img/no-image.png');
                            return `<div class="flex items-center gap-4 p-3 cursor-pointer rounded-2xl transition-all duration-200 hover:bg-slate-50" onclick="location.href='/product/${p.id}/'"><img src="${imgSrc}" class="w-12 h-12 object-contain rounded-2xl bg-transparent shrink-0" onerror="this.src='/img/no-image.png'"><div class="flex-1 min-w-0"><div class="text-[0.95rem] font-bold whitespace-nowrap overflow-hidden text-ellipsis text-slate-900">${p.name || ''}</div><div class="text-[0.75rem] text-slate-400 font-semibold mt-0.5">${catText}</div><div class="font-bold text-blue-600 mt-0.5 flex items-center"><span>${String(p.price || 0).replace(/₾/g, '')}₾</span>${oldPriceHtml}</div></div></div>`;
                        }).join('') : '<div class="p-8 text-center text-slate-400 font-semibold">ვერაფერი მოიძებნა</div>';
                        r.style.display = '';
                        r.classList.add('show');
                    }
                }
            }).catch(err => console.error(err));
        };

        s.addEventListener('input', renderResults);
        s.addEventListener('focus', function() {
            if (this.value.trim().length > 0 && r && r.innerHTML !== '') {
                if (inputId === 'mobileSearchInput') {
                    r.style.display = 'flex';
                } else {
                    r.style.display = '';
                    r.classList.add('show');
                }
            }
        });

        if (c) {
            c.onclick = function() {
                s.value = '';
                s.focus();
                c.classList.remove('show');
                renderResults();
            };
        }

        // Перенаправление на страницу поиска при нажатии Enter
        s.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = this.value.trim();
                if (q) window.location.href = '/search/?search=' + encodeURIComponent(q);
            }
        });
        
        if (inputId === 'searchInput') { 
            document.addEventListener('click', e => { 
                const desktopBtn = document.getElementById('desktopSearchBtn');
                if (!s.contains(e.target) && r && !r.contains(e.target) && (!desktopBtn || !desktopBtn.contains(e.target)) && (!c || !c.contains(e.target))) {
                    r.classList.remove('show'); 
                }
            }); 
        }
    } catch(e) { console.error(e); }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        const searchQ = new URLSearchParams(window.location.search).get('search');
        if (searchQ) {
            const s = document.getElementById('searchInput');
            if (s) {
                s.value = searchQ;
                document.getElementById('desktopSearchClear')?.classList.add('show');
            }
        }
    } catch(e) { console.error(e); }

    try {
        let desktopInput = document.getElementById('searchInput');
        let parentContainer = document.querySelector('.group.relative.h-full') || desktopInput?.parentElement;
        
        if (desktopInput && parentContainer && !document.getElementById('desktopSearchResults')) {
            let sr = document.createElement('div');
            sr.className = 'absolute top-[calc(100%+10px)] left-0 right-0 bg-white w-full rounded-[1.5rem] shadow-[0_10px_25px_rgba(0,0,0,0.1)] border-none z-[1000] opacity-0 invisible scale-[0.98] -translate-y-3 transition-all duration-300 max-h-[400px] overflow-y-auto p-2 [&.show]:opacity-100 [&.show]:visible [&.show]:translate-y-0 [&.show]:scale-100 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';
            sr.id = 'desktopSearchResults';
            parentContainer.appendChild(sr);
        }

        setupSearch('searchInput', 'desktopSearchResults', 'desktopSearchClear');
        setupSearch('mobileSearchInput', 'mobileSearchResults', 'mobileSearchClear');
        
        ['desktopSearchBtn', 'mobileSearchBtn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => {
                    const inputId = id === 'desktopSearchBtn' ? 'searchInput' : 'mobileSearchInput';
                    const inputEl = document.getElementById(inputId);
                    const q = inputEl?.value?.trim();
                    if (q) window.location.href = '/search/' + encodeURIComponent(q);
                });
            }
        });
    } catch(e){}
});
