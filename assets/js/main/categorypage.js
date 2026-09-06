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
                <div class="w-full flex flex-col items-center text-center py-16 sm:py-20 text-slate-400">
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

        if (typeof window.createProductCardHTML === 'function') {
            const html = paginatedProducts.map(p => window.createProductCardHTML(p, 'cat')).join('');

            if (isLoadMore) {
                container.insertAdjacentHTML('beforeend', html);
            } else {
                container.innerHTML = html;
            }
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

    const apiUrl = window.CATALOG_API_URL || 'https://api.enkaelectronics.com.ge/catalog';
    const fetchPromise = window.fetchCatalogCached ? window.fetchCatalogCached() : fetch(apiUrl).then(r => {
        if (!r.ok) throw new Error('Catalog fetch error');
        return r.json();
    });

    fetchPromise
        .then(data => {
            const rawList = (data && data.products) ? data.products : (Array.isArray(data) ? data : []);
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
                    <div class="w-full text-center py-12 text-slate-400 font-semibold">
                        დაფიქსირდა შეცდომა მონაცემების ჩატვირთვისას
                    </div>`;
            }
        });
});