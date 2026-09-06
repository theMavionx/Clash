// Local-only browser fixture: actual admin diagnostics and production CSS.
// No credentials, upstream reads, wallet calls, orders or reward mutations.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entryId = '/__trading-diagnostics-preview.jsx';
const observed = '2026-09-06T12:30:00Z';
const rewards = { status: 'available', accounts: 2, paid_gold: 1400, pending_gold: 250, earned_gold: 1650 };
const claims = { status: 'available', attempts: 4, last_claim_at: observed,
  recent: [{ result: 'paid', credited_trade_count: 3, total_gold_paid: 1000 }] };
const rows = [
  { dex: 'bulk', title: 'BULK · builder disabled', builder_enabled: false,
    address: 'Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9', builder_recipient_readiness: 'unverified',
    builder_fee_bps: 1, effective_builder_fee_bps: 0, exact: false, trades: 0, volume_usd: 0, estimated_fee_usd: 0,
    trading_diagnostics: { observed_at: observed, read_only: true, rewards, claims,
      executions: { status: 'available', trades: 8, volume_usd: 2845.75,
        signer_evidence: 'server_verified_order_signer', signer_breakdown: [
          { signer_mode: 'one_tap', trades: 3 }, { signer_mode: 'owner', trades: 4 }, { signer_mode: 'unknown', trades: 1 }] },
      submissions: { status: 'available', orders: 11, signer_evidence: 'server_verified_order_signer',
        signer_breakdown: [{ signer_mode: 'one_tap', orders: 5 }, { signer_mode: 'owner', orders: 5 }, { signer_mode: 'unknown', orders: 1 }] } } },
  { dex: 'imperial', title: 'IMPERIAL · active builder', builder_code: 'CLASH', builder_status: 'active',
    builder_recipient_readiness: 'unverified', exact: true, earned_usd: 0.025734, trades: 4, volume_usd: 489.5,
    trading_diagnostics: { observed_at: observed, read_only: true,
      rewards: { status: 'available', accounts: 0, paid_gold: 0, pending_gold: 0, earned_gold: 0 },
      claims: { status: 'available', attempts: 0, last_claim_at: null, recent: [] },
      executions: { status: 'available', trades: 4, volume_usd: 489.5, signer_evidence: 'not_recorded' },
      submissions: { status: 'available', orders: 7, signer_evidence: 'not_recorded' } } },
  { dex: 'imperial', title: 'IMPERIAL · unavailable data', builder_code: 'CLASH', builder_status: 'unavailable', exact: false,
    trading_diagnostics: { observed_at: observed, read_only: true,
      executions: { status: 'unavailable' }, submissions: { status: 'unavailable' },
      rewards: { status: 'unavailable' }, claims: { status: 'unavailable' } } },
];

const plugin = {
  name: 'trading-diagnostics-local-preview', enforce: 'pre',
  resolveId(id) { if (id === entryId) return id; },
  load(id) {
    if (id !== entryId) return;
    return `import React, {useEffect} from 'react';
      import {createRoot} from 'react-dom/client';
      import TradingDiagnostics from '/src/admin/TradingDiagnostics.jsx';
      import '/src/admin/admin.css';
      const rows = ${JSON.stringify(rows)};
      function Preview() {
        useEffect(() => { if (new URLSearchParams(location.search).get('open') === '1')
          document.querySelectorAll('details').forEach(node => { node.open = true; }); }, []);
        return <main className="admin-app" style={{overflow:'auto',padding:20}}>
          <h1 className="admin-card-title">LOCAL — Trading / builder / Gold diagnostics</h1>
          <p className="admin-card-sub">Deterministic fixture data. No exchange requests or financial actions.</p>
          <div className="earnings-card-grid">{rows.map((row,index) =>
            <section className="earnings-card" key={index} style={{'--earnings-accent':row.dex==='bulk'?'#38bdf8':'#d7b36b'}}>
              <h2 className="earnings-dex">{row.title}</h2>
              <TradingDiagnostics row={row}/>
            </section>)}</div>
        </main>;
      }
      createRoot(document.getElementById('admin-root')).render(<Preview/>);`;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.startsWith('/api/')) {
        res.statusCode = 403;
        res.end('Network APIs are disabled in this local fixture');
        return;
      }
      if (req.url?.split('?')[0] !== '/') return next();
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5194; img-src 'self' data:");
      res.end(await server.transformIndexHtml('/', `<!doctype html><html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>LOCAL trading diagnostics</title></head><body><div id="admin-root"></div>
        <script type="module" src="${entryId}"></script></body></html>`));
    });
  },
};
const server = await createServer({ root, configFile: false, plugins: [plugin, react()],
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime'] },
  server: { host: '127.0.0.1', port: 5194, strictPort: true } });
await server.listen();
server.printUrls();
