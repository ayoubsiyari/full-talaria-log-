/**
 * Minimal service worker for the V9 chart app — enables install-to-desktop.
 * SW_VERSION must match ?v= on chart scripts (bump-dist-v9-cache.mjs).
 */
const SW_VERSION = "talaria-chart-20260627b282";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_) { /* ignore */ }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
