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
  const topics = new Map();
  function updateTopics() {
    topics.clear();
    for (const [id, category] of Object.entries(window.CATALOG_STRUCTURE || {})) {
      const path = '/category/' + encodeURIComponent(id) + '/';
      topics.set('category:' + id, { title: category.title, path });
      category.subs?.forEach(sub => {
        topics.set('sub:' + sub.id, { title: sub.name, path: path + encodeURIComponent(sub.id) + '/' });
      });
    }
  }
  updateTopics();
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
      const topic = topics.get(row.key);
      const title = t(topic?.title || 'კიდევ მეტი თქვენთვის');
      const heading = topic
        ? `<a href="${esc(window.enkaRoute?.(topic.path) || topic.path)}" class="no-underline underline-offset-4 hover:text-accent hover:underline focus-visible:text-accent focus-visible:underline">${esc(title)}</a>`
        : esc(title);
      section.setAttribute('aria-labelledby', prefix + '-title');
      const arrow = (direction, label) => `<button type="button" id="${prefix}-${direction}" class="carousel-arrow hidden min-[641px]:inline-flex" aria-label="${esc(t(label))}" aria-controls="${prefix}-track" disabled>${window.EnkaIcons.render(direction === 'left' ? 'chevron-left' : 'chevron-right', 18)}</button>`;
      section.innerHTML = `<div class="mb-5 flex items-center justify-between gap-4">
        <h2 id="${prefix}-title" class="text-[length:22px] font-semibold leading-snug tracking-tight text-[color:light-dark(var(--color-slate-900),var(--color-night-ink))]">${heading}</h2>
        <div class="flex shrink-0 gap-2">
          ${arrow('left', 'წინა პროდუქტები')}
          ${arrow('right', 'შემდეგი პროდუქტები')}
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
    more.className = 'min-h-11 rounded-media bg-brand px-6 py-3 text-sm font-semibold text-white';
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
  window.addEventListener('enka:store-change', () => { updateTopics(); rebuild(); });
  window.addEventListener('enka:prices-change', event => { catalog=event.detail.products; rebuild(); });
  window.addEventListener('enka:personalization-choice', rebuild);
  window.addEventListener('pageshow', event => { if (event.persisted) rebuild(); });
  async function load() {
    if (loading) return;
    loading = true; retry.hidden = true; root.setAttribute('aria-busy', 'true');
    if (!catalog) status.textContent = t('პროდუქტები იტვირთება…');
    try {
      const data = await window.fetchCatalogCached();
      catalog = data.products; stale = false; rebuild();
    } catch {
      stale = true;
      if (!catalog) {
        try { catalog = JSON.parse(document.getElementById('recommendationCatalog').textContent); } catch { /* Show the retry state below. */ }
      }
      rebuild(); retry.hidden = false;
      if (!catalog) status.textContent = t('კატალოგი ვერ ჩაიტვირთა. სცადეთ ხელახლა.');
    } finally { loading = false; root.removeAttribute('aria-busy'); }
  }
  retry.addEventListener('click', load);
  if ('IntersectionObserver' in window) {
    const nearby = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      nearby.disconnect();
      load();
    }, { rootMargin: '700px 0px' });
    nearby.observe(root);
  } else load();
});
