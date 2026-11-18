const NORMALIZE_CHAR_MAP = {
    'a':'ა','b':'ბ','c':'ც','d':'დ','e':'ე','f':'ფ','g':'გ','h':'ჰ','i':'ი','j':'ჯ','k':'კ','l':'ლ','m':'მ','n':'ნ','o':'ო','p':'პ','q':'ქ','r':'რ','s':'ს','t':'ტ','u':'უ','v':'ვ','w':'წ','x':'ხ','y':'ყ','z':'ზ',
    'A':'ა','B':'ჩ','C':'ჩ','D':'დ','E':'ე','F':'ფ','G':'ღ','H':'ჰ','I':'ი','J':'ჟ','K':'კ','L':'ლ','M':'მ','N':'ნ','O':'ო','P':'პ','Q':'ქ','R':'ღ','S':'შ','T':'თ','U':'უ','V':'ვ','W':'ჭ','X':'ხ','Y':'ყ','Z':'ძ',
    'а':'ა','б':'ბ','в':'ვ','г':'გ','д':'დ','е':'ე','ё':'ე','ж':'ჟ','з':'ზ','и':'ი','й':'ი','к':'კ','л':'ლ','м':'მ','н':'ნ','о':'ო','п':'პ','р':'რ','с':'ს','т':'ტ','у':'უ','ф':'ფ','х':'ხ','ц':'ც','ч':'ჩ','ш':'შ','щ':'შ','ъ':'','ы':'ი','ь':'','э':'ე','ю':'იუ','я':'ია'
};

window.normalizeQuery = function(q) {
    if (!q) return '';
    let res = '';
    for (const char of q) {
        res += NORMALIZE_CHAR_MAP[char] ?? char;
    }
    return res.toLowerCase();
};

window.closeNavModal = function() {
    window.closeAppModal?.('navModal');
};

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('navModal');
  const categories = document.getElementById('navCatalogCategories');
  const content = document.getElementById('navCatalogContent');
  const pattern = document.getElementById('navCatalogPattern');
  const engine = globalThis.EnkaStoreEngine;
  const visuals = globalThis.EnkaStoreVisuals;
  if (!modal || !categories || !content || !pattern || !engine || !visuals || !window.CATALOG_STRUCTURE) return;
  const locale = window.enkaI18n?.locale || 'ka';
  let selected;
  let initialized = false;
  let products;
  let savedImages = {};
  try { savedImages = JSON.parse(document.getElementById('catalogNavigationImages')?.textContent || '{}') || {}; } catch {}
  const settings = id => window.ENKA_STORE?.categories?.find(c => c.id === id);

  function selectCategory(id, focus = false) {
    const category = window.CATALOG_STRUCTURE[id];
    if (!category) return;
    const animate = selected !== id && modal.classList.contains('active') && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    selected = id;
    for (const link of categories.querySelectorAll('a')) {
      if (link.dataset.cat === id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    const source = settings(id);
    const appearance = engine.categoryAppearance(source || { id });
    pattern.style.backgroundImage = engine.safeImage(appearance.backgroundImage) ? 'url("' + appearance.backgroundImage + '")' : 'none';
    pattern.getAnimations?.().forEach(animation => animation.cancel());
    if (animate && pattern.animate) pattern.animate([{ opacity: 0 }, { opacity: getComputedStyle(pattern).opacity }], { duration: 280, easing: 'ease-out' });
    const section = document.createElement('section');
    section.className = 'catalog-subcategory-panel' + (animate ? ' catalog-subcategory-panel--enter' : '');
    section.setAttribute('aria-label', category.title || '');
    section.tabIndex = -1;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 gap-2 min-[641px]:grid-cols-3 min-[641px]:gap-3';
    grid.innerHTML = (category.subs || []).map(sub => {
      const config = source?.subs.find(item => item.id === sub.id) || sub;
      const selection = products ? engine.subcategoryImage(products, id, config) : savedImages[id]?.[sub.id];
      return visuals.subcategory(id, sub, selection);
    }).join('');
    visuals.apply(grid);
    grid.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
      if (img.getAttribute('src') !== '/img/categories/no-photo.svg') img.src = '/img/categories/no-photo.svg';
      img.dataset.photoKey = visuals.photoKey('/img/categories/no-photo.svg');
    }));
    section.append(grid);
    content.replaceChildren(section);
    content.scrollTop = 0;
    if (focus) section.focus({ preventScroll: true });
  }

  function renderNavigation() {
    const focusedCategory = categories.contains(document.activeElement) ? document.activeElement.dataset.cat : null;
    const sources = Object.entries(window.CATALOG_STRUCTURE).filter(([, c]) => c);
    categories.innerHTML = sources.map(([id, category], index) => {
      const source = settings(id) || { id, title: { [locale]: category.title }, subs: [] };
      return visuals.category({ ...source, appearance: { ...source.appearance, showTitle: true } }, locale, category.icon || '') + (index < sources.length - 1 ? '<span class="catalog-category-separator" aria-hidden="true"></span>' : '');
    }).join('');
    visuals.apply(categories);
    categories.querySelectorAll('a').forEach(link => {
      link.classList.remove('category-item-btn');
      link.removeAttribute('aria-haspopup');
      link.removeAttribute('aria-controls');
      link.removeAttribute('aria-expanded');
    });
    if (!window.CATALOG_STRUCTURE[selected]) {
      selected = sources.find(([id, category]) => (category.subs || []).some(sub => savedImages[id]?.[sub.id]?.image))?.[0] || sources[0]?.[0];
    }
    if (selected) selectCategory(selected);
    else content.replaceChildren();
    if (focusedCategory) [...categories.querySelectorAll('a')].find(link => link.dataset.cat === focusedCategory)?.focus({ preventScroll: true });
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    renderNavigation();
  }
  modal.addEventListener('modal:open', initialize);
  window.openCatalogCategory = (id, trigger) => {
    if (!window.CATALOG_STRUCTURE[id] || typeof window.openAppModal !== 'function') return false;
    initialize();
    selectCategory(id);
    window.openAppModal(modal, trigger);
    [...categories.querySelectorAll('a')].find(link => link.dataset.cat === id)?.scrollIntoView({ block: 'nearest' });
    return true;
  };
  window.addEventListener('enka:store-change', () => { if (initialized) renderNavigation(); });
  categories.addEventListener('click', event => {
    const trigger = event.target.closest('a[data-cat]');
    if (!trigger || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectCategory(trigger.dataset.cat);
  });
  categories.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const items = [...categories.querySelectorAll('a')];
    const index = items.indexOf(event.target.closest('a'));
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    selectCategory(items[next].dataset.cat);
  });
  window.fetchCatalogCached?.().then(data => {
    products = data.products;
    // Update photographs without moving focus or resetting the visitor's scroll.
    const source = settings(selected);
    content.querySelectorAll('a[data-subcat] img').forEach(img => {
      const subId = img.closest('a').dataset.subcat;
      const sub = source?.subs.find(item => item.id === subId) || { id: subId };
      const selection = engine.subcategoryImage(products, selected, sub);
      const image = selection?.image || '/img/categories/no-photo.svg';
      if (img.getAttribute('src') !== image) img.src = image;
      img.dataset.photoKey = visuals.photoKey(image);
      img.dataset.subcategoryProduct = selection?.productId || '';
    });
  }).catch(() => {});
});
