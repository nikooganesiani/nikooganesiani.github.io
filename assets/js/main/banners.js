(function initPromoStories() {
  'use strict';

  var STORAGE_KEY = 'viewed_promo_stories';
  var DRAG_THRESHOLD_PX = 6;
  var CLICK_SUPPRESS_MS = 80;
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
    suppressClick: false,
    pointerId: null,
    startX: 0,
    startScroll: 0,
    nextX: 0,
    raf: 0,
    suppressTimer: 0,
  };

  function isDragPointer(e) {
    return (e.pointerType === 'mouse' || e.pointerType === 'pen') && e.button === 0;
  }

  function applyDragScroll() {
    drag.raf = 0;
    if (!drag.active) return;
    track.scrollLeft = drag.startScroll - (drag.nextX - drag.startX);
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

  function stopDrag(e) {
    if (!drag.tracking) return;
    if (e && drag.pointerId !== null && e.pointerId !== drag.pointerId) return;

    var wasActive = drag.active;

    if (drag.raf) {
      cancelAnimationFrame(drag.raf);
      drag.raf = 0;
      if (wasActive) {
        track.scrollLeft = drag.startScroll - (drag.nextX - drag.startX);
      }
    }

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
    track.classList.remove('is-dragging');
    unbindWindowDrag();

    if (wasActive) armClickSuppress();
  }

  function onWindowPointerMove(e) {
    if (!drag.tracking || e.pointerId !== drag.pointerId) return;

    drag.nextX = e.clientX;

    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) <= DRAG_THRESHOLD_PX) return;
      drag.active = true;
      track.classList.add('is-dragging');
      try {
        if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
      } catch (err) {
        /* Safari edge cases */
      }
    }

    if (!drag.raf) drag.raf = requestAnimationFrame(applyDragScroll);
  }

  function onWindowPointerUp(e) {
    stopDrag(e);
  }

  track.addEventListener('pointerdown', function (e) {
    if (!isDragPointer(e)) return;

    drag.tracking = true;
    drag.active = false;
    drag.pointerId = e.pointerId;
    drag.startX = e.clientX;
    drag.startScroll = track.scrollLeft;
    drag.nextX = e.clientX;

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
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  });
})();
