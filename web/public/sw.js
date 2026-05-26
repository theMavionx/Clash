const CACHE_NAME = 'clash-runtime-__BUILD_HASH__';
const GODOT_MANIFEST_URL = '/godot/godot-runtime-manifest.json';
const CACHE_PREFIXES_TO_PRUNE = [
  'clash-runtime-',
  'clash-godot-',
  'clash-godot-resource-icons-',
  'Clash of Perps-sw-cache-',
];
const GODOT_RUNTIME_ASSETS = [
  '/godot/Work.pck',
  '/godot/Work.wasm',
  '/godot/Work.js',
];
let reloadClientsOnActivate = false;
let manifestPromise = null;

function assetName(pathname) {
  return pathname.split('/').pop();
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function verifiedHeaders(headersLike) {
  const headers = new Headers(headersLike || {});
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('content-range');
  headers.set('x-clash-godot-verified', '1');
  return headers;
}

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${GODOT_MANIFEST_URL}?sw=${encodeURIComponent(CACHE_NAME)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return manifestPromise;
}

async function validateGodotResponse(pathname, response) {
  if (!response?.ok) return response;
  const manifest = await loadManifest();
  const expected = manifest?.files?.[assetName(pathname)];
  if (!expected?.size && !expected?.sha256) return response;

  const buffer = await response.arrayBuffer();
  if (expected.size && buffer.byteLength !== Number(expected.size)) {
    throw new Error(`Godot asset size mismatch for ${pathname}: ${buffer.byteLength} != ${expected.size}`);
  }

  if (expected.sha256 && globalThis.crypto?.subtle) {
    const actual = bytesToHex(await globalThis.crypto.subtle.digest('SHA-256', buffer));
    if (actual !== String(expected.sha256).toLowerCase()) {
      throw new Error(`Godot asset hash mismatch for ${pathname}`);
    }
  }

  return new Response(buffer, {
    status: response.status,
    statusText: response.statusText,
    headers: verifiedHeaders(response.headers),
  });
}

self.addEventListener('install', () => {
  reloadClientsOnActivate = !!self.registration.active;
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && CACHE_PREFIXES_TO_PRUNE.some((prefix) => name.startsWith(prefix)))
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'CLASH_SW_ACTIVATED', version: CACHE_NAME });
          if (reloadClientsOnActivate && client.url) {
            client.navigate(client.url).catch(() => {});
          }
        }
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLASH_CLEAR_GODOT_CACHES') return;
  manifestPromise = null;
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => CACHE_PREFIXES_TO_PRUNE.some((prefix) => name.startsWith(prefix)))
          .map((name) => caches.delete(name))
      ))
      .catch(() => {})
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
        return fetch(freshRequest).then(async (response) => {
          if (!response.ok) return response;
          const validated = await validateGodotResponse(url.pathname, response);
          await cache.put(event.request, validated.clone());
          return validated;
        });
      })
    )
  );
});
