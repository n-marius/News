const APP_VERSION = 1;
const CACHE = `news-shell-v${APP_VERSION}`;
const SHELL_FILES = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-180-v1.png', 'icons/icon-192-v1.png', 'icons/icon-512-v1.png', 'icons/icon-512-maskable-v1.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== 'news-data').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Daten: Netz zuerst, bei Fehler letzter Stand
  if (url.pathname.endsWith('/data/feed.json') || url.pathname.endsWith('/config/app.json')) {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open('news-data').then((c) => c.put(url.pathname, copy)); }
      return r;
    }).catch(() => caches.open('news-data').then((c) => c.match(url.pathname)).then((r) => r || Response.error())));
    return;
  }
  // Programmdateien: Cache zuerst
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'News', {
    body: d.body || '', icon: 'icons/icon-192-v1.png', badge: 'icons/icon-192-v1.png', tag: d.tag, data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.openWindow(url));
});
