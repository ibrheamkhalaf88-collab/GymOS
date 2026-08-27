// Digital Pulse — minimal service worker
// Cache-first for local static assets; network-first for pages.
const CACHE = "dp-cache-v2";
const ASSETS = [
  "index.html", "activate.html", "app.html", "ibrheam.html",
  "css/theme.css", "js/tailwind-config.js",
  "vendor/tailwind.js", "vendor/chart.umd.min.js",
  "assets/icons/icon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Firebase & Google Fonts: always network
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com")) return;
  if (url.origin !== location.origin) return;


  // Pages: network-first so updates land immediately, fall back offline
  if (url.pathname.endsWith(".html") || url.pathname === "/") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});