import { authorizePush, deviceIdSchema, deviceKey, pushConfig, pushRedis, readPushBody, subscriptionSchema, SUBSCRIPTION_TTL } from '../../../lib/server/webPush';
import { z } from 'zod';

export async function POST(request: Request) {
  const uid = await authorizePush(request);
  if (uid instanceof Response) return uid;
  if (!pushConfig()) return Response.json({ error: 'Rest alerts are not configured yet.' }, { status: 503 });
  let input: unknown;
  try { input = await readPushBody(request); }
  catch { return Response.json({ error: 'Could not read this browser notification subscription.' }, { status: 400 }); }
  const parsed = z.object({ deviceId: deviceIdSchema, subscription: subscriptionSchema }).safeParse(input);
  if (!parsed.success) {
    // Return field names only, never the endpoint capability URL, keys or token.
    const fields = [...new Set(parsed.error.issues.map(issue => issue.path.join('.')))];
    const unsupportedService = fields.includes('subscription.endpoint');
    return Response.json({
      error: unsupportedService
        ? 'This browser’s notification service is not supported. Try Chrome on Android, or Repday added to your iPhone Home Screen.'
        : 'This browser returned an invalid notification subscription. Try enabling alerts again in a supported browser.',
      code: unsupportedService ? 'unsupported_push_service' : 'invalid_subscription',
      fields,
    }, { status: 400 });
  }
  const body = parsed.data;
  try {
    const redis = pushRedis()!;
    const key = deviceKey(uid, body.deviceId);
    await redis.hset(key, { subscription: JSON.stringify(body.subscription) });
    await redis.expire(key, SUBSCRIPTION_TTL);
    return Response.json({ ok: true });
  } catch { return Response.json({ error: 'Could not save rest alerts. Please retry.' }, { status: 503 }); }
}

export async function DELETE(request: Request) {
  const uid = await authorizePush(request);
  if (uid instanceof Response) return uid;
  let body;
  try { body = z.object({ deviceId: deviceIdSchema }).parse(await readPushBody(request)); }
  catch { return Response.json({ error: 'Invalid device.' }, { status: 400 }); }
  try {
    await pushRedis()!.del(deviceKey(uid, body.deviceId));
    return Response.json({ ok: true });
  } catch { return Response.json({ error: 'Could not turn off rest alerts. Please retry.' }, { status: 503 }); }
}
