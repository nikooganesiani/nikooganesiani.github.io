(() => {
  'use strict';
  const header = document.getElementById('site-header');
  if (!header) return;
  const root = document.documentElement;
  const inner = header.querySelector('.header-inner');
  // Text zoom, font loading and safe areas can change the actual header height.
  let height = window.matchMedia('(max-width: 640px)').matches ? 56 : window.matchMedia('(max-width: 1024px)').matches ? 128 : 72;
  function measure(entries) {
    const value = entries?.[0]?.borderBoxSize?.[0]?.blockSize ?? inner.getBoundingClientRect().height;
    if (height === value) return;
    height = value;
    root.style.setProperty('--site-header-height', value + 'px');
  }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measure);
    observer.observe(inner, { box: 'border-box' });
  } else {
    window.addEventListener('resize', measure, { passive: true });
    requestAnimationFrame(measure);
  }
  for (const trigger of header.querySelectorAll('[data-header-panel]')) {
    const id = trigger.dataset.headerPanel;
    const panel = document.getElementById(id);
    if (!panel) continue;
    trigger.setAttribute('aria-controls', id);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    if (trigger.tagName === 'A') trigger.setAttribute('role', 'button');
    trigger.addEventListener('click', event => {
      if (!window.openAppModal) return;
      event.preventDefault();
      trigger.focus({ preventScroll: true });
      if (id === 'favModal') window.openFavorites(event);
      else if (id === 'ordersModal') window.openOrders(event);
      else if (id === 'trackingModal') window.openTracking('', true, trigger);
      else window.openAppModal(id, trigger);
    });
    if (trigger.tagName === 'A') trigger.addEventListener('keydown', event => {
      if (event.key === ' ') { event.preventDefault(); trigger.click(); }
    });
    const sync = () => trigger.setAttribute('aria-expanded', String(panel.classList.contains('active')));
    panel.addEventListener('modal:open', sync);
    panel.addEventListener('modal:close', sync);
  }
})();
