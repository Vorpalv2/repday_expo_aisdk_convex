import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { after, test } from 'node:test';
import { deviceKey, isPushEndpoint, pushRedis, subscriptionSchema, verifyPushDelivery } from '../lib/server/webPush';
import { POST as subscribe, DELETE as unsubscribe } from '../app/api/push/subscription+api';
import { POST as schedule } from '../app/api/push/timer+api';
import { POST as deliver } from '../app/api/push/deliver+api';

try { process.loadEnvFile('.env.local'); } catch {}
const integration = process.env.RUN_PUSH_REDIS_TESTS === '1' && !!process.env.UPSTASH_REDIS_REST_URL;
const uid = `qa-push-${randomUUID()}`;
const deviceId = randomUUID();
const redis = integration ? pushRedis()! : null;
const realFetch = globalThis.fetch;
let published: { timerId: string; deadline: number; uid: string; deviceId: string }[] = [];
let pushCount = 0;
let pushFails = false;
let queueFails = false;
const vapid = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
process.env.WEB_PUSH_ORIGIN = 'https://repday.test';
process.env.WEB_PUSH_SUBJECT = 'mailto:qa@example.com';
process.env.WEB_PUSH_PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.from(vapid.x!, 'base64url'), Buffer.from(vapid.y!, 'base64url')]).toString('base64url');
process.env.WEB_PUSH_PRIVATE_KEY = vapid.d!;
// Keep publishing mocked even when local configuration selects a regional QStash URL.
process.env.QSTASH_URL = 'https://qstash.upstash.io';
process.env.QSTASH_TOKEN = 'test-token';
process.env.QSTASH_CURRENT_SIGNING_KEY = 'test-current-signing-key';
process.env.QSTASH_NEXT_SIGNING_KEY = 'test-next-signing-key';
process.env.EXPO_PUBLIC_FIREBASE_API_KEY = 'test-firebase-key';
const receiver = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/repday-qa', expirationTime: null,
  keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.from(receiver.x!, 'base64url'), Buffer.from(receiver.y!, 'base64url')]).toString('base64url'), auth: randomBytes(16).toString('base64url') },
};

globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://identitytoolkit.googleapis.com/')) return Response.json({ users: [{ localId: uid }] });
  if (url.startsWith('https://qstash.upstash.io/')) {
    if (queueFails) return Response.json({ error: 'Unavailable' }, { status: 400 });
    published.push(JSON.parse(String(init?.body)));
    return Response.json({ messageId: randomUUID() });
  }
  if (url === subscription.endpoint) {
    pushCount++;
    assert.equal(new Headers(init?.headers).get('content-encoding'), 'aes128gcm');
    assert.match(new Headers(init?.headers).get('authorization')!, /^vapid t=/);
    assert.equal(init?.redirect, 'error');
    return new Response(null, { status: pushFails ? 503 : 201 });
  }
  return realFetch(input, init);
};
after(async () => {
  globalThis.fetch = realFetch;
  if (redis) await redis.del(deviceKey(uid, deviceId));
});
function request(path: string, body: unknown) {
  return new Request(`https://repday.test${path}`, { method: 'POST', headers: { Authorization: 'Bearer test-id-token', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
function signed(body: string, key = process.env.QSTASH_CURRENT_SIGNING_KEY!, subject = 'https://repday.test/api/push/deliver', expires = Math.floor(Date.now() / 1000) + 60) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'Upstash', sub: subject, exp: expires, nbf: Math.floor(Date.now() / 1000) - 1, body: createHash('sha256').update(body).digest('base64url') })).toString('base64url');
  const signature = createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url');
  return new Request(subject, { method: 'POST', headers: { 'upstash-signature': `${header}.${payload}.${signature}` }, body });
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('rejects private-network, credentialled, redirected-looking and spoofed push endpoints', () => {
  for (const url of ['http://fcm.googleapis.com/x','https://localhost/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x']) assert.equal(isPushEndpoint(url), false, url);
  for (const url of ['https://fcm.googleapis.com/fcm/send/x','https://web.push.apple.com/x','https://updates.push.services.mozilla.com/x']) assert.equal(isPushEndpoint(url), true, url);
  assert.equal(subscriptionSchema.safeParse(subscription).success, true);
  assert.equal(subscriptionSchema.safeParse({ ...subscription, keys: { ...subscription.keys, auth: 'bad' } }).success, false);
});
test('accepts equivalent padded and standard Base64 subscription keys', () => {
  const padded = { ...subscription, keys: {
    p256dh: Buffer.from(subscription.keys.p256dh, 'base64url').toString('base64'),
    auth: Buffer.from(subscription.keys.auth, 'base64url').toString('base64'),
  } };
  assert.equal(padded.keys.p256dh.length, 88);
  assert.equal(padded.keys.auth.length, 24);
  assert.deepEqual(subscriptionSchema.parse(padded), subscription);
  assert.deepEqual(subscriptionSchema.parse({ ...subscription, keys: {
    p256dh: subscription.keys.p256dh + '=', auth: subscription.keys.auth + '==',
  } }), subscription);
  assert.equal(subscriptionSchema.safeParse({ ...subscription, keys: { ...subscription.keys, auth: 'A'.repeat(24) } }).success, false);
});
test('verifies signed delivery, key rotation, body hash, destination and expiry', async () => {
  const body = JSON.stringify({ example: 1 });
  assert.equal(await verifyPushDelivery(signed(body), body), true);
  assert.equal(await verifyPushDelivery(signed(body, process.env.QSTASH_NEXT_SIGNING_KEY), body), true);
  assert.equal(await verifyPushDelivery(signed(body), '{}'), false);
  assert.equal(await verifyPushDelivery(signed(body, 'wrong'), body), false);
  assert.equal(await verifyPushDelivery(signed(body, undefined, undefined, Math.floor(Date.now() / 1000) - 1), body), false);
  assert.equal(await verifyPushDelivery(signed(body, undefined, 'https://evil.test/api/push/deliver'), body), false);
});
test('unauthenticated requests and unsigned deliveries are rejected', async () => {
  assert.equal((await schedule(new Request('https://repday.test/api/push/timer', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal((await deliver(new Request('https://repday.test/api/push/deliver', { method: 'POST', body: '{}' }))).status, 401);
});

test('real Redis: scheduling, cancellation, duplicates, retry and unsubscribe', { skip: !integration }, async () => {
  assert.equal((await subscribe(request('/api/push/subscription', { deviceId, subscription: { ...subscription, keys: { p256dh: subscription.keys.p256dh + '=', auth: subscription.keys.auth + '==' } } }))).status, 200);
  let revision = Date.now();
  async function start() {
    const deadline = Date.now() + 150;
    const response = await schedule(request('/api/push/timer', { deviceId, revision: ++revision, deadline }));
    assert.equal(response.status, 200, await response.text());
    return published.at(-1)!;
  }
  async function send(job: typeof published[number]) { const body = JSON.stringify(job); return deliver(signed(body)); }
  const first = await start(); await wait(170);
  assert.equal((await send(first)).status, 200); assert.equal(pushCount, 1);
  assert.equal((await send(first)).status, 200); assert.equal(pushCount, 1, 'duplicate job should not send again');
  const cancelled = await start();
  assert.equal((await schedule(request('/api/push/timer', { deviceId, revision: ++revision, deadline: null }))).status, 200);
  await wait(170); await send(cancelled); assert.equal(pushCount, 1, 'cancelled job must not send');
  const staleRevision = revision;
  const replaced = await start(); const replacement = await start();
  await schedule(request('/api/push/timer', { deviceId, revision: staleRevision, deadline: null }));
  await wait(170); await send(replaced); assert.equal(pushCount, 1);
  await send(replacement); assert.equal(pushCount, 2, 'older cancellation must not erase replacement');
  const retry = await start(); await wait(170); pushFails = true;
  assert.equal((await send(retry)).status, 503); pushFails = false;
  assert.equal((await send(retry)).status, 200); assert.equal(pushCount, 4, 'transient failure must release delivery lease');
  const expired = { ...retry, timerId: randomUUID(), deadline: Date.now() - 61000 };
  const key = deviceKey(uid, deviceId);
  await redis!.hset(key, { timerId: expired.timerId, deadline: expired.deadline });
  await send(expired); assert.equal(pushCount, 4, 'late alert should be discarded');
  queueFails = true;
  assert.equal((await schedule(request('/api/push/timer', { deviceId, revision: ++revision, deadline: Date.now() + 10000 }))).status, 503);
  assert.equal(await redis!.hget(key, 'timerId'), '', 'failed publish must not remain active'); queueFails = false;
  const removed = await start();
  assert.equal((await unsubscribe(request('/api/push/subscription', { deviceId }))).status, 200);
  await wait(170); await send(removed); assert.equal(pushCount, 4);
  assert.equal((await schedule(request('/api/push/timer', { deviceId, revision: ++revision, deadline: Date.now() + 1000 }))).status, 409);
});

test('service worker suppresses stale/cancelled/duplicate pushes and opens the app', async () => {
  const listeners: Record<string, (event: any) => void> = {};
  let cached: Response | undefined;
  const shown: unknown[] = [];
  let focused = false;
  const worker = { location: { origin: 'https://repday.test' }, addEventListener: (name: string, callback: (event: any) => void) => { listeners[name] = callback; },
    registration: { getNotifications: async () => [], showNotification: async (...args: unknown[]) => { shown.push(args); } },
    clients: { claim: async () => {}, matchAll: async () => [{ url: 'https://repday.test/', focus: async () => { focused = true; } }], openWindow: async () => {} }, skipWaiting: async () => {} };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self: worker, URL, Response, Date, Number, caches: { open: async () => ({ match: async () => cached?.clone(), put: async (_: string, response: Response) => { cached = response; } }) } });
  async function dispatch(type: string, data: unknown) {
    let pending: Promise<unknown> | undefined;
    listeners[type]({ data: type === 'push' ? { json: () => data } : data, ports: [{ postMessage() {} }], notification: { close() {} }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
  }
  const deadline = Date.now() - 100;
  const payload = { type: 'rest-complete', timerId: randomUUID(), deadline };
  await dispatch('message', { type: 'REST_TIMER_STATE', enabled: true, deadline });
  await dispatch('push', payload); assert.equal(shown.length, 1);
  await dispatch('push', payload); assert.equal(shown.length, 1);
  await dispatch('message', { type: 'REST_TIMER_STATE', enabled: true, deadline: deadline + 10000 });
  await dispatch('push', { ...payload, timerId: randomUUID() }); assert.equal(shown.length, 1);
  await dispatch('message', { type: 'REST_TIMER_STATE', enabled: false, deadline });
  await dispatch('push', { ...payload, timerId: randomUUID() }); assert.equal(shown.length, 1);
  await dispatch('message', { type: 'REST_TIMER_STATE', enabled: true, deadline: Date.now() - 61000 });
  await dispatch('push', { ...payload, timerId: randomUUID(), deadline: Date.now() - 61000 }); assert.equal(shown.length, 1);
  await dispatch('notificationclick', {}); assert.equal(focused, true);
});
