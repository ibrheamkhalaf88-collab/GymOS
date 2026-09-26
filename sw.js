// Digital Pulse — minimal service worker
// Network-first for pages and code; cache-first for other static assets.
const CACHE = "dp-cache-v6";
const ASSETS = [
  "index.html", "onboarding.html", "activate.html", "app.html", "ibrheam.html",
  "login.html", "signup.html", "reset-password.html", "auth/callback.html",
  "privacy-policy.html", "admin.html", "admin-login.html",
  "css/theme.css",
  // The app's module graph is precached, not just the HTML shell. These are
  // hard `import` dependencies (app.js -> store.js -> access.js), and the
  // js handler below falls back to serving index.html for a cache miss — so an
  // uncached module returns HTML where JS is expected and the whole app dies
  // on a cold offline start. Precache them.
  "js/app.js", "js/access.js", "js/store.js", "js/db.js", "js/license.js",
  "js/i18n.js", "js/ui.js", "js/validate.js", "js/config.js",
  "js/supabase-client.js", "js/login.js", "js/activate.js", "js/signup.js",
  "js/admin.js", "js/admin-auth.js",
  "js/tailwind-config.js", "js/pwa.js",
  "vendor/tailwind.js", "vendor/chart.umd.min.js",
  "assets/icons/icon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png",
  "manifest.webmanifest",
];

// A cached shell to serve when the network is gone. Without this,
// caches.match() can resolve to undefined and respondWith(undefined) throws,
// which turns a normal offline load into a hard navigation error.
const SHELL = "index.html";

const put = (cache, req, res) => {
  if (res && res.ok) cache.put(req, res.clone());
};

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
          caches.open(CACHE).then((c) => put(c, e.request, copy));
          return res;
        })
        .catch(() =>
          caches.match(e.request).then((hit) => hit || caches.match(SHELL))
        )
    );
    return;
  }

  // Code assets (js/css): network-first so deployed fixes reach existing
  // users too, with cache fallback for offline.
  if (/\.(js|css)$/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => put(c, e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match(SHELL)))
    );
    return;
  }

  // Static assets: cache-first, then network, then the shell.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match(SHELL)))
  );
});
