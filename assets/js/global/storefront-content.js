(() => {
  'use strict';
  const engine = globalThis.EnkaStoreEngine;
  const esc = value => window.escapeHTML(value);
  let current; let products = []; let signature = ''; let productSignature = ''; let timer;
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
    list.innerHTML=source.map(c=>'<li class="min-w-0">'+globalThis.EnkaStoreVisuals.category(c,locale(),next[c.id].icon)+'</li>').join('');
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
  function heroes(store) {
    const anchor=document.querySelector('[data-studio-heroes]');if(!anchor)return;
    const offers=engine.banners(store);
    const root=document.createElement('section');root.className='relative w-full my-3 select-none';root.dataset.promoBlock='';root.setAttribute('aria-label',window.enkaI18n?.t('სპეციალური შეთავაზებები') || 'Offers');
    root.innerHTML=`<div class="sr-only" data-promo-status aria-live="polite"></div><div class="flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-3xl" data-promo-track>${offers.map(h=>`<div class="promo-slide w-full min-w-0 flex-[0_0_100%] snap-start" data-promo-slide data-title="${esc(label(h.title))}">${globalThis.EnkaStoreVisuals.hero(h,locale())}</div>`).join('')}</div>${offers.length>1?`<div class="flex justify-center gap-3 py-4" data-promo-dots>${offers.map((_,i)=>`<button type="button" class="w-3 h-3 rounded-full bg-slate-300 aria-[current=true]:bg-brand" data-promo-dot aria-label="${i+1}" aria-current="${i===0}" tabindex="${i===0?0:-1}"></button>`).join('')}</div>`:''}`;
    anchor.querySelector('[data-promo-block]')?.enkaCleanup?.();
    anchor.replaceChildren(root);globalThis.EnkaStoreVisuals.apply(root);window.enkaInitPromoBlock?.(root);
  }
  function campaignRows(store) {
    const root=document.querySelector('[data-studio-campaigns]');if(!root)return;
    root.innerHTML=engine.rows(products,store).map(row=>{
      const frame=globalThis.EnkaStoreVisuals.campaignFrame(row,locale());
      return frame.start+row.products.map(p=>window.createProductCardHTML?.(p,'studio-'+row.id) || '').join('')+frame.end;
    }).join('');globalThis.EnkaStoreVisuals.apply(root);window.syncFavButtons?.();
  }
  function render() {
    if(!current)return;
    heroes(current);campaignRows(current);
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
      const nextProducts=JSON.stringify(products);
      if(next===signature && nextProducts===productSignature)return;
      productSignature=nextProducts;
      if(next!==signature){signature=next;window.ENKA_STORE=store;window.enkaI18n?.setStore(store);categories(store);contacts(store);window.dispatchEvent(new CustomEvent('enka:store-change'));}
      render();schedule();
    }
  };
  document.addEventListener('DOMContentLoaded',()=>{
    if(window.ENKA_STORE){current=window.ENKA_STORE;categories(current);contacts(current);}
    window.fetchCatalogCached?.().then(data=>{if(data.store)window.enkaStorefront.apply(data.store,data.products);}).catch(()=>{});
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&current){products=engine.applyProducts(products,current);render();window.dispatchEvent(new CustomEvent('enka:prices-change',{detail:{products}}));schedule();}});
})();
