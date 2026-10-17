import { Redis } from '@upstash/redis';
import { readDocument } from './firebaseAdmin';

const PAID_CACHE_SECONDS = 4 * 60 * 60;
const OTHER_CACHE_SECONDS = 5 * 60;
const keyFor = (uid: string) => `repday:billing:account:v1:${uid}`;
let client: Redis | null = null;

function redis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return client ??= new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, retry:{retries:0},signal:()=>AbortSignal.timeout(2000),enableAutoPipelining:false,enableTelemetry:false });
}

export function billingCacheSeconds(account: Record<string, any> | null, now = Date.now()) {
  const paidUntil = account?.paidUntil;
  if (account?.manualPlusAccess === true || typeof paidUntil !== 'number' || paidUntil <= now) return OTHER_CACHE_SECONDS;
  return Math.max(1, Math.min(PAID_CACHE_SECONDS, Math.ceil((paidUntil - now) / 1000)));
}

export async function readBillingAccount(uid: string, fresh = false): Promise<Record<string, any> | null> {
  const cache = redis();
  if (cache && !fresh) {
    try {
      const hit = await cache.get<{ account: Record<string, any> | null }>(keyFor(uid));
      if (hit && Object.hasOwn(hit, 'account')) return hit.account;
    } catch { /* Firestore remains authoritative if cache is unavailable. */ }
  }
  const account = await readDocument(`billingAccounts/${uid}`);
  if (cache) {
    try { await cache.set(keyFor(uid), { account }, { ex: billingCacheSeconds(account) }); }
    catch { /* A cache failure must not block an authoritative read. */ }
  }
  return account;
}

export async function invalidateBillingAccount(uid: string) {
  const cache = redis();
  if (cache) {
    try { await cache.del(keyFor(uid)); }
    catch { /* The entry also expires automatically. */ }
  }
}
