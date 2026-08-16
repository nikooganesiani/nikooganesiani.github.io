document.addEventListener('DOMContentLoaded', () => {
  const sliders = document.querySelectorAll('[data-promo-slider]');

  sliders.forEach((slider) => {
    const track = slider.querySelector('[data-promo-track]');
    const slides = slider.querySelectorAll('[data-promo-slide]');
    const dots = slider.querySelectorAll('[data-promo-dot]');
    const totalSlides = slides.length;

    if (totalSlides <= 1) return;

    let currentIndex = 0;
    let autoplayTimer = null;
    const AUTOPLAY_DELAY = 5000;

    let touchStartX = 0;
    let touchEndX = 0;
    let isSwiping = false;

    const updateSlider = (index) => {
      currentIndex = (index + totalSlides) % totalSlides;
      track.style.transform = `translateX(-${currentIndex * 100}%)`;

      dots.forEach((dot, i) => {
        const isActive = i === currentIndex;
        dot.setAttribute('aria-current', isActive ? 'true' : 'false');
        
        if (isActive) {
          dot.classList.add('bg-[#155dfc]', 'scale-110');
          dot.classList.remove('bg-gray-400/50', 'hover:bg-gray-400');
        } else {
          dot.classList.remove('bg-[#155dfc]', 'scale-110');
          dot.classList.add('bg-gray-400/50', 'hover:bg-gray-400');
        }
      });
    };

    const nextSlide = () => updateSlider(currentIndex + 1);
    const prevSlide = () => updateSlider(currentIndex - 1);

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

    // Dots Click
    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const targetIndex = parseInt(dot.dataset.promoDot, 10);
        updateSlider(targetIndex);
        startAutoplay();
      });
    });

    // Touch / Swipe Events
    track.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      isSwiping = true;
      stopAutoplay();
    }, { passive: true });

    track.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      touchEndX = e.touches[0].clientX;
    }, { passive: true });

    track.addEventListener('touchend', () => {
      if (!isSwiping) return;
      const swipeDistance = touchStartX - touchEndX;
      const threshold = 40;

      if (Math.abs(swipeDistance) > threshold && touchEndX !== 0) {
        if (swipeDistance > 0) {
          nextSlide();
        } else {
          prevSlide();
        }
      }

      touchStartX = 0;
      touchEndX = 0;
      isSwiping = false;
      startAutoplay();
    });

    // Pause Autoplay on Hover
    slider.addEventListener('mouseenter', stopAutoplay);
    slider.addEventListener('mouseleave', startAutoplay);

    // Initial run
    startAutoplay();
  });
});
