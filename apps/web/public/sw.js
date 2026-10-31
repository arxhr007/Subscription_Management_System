// Brightloop service worker: the app shell and the customer portal keep working offline.
// - App shell & built assets: cache-first (they are content-hashed).
// - Portal + session API reads: network-first, falling back to the last good copy.
// - Everything else (staff API, writes): network only — never serve stale billing data to staff.
const SHELL = 'bl-shell-v1';
const API = 'bl-api-v1';
const CACHEABLE_API = [/^\/api\/portal\/(overview|subscriptions\/[^/]+|invoices\/[^/]+)$/, /^\/api\/auth\/me$/];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, API].includes(k)).map((k) => caches.delete(k)))));
  self.clients.claim();
});

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')));
  } else if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(async (res) => {
      if (res.ok) (await caches.open(SHELL)).put(e.request, res.clone());
      return res;
    })));
  } else if (CACHEABLE_API.some((re) => re.test(url.pathname))) {
    e.respondWith(networkFirst(e.request, API));
  }
});
