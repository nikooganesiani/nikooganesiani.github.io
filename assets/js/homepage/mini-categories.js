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
    // Плоская кнопка с чёткой рамкой 2px и заливкой синим при наведении
    link.className =
      'flex items-center justify-between p-3 rounded-xl bg-white border-2 border-[#dbe4f0] hover:border-[#155dfc] hover:bg-[#155dfc] text-slate-900 hover:text-white transition-colors duration-150 text-sm font-bold group';
    link.dataset.cat = catId;
    link.dataset.subcat = sub.id;
    link.dataset.name = sub.name;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'pr-2 leading-snug';
    titleSpan.textContent = sub.name;

    const iconWrapper = document.createElement('span');
    iconWrapper.className =
      'w-7 h-7 rounded-lg bg-[#eef4ff] text-[#155dfc] group-hover:bg-[#ffc72c] group-hover:text-slate-950 flex items-center justify-center shrink-0 transition-colors duration-150';
    iconWrapper.innerHTML = `
      <svg class="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path>
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

    modalBox.classList.remove('translate-y-6', 'opacity-0');
    modalBox.classList.add('translate-y-0', 'opacity-100');

    lockBodyScroll();
    isModalOpen = true;
  };

  const closeModal = () => {
    if (!isModalOpen) return;

    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');

    modalBox.classList.remove('translate-y-0', 'opacity-100');
    modalBox.classList.add('translate-y-6', 'opacity-0');

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
