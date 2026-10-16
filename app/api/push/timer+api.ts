import { authorizePush, deviceKey, enqueueRestAlert, INVALIDATE_TIMER, pushConfig, pushRedis, readPushBody, SUBSCRIPTION_TTL, timerSchema, UPDATE_TIMER } from '../../../lib/server/webPush';

export async function POST(request: Request) {
  const uid = await authorizePush(request);
  if (uid instanceof Response) return uid;
  let body;
  try { body = timerSchema.parse(await readPushBody(request)); }
  catch { return Response.json({ error: 'Invalid rest timer.' }, { status: 400 }); }
  const now = Date.now();
  if (body.revision > now + 60000 || (body.deadline !== null && body.deadline > now + 30 * 60 * 1000)) {
    return Response.json({ error: 'Rest timers must finish within 30 minutes. Check your device clock.' }, { status: 400 });
  }
  if (body.deadline && body.deadline > now && !pushConfig()) return Response.json({ error: 'Rest alerts are not configured yet.' }, { status: 503 });
  const redis = pushRedis()!;
  const key = deviceKey(uid, body.deviceId);
  const timerId = crypto.randomUUID();
  const deadline = body.deadline && body.deadline > now ? body.deadline : 0;
  try {
    const result = await redis.eval(UPDATE_TIMER, [key], [body.revision, deadline ? timerId : '', deadline, SUBSCRIPTION_TTL]) as number;
    if (result === -1) return Response.json({ error: 'Turn rest alerts off, then enable them again on this device.' }, { status: 409 });
    if (result === 0 || !deadline) return Response.json({ ok: true, scheduled: false });
    try { await enqueueRestAlert({ uid, deviceId: body.deviceId, timerId, deadline }); }
    catch {
      await redis.eval(INVALIDATE_TIMER, [key], [timerId]);
      return Response.json({ error: 'Could not schedule this rest alert. Keep Repday open.' }, { status: 503 });
    }
    return Response.json({ ok: true, scheduled: true });
  } catch { return Response.json({ error: 'Rest alerts are temporarily unavailable. Keep Repday open.' }, { status: 503 }); }
}
