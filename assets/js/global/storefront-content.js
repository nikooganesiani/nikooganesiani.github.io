(() => {
  'use strict';
  const engine = globalThis.EnkaStoreEngine;
  const esc = value => window.escapeHTML(value);
  let current; let products = []; let signature = JSON.stringify(window.ENKA_STORE || ''); let productSignature = ''; let timer;
  const rowMarkup = new WeakMap();
  const renderedBanners = new WeakMap();
  const fallbackStructure = structuredClone(window.CATALOG_STRUCTURE || {});
  const locale = () => window.enkaI18n?.locale || 'ka';
  const label = value => engine.text(value, locale());
  function categories(store) {
    const next = engine.structure(store, locale(), fallbackStructure);
    const structure = window.CATALOG_STRUCTURE ||= {};
    Object.keys(structure).forEach(key => delete structure[key]); Object.assign(structure,next);
    const list = document.querySelector('[data-category-tiles] ul');
    if (!list) return;
    const source=store.categories.filter(c=>c.visible!==false);
    list.querySelectorAll('[data-catalog-tile]').forEach(tile => tile.remove());
    list.insertAdjacentHTML('beforeend', source.map(c=>'<li class="min-w-0" data-catalog-tile>'+globalThis.EnkaStoreVisuals.category(c,locale(),next[c.id].icon)+'</li>').join(''));
    globalThis.EnkaStoreVisuals.apply(list);
  }
  function contacts(store) {
    const before=window.ENKA_COMPANY || {};const after=store.company;
    if(!after)return;
    const replacements=Object.keys(after).filter(key=>before[key] && before[key]!==after[key]).sort((a,b)=>before[b].length-before[a].length);
    if(replacements.length){
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      let node;while((node=walker.nextNode())){
        if(node.parentElement.closest('script,style,textarea,[contenteditable],.product-name,[data-product-name],[data-catalog-content]'))continue;
        let value=node.nodeValue;for(const key of replacements){value=value.split(before[key]).join(after[key]);const translated=window.enkaI18n?.t(before[key]);if(translated && translated!==before[key])value=value.split(translated).join(window.enkaI18n?.t(after[key]) || after[key]);}
        if(value!==node.nodeValue)node.nodeValue=value;
      }
      document.querySelectorAll('[aria-label],meta[content]').forEach(node=>{
        if(node.hasAttribute('data-catalog-content'))return;
        const attribute=node.hasAttribute('aria-label')?'aria-label':'content';let value=node.getAttribute(attribute);
        for(const key of replacements)value=value.split(before[key]).join(after[key]);node.setAttribute(attribute,value);
      });
    }
    // Explicit bindings also update text nodes without relying on a translated label.
    document.querySelectorAll('[data-company]').forEach(node=>{const key=node.dataset.company;if(after[key]!==undefined)node.textContent=after[key];});
    document.querySelectorAll('a[href]').forEach(link=>{
      const pairs=[['tel:'+before.phone_link,'tel:'+after.phone_link],['mailto:'+before.email,'mailto:'+after.email],[before.whatsapp,after.whatsapp],[before.facebook,after.facebook]];
      const match=pairs.find(([old])=>old && link.getAttribute('href')===old);if(match)link.setAttribute('href',match[1]);
    });
    window.ENKA_COMPANY={...after};
  }
  const bannerSignature = (offers, priority) => JSON.stringify([offers, priority]);
  function heroes(anchor, offers, priority = false) {
    const signature = bannerSignature(offers, priority);
    if (renderedBanners.get(anchor) === signature) return;
    renderedBanners.set(anchor, signature);
    anchor.querySelector('[data-promo-block]')?.enkaCleanup?.();
    anchor.replaceChildren();
    if (!offers.length) return;
    const t = value => window.enkaI18n?.t(value) || value;
    const root = document.createElement('section');
    root.className = 'relative w-full my-3 select-none';
    root.dataset.promoBlock = '';
    root.setAttribute('aria-label', t('სპეციალური შეთავაზებები'));
    root.setAttribute('aria-roledescription', t('კარუსელი'));
    const slides = offers.map((offer, index) => `
      <div data-promo-slide data-title="${esc(label(offer.title))}" role="group" aria-roledescription="${esc(t('სლაიდი'))}" aria-label="${index + 1} / ${offers.length}">
        ${globalThis.EnkaStoreVisuals.hero(offer, locale(), false, {
          priority: priority && index === 0, carousel: offers.length > 1, localSrcsets: window.ENKA_BANNER_SRCSETS
        })}
      </div>`).join('');
    const dots = offers.map((offer, index) => `
      <button type="button" data-promo-dot aria-label="${index + 1} / ${offers.length} — ${esc(label(offer.title))}" aria-current="${index === 0}" tabindex="${index === 0 ? 0 : -1}"></button>`).join('');
    root.innerHTML = `
      <div class="sr-only" data-promo-status aria-live="polite" aria-atomic="true"></div>
      <div data-promo-track>${slides}</div>
      ${offers.length > 1 ? `
        <button type="button" data-promo-step="-1" aria-label="${esc(t('წინა შეთავაზება'))}">${window.EnkaIcons.render('chevron-left', 20)}</button>
        <button type="button" data-promo-step="1" aria-label="${esc(t('შემდეგი შეთავაზება'))}">${window.EnkaIcons.render('chevron-right', 20)}</button>
        <div data-promo-dots role="group" aria-label="${esc(t('აირჩიეთ შეთავაზება'))}">${dots}</div>` : ''}`;
    anchor.append(root);
    globalThis.EnkaStoreVisuals.apply(root);
    window.enkaInitPromoBlock?.(root);
  }
  function renderRows(root, rows, prefix) {
    const html=rows.filter(row => row.products.length).map(row=>{
      const frame=globalThis.EnkaStoreVisuals.campaignFrame(row,locale());
      return frame.start+row.products.map(p=>window.createProductCardHTML?.(p,'studio-'+prefix+'-'+row.id) || '').join('')+frame.end;
    }).join('');
    if(rowMarkup.get(root)===html)return;
    rowMarkup.set(root,html);
    root.innerHTML=html;globalThis.EnkaStoreVisuals.apply(root);window.syncFavButtons?.();
  }
  function renderHome(layout) {
    const storage = document.querySelector('[data-home-storage]');
    const slots = [...layout.children, ...storage.children];
    const blocks = engine.homeLayout(current).filter(block => block.enabled);
    const rows = engine.rows(products, current, Date.now(), true);
    const offers = engine.banners(current);
    const priority = engine.priorityBanner(blocks, offers);
    const used = new Set();
    for (const [index, block] of blocks.entries()) {
      const singleton = engine.homeSingletons.includes(block.type);
      const existing = slots.find(slot => slot.dataset.homeType === block.type && (singleton || slot.dataset.homeBlock === block.id));
      const slot = existing || document.createElement('div');
      slot.dataset.homeBlock = block.id;
      slot.dataset.homeType = block.type;
      if (layout.children[index] !== slot) layout.insertBefore(slot, layout.children[index] || null);
      used.add(slot);
      if (block.type === 'banner') {
        slot.dataset.studioHeroes = '';
        heroes(slot, engine.bannerOffers(block, offers), block.id === priority);
      }
      if (block.type === 'campaign') {
        slot.dataset.studioCampaigns = '';
        renderRows(slot, rows.filter(row => block.sourceId ? row.id === block.sourceId : row.showRow), block.id);
      }
      if (block.type === 'products' || block.type === 'category') {
        const shelf = engine.homeProducts(block, products, current, locale());
        renderRows(slot, [{ id: block.id, title: { ka: shelf.title }, template: 'cards', products: shelf.products }], block.id);
      }
    }
    for (const slot of [...layout.children]) if (!used.has(slot)) {
      if (engine.homeSingletons.includes(slot.dataset.homeType)) storage.append(slot);
      else {
        slot.querySelector('[data-promo-block]')?.enkaCleanup?.();
        slot.remove();
      }
    }
  }
  function render(updateHeroes = false) {
    if(!current)return;
    const layout = document.querySelector('[data-home-layout]');
    if (layout) { renderHome(layout); return; }
    // A cached page generated before the block editor still has fixed anchors.
    const hero = document.querySelector('[data-studio-heroes]');
    if (updateHeroes && hero) heroes(hero, engine.banners(current));
    const campaign = document.querySelector('[data-studio-campaigns]');
    if (campaign) renderRows(campaign, engine.rows(products, current), 'campaign');
  }
  function schedule() {
    clearTimeout(timer);
    if(!current)return;
    const now=Date.now();const times=current.campaigns.flatMap(c=>[Date.parse(c.startsAt),Date.parse(c.endsAt)]).filter(t=>Number.isFinite(t)&&t>now);
    if(times.length)timer=setTimeout(()=>{products=engine.applyProducts(products,current);render();window.dispatchEvent(new CustomEvent('enka:prices-change',{detail:{products}}));schedule();},Math.min(Math.max(1,Math.min(...times)-now+20),2147483647));
  }
  window.enkaStorefront = {
    apply(store, catalogProducts) {
      if(!store || !engine)return;
      products=engine.applyProducts(catalogProducts,store);current=store;
      const next=JSON.stringify(store);
      const nextProducts=JSON.stringify(products);const first=!productSignature;
      if(next===signature && nextProducts===productSignature)return;
      productSignature=nextProducts;
      const changed=next!==signature;
      if(changed){signature=next;window.ENKA_STORE=store;window.enkaI18n?.setStore(store);categories(store);contacts(store);window.dispatchEvent(new CustomEvent('enka:store-change'));}
      render(changed || first && locale()!=='ka');schedule();
    }
  };
  if (window.ENKA_STORE) {
    const blocks = engine.homeLayout(window.ENKA_STORE);
    const offers = engine.banners(window.ENKA_STORE);
    const priority = engine.priorityBanner(blocks, offers);
    // The initial HTML already includes the selected image for this release and language.
    for (const slot of document.querySelectorAll('[data-home-layout] > [data-studio-heroes]')) {
      const block = blocks.find(block => block.id === slot.dataset.homeBlock);
      if (block) renderedBanners.set(slot, bannerSignature(engine.bannerOffers(block, offers), block.id === priority));
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if (window.ENKA_STORE) {
      current = window.ENKA_STORE;
      if (locale() !== 'ka') categories(current);
    }
    window.fetchCatalogCached?.().then(data=>{if(data.store)window.enkaStorefront.apply(data.store,data.products);}).catch(()=>{});
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&current&&productSignature){products=engine.applyProducts(products,current);render();window.dispatchEvent(new CustomEvent('enka:prices-change',{detail:{products}}));schedule();}});
})();
