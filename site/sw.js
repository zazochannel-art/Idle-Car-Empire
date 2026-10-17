// The game no longer runs on this site (it is a phone app now). Browsers that
// played it here still have its offline worker: this version of it removes the
// old game's cache and itself, then reloads the open pages, which become the
// site's page (it can hand a save left in the browser to the app).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
    })(),
  );
});
