document.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('cookie-banner');
  if (!banner || !window.enkaPrivacy) return;
  function render() {
    const hidden = window.enkaPrivacy.getChoice() !== null && (!window.enkaPersonalization || window.enkaPersonalization.getChoice() !== null);
    if (hidden && banner.contains(document.activeElement)) document.getElementById('main-content')?.focus({ preventScroll: true });
    banner.hidden = hidden;
  }
  function choose(analytics, personalization) {
    window.enkaPersonalization?.setChoice(personalization, personalization);
    window.enkaPrivacy.setChoice(analytics);
    render();
  }
  document.getElementById('cookie-accept-btn')?.addEventListener('click', () => choose(true, true));
  document.getElementById('cookie-personalize-btn')?.addEventListener('click', () => choose(false, true));
  document.getElementById('cookie-decline-btn')?.addEventListener('click', () => choose(false, false));
  window.addEventListener('enka:privacy-change', render);
  window.addEventListener('enka:personalization-choice', render);
  render();
});
