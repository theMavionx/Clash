// Local UI/connection harness: real hook, encrypted browser storage and signatures.
// All exchange reads/writes below are in-memory doubles; no Lighter transaction is sent.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createLighterOnboarding } = require('../../server-futures/lighter-onboarding.js');
const { privateKeyToAccount } = require('../../server-futures/node_modules/viem/accounts');
const ownerKey = '0x' + 'ab'.repeat(32); // Disposable local fixture identity, never funded.
const owner = privateKeyToAccount(ownerKey).address;
const root = fileURLToPath(new URL('../', import.meta.url));
const keys = new Map();
let approved = false, sends = 0, single = false;
const key = '0x' + '34'.repeat(40), pub = '0x' + '56'.repeat(40);
const service = createLighterOnboarding({
  getProfile: () => ({dexId:'lighter',api:'https://lighter.local.invalid',chainId:304}),
  pause:async()=>{},
  request:async path => {
    const url=new URL(path,'https://lighter.local.invalid');
    const index=Number(url.searchParams.get('value') || url.searchParams.get('account_index'));
    if(url.pathname.endsWith('/accountsByL1Address')) return {sub_accounts:(single?[42]:[42,55]).map(index=>({index,l1_address:owner,account_type:index===42?'Main':'Sub-account'}))};
    if(url.pathname.endsWith('/account')) return {accounts:[{index,account_index:index,l1_address:owner}]};
    if(url.pathname.endsWith('/apikeys')) return {api_keys:keys.get(index)||[]};
    if(url.pathname.endsWith('/nextNonce')) return {nonce:0};
    throw new Error('Unexpected local fixture read');
  },
  runSigner:async(action,data)=>{
    if(action==='api_key_prepare') return {ok:true,api_private_key:key,public_key:pub,tx_type:8,tx_hash:'local',
      message_to_sign:'LOCAL TEST ONLY: register Lighter key on account '+data.account_index,
      tx_info:JSON.stringify({AccountIndex:data.account_index,ApiKeyIndex:data.api_key_index,Nonce:0,PubKey:Buffer.from(pub.slice(2),'hex').toString('base64'),ExpiredAt:Date.now()+300000})};
    if(action==='send_tx'){sends++;keys.set(data.account_index,[{api_key_index:data.api_key_index,public_key:pub}]);return {ok:true};}
    if(action==='check_client')return {ok:true};
    throw new Error('Unexpected fixture signer action');
  },
});
const deps='/__lighter-deps.js',entry='/__lighter-preview.jsx';
const plugin={
  name:'lighter-local-preview',enforce:'pre',
  resolveId(id,importer){
    if([deps,entry].includes(id))return id;
    if(importer?.endsWith('useLighter.js') && (id.includes('/contexts/')||id==='./useGodot'||id.endsWith('/lighterClient')))return deps;
  },
  load(id){
    if(id===deps)return `
      import React,{useContext} from 'react';
      export const Context=React.createContext(null);
      export const useDex=()=>({dex:'lighter'});
      export const usePlayer=()=>({player_id:'local-player',token:'local-fixture-token'});
      export const useEvmWallet=()=>useContext(Context);
      export const LIGHTER_BROWSER_API='';export const RH_LIGHTER_BROWSER_API='';
      export const fetchLighterMarketsDirect=async()=>[{symbol:'BTC'}];
      export const fetchLighterPricesDirect=async()=>({BTC:{symbol:'BTC',price:1}});
    `;
    if(id===entry)return `
      import React,{useState,useMemo} from 'react';
      import {createRoot} from 'react-dom/client';
      import {privateKeyToAccount} from 'viem/accounts';
      import {Context} from '${deps}';
      import {useLighter} from '/src/hooks/useLighter.js';
      import LighterOneTapConnect from '/src/components/LighterOneTapConnect.jsx';
      const account=privateKeyToAccount('${ownerKey}');
      function View(){
        const hook=useLighter();
        return <><h2>Connect Lighter</h2><output aria-label="Connection status">{hook.setupVerified?'Verified and ready':hook.connected?'Key connected; checking approvals':'Not connected'}</output>
          <LighterOneTapConnect label="Lighter" wallet={account.address} connect={hook.connectOneTap} status={hook.lighterConnectStatus} referralCode="CLASHOFPERPS"/>
          <button onClick={()=>hook.disconnect()}>Clear local connection</button>
          <p>Account: {hook.lighterCredentials?.accountIndex??'none'}</p><p role="status">{hook.error}</p></>;
      }
      function App(){
        const [reject,setReject]=useState(false);
        const wallet=useMemo(()=>({address:account.address,getWalletClient:()=>({signMessage:async ({message})=>{
          if(reject)throw Object.assign(new Error('User rejected'),{code:4001});
          return account.signMessage({message});
        }})}),[reject]);
        return <><header><h1>LOCAL · Lighter one-tap test</h1><p>No exchange transactions. Wallet signatures use a disposable test identity.</p>
          <label><input type="checkbox" checked={reject} onChange={e=>setReject(e.target.checked)}/>Reject wallet signatures</label></header>
          <main><Context.Provider value={wallet}><View/></Context.Provider></main></>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `;
  },
  configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname==='/'){res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml('/',`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>
      :root{--terminal-text:#eef0fa;--terminal-text-muted:#c1c5d0;--terminal-text-faint:#abb0bf;--terminal-surface-subtle:#18212f;--terminal-border:#3c4656}
      body{margin:0;background:#0c111a;color:#eef0fa;font-family:system-ui}header{padding:20px;max-width:700px;margin:auto}header p{font-size:13px;color:#aab4c4}
      main{box-sizing:border-box;width:calc(100% - 24px);max-width:450px;margin:16px auto;padding:24px;background:#151e2b;border:1px solid #344157;border-radius:18px}
      button{min-height:44px;margin:8px 0}output{display:block;margin-bottom:18px;color:#49dfb1}h2{text-align:center}</style></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`));return;}
      if(!url.pathname.startsWith('/api/'))return next();
      try{
        let raw='';for await(const chunk of req)raw+=chunk;
        const body=raw?JSON.parse(raw):{};
        const path=url.pathname.replace('/api/futures/lighter','');
        let data;
        if(path==='/accounts')data=await service.discover(url.searchParams.get('wallet'));
        else if(path==='/api-key/prepare')data=await service.prepare({playerId:'local-player',...body});
        else if(path==='/api-key/submit')data=await service.submit({playerId:'local-player',...body});
        else if(path==='/api-key/recover')data=await service.recover(body);
        else if(path==='/credentials/check')data={ok:true};
        else if(path==='/auth-token')data={auth_token:'fixture-read-token'};
        else if(path==='/config')data={integratorReady:true,builderFeeBps:1};
        else if(path==='/account')data={account_index:Number(url.searchParams.get('account_index')||42),l1_address:owner,integrator_approved:approved,positions:[],balance:0};
        else if(path==='/referral/status'||path==='/referral/use')data={checked:true,has_referral:true,used_code:'EXISTING',referral_satisfied:true};
        else if(path==='/approve-integrator/prepare')data={message_to_sign:'LOCAL TEST ONLY: approve Clash routing',tx_type:1,tx_info:'{}',tx_hash:'fixture',requires_l1_signature:true};
        else if(path==='/approve-integrator/submit'){approved=true;data={ok:true};}
        else if(path==='/orders')data=[];
        else if(path==='/__stats')data={sends,accounts:keys.size};
        else data={gold:0,inserted:0,reason:'local fixture'};
        res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));
      }catch(e){res.statusCode=e.status||500;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:e.message,code:e.code}));}
    });
  },
};
const server=await createServer({root,configFile:false,plugins:[plugin,react()],
  optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-dev-runtime','viem/accounts']},
  server:{host:'127.0.0.1',port:5193,strictPort:true}});
await server.listen();
console.log('Lighter local preview http://127.0.0.1:5193 (no real exchange writes)');
