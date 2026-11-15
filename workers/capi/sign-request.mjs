// Shared by a Supabase Edge Function and local integration tests. Never ship to the browser.
export async function signedRequest(url, payload, secret) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes.encode(timestamp + '.' + body))), b => b.toString(16).padStart(2, '0')).join('');
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Enka-Timestamp': timestamp, 'X-Enka-Signature': signature }, body, signal: AbortSignal.timeout(20000) });
}
