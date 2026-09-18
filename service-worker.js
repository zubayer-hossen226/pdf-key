/* Z Key — Service Worker
   Caches the app shell (HTML/CSS/JS/icons + the vendored PDF libraries) so the
   app opens and works offline after the first successful load.
   Student PDFs are NEVER sent anywhere — this worker only ever touches
   this app's own static files. */

const CACHE_VERSION = 'z-key-v5';
const CACHE_NAME = `zkey-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/glass.css',
  './css/responsive.css',
  './js/app.js',
  './js/state.js',
  './js/pdf-import.js',
  './js/trim.js',
  './js/thumbnails.js',
  './js/page-manager.js',
  './js/layouts.js',
  './js/renderer.js',
  './js/color-mode.js',
  './js/preview.js',
  './js/export-pdf.js',
  './js/loading.js',
  './js/utils.js',
  './js/router.js',
  './js/vendor-loader.js',
  './assets/icon-72.png',
  './assets/icon-96.png',
  './assets/icon-128.png',
  './assets/icon-144.png',
  './assets/icon-152.png',
  './assets/icon-192.png',
  './assets/icon-384.png',
  './assets/icon-512.png',
  './assets/favicon-32.png',
  './assets/favicon-16.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // Never fail install just because one optional asset 404s during dev.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('zkey-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Strategy:
//  - App-shell files: cache-first (instant load, then background-refresh).
//  - Third-party CDN library files (pdf.js / pdf-lib): stale-while-revalidate,
//    since they're versioned/pinned and safe to cache long-term.
//  - Everything else (e.g. any accidental network call): network-first, fall
//    back to cache. We never intercept POSTs or non-GET requests.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Cross-origin (CDN vendor scripts): stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
