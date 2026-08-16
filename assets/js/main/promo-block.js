document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('promoBannerTrack');
  const dotsBox = document.getElementById('promoBannerDots');
  if (!track) return;

  const slides = track.querySelectorAll('.promo-banner-slide');
  const images = track.querySelectorAll('.promo-banner-image');
  const totalSlides = slides.length;
  if (totalSlides <= 1) return;

  let worm = null;
  let dots = [];
  let isTicking = false;
  let currentIndex = 0;
  let autoplayTimer = null;
  let isAnimating = false;
  const AUTOPLAY_DELAY = 5000;

  // Mouse Drag State
  let isMouseDown = false;
  let startMouseX = 0;
  let scrollStartLeft = 0;
  let hasDragged = false;

  // EaseInOutQuad Formula
  const easeInOutQuad = (t) => {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  };

  const getSlideTargetLeft = (index) => {
    return index * track.clientWidth;
  };

  // Custom Smooth Scroll without Snap Interference
  const smoothScrollTo = (targetX, duration = 600) => {
    if (isAnimating) return;

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
    if (index < 0 || index >= totalSlides) return;
    smoothScrollTo(getSlideTargetLeft(index));
  };

  const buildDots = () => {
    if (!dotsBox) return;
    dotsBox.innerHTML = '';
    dots = [];

    // Точки: 7px на мобильных, 12px на ПК
    for (let i = 0; i < totalSlides; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'w-[7px] h-[7px] md:w-3 md:h-3 rounded-full bg-slate-300/80 flex-shrink-0 p-0 border-0 cursor-pointer outline-none transition-colors duration-300';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);

      dot.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToSlide(i);
        restartAutoplay();
      });

      dotsBox.appendChild(dot);
      dots.push(dot);
    }

    // Активный worm-индикатор: 7px на мобильных, 12px на ПК
    worm = document.createElement('div');
    worm.className = 'absolute left-0 top-0 h-[7px] md:h-3 rounded-full bg-[#155dfc] pointer-events-none will-change-transform';

    dotsBox.appendChild(worm);
  };

  const paint = () => {
    isTicking = false;
    if (!track) return;

    const trackWidth = track.clientWidth || 1;
    const scrollPos = track.scrollLeft;
    const trackCenter = scrollPos + trackWidth / 2;
    let best = 0;
    let bestDist = Infinity;

    // Плавный параллакс изображений внутри карточек
    slides.forEach((slide, i) => {
      const slideCenter = i * trackWidth + trackWidth / 2;
      const diff = (slideCenter - trackCenter) / trackWidth;
      const dist = Math.abs(slideCenter - trackCenter);

      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }

      const img = images[i];
      if (img) {
        const clampedDiff = Math.max(-1, Math.min(1, diff));
        const easeOffset = easeInOutQuad(Math.abs(clampedDiff)) * (clampedDiff < 0 ? -1 : 1);
        const parallaxX = easeOffset * 6;
        const scale = 1 - Math.abs(easeOffset) * 0.02;

        img.style.transform = `translate3d(${parallaxX}%, 0, 0) scale(${scale})`;
      }
    });

    currentIndex = best;

    // Анимация worm-индикатора с EaseInOutQuad
    if (!worm || dots.length < 2) return;
    const n = dots.length;

    const maxScroll = track.scrollWidth - trackWidth;
    const ratio = maxScroll > 0 ? Math.max(0, Math.min(scrollPos, maxScroll)) / maxScroll : 0;
    const pos = ratio * (n - 1);
    const base = Math.min(Math.floor(pos + 1e-6), n - 2);
    const rawFrac = Math.min(Math.max(pos - base, 0), 1);
    const frac = easeInOutQuad(rawFrac);

    const boxRect = dotsBox.getBoundingClientRect();
    if (boxRect.width < 1) return;

    const a = dots[base].getBoundingClientRect();
    const b = dots[base + 1].getBoundingClientRect();
    const x1 = a.left - boxRect.left;
    const x2 = b.left - boxRect.left;
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

  // Mouse Drag для ПК
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
      scrollToSlide(currentIndex);
    }
    restartAutoplay();
  });

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
