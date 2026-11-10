document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const root = document.getElementById('recommendationsSection');
  if (!root || !window.enkaRecommendationEngine || !window.enkaPersonalization) return;
  const engine = window.enkaRecommendationEngine;
  const api = window.enkaPersonalization;
  const feed = document.getElementById('recommendationFeed');
  const status = document.getElementById('recommendationsStatus');
  const more = document.getElementById('recommendationsMore');
  const retry = document.getElementById('recommendationsRetry');
  const t = value => window.enkaI18n?.t(value) || value;
  const esc = window.escapeHTML;
  const structure = window.CATALOG_STRUCTURE || {};
  const labels = new Map();
  for (const [id, category] of Object.entries(structure)) {
    labels.set('category:' + id, category.title);
    category.subs?.forEach(sub => labels.set('sub:' + sub.id, sub.name));
  }
  // Only the incoming same-site navigation, without saving or exporting a browsing trail.
  const context = engine.navigationContext(document.referrer, location.origin, structure);
  let catalog = null;
  let rows = [];
  let cursor = 0;
  let revision = 0;
  let stale = false;
  let loading = false;
  let impressions;
  let pagination;
  const timers = new Map();
  const observed = new Set();
  function stopObserving() {
    impressions?.disconnect();
    timers.forEach(timer => clearTimeout(timer)); timers.clear(); observed.clear();
  }
  function observeCards() {
    if (!api.allowed() || !('IntersectionObserver' in window)) return;
    impressions ||= new IntersectionObserver(entries => {
      for (const entry of entries) {
        const card = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && document.visibilityState === 'visible') {
          if (!timers.has(card)) timers.set(card, setTimeout(() => {
            timers.delete(card);
            if (document.visibilityState === 'visible' && card.isConnected) api.impression(card.dataset.productId);
            impressions.unobserve(card);
          }, 1200));
        } else { clearTimeout(timers.get(card)); timers.delete(card); }
      }
    }, { threshold: [0, 0.5] });
    feed.querySelectorAll('.product-card').forEach(card => {
      if (!observed.has(card)) { observed.add(card); impressions.observe(card); }
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') stopObserving(); else observeCards();
  });
  function append(count = 2, focus = false) {
    let firstHeading;
    for (let i = 0; i < count && cursor < rows.length; i++) {
      const row = rows[cursor];
      const prefix = 'recommendation-' + revision + '-' + cursor++;
      const section = document.createElement('section');
      section.dataset.recommendationRow = row.key || 'discover';
      const title = t(labels.get(row.key) || 'კიდევ მეტი თქვენთვის');
      section.setAttribute('aria-labelledby', prefix + '-title');
      const arrowClass = 'hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30';
      const arrow = (direction, path, label) => `<button type="button" id="${prefix}-${direction}" class="${arrowClass}" aria-label="${esc(t(label))}" aria-controls="${prefix}-track" disabled><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="${path}"/></svg></button>`;
      section.innerHTML = `<div class="mb-5 flex items-center justify-between gap-4">
        <h2 id="${prefix}-title" class="text-[length:22px] font-semibold leading-snug tracking-tight text-slate-900">${esc(title)}</h2>
        <div class="flex shrink-0 gap-2">
          ${arrow('left', 'M15.7 4.3a1 1 0 0 1 0 1.4L9.4 12l6.3 6.3a1 1 0 0 1-1.4 1.4l-7-7a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 1.4 0', 'წინა პროდუქტები')}
          ${arrow('right', 'M8.3 4.3a1 1 0 0 1 1.4 0l7 7a1 1 0 0 1 0 1.4l-7 7a1 1 0 1 1-1.4-1.4L14.6 12 8.3 5.7a1 1 0 0 1 0-1.4', 'შემდეგი პროდუქტები')}
        </div>
      </div>
      <div id="${prefix}-track" class="product-carousel flex gap-6 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] pt-0.5 pb-2.5 [&::-webkit-scrollbar]:hidden max-[768px]:gap-4" tabindex="0" role="group" aria-label="${esc(title)}">
        ${row.items.map(({ product }) => window.createProductCardHTML(product, 'feed' + revision)).join('')}
      </div>`;
      feed.append(section);
      const track = prefix + '-track';
      section.querySelector('#' + prefix + '-left').addEventListener('click', () => window.scrollCarousel?.(track, -1));
      section.querySelector('#' + prefix + '-right').addEventListener('click', () => window.scrollCarousel?.(track, 1));
      window.bindProductCarousel?.(track, prefix + '-left', prefix + '-right');
      firstHeading ||= section.querySelector('h2');
    }
    window.syncFavButtons?.();
    observeCards();
    more.hidden = cursor >= rows.length;
    // Approaching the last row loads more during ordinary vertical browsing.
    pagination?.disconnect();
    const lastRow = feed.lastElementChild;
    if (lastRow && cursor < rows.length) pagination?.observe(lastRow);
    status.textContent = stale ? t('ნაჩვენებია შენახული კატალოგი. ფასი და მარაგი გადაამოწმეთ პროდუქტის გვერდზე.') : '';
    if (!rows.length) status.textContent = t('პროდუქტები ამჟამად არ არის ხელმისაწვდომი.');
    if (focus && firstHeading) { firstHeading.tabIndex = -1; firstHeading.focus({ preventScroll: true }); }
  }
  if ('IntersectionObserver' in window) {
    pagination = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && cursor < rows.length) append();
    }, { rootMargin: '500px 0px' });
  } else {
    // Keep the whole finite catalog accessible in browsers without observation support.
    more.className = 'min-h-11 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white';
  }
  more.addEventListener('click', () => append(2, true));
  function rebuild() {
    if (!catalog) return;
    stopObserving(); pagination?.disconnect();
    rows = engine.rows(engine.rank(catalog, api.snapshot(), { context, popular: (root.dataset.popularIds || '').split(',') }));
    cursor = 0; revision++;
    feed.replaceChildren();
    append(4);
  }
  window.addEventListener('enka:personalization-change', rebuild);
  window.addEventListener('enka:personalization-choice', rebuild);
  window.addEventListener('pageshow', event => { if (event.persisted) rebuild(); });
  async function load() {
    if (loading) return;
    loading = true; retry.hidden = true; root.setAttribute('aria-busy', 'true');
    try {
      const data = await window.fetchCatalogCached();
      catalog = data.products; stale = false; rebuild();
    } catch {
      stale = true;
      if (!catalog) {
        try { catalog = JSON.parse(document.getElementById('recommendationCatalog').textContent); } catch { /* Keep server-rendered rows. */ }
      }
      rebuild(); retry.hidden = false;
      if (!catalog) status.textContent = t('კატალოგი ვერ ჩაიტვირთა. სცადეთ ხელახლა.');
    } finally { loading = false; root.removeAttribute('aria-busy'); }
  }
  retry.addEventListener('click', load);
  load();
});
