// Homepage tiles open the shared catalog at the selected category.
// Native category links remain available without the catalog controller.
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-category-tiles] .category-item-btn');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof window.openCatalogCategory !== 'function') return;
    if (window.openCatalogCategory(link.dataset.cat, link)) event.preventDefault();
  });
});
