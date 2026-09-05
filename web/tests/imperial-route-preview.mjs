// Local UI + actual Imperial hook/adapter fixture. Public quotes are live;
// order preflight/submission are mocked. No wallet keys or funded trades.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const imperial = require('../../server-futures/imperial.js');
const wallet = '11111111111111111111111111111111';
const root = fileURLToPath(new URL('../', import.meta.url));
const entry = '/__imperial-preview.jsx';
const mock = '/__imperial-deps.js';
const plugin = {
  name: 'imperial-preview', enforce: 'pre',
  resolveId(id, importer) {
    if ([entry, mock].includes(id)) return id;
    if (importer?.endsWith('/useImperial.js') && id !== 'react' && !id.includes('imperialOrderSide')) return mock;
  },
  load(id) {
    if (id === mock) return `
      const wallet = { publicKey: { toBase58: () => '${wallet}' } };
      const player = { token: 'local-preview', id: 'fixture' };
      const dex = { dex: 'imperial', setDex: () => {} };
      const connection = {};
      const scope = { capture: () => ({}), assert: () => {} };
      export const useConnection = () => connection;
      export const useWallet = () => wallet;
      export const useWallets = () => ({wallets: []});
      export const useSignMessage = () => ({});
      export const useSignTransaction = () => ({});
      export const VersionedTransaction = {};
      export default {};
      export const useDex = () => dex;
      export const usePlayer = () => player;
      export const useCredentialOperationScope = () => scope;
      export const IMPERIAL_APP_URL = '';
      export const clearImperialSession = async () => {};
      export const saveImperialSession = async () => ({});
      export const ensureImperialDexAccount = async () => ({serverDex:'imperial'});
      export const readImperialSession = async () => ({jwt:'fixture',wallet:'${wallet}'});
      export async function fetchImperialJson(path, options = {}) {
        const url = new URL(path, location.origin);
        const response = await fetch('/__fixture' + url.pathname + url.search, {
          method: options.method || 'GET', headers: {'content-type':'application/json'},
          body: options.body ? JSON.stringify(options.body) : undefined
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      }
    `;
    if (id === entry) return `
      import React, {useEffect, useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import ImperialRouteCard from '/src/components/trading/ImperialRouteCard.jsx';
      import {useImperial} from '/src/hooks/useImperial.js';
      function App() {
        const api = useImperial();
        const [lev, setLev] = useState(50);
        const [type, setType] = useState('market');
        const [result, setResult] = useState(null);
        useEffect(() => { api.previewImperialRoute({symbol:'SOL',side:'bid',notional:100,leverage:lev}); }, [api.previewImperialRoute,lev]);
        async function order(side) {
          const options = {notional_usd:100, market_price:100};
          const result = type === 'market'
            ? await api.placeMarketOrder('SOL',side,100/lev,'0.5',lev,options)
            : await api.placeLimitOrder('SOL',side,90,100/lev,'GTC',lev,options);
          setResult(result);
        }
        return <main>
          <div className="chart"><span>SOL / USD · chart area</span><svg viewBox="0 0 360 100"><path d="M0 85 L30 65 L55 76 L90 45 L115 60 L150 40 L190 48 L220 20 L260 34 L300 10 L360 25" fill="none" stroke="#3bcf9c" strokeWidth="2"/></svg></div>
          <ImperialRouteCard quote={api.imperialRoutePreview} notional={100} requestedLeverage={lev}
            pinnedVenue={api.imperialPinnedVenue} onVenueChange={api.setImperialPinnedVenue}
            excludedVenues={api.imperialExcludedVenues} onExcludedVenuesChange={api.setImperialExcludedVenues}
            profileIndex={api.imperialProfileIndex} onProfileChange={api.setImperialProfileIndex}/>
          <nav>{['market','limit'].map(v=><button aria-pressed={type===v} key={v} onClick={()=>setType(v)}>{v==='market'?'Market':'Limit'}</button>)}</nav>
          <label>Leverage <input aria-label="Leverage" type="number" value={lev} onChange={e=>setLev(Number(e.target.value))}/></label>
          <p>Position size $100 · margin ${'$'}{(100/lev).toFixed(2)}</p>
          <div className="actions"><button onClick={()=>order('bid')}>Long (simulated)</button><button onClick={()=>order('ask')}>Short (simulated)</button></div>
          <p>Local verification. Public route reads; simulated orders only.</p>
          <pre aria-label="Order result">{result ? JSON.stringify(result,null,2) : ''}</pre>
        </main>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `;
  },
  configureServer(server) {
    server.middlewares.use(async (req,res,next) => {
      if (req.url.startsWith('/__fixture')) {
        res.setHeader('content-type','application/json');
        try {
          const url = new URL(req.url.replace('/__fixture',''), 'http://localhost');
          let raw=''; for await (const chunk of req) raw+=chunk;
          const body = raw ? JSON.parse(raw) : {};
          let result = {};
          if (url.pathname.endsWith('/route')) result = await imperial.getRoute(Object.fromEntries(url.searchParams));
          else if (url.pathname.endsWith('/snapshot')) result = {account:{equity:100,available_to_spend:100},marks:[{symbol:'SOL',price:100,venue:'phoenix'}]};
          else if (url.pathname.endsWith('/orders') && req.method === 'POST') {
            let wire;
            const route = await imperial.getRoute({ ...body, notional:body.notionalUsd });
            result = await imperial.placeOrder({owner:wallet,playerId:'fixture',jwt:'fixture',body,
              fetchImpl:async (target,options={}) => {
                const path = new URL(target).pathname;
                let data;
                if (path.endsWith('/mobile/builder/summary')) data={active:true};
                else if (path.endsWith('/route')) data=route;
                else if (path.endsWith('/mobile/orders/preflight')) data={ok:true};
                else if (path.endsWith('/mobile/orders')) { wire=JSON.parse(options.body); data={success:true}; }
                else throw new Error('Unexpected fixture request: '+path);
                return {ok:true,status:200,text:async()=>JSON.stringify(data)};
              }});
            result = {success:result.success,clientSide:body.side,selectedVenue:body.pinnedUnderwriter,
              excludedVenues:body.excludedVenues,wire};
          }
          res.end(JSON.stringify(result));
        } catch (error) { res.statusCode=error.status||500; res.end(JSON.stringify({error:error.message})); }
        return;
      }
      if (req.url === '/' || req.url.startsWith('/?')) {
        res.setHeader('content-type','text/html');
        res.end(await server.transformIndexHtml(req.url, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Imperial local verification</title>
        <style>:root{--terminal-text:#e6edf7;--terminal-text-muted:#96a3b6;--terminal-surface:#111821;--terminal-surface-raised:#1b2531;--terminal-border:#2b3948;--terminal-long:#37d399;}
        body{margin:0;background:#090d13;color:#e6edf7;font:14px system-ui;}main{max-width:390px;margin:24px auto;padding:12px;box-sizing:border-box;}body.wide main{max-width:760px;}
        .chart{height:190px;display:flex;flex-direction:column;justify-content:space-between;border-bottom:1px solid #293447;margin-bottom:8px;color:#9ba9b9;padding:10px;}nav{display:flex;margin:10px 0;}nav button{flex:1;}
        nav button,.actions button{border:1px solid #314052;background:#17212d;color:#dce6f4;padding:12px;border-radius:8px;cursor:pointer;}nav button[aria-pressed=true]{border-color:#ff873e;}
        label input{width:70px;background:#18222e;color:white;padding:8px;border:1px solid #314052;}p{color:#96a3b6;font-size:12px;}
        .actions{display:flex;gap:8px;}.actions button{flex:1;}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;}</style></head>
        <body><div id="root"></div><script>if(location.search.includes('wide'))document.body.className='wide'</script><script type="module" src="${entry}"></script></body></html>`));
        return;
      }
      next();
    });
  }
};
const server=await createServer({root,configFile:false,plugins:[plugin,react()],
  optimizeDeps:{noDiscovery:true,include:['react','react-dom/client'],entries:[]},
  server:{host:'127.0.0.1',port:5187,strictPort:true},define:{'import.meta.env.VITE_PRIVY_APP_ID':'""'}});
await server.listen();
console.log('Imperial UI verification: http://127.0.0.1:5187');
