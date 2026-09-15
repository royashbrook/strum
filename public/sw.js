const CACHE = 'strum-BUILD_ID';
const SHELL = PRECACHE_ASSETS;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'VERSION') event.ports[0]?.postMessage({ build: 'BUILD_ID' });
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('strum-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/version.json' || url.searchParams.has('update-probe')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Content-addressed modules cannot accidentally mix releases.
    if (url.pathname.startsWith('/assets/')) {
      const saved = await caches.match(request);
      if (saved) return saved;
    }
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(cache.put(request, copy).catch(() => {}));
      }
      return response;
    } catch {
      return await caches.match(request) || (request.mode === 'navigate' ? await cache.match('/') : null) || Response.error();
    }
  })());
});
