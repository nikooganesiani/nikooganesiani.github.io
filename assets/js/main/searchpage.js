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
                <div class="w-full flex flex-col items-center text-center py-16 sm:py-20 text-slate-400">
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
                    <div class="w-full flex flex-col items-center text-center py-16 sm:py-20 text-slate-400">
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

        const apiUrl = window.CATALOG_API_URL || 'https://api.enkaelectronics.com.ge/catalog';

        fetch(apiUrl)
            .then(res => {
                if (!res.ok) throw new Error('Catalog fetch error');
                return res.json();
            })
            .then(data => {
                const rawProducts = (data && data.products) ? data.products : (Array.isArray(data) ? data : []);
                searchProductsData = rawProducts.map(p => ({
                    ...p,
                    priceValue: parseInt(String(p.price || '').replace(/[^0-9]/g, ''), 10) || 0
                }));
                renderSearchResults();
            })
            .catch(err => {
                console.error(err);
                searchContainer.innerHTML = `
                    <div class="w-full flex flex-col items-center text-center py-16 sm:py-20 text-slate-400">
                        <div class="text-lg sm:text-2xl font-extrabold text-slate-600">შეცდომა მონაცემების ჩატვირთვისას</div>
                    </div>`;
            });
    });
})();
