(function initPromoStories() {
  'use strict';

  var STORAGE_KEY = 'viewed_promo_stories';
  var DRAG_THRESHOLD_PX = 6;
  var CLICK_SUPPRESS_MS = 80;
  var LERP = 0.18;
  var FRICTION = 0.952;
  var MIN_COAST_VELOCITY = 0.045;
  var MAX_VELOCITY = 2.8;
  var IMG_FALLBACK = ['bg-gradient-to-b', 'from-blue-900', 'to-zinc-900'];

  var track = document.getElementById('promo-slider-track');
  if (!track) return;

  var cards = track.querySelectorAll('.promo-card');
  if (!cards.length) return;

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function loadViewed() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return new Set((Array.isArray(parsed) ? parsed : []).map(String));
    } catch (e) {
      return new Set();
    }
  }

  function saveViewed(viewedSet) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(viewedSet)));
    } catch (e) {
      /* quota / private mode */
    }
  }

  function paintViewed(card) {
    if (card.hasAttribute('data-viewed')) return;
    card.setAttribute('data-viewed', '');
    var title = card.getAttribute('data-title') || 'Промо';
    card.setAttribute('aria-label', title + ' (просмотрено)');
  }

  var viewed = loadViewed();
  for (var i = 0; i < cards.length; i++) {
    var viewedId = cards[i].getAttribute('data-promo-id');
    if (viewedId && viewed.has(String(viewedId))) paintViewed(cards[i]);
  }

  function markViewed(card) {
    var promoId = card.getAttribute('data-promo-id');
    if (!promoId || viewed.has(String(promoId))) return;
    viewed.add(String(promoId));
    saveViewed(viewed);
    paintViewed(card);
  }

  track.addEventListener(
    'error',
    function onImgError(e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      img.hidden = true;
      var frame = img.parentElement;
      if (!frame) return;
      for (var c = 0; c < IMG_FALLBACK.length; c++) {
        frame.classList.add(IMG_FALLBACK[c]);
      }
    },
    true
  );

  var drag = {
    tracking: false,
    active: false,
    coasting: false,
    suppressClick: false,
    reduced: false,
    pointerId: null,
    startX: 0,
    startScroll: 0,
    targetScroll: 0,
    scrollMax: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
    raf: 0,
    suppressTimer: 0,
  };

  function isDragPointer(e) {
    return (e.pointerType === 'mouse' || e.pointerType === 'pen') && e.button === 0;
  }

  function clampScroll(value) {
    if (value < 0) return 0;
    if (value > drag.scrollMax) return drag.scrollMax;
    return value;
  }

  function cacheMetrics() {
    drag.scrollMax = Math.max(0, track.scrollWidth - track.clientWidth);
  }

  function startLoop() {
    if (!drag.raf) drag.raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!drag.raf) return;
    cancelAnimationFrame(drag.raf);
    drag.raf = 0;
  }

  function releaseSnapLock() {
    track.classList.remove('is-dragging', 'is-coasting');
    track.style.scrollSnapType = '';
  }

  function lockSnap() {
    track.style.scrollSnapType = 'none';
  }

  function tick(now) {
    drag.raf = 0;

    if (drag.active) {
      var current = track.scrollLeft;
      var next = drag.reduced
        ? drag.targetScroll
        : current + (drag.targetScroll - current) * LERP;

      if (Math.abs(drag.targetScroll - next) < 0.35) next = drag.targetScroll;
      if (next !== current) track.scrollLeft = next;

      if (drag.active || Math.abs(drag.targetScroll - track.scrollLeft) >= 0.35) {
        startLoop();
      }
      return;
    }

    if (!drag.coasting) return;

    var last = drag.lastTime || now;
    var dt = Math.min(32, Math.max(8, now - last));
    drag.lastTime = now;

    drag.velocity *= Math.pow(FRICTION, dt / 16.67);
    var coastTo = clampScroll(track.scrollLeft + drag.velocity * dt);
    track.scrollLeft = coastTo;

    if (coastTo <= 0 || coastTo >= drag.scrollMax) drag.velocity = 0;

    if (Math.abs(drag.velocity) < MIN_COAST_VELOCITY) {
      drag.coasting = false;
      releaseSnapLock();
      return;
    }

    startLoop();
  }

  function sampleVelocity(clientX, time) {
    var dt = time - drag.lastTime;
    if (dt > 0 && dt < 64) {
      var instant = (drag.lastX - clientX) / dt;
      drag.velocity = drag.velocity * 0.68 + instant * 0.32;
      if (drag.velocity > MAX_VELOCITY) drag.velocity = MAX_VELOCITY;
      if (drag.velocity < -MAX_VELOCITY) drag.velocity = -MAX_VELOCITY;
    } else if (dt >= 64) {
      drag.velocity = 0;
    }
    drag.lastX = clientX;
    drag.lastTime = time;
  }

  function armClickSuppress() {
    drag.suppressClick = true;
    if (drag.suppressTimer) window.clearTimeout(drag.suppressTimer);
    drag.suppressTimer = window.setTimeout(function () {
      drag.suppressClick = false;
      drag.suppressTimer = 0;
    }, CLICK_SUPPRESS_MS);
  }

  function unbindWindowDrag() {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp, true);
    window.removeEventListener('pointercancel', onWindowPointerUp, true);
  }

  function beginCoast() {
    if (drag.reduced || Math.abs(drag.velocity) < MIN_COAST_VELOCITY) {
      drag.coasting = false;
      releaseSnapLock();
      return;
    }
    drag.coasting = true;
    drag.lastTime = performance.now();
    track.classList.remove('is-dragging');
    track.classList.add('is-coasting');
    lockSnap();
    startLoop();
  }

  function stopDrag(e) {
    if (!drag.tracking) return;
    if (e && drag.pointerId !== null && e.pointerId !== drag.pointerId) return;

    var wasActive = drag.active;

    if (
      e &&
      drag.pointerId !== null &&
      track.releasePointerCapture &&
      track.hasPointerCapture &&
      track.hasPointerCapture(e.pointerId)
    ) {
      try {
        track.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* already released */
      }
    }

    drag.tracking = false;
    drag.active = false;
    drag.pointerId = null;
    unbindWindowDrag();

    if (wasActive) {
      armClickSuppress();
      beginCoast();
    } else {
      drag.coasting = false;
      releaseSnapLock();
    }
  }

  function onWindowPointerMove(e) {
    if (!drag.tracking || e.pointerId !== drag.pointerId) return;

    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) <= DRAG_THRESHOLD_PX) return;
      drag.active = true;
      drag.coasting = false;
      track.classList.add('is-dragging');
      lockSnap();
      try {
        if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
      } catch (err) {
        /* Safari edge cases */
      }
    }

    sampleVelocity(e.clientX, performance.now());
    drag.targetScroll = clampScroll(drag.startScroll - (e.clientX - drag.startX));
    startLoop();
  }

  function onWindowPointerUp(e) {
    stopDrag(e);
  }

  track.addEventListener('pointerdown', function (e) {
    if (!isDragPointer(e)) return;

    drag.coasting = false;
    stopLoop();
    releaseSnapLock();
    cacheMetrics();

    drag.tracking = true;
    drag.active = false;
    drag.reduced = prefersReducedMotion();
    drag.pointerId = e.pointerId;
    drag.startX = e.clientX;
    drag.startScroll = track.scrollLeft;
    drag.targetScroll = track.scrollLeft;
    drag.lastX = e.clientX;
    drag.lastTime = performance.now();
    drag.velocity = 0;

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp, true);
    window.addEventListener('pointercancel', onWindowPointerUp, true);
  });

  track.addEventListener('lostpointercapture', function () {
    if (drag.active) stopDrag();
  });

  track.addEventListener('dragstart', function (e) {
    e.preventDefault();
  });

  track.addEventListener(
    'click',
    function (e) {
      if (drag.active || drag.suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      var card = e.target.closest('.promo-card');
      if (card && track.contains(card)) markViewed(card);
    },
    true
  );

  track.addEventListener('auxclick', function (e) {
    if (e.button !== 1) return;
    var card = e.target.closest('.promo-card');
    if (card && track.contains(card)) markViewed(card);
  });

  track.addEventListener('keydown', function (e) {
    var keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'start', End: 'end' };
    var dir = keys[e.key];
    if (dir === undefined) return;

    var list = track.querySelectorAll('.promo-card');
    var current = document.activeElement;
    var index = -1;
    for (var n = 0; n < list.length; n++) {
      if (list[n] === current) {
        index = n;
        break;
      }
    }
    if (index === -1) return;

    e.preventDefault();

    var nextIndex = index;
    if (dir === 'start') nextIndex = 0;
    else if (dir === 'end') nextIndex = list.length - 1;
    else nextIndex = index + dir;

    var next = list[nextIndex];
    if (!next || next === current) return;

    next.focus({ preventScroll: true });
    next.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' :
