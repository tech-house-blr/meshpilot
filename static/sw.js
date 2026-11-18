/* Caches only the static shell assets (stale-while-revalidate). Never touches /api, /ws or authenticated pages. */
const V = 'pm-static-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k != V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method != 'GET' || u.origin != location.origin || !u.pathname.startsWith('/static/') || u.pathname.startsWith('/static/novnc/')) return;
  e.respondWith(caches.open(V).then(async c => { const hit = await c.match(e.request); const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r }).catch(() => hit); return hit || net }));
});
