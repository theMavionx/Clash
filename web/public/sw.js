const CACHE_NAME = 'clash-runtime-__BUILD_HASH__';
const LEGACY_GODOT_CACHE_PREFIXES = ['clash-godot-', 'clash-godot-resource-icons-'];
const GODOT_RUNTIME_ASSETS = [
  '/godot/Work.pck',
  '/godot/Work.wasm',
  '/godot/Work.js',
];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name !== CACHE_NAME || LEGACY_GODOT_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)))
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!GODOT_RUNTIME_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;

        const freshRequest = new Request(event.request, { cache: 'reload' });
        return fetch(freshRequest).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        });
      })
    )
  );
});
