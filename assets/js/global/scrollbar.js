(() => {
  'use strict';
  const root = document.documentElement;
  const pageRail = document.getElementById('pageScrollbar');
  if (!pageRail) return;
  const media = matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine) and (forced-colors: none)');
  const bars = new Map();
  let frame = 0;
  let discover = true;

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  const resize = new ResizeObserver(schedule);

  function create(scroller, rail) {
    const isPage = scroller === root;
    if (!rail) {
      rail = pageRail.cloneNode(true);
      rail.removeAttribute('id');
      rail.firstElementChild.removeAttribute('id');
      rail.dataset.scrollbarOverlay = '';
      rail.className = rail.className.replace('inset-y-1 ', '').replace('right-0 ', '').replace('z-[900]', 'z-[20001]');
      // Keep dialog controls inside its active/inert boundary and focus scope.
      (scroller.closest('.modal') || document.body).append(rail);
    }
    const thumb = rail.firstElementChild;
    const bar = { rail, thumb, scroller, isPage, travel: 0, range: 0, drag: null };
    const top = () => isPage ? scrollY : scroller.scrollTop;
    const scroll = value => (isPage ? window : scroller).scrollTo({ top: value, behavior: 'instant' });
    rail.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !bar.travel) return;
      event.preventDefault();
      if (event.target !== thumb) {
        scroll((event.clientY - rail.getBoundingClientRect().top - thumb.clientHeight / 2) / bar.travel * bar.range);
      }
      bar.drag = { y: event.clientY, top: top() };
      rail.dataset.dragging = 'true';
      rail.setPointerCapture(event.pointerId);
    });
    rail.addEventListener('pointermove', event => {
      if (bar.drag && bar.travel) scroll(bar.drag.top + (event.clientY - bar.drag.y) / bar.travel * bar.range);
    });
    const stop = () => { bar.drag = null; delete rail.dataset.dragging; };
    rail.addEventListener('pointerup', stop);
    rail.addEventListener('pointercancel', stop);
    rail.addEventListener('lostpointercapture', stop);
    // The rail is a sibling overlay, so forward wheel input to its own scroller.
    rail.addEventListener('wheel', event => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1;
      scroll(top() + event.deltaY * unit);
    }, { passive: false });
    if (!isPage) {
      resize.observe(scroller);
      for (const child of scroller.children) resize.observe(child);
    }
    bars.set(scroller, bar);
    return bar;
  }

  function findScrollers() {
    discover = false;
    if (!media.matches) return;
    // Discover actual vertical scroll containers, including dialogs added later.
    for (const element of document.body.querySelectorAll('*')) {
      if (bars.has(element) || element.closest('#pageScrollbar, [data-scrollbar-overlay]')) continue;
      const style = getComputedStyle(element);
      // Horizontal tracks deliberately hide their bars; do not add vertical overlays.
      if (style.scrollbarWidth === 'none' || !/^(auto|scroll)$/.test(style.overflowY)) continue;
      create(element);
    }
  }

  function update() {
    frame = 0;
    const enabled = media.matches;
    root.toggleAttribute('data-overlay-scrollbar', enabled);
    if (discover) findScrollers();
    for (const [element, bar] of bars) {
      if (!element.isConnected) {
        resize.unobserve(element);
        for (const child of element.children) resize.unobserve(child);
        bar.rail.remove();
        bars.delete(element);
        continue;
      }
      if (!bar.isPage) element.toggleAttribute('data-custom-scrollbar', enabled);
      const height = element.clientHeight;
      bar.range = Math.max(0, element.scrollHeight - height);
      let visible = enabled && bar.range > 1;
      if (root.classList.contains('modal-open')) {
        visible = visible && !bar.isPage && !!element.closest('.modal.active');
      }
      if (!bar.isPage && visible) {
        const rect = element.getBoundingClientRect();
        let clipTop = Math.max(0, rect.top);
        let clipBottom = Math.min(innerHeight, rect.bottom);
        let clipRight = Math.min(innerWidth, rect.right);
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (!/(auto|scroll|hidden|clip)/.test(style.overflowY + style.overflowX)) continue;
          const bounds = parent.getBoundingClientRect();
          clipTop = Math.max(clipTop, bounds.top);
          clipBottom = Math.min(clipBottom, bounds.bottom);
          clipRight = Math.min(clipRight, bounds.right);
        }
        visible = rect.width > 0 && clipBottom - clipTop > 16 && rect.right <= clipRight + 1;
        bar.rail.style.top = (clipTop + 4) + 'px';
        bar.rail.style.left = (rect.right - 16 - element.clientLeft) + 'px';
        bar.rail.style.height = Math.max(0, clipBottom - clipTop - 8) + 'px';
      }
      bar.rail.hidden = !visible;
      if (!visible) { bar.drag = null; delete bar.rail.dataset.dragging; continue; }
      const track = bar.rail.clientHeight;
      const size = Math.min(track, Math.max(48, track * height / element.scrollHeight));
      bar.travel = track - size;
      bar.thumb.style.height = size + 'px';
      const top = bar.isPage ? scrollY : element.scrollTop;
      bar.thumb.style.transform = 'translateY(' + Math.max(0, Math.min(1, top / bar.range)) * bar.travel + 'px)';
    }
  }

  create(root, pageRail);
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('transitionend', schedule, true);
  document.addEventListener('load', schedule, true);
  media.addEventListener('change', () => { discover = true; schedule(); });
  resize.observe(document.body);
  new MutationObserver(records => {
    // Ignore our own overlay/geometry updates to avoid observer feedback loops.
    const relevant = records.filter(record => !record.target.closest?.('#pageScrollbar, [data-scrollbar-overlay]'));
    if (!relevant.length) return;
    if (relevant.some(record => record.type === 'childList' && [...record.addedNodes].some(node => node.nodeType === 1 && !node.matches('[data-scrollbar-overlay]')))) discover = true;
    schedule();
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
  update();
})();
