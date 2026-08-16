document.addEventListener('DOMContentLoaded', () => {
  const sliders = document.querySelectorAll('[data-promo-slider]');

  sliders.forEach((slider) => {
    const parentBlock = slider.closest('.relative');
    const track = slider.querySelector('[data-promo-track]');
    const slides = slider.querySelectorAll('[data-promo-slide]');
    const dots = parentBlock ? parentBlock.querySelectorAll('[data-promo-dot]') : [];
    const totalSlides = slides.length;

    if (totalSlides <= 1) return;

    let currentIndex = 0;
    let autoplayTimer = null;
    const AUTOPLAY_DELAY = 5000;

    let startX = 0;
    let startY = 0;
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

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const targetIndex = parseInt(dot.dataset.promoDot, 10);
        updateSlider(targetIndex);
        startAutoplay();
      });
    });

    // Touch Handling with vertical scroll protection
    track.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isSwiping = true;
      stopAutoplay();
    }, { passive: true });

    track.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = Math.abs(currentX - startX);
      const diffY = Math.abs(currentY - startY);

      if (diffY > diffX) {
        isSwiping = false;
      }
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
      if (!isSwiping) return;
      const endX = e.changedTouches[0].clientX;
      const diffX = startX - endX;
      const threshold = 40;

      if (Math.abs(diffX) > threshold) {
        if (diffX > 0) {
          nextSlide();
        } else {
          prevSlide();
        }
      }

      isSwiping = false;
      startAutoplay();
    });

    slider.addEventListener('mouseenter', stopAutoplay);
    slider.addEventListener('mouseleave', startAutoplay);

    startAutoplay();
  });
});
