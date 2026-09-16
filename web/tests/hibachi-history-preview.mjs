import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const root=fileURLToPath(new URL('../',import.meta.url));
function component(name){
  const source=readFileSync(new URL(`../src/components/${name}.jsx`,import.meta.url),'utf8');
  const ast=parse(source,{sourceType:'module',plugins:['jsx']});
  const body=ast.program.body.filter(n=>n.type==='FunctionDeclaration'||n.type==='VariableDeclaration').map(n=>source.slice(n.start,n.end)).join('\n');
  return `import React,{memo,useEffect,useRef,useState} from 'react';
const readHibachiCredentials=async()=>({apiKey:'fixture',accountId:'7',privateKey:'fixture'});
const hibachiCredentialPayload=(c,x)=>({api_key:c.apiKey,account_id:c.accountId,private_key:c.privateKey,...x});
const pacificaFetch=()=>{throw Error('Unexpected cross-exchange request')};
${body}\nexport default ${name};`;
}
export async function startHistoryPreview(port=5198){
  const modules={'/__trades.jsx':component('TradeHistory'),'/__funding.jsx':component('FundingHistory')};
  modules['/__history.jsx']=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import TradeHistory from '/__trades.jsx';import FundingHistory from '/__funding.jsx';import '/src/components/FuturesTerminal.css';
function App(){const[tab,setTab]=useState('trades');const[tick,setTick]=useState(0);const[dex,setDex]=useState('hibachi');return <main><h1>Hibachi history · local fixture</h1><button onClick={()=>setTab('trades')}>Trades</button><button onClick={()=>setTab('funding')}>Funding</button><button onClick={()=>setTick(tick+1)}>Market tick</button><select aria-label="Venue" value={dex} onChange={e=>setDex(e.target.value)}><option>hibachi</option><option>grvt</option></select>{tab==='trades'?<TradeHistory walletAddr="0x1111111111111111111111111111111111111111" dex={dex} markets={[{symbol:'BTC',mark:tick}]} />:<FundingHistory walletAddr="0x1111111111111111111111111111111111111111" dex={dex} markets={[{symbol:'BTC',mark:tick}]} />}</main>};document.documentElement.dataset.futuresTheme='dark';createRoot(document.getElementById('root')).render(<App/>);`;
  const server=await createServer({root,configFile:false,plugins:[{name:'history-fixture',resolveId:id=>modules[id]?id:null,load:id=>modules[id],configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url!=='/')return next();res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml('/',`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:var(--terminal-canvas);color:var(--terminal-text);font:14px system-ui}main{max-width:1100px;margin:auto;padding:12px;box-sizing:border-box}button,select{padding:8px}</style></head><body><div id="root"></div><script type="module" src="/__history.jsx"></script></body></html>`));});}},react()],server:{host:'127.0.0.1',port,strictPort:true}});
  await server.listen();return server;
}
