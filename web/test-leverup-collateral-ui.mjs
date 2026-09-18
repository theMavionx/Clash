import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(pathToFileURL(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true});
const baseUrl=process.env.FIXTURE_URL || 'http://127.0.0.1:5196';
try {
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let chartAvailable=false;
    await page.route('**/api/futures/chart/history?**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(chartAvailable
      ? {s:'ok',source:'Kraken',t:[1789700100,1789700400],o:[78000,78001],h:[78010,78020],l:[77990,77995],c:[78001,78010]}
      : {s:'error',errmsg:'Upstream unavailable'})}));
    await page.goto(baseUrl+'/?dex=leverup&terminal=1&theme=dark');
    const select=page.getByLabel('LeverUp collateral token');
    await select.waitFor();
    assert.equal(await page.locator('.futures-terminal-book').count(),0,'LeverUp does not reserve an empty book column');
    assert.equal(await page.getByRole('button',{name:'Order book',exact:true}).count(),0);
    if(process.env.TEST_REAL_CHART==='1'){
      await page.getByText('Chart history is unavailable for this market. Live venue price is shown above.').waitFor();
      chartAvailable=true;
      await page.getByRole('button',{name:'Retry chart',exact:true}).click();
      await page.locator('[data-chart-source="Kraken"]').waitFor();
      assert.equal(await page.getByRole('button',{name:'Retry chart',exact:true}).count(),0);
      assert.ok(await page.locator('.futures-trading-chart canvas').count()>0);
    }
    await page.getByLabel('Margin in USDC',{exact:true}).fill('10');
    await select.selectOption('lvUSD');
    await page.reload();
    await select.waitFor();
    assert.equal(await select.inputValue(),'lvUSD','explicit choice survives a full page reload');
    await page.goto(baseUrl+'/?dex=leverup&terminal=1&theme=dark&wallet=b');
    await select.waitFor();assert.equal(await select.inputValue(),'USDC','another wallet keeps its own default');
    await page.goto(baseUrl+'/?dex=leverup&terminal=1&theme=dark');
    await select.waitFor();assert.equal(await select.inputValue(),'lvUSD','returning wallet restores its choice');
    const margin=page.getByLabel('Margin in lvUSD',{exact:true});
    assert.equal(await margin.inputValue(),'','switching token clears the previous order amount');
    assert.match(await page.locator('body').innerText(),/0.72 USDC.*20.00 lvUSD/);
    assert.equal(await page.locator('[aria-label="Balance $20.72, free margin $20.72"]').count(),1);
    await margin.fill('10');
    await page.getByRole('button',{name:'Submit long',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('fixture-actions').textContent.includes('market:'));
    assert.match(await page.locator('#fixture-actions').textContent(),/market:/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    console.log('PASS mounted LeverUp token switch, combined free balance and mock order at '+width);
    await page.close();
  }
} finally {await browser.close();}
