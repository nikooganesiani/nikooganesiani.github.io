import test from 'node:test';
import assert from 'node:assert/strict';
import publicApi from '../catalog-api-supabase.mjs';
import {retiredStudio} from '../server/retired-studio.mjs';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
test('compatibility API reads the selected Supabase publication and never writes legacy KV',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({products:[{id:'one',name:'Product',price:'19.95',images:[],orderable:true}],_enkaPublication:{source:'supabase',id:4}});};
 const response=await publicApi.fetch(new Request('https://api.example/catalog?lang=ru'),env);
 assert.equal(response.status,200);assert.equal((await response.json()).products.length,1);assert.equal(calls[0].url,'https://example.supabase.co/rest/v1/rpc/enka_catalog?p_locale=ru');assert.equal(calls[0].options.headers.apikey,'sb_publishable_fixture');
 assert.equal((await publicApi.fetch(new Request('https://api.example/catalog',{method:'PUT',body:'{}'}),env)).status,405);assert.equal(calls.length,1);
 const feed=await publicApi.fetch(new Request('https://api.example/v1/feed.xml'),env);assert.match(await feed.text(),/<g:id>one<\/g:id>/);
});
test('catalog failures return an error instead of falling back to divergent legacy data',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);globalThis.fetch=async()=>new Response('unavailable',{status:503});
 const response=await publicApi.fetch(new Request('https://api.example/catalog'),env);assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('retired Studio redirects users, preserves protected archive reads and rejects every old write endpoint',async()=>{
 assert.equal((await retiredStudio(new Request('https://admin.example/'))).headers.get('Location'),'https://enka-erp.easylim.chatgpt.site/catalog');
 for(const path of ['/api/draft','/api/publish','/api/upload','/api/restore'])assert.equal((await retiredStudio(new Request('https://admin.example'+path,{method:'POST'}))).status,410);
 assert.equal((await retiredStudio(new Request('https://admin.example/api/catalog'))).status,410);
 let reads=0;const archived=await retiredStudio(new Request('https://admin.example/api/export'),async()=>{reads++;return Response.json({archive:true});});assert.equal(reads,1);assert.equal(archived.headers.get('X-ENKA-Legacy-ReadOnly'),'true');
});
