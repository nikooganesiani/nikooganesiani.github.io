// capi.js
const CAPI_WORKER_URL = 'https://capi.enkaelectronics.com.ge/';

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return decodeURIComponent(parts.pop().split(';').shift());
  }
  return '';
}

function sendCapiEvent(eventName, customData = {}, eventId = null) {
  const finalEventId = eventId || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Фиксируем данные на момент вызова
  const currentUrl = window.location.href;
  const fbp = getCookie('_fbp');
  const fbc = getCookie('_fbc');
  
  // Безопасная сериализация customData
  let safeCustomData = {};
  try {
    safeCustomData = JSON.parse(JSON.stringify(customData || {}));
  } catch (e) {
    console.warn('CAPI: customData не сериализуется, отправляем пустой объект', e);
    // оставляем safeCustomData = {}
  }

  const dispatch = () => {
    try {
      const payload = {
        event_name: eventName,
        event_id: finalEventId,
        event_source_url: currentUrl,
        fbp: fbp,
        fbc: fbc,
        custom_data: safeCustomData,
      };

      const json = JSON.stringify(payload);

      // Отправка через sendBeacon (предпочтительно)
      if (navigator.sendBeacon) {
        const blob = new Blob([json], { type: 'application/json' });
        const sent = navigator.sendBeacon(CAPI_WORKER_URL, blob);
        if (!sent) {
          // Если sendBeacon не сработал (например, из-за размера) – пробуем fetch
          fetch(CAPI_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: json,
            keepalive: true,
          }).catch(err => console.warn('CAPI fetch error:', err));
        }
      } else {
        // Fallback для старых браузеров
        fetch(CAPI_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json,
          keepalive: true,
        }).catch(err => console.warn('CAPI fetch error:', err));
      }

    } catch (e) {
      // Игнорируем фоновые ошибки
    }
  };

  // Оптимизация выполнения – отложенный запуск
  if ('requestIdleCallback' in window) {
    requestIdleCallback(dispatch, { timeout: 2000 });
  } else {
    setTimeout(dispatch, 200);
  }

  return finalEventId;
}

window.sendCapiEvent = sendCapiEvent;
