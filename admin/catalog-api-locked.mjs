import legacy from './server/legacy-catalog-api.mjs';
import publishedApi from './catalog-api-v2.mjs';
export default { async fetch(request,env,ctx) {
 if (!['GET','HEAD','OPTIONS'].includes(request.method)) return Response.json({error:'Изменяйте каталог через новую панель ENKA Studio.'},{status:405,headers:{Allow:'GET, HEAD, OPTIONS','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
 if (request.method==='OPTIONS') return new Response(null,{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}});
 const url = new URL(request.url);
 if (['/catalog', '/v1/feed.xml'].includes(url.pathname)) return publishedApi.fetch(request,env);
 const response=await legacy.fetch(request.method==='HEAD'?new Request(request,{method:'GET'}):request,env,ctx);
 return request.method==='HEAD'?new Response(null,response):response;
}};
