const CACHE_NAME = 'clash-godot-resource-icons-__BUILD_HASH__';

// Large Godot assets to cache (cache-first strategy)
const GODOT_ASSETS = [
  '/godot/Work.pck',
  '/godot/Work.wasm',
  '/godot/Work.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        // Delete ALL old caches (force fresh start)
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept Godot asset requests
  const isGodotAsset = GODOT_ASSETS.some((path) => url.pathname === path);
  if (!isGodotAsset) return;

  // Cache-first with streaming: serve from cache immediately, update in background
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;

        // Not in cache — fetch and cache for next time
        return fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    )
  );
});
