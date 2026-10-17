import { ServerError } from './firebaseAdmin';

// One atomic Redis request, with no SDK retry/analytics requests consuming
// the edge invocation's outbound-call budget before checkout begins.
const LIMIT_SCRIPT = `local used=tonumber(redis.call('GET',KEYS[1]) or '0')
local previous=tonumber(redis.call('GET',KEYS[2]) or '0')
if used+previous*tonumber(ARGV[2])>=tonumber(ARGV[1]) then return 0 end
redis.call('INCR',KEYS[1])
redis.call('PEXPIRE',KEYS[1],120000)
return 1`;
async function limitBillingRequests(uid: string, bucket: string) {
  const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!token)throw new ServerError(503,'Subscription requests are temporarily unavailable.');
  const now=Date.now(),window=Math.floor(now/60000);
  const prefix=`repday:${bucket}:rate:v2:${uid}`;
  try {
    const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',LIMIT_SCRIPT,2,`${prefix}:${window}`,`${prefix}:${window-1}`,bucket==='splits'?120:30,1-(now%60000)/60000]),signal:AbortSignal.timeout(5000)});
    const result=await response.json() as {result?:number;error?:string};
    if(!response.ok||result.error||!(result.result===0||result.result===1))throw new Error('Invalid limiter response');
    if(result.result===0)throw new ServerError(429,'Too many changes. Try again shortly.');
  } catch(error) {
    if(error instanceof ServerError)throw error;
    throw new ServerError(503,'Subscription request limit service is unavailable. Please retry.','BILLING_RATE_LIMIT_UNAVAILABLE');
  }
}
export async function billingUser(request: Request, bucket = 'billing', rateLimit = true) {
  const idToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) throw new ServerError(401, 'Sign in to manage your subscription.');
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new ServerError(503, 'Account verification is unavailable.');
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(8000) });
      break;
    } catch (error) {
      if (attempt < 2) await new Promise<void>((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }
  let user: { localId: string; email?: string; disabled?: boolean } | undefined;
  if (response?.ok) {
    user = ((await response.json()) as { users?: { localId: string; email?: string; disabled?: boolean }[] }).users?.[0];
  } else if (response && response.status === 400) {
    throw new ServerError(401, 'Could not verify your session. Sign in again.');
  }
  // Some hosted runtimes intermittently cannot reach Identity Toolkit. The
  // token-info endpoint validates the same Firebase ID token claims and gives
  // us a safe fallback for billing requests.
  if (!user) {
    try {
      const fallback = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(8000) });
      if (!fallback.ok) throw new Error('tokeninfo failed');
      const claims = await fallback.json() as { sub?: string; aud?: string; email?: string; exp?: string; iss?: string };
      const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
      const validAudience = claims.aud === projectId;
      const validIssuer = claims.iss === `https://securetoken.google.com/${projectId}`;
      const validExpiry = Number(claims.exp || 0) * 1000 > Date.now();
      if (!claims.sub || !validAudience || !validIssuer || !validExpiry) throw new Error('invalid token claims');
      user = { localId: claims.sub, email: claims.email };
    } catch {
      throw new ServerError(503, 'Firebase session verification is temporarily unavailable. Please retry.');
    }
  }
  if (!user?.localId || user.disabled || !/^[\w-]{1,128}$/.test(user.localId)) throw new ServerError(401, 'Sign in again.');
  if (rateLimit) {
    await limitBillingRequests(user.localId,bucket);
  }
  return { uid: user.localId, email: user.email || '' };
}
export async function readBillingBody(request: Request) {
  const text = await request.text();
  if (text.length > 250_000) throw new ServerError(413, 'The request is too large.');
  try { const parsed=JSON.parse(text); if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid body');return parsed; } catch { throw new ServerError(400, 'Invalid request.'); }
}
export function billingResponse(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function billingError(error: unknown, stage = 'billing') {
  if (error instanceof ServerError) return billingResponse({ error: error.message,...(error.code?{code:error.code}:{}) }, error.status);
  const kind = error instanceof Error ? error.name : 'UnknownError';
  return billingResponse({ error: 'Subscriptions are temporarily unavailable. Please retry.', code: `${stage}:${kind}` }, 503);
}
