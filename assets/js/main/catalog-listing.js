(() => {
  'use strict';
  const RESULT_MOTION = { duration: 340, easing: 'cubic-bezier(.25, .5, .35, 1)' };
  // Half of the smallest row gap, so cards can settle without crossing another row.
  const RESULT_FRAMES = [{ translate: '0 .875rem' }, { translate: '0 0' }];
  const SORTS = new Set(['default', 'price-asc', 'price-desc', 'name-asc', 'name-desc', 'discount-desc']);
  const ROUTE_KEYS = new Set(['category', 'sub', 'cat', 'result', 'q', 'search', 'min', 'max', 'sort', 'page', 'order', 'brand', 'stock', 'sale', 'spec']);
  const STOCK_LABELS = { in_stock: 'მარაგშია', soon: 'მალე გაყიდვაში' };
  const SALE_LABEL = 'ფასდაკლებით';
  const COMPACT_SORTS = {
    default: 'დალაგება', 'price-asc': 'ფასი', 'price-desc': 'ფასი',
    'name-asc': 'სახელი', 'name-desc': 'სახელი', 'discount-desc': 'ფასდაკლება'
  };
  const EMPTY_FILTERS = { min: '', max: '', brands: [], stock: [], sale: false, specs: [] };
  const slug = value => String(value ?? '').trim().toLowerCase();
  const values = value => [...new Set((Array.isArray(value) ? value : [value]).map(slug).filter(Boolean))];
  const categories = product => values(product.categories || product.category);
  const subs = product => values(product.subcategories || product.subcategory || product.sub);
  const matches = (list, value) => value === 'all' || list.includes(slug(value));
  const categoryInfo = key => Object.entries(window.CATALOG_STRUCTURE || {}).find(([id]) => slug(id) === key)?.[1];
  const subTitle = (category, sub) => categoryInfo(category)?.subs?.find(item => slug(item.id) === sub)?.name || sub;
  const brandKeys = list => values(list).filter(key => key.length <= 100).slice(0, 50);
  const stockKeys = list => values(list).filter(key => Object.hasOwn(STOCK_LABELS, key));
  const decode = value => {
    try { return decodeURIComponent(value || ''); } catch { return ''; }
  };
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
  function resolveState(state, store=window.ENKA_STORE) {
    const resolved=globalThis.EnkaStoreEngine?.resolveSection(store,state.category,state.sub);
    return resolved?{...state,category:slug(resolved.category),sub:slug(resolved.sub)}:state;
  }
  function readState(search, mode, pathname = window.location.pathname || '') {
    const params = new URLSearchParams(search);
    const section = mode === 'category' ? pathname.match(/^\/(?:ru\/|en\/)?category\/([^/]+)(?:\/([^/]+))?\/?$/) : null;
    const query = ['result', 'q', 'search'].map(key => params.get(key)?.trim()).find(Boolean) || '';
    const page = params.get('page') || '1';
    return resolveState({
      category: slug(decode(section?.[1]) || params.get(mode === 'search' ? 'cat' : 'category') || (mode === 'category' ? legacyCategories(params)[0] : '')) || 'all',
      sub: slug(decode(section?.[2]) || params.get('sub')) || 'all',
      query: query.slice(0, 200),
      ...priceRange(params.get('min'), params.get('max')),
      brands: brandKeys(params.getAll('brand')),
      stock: stockKeys(params.getAll('stock')),
      specs: [...new Set(params.getAll('spec'))].filter(value => {
        try {
          const pair = JSON.parse(value);
          return Array.isArray(pair) && pair.length === 2 && pair.every(part => typeof part === 'string' && part.length > 0 && part.length <= 100);
        } catch { return false; }
      }).slice(0, 60),
      sale: params.get('sale') === '1',
      sort: SORTS.has(params.get('sort')) ? params.get('sort') : 'default',
      page: /^\d+$/.test(page) ? Math.max(1, Math.min(10000, Number(page))) : 1
    });
  }
  function routeURL(state, mode, search = window.location.search) {
    const params = new URLSearchParams(search);
    if (mode === 'category') legacyCategories(params).forEach(key => params.delete(key));
    ROUTE_KEYS.forEach(key => params.delete(key));
    if (mode === 'search' && state.category !== 'all') params.set('cat', state.category);
    if (mode === 'search' && state.sub !== 'all') params.set('sub', state.sub);
    if (state.query) params.set(mode === 'search' ? 'result' : 'search', state.query);
    if (state.min !== '') params.set('min', state.min);
    if (state.max !== '') params.set('max', state.max);
    for (const brand of state.brands || []) params.append('brand', brand);
    for (const stock of state.stock || []) params.append('stock', stock);
    for (const pair of state.specs || []) params.append('spec', pair);
    if (state.sale) params.set('sale', '1');
    if (state.sort !== 'default') params.set('sort', state.sort);
    if (state.page > 1) params.set('page', String(state.page));
    const section = mode === 'category' && state.category !== 'all' ? encodeURIComponent(state.category) + '/' + (state.sub !== 'all' ? encodeURIComponent(state.sub) + '/' : '') : '';
    const route = '/' + mode + '/' + section + (params.size ? '?' + params.toString() : '') + window.location.hash;
    return window.enkaRoute?.(route) || route;
  }
  function prepareProducts(raw) {
    if (!Array.isArray(raw)) throw new Error('Invalid catalog');
    const seen = new Set();
    return raw.filter(product => {
      if (!product?.id || typeof product.name !== 'string' || !product.name.trim() || seen.has(String(product.id))) return false;
      seen.add(String(product.id));
      return window.productStock(product.stockStatus) !== 'out_of_stock';
    }).map(product => {
      const priceValue = window.productPrice(product.price);
      const oldPrice = window.productPrice(product.oldPrice);
      return {
        ...product,
        priceValue,
        attributes: new Map(Object.entries(product.specs || {}).map(([key, value]) => [key.trim(), String(value).trim().replace(/\s+/g, ' ')]).filter(([key, value]) =>
          key && key.length <= 100 && value && value.length <= 80 && !/^(brand|model|sku|ბრენდი|მოდელი|бренд|модель)$/iu.test(key))),
        discount: priceValue > 0 && oldPrice > priceValue ? 1 - priceValue / oldPrice : 0,
        brandKey: slug(product.brand),
        stockKey: window.isProductAvailable(product) ? 'in_stock' : window.productStock(product.stockStatus) === 'soon' ? 'soon' : ''
      };
    });
  }
  function baseProducts(products, state) {
    return state.query ? window.searchCatalog(products, state.query) : products;
  }
  function matchesPrice(product, state) {
    return (state.min === '' && state.max === '') || (product.priceValue > 0 &&
      (state.min === '' || product.priceValue >= Number(state.min)) && (state.max === '' || product.priceValue <= Number(state.max)));
  }
  function matchesFacets(product, state, except) {
    const selected = new Map();
    for (const pair of state.specs || []) {
      const [key, value] = JSON.parse(pair);
      if (!selected.has(key)) selected.set(key, new Set());
      selected.get(key).add(value);
    }
    for (const [key, options] of selected) {
      if (except !== 'spec:' + key && !options.has(product.attributes.get(key))) return false;
    }
    return matchesPrice(product, state) &&
      (except === 'brands' || !state.brands?.length || state.brands.includes(product.brandKey)) &&
      (except === 'stock' || !state.stock?.length || state.stock.includes(product.stockKey)) &&
      (except === 'sale' || !state.sale || product.discount > 0);
  }
  function inSection(product, state) {
    return matches(categories(product), state.category) && matches(subs(product), state.sub);
  }
  function sortResults(filtered, state) {
    if (state.sort.startsWith('price-')) {
      const direction = state.sort === 'price-asc' ? 1 : -1;
      filtered.sort((a, b) => !a.priceValue - !b.priceValue || (a.priceValue - b.priceValue) * direction);
    } else if (state.sort === 'discount-desc') {
      filtered.sort((a, b) => b.discount - a.discount);
    } else if (state.sort.startsWith('name-')) {
      const direction = state.sort === 'name-asc' ? 1 : -1;
      filtered.sort((a, b) => a.name.localeCompare(b.name, window.enkaI18n?.locale || 'ka') * direction);
    }
    return filtered;
  }
  function filterResults(source, state) {
    return source.filter(product => inSection(product, state) && matchesFacets(product, state));
  }
  function selectProducts(products, state) {
    return sortResults(filterResults(baseProducts(products, state), state), state);
  }

  function mount(mode) {
    const byId = id => document.getElementById(id);
    const search = mode === 'search';
    const grid = byId(search ? 'searchResultsGrid' : 'catalogContainer');
    if (!grid || grid.dataset.listingReady) return;
    grid.dataset.listingReady = 'true';

    const status = byId('listingStatus');
    const count = byId(search ? 'searchResultCount' : 'productCountBadge');
    const results = byId('listingResults');
    const pills = byId('listingPills');
    const sidebar = byId('listingSidebar');
    const modal = byId('mobileFilterModal');
    const facets = byId('listingFacets');
    const priceForm = byId('listingPriceForm');
    const sliders = [byId('rangeMin'), byId('rangeMax')];
    let priceDomain = [0, 0];
    let priceTimer;
    const minInput = byId('minPrice');
    const maxInput = byId('maxPrice');
    const sort = byId('sortSelect');
    const searchInput = byId('searchInput');
    const brandQuery = byId('listingBrandQuery');
    const chips = byId('activeFiltersText');
    const filterButton = byId('mobileFilterBtn');
    const apply = byId('mobileApplyBtn');
    const mobilePreview = byId('mobileFilterPreview');
    const sortMenu = byId('sortMenu');
    const sortDirection = byId('listingSortDirection');
    const sortOptions = [...sortMenu.querySelectorAll('input')];
    const tablet = window.matchMedia('(min-width: 700px)');
    const wide = window.matchMedia('(min-width: 1024px)');
    const listingPageSize = () => wide.matches ? 20 : tablet.matches ? 18 : 16;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const discoveryPanel = byId('listingDiscovery');
    const text = (id, value) => { if (byId(id)) byId(id).textContent = value; };
    const hide = (id, value) => { if (byId(id)) byId(id).hidden = value; };
    const icon = (name, size) => window.EnkaIcons?.render(name, size) || '';
    const displayNumber = new Intl.NumberFormat(window.enkaI18n?.locale || 'ka');
    const isPlainClick = event => !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

    let state = readState(window.location.search, mode);
    const modalOpen = () => modal.classList.contains('active');
    let sliderGesture = false;
    let products = [];
    let brands = new Map();
    let loaded = false;
    let pending = false;
    let pageSize = listingPageSize();
    let previousEnd = 0;
    let previousContext;
    let mobilePositions;
    let previewMotion;
    const cardContent = new WeakMap();
    if (search) window.EnkaSearchHistory?.trackResults(grid, card => cardContent.get(card)?.product);
    const cardMotion = new WeakMap();

    function setProducts(raw) {
      products = prepareProducts(raw);
      brands = new Map(products.filter(product => product.brandKey).map(product => [product.brandKey, String(product.brand).trim()]));
    }

    function updateHeading() {
      const categoryTitle = categoryInfo(state.category)?.title || state.category;
      const heading = state.sub !== 'all' ? subTitle(state.category, state.sub) : state.category === 'all' ? 'ყველა პროდუქტი' : categoryTitle;
      if (!search) text('categoryTitleText', heading);
      const title = search ? (window.enkaI18n?.t('ძიება') || 'ძიება') + (state.query ? ' · ' + state.query : '') : window.enkaI18n?.t(heading) || heading;
      document.title = title + ' – ENKA Electronics';
    }

    function renderPills(source) {
      const useSubs = state.category !== 'all' && (categoryInfo(state.category) || source.some(product => matches(categories(product), state.category)));
      const field = useSubs ? 'sub' : 'category';
      const selected = state[field];
      const section = useSubs ? source.filter(product => matches(categories(product), state.category)) : source;
      const counts = new Map();
      const available = new Set();
      let total = 0;
      for (const product of section) {
        const keys = useSubs ? subs(product) : categories(product);
        keys.forEach(key => available.add(key));
        if (!matchesFacets(product, state)) continue;
        total++;
        keys.forEach(key => counts.set(key, (counts.get(key) || 0) + 1));
      }
      const configured = useSubs ? (categoryInfo(state.category)?.subs || []).map(item => [slug(item.id), item.name]) :
        Object.entries(window.CATALOG_STRUCTURE || {}).map(([key, info]) => [slug(key), info.title]);
      const entries = configured.filter(([key]) => available.has(key) || key === selected);
      const included = new Set(entries.map(([key]) => key));
      for (const key of [...available, selected]) {
        if (key === 'all' || included.has(key)) continue;
        included.add(key);
        entries.push([key, useSubs ? subTitle(state.category, key) : categoryInfo(key)?.title || key]);
      }
      if (!entries.length || (selected === 'all' && entries.length === 1 && available.size === 1 && counts.get(entries[0][0]) === total)) { hide('listingPillsWrapper', true); return; }
      entries.unshift(['all', 'ყველა']);
      const focusKey = pills.contains(document.activeElement) ? document.activeElement.dataset.listingValue : null;
      const fragment = document.createDocumentFragment();
      for (const [key, label] of entries) {
        const link = document.createElement('a');
        link.className = 'flex items-center justify-between gap-2 rounded-md px-2 min-h-9 text-sm text-ink hover:bg-surface aria-current:text-accent aria-current:bg-surface [&_strong]:font-medium [&_small]:text-muted';
        link.dataset.listingValue = key;
        link.dataset.listingField = field;
        const next = { ...state, [field]: key, ...(field === 'category' ? { sub: 'all' } : {}), page: 1 };
        link.href = routeURL(next, mode);
        if (selected === key) link.setAttribute('aria-current', 'true');
        const labelNode = document.createElement('strong');
        labelNode.textContent = label;
        const badge = document.createElement('small');
        badge.textContent = displayNumber.format(key === 'all' ? total : counts.get(key) || 0);
        link.append(labelNode, badge);
        fragment.append(link);
      }
      pills.replaceChildren(fragment);
      hide('listingPillsWrapper', false);
      const active = [...pills.children].find(link => link.dataset.listingValue === selected);
      if (focusKey != null) ([...pills.children].find(link => link.dataset.listingValue === focusKey) || active)?.focus({ preventScroll: true });
    }

    function renderOptions(id, field, options) {
      const container = typeof id === 'string' ? byId(id) : id;
      const focused = container.contains(document.activeElement) ? document.activeElement.value : null;
      const fragment = document.createDocumentFragment();
      let focusTarget;
      for (const { key, label, total, selected } of options) {
        const row = document.createElement('label');
        row.className = [
          'listing-option',
          'flex items-center gap-2.5 min-h-[2.25rem] rounded-md px-1.5 text-ink text-sm leading-[1.4] cursor-pointer',
          '[&_span]:wrap-anywhere',
          '[&_small]:ms-auto [&_small]:text-muted [&_small]:tabular-nums',
          '[&:has(input:disabled)]:text-muted [&:has(input:disabled)]:cursor-default'
        ].join(' ');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.facet = field;
        input.value = key;
        input.checked = selected;
        input.disabled = !selected && total === 0;
        const name = document.createElement('span');
        if (field === 'brands' || field.startsWith('spec:')) name.setAttribute('translate', 'no');
        name.textContent = label;
        const count = document.createElement('small');
        count.textContent = displayNumber.format(total);
        row.append(input, name, count);
        fragment.append(row);
        if (key === focused) focusTarget = input;
      }
      container.replaceChildren(fragment);
      if (focused !== null) {
        if (focusTarget && !focusTarget.disabled) focusTarget.focus({ preventScroll: true });
        else container.parentElement.querySelector('summary').focus({ preventScroll: true });
      }
    }

    function renderFacets(current, source = baseProducts(products, current)) {
      const scope = source.filter(product => inSection(product, current));
      const prices = scope.map(product => product.priceValue).filter(price => price > 0);
      priceDomain = prices.length ? [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))] : [0, 0];
      syncSlider(current);
      const hasSpecs = renderSpecs(scope, current);
      const hasPrice = priceDomain[0] < priceDomain[1] || current.min !== '' || current.max !== '';
      hide('priceFacet', !hasPrice);
      const brandCounts = new Map();
      const stockCounts = new Map();
      let sales = 0;
      for (const product of scope) {
        if (product.brandKey && matchesFacets(product, current, 'brands')) brandCounts.set(product.brandKey, (brandCounts.get(product.brandKey) || 0) + 1);
        if (product.stockKey && matchesFacets(product, current, 'stock')) stockCounts.set(product.stockKey, (stockCounts.get(product.stockKey) || 0) + 1);
        if (product.discount && matchesFacets(product, current, 'sale')) sales++;
      }

      const brandOptions = [...new Set([...scope.map(product => product.brandKey).filter(Boolean), ...current.brands])].map(key => ({
        key, label: brands.get(key) || key, total: brandCounts.get(key) || 0, selected: current.brands.includes(key)
      })).sort((a, b) => a.label.localeCompare(b.label, window.enkaI18n?.locale || 'ka'));
      const brandTerm = slug(brandQuery.value);
      const visibleBrands = brandOptions.filter(({ key, selected }) => selected || key.includes(brandTerm));
      const hasBrands = current.brands.length > 0 || brandOptions.length > 1 || (brandOptions.length === 1 && scope.some(p => !p.brandKey));
      hide('listingBrandFacet', !hasBrands);
      hide('listingBrandSearch', brandOptions.length <= 7 && !brandQuery.value);
      hide('listingBrandsEmpty', !brandTerm || Boolean(visibleBrands.length));
      renderOptions('listingBrands', 'brands', visibleBrands);

      const knownStock = new Set(scope.map(product => product.stockKey));
      const stock = Object.entries(STOCK_LABELS).filter(([key]) => knownStock.has(key) || current.stock.includes(key)).map(([key, label]) => ({
        key, label, total: stockCounts.get(key) || 0, selected: current.stock.includes(key)
      }));
      const hasStock = current.stock.length > 0 || (stock.length > 0 && knownStock.size > 1);
      hide('listingStockFacet', !hasStock);
      renderOptions('listingStock', 'stock', stock);
      const hasOffers = current.sale || (scope.some(p => p.discount > 0) && scope.some(p => !p.discount));
      hide('listingOfferFacet', !hasOffers);
      renderOptions('listingOffers', 'sale', [{ key: '1', label: SALE_LABEL, total: sales, selected: current.sale }]);
      return hasPrice || hasBrands || hasStock || hasOffers || hasSpecs || !byId('listingPillsWrapper').hidden;
    }

    function renderSpecs(scope, current) {
      const host = byId('specFacets');
      const groups = new Map();
      const choices = current.specs || [];
      // Only compare specifications within a section, or within a homogeneous search result.
      if (current.category !== 'all' || current.sub !== 'all' || (current.query && scope.length && subs(scope[0]).some(id => scope.every(p => subs(p).includes(id))))) {
        for (const product of scope) for (const [key, value] of product.attributes) {
          if (!groups.has(key)) groups.set(key, new Map());
          const counts = groups.get(key);
          counts.set(value, (counts.get(value) || 0) + Number(matchesFacets(product, current, 'spec:' + key)));
        }
      }
      const selectedKeys = new Set();
      for (const pair of choices) {
        const [key, value] = JSON.parse(pair);
        selectedKeys.add(key);
        if (!groups.has(key)) groups.set(key, new Map());
        if (!groups.get(key).has(value)) groups.get(key).set(value, 0);
      }
      const existing = new Map([...host.children].map(el => [el.dataset.spec, el]));
      const priority = key => /^(capacity|volume|объ[её]м|вместимость|მოცულობა|ტევადობა)$/iu.test(key) ? 0 : 1;
      for (const [key, counts] of [...groups].sort(([a], [b]) => priority(a) - priority(b))) {
        if (counts.size < 2 && !selectedKeys.has(key)) continue;
        let group = existing.get(key);
        if (!group) {
          group = document.createElement('details');
          group.className = 'listing-facet';
          group.dataset.spec = key;
          group.open = priority(key) === 0 || selectedKeys.has(key);
          const summary = document.createElement('summary');
          const title = document.createElement('span');
          title.setAttribute('translate', 'no');
          title.textContent = key;
          summary.append(title);
          summary.insertAdjacentHTML('beforeend', icon('chevron-down', 16));
          const options = document.createElement('div');
          options.className = 'listing-options';
          group.append(summary, options);
          host.append(group);
        }
        existing.delete(key);
        renderOptions(group.lastElementChild, 'spec:' + key, [...counts].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([value, total]) => ({
          key: JSON.stringify([key, value]), label: value, total, selected: choices.includes(JSON.stringify([key, value]))
        })));
      }
      for (const group of existing.values()) group.remove();
      return host.children.length > 0;
    }

    function readPrices() {
      return priceRange(minInput.valueAsNumber, maxInput.valueAsNumber);
    }

    function syncSlider(current) {
      const [low, high] = priceDomain;
      const clamp = n => Math.max(low, Math.min(high, n));
      const values = [clamp(current.min === '' ? low : Number(current.min)), clamp(current.max === '' ? high : Number(current.max))];
      hide('priceSlider', high <= low);
      for (const [index, slider] of sliders.entries()) {
        slider.min = low;
        slider.max = high;
        slider.value = values[index];
        slider.setAttribute('aria-valuetext', displayNumber.format(values[index]) + ' ₾');
      }
      minInput.placeholder = String(low);
      maxInput.placeholder = String(high);
      sliders[0].style.zIndex = values[1] === high && values[0] === high ? '1' : '';
      const fill = byId('priceSelection');
      fill.style.left = (values[0] - low) / (high - low || 1) * 100 + '%';
      fill.style.right = (high - values[1]) / (high - low || 1) * 100 + '%';
    }

    function syncPrices(current, write = true) {
      if (write) {
        maxInput.setCustomValidity('');
        hide('listingPriceError', true);
        minInput.value = current.min;
        maxInput.value = current.max;
      }
      syncSlider(current);
    }

    function renderActiveFilters(animate) {
      const entries = [];
      const add = (key, label, patch, translate = true) => entries.push({ key, label, patch, translate });
      if (search && state.category !== 'all') add('category', categoryInfo(state.category)?.title || state.category, { category: 'all', sub: 'all' });
      if (search && state.sub !== 'all') add('sub', subTitle(state.category, state.sub), { sub: 'all' });
      if (!search && state.query) add('query', '„' + state.query + '“', { query: '' }, false);
      const { min, max } = state;
      if (min !== '' || max !== '') {
        const label = min !== '' && max !== '' ? displayNumber.format(min) + ' – ' + displayNumber.format(max) + ' ₾' :
          min !== '' ? displayNumber.format(min) + ' ₾-დან' : displayNumber.format(max) + ' ₾-მდე';
        add('price', label, { min: '', max: '' });
      }
      for (const brand of state.brands) add('brand:' + brand, brands.get(brand) || brand, { brands: state.brands.filter(key => key !== brand) }, false);
      for (const key of state.stock) add('stock:' + key, STOCK_LABELS[key], { stock: state.stock.filter(value => value !== key) });
      for (const pair of state.specs || []) add('spec:' + pair, JSON.parse(pair).join(' · '), { specs: state.specs.filter(item => item !== pair) }, false);
      if (state.sale) add('sale', SALE_LABEL, { sale: false });

      const preserveFocus = chips.contains(document.activeElement);
      const focusKey = preserveFocus ? document.activeElement.dataset.chipKey : '';
      const previousIndex = preserveFocus ? [...chips.children].indexOf(document.activeElement) : 0;
      const previousKeys = new Set(Array.from(chips.children, chip => chip.dataset.chipKey));
      let matchingChip;
      const fragment = document.createDocumentFragment();
      for (const { key, label, patch, translate } of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = [
          'listing-chip',
          'inline-flex min-h-[2.25rem] max-w-full items-center gap-[.45rem] [padding:.3rem_.625rem] [border:1px_solid_var(--listing-tint-line)] rounded-control text-accent-strong [background:var(--listing-tint)] text-[length:.8125rem] leading-[1.4] wrap-anywhere cursor-pointer',
          'hover:border-accent'
        ].join(' ');
        if (animate && !previousKeys.has(key)) button.classList.add('listing-control-enter');
        button.dataset.chipKey = key;
        button.setAttribute('aria-label', 'ფილტრის მოხსნა · ' + label);
        const name = document.createElement('span');
        if (!translate) name.setAttribute('translate', 'no');
        name.textContent = label;
        const close = document.createElement('span');
        close.innerHTML = icon('close', 14);
        button.append(name, close);
        button.addEventListener('click', () => commit(patch));
        fragment.append(button);
        if (focusKey === key) matchingChip = button;
      }
      chips.replaceChildren(fragment);
      hide('activeFilters', !entries.length);
      const facetCount = entries.filter(entry => !['category', 'sub', 'query'].includes(entry.key)).length;
      hide('mobileFilterDot', !facetCount);
      text('mobileFilterDot', displayNumber.format(facetCount));
      if (preserveFocus) (matchingChip || chips.children[Math.min(previousIndex, entries.length - 1)] || sort).focus({ preventScroll: true });
      return Boolean(entries.length);
    }

    function emptyState(title, message, label, action, iconName = 'search') {
      const box = document.createElement('div');
      box.className = [
          'listing-empty',
          'grid col-span-full justify-items-center gap-3 [padding:clamp(1.5rem,_4vw,_3.25rem)_1rem] border border-line rounded-card bg-canvas text-center',
          '[&_h3]:text-ink [&_h3]:text-[length:1.15rem] [&_h3]:font-[650] [&_h3]:leading-[1.4]',
          '[&_p]:max-w-[31rem] [&_p]:text-muted [&_p]:leading-[1.65]',
          '[&_.listing-button]:mt-[.25rem]'
        ].join(' ');
      const badge = document.createElement('span');
      badge.className = [
          'listing-empty-icon',
          'grid place-items-center w-[3rem] h-[3rem] rounded-media text-accent [background:var(--listing-tint)]'
        ].join(' ');
      badge.innerHTML = icon(iconName, 24);
      const heading = document.createElement('h3');
      heading.textContent = title;
      const copy = document.createElement('p');
      copy.textContent = message;
      const button = document.createElement(typeof action === 'string' ? 'a' : 'button');
      button.className = [
          'listing-button listing-button--primary',
          'inline-flex min-h-11 items-center justify-center gap-[.45rem] [padding:.55rem_.875rem] border border-transparent rounded-control text-sm leading-[1.4] font-[650] no-underline cursor-pointer',
          'disabled:opacity-55 disabled:cursor-default',
          'text-white bg-brand',
          '[&:not(:disabled):hover]:bg-brand-dark'
        ].join(' ');
      button.textContent = label;
      if (typeof action === 'string') button.href = action;
      else { button.type = 'button'; button.addEventListener('click', action); }
      box.append(badge, heading, copy, button);
      grid.replaceChildren(box);
      return button;
    }

    function updateCards(visible) {
      const current = [...grid.children];
      const existing = new Map(current.map(card => [card.dataset.productId, card]));
      const entering = [];
      const template = document.createElement('template');
      const cards = visible.map(product => {
        let card = existing.get(String(product.id));
        const content = cardContent.get(card);
        if (content?.product === product) return card;
        const html = window.createProductCardHTML(product, search ? 'search' : 'cat');
        if (content?.html !== html) {
          template.innerHTML = html;
          card = template.content.firstElementChild;
          entering.push(card);
        }
        cardContent.set(card, { product, html });
        return card;
      });
      const focused = document.activeElement;
      const kept = new Set(cards);
      for (const card of current) if (!kept.has(card)) card.remove();
      let next = grid.firstElementChild;
      for (const card of cards) {
        if (card !== next) {
          if (grid.moveBefore && card.parentElement === grid) grid.moveBefore(card, next);
          else grid.insertBefore(card, next);
        }
        next = card.nextElementSibling;
      }
      if (document.activeElement !== focused && grid.contains(focused)) focused.focus({ preventScroll: true });
      if (entering.length) window.syncFavButtons?.();
      return entering;
    }

    function capturePositions() {
      const positions = new Map();
      if (!grid.firstElementChild?.dataset.productId) return positions;
      const origin = grid.getBoundingClientRect();
      for (const card of grid.children) {
        // Use layout coordinates while the card may still be animating.
        const top = origin.top + card.offsetTop;
        if (top >= window.innerHeight || top + card.offsetHeight <= 0) {
          positions.set(card, null);
        } else {
          positions.set(card, { top, left: origin.left + card.offsetLeft, width: card.offsetWidth });
        }
      }
      return positions;
    }

    function animateCards(before, entering = []) {
      if (reducedMotion.matches) return;
      if (before?.size) {
        const newCards = new Set(entering);
        for (const [card, after] of capturePositions()) {
          if (!after || newCards.has(card)) continue;
          const previous = before.get(card);
          if (previous && previous.left === after.left && previous.top === after.top && previous.width === after.width) continue;
          cardMotion.get(card)?.cancel();
          card.classList.remove('listing-result-enter');
          const motion = card.animate?.(RESULT_FRAMES, RESULT_MOTION);
          if (motion) cardMotion.set(card, motion);
        }
      }
      for (const card of entering.slice(0, pageSize)) card.classList.add('listing-result-enter');
    }

    function render({ append = false, writePrices = true, animate = false } = {}) {
      const discovery = search && !state.query;
      const returningFromDiscovery = discoveryPanel && !discoveryPanel.hidden;
      let before;
      if (animate && !append && !discovery && !returningFromDiscovery && !reducedMotion.matches) {
        before = mobilePositions ?? capturePositions();
        if (modalOpen()) mobilePositions = before;
      }
      const context = [state.category, state.sub, state.query].join('\n');
      if (context !== previousContext) {
        updateHeading();
        if (search && searchInput) searchInput.value = state.query;
        brandQuery.value = '';
        previousContext = context;
      }
      hide('listingDiscovery', !discovery);
      if (discovery || !loaded) {
        hide('filtersBar', true);
        hide('activeFilters', true);
        sidebar.hidden = true;
        hide('listingPillsWrapper', true);
        hide('loadMoreContainer', true);
        hide('gridToggleBtn', true);
        if (search) text('listingSearchTitle', window.enkaI18n?.t(discovery ? 'ძიება' : 'ძიების შედეგები') || (discovery ? 'ძიება' : 'ძიების შედეგები'));
        if (discovery) status.textContent = '';
        return;
      }

      grid.setAttribute('aria-busy', 'false');
      for (const option of sortOptions) option.checked = option.value === state.sort;
      const selection = sortOptions.find(option => option.checked);
      text('listingSortCompact', COMPACT_SORTS[state.sort]);
      text('listingSortFull', selection?.nextElementSibling.textContent || COMPACT_SORTS[state.sort]);
      if (sortDirection) {
        const direction = /^(?:price|name)-(asc|desc)$/.exec(state.sort)?.[1];
        sortDirection.dataset.direction = direction || '';
        sortDirection.toggleAttribute('hidden', !direction);
      }
      syncPrices(state, writePrices);
      const source = baseProducts(products, state);
      renderPills(source);
      const hasFacets = renderFacets(state, source);
      const canReset = renderActiveFilters(animate);
      const filtered = sortResults(filterResults(source, state), state);
      const showTools = canReset || filtered.length > 0;
      hide('filtersBar', !showTools);
      sidebar.hidden = !showTools || !hasFacets;
      filterButton.hidden = sidebar.hidden;
      sortMenu.hidden = filtered.length < 2;

      hide('gridToggleBtn', !filtered.length);
      state.page = Math.min(state.page, Math.max(1, Math.ceil(filtered.length / pageSize)));
      const end = Math.min(state.page * pageSize, filtered.length);
      renderResultTitle(filtered.length);
      updateMobileCount(filtered.length, animate);
      status.textContent = filtered.length ? 'ნაჩვენებია ' + displayNumber.format(end) + ' / ' + displayNumber.format(filtered.length) : 'პროდუქტები ვერ მოიძებნა';
      if (!filtered.length) {
        const focused = grid.contains(document.activeElement);
        const animateEmpty = animate && !reducedMotion.matches &&
          (returningFromDiscovery || !grid.firstElementChild?.classList.contains('listing-empty'));
        let action;
        if (canReset) action = emptyState('პროდუქტები ვერ მოიძებნა', 'სცადეთ სხვა ფასი ან გაასუფთავეთ არჩეული ფილტრები.', 'ფილტრების გასუფთავება', resetFilters);
        else if (search) action = emptyState('პროდუქტები ვერ მოიძებნა', 'შეამოწმეთ მართლწერა ან სცადეთ ბრენდის, მოდელის ან პროდუქტის ტიპის მოძებნა.', 'ძიების შეცვლა', event => {
          if (searchInput?.getClientRects().length) { searchInput.focus(); searchInput.select(); }
          else {
            window.openAppModal('searchModalMobile', event.currentTarget);
            const input = byId('mobileSearchInput');
            input.value = state.query;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.select();
          }
        });
        else action = emptyState('ამ კატეგორიაში პროდუქტები ჯერ არ არის', 'სხვა პროდუქტები სრულ კატალოგში შეგიძლიათ ნახოთ.', 'კატალოგში გადასვლა', '/category/', 'package');
        if (animateEmpty) grid.firstElementChild.classList.add('listing-result-enter');
        if (focused) action.focus();
      } else {
        const entering = updateCards(filtered.slice(0, end));
        if (animate && !modalOpen()) {
          animateCards(before, returningFromDiscovery ? [...grid.children] : entering);
        }
        if (append) grid.children[previousEnd]?.querySelector('.product-name')?.focus();
      }
      previousEnd = end;
      hide('loadMoreContainer', filtered.length <= pageSize);
      hide('loadMoreBtn', end >= filtered.length);
      if (filtered.length > pageSize && end < filtered.length) {
        text('loadMoreBtn', 'მეტის ნახვა (' + displayNumber.format(Math.min(pageSize, filtered.length - end)) + ')');
      }
      text('paginationCounterText', status.textContent);
      byId('paginationProgressBar').max = Math.max(1, filtered.length);
      byId('paginationProgressBar').value = end;
    }

    function renderResultTitle(total) {
      const number = displayNumber.format(total);
      if (!search) {
        count.textContent = '(' + number + ')';
        count.hidden = false;
        return;
      }
      const locale = window.enkaI18n?.locale || 'ka';
      const plural = new Intl.PluralRules(locale).select(total);
      const noun = locale === 'ru' ? ({ one: 'товар', few: 'товара', many: 'товаров' }[plural] || 'товара') :
        locale === 'en' ? (total === 1 ? 'product' : 'products') : 'პროდუქტი';
      count.textContent = number + ' ' + noun;
      const title = byId('listingSearchTitle');
      title.setAttribute('translate', 'no');
      const query = document.createElement('span');
      query.className = 'text-accent';
      query.textContent = state.query;
      const prefix = document.createElement('span');
      prefix.textContent = locale === 'ru' ? 'По запросу «' : locale === 'en' ? 'Results for “' : 'ძიებისთვის „';
      const suffix = document.createElement('span');
      suffix.textContent = (locale === 'ru' ? '» · ' : locale === 'en' ? '” · ' : '“ ნაპოვნია ') + count.textContent;
      title.replaceChildren(prefix, query, suffix);
    }

    function recordContext() {
      if (!window.enkaPersonalization?.allowed()) return;
      if (state.query) selectProducts(products, state).slice(0, 3).forEach(product => window.enkaPersonalization.record('search', String(product.id)));
      else if (state.sub !== 'all') window.enkaPersonalization.record('category', 'sub:' + state.sub);
      else if (state.category !== 'all') window.enkaPersonalization.record('category', 'category:' + state.category);
    }

    function saveURL(method) {
      const url = routeURL(state, mode);
      if (url !== window.location.pathname + window.location.search + window.location.hash) window.history[method]({}, '', url);
    }

    function moveToResults() {
      const top = byId('filtersBar').getBoundingClientRect().top;
      if (results.getBoundingClientRect().top + 1 < top) results.scrollIntoView({ block: 'start', behavior: 'instant' });
    }

    function commit(patch, append = false, historyMethod = 'pushState') {
      const next = { ...state, page: 1, ...patch };
      if (routeURL(next, mode) === routeURL(state, mode)) return;
      const topicChanged = ['query', 'category', 'sub'].some(key => state[key] !== next[key]);
      if (!append && !topicChanged && !modalOpen()) moveToResults();
      state = next;
      render({ append, animate: true, writePrices: topicChanged || Object.hasOwn(patch, 'min') || Object.hasOwn(patch, 'max') });
      saveURL(historyMethod);
      if (!loaded && (!search || state.query)) load();
      else if (topicChanged && (!search || state.query)) recordContext();
    }

    function resetFilters() {
      const scope = search ? { category: 'all', sub: 'all' } : { query: '' };
      commit({ ...EMPTY_FILTERS, ...scope });
      syncPrices(state);
      const target = byId('filtersBar').hidden ? grid.querySelector('.listing-empty .listing-button') : sort;
      target?.focus({ preventScroll: true });
    }

    function updateMobileCount(total, animate) {
      const valid = priceForm.checkValidity();
      apply.disabled = !valid;
      const value = valid ? '(' + displayNumber.format(total) + ')' : '';
      if (mobilePreview.textContent !== value) {
        mobilePreview.textContent = value;
        if (animate && valid && modalOpen() && !reducedMotion.matches) {
          previewMotion?.cancel();
          previewMotion = mobilePreview.animate?.([{ scale: 1.16 }, { scale: 1 }], { duration: 280, easing: 'ease-out' });
        }
      }
      text('mobileFilterStatus', valid ? 'ნაპოვნია ' + displayNumber.format(total) : '');
    }

    function updatePrices(historyMethod = 'pushState') {
      clearTimeout(priceTimer);
      const reversed = minInput.value !== '' && maxInput.value !== '' && minInput.valueAsNumber > maxInput.valueAsNumber;
      maxInput.setCustomValidity(reversed ? (window.enkaI18n?.t('შეამოწმეთ ფასის დიაპაზონი') || 'შეამოწმეთ ფასის დიაპაზონი') : '');
      hide('listingPriceError', priceForm.checkValidity());
      if (!priceForm.checkValidity()) { apply.disabled = true; return; }
      apply.disabled = false;
      const range = readPrices();
      syncSlider(range);
      commit(range, false, historyMethod);
    }

    async function load() {
      if (pending) return;
      pending = true;
      status.textContent = 'პროდუქტები იტვირთება…';
      grid.setAttribute('aria-busy', 'true');
      const retry = grid.querySelector('.listing-empty button');
      if (retry) { retry.setAttribute('aria-disabled', 'true'); retry.textContent = 'იტვირთება…'; }
      try {
        const data = await window.fetchCatalogCached();
        state = resolveState(state, data?.store || window.ENKA_STORE);
        setProducts(Array.isArray(data) ? data : data?.products);
        loaded = true;
        const retryHadFocus = grid.contains(document.activeElement);
        render({ animate: true });
        recordContext();
        saveURL('replaceState');
        if (retryHadFocus) grid.querySelector('.product-name, .listing-empty .listing-button')?.focus();
      } catch {
        grid.setAttribute('aria-busy', 'false');
        if (search && !state.query) return;
        count.textContent = '';
        count.hidden = true;
        status.textContent = 'კატალოგი ვერ ჩაიტვირთა. სცადეთ ხელახლა.';
        const retryHadFocus = grid.contains(document.activeElement);
        const button = emptyState('კატალოგი ვერ ჩაიტვირთა', 'შეამოწმეთ ინტერნეტკავშირი და სცადეთ ხელახლა.', 'ხელახლა ცდა', load, 'package');
        if (!reducedMotion.matches) grid.firstElementChild.classList.add('listing-result-enter');
        if (retryHadFocus) button.focus();
      } finally {
        pending = false;
      }
    }

    for (const input of [minInput, maxInput]) {
      input.addEventListener('input', () => {
        maxInput.setCustomValidity('');
        clearTimeout(priceTimer);
        priceTimer = setTimeout(updatePrices, 250);
      });
      input.addEventListener('change', () => updatePrices());
    }
    priceForm.addEventListener('submit', event => { event.preventDefault(); updatePrices(); });
    for (const [index, slider] of sliders.entries()) {
      const slide = () => {
        const [low, high] = priceDomain;
        const value = index ? Math.max(+slider.value, +sliders[0].value) : Math.min(+slider.value, +sliders[1].value);
        (index ? maxInput : minInput).value = value === (index ? high : low) ? '' : String(value);
        maxInput.setCustomValidity('');
        syncSlider(readPrices());
        updatePrices(sliderGesture ? 'replaceState' : 'pushState');
        sliderGesture = true;
      };
      slider.addEventListener('input', slide);
      slider.addEventListener('change', () => { slide(); sliderGesture = false; });
    }
    byId('priceSlider').addEventListener('pointerdown', event => {
      if (event.button !== 0 || sliders.includes(event.target)) return;
      const rect = sliders[0].getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - 10) / Math.max(1, rect.width - 20)));
      const value = Math.round(priceDomain[0] + fraction * (priceDomain[1] - priceDomain[0]));
      const slider = value <= (+sliders[0].value + +sliders[1].value) / 2 ? sliders[0] : sliders[1];
      slider.value = value;
      slider.focus({ preventScroll: true });
      slider.dispatchEvent(new Event('change'));
    });
    facets.addEventListener('change', event => {
      const { facet } = event.target.dataset;
      if (!facet) return;
      const current = state;
      const { checked, value } = event.target;
      const field = facet.startsWith('spec:') ? 'specs' : facet;
      const patch = field === 'sale' ? { sale: checked } : {
        [field]: checked ? [...current[field], value] : current[field].filter(key => key !== value)
      };
      commit(patch);
    });
    brandQuery.addEventListener('input', () => renderFacets(state));
    sortMenu.addEventListener('change', event => {
      if (!SORTS.has(event.target.value)) return;
      commit({ sort: event.target.value });
    });
    sortMenu.addEventListener('click', event => {
      if (event.target.type !== 'radio') return;
      sortMenu.open = false;
      sort.focus({ preventScroll: true });
    });
    sortMenu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { sortMenu.open = false; sort.focus(); }
    });
    document.addEventListener('pointerdown', event => { if (!sortMenu.contains(event.target)) sortMenu.open = false; });
    document.addEventListener('focusin', event => { if (!sortMenu.contains(event.target)) sortMenu.open = false; });
    byId('resetFilters').addEventListener('click', resetFilters);
    byId('loadMoreBtn').addEventListener('click', () => commit({ page: state.page + 1 }, true));

    pills.addEventListener('click', event => {
      const link = event.target.closest('a[data-listing-field]');
      if (!link || !isPlainClick(event)) return;
      event.preventDefault();
      const field = link.dataset.listingField;
      if (modalOpen()) window.closeAppModal(modal);
      commit({ specs: [], [field]: link.dataset.listingValue, ...(field === 'category' ? { sub: 'all' } : {}) });
    });
    filterButton.addEventListener('click', event => {
      byId('listingMobileFacets').append(facets);
      brandQuery.value = '';
      syncPrices(state);
      renderFacets(state);
      window.openAppModal(modal, event.currentTarget);
    });
    byId('mobileResetBtn').addEventListener('click', () => {
      clearTimeout(priceTimer);
      brandQuery.value = '';
      commit(EMPTY_FILTERS);
      syncPrices(state);
    });
    apply.addEventListener('click', () => {
      updatePrices();
      if (priceForm.reportValidity()) window.closeAppModal(modal);
    });
    modal.addEventListener('modal:close', () => {
      if (!mobilePositions) return;
      const before = mobilePositions;
      mobilePositions = undefined;
      if (before.size && grid.firstElementChild?.classList.contains('listing-empty')) {
        grid.firstElementChild.classList.add('listing-result-enter');
      }
      const entering = [...grid.children].filter(card => card.dataset.productId && !before.has(card));
      animateCards(before, entering);
    });
    function resizeListing() {
      const next = listingPageSize();
      if (pageSize === next) return;
      pageSize = next;
      if (loaded) {
        render({ writePrices: false });
        saveURL('replaceState');
      }
    }
    tablet.addEventListener('change', () => { if (!wide.matches) resizeListing(); });
    wide.addEventListener('change', event => {
      let open = false;
      if (event.matches) {
        open = modalOpen();
        if (open) window.closeAppModal(modal);
        sidebar.append(facets);
        brandQuery.value = '';
        syncPrices(state);
      }
      resizeListing();
      if (open) sort.focus({ preventScroll: true });
    });

    byId('gridToggleBtn').addEventListener('click', event => {
      const before = previousEnd && !reducedMotion.matches ? capturePositions() : null;
      const single = grid.classList.toggle('listing-grid--single');
      animateCards(before);
      event.currentTarget.setAttribute('aria-pressed', String(single));
      hide('gridIconCompact', single);
      hide('gridIconSingle', !single);
      try { localStorage.setItem('catalogGrid', single ? 'single' : 'compact'); } catch { /* Optional preference. */ }
    });
    try { if (localStorage.getItem('catalogGrid') === 'single') byId('gridToggleBtn').click(); } catch { /* Optional preference. */ }

    grid.addEventListener('animationend', event => {
      if (event.animationName === 'listing-result-enter') event.target.classList.remove('listing-result-enter');
    });
    reducedMotion.addEventListener('change', event => {
      if (!event.matches) return;
      mobilePositions = undefined;
      previewMotion?.cancel();
      for (const card of grid.children) {
        cardMotion.get(card)?.cancel();
        card.classList.remove('listing-result-enter');
      }
    });

    window.addEventListener('popstate', () => {
      if (modal.classList.contains('active')) window.closeAppModal(modal);
      clearTimeout(priceTimer);
      state = readState(window.location.search, mode);
      if (searchInput) searchInput.value = state.query;
      render({ animate: true });
      if (!loaded && (!search || state.query)) load();
    });
    window.addEventListener('enka:prices-change', event => {
      setProducts(event.detail.products);
      if (loaded) { render({ writePrices: false }); saveURL('replaceState'); }
    });
    window.addEventListener('enka:store-change', () => {
      state = resolveState(state);
      previousContext = undefined;
      if (loaded) { render(); saveURL('replaceState'); }
    });

    render();
    window.enkaI18n?.ready?.then(updateHeading);
    if (!search || state.query) {
      const ready = load();
      window.EnkaPageTransition?.hold(ready);
    }
  }
  window.CatalogListing = { readState, routeURL, priceRange, prepareProducts, selectProducts, mount };
})();
