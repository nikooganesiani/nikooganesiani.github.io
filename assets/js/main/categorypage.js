document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('catalogContainer');
    if (!container) return;

    // Элементы интерфейса
    const categoryMainTitle = document.getElementById('categoryMainTitle');
    const productCountBadge = document.getElementById('productCountBadge');
    const subcategoryPillsWrapper = document.getElementById('subcategoryPillsWrapper');
    const subcategoryPills = document.getElementById('subcategoryPills');

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const paginationCounterText = document.getElementById('paginationCounterText');
    const paginationProgressBar = document.getElementById('paginationProgressBar');

    const minPriceInput = document.getElementById('minPrice');
    const maxPriceInput = document.getElementById('maxPrice');
    const mobileMinPrice = document.getElementById('mobileMinPrice');
    const mobileMaxPrice = document.getElementById('mobileMaxPrice');
    const mobileFilterDot = document.getElementById('mobileFilterDot');

    const sortSelect = document.getElementById('sortSelect');
    const resetBtn = document.getElementById('resetFilters');
    const presetButtons = document.querySelectorAll('.price-preset-btn');

    let currentPage = 1;
    const itemsPerPage = 16;
    let priceDebounceTimer = null;

    // 1. Чтение параметров из URL
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
            search: params.get('search') || '',
            min: params.get('min') || '',
            max: params.get('max') || '',
            sort: params.get('sort') || 'default'
        };
    }

    let state = getRouteParams();

    // Инициализация значений из URL
    if (minPriceInput && state.min) minPriceInput.value = state.min;
    if (maxPriceInput && state.max) maxPriceInput.value = state.max;
    if (mobileMinPrice && state.min) mobileMinPrice.value = state.min;
    if (mobileMaxPrice && state.max) mobileMaxPrice.value = state.max;
    if (sortSelect && state.sort) {
        sortSelect.value = state.sort;
        const activeOption = document.querySelector(`.select-option[data-value="${state.sort}"]`);
        const selVal = document.getElementById('selectedValue');
        if (activeOption && selVal && state.sort !== 'default') {
            selVal.textContent = activeOption.textContent.trim();
        }
    }

    // 2. Синхронизация состояния с адресной строкой браузера (без перезагрузки)
    function syncUrlState() {
        const params = new URLSearchParams();
        if (state.category && state.category !== 'all') {
            params.set(state.category, '');
        }
        if (state.sub && state.sub !== 'all') params.set('sub', state.sub);
        if (state.search) params.set('search', state.search);
        if (minPriceInput && minPriceInput.value) params.set('min', minPriceInput.value);
        if (maxPriceInput && maxPriceInput.value) params.set('max', maxPriceInput.value);
        if (sortSelect && sortSelect.value !== 'default') params.set('sort', sortSelect.value);

        const queryStr = params.toString().replace(/=(&|$)/g, '$1');
        const newUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
    }

    // 3. Обновление хлебных крошек, заголовка H1 и пилюль подкатегорий
    function updateHeaderAndNavigation() {
        const breadcrumbsList = document.getElementById('categoryBreadcrumbsList');
        const catData = (window.CATALOG_STRUCTURE && state.category !== 'all') 
            ? window.CATALOG_STRUCTURE[state.category] 
            : null;
        const categoryTitle = catData?.title || state.category;

        let pageHeading = 'ყველა პროდუქტი';

        if (state.search) {
            pageHeading = `ძიება: "${state.search}"`;
        } else if (state.category !== 'all') {
            if (state.sub === 'all') {
                pageHeading = categoryTitle;
            } else {
                const subObj = catData?.subs?.find(s => String(s.id).toLowerCase() === String(state.sub).toLowerCase());
                pageHeading = subObj ? subObj.name : state.sub;
            }
        }

        if (categoryMainTitle) categoryMainTitle.textContent = pageHeading;

        // Хлебные крошки
        if (breadcrumbsList) {
            const homeCrumb = `
                <li class="inline-flex items-center whitespace-nowrap shrink-0">
                    <a href="/" aria-label="მთავარი" draggable="false" class="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 transition-colors outline-none no-underline">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                        <span class="max-sm:hidden">მთავარი</span>
                    </a>
                </li>
                <li class="flex items-center shrink-0 text-slate-300">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
                </li>`;

            if (state.category !== 'all' && state.sub !== 'all' && !state.search) {
                breadcrumbsList.innerHTML = `
                    ${homeCrumb}
                    <li class="inline-flex items-center whitespace-nowrap shrink-0">
                        <a href="/category/?${encodeURIComponent(state.category)}" data-sub-switch="all" class="text-slate-500 hover:text-blue-600 transition-colors no-underline">${categoryTitle}</a>
                    </li>
                    <li class="flex items-center shrink-0 text-slate-300">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
                    </li>
                    <li class="flex-initial min-w-0 inline-flex items-center whitespace-nowrap">
                        <span id="breadcrumbCategoryName" class="text-slate-900 font-bold truncate">${pageHeading}</span>
                    </li>`;
            } else {
                breadcrumbsList.innerHTML = `
                    ${homeCrumb}
                    <li class="flex-initial min-w-0 inline-flex items-center whitespace-nowrap">
                        <span id="breadcrumbCategoryName" class="text-slate-900 font-bold truncate">${pageHeading}</span>
                    </li>`;
            }
        }

        // Генерация пилюль подкатегорий
        if (subcategoryPillsWrapper && subcategoryPills) {
            if (catData && Array.isArray(catData.subs) && catData.subs.length > 0 && !state.search) {
                subcategoryPillsWrapper.classList.remove('hidden');
                const allActive = state.sub === 'all';
                
                let pillsHTML = `
                    <button type="button" data-sub-pill="all" class="shrink-0 px-4 py-2 rounded-full text-xs sm:text-[13px] font-bold transition-all cursor-pointer ${
                        allActive 
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25' 
                            : 'bg-white text-slate-600 border border-slate-200/80 hover:border-slate-300 hover:text-slate-900'
                    }">
                        ყველა
                    </button>`;

                pillsHTML += catData.subs.map(s => {
                    const isActive = String(s.id).toLowerCase() === String(state.sub).toLowerCase();
                    return `
                        <button type="button" data-sub-pill="${s.id}" class="shrink-0 px-4 py-2 rounded-full text-xs sm:text-[13px] font-bold transition-all cursor-pointer ${
                            isActive 
                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25' 
                                : 'bg-white text-slate-600 border border-slate-200/80 hover:border-slate-300 hover:text-slate-900'
                        }">
                            ${s.name}
                        </button>`;
                }).join('');

                subcategoryPills.innerHTML = pillsHTML;
            } else {
                subcategoryPillsWrapper.classList.add('hidden');
            }
        }
    }

    // Обработка клика по пилюлям подкатегорий (SPA-переход без перезагрузки)
    document.addEventListener('click', (e) => {
        const pill = e.target.closest('[data-sub-pill], [data-sub-switch]');
        if (!pill) return;
        e.preventDefault();
        const targetSub = pill.dataset.subPill || pill.dataset.subSwitch || 'all';
        if (state.sub === targetSub) return;

        state.sub = targetSub;
        updateHeaderAndNavigation();
        syncUrlState();
        renderCategoryProducts(false);
    });

    function checkMatch(itemValues, targetSlug) {
        if (!targetSlug || targetSlug === 'all') return true;
        if (!itemValues) return false;
        if (Array.isArray(itemValues)) {
            return itemValues.some(val => String(val).trim().toLowerCase() === targetSlug.trim().toLowerCase());
        }
        return String(itemValues).trim().toLowerCase() === targetSlug.trim().toLowerCase();
    }

    // Подсветка активного пресета цены
    function updateActivePresetUI(minStr, maxStr) {
        presetButtons.forEach(btn => {
            const bMin = btn.dataset.min || '';
            const bMax = btn.dataset.max || '';
            if (bMin === minStr && bMax === maxStr && (minStr !== '' || maxStr !== '')) {
                btn.classList.add('!bg-blue-600', '!text-white');
            } else {
                btn.classList.remove('!bg-blue-600', '!text-white');
            }
        });
    }

    // 4. Основная функция фильтрации и рендера товаров
    function renderCategoryProducts(isLoadMore = false) {
        if (!isLoadMore) currentPage = 1;

        const products = window.allProducts || [];
        let filtered = [...products];

        const rawMin = minPriceInput && minPriceInput.value !== '' ? parseInt(minPriceInput.value, 10) : NaN;
        const rawMax = maxPriceInput && maxPriceInput.value !== '' ? parseInt(maxPriceInput.value, 10) : NaN;

        // Умная обработка диапазона: если пользователь ввел min > max, просто меняем границы местами при фильтрации, не ломая поле ввода
        let effectiveMin = rawMin;
        let effectiveMax = rawMax;
        if (!isNaN(rawMin) && !isNaN(rawMax) && rawMin > rawMax) {
            effectiveMin = rawMax;
            effectiveMax = rawMin;
        }

        const hasPriceFilter = (minPriceInput && minPriceInput.value !== '') || (maxPriceInput && maxPriceInput.value !== '');
        const hasSortFilter = sortSelect && sortSelect.value !== 'default';

        // Показ кнопки сброса и индикатора на мобильном
        if (resetBtn) {
            if (hasPriceFilter || hasSortFilter) {
                resetBtn.classList.remove('hidden');
                resetBtn.classList.add('inline-flex');
            } else {
                resetBtn.classList.add('hidden');
                resetBtn.classList.remove('inline-flex');
            }
        }
        if (mobileFilterDot) {
            mobileFilterDot.classList.toggle('hidden', !hasPriceFilter);
        }

        updateActivePresetUI(minPriceInput?.value || '', maxPriceInput?.value || '');

        // Фильтрация
        filtered = filtered.filter(p => p.stockStatus !== 'out_of_stock');

        if (state.category !== 'all') {
            filtered = filtered.filter(p => checkMatch(p.categories || p.category, state.category));
        }

        if (state.sub !== 'all') {
            filtered = filtered.filter(p => checkMatch(p.subcategories || p.subcategory || p.sub, state.sub));
        }

        if (state.search) {
            const normalizedSearch = window.normalizeQuery ? window.normalizeQuery(state.search) : state.search.toLowerCase();
            filtered = filtered.filter(p => {
                const targetText = window.normalizeQuery ? window.normalizeQuery(p.name || '') : (p.name || '').toLowerCase();
                return targetText.includes(normalizedSearch);
            });
        }

        if (!isNaN(effectiveMin)) filtered = filtered.filter(p => p.priceValue >= effectiveMin);
        if (!isNaN(effectiveMax)) filtered = filtered.filter(p => p.priceValue <= effectiveMax);

        // Сортировка
        const sortBy = sortSelect ? sortSelect.value : 'default';
        if (sortBy === 'name-asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ka'));
        if (sortBy === 'name-desc') filtered.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'ka'));
        if (sortBy === 'price-asc') filtered.sort((a, b) => a.priceValue - b.priceValue);
        if (sortBy === 'price-desc') filtered.sort((a, b) => b.priceValue - a.priceValue);

        // Обновление счетчика в заголовке
        if (productCountBadge) {
            productCountBadge.textContent = `${filtered.length} პროდუქტი`;
        }

        // Пустое состояние (Empty State)
        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="col-span-full w-full flex flex-col items-center justify-center text-center py-16 sm:py-24 px-4 bg-white rounded-3xl border border-slate-100">
                    <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>
                        </svg>
                    </div>
                    <div class="text-lg sm:text-xl font-extrabold text-slate-800 tracking-tight">პროდუქტები ვერ მოიძებნა</div>
                    <p class="text-xs sm:text-sm font-medium text-slate-400 mt-1.5 max-w-xs">სცადეთ შეცვალოთ ფასის დიაპაზონი ან გაასუფთაოთ ფილტრი</p>
                    <button type="button" id="emptyResetBtn" class="mt-5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer">
                        ფილტრის გასუფთავება
                    </button>
                </div>`;
            if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
            
            const emptyReset = document.getElementById('emptyResetBtn');
            if (emptyReset && resetBtn) {
                emptyReset.addEventListener('click', () => resetBtn.click());
            }
            return;
        }

        const startIndex = isLoadMore ? (currentPage - 1) * itemsPerPage : 0;
        const endIndex = Math.min(currentPage * itemsPerPage, filtered.length);
        const paginatedProducts = filtered.slice(startIndex, endIndex);

        if (typeof window.createProductCardHTML === 'function') {
            const html = paginatedProducts.map(p => window.createProductCardHTML(p, 'cat')).join('');
            if (isLoadMore) {
                container.insertAdjacentHTML('beforeend', html);
            } else {
                container.innerHTML = html;
            }
        }

        // Обновление прогресс-бара и кнопки «Показать еще»
        if (loadMoreContainer) {
            if (filtered.length > endIndex) {
                loadMoreContainer.classList.remove('hidden');
                if (paginationCounterText) {
                    paginationCounterText.textContent = `ნაჩვენებია ${endIndex} პროდუქტი ${filtered.length}-დან`;
                }
                if (paginationProgressBar) {
                    const percent = Math.round((endIndex / filtered.length) * 100);
                    paginationProgressBar.style.width = `${percent}%`;
                }
            } else {
                loadMoreContainer.classList.add('hidden');
            }
        }
    }

    // 5. Обработчики событий фильтра цены (с Debounce 300ms)
    function handlePriceChange(source) {
        if (source === 'mobile') {
            if (minPriceInput && mobileMinPrice) minPriceInput.value = mobileMinPrice.value;
            if (maxPriceInput && mobileMaxPrice) maxPriceInput.value = mobileMaxPrice.value;
        } else {
            if (mobileMinPrice && minPriceInput) mobileMinPrice.value = minPriceInput.value;
            if (mobileMaxPrice && maxPriceInput) mobileMaxPrice.value = maxPriceInput.value;
        }

        clearTimeout(priceDebounceTimer);
        priceDebounceTimer = setTimeout(() => {
            syncUrlState();
            renderCategoryProducts(false);
        }, 300);
    }

    if (minPriceInput) minPriceInput.addEventListener('input', () => handlePriceChange('desktop'));
    if (maxPriceInput) maxPriceInput.addEventListener('input', () => handlePriceChange('desktop'));
    if (mobileMinPrice) mobileMinPrice.addEventListener('input', () => handlePriceChange('mobile'));
    if (mobileMaxPrice) mobileMaxPrice.addEventListener('input', () => handlePriceChange('mobile'));

    // Кнопки быстрых пресетов цены (< 50, 50-150, 150+)
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetMin = btn.dataset.min || '';
            const targetMax = btn.dataset.max || '';

            // Повторный клик по активному пресету снимает его
            const isSame = (minPriceInput?.value || '') === targetMin && (maxPriceInput?.value || '') === targetMax;
            const newMin = isSame ? '' : targetMin;
            const newMax = isSame ? '' : targetMax;

            if (minPriceInput) minPriceInput.value = newMin;
            if (maxPriceInput) maxPriceInput.value = newMax;
            if (mobileMinPrice) mobileMinPrice.value = newMin;
            if (mobileMaxPrice) mobileMaxPrice.value = newMax;

            syncUrlState();
            renderCategoryProducts(false);
        });
    });

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            renderCategoryProducts(true);
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            syncUrlState();
            renderCategoryProducts(false);
        });
    }

    function resetAllFilters() {
        if (minPriceInput) minPriceInput.value = '';
        if (maxPriceInput) maxPriceInput.value = '';
        if (mobileMinPrice) mobileMinPrice.value = '';
        if (mobileMaxPrice) mobileMaxPrice.value = '';
        if (sortSelect) sortSelect.value = 'default';
        const selVal = document.getElementById('selectedValue');
        if (selVal) selVal.textContent = 'დალაგება';
        syncUrlState();
        renderCategoryProducts(false);
    }

    if (resetBtn) resetBtn.addEventListener('click', resetAllFilters);

    // 6. Кастомный селект сортировки
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
                if (selVal) selVal.textContent = value === 'default' ? 'დალაგება' : option.textContent.trim();
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

    // 7. Мобильная шторка фильтров (iOS Bottom Sheet)
    const mobileFilterBtn = document.getElementById('mobileFilterBtn');
    const mobileFilterModal = document.getElementById('mobileFilterModal');
    const mobileFilterBackdrop = document.getElementById('mobileFilterBackdrop');
    const mobileFilterSheet = document.getElementById('mobileFilterSheet');
    const closeMobileFilter = document.getElementById('closeMobileFilter');
    const mobileApplyBtn = document.getElementById('mobileApplyBtn');
    const mobileResetBtn = document.getElementById('mobileResetBtn');

    function openFilterSheet() {
        if (!mobileFilterModal) return;
        mobileFilterModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
            mobileFilterBackdrop?.classList.remove('opacity-0');
            mobileFilterSheet?.classList.remove('translate-y-full');
        });
    }

    function closeFilterSheet() {
        if (!mobileFilterModal) return;
        mobileFilterBackdrop?.classList.add('opacity-0');
        mobileFilterSheet?.classList.add('translate-y-full');
        document.body.style.overflow = '';
        setTimeout(() => {
            mobileFilterModal.classList.add('hidden');
        }, 300);
    }

    if (mobileFilterBtn) mobileFilterBtn.addEventListener('click', openFilterSheet);
    if (closeMobileFilter) closeMobileFilter.addEventListener('click', closeFilterSheet);
    if (mobileFilterBackdrop) mobileFilterBackdrop.addEventListener('click', closeFilterSheet);
    if (mobileApplyBtn) mobileApplyBtn.addEventListener('click', closeFilterSheet);
    if (mobileResetBtn) {
        mobileResetBtn.addEventListener('click', () => {
            resetAllFilters();
            closeFilterSheet();
        });
    }

    // 8. Переключатель вида сетки на мобильных (2 колонки <-> 1 колонка)
    const gridToggleBtn = document.getElementById('gridToggleBtn');
    const gridIconCompact = document.getElementById('gridIconCompact');
    const gridIconSingle = document.getElementById('gridIconSingle');
    let isSingleColumnMobile = false;

    if (gridToggleBtn) {
        gridToggleBtn.addEventListener('click', () => {
            isSingleColumnMobile = !isSingleColumnMobile;
            container.classList.toggle('grid-cols-2', !isSingleColumnMobile);
            container.classList.toggle('grid-cols-1', isSingleColumnMobile);
            gridIconCompact?.classList.toggle('hidden', isSingleColumnMobile);
            gridIconSingle?.classList.toggle('hidden', !isSingleColumnMobile);
        });
    }

    // Первичная отрисовка заголовка и загрузка каталога
    updateHeaderAndNavigation();

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
            updateHeaderAndNavigation();
            renderCategoryProducts(false);
        })
        .catch(err => {
            console.error(err);
            if (container) {
                container.innerHTML = `
                    <div class="col-span-full w-full text-center py-16 text-slate-400 font-semibold">
                        დაფიქსირდა შეცდომა მონაცემების ჩატვირთვისას
                    </div>`;
            }
        });
});
