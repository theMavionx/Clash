import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startPreview } from './tests/open-tpsl-draft-preview.mjs';
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href)); }
let server, browser, page;
const errors = [];
before(async () => {
  server = await startPreview(5197);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
});
after(async () => { await browser?.close(); await server?.close(); assert.deepEqual(errors, []); });
test('inline switch exposes controlled optional targets without modal or extra side selector', async () => {
  await page.getByRole('switch').check();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'SHORT', exact: true }).count(), 0);
  await page.getByLabel('Take profit target').fill('120');
  const saved = JSON.parse(await page.getByLabel('Saved order settings').textContent());
  assert.equal(saved.tpValue, '120'); assert.equal(saved.slValue, ''); assert.equal(saved.enabled, true);
  await page.getByRole('switch').uncheck();
  await page.getByRole('switch').check();
  assert.equal(await page.getByLabel('Take profit target').inputValue(), '120');
  assert.equal(await page.getByLabel('Financial calls').textContent(), '0');
});
test('all modes preserve long/short trigger conversion and mode callbacks', async () => {
  for (const side of ['bid', 'ask']) for (const mode of ['price', 'pct', 'usd']) {
    const prices = await page.evaluate(({side, mode}) => ['tp','sl'].map(leg => window.fixture.arithmetic({pos:{side,entry_price:100,amount:2,margin:20,leverage:10},leg,mode,value:mode==='price'?'120':'10'}).price), {side,mode});
    const delta = mode === 'pct' ? 1 : 5;
    assert.deepEqual(prices, mode === 'price' ? [120,120] : side === 'bid' ? [100+delta,100-delta] : [100-delta,100+delta]);
  }
  await page.getByRole('button', {name:'$ PnL',exact:true}).click();
  await page.getByLabel('Take profit target').fill('10');
  assert.equal(JSON.parse(await page.getByLabel('Saved order settings').textContent()).mode, 'usd');
  assert.match(await page.locator('.open-tpsl-inline__target').first().textContent(), /Trigger \$105/);
});
test('price direction errors appear inline; one-sided target remains optional', async () => {
  await page.getByRole('button', {name:'Price',exact:true}).click();
  await page.getByLabel('Take profit target').fill('90');
  assert.equal(await page.getByLabel('Take profit target').getAttribute('aria-invalid'), 'true');
  await page.getByLabel('Take profit target').fill('120');
  assert.equal(await page.getByLabel('Take profit target').getAttribute('aria-invalid'), 'false');
  assert.equal(await page.getByLabel('Stop loss target').getAttribute('aria-invalid'), 'false');
});

test('parent direction changes previews without changing target values', async () => {
  await page.getByRole('button', {name:'$ PnL',exact:true}).click();
  await page.getByLabel('Take profit target').fill('10');
  await page.getByLabel('Fixture side').selectOption('ask');
  assert.match(await page.locator('.open-tpsl-inline__target').first().textContent(), /Trigger \$95/);
  assert.equal(await page.getByLabel('Take profit target').inputValue(), '10');
  await page.getByLabel('Fixture side').selectOption('bid');
});
test('missing details, venue limits and delayed attachment are explained inline', async () => {
  await page.getByLabel('Fixture amount').fill('0');
  assert.match(await page.locator('.open-tpsl-inline').textContent(), /Enter an order amount/);
  await page.getByLabel('Fixture amount').fill('2');
  await page.getByRole('button', {name:'Price',exact:true}).click();
  await page.getByLabel('Take profit target').fill('-5');
  assert.equal(await page.getByLabel('Take profit target').getAttribute('aria-invalid'), 'true');
  await page.getByLabel('Fixture venue').selectOption('ostium');
  await page.getByLabel('Take profit target').fill('200');
  assert.equal(await page.getByLabel('Take profit target').getAttribute('aria-invalid'), 'true');
  await page.getByLabel('Take profit target').fill('120');
  assert.equal(await page.getByLabel('Take profit target').getAttribute('aria-invalid'), 'false');
  await page.getByLabel('Fixture venue').selectOption('risex');
  await page.getByLabel('Fixture order type').selectOption('limit');
  assert.match(await page.locator('.open-tpsl-inline').textContent(), /after the limit fills/);
  await page.getByLabel('Fixture venue').selectOption('bulk');
  assert.doesNotMatch(await page.locator('.open-tpsl-inline').textContent(), /after the limit fills/);
});
test('existing position save stays separate; editing does not send financial requests', async () => {
  await page.getByRole('button',{name:'Toggle existing position editor'}).click();
  const editor=page.getByRole('region',{name:'Existing position editor'});
  assert.equal(await editor.getByRole('button',{name:'Save TP/SL',exact:true}).isDisabled(),true);
  await editor.getByLabel('Take profit target',{exact:true}).fill('120');
  assert.equal(await page.getByLabel('Financial calls').textContent(),'0');
  await editor.getByRole('button',{name:'Save TP/SL',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.fixture.calls[0].tp.price),120);
});
test('position mode keyboard controls keep profit/loss conversion and explicit save', async () => {
  const editor=page.getByRole('region',{name:'Existing position editor'});
  await editor.getByRole('button',{name:'$ PnL',exact:true}).focus();
  await page.keyboard.press('Space');
  assert.equal(await editor.getByRole('button',{name:'$ PnL',exact:true}).getAttribute('aria-pressed'),'true');
  await editor.getByLabel('Take profit target',{exact:true}).fill('10');
  await editor.getByLabel('Stop loss target',{exact:true}).fill('4');
  assert.equal(await page.getByLabel('Financial calls').textContent(),'1');
  await editor.getByRole('button',{name:'Save TP/SL',exact:true}).click();
  const call=await page.evaluate(()=>window.fixture.calls[1]);
  assert.equal(call.tp.price,105);
  assert.equal(call.sl.price,98);
});
test('inline fields fit 320px phone and desktop in both themes', async () => {
  for (const theme of ['light','dark']) for (const width of [320,390,1000]) {
    await page.setViewportSize({width,height:900});
    await page.getByLabel('Fixture theme').selectOption(theme);
    const dimensions=await page.locator('.open-tpsl-inline').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}));
    assert.ok(dimensions.width<=width);
    assert.ok(dimensions.scroll<=dimensions.client+1);
    const editor=page.getByRole('region',{name:'Existing position editor'});
    const positionDimensions=await editor.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));
    assert.ok(positionDimensions.scroll<=positionDimensions.client+1);
    for(const label of ['Take profit target','Stop loss target']) {
      const field=await editor.getByLabel(label,{exact:true}).boundingBox();
      assert.ok(field.height>=44, `${label} needs a usable touch target`);
      assert.ok(field.x>=0 && field.x+field.width<=width, `${label} must fit viewport`);
    }
  }
});
