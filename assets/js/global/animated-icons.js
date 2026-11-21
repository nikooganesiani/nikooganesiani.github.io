// Motion adapted from the upstream components listed in _data/icon_sources.json.
// MIT notices and underlying Lucide/Heroicons notices: assets/licenses/ and ICONS.md.
(() => {
  'use strict';
  const selector = 'svg[data-animated-icon]';
  const interactive = 'button, a, summary, label, [role="button"], [data-icon-hover]';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Map();
  const watched = new Map();
  const hoverable = window.matchMedia('(hover: hover)');

  function stop(icon) {
    const animations = running.get(icon);
    running.delete(icon);
    animations?.forEach(animation => animation.cancel());
  }
  function allowed(icon) {
    return !preference.matches && document.visibilityState !== 'hidden' && icon.isConnected &&
      (icon.dataset.animatedIcon === 'loader' || !icon.closest('button:disabled, [aria-disabled="true"]')) &&
      !icon.parentElement?.closest('[hidden], [inert], .modal[aria-hidden="true"]') &&
      icon.getClientRects().length > 0;
  }
  function play(icon, loop = false) {
    if (!allowed(icon) || typeof icon.animate !== 'function') return;
    stop(icon);
    const body = icon.querySelector('[data-icon-body]');
    if (!body) return;
    const name = icon.dataset.animatedIcon;
    const animations = new Set();
    running.set(icon, animations);
    function animate(target, frames, duration = 550, extra = {}) {
      if (!target) return;
      target.style.transformBox = 'view-box';
      target.style.transformOrigin = '12px 12px';
      const animation = target.animate(frames, { duration, easing: 'ease-in-out', iterations: loop ? Infinity : 1, ...extra });
      animations.add(animation);
      animation.onfinish = () => {
        animations.delete(animation);
        if (!animations.size && running.get(icon) === animations) running.delete(icon);
      };
    }
    const move = (frames, duration, extra) => animate(body, { transform: frames }, duration, extra);
    const parts = [...body.children];
    const draw = target => {
      const length = target?.getTotalLength?.();
      if (length) animate(target, [{ strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
        { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }], 500);
    };
    if (name === 'loader') move(['rotate(0deg)', 'rotate(360deg)'], 900, { easing: 'linear' });
    else if (name === 'heart') move(['scale(1)', 'scale(1.12)', 'scale(1)', 'scale(1.08)', 'scale(1)'], 650);
    else if (name === 'truck') {
      move(['translateY(0)', 'translateY(-1px)', 'translateY(0)', 'translateY(-.5px)', 'translateY(0)'], loop ? 1000 : 500);
      for (const wheel of body.querySelectorAll('circle')) {
        animate(wheel, { transform: ['rotate(0deg)', 'rotate(360deg)'] }, 700, { easing: 'linear' });
        wheel.style.transformOrigin = `${wheel.getAttribute('cx')}px ${wheel.getAttribute('cy')}px`;
      }
    } else if (name === 'check' || name === 'success' || name === 'shield') draw(parts.at(-1));
    else if (name === 'chevron-right' || name === 'arrow-right') move(['translateX(0)', 'translateX(2px)', 'translateX(0)']);
    else if (name === 'chevron-left' || name === 'return') move(['translateX(0)', 'translateX(-2px)', 'translateX(0)']);
    else if (name === 'chevron-down') move(['translateY(0)', 'translateY(2px)', 'translateY(0)']);
    else if (name === 'arrow-up-right') move(['translate(0, 0)', 'translate(2px, -2px)', 'translate(0, 0)']);
    else if (name === 'search') move(['translate(0, 0)', 'translate(0, -2px)', 'translate(-2px, 0)', 'translate(0, 0)'], 700);
    else if (name === 'bag' || name === 'phone' || name === 'building' || name === 'gadget') move(['rotate(0deg)', 'rotate(-7deg)', 'rotate(7deg)', 'rotate(-4deg)', 'rotate(0deg)']);
    else if (name === 'share') parts.slice(1).forEach((part, i) => animate(part, { opacity: [1, .3, 1], transform: ['scale(1)', 'scale(1.08)', 'scale(1)'] }, 450, { delay: i * 90 }));
    else if (name === 'grid') parts.forEach((part, i) => animate(part, { opacity: [1, .35, 1], transform: ['translateY(0)', 'translateY(-1px)', 'translateY(0)'] }, 350, { delay: i * 60 }));
    else if (name === 'menu' || name === 'list' || name === 'rows') parts.forEach((part, i) => animate(part, { transform: ['translateX(0)', `translateX(${i % 2 ? -2 : 2}px)`, 'translateX(0)'] }, 450, { delay: i * 35 }));
    else if (name === 'sliders-horizontal') parts.forEach((part, i) => animate(part, { transform: ['translateX(0)', `translateX(${i % 2 ? -1.5 : 1.5}px)`, 'translateX(0)'] }));
    else if (name === 'camera') animate(parts.at(-1), { transform: ['scale(1)', 'scale(.8)', 'scale(1)'] });
    else if (name === 'clock') {
      animate(parts.at(-1), { transform: ['rotate(0deg)', 'rotate(90deg)', 'rotate(0deg)'] }, loop ? 1800 : 700);
    } else if (name === 'homecare') animate(parts.at(-1), { transform: ['rotate(0deg)', 'rotate(180deg)', 'rotate(360deg)'] }, 850);
    else if (name === 'upload') {
      parts.slice(1).forEach(part => animate(part, { transform: ['translateY(0)', 'translateY(-2px)', 'translateY(0)'] }));
    } else if (name === 'close') move(['scale(1)', 'scale(.86)', 'scale(1)'], 200);
    else if (name === 'expand') move(['scale(1)', 'scale(1.12)', 'scale(1)']);
    else if (name === 'selfcare') parts.forEach((part, i) => animate(part, { opacity: [1, .3, 1] }, 500, { delay: i * 60 }));
    else if (name === 'globe' || name === 'facebook') move(['rotateY(0deg)', 'rotateY(25deg)', 'rotateY(0deg)'], 650);
    else if (name === 'kitchen') parts.slice(2).forEach(part => animate(part, { transform: ['translateY(0)', 'translateY(-2px)', 'translateY(0)'] }));
    else move(['translateY(0) scale(1)', 'translateY(-1.5px) scale(1.04)', 'translateY(0) scale(1)']);
  }

  function trigger(event, reason) {
    if (reason === 'hover' && (!hoverable.matches || event.pointerType === 'touch')) return;
    const target = event.target.closest?.(interactive) || event.target.closest?.(selector);
    if (!target || (reason === 'hover' && target.contains(event.relatedTarget))) return;
    const icons = target.matches(selector) ? [target] : target.querySelectorAll(selector);
    for (const icon of icons) {
      const mode = icon.dataset.iconTrigger;
      if (mode === 'loop' || mode === 'enter') continue;
      // Nested controls (for example a favourite inside a card) own their icons.
      const owner = icon.closest(interactive);
      if (owner && owner !== target) continue;
      if (reason !== 'click' && mode === 'click') continue;
      play(icon);
    }
  }
  document.addEventListener('pointerover', event => trigger(event, 'hover'));
  document.addEventListener('focusin', event => trigger(event, 'focus'));
  document.addEventListener('click', event => trigger(event, 'click'), true);

  function sync(icon, state) {
    if (!state.visible || !allowed(icon)) { stop(icon); state.played = false; return; }
    if (icon.dataset.iconTrigger === 'loop') { if (!running.has(icon)) play(icon, true); }
    else if (!state.played) { play(icon); state.played = true; }
  }
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = watched.get(entry.target);
      if (state) { state.visible = entry.isIntersecting; sync(entry.target, state); }
    }
  }) : null;
  function scan(root) {
    const icons = [...(root.querySelectorAll?.(selector) || [])];
    if (root.matches?.(selector)) icons.push(root);
    for (const icon of icons) {
      if (!['loop','enter'].includes(icon.dataset.iconTrigger) || watched.has(icon)) continue;
      const state = { visible: !observer, played: false };
      watched.set(icon, state);
      if (observer) observer.observe(icon); else sync(icon, state);
    }
  }
  function refresh() {
    for (const [icon, state] of watched) {
      if (!icon.isConnected) { stop(icon); watched.delete(icon); observer?.unobserve(icon); }
      else sync(icon, state);
    }
    for (const icon of running.keys()) if (!allowed(icon)) stop(icon);
  }
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
    refresh();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden', 'data-icon-trigger'] });
  preference.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', () => { for (const icon of running.keys()) stop(icon); });
  scan(document.body);
})();
