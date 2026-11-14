// Guarda a app no iPhone para funcionar sem internet.
// Com internet, vai sempre buscar a versão mais recente; sem internet, usa a cópia guardada.
const CACHE = 'wortschatz-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './words.json',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (sem cache HTTP), cópia guardada se não houver internet.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(req, { ignoreSearch: true })) ||
          (req.mode === 'navigate' ? cache.match('./index.html') : undefined);
      })
  );
});
