const CACHE_NAME = 'pulse-pwa-v1';
const APP_SHELL = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/js/config.js',
  './assets/js/app.js',
  './assets/js/audio.js',
  './manifest.webmanifest',
  './icons/pulse-icon.svg',
  './icons/pulse-maskable.svg',
  './icons/apple-touch-icon.png',
  './icons/pulse-icon-192.png',
  './icons/pulse-icon-512.png',
  './icons/pulse-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (requestUrl.origin === self.location.origin && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') return caches.match('./index.html');
          return caches.match(event.request);
        });
    })
  );
});
