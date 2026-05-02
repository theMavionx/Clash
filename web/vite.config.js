import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Vite 8 swapped the dep optimizer from esbuild to Rolldown and
  // tightened the CJS->ESM interop. The new behaviour drops named-export
  // detection that Vite 7's optimizer used to do — meaning React 19's
  // `react/jsx-runtime` (CJS) loses its `Fragment` export, and any prebundled
  // dep that does `import { Fragment, ... } from "react/jsx-runtime"` (e.g.
  // @aptos-labs/wallet-adapter-react) crashes at module-init.
  //
  // The Vite team flagged this as a breaking change and added an opt-out
  // flag specifically for this scenario. Setting it restores Vite 7's
  // named-export behaviour across all prebundles in one line, replacing
  // ~70 lines of fragile rewrite-plugin + optimizeDeps include/exclude
  // gymnastics. See https://main.vite.dev/guide/migration.
  legacy: {
    inconsistentCjsInterop: true,
  },
  plugins: [
    react(),
    // Add cache headers for Godot assets in preview/production
    {
      name: 'godot-cache-headers',
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.match(/\/godot\/Work\.(pck|wasm|side\.wasm)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
          next();
        });
      },
    },
  ],
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  server: {
    headers: {
      // COEP intentionally not set: it strips credentials from cross-origin
      // iframes, which breaks Privy's auth.privy.io embedded-wallet iframe
      // ("Exceeded max attempts"). Godot falls back to single-threaded WASM.
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      // Futures (Avantis / Pacifica custodial) — separate server-futures on :3999.
      // Must be declared BEFORE '/api' because vite matches in insertion order.
      // server-futures mounts its router at `/api`, so the proxy must strip
      // the `/futures` segment so client calls like `/api/futures/markets`
      // end up at `/api/markets` on the futures server. In production nginx
      // does this rewrite; in dev the proxy does it here.
      '/api/futures': {
        target: process.env.VITE_FUTURES_PROXY || process.env.VITE_API_PROXY || 'http://localhost:3999',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/futures/, '/api'),
      },
      '/api': process.env.VITE_API_PROXY || 'http://localhost:4000',
      '/ws': {
        target: process.env.VITE_WS_PROXY || 'ws://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
