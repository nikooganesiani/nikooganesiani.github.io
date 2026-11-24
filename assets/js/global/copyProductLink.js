(() => {
  const field = document.getElementById('copiedLinkText');
  if (!field) return;

  const whatsApp = document.getElementById('shareWhatsApp');
  const telegram = document.getElementById('shareTelegram');
  const email = document.getElementById('shareEmail');
  const nativeShare = document.getElementById('shareNative');
  const copy = document.getElementById('shareCopy');
  const status = document.getElementById('shareStatus');
  let shareData;

  window.showLinkModal = (url, trigger) => {
    const title = document.querySelector('h1[data-product-name]')?.textContent.trim() || document.title;
    shareData = { title, url };
    field.value = url;
    status.textContent = '';
    whatsApp.href = 'https://wa.me/?text=' + encodeURIComponent(title + '\n' + url);
    telegram.href = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(title);
    email.href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(url);
    nativeShare.hidden = typeof navigator.share !== 'function' ||
      (typeof navigator.canShare === 'function' && !navigator.canShare(shareData));
    window.openAppModal?.('linkModal', trigger);
  };

  window.shareProduct = button => {
    const url = new URL(window.location.pathname, window.location.origin).href;
    window.showLinkModal(url, button);
  };

  nativeShare.addEventListener('click', async () => {
    status.textContent = '';
    try {
      await navigator.share(shareData);
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'გაზიარება ვერ მოხერხდა.';
    }
  });

  copy.addEventListener('click', async () => {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(field.value);
        copied = true;
      }
    } catch { /* Offer manual copying if clipboard access is blocked. */ }
    if (!copied) {
      field.focus({ preventScroll: true });
      field.select();
      try { copied = document.execCommand('copy'); } catch {}
      if (copied) copy.focus({ preventScroll: true });
    }
    status.textContent = copied ? 'ბმული დაკოპირდა' : 'მონიშნეთ და დააკოპირეთ ბმული.';
  });
})();
