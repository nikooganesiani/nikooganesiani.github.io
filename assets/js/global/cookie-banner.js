document.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('cookie-banner');
  if (!banner || !window.enkaPrivacy) return;
  const settingsButtons = [
    document.getElementById('cookie-settings-btn'),
    document.getElementById('cookie-settings-inline-btn')
  ].filter(Boolean);
  const settings = document.getElementById('cookie-settings');
  function toggleSettings() {
    if (!settings) return;
    settings.hidden = !settings.hidden;
    for (const button of settingsButtons) button.setAttribute('aria-expanded', String(!settings.hidden));
  }
  for (const button of settingsButtons) button.addEventListener('click', toggleSettings);
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
