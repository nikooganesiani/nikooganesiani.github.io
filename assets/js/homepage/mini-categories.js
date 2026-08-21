// assets/js/categories.js
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('categoryModal');
  const modalBox = document.getElementById('categoryModalBox');
  const modalTitle = document.getElementById('categoryModalTitle');
  const modalList = document.getElementById('categoryModalList');
  const closeBtn = document.getElementById('categoryModalClose');

  if (!modal || !modalBox || !modalTitle || !modalList) return;

  const openModal = (catId, catName, subs) => {
    modalTitle.textContent = catName || '';
    modalList.innerHTML = '';

    if (Array.isArray(subs) && subs.length > 0) {
      subs.forEach((sub) => {
        const link = document.createElement('a');
        link.href = `/category/?${encodeURIComponent(catId)}&sub=${encodeURIComponent(sub.id)}`;
        link.className = 'flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-[#155dfc] hover:bg-blue-50/50 text-gray-700 hover:text-[#155dfc] transition-all text-sm font-medium group';
        link.dataset.cat = catId;
        link.dataset.subcat = sub.id;
        link.dataset.name = sub.name;

        link.innerHTML = `
          <span>${sub.name}</span>
          <svg class="w-4 h-4 text-gray-400 group-hover:text-[#155dfc] group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        `;

        modalList.appendChild(link);
      });
    }

    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
    modalBox.classList.remove('scale-95', 'opacity-0');
    modalBox.classList.add('scale-100', 'opacity-100');
    document.body.classList.add('overflow-hidden');
  };

  const closeModal = () => {
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');
    modalBox.classList.remove('scale-100', 'opacity-100');
    modalBox.classList.add('scale-95', 'opacity-0');
    document.body.classList.remove('overflow-hidden');
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-item-btn');
    if (btn) {
      const catId = btn.dataset.cat || '';
      const catName = btn.dataset.name || '';
      let subs = [];

      try {
        subs = JSON.parse(btn.dataset.subs || '[]');
      } catch (err) {
        subs = [];
      }

      openModal(catId, catName, subs);
      return;
    }

    if (e.target === modal || (closeBtn && closeBtn.contains(e.target))) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('pointer-events-none')) {
      closeModal();
    }
  });
});
