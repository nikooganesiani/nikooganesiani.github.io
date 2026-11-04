document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  function setupSearch(inputId, resultsId, clearId, submitId) {
    const input = document.getElementById(inputId);
    const clear = document.getElementById(clearId);
    const submit = document.getElementById(submitId);
    const results = document.getElementById(resultsId);
    if (!input || !results) return;
    const mobile = inputId === 'mobileSearchInput';
    const scope = input.closest('form') || input.parentElement;
    const form = input.closest('form');
    const status = document.createElement('span');
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-atomic', 'true');
    scope.append(status);
    const hint = document.createElement('span');
    hint.id = inputId + 'KeyboardHint';
    hint.className = 'sr-only';
    hint.textContent = 'შედეგებზე გადასასვლელად გამოიყენეთ ქვედა ისარი. დასახურად — Escape.';
    scope.append(hint);
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), hint.id].filter(Boolean).join(' '));
    input.setAttribute('aria-controls', resultsId);
    results.setAttribute('role', 'region');
    results.setAttribute('aria-label', 'ძიების შედეგები');
    results.hidden = true;
    let timer;
    let revision = 0;
    let lastQuery = '';
    let composing = false;

    function ownsFocus() {
      return scope.contains(document.activeElement) || results.contains(document.activeElement);
    }
    function positionResults() {
      if (mobile || results.hidden) return;
      const viewport = window.visualViewport;
      let bottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      const nav = document.getElementById('enka-mobile-nav')?.getBoundingClientRect();
      const top = results.getBoundingClientRect().top;
      if (nav?.height && nav.top > top) bottom = Math.min(bottom, nav.top);
      results.style.maxHeight = Math.max(80, Math.min(480, bottom - top - 12)) + 'px';
    }
    function show(visible) {
      results.hidden = !visible;
      if (mobile) results.style.display = visible ? 'flex' : 'none';
      if (visible) positionResults();
    }
    function dismiss() {
      ++revision;
      clearTimeout(timer);
      results.removeAttribute('aria-busy');
      show(false);
      status.textContent = '';
    }
    function message(text, retry = false) {
      results.replaceChildren();
      const node = document.createElement('p');
      node.className = 'search-message';
      node.textContent = text;
      results.append(node);
      if (retry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-retry';
        button.textContent = 'ხელახლა ცდა';
        button.addEventListener('click', () => { input.focus(); render(); });
        results.append(button);
      }
      status.textContent = text;
      show(true);
    }
    async function render() {
      clearTimeout(timer);
      const query = input.value.trim();
      const request = ++revision;
      clear?.classList.toggle('show', !!input.value);
      lastQuery = '';
      if (!query) { results.replaceChildren(); dismiss(); return; }
      if (!ownsFocus()) return;
      results.setAttribute('aria-busy', 'true');
      message('ძიება…');
      try {
        const { products } = await window.fetchCatalogCached();
        if (request !== revision || input.value.trim() !== query || !ownsFocus()) return;
        const found = products.filter(product => window.matchesCatalogSearch(product, query));
        results.removeAttribute('aria-busy');
        lastQuery = query;
        if (!found.length) { message('ვერაფერი მოიძებნა. სცადეთ სხვა სიტყვა.'); return; }
        const fragment = document.createDocumentFragment();
        found.slice(0, 6).forEach(product => {
          const link = document.createElement('a');
          link.className = 'search-result';
          link.href = '/product/' + encodeURIComponent(product.id) + '/';
          const image = document.createElement('img');
          const source = Array.isArray(product.images) ? product.images[0] : product.image;
          image.src = window.safeProductImage?.(source) || '/img/no-image.svg';
          image.alt = '';
          image.width = 56;
          image.height = 56;
          image.loading = 'lazy';
          image.decoding = 'async';
          image.onerror = () => { image.onerror = null; image.src = '/img/no-image.svg'; };
          const copy = document.createElement('div');
          copy.className = 'search-result-copy';
          const name = document.createElement('div');
          name.className = 'search-result-name';
          name.textContent = product.name;
          const price = document.createElement('div');
          price.className = 'search-result-price';
          const value = window.productPrice(product.price);
          const oldValue = window.productPrice(product.oldPrice);
          const money = amount => new Intl.NumberFormat('ka-GE', { maximumFractionDigits: 2 }).format(amount) + ' ₾';
          const current = document.createElement('strong');
          current.textContent = value > 0 ? money(value) : 'ფასი ზუსტდება';
          price.append(current);
          if (value > 0 && oldValue > value) {
            const old = document.createElement('del');
            old.textContent = money(oldValue);
            old.setAttribute('aria-label', 'ძველი ფასი: ' + money(oldValue));
            price.append(old);
          }
          copy.append(name, price);
          link.append(image, copy);
          fragment.append(link);
        });
        const all = document.createElement('a');
        all.href = '/search/?result=' + encodeURIComponent(query);
        all.className = 'search-all-results';
        all.textContent = 'ყველა შედეგი (' + found.length + ')';
        fragment.append(all);
        results.replaceChildren(fragment);
        results.scrollTop = 0;
        status.textContent = 'მოიძებნა: ' + found.length + '. ' + hint.textContent;
        show(true);
      } catch {
        if (request === revision && input.value.trim() === query && ownsFocus()) {
          results.removeAttribute('aria-busy');
          message('ძიება ვერ შესრულდა. შეამოწმეთ კავშირი.', true);
        }
      }
    }
    function searchPage() {
      const query = input.value.trim();
      if (query) { dismiss(); window.location.assign('/search/?result=' + encodeURIComponent(query)); }
      else input.focus();
    }
    function schedule() {
      dismiss();
      clear?.classList.toggle('show', !!input.value);
      if (!input.value.trim()) { lastQuery = ''; results.replaceChildren(); return; }
      if (!composing) timer = setTimeout(render, 180);
    }
    input.addEventListener('input', schedule);
    input.addEventListener('compositionstart', () => { composing = true; dismiss(); });
    input.addEventListener('compositionend', () => { composing = false; schedule(); });
    input.addEventListener('focus', () => {
      if (!input.value.trim()) return;
      if (lastQuery === input.value.trim() && results.children.length) show(true);
      else schedule();
    });
    input.addEventListener('keydown', event => {
      if (event.isComposing || composing) return;
      if (event.key === 'Enter' && !form) { event.preventDefault(); searchPage(); }
      else if (event.key === 'Escape') {
        if (!results.hidden) { event.preventDefault(); event.stopPropagation(); }
        dismiss();
      } else if (event.key === 'ArrowDown' && !results.hidden) {
        const first = results.querySelector('a, button');
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
      event.preventDefault();
      const links = [...results.querySelectorAll('a, button')];
      const index = links.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1);
      if (index < 0) input.focus();
      else links[Math.min(index, links.length - 1)]?.focus();
    });
    clear?.addEventListener('click', () => { input.value = ''; lastQuery = ''; results.replaceChildren(); dismiss(); clear.classList.remove('show'); input.focus(); });
    if (form) form.addEventListener('submit', event => { event.preventDefault(); if (!composing) searchPage(); });
    else submit?.addEventListener('click', searchPage);
    document.addEventListener('click', event => {
      // Opening a prefilled dialog focuses the field before the opener's click bubbles.
      if (mobile && event.target.closest?.('[aria-controls="searchModalMobile"]')) return;
      if (!scope.contains(event.target) && !results.contains(event.target)) dismiss();
    });
    function focusOut(event) {
      if (!scope.contains(event.relatedTarget) && !results.contains(event.relatedTarget)) dismiss();
    }
    scope.addEventListener('focusout', focusOut);
    if (!scope.contains(results)) results.addEventListener('focusout', focusOut);
    input.closest('.modal')?.addEventListener('modal:close', dismiss);
    window.addEventListener('resize', () => {
      if (!mobile && !scope.getClientRects().length) dismiss();
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

  const queryParams = new URLSearchParams(window.location.search);
  const query = ['result', 'q', 'search'].map(key => queryParams.get(key)?.trim()).find(Boolean)?.slice(0, 200);
  if (query) {
    for (const id of ['searchInput', 'mobileSearchInput']) {
      const input = document.getElementById(id);
      if (input) input.value = query;
    }
  }
  const header = setupSearch('searchInput', 'desktopSearchResults', 'desktopSearchClear', 'desktopSearchBtn');
  const mobile = setupSearch('mobileSearchInput', 'mobileSearchResults', 'mobileSearchClear', 'mobileSearchBtn');
  if (header && mobile) {
    for (const [source, target] of [[header, mobile], [mobile, header]]) {
      const sync = () => target.setValue(source.input.value);
      source.input.addEventListener('input', sync);
      source.clear?.addEventListener('click', sync);
    }
  }
});
