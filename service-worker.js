const CACHE_VERSION = "la-team-shell-v39-unified-premium-test";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/offline.html",
  "/preproduction-config.js",
  "/firebase-sharing.js",
  "/organizer-accounts.js",
  "/player-experience.js",
  "/organizer-lock.js",
  "/tournament-timer.js",
  "/court-timers.js",
  "/round-timer.js",
  "/firebase-client.js",
  "/club-v2.js",
  "/club-journey-v2.js",
  "/commerce-v2.js",
  "/v2-experience.js",
  "/firebase-v2.js",
  "/vendor/qrcode.min.js",
  "/vendor/qrcode-LICENSE.txt",
  "/padel-hero-v2.jpg",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if(event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if(request.method !== "GET") return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;

  if(request.mode === "navigate"){
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put("/index.html", copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/index.html")) || caches.match("/offline.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if(response.ok){
        const copy=response.clone();
        caches.open(CACHE_VERSION).then(cache=>cache.put(request,copy));
      }
      return response;
    }))
  );
});
