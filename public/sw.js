/* Cache only the generic offline page. Saved links, notes, API responses,
   sign-in responses and private app documents always use the network. */
const CACHE = 'later-offline-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(OFFLINE, { cache: 'reload' }))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('later-offline-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/mcp') || url.pathname.startsWith('/.well-known/') || url.pathname.startsWith('/cdn-cgi/')) return;
  event.respondWith((async () => {
    try { return await fetch(event.request); }
    catch {
      return (await caches.match(OFFLINE)) || new Response('You are offline. Reconnect to open Later.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  })());
});
