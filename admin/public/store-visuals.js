// The same markup and stylesheet power Studio previews, the storefront and static builds.
(() => {
  const engine = globalThis.EnkaStoreEngine;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const color = (value, fallback) => /^#[\da-f]{6}$/i.test(value || '') ? value : fallback;
  const number = (value, fallback, min, max) => Number.isFinite(value) ? Math.min(max,Math.max(min,value)) : fallback;
  const image = value => engine.safeImage(value) ? value : '';
  const style = (value, staticHTML) => ` ${staticHTML?'style':'data-visual-style'}="${esc(value)}"`;
  const url = value => `url('${image(value)}')`;
  function hero(hero, locale='ka', staticHTML=false) {
    if ((hero.type!==undefined && hero.type!=='image') || (hero.type===undefined && Object.hasOwn(hero,'productId')) || !image(hero.image) || !engine.safeLink(hero.link)) return '';
    const title=engine.text(hero.title,locale);
    const appearance=`background-color:${color(hero.backgroundColor,'#eaf1ff')};--hero-ratio:${number(hero.ratio,3,1,5)};--hero-mobile-ratio:${number(hero.mobileRatio,1.4,0.5,5)}`;
    const fit=`object-fit:${hero.fit==='contain'?'contain':'cover'};object-position:${number(hero.positionX,50,0,100)}% ${number(hero.positionY,50,0,100)}%`;
    return `<a class="enka-hero enka-hero-image" href="${esc(hero.link)}"${hero.newTab?' target="_blank" rel="noopener noreferrer"':''}${style(appearance,staticHTML)} aria-label="${esc(title)}" draggable="false"><picture>${image(hero.mobileImage)?`<source media="(max-width: 640px)" srcset="${esc(hero.mobileImage)}">`:''}<img src="${esc(hero.image)}" alt="${esc(title)}"${style(fit,staticHTML)} loading="lazy" data-catalog-content></picture></a>`;
  }
  function category(category, locale='ka', icon='', staticHTML=false) {
    const a=engine.categoryAppearance(category); const title=engine.text(category.title,locale);
    const ids=['smarthome','kitchen','homecare','selfcare','building','gadget'];const index=ids.indexOf(category.artworkId || category.id);
    const background=`background-image:${image(a.backgroundImage)?url(a.backgroundImage):'none'};background-size:${a.backgroundFit==='tile'?'128px 128px':a.backgroundFit};background-repeat:${a.backgroundFit==='tile'?'repeat':'no-repeat'};background-position:center;opacity:${number(a.backgroundOpacity,0.65,0,1)}`;
    const art=a.showIllustration===false?'':image(a.image)?`<img class="enka-category-image" src="${esc(a.image)}" alt=""${style(`width:${number(a.imageSize,100,20,150)}px;height:${number(a.imageSize,100,20,150)}px;left:${number(a.imageX,100,0,100)}%;top:${number(a.imageY,100,0,100)}%;transform:translate(-${number(a.imageX,100,0,100)}%,-${number(a.imageY,100,0,100)}%)`,staticHTML)}>`:a.useDefaultImage && index>=0?`<span class="enka-category-sprite"${style(`background-position:${index%3*50}% ${index<3?0:100}%`,staticHTML)}></span>`:`<span class="enka-category-icon" aria-hidden="true">${icon}</span>`;
    return `<a class="category-item-btn enka-category" href="/category/?${encodeURIComponent(category.id)}" data-cat="${esc(category.id)}" data-name="${esc(title)}" data-subs="${esc(JSON.stringify(category.subs.filter(s=>s.visible!==false).map(s=>({id:s.id,name:engine.text(s.title,locale)}))))}" aria-label="${esc(title)}" aria-haspopup="dialog" aria-controls="categoryModal" aria-expanded="false"${style(`background-color:${color(a.backgroundColor,'#e5edff')};color:${color(a.textColor,'#15356b')}`,staticHTML)}><span class="enka-category-background"${style(background,staticHTML)} aria-hidden="true"></span>${a.showTitle?`<span data-category-title>${esc(title)}</span>`:''}${art}</a>`;
  }
  function campaignFrame(rule,locale='ka',staticHTML=false) {
    const a=engine.campaignAppearance(rule);const decorated=rule.template==='featured' || Boolean(rule.appearance);
    const title=engine.text(rule.title,locale);const compact=rule.template==='compact';
    const background=`background-image:${image(a.backgroundImage)?url(a.backgroundImage):'none'};background-size:${a.backgroundFit==='tile'?number(a.patternSize,128,16,1024)+'px '+number(a.patternSize,128,16,1024)+'px':a.backgroundFit==='contain'?'contain':'cover'};background-repeat:${a.backgroundFit==='tile'?'repeat':'no-repeat'};background-position:center;opacity:${number(a.backgroundOpacity,0.25,0,1)}`;
    return {
      start:`<section class="enka-campaign${decorated?' enka-campaign-decorated':''}${rule.appearance?' enka-campaign-custom':''}" data-campaign-row="${esc(rule.id)}" aria-label="${esc(title)}"${style(`background-color:${decorated?color(a.backgroundColor,'#eff6ff'):'transparent'}`,staticHTML)}><span class="enka-campaign-pattern" aria-hidden="true"${style(background,staticHTML)}></span><div class="enka-campaign-content"><h2 class="enka-campaign-title"${style(`color:${color(a.textColor,'#0f172a')}`,staticHTML)}>${esc(title)}</h2><div class="enka-campaign-products${compact?' enka-campaign-compact':' product-carousel'}" tabindex="0" role="group" aria-label="${esc(title)}">`,
      end:'</div></div></section>'
    };
  }
  function apply(root, assetBase='') { root.querySelectorAll('[data-visual-style]').forEach(node=>{node.style.cssText=node.dataset.visualStyle.replaceAll("'/img/",`'${assetBase}/img/`);}); if(assetBase)root.querySelectorAll('img[src^="/img/"],source[srcset^="/img/"]').forEach(node=>{const key=node.tagName==='SOURCE'?'srcset':'src';node.setAttribute(key,assetBase+node.getAttribute(key));}); if(assetBase)root.querySelectorAll('.enka-category-sprite').forEach(node=>{node.style.backgroundImage=`url('${assetBase}/img/categories/objects.webp')`;}); }
  globalThis.EnkaStoreVisuals = {hero,category,campaignFrame,apply};
})();
