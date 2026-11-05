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

test('Every packaged product field and specification has a complete native translation without losing rows or model codes',()=>{
  const bundle=JSON.parse(fs.readFileSync(path.join(__dirname,'../admin/translations/ru-en.json'),'utf8'));
  for(const locale of ['ru','en']){
    const i18n=page(locale).window.enkaI18n;
    const records=bundle.translations[locale].products;
    assert.equal(Object.keys(records).length,76);
    for(const [id,record]of Object.entries(records)){
      const source={id,specs:{}};
      for(const [field,entry]of Object.entries(record.fields))source[field]=entry.source;
      for(const [attribute,entry]of Object.entries(record.specs))source.specs[bundle.attributes[attribute].source]=entry.source;
      const localized=i18n.product(source);
      assert.equal(Object.keys(localized.specs).length,Object.keys(source.specs).length,id+' lost a specification');
      for(const text of [localized.name,localized.description,localized.longDescription,localized.warranty,...Object.keys(localized.specs),...Object.values(localized.specs)])assert.ok(!/[\u10a0-\u10ff]/.test(text||''),id+' has untranslated text');
      for(const code of source.name.match(/\b[A-Z]{1,7}(?:[-.][A-Z0-9]+)+\b/g)||[])assert.ok(localized.name.includes(code),id+' changed model '+code);
    }
  }
});
