// Compatibility endpoint for existing feeds and consumers. Supabase is the only source.
import { feed } from './catalog-api-v2.mjs';
export default {async fetch(request,env){
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=30'};
 if(request.method==='OPTIONS')return new Response(null,{headers});
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Catalog editing is in ENKA ERP'},{status:405,headers:{...headers,Allow:'GET, HEAD, OPTIONS'}});
 const url=new URL(request.url);
 if(!['/catalog','/v1/feed.xml'].includes(url.pathname))return new Response('Not found',{status:404,headers});
 try{
  if(!env.SUPABASE_URL?.startsWith('https://')||!env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))throw Error('Configuration required');
  const locale=['ru','en'].includes(url.searchParams.get('lang'))?url.searchParams.get('lang'):'ka';
  const response=await fetch(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/rpc/enka_catalog?p_locale='+locale,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Error('Catalog unavailable');
  const catalog=await response.json();
  if(!Array.isArray(catalog.products)||catalog._enkaPublication?.source!=='supabase')throw Error('Invalid publication');
  const xml=url.pathname==='/v1/feed.xml';
  const body=xml?feed(catalog,(env.STOREFRONT_BASE||'https://enkaelectronics.com.ge').replace(/\/$/,'')):JSON.stringify(catalog);
  return new Response(request.method==='HEAD'?null:body,{headers:{...headers,'Content-Type':xml?'application/xml; charset=utf-8':'application/json; charset=utf-8','ETag':`"catalog-${catalog._enkaPublication.id}-${locale}"`}});
 }catch{return Response.json({error:'Catalog temporarily unavailable'},{status:503,headers:{...headers,'Cache-Control':'no-store'}});}
}};
