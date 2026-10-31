// assets/js/categories.js
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('categoryModal');
  const modalBox = document.getElementById('categoryModalBox');
  const modalTitle = document.getElementById('categoryModalTitle');
  const modalList = document.getElementById('categoryModalList');
  const closeBtn = document.getElementById('categoryModalClose');

  if (!modal || !modalBox || !modalTitle || !modalList) return;

  let isModalOpen = false;

  const lockBodyScroll = () => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.classList.add('overflow-hidden');
  };

  const unlockBodyScroll = () => {
    document.body.classList.remove('overflow-hidden');
    document.body.style.paddingRight = '';
  };

  const createSubcategoryLink = (catId, sub) => {
    const link = document.createElement('a');
    link.href = `/category/?${encodeURIComponent(catId)}&sub=${encodeURIComponent(sub.id)}`;
    link.className =
      'flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-[#155dfc] hover:bg-blue-50/40 text-slate-700 hover:text-[#155dfc] active:scale-[0.99] transition-all text-sm font-medium group';
    link.dataset.cat = catId;
    link.dataset.subcat = sub.id;
    link.dataset.name = sub.name;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'pr-2 leading-snug';
    titleSpan.textContent = sub.name; // Безопасная вставка текста (защита от XSS)

    const iconWrapper = document.createElement('span');
    iconWrapper.className =
      'w-7 h-7 rounded-lg bg-slate-50 group-hover:bg-[#155dfc] text-slate-400 group-hover:text-white flex items-center justify-center shrink-0 transition-colors';
    iconWrapper.innerHTML = `
      <svg class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
      </svg>
    `;

    link.append(titleSpan, iconWrapper);
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

    modal.setAttribute('aria-hidden', 'false');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');

    modalBox.classList.remove('translate-y-8', 'sm:scale-95', 'opacity-0');
    modalBox.classList.add('translate-y-0', 'sm:scale-100', 'opacity-100');

    lockBodyScroll();
    isModalOpen = true;
  };

  const closeModal = () => {
    if (!isModalOpen) return;

    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');

    modalBox.classList.remove('translate-y-0', 'sm:scale-100', 'opacity-100');
    modalBox.classList.add('translate-y-8', 'sm:scale-95', 'opacity-0');

    unlockBodyScroll();
    isModalOpen = false;
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-item-btn');
    if (btn) {
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

    if (isModalOpen && (e.target === modal || (closeBtn && closeBtn.contains(e.target)))) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalOpen) {
      closeModal();
    }
  });
});
