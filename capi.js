// capi.js
// ЗАМЕНИТЕ URL НА ВАШ РЕАЛЬНЫЙ URL WORKER
const CAPI_WORKER_URL = 'https://my-meta-capi.niko-oganesiani.workers.dev';

export function sendCapiEvent(eventName, customData = {}, eventId = null) {
  const finalEventId = eventId || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  try {
    // Читаем cookies Meta для улучшения матчинга
    const getCookie = (name) => {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : '';
    };
    
    const fbp = getCookie('_fbp');
    const fbc = getCookie('_fbc');

    const payload = {
      event_name: eventName,
      event_id: finalEventId,
      event_source_url: window.location.href,
      fbp: fbp,
      fbc: fbc,
      custom_data: custom_data,
    };

    // Отправляем запрос в Cloudflare Worker
    fetch(CAPI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true, // Важно: запрос не оборвется при переходе пользователя
    }).catch((error) => {
      // Тихая обработка ошибок, чтобы не ломать сайт
      console.warn('CAPI error:', error);
    });

    return finalEventId;
  } catch (e) {
    return finalEventId;
  }
}

// Если вы используете обычные скрипты (не модули), сделайте функцию глобальной
if (typeof window !== 'undefined') {
  window.sendCapiEvent = sendCapiEvent;
}
