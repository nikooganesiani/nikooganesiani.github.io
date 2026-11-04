(() => {
  'use strict';
  for (const link of document.querySelectorAll('[data-info-tracking]')) {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof window.openTracking !== 'function') return;
      event.preventDefault();
      link.focus({ preventScroll: true });
      window.openTracking();
    });
  }
  const preferences = document.querySelector('[data-info-privacy]');
  if (!preferences || !window.enkaPrivacy) return;
  preferences.hidden = false;
  const status = preferences.querySelector('[data-privacy-status]');
  function render(message = '') {
    const choice = window.enkaPrivacy.getChoice();
    status.textContent = message || (choice === true ? 'სარეკლამო ანალიტიკა ჩართულია.' : choice === false ? 'სარეკლამო ანალიტიკა გამორთულია.' : 'არჩევანი ჯერ არ გაგიკეთებიათ. ანალიტიკა გამორთულია.');
    for (const button of preferences.querySelectorAll('[data-privacy-choice]')) button.setAttribute('aria-pressed', String(choice === (button.dataset.privacyChoice === 'accept')));
  }
  for (const button of preferences.querySelectorAll('[data-privacy-choice]')) button.addEventListener('click', () => {
    const saved = window.enkaPrivacy.setChoice(button.dataset.privacyChoice === 'accept');
    render(saved ? '' : 'არჩევანი მოქმედებს ამ გვერდზე. ბრაუზერმა მისი შენახვა ვერ შეძლო.');
  });
  window.addEventListener('enka:privacy-change', () => render());
  render();
})();
