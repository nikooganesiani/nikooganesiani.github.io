document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'cookie_consent_accepted';
  const banner = document.getElementById('cookie-banner');
  const card = document.getElementById('cookie-banner-card');
  const acceptBtn = document.getElementById('cookie-accept-btn');

  if (!banner || !card || !acceptBtn) return;

  const hasConsent = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  };

  const saveConsent = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Игнорируем ошибку в режиме строгой приватности
    }
  };

  // Если уже принято — сразу удаляем из DOM
  if (hasConsent()) {
    banner.remove();
    return;
  }

  // Переносим баннер в корень <body> для гарантированного приоритета z-index
  if (banner.parentElement !== document.body) {
    document.body.appendChild(banner);
  }

  // Показываем баннер (выезд сверху вниз)
  const showTimeout = setTimeout(() => {
    banner.classList.remove('hidden');
    banner.classList.add('flex');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.classList.remove('-translate-y-5', 'scale-95', 'opacity-0');
        card.classList.add('translate-y-0', 'scale-100', 'opacity-100');
      });
    });
  }, 400);

  // Закрытие (уход обратно наверх) и полное удаление из DOM
  acceptBtn.addEventListener('click', () => {
    clearTimeout(showTimeout);
    saveConsent();

    // Мгновенно отключаем коллизию
    card.classList.replace('pointer-events-auto', 'pointer-events-none');
    acceptBtn.disabled = true;

    card.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
    card.classList.add('-translate-y-5', 'scale-95', 'opacity-0');

    const removeBanner = () => {
      if (banner.isConnected) {
        banner.remove();
      }
    };

    card.addEventListener('transitionend', removeBanner, { once: true });
    setTimeout(removeBanner, 350);
  }, { once: true });
});