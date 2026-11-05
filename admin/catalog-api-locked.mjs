import legacy from './server/legacy-catalog-api.mjs';
import { readPublishedCatalog } from './server/published.mjs';
export default { async fetch(request,env,ctx) {
 if (!['GET','HEAD','OPTIONS'].includes(request.method)) return Response.json({error:'Изменяйте каталог через новую панель ENKA Studio.'},{status:405,headers:{Allow:'GET, HEAD, OPTIONS','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
 if (request.method==='OPTIONS') return new Response(null,{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}});
 const url = new URL(request.url);
 if (url.pathname === '/catalog' && ['ru', 'en'].includes(url.searchParams.get('lang'))) {
  try {
   const catalog = await readPublishedCatalog(key => env.CATALOG_KV.get(key, {type:'json'}), url.searchParams.get('lang'));
   if (!Array.isArray(catalog.products)) throw Error('Invalid catalog');
   return new Response(request.method === 'HEAD' ? null : JSON.stringify(catalog), {headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=30','X-Content-Type-Options':'nosniff'}});
  } catch { return Response.json({error:'Catalog unavailable'}, {status:503,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}}); }
 }
 const response=await legacy.fetch(request.method==='HEAD'?new Request(request,{method:'GET'}):request,env,ctx);
 return request.method==='HEAD'?new Response(null,response):response;
}};
