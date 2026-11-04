(function () {
  const pDataset = document.getElementById('productData')?.dataset || {};
  const sku = (pDataset.id || pDataset.sku || '').trim();
  const name = pDataset.name || '';
  const rawPrice = pDataset.price || '';
  const numericPrice = Number(rawPrice) || 0;

  function waitForCapi(callback) {
    if (typeof window.sendCapiEvent === 'function') {
      callback();
      return;
    }
    let attempts = 0;
    const interval = setInterval(function () {
      attempts++;
      if (typeof window.sendCapiEvent === 'function') {
        clearInterval(interval);
        callback();
      } else if (attempts > 50) {
        clearInterval(interval);
      }
    }, 100);
  }

  let viewTracked = false;
  function trackView() {
    if (viewTracked || !window.enkaPrivacy?.allowsAnalytics() || typeof window.sendCapiEvent !== 'function') return;
    viewTracked = true;
    window.sendCapiEvent('PageView');

    if (sku) {
      window.sendCapiEvent('ViewContent', {
        content_ids: [sku],
        content_name: name,
        content_type: 'product',
        value: numericPrice,
        currency: 'GEL',
      });
    }
  }
  waitForCapi(trackView);
  // A first-time visitor may choose consent after the product has rendered.
  window.addEventListener('enka:privacy-change', trackView);
})();
