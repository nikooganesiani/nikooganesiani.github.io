document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const track = document.getElementById('mainGalleryTrack');
  const modalTrack = document.getElementById('modalTrack');
  const modal = document.getElementById('imageZoomModal');
  if (!track || !modalTrack || !modal) return;
  const slides = [...track.children];
  const positions = new WeakMap();
  const behavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const current = el => Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / (el.clientWidth || 1))));
  function go(el, index, instant = false) {
    index = (index + slides.length) % slides.length;
    positions.set(el, index);
    el.scrollTo({ left: index * el.clientWidth, behavior: instant ? 'auto' : behavior() });
  }
  function sync(el, selector, counterId) {
    const index = current(el);
    positions.set(el, index);
    document.querySelectorAll(selector).forEach((thumb, i) => {
      thumb.classList.toggle('active', i === index);
      thumb.setAttribute('aria-pressed', String(i === index));
    });
    const counter = document.getElementById(counterId);
    if (counter) counter.textContent = (index + 1) + ' / ' + slides.length;
    if (el === track) slides.forEach((slide, i) => { slide.tabIndex = i === index ? 0 : -1; });
  }
  document.addEventListener('click', event => {
    const photo = event.target.closest('[data-photo-index]');
    const thumb = event.target.closest('[data-gallery-index]');
    const arrow = event.target.closest('[data-gallery-direction]');
    const zoomThumb = event.target.closest('[data-zoom-index]');
    const zoomArrow = event.target.closest('[data-zoom-direction]');
    if (photo) {
      window.openAppModal(modal, photo);
      go(modalTrack, photo.hasAttribute('data-expand-current') ? current(track) : Number(photo.dataset.photoIndex), true);
      sync(modalTrack, '[data-zoom-index]', 'zoomCounter');
    } else if (thumb) go(track, Number(thumb.dataset.galleryIndex));
    else if (arrow) go(track, current(track) + Number(arrow.dataset.galleryDirection));
    else if (zoomThumb) go(modalTrack, Number(zoomThumb.dataset.zoomIndex));
    else if (zoomArrow) go(modalTrack, current(modalTrack) + Number(zoomArrow.dataset.zoomDirection));
    else if (event.target === modal) window.closeAppModal(modal);
  });
  [track, modalTrack].forEach(el => {
    let scheduled = false;
    const update = () => sync(el, el === track ? '[data-gallery-index]' : '[data-zoom-index]', el === track ? 'galleryCounter' : 'zoomCounter');
    el.addEventListener('scroll', () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { update(); scheduled = false; });
    }, { passive: true });
    el.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      go(el, event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current(el) + (event.key === 'ArrowRight' ? 1 : -1));
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
      const index = positions.get(el) || 0;
      go(el, index, true);
      update();
    }).observe(el);
    update();
  });
  modal.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    go(modalTrack, event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current(modalTrack) + (event.key === 'ArrowRight' ? 1 : -1));
  });

  const sectionLinks = [...document.querySelectorAll('.product-section-nav a')];
  const syncSectionLinks = () => {
    const selected = sectionLinks.find(link => link.hash === window.location.hash) || sectionLinks[0];
    sectionLinks.forEach(link => {
      link.classList.toggle('is-active', link === selected);
      if (link === selected) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  window.addEventListener('hashchange', syncSectionLinks);
  syncSectionLinks();

  const specs = document.getElementById('specsBlock');
  const expand = document.getElementById('btnExpandSpecs');
  if (specs && expand) {
    const measure = () => {
      const overflowing = specs.scrollHeight > 328;
      expand.hidden = !overflowing;
      specs.classList.toggle('is-collapsible', overflowing);
    };
    expand.addEventListener('click', () => {
      const expanded = expand.getAttribute('aria-expanded') !== 'true';
      expand.setAttribute('aria-expanded', String(expanded));
      specs.classList.toggle('expanded', expanded);
      document.getElementById('specsExpandLabel').textContent = expanded ? 'ნაკლების ნახვა' : 'ყველა მახასიათებელი';
    });
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
  const bar = document.getElementById('mobileBottomBar');
  const buy = document.getElementById('submitInlineOrderBtn');
  document.documentElement.style.setProperty('--mobile-buy-bar-height', '82px');
  let barUpdatePending = false;
  const updateBuyBar = () => {
    if (barUpdatePending) return;
    barUpdatePending = true;
    requestAnimationFrame(() => {
      const rect = buy.getBoundingClientRect();
      const navigation = document.getElementById('enka-mobile-nav');
      const bottomInset = navigation?.getBoundingClientRect().height || 0;
      const viewportHeight = Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
      bar.dataset.formVisible = String(rect.width > 0 && rect.top >= 0 && rect.bottom <= viewportHeight - bottomInset);
      barUpdatePending = false;
    });
  };
  window.addEventListener('scroll', updateBuyBar, { passive: true });
  window.addEventListener('resize', updateBuyBar, { passive: true });
  window.visualViewport?.addEventListener('resize', updateBuyBar, { passive: true });
  if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(updateBuyBar).observe(buy);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateBuyBar).observe(document.getElementById('inlineOrderForm'));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    document.documentElement.style.setProperty('--mobile-buy-bar-height', Math.ceil(bar.getBoundingClientRect().height + 6) + 'px');
  }).observe(bar);
  updateBuyBar();

  document.querySelectorAll('.product-video-play').forEach(link => link.addEventListener('click', event => {
    const container = link.closest('[data-video-id]');
    const id = container.dataset.videoId;
    if (!/^[\w-]{11}$/.test(id)) return;
    event.preventDefault();
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    iframe.title = 'პროდუქტის ვიდეო განხილვა';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    container.replaceChildren(iframe);
    iframe.focus();
  }));
});
