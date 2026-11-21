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

  window.showToast = function(message, action, trigger = document.activeElement) {
    const translate = value => window.enkaI18n?.t(value) || value;
    const text = translate(message);
    const favorite = action === 'fav';
    const link = action?.type === 'link';
    const actionable = favorite || link;
    status.textContent = text;
    toast.textContent = text;
    toast.inert = !actionable;
    toast.setAttribute('aria-label', actionable ? translate(favorite ? 'რჩეულები' : 'პროდუქტის ბმული') : text);
    toast.classList.toggle('cursor-pointer', actionable);
    toast.classList.add('show');
    toast.onclick = actionable ? () => {
      if (favorite) window.openFavorites?.(undefined, trigger);
      else window.showLinkModal?.(action.url, trigger);
      hide();
    } : null;
    scheduleHide();
  };
})();
