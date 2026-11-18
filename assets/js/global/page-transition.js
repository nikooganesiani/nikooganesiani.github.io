(() => {
  'use strict';
  const root = document.documentElement;
  const key = 'enka:page-transition';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const holds = [];
  let departure = 0;
  let watchdog = 0;
  let generation = 0;
  let leaving = false;
  let started = 0;
  let destination = '';
  let incomingTransition = Promise.resolve();
  let swapped = false;
  let storage;
  try {
    storage = window.sessionStorage;
    const saved = JSON.parse(storage.getItem(key) || 'null');
    storage.removeItem(key);
    const age = Date.now() - saved?.started;
    if (saved?.href === window.location.href && age >= 0 && age < 15000) {
      started = saved.started;
      // Resume the rendered animation, not elapsed network/parse time.
      const phase = Number.isFinite(saved.phase) ? saved.phase : 0;
      root.style.setProperty('--page-loader-phase', `${-phase}ms`);
      root.dataset.pageTransition = 'arriving';
    }
  } catch { /* Navigation stays native if browser storage is unavailable. */ }

  function reset() {
    generation++;
    clearTimeout(departure);
    clearTimeout(watchdog);
    leaving = false;
    delete root.dataset.pageTransition;
    // Keep the phase while opacity fades, otherwise the balls jump on reveal.
    try { storage?.removeItem(key); } catch {}
  }

  function navigate(href, { reload = false } = {}) {
    const url = new URL(href, window.location.href);
    if (leaving) return;
    clearTimeout(watchdog);
    swapped = false;
    started = Date.now();
    destination = url.href;
    // Only take over native navigation after the cover has been persisted.
    try {
      if (!storage) throw new Error('No session storage');
      storage.setItem(key, JSON.stringify({ href: url.href, started, phase: 0 }));
    } catch {
      if (reload) window.location.reload();
      else window.location.assign(url.href);
      return;
    }
    generation++;
    leaving = true;
    if (!root.dataset.pageTransition) root.style.setProperty('--page-loader-phase', '0ms');
    root.dataset.pageTransition = 'leaving';
    const leave = () => {
      savePhase();
      if (reload) window.location.reload();
      else window.location.assign(url.href);
    };
    // Wait for actual paint/transition completion, rather than a wall-clock guess.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const cover = document.getElementById('page-transition');
      const fades = cover?.getAnimations?.().filter(animation => animation.transitionProperty === 'opacity') || [];
      if (fades.length) Promise.allSettled(fades.map(animation => animation.finished)).then(() => { if (leaving) leave(); });
      else departure = setTimeout(leave, reduced.matches ? 0 : 100);
    }));
    // Cancelled navigation/downloads must never leave the page locked.
    watchdog = setTimeout(reset, 10000);
  }

  function savePhase() {
    if (!leaving || !destination) return;
    const animation = document.querySelector('.page-loader__ball')?.getAnimations?.()[0];
    const offset = parseFloat(root.style.getPropertyValue('--page-loader-phase')) || 0;
    // Preserve elapsed cycles too: modulo 1000 would reapply the 100/200 ms
    // startup delays to the other groups after a later cycle wraps around.
    const phase = typeof animation?.currentTime === 'number' ? animation.currentTime - offset : 0;
    try { storage?.setItem(key, JSON.stringify({ href: destination, started, phase })); } catch {}
  }

  // These fire around the browser's snapshot, before the first incoming paint.
  window.addEventListener('pageswap', () => { savePhase(); swapped = true; });
  window.addEventListener('pagereveal', event => {
    // Cached documents retain the outgoing cover until they become visible again.
    if (root.dataset.pageTransition === 'leaving') reset();
    if (event.viewTransition) incomingTransition = event.viewTransition.finished.catch(() => {});
  });

  window.EnkaPageTransition = {
    navigate,
    reload: () => navigate(window.location.href, { reload: true }),
    hold: promise => holds.push(Promise.resolve(promise).catch(() => {})),
  };

  // Run after document handlers so modals/filters retain their own link behavior.
  window.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download') || anchor.hasAttribute('data-no-progress') || anchor.hasAttribute('data-no-transition')) return;
    const target = anchor.getAttribute('target') || document.querySelector('base[target]')?.getAttribute('target');
    if (target && target.toLowerCase() !== '_self') return;
    if (/\bexternal\b/i.test(anchor.rel)) return;
    const url = new URL(anchor.href, window.location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    if (/\.(?:pdf|zip|txt|csv|xlsx?|docx?|png|jpe?g|webp|svg|mp4|mp3)$/i.test(url.pathname)) return;
    event.preventDefault();
    navigate(url.href);
  });

  async function reveal() {
    if (root.dataset.pageTransition !== 'arriving') return;
    const current = generation;
    // A task boundary lets every DCL listener register its catalog/homepage work.
    await new Promise(resolve => setTimeout(resolve, 0));
    const content = Promise.all(holds).then(async () => {
      // Native lazy loading can fetch whole horizontal galleries. Only the
      // primary image may hold the cover; fonts and card photos stream in normally.
      const primary = document.querySelector('img[fetchpriority="high"]');
      if (primary) await primary.decode?.().catch(() => {});
    });
    let deadline;
    await Promise.race([Promise.all([content, incomingTransition]), new Promise(resolve => { deadline = setTimeout(resolve, 450); })]);
    clearTimeout(deadline);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation !== current || leaving) return;
      root.dataset.pageTransition = 'revealing';
      // Keep the bounce running throughout the opacity fade.
      setTimeout(() => { if (generation === current && !leaving) reset(); }, reduced.matches ? 0 : 240);
    }));
  }
  if (started) watchdog = setTimeout(reset, 8000);
  document.addEventListener('DOMContentLoaded', reveal, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) reset(); });
  // Keep the opaque last frame intact; only pageshow may clean up a cached page.
  window.addEventListener('pagehide', () => {
    if (!swapped) savePhase();
    generation++;
    clearTimeout(departure);
    clearTimeout(watchdog);
  });
})();
