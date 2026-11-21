const CACHE_PREFIX = "pathargata-expo-shell-";
const BUILD_TAG = "__BUILD_TAG__";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_TAG}`;
const SCOPE_URL = new URL(self.registration.scope);
const SHELL_URL = new URL("index.html", SCOPE_URL).href;
const SCOPE_PATH = SCOPE_URL.pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(SHELL_URL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) =>
          (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) ||
          key.startsWith("patharghata-pwa-") ||
          key.startsWith("patharghata-dynamic-")
        )
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) return response;
        return fetch(SHELL_URL);
      }).catch(async () => {
        const cachedShell = await caches.match(SHELL_URL);
        return cachedShell || Response.error();
      }),
    );
    return;
  }

  const isVersionedStaticAsset = url.pathname.startsWith(`${SCOPE_PATH}_expo/static/`);
  const isLocalIcon = /\.(?:png|jpe?g|webp|svg|ico|woff2?|ttf)$/i.test(url.pathname);
  if (!isVersionedStaticAsset && !isLocalIcon) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }).catch(() => fetch(request)),
  );
});
