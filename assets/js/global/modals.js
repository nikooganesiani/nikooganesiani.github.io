(() => {
  'use strict';

  const openModals = [];
  const origins = new WeakMap();
  const closeTimers = new WeakMap();
  const background = new Map();
  const lastFocus = new WeakMap();
  let scrollLock;
  let backdropStart;
  let viewportFrame;
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
    const previous = lastFocus.get(modal);
    const initial = modal.querySelector('[data-modal-initial-focus], [autofocus]');
    const visible = element => element?.isConnected && !element.closest('[inert], [hidden]') && !element.matches(':disabled') && element.getClientRects().length;
    const target = (visible(previous) && previous) || (visible(initial) && initial) || getFocusables(modal)[0] || modal;
    target.focus({ preventScroll: true });
  }

  function updateViewport() {
    if (!topModal()) return;
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--modal-viewport-height', (viewport?.height || window.innerHeight) + 'px');
    document.documentElement.style.setProperty('--modal-viewport-top', (viewport?.offsetTop || 0) + 'px');
  }

  function syncScroll(locked) {
    if (locked && !scrollLock) {
      const style = document.body.style;
      scrollLock = { x: window.scrollX, y: window.scrollY, styles: {} };
      for (const property of ['position', 'top', 'left', 'right', 'width']) scrollLock.styles[property] = style[property];
      Object.assign(style, { position: 'fixed', top: -scrollLock.y + 'px', left: '0', right: '0', width: 'auto' });
      updateViewport();
    } else if (!locked && scrollLock) {
      const saved = scrollLock;
      scrollLock = null;
      Object.assign(document.body.style, saved.styles);
      document.documentElement.style.removeProperty('--modal-viewport-height');
      document.documentElement.style.removeProperty('--modal-viewport-top');
      window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
    }
  }

  function syncBackground() {
    const top = topModal();
    for (const [element, inert] of background) {
      element.inert = inert;
    }
    background.clear();
    if (top) {
      top.inert = false;
      openModals.forEach((modal, index) => {
        modal.style.zIndex = String(10000 + index);
        if (modal === top) modal.setAttribute('aria-modal', 'true');
        else modal.removeAttribute('aria-modal');
      });
      for (const element of document.body.children) {
        if (!(element instanceof HTMLElement) || element.contains(top) ||
            element.matches('script, style, link')) continue;
        background.set(element, element.inert);
        element.inert = true;
      }
    }
    document.documentElement.classList.toggle('modal-open', !!top);
    syncScroll(!!top);
  }

  window.openAppModal = function(value, trigger = document.activeElement) {
    const modal = getModal(value);
    if (!modal || !modal.classList.contains('modal') || openModals.includes(modal)) return;

    clearTimeout(closeTimers.get(modal));
    const parent = topModal();
    // Disabling an async submit button can move browser focus to <body>.
    // Keep the dialog chain intact so confirmation can return to the card.
    const origin = trigger && trigger !== document.body && trigger !== document.documentElement
      ? trigger : (parent && (lastFocus.get(parent) || parent)) || document.activeElement;
    origins.set(modal, origin);
    lastFocus.delete(modal);
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
    modal.classList.remove('pointer-events-none');
    void modal.offsetHeight;
    modal.classList.add('active');
    if (trigger instanceof HTMLElement && trigger.getAttribute('aria-controls') === modal.id) trigger.setAttribute('aria-expanded', 'true');
    syncBackground();
    modal.querySelectorAll('.modal-body').forEach(body => { body.scrollTop = 0; });
    // Keep search focus in the click event so iOS can open the keyboard.
    focusModal(modal);
    modal.dispatchEvent(new CustomEvent('modal:open'));
  };

  window.closeAppModal = function(value) {
    const modal = getModal(value);
    if (!modal || !modal.classList.contains('active')) return;

    const wasTop = modal === topModal();
    const index = openModals.indexOf(modal);
    // Replacement dialogs inherit a usable return target, even when their
    // original button belonged to the dialog that is now closing.
    for (const other of openModals) {
      if (other !== modal && modal.contains(origins.get(other))) origins.set(other, origins.get(modal));
    }
    if (index !== -1) openModals.splice(index, 1);
    modal.classList.remove('active');
    modal.classList.add('pointer-events-none');
    document.querySelectorAll('[aria-controls="' + modal.id + '"]').forEach(el => el.setAttribute('aria-expanded', 'false'));
    modal.inert = true;
    if (background.has(modal)) background.set(modal, true);

    if (modal.id === 'trackingModal') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('orderstatus')) {
        url.searchParams.delete('orderstatus');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
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
    lastFocus.delete(modal);
    modal.dispatchEvent(new CustomEvent('modal:close'));

    clearTimeout(closeTimers.get(modal));
    closeTimers.set(modal, setTimeout(() => {
      if (!modal.classList.contains('active')) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220));
  };

  document.addEventListener('keydown', event => {
    const modal = topModal();
    if (!modal) return;
    if (event.key === 'Tab') {
      const elements = getFocusables(modal);
      const first = elements[0] || modal;
      const last = elements[elements.length - 1] || modal;
      if (!elements.length || !elements.includes(document.activeElement) ||
          (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) ||
          (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }
  }, true);

  // Nested controls (such as search suggestions) handle Escape before the dialog.
  document.addEventListener('keydown', event => {
    const modal = topModal();
    if (modal && event.key === 'Escape' && !event.isComposing && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      window.closeAppModal(modal);
    }
  });

  document.addEventListener('focusin', event => {
    const modal = topModal();
    if (modal && !modal.contains(event.target)) focusModal(modal);
    else if (modal) lastFocus.set(modal, event.target);
  });

  document.addEventListener('pointerdown', event => {
    backdropStart = event.target === topModal() ? event.target : null;
  });
  document.addEventListener('pointercancel', () => { backdropStart = null; });

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-close-modal]');
    if (button) window.closeAppModal(button.closest('[role="dialog"], .modal'));
    else if (event.target === topModal() && event.target === backdropStart) {
      const form = event.target.querySelector('form');
      // A stray tap must not hide a partially completed or submitting order.
      const hasDraft = form && [...form.querySelectorAll('input:not([type="hidden"]):not([type="email"])')].some(input => input.value.trim());
      if (!hasDraft && form?.getAttribute('aria-busy') !== 'true') window.closeAppModal(event.target);
    }
    backdropStart = null;
  });

  const scheduleViewport = () => {
    if (!topModal() || viewportFrame) return;
    viewportFrame = requestAnimationFrame(() => { viewportFrame = null; updateViewport(); });
  };
  window.visualViewport?.addEventListener('resize', scheduleViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleViewport, { passive: true });
  window.addEventListener('resize', scheduleViewport, { passive: true });

  document.querySelectorAll('.modal').forEach(modal => {
    if (modal.parentElement !== document.body) document.body.append(modal);
    modal.inert = true;
    modal.setAttribute('aria-hidden', 'true');
  });
})();
