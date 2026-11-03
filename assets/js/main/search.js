document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  function setupSearch(inputId, resultsId, clearId, submitId) {
    const input = document.getElementById(inputId);
    const clear = document.getElementById(clearId);
    const submit = document.getElementById(submitId);
    if (!input) return;
    let results = document.getElementById(resultsId);
    const mobile = inputId === 'mobileSearchInput';
    if (!results) {
      results = document.createElement('div');
      results.id = resultsId;
      results.className = 'absolute top-[calc(100%+10px)] left-0 right-0 bg-white rounded-2xl shadow-xl border border-slate-200 z-[1000] max-h-[min(400px,65vh)] overflow-y-auto p-2';
      input.parentElement.append(results);
    }
    results.hidden = true;
    results.setAttribute('aria-label', 'ძიების შედეგები');
    input.setAttribute('aria-controls', resultsId);
    input.setAttribute('aria-expanded', 'false');
    let timer;
    let revision = 0;
    let lastQuery = '';

    function show(visible) {
      results.hidden = !visible;
      if (mobile) results.style.display = visible ? 'flex' : 'none';
      input.setAttribute('aria-expanded', String(visible));
    }
    function message(text, retry = false) {
      results.replaceChildren();
      const node = document.createElement('p');
      node.className = 'search-message';
      node.setAttribute('role', 'status');
      node.textContent = text;
      results.append(node);
      if (retry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'p-3 text-sm font-semibold text-blue-700 underline';
        button.textContent = 'ხელახლა ცდა';
        button.addEventListener('click', render);
        results.append(button);
      }
      show(true);
    }
    async function render() {
      const query = input.value.trim();
      const request = ++revision;
      clear?.classList.toggle('show', !!query);
      if (!query) { results.replaceChildren(); show(false); return; }
      message('ძიება…');
      try {
        const { products } = await window.fetchCatalogCached();
        if (request !== revision || input.value.trim() !== query) return;
        const direct = query.toLocaleLowerCase('ka');
        const normalized = window.normalizeQuery?.(query) || direct;
        const found = products.filter(product => product.stockStatus !== 'out_of_stock' &&
          [product.name, product.brand, product.sku, product.id].some(value =>
            String(value || '').toLowerCase().includes(direct) || String(value || '').toLowerCase().includes(normalized)));
        if (!found.length) { message('ვერაფერი მოიძებნა. სცადეთ სხვა სიტყვა.'); return; }
        const fragment = document.createDocumentFragment();
        found.slice(0, 8).forEach(product => {
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
          image.onerror = () => { image.onerror = null; image.src = '/img/no-image.svg'; };
          const copy = document.createElement('div');
          copy.className = 'search-result-copy';
          const name = document.createElement('div');
          name.className = 'search-result-name';
          name.textContent = product.name;
          const price = document.createElement('div');
          price.className = 'search-result-price';
          price.textContent = String(product.price || '').replace(/₾/g, '').trim() + ' ₾';
          copy.append(name, price);
          link.append(image, copy);
          fragment.append(link);
        });
        const all = document.createElement('a');
        all.href = '/search/?result=' + encodeURIComponent(query);
        all.className = 'block p-3 text-center text-sm font-semibold text-blue-700';
        all.textContent = `ყველა შედეგი (${found.length})`;
        fragment.append(all);
        results.replaceChildren(fragment);
        lastQuery = query;
        show(true);
      } catch {
        if (request === revision && input.value.trim() === query) message('ძიება ვერ შესრულდა. შეამოწმეთ კავშირი.', true);
      }
    }
    function searchPage() {
      const query = input.value.trim();
      if (query) window.location.assign('/search/?result=' + encodeURIComponent(query));
      else input.focus();
    }
    input.addEventListener('input', () => {
      ++revision;
      clearTimeout(timer);
      clear?.classList.toggle('show', !!input.value);
      if (!input.value.trim()) { results.replaceChildren(); show(false); return; }
      timer = setTimeout(render, 180);
    });
    input.addEventListener('focus', () => {
      if (input.value.trim() && lastQuery === input.value.trim() && results.children.length) show(true);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); searchPage(); }
      else if (event.key === 'Escape') { ++revision; clearTimeout(timer); show(false); }
      else if (event.key === 'ArrowDown' && !results.hidden) {
        event.preventDefault();
        results.querySelector('a')?.focus();
      }
    });
    results.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); input.focus(); show(false); return; }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      const links = [...results.querySelectorAll('a, button')];
      const index = links.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1);
      if (index < 0) input.focus();
      else links[Math.min(index, links.length - 1)]?.focus();
    });
    clear?.addEventListener('click', () => { input.value = ''; render(); input.focus(); });
    submit?.addEventListener('click', searchPage);
    document.addEventListener('click', event => {
      if (!input.parentElement.contains(event.target) && !results.contains(event.target)) { ++revision; clearTimeout(timer); show(false); }
    });
    input.parentElement.addEventListener('focusout', event => {
      if (!mobile && !input.parentElement.contains(event.relatedTarget)) show(false);
    });
  }

  setupSearch('searchInput', 'desktopSearchResults', 'desktopSearchClear', 'desktopSearchBtn');
  setupSearch('mobileSearchInput', 'mobileSearchResults', 'mobileSearchClear', 'mobileSearchBtn');
  const query = new URLSearchParams(window.location.search).get('result');
  if (query) {
    const input = document.getElementById('searchInput');
    if (input) input.value = query;
    document.getElementById('desktopSearchClear')?.classList.add('show');
  }
});
