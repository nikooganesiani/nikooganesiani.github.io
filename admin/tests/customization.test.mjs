import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDocument,importDocument,clone,validateDocument,storeEngine as engine} from '../public/model.js';
import {ensureStore} from '../public/store-editor.js';
import '../public/store-visuals.js';
import {buildStoreContent} from '../../scripts/build-store-content.cjs';
import {readPublishedCatalog} from '../server/published.mjs';
import {getLocale,setStudioLocale,t,ui} from '../public/studio-i18n.js';
import translations from '../public/studio-translations.js';

const visuals=globalThis.EnkaStoreVisuals;
const product={id:'test',name:'პროდუქტი',price:'100',images:['https://images.example/photo.webp'],categories:['gadget'],subcategories:[],specs:{}};
function fixture(){const d=createDocument({products:[product]});ensureStore(d);d.store.heroes=[{id:'image',type:'image',title:{ka:'ბანერი',ru:'Каталог',en:'Banner'},image:'https://images.example/banner.webp',mobileImage:'/img/mobile.webp',link:'/category/?gadget',enabled:true,newTab:true,ratio:3,mobileRatio:1.4,fit:'contain'}];return d;}

test('Image banners need no product and customization survives backup and static generation',async t=>{
  const d=fixture();d.store.categories[0].appearance={backgroundColor:'#ffeedd',textColor:'#123456',backgroundImage:'/img/pattern.svg',backgroundFit:'cover',backgroundOpacity:0.5,image:'https://images.example/category.webp',imageSize:120,imageX:60,imageY:80,showTitle:false};
  assert.deepEqual(validateDocument(d),[]);const before=clone(d.catalog);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'enka-visuals-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'_data'));
  await buildStoreContent({...d.catalog,_enkaStore:d.store},root);const built=JSON.parse(fs.readFileSync(path.join(root,'_data/studio.json')));
  assert.match(built.heroes[0].html,/enka-hero-image/);assert.match(built.heroes[0].html,/srcset="\/img\/mobile.webp"/);assert.match(built.heroes[0].html,/href="\/category\/\?gadget"/);assert.match(built.categoryTiles[0],/background-color:#ffeedd/);assert.doesNotMatch(built.categoryTiles[0],/data-category-title/);assert.deepEqual(d.catalog,before);
});

test('Unsafe URLs, style injection and invalid appearance ranges are rejected on import/save',()=>{
  for(const edit of [
    d=>d.store.heroes[0].link='javascript:alert(1)',d=>d.store.heroes[0].image='//evil.example/image',
    d=>d.store.heroes[0].mobileImage='data:image/svg+xml,test',d=>d.store.heroes[0].link='/\\evil.example',
    d=>d.store.heroes[0].image="https://example.com/');color:red",d=>d.store.heroes[0].ratio=0,
    d=>d.store.heroes[0].fit='unknown',d=>d.store.heroes[0].newTab='yes',d=>d.store.heroes[0].type='unknown',
    d=>d.store.categories[0].appearance={backgroundColor:'red;position:fixed'},
    d=>d.store.categories[0].appearance={imageSize:151},d=>d.store.categories[0].appearance={imageX:-1},
    d=>d.store.categories[0].appearance={backgroundOpacity:2},d=>d.store.categories[0].appearance={showTitle:'false'},
    d=>d.store.categories[0].appearance={backgroundFit:'custom'},d=>d.store.categories[0].appearance=null
  ]){const d=fixture();edit(d);assert.ok(validateDocument(d).length,edit.toString());}
});

test('Shared rendering escapes content and supports image crops, mobile sources and safe new tabs',()=>{
  const h=fixture().store.heroes[0];h.title.ka='<img src=x onerror=alert(1)>';h.positionX=25;
  const html=visuals.hero(h);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/object-position:25% 50%/);assert.match(html,/data-visual-style=/);assert.doesNotMatch(html,/ style=/);
  assert.equal(visuals.hero({...h,type:'product',productId:'test'},'en'),'');
  assert.doesNotMatch(html,/<h2|<strong|<button|data-hero-price|data-product-name|data-product-id|enka-hero-copy|enka-hero-button/);
});

test('Editing an existing category preserves its original illustration; custom images can replace it',()=>{
  const c=fixture().store.categories[0];assert.match(visuals.category(c),/enka-category-sprite/);
  c.appearance={...engine.categoryAppearance(c),backgroundColor:'#112233'};assert.match(visuals.category(c),/enka-category-sprite/);
  c.appearance.image='/img/custom.webp';assert.match(visuals.category(c),/enka-category-image/);assert.doesNotMatch(visuals.category(c),/enka-category-sprite/);
  c.appearance.showIllustration=false;assert.doesNotMatch(visuals.category(c),/enka-category-image|enka-category-sprite|enka-category-icon/);
});

test('Studio language covers UI and dynamic messages without translating interpolated user content',()=>{
  for(const locale of ['en','ka']){
    setStudioLocale(locale);assert.equal(getLocale(),locale);assert.equal(t('Главная страница'),translations['Главная страница'][locale]);
    const user='Каталог';const rendered=ui`<h2>Ссылка при нажатии</h2><input value="${user}"><p>${user}</p>`;
    assert.match(rendered,/value="Каталог"/);assert.match(rendered,/<p>Каталог<\/p>/);assert.ok(!rendered.includes('Ссылка при нажатии'));
    assert.ok(!t('Товар test: некорректная цена.').includes('некорректная'));
  }
  setStudioLocale('ru');assert.equal(t('Каталог'),'Каталог');assert.equal(setStudioLocale('invalid'),false);
  for(const [source,values] of Object.entries(translations))for(const locale of ['en','ka'])assert.ok(values[locale]?.trim(),`${source}: ${locale}`);
});

test('Old layouts are removed on open and import; existing image banners lose product-only settings',async t=>{
  const d=fixture();const image=clone(d.store.heroes[0]);
  d.store.heroes=[{id:'old',productId:'test',title:{ka:'ძველი'},enabled:true},{id:'old-typed',type:'product',productId:'test',title:{ka:'ძველი'},enabled:true}, {...image,productId:'test',buttonLabel:{ka:'ღილაკი'},buttonColor:'#123456',textColor:'#123456'}];
  const old=clone(d);const products=clone(d.catalog);
  assert.equal(ensureStore(d),true);assert.equal(ensureStore(d),false);assert.deepEqual(d.store.heroes,[image]);assert.deepEqual(d.catalog,products);
  assert.deepEqual(importDocument({document:old}).store.heroes,[image]);assert.deepEqual(createDocument({...old.catalog,_enkaStore:old.store}).store.heroes,[image]);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'enka-retired-banners-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'_data'));
  await buildStoreContent({...old.catalog,_enkaStore:old.store},root);const built=JSON.parse(fs.readFileSync(path.join(root,'_data/studio.json')));
  assert.deepEqual(built.heroes.map(h=>h.id),['image']);assert.equal(old.store.heroes.length,3,'building must not mutate the published source');
  assert.deepEqual(engine.banners(old.store).map(h=>h.id),['image'],'cached image banners survive obsolete metadata; retired layouts stay hidden');
  const published={...old.catalog,_enkaStore:old.store};
  const api=await readPublishedCatalog(async key=>key==='catalog'?published:null);
  assert.deepEqual(api._enkaStore.heroes,[image]);assert.equal(published._enkaStore.heroes.length,3,'API reads must not mutate publication history');
});
