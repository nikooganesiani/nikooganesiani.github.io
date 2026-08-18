(() => {
  const AUTOPLAY_DELAY = 5000;
  const ANIM_MS = 600;
  const DRAG_THRESHOLD = 6;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const supportsInert = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;

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
    let scrollEndTimer = 0;

    const getTarget = (index) => slideOffsets[index] ?? index * slideWidth;

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

    const nearestIndex = () => {
      const x = track.scrollLeft;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < slideOffsets.length; i++) {
        const dist = Math.abs(slideOffsets[i] - x);
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
      if (worm) worm.style.willChange = value;
    };

    const updateWorm = (ratio) => {
      if (!worm || dots.length < 2 || dotMetrics.length < 2) return;

      const pos = ratio * (dots.length - 1);
      const base = Math.min(Math.floor(pos + 1e-6), dots.length - 2);
      const rawFrac = clamp(pos - base, 0, 1);
      const frac = reduceMotion.matches ? rawFrac : easeInOutQuad(rawFrac);
      const a = dotMetrics[base];
      const b = dotMetrics[base + 1];
      if (!a || !b) return;

      const adv = b.x - a.x;
      let width = a.w;
      let off = a.x;

      if (frac <= 0.5) {
        width = a.w + frac * 2 * adv;
      } else {
        width = a.w + (1 - frac) * 2 * adv;
        off = a.x + (frac - 0.5) * 2 * adv;
      }

      const sx = a.w > 0 ? width / a.w : 1;
      worm.style.transform = `translate3d(${off}px,0,0) scaleX(${sx})`;
    };

    const paint = () => {
      ticking = false;
      const w = slideWidth || 1;
      const scrollPos = track.scrollLeft;
      const ratio = maxScroll > 0 ? clamp(scrollPos / maxScroll, 0, 1) : 0;
      const idx = nearestIndex();
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
          const diff = clamp((i * w + w / 2 - center) / w, -1, 1);
          const easeOffset = easeInOutQuad(Math.abs(diff)) * Math.sign(diff || 0);
          img.style.transform = `translate3d(${easeOffset * 6}%,0,0) scale(${1 - Math.abs(easeOffset) * 0.02})`;
        }
      }

      updateWorm(ratio);
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
      track.style.scrollSnapType = '';
      track.style.scrollBehavior = '';
      setLayers(false);
    };

    const enableSnapNextFrame = () => {
      requestAnimationFrame(() => {
        track.style.scrollSnapType = '';
        track.style.scrollBehavior = '';
      });
    };

    const smoothScrollTo = (targetX) => {
      cancelAnimation();

      if (reduceMotion.matches) {
        track.scrollLeft = targetX;
        paint();
        syncSlideState(currentIndex);
        return;
      }

      const startX = track.scrollLeft;
      const distance = targetX - startX;
      if (Math.abs(distance) < 1) {
        track.scrollLeft = targetX;
        paint();
        syncSlideState(currentIndex);
        return;
      }

      track.style.scrollSnapType = 'none';
      track.style.scrollBehavior = 'auto';
      setLayers(true);
      isAnimating = true;
      const startTime = performance.now();

      const step = (now) => {
        const progress = Math.min((now - startTime) / ANIM_MS, 1);
        track.scrollLeft = startX + distance * easeInOutQuad(progress);

        if (progress < 1) {
          animRaf = requestAnimationFrame(step);
          return;
        }

        animRaf = 0;
        isAnimating = false;
        track.scrollLeft = targetX;
        setLayers(false);
        enableSnapNextFrame();
        paint();
        syncSlideState(currentIndex);
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

    const goTo = (index, { user = true, wrap = false } = {}) => {
      const next = wrap
        ? ((index % total) + total) % total
        : clamp(index, 0, total - 1);
      currentIndex = next;
      smoothScrollTo(getTarget(next));
      syncSlideState(next);
      if (user) {
        announce(next);
        scheduleAutoplay();
      }
    };

    const onScrollEnd = () => {
      if (isPointerDown || isAnimating) return;
      const idx = nearestIndex();
      if (idx !== currentIndex) currentIndex = idx;
      syncSlideState(currentIndex);
    };

    const endDrag = (event) => {
      if (!isPointerDown) return;
      isPointerDown = false;

      if (track.hasPointerCapture?.(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }

      if (hasDragged) {
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
        goTo(nearestIndex(), { user: true });
      } else {
        track.style.scrollSnapType = '';
        scheduleAutoplay();
      }

      hasDragged = false;
      setLayers(false);
    };

    dots.forEach((dot, i) => {
      dot.addEventListener('click', (event) => {
        event.preventDefault();
        goTo(i, { user: true });
        dots[i]?.focus({ preventScroll: true });
      });
    });

    track.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      cancelAnimation();
      isPointerDown = true;
      hasDragged = false;
      dragStartX = event.clientX;
      dragStartScroll = track.scrollLeft;
      track.style.scrollSnapType = 'none';
      track.style.scrollBehavior = 'auto';
      stopAutoplay();
      track.setPointerCapture(event.pointerId);
    });

    track.addEventListener('pointermove', (event) => {
      if (!isPointerDown || event.pointerType !== 'mouse') return;
      const dx = event.clientX - dragStartX;
      if (!hasDragged && Math.abs(dx) > DRAG_THRESHOLD) {
        hasDragged = true;
        setLayers(true);
      }
      if (!hasDragged) return;
      event.preventDefault();
      track.scrollLeft = dragStartScroll - dx;
    });

    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

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

    root.addEventListener('pointerenter', () => {
      isHovering = true;
      stopAutoplay();
    });
    root.addEventListener('pointerleave', () => {
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
      const idx = currentIndex;
      measure();
      track.style.scrollSnapType = 'none';
      track.scrollLeft = getTarget(idx);
      paint();
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
    paint();
    syncSlideState(0);
    scheduleAutoplay();
  };

  ready(() => {
    document.querySelectorAll('[data-promo-block]').forEach(initPromoBlock);
  });
})();
