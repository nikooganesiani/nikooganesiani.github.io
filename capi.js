const CAPI_WORKER_URL = 'https://capi.enkaelectronics.com.ge/';

function sendCapiEvent(eventName, customData = {}, eventId = null) {
  // Валидация event_name: Meta требует непустую валидную строку
  if (!eventName || typeof eventName !== 'string' || !eventName.trim()) {
    console.warn('CAPI: event_name must be a non-empty string');
    return null;
  }

  const validEventName = eventName.trim();
  const finalEventId = eventId || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  try {
    const getCookie = (name) => {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : '';
    };

    const fbp = getCookie('_fbp') || undefined;
    const fbc = getCookie('_fbc') || undefined;

    const payload = {
      event_name: validEventName,
      event_id: finalEventId,
      event_source_url: window.location.href,
      fbp: fbp,
      fbc: fbc,
      custom_data: customData && typeof customData === 'object' ? customData : {},
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
    console.error('CAPI execution error:', e);
    return finalEventId;
  }
}

window.sendCapiEvent = sendCapiEvent;
