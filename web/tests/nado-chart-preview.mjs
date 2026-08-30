// Local real-chart fixture: live public Nado candles, no wallets/trades/DB.
// Run: node web/tests/nado-chart-preview.mjs
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
// Local ignored configuration contains file paths, never proxy credentials.
const configPath = new URL('../../.env.public-proxy', import.meta.url);
for (const line of (existsSync(configPath) ? readFileSync(configPath, 'utf8') : '').split(/\r?\n/)) {
  const match = line.match(/^(CLASH_PUBLIC_PROXY_FILE|HIBACHI_PROXY_FILE)=(.*)$/);
  if (match) process.env[match[1]] ||= match[2];
}
const { installPublicReadProxy, createPublicReadHandler } = require('../../server-futures/public-read-proxy.js');
const transport = installPublicReadProxy();
const publicReadHandler = createPublicReadHandler(transport);
const nado = require('../../server-futures/nado.js');
const routeSource = readFileSync(new URL('../../server-futures/routes.js', import.meta.url), 'utf8');
let candleRoute;
vm.runInNewContext(routeSource.slice(routeSource.indexOf("router.get('/candles',"), routeSource.indexOf("router.get('/pyth/history',")), {
  router: { get: (path, handler) => { candleRoute = handler; } }, nado,
});
const root = fileURLToPath(new URL('../', import.meta.url));
const entry = '/__nado-chart.jsx';
const mock = '/__nado-chart-deps.js';
let mode = 'live';
const fixture = {
  name: 'nado-chart-preview', enforce: 'pre',
  resolveId(id, importer) {
    if ([entry, mock].includes(id)) return id;
    if (importer?.endsWith('TradingViewWidget.jsx') && (id.startsWith('../lib/') || id.startsWith('../hooks/'))) return mock;
  },
  load(id) {
    if (id === mock) return `
      export const FUTURES_THEME_DARK = 'dark';
      export const useFuturesTheme = () => ({ theme: 'dark' });
      export const getReadClient = () => {};
      export const aptosFetchOptionsForKey = () => {};
      export const runWithAptosBrowserKeys = () => {};
      export const createPhoenixPublicWsClient = () => {};
      export const phoenixCandlesRoute = () => {};
      export const phoenixFetch = () => {};
      export const phoenixSymbol = () => {};
      export const pacificaFetch = () => {};
      export const OSTIUM_PRICE_STREAM_WS = '';
    `;
    if (id === entry) return `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import '/src/lib/publicReadFetch.js';
      import TradingViewWidget from '/src/components/TradingViewWidget.jsx';
      const markets = {BTC:['1',78500],PENGU:['0.000001',0.009],KPEPE:['0.000001',0.00367],KBONK:['0.000001',0.0029]};
      function App() {
        const [symbol,setSymbol] = useState('KPEPE');
        const [mode,setMode] = useState('live');
        const [probe,setProbe] = useState('');
        async function simulate(value) { await fetch('/__mode?value='+value); setMode(value); }
        async function checkPublic() {
          setProbe('Checking public RPC...');
          try {
          const response = await fetch('https://rpc-gel.inkonchain.com', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});
          const data = await response.json();
          setProbe('Ink chain: '+data.result+' · '+response.headers.get('x-clash-public-transport'));
          } catch (error) { setProbe('RPC test error: '+error.message); }
        }
        return <><header><h2>LOCAL Nado chart — public reads only</h2>
          <nav>{Object.keys(markets).map(s=><button key={s} onClick={()=>setSymbol(s)}>{s}</button>)}</nav>
          <p>{symbol} · source: native Nado archive · mode: {mode}</p>
          <button onClick={()=>simulate('error')}>Simulate outage</button>
          <button onClick={()=>simulate('empty')}>Simulate no history</button>
          <button onClick={()=>simulate('live')}>Restore live data</button>
          <button onClick={checkPublic}>Test public RPC relay</button><output>{probe}</output>
        </header><main><TradingViewWidget symbol={symbol} dex="nado" currentPrice={markets[symbol][1]} priceIncrement={markets[symbol][0]} /></main></>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/__proxy-stats') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(transport.stats())); return; }
      if (url.pathname === '/api/futures/public-read') {
        let input = '';
        for await (const chunk of req) { input += chunk; if (input.length > 65536) { res.statusCode=413; res.end(); return; } }
        req.body = JSON.parse(input);
        await publicReadHandler(req, {
          set(key,value) { res.setHeader(key,value); return this; },
          status(code) { res.statusCode=code; return this; },
          json(value) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); },
          send(value) { res.end(value); },
        });
        return;
      }
      if (url.pathname === '/__mode') {
        mode = ['error', 'empty'].includes(url.searchParams.get('value')) ? url.searchParams.get('value') : 'live';
        res.end(mode); return;
      }
      if (url.pathname === '/api/futures/candles') {
        res.setHeader('Content-Type', 'application/json');
        if (mode === 'error') { res.statusCode = 502; res.end('{"error":"Fixture unavailable"}'); return; }
        if (mode === 'empty') { res.end('[]'); return; }
        req.query = Object.fromEntries(url.searchParams);
        const response = {
          status(code) { res.statusCode = code; return this; },
          json(body) { res.end(JSON.stringify(body)); return this; },
        };
        await candleRoute(req, response);
        return;
      }
      if (url.pathname !== '/') return next();
      mode = 'live';
      const html = await server.transformIndexHtml(req.url, `<!doctype html><html><head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Local Nado chart verification</title>
        <style>:root{--terminal-surface:#111827;--terminal-border:#2c3748;--terminal-text-muted:#aab4c3;--terminal-brand-strong:#ff873e;--terminal-brand-soft:#442514;--terminal-loading-overlay:#111827a0}
        *{box-sizing:border-box}body{margin:0;background:#0c1320;color:#eee;font:14px Arial}
        header{padding:12px}h2{font-size:18px;margin:4px 0 12px}button{padding:8px;margin:3px;border:1px solid #495a73;border-radius:5px;background:#1a293e;color:#fff;min-height:44px}
        main{height:calc(100vh - 230px);min-height:350px;padding:8px}</style></head>
        <body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
    });
  },
};
const server = await createServer({ root, configFile: false, plugins: [fixture, react()],
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-dev-runtime', 'lightweight-charts'] },
  server: { host: '127.0.0.1', port: 5192, strictPort: true } });
await server.listen();
server.printUrls();
