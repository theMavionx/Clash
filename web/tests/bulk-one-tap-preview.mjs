// Actual useBulk + one-tap dialog. Test keys, mock vault and local exchange only.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
process.env.CLASH_FUTURES_DB = path.join(os.tmpdir(), `bulk-browser-${process.pid}.sqlite`);
process.env.BULK_BUILDER_ENABLED = '0';
const bulk = require('../../server-futures/bulk.js');
const nacl = require('../../server-futures/node_modules/tweetnacl');
const b58 = require('../../server-futures/node_modules/bs58'); const bs58 = b58.default || b58;
const owner = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(37));
const account = bs58.encode(owner.publicKey);
let grants = [], remaining = .000609, calls = [], rejectClose = false;
const root = fileURLToPath(new URL('../', import.meta.url));
const entry = '/__bulk-audit.jsx';
const mocks = {
  wallet: `import {ed25519} from '@noble/curves/ed25519';const seed=new Uint8Array(32).fill(37);export const useWallet=()=>({publicKey:{toBase58:()=>${JSON.stringify(account)}},signMessage:async bytes=>{window.fixtureOwnerPrompts=(window.fixtureOwnerPrompts||0)+1;return ed25519.sign(bytes,seed);}});`,
  player: `export const usePlayer=()=>({id:'fixture-player',token:'fixture-only'});`,
  dex: `export const useDex=()=>({dex:'bulk'});`,
  privy: `export const useSignMessage=()=>({});export const useWallets=()=>({wallets:[]});`,
  vault: `const records=new Map(),scope={};export const captureCredentialScope=()=>scope;export const assertCredentialScope=s=>{if(s!==scope)throw Error('scope');};export const readEncryptedCredential=async key=>records.get(key)||null;export const writeEncryptedCredential=async(key,value)=>{records.set(key,structuredClone(value));};`,
};
const plugin = { name: 'bulk-local-fixture', enforce: 'pre',
  resolveId(id, importer) {
    if (id === entry || id.startsWith('virtual:bulk-')) return id;
    if (!importer?.replaceAll('\\', '/').endsWith('/hooks/useBulk.js')) return;
    if (id === '@solana/wallet-adapter-react') return 'virtual:bulk-wallet';
    if (id === '@privy-io/react-auth/solana') return 'virtual:bulk-privy';
    if (id.includes('useGodot')) return 'virtual:bulk-player';
    if (id.includes('DexContext')) return 'virtual:bulk-dex';
    if (id.includes('encryptedCredentialStorage')) return 'virtual:bulk-vault';
  },
  load(id) {
    if (id.startsWith('virtual:bulk-')) return mocks[id.slice('virtual:bulk-'.length)];
    if (id !== entry) return;
    return `import React from 'react';import{createRoot}from'react-dom/client';import{useBulk}from'/src/hooks/useBulk.js';import BulkOneTapControl from '/src/components/trading/BulkOneTapControl.jsx';
      function App(){const h=useBulk(),p=h.positions[0];return <main><h1>BULK local one-tap / Close QA</h1><p>Mock exchange and test keys only.</p>
       <BulkOneTapControl state={h.oneTapTrading} setEnabled={h.setOneTapTradingEnabled} revoke={h.revokeOneTapTrading} reload={h.reloadOneTapTrading}/>
       <p>Position: {p?p.amount:'none'} BTC</p><p>Owner prompts: {window.fixtureOwnerPrompts||0}</p>
       <button disabled={!p||h.loading} onClick={()=>h.closePosition(p.symbol,p.side,String(p.amount/2),p.pair_index,p.trade_index,false)}>Close half by market</button>
       <button disabled={!p||h.loading} onClick={()=>h.closePosition(p.symbol,p.side,String(p.amount),p.pair_index,p.trade_index,true)}>Close all by market</button>
       <button onClick={async()=>{await fetch('/__reject',{method:'POST'});}}>Reject next close (fixture)</button>
       <p role="alert">{h.error}</p><output>{JSON.stringify({ready:h.accountReady,agent:h.oneTapTrading})}</output></main>};createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url === '/') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(await server.transformIndexHtml('/', `<!doctype html><title>BULK QA</title><style>:root{--terminal-bg:#0b121c;--terminal-surface:#111827;--terminal-text:#e5eaf2;--terminal-text-muted:#9faec4;--terminal-border:#344154}body{background:#0b121c;color:#e5eaf2;font:14px system-ui;margin:16px}main{max-width:650px}button{margin:4px}output{display:block;overflow-wrap:anywhere}h1{font-size:18px}</style><div id="root">Loading fixture…</div><pre id="fixture-errors"></pre><script>addEventListener('error',e=>document.getElementById('fixture-errors').textContent+=e.message+'\\n');addEventListener('unhandledrejection',e=>document.getElementById('fixture-errors').textContent+=String(e.reason)+'\\n');</script><script type="module" src="${entry}"></script>`)); return;
      }
      if (!req.url.startsWith('/api/') && !['/__trace', '/__reject'].includes(req.url)) return next();
      res.setHeader('content-type', 'application/json');
      let data = ''; for await (const chunk of req) data += chunk;
      const body = data ? JSON.parse(data) : {};
      try {
        if (req.url === '/__reject') { rejectClose = true; res.end('{}'); return; }
        if (req.url === '/__trace') { res.end(JSON.stringify({ calls, grants, remaining })); return; }
        if (req.url.includes('/dex-accounts/')) { res.end(JSON.stringify({ player: { dex: 'bulk' } })); return; }
        if (req.url.includes('/bulk/config')) { res.end(JSON.stringify(bulk.config())); return; }
        if (req.url.includes('/bulk/builder-status')) { res.end(JSON.stringify({ approved: true, builder_enabled: false })); return; }
        if (req.url.includes('/bulk/account')) {
          res.end(JSON.stringify({ authorizedAgentWallets: grants, margin: { totalMargin: 5 }, positions: remaining ? [{ symbol: 'BTC-USD', size: remaining, price: 79795.4, fairPrice: 79781, leverage: 20, iso: false }] : [] })); return;
        }
        if (req.url.includes('/bulk/prepare')) { res.end(JSON.stringify(bulk.prepareTransaction(account, body))); return; }
        if (req.url.includes('/bulk/submit')) {
          const tx = body.transaction, verified = bulk.verifyTransaction(tx);
          if (verified.signer !== account && !grants.includes(verified.signer)) throw Error('Unregistered fixture agent');
          calls.push({ signer: tx.signer, actions: tx.actions });
          for (const action of tx.actions) {
            if (action.agentWalletCreation) grants = action.agentWalletCreation.d ? [] : [action.agentWalletCreation.a];
            if (action.m) {
              if (rejectClose) { rejectClose = false; throw Error('Fixture exchange rejected close'); }
              if (!action.m.r || action.m.b || action.m.c !== 'BTC-USD') throw Error('Unsafe close request');
              remaining = Math.max(0, Math.round((remaining - Number(action.m.sz)) * 1e8) / 1e8);
            }
          }
          res.end(JSON.stringify({ success: true })); return;
        }
        if (req.url.includes('/markets') || req.url.includes('/prices')) { res.end(JSON.stringify([{ symbol: 'BTC', price: 79781, lot_size: .000001 }])); return; }
        res.end('{}');
      } catch (error) { res.statusCode = 422; res.end(JSON.stringify({ error: error.message })); }
    });
  },
};
const server = await createServer({ root, configFile: false, plugins: [plugin, react()],
  server: { host: '127.0.0.1', port: 5192, strictPort: true }, define: { 'import.meta.env.VITE_PRIVY_APP_ID': '""' } });
await server.listen(); console.log('BULK QA http://127.0.0.1:5192');
