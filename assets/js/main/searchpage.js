// assets/js/searchpage.js
(function() {
    document.addEventListener('DOMContentLoaded', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const searchQ = (urlParams.get('result') || urlParams.get('search') || urlParams.get('q') || '').trim();
        const queryDisplay = document.getElementById('searchQueryDisplay');
        const searchContainer = document.getElementById('searchResultsGrid');

        if (!searchContainer) return;

        if (!searchQ) {
            if (queryDisplay) queryDisplay.textContent = '""';
            searchContainer.innerHTML = `
                <div class="col-span-full flex flex-col items-center text-center py-16 sm:py-20 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 sm:w-20 sm:h-20 mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <div class="text-lg sm:text-2xl font-extrabold text-slate-600">შეიყვანეთ საძიებო სიტყვა</div>
                </div>`;
            return;
        }

        if (queryDisplay) queryDisplay.textContent = `"${searchQ}"`;

        let searchCurrentPage = 1;
        const searchItemsPerPage = 16;
        let searchProductsData = [];

        const loadMoreBtn = document.getElementById('loadMoreBtn');
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        const minPriceInput = document.getElementById('minPrice');
        const maxPriceInput = document.getElementById('maxPrice');
        const sortSelect = document.getElementById('sortSelect');
        const resetBtn = document.getElementById('resetFilters');
        const countDisplay = document.getElementById('searchResultCount');

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                searchCurrentPage++;
                renderSearchResults(true);
            });
        }

        function createSearchCardHTML(p) {
            let imgs = p.images || (p.image ? [p.image] : []);
            imgs = imgs.filter(img => !img.includes('youtube.com') && !img.includes('youtu.be'));
            if (imgs.length === 0) imgs.push('/img/no-image.png');
            
            const hasMultipleImages = imgs.length > 1;
            let discountBadge = '';
            
            const numOldPrice = parseInt(String(p.oldPrice || '').replace(/[^0-9]/g, ''), 10) || 0;
            const numPrice = parseInt(String(p.price || '').replace(/[^0-9]/g, ''), 10) || 0;

            if (numOldPrice > numPrice && numPrice > 0) {
                const percent = Math.round(((numOldPrice - numPrice) / numOldPrice) * 100);
                discountBadge = `<div class="absolute top-2 left-2 sm:top-3 sm:left-3 bg-red-500 text-white px-1.5 py-1 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg text-[0.7rem] sm:text-xs font-extrabold z-10 shadow-md pointer-events-none">-${percent}%</div>`;
            }
            
            const productDataAttr = JSON.stringify(p).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
            
            let dotsHtml = '';
            if (hasMultipleImages) {
                dotsHtml = `<div class="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-10 pointer-events-none" id="search-dots-${p.id}">
                    ${imgs.map((_, i) => `<div class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-slate-900/30 backdrop-blur-xs transition-all duration-300 dot ${i === 0 ? '!bg-blue-600 scale-125' : ''}"></div>`).join('')}
                </div>`;
            }

            return `
            <div class="product-card group bg-white rounded-2xl sm:rounded-[2rem] overflow-hidden shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col border border-slate-100 hover:border-slate-200 h-full w-full min-w-0 select-none">
                <div class="relative w-full aspect-square overflow-hidden bg-white rounded-t-2xl sm:rounded-t-[2rem] border-b border-slate-100">
                    ${discountBadge}
                    <div class="flex w-full h-full overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" id="search-track-${p.id}" onscroll="window.searchUpdateDots('${p.id}', this)">
                        ${imgs.map(img => `
                            <div class="shrink-0 w-full h-full snap-start flex items-center justify-center">
                                <a href="/product/${p.id}/" class="contents" draggable="false">
                                    <img class="w-full h-full object-cover select-none" src="${img}" alt="${p.name}" width="280" height="280" loading="lazy" onerror="this.onerror=null; this.src='/img/no-image.png'" draggable="false">
                                </a>
                            </div>
                        `).join('')}
                    </div>
                    ${dotsHtml}
                    ${hasMultipleImages ? `
                        <button type="button" class="hidden sm:flex absolute top-1/2 -translate-y-1/2 left-3 bg-white/95 border border-slate-100 w-9 h-9 rounded-full items-center justify-center cursor-pointer z-10 text-slate-900 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-white hover:scale-110 active:scale-90 transition-all duration-300 shadow-md outline-none" onclick="window.searchChangeSlide('${p.id}', -1, event)">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"></path></svg>
                        </button>
                        <button type="button" class="hidden sm:flex absolute top-1/2 -translate-y-1/2 right-3 bg-white/95 border border-slate-100 w-9 h-9 rounded-full items-center justify-center cursor-pointer z-10 text-slate-900 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-white hover:scale-110 active:scale-90 transition-all duration-300 shadow-md outline-none" onclick="window.searchChangeSlide('${p.id}', 1, event)">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
                        </button>
                    ` : ''}
                </div>
                <div class="p-3 sm:p-5 flex flex-col flex-1">
                    <div class="bg-transparent border-0 p-0 h-10 sm:h-12 flex items-start mb-2 sm:mb-3 cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all" onclick="location.href='/product/${p.id}/'">
                        <div class="text-xs sm:text-base font-bold text-slate-900 leading-snug line-clamp-2">${p.name}</div>
                    </div>
                    <div class="flex flex-col sm:flex-row sm:items-baseline gap-0 sm:gap-2.5 mb-3 sm:mb-4 px-0 sm:px-1">
                        <div class="text-lg sm:text-2xl font-black text-blue-600 tracking-tight">${String(p.price).replace(/₾/g, '')}₾</div>
                        ${p.oldPrice ? `<span class="line-through text-slate-500 text-xs sm:text-sm font-semibold opacity-80">${String(p.oldPrice).replace(/₾/g, '')}₾</span>` : ''}
                    </div>
                    <button type="button" class="mt-auto w-full bg-blue-600 text-white border-0 py-2 sm:py-3.5 px-3 rounded-xl sm:rounded-2xl cursor-pointer font-extrabold text-xs sm:text-base transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 outline-none shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-600/30 active:scale-95 active:shadow-none" onclick='window.openOrderForm ? window.openOrderForm(${productDataAttr}) : null'>
                        <svg class="w-4 h-4 sm:w-5 sm:h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                        შეკვეთა
                    </button>
                </div>
            </div>`;
        }

        window.searchUpdateDots = function(productId, trackEl) {
            const index = Math.round(trackEl.scrollLeft / trackEl.clientWidth);
            const dots = document.querySelectorAll(`#search-dots-${productId} .dot`);
            dots.forEach((d, i) => {
                if (i === index) {
                    d.classList.add('!bg-blue-600', 'scale-125');
                } else {
                    d.classList.remove('!bg-blue-600', 'scale-125');
                }
            });
        };

        window.searchChangeSlide = function(productId, direction, event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            const track = document.getElementById(`search-track-${productId}`);
            if (!track) return;
            track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' });
        };

        function renderSearchResults(isLoadMore = false) {
            if (!isLoadMore) searchCurrentPage = 1;

            let filtered = [...searchProductsData];
            
            const minVal = minPriceInput && minPriceInput.value !== '' ? parseInt(minPriceInput.value, 10) : NaN;
            const maxVal = maxPriceInput && maxPriceInput.value !== '' ? parseInt(maxPriceInput.value, 10) : NaN;

            if (resetBtn && sortSelect && minPriceInput && maxPriceInput) {
                if (minPriceInput.value !== '' || maxPriceInput.value !== '' || sortSelect.value !== 'name-asc') {
                    resetBtn.classList.add('show');
                } else {
                    resetBtn.classList.remove('show');
                }
            }

            filtered = filtered.filter(p => p.stockStatus !== 'out_of_stock');
            
            const searchTerms = searchQ.toLowerCase().split(/\s+/).filter(Boolean);
            filtered = filtered.filter(p => {
                const name = (p.name || '').toLowerCase();
                const desc = (p.description || '').toLowerCase();
                const sku = (p.sku || '').toLowerCase();
                return searchTerms.every(term => name.includes(term) || desc.includes(term) || sku.includes(term));
            });

            if (!isNaN(minVal)) filtered = filtered.filter(p => p.priceValue >= minVal);
            if (!isNaN(maxVal)) filtered = filtered.filter(p => p.priceValue <= maxVal);
            
            const sortBy = sortSelect ? sortSelect.value : 'name-asc';
            if (sortBy === 'name-asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            if (sortBy === 'name-desc') filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            if (sortBy === 'price-asc') filtered.sort((a, b) => a.priceValue - b.priceValue);
            if (sortBy === 'price-desc') filtered.sort((a, b) => b.priceValue - a.priceValue);

            if (countDisplay) countDisplay.textContent = `(${filtered.length})`;

            if (filtered.length === 0) {
                searchContainer.innerHTML = `
                    <div class="col-span-full flex flex-col items-center text-center py-16 sm:py-20 text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 sm:w-20 sm:h-20 mb-4 sm:mb-6 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>
                        </svg>
                        <div class="text-lg sm:text-2xl font-extrabold text-slate-600 tracking-tight">შედეგი ვერ მოიძებნა</div>
                        <div class="text-sm font-medium text-slate-400 mt-2">სცადეთ სხვა საძიებო სიტყვა ან შეცვალეთ ფილტრები</div>
                    </div>`;
                if (loadMoreContainer) {
                    loadMoreContainer.classList.add('hidden');
                    loadMoreContainer.classList.remove('block');
                }
                return;
            }
            
            const startIndex = isLoadMore ? (searchCurrentPage - 1) * searchItemsPerPage : 0;
            const endIndex = searchCurrentPage * searchItemsPerPage;
            const paginatedProducts = filtered.slice(startIndex, endIndex);

            const html = paginatedProducts.map(p => createSearchCardHTML(p)).join('');

            if (isLoadMore) {
                searchContainer.insertAdjacentHTML('beforeend', html);
            } else {
                searchContainer.innerHTML = html;
            }

            if (loadMoreContainer) {
                if (filtered.length > endIndex) {
                    loadMoreContainer.classList.remove('hidden');
                    loadMoreContainer.classList.add('block');
                } else {
                    loadMoreContainer.classList.add('hidden');
                    loadMoreContainer.classList.remove('block');
                }
            }
        }

        if (minPriceInput) {
            minPriceInput.addEventListener('input', () => {
                let min = parseInt(minPriceInput.value, 10);
                let max = parseInt(maxPriceInput.value, 10);
                if (!isNaN(min) && !isNaN(max) && max !== 0) {
                    if (min > max) minPriceInput.value = max;
                }
                renderSearchResults();
            });
        }

        if (maxPriceInput) {
            maxPriceInput.addEventListener('input', () => {
                let min = parseInt(minPriceInput.value, 10);
                let max = parseInt(maxPriceInput.value, 10);
                if (!isNaN(min) && !isNaN(max)) {
                    if (max < min) maxPriceInput.value = min;
                }
                renderSearchResults();
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', () => renderSearchResults());
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                if (minPriceInput) minPriceInput.value = '';
                if (maxPriceInput) maxPriceInput.value = '';
                if (sortSelect) sortSelect.value = 'name-asc';
                const selVal = document.getElementById('selectedValue');
                if (selVal) selVal.textContent = 'დალაგება';
                renderSearchResults();
            });
        }

        const selectTrigger = document.getElementById('selectTrigger');
        const selectOptions = document.getElementById('selectOptions');
        const selectArrow = selectTrigger ? selectTrigger.querySelector('.select-arrow-svg') : null;

        if (selectTrigger && selectOptions) {
            selectTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                selectOptions.classList.toggle('hidden');
                if (selectArrow) selectArrow.classList.toggle('rotate-180');
            });

            document.querySelectorAll('.select-option').forEach(option => {
                option.addEventListener('click', () => {
                    const value = option.dataset.value;
                    const selVal = document.getElementById('selectedValue');
                    if (selVal) selVal.textContent = option.textContent;
                    if (sortSelect) {
                        sortSelect.value = value;
                        sortSelect.dispatchEvent(new Event('change'));
                    }
                    selectOptions.classList.add('hidden');
                    if (selectArrow) selectArrow.classList.remove('rotate-180');
                });
            });

            document.addEventListener('click', () => {
                selectOptions.classList.add('hidden');
                if (selectArrow) selectArrow.classList.remove('rotate-180');
            });
        }

        fetch('https://api.enkaelectronics.com.ge/catalog')
            .then(res => res.json())
            .then(data => {
                const rawProducts = Array.isArray(data) ? data : (data.products || []);
                searchProductsData = rawProducts.map(p => ({
                    ...p,
                    priceValue: parseInt(String(p.price || '').replace(/[^0-9]/g, ''), 10) || 0
                }));
                renderSearchResults();
            })
            .catch(err => {
                console.error(err);
                searchContainer.innerHTML = `
                    <div class="col-span-full flex flex-col items-center text-center py-16 sm:py-20 text-slate-400">
                        <div class="text-lg sm:text-2xl font-extrabold text-slate-600">შეცდომა მონაცემების ჩატვირთვისას</div>
                    </div>`;
            });
    });
})();
