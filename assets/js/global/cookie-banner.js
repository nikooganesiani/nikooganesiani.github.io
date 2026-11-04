document.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('cookie-banner');
  if (!banner || !window.enkaPrivacy) return;
  function render() {
    const hidden = window.enkaPrivacy.getChoice() !== null;
    if (hidden && banner.contains(document.activeElement)) document.getElementById('main-content')?.focus({ preventScroll: true });
    banner.hidden = hidden;
  }
  document.getElementById('cookie-accept-btn')?.addEventListener('click', () => window.enkaPrivacy.setChoice(true));
  document.getElementById('cookie-decline-btn')?.addEventListener('click', () => window.enkaPrivacy.setChoice(false));
  window.addEventListener('enka:privacy-change', render);
  render();
});
