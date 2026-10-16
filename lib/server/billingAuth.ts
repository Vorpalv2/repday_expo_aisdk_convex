import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { ServerError } from './firebaseAdmin';
export async function billingUser(request: Request, bucket = 'billing') {
  const idToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) throw new ServerError(401, 'Sign in to manage your subscription.');
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new ServerError(503, 'Account verification is unavailable.');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new ServerError(response.status === 400 ? 401 : 503, 'Could not verify your session. Sign in again.');
  const user = ((await response.json()) as { users?: { localId: string; email?: string; disabled?: boolean }[] }).users?.[0];
  if (!user?.localId || user.disabled || !/^[\w-]{1,128}$/.test(user.localId)) throw new ServerError(401, 'Sign in again.');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new ServerError(503, 'Subscription requests are temporarily unavailable.');
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(bucket === 'splits' ? 120 : 30, '1 m'), prefix: `repday:${bucket}:rate` });
  if (!(await limiter.limit(user.localId)).success) throw new ServerError(429, 'Too many changes. Try again shortly.');
  return { uid: user.localId, email: user.email || '' };
}
export async function readBillingBody(request: Request) {
  const text = await request.text();
  if (text.length > 250_000) throw new ServerError(413, 'The request is too large.');
  try { const parsed=JSON.parse(text); if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid body');return parsed; } catch { throw new ServerError(400, 'Invalid request.'); }
}
export function billingResponse(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function billingError(error: unknown) {
  if (error instanceof ServerError) return billingResponse({ error: error.message }, error.status);
  return billingResponse({ error: 'Subscriptions are temporarily unavailable. Please retry.' }, 503);
}
