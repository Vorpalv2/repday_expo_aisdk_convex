import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../backend/firebase/client';
import type { RestPushController, RestPushOptions } from './restPushTypes';

const DEVICE_KEY = 'repday.push.device';
const REVISION_KEY = 'repday.push.revision';
const preferenceKey = (uid: string) => `repday.push.enabled:${uid}`;

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}
function nextRevision() {
  const revision = Math.max(Date.now(), Number(localStorage.getItem(REVISION_KEY) || 0) + 1);
  localStorage.setItem(REVISION_KEY, String(revision));
  return revision;
}
function unsupportedReason() {
  if (!window.isSecureContext) return 'Rest alerts need a secure HTTPS connection.';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone) return 'On iPhone or iPad, add Repday to your Home Screen, then open it there to enable alerts.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'This browser does not support rest notifications.';
  return '';
}
async function api(path: string, token: string, body: unknown, method = 'POST', keepalive = false) {
  const controller = new AbortController();
  const timeout = keepalive ? null : setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), signal: keepalive ? undefined : controller.signal, keepalive });
    const data = await response.json() as { error?: string; code?: string; fields?: string[] };
    if (!response.ok) {
      if (data.code === 'invalid_subscription' || data.code === 'unsupported_push_service') {
        console.warn('[Rest alerts] Subscription validation failed:', data.code, data.fields);
      }
      throw new Error(data.error || 'Could not update rest alerts.');
    }
  } finally { if (timeout) clearTimeout(timeout); }
}
function publicKeyBytes(key: string) {
  const decoded = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
async function registerWorker() {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  if (registration.active) return registration;
  return Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Rest alerts could not start. Reload and retry.')), 10000))]);
}
async function workerState(registration: ServiceWorkerRegistration, deadline: number | null, enabled: boolean) {
  const worker = registration.active;
  if (!worker) throw new Error('Rest alerts could not start. Reload and retry.');
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Could not update rest alerts. Reload and retry.')); }, 3000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout); channel.port1.close();
      if (event.data?.ok) resolve(); else reject(new Error('Could not save alert settings on this device.'));
    };
    worker.postMessage({ type: 'REST_TIMER_STATE', deadline, enabled }, [channel.port2]);
  });
}

export function useRestPush({ uid, deadline }: RestPushOptions): RestPushController {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Enable a notification when your rest ends.');
  const [config, setConfig] = useState<{ configured: boolean; publicKey: string | null } | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const tokenRef = useRef<string | null>(null);
  const deadlineRef = useRef(deadline);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const generationRef = useRef(0);
  deadlineRef.current = deadline;

  useEffect(() => {
    const reason = unsupportedReason();
    if (reason) { setStatus(reason); return; }
    const controller = new AbortController();
    fetch('/api/push', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json(); setConfig(data);
      if (!data.configured) setStatus('Rest alerts are not available yet. Keep Repday open to follow the timer.');
    }).catch(() => { if (!controller.signal.aborted) setStatus('Could not connect to rest alerts. Reload to retry.'); });
    return () => controller.abort();
  }, []);

  // Reconnect a previously enabled browser without showing a permission prompt.
  useEffect(() => {
    const generation = ++generationRef.current;
    setEnabled(false);
    if (!uid || !config?.configured || unsupportedReason()) return;
    let disposed = false;
    let cleanupToken: string | null = null;
    const reconnect = async () => {
      if (localStorage.getItem(preferenceKey(uid)) !== 'true') return;
      if (Notification.permission !== 'granted') {
        setStatus('Notifications are blocked. Allow them in your browser settings.'); return;
      }
      setBusy(true);
      try {
        const registration = await registerWorker();
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) { localStorage.removeItem(preferenceKey(uid)); setStatus('Enable rest alerts again on this device.'); return; }
        const user = auth?.currentUser;
        if (!user || user.uid !== uid) return;
        const token = await user.getIdToken(); cleanupToken = token;
        if (disposed || generation !== generationRef.current) return;
        await api('/api/push/subscription', token, { deviceId: deviceId(), subscription: subscription.toJSON() });
        if (disposed || generation !== generationRef.current) return;
        tokenRef.current = token; registrationRef.current = registration;
        setEnabled(true); setStatus('Rest alerts on. Delivery may be delayed by your connection or phone settings.');
      } catch (error) { if (!disposed) setStatus(error instanceof Error ? error.message : 'Could not reconnect rest alerts.'); }
      finally { if (!disposed) setBusy(false); }
    };
    void reconnect();
    return () => {
      disposed = true;
      const token = cleanupToken ?? tokenRef.current;
      const registration = registrationRef.current;
      tokenRef.current = null;
      if (registration) void workerState(registration, null, false).catch(() => {});
      if (token) void api('/api/push/timer', token, { deviceId: deviceId(), revision: nextRevision(), deadline: null }, 'POST', true).catch(() => {});
    };
  }, [uid, config?.configured]);

  useEffect(() => {
    if (!enabled || !uid) return;
    const registration = registrationRef.current;
    if (!registration) return;
    setStatus(deadline && deadline > Date.now() ? 'Scheduling your rest alert…' : 'Updating rest alerts…');
    const revision = nextRevision();
    const generation = generationRef.current;
    // Update the local worker immediately to suppress a stale alert after skip/reset.
    const localState = workerState(registration, deadline, true).then(() => null, error => error as Error);
    queueRef.current = queueRef.current.catch(() => {}).then(async () => {
      const stateError = await localState;
      if (stateError) throw stateError;
      if (generation !== generationRef.current) return;
      const user = auth?.currentUser;
      if (!user || user.uid !== uid) return;
      const token = await user.getIdToken(); tokenRef.current = token;
      await api('/api/push/timer', token, { deviceId: deviceId(), revision, deadline });
      if (generation === generationRef.current) setStatus(deadline && deadline > Date.now()
        ? 'Rest alert scheduled. Delivery may be delayed by your connection or phone settings.'
        : 'Rest alerts on. Delivery may be delayed by your connection or phone settings.');
    }).catch(error => {
      if (generation === generationRef.current) setStatus(error instanceof Error ? error.message : 'Could not schedule this rest alert. Keep Repday open.');
    });
  }, [deadline, enabled, uid]);

  const toggle = useCallback(async () => {
    if (!uid || busy) return;
    const reason = unsupportedReason();
    if (reason) { setStatus(reason); return; }
    if (!config?.configured || !config.publicKey) { setStatus('Rest alerts are not available yet. Keep Repday open to follow the timer.'); return; }
    setBusy(true);
    try {
      if (!enabled) {
        // Invoke permission immediately from the user's click (required on iOS).
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { setStatus('Notifications were not enabled. You can allow them in your browser settings.'); return; }
      }
      const user = auth?.currentUser;
      if (!user || user.uid !== uid) throw new Error('Sign in again to enable rest alerts.');
      const token = await user.getIdToken(); tokenRef.current = token;
      const registration = await registerWorker(); registrationRef.current = registration;
      if (enabled) {
        await workerState(registration, null, false);
        // Fence already queued scheduling calls before removing the subscription.
        ++generationRef.current;
        await queueRef.current.catch(() => {});
        await api('/api/push/subscription', token, { deviceId: deviceId() }, 'DELETE');
        const subscription = await registration.pushManager.getSubscription();
        if (subscription && !await subscription.unsubscribe()) throw new Error('Could not unsubscribe. Please retry.');
        localStorage.removeItem(preferenceKey(uid)); setEnabled(false); setStatus('Rest alerts off.');
      } else {
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKeyBytes(config.publicKey) });
        await api('/api/push/subscription', token, { deviceId: deviceId(), subscription: subscription.toJSON() });
        await workerState(registration, deadlineRef.current, true);
        localStorage.setItem(preferenceKey(uid), 'true'); setEnabled(true);
        setStatus('Rest alerts on. Delivery may be delayed by your connection or phone settings.');
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not update rest alerts.'); }
    finally { setBusy(false); }
  }, [uid, busy, config, enabled]);

  return { enabled, busy, status, toggle };
}
