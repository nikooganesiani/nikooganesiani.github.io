const fs = require('node:fs');
const path = require('node:path');
async function buildStoreContent(data, root = process.cwd()) {
  if (fs.existsSync(path.join(root, '_data/icons.json'))) require('./build-icons.cjs').buildIcons(root);
  await import('../admin/public/store-engine.js');
  await import('../admin/public/store-visuals.js');
  const visuals=globalThis.EnkaStoreVisuals;
  const engine = globalThis.EnkaStoreEngine;
  const store = data?._enkaStore ? structuredClone(data._enkaStore) : undefined;
  engine.migrateBanners(store);
  const directory = path.join(root, '_data');
  if (store) {
    const errors = engine.validate(store, data.products);
    if (errors.length) throw Error('Invalid published store: ' + errors.join('; '));
  }
  if (fs.existsSync(directory)) {
    const fallback = JSON.parse(fs.readFileSync(path.join(__dirname, '../admin/public/store-icons.json'), 'utf8'));
    const priced=store?engine.applyProducts(data.products,store):[];
    const catalog=store?engine.structure(store,'ka',fallback):{};
    const navigationCatalog=store?catalog:fallback;
    require('./build-category-pages.cjs').buildCategoryPages(store?.categories || Object.entries(fallback).map(([id, category]) => ({ id, subs: category.subs })), root);
    const products=Array.isArray(data)?data:data.products;
    const images={};
    const panels=Object.entries(navigationCatalog).map(([id,category])=>{
      const settings=store?.categories.find(c=>c.id===id);
      images[id]={};
      const cards=category.subs.map(sub=>{
        const source=settings?.subs.find(s=>s.id===sub.id) || sub;
        const selection=engine.subcategoryImage(products,id,source);
        images[id][sub.id]=selection;
        return visuals.subcategory(id,sub,selection,true);
      }).join('');
      return {id,title:category.title,html:cards};
    });
    fs.writeFileSync(path.join(directory,'catalog_navigation.json'),JSON.stringify({images,panels}));
    const rowData = row => ({ id: row.id, showRow: row.showRow, title: engine.text(row.title), template: row.template, appearance: row.appearance, frame: visuals.campaignFrame(row, 'ka', true), productIds: row.products.map(product => product.id) });
    const homeBlocks = store && engine.homeLayout(store).filter(block => block.enabled).map(block => {
      if (!['products', 'category'].includes(block.type)) return block;
      const shelf = engine.homeProducts(block, priced, store);
      const row = { id: block.id, title: { ka: shelf.title }, template: 'cards', products: shelf.products };
      return { ...block, row: rowData(row) };
    });
    const content = store ? { store, catalog, homeBlocks, heroes: engine.banners(store).map(h=>({id:h.id, title:engine.text(h.title), html:visuals.hero(h,'ka',true)})), company:store.company, categoryTiles:store.categories.filter(c=>c.visible!==false).map(c=>visuals.category(c,'ka',catalog[c.id].icon,true)),
      campaignRows:engine.rows(priced,store,Date.now(),true).map(rowData) } : {};
    fs.writeFileSync(path.join(directory, 'studio.json'), JSON.stringify(content));
  }
  const assets = path.join(root, 'assets/js/global');
  if (fs.existsSync(assets)) {
    for(const name of ['store-engine.js','store-visuals.js'])fs.copyFileSync(path.join(__dirname,'../admin/public',name),path.join(assets,name));
  }
  return store ? engine.applyProducts(data.products, store) : (Array.isArray(data) ? data : data.products);
}
module.exports = { buildStoreContent };
