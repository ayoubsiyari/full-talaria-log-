/**
 * Minimal service worker — enables the browser install prompt (PWA).
 * Chart assets and API responses stay network-first; no offline cache yet.
 */
const SW_VERSION = "talaria-site-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
