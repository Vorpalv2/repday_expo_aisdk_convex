/* This worker handles notifications only; it does not cache account pages or APIs. */
let pendingTasks = Promise.resolve();
function serial(task) {
  const pending = pendingTasks.catch(() => {}).then(task);
  pendingTasks = pending;
  return pending;
}
const STATE_CACHE = 'repday-rest-alert-state-v1';
const STATE_URL = new URL('/__repday-rest-alert-state', self.location.origin).href;
async function readState() {
  const response = await (await caches.open(STATE_CACHE)).match(STATE_URL);
  return response ? response.json() : { enabled: false, deadline: null };
}
async function writeState(state) {
  await (await caches.open(STATE_CACHE)).put(STATE_URL, new Response(JSON.stringify(state)));
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'REST_TIMER_STATE') return;
  event.waitUntil(serial(async () => {
    try {
      const previous = await readState();
      await writeState({ ...previous, enabled: event.data.enabled === true, deadline: event.data.deadline });
      if (!event.data.enabled || previous.deadline !== event.data.deadline) {
        const notifications = await self.registration.getNotifications({ tag: 'repday-rest' });
        notifications.forEach(notification => notification.close());
      }
      event.ports[0]?.postMessage({ ok: true });
    } catch { event.ports[0]?.postMessage({ ok: false }); }
  }));
});
self.addEventListener('push', event => {
  event.waitUntil(serial(async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (payload?.type !== 'rest-complete' || typeof payload.timerId !== 'string' || !Number.isFinite(payload.deadline)) return;
    const now = Date.now();
    if (payload.deadline > now + 2000 || payload.deadline < now - 60000) return;
    const state = await readState();
    if (!state.enabled || state.deadline !== payload.deadline || state.lastTimerId === payload.timerId) return;
    await self.registration.showNotification('Rest complete', {
      body: 'Time for your next set.', icon: '/icons/repday-192.png', badge: '/icons/repday-192.png',
      tag: 'repday-rest', data: { url: '/' }, timestamp: payload.deadline,
    });
    await writeState({ ...state, lastTimerId: payload.timerId });
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(serial(async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.focus();
    return self.clients.openWindow('/');
  }));
});
