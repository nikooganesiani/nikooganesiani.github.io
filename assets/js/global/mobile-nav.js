(() => {
  'use strict';

  const nav = document.getElementById('enka-mobile-nav');
  if (!nav) return;

  const items = [...nav.querySelectorAll('[data-active]')];
  const current = items.find(item => item.dataset.active === 'true');
  const panels = items.filter(item => item.hasAttribute('aria-controls')).map(button => ({
    button,
    panel: document.getElementById(button.getAttribute('aria-controls'))
  }));

  function syncState() {
    const open = panels.filter(({ panel }) => panel?.classList.contains('active'))
      .sort((a, b) => Number(b.panel.style.zIndex) - Number(a.panel.style.zIndex))[0];
    for (const item of items) item.dataset.active = String(item === (open?.button || current));
    for (const { button, panel } of panels) {
      button.setAttribute('aria-expanded', String(!!panel?.classList.contains('active')));
    }
  }

  for (const { button, panel } of panels) {
    if (!panel) continue;
    new MutationObserver(syncState).observe(panel, { attributes: true, attributeFilter: ['class'] });
    button.addEventListener('click', event => {
      try {
        if (panel.id === 'favModal') window.openFavorites(event);
        else if (panel.id === 'ordersModal') window.openOrders(event);
        else if (panel.id === 'trackingModal') window.openTracking('', true, button);
        else window.openAppModal(panel.id, button);
      } catch (error) {
        console.error('Error opening navigation panel:', error);
        window.showToast?.('მოქმედება ვერ შესრულდა. სცადეთ ხელახლა.');
      }
    });
  }

  const root = document.documentElement;
  const buyBar = document.getElementById('mobileBottomBar');
  let navHeight = 65;
  let buyBarHeight = 0;
  function measure(entries) {
    for (const entry of entries) {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
      if (entry.target === nav && height > 0 && height !== navHeight) {
        navHeight = height;
        root.style.setProperty('--mobile-nav-height', height + 'px');
      } else if (entry.target === buyBar && height !== buyBarHeight) {
        buyBarHeight = height;
        root.style.setProperty('--mobile-buy-bar-height', height + 'px');
      }
    }
  }
  const observer = new ResizeObserver(measure);
  observer.observe(nav, { box: 'border-box' });
  if (buyBar) observer.observe(buyBar, { box: 'border-box' });
  window.addEventListener('pageshow', () => {
    window.updateBadges?.();
    syncState();
  });
  syncState();
})();
