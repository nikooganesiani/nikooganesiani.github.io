document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('promoBannerTrack');
  const dotsBox = document.getElementById('promoBannerDots');
  if (!track) return;

  const slides = track.querySelectorAll('.promo-banner-slide');
  const images = track.querySelectorAll('.promo-banner-image');
  const totalSlides = slides.length;
  if (totalSlides <= 1) return;

  let worm = null;
  let dotsInner = null;
  let isTicking = false;
  let currentIndex = 0;
  let autoplayTimer = null;
  let isAnimating = false;
  const AUTOPLAY_DELAY = 5000;

  // Mouse Drag Variables (ПК свайп)
  let isMouseDown = false;
  let startMouseX = 0;
  let scrollStartLeft = 0;
  let hasDragged = false;

  // EaseInOutQuad Formula
  const easeInOutQuad = (t) => {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  };

  const slideLeft = (el) => {
    return el.offsetLeft - track.offsetLeft;
  };

  // Custom Smooth Scroll without Snap Interference
  const smoothScrollTo = (targetX, duration = 600) => {
    if (isAnimating) return;
    
    // Временно отключаем CSS Snap, чтобы не было дерганий на ПК
    track.style.scrollSnapType = 'none';
    track.style.scrollBehavior = 'auto';

    const startX = track.scrollLeft;
    const distance = targetX - startX;
    const startTime = performance.now();
    isAnimating = true;

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeInOutQuad(progress);

      track.scrollLeft = startX + distance * ease;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        track.scrollLeft = targetX;
        track.style.scrollSnapType = 'x mandatory';
        isAnimating = false;
        paint();
      }
    };

    requestAnimationFrame(step);
  };

  const scrollToSlide = (index) => {
    const target = slides[index];
    if (!target) return;
    smoothScrollTo(slideLeft(target));
  };

  const buildDots = () => {
    if (!dotsBox) return;
    dotsBox.innerHTML = '';

    dotsInner = document.createElement('div');
    dotsInner.style.cssText = 'position:relative;display:flex;align-items:center;gap:6px;';

    for (let i = 0; i < totalSlides; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'promo-snake-dot';
      dot.style.cssText = 'width:6px;height:6px;border-radius:9999px;background:#cbd5e1;flex-shrink:0;padding:0;border:none;cursor:pointer;outline:none;transition:background 0.3s;';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);

      dot.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToSlide(i);
        restartAutoplay();
      });

      dotsInner.appendChild(dot);
    }

    worm = document.createElement('div');
    worm.style.cssText = 'position:absolute;left:0;top:0;height:6px;width:6px;border-radius:9999px;background:#155dfc;pointer-events:none;will-change:transform,width;';

    dotsInner.appendChild(worm);
    dotsBox.appendChild(dotsInner);
  };

  const paint = () => {
    isTicking = false;
    if (!track) return;

    const trackCenter = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;

    // Плавная анимация картинки внутри карточки без вылета за border-radius
    slides.forEach((slide, i) => {
      const slideCenter = slideLeft(slide) + slide.offsetWidth / 2;
      const diff = (slideCenter - trackCenter) / track.clientWidth;
      const dist = Math.abs(slideCenter - trackCenter);

      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }

      const img = images[i];
      if (img) {
        const clampedDiff = Math.max(-1, Math.min(1, diff));
        const easeOffset = easeInOutQuad(Math.abs(clampedDiff)) * (clampedDiff < 0 ? -1 : 1);
        const parallaxX = easeOffset * 8; // Смещение картинки
        const scale = 1 - Math.abs(easeOffset) * 0.03; // Масштабирование

        img.style.transform = `translate3d(${parallaxX}%, 0, 0) scale(${scale})`;
      }
    });

    currentIndex = best;

    // Расчет анимации worm/snake для точек
    if (!worm || !dotsInner) return;
    const dots = dotsInner.querySelectorAll('.promo-snake-dot');
    const n = dots.length;
    if (n < 2) return;

    const maxScroll = track.scrollWidth - track.clientWidth;
    const ratio = maxScroll > 0 ? Math.max(0, Math.min(track.scrollLeft, maxScroll)) / maxScroll : 0;
    const pos = ratio * (n - 1);
    const base = Math.min(Math.floor(pos + 1e-6), n - 2);
    const rawFrac = Math.min(Math.max(pos - base, 0), 1);
    const frac = easeInOutQuad(rawFrac);

    const ir = dotsInner.getBoundingClientRect();
    if (ir.width < 1) return;

    const a = dots[base].getBoundingClientRect();
    const b = dots[base + 1].getBoundingClientRect();
    const x1 = a.left - ir.left;
    const x2 = b.left - ir.left;
    const dw = a.width;
    const adv = x2 - x1;
    let width = dw;
    let off = x1;

    if (frac <= 0.5) {
      width = dw + frac * 2 * adv;
    } else {
      width = dw + (1 - frac) * 2 * adv;
      off = x1 + (frac - 0.5) * 2 * adv;
    }

    worm.style.transform = `translate3d(${off}px,0,0)`;
    worm.style.width = `${width}px`;
  };

  const requestPaint = () => {
    if (!isTicking) {
      isTicking = true;
      window.requestAnimationFrame(paint);
    }
  };

  const nextSlide = () => {
    if (isAnimating || isMouseDown) return;
    const next = (currentIndex + 1) % totalSlides;
    scrollToSlide(next);
  };

  const startAutoplay = () => {
    stopAutoplay();
    autoplayTimer = setInterval(nextSlide, AUTOPLAY_DELAY);
  };

  const stopAutoplay = () => {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  };

  const restartAutoplay = () => {
    stopAutoplay();
    startAutoplay();
  };

  // Mouse Drag Events (Полноценный свайп мышью на ПК)
  track.addEventListener('mousedown', (e) => {
    isMouseDown = true;
    hasDragged = false;
    startMouseX = e.pageX - track.offsetLeft;
    scrollStartLeft = track.scrollLeft;
    track.style.scrollSnapType = 'none';
    stopAutoplay();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    e.preventDefault();
    const x = e.pageX - track.offsetLeft;
    const walk = (x - startMouseX) * 1.2;
    if (Math.abs(walk) > 5) {
      hasDragged = true;
    }
    track.scrollLeft = scrollStartLeft - walk;
  });

  window.addEventListener('mouseup', () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    track.style.scrollSnapType = 'x mandatory';

    if (hasDragged) {
      // Подтягиваем к ближайшему слайду после перетаскивания
      scrollToSlide(currentIndex);
    }
    restartAutoplay();
  });

  // Защита от открытия ссылки при перетаскивании мышью
  track.addEventListener('click', (e) => {
    if (hasDragged) {
      e.preventDefault();
      e.stopPropagation();
      hasDragged = false;
    }
  }, true);

  // Touch & Scroll Events
  track.addEventListener('scroll', requestPaint, { passive: true });
  track.addEventListener('touchstart', stopAutoplay, { passive: true });
  track.addEventListener('touchend', restartAutoplay, { passive: true });
  track.addEventListener('mouseenter', stopAutoplay);
  track.addEventListener('mouseleave', restartAutoplay);

  window.addEventListener('resize', () => requestPaint());
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => requestPaint()).observe(track);
  }

  // Init
  buildDots();
  requestPaint();
  startAutoplay();
});
