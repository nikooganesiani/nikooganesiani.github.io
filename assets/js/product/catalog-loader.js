document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const dataElement = document.getElementById('productData');
  if (!dataElement) return;
  const dataset = dataElement.dataset;
  const form = document.getElementById('inlineOrderForm');
  const fields = document.getElementById('inlineOrderFields');
  const button = document.getElementById('submitInlineOrderBtn');
  const status = document.getElementById('inlineOrderStatus');
  const retry = document.getElementById('productCatalogRetry');
  const snapshot = {
    id: dataset.id, sku: dataset.sku, name: dataset.name, price: dataset.price,
    oldPrice: dataset.oldPrice, stockStatus: dataset.stock, images: [dataset.image]
  };
  const parsePrice = window.productPrice;
  const stockOf = window.productStock;
  const available = window.isProductAvailable;
  const money = value => new Intl.NumberFormat((window.enkaI18n?.locale || 'ka'), { maximumFractionDigits: 2 }).format(value) + ' ₾';

  function applyProduct(product) {
    const price = parsePrice(product.price);
    const oldPrice = parsePrice(product.oldPrice);
    const stock = stockOf(product.stockStatus);
    window.currentProduct = { ...product, id: String(product.id), price: String(price), oldPrice: oldPrice > price ? String(oldPrice) : '', stockStatus: stock };
    dataset.price = String(price);
    dataset.oldPrice = window.currentProduct.oldPrice;
    dataset.stock = stock;
    dataset.name = product.name;
    form.dataset.available = String(available(product));
    fields.disabled = !available(product);
    fields.hidden = !available(product);
    document.getElementById('productAlternatives').hidden = available(product);
    button.disabled = !available(product);
    document.querySelectorAll('[data-product-name]').forEach(el => { el.textContent = product.name; });
    document.title = product.name + ' — ENKA Electronics';
    const titleMeta = document.querySelector('meta[property="og:title"]');
    if (titleMeta) titleMeta.content = document.title;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta && product.description !== undefined) descriptionMeta.content = product.description;
    if (product.description !== undefined) {
      const description = document.querySelector('.product-description');
      if (description) description.textContent = product.longDescription || product.description || '';
    }
    if (product.specs && typeof product.specs === 'object') {
      const entries = Object.entries(product.specs);
      document.querySelectorAll('[data-product-highlight-index]').forEach(row => {
        const entry = entries[Number(row.dataset.productHighlightIndex)];
        if (entry) { row.querySelector('dt').textContent = entry[0]; row.querySelector('dd').textContent = entry[1]; }
      });
      const specs = document.querySelector('#specsBlock dl');
      if (specs) specs.replaceChildren(...Object.entries(product.specs).map(([label, value]) => {
        const row = document.createElement('div'); row.className = 'product-spec-row';
        const term = document.createElement('dt'); term.textContent = label;
        const detail = document.createElement('dd'); detail.textContent = String(value);
        row.append(term, detail); return row;
      }));
    }
    document.querySelectorAll('[data-product-price]').forEach(el => { el.textContent = price > 0 ? money(price) : 'ფასი ზუსტდება'; });
    document.querySelectorAll('[data-product-old-price]').forEach(el => {
      el.textContent = money(oldPrice);
      el.hidden = !(oldPrice > price && price > 0);
    });
    const labels = { in_stock: 'მარაგშია', out_of_stock: 'მარაგი ამოიწურა', soon: 'მალე იქნება', unavailable: 'ხელმისაწვდომობა ზუსტდება' };
    document.querySelectorAll('[data-product-stock]').forEach(el => {
      el.dataset.stock = stock;
      el.textContent = labels[stock];
    });
    const sale = document.getElementById('saleBadge');
    sale.hidden = !(oldPrice > price && price > 0);
    sale.textContent = sale.hidden ? '' : '−' + Math.round((oldPrice - price) / oldPrice * 100) + '%';
    const availability = document.getElementById('productAvailability');
    availability.hidden = available(product);
    availability.textContent = price > 0 ? labels[stock] + '. იხილეთ მსგავსი პროდუქტები ან დაგვიკავშირდით.' : 'ფასისა და ხელმისაწვდომობის დასაზუსტებლად დაგვიკავშირდით.';
    const mobile = document.getElementById('mobileBuyLabel');
    mobile.textContent = available(product) ? 'ყიდვა' : 'დეტალურად';
    document.querySelectorAll('[data-product-delivery]').forEach(el => { el.hidden = !available(product); });
    document.querySelectorAll('.product-mobile-stock').forEach(el => { el.hidden = available(product); });
    const schemaElement = document.getElementById('productSchema');
    if (schemaElement) {
      try {
        const schema = JSON.parse(schemaElement.textContent);
        schema.name = product.name;
        if (product.description !== undefined) schema.description = product.description;
        if (price > 0) schema.offers = {
          '@type': 'Offer', url: document.querySelector('link[rel="canonical"]').href,
          priceCurrency: 'GEL', price, availability: 'https://schema.org/' + (available(product) ? 'InStock' : 'OutOfStock'), itemCondition: 'https://schema.org/NewCondition'
        };
        else delete schema.offers;
        schemaElement.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
        const priceMeta = document.querySelector('meta[property="product:price:amount"]');
        if (priceMeta) priceMeta.content = String(price);
      } catch { /* The visible product does not depend on optional metadata. */ }
    }
  }

  function render(prefix, products) {
    const section = document.getElementById(prefix + 'Section');
    const track = document.getElementById(prefix + 'Scroll');
    if (!section || !track) return;
    track.innerHTML = products.map(p => window.createProductCardHTML(p, prefix)).join('');
    section.hidden = products.length === 0;
    window.bindProductCarousel?.(prefix + 'Scroll', prefix + 'ArrowLeft', prefix + 'ArrowRight');
  }

  let loading = false;
  async function load() {
    if (loading || window.enkaOrderPending) return;
    loading = true;
    retry.hidden = true;
    button.disabled = true;
    status.textContent = 'ფასი და ხელმისაწვდომობა ახლდება…';
    try {
      const { products } = await window.fetchCatalogCached();
      // A slug is canonical; SKU collisions must never resolve another product.
      const product = products.find(p => String(p.id) === String(snapshot.id));
      applyProduct(product || { ...snapshot, stockStatus: 'unavailable' });
      status.textContent = product ? '' : 'ეს პროდუქტი ამჟამად არ არის ხელმისაწვდომი. დაგვიკავშირდით ან აირჩიეთ მსგავსი.';
      let recent = [];
      try {
        const saved = JSON.parse(localStorage.getItem('recentIds') || '[]');
        if (Array.isArray(saved)) recent = saved.filter(id => typeof id === 'string' || typeof id === 'number').map(String);
      } catch { /* History is optional. */ }
      recent = [...new Set(recent)].filter(id => id !== String(snapshot.id)).slice(0, 19);
      render('recent', recent.map(id => products.find(p => String(p.id) === id)).filter(Boolean).slice(0, 12));
      try { localStorage.setItem('recentIds', JSON.stringify([String(snapshot.id), ...recent])); } catch { /* Storage is optional. */ }
      const others = products.filter(p => String(p.id) !== String(snapshot.id) && available(p));
      const sub = dataset.subcat ? others.filter(p => Array.isArray(p.subcategories) && p.subcategories.includes(dataset.subcat)).slice(0, 12) : [];
      const used = new Set(sub.map(p => String(p.id)));
      const cat = dataset.cat ? others.filter(p => Array.isArray(p.categories) && p.categories.includes(dataset.cat) && !used.has(String(p.id))).slice(0, 12) : [];
      render('subcat', sub);
      render('cat', cat);
      window.syncFavButtons?.();
      document.getElementById('recommendationsStatus').textContent = '';
    } catch {
      // Keep a fully usable build-time product instead of an empty purchase panel.
      applyProduct(window.currentProduct || snapshot);
      status.textContent = 'მონაცემების განახლება ვერ მოხერხდა. ფასსა და ხელმისაწვდომობას ოპერატორი დაგიდასტურებთ.';
      retry.hidden = false;
      document.getElementById('recommendationsStatus').textContent = 'ნაჩვენებია შენახული რეკომენდაციები.';
    } finally {
      loading = false;
      ['subcat', 'cat', 'recent'].forEach(prefix => window.bindProductCarousel?.(prefix + 'Scroll', prefix + 'ArrowLeft', prefix + 'ArrowRight'));
    }
  }
  applyProduct(snapshot);
  retry.addEventListener('click', load);
  window.refreshProduct = load;
  load();
});
