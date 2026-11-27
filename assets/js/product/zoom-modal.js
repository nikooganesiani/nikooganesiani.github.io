document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const track = document.getElementById('mainGalleryTrack');
  const modalTrack = document.getElementById('modalTrack');
  const modal = document.getElementById('imageZoomModal');
  if (!track || !modalTrack || !modal) return;
  const slides = [...track.children];
  const positions = new WeakMap();
  const behavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const direction = el => getComputedStyle(el).direction === 'rtl' ? -1 : 1;
  const current = el => Math.max(0, Math.min(slides.length - 1, Math.round(Math.abs(el.scrollLeft) / (el.clientWidth || 1))));
  function go(el, index, instant = false) {
    index = (index + slides.length) % slides.length;
    positions.set(el, index);
    el.scrollTo({ left: direction(el) * index * el.clientWidth, behavior: instant ? 'auto' : behavior() });
  }
  function handleNavigation(el, event) {
    const { key } = event;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === 'Home') go(el, 0);
    else if (key === 'End') go(el, slides.length - 1);
    else go(el, current(el) + direction(el) * (key === 'ArrowRight' ? 1 : -1));
  }
  function sync(el, selector, counterId) {
    const index = current(el);
    positions.set(el, index);
    document.querySelectorAll(selector).forEach((thumb, i) => {
      const thumbIndex = Number(thumb.dataset.galleryIndex ?? thumb.dataset.zoomIndex ?? i);
      thumb.classList.toggle('active', thumbIndex === index);
      thumb.setAttribute('aria-pressed', String(thumbIndex === index));
    });
    const counter = document.getElementById(counterId);
    if (counter) counter.textContent = (index + 1) + ' / ' + slides.length;
    if (el === modalTrack) {
      const thumb = document.querySelector('#modalThumbStrip .active');
      const strip = thumb?.parentElement;
      if (strip?.clientWidth) {
        const offset = thumb.getBoundingClientRect().left - strip.getBoundingClientRect().left;
        if (offset < 0 || offset + thumb.offsetWidth > strip.clientWidth) {
          strip.scrollTo({ left: strip.scrollLeft + offset - (strip.clientWidth - thumb.offsetWidth) / 2, behavior: 'instant' });
        }
      }
    }
    if (el === track) slides.forEach((slide, i) => { slide.tabIndex = i === index ? 0 : -1; });
  }
  document.addEventListener('click', event => {
    const photo = event.target.closest('[data-photo-index]');
    const thumb = event.target.closest('[data-gallery-index]');
    const zoomThumb = event.target.closest('[data-zoom-index]');
    const zoomArrow = event.target.closest('[data-zoom-direction]');
    if (photo) {
      window.openAppModal(modal, photo);
      go(modalTrack, Number(photo.dataset.photoIndex), true);
      sync(modalTrack, '[data-zoom-index]', 'zoomCounter');
    } else if (thumb) go(track, Number(thumb.dataset.galleryIndex));
    else if (zoomThumb) go(modalTrack, Number(zoomThumb.dataset.zoomIndex));
    else if (zoomArrow) go(modalTrack, current(modalTrack) + Number(zoomArrow.dataset.zoomDirection));
  });
  [track, modalTrack].forEach(el => {
    let scheduled = false;
    const update = () => sync(el, el === track ? '[data-gallery-index]' : '[data-zoom-index]', el === track ? 'galleryCounter' : 'zoomCounter');
    el.addEventListener('scroll', () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { update(); scheduled = false; });
    }, { passive: true });
    el.addEventListener('keydown', event => handleNavigation(el, event));
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
      const index = positions.get(el) || 0;
      go(el, index, true);
      update();
    }).observe(el);
    update();
  });
  modal.addEventListener('keydown', event => handleNavigation(modalTrack, event));

  const specs = document.getElementById('specsBlock');
  const expand = document.getElementById('btnExpandSpecs');
  if (specs && expand) {
    const measure = () => {
      const overflowing = specs.scrollHeight > 328;
      expand.hidden = !overflowing;
      specs.classList.toggle('is-collapsible', overflowing);
    };
    const setExpanded = expanded => {
      expand.setAttribute('aria-expanded', String(expanded));
      specs.classList.toggle('expanded', expanded);
      const label = expanded ? 'ნაკლების ნახვა' : 'მეტის ნახვა';
      document.getElementById('specsExpandLabel').textContent = window.enkaI18n?.t(label) || label;
    };
    expand.addEventListener('click', () => {
      setExpanded(expand.getAttribute('aria-expanded') !== 'true');
    });
    // Reveal the full list before the browser follows the section anchor.
    document.querySelectorAll('a[href="#productSpecifications"]').forEach(link => {
      link.addEventListener('click', () => setExpanded(true));
    });
    const revealLinkedSpecs = () => {
      if (window.location.hash === '#productSpecifications') setExpanded(true);
    };
    window.addEventListener('hashchange', revealLinkedSpecs);
    revealLinkedSpecs();
    measure();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(specs.querySelector('dl'));
    document.fonts?.ready.then(measure);
  }

  window.scrollToForm = function() {
    const form = document.getElementById('inlineOrderForm');
    form.scrollIntoView({ behavior: behavior(), block: 'center' });
    const target = form.dataset.available === 'true' ? document.getElementById('inlineName') : document.getElementById('productAvailability');
    target?.setAttribute('tabindex', target.matches('input') ? '0' : '-1');
    target?.focus({ preventScroll: true });
  };
  document.querySelectorAll('.product-video-play, [data-product-video-trigger]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const container = document.querySelector('#productVideo [data-video-id]');
    const id = container?.dataset.videoId;
    if (!/^[\w-]{11}$/.test(id)) return;
    if (link.classList.contains('product-video-play')) event.preventDefault();
    const existing = container.querySelector('iframe');
    if (existing) {
      existing.focus({ preventScroll: true });
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    iframe.title = window.enkaI18n?.t('პროდუქტის ვიდეო განხილვა') || 'პროდუქტის ვიდეო განხილვა';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    container.replaceChildren(iframe);
    iframe.focus({ preventScroll: true });
  }));
});
