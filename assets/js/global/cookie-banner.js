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

  // Если уже принято — полностью удаляем из DOM, чтобы не было коллизий
  if (hasConsent()) {
    banner.remove();
    return;
  }

  // Переносим в корень <body> для гарантированного приоритета z-index
  if (banner.parentElement !== document.body) {
    document.body.appendChild(banner);
  }

  // Показываем баннер (на мобильных сверху вниз, на ПК снизу вверх)
  const showTimeout = setTimeout(() => {
    banner.classList.add('is-mounted');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.classList.add('is-visible');
      });
    });
  }, 400);

  // Закрытие и удаление из DOM
  acceptBtn.addEventListener('click', () => {
    clearTimeout(showTimeout);
    saveConsent();

    // Мгновенно отключаем перехват кликов (хлебные крошки сразу доступны)
    card.style.pointerEvents = 'none';
    acceptBtn.disabled = true;

    card.classList.remove('is-visible');

    const removeBanner = () => {
      if (banner.isConnected) {
        banner.remove();
      }
    };

    card.addEventListener('transitionend', removeBanner, { once: true });
    setTimeout(removeBanner, 350);
  }, { once: true });
});