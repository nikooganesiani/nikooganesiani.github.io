const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('An open storefront starts and ends a scheduled campaign without refetching or compounding discounts',()=>{
  let now=Date.parse('2026-11-10T12:00:00+04:00');
  const timers=new Map();let serial=0;const events=[];const listeners={};const rows={innerHTML:'',querySelectorAll:()=>[]};
  const window={CATALOG_STRUCTURE:{},escapeHTML:String,enkaI18n:{locale:'ru',t:String,setStore(){}},
    createProductCardHTML:product=>`<article>${product.id}:${product.price}</article>`,
    dispatchEvent:event=>events.push(event),safeProductImage:String};
  const document={body:{},querySelector:selector=>selector==='[data-studio-campaigns]'?rows:null,querySelectorAll:()=>[],addEventListener:(name,callback)=>listeners[name]=callback,visibilityState:'visible'};
  class Clock extends Date{static now(){return now;}}
  const context=vm.createContext({window,document,Date:Clock,structuredClone,URL,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},setTimeout:(callback,delay)=>{timers.set(++serial,{callback,delay});return serial;},clearTimeout:key=>timers.delete(key)});
  vm.runInContext(read('admin/public/store-engine.js'),context);
  vm.runInContext(read('admin/public/store-visuals.js'),context);
  vm.runInContext(read('assets/js/global/storefront-content.js'),context);
  const store={categories:[],heroes:[],company:{},campaigns:[{id:'sale',enabled:true,percent:15,startsAt:new Date(now+1000).toISOString(),endsAt:new Date(now+3000).toISOString(),title:{ka:'Sale',ru:'Кухня'},categoryIds:['kitchen'],subcategoryIds:[],productIds:[],excludeIds:[],showRow:true,template:'cards',limit:8}]};
  window.enkaStorefront.apply(store,[{id:'mixer',price:'49',oldPrice:'',categories:['kitchen']}]);
  assert.equal(rows.innerHTML,'');
  function advance(milliseconds){now+=milliseconds;const item=[...timers.entries()].at(-1);assert.ok(item);timers.delete(item[0]);item[1].callback();}
  advance(1020);assert.match(rows.innerHTML,/mixer:41/);assert.equal(events.at(-1).detail.products[0].price,'41');
  advance(2000);assert.equal(rows.innerHTML,'');assert.equal(events.at(-1).detail.products[0].price,'49');
  assert.equal(events.at(-1).detail.products[0].oldPrice,'');
  listeners.visibilitychange();assert.equal(events.at(-1).detail.products[0].price,'49');
});
