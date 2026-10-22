// Kill switch for the service worker the old Django site registered at /sw.js.
// Browsers re-check this file on navigation; this version wipes the old caches,
// unregisters itself and reloads open tabs so visitors get the new site.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
