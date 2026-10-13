import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type AIFeature = 'coach' | 'workout-import';

const firebaseApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

const limiters: Record<AIFeature, Ratelimit> | null = redis
  ? {
      // 10 coach messages per user per rolling minute.
      coach: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 m'),
        prefix: 'repday:ai:coach',
      }),
      // 5 workout imports per user per rolling hour.
      'workout-import': new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'repday:ai:workout-import',
      }),
    }
  : null;

export async function checkAIRequestLimit(request: Request, feature: AIFeature) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!firebaseApiKey) {
    console.error('[AI rate limit] Firebase web API key is not configured.');
    return Response.json({ error: 'AI requests are temporarily unavailable.' }, { status: 503 });
  }
  if (!token) {
    return Response.json({ error: 'Sign in to use AI features.' }, { status: 401 });
  }

  let uid: string;
  let firebaseResponse: Response;
  try {
    firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      },
    );
  } catch (error) {
    console.error('[AI rate limit] Firebase token verification request failed.', error);
    return Response.json({ error: 'AI requests are temporarily unavailable.' }, { status: 503 });
  }

  if (!firebaseResponse.ok) {
    if (firebaseResponse.status === 400 || firebaseResponse.status === 401) {
      return Response.json({ error: 'Your session has expired. Sign in again.' }, { status: 401 });
    }
    console.error('[AI rate limit] Firebase token verification failed.', firebaseResponse.status);
    return Response.json({ error: 'AI requests are temporarily unavailable.' }, { status: 503 });
  }

  let verified: { users?: Array<{ localId?: string; disabled?: boolean }> };
  try {
    verified = await firebaseResponse.json();
  } catch {
    console.error('[AI rate limit] Firebase returned an unreadable token verification response.');
    return Response.json({ error: 'AI requests are temporarily unavailable.' }, { status: 503 });
  }
  const verifiedUser = verified.users?.[0];
  if (!verifiedUser?.localId || verifiedUser.disabled) {
    return Response.json({ error: 'Your session has expired. Sign in again.' }, { status: 401 });
  }
  uid = verifiedUser.localId;

  if (!limiters) {
    console.error('[AI rate limit] Upstash Redis is not configured.');
    return Response.json({ error: 'AI requests are temporarily unavailable.' }, { status: 503 });
  }

  try {
    const result = await limiters[feature].limit(uid);
    if (result.success) return null;

    const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1_000));
    return Response.json(
      { error: 'You’ve reached the AI request limit. Please try again shortly.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(Math.ceil(result.reset / 1_000)),
        },
      },
    );
  } catch (error) {
    console.error('[AI rate limit] Upstash request failed.', error);
    // Fail closed so a Redis outage cannot turn into unmetered AI usage.
    return Response.json({ error: 'AI requests are temporarily unavailable.' }, { status: 503 });
  }
}
