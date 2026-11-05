import { createRemoteJWKSet, jwtVerify } from 'jose';
const sets = new Map();

export async function verifyAccessToken(token, issuer, audience, keys) {
  const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email'] });
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) throw Error('Invalid email claim');
  return { identity: payload.email };
}

export async function authenticate(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return { status: 503, error: 'Сначала настройте Cloudflare Access для этой панели.' };
  let domain;
  try {
    domain = new URL(env.ACCESS_TEAM_DOMAIN);
    if (domain.protocol !== 'https:' || !domain.hostname.endsWith('.cloudflareaccess.com') || domain.username || domain.password || domain.port || domain.pathname !== '/') throw Error();
  } catch { return { status: 503, error: 'Проверьте настройки Cloudflare Access.' }; }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { status: 401, error: 'Войдите через Cloudflare Access.' };
  try {
    const issuer = domain.origin;
    if (!sets.has(issuer)) sets.set(issuer, createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)));
    return await verifyAccessToken(token, issuer, env.ACCESS_AUD, sets.get(issuer));
  } catch { return { status: 401, error: 'Сессия истекла. Войдите в панель снова.' }; }
}
