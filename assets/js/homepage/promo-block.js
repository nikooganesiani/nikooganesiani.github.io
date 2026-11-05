(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  window.fetchCatalogCached().then(({ products }) => {
    document.querySelectorAll('[data-promo-slide][data-product-id]').forEach(slide => {
      const product = products.find(item => String(item.id) === slide.dataset.productId);
      if (!product) return;
      slide.dataset.title = product.name;
      slide.querySelector('[data-product-name]').textContent = product.name;
      slide.querySelector('[data-promo-image]').alt = product.name;
      const price = Number(product.price);
      const oldPrice = Number(product.oldPrice);
      if (price > 0) slide.querySelector('[data-hero-price]').textContent = product.price + ' ₾';
      const old = slide.querySelector('[data-hero-old-price]');
      old.hidden = !(oldPrice > price && price > 0);
      old.textContent = product.oldPrice + ' ₾';
    });
  }).catch(() => { /* Build-time product data remains available. */ });
  document.querySelectorAll('[data-promo-block]').forEach(root => {
    const track = root.querySelector('[data-promo-track]');
    const slides = [...root.querySelectorAll('[data-promo-slide]')];
    const dots = [...root.querySelectorAll('[data-promo-dot]')];
    const worm = root.querySelector('[data-promo-worm]');
    const status = root.querySelector('[data-promo-status]');
    if (!track || slides.length < 2) return;
    let current = 0;
    let settleTimer;
    let pointer = null;
    let suppressClick = false;
    const offset = index => slides[index].offsetLeft - slides[0].offsetLeft;

    function sync(index, announce = false) {
      current = Math.max(0, Math.min(slides.length - 1, index));
      slides.forEach((slide, i) => { slide.inert = i !== current; slide.setAttribute('aria-hidden', String(i !== current)); });
      dots.forEach((dot, i) => { dot.setAttribute('aria-current', String(i === current)); dot.tabIndex = i === current ? 0 : -1; });
      if (worm && dots[current]) worm.style.transform = `translateX(${dots[current].offsetLeft}px)`;
      if (announce && status) status.textContent = `${current + 1} / ${slides.length}: ${slides[current].dataset.title || ''}`;
    }
    function go(index, announce = true) {
      sync(index, announce);
      track.scrollTo({ left: offset(current), behavior: reduced.matches ? 'auto' : 'smooth' });
    }
    function settle() {
      if (pointer) return;
      let nearest = 0;
      slides.forEach((_, i) => { if (Math.abs(offset(i) - track.scrollLeft) < Math.abs(offset(nearest) - track.scrollLeft)) nearest = i; });
      sync(nearest);
    }
    dots.forEach((dot, index) => dot.addEventListener('click', () => go(index)));
    root.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1);
      go(index);
      dots[current]?.focus({ preventScroll: true });
    });
    track.addEventListener('scroll', () => { clearTimeout(settleTimer); settleTimer = setTimeout(settle, 120); }, { passive: true });
    track.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, scroll: track.scrollLeft, dragged: false };
    });
    track.addEventListener('pointermove', event => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const distance = event.clientX - pointer.x;
      if (!pointer.dragged && Math.abs(distance) < 6) return;
      if (!pointer.dragged) { pointer.dragged = true; track.setPointerCapture(event.pointerId); track.dataset.dragging = 'true'; }
      event.preventDefault();
      track.scrollLeft = pointer.scroll - distance;
    });
    function release() {
      if (!pointer) return;
      const dragged = pointer.dragged;
      pointer = null;
      delete track.dataset.dragging;
      if (dragged) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 200);
        settle();
        go(current);
      }
    }
    track.addEventListener('pointerup', release);
    track.addEventListener('pointercancel', release);
    track.addEventListener('lostpointercapture', release);
    track.addEventListener('pointerleave', () => { if (pointer && !pointer.dragged) release(); });
    track.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } }, true);
    reduced.addEventListener('change', () => { track.scrollTo({ left: offset(current), behavior: 'instant' }); });
    new ResizeObserver(() => { track.scrollTo({ left: offset(current), behavior: 'instant' }); sync(current); }).observe(track);
    sync(0);
  });
})();
