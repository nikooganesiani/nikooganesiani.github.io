// Shared by Studio, the public API and the storefront. Campaign prices round down to whole GEL.
(() => {
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,149}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
  const titleOK = value => plain(value) && typeof value.ka === 'string' && value.ka.trim() && Object.entries(value).every(([key, text]) => ['ka', 'ru', 'en'].includes(key) && typeof text === 'string' && text.length <= 30000);
  const text = (value, locale = 'ka') => value?.[locale]?.trim() || value?.ka || '';
  const safeLink = value => {
    if (typeof value !== 'string' || value.length > 2000 || /[\s\\\u0000-\u001f<>"']/.test(value)) return false;
    if (/^\/(?!\/)/.test(value)) return true;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
  };
  const safeImage = value => safeLink(value) && !/youtu\.?be/i.test(value);
  // Retire the old layouts on import/open without turning product photos into artwork.
  function migrateBanners(store) {
    if (!plain(store) || !Array.isArray(store.heroes)) return false;
    let changed=false;
    store.heroes=store.heroes.filter(hero=>{
      const retired=plain(hero) && (hero.type==='product' || (hero.type===undefined && Object.hasOwn(hero,'productId')));
      if(retired)changed=true;
      return !retired;
    });
    for(const hero of store.heroes)if(plain(hero))for(const key of ['productId','buttonLabel','buttonColor','textColor'])if(Object.hasOwn(hero,key)){delete hero[key];changed=true;}
    return changed;
  }
  const banners = store => (store?.heroes || []).filter(h=>plain(h) && h.enabled && (h.type==='image' || (h.type===undefined && !Object.hasOwn(h,'productId'))) && safeImage(h.image) && safeLink(h.link));
  const colorOK = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  const categoryAppearance = category => ({ backgroundColor:'#e5edff', textColor:'#15356b', backgroundImage: ['smarthome','kitchen','homecare','selfcare','building','gadget'].includes(category.id) ? `/img/categories/patterns/${category.id}.svg` : '', backgroundFit:'tile', backgroundOpacity:0.65, image:'', useDefaultImage:true, showIllustration:true, imageSize:100, imageX:100, imageY:100, showTitle:true, ...category.appearance });
  function appearanceErrors(value, category = false) {
    if (value === undefined) return [];
    if (!plain(value)) return ['Оформление: неверная структура.'];
    const errors = [];
    for (const key of category?['backgroundColor','textColor']:['backgroundColor']) if (value[key] !== undefined && !colorOK(value[key])) errors.push('Оформление: используйте цвет #RRGGBB.');
    for (const key of category?['image','backgroundImage']:['image','mobileImage']) if (value[key] !== undefined && value[key] !== '' && !safeImage(value[key])) errors.push('Изображения: используйте HTTPS-ссылку или путь от корня сайта.');
    for (const [key,min,max] of category?[['backgroundOpacity',0,1],['imageSize',20,150],['imageX',0,100],['imageY',0,100]]:[['ratio',1,5],['mobileRatio',0.5,5],['positionX',0,100],['positionY',0,100]]) if (value[key] !== undefined && (!Number.isFinite(value[key]) || value[key]<min || value[key]>max)) errors.push(`Оформление: ${key} — от ${min} до ${max}.`);
    if (category && value.backgroundFit !== undefined && !['tile','cover','contain'].includes(value.backgroundFit)) errors.push('Оформление: проверьте режим фона.');
    if (category && value.showTitle !== undefined && typeof value.showTitle !== 'boolean') errors.push('Оформление: проверьте видимость названия.');
    if (category && value.showIllustration !== undefined && typeof value.showIllustration !== 'boolean') errors.push('Оформление: проверьте видимость иллюстрации.');
    if (category && value.useDefaultImage !== undefined && typeof value.useDefaultImage !== 'boolean') errors.push('Оформление: проверьте стандартную иллюстрацию.');
    if (!category && value.fit !== undefined && !['cover','contain'].includes(value.fit)) errors.push('Оформление: проверьте режим изображения.');
    return errors;
  }
  const active = (item, now = Date.now()) => item.enabled && !item.isTemplate && (!item.startsAt || Date.parse(item.startsAt) <= now) && (!item.endsAt || now < Date.parse(item.endsAt));
  const matches = (product, rule) => !rule.excludeIds?.includes(product.id) && (rule.productIds?.includes(product.id) || rule.categoryIds?.some(id => product.categories?.includes(id)) || rule.subcategoryIds?.some(id => product.subcategories?.includes(id)));
  const centsOf = value => Math.round(Number(String(value).trim().replace(',','.')) * 100);
  const discountedCents = (cents, percent) => Math.min(cents, Math.max(100, Math.floor(cents * (100 - percent) / 10000) * 100));
  const campaignPrice = (value, percent) => String(discountedCents(centsOf(value),percent) / 100);
  function applyProducts(products, store, now = Date.now()) {
    const rules = (store?.campaigns || []).filter(rule => active(rule, now));
    return products.map(product => {
      const base = product._enkaBase || { price: product.price, oldPrice: product.oldPrice ?? '' };
      const cents = centsOf(base.price);
      let best = cents; let winner;
      for (const rule of rules) if (matches(product, rule)) {
        const candidate = discountedCents(cents, rule.percent);
        if (candidate < best) { best = candidate; winner = rule; }
      }
      const result = { ...product, price: String(base.price), oldPrice: base.oldPrice };
      delete result._enkaCampaign;
      if (store) result._enkaBase = { ...base };
      if (winner && cents > 0) {
        result.price = String(best / 100);
        // The comparison price is the actual current catalog price before this campaign.
        result.oldPrice = String(cents / 100);
        result._enkaCampaign = winner.id;
      }
      return result;
    });
  }
  function structure(store, locale = 'ka', fallback = {}) {
    return Object.fromEntries((store?.categories || []).filter(c => c.visible !== false).map(category => [category.id, {
      title: text(category.title, locale), icon: fallback[category.icon]?.icon || fallback[category.id]?.icon || '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6zm0 3h12v12H6V6z"/></svg>',
      subs: category.subs.filter(s => s.visible !== false).map(sub => ({ id: sub.id, name: text(sub.title, locale) }))
    }]));
  }
  function rows(products, store, now = Date.now()) {
    return (store?.campaigns || []).filter(rule => active(rule, now) && rule.showRow).map(rule => ({ ...rule,
      products: [...rule.productIds.map(id=>products.find(p=>p.id===id)), ...products.filter(p=>!rule.productIds.includes(p.id))].filter(p => p && matches(p, rule) && Number(p.price) > 0 && (!p.stockStatus || p.stockStatus === 'in_stock')).slice(0, rule.limit || 8)
    })).filter(row => row.products.length);
  }
  function validate(store, products) {
    if (!plain(store)) return ['Неверная структура настроек магазина.'];
    const errors = [];
    const productIds = new Set(products.map(p => p.id)); const cats = new Set(); const subs = new Set();
    const list = (value, limit, label) => { if (!Array.isArray(value) || value.length > limit) { errors.push(`${label}: неверный список или превышен лимит ${limit}.`); return []; } return value; };
    for (const category of list(store.categories, 100, 'Категории')) {
      if (!plain(category) || !idOK(category.id) || cats.has(category.id) || !titleOK(category.title) || typeof category.visible !== 'boolean' || !idOK(category.icon)) { errors.push('Категории: проверьте ID, названия, иконку и видимость.'); continue; }
      cats.add(category.id);
      errors.push(...appearanceErrors(category.appearance, true));
      for (const sub of list(category.subs, 200, 'Подкатегории')) {
        if (!plain(sub) || !idOK(sub.id) || subs.has(sub.id) || !titleOK(sub.title) || typeof sub.visible !== 'boolean') errors.push('Подкатегории: ID должны быть уникальными, названия заполнены.');
        else subs.add(sub.id);
      }
    }
    for (const p of products) {
      if (p.categories?.some(id => !cats.has(id)) || p.subcategories?.some(id => !subs.has(id))) errors.push(`Товар ${p.id}: выбрана несуществующая категория или подкатегория.`);
      if (p.subcategories?.some(id => !Array.isArray(store.categories) || !store.categories.some(c => plain(c) && p.categories?.includes(c.id) && Array.isArray(c.subs) && c.subs.some(s => s?.id === id)))) errors.push(`Товар ${p.id}: подкатегория не принадлежит выбранным категориям.`);
    }
    const ids = new Set();
    for (const rule of list(store.campaigns, 100, 'Акции')) {
      if (!plain(rule) || !idOK(rule.id) || ids.has(rule.id) || !titleOK(rule.title)) { errors.push('Акции: проверьте ID и заголовки.'); continue; }
      ids.add(rule.id);
      if (typeof rule.enabled !== 'boolean' || (rule.isTemplate !== undefined && typeof rule.isTemplate !== 'boolean') || typeof rule.showRow !== 'boolean' || !Number.isFinite(rule.percent) || rule.percent <= 0 || rule.percent >= 100 || !Number.isInteger(rule.limit) || rule.limit < 1 || rule.limit > 48 || !['cards', 'compact', 'featured'].includes(rule.template)) errors.push(`Акция «${text(rule.title, 'ru')}»: процент должен быть больше 0 и меньше 100; проверьте шаблон и количество (1–48).`);
      for (const key of ['startsAt', 'endsAt']) if (typeof rule[key] !== 'string' || (rule[key] && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(rule[key]) || !Number.isFinite(Date.parse(rule[key]))))) errors.push('Акции: некорректная дата с часовым поясом.');
      if (rule.startsAt && rule.endsAt && Date.parse(rule.startsAt) >= Date.parse(rule.endsAt)) errors.push('Акции: окончание должно быть позже начала.');
      for (const [key, allowed] of [['categoryIds', cats], ['subcategoryIds', subs], ['productIds', productIds], ['excludeIds', productIds]]) {
        if (!Array.isArray(rule[key]) || rule[key].some(id => !allowed.has(id))) errors.push(`Акция «${text(rule.title, 'ru')}»: проверьте выбранные разделы и товары.`);
      }
      if (!['categoryIds','subcategoryIds','productIds'].some(key=>Array.isArray(rule[key]) && rule[key].length)) errors.push('Акции: выберите хотя бы один раздел или товар.');
    }
    const heroIds = new Set();
    for (const hero of list(store.heroes, 20, 'Баннеры')) {
      if (!plain(hero) || !idOK(hero.id) || heroIds.has(hero.id) || !titleOK(hero.title) || typeof hero.enabled !== 'boolean') { errors.push('Баннеры: проверьте название и уникальность ID.'); continue; }
      if ((hero.type !== undefined && hero.type !== 'image') || ['productId','buttonLabel','buttonColor','textColor'].some(key=>Object.hasOwn(hero,key))) errors.push('Баннеры: доступны только изображения со ссылкой.');
      if (!safeImage(hero.image) || !safeLink(hero.link)) errors.push('Баннеры: добавьте изображение и корректную ссылку.');
      if (hero.newTab !== undefined && typeof hero.newTab !== 'boolean') errors.push('Баннеры: проверьте открытие ссылки.');
      errors.push(...appearanceErrors(hero));
      heroIds.add(hero?.id);
    }
    if (!plain(store.strings) || Object.keys(store.strings).length > 3000) errors.push('Неверный словарь текстов сайта.');
    else for (const [source, values] of Object.entries(store.strings)) if (!source.trim() || source.length > 30000 || !plain(values) || Object.entries(values).some(([locale, value]) => !['ka', 'ru', 'en'].includes(locale) || typeof value !== 'string' || value.length > 30000)) errors.push('Тексты сайта: проверьте языки и длину текста.');
    if (!plain(store.company)) errors.push('Не найдены контакты магазина.');
    else {
      for (const key of ['name', 'legal_name', 'registration', 'address', 'phone', 'phone_link', 'email', 'whatsapp', 'facebook', 'hours']) if (typeof store.company[key] !== 'string' || !store.company[key].trim() || store.company[key].length > 1000) errors.push(`Контакты: заполните поле ${key}.`);
      if (!/^\+?[\d ()-]+$/.test(store.company.phone_link || '')) errors.push('Контакты: некорректный телефон для ссылки.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(store.company.email || '')) errors.push('Контакты: некорректная почта.');
      for (const key of ['whatsapp', 'facebook']) { try { const u = new URL(store.company[key]); if (u.protocol !== 'https:' || u.username || u.password) throw Error(); } catch { errors.push(`Контакты: ${key} должен быть HTTPS-ссылкой.`); } }
    }
    return [...new Set(errors)];
  }
  globalThis.EnkaStoreEngine = { text, active, matches, campaignPrice, applyProducts, structure, rows, validate, safeLink, safeImage, categoryAppearance, migrateBanners, banners };
})();
