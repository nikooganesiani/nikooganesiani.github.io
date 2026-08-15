document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('catalogContainer');
    if (!container) return;

    function getRouteParams() {
        const params = new URLSearchParams(window.location.search);
        const reservedKeys = new Set(['sub', 'search', 'sort', 'min', 'max', 'page', 'category', 'order']);
        
        let category = params.get('category') || '';
        
        if (!category) {
            for (const key of params.keys()) {
                if (!reservedKeys.has(key) && key.trim() !== '') {
                    category = key.trim();
                    break;
                }
            }
        }

        return {
            category: category || 'all',
            sub: params.get('sub') || 'all',
            search: params.get('search') || ''
        };
    }

    const { category: currentCategory, sub: currentSubcategory, search: currentSearch } = getRouteParams();

    function updateBreadcrumbs() {
        const breadcrumbLabel = document.getElementById('breadcrumbCategoryName');
        const breadcrumbsList = document.getElementById('categoryBreadcrumbsList');
        if (!breadcrumbLabel || !breadcrumbsList) return;

        if (currentCategory === 'all' && !currentSearch) {
            breadcrumbLabel.textContent = 'ყველა პროდუქტი';
            return;
        }

        if (currentSearch) {
            breadcrumbLabel.textContent = `ძიება: "${currentSearch}"`;
            return;
        }

        const catData = window.CATALOG_STRUCTURE ? window.CATALOG_STRUCTURE[currentCategory] : null;
        const categoryTitle = catData?.title || currentCategory;

        if (currentSubcategory === 'all') {
            breadcrumbLabel.textContent = categoryTitle;
        } else {
            let subTitle = currentSubcategory;
            if (catData && catData.subs) {
                const subObj = catData.subs.find(s => String(s.id).toLowerCase() === String(currentSubcategory).toLowerCase());
                if (subObj) subTitle = subObj.name;
            }

            breadcrumbsList.innerHTML = `
                <li class="inline-flex items-center text-[0.85rem] font-bold text-slate-500 whitespace-nowrap shrink-0">
                    <a href="/" aria-label="მთავარი" draggable="false" class="flex items-center gap-1 text-slate-600 hover:text-blue-600 transition-colors outline-none no-underline">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                        <span class="max-sm:hidden">მთავარი</span>
                    </a>
                </li>
                <li class="flex items-center shrink-0 text-slate-300">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
                </li>
                <li class="inline-flex items-center text-[0.85rem] font-bold text-slate-500 whitespace-nowrap shrink-0">
                    <a href="/category/?${encodeURIComponent(currentCategory)}" class="text-slate-600 hover:text-blue-600 transition-colors no-underline">${categoryTitle}</a>
                </li>
                <li class="flex items-center shrink-0 text-slate-300">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
                </li>
                <li class="flex-initial min-w-0 inline-flex items-center text-[0.85rem] font-bold text-slate-500 whitespace-nowrap">
                    <span class="text-slate-900 truncate">${subTitle}</span>
                </li>
            `;
        }
    }

    updateBreadcrumbs();

    let currentPage = 1;
    const itemsPerPage = 16;

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const minPriceInput = document.getElementById('minPrice');
    const maxPriceInput = document.getElementById('maxPrice');
    const sortSelect = document.getElementById('sortSelect');
    const resetBtn = document.getElementById('resetFilters');

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            renderCategoryProducts(true);
        });
    }

    function createCardHTML(p) {
        let imgs = p.images || (p.image ? [p.image] : []);
        imgs = imgs.filter(img => !img.includes('youtube.com') && !img.includes('youtu.be'));
        if (imgs.length === 0) imgs.push('/img/no-image.png');
        
        const hasMultipleImages = imgs.length > 1;
        let discountBadge = '';
        
        if (p.oldPrice) {
            const oldVal = parseInt(String(p.oldPrice).replace(/[^0-9]/g, ''), 10);
            const newVal = parseInt(String(p.price).replace(/[^0-9]/g, ''), 10);
            if (oldVal > newVal) {
                const percent = Math.round(((oldVal - newVal) / oldVal) * 100);
                discountBadge = `<div class="absolute top-2 left-2 sm:top-3 sm:left-3 bg-red-500 text-white px-1.5 py-1 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg text-[0.7rem] sm:text-xs font-extrabold z-10 shadow-md pointer-events-none">-${percent}%</div>`;
            }
        }
        
        const productDataAttr = JSON.stringify(p).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        
        let dotsHtml = '';
        if (hasMultipleImages) {
            dotsHtml = `<div class="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-10 pointer-events-none" id="dots-${p.id}">
                ${imgs.map((_, i) => `<div class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-slate-900/30 backdrop-blur-xs transition-all duration-300 dot ${i === 0 ? '!bg-blue-600 scale-125' : ''}"></div>`).join('')}
            </div>`;
        }

        return `
        <div class="product-card group bg-white rounded-2xl sm:rounded-[2rem] overflow-hidden shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col border border-slate-100 hover:border-slate-200 h-full w-full min-w-0 select-none">
            <div class="relative w-full aspect-square overflow-hidden bg-white rounded-t-2xl sm:rounded-t-[2rem] border-b border-slate-100">
                ${discountBadge}
                <div class="flex w-full h-full overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" id="track-${p.id}" onscroll="updateDots('${p.id}', this)">
                    ${imgs.map(img => `
                        <div class="shrink-0 w-full h-full snap-start flex items-center justify-center">
                            <a href="/product/${p.id}/" class="contents" draggable="false">
                                <img class="w-full h-full object-cover select-none" src="${img}" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.src='/img/no-image.png'" draggable="false">
                            </a>
                        </div>
                    `).join('')}
                </div>
                ${dotsHtml}
                ${hasMultipleImages ? `
                    <button type="button" class="hidden sm:flex absolute top-1/2 -translate-y-1/2 left-3 bg-white/95 border border-slate-100 w-9 h-9 rounded-full items-center justify-center cursor-pointer z-10 text-slate-900 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-white hover:scale-110 active:scale-90 transition-all duration-300 shadow-md outline-none" onclick="changeSlide('${p.id}', -1, event)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"></path></svg>
                    </button>
                    <button type="button" class="hidden sm:flex absolute top-1/2 -translate-y-1/2 right-3 bg-white/95 border border-slate-100 w-9 h-9 rounded-full items-center justify-center cursor-pointer z-10 text-slate-900 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-white hover:scale-110 active:scale-90 transition-all duration-300 shadow-md outline-none" onclick="changeSlide('${p.id}', 1, event)">
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

    window.updateDots = function(productId, trackEl) {
        const index = Math.round(trackEl.scrollLeft / trackEl.clientWidth);
        const dots = document.querySelectorAll(`#dots-${productId} .dot`);
        dots.forEach((d, i) => {
            if (i === index) {
                d.classList.add('!bg-blue-600', 'scale-125');
            } else {
                d.classList.remove('!bg-blue-600', 'scale-125');
            }
        });
    };

    window.changeSlide = function(productId, direction, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const track = document.getElementById(`track-${productId}`);
        if (!track) return;
        track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' });
    };

    function checkMatch(itemValues, targetSlug) {
        if (!targetSlug || targetSlug === 'all') return true;
        if (!itemValues) return false;
        if (Array.isArray(itemValues)) {
            return itemValues.some(val => String(val).trim().toLowerCase() === targetSlug.trim().toLowerCase());
        }
        return String(itemValues).trim().toLowerCase() === targetSlug.trim().toLowerCase();
    }

    function renderCategoryProducts(isLoadMore = false) {
        if (!isLoadMore) currentPage = 1;

        const products = window.allProducts || [];
        let filtered = [...products];
        
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

        if (currentCategory !== 'all') {
            filtered = filtered.filter(p => checkMatch(p.categories || p.category, currentCategory));
        }

        if (currentSubcategory !== 'all') {
            filtered = filtered.filter(p => checkMatch(p.subcategories || p.subcategory || p.sub, currentSubcategory));
        }

        if (currentSearch) {
            const normalizedSearch = window.normalizeQuery ? window.normalizeQuery(currentSearch) : currentSearch.toLowerCase();
            filtered = filtered.filter(p => {
                const targetText = window.normalizeQuery ? window.normalizeQuery(p.name || '') : (p.name || '').toLowerCase();
                return targetText.includes(normalizedSearch);
            });
        }

        if (!isNaN(minVal)) filtered = filtered.filter(p => p.priceValue >= minVal);
        if (!isNaN(maxVal)) filtered = filtered.filter(p => p.priceValue <= maxVal);
        
        const sortBy = sortSelect ? sortSelect.value : 'name-asc';
        if (sortBy === 'name-asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ka'));
        if (sortBy === 'name-desc') filtered.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'ka'));
        if (sortBy === 'price-asc') filtered.sort((a, b) => a.priceValue - b.priceValue);
        if (sortBy === 'price-desc') filtered.sort((a, b) => b.priceValue - a.priceValue);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="col-span-full flex flex-col items-center text-center py-16 sm:py-20 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 sm:w-20 sm:h-20 mb-4 sm:mb-6 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>
                    </svg>
                    <div class="text-lg sm:text-2xl font-extrabold text-slate-600 tracking-tight">პროდუქტები ვერ მოიძებნა</div>
                    <div class="text-sm font-medium text-slate-400 mt-2">სცადეთ სხვა ფილტრები</div>
                </div>`;
            if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
            return;
        }
        
        const startIndex = isLoadMore ? (currentPage - 1) * itemsPerPage : 0;
        const endIndex = currentPage * itemsPerPage;
        const paginatedProducts = filtered.slice(startIndex, endIndex);

        const html = paginatedProducts.map(p => createCardHTML(p)).join('');

        if (isLoadMore) {
            container.insertAdjacentHTML('beforeend', html);
        } else {
            container.innerHTML = html;
        }

        if (loadMoreContainer) {
            if (filtered.length > endIndex) {
                loadMoreContainer.classList.remove('hidden');
            } else {
                loadMoreContainer.classList.add('hidden');
            }
        }
    }

    if (minPriceInput) {
        minPriceInput.addEventListener('input', () => {
            let min = parseInt(minPriceInput.value, 10);
            let max = parseInt(maxPriceInput.value, 10);
            if (!isNaN(min) && !isNaN(max) && max !== 0 && min > max) {
                minPriceInput.value = max;
            }
            renderCategoryProducts();
        });
    }

    if (maxPriceInput) {
        maxPriceInput.addEventListener('input', () => {
            let min = parseInt(minPriceInput.value, 10);
            let max = parseInt(maxPriceInput.value, 10);
            if (!isNaN(min) && !isNaN(max) && max < min) {
                maxPriceInput.value = min;
            }
            renderCategoryProducts();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => renderCategoryProducts());
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (minPriceInput) minPriceInput.value = '';
            if (maxPriceInput) maxPriceInput.value = '';
            if (sortSelect) sortSelect.value = 'name-asc';
            const selVal = document.getElementById('selectedValue');
            if (selVal) selVal.textContent = 'დალაგება';
            renderCategoryProducts();
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

    const fetchPromise = window.fetchCatalogCached ? window.fetchCatalogCached() : fetch('https://api.enkaelectronics.com.ge/catalog').then(r => r.json());

    fetchPromise
        .then(data => {
            const rawList = Array.isArray(data) ? data : (data.products || []);
            window.allProducts = rawList.map(p => ({
                ...p,
                priceValue: parseInt(String(p.price || '').replace(/[^0-9]/g, ''), 10) || 0
            }));
            renderCategoryProducts();
        })
        .catch(err => {
            console.error(err);
            if (container) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-12 text-slate-400 font-semibold">
                        დაფიქსირდა შეცდომა მონაცემების ჩატვირთვისას
                    </div>`;
            }
        });
});
