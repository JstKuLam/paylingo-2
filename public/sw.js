// Custom Network-Only & Self-Cleaning Service Worker for PayLingo
// Preserves PWA installability but never caches assets, completely avoiding ChunkLoadErrors.

const CACHE_NAME = 'paylingo-pwa-recovery-v1';

self.addEventListener('install', (event) => {
  // Force immediate activation
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Wipes out all old Cache Storage cache keys upon activation
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.warn('[PWA] Deleting old active cache to restore app:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // Instantly take control of all open pages/clients
      return self.clients.claim();
    })
  );
});

// Pass-through fetch handler (Network-Only)
// Satisfies PWA criteria for Chrome/Safari while ensuring assets are always loaded fresh.
self.addEventListener('fetch', (event) => {
  // Do not intercept or cache anything. Always pass through directly to network.
  event.respondWith(fetch(event.request));
});
