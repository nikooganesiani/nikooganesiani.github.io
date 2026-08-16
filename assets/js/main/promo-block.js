document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('promoBannerTrack');
  const dotsBox = document.getElementById('promoBannerDots');
  if (!track) return;

  const slides = track.querySelectorAll('.promo-banner-slide');
  const totalSlides = slides.length;
  if (totalSlides <= 1) return;

  let worm = null;
  let dotsInner = null;
  let isTicking = false;
  let currentIndex = 0;
  let autoplayTimer = null;
  const AUTOPLAY_DELAY = 5000;

  const slideLeft = (el) => {
    return el.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
  };

  const scrollToSlide = (index) => {
    const target = slides[index];
    if (!target) return;
    const targetLeft = slideLeft(target);
    track.scrollTo({ left: targetLeft, behavior: 'smooth' });
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
      dot.style.cssText = 'width:6px;height:6px;border-radius:9999px;background:#cbd5e1;flex-shrink:0;padding:0;border:none;cursor:pointer;outline:none;';
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

    // Detect active index
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;

    for (let i = 0; i < totalSlides; i++) {
      const mid = slideLeft(slides[i]) + slides[i].offsetWidth / 2;
      const d = Math.abs(mid - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    currentIndex = best;

    // Animate snake worm
    if (!worm || !dotsInner) return;
    const dots = dotsInner.querySelectorAll('.promo-snake-dot');
    const n = dots.length;
    if (n < 2) return;

    let maxScroll = slideLeft(slides[totalSlides - 1]);
    if (maxScroll < 1) maxScroll = (totalSlides - 1) * (track.clientWidth || 1);

    const ratio = maxScroll > 0 ? Math.max(0, Math.min(track.scrollLeft, maxScroll)) / maxScroll : 0;
    const pos = ratio * (n - 1);
    const base = Math.min(Math.floor(pos + 1e-6), n - 2);
    const frac = Math.min(Math.max(pos - base, 0), 1);

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

  // Event Listeners
  track.addEventListener('scroll', requestPaint, { passive: true });
  track.addEventListener('touchstart', stopAutoplay, { passive: true });
  track.addEventListener('touchend', startAutoplay, { passive: true });
  track.addEventListener('mouseenter', stopAutoplay);
  track.addEventListener('mouseleave', startAutoplay);

  window.addEventListener('resize', () => {
    paint();
  });

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => paint()).observe(track);
  }

  // Init
  buildDots();
  requestPaint();
  startAutoplay();
});
