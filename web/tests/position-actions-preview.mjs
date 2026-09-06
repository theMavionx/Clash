// Real PositionsList, BottomPanel and OpenTpslEditor; all action handlers are
// local stubs. No wallets, sessions, trading hooks or remote order writes run.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const entry='/__position-actions.jsx';
const plugin={name:'position-action-verification',enforce:'pre',
 transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/components/FuturesPanel.jsx'))return code+'\nexport {BottomPanel,PositionsList,OpenTpslEditor};';},
 resolveId(id){if(id===entry)return id;},
 load(id){if(id!==entry)return;return `
  import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {BottomPanel,PositionsList,OpenTpslEditor} from '/src/components/FuturesPanel.jsx';
  const position={dex:'imperial',source:'imperial',symbol:'BTC',side:'bid',amount:0.010600000000077681,size_usd:846.0401,entry_price:79815.103773,mark_price:79820,margin:4.135005,unrealized_pnl:-.2661395886,pnl_pct:-6.44,leverage:190.74,is_isolated:true,pair_index:2,trade_index:'fixture:phoenix',pnl_includes_fees:true};
  function App(){const [layout,setLayout]=useState('table'),[alert,setAlert]=useState(''),[calls,setCalls]=useState([]),[enabled,setEnabled]=useState(false),[tp,setTp]=useState(''),[sl,setSl]=useState(''),[mode,setMode]=useState('price'),[side,setSide]=useState('bid');
   const base={positions:[position],orders:[],prices:[],dataReady:true,leverageSettings:{},marginModes:{},loading:false,error:null,localAlert:alert,setLocalAlert:setAlert,clearError:()=>setAlert(''),dex:'imperial',markets:[],account:{},
    closePosition:async(...args)=>{setCalls(rows=>[...rows,{action:'close',args}]);return{success:true};},
    setTpsl:async(...args)=>{setCalls(rows=>[...rows,{action:'tpsl',args}]);return{error:'Simulated rejection: check trigger price'};}};
   return <main><h1>Position actions · local verification</h1><p>No trading requests. Calls: {calls.length}</p><nav>{['table','cards','order'].map(value=><button key={value} onClick={()=>{setAlert('');setLayout(value);}}>{value}</button>)}</nav>
    {layout==='table'?<BottomPanel {...base} bottomH={300} bottomTab="positions" setBottomTab={()=>{}} showFilter={false} setShowFilter={()=>{}} btmFilters={{}} setBtmFilters={()=>{}} btmSymbols={[]} sortOptionsForTab={[]} hasActiveFilters={false} filteredPositions={[position]} filteredOrders={[]}/>:
     layout==='cards'?<PositionsList {...base} isBasic={false}/>:<OpenTpslEditor enabled={enabled} onEnabledChange={setEnabled} mode={mode} onModeChange={setMode} previewSide={side} onPreviewSideChange={setSide} tpValue={tp} slValue={sl} onTpChange={setTp} onSlChange={setSl} pos={position} metrics={{entryP:79815,markP:79820,margin:4.135005,amt:position.amount,setLev:190.74}} dex="imperial" orderType="market"/>}
    <output aria-label="Action trace">{JSON.stringify(calls)}</output><p>Attach protection: {enabled?'enabled':'disabled'}</p></main>;
  }createRoot(document.getElementById('root')).render(<App/>);`;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url!=='/'&& !req.url?.startsWith('/?'))return next();res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml('/',`<!doctype html><html><head><title>Position actions QA</title><style>:root{--terminal-bg:#0b121c;--terminal-surface:#111827;--terminal-text:#e5eaf2;--terminal-text-muted:#9faec4;--terminal-long:#39dca6;--terminal-short:#ff6d78;--terminal-border:#344154;--terminal-warning:#fa983f}body{background:#0b121c;color:#e5eaf2;font:14px system-ui;margin:20px}main{max-width:1200px}nav{display:flex;gap:10px;margin-bottom:20px}button{cursor:pointer}output{display:block;overflow-wrap:anywhere;margin-top:20px}h1{font-size:18px}</style></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`));});}
};
const server=await createServer({root,configFile:false,plugins:[plugin,react()],server:{host:'127.0.0.1',port:5191,strictPort:true},define:{'import.meta.env.VITE_PRIVY_APP_ID':'""'}});
await server.listen();console.log('Position action QA: http://127.0.0.1:5191');
