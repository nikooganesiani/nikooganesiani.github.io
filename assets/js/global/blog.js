(() => {
  const track = document.getElementById('blog-home-track');
  const section = track?.closest('.blog-section');
  const previous = section?.querySelector('[data-blog-direction="-1"]');
  const next = section?.querySelector('[data-blog-direction="1"]');
  if (previous && next) {
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      previous.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
    };
    const move = direction => {
      const [first, second] = track.children;
      const step = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      track.scrollBy({ left: direction * step, behavior });
    };
    previous.hidden = next.hidden = false;
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }
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
