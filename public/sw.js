const CACHE_PREFIX = 'paylingo-';
const STATIC_CACHE = `${CACHE_PREFIX}static-v4`;
const SHELL_CACHE = `${CACHE_PREFIX}shell-v4`;
const SHELL_URLS = ['/', '/manifest.json', '/icons/icon-192x192.png', '/icons/icon-512x512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return Promise.allSettled(
        SHELL_URLS.map((url) =>
          fetch(url, { cache: 'no-cache' }).then((res) => {
            if (res.status === 200 && !res.redirected) return cache.put(url, res);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX))
          .filter((cacheName) => cacheName !== STATIC_CACHE && cacheName !== SHELL_CACHE)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;
  } catch (err) {
    console.warn('[SW] caches.match failed:', err);
  }

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
      } catch (cacheErr) {
        console.warn('[SW] Failed to cache static asset:', cacheErr);
      }
    }
    return response;
  } catch {
    return Response.error();
  }
}

async function rootNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.status === 200 && !response.redirected) {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put('/', response.clone());
      } catch (cacheErr) {
        console.warn('[SW] Failed to cache shell:', cacheErr);
      }
    }
    return response;
  } catch {
    try {
      const cachedShell = await caches.match('/');
      return cachedShell || Response.error();
    } catch {
      return Response.error();
    }
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Cache only the public entry page. Authenticated pages always remain network-only.
  if (url.pathname === '/') {
    event.respondWith(rootNetworkFirst(request));
  }
});
