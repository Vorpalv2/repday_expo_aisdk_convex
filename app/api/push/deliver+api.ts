import { CLAIM_TIMER, deliverySchema, deviceKey, FINISH_TIMER, pushRedis, REMOVE_EXPIRED_SUBSCRIPTION, sendRestPush, subscriptionSchema, verifyPushDelivery } from '../../../lib/server/webPush';

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 5000 || !await verifyPushDelivery(request, raw)) return new Response('Invalid signature', { status: 401 });
  let delivery;
  try { delivery = deliverySchema.parse(JSON.parse(raw)); }
  catch { return new Response('Invalid delivery', { status: 400 }); }
  const redis = pushRedis();
  if (!redis) return new Response('Unavailable', { status: 503 });
  const key = deviceKey(delivery.uid, delivery.deviceId);
  try {
    const stored = await redis.eval(CLAIM_TIMER, [key], [delivery.timerId, Date.now()]) as string | null;
    if (stored === 'busy') return new Response('Delivery in progress', { status: 503 });
    if (!stored) return new Response('Skipped', { status: 200 });
    try {
      const subscription = subscriptionSchema.parse(JSON.parse(stored));
      // Recheck after claiming: reset/skip/disable may have happened while the job started.
      if (await redis.hget(key, 'timerId') !== delivery.timerId) return new Response('Cancelled');
      const response = await sendRestPush(subscription, delivery);
      if (response.status === 404 || response.status === 410) {
        await redis.eval(REMOVE_EXPIRED_SUBSCRIPTION, [key], [stored]);
        return new Response('Subscription expired');
      }
      if (!response.ok) throw new Error('Push service rejected delivery.');
      await redis.eval(FINISH_TIMER, [key], [delivery.timerId, 'done']);
      return new Response('Sent');
    } catch {
      await redis.eval(FINISH_TIMER, [key], [delivery.timerId, 'retry']);
      return new Response('Delivery failed', { status: 503 });
    }
  } catch { return new Response('Unavailable', { status: 503 }); }
}
