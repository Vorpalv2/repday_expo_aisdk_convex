import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { Client, Receiver } from '@upstash/qstash';
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { z } from 'zod';

export const deviceIdSchema = z.string().uuid();
const base64url = /^[A-Za-z0-9_-]+$/;
// Browser serializers can include padding or use the standard Base64 alphabet.
// Normalize equivalent encodings before checking the Web Push key sizes.
const pushKey = z.string().trim().max(128).regex(/^[A-Za-z0-9+/_-]+={0,2}$/)
  .transform(value => value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
export function isPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && (
      url.hostname === 'fcm.googleapis.com' ||
      url.hostname === 'updates.push.services.mozilla.com' ||
      url.hostname.endsWith('.push.apple.com') ||
      url.hostname.endsWith('.notify.windows.com')
    );
  } catch { return false; }
}
export const subscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(isPushEndpoint, 'Unsupported push endpoint.'),
  expirationTime: z.number().nullable().default(null),
  keys: z.object({
    p256dh: pushKey.pipe(z.string().length(87).regex(base64url).startsWith('B')),
    auth: pushKey.pipe(z.string().length(22).regex(base64url)),
  }),
});
export const timerSchema = z.object({
  deviceId: deviceIdSchema,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  deadline: z.number().int().positive().nullable(),
});
export const deliverySchema = z.object({
  uid: z.string().min(1).max(128), deviceId: deviceIdSchema,
  timerId: z.string().uuid(), deadline: z.number().int().positive(),
});
export type Delivery = z.infer<typeof deliverySchema>;
export const deviceKey = (uid: string, deviceId: string) => `repday:push:${uid}:${deviceId}`;
export const SUBSCRIPTION_TTL = 60 * 60 * 24 * 90;
export const ALERT_TTL_SECONDS = 60;

// A stale schedule/cancel request must never overwrite a newer timer.
export const UPDATE_TIMER = `
if redis.call('HEXISTS', KEYS[1], 'subscription') == 0 then return -1 end
local previous = tonumber(redis.call('HGET', KEYS[1], 'revision') or '0')
if tonumber(ARGV[1]) <= previous then return 0 end
redis.call('HSET', KEYS[1], 'revision', ARGV[1], 'timerId', ARGV[2], 'deadline', ARGV[3])
redis.call('HDEL', KEYS[1], 'delivered', 'lease')
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1`;
// Fence duplicate queue deliveries; the lease allows transient failures to retry.
export const CLAIM_TIMER = `
if redis.call('HGET', KEYS[1], 'timerId') ~= ARGV[1] then return nil end
if redis.call('HGET', KEYS[1], 'delivered') == ARGV[1] then return nil end
local deadline = tonumber(redis.call('HGET', KEYS[1], 'deadline') or '0')
local now = tonumber(ARGV[2])
if deadline > now or deadline < now - 60000 then return nil end
if tonumber(redis.call('HGET', KEYS[1], 'lease') or '0') > now then return 'busy' end
redis.call('HSET', KEYS[1], 'lease', now + 15000)
return redis.call('HGET', KEYS[1], 'subscription')`;
export const FINISH_TIMER = `
if redis.call('HGET', KEYS[1], 'timerId') == ARGV[1] then
 redis.call('HDEL', KEYS[1], 'lease')
 if ARGV[2] == 'done' then redis.call('HSET', KEYS[1], 'delivered', ARGV[1]) end
end
return 1`;
export const REMOVE_EXPIRED_SUBSCRIPTION = `
if redis.call('HGET', KEYS[1], 'subscription') == ARGV[1] then
 redis.call('DEL', KEYS[1])
end
return 1`;
export const INVALIDATE_TIMER = `
if redis.call('HGET', KEYS[1], 'timerId') == ARGV[1] then
 redis.call('HSET', KEYS[1], 'timerId', '')
end
return 1`;

export function pushConfig() {
  const origin = process.env.WEB_PUSH_ORIGIN;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  if (!origin || !publicKey || !privateKey || !subject || !process.env.QSTASH_TOKEN ||
      !process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY ||
      !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  } catch { return null; }
  return { origin, publicKey, privateKey, subject };
}
export function pushRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
}

export async function authorizePush(request: Request): Promise<string | Response> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return Response.json({ error: 'Sign in to enable rest alerts.' }, { status: 401 });
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const redis = pushRedis();
  if (!apiKey || !redis) return Response.json({ error: 'Rest alerts are not configured yet.' }, { status: 503 });
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return Response.json({ error: 'Could not verify your session. Sign in again.' }, { status: response.status === 400 ? 401 : 503 });
    const data = await response.json() as { users?: { localId?: string; disabled?: boolean }[] };
    const user = data.users?.[0];
    if (!user?.localId || user.disabled) return Response.json({ error: 'Sign in again to enable alerts.' }, { status: 401 });
    const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'repday:push:limit' });
    if (!(await limiter.limit(user.localId)).success) return Response.json({ error: 'Too many alert changes. Try again shortly.' }, { status: 429 });
    return user.localId;
  } catch {
    return Response.json({ error: 'Rest alerts are temporarily unavailable.' }, { status: 503 });
  }
}
export async function readPushBody(request: Request) {
  const body = await request.text();
  if (body.length > 5000) throw new Error('Request is too large.');
  return JSON.parse(body) as unknown;
}

export async function enqueueRestAlert(delivery: Delivery) {
  const config = pushConfig();
  if (!config) throw new Error('Push is not configured.');
  const queue = new Client({ token: process.env.QSTASH_TOKEN! });
  await queue.publishJSON({
    url: `${config.origin}/api/push/deliver`, body: delivery,
    notBefore: Math.ceil(delivery.deadline / 1000), retries: 2,
    deduplicationId: delivery.timerId,
  });
}
export async function verifyPushDelivery(request: Request, body: string) {
  const config = pushConfig();
  const signature = request.headers.get('upstash-signature');
  if (!config || !signature) return false;
  try {
    return await new Receiver({ currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!, nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY! })
      .verify({ signature, body, url: `${config.origin}/api/push/deliver` });
  } catch { return false; }
}

export async function sendRestPush(subscription: z.infer<typeof subscriptionSchema>, delivery: Delivery) {
  const config = pushConfig();
  if (!config) throw new Error('Push is not configured.');
  const payload = await buildPushPayload({
    data: JSON.stringify({ type: 'rest-complete', timerId: delivery.timerId, deadline: delivery.deadline,
      title: 'Rest complete', body: 'Time for your next set.', url: '/' }),
    options: { ttl: ALERT_TTL_SECONDS, urgency: 'high', topic: 'repday-rest' },
  }, subscription, { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey });
  // Endpoints are allowlisted above; never follow redirects into an arbitrary network.
  return fetch(subscription.endpoint, { ...payload, redirect: 'error', signal: AbortSignal.timeout(8000) });
}
