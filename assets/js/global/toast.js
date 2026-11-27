(() => {
  const toast = document.getElementById('globalToast');
  const status = document.getElementById('globalToastStatus');
  if (!toast || !status) return;
  let timer;

  function hide() {
    clearTimeout(timer);
    toast.classList.remove('show');
    toast.inert = true;
  }

  function scheduleHide() {
    clearTimeout(timer);
    if (document.activeElement !== toast) timer = setTimeout(hide, 4000);
  }

  toast.addEventListener('focus', () => clearTimeout(timer));
  toast.addEventListener('blur', scheduleHide);
  document.getElementById('compareModal')?.addEventListener('modal:open', hide);

  window.showToast = function(message, action, trigger = document.activeElement) {
    const translate = value => window.enkaI18n?.t(value) || value;
    const text = translate(message);
    const favorite = action === 'fav';
    const link = action?.type === 'link';
    const comparison = action?.type === 'compare';
    const actionable = favorite || link || comparison;
    status.textContent = text;
    toast.textContent = text;
    toast.inert = !actionable;
    toast.setAttribute('aria-label', favorite ? translate('რჩეულები') : link ? translate('პროდუქტის ბმული') : text);
    toast.classList.toggle('cursor-pointer', actionable);
    toast.classList.add('show');
    toast.onclick = actionable ? () => {
      if (favorite) window.openFavorites?.(undefined, trigger);
      if (link) window.showLinkModal?.(action.url, trigger);
      if (comparison) action.open(trigger);
      hide();
    } : null;
    scheduleHide();
  };
})();
