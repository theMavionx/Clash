// Actual standalone QuestsTab + QFEX client/status. Local mock HTTP and fake vault only.
// Run: node tests/test-qfex-quests-ui.mjs
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { homedir } from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const mockId = '/__qfex-quests-mocks.jsx', entryId = '/__qfex-quests-entry.jsx';
const mocks = `
import {useSyncExternalStore} from 'react';
const listeners=new Set();
let player={token:'fixture-player-A'};
window._playerToken=player.token;
window.qfexFixture={connected:true,generation:1,hold:false,vaultReads:0,
 changeToken(token){player={token};window._playerToken=token;this.generation++;for(const cb of listeners)cb();},
 release(){this.hold=false;this.resolve?.();},refresh(){window.dispatchEvent(new Event('clash:trading-reward-claimed'));}};
const f=window.qfexFixture;
export const usePlayer=()=>useSyncExternalStore(cb=>{listeners.add(cb);return()=>listeners.delete(cb);},()=>player);
export const useDex=()=>({dex:'qfex'});
export const captureCredentialScope=()=>f.generation;
export const assertCredentialScope=scope=>{if(scope!==f.generation)throw Error('Fixture account changed');};
export const readEncryptedCredential=async()=>{f.vaultReads++;if(f.hold)await new Promise(resolve=>{f.resolve=resolve;});return f.connected?{publicKey:'fixture-public',secretKey:'fixture-secret',accountId:'11111111-1111-4111-8111-111111111111'}:null;};
export const writeEncryptedCredential=async()=>{};
export const removeEncryptedCredential=async()=>{};
`;
const entry = `import React from 'react';import{createRoot}from'react-dom/client';
import QuestsTab from '/src/components/QuestsTab.jsx';
import qfexLogo from '/src/assets/qfex.svg';
import '/src/components/FuturesTerminal.css';
createRoot(document.getElementById('root')).render(<main><img alt="QFEX" src={qfexLogo} width="48" height="48"/><QuestsTab/></main>);`;
const server = await createServer({root,configFile:false,plugins:[{
  name:'qfex-quests-only',enforce:'pre',
  resolveId:id=>[mockId,entryId].includes(id)?id:null,
  load:id=>id===mockId?mocks:id===entryId?entry:null,
  transform(code,id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/src/components/QuestsTab.jsx'))return code.replace(/from '(\.\.\/(?:hooks\/useGodot|contexts\/DexContext|lib\/encryptedCredentialStorage))'/g,`from '${mockId}'`);
    if(path.endsWith('/src/lib/qfexClient.js'))return code.replace("from './encryptedCredentialStorage.js'",`from '${mockId}'`);
  },
  configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
    if(req.url!=='/')return next();
    res.setHeader('Content-Type','text/html');
    res.end(await vite.transformIndexHtml('/',`<!doctype html><html data-futures-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>QFEX quests — local mock</title><style>body{background:#000;color:#E8E9EF;font:14px Arial;margin:0}main{padding:16px;max-width:600px;margin:auto;box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="${entryId}"></script></body></html>`));
  });},
},react()],server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;
try {
  await server.listen();
  const origin=server.resolvedUrls.local[0];
  const playwrightPath=process.env.PLAYWRIGHT_MODULE || join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const {chromium}=await import(pathToFileURL(playwrightPath).href);
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[],calls=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  let scenario='failed';
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==new URL(origin).origin){external.push(url.origin);return route.abort();}
    if(!url.pathname.startsWith('/api/'))return route.continue();
    calls.push({path:url.pathname,headers:request.headers(),method:request.method()});
    let status=200,body;
    if(url.pathname==='/api/resources')body={gold:100,wood:100,ore:100};
    else if(url.pathname==='/api/tasks')body=[{id:12,dex:'qfex',type:'volume',title:'QFEX fixture quest',params:{target_volume:100,symbol:'ANY'},started:true,progress_value:50,target_value:100,reward_gold:10}];
    else if(url.pathname==='/api/futures/qfex/import-trades'){
      if(scenario==='failed'){status=503;body={ok:false,error:'Fixture upstream unavailable'};}
      else body={ok:true,builder_configured:scenario!=='builder',has_more:scenario==='backlog',unmatched_executions:0};
    }else throw Error('Unexpected API request '+url.pathname);
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(origin);
  await page.getByText('QFEX fixture quest',{exact:true}).waitFor();
  await page.getByRole('alert').filter({hasText:'Fixture upstream unavailable'}).waitFor();
  const imported=calls.find(call=>call.path.endsWith('/qfex/import-trades'));
  assert(imported,'Standalone quests must import without FuturesPanel');
  assert.equal(imported.headers['x-token'],'fixture-player-A');
  assert.equal(imported.headers['x-qfex-secret-key'],'fixture-secret');
  assert.equal(imported.headers['x-qfex-public-key'],'fixture-public');
  assert.equal(imported.headers['x-dex'],'qfex');
  assert(calls.findIndex(call=>call.path.endsWith('/import-trades'))<calls.findIndex(call=>call.path==='/api/tasks'));
  console.log('PASS standalone authenticated import, failure visible, quests still load');

  scenario='ready';
  await page.getByRole('button',{name:'Retry sync',exact:true}).click();
  await page.getByText('QFEX trades and rewards are up to date.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('alert').count(),0);
  console.log('PASS retry recovers and clears stale sync failure');
  for(const [next,copy] of [['builder','QFEX builder code is pending.'],['backlog','Loading older QFEX trades.']]){
    scenario=next;
    await page.getByRole('button',{name:'Refresh sync',exact:true}).click();
    await page.getByText(copy,{exact:false}).waitFor();
  }
  console.log('PASS builder attribution gate and saved-backlog notices');
  assert(await page.getByAltText('QFEX').evaluate(img=>img.complete&&img.naturalWidth>0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'390px page must not horizontally overflow');
  console.log('PASS official logo loads and 390px layout has no horizontal overflow');

  const importCount=()=>calls.filter(call=>call.path.endsWith('/import-trades')).length;
  const beforeDisconnect=importCount();
  await page.evaluate(()=>{window.qfexFixture.connected=false;window.qfexFixture.refresh();});
  await page.getByText('Connect your QFEX API keys to sync trading quests.',{exact:true}).waitFor();
  assert.equal(importCount(),beforeDisconnect);
  const lastTask=calls.filter(call=>call.path==='/api/tasks').at(-1);
  assert(!lastTask.headers['x-qfex-secret-key']);
  console.log('PASS disconnected vault still loads quests without API-secret headers/import');

  const beforeSwitch=importCount();
  await page.evaluate(()=>{const f=window.qfexFixture;f.connected=true;f.hold=true;f.refresh();});
  await page.waitForFunction(()=>!!window.qfexFixture.resolve);
  await page.evaluate(()=>{window.qfexFixture.changeToken(null);window.qfexFixture.release();});
  // Let the actual async vault read settle after logout; no live-network timeouts are involved.
  await page.waitForTimeout(150);
  assert.equal(importCount(),beforeSwitch,'A vault read completed after logout must not send a credential-bearing import');
  assert.deepEqual(external,[],'Fixture must never request a real exchange');
  assert.deepEqual(errors,[],'No uncaught browser exceptions');
  console.log('PASS logout during vault read cannot leak credentials or revive old scope');
} finally {
  await browser?.close();
  await server.close();
}
