/* global self, caches, fetch, URL, Request, Response */
// Filled by build-offline.mjs after Expo exports the app.
// eslint-disable-next-line no-undef -- Replaced during export.
const CACHE = __CACHE_NAME__;
// eslint-disable-next-line no-undef -- Replaced during export.
const ASSETS = __ASSETS__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(ASSETS.map((asset) => new Request(asset, { cache: "reload" }))),
      ),
  );
  // Updates wait for existing tabs to close, so a running hand keeps one build's code.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("truecount-offline-") && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const path = url.pathname;
      const clean = path.replace(/\/$/, "");
      // Expo exports both /play.html and /drills/index.html. Queries still reach the app.
      const candidates = [path, `${clean}.html`, `${clean}/index.html`];
      for (const candidate of candidates) {
        const cached = await cache.match(candidate);
        if (cached) return cached;
      }
      try {
        return await fetch(request);
      } catch (error) {
        if (request.mode !== "navigate") throw error;
        const missing = await cache.match("/+not-found.html");
        if (!missing) throw error;
        return new Response(await missing.text(), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    })(),
  );
});
