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
      // Arbitrum RPC proxy — workaround for MetaMask's `injected.js` content
      // script. MM scans browser fetch() calls for known RPC URLs (Infura,
      // Alchemy, public chain endpoints like 1rpc.io / arb1.arbitrum.io) and
      // tries to route them through its own provider. Its proxy strips
      // Access-Control-Allow-Origin, so the browser refuses the response
      // with "No 'Access-Control-Allow-Origin' header is present" even
      // though the upstream RPC sends it. Routing the same JSON-RPC through
      // `localhost:5176/rpc/...` looks like a regular API call to MM (it
      // doesn't intercept localhost paths), and Vite's proxy strips Origin
      // server-side so the upstream sees a clean request. Same trick the
      // gmx-interface itself uses in production.
      //
      // Multiple upstreams so the client can `fallback()` between them when
      // any one hits its free-tier rate limit (1rpc.io and BlastAPI both
      // ration aggressively under multicall load; switching providers is
      // cheaper than asking the user to buy a paid endpoint).
      // PRIMARY (when configured): Alchemy paid endpoint, server-side proxy
      // so the API key NEVER ships in the browser bundle. The path
      // `/rpc/arb-alchemy` is what `web/.env` points VITE_ARBITRUM_RPC_URL
      // at; the actual `https://arb-mainnet.g.alchemy.com/v2/<key>` URL
      // lives only in this file and never reaches the client.
      // 100M compute units / month free = far beyond what testing burns.
      '/rpc/arb-alchemy': {
        target: 'https://arb-mainnet.g.alchemy.com',
        changeOrigin: true, secure: true,
        rewrite: () => '/v2/_wtFjwex46SgJDz2fx2c6',
      },
      // Anonymous Arbitrum RPC pool — used only when env override is unset.
      // PRIMARY = Pocket Network public node (arb-pokt.nodies.app) — most
      // generous anonymous endpoint under multicall load. publicnode +
      // onfinality + tenderly round out the pool so a transient ration
      // on one rotates to the next via viem `fallback()`. 1rpc.io is the
      // only one with a strict 250-req/IP/day cap so it's last.
      // For production stability the right answer is the Alchemy proxy
      // above; this rotation is a stop-gap for dev without a key.
      '/rpc/arb-pokt': {
        target: 'https://arb-pokt.nodies.app',
        changeOrigin: true, secure: true,
        rewrite: () => '/',
      },
      '/rpc/arb-onfinality': {
        target: 'https://arbitrum.api.onfinality.io',
        changeOrigin: true, secure: true,
        rewrite: () => '/public',
      },
      '/rpc/arb-public': {
        target: 'https://arbitrum-one.publicnode.com',
        changeOrigin: true, secure: true,
        rewrite: () => '/',
      },
      '/rpc/arb-tenderly': {
        target: 'https://arbitrum.gateway.tenderly.co',
        changeOrigin: true, secure: true,
        rewrite: () => '/',
      },
      '/rpc/arb': {
        target: 'https://1rpc.io',
        changeOrigin: true, secure: true,
        rewrite: () => '/arb',
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
