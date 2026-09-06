// Real React trading hooks; wallet/session/API boundaries are local test doubles.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const entry = '/__reward-fixture.jsx';
const mocks = {
  wallet: `export const useWallet=()=>({publicKey:{toBase58:()=>window.fixture.identity.wallet}});export const useConnection=()=>({connection:{}});`,
  privy: `export const useSignMessage=()=>({});export const useSignTransaction=()=>({});export const useWallets=()=>({wallets:[]});`,
  player: `export const usePlayer=()=>({id:window.fixture.identity.playerId,token:window.fixture.identity.token});`,
  dex: `const setDex=()=>{};export const useDex=()=>({dex:window.fixture.identity.dex,setDex});`,
  bulkWallet: `export const signBulkMessage=async()=>new Uint8Array(64);`,
  oneTap: `export const createBulkOneTap=()=>({state:()=>({}),signer:()=>null,load:async()=>{}});`,
  vault: `export const captureCredentialScope=()=>({});export const assertCredentialScope=()=>{};export const readEncryptedCredential=async()=>null;export const writeEncryptedCredential=async()=>{};`,
  scope: `import {useCallback} from 'react';export function useCredentialOperationScope(){const key=JSON.stringify(window.fixture.identity);const capture=useCallback(()=>key,[key]);const assert=useCallback(value=>{if(value!==JSON.stringify(window.fixture.identity))throw Error('Stale scope');},[key]);return{capture,assert};}`,
  stream: `export const openImperialStream=()=>()=>{};`,
  imperialClient: `export const IMPERIAL_APP_URL='';export const readImperialSession=async wallet=>({wallet,jwt:window.fixture.identity.jwt});export const clearImperialSession=async()=>{};export const saveImperialSession=async(w,v)=>v;export const ensureImperialDexAccount=async()=>({selected:{player:{dex:'imperial'}}});export const fetchImperialJson=async(url,options={})=>{const r=await fetch(url,{...options,body:JSON.stringify(options.body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};`,
};

const fixtureCode = `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{useBulk}from'/src/hooks/useBulk.js';import{useImperial}from'/src/hooks/useImperial.js';
import{installClock,runRewardTests}from'/tests/trading-gold-browser.mjs';
window.fixture={identity:{dex:'bulk',wallet:'11111111111111111111111111111111',playerId:'player-a',token:'token-a',jwt:'jwt-a'},calls:[],bridges:[],syncs:[],ledger:new Map(),fills:[],reject:false,claimError:false,hold:false,pending:[],cap:false,holdResources:false,pendingResources:[]};
installClock(window.fixture);
window.onGodotMessage=message=>{if(message.action==='resources_add')window.fixture.bridges.push(message);if(message.action==='resources')window.fixture.syncs.push(message);};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
window.fetch=async(url,options={})=>{
 const f=window.fixture,path=String(url),body=options.body?JSON.parse(options.body):{};
 f.calls.push({path,body,headers:options.headers});
 if(path.endsWith('/resources')){const response={gold:777,wood:888,ore:999};if(f.holdResources)return new Promise(resolve=>f.pendingResources.push(()=>resolve(json(response))));return json(response);}
 if(path.endsWith('/trading/claim-gold')){
   if(f.claimError){f.claimError=false;return json({error:'Temporary claim failure'},503);}
   const key=options.headers['x-token']+':'+body.dex,seen=f.ledger.get(key)||new Set();
   let amount=0;for(const fill of f.fills){if(fill.dex===body.dex&&!seen.has(fill.id)){seen.add(fill.id);amount+=fill.gold;}}
   f.ledger.set(key,seen);const response={dex:body.dex,gold:f.cap?0:amount,earned_gold:amount,pending_gold:f.cap?amount:0,reason:'Verified trading reward'};
   if(f.hold)return new Promise(resolve=>f.pending.push(()=>resolve(json(response))));
   return json(response);
 }
 if(path.includes('/dex-accounts/'))return json({player:{dex:'bulk'}});
 if(path.includes('/bulk/config'))return json({network:'mainnet',builder_enabled:false,one_tap_supported:false});
 if(path.includes('/builder-status'))return json({approved:true,builder_enabled:false});
 if(path.includes('/bulk/account'))return json({margin:{totalMargin:100},positions:[]});
 if(path.includes('/bulk/prepare'))return json({network:'mainnet',signature_mode:'raw',message_base64:btoa('fixture'),transaction:{account:body.account,signer:body.signer,actions:[]}});
 if(path.includes('/bulk/submit')||path.endsWith('/imperial/orders')){if(f.reject){f.reject=false;return json({error:'Rejected fixture trade'},422);}return json({success:true});}
 if(path.includes('/imperial/config'))return json({});
 if(path.includes('/imperial/snapshot'))return json({positions:[],orders:[],prices:[{symbol:'BTC',price:100}]});
 if(path.includes('/markets')||path.includes('/prices'))return json([{symbol:'BTC',price:100,lot_size:.001}]);
 return json({});
};
function App(){const[,rerender]=useState(0);const bulk=useBulk(),imperial=useImperial();const hook=window.fixture.identity.dex==='bulk'?bulk:imperial;
 window.fixture.hook=hook;window.fixture.render=()=>rerender(x=>x+1);
 return <output>{JSON.stringify({ready:hook.accountReady||hook.setupVerified,gold:hook.goldEarned,error:hook.error})}</output>;}
const root=createRoot(document.getElementById('root'));window.fixture.unmount=()=>root.unmount();root.render(<React.StrictMode><App/></React.StrictMode>);
document.getElementById('run').onclick=()=>runRewardTests(window.fixture);
`;

/** Start an isolated local browser fixture without exchange or database access. */
export async function createRewardFixture() {
  const plugin = { name: 'reward-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if (id === entry || id.startsWith('virtual:reward-')) return id;
      if (!/\/hooks\/use(Bulk|Imperial)\.js$/.test(importer?.replaceAll('\\', '/') || '')) return;
      const map = { '@solana/wallet-adapter-react': 'wallet', '@privy-io/react-auth/solana': 'privy',
        './useGodot': 'player', '../contexts/DexContext': 'dex', '../lib/bulkWallet': 'bulkWallet',
        '../lib/bulkOneTap': 'oneTap', '../lib/encryptedCredentialStorage': 'vault',
        './useCredentialOperationScope': 'scope', '../lib/imperialStream': 'stream', '../lib/imperialClient': 'imperialClient' };
      if (map[id]) return `virtual:reward-${map[id]}`;
    },
    load(id) { if (id === entry) return fixtureCode; if (id.startsWith('virtual:reward-')) return mocks[id.slice(15)]; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/') return next();
        res.setHeader('content-type', 'text/html');
        res.end(await server.transformIndexHtml('/', `<!doctype html><title>Trading Gold Hook QA</title><h1>Trading Gold Hook QA</h1><p>Real React hooks; local mock wallet, exchange and reward ledger only.</p><button id="run">Run reward regression tests</button><pre id="results">Ready</pre><div id="root"></div><script type="module" src="${entry}"></script>`));
      });
    },
  };
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
    plugins: [plugin, react()], server: { host: '127.0.0.1', port: 5193, strictPort: true },
    define: { 'import.meta.env.VITE_PRIVY_APP_ID': '""' } });
  await server.listen();
  return server;
}

if (process.argv.includes('--serve')) {
  await createRewardFixture();
  console.log('Trading Gold Hook QA http://127.0.0.1:5193');
}
