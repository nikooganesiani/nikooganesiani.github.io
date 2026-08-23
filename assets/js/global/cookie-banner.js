document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'cookie_consent_accepted';
  const banner = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('cookie-accept-btn');

  if (!banner || !acceptBtn) {
    return;
  }

  const isAccepted = localStorage.getItem(STORAGE_KEY);

  if (!isAccepted) {
    setTimeout(() => {
      banner.classList.remove('scale-95', 'opacity-0');
      banner.classList.add('scale-100', 'opacity-100');
    }, 400);
  }

  acceptBtn.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    
    banner.classList.remove('scale-100', 'opacity-100');
    banner.classList.add('scale-95', 'opacity-0');

    banner.addEventListener('transitionend', () => {
      banner.remove();
    }, { once: true });
  });
});