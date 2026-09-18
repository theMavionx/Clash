import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(pathToFileURL(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const width of [1280,390]) {
  const page=await browser.newPage({viewport:{width,height:900}}),requests=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/futures/chart/history?**',r=>{
   requests.push(new URL(r.request().url()).searchParams);
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({s:'ok',source:'Hyperliquid perpetual',t:[1789700100,1789700400],o:[4380,4381],h:[4382,4384],l:[4379,4380],c:[4381,4383]})});
  });
  await page.goto((process.env.FIXTURE_URL||'http://127.0.0.1:5198')+'/?dex=leverup&terminal=1&theme=dark&native-chart=1');
  await page.locator('[data-chart-source="Hyperliquid perpetual"]').waitFor();
  assert.equal(requests.at(-1).get('symbol'),'Hyperliquid.xyz:GOLD');
  assert.ok(await page.locator('.futures-trading-chart canvas').count()>0);
  await page.getByRole('button',{name:'1D',exact:true}).click();
  await page.waitForTimeout(100);
  assert.equal(requests.at(-1).get('resolution'),'1D');
  assert.equal(requests.at(-1).get('symbol'),'Hyperliquid.xyz:GOLD');
  assert.equal(await page.getByRole('button',{name:'Retry chart',exact:true}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS real terminal GOLD chart and timeframe at '+width);await page.close();
 }
} finally {await browser.close();}
