(() => {
  'use strict';

  function readCount(key) {
    try {
      const entries = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(entries) ? entries.length : 0;
    } catch {
      return 0;
    }
  }

  window.updateBadges = function() {
    for (const [key, selector] of [['myFavs', '.fav-badge'], ['myOrders', '.orders-badge']]) {
      const count = readCount(key);
      for (const badge of document.querySelectorAll(selector)) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = count > 0 ? 'flex' : 'none';
        const button = badge.closest('button');
        const label = button?.dataset.countLabel || button?.title;
        if (label) button.setAttribute('aria-label', count > 0 ? label + ', ' + count : label);
      }
    }
  };

  window.addEventListener('storage', event => {
    if (event.key === null || event.key === 'myFavs' || event.key === 'myOrders') window.updateBadges();
  });
  window.addEventListener('pageshow', window.updateBadges);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.updateBadges);
  } else {
    window.updateBadges();
  }
})();
