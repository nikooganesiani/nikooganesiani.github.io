// assets/js/categories.js
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('categoryModal');
  const modalBox = document.getElementById('categoryModalBox');
  const modalTitle = document.getElementById('categoryModalTitle');
  const modalList = document.getElementById('categoryModalList');
  const closeBtn = document.getElementById('categoryModalClose');

  if (!modal || !modalBox || !modalTitle || !modalList) return;

  const createSubcategoryLink = (catId, sub) => {
    const link = document.createElement('a');
    link.href = `/category/?${encodeURIComponent(catId)}&sub=${encodeURIComponent(sub.id)}`;
    link.className =
      'flex items-center justify-between px-4 py-3.5 rounded-xl bg-slate-50/80 hover:bg-[#155dfc]/[0.08] active:bg-[#155dfc]/[0.12] text-slate-800 hover:text-[#155dfc] transition-colors duration-150 text-[14px] font-medium group';
    link.dataset.cat = catId;
    link.dataset.subcat = sub.id;
    link.dataset.name = sub.name;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'pr-3 leading-snug';
    titleSpan.textContent = sub.name;

    const arrow = document.createElement('span');
    arrow.className = 'text-slate-400 group-hover:text-[#155dfc] transition-colors shrink-0';
    arrow.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
      </svg>
    `;

    link.append(titleSpan, arrow);
    return link;
  };

  const openModal = (catId, catName, subs) => {
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
    window.openAppModal(modal);
  };

  const closeModal = () => {
    window.closeAppModal(modal);
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-item-btn');
    if (btn) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const catId = btn.dataset.cat || '';
      const catName = btn.dataset.name || '';
      let subs = [];

      try {
        subs = JSON.parse(btn.dataset.subs || '[]');
      } catch {
        subs = [];
      }

      openModal(catId, catName, subs);
      return;
    }

    if (modal.classList.contains('active') && (e.target === modal || (closeBtn && closeBtn.contains(e.target)))) {
      closeModal();
    }
  });

});
