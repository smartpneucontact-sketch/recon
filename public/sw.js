// Service worker for Atlantic Subaru Recon push notifications.
// Bumped on every meaningful change to force browsers to pick up the new file.
const SW_VERSION = '2026-05-18.1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Atlantic Subaru Recon', body: '', url: '/' };
  try { if (event.data) data = event.data.json(); } catch {}
  const opts = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-maskable.png',
    vibrate: [220, 100, 220, 100, 400],
    requireInteraction: true,
    tag: data.tag || 'recon',
    renotify: true,
    data: { url: data.url || '/', carId: data.carId || null }
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Atlantic Subaru Recon', opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        try { await c.focus(); } catch {}
        try { c.postMessage({ type: 'open-car', carId: event.notification.data && event.notification.data.carId }); } catch {}
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
