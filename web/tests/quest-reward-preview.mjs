// Local-only interactive quest fixture: real reserve service and QuestsTab,
// disposable SQLite state, no player credentials or exchange requests.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../server/package.json',import.meta.url));
const Database=require('better-sqlite3');
const {createTaskRewardService}=require('./task_rewards');
const db=new Database(':memory:');
db.exec("CREATE TABLE players (id TEXT PRIMARY KEY,gold INTEGER,wood INTEGER,ore INTEGER); INSERT INTO players VALUES ('fixture',9000,8365,7490)");
const getResources=()=>db.prepare('SELECT gold,wood,ore FROM players').get();
const rewards=createTaskRewardService({db,getResources,getResourceCaps:()=>({gold:9000,wood:9000,ore:9000}),
 addResources:(_id,gold,wood,ore)=>{db.prepare('UPDATE players SET gold=gold+?,wood=wood+?,ore=ore+?').run(gold,wood,ore);return getResources();}});
let claimed=false;
const task=()=>({id:12,type:'volume',title:'$100,000 trading volume in 1 trade on any ticker',description:'Are you whale enough?',params:{symbol:'ANY',side:'any',target_volume:100000},
 reward_gold:8888,reward_wood:8888,reward_ore:8888,started:true,progress_value:518817,target_value:100000,
 reward_pending:rewards.pendingByTask('fixture')[12]||{},claimed_at:claimed?'2026-08-31T00:00:00Z':null});
const mockId='/__quest-mocks.jsx',entryId='/__quest-entry.jsx';
const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,
 server:{host:'127.0.0.1',port:5195,strictPort:true},plugins:[{
  name:'quest-fixture',enforce:'pre',resolveId:id=>[mockId,entryId].includes(id)?id:null,
  load(id){
   if(id===mockId)return `export const usePlayer=()=>({token:'local-fixture-only',player:{name:'Fixture',dex:'hibachi'}});export const useDex=()=>({dex:'hibachi'});export const readEncryptedCredential=async()=>null;export const writeEncryptedCredential=async()=>{};`;
   if(id===entryId)return `import React from 'react';import{createRoot}from'react-dom/client';import QuestsTab from'/src/components/QuestsTab.jsx';
    window.onGodotMessage=msg=>{if(msg.action==='resources')document.getElementById('balances').textContent=JSON.stringify(msg.data);};
    window.godotBridge=()=>{};
    await fetch('/api/resources').then(r=>r.json()).then(data=>window.onGodotMessage({action:'resources',data}));
    createRoot(document.getElementById('root')).render(<QuestsTab/>);
    document.getElementById('spend').onclick=async()=>{await fetch('/fixture/spend',{method:'POST'});location.reload();};`;
  },
  transform(code,id){
   if(!id.replaceAll('\\','/').endsWith('/src/components/QuestsTab.jsx'))return;
   return code.replace(/from '(\.\.\/(?:hooks\/useGodot|contexts\/DexContext|lib\/encryptedCredentialStorage))'/g,`from '${mockId}'`);
  },
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
   let body;
   if(req.url==='/api/tasks')body=[task()];
   else if(req.url==='/api/resources')body=rewards.settle('fixture').resources;
   else if(req.url==='/api/tasks/12/claim'&&req.method==='POST'){
    const result=claimed?{released:{},pending:rewards.pendingByTask('fixture')[12],resources:getResources()}:rewards.credit('fixture',12,{gold:8888,wood:8888,ore:8888});
    claimed=true;body={ok:true,completed:true,reward:result.released,reward_pending:result.pending,resources:result.resources};
   }else if(req.url==='/fixture/spend'&&req.method==='POST'){db.prepare('UPDATE players SET gold=0,wood=0,ore=0').run();body={ok:true};}
   else if(req.url==='/'){
    res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml('/',`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Quest reward verification</title>
    <style>body{margin:0;background:#101827;color:#f6f6fa;font:14px system-ui}main{max-width:420px;margin:24px auto;padding:12px}button{cursor:pointer}#balances{margin:12px 0;font-size:12px}#spend{padding:12px;margin:12px 0}</style>
    <main><h2>Quest reward verification</h2><div id="balances"></div><button id="spend">Free storage (local test)</button><div id="root"></div></main><script type="module" src="${entryId}"></script>`));return;
   }else return next();
   res.setHeader('content-type','application/json');res.end(JSON.stringify(body));
  });},
 },react()]});
await server.listen();
console.log('Quest preview: '+server.resolvedUrls.local[0]);
