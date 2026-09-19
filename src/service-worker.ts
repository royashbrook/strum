/// <reference lib="webworker" />
export {};
declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE_ASSETS__: string[];
const CACHE = 'strum-' + __BUILD_ID__;
const SHELL = __PRECACHE_ASSETS__;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'VERSION') event.ports[0]?.postMessage({ build: __BUILD_ID__ });
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('strum-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/version.json' ||
    url.searchParams.has('update-probe')
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // The complete shell was cached at install, including icons and the manifest.
      // Only navigation needs the network first; don't stall cached assets offline.
      if (request.mode !== 'navigate') {
        const saved = await cache.match(SHELL.includes(url.pathname) ? url.pathname : request);
        if (saved) return saved;
      }
      try {
        const response = await fetch(request);
        // Query/path variants are not additional shell entries. Keep their network responses
        // out of the cache, and never overwrite '/' with another navigation's content.
        if (response.ok && !url.search && SHELL.includes(url.pathname)) {
          const copy = response.clone();
          event.waitUntil(cache.put(request, copy).catch(() => {}));
        }
        return response;
      } catch {
        return (
          (await caches.match(request)) ||
          (request.mode === 'navigate' ? await cache.match('/') : null) ||
          Response.error()
        );
      }
    })(),
  );
});
