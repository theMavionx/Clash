import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
      '/api': process.env.VITE_API_PROXY || 'http://localhost:4000',
      '/ws': {
        target: process.env.VITE_WS_PROXY || 'ws://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
