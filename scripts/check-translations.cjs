const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dictionary=JSON.parse(fs.readFileSync('assets/i18n/translations.json','utf8'));
const decode=s=>s.replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
function translator(locale){const window={ENKA_TRANSLATIONS:dictionary};vm.runInNewContext(fs.readFileSync('assets/js/global/i18n.js','utf8'),{window,document:{cookie:'',documentElement:{},querySelector(){},body:null},localStorage:{getItem:()=>locale},MutationObserver:class{observe(){}}});return window.enkaI18n;}
const missing=[];let pages=0;
function check(source,file,translation,exact=false){if(!/[\u10a0-\u10ff]/.test(source))return;const result=translation.t(decode(source).trim(),exact);if(/[\u10a0-\u10ff]/.test(result))missing.push({file,source:source.trim().slice(0,140)});}
function walk(dir,fn){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p,fn);else fn(p);}}
for(const locale of ['ru','en']){
 const translation=translator(locale);
 walk('_site',file=>{if(!file.endsWith('.html'))return;pages++;const stack=[];const html=fs.readFileSync(file,'utf8');for(const match of html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)){const token=match[0];if(token.startsWith('<!--'))continue;if(token.startsWith('</')){const tag=token.match(/^<\/([\w-]+)/)?.[1];const i=stack.map(x=>x.tag).lastIndexOf(tag);if(i>=0)stack.length=i;continue;}if(token.startsWith('<')){const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const skip=stack.some(x=>x.skip)||['script','style','textarea'].includes(tag)||/translate="no"|class="[^"]*\bnotranslate\b/.test(token);if(!skip)for(const a of token.matchAll(/(?:aria-label|title|alt|placeholder|data-count-label|content)="([^"]*)"/g))check(a[1],file,translation);if(!['meta','link','img','input','br','hr','source','wbr','area','base','embed'].includes(tag)&&!token.endsWith('/>'))stack.push({tag,skip});}else if(!stack.some(x=>x.skip))check(token,file,translation);}});

 walk('_site/assets/js',file=>{
  if (!file.endsWith('.js') || /(?:languages|i18n)\.js$/.test(file)) return;
  for(const match of fs.readFileSync(file,'utf8').matchAll(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g)){
   const raw=match[0]; if(!/[\u10a0-\u10ff]/.test(raw))continue;
   let value; try {value=raw[0]==='`'?raw.slice(1,-1).replace(/\$\{[^}]+\}/g,' '):vm.runInNewContext(raw);}catch{continue;}
   if(value.startsWith('input['))continue;
   if(value.includes('<')){for(const text of value.matchAll(/>([^<>]+)</g))check(text[1],file,translation);}else check(value,file,translation);
  }
 });
 const bundle=JSON.parse(fs.readFileSync('admin/translations/ru-en.json','utf8'));
 for(const [id,p]of Object.entries(bundle.translations[locale].products))for(const e of [...Object.values(p.fields),...Object.values(p.specs)]){if(/[\u10a0-\u10ff]/.test(e.text))missing.push({file:id,source:e.source});}
}
if(missing.length){console.error(JSON.stringify(missing.slice(0,25),null,2));console.error('Missing translations:',missing.length);process.exitCode=1;}else console.log('RU/EN coverage verified:',pages/2,'rendered pages and all 76 product translation records.');
