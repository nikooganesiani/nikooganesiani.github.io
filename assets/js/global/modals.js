(() => {
  'use strict';

  const openModals = [];
  const origins = new WeakMap();
  const closeTimers = new WeakMap();
  const background = new Map();
  const focusable = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';
  const topModal = () => openModals[openModals.length - 1];
  const getModal = value => typeof value === 'string' ? document.getElementById(value) : value;

  function getFocusables(modal) {
    return [...modal.querySelectorAll(focusable)].filter(element =>
      element.tabIndex >= 0 && !element.matches(':disabled') &&
      !element.closest('[inert], [hidden]') && element.getClientRects().length &&
      getComputedStyle(element).visibility !== 'hidden');
  }

  function focusModal(modal) {
    const target = modal.querySelector('[autofocus]') || getFocusables(modal)[0] || modal;
    target.focus({ preventScroll: true });
  }

  function syncBackground() {
    const top = topModal();
    for (const [element, inert] of background) {
      element.inert = inert;
    }
    background.clear();
    if (top) {
      top.inert = false;
      openModals.forEach((modal, index) => { modal.style.zIndex = String(10000 + index); });
      for (const element of document.body.children) {
        if (!(element instanceof HTMLElement) || element.contains(top) ||
            element.matches('script, style, link')) continue;
        background.set(element, element.inert);
        element.inert = true;
      }
    }
    document.documentElement.classList.toggle('modal-open', !!top);
  }

  window.openAppModal = function(value, trigger = document.activeElement) {
    const modal = getModal(value);
    if (!modal || openModals.includes(modal)) return;

    clearTimeout(closeTimers.get(modal));
    origins.set(modal, trigger || document.activeElement);
    openModals.push(modal);
    modal.inert = false;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.removeAttribute('aria-hidden');
    modal.tabIndex = -1;
    const heading = modal.querySelector('h2, h3');
    if (heading && !modal.hasAttribute('aria-label') && !modal.hasAttribute('aria-labelledby')) {
      heading.id ||= modal.id + '-title';
      modal.setAttribute('aria-labelledby', heading.id);
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.style.display = 'flex';
    void modal.offsetHeight;
    modal.classList.add('active');
    syncBackground();
    // Keep search focus in the click event so iOS can open the keyboard.
    focusModal(modal);
  };

  window.closeAppModal = function(value) {
    const modal = getModal(value);
    if (!modal || !modal.classList.contains('active')) return;

    const wasTop = modal === topModal();
    const index = openModals.indexOf(modal);
    if (index !== -1) openModals.splice(index, 1);
    modal.classList.remove('active');
    modal.inert = true;
    if (background.has(modal)) background.set(modal, true);

    if (modal.id === 'trackingModal') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('orderstatus')) {
        url.searchParams.delete('orderstatus');
        window.history.pushState(null, '', url.pathname + url.search + url.hash);
      }
    }

    syncBackground();
    if (wasTop) {
      const origin = origins.get(modal);
      if (origin?.isConnected && !origin.closest('[inert], [aria-hidden="true"]') &&
          !origin.matches(':disabled') && origin.getClientRects().length &&
          getComputedStyle(origin).visibility !== 'hidden') {
        origin.focus({ preventScroll: true });
      } else if (topModal()) {
        focusModal(topModal());
      } else if (modal.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
    modal.setAttribute('aria-hidden', 'true');
    modal.removeAttribute('aria-modal');

    clearTimeout(closeTimers.get(modal));
    closeTimers.set(modal, setTimeout(() => {
      if (!modal.classList.contains('active')) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400));
  };

  document.addEventListener('keydown', event => {
    const modal = topModal();
    if (!modal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      window.closeAppModal(modal);
    } else if (event.key === 'Tab') {
      const elements = getFocusables(modal);
      const first = elements[0] || modal;
      const last = elements[elements.length - 1] || modal;
      if (!elements.length || !modal.contains(document.activeElement) ||
          (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) ||
          (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }
  }, true);

  document.addEventListener('focusin', event => {
    const modal = topModal();
    if (modal && !modal.contains(event.target)) focusModal(modal);
  });
})();
