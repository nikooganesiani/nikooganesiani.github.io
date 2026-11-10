import { t, ui } from './studio-i18n.js';
import defaults from './store-defaults.js';
import { dateControl, createDatePicker } from './date-picker.js';
import { clone, storeEngine as engine } from './model.js';
import './store-visuals.js';
import { getLocale } from './studio-i18n.js';
const visuals=globalThis.EnkaStoreVisuals;

export function ensureStore(document) {
  if (document.store) return engine.migrateBanners(document.store);
  document.store = clone(defaults);
  // Retain legacy assignments, including sections absent from the old static list.
  for (const p of document.catalog.products) {
    for (const id of p.categories) if (!document.store.categories.some(c => c.id === id)) document.store.categories.push({ id, title: {ka:id,ru:id,en:id}, visible:true, icon:'gadget', subs:[] });
    for (const id of p.subcategories) if (!document.store.categories.some(c => c.subs.some(s => s.id === id))) {
      const parent = document.store.categories.find(c => p.categories.includes(c.id));
      if (parent) parent.subs.push({id, title:{ka:id,ru:id,en:id}, visible:true});
    }
  }
  return true;
}

export function createStoreEditor({ state, escape: e, markDirty, toast, confirmMessage, renderApp, uploadImage }) {
  const root = document.querySelector('#store-view');
  const datePicker=createDatePicker();
  const names = {categories:'Категории', campaigns:'Акции и скидки', merchandising:'Главная страница', 'site-texts':'Тексты сайта', settings:'Контакты магазина'};
  const companyNames = {name:'Название магазина',legal_name:'Юридическое имя',registration:'Регистрационный номер',address:'Адрес',phone:'Телефон для отображения',phone_link:'Телефон для звонка',email:'Электронная почта',whatsapp:'WhatsApp · HTTPS-ссылка',facebook:'Facebook · HTTPS-ссылка',hours:'Часы работы'};
  let query = ''; let textPage = 0; let onlyMissing = false; let selected = ''; let previewAt = ''; let previewLocale='ka'; let previewDevice='desktop';
  const store = () => state.document.store;
  const valueAt = path => path.split('.').reduce((obj, key) => obj?.[key], store());
  function input(label, path, {type='text',hint='',options,value=valueAt(path),multi=false}={}) {
    label=t(label);hint=t(hint);
    if(type==='datetime-local')return dateControl(label,path,value);
    if(options && multi) return `<fieldset class="field studio-choice-field"><legend class="field-label">${e(label)}</legend><div class="studio-checklist">${options.map(([id,name])=>`<label><input type="checkbox" data-store-choice="${e(path)}" value="${e(id)}"${value?.includes(id)?' checked':''}><span>${e(name)}</span></label>`).join('')}</div></fieldset>`;
    const control = options ? `<select aria-label="${e(label)}" data-store-path="${e(path)}">${options.map(([id,name])=>`<option value="${e(id)}"${value===id?' selected':''}>${e(name)}</option>`).join('')}</select>` : type==='textarea' ? `<textarea aria-label="${e(label)}" rows="3" data-store-path="${e(path)}">${e(value)}</textarea>` : `<input aria-label="${e(label)}" data-store-path="${e(path)}" type="${type}"${type==='checkbox'?(value?' checked':''):` value="${e(value)}"`}${type==='number'?' step="0.01"':''}>`;
    return `<label class="field"><span class="field-label">${e(label)}</span>${control}${hint?`<span class="field-hint">${e(hint)}</span>`:''}</label>`;
  }
  const titles = path => ['ka','ru','en'].map(locale => input({ka:'Название · ქართული',ru:'Название · Русский',en:'Название · English'}[locale], path+'.'+locale)).join('');
  const button = (action,label,extra='')=>`<button type="button" class="button secondary" data-store-action="${action}" ${extra}>${label}</button>`;
  const moves = (path,index,length)=>`${button('move','↑',ui`data-path="${path}" data-index="${index}" data-step="-1" aria-label="Выше"${index===0?' disabled':''}`)}${button('move','↓',ui`data-path="${path}" data-index="${index}" data-step="1" aria-label="Ниже"${index===length-1?' disabled':''}`)}`;
  const id = prefix => prefix+'-'+crypto.randomUUID().slice(0,8);
  const title = item => engine.text(item.title,getLocale());
  const options = items => items.map(item=>[item.id,title(item)]);
  function categories() {
    return ui`<p class="studio-help">Названия доступны на трёх языках. Стрелки меняют порядок на сайте. Скрытый раздел остаётся у товаров, но не показывается в навигации. Адреса существующих разделов сохраняются.</p>${button('add-category',t('+ Добавить категорию'))}<div class="studio-stack">${store().categories.map((c,i)=>ui`<details class="studio-card" data-category-id="${e(c.id)}"><summary><strong>${e(title(c))}</strong><span>${c.subs.length} подкатегорий · ${c.visible?t('Видна'):t('Скрыта')}</span></summary><div class="studio-card-body"><div class="studio-actions">${moves('categories',i,store().categories.length)}${button('delete-category',t('Удалить'),`data-index="${i}"`)}<small>ID: ${e(c.id)}</small></div><div class="studio-grid">${titles(`categories.${i}.title`)}${input(t('Показывать в навигации'),`categories.${i}.visible`,{type:'checkbox'})}${input(t('Иконка в меню'),`categories.${i}.icon`,{options:defaults.categories.map(c=>[c.id,title(c)])})}</div>${categoryDesign(c,i)}<h3>Подкатегории</h3>${c.subs.map((s,j)=>`<div class="studio-sub"><div class="studio-grid">${titles(`categories.${i}.subs.${j}.title`)}${input(t('Показывать'),`categories.${i}.subs.${j}.visible`,{type:'checkbox'})}</div><div class="studio-actions">${moves(`categories.${i}.subs`,j,c.subs.length)}${button('delete-sub',t('Удалить подкатегорию'),`data-index="${i}" data-sub="${j}"`)}<small>ID: ${e(s.id)}</small></div></div>`).join('')}${button('add-sub',t('+ Подкатегория'),`data-index="${i}"`)}</div></details>`).join('')}</div>`;
  }
  function campaignPreview(rule) {
    const now = previewAt ? Date.parse(previewAt) : Date.now();
    const products = state.document.catalog.products.filter(p=>engine.matches(p,rule));
    const priced = engine.applyProducts(products,store(),now);
    const status = rule.isTemplate?t('Шаблон'):!rule.enabled?t('Выключена'):rule.startsAt && now<Date.parse(rule.startsAt)?t('Запланирована'):rule.endsAt && now>=Date.parse(rule.endsAt)?t('Завершена'):t('Действует');
    return ui`<div class="studio-preview"><h3>${status} · ${products.length} товаров в составе</h3><p>Расчёт от текущей цены товара. При пересечении действует самая выгодная акция, без сложения процентов. Акционная цена округляется вниз до целого лари: 41,65 → 41 ₾. Минимальная акционная цена — 1 ₾.</p>${dateControl(t('Проверить на дату · время Тбилиси (UTC+4)'),'preview',previewAt)}<div class="table-scroll"><table class="product-table"><thead><tr><th>Товар</th><th>Обычная цена</th><th>По этой акции</th><th>Итог на дату</th></tr></thead><tbody>${priced.slice(0,60).map((p,index)=>`<tr><td>${e(p.name)}</td><td>${e(products[index].price)} ₾</td><td>${e(engine.campaignPrice(products[index].price,rule.percent))} ₾</td><td>${e(p.price)} ₾${p._enkaCampaign && p._enkaCampaign!==rule.id?t(' · другая акция'):''}</td></tr>`).join('')}</tbody></table></div>${products.length>60?t('<p>Первые 60 товаров; акция применяется ко всему составу.</p>'):''}</div>`;
  }
  function campaigns() {
    const list = store().campaigns; let index = list.findIndex(c=>c.id===selected); if(index<0)index=0;
    const rule = list[index]; selected=rule?.id || ''; const p=`campaigns.${index}`;
    return ui`<p class="studio-help">Выберите целые разделы или отдельные товары и исключения. Даты необязательны: пустое начало — сразу, пустое окончание — бессрочно. Конец интервала не включается. Шаблоны сохраняют настройки для будущих акций и не дают скидку.</p><div class="studio-actions">${button('add-campaign',t('+ Новая акция'))}</div><div class="studio-columns"><nav class="studio-list" aria-label="Список акций">${list.map(c=>button('select-campaign',e(title(c))+(c.isTemplate?t(' · шаблон'):c.enabled?t(' · включена'):t(' · выключена')),`data-id="${e(c.id)}" aria-pressed="${c.id===selected}"`)).join('')}</nav><div>${rule?ui`<article class="studio-card studio-card-body"><div class="studio-actions">${moves('campaigns',index,list.length)}${button('copy-campaign',t('Дублировать'),`data-index="${index}"`)}${button('template-campaign',rule.isTemplate?t('Создать акцию из шаблона'):t('Сохранить как шаблон'),`data-index="${index}"`)}${button('delete-campaign',t('Удалить'),`data-index="${index}"`)}</div><div class="studio-grid">${titles(p+'.title')}${input(t('Включить акцию'),p+'.enabled',{type:'checkbox',hint:rule.isTemplate?t('Сначала создайте акцию из шаблона.'):''})}${input(t('Скидка, %'),p+'.percent',{type:'number'})}${input(t('Начало · Тбилиси (UTC+4)'),p+'.startsAt',{type:'datetime-local',value:rule.startsAt})}${input(t('Окончание · Тбилиси (UTC+4)'),p+'.endsAt',{type:'datetime-local',value:rule.endsAt})}${input(t('Целые категории'),p+'.categoryIds',{options:options(store().categories),multi:true})}${input(t('Целые подкатегории'),p+'.subcategoryIds',{options:options(store().categories.flatMap(c=>c.subs)),multi:true})}</div><div class="studio-help">Отметьте нужные разделы галочками. Для отдельных товаров используйте поиск ниже.</div><label class="field"><span class="field-label">Найти товар по названию, ID или артикулу</span><input id="campaign-product-search" type="search" placeholder="Введите название"></label><div id="campaign-product-choices">${productChoices(index,'')}</div><div class="studio-grid">${input(t('Показать товарный ряд на главной'),p+'.showRow',{type:'checkbox'})}${input(t('Оформление ряда'),p+'.template',{options:[['cards',t('Карточки · горизонтальный ряд')],['compact',t('Компактный · сетка')],['featured',t('Акцентный · цветной фон')]]})}${input(t('Количество товаров в ряду (1–48)'),p+'.limit',{type:'number'})}</div></article><div id="campaign-preview">${campaignPreview(rule)}</div>`:t('<div class="studio-card studio-card-body"><h2>Здесь появятся ваши акции</h2><p>Создайте первую акцию и проверьте её состав и цены перед публикацией.</p></div>')}</div></div>`;
  }
  function productChoices(index,filter) {
    const rule=store().campaigns[index];
    const products=state.document.catalog.products.filter(p=>[p.name,p.id,p.sku].join(' ').toLowerCase().includes(filter.toLowerCase()));
    return ui`<div class="studio-selected-products">${rule.productIds.map((id,i)=>`<div class="studio-actions"><span>${e(state.document.catalog.products.find(p=>p.id===id)?.name || id)}</span>${moves(`campaigns.${index}.productIds`,i,rule.productIds.length)}</div>`).join('')}</div><p class="field-hint">Вручную добавлено: ${rule.productIds.length} · Исключено: ${rule.excludeIds.length}. Исключения имеют приоритет над разделами.</p><div class="studio-product-choices">${products.map(p=>`<div><span>${e(p.name)} <small>${e(p.id)}</small></span>${['productIds','excludeIds'].map(key=>`<label><input type="checkbox" data-campaign-product="${index}" data-key="${key}" value="${e(p.id)}"${rule[key].includes(p.id)?' checked':''}>${key==='productIds'?t('Добавить'):t('Исключить')}</label>`).join('')}</div>`).join('')}</div>`;
  }
  function mediaField(label,path,value=valueAt(path)) {
    return ui`<div class="studio-media-field">${input(label,path,{value,hint:t('HTTPS-ссылка или путь /img/…; JPG, PNG и WebP можно загрузить с компьютера.')})}<div class="studio-actions"><label class="button secondary studio-upload">Загрузить изображение<input type="file" accept="image/jpeg,image/png,image/webp" data-store-upload="${e(path)}"></label>${button('clear-media',t('Убрать изображение'),`data-path="${e(path)}"`)}</div></div>`;
  }
  const numberField=(label,path,value)=>input(label,path,{type:'number',value});
  function previewControls() {
    return ui`<div class="studio-actions studio-preview-controls"><label class="field"><span class="field-label">Язык контента превью</span><select data-visual-locale>${['ka','ru','en'].map(l=>`<option value="${l}"${previewLocale===l?' selected':''}>${{ka:'ქართული',ru:'Русский',en:'English'}[l]}</option>`).join('')}</select></label><label class="field"><span class="field-label">Размер превью</span><select data-visual-device><option value="desktop"${previewDevice==='desktop'?' selected':''}>Компьютер</option><option value="mobile"${previewDevice==='mobile'?' selected':''}>Телефон</option></select></label></div>`;
  }
  function preview(kind,index) {
    return ui`<div class="studio-visual-preview"><h3>Живое превью</h3><div class="studio-preview-device" data-device="${previewDevice}" data-visual-preview="${kind}" data-index="${index}"></div><p class="field-hint" data-visual-link="${index}"></p></div>`;
  }
  function categoryDesign(c,i) {
    const a=engine.categoryAppearance(c);const p=`categories.${i}.appearance`;
    return ui`<h3>Оформление карточки на главной</h3><div class="studio-grid">${input(t('Цвет фона'),p+'.backgroundColor',{type:'color',value:a.backgroundColor})}${input(t('Цвет текста'),p+'.textColor',{type:'color',value:a.textColor})}${input(t('Показывать название'),p+'.showTitle',{type:'checkbox',value:a.showTitle})}${mediaField(t('Фоновая картинка / узор'),p+'.backgroundImage',a.backgroundImage)}${input(t('Режим фона'),p+'.backgroundFit',{value:a.backgroundFit,options:[['tile',t('Повторять узор')],['cover',t('Заполнить фон')],['contain',t('Вместить фон')]]})}${numberField(t('Непрозрачность фона (0–1)'),p+'.backgroundOpacity',a.backgroundOpacity)}${input(t('Показывать иллюстрацию'),p+'.showIllustration',{type:'checkbox',value:a.showIllustration})}${mediaField(t('Иллюстрация категории'),p+'.image',a.image)}${input(t('Стандартная иллюстрация, если своя не задана'),p+'.useDefaultImage',{type:'checkbox',value:a.useDefaultImage})}${numberField(t('Размер иллюстрации, px (20–150)'),p+'.imageSize',a.imageSize)}${numberField(t('Положение по горизонтали, % (0–100)'),p+'.imageX',a.imageX)}${numberField(t('Положение по вертикали, % (0–100)'),p+'.imageY',a.imageY)}</div>${button('reset-category-design',t('Вернуть стандартное оформление'),`data-index="${i}"`)}${previewControls()}${preview('category',i)}`;
  }
  function heroes() {
    return ui`<p class="studio-help">Баннер — готовое изображение со ссылкой. Для телефона можно задать отдельную картинку. Превью обновляется при редактировании и показывает текущий черновик.</p>${previewControls()}${button('add-hero',t('+ Добавить баннер'))}<div class="studio-stack">${store().heroes.map((h,i)=>{
      const p=`heroes.${i}`;return `<article class="studio-card studio-card-body"><div class="studio-actions">${moves('heroes',i,store().heroes.length)}${button('delete-hero',t('Удалить'),`data-index="${i}"`)}</div><div class="studio-grid">${mediaField(t('Картинка баннера'),p+'.image')}${mediaField(t('Картинка для телефона (необязательно)'),p+'.mobileImage')}${input(t('Ссылка при нажатии'),p+'.link',{hint:t('Например: /category/?kitchen или https://example.com/offer')})}${['ka','ru','en'].map(l=>input(t('Описание изображения · ')+l.toUpperCase(),p+'.title.'+l)).join('')}${input(t('Показывать баннер'),p+'.enabled',{type:'checkbox'})}${input(t('Масштабирование картинки'),p+'.fit',{value:h.fit || 'cover',options:[['cover',t('Заполнить с обрезкой')],['contain',t('Вместить целиком')]]})}${numberField(t('Пропорции на компьютере (ширина / высота)'),p+'.ratio',h.ratio ?? 3)}${numberField(t('Пропорции на телефоне (ширина / высота)'),p+'.mobileRatio',h.mobileRatio ?? 1.4)}${numberField(t('Фокус по горизонтали, % (0–100)'),p+'.positionX',h.positionX ?? 50)}${numberField(t('Фокус по вертикали, % (0–100)'),p+'.positionY',h.positionY ?? 50)}${input(t('Цвет фона'),p+'.backgroundColor',{type:'color',value:h.backgroundColor || '#eaf1ff'})}${input(t('Открывать в новой вкладке'),p+'.newTab',{type:'checkbox'})}</div>${preview('hero',i)}</article>`;
    }).join('')}</div>`;
  }
  function setValue(path,value) {
    const parts=path.split('.');const key=parts.pop();
    if(parts[0]==='categories' && parts[2]==='appearance' && !store().categories[parts[1]].appearance)store().categories[parts[1]].appearance=engine.categoryAppearance(store().categories[parts[1]]);
    valueAt(parts.join('.'))[key]=value;
  }
  function refreshVisuals() {
    root.querySelectorAll('[data-visual-locale]').forEach(el=>el.value=previewLocale);
    root.querySelectorAll('[data-visual-device]').forEach(el=>el.value=previewDevice);
    root.querySelectorAll('[data-visual-preview]').forEach(target=>{
      const i=Number(target.dataset.index);const kind=target.dataset.visualPreview;
      target.dataset.device=previewDevice;
      if(kind==='hero') {
        const h=store().heroes[i];
        const mobile=previewDevice==='mobile' && engine.safeImage(h.mobileImage);
        target.innerHTML=!engine.safeImage(h.image) || !engine.safeLink(h.link)?'<p class="studio-help">'+e(t('Добавьте изображение и ссылку для превью.'))+'</p>':visuals.hero(mobile?{...h,image:h.mobileImage}:h,previewLocale);
        const note=target.parentElement.querySelector('[data-visual-link]');note.textContent=(h.link || '')+(h.enabled?'':t(' · Баннер скрыт'));
      } else {
        const c=store().categories[i];const icon=state.storeIcons?.[c.icon]?.icon || '';
        target.innerHTML=visuals.category(c,previewLocale,icon);
      }
      visuals.apply(target,state.session?.storefrontBase?.startsWith('https://')?state.session.storefrontBase:'');
    });
  }

  function texts() {
    const all=Object.entries(store().strings);
    const filtered=all.map(([source,values],index)=>({source,values,index})).filter(({source,values})=>(!onlyMissing || !values.ru?.trim() || !values.en?.trim()) && [source,...Object.values(values)].join(' ').toLowerCase().includes(query.toLowerCase()));
    const pages=Math.max(1,Math.ceil(filtered.length/20)); textPage=Math.min(textPage,pages-1);
    return ui`<p class="studio-help">Кнопки, меню, подписи, сообщения, заголовки и тексты информационных страниц. Грузинский оригинал служит ключом; поле KA позволяет менять его на сайте. Пустое поле возвращает исходный текст / встроенный перевод. Один и тот же текст меняется во всех местах сайта. Переводы товаров остаются в карточках товаров.</p><div class="studio-actions"><label class="field studio-grow"><span class="field-label">Поиск по оригиналу и переводам</span><input id="site-text-search" type="search" value="${e(query)}" placeholder="Текст или перевод…"></label><label class="field"><span class="field-label">Только без RU / EN</span><input id="site-text-missing" type="checkbox"${onlyMissing?' checked':''}></label>${button('add-text',t('+ Добавить текст'))}</div><p>${filtered.length} из ${all.length} текстов · Страница ${textPage+1} / ${pages}</p><div class="studio-stack">${filtered.slice(textPage*20,textPage*20+20).map(({source,values,index})=>`<article class="studio-card studio-card-body"><p class="studio-source" lang="ka">${e(source)}</p><div class="studio-grid">${['ka','ru','en'].map(locale=>`<label class="field"><span class="field-label">${locale.toUpperCase()}${locale==='ka'?t(' · замена оригинала'):''}</span><textarea rows="${source.length>200?'5':'2'}" lang="${locale}" data-site-string="${index}" data-locale="${locale}">${e(values[locale] || '')}</textarea></label>`).join('')}</div></article>`).join('')}</div><div class="studio-actions">${button('text-prev',t('← Назад'),textPage===0?'disabled':'')}${button('text-next',t('Далее →'),textPage>=pages-1?'disabled':'')}</div><dialog id="add-text-dialog" class="message-dialog"><h2>Добавить текст сайта</h2><p>Вставьте точный грузинский текст с сайта, чтобы связать его с переводом.</p><label class="field"><span class="field-label">Исходный текст</span><textarea id="new-site-source" rows="4"></textarea></label><div class="studio-actions">${button('cancel-text',t('Отмена'))}${button('confirm-text',t('Добавить'))}</div></dialog>`;
  }
  function render() {
    const open=new Set([...root.querySelectorAll('details[open][data-category-id]')].map(el=>el.dataset.categoryId));
    root.hidden=!Object.hasOwn(names,state.view); if(root.hidden)return;
    root.innerHTML=ui`<div class="page-heading"><div><p class="eyebrow">УПРАВЛЕНИЕ МАГАЗИНОМ</p><h1>${t(names[state.view])}</h1><p class="page-description">Изменения входят в общий черновик, историю и публикацию магазина.</p></div></div>${({categories, campaigns,merchandising:heroes,'site-texts':texts,settings:()=>ui`<p class="studio-help">Контакты используются в шапке, подвале и информационных страницах магазина.</p><div class="studio-card studio-card-body studio-grid">${Object.entries(companyNames).map(([key,label])=>input(label,'company.'+key)).join('')}</div>`}[state.view])()}`;
    root.querySelectorAll('details[data-category-id]').forEach(el=>el.open=open.has(el.dataset.categoryId));
    refreshVisuals();
  }
  function refreshPreview() { const rule=store().campaigns.find(c=>c.id===selected); const target=root.querySelector('#campaign-preview'); if(rule&&target)target.innerHTML=campaignPreview(rule); }
  function refreshChoices(index, focused) {
    const box=root.querySelector('#campaign-product-choices');
    const scroll=box.querySelector('.studio-product-choices')?.scrollTop || 0;
    box.innerHTML=productChoices(index,root.querySelector('#campaign-product-search').value);
    box.querySelector('.studio-product-choices').scrollTop=scroll;
    box.querySelector(`[data-key="${focused.dataset.key}"][value="${focused.value}"]`)?.focus({preventScroll:true});
  }
  root.addEventListener('input',event=>{
    const target=event.target; if(state.busy)return;
    if(target.id==='site-text-search') {const position=target.selectionStart;query=target.value;textPage=0;render();const field=root.querySelector('#site-text-search');field.focus();field.setSelectionRange(position,position);return;}
    if(target.id==='campaign-product-search') {const i=store().campaigns.findIndex(c=>c.id===selected);root.querySelector('#campaign-product-choices').innerHTML=productChoices(i,target.value);return;}
    if(target.dataset.siteString!==undefined) {const source=Object.keys(store().strings)[Number(target.dataset.siteString)];store().strings[source][target.dataset.locale]=target.value;markDirty();return;}
    if(target.dataset.storePath && !['checkbox','datetime-local'].includes(target.type) && target.tagName!=='SELECT') {
      const parts=target.dataset.storePath.split('.');const key=parts.pop();setValue(target.dataset.storePath,target.type==='number'?Number(target.value):target.value);markDirty();if(state.view==='campaigns')refreshPreview();refreshVisuals();
    }
  });
  root.addEventListener('change',async event=>{
    const target=event.target;if(state.busy)return;
    if(target.matches('[data-visual-locale]')){previewLocale=target.value;refreshVisuals();return;}
    if(target.matches('[data-visual-device]')){previewDevice=target.value;refreshVisuals();return;}
    if(target.dataset.storeUpload){const file=target.files[0];target.value='';if(!file)return;const path=target.dataset.storeUpload;
      try{const url=await uploadImage(file);setValue(path,url);markDirty();render();toast(t('Изображение добавлено в черновик.'));}catch(error){toast(error.message,true);}return;}

    if(target.id==='site-text-missing'){onlyMissing=target.checked;textPage=0;render();return;}
    if(target.dataset.storeChoice){const parts=target.dataset.storeChoice.split('.');const key=parts.pop();const parent=valueAt(parts.join('.'));parent[key]=target.checked?[...new Set([...parent[key],target.value])]:parent[key].filter(id=>id!==target.value);markDirty();refreshPreview();return;}
    if(target.dataset.campaignProduct!==undefined){const index=Number(target.dataset.campaignProduct);const rule=store().campaigns[index];rule[target.dataset.key]=target.checked?[...new Set([...rule[target.dataset.key],target.value])]:rule[target.dataset.key].filter(id=>id!==target.value);markDirty();refreshPreview();refreshChoices(index,target);return;}
    if(target.dataset.storePath){const parts=target.dataset.storePath.split('.');const key=parts.pop();setValue(target.dataset.storePath,target.type==='checkbox'?target.checked:target.type==='datetime-local'?(target.value?target.value+':00+04:00':''):target.multiple?[...target.selectedOptions].map(o=>o.value):target.type==='number'?Number(target.value):target.value);markDirty();refreshPreview();refreshVisuals();}
  });
  root.addEventListener('click',async event=>{
    if(event.target.closest('[data-visual-preview] a')){event.preventDefault();return;}
    if(state.busy)return;
    const dateButton=event.target.closest('[data-studio-date]');
    if(dateButton){
      datePicker.open(dateButton,value=>{
        const key=dateButton.dataset.studioDate;
        if(key==='preview'){previewAt=value;refreshPreview();return;}
        const parts=key.split('.');const field=parts.pop();valueAt(parts.join('.'))[field]=value;
        dateButton.closest('.field').outerHTML=dateControl(dateButton.dataset.dateLabel,key,value);
        markDirty();refreshPreview();
      });return;
    }
    const b=event.target.closest('[data-store-action]');if(!b)return;
    const action=b.dataset.storeAction;const i=Number(b.dataset.index);const s=store();
    if(action==='clear-media'){setValue(b.dataset.path,'');markDirty();render();return;}
    if(action==='reset-category-design'){delete s.categories[i].appearance;markDirty();render();return;}
    if(action==='select-campaign'){selected=b.dataset.id;previewAt='';render();return;}
    if(action==='text-prev'||action==='text-next'){textPage+=action==='text-prev'?-1:1;render();return;}
    if(action==='add-text'){root.querySelector('#add-text-dialog').showModal();return;}
    if(action==='cancel-text'){root.querySelector('#add-text-dialog').close();return;}
    if(action==='confirm-text'){const source=root.querySelector('#new-site-source').value.trim();if(!source || source.length>30000 || ['__proto__','constructor','prototype'].includes(source)){toast(t('Введите исходный текст (до 30 000 символов).'),true);return;}if(!Object.hasOwn(s.strings,source))Object.defineProperty(s.strings,source,{value:{},enumerable:true,writable:true,configurable:true});query=source;textPage=0;onlyMissing=false;root.querySelector('#add-text-dialog').close();}
    if(action==='move'){const items=valueAt(b.dataset.path);const next=i+Number(b.dataset.step);if(next<0 || next>=items.length)return;[items[i],items[next]]=[items[next],items[i]];}
    if(action==='add-category')s.categories.push({id:id('category'),title:{ka:'ახალი კატეგორია',ru:'Новая категория',en:'New category'},icon:'gadget',visible:true,subs:[]});
    if(action==='add-sub')s.categories[i].subs.push({id:id('sub'),title:{ka:'ახალი ქვეკატეგორია',ru:'Новая подкатегория',en:'New subcategory'},visible:true});
    if(action==='delete-category'||action==='delete-sub'){
      const c=s.categories[i];const sub=action==='delete-sub'?c.subs[Number(b.dataset.sub)]:null;const ids=sub?[sub.id]:[c.id,...c.subs.map(s=>s.id)];
      if(state.document.catalog.products.some(p=>[...p.categories,...p.subcategories].some(id=>ids.includes(id))) || s.campaigns.some(c=>[...c.categoryIds,...c.subcategoryIds].some(id=>ids.includes(id)))) {toast(t('Раздел используется товарами или акциями. Перенесите их в другой раздел либо скройте этот раздел.'),true);return;}
      if(!await confirmMessage(t('Удалить раздел?'),title(sub || c)+t(' будет удалён из черновика.'),t('Удалить')))return;
      if(sub)c.subs.splice(Number(b.dataset.sub),1);else s.categories.splice(i,1);
    }
    if(action==='add-campaign'){const rule={id:id('sale'),title:{ka:'ახალი შეთავაზება',ru:'Новая акция',en:'New offer'},enabled:false,percent:10,startsAt:'',endsAt:'',categoryIds:s.categories.length?[s.categories[0].id]:[],subcategoryIds:[],productIds:[],excludeIds:[],showRow:true,template:'cards',limit:8};s.campaigns.push(rule);selected=rule.id;}
    if(action==='copy-campaign'||action==='template-campaign'){const copy=clone(s.campaigns[i]);copy.id=id('sale');copy.enabled=false;copy.isTemplate=action==='template-campaign'?!copy.isTemplate:false;copy.title.ru+=(copy.isTemplate?' · шаблон':' · копия');s.campaigns.push(copy);selected=copy.id;}
    if(action==='add-hero')s.heroes.push({id:id('hero'),type:'image',image:'',link:'',title:{ka:'ახალი შეთავაზება',ru:'Новое предложение',en:'New offer'},enabled:true});
    if(action==='delete-campaign'||action==='delete-hero'){if(!await confirmMessage(t('Удалить из черновика?'),t('Изменение появится на сайте после публикации.'),t('Удалить')))return;s[action==='delete-campaign'?'campaigns':'heroes'].splice(i,1);}
    markDirty(); renderApp();
    if(action==='add-category'||action==='add-sub'){const details=root.querySelectorAll('details');details[action==='add-category'?details.length-1:i]?.setAttribute('open','');}
  });
  return {render,names};
}
