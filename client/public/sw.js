/* Najva service worker (Module F). Background Web Push + click handling.
 * Payloads are METADATA ONLY (sender name + ids) — message content is E2EE and
 * never present here; the app fetches + decrypts on open. */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { /* non-JSON */ }

  const title = data.title || 'Najva';
  const body = data.kind === 'call' ? 'Incoming call' : 'New message';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/logo.webp',
      badge: '/favicon.svg',
      tag: data.conversationId || 'najva',
      renotify: true,
      data: { conversationId: data.conversationId || null, kind: data.kind || 'message' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const convId = event.notification.data && event.notification.data.conversationId;
  const url = convId ? `/chat?c=${convId}` : '/chat';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.focus();
          if (convId && 'navigate' in w) { try { w.navigate(url); } catch (_e) { /* cross-origin */ } }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
