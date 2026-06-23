/**
 * Minimal service worker for the V9 chart app — enables install-to-desktop.
 */
const SW_VERSION = "talaria-chart-20260623b55";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
