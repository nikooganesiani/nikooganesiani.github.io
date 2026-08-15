(() => {
  const BAR_ID = 'topProgressBar';
  const STORE_KEY = 'tpb:handoff';
  const HANDOFF_TTL = 10_000;

  const cfg = {
    min: 0.08,
    max: 0.94,
    color: '#2563eb',
    height: '3px',
    trickleInterval: 380,
    barMs: 460,
    doneMs: 280,
    fadeMs: 260,
    minShowMs: 260,
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let el = null;
  let status = null;
  let startedAt = 0;
  let fading = false;
  let trickleId = 0;
  let hideId = 0;
  let doneId = 0;

  const boot = () => {
    el = document.getElementById(BAR_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = BAR_ID;
      el.setAttribute('aria-hidden', 'true');
      (document.body || document.documentElement).appendChild(el);
    }

    injectStyles();
    el.removeAttribute('style');
    el.classList.add('tpb-bar');
    if (!el.querySelector('.tpb-peg')) {
      const peg = document.createElement('span');
      peg.className = 'tpb-peg';
      el.appendChild(peg);
    }

    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('beforeunload', onBeforeUnload);

    const handoff = takeHandoff();
    const loaded = document.readyState === 'complete';

    if (loaded) {
      if (!handoff) return;
      start(Math.max(handoff.p || 0, 0.72));
      done();
      return;
    }

    start(handoff ? clamp(Math.max(handoff.p || 0, 0.5), cfg.min, cfg.max) : cfg.min);
    window.addEventListener('load', () => done(), { once: true });
  };

  function injectStyles() {
    if (document.getElementById('tpb-styles')) return;

    const style = document.createElement('style');
    style.id = 'tpb-styles';
    style.textContent = `
      .tpb-bar {
        --tpb-color: ${cfg.color};
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: ${cfg.height};
        z-index: 999999;
        pointer-events: none;
        transform: scaleX(0);
        transform-origin: left center;
        opacity: 0;
        background: linear-gradient(90deg, #60a5fa 0%, var(--tpb-color) 55%, #1d4ed8 100%);
        will-change: auto;
      }
      .tpb-bar.is-on { will-change: transform, opacity; }
      .tpb-peg {
        position: absolute;
        right: 0;
        top: 0;
        width: 96px;
        height: 100%;
        transform: rotate(2.5deg) translateY(-3px);
        background: linear-gradient(90deg, transparent, rgba(191, 219, 254, 0.85));
        opacity: 0.9;
      }
      @media (prefers-color-scheme: dark) {
        .tpb-bar { --tpb-color: #3b82f6; }
      }
      @media (prefers-reduced-motion: reduce) {
        .tpb-bar { transition: none !important; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ms(value) {
    return reduceMotion ? '0.01s' : `${value}ms`;
  }

  function setTransition(mode) {
    if (mode === 'none') {
      el.style.transition = 'none';
      return;
    }
    const t = mode === 'done' ? cfg.doneMs : cfg.barMs;
    const easing = mode === 'done'
      ? 'cubic-bezier(0.16, 1, 0.3, 1)'
      : 'cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transition = `transform ${ms(t)} ${easing}, opacity ${ms(cfg.fadeMs)} ease`;
  }

  function reflow() {
    void el.offsetWidth;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function set(n, { immediate = false, complete = false } = {}) {
    const next = complete ? 1 : clamp(n, 0, cfg.max);
    if (!immediate && !complete && status !== null && next < status) return;

    status = complete ? 1 : next;
    el.classList.add('is-on');

    if (immediate) {
      setTransition('none');
      el.style.transform = `scaleX(${status})`;
      el.style.opacity = status > 0 ? '1' : '0';
      reflow();
      setTransition('bar');
      return;
    }

    setTransition(complete ? 'done' : 'bar');
    el.style.opacity = '1';
    el.style.transform = `scaleX(${status})`;
  }

  function inc(amount) {
    if (status === null) {
      start(cfg.min);
      return;
    }
    if (typeof amount !== 'number') {
      if (status < 0.2) amount = 0.07 + Math.random() * 0.05;
      else if (status < 0.45) amount = 0.03 + Math.random() * 0.03;
      else if (status < 0.75) amount = 0.015 + Math.random() * 0.02;
      else amount = 0.004 + Math.random() * 0.01;
    }
    set(status + amount);
  }

  function startTrickle() {
    stopTrickle();
    if (reduceMotion) return;

    const tick = () => {
      inc();
      trickleId = window.setTimeout(tick, cfg.trickleInterval + Math.random() * 220);
    };
    trickleId = window.setTimeout(tick, cfg.trickleInterval);
  }

  function stopTrickle() {
    if (trickleId) {
      clearTimeout(trickleId);
      trickleId = 0;
    }
  }

  function clearTimers() {
    stopTrickle();
    if (hideId) clearTimeout(hideId);
    if (doneId) clearTimeout(doneId);
    hideId = 0;
    doneId = 0;
  }

  function start(from = cfg.min) {
    clearTimers();
    fading = false;
    startedAt = performance.now();
    set(from, { immediate: true });
    startTrickle();
  }

  function done() {
    if (status === null && !fading) return;

    stopTrickle();
    const wait = reduceMotion ? 0 : Math.max(0, cfg.minShowMs - (performance.now() - startedAt));

    doneId = window.setTimeout(() => {
      fading = true;
      set(1, { complete: true });

      doneId = window.setTimeout(() => {
        el.style.opacity = '0';
        hideId = window.setTimeout(resetSilent, reduceMotion ? 0 : cfg.fadeMs + 30);
      }, reduceMotion ? 0 : cfg.doneMs);
    }, wait);
  }

  function resetSilent() {
    clearTimers();
    setTransition('none');
    el.style.opacity = '0';
    el.style.transform = 'scaleX(0)';
    el.classList.remove('is-on');
    status = null;
    fading = false;
    reflow();
  }

  function saveHandoff() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        t: Date.now(),
        p: status == null ? cfg.min : status,
      }));
    } catch (_) { /* private mode / disabled storage */ }
  }

  function takeHandoff() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(STORE_KEY);
      const data = JSON.parse(raw);
      if (!data || Date.now() - data.t > HANDOFF_TTL) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function isTrackableLink(anchor) {
    if (anchor.hasAttribute('download') || anchor.hasAttribute('data-no-progress')) return false;

    const target = (anchor.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return false;
    if (/\bexternal\b/i.test(anchor.getAttribute('rel') || '')) return false;

    let url;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch (_) {
      return false;
    }

    if (!/^https?:$/.test(url.protocol)) return false;
    if (url.origin !== window.location.origin) return false;

    const sameDoc = url.pathname === window.location.pathname && url.search === window.location.search;
    if (sameDoc) return false;

    return true;
  }

  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = event.target.closest('a[href]');
    if (!anchor || !isTrackableLink(anchor)) return;

    saveHandoff();
    if (status === null || fading) start(cfg.min);
    else inc(0.04);
  }

  function onSubmit(event) {
    if (event.defaultPrevented) return;

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.hasAttribute('data-no-progress')) return;

    const target = (form.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return;

    let url;
    try {
      url = new URL(form.action || window.location.href, window.location.href);
    } catch (_) {
      return;
    }
    if (url.origin !== window.location.origin) return;

    saveHandoff();
    if (status === null || fading) start(cfg.min);
  }

  function onPageShow(event) {
    if (event.persisted) resetSilent();
  }

  function onBeforeUnload() {
    if (status !== null) saveHandoff();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
