export function workerSource(name, urls) { return `
const CACHE = ${JSON.stringify(name)};
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
// Activation is explicit; never interrupt an editor automatically.
self.addEventListener('message', event => {
  if (event.data?.type === 'ROTA_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Other tabs may still need lazy chunks from their previous shell.
    if (self.clients?.matchAll && (await self.clients.matchAll({type:'window',includeUncontrolled:true})).length > 1) return;
    await caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('rota-shell-') && key !== CACHE)
    .map(key => caches.delete(key))));
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const route = event.notification.data?.route;
  if (!['Dívidas','Investimentos','Manutenção','Planejamento','Gastos','Relatórios','Alertas','Auditoria','Configurações'].includes(route)) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const client = windows.find(c => new URL(c.url).origin === self.location.origin);
    if (client) { await client.focus(); client.postMessage({type:'rota-notification',route}); }
    else await self.clients.openWindow('/#notification=' + encodeURIComponent(route));
  })().catch(() => undefined));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only a recognized local page selector is public. Auth/filter/token queries bypass the worker.
  const publicSettings = url.searchParams.size === 2 && url.searchParams.get('view') === 'Configurações' &&
    ['perfil','aparencia','financas','integracoes','notificacoes','dados','seguranca'].includes(url.searchParams.get('settings'));
  const publicView = event.request.mode === 'navigate' && url.pathname === '/' && (url.searchParams.size === 1 || publicSettings) &&
    ['Hoje','Dashboard','Transações','Contas','Orçamentos','Trabalho','Gastos','Dívidas','Investimentos','Planos','Planejamento','Patrimônio','Simulações','Importar','Moto','Manutenção','Assistente','Minha Situação','Alertas','Auditoria','Relatórios','Análises','Configurações'].includes(url.searchParams.get('view'));
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || (url.search && !publicView)) return;
  if (event.request.mode === 'navigate') {
    // Network first. Keep the installed shell paired with its installed chunks;
    // never overwrite this version's offline HTML with the next deployment.
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (!response.ok && response.status >= 500) throw Error('Shell indisponível');
        return response;
      } catch {
        const cached = await (await caches.open(CACHE)).match('/index.html');
        if (cached) return cached;
        throw Error('Offline e sem shell disponível');
      }
    })());
    return;
  }
  const path = url.pathname;
  if (!ASSETS.includes(path) && !(path.startsWith('/assets/') && (path.endsWith('.js') || path.endsWith('.css')))) return;
  event.respondWith(caches.open(CACHE).then(async cache =>
    (await cache.match(path)) || (await caches.match(path)) || fetch(event.request)));
});
`; }
