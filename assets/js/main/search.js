document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const historyKey = 'enka_search_history_v1';
  const historyLimit = 6;
  const fallbackImage = '/img/no-image.svg';
  const interactiveRow = 'group flex items-center gap-2.5 min-w-0 rounded-xl text-ink';
  const hoverUnderline = 'underline-offset-4 hover:underline';
  const cleanQuery = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 200) : '';
  const queryKey = query => query.normalize('NFC').toLocaleLowerCase('ka');
  const localize = path => window.enkaRoute?.(path) || path;
  const searchUrl = query => localize('/search/?result=' + encodeURIComponent(query));
  const productUrl = id => localize('/product/' + encodeURIComponent(id) + '/');
  let history = { queries: [], products: [] };
  let storageUnavailable = false;

  function productImage(product) {
    return (Array.isArray(product.images) && product.images[0]) || product.image;
  }

  function productEntry(product) {
    const id = ['string', 'number'].includes(typeof product?.id) ? String(product.id) : '';
    const name = typeof product?.name === 'string' ? product.name.trim().slice(0, 400) : '';
    if (!id || id === '.' || id === '..' || !name) return null;
    return { id, name, image: window.safeProductImage?.(productImage(product)) || fallbackImage };
  }

  function readHistory() {
    if (storageUnavailable) return history;
    try {
      const saved = JSON.parse(window.localStorage.getItem(historyKey));
      history = {
        queries: Array.isArray(saved?.queries) ? saved.queries.map(cleanQuery).filter(Boolean).slice(0, historyLimit) : [],
        products: Array.isArray(saved?.products) ? saved.products.map(productEntry).filter(Boolean).slice(0, historyLimit) : []
      };
    } catch { /* Keep the in-memory history if storage is unavailable. */ }
    return history;
  }

  function updateHistory(kind, update) {
    readHistory();
    history[kind] = update(history[kind]).slice(0, historyLimit);
    if (storageUnavailable) return;
    try { window.localStorage.setItem(historyKey, JSON.stringify(history)); } catch { storageUnavailable = true; }
  }

  function rememberQuery(query) {
    updateHistory('queries', items => [query, ...items.filter(item => queryKey(item) !== queryKey(query))]);
  }

  function rememberProduct(product) {
    const entry = productEntry(product);
    if (entry) updateHistory('products', items => [entry, ...items.filter(item => item.id !== entry.id)]);
  }

  function trackLink(element, handler) {
    element.addEventListener('click', handler);
    element.addEventListener('auxclick', event => { if (event.button === 1) handler(event); });
  }

  window.EnkaSearchHistory = {
    trackResults(grid, getProduct) {
      trackLink(grid, event => {
        const card = event.target.closest?.('a[href]')?.closest('.product-card');
        if (card && grid.contains(card)) rememberProduct(getProduct(card));
      });
    }
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function icon(name, size = 18, trigger = 'auto') {
    const element = node('span', 'inline-flex shrink-0');
    element.innerHTML = window.EnkaIcons?.render(name, size, trigger) || '';
    return element;
  }

  function thumbnail(source) {
    const image = node('img', 'shrink-0 size-13 p-[3px] rounded-[.625rem] border border-line bg-white object-contain [.site-search-entry_&]:size-9.5');
    image.src = window.safeProductImage?.(source) || fallbackImage;
    image.alt = '';
    image.width = 52;
    image.height = 52;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.onerror = () => { image.onerror = null; image.src = fallbackImage; };
    return image;
  }

  function section(title) {
    const group = node('section', 'site-search-section min-w-0 px-3 pt-2.5 pb-3 max-[640px]:px-4');
    const heading = node('div', 'flex items-center justify-between gap-2 min-h-11 px-1.5');
    heading.append(node('h3', 'm-0 text-sm font-[650]', title));
    group.append(heading);
    return { group, heading };
  }

  function resultLink(product, money) {
    const link = node('a', 'search-result px-2 py-1.5 text-sm font-semibold [&+.search-result]:mt-0.5 ' + interactiveRow);
    link.href = productUrl(product.id);
    const copy = node('div', 'min-w-0');
    const name = node('div', 'search-result-name w-fit max-w-full wrap-anywhere group-focus-visible:underline ' + hoverUnderline, product.name);
    const price = node('div', 'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5 text-accent-strong text-sm tabular-nums');
    const value = window.productPrice(product.price);
    const oldValue = window.productPrice(product.oldPrice);
    price.append(node('strong', hoverUnderline, value > 0 ? money(value) : 'ფასი ზუსტდება'));
    if (value > 0 && oldValue > value) {
      const old = node('del', 'text-muted text-xs font-normal underline-offset-4 hover:[text-decoration-line:underline_line-through]', money(oldValue));
      old.setAttribute('aria-label', 'ძველი ფასი: ' + money(oldValue));
      price.append(old);
    }
    copy.append(name, price);
    link.append(thumbnail(productImage(product)), copy);
    trackLink(link, () => rememberProduct(product));
    return link;
  }

  function setupSearch(inputId, prefix) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(prefix + 'Results');
    if (!input || !results) return;
    const clear = document.getElementById(prefix + 'Clear');
    const mobile = inputId === 'mobileSearchInput';
    const form = input.closest('form');
    const status = node('span', 'sr-only');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-atomic', 'true');
    const hint = node('span', 'sr-only', 'შედეგებზე გადასასვლელად გამოიყენეთ ქვედა ისარი. დასახურად — Escape.');
    hint.id = inputId + 'KeyboardHint';
    form.append(status, hint);
    input.setAttribute('aria-describedby', hint.id);
    input.setAttribute('aria-controls', results.id);
    let timer;
    let revision = 0;
    let lastQuery = '';
    let composing = false;

    function positionResults() {
      if (mobile || results.hidden) return;
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      results.style.maxHeight = Math.max(80, Math.min(480, bottom - results.getBoundingClientRect().top - 12)) + 'px';
    }

    function show(visible) {
      results.hidden = !visible;
      if (visible) positionResults();
    }

    function invalidate() {
      ++revision;
      clearTimeout(timer);
      results.removeAttribute('aria-busy');
      status.textContent = '';
    }

    function dismiss() {
      invalidate();
      show(false);
    }

    function display(content, footer) {
      const scroll = node('div', 'site-search-scroll flex-auto min-h-0 overflow-auto overscroll-contain [scrollbar-width:thin] scroll-py-2');
      if (mobile) scroll.className += ' modal-body';
      scroll.append(content);
      results.replaceChildren(scroll);
      if (footer) results.append(footer);
      show(true);
    }

    function historySection(kind, items) {
      const queries = kind === 'queries';
      const { group, heading } = section(queries ? 'ბოლო ძიებები' : 'ძიებული პროდუქტები');
      const clearGroup = node('button', 'min-h-11 px-2 rounded-lg text-accent text-xs font-semibold cursor-pointer ' + hoverUnderline, 'გასუფთავება');
      clearGroup.type = 'button';
      clearGroup.setAttribute('aria-label', queries ? 'ბოლო ძიებების გასუფთავება' : 'პროდუქტების ისტორიის გასუფთავება');
      clearGroup.addEventListener('click', () => {
        updateHistory(kind, () => []);
        renderHistory();
        input.focus();
      });
      heading.append(clearGroup);
      const list = node('ul');
      items.forEach((item, index) => {
        const row = node('li', 'grid grid-cols-[minmax(0,1fr)_2.75rem] items-center');
        const link = node('a', 'site-search-entry min-h-11.5 px-2 py-1 text-sm font-[550] [&>span:first-child]:text-muted ' + interactiveRow);
        link.href = queries ? searchUrl(item) : productUrl(item.id);
        const name = queries ? item : window.ENKA_CATALOG_LABELS?.[item.id]?.name || item.name;
        const label = node('span', 'min-w-0 line-clamp-2 wrap-anywhere group-focus-visible:underline ' + hoverUnderline, name);
        label.setAttribute('translate', 'no');
        link.append(queries ? icon('clock') : thumbnail(item.image), label);
        trackLink(link, () => { if (queries) rememberQuery(item); else rememberProduct(item); });

        const remove = node('button', 'site-search-remove grid place-items-center min-h-11 rounded-[.625rem] text-muted cursor-pointer hover:text-ink');
        remove.type = 'button';
        remove.setAttribute('aria-label', queries ? 'ძიების წაშლა ისტორიიდან' : 'პროდუქტის წაშლა ისტორიიდან');
        label.id = inputId + kind + index;
        remove.setAttribute('aria-describedby', label.id);
        remove.append(icon('close', 16, 'click'));
        remove.addEventListener('click', () => {
          updateHistory(kind, stored => stored.filter(entry => queries ? queryKey(entry) !== queryKey(item) : entry.id !== item.id));
          const group = renderHistory()[kind];
          const buttons = group?.querySelectorAll('.site-search-remove');
          (buttons?.[Math.min(index, buttons.length - 1)] || input).focus();
        });
        row.append(link, remove);
        list.append(row);
      });
      group.append(list);
      return group;
    }

    function renderHistory() {
      lastQuery = '';
      const { queries, products } = readHistory();
      const groups = {};
      if (queries.length) groups.queries = historySection('queries', queries);
      if (products.length) groups.products = historySection('products', products);
      const sections = Object.values(groups);
      if (sections.length) {
        const content = node('div', 'site-search-history');
        if (sections.length > 1) content.className += ' @min-[32rem]:grid @min-[32rem]:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] [&>section+section]:border-t [&>section+section]:border-line @min-[32rem]:[&>section+section]:border-t-0 @min-[32rem]:[&>section+section]:border-s';
        content.append(...sections);
        display(content);
      } else {
        const categories = document.getElementById('searchCategories')?.content;
        if (categories) display(categories.cloneNode(true));
        else { results.replaceChildren(); show(false); }
      }
      return groups;
    }

    function message(text, { loading = false, retry = false } = {}) {
      const box = node('div', 'grid justify-items-center gap-2.5 px-4 py-6 text-muted text-sm text-center');
      const symbol = node('span', 'grid place-items-center size-11 rounded-[.875rem] bg-surface text-accent');
      symbol.append(icon(loading ? 'loader' : 'search', 20));
      box.append(symbol, node('p', '', text));
      if (retry) {
        const button = node('button', 'min-h-11 px-3 rounded-[.625rem] text-accent-strong font-semibold cursor-pointer ' + hoverUnderline, 'ხელახლა ცდა');
        button.type = 'button';
        button.addEventListener('click', () => {
          input.focus();
          message('ძიება…', { loading: true });
          render();
        });
        box.append(button);
      }
      display(box);
      if (!loading) status.textContent = text;
    }

    async function render() {
      clearTimeout(timer);
      const query = cleanQuery(input.value);
      if (!query || !form.contains(document.activeElement)) return;
      const request = ++revision;
      const isCurrent = () => request === revision && cleanQuery(input.value) === query && form.contains(document.activeElement);
      results.setAttribute('aria-busy', 'true');
      try {
        const { products } = await window.fetchCatalogCached();
        if (!isCurrent()) return;
        const found = products.filter(product => window.matchesCatalogSearch(product, query));
        results.removeAttribute('aria-busy');
        lastQuery = query;
        if (!found.length) {
          message('ვერაფერი მოიძებნა. სცადეთ სხვა სიტყვა.');
          return;
        }
        const format = new Intl.NumberFormat(window.enkaI18n?.locale || 'ka', { maximumFractionDigits: 2 });
        const count = format.format(found.length);
        const group = node('div', 'px-3 py-2 max-[640px]:px-4');
        found.slice(0, 6).forEach(product => group.append(resultLink(product, amount => format.format(amount) + ' ₾')));

        const all = node('a', 'site-search-all flex flex-none items-center justify-center min-h-12 px-3 py-2 border-t border-line text-accent-strong text-sm font-[650] focus-visible:underline ' + hoverUnderline, 'ყველა შედეგის ნახვა');
        all.href = searchUrl(query);
        trackLink(all, () => rememberQuery(query));
        display(group, all);
        status.textContent = 'მოიძებნა: ' + count;
      } catch {
        if (!isCurrent()) return;
        results.removeAttribute('aria-busy');
        message('ძიება ვერ შესრულდა. შეამოწმეთ კავშირი.', { retry: true });
      }
    }

    function searchPage() {
      const query = cleanQuery(input.value);
      if (!query) { input.focus(); return; }
      rememberQuery(query);
      dismiss();
      const url = searchUrl(query);
      if (window.EnkaPageTransition) window.EnkaPageTransition.navigate(url);
      else window.location.assign(url);
    }

    function schedule() {
      invalidate();
      lastQuery = '';
      clear?.classList.toggle('show', !!input.value);
      if (composing) return;
      if (!cleanQuery(input.value)) { renderHistory(); return; }
      message('ძიება…', { loading: true });
      timer = setTimeout(render, 180);
    }

    function reopen() {
      if (!results.hidden) return;
      if (lastQuery && lastQuery === cleanQuery(input.value)) show(true);
      else schedule();
    }

    input.addEventListener('input', schedule);
    input.addEventListener('compositionstart', () => { composing = true; dismiss(); });
    input.addEventListener('compositionend', () => { composing = false; schedule(); });
    input.addEventListener('focus', reopen);
    input.addEventListener('click', reopen);
    function navigationLinks() {
      const links = [...results.querySelectorAll('a')];
      return links.length ? links : [...results.querySelectorAll('button')];
    }
    input.addEventListener('keydown', event => {
      if (event.isComposing || composing) return;
      if (event.key === 'Escape') {
        if (!results.hidden) { event.preventDefault(); event.stopPropagation(); }
        dismiss();
      } else if (event.key === 'ArrowDown' && !results.hidden) {
        const [first] = navigationLinks();
        if (first) { event.preventDefault(); first.focus(); }
      }
    });
    results.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        input.focus();
        dismiss();
        return;
      }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const links = navigationLinks();
      const current = links.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const index = current + (event.key === 'ArrowDown' ? 1 : -1);
      if (index < 0) input.focus();
      else links[Math.min(index, links.length - 1)]?.focus();
    });
    clear?.addEventListener('click', () => {
      input.value = '';
      input.focus();
      schedule();
    });
    form.addEventListener('submit', event => { event.preventDefault(); if (!composing) searchPage(); });
    if (!mobile) document.addEventListener('click', event => { if (!form.contains(event.target)) dismiss(); });
    form.addEventListener('focusout', event => { if (!form.contains(event.relatedTarget)) dismiss(); });
    if (mobile) form.addEventListener('focusin', event => { if (!form.contains(event.relatedTarget)) reopen(); });
    input.closest('.modal')?.addEventListener('modal:close', dismiss);
    window.addEventListener('resize', () => {
      if (!mobile && !form.getClientRects().length) dismiss();
      else positionResults();
    }, { passive: true });
    window.visualViewport?.addEventListener('resize', positionResults, { passive: true });
    window.visualViewport?.addEventListener('scroll', positionResults, { passive: true });
    clear?.classList.toggle('show', !!input.value);
    return { input, clear, setValue(value) {
      input.value = value;
      lastQuery = '';
      results.replaceChildren();
      dismiss();
      clear?.classList.toggle('show', !!value);
    } };
  }

  const params = new URLSearchParams(window.location.search);
  const query = ['result', 'q', 'search'].map(key => cleanQuery(params.get(key))).find(Boolean);
  if (query) {
    for (const id of ['searchInput', 'mobileSearchInput']) {
      const input = document.getElementById(id);
      if (input) input.value = query;
    }
  }
  const desktop = setupSearch('searchInput', 'desktopSearch');
  const mobile = setupSearch('mobileSearchInput', 'mobileSearch');
  if (desktop && mobile) {
    for (const [source, target] of [[desktop, mobile], [mobile, desktop]]) {
      const sync = () => target.setValue(source.input.value);
      source.input.addEventListener('input', sync);
      source.clear?.addEventListener('click', sync);
    }
  }
});
