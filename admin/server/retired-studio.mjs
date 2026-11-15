export async function retiredStudio(request,legacyRead){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const url=new URL(request.url);
 if(['GET','HEAD'].includes(request.method)&&['/api/catalog','/api/history','/api/export','/api/session'].includes(url.pathname)&&legacyRead){const response=await legacyRead(request);const archived=new Response(response.body,response);archived.headers.set('X-ENKA-Legacy-ReadOnly','true');return archived;}
 if(!['GET','HEAD'].includes(request.method)||url.pathname.startsWith('/api/'))return Response.json({error:'Studio has moved to ENKA ERP. The previous draft is retained; writing and publication are disabled.'},{status:410,headers});
 return new Response(null,{status:302,headers:{...headers,Location:'https://enka-erp.easylim.chatgpt.site/catalog'}});
}
