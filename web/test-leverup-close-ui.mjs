import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import(pathToFileURL(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const source=readFileSync(new URL('./src/hooks/useLeverup.js',import.meta.url),'utf8');
const key=source.slice(source.indexOf('function positionKey('),source.indexOf('function validateLeverupOrderRisk'));
const methods=source.slice(source.indexOf('  const fetchAccount ='),source.indexOf('  const verifyOneTap ='))+source.slice(source.indexOf('  const closePosition ='),source.indexOf('  const cancelOrder ='));
const module=`import React,{useCallback,useState,useRef} from 'react';import{createRoot}from'react-dom/client';
${key}
const original={symbol:'BTC',positionHash:'0xabc',qty:2,entry_price:100,margin:10,side:'long'};
const normalizeSymbol=s=>s,normalizeLongSide=s=>s==='long',num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const OneClickAction={MARKET_CLOSE:1,PARTIAL_CLOSE:9},rawQty=v=>BigInt(v)*10n**10n;
const captureCredentialOperation=()=>({}),assertCredentialOperation=()=>{};
function App(){const[positions,setPositions]=useState([original]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[account,setAccount]=useState(null),[wallet,setWalletUsdc]=useState(null),[orders,setOrders]=useState([]),[calls,setCalls]=useState(0);
const walletAddr='wallet-a',gameToken='fixture',walletMismatch=false;
const closedPositionsRef=useRef(new Set()),closingPositionsRef=useRef(new Set()),brokerRef=useRef({active:true,brokerId:2}),pricesRef=useRef([]),pending=useRef(null);
const fetchJson=async path=>path.includes('/positions')?[original]:path.includes('/orders')?[]:{wallet_usdc:1,wallet_lvusd:20};
const submitAction=async()=>{setCalls(v=>v+1);return new Promise(resolve=>pending.current=resolve)};
${methods}
return <main><h1>LeverUp close local fixture</h1><output aria-label="Requests">{calls}</output><p role="status">{error||''}</p>{positions.map(p=><div key={p.positionHash}>BTC position<button onClick={()=>closePosition(p)}>Close BTC</button></div>)}{!positions.length&&<p>No open positions</p>}<button onClick={()=>pending.current?.({success:true})}>Confirm success</button><button onClick={()=>fetchAccount()}>Refresh stale snapshot</button><button onClick={()=>closePosition(original)}>Retry old row</button></main>};createRoot(document.getElementById('root')).render(<App/>);`;
const server=await createServer({root:fileURLToPath(new URL('./',import.meta.url)),configFile:false,plugins:[{name:'close-fixture',resolveId:id=>id==='/__close.jsx'?id:null,load:id=>id==='/__close.jsx'?module:null,configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url!=='/')return next();res.setHeader('content-type','text/html');res.end(await s.transformIndexHtml('/','<!doctype html><html><body><div id="root"></div><script type="module" src="/__close.jsx"></script></body></html>'));});}},react()],server:{host:'127.0.0.1',port:5195,strictPort:true}});
let browser;
try{await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5195/');
await page.getByRole('button',{name:'Close BTC',exact:true}).click();await page.getByRole('button',{name:'Close BTC',exact:true}).click();assert.equal(await page.getByLabel('Requests').textContent(),'1');
await page.getByRole('button',{name:'Confirm success'}).click();await page.getByText('No open positions',{exact:true}).waitFor();
await page.getByRole('button',{name:'Refresh stale snapshot'}).click();assert.equal(await page.getByRole('button',{name:'Close BTC',exact:true}).count(),0);
await page.getByRole('button',{name:'Retry old row'}).click();assert.equal(await page.getByLabel('Requests').textContent(),'1');assert.deepEqual(errors,[]);console.log('PASS mounted actual close/account callbacks: double click, confirmed removal, stale refresh and old-row retry');
}finally{await browser?.close();await server.close();}
