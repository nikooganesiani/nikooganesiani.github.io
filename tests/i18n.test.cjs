const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function page(locale, blocked = false) {
  class Text {
    constructor(value) { this.nodeType = 3; this.nodeValue = value; }
  }
  class Element {
    constructor(attrs = {}, ...children) { this.nodeType = 1; this.attrs = attrs; this.childNodes = children; children.forEach(child => { child.parentElement = this; }); }
    closest() { return this.attrs.exclude ? this : this.parentElement?.closest() || null; }
    hasAttribute(key) { return key in this.attrs; }
    getAttribute(key) { return this.attrs[key]; }
    setAttribute(key, value) { this.attrs[key] = value; }
  }
  const label = new Text('  კატალოგი  ');
  const source = new Text('კატალოგი');
  const input = new Element({placeholder:'პროდუქტი, ბრენდი ან მოდელი'});
  const body = new Element({}, new Element({}, label), input, new Element({exclude:true}, source));
  const document = {body, cookie:'enka_language='+locale, documentElement:{lang:'ka'}};
  let observe;
  const window = { ENKA_TRANSLATIONS: JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/i18n/translations.json'),'utf8')) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/global/i18n.js'),'utf8'), {
    window, document,
    localStorage:{getItem(){if(blocked)throw Error('blocked');return locale;}},
    MutationObserver:class { constructor(callback){observe=callback;} observe(){} }
  });
  return {window, document, label, source, input, Text, Element, mutate:records=>observe(records)};
}
test('Editorial dictionaries localize text and accessible fields without touching protected product data',()=>{
  for(const [locale,expected]of [['ru','Каталог'],['en','Catalog']]) {
    const p=page(locale);
    assert.equal(p.label.nodeValue,'  '+expected+'  ');
    assert.equal(p.document.documentElement.lang,locale);
    assert.equal(p.source.nodeValue,'კატალოგი');
    assert.equal(p.window.enkaI18n.t('unknown product model'),'unknown product model');
    assert.notEqual(p.input.attrs.placeholder,'პროდუქტი, ბრენდი ან მოდელი');
    const dynamic=new p.Text('ყიდვა');const root=new p.Element({},dynamic);
    p.mutate([{type:'childList',addedNodes:[root]}]);
    assert.equal(dynamic.nodeValue,locale==='ru'?'Купить':'Buy');
    dynamic.nodeValue='ძიება';p.mutate([{type:'characterData',target:dynamic}]);
    assert.equal(dynamic.nodeValue,locale==='ru'?'Поиск':'Search');
  }
});
test('Native locale restores from cookie when browser storage is blocked',()=>{
  const p=page('ru',true);assert.equal(p.window.enkaI18n.locale,'ru');assert.equal(p.label.nodeValue,'  Каталог  ');
});
test('Georgian and external translation languages keep the Georgian source dictionary',()=>{
  for(const locale of ['ka','de']){const p=page(locale);assert.equal(p.label.nodeValue,'  კატალოგი  ');assert.equal(p.window.enkaI18n.locale,'ka');}
});

test('Interface registry contains no product names, descriptions, model codes or specification sources',()=>{
  const dictionary=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/i18n/translations.json'),'utf8'));
  const bundle=JSON.parse(fs.readFileSync(path.join(__dirname,'../admin/translations/ru-en.json'),'utf8'));
  const taxonomy=JSON.parse(fs.readFileSync(path.join(__dirname,'../admin/public/taxonomy.json'),'utf8'));
  const categories=new Set(taxonomy.flatMap(c=>[c.name,...c.subs.map(s=>s.name)]));
  for(const p of Object.values(bundle.translations.ru.products)) for(const entry of [...Object.values(p.fields),...Object.values(p.specs)]) { if(!categories.has(entry.source.trim())) assert.equal(dictionary[entry.source.trim()],undefined,entry.source.slice(0,80)); };
  for(const a of Object.values(bundle.attributes))assert.equal(dictionary[a.source.trim()],undefined,a.source);
  for(const locale of ['ru','en'])assert.equal(page(locale).window.enkaI18n.product,undefined);
});
