window.copyProductLink = async function(button) {
  const url = new URL(window.location.pathname, window.location.origin).href;
  const copied = () => window.showToast?.('ბმული დაკოპირდა', { type: 'link', url });
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      copied();
      return;
    }
  } catch { /* Try the legacy clipboard before offering manual copying. */ }
  const previous = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = url;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(textarea);
  let success = false;
  try {
    textarea.select();
    success = document.execCommand('copy');
  } catch { /* Manual copying stays available when clipboard access is blocked. */ }
  finally {
    textarea.remove();
    previous?.focus({ preventScroll: true });
  }
  if (success) copied();
  else {
    const text = document.getElementById('copiedLinkText');
    if (text) text.value = url;
    window.openAppModal?.('linkModal', button);
  }
};
