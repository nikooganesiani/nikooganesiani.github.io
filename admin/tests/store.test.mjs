import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDocument, clone, validateDocument, catalogDiff, importDocument, storeEngine as engine } from '../public/model.js';
import { ensureStore } from '../public/store-editor.js';
import { CatalogStore } from '../server/store.mjs';
import { CatalogService } from '../server/service.mjs';
import { readPublishedCatalog } from '../server/published.mjs';
import lockedApi from '../catalog-api-locked.mjs';
import { buildStoreContent } from '../../scripts/build-store-content.cjs';

const NOW=Date.parse('2026-11-10T12:00:00+04:00');
const product=()=>({id:'coffee',name:'ყავის აპარატი',price:'99.99',oldPrice:'120',images:[],categories:['kitchen'],subcategories:['coffee'],specs:{}});
function document(){const d=createDocument({products:[product()]});ensureStore(d);return d;}
const rule=(extra={})=>({id:'kitchen-week',title:{ka:'კვირეული',ru:'Неделя кухни',en:'Kitchen week'},enabled:true,percent:15,startsAt:'2026-11-10T12:00:00+04:00',endsAt:'2026-11-11T12:00:00+04:00',categoryIds:['kitchen'],subcategoryIds:[],productIds:[],excludeIds:[],template:'featured',showRow:true,limit:8,...extra});
function harness(){
  const db=new DatabaseSync(':memory:');
  const store=new CatalogStore((sql,...values)=>db.prepare(sql).all(...values), callback=>{db.exec('BEGIN IMMEDIATE');try{const value=callback();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}});
  const values=new Map();const service=new CatalogService(store,{async put(key,value){values.set(key,JSON.parse(value));}});
  return {db,store,service,values};
}

test('Existing catalogs acquire editable store content without changing products or translations',()=>{
  const d=createDocument({products:[product()]});const before=clone(d);assert.equal(ensureStore(d),true);assert.equal(ensureStore(d),false);
  assert.deepEqual(d.catalog,before.catalog);assert.deepEqual(d.translations,before.translations);assert.deepEqual(validateDocument(d),[]);
  assert.ok(Object.keys(d.store.strings).length>600);
  d.store.categories[0].title.ru='Изменено';assert.notEqual(document().store.categories[0].title.ru,'Изменено');
});

test('Discounts use Tbilisi instants, include the start, exclude the end and restore the base price',()=>{
  const p=product();const store={campaigns:[rule()]};
  assert.equal(engine.applyProducts([p],store,NOW-1)[0].price,'99.99');
  const sale=engine.applyProducts([p],store,NOW)[0];assert.equal(sale.price,'84');assert.equal(sale.oldPrice,'99.99');
  assert.equal(engine.applyProducts([sale],store,NOW)[0].price,'84','cached/API prices never compound');
  const ended=engine.applyProducts([sale],store,NOW+86400000)[0];assert.equal(ended.price,p.price);assert.equal(ended.oldPrice,p.oldPrice);assert.equal(ended._enkaCampaign,undefined);
  assert.equal(p.price,'99.99');
});

test('Overlaps select the best price; exclusions, subcategories, products and templates are respected',()=>{
  const p=product();const s={campaigns:[rule(),rule({id:'second',percent:20,categoryIds:[],subcategoryIds:['coffee']})]};
  assert.equal(engine.applyProducts([p],s,NOW)[0].price,'79');
  s.campaigns[1].excludeIds=[p.id];assert.equal(engine.applyProducts([p],s,NOW)[0].price,'84');
  s.campaigns[0].enabled=false;assert.equal(engine.applyProducts([p],s,NOW)[0].price,'99.99');
  s.campaigns=[rule({categoryIds:[],productIds:[p.id]})];assert.equal(engine.applyProducts([p],s,NOW)[0].price,'84');
  s.campaigns[0].isTemplate=true;assert.equal(engine.applyProducts([p],s,NOW)[0].price,'99.99');assert.equal(engine.rows([p],s,NOW).length,0);
  assert.equal(engine.applyProducts([{...p,price:'1.01'}],{campaigns:[rule({percent:99})]},NOW)[0].price,'1');
  assert.equal(engine.applyProducts([{...p,price:'0.01'}],{campaigns:[rule({percent:99})]},NOW)[0].price,'0.01');
  assert.equal(engine.applyProducts([{...p,price:'49'}],{campaigns:[rule()]},NOW)[0].price,'41');
});

test('Category visibility/order and campaign row limits are independent of catalog assignments',()=>{
  const d=document();d.store.categories[0].visible=false;d.store.categories.reverse();
  const structure=engine.structure(d.store,'ru');assert.equal(structure.smarthome,undefined);assert.equal(Object.keys(structure)[0],'gadget');assert.equal(structure.kitchen.title,'Кухня');
  const p=product();const other={...p,id:'other'};const sold={...p,id:'sold',stockStatus:'out_of_stock'};
  d.store.campaigns=[rule({productIds:['other'],limit:2})];
  const rows=engine.rows([p,other,sold],d.store,NOW);assert.deepEqual(rows[0].products.map(p=>p.id),['other','coffee']);
});

test('Validation rejects broken links, duplicate sections, bad schedules and malformed imported settings',()=>{
  for(const mutate of [
    d=>d.store.categories.push(clone(d.store.categories[0])),
    d=>d.store.categories.find(c=>c.id==='kitchen').subs.find(s=>s.id==='coffee').id='missing',
    d=>d.store.campaigns=[rule({percent:100})],
    d=>d.store.campaigns=[rule({endsAt:'2026-11-10T11:59:59+04:00'})],
    d=>d.store.campaigns=[rule({startsAt:'2026-11-10T12:00'})],
    d=>d.store.campaigns=[rule({productIds:['deleted']})],
    d=>d.store.company.facebook='javascript:alert(1)',
    d=>d.store.categories=[null],
    d=>d.store.categories=null,
    d=>d.store.campaigns=[rule({categoryIds:{invalid:true}})],
    d=>d.store.strings={'source':{ru:42}}
  ]){const d=document();mutate(d);assert.ok(validateDocument(d).length);}
});

test('Backup and raw imports preserve the store; API exports restore editable base prices',()=>{
  const d=document();d.store.campaigns=[rule()];d.store.strings['კატალოგი'].ru='Ассортимент';
  assert.deepEqual(importDocument({document:d}).store,d.store);
  assert.deepEqual(importDocument({products:[product()]},d).store,d.store);
  const catalog={products:engine.applyProducts(d.catalog.products,d.store,NOW),_enkaStore:d.store};
  const restored=createDocument(catalog);assert.equal(restored.catalog.products[0].price,'99.99');assert.equal(restored.catalog.products[0].oldPrice,'120');assert.deepEqual(restored.store,d.store);
  const before=clone(d);d.store.company.hours='10:00–20:00';assert.deepEqual(catalogDiff(before,d).storeChanges,['company']);
});

test('One publication commits store and products; drafts and restoring never change public content',async()=>{
  const h=harness();await h.service.initialize({products:[product()]});
  const d=document();d.store.campaigns=[rule({startsAt:'',endsAt:''})];d.store.strings['კატალოგი'].ru='Ассортимент';
  h.service.save({expectedRevision:1,document:d},'editor');assert.equal(h.values.size,0);
  await h.service.publish({expectedRevision:2},'editor');
  const get=async key=>clone(h.values.get(key));
  const live=await readPublishedCatalog(get,'ka');assert.equal(live.products[0].price,'84');assert.deepEqual(live._enkaStore,d.store);
  const draft=clone(d);draft.store.campaigns[0].percent=50;h.service.save({expectedRevision:2,document:draft},'editor');
  assert.equal((await readPublishedCatalog(get,'ka')).products[0].price,'84');
  h.service.restore({expectedRevision:3,revision:2},'editor');assert.equal(h.service.view().document.store.campaigns[0].percent,15);
  const env={CATALOG_KV:{get}};
  const response=await lockedApi.fetch(new Request('https://api.test/catalog'),env,{});assert.equal((await response.json()).products[0].price,'84');
  const feed=await lockedApi.fetch(new Request('https://api.test/v1/feed.xml'),env,{});assert.match(await feed.text(),/<g:sale_price>84.00 GEL/);
  h.db.close();
});

test('Build uses the published store for static categories, heroes, contacts and promotion fallback',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'enka-store-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'_data'));const d=document();d.store.campaigns=[rule({startsAt:'',endsAt:''})];
  const products=await buildStoreContent({...d.catalog,_enkaStore:d.store},root);
  const output=JSON.parse(fs.readFileSync(path.join(root,'_data/studio.json')));
  assert.equal(products[0].price,'84');assert.equal(output.catalog.kitchen.title,'სამზარეულო');assert.deepEqual(output.campaignRows[0].productIds,['coffee']);assert.deepEqual(output.company,d.store.company);
  await buildStoreContent(d.catalog,root);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'_data/studio.json'))),{});
});

test('Restoring an older snapshot cannot resurrect retired product banner layouts',async()=>{
  const h=harness();await h.service.initialize({products:[product()]});
  const legacy=h.store.getState();legacy.document=document();legacy.document.store.heroes=[{id:'old',productId:'coffee',title:{ka:'ძველი'},enabled:true}];h.store.update(legacy);
  // Simulate a snapshot saved by a previous version of Studio.
  h.store.sql('UPDATE catalog_history SET document = ? WHERE revision = 1',JSON.stringify(legacy.document));
  const restored=h.service.restore({expectedRevision:1,revision:1},'editor');
  assert.deepEqual(restored.document.store.heroes,[]);assert.deepEqual(restored.document.catalog,legacy.document.catalog);
  await h.service.publish({expectedRevision:2},'editor');assert.deepEqual(h.values.get('catalog')._enkaStore.heroes,[]);h.db.close();
});

test('Renaming categories and subcategories keeps assignments, discounts, artwork and old links',()=>{
  const d=document();d.store.campaigns=[rule()];const before=clone(d.catalog.products[0]);
  const category=d.store.categories.find(c=>c.id==='kitchen');const artwork=engine.categoryAppearance(category);
  assert.equal(engine.renameSection(d.store,d.catalog.products,'category','kitchen',' APPLIANCES '),true);
  assert.equal(engine.renameSection(d.store,d.catalog.products,'sub','coffee','espresso'),true);
  assert.deepEqual(d.catalog.products[0].categories,['appliances']);assert.deepEqual(d.catalog.products[0].subcategories,['espresso']);
  assert.deepEqual(d.store.campaigns[0].categoryIds,['appliances']);assert.deepEqual(category.aliases,['kitchen']);
  assert.deepEqual(engine.categoryAppearance(category),artwork);assert.equal(category.artworkId,'kitchen');
  assert.deepEqual(engine.resolveSection(d.store,'KITCHEN','COFFEE'),{category:'appliances',sub:'espresso'});
  assert.equal(engine.applyProducts(d.catalog.products,d.store,NOW)[0].price,'84');
  assert.deepEqual({...d.catalog.products[0],categories:before.categories,subcategories:before.subcategories},before);
  assert.deepEqual(validateDocument(d),[]);assert.deepEqual(importDocument({document:d}).store,d.store);
  assert.equal(engine.renameSection(d.store,d.catalog.products,'category','appliances','kitchen'),true);
  assert.deepEqual(category.aliases,['appliances']);assert.deepEqual(engine.resolveSection(d.store,'appliances','coffee'),{category:'kitchen',sub:'espresso'});
});

test('ID changes reject collisions, reserved routes and invalid input before touching the draft',()=>{
  for(const next of ['smarthome','SMARTHOME','all','page','utm_offer','__proto__','../test','bad id','ქართული','a'.repeat(151),'']){
    const d=document();const before=clone(d);assert.throws(()=>engine.renameSection(d.store,d.catalog.products,'category','kitchen',next));assert.deepEqual(d,before,next);
  }
  const d=document();d.store.categories[0].aliases=['old-home'];const before=clone(d);
  assert.throws(()=>engine.renameSection(d.store,d.catalog.products,'category','kitchen','old-home'));assert.deepEqual(d,before);
  assert.equal(engine.renameSection(d.store,d.catalog.products,'category','kitchen','kitchen'),false);assert.deepEqual(d,before);
  for(const aliases of [['smarthome'],['OLD','old'],['../bad'],{},Array(101).fill('old')]){
    const bad=document();bad.store.categories.find(c=>c.id==='kitchen').aliases=aliases;assert.ok(validateDocument(bad).length);
  }
});

test('Published and restored versions retain category aliases together with product references',async()=>{
  const h=harness();await h.service.initialize({products:[product()]});const d=document();
  engine.renameSection(d.store,d.catalog.products,'category','kitchen','appliances');
  engine.renameSection(d.store,d.catalog.products,'sub','coffee','espresso');
  h.service.save({expectedRevision:1,document:d},'editor');await h.service.publish({expectedRevision:2},'editor');
  const live=await readPublishedCatalog(async key=>clone(h.values.get(key)),'ka');
  assert.deepEqual(live.products[0].categories,['appliances']);assert.deepEqual(engine.resolveSection(live._enkaStore,'kitchen','coffee'),{category:'appliances',sub:'espresso'});
  const restored=h.service.restore({expectedRevision:2,revision:2},'editor');assert.deepEqual(restored.document.store,d.store);assert.deepEqual(restored.document.catalog,d.catalog);h.db.close();
});

test('Campaign background settings travel through draft, publication and history with base catalog unchanged',async()=>{
  const h=harness();await h.service.initialize({products:[product()]});const d=document();const catalog=clone(d.catalog);
  const appearance={backgroundColor:'#662233',textColor:'#ffffff',backgroundImage:'https://images.example/pattern.webp',backgroundFit:'tile',backgroundOpacity:0.3,patternSize:64};
  d.store.campaigns=[rule({startsAt:'',endsAt:'',appearance})];h.service.save({expectedRevision:1,document:d},'editor');await h.service.publish({expectedRevision:2},'editor');
  const live=await readPublishedCatalog(async key=>clone(h.values.get(key)),'ka');assert.deepEqual(live._enkaStore.campaigns[0].appearance,appearance);assert.deepEqual(h.service.view().document.catalog,catalog);
  const restored=h.service.restore({expectedRevision:2,revision:2},'editor');assert.deepEqual(restored.document.store.campaigns[0].appearance,appearance);h.db.close();
});
