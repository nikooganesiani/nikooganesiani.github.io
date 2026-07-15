// capi.js
// ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL WORKER
const CAPI_WORKER_URL = 'https://my-meta-capi.niko-oganesiani.workers.dev';

function sendCapiEvent(eventName, customData = {}, eventId = null) {
  const finalEventId = eventId || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  try {
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
      custom_data: customData,
    };

    fetch(CAPI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch((error) => {
      console.warn('CAPI error:', error);
    });

    return finalEventId;
  } catch (e) {
    return finalEventId;
  }
}

// Делаем функцию глобальной (для использования на любой странице)
window.sendCapiEvent = sendCapiEvent;
