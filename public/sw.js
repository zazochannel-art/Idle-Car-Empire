// Offline support: the game keeps working without a connection once it has
// been opened. Pages are network-first (so updates arrive), hashed build
// assets are cache-first (they never change).
// v2: build files are really cached now (v1 never stored them); activating v2 drops v1.
const CACHE = "car-empire-v2";
const scope = new URL(self.registration.scope).pathname;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([scope])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page, once every screen of its version has loaded, names the build files it uses: those
// of older versions (content-hashed names, never asked for again) leave the cache, so it
// doesn't grow with every update.
self.addEventListener("message", (e) => {
  if (e.data?.type !== "keep" || !Array.isArray(e.data.urls)) return;
  const keep = new Set(e.data.urls);
  e.waitUntil(caches.open(CACHE).then((c) => c.keys().then((reqs) => Promise.all(reqs.filter((r) => r.url.includes("/_next/static/") && !keep.has(r.url)).map((r) => c.delete(r))))));
});

// A notification tapped while the game was in the background: back to the game.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname.startsWith(scope));
      return open ? open.focus() : self.clients.openWindow(scope);
    }),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/_next/static/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // the copy is taken now, before the page reads the response (later it would be used up)
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match(scope) : undefined)).then((r) => r || Response.error())),
  );
});
