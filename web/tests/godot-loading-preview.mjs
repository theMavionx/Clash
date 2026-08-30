// Local-only fixture mounting the actual GodotCanvas with failed engine/script
// downloads. No wallets, exchange APIs, or production telemetry are initialized.
// Run: node tests/godot-loading-preview.mjs
// Scenarios: / (startGame rejection), /?mode=script, /?mode=missing.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = '/__godot-loading-fixture.jsx';
const mock = '/__godot-loading-mocks.js';
let pageLoads = 0;
let mode = '';
const fixture = {
  name: 'local-godot-loading-recovery',
  enforce: 'pre',
  resolveId(id, importer) {
    if (id === entry || id === mock) return id;
    if (importer?.includes('GodotCanvas.jsx') && ['../lib/clientLogger', '../lib/soundSettings'].includes(id)) return mock;
  },
  load(id) {
    if (id === mock) return `
      export const addClientBreadcrumb = () => {};
      export const reportClientEvent = (type) => console.info('LOCAL FIXTURE EVENT', type);
      export const readSoundEnabled = () => false;
    `;
    if (id === entry) return `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import GodotCanvas from '/src/components/GodotCanvas.jsx';
      if (!new URLSearchParams(location.search).has('mode')) {
        window.Engine = class {
          startGame({onProgress}) {
            onProgress?.(49, 100);
            return Promise.reject(new TypeError('Fixture: runtime network interrupted'));
          }
          requestQuit() {}
        };
      }
      createRoot(document.getElementById('root')).render(<GodotCanvas />);
    `;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/godot/Work.js') {
        res.statusCode = mode === 'missing' ? 200 : 503;
        res.setHeader('Content-Type', 'application/javascript');
        res.end(mode === 'missing' ? '// fixture: script loaded without Engine' : 'Fixture unavailable');
        return;
      }
      if (url.pathname !== '/') return next();
      pageLoads++;
      mode = url.searchParams.get('mode') || '';
      const html = await server.transformIndexHtml(req.url, `<!doctype html><html><head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Local game loading recovery test</title>
        <style>body{margin:0;font-family:Arial,sans-serif;--terminal-on-accent:#fff}
        #fixture-label{position:fixed;top:4px;left:4px;z-index:20000;background:#101827;color:#fff;padding:6px;font-size:12px}</style>
        </head><body><div id="root"></div><output id="fixture-label">LOCAL MOCK · page load ${pageLoads} · no transactions</output>
        <script type="module" src="${entry}"></script></body></html>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    });
  },
};
const server = await createServer({
  root, configFile: false, plugins: [fixture, react()],
  // Production has a fixed release ID. Keep the recovery reload guard stable
  // here too, instead of the component's per-page development timestamp.
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify('local-log-audit-fixture') },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-dev-runtime'] },
  server: { host: '127.0.0.1', port: 5191, strictPort: true },
});
await server.listen();
server.printUrls();
