document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'cookie_consent_accepted';
  const banner = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('cookie-accept-btn');

  if (!banner || !acceptBtn) {
    return;
  }

  const isAccepted = localStorage.getItem(STORAGE_KEY);

const checkAndAdjustPosition = () => {
    if (!isAccepted) {
      const rect = banner.getBoundingClientRect();
      const isMobileViewport = window.innerWidth < 768;

      if (isMobileViewport && (window.innerHeight - rect.top) < 120) {
        banner.style.position = 'relative';
        banner.style.bottom = 'auto';
        banner.style.top = 'auto';
        banner.style.transform = 'none';
        banner.classList.add('is-mobile-adjusted');
      } else {
        banner.style.position = 'fixed';
        banner.style.bottom = '5rem';
        banner.style.top = 'auto';
        banner.style.transform = 'translateX(-50%)';
        if (banner.classList.contains('is-mobile-adjusted')) {
          banner.classList.remove('is-mobile-adjusted');
        }
      }

      setTimeout(() => {
        banner.classList.remove('translate-y-8', 'opacity-0');
        banner.classList.add('translate-y-0', 'opacity-100');
      }, 400);
    }
  };

  checkAndAdjustPosition();
  window.addEventListener('resize', checkAndAdjustPosition);

  acceptBtn.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    
    banner.classList.remove('translate-y-0', 'opacity-100');
    banner.classList.add('translate-y-8', 'opacity-0');

    banner.addEventListener('transitionend', () => {
      banner.remove();
      window.removeEventListener('resize', checkAndAdjustPosition);
    }, { once: true });
  });
});