document.addEventListener('DOMContentLoaded', () => {
  const section = document.getElementById('recentlyViewedSection');
  const track = document.getElementById('recentScroll');
  const status = document.getElementById('recentStatus');
  const retry = document.getElementById('recentRetry');
  if (!section || !track) return;

  async function load() {
    let ids;
    try { ids = JSON.parse(localStorage.getItem('recentIds') || '[]'); } catch { ids = []; }
    if (!Array.isArray(ids) || !ids.length) { section.hidden = true; return; }
    ids = [...new Set(ids.filter(id => typeof id === 'string' || typeof id === 'number').map(String))].slice(0, 12);
    section.hidden = false;
    retry.hidden = true;
    section.setAttribute('aria-busy', 'true');
    status.textContent = 'პროდუქტები იტვირთება…';
    try {
      const { products } = await window.fetchCatalogCached();
      const selected = ids.map(id => products.find(p => String(p.id) === id || String(p.sku) === id)).filter(Boolean);
      track.innerHTML = selected.map(p => window.createProductCardHTML(p, 'rec')).join('');
      status.textContent = '';
      section.hidden = !selected.length;
      window.syncFavButtons?.();
    } catch {
      status.textContent = 'პროდუქტები ვერ ჩაიტვირთა. გთხოვთ, სცადოთ ხელახლა.';
      retry.hidden = false;
    } finally {
      section.removeAttribute('aria-busy');
      window.bindProductCarousel?.('recentScroll', 'recentArrowLeft', 'recentArrowRight');
    }
  }
  retry.addEventListener('click', load);
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  window.addEventListener('storage', event => { if (event.key === 'recentIds' || event.key === null) load(); });
  load();
});
