(() => {
  'use strict';
  // The category page clones the same Jekyll component used by product pages.
  window.renderBreadcrumbs = function(nav, items) {
    if (!nav) return;
    const list = nav.querySelector('ol');
    const itemTemplate = nav.querySelector('template[data-breadcrumb-item]');
    const separatorTemplate = nav.querySelector('template[data-breadcrumb-separator]');
    const home = list?.querySelector('[data-breadcrumb-home]')?.cloneNode(true);
    if (!list || !home || !itemTemplate || !separatorTemplate) return;
    const nodes = [home];
    for (const [index, item] of items.entries()) {
      const crumb = itemTemplate.content.firstElementChild.cloneNode(true);
      let link = crumb.querySelector('.breadcrumb-link');
      const label = crumb.querySelector('.breadcrumb-label');
      label.textContent = String(item.label || '');
      crumb.querySelector('[itemprop="position"]').content = String(index + 2);
      if (item.iconKey) {
        const iconTemplate = [...nav.querySelectorAll('template[data-breadcrumb-icon]')].find(template => template.dataset.breadcrumbIcon === item.iconKey);
        if (iconTemplate) crumb.querySelector('.breadcrumb-icon').append(iconTemplate.content.cloneNode(true));
        crumb.classList.add('breadcrumb-category');
      }
      if (item.current) {
        crumb.classList.add('breadcrumb-current');
        label.id = 'breadcrumbCategoryName';
        const current = document.createElement('span');
        current.className = link.className;
        current.setAttribute('aria-current', 'page');
        current.append(...link.childNodes);
        link.replaceWith(current);
        link = current;
      } else {
        link.setAttribute('href', item.href);
        link.setAttribute('aria-label', item.label);
        if (item.subSwitch) link.dataset.subSwitch = item.subSwitch;
      }
      nodes.push(separatorTemplate.content.firstElementChild.cloneNode(true), crumb);
    }
    list.replaceChildren(...nodes);
  };
})();
