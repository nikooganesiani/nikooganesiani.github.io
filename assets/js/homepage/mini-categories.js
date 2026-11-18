// Homepage tiles open the shared catalog at the selected category.
// Native category links remain available without the catalog controller.
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-category-tiles] :is(.category-item-btn, [data-all-categories])');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.dataset.cat) {
      if (window.openCatalogCategory?.(link.dataset.cat, link)) event.preventDefault();
    } else if (typeof window.openAppModal === 'function') {
      window.openAppModal('navModal', link);
      event.preventDefault();
    }
  });
});
