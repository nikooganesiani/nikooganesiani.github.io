(() => {
  const AUTOPLAY_DELAY = 5000;
  const ANIM_MS = 600;
  const DRAG_THRESHOLD = 6;
  const FLICK_VELOCITY = 0.32;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const easeOutCubic = (t) => 1 - (1 - t) ** 3;
  const supportsInert = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;

  const rubberband = (value, min, max) => {
    if (value < min) return min - (min - value) * 0.28;
    if (value > max) return max + (value - max) * 0.28;
    return value;
  };

  const ready = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  };

  const initPromoBlock = (root) => {
    const track = root.querySelector('[data-promo-track]');
    if (!track) return;

    const slides = Array.from(root.querySelectorAll('[data-promo-slide]'));
    const images = slides.map((slide) => slide.querySelector('[data-promo-image]'));
    const total = slides.length;
    if (total <= 1) return;

    const dotsBox = root.querySelector('[data-promo-dots]');
    const dots = Array.from(root.querySelectorAll('[data-promo-dot]'));
    const worm = root.querySelector('[data-promo-worm]');
    const statusEl = root.querySelector('[data-promo-status]');

    let slideWidth = 0;
    let maxScroll = 0;
    let slideOffsets = [];
    let dotMetrics = [];
    let currentIndex = 0;
    let ticking = false;
    let animRaf = 0;
    let isAnimating = false;
    let autoplayTimer = 0;
    let isInView = true;
    let isHovering = false;
    let isFocusWithin = false;
    let isPointerDown = false;
    let hasDragged = false;
    let suppressClick = false;
    let dragStartX = 0;
    let dragStartScroll = 0;
    let dragDelta = 0;
    let dragRaf = 0;
    let velocityX = 0;
    let lastMoveX = 0;
    let lastMoveT = 0;
    let scrollEndTimer = 0;
    let snapLocked = false;

    const getTarget = (index) => slideOffsets[index] ?? index * slideWidth;

    const setSnap = (on) => {
      snapLocked = !on;
      track.style.scrollSnapType = on ? '' : 'none';
      track.style.scrollBehavior = on ? '' : 'auto';
      for (let i = 0; i < slides.length; i++) {
        slides[i].style.scrollSnapAlign = on ? '' : 'none';
      }
    };

    const enableSnapNextFrame = () => {
      requestAnimationFrame(() => {
        if (isPointerDown || isAnimating) return;
        setSnap(true);
      });
    };

    const measure = () => {
      slideWidth = track.clientWidth || 1;
      const base = slides[0].offsetLeft;
      slideOffsets = slides.map((slide) => slide.offsetLeft - base);
      maxScroll = Math.max(track.scrollWidth - slideWidth, 0);

      if (!dotsBox || !dots.length) return;

      const boxLeft = dotsBox.getBoundingClientRect().left;
      dotMetrics = dots.map((dot) => {
        const rect = dot.getBoundingClientRect();
        return { x: rect.left - boxLeft, w: rect.width };
      });

      if (worm && dotMetrics[0]) {
        worm.style.width = `${dotMetrics[0].w}px`;
      }
    };

    const nearestIndexFrom = (scrollPos) => {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < slideOffsets.length; i++) {
        const dist = Math.abs(slideOffsets[i] - scrollPos);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    };

    const setLayers = (on) => {
      const value = on ? 'transform' : '';
      for (let i = 0; i < images.length; i++) {
        if (images[i]) images[i].style.willChange = value;
      }
      if (worm) worm.style.willChange = on ? 'transform, width' : '';
    };

    const setDragOffset = (dx) => {
      const value = dx ? `translate3d(${dx}px,0,0)` : '';
      for (let i = 0; i < slides.length; i++) {
        slides[i].style.transform = value;
        slides[i].style.willChange = dx ? 'transform' : '';
      }
    };

    const updateWorm = (ratio) => {
      if (!worm || dots.length < 2 || dotMetrics.length < 2) return;

      const n = dots.length;
      const pos = ratio * (n - 1);
      const base = Math.min(Math.floor(pos + 1e-6), n - 2);
      const rawFrac = clamp(pos - base, 0, 1);
      const frac = reduceMotion.matches ? rawFrac : easeInOutQuad(rawFrac);
      const a = dotMetrics[base];
      const b = dotMetrics[base + 1];
      if (!a || !b) return;

      const dw = a.w;
      const adv = b.x - a.x;
      let width = dw;
      let off = a.x;

      if (frac <= 0.5) {
        width = dw + frac * 2 * adv;
      } else {
        width = dw + (1 - frac) * 2 * adv;
        off = a.x + (frac - 0.5) * 2 * adv;
      }

      worm.style.transform = `translate3d(${off}px,0,0)`;
      worm.style.width = `${width}px`;
    };

    const paintAt = (scrollPos) => {
      const w = slideWidth || 1;
      const ratio = maxScroll > 0 ? clamp(scrollPos / maxScroll, 0, 1) : 0;
      const idx = nearestIndexFrom(clamp(scrollPos, 0, maxScroll));
      currentIndex = idx;

      if (!reduceMotion.matches) {
        const center = scrollPos + w / 2;
        for (let i = 0; i < total; i++) {
          const img = images[i];
          if (!img) continue;
          if (Math.abs(i - idx) > 1) {
            img.style.transform = '';
            continue;
          }
          const slideCenter = (slideOffsets[i] ?? i * w) + w / 2;
          const diff = clamp((slideCenter - center) / w, -1, 1);
          const easeOffset = easeInOutQuad(Math.abs(diff)) * Math.sign(diff || 0);
          img.style.transform = `translate3d(${easeOffset * 6}%,0,0) scale(${1 - Math.abs(easeOffset) * 0.02})`;
        }
      }

      updateWorm(ratio);
    };

    const paint = () => {
      ticking = false;
      if (isPointerDown && hasDragged) return;
      paintAt(track.scrollLeft);
    };

    const requestPaint = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(paint);
    };

    const syncSlideState = (index) => {
      slides.forEach((slide, i) => {
        const active = i === index;
        slide.setAttribute('aria-hidden', String(!active));
        if (supportsInert) {
          slide.inert = !active;
        } else {
          slide.querySelectorAll('a').forEach((link) => {
            if (active) link.removeAttribute('tabindex');
            else link.tabIndex = -1;
          });
        }
      });

      dots.forEach((dot, i) => {
        const active = i === index;
        dot.setAttribute('aria-current', active ? 'true' : 'false');
        dot.tabIndex = active ? 0 : -1;
      });
    };

    const announce = (index) => {
      if (!statusEl) return;
      const title = slides[index]?.dataset.title || '';
      statusEl.textContent = title
        ? `Slide ${index + 1} of ${total}: ${title}`
        : `Slide ${index + 1} of ${total}`;
    };

    const cancelAnimation = () => {
      if (animRaf) {
        cancelAnimationFrame(animRaf);
        animRaf = 0;
      }
      isAnimating = false;
      setLayers(false);
    };

    const smoothScrollTo = (targetX, { duration = ANIM_MS, ease = easeInOutQuad } = {}) => {
      cancelAnimation();

      if (reduceMotion.matches) {
        track.scrollLeft = targetX;
        paintAt(targetX);
        syncSlideState(currentIndex);
        enableSnapNextFrame();
        return;
      }

      const startX = track.scrollLeft;
      const distance = targetX - startX;
      if (Math.abs(distance) < 1) {
        track.scrollLeft = targetX;
        paintAt(targetX);
        syncSlideState(currentIndex);
        enableSnapNextFrame();
        return;
      }

      setSnap(false);
      setLayers(true);
      isAnimating = true;
      const startTime = performance.now();

      const step = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const x = startX + distance * ease(progress);
        track.scrollLeft = x;
        paintAt(x);

        if (progress < 1) {
          animRaf = requestAnimationFrame(step);
          return;
        }

        animRaf = 0;
        isAnimating = false;
        track.scrollLeft = targetX;
        setLayers(false);
        paintAt(targetX);
        syncSlideState(currentIndex);
        enableSnapNextFrame();
      };

      animRaf = requestAnimationFrame(step);
    };

    const canAutoplay = () =>
      !reduceMotion.matches &&
      isInView &&
      !document.hidden &&
      !isPointerDown &&
      !isHovering &&
      !isFocusWithin;

    const stopAutoplay = () => {
      if (!autoplayTimer) return;
      clearTimeout(autoplayTimer);
      autoplayTimer = 0;
    };

    const scheduleAutoplay = () => {
      stopAutoplay();
      if (!canAutoplay()) return;
      autoplayTimer = window.setTimeout(() => {
        autoplayTimer = 0;
        if (!canAutoplay() || isAnimating) {
          scheduleAutoplay();
          return;
        }
        goTo((currentIndex + 1) % total, { user: false, wrap: true });
        scheduleAutoplay();
      }, AUTOPLAY_DELAY);
    };

    const goTo = (index, { user = true, wrap = false, duration = ANIM_MS, ease = easeInOutQuad } = {}) => {
      const next = wrap
        ? ((index % total) + total) % total
        : clamp(index, 0, total - 1);
      currentIndex = next;
      smoothScrollTo(getTarget(next), { duration, ease });
      syncSlideState(next);
      if (user) {
        announce(next);
        scheduleAutoplay();
      }
    };

    const onScrollEnd = () => {
      if (isPointerDown || isAnimating) return;
      const idx = nearestIndexFrom(track.scrollLeft);
      if (idx !== currentIndex) currentIndex = idx;
      syncSlideState(currentIndex);
    };

    const setDraggingUI = (on) => {
      track.style.cursor = on ? 'grabbing' : '';
      document.body.style.userSelect = on ? 'none' : '';
      document.body.style.cursor = on ? 'grabbing' : '';
    };

    const visualScroll = () => rubberband(dragStartScroll - dragDelta, 0, maxScroll);

    const flushDrag = () => {
      dragRaf = 0;
      if (!isPointerDown) return;
      const visual = visualScroll();
      setDragOffset(dragStartScroll - visual);
      paintAt(visual);
    };

    const commitDragTransform = () => {
      if (dragRaf) {
        cancelAnimationFrame(dragRaf);
        dragRaf = 0;
      }
      const visual = clamp(dragStartScroll - dragDelta, 0, maxScroll);
      track.scrollLeft = visual;
      setDragOffset(0);
      return visual;
    };

    const endDrag = (event) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      setDraggingUI(false);

      if (event && track.hasPointerCapture?.(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }

      if (!hasDragged) {
        setDragOffset(0);
        enableSnapNextFrame();
        scheduleAutoplay();
        return;
      }

      const now = performance.now();
      if (now - lastMoveT > 80) velocityX = 0;

      const visual = commitDragTransform();
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);

      let next = nearestIndexFrom(visual);
      if (Math.abs(velocityX) > FLICK_VELOCITY) {
        next = velocityX < 0
          ? Math.min(total - 1, next + (visual > getTarget(next) + 1 ? 0 : 1))
          : Math.max(0, next - (visual < getTarget(next) - 1 ? 0 : 1));
      }

      const dist = Math.abs(getTarget(next) - visual);
      const duration = clamp(260 + dist * 0.32, 260, 480);
      goTo(next, { user: true, duration, ease: easeOutCubic });
      hasDragged = false;
    };

    dots.forEach((dot, i) => {
      dot.addEventListener('click', (event) => {
        event.preventDefault();
        goTo(i, { user: true, duration: ANIM_MS, ease: easeInOutQuad });
        dots[i]?.focus({ preventScroll: true });
      });
    });

    track.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      if (event.button !== 0) return;

      cancelAnimation();
      setSnap(false);
      isPointerDown = true;
      hasDragged = false;
      dragDelta = 0;
      dragStartX = event.clientX;
      dragStartScroll = track.scrollLeft;
      velocityX = 0;
      lastMoveX = event.clientX;
      lastMoveT = performance.now();
      stopAutoplay();
      track.setPointerCapture(event.pointerId);
    });

    track.addEventListener('pointermove', (event) => {
      if (!isPointerDown || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;

      const now = performance.now();
      const dx = event.clientX - lastMoveX;
      const dt = now - lastMoveT;
      if (dt > 0) {
        const inst = dx / dt;
        velocityX = dt > 64 ? inst : velocityX * 0.72 + inst * 0.28;
      }
      lastMoveX = event.clientX;
      lastMoveT = now;

      dragDelta = event.clientX - dragStartX;
      if (!hasDragged && Math.abs(dragDelta) > DRAG_THRESHOLD) {
        hasDragged = true;
        setDraggingUI(true);
        setLayers(true);
      }
      if (!hasDragged) return;

      event.preventDefault();
      if (!dragRaf) dragRaf = requestAnimationFrame(flushDrag);
    });

    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('lostpointercapture', endDrag);

    track.addEventListener(
      'click',
      (event) => {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    track.addEventListener(
      'scroll',
      () => {
        requestPaint();
        window.clearTimeout(scrollEndTimer);
        scrollEndTimer = window.setTimeout(onScrollEnd, 80);
      },
      { passive: true }
    );

    if ('onscrollend' in window) {
      track.addEventListener('scrollend', onScrollEnd, { passive: true });
    }

    track.addEventListener(
      'touchstart',
      () => {
        cancelAnimation();
        stopAutoplay();
      },
      { passive: true }
    );
    track.addEventListener('touchend', scheduleAutoplay, { passive: true });
    track.addEventListener(
      'wheel',
      () => {
        cancelAnimation();
      },
      { passive: true }
    );

    root.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      isHovering = true;
      stopAutoplay();
    });
    root.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse') return;
      isHovering = false;
      scheduleAutoplay();
    });
    root.addEventListener('focusin', () => {
      isFocusWithin = true;
      stopAutoplay();
    });
    root.addEventListener('focusout', (event) => {
      if (root.contains(event.relatedTarget)) return;
      isFocusWithin = false;
      scheduleAutoplay();
    });

    root.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          goTo(currentIndex + 1, { user: true });
          dots[currentIndex]?.focus({ preventScroll: true });
          break;
        case 'ArrowLeft':
          event.preventDefault();
          goTo(currentIndex - 1, { user: true });
          dots[currentIndex]?.focus({ preventScroll: true });
          break;
        case 'Home':
          event.preventDefault();
          goTo(0, { user: true });
          dots[0]?.focus({ preventScroll: true });
          break;
        case 'End':
          event.preventDefault();
          goTo(total - 1, { user: true });
          dots[total - 1]?.focus({ preventScroll: true });
          break;
        default:
          break;
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAutoplay();
      else scheduleAutoplay();
    });

    reduceMotion.addEventListener('change', () => {
      if (reduceMotion.matches) {
        images.forEach((img) => {
          if (img) img.style.transform = '';
        });
        stopAutoplay();
      }
      requestPaint();
      scheduleAutoplay();
    });

    window.addEventListener('pagehide', stopAutoplay);
    window.addEventListener('pageshow', scheduleAutoplay);

    const ro = new ResizeObserver(() => {
      if (isPointerDown) return;
      const idx = currentIndex;
      const prevSnap = snapLocked;
      setSnap(false);
      measure();
      track.scrollLeft = getTarget(idx);
      paintAt(track.scrollLeft);
      if (!prevSnap) return;
      enableSnapNextFrame();
    });
    ro.observe(track);
    if (dotsBox) ro.observe(dotsBox);

    const io = new IntersectionObserver(
      ([entry]) => {
        isInView = !!entry?.isIntersecting;
        if (isInView) scheduleAutoplay();
        else stopAutoplay();
      },
      { threshold: 0.2 }
    );
    io.observe(root);

    measure();
    paintAt(0);
    syncSlideState(0);
    scheduleAutoplay();
  };

  ready(() => {
    document.querySelectorAll('[data-promo-block]').forEach(initPromoBlock);
  });
})();
