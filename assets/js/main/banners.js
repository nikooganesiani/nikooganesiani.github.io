(function initPromoStories() {
  'use strict';

  var STORAGE_KEY = 'viewed_promo_stories';
  var DRAG_THRESHOLD_PX = 6;
  var VIEWED_FALLBACK = ['bg-gradient-to-b', 'from-blue-900', 'to-zinc-900'];

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

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

  function saveViewed(viewed) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(viewed)));
    } catch (e) {
    }
  }

  function paintViewed(card) {
    if (card.hasAttribute('data-viewed')) return;
    card.setAttribute('data-viewed', '');
    var title = card.getAttribute('data-title') || 'Промо';
    card.setAttribute('aria-label', title + ' (просмотрено)');
  }

  function isDragPointer(e) {
    return (e.pointerType === 'mouse' || e.pointerType === 'pen') && e.button === 0;
  }

  function initTrack(track) {
    var cards = track.querySelectorAll('.promo-card');
    if (!cards.length) return;

    var viewed = loadViewed();
    for (var i = 0; i < cards.length; i++) {
      var id = cards[i].getAttribute('data-promo-id');
      if (id && viewed.has(String(id))) paintViewed(cards[i]);
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
        if (frame) {
          for (var c = 0; c < VIEWED_FALLBACK.length; c++) {
            frame.classList.add(VIEWED_FALLBACK[c]);
          }
        }
      },
      true
    );

    var drag = {
      active: false,
      moved: false,
      suppressClick: false,
      pointerId: null,
      startX: 0,
      startScroll: 0,
      nextX: 0,
      raf: 0,
    };

    function applyDragScroll() {
      drag.raf = 0;
      if (!drag.active) return;
      track.scrollLeft = drag.startScroll - (drag.nextX - drag.startX);
    }

    function endDrag(e) {
      if (!drag.active) return;
      if (e && drag.pointerId !== null && e.pointerId !== drag.pointerId) return;

      drag.active = false;
      track.classList.remove('is-dragging');

      if (drag.raf) {
        cancelAnimationFrame(drag.raf);
        drag.raf = 0;
        track.scrollLeft = drag.startScroll - (drag.nextX - drag.startX);
      }

      if (drag.moved) {
        drag.suppressClick = true;
        window.setTimeout(function () {
          drag.suppressClick = false;
          drag.moved = false;
        }, 0);
      }

      if (
        e &&
        drag.pointerId !== null &&
        track.hasPointerCapture &&
        track.hasPointerCapture(e.pointerId)
      ) {
        track.releasePointerCapture(e.pointerId);
      }
      drag.pointerId = null;
    }

    track.addEventListener('pointerdown', function (e) {
      if (!isDragPointer(e)) return;

      drag.active = true;
      drag.moved = false;
      drag.pointerId = e.pointerId;
      drag.startX = e.clientX;
      drag.startScroll = track.scrollLeft;
      drag.nextX = e.clientX;

      track.classList.add('is-dragging');
      try {
        track.setPointerCapture(e.pointerId);
      } catch (err) {
      }
    });

    track.addEventListener('pointermove', function (e) {
      if (!drag.active || e.pointerId !== drag.pointerId) return;

      drag.nextX = e.clientX;
      if (Math.abs(e.clientX - drag.startX) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
      }
      if (!drag.raf) {
        drag.raf = requestAnimationFrame(applyDragScroll);
      }
    });

    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('lostpointercapture', function () {
      if (drag.active) endDrag();
    });

    track.addEventListener('dragstart', function (e) {
      e.preventDefault();
    });

    track.addEventListener(
      'click',
      function (e) {
        if (drag.suppressClick || drag.moved) {
          e.preventDefault();
          e.stopPropagation();
          drag.moved = false;
          drag.suppressClick = false;
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
      for (var i = 0; i < list.length; i++) {
        if (list[i] === current) {
          index = i;
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

      var behavior = prefersReducedMotion() ? 'auto' : 'smooth';
      next.focus({ preventScroll: true });
      next.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: behavior });
    });
  }

  ready(function () {
    var track = document.getElementById('promo-slider-track');
    if (track) initTrack(track);
  });
})();
