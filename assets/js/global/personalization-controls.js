document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const api = window.enkaPersonalization;
  if (!api) return;
  const t = value => window.enkaI18n?.t(value) || value;
  document.querySelectorAll('[data-personalization-controls]').forEach(panel => {
    const options = panel.querySelector('[data-interest-options]');
    const age = panel.querySelector('[data-personalization-age]');
    const enable = panel.querySelector('[data-personalization-enable]');
    const disable = panel.querySelector('[data-personalization-disable]');
    const status = panel.querySelector('[data-personalization-status]');
    for (const [id, category] of Object.entries(window.CATALOG_STRUCTURE || {})) {
      const group = document.createElement('div');
      group.className = 'rounded-xl bg-slate-50 p-3';
      function option(key, label, parent = group) {
        const row = document.createElement('label');
        row.className = 'flex min-h-11 items-center gap-3 text-slate-800';
        const input = document.createElement('input');
        input.type = 'checkbox'; input.value = key; input.className = 'size-5 shrink-0 accent-brand';
        row.append(input, document.createTextNode(t(label))); parent.append(row);
      }
      option('category:' + id, category.title);
      if (category.subs?.length) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.className = 'min-h-11 cursor-pointer py-3 text-xs font-semibold text-brand';
        summary.textContent = t('ქვეკატეგორიების არჩევა'); details.append(summary);
        category.subs.forEach(sub => option('sub:' + sub.id, sub.name, details));
        group.append(details);
      }
      options.append(group);
    }
    function sync() {
      const interests = new Set(api.snapshot().interests);
      options.querySelectorAll('input').forEach(input => { input.checked = interests.has(input.value); });
      const allowed = api.allowed();
      enable.disabled = allowed || !age.checked;
      enable.setAttribute('aria-pressed', String(allowed));
      disable.setAttribute('aria-pressed', String(api.getChoice() === false));
      status.textContent = t(allowed ? 'პერსონალიზაცია ჩართულია. პროფილი მხოლოდ ამ ბრაუზერში რჩება.' : 'ქცევის შენახვა გამორთულია. ინტერესების არჩევა მხოლოდ ამ გვერდზე შეგიძლიათ.');
      if (allowed && !api.isPersistent()) status.textContent = t('ბრაუზერის მეხსიერება მიუწვდომელია. პერსონალიზაცია მხოლოდ ამ გვერდზე მოქმედებს.');
    }
    options.addEventListener('change', () => api.setInterests([...options.querySelectorAll('input:checked')].map(input => input.value)));
    age.addEventListener('change', sync);
    enable.addEventListener('click', () => { if (age.checked) api.setChoice(true, true); });
    disable.addEventListener('click', () => { age.checked = false; api.setChoice(false); });
    panel.querySelector('[data-personalization-reset]').addEventListener('click', () => {
      api.reset();
      status.textContent = t('პროფილი გასუფთავებულია. თანხმობის არჩევანი უცვლელია.');
    });
    window.addEventListener('enka:personalization-choice', sync);
    window.addEventListener('enka:personalization-change', sync);
    sync();
  });
});
