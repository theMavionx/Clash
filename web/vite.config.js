import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

function setPerplProxyOrigin(proxyReq) {
  proxyReq.setHeader('origin', 'https://app.perpl.xyz');
  proxyReq.setHeader('referer', 'https://app.perpl.xyz/');
}

function alchemyKeyFromRpcUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/v2\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  } catch {
    const match = value.match(/\/v2\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  }
}

const viteEnv = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
const API_PROXY_TARGET = process.env.VITE_API_PROXY || viteEnv.VITE_API_PROXY || '';
const WS_PROXY_TARGET = process.env.VITE_WS_PROXY || viteEnv.VITE_WS_PROXY || '';
const BASE_ALCHEMY_KEY = process.env.BASE_ALCHEMY_KEY
  || viteEnv.BASE_ALCHEMY_KEY
  || process.env.ALCHEMY_BASE_API_KEY
  || viteEnv.ALCHEMY_BASE_API_KEY
  || process.env.VITE_BASE_ALCHEMY_KEY
  || viteEnv.VITE_BASE_ALCHEMY_KEY
  || alchemyKeyFromRpcUrl(process.env.BASE_RPC_URL || viteEnv.BASE_RPC_URL)
  || alchemyKeyFromRpcUrl(process.env.NFT_BASE_RPC_URL || viteEnv.NFT_BASE_RPC_URL)
  || alchemyKeyFromRpcUrl(process.env.COPRELAUNCH_BASE_RPC_URL || viteEnv.COPRELAUNCH_BASE_RPC_URL)
  || '';
const SOLANA_HELIUS_API_KEY = process.env.SOLANA_HELIUS_API_KEY
  || viteEnv.SOLANA_HELIUS_API_KEY
  || process.env.HELIUS_API_KEY
  || viteEnv.HELIUS_API_KEY
  || process.env.VITE_HELIUS_API_KEY
  || viteEnv.VITE_HELIUS_API_KEY
  || process.env.VITE_SOLANA_HELIUS_API_KEY
  || viteEnv.VITE_SOLANA_HELIUS_API_KEY
  || '';
const SOLANA_TATUM_API_KEY = process.env.SOLANA_TATUM_API_KEY
  || viteEnv.SOLANA_TATUM_API_KEY
  || process.env.TATUM_API_KEY
  || viteEnv.TATUM_API_KEY
  || '';
const SOLANA_ALCHEMY_API_KEY = process.env.SOLANA_ALCHEMY_API_KEY
  || viteEnv.SOLANA_ALCHEMY_API_KEY
  || process.env.ALCHEMY_SOLANA_API_KEY
  || viteEnv.ALCHEMY_SOLANA_API_KEY
  || process.env.VITE_SOLANA_ALCHEMY_API_KEY
  || viteEnv.VITE_SOLANA_ALCHEMY_API_KEY
  || process.env.VITE_ALCHEMY_SOLANA_API_KEY
  || viteEnv.VITE_ALCHEMY_SOLANA_API_KEY
  || BASE_ALCHEMY_KEY
  || '';
const SOLANA_RPC_PROXY_TARGET = SOLANA_ALCHEMY_API_KEY
  ? 'https://solana-mainnet.g.alchemy.com'
  : 'https://mainnet.helius-rpc.com';
const SOLANA_RPC_WS_PROXY_TARGET = SOLANA_ALCHEMY_API_KEY
  ? 'wss://solana-mainnet.g.alchemy.com'
  : 'wss://mainnet.helius-rpc.com';
const solanaProxyRewrite = () => {
  if (SOLANA_ALCHEMY_API_KEY) return `/v2/${SOLANA_ALCHEMY_API_KEY}`;
  return SOLANA_HELIUS_API_KEY ? `/?api-key=${SOLANA_HELIUS_API_KEY}` : '/?api-key=';
};
const ARBITRUM_ALCHEMY_KEY = process.env.ARBITRUM_ALCHEMY_KEY
  || viteEnv.ARBITRUM_ALCHEMY_KEY
  || process.env.VITE_ARBITRUM_ALCHEMY_KEY
  || viteEnv.VITE_ARBITRUM_ALCHEMY_KEY
  || '';
const ETHEREUM_ALCHEMY_KEY = process.env.ETHEREUM_ALCHEMY_KEY
  || viteEnv.ETHEREUM_ALCHEMY_KEY
  || process.env.ALCHEMY_ETHEREUM_API_KEY
  || viteEnv.ALCHEMY_ETHEREUM_API_KEY
  || process.env.ETH_ALCHEMY_KEY
  || viteEnv.ETH_ALCHEMY_KEY
  || process.env.VITE_ETHEREUM_ALCHEMY_KEY
  || viteEnv.VITE_ETHEREUM_ALCHEMY_KEY
  || process.env.ALCHEMY_API_KEY
  || viteEnv.ALCHEMY_API_KEY
  || process.env.VITE_ALCHEMY_API_KEY
  || viteEnv.VITE_ALCHEMY_API_KEY
  || BASE_ALCHEMY_KEY
  || '';
const BASE_RPC_PROXY_TARGET = 'https://mainnet.base.org';
const FUTURES_PROXY_TARGET = process.env.VITE_FUTURES_PROXY
  || viteEnv.VITE_FUTURES_PROXY
  || (API_PROXY_TARGET && !/^https?:\/\/(?:localhost|127\.0\.0\.1):4000\b/i.test(API_PROXY_TARGET)
    ? API_PROXY_TARGET
    : 'http://127.0.0.1:3999');
const FUTURES_PROXY_IS_DIRECT = /^https?:\/\/(?:localhost|127\.0\.0\.1):3999\b/i.test(FUTURES_PROXY_TARGET)
  || /^https?:\/\/[^/]+:3999\b/i.test(FUTURES_PROXY_TARGET);

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
    __ETHEREUM_ALCHEMY_PROXY_ENABLED__: JSON.stringify(Boolean(ETHEREUM_ALCHEMY_KEY)),
  },
  resolve: {
    alias: {
      buffer: resolve(__dirname, 'node_modules/buffer/index.js'),
      'node:buffer': resolve(__dirname, 'node_modules/buffer/index.js'),
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
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
        target: FUTURES_PROXY_TARGET,
        ws: true,
        changeOrigin: true,
        rewrite: (path) => FUTURES_PROXY_IS_DIRECT ? path.replace(/^\/api\/futures/, '/api') : path,
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
      // so the API key NEVER ships in the browser bundle. Set
      // ARBITRUM_ALCHEMY_KEY locally; do not commit provider keys here.
      '/rpc/solana-alchemy-ws': {
        target: 'wss://solana-mainnet.g.alchemy.com',
        ws: true,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReqWs', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
        rewrite: () => SOLANA_ALCHEMY_API_KEY ? `/v2/${SOLANA_ALCHEMY_API_KEY}` : '/v2/',
      },
      '/rpc/solana-ws': {
        target: SOLANA_RPC_WS_PROXY_TARGET,
        ws: true,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReqWs', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
        rewrite: solanaProxyRewrite,
      },
      '/rpc/solana-alchemy': {
        target: 'https://solana-mainnet.g.alchemy.com',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
        rewrite: () => SOLANA_ALCHEMY_API_KEY ? `/v2/${SOLANA_ALCHEMY_API_KEY}` : '/v2/',
      },
      '/rpc/solana-leorpc': {
        target: 'https://solana.leorpc.com',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
        rewrite: () => '/?api_key=FREE',
      },
      '/rpc/solana-tatum': {
        target: 'https://solana-mainnet.gateway.tatum.io',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            if (SOLANA_TATUM_API_KEY) proxyReq.setHeader('x-api-key', SOLANA_TATUM_API_KEY);
          });
        },
        rewrite: () => '/',
      },
      '^/rpc/solana$': {
        target: SOLANA_RPC_PROXY_TARGET,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
        rewrite: solanaProxyRewrite,
      },
      '/rpc/arb-alchemy': {
        target: 'https://arb-mainnet.g.alchemy.com',
        changeOrigin: true, secure: true,
        rewrite: () => ARBITRUM_ALCHEMY_KEY ? `/v2/${ARBITRUM_ALCHEMY_KEY}` : '/v2/',
      },
      '/rpc/base-alchemy': {
        target: 'https://base-mainnet.g.alchemy.com',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
        rewrite: () => BASE_ALCHEMY_KEY ? `/v2/${BASE_ALCHEMY_KEY}` : '/v2/',
      },
      '/rpc/eth-alchemy': {
        target: 'https://eth-mainnet.g.alchemy.com',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
        rewrite: () => ETHEREUM_ALCHEMY_KEY ? `/v2/${ETHEREUM_ALCHEMY_KEY}` : '/v2/',
      },
      '/rpc/base': {
        target: BASE_RPC_PROXY_TARGET,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
        rewrite: () => '/',
      },
      // Public Arbitrum RPC pool. `/rpc/arb-pokt` remains as a compatibility
      // path for older hot-loaded modules, but routes to publicnode now because
      // the old Pocket endpoint can return 403.
      '/rpc/arb-pokt': {
        target: 'https://arbitrum-one.publicnode.com',
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
      // Perpl Foundation (Monad mainnet) — REST + auth endpoints. Perpl uses
      // Origin/Referer to build and validate its SIWE message, and accepts its
      // own app origin here; blanking them produces invalid `://` payloads.
      '/perpl-api': {
        target: 'https://app.perpl.xyz',
        changeOrigin: true, secure: true,
        cookieDomainRewrite: '',
        cookiePathRewrite: { '/api/v1': '/', '/': '/' },
        configure: (proxy) => {
          proxy.on('proxyReq', setPerplProxyOrigin);
        },
        rewrite: (path) => path.replace(/^\/perpl-api/, '/api/v1'),
      },
      '/perpl-ws': {
        target: 'wss://app.perpl.xyz',
        ws: true,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReqWs', setPerplProxyOrigin);
        },
        rewrite: (path) => path.replace(/^\/perpl-ws/, '/ws/v1'),
      },
      '/api': API_PROXY_TARGET || 'http://127.0.0.1:4000',
      '/ws': {
        target: WS_PROXY_TARGET || 'ws://127.0.0.1:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
