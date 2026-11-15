import dictionary from './studio-translations.js';

export const STUDIO_LOCALES = ['ru','en','ka'];
const storageKey='enka-studio-language';
let locale='ru';
try { const saved=globalThis.localStorage?.getItem(storageKey);if(STUDIO_LOCALES.includes(saved))locale=saved; } catch {}
export const getLocale=()=>locale;
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Only source literals are translated. Interpolated catalog data is never passed here.
const terms=Object.keys(dictionary).sort((a,b)=>b.length-a.length);
const originals=new Map(Object.entries(dictionary).flatMap(([source,values])=>Object.values(values).map(value=>[value,source])));
const pattern=new RegExp('(?<![\\p{L}_])(?:'+terms.map(key=>escapeRegex(key)+(/[\p{L}]$/u.test(key)?'(?![\\p{L}_])':'')).join('|')+')','gu');
export function t(source) {
  const input=String(source ?? '');
  const value=originals.get(input) || input;
  if(locale==='ru')return value;
  if(dictionary[value])return dictionary[value][locale];
  return value.replace(pattern,key=>dictionary[key][locale]);
}
// Translate each literal segment separately so product names, input values and site
// translations remain byte-for-byte identical, even when they match a UI label.
export function ui(strings,...values) {
  return strings.reduce((result,part,index)=>result+t(part)+(index<values.length?values[index]:''),'');
}
const bindings=[];
export function registerStatic(root) {
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())) {
    if(node.parentElement?.closest('script,style,textarea,[translate="no"]'))continue;
    if(/[А-Яа-яЁё]/.test(node.nodeValue))bindings.push({node,source:node.nodeValue});
  }
  root.querySelectorAll('[aria-label],[placeholder],[title],[alt]').forEach(element=>{
    for(const attribute of ['aria-label','placeholder','title','alt']){
      const source=element.getAttribute(attribute);if(source && /[А-Яа-яЁё]/.test(source))bindings.push({node:element,attribute,source});
    }
  });
  applyStatic();
}
function applyStatic() {
  for(let i=bindings.length-1;i>=0;i--){
    const {node,attribute,source}=bindings[i];
    if(!node.isConnected){bindings.splice(i,1);continue;}
    if(attribute)node.setAttribute(attribute,t(source));else node.nodeValue=t(source);
  }
}
export function setStudioLocale(next) {
  if(!STUDIO_LOCALES.includes(next))return false;
  locale=next;try{globalThis.localStorage?.setItem(storageKey,next);}catch{}
  if(typeof document!=='undefined'){
    document.documentElement.lang=next;applyStatic();
    const select=document.querySelector('#studio-language');if(select)select.value=next;
    window.dispatchEvent(new CustomEvent('studio:language-change'));
  }
  return true;
}
export function initStudioLanguage() {
  document.documentElement.lang=locale;registerStatic(document);
  const select=document.querySelector('#studio-language');
  select.value=locale;select.addEventListener('change',()=>setStudioLocale(select.value));
}
