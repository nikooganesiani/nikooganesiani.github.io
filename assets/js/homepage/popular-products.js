document.addEventListener('DOMContentLoaded', () => {
  const section = document.getElementById('popularSection');
  const track = document.getElementById('popularScroll');
  const status = document.getElementById('popularStatus');
  const retry = document.getElementById('popularRetry');
  if (!section || !track) return;
  const ids = [...new Set((section.dataset.popularIds || '').split(',').filter(Boolean))];

  async function load() {
    retry.hidden = true;
    section.setAttribute('aria-busy', 'true');
    status.textContent = track.children.length ? '' : 'პროდუქტები იტვირთება…';
    try {
      const { products } = await window.fetchCatalogCached();
      const selected = ids.map(id => products.find(p => String(p.id) === id || String(p.sku) === id))
        .filter(p => p && p.stockStatus !== 'out_of_stock');
      track.innerHTML = selected.map(p => window.createProductCardHTML(p, 'pop')).join('');
      status.textContent = selected.length ? '' : 'ამჟამად პოპულარული პროდუქტები არ არის.';
      window.syncFavButtons?.();
    } catch {
      status.textContent = track.children.length
        ? 'მონაცემების განახლება ვერ მოხერხდა. მიმდინარე ფასი იხილეთ პროდუქტის გვერდზე.'
        : 'პროდუქტები ვერ ჩაიტვირთა. გთხოვთ, სცადოთ ხელახლა.';
      retry.hidden = false;
    } finally {
      section.removeAttribute('aria-busy');
      window.bindProductCarousel?.('popularScroll', 'popularArrowLeft', 'popularArrowRight');
    }
  }
  retry.addEventListener('click', load);
  load();
});
