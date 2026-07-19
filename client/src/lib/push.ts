/**
 * Web Push client (Module F). Registers the service worker, subscribes to the
 * browser Push service with the server's VAPID key, and syncs the subscription
 * to the server. All push payloads are metadata-only (content is E2EE).
 */
import api from './api';

export const pushSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/** Register the service worker (idempotent). Call once on app start. */
export const registerServiceWorker = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.warn('[push] service worker registration failed:', e);
  }
};

/**
 * Show a foreground notification for a live in-app event (new message / incoming
 * call). Prefers the service worker registration (works when backgrounded) and
 * falls back to a plain Notification. No-op without granted permission. Payload
 * is metadata only — never message ciphertext.
 */
export const showAppNotification = async (title: string, body: string): Promise<void> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    console.warn('[push] notification skipped — permission is', Notification.permission);
    return;
  }
  const options: NotificationOptions = { body, icon: '/logo.webp' };

  // Prefer the service worker (its notifications survive the tab backgrounding),
  // but ONLY with an active worker: `getRegistration()` also resolves while the
  // worker is still installing, and showNotification then REJECTS. That promise
  // was previously neither awaited nor returned, so the rejection escaped this
  // try/catch as an unhandled rejection and the notification silently vanished.
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg?.active) {
      await reg.showNotification(title, options);
      return;
    }
  } catch (e) {
    console.warn('[push] service-worker notification failed, falling back:', e);
  }

  try {
    new Notification(title, options);
  } catch (e) {
    console.warn('[push] notification failed:', e);
  }
};

/** Ask permission, subscribe, and persist the subscription server-side. */
export const enablePush = async (): Promise<boolean> => {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  const { data } = await api.get('/notifications/vapid');
  if (!data.publicKey) {
    console.warn('[push] server has no VAPID key configured');
    return false;
  }
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey) as unknown as BufferSource,
    }));
  await api.post('/notifications/subscribe', { subscription: sub.toJSON() });
  return true;
};

/** Unsubscribe locally and remove the subscription server-side. */
export const disablePush = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.delete('/notifications/subscribe', { data: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
};

export const isPushEnabled = async (): Promise<boolean> => {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
};
