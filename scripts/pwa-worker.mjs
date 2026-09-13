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
  const path = event.request.mode === 'navigate' ? '/index.html' : url.pathname;
  if (!ASSETS.includes(path)) return;
  event.respondWith(caches.open(CACHE).then(async cache =>
    (await cache.match(path)) || fetch(event.request)));
});
`; }
