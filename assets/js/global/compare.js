(() => {
  'use strict';

  const modal = document.getElementById('compareModal');
  if (!modal) return;
  const panel = modal.querySelector('.compare-panel');
  const title = document.getElementById('compareModalTitle');
  const status = document.getElementById('compareStatus');
  const results = document.getElementById('compareResults');
  const noSpecs = document.getElementById('compareNoSpecs');
  const retry = document.getElementById('compareRetry');
  const browse = document.getElementById('compareBrowse');
  const footerCount = document.querySelector('[data-compare-count]');
  const currentId = document.getElementById('productData')?.dataset.id;
  const key = 'enka_compare';
  const fallbackImage = '/img/no-image.svg';
  const toggleSelector = '[data-compare-toggle]';
  const escape = window.escapeHTML;
  const locale = window.enkaI18n?.locale || 'ka';
  const missing = '<span aria-hidden="true">—</span><span class="sr-only">მითითებული არ არის</span>';
  let selection = new Set();
  let catalog;
  let loading = false;
  let failed = false;
  let storageAvailable = true;
  let money;

  function readSelection() {
    if (!storageAvailable) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      const ids = Array.isArray(saved) ? saved.filter(id => typeof id === 'string' && id.trim()) : [];
      selection = new Set(ids);
    } catch (error) {
      if (!(error instanceof SyntaxError)) storageAvailable = false;
    }
  }
  readSelection();
  window.enkaCompare = { has: id => selection.has(id) };

  function syncButtons() {
    for (const button of document.querySelectorAll(toggleSelector)) {
      const pressed = String(selection.has(button.dataset.compareToggle || currentId));
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    }
    footerCount.hidden = selection.size === 0;
    footerCount.textContent = selection.size ? '(' + selection.size + ')' : '';
  }
  if (selection.size) syncButtons();

  function setSelected(id, selected) {
    readSelection();
    selected ??= !selection.has(id);
    if (selected) selection.add(id);
    else selection.delete(id);
    if (storageAvailable) {
      try { localStorage.setItem(key, JSON.stringify([...selection])); }
      catch { storageAvailable = false; }
    }
    syncButtons();
    return selected;
  }

  function imageMarkup(product) {
    const images = Array.isArray(product.images) ? product.images : [product.image];
    const original = images.find(image => typeof image === 'string' && image.trim() && !/youtu(?:be\.com|\.be)/i.test(image));
    const source = window.safeProductImage(original);
    const srcset = window.EnkaCardImages?.srcset(source, product.cardImages?.[original]);
    return `<img class="compare-photo block size-full object-contain mix-blend-multiply dark:mix-blend-normal" src="${escape(source)}"${srcset ? ` srcset="${escape(srcset)}" sizes="(width < 640px) 42vw, 128px"` : ''} width="128" height="128" alt="" loading="lazy" decoding="async">`;
  }

  function productHeading(item, index) {
    const { id, product } = item;
    const labelId = 'compareProduct' + index;
    const remove = `<button type="button" class="absolute end-0.5 top-0.5 inline-grid size-11 place-items-center rounded-control text-slate-600 hover:text-slate-950 hover:bg-slate-100 cursor-pointer motion-safe:transition-colors" data-compare-remove="${escape(id)}" aria-label="შედარებიდან ამოღება" aria-describedby="${labelId}">${window.EnkaIcons.render('close', 16)}</button>`;
    const href = product && window.safeProductLink('/product/' + encodeURIComponent(id) + '/');
    const heading = product
      ? `<a href="${escape(href)}" class="flex flex-col gap-2 rounded-media text-ink hover:text-accent hover:underline underline-offset-4 focus-visible:outline-offset-[-2px]" data-compare-product="${escape(id)}"><span class="compare-image-frame">${imageMarkup(product)}</span><bdi id="${labelId}" data-catalog-content>${escape(product.name)}</bdi></a>`
      : `<div class="flex flex-col gap-2 text-muted"><span class="compare-image-frame"></span><span id="${labelId}">პროდუქტი აღარ არის კატალოგში <bdi class="block text-xs mt-1" data-catalog-content>${escape(id)}</bdi></span></div>`;
    return `<th role="columnheader" scope="col" aria-labelledby="${labelId}" class="relative flex min-w-0 flex-col text-[length:13px] font-semibold leading-snug">
      ${heading}${remove}
      <div class="mt-auto pt-1.5"><span class="sr-only">ფასი</span> <span data-compare-price="${escape(id)}" class="tabular-nums">${priceMarkup(product)}</span></div>
    </th>`;
  }

  function priceMarkup(product) {
    if (!product) return missing;
    const price = window.productPrice(product.price);
    if (!price) return '<span class="text-muted">ფასი ზუსტდება</span>';
    const oldPrice = window.productPrice(product.oldPrice);
    money ||= new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const format = value => `<bdi class="whitespace-nowrap">${money.format(value)} <span class="card-price-currency">₾</span></bdi>`;
    return `<strong class="text-base ${oldPrice > price ? 'text-accent' : 'text-ink'}">${format(price)}</strong>${oldPrice > price ? ` <del class="text-muted text-xs">${format(oldPrice)}</del>` : ''}`;
  }

  function renderTable(items) {
    const labels = new Map();
    for (const item of items) {
      item.specs = new Map();
      const specs = item.product?.specs;
      if (!specs || typeof specs !== 'object' || Array.isArray(specs)) continue;
      for (const [label, value] of Object.entries(specs)) {
        const key = label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
        if (!key || value == null || !String(value).trim()) continue;
        if (!labels.has(key)) labels.set(key, label);
        item.specs.set(key, value);
      }
    }
    const rows = [...labels].map(([key, label]) => `<tr role="row">
      <th role="rowheader" scope="row" class="compare-row-label font-medium text-muted" data-catalog-content><bdi>${escape(label)}</bdi></th>
      ${items.map(item => `<td role="cell">${item.specs.has(key) ? `<bdi data-catalog-content>${escape(item.specs.get(key))}</bdi>` : missing}</td>`).join('')}
    </tr>`).join('');
    noSpecs.hidden = labels.size !== 0;
    results.innerHTML = `<table role="table" aria-labelledby="compareModalTitle" class="compare-table text-[length:13px] leading-[1.55]">
      <thead role="rowgroup"><tr role="row"><td role="cell" class="compare-table-corner self-end pb-0.5 font-semibold text-ink">მახასიათებლები</td>${items.map(productHeading).join('')}</tr></thead>
      <tbody role="rowgroup">${rows}</tbody>
    </table>`;
  }

  function render() {
    const active = document.activeElement;
    const removeButtons = [...results.querySelectorAll('[data-compare-remove]')];
    const removeIndex = removeButtons.indexOf(active);
    const focusedId = active.dataset?.compareRemove ?? active.dataset?.compareProduct;
    const items = [...selection].map(id => ({ id, product: catalog?.get(id) }));
    const empty = items.length === 0;
    const showTable = !empty && Boolean(catalog);
    const info = empty ? 'მონიშნეთ მინიმუმ ორი პროდუქტი, რომ მათი ფასები და მახასიათებლები შეადაროთ.'
      : failed ? 'შედარებისთვის მონაცემები ვერ ჩაიტვირთა.'
        : loading ? 'პროდუქტები იტვირთება…'
          : items.length === 1 ? 'შედარებისთვის კიდევ ერთი პროდუქტი დაამატეთ.' : '';
    panel.style.setProperty('--compare-count', items.length);
    status.hidden = !info;
    status.textContent = info;
    retry.hidden = empty || !failed;
    results.hidden = !showTable;
    if (showTable) renderTable(items);
    else {
      noSpecs.hidden = true;
      results.replaceChildren();
    }
    if (focusedId !== undefined) {
      const buttons = [...results.querySelectorAll('[data-compare-remove]')];
      const replacement = [...results.querySelectorAll('[data-compare-remove], [data-compare-product]')].find(
        node => node.dataset.compareRemove === active.dataset.compareRemove && node.dataset.compareProduct === active.dataset.compareProduct
      );
      (replacement || buttons[Math.min(Math.max(0, removeIndex), buttons.length - 1)] || title).focus();
    }
  }

  function indexProducts(products) {
    return new Map(products.map(product => [String(product.id), product]));
  }

  async function load() {
    if (loading || !selection.size) {
      render();
      return;
    }
    loading = true;
    failed = false;
    render();
    try {
      const { products } = await window.fetchCatalogCached();
      catalog = indexProducts(products);
    } catch {
      failed = true;
    } finally {
      loading = false;
      if (modal.classList.contains('active')) render();
    }
  }

  function open(trigger) {
    const from = trigger.dataset.compareOpen;
    if (currentId && (from === 'product' || from === 'related')) setSelected(currentId, true);
    if (from === 'related' && selection.size === 1) {
      const related = document.querySelectorAll('#subcatScroll .product-card[data-product-id]');
      if (related.length === 1) setSelected(related[0].dataset.productId, true);
    }
    window.openAppModal(modal, trigger);
  }

  modal.addEventListener('modal:open', () => {
    results.scrollTo({ left: 0, top: 0 });
    if (currentId) {
      const subcategoryLink = document.querySelector('[data-breadcrumbs] .breadcrumb-current a');
      if (subcategoryLink) browse.href = subcategoryLink.href;
    }
    load();
  });
  retry.addEventListener('click', () => {
    title.focus({ preventScroll: true });
    load();
  });

  results.addEventListener('error', event => {
    const image = event.target;
    if (!image.matches?.('.compare-photo')) return;
    if (image.hasAttribute('srcset')) image.removeAttribute('srcset');
    else if (image.getAttribute('src') !== fallbackImage) image.src = fallbackImage;
  }, true);

  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-compare-open]');
    if (opener) {
      open(opener);
      return;
    }
    const remove = event.target.closest('[data-compare-remove]');
    if (remove) {
      setSelected(remove.dataset.compareRemove, false);
      render();
      return;
    }
    const toggle = event.target.closest(toggleSelector);
    if (!toggle) return;
    const id = toggle.dataset.compareToggle || currentId;
    if (!id) return;
    const selected = setSelected(id);
    if (selected) window.showToast?.('შედარებაში დამატებულია. გახსნა', { type: 'compare', open }, toggle);
    else window.showToast?.('ამოღებულია შედარებიდან');
  });

  function syncStorage() {
    readSelection();
    syncButtons();
    if (modal.classList.contains('active')) load();
  }
  window.addEventListener('storage', event => {
    if (storageAvailable && event.storageArea === localStorage && (event.key === key || event.key === null)) syncStorage();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) syncStorage();
  });
  window.addEventListener('enka:prices-change', event => {
    if (!catalog) return;
    catalog = indexProducts(event.detail.products);
    if (!modal.classList.contains('active')) return;
    for (const cell of results.querySelectorAll('[data-compare-price]')) {
      cell.innerHTML = priceMarkup(catalog.get(cell.dataset.comparePrice));
    }
  });
  document.documentElement.dataset.compareReady = '';
})();
