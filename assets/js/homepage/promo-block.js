(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 640px)');
  const rotationDelay = 5000;
  window.enkaInitPromoBlock = root => {
    root.enkaCleanup?.();
    const track = root.querySelector('[data-promo-track]');
    const slides = [...root.querySelectorAll('[data-promo-slide]')];
    const dots = [...root.querySelectorAll('[data-promo-dot]')];
    const steps = root.querySelectorAll('[data-promo-step]');
    const status = root.querySelector('[data-promo-status]');
    if (!track || slides.length < 2) return;
    const listeners = new AbortController();
    const { signal } = listeners;
    let current = 0;
    let settleTimer;
    let clickTimer;
    let rotationTimer;
    let pointer = null;
    let suppressClick = false;

    function clone(slide) {
      const copy = slide.cloneNode(true);
      copy.removeAttribute('data-promo-slide');
      copy.dataset.promoClone = '';
      copy.inert = true;
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelectorAll('img').forEach(image => {
        image.loading = 'lazy';
        image.fetchPriority = 'low';
      });
      return copy;
    }
    const before = clone(slides.at(-1));
    const after = clone(slides[0]);
    track.prepend(before);
    track.append(after);
    const loopSlides = [before, ...slides, after];

    function scrollTo(slide, behavior) {
      track.scrollTo({ left: slide.offsetLeft, behavior });
    }

    function sync(index, announce = false) {
      const focused = document.activeElement;
      const moveFocus = index !== current && slides[current].contains(focused);
      current = Math.max(0, Math.min(slides.length - 1, index));
      slides.forEach((slide, i) => { slide.inert = i !== current; slide.setAttribute('aria-hidden', String(i !== current)); });
      dots.forEach((dot, i) => { dot.setAttribute('aria-current', String(i === current)); dot.tabIndex = i === current ? 0 : -1; });
      if (moveFocus) slides[current].querySelector('a')?.focus({ preventScroll: true });
      if (announce && status) status.textContent = `${current + 1} / ${slides.length}: ${slides[current].dataset.title || ''}`;
    }
    function go(index, announce = true, destination = slides[index]) {
      sync(index, announce);
      scrollTo(destination || slides[current], reduced.matches ? 'instant' : 'smooth');
      scheduleRotation();
    }
    function scheduleRotation() {
      clearTimeout(rotationTimer);
      if (reduced.matches || document.hidden) return;
      rotationTimer = setTimeout(() => {
        if (pointer || root.contains(document.activeElement) || track.matches(':active')) {
          scheduleRotation();
          return;
        }
        const next = (current + 1) % slides.length;
        go(next, false, mobile.matches && next === 0 ? after : slides[next]);
      }, rotationDelay);
    }
    function settle() {
      if (pointer) return;
      const candidates = mobile.matches ? loopSlides : slides;
      const left = track.scrollLeft;
      const nearest = candidates.reduce((best, slide) =>
        Math.abs(slide.offsetLeft - left) < Math.abs(best.offsetLeft - left) ? slide : best
      );
      const index = nearest === before ? slides.length - 1 : nearest === after ? 0 : slides.indexOf(nearest);
      // The copies make the seam scrollable. Once snapped, land on the original.
      if (nearest !== slides[index]) scrollTo(slides[index], 'instant');
      if (index !== current) scheduleRotation();
      sync(index, index !== current);
    }
    dots.forEach((dot, index) => dot.addEventListener('click', () => go(index), { signal }));
    steps.forEach(button => button.addEventListener('click', () => {
      go((current + Number(button.dataset.promoStep) + slides.length) % slides.length);
    }, { signal }));
    root.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1);
      if (mobile.matches && index < 0) go(slides.length - 1, true, before);
      else if (mobile.matches && index >= slides.length) go(0, true, after);
      else go(index);
      if (event.target.closest('[data-promo-dot]')) dots[current]?.focus({ preventScroll: true });
    }, { signal });
    if ('onscrollend' in track) track.addEventListener('scrollend', settle, { signal });
    else track.addEventListener('scroll', () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 120);
    }, { passive: true, signal });
    track.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, scroll: track.scrollLeft, dragged: false };
    }, { signal });
    track.addEventListener('pointermove', event => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const distance = event.clientX - pointer.x;
      if (!pointer.dragged && Math.abs(distance) < 6) return;
      if (!pointer.dragged) { pointer.dragged = true; track.setPointerCapture(event.pointerId); track.dataset.dragging = 'true'; }
      event.preventDefault();
      track.scrollLeft = pointer.scroll - distance;
    }, { signal });
    function release() {
      if (!pointer) return;
      const dragged = pointer.dragged;
      pointer = null;
      delete track.dataset.dragging;
      if (dragged) {
        suppressClick = true;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { suppressClick = false; }, 200);
        settle();
        go(current, false);
      }
    }
    track.addEventListener('pointerup', release, { signal });
    track.addEventListener('pointercancel', release, { signal });
    track.addEventListener('lostpointercapture', release, { signal });
    track.addEventListener('pointerleave', () => { if (pointer && !pointer.dragged) release(); }, { signal });
    track.addEventListener('dragstart', event => event.preventDefault(), { signal });
    track.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } }, { capture: true, signal });
    const align = () => scrollTo(slides[current], 'instant');
    reduced.addEventListener('change', align, { signal });
    reduced.addEventListener('change', scheduleRotation, { signal });
    document.addEventListener('visibilitychange', scheduleRotation, { signal });
    mobile.addEventListener('change', align, { signal });
    const resizeObserver = new ResizeObserver(align);
    resizeObserver.observe(track);
    root.enkaCleanup = () => {
      listeners.abort();
      clearTimeout(settleTimer);
      clearTimeout(clickTimer);
      clearTimeout(rotationTimer);
      resizeObserver.disconnect();
      before.remove();
      after.remove();
      delete root.dataset.promoReady;
      delete track.dataset.dragging;
    };
    sync(0);
    align();
    root.dataset.promoReady = '';
    scheduleRotation();
  };
  document.querySelectorAll('[data-promo-block]').forEach(window.enkaInitPromoBlock);
})();
