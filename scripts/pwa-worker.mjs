export function workerSource(name, urls) { return `
const CACHE = ${JSON.stringify(name)};
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
// No skipWaiting: existing tabs finish before the next version activates.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('rota-shell-') && key !== CACHE)
    .map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;
  if (event.request.mode === 'navigate') {
    // Always check the network for the shell so a deploy is visible immediately.
    // Keep the last known shell only as an offline fallback.
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        const cache = await caches.open(CACHE);
        await cache.put('/index.html', response.clone());
        return response;
      } catch {
        const cached = await caches.match('/index.html');
        if (cached) return cached;
        throw Error('Offline e sem shell disponível');
      }
    })());
    return;
  }
  const path = url.pathname;
  if (!ASSETS.includes(path)) return;
  event.respondWith(caches.open(CACHE).then(async cache =>
    (await cache.match(path)) || fetch(event.request)));
});
`; }
