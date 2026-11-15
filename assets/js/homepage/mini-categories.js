// Homepage category tiles: native links remain usable if modal support is unavailable.
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('categoryModal');
  const modalBox = document.getElementById('categoryModalBox');
  const modalTitle = document.getElementById('categoryModalTitle');
  const modalList = document.getElementById('categoryModalList');

  if (!modal || !modalBox || !modalTitle || !modalList) return;

  const createSubcategoryLink = (catId, sub) => {
    const link = document.createElement('a');
    link.href = `/category/?${encodeURIComponent(catId)}&sub=${encodeURIComponent(sub.id)}`;
    link.className = 'flex items-center justify-between gap-3 p-3 rounded-[9px] leading-[1.6] no-underline [overflow-wrap:anywhere] min-h-13 text-[color:light-dark(#344050,var(--color-night-copy))] text-[length:14px] [&:first-child]:mb-1.5 [&:first-child]:bg-[color:light-dark(#f0f5ff,var(--color-night-blue))] [&:first-child]:text-accent [&:first-child]:font-semibold [&_svg]:shrink-0 [&_svg]:text-[color:light-dark(#85909e,var(--color-night-muted))] [@media(hover:_hover)]:hover:bg-[color:light-dark(#f0f5ff,var(--color-night-blue))] [@media(hover:_hover)]:hover:text-accent';
    link.dataset.cat = catId;
    link.dataset.subcat = sub.id;
    link.dataset.name = sub.name;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'pr-3 leading-snug';
    titleSpan.textContent = sub.name;

    const arrow = document.createElement('span');
    arrow.className = 'text-[color:light-dark(var(--color-slate-400),var(--color-night-muted))] group-hover:text-[color:light-dark(#155dfc,var(--color-accent))] transition-colors shrink-0';
    arrow.innerHTML = `
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.3 4.3a1 1 0 0 1 1.4 0l7 7a1 1 0 0 1 0 1.4l-7 7a1 1 0 1 1-1.4-1.4l6.3-6.3-6.3-6.3a1 1 0 0 1 0-1.4"/></svg>
    `;

    link.append(titleSpan, arrow);
    return link;
  };

  const openModal = (catId, catName, subs, trigger) => {
    if (!Array.isArray(subs) || subs.length === 0) {
      window.location.href = `/category/?${encodeURIComponent(catId)}`;
      return;
    }

    modalTitle.textContent = catName || '';
    modalList.innerHTML = '';

    const fragment = document.createDocumentFragment();
    subs.forEach((sub) => {
      fragment.appendChild(createSubcategoryLink(catId, sub));
    });
    modalList.appendChild(fragment);

    const all = createSubcategoryLink(catId, { id: '', name: 'ყველა პროდუქტი' });
    all.href = `/category/?${encodeURIComponent(catId)}`;
    modalList.prepend(all);
    window.openAppModal(modal, trigger);
  };


  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-item-btn');
    if (btn) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || typeof window.openAppModal !== 'function') return;
      e.preventDefault();
      const catId = btn.dataset.cat || '';
      const catName = btn.dataset.name || '';
      let subs = [];

      try {
        subs = JSON.parse(btn.dataset.subs || '[]');
      } catch {
        subs = [];
      }

      openModal(catId, catName, subs, btn);
      return;
    }

  });

});
