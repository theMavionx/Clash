import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(pathToFileURL(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5196/?dex=leverup&terminal=1&theme=dark');
    const select=page.getByLabel('LeverUp collateral token');
    await select.waitFor();
    await page.getByLabel('Margin in USDC',{exact:true}).fill('10');
    await select.selectOption('lvUSD');
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
