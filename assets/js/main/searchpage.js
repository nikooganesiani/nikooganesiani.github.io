(function() {
    document.addEventListener('DOMContentLoaded', () => {
        const searchContainer = document.getElementById('searchResultsGrid');
        if (!searchContainer) return;

        const urlParams = new URLSearchParams(window.location.search);
        const queryKey = urlParams.has('result') ? 'result' : (urlParams.has('q') ? 'q' : 'search');
        const searchQ = (urlParams.get('result') || urlParams.get('search') || urlParams.get('q') || '').trim();

        const queryDisplay = document.getElementById('searchQueryDisplay');
        const countDisplay = document.getElementById('searchResultCount');
        const countDot = document.getElementById('searchCountDot');
        const filtersBar = document.getElementById('filtersBar');

        const categoryPillsWrapper = document.getElementById('searchCategoryPillsWrapper');
        const categoryPills = document.getElementById('searchCategoryPills');
        const searchScrollLeft = document.getElementById('searchScrollLeft');
        const searchScrollRight = document.getElementById('searchScrollRight');

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

        // Переносим мобильное модальное окно в корень body, чтобы нижнее меню его не перекрывало
        const mobileFilterModal = document.getElementById('mobileFilterModal');
        if (mobileFilterModal && mobileFilterModal.parentElement !== document.body) {
            document.body.appendChild(mobileFilterModal);
        }

        // Если поисковый запрос пустой
        if (!searchQ) {
            if (queryDisplay) queryDisplay.textContent = '';
            if (countDisplay) countDisplay.textContent = '0 პროდუქტი';
            if (filtersBar) filtersBar.classList.add('hidden');
            searchContainer.innerHTML = `
                <div class="col-span-full w-full flex flex-col items-center justify-center text-center py-16 sm:py-24 px-4 bg-white rounded-3xl">
                    <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                        </svg>
                    </div>
                    <div class="text-lg sm:text-xl font-extrabold text-slate-800 tracking-tight">შეიყვანეთ საძიებო სიტყვა</div>
                    <p class="text-xs sm:text-sm font-medium text-slate-400 mt-1.5 max-w-xs">მოძებნეთ სასურველი ტექნიკა დასახელებით ან მოდელით</p>
                </div>`;
            return;
        }

        if (queryDisplay) queryDisplay.textContent = `"${searchQ}"`;

        let searchCurrentPage = 1;
        const searchItemsPerPage = 16;
        let baseMatchedProducts = [];
        let selectedCategory = urlParams.get('cat') || 'all';
        let priceDebounceTimer = null;

        // Инициализация фильтров из URL
        const initMin = urlParams.get('min') || '';
        const initMax = urlParams.get('max') || '';
        const initSort = urlParams.get('sort') || 'default';

        if (minPriceInput && initMin) minPriceInput.value = initMin;
        if (maxPriceInput && initMax) maxPriceInput.value = initMax;
        if (mobileMinPrice && initMin) mobileMinPrice.value = initMin;
        if (mobileMaxPrice && initMax) mobileMaxPrice.value = initMax;
        if (sortSelect && initSort) {
            sortSelect.value = initSort;
            const activeOption = document.querySelector(`.select-option[data-value="${initSort}"]`);
            const selVal = document.getElementById('selectedValue');
            if (activeOption && selVal && initSort !== 'default') {
                selVal.textContent = activeOption.textContent.trim();
            }
        }

        // Синхронизация параметров с URL
        function syncUrlState() {
            const params = new URLSearchParams();
            params.set(queryKey, searchQ);
            if (selectedCategory !== 'all') params.set('cat', selectedCategory);
            if (minPriceInput && minPriceInput.value) params.set('min', minPriceInput.value);
            if (maxPriceInput && maxPriceInput.value) params.set('max', maxPriceInput.value);
            if (sortSelect && sortSelect.value !== 'default') params.set('sort', sortSelect.value);

            window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
        }

        // Стрелки прокрутки категорий на ПК
        function updateCategoryArrows() {
            if (!categoryPills || !searchScrollLeft || !searchScrollRight) return;
            const { scrollLeft, scrollWidth, clientWidth } = categoryPills;
            const canScrollLeft = scrollLeft > 4;
            const canScrollRight = scrollLeft + clientWidth < scrollWidth - 4;

            searchScrollLeft.classList.toggle('md:flex', canScrollLeft);
            searchScrollLeft.classList.toggle('!hidden', !canScrollLeft);

            searchScrollRight.classList.toggle('md:flex', canScrollRight);
            searchScrollRight.classList.toggle('!hidden', !canScrollRight);
        }

        if (categoryPills) {
            categoryPills.addEventListener('scroll', updateCategoryArrows, { passive: true });
            window.addEventListener('resize', updateCategoryArrows);
        }
        if (searchScrollLeft && categoryPills) {
            searchScrollLeft.addEventListener('click', () => {
                categoryPills.scrollBy({ left: -260, behavior: 'smooth' });
            });
        }
        if (searchScrollRight && categoryPills) {
            searchScrollRight.addEventListener('click', () => {
                categoryPills.scrollBy({ left: 260, behavior: 'smooth' });
            });
        }

        function normalizeText(str) {
            if (!str) return '';
            return window.normalizeQuery ? window.normalizeQuery(String(str)) : String(str).toLowerCase();
        }

        function getProductCategories(p) {
            const raw = p.categories || p.category;
            if (!raw) return [];
            return Array.isArray(raw) ? raw.map(c => String(c).trim()) : [String(raw).trim()];
        }

        // Генерация пилюль категорий по найденным товарам
        function renderCategoryPills() {
            if (!categoryPillsWrapper || !categoryPills) return;

            const counts = {};
            baseMatchedProducts.forEach(p => {
                getProductCategories(p).forEach(catSlug => {
                    if (!catSlug) return;
                    counts[catSlug] = (counts[catSlug] || 0) + 1;
                });
            });

            const catKeys = Object.keys(counts);
            if (catKeys.length <= 1) {
                categoryPillsWrapper.classList.add('hidden');
                return;
            }

            categoryPillsWrapper.classList.remove('hidden');
            const isAll = selectedCategory === 'all';

            let html = `
                <button type="button" data-search-cat="all" class="shrink-0 px-4 py-2 rounded-full text-xs sm:text-[13px] font-bold transition-all cursor-pointer ${
                    isAll ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }">
                    ყველა (${baseMatchedProducts.length})
                </button>`;

            html += catKeys.map(slug => {
                const isActive = String(slug).toLowerCase() === String(selectedCategory).toLowerCase();
                const title = (window.CATALOG_STRUCTURE && window.CATALOG_STRUCTURE[slug]?.title) || slug;
                return `
                    <button type="button" data-search-cat="${slug}" class="shrink-0 px-4 py-2 rounded-full text-xs sm:text-[13px] font-bold transition-all cursor-pointer ${
                        isActive ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }">
                        ${title} (${counts[slug]})
                    </button>`;
            }).join('');

            categoryPills.innerHTML = html;
            requestAnimationFrame(updateCategoryArrows);
        }

        document.addEventListener('click', (e) => {
            const pill = e.target.closest('[data-search-cat]');
            if (!pill) return;
            const targetCat = pill.dataset.searchCat || 'all';
            if (selectedCategory === targetCat) return;

            selectedCategory = targetCat;
            renderCategoryPills();
            syncUrlState();
            renderSearchResults(false);
        });

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

        // Основной рендер результатов поиска
        function renderSearchResults(isLoadMore = false) {
            if (!isLoadMore) searchCurrentPage = 1;

            let filtered = [...baseMatchedProducts];

            if (selectedCategory !== 'all') {
                filtered = filtered.filter(p => 
                    getProductCategories(p).some(c => c.toLowerCase() === selectedCategory.toLowerCase())
                );
            }

            const rawMin = minPriceInput && minPriceInput.value !== '' ? parseInt(minPriceInput.value, 10) : NaN;
            const rawMax = maxPriceInput && maxPriceInput.value !== '' ? parseInt(maxPriceInput.value, 10) : NaN;

            let effectiveMin = rawMin;
            let effectiveMax = rawMax;
            if (!isNaN(rawMin) && !isNaN(rawMax) && rawMin > rawMax) {
                effectiveMin = rawMax;
                effectiveMax = rawMin;
            }

            const hasPriceFilter = (minPriceInput && minPriceInput.value !== '') || (maxPriceInput && maxPriceInput.value !== '');
            const hasSortFilter = sortSelect && sortSelect.value !== 'default';
            const hasCatFilter = selectedCategory !== 'all';

            if (resetBtn) {
                if (hasPriceFilter || hasSortFilter || hasCatFilter) {
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

            if (!isNaN(effectiveMin)) filtered = filtered.filter(p => p.priceValue >= effectiveMin);
            if (!isNaN(effectiveMax)) filtered = filtered.filter(p => p.priceValue <= effectiveMax);

            const sortBy = sortSelect ? sortSelect.value : 'default';
            if (sortBy === 'default') {
                filtered.sort((a, b) => (b._relevance || 0) - (a._relevance || 0));
            } else if (sortBy === 'name-asc') {
                filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ka'));
            } else if (sortBy === 'name-desc') {
                filtered.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'ka'));
            } else if (sortBy === 'price-asc') {
                filtered.sort((a, b) => a.priceValue - b.priceValue);
            } else if (sortBy === 'price-desc') {
                filtered.sort((a, b) => b.priceValue - a.priceValue);
            }

            if (countDisplay) countDisplay.textContent = `${filtered.length} პროდუქტი`;

            if (filtered.length === 0) {
                const hasActiveFilters = hasPriceFilter || hasCatFilter;
                searchContainer.innerHTML = `
                    <div class="col-span-full w-full flex flex-col items-center justify-center text-center py-16 sm:py-24 px-4 bg-white rounded-3xl">
                        <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>
                            </svg>
                        </div>
                        <div class="text-lg sm:text-xl font-extrabold text-slate-800 tracking-tight">შედეგი ვერ მოიძებნა</div>
                        <p class="text-xs sm:text-sm font-medium text-slate-400 mt-1.5 max-w-xs">
                            ${hasActiveFilters ? 'სცადეთ შეცვალოთ ფასის დიაპაზონი ან გაასუფთაოთ ფილტრი' : 'სცადეთ სხვა საძიებო სიტყვა ან შეამოწმეთ მართლწერა'}
                        </p>
                        ${hasActiveFilters ? `
                        <button type="button" id="emptySearchResetBtn" class="mt-5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer">
                            ფილტრის გასუფთავება
                        </button>` : `
                        <a href="/category/" class="mt-5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all no-underline">
                            კატალოგში გადასვლა
                        </a>`}
                    </div>`;
                if (loadMoreContainer) loadMoreContainer.classList.add('hidden');

                const emptyReset = document.getElementById('emptySearchResetBtn');
                if (emptyReset) emptyReset.addEventListener('click', resetAllFilters);
                return;
            }

            const startIndex = isLoadMore ? (searchCurrentPage - 1) * searchItemsPerPage : 0;
            const endIndex = Math.min(searchCurrentPage * searchItemsPerPage, filtered.length);
            const paginatedProducts = filtered.slice(startIndex, endIndex);

            if (typeof window.createProductCardHTML === 'function') {
                const html = paginatedProducts.map(p => window.createProductCardHTML(p, 'search')).join('');
                if (isLoadMore) {
                    searchContainer.insertAdjacentHTML('beforeend', html);
                } else {
                    searchContainer.innerHTML = html;
                }
            }

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

        // Обработчики цены с Debounce 300ms
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
                renderSearchResults(false);
            }, 300);
        }

        if (minPriceInput) minPriceInput.addEventListener('input', () => handlePriceChange('desktop'));
        if (maxPriceInput) maxPriceInput.addEventListener('input', () => handlePriceChange('desktop'));
        if (mobileMinPrice) mobileMinPrice.addEventListener('input', () => handlePriceChange('mobile'));
        if (mobileMaxPrice) mobileMaxPrice.addEventListener('input', () => handlePriceChange('mobile'));

        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetMin = btn.dataset.min || '';
                const targetMax = btn.dataset.max || '';
                const isSame = (minPriceInput?.value || '') === targetMin && (maxPriceInput?.value || '') === targetMax;
                const newMin = isSame ? '' : targetMin;
                const newMax = isSame ? '' : targetMax;

                if (minPriceInput) minPriceInput.value = newMin;
                if (maxPriceInput) maxPriceInput.value = newMax;
                if (mobileMinPrice) mobileMinPrice.value = newMin;
                if (mobileMaxPrice) mobileMaxPrice.value = newMax;

                syncUrlState();
                renderSearchResults(false);
            });
        });

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                searchCurrentPage++;
                renderSearchResults(true);
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                syncUrlState();
                renderSearchResults(false);
            });
        }

        function resetAllFilters() {
            if (minPriceInput) minPriceInput.value = '';
            if (maxPriceInput) maxPriceInput.value = '';
            if (mobileMinPrice) mobileMinPrice.value = '';
            if (mobileMaxPrice) mobileMaxPrice.value = '';
            if (sortSelect) sortSelect.value = 'default';
            selectedCategory = 'all';
            const selVal = document.getElementById('selectedValue');
            if (selVal) selVal.textContent = 'დალაგება';
            renderCategoryPills();
            syncUrlState();
            renderSearchResults(false);
        }

        if (resetBtn) resetBtn.addEventListener('click', resetAllFilters);

        // Кастомный селект сортировки
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

        // Мобильная шторка фильтров
        const mobileFilterBtn = document.getElementById('mobileFilterBtn');
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

        // Переключатель вида сетки на мобильных (2 кол. <-> 1 кол.)
        const gridToggleBtn = document.getElementById('gridToggleBtn');
        const gridIconCompact = document.getElementById('gridIconCompact');
        const gridIconSingle = document.getElementById('gridIconSingle');
        let isSingleColumnMobile = false;

        if (gridToggleBtn) {
            gridToggleBtn.addEventListener('click', () => {
                isSingleColumnMobile = !isSingleColumnMobile;
                searchContainer.classList.toggle('grid-cols-2', !isSingleColumnMobile);
                searchContainer.classList.toggle('grid-cols-1', isSingleColumnMobile);
                gridIconCompact?.classList.toggle('hidden', isSingleColumnMobile);
                gridIconSingle?.classList.toggle('hidden', !isSingleColumnMobile);
            });
        }

        // Загрузка данных и первичный расчет релевантности
        const apiUrl = window.CATALOG_API_URL || 'https://api.enkaelectronics.com.ge/catalog';
        const fetchPromise = window.fetchCatalogCached ? window.fetchCatalogCached() : fetch(apiUrl).then(res => {
            if (!res.ok) throw new Error('Catalog fetch error');
            return res.json();
        });

        fetchPromise
            .then(data => {
                const rawProducts = (data && data.products) ? data.products : (Array.isArray(data) ? data : []);
                const searchTerms = normalizeText(searchQ).split(/\s+/).filter(Boolean);
                const fullQueryNormalized = normalizeText(searchQ);

                baseMatchedProducts = [];

                rawProducts.forEach(p => {
                    if (p.stockStatus === 'out_of_stock') return;

                    const nameNorm = normalizeText(p.name || '');
                    const skuNorm = normalizeText(p.sku || '');
                    const descNorm = normalizeText(p.description || '');

                    const matchesAll = searchTerms.every(term => 
                        nameNorm.includes(term) || skuNorm.includes(term) || descNorm.includes(term)
                    );

                    if (!matchesAll) return;

                    // Расчет веса релевантности
                    let score = 0;
                    if (nameNorm.startsWith(fullQueryNormalized)) score += 100;
                    else if (nameNorm.includes(fullQueryNormalized)) score += 60;
                    if (skuNorm.includes(fullQueryNormalized)) score += 80;
                    searchTerms.forEach(term => {
                        if (nameNorm.includes(term)) score += 20;
                        if (skuNorm.includes(term)) score += 15;
                        if (descNorm.includes(term)) score += 5;
                    });

                    baseMatchedProducts.push({
                        ...p,
                        priceValue: parseInt(String(p.price || '').replace(/[^0-9]/g, ''), 10) || 0,
                        _relevance: score
                    });
                });

                renderCategoryPills();
                renderSearchResults(false);
            })
            .catch(err => {
                console.error(err);
                searchContainer.innerHTML = `
                    <div class="col-span-full w-full text-center py-16 text-slate-400 font-semibold">
                        დაფიქსირდა შეცდომა მონაცემების ჩატვირთვისას
                    </div>`;
            });
    });
})();