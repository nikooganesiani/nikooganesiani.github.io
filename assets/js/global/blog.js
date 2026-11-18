(() => {
  const locale = window.enkaI18n?.locale;
  if (locale !== 'ru' && locale !== 'en') return;
  for (const card of document.querySelectorAll('[data-blog-card]')) {
    const link = card.querySelector('a');
    const url = link.getAttribute('data-blog-url-' + locale);
    if (!url) continue;
    card.lang = locale;
    link.href = url;
    card.querySelector('[data-blog-title]').textContent = link.getAttribute('data-blog-title-' + locale);
    card.querySelector('[data-blog-summary]').textContent = link.getAttribute('data-blog-summary-' + locale);
  }
  for (const link of document.querySelectorAll('[data-blog-archive-link]')) {
    link.pathname = link.pathname.replace(/\/blog\/$/, '/' + locale + '/blog/');
  }
})();
