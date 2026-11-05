(() => {
  'use strict';
  const PAGE_SIZE = 16;
  const SORTS = new Set(['default', 'price-asc', 'price-desc', 'name-asc', 'name-desc']);
  const ROUTE_KEYS = new Set(['category', 'sub', 'cat', 'result', 'q', 'search', 'min', 'max', 'sort', 'page', 'order']);
  const slug = value => String(value ?? '').trim().toLowerCase();
  const values = value => [...new Set((Array.isArray(value) ? value : [value]).map(slug).filter(Boolean))];
  const categories = product => values(product.categories || product.category);
  const subs = product => values(product.subcategories || product.subcategory || product.sub);
  const matches = (list, value) => value === 'all' || list.includes(slug(value));
  const categoryInfo = key => Object.entries(window.CATALOG_STRUCTURE || {}).find(([id]) => slug(id) === key)?.[1];
  const priceBound = value => {
    const text = String(value ?? '').trim();
    return /^\d+$/.test(text) && Number(text) <= 1e9 ? String(Number(text)) : '';
  };
  function priceRange(min, max) {
    const range = { min: priceBound(min), max: priceBound(max) };
    if (range.min !== '' && range.max !== '' && Number(range.min) > Number(range.max)) [range.min, range.max] = [range.max, range.min];
    return range;
  }
  function legacyCategories(params) {
    return [...params].filter(([key, value]) => !value && key.trim() && !ROUTE_KEYS.has(key) && !/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key)).map(([key]) => key);
  }
  function readState(search, mode) {
    const params = new URLSearchParams(search);
    const query = ['result', 'q', 'search'].map(key => params.get(key)?.trim()).find(Boolean) || '';
    const page = params.get('page') || '1';
    return {
      category: slug(params.get(mode === 'search' ? 'cat' : 'category') || (mode === 'category' ? legacyCategories(params)[0] : '')) || 'all',
      sub: mode === 'category' ? slug(params.get('sub')) || 'all' : 'all',
      query: query.slice(0, 200),
      ...priceRange(params.get('min'), params.get('max')),
      sort: SORTS.has(params.get('sort')) ? params.get('sort') : 'default',
      page: /^\d+$/.test(page) ? Math.max(1, Math.min(10000, Number(page))) : 1
    };
  }
  function routeURL(state, mode, search = window.location.search) {
    const params = new URLSearchParams(search);
    if (mode === 'category') legacyCategories(params).forEach(key => params.delete(key));
    ROUTE_KEYS.forEach(key => params.delete(key));
    if (state.category !== 'all') params.set(mode === 'search' ? 'cat' : 'category', state.category);
    if (mode === 'category' && state.sub !== 'all') params.set('sub', state.sub);
    if (state.query) params.set(mode === 'search' ? 'result' : 'search', state.query);
    if (state.min !== '') params.set('min', state.min);
    if (state.max !== '') params.set('max', state.max);
    if (state.sort !== 'default') params.set('sort', state.sort);
    if (state.page > 1) params.set('page', String(state.page));
    return '/' + mode + '/' + (params.size ? '?' + params.toString() : '') + window.location.hash;
  }
  function prepareProducts(raw) {
    if (!Array.isArray(raw)) throw new Error('Invalid catalog');
    const seen = new Set();
    return raw.filter(product => {
      if (!product?.id || typeof product.name !== 'string' || !product.name.trim() || seen.has(String(product.id))) return false;
      seen.add(String(product.id));
      return window.productStock(product.stockStatus) !== 'out_of_stock';
    }).map(product => ({ ...product, priceValue: window.productPrice(product.price) }));
  }
  function baseProducts(products, state, mode) {
    return products.filter(product => (mode !== 'category' || matches(categories(product), state.category)) &&
      (!state.query || window.matchesCatalogSearch(product, state.query)));
  }
  function matchesPrice(product, state) {
    return (state.min === '' && state.max === '') || (product.priceValue > 0 &&
      (state.min === '' || product.priceValue >= Number(state.min)) && (state.max === '' || product.priceValue <= Number(state.max)));
  }
  function relevance(product, query) {
    const lower = value => String(value || '').toLocaleLowerCase('ka');
    const raw = lower(query);
    if ([product.id, product.sku].some(value => lower(value) === raw)) return 1000;
    const name = lower(product.name);
    const normalized = window.normalizeQuery?.(name) || name;
    const normalizedQuery = window.normalizeQuery?.(raw) || raw;
    return (name === raw ? 500 : name.startsWith(raw) || normalized.startsWith(normalizedQuery) ? 100 : name.includes(raw) || normalized.includes(normalizedQuery) ? 60 : 0) +
      raw.split(/\s+/).filter(term => name.includes(term) || normalized.includes(window.normalizeQuery?.(term) || term)).length * 20;
  }
  function selectProducts(products, state, mode) {
    const filtered = baseProducts(products, state, mode).filter(product =>
      (mode !== 'search' || matches(categories(product), state.category)) && matches(subs(product), state.sub) && matchesPrice(product, state));
    if (state.sort.startsWith('price-')) {
      const direction = state.sort === 'price-asc' ? 1 : -1;
      filtered.sort((a, b) => !a.priceValue - !b.priceValue || (a.priceValue - b.priceValue) * direction);
    } else if (state.sort.startsWith('name-')) {
      const direction = state.sort === 'name-asc' ? 1 : -1;
      filtered.sort((a, b) => a.name.localeCompare(b.name, window.enkaI18n?.locale || 'ka') * direction);
    } else if (state.query) filtered.sort((a, b) => relevance(b, state.query) - relevance(a, state.query));
    return filtered;
  }

  function mount(mode) {
    const byId = id => document.getElementById(id);
    const grid = byId(mode === 'search' ? 'searchResultsGrid' : 'catalogContainer');
    if (!grid || grid.dataset.listingReady) return;
    grid.dataset.listingReady = 'true';
    const status = byId('listingStatus');
    const count = byId(mode === 'search' ? 'searchResultCount' : 'productCountBadge');
    const pills = byId('listingPills');
    const modal = byId('mobileFilterModal');
    const presets = [...document.querySelectorAll('.price-preset-btn')];
    let state = readState(window.location.search, mode);
    let products = [];
    let loaded = false;
    let pending = false;
    let priceTimer;
    let previousEnd = 0;
    let activePillKey;
    const text = (id, value) => { if (byId(id)) byId(id).textContent = value; };
    const hidden = (id, value) => { if (byId(id)) byId(id).hidden = value; };
    const hasPrices = () => state.min !== '' || state.max !== '';
    const hasFilters = () => hasPrices() || state.sort !== 'default' || state.sub !== 'all' || (mode === 'search' && state.category !== 'all');
    function updateArrows() {
      const overflow = pills.scrollWidth > byId('listingPillsWrapper').clientWidth + 1;
      hidden('listingScrollLeft', !overflow);
      hidden('listingScrollRight', !overflow);
      byId('listingScrollLeft').disabled = pills.scrollLeft < 4;
      byId('listingScrollRight').disabled = pills.scrollLeft + pills.clientWidth >= pills.scrollWidth - 4;
    }
    function setPresetState(min, max, mobile) {
      presets.filter(button => modal.contains(button) === mobile).forEach(button => button.setAttribute('aria-pressed', String(
        (min !== '' || max !== '') && button.dataset.min === min && button.dataset.max === max)));
    }
    function syncControls() {
      for (const [id, value] of [['minPrice', state.min], ['maxPrice', state.max], ['mobileMinPrice', state.min], ['mobileMaxPrice', state.max], ['sortSelect', state.sort], ['listingSearchInput', state.query]]) {
        if (byId(id)) byId(id).value = value;
      }
      setPresetState(state.min, state.max, false);
      setPresetState(state.min, state.max, true);
      hidden('mobileFilterDot', !hasPrices());
      hidden('activeFilters', !hasPrices() && state.sort === 'default');
      const description = [];
      if (hasPrices()) description.push(state.min !== '' && state.max !== '' ? `${state.min} – ${state.max} ₾` : state.min !== '' ? `${state.min} ₾-დან` : `${state.max} ₾-მდე`);
      const sortLabel = byId('sortSelect').selectedOptions[0].textContent;
      text('listingSortLabel', sortLabel);
      text('listingSortCompact', { default: 'დალაგება', 'price-asc': 'ფასი ↑', 'price-desc': 'ფასი ↓', 'name-asc': 'სახელი ↑', 'name-desc': 'სახელი ↓' }[state.sort]);
      if (state.sort !== 'default' && !hasPrices()) description.push(sortLabel);
      text('activeFiltersText', description.join(' · '));
    }
    function updateHeading() {
      let heading = 'ყველა პროდუქტი';
      const info = categoryInfo(state.category);
      const categoryTitle = info?.title || state.category;
      if (state.category !== 'all') heading = state.sub === 'all' ? categoryTitle : info?.subs?.find(item => slug(item.id) === state.sub)?.name || state.sub;
      if (state.query) heading = `ძიება: „${state.query}“`;
      if (mode === 'category') {
        text('categoryMainTitle', heading);
        const nav = document.querySelector('[data-breadcrumbs]');
        const crumbs = [{ label: 'კატალოგი', href: '/category/' }];
        if (state.category !== 'all' && state.sub !== 'all') crumbs.push({ label: categoryTitle, href: routeURL({ ...state, sub: 'all', page: 1 }, mode), iconKey: state.category, subSwitch: 'all' });
        crumbs.push({ label: heading, current: true, iconKey: state.category });
        window.renderBreadcrumbs?.(nav, state.category === 'all' && !state.query ? [crumbs[crumbs.length - 1]] : crumbs);
      }
      document.title = (mode === 'search' ? state.query ? `ძიება: ${state.query}` : 'ძიება' : heading) + ' – ENKA Electronics';
    }
    function renderPills() {
      const source = baseProducts(products, state, mode).filter(product => matchesPrice(product, state));
      const useSubs = mode === 'category' && state.category !== 'all';
      const counts = new Map();
      source.forEach(product => (useSubs ? subs(product) : categories(product)).forEach(key => counts.set(key, (counts.get(key) || 0) + 1)));
      const info = categoryInfo(state.category);
      let entries = useSubs ? (info?.subs || []).filter(item => counts.get(slug(item.id))).map(item => [slug(item.id), item.name]) :
        [...counts.keys()].map(key => [key, categoryInfo(key)?.title || key]);
      const selected = useSubs ? state.sub : state.category;
      if (selected !== 'all' && !entries.some(([key]) => key === selected)) entries.push([selected, useSubs ? info?.subs?.find(item => slug(item.id) === selected)?.name || selected : categoryInfo(selected)?.title || selected]);
      if (!entries.length) { hidden('listingPillsWrapper', true); return; }
      entries = [['all', 'ყველა'], ...entries];
      const focusKey = pills.contains(document.activeElement) ? document.activeElement.dataset.listingValue : null;
      const fragment = document.createDocumentFragment();
      for (const [key, label] of entries) {
        const link = document.createElement('a');
        link.className = 'listing-pill';
        link.dataset.listingValue = key;
        link.dataset.listingField = useSubs ? 'sub' : 'category';
        const next = { ...state, [link.dataset.listingField]: key, page: 1 };
        if (!useSubs) next.sub = 'all';
        link.href = routeURL(next, mode);
        if (selected === key) link.setAttribute('aria-current', 'true');
        const labelNode = document.createElement('span');
        labelNode.textContent = label;
        const total = document.createElement('small');
        total.textContent = String(key === 'all' ? source.length : counts.get(key) || 0);
        link.append(labelNode, total);
        fragment.append(link);
      }
      pills.replaceChildren(fragment);
      hidden('listingPillsWrapper', false);
      if (focusKey !== null) [...pills.children].find(link => link.dataset.listingValue === focusKey)?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        const key = (useSubs ? 'sub:' : 'category:') + selected;
        const active = [...pills.children].find(link => link.dataset.listingValue === selected);
        if (active && activePillKey !== key && Number.isFinite(active.offsetLeft)) {
          const right = active.offsetLeft + active.offsetWidth;
          if (active.offsetLeft < pills.scrollLeft || right > pills.scrollLeft + pills.clientWidth) pills.scrollLeft = active.offsetLeft;
        }
        activePillKey = key;
        updateArrows();
      });
    }
    function emptyState(title, message, action, label, href) {
      const box = document.createElement('section');
      box.className = 'listing-empty';
      const heading = document.createElement('h2'); heading.textContent = title;
      const copy = document.createElement('p'); copy.textContent = message;
      const button = document.createElement(href ? 'a' : 'button');
      button.className = 'listing-button'; button.textContent = label;
      if (href) button.href = href;
      else { button.type = 'button'; button.addEventListener('click', action); }
      box.append(heading, copy, button);
      grid.replaceChildren(box);
    }
    function render(append = false) {
      updateHeading();
      syncControls();
      if (!loaded) return;
      const emptyQuery = mode === 'search' && !state.query;
      hidden('filtersBar', emptyQuery);
      hidden('listingPillsWrapper', emptyQuery);
      grid.setAttribute('aria-busy', 'false');
      if (emptyQuery) {
        count.textContent = '';
        status.textContent = '';
        hidden('loadMoreContainer', true);
        hidden('gridToggleBtn', true);
        emptyState('შეიყვანეთ საძიებო სიტყვა', 'მოძებნეთ სასურველი ტექნიკა დასახელებით, ბრენდით ან მოდელით.', () => byId('listingSearchInput').focus(), 'ძიების დაწყება');
        return;
      }
      renderPills();
      const filtered = selectProducts(products, state, mode);
      hidden('gridToggleBtn', !filtered.length);
      state.page = Math.min(state.page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
      const end = Math.min(state.page * PAGE_SIZE, filtered.length);
      count.textContent = `${filtered.length} პროდუქტი`;
      status.textContent = filtered.length ? `ნაჩვენებია ${end} პროდუქტი ${filtered.length}-დან` : 'პროდუქტები ვერ მოიძებნა';
      if (!filtered.length) {
        const canReset = hasFilters();
        emptyState('პროდუქტები ვერ მოიძებნა', canReset ? 'შეცვალეთ ფასის დიაპაზონი ან გაასუფთავეთ ფილტრი.' : mode === 'search' ? 'სცადეთ სხვა საძიებო სიტყვა ან შეამოწმეთ მართლწერა.' : 'ამ კატეგორიაში პროდუქტები ამჟამად არ არის. დაათვალიერეთ სრული კატალოგი.', resetFilters, canReset ? 'ფილტრის გასუფთავება' : 'კატალოგში გადასვლა', canReset ? null : '/category/');
      } else {
        const html = filtered.slice(append ? previousEnd : 0, end).map(product => window.createProductCardHTML(product, mode === 'search' ? 'search' : 'cat')).join('');
        if (append) grid.insertAdjacentHTML('beforeend', html);
        else grid.innerHTML = html;
        window.syncFavButtons?.();
        if (append) grid.children[previousEnd]?.querySelector('.product-name')?.focus();
      }
      previousEnd = end;
      hidden('loadMoreContainer', filtered.length <= PAGE_SIZE);
      hidden('loadMoreBtn', end >= filtered.length);
      text('paginationCounterText', status.textContent);
      byId('paginationProgressBar').max = Math.max(1, filtered.length);
      byId('paginationProgressBar').value = end;
    }
    function saveURL(method) {
      const url = routeURL(state, mode);
      if (url !== window.location.pathname + window.location.search + window.location.hash) window.history[method]({}, '', url);
    }
    function commit(patch, method = 'pushState', append = false) {
      clearTimeout(priceTimer);
      const range = priceRange(byId('minPrice').value, byId('maxPrice').value);
      const pricesChanged = range.min !== state.min || range.max !== state.max;
      state = { ...state, ...range, page: 1, ...patch };
      if (append && pricesChanged) { state.page = 1; append = false; }
      render(append);
      saveURL(method);
    }
    function resetFilters() {
      commit({ min: '', max: '', sort: 'default', sub: 'all', category: mode === 'search' || !categoryInfo(state.category) ? 'all' : state.category });
      byId('sortSelect').focus({ preventScroll: true });
    }
    function draftRange() { return priceRange(byId('mobileMinPrice').value, byId('mobileMaxPrice').value); }
    function previewDraft() {
      const range = draftRange();
      setPresetState(range.min, range.max, true);
      const total = selectProducts(products, { ...state, ...range }, mode).length;
      text('mobileFilterPreview', `${total} პროდუქტი`);
      text('mobileApplyBtn', `ჩვენება (${total})`);
    }
    async function load() {
      if (pending) return;
      pending = true;
      const retryHadFocus = grid.contains(document.activeElement);
      status.textContent = 'პროდუქტები იტვირთება…';
      grid.setAttribute('aria-busy', 'true');
      const retry = grid.querySelector('button');
      if (retry) { retry.setAttribute('disabled', ''); retry.textContent = 'იტვირთება…'; }
      try {
        const data = await window.fetchCatalogCached();
        products = prepareProducts(Array.isArray(data) ? data : data?.products);
        loaded = true;
        render();
        saveURL('replaceState');
        if (retryHadFocus) grid.querySelector('.product-name, .listing-button')?.focus();
      } catch {
        grid.setAttribute('aria-busy', 'false');
        count.textContent = '';
        status.textContent = 'კატალოგი ვერ ჩაიტვირთა. სცადეთ ხელახლა.';
        hidden('filtersBar', true); hidden('listingPillsWrapper', true); hidden('loadMoreContainer', true);
        hidden('gridToggleBtn', true);
        const retryHadFocus = grid.contains(document.activeElement);
        emptyState('კატალოგი ვერ ჩაიტვირთა', 'შეამოწმეთ ინტერნეტკავშირი და სცადეთ ხელახლა.', load, 'ხელახლა ცდა');
        if (retryHadFocus) grid.querySelector('button').focus();
      } finally { pending = false; }
    }

    for (const id of ['minPrice', 'maxPrice']) {
      const input = byId(id);
      const apply = () => commit(priceRange(byId('minPrice').value, byId('maxPrice').value), 'replaceState');
      input.addEventListener('input', () => { clearTimeout(priceTimer); priceTimer = setTimeout(apply, 350); });
      input.addEventListener('change', apply);
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); apply(); } });
    }
    presets.forEach(button => button.addEventListener('click', () => {
      const mobile = modal.contains(button);
      const current = mobile ? draftRange() : state;
      const same = current.min === button.dataset.min && current.max === button.dataset.max;
      const range = { min: same ? '' : button.dataset.min, max: same ? '' : button.dataset.max };
      if (mobile) { byId('mobileMinPrice').value = range.min; byId('mobileMaxPrice').value = range.max; previewDraft(); }
      else commit(range);
    }));
    byId('sortSelect').addEventListener('change', event => commit({ sort: SORTS.has(event.target.value) ? event.target.value : 'default' }));
    byId('resetFilters').addEventListener('click', resetFilters);
    byId('loadMoreBtn').addEventListener('click', () => commit({ page: state.page + 1 }, 'pushState', true));
    pills.addEventListener('click', event => {
      const link = event.target.closest('a[data-listing-field]');
      if (!link || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const field = link.dataset.listingField;
      commit({ [field]: link.dataset.listingValue, ...(field === 'category' ? { sub: 'all' } : {}) });
    });
    document.querySelector('[data-breadcrumbs]')?.addEventListener('click', event => {
      const link = event.target.closest('[data-sub-switch]');
      if (!link || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); commit({ sub: link.dataset.subSwitch });
    });
    pills.addEventListener('scroll', updateArrows, { passive: true });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateArrows).observe(pills);
    else window.addEventListener('resize', updateArrows);
    for (const [id, direction] of [['listingScrollLeft', -1], ['listingScrollRight', 1]]) byId(id).addEventListener('click', () => pills.scrollBy({ left: direction * 260, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    byId('mobileFilterBtn').addEventListener('click', event => { syncControls(); previewDraft(); window.openAppModal('mobileFilterModal', event.currentTarget); });
    for (const id of ['mobileMinPrice', 'mobileMaxPrice']) {
      byId(id).addEventListener('input', previewDraft);
      byId(id).addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); byId('mobileApplyBtn').click(); } });
    }
    byId('mobileResetBtn').addEventListener('click', () => { byId('mobileMinPrice').value = ''; byId('mobileMaxPrice').value = ''; previewDraft(); });
    byId('mobileApplyBtn').addEventListener('click', () => { commit(draftRange()); window.closeAppModal(modal); });
    const wide = window.matchMedia('(min-width: 768px)');
    wide.addEventListener('change', event => { if (event.matches && modal.classList.contains('active')) window.closeAppModal(modal); });
    byId('gridToggleBtn').addEventListener('click', event => {
      const single = grid.classList.toggle('listing-grid--single');
      event.currentTarget.setAttribute('aria-pressed', String(single));
      event.currentTarget.setAttribute('aria-label', single ? 'ორი სვეტით ჩვენება' : 'ერთი სვეტით ჩვენება');
      hidden('gridIconCompact', single); hidden('gridIconSingle', !single);
      try { localStorage.setItem('catalogGrid', single ? 'single' : 'compact'); } catch { /* Optional preference. */ }
    });
    try { if (localStorage.getItem('catalogGrid') === 'single') byId('gridToggleBtn').click(); } catch { /* Optional preference. */ }
    window.addEventListener('popstate', () => {
      clearTimeout(priceTimer);
      if (modal.classList.contains('active')) window.closeAppModal(modal);
      state = readState(window.location.search, mode);
      render();
    });
    updateHeading(); syncControls();
    if (mode === 'search' && !state.query) { loaded = true; render(); }
    else load();
  }
  window.CatalogListing = { readState, routeURL, priceRange, prepareProducts, selectProducts, mount };
})();
