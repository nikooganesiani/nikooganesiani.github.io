const fs = require('node:fs');
const path = require('node:path');
async function buildStoreContent(data, root = process.cwd()) {
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
    const content = store ? { store, catalog, heroes: engine.banners(store).map(h=>({id:h.id, title:engine.text(h.title), html:visuals.hero(h,'ka',true)})), company:store.company, categoryTiles:store.categories.filter(c=>c.visible!==false).map(c=>visuals.category(c,'ka',catalog[c.id].icon,true)),
      campaignRows:engine.rows(priced,store).map(row=>({id:row.id,title:engine.text(row.title),template:row.template,productIds:row.products.map(p=>p.id)})) } : {};
    fs.writeFileSync(path.join(directory, 'studio.json'), JSON.stringify(content));
  }
  const assets = path.join(root, 'assets/js/global');
  if (fs.existsSync(assets)) {
    for(const name of ['store-engine.js','store-visuals.js'])fs.copyFileSync(path.join(__dirname,'../admin/public',name),path.join(assets,name));
  }
  return store ? engine.applyProducts(data.products, store) : (Array.isArray(data) ? data : data.products);
}
module.exports = { buildStoreContent };
