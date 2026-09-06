// Actual React + native dialog in headless Chromium; no exchange sessions.
// Run: node --test test-open-tpsl-draft.mjs. PLAYWRIGHT_MODULE can override the bundled runtime.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startPreview } from './tests/open-tpsl-draft-preview.mjs';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const runtime = process.env.PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  ({ chromium } = await import(pathToFileURL(runtime).href));
}
let server, browser, page, url;
const errors = [];
before(async () => {
  server = await startPreview(0);
  url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  page = await browser.newPage({ locale: 'en-US' });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    errors.push('Unexpected remote request: ' + route.request().url());
    return route.abort();
  });
});
after(async () => { await browser?.close(); await server?.close(); assert.deepEqual(errors, []); });
beforeEach(async () => { await page.setViewportSize({ width: 1000, height: 900 }); await page.goto(url); });
const open = async () => { await page.getByRole('button', { name: /^TP\/SL/ }).click(); await page.getByRole('dialog').waitFor(); };
const saved = async () => JSON.parse(await page.getByLabel('Saved order settings').textContent());
const tp = () => page.getByRole('spinbutton', { name: 'Take profit target' });
const sl = () => page.getByRole('spinbutton', { name: 'Stop loss target' });
const submit = () => page.getByRole('button', { name: 'Submit', exact: true });
const close = () => page.getByRole('button', { name: 'Close position dialog' }).click();

test('opening is immediately editable; typing, side and mode edits plus X do not save', async () => {
  const initial = await saved();
  await open();
  assert.equal(await tp().isEnabled(), true);
  assert.equal(await page.getByRole('checkbox').count(), 0);
  await tp().fill('120'); await sl().fill('90');
  await page.getByRole('button', { name: 'SHORT', exact: true }).click();
  await page.getByRole('button', { name: '$ PnL', exact: true }).click();
  assert.deepEqual(await saved(), initial);
  await close();
  assert.deepEqual(await saved(), initial);
  await open(); assert.equal(await tp().inputValue(), '');
});

test('native Escape cancels all edits and restores trigger focus', async () => {
  const initial = await saved(); await open(); await tp().fill('120');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.deepEqual(await saved(), initial);
  assert.match(await page.evaluate(() => document.activeElement.textContent), /TP\/SL/);
});

test('valid Submit persists targets and enables attachment; reopen/cancel retains saved values', async () => {
  await open(); await tp().fill('120'); await sl().fill('90'); await submit().click();
  const expected = { enabled: true, mode: 'price', previewSide: 'bid', tpValue: '120', slValue: '90' };
  assert.deepEqual(await saved(), expected);
  await open(); assert.equal(await tp().inputValue(), '120');
  await tp().fill('150'); await sl().fill('80'); await page.keyboard.press('Escape');
  assert.deepEqual(await saved(), expected);
  assert.equal(await page.getByLabel('Financial calls').textContent(), '0');
});

test('Price, % PnL and $ PnL preserve both LONG and SHORT arithmetic', async () => {
  for (const side of ['bid', 'ask']) for (const mode of ['price', 'pct', 'usd']) {
    const result = await page.evaluate(({side,mode}) => {
      const pos={side,entry_price:100,amount:2,margin:20,leverage:10};
      return ['tp','sl'].map(leg=>window.fixture.arithmetic({pos,leg,mode,value:mode==='price'?'120':'10'}));
    }, {side,mode});
    const delta=mode==='pct'?1:5;
    assert.deepEqual(result.map(v=>v.price), mode==='price'?[120,120]:side==='bid'?[100+delta,100-delta]:[100-delta,100+delta]);
  }
  await open(); await page.getByRole('button', {name:'SHORT',exact:true}).click();
  await page.getByRole('button', {name:'$ PnL',exact:true}).click(); await tp().fill('10'); await sl().fill('10');
  assert.match(await page.locator('[data-leg="tp"]').textContent(), /Trigger \$95[.,]00/);
  assert.match(await page.locator('[data-leg="sl"]').textContent(), /Trigger \$105[.,]00/);
  assert.match(await page.locator('[data-leg="tp"]').textContent(), /Est\. PnL \+10 USD \(\+50%\)/);
  assert.match(await page.locator('[data-leg="sl"]').textContent(), /Est\. PnL −10 USD \(−50%\)/);
  await submit().click(); assert.equal((await saved()).previewSide, 'ask'); assert.equal((await saved()).mode, 'usd');
});

test('missing amount leaves Price usable and explains PnL requirements without invalid field errors', async () => {
  await page.getByLabel('Fixture amount').fill('0'); await open(); await tp().fill('120');
  assert.equal(await submit().isEnabled(), true);
  assert.match(await page.locator('[data-leg="tp"]').textContent(), /Est\. PnL unavailable/);
  await page.getByRole('button', {name:'% PnL',exact:true}).click();
  assert.equal(await submit().isDisabled(), true);
  assert.match(await page.getByRole('dialog').textContent(), /Enter an order amount/);
  assert.equal(await tp().getAttribute('aria-invalid'), 'false');
  await page.getByRole('button', {name:'Price',exact:true}).click(); await submit().click();
  assert.equal((await saved()).enabled, true);
});

test('missing entry is unavailable, while malformed and wrong-direction targets cannot save', async () => {
  await page.getByLabel('Fixture entry').fill('0'); await open();
  assert.match(await page.locator('.open-tpsl-draft__context').textContent(), /Not available/);
  assert.doesNotMatch(await page.locator('.open-tpsl-draft__context').textContent(), /\$0/);
  await close(); await page.getByLabel('Fixture entry').fill('100'); await open();
  assert.equal(await submit().isDisabled(), true);
  await tp().fill('-5'); assert.equal(await submit().isDisabled(), true); assert.equal(await tp().getAttribute('aria-invalid'), 'true');
  await tp().fill('90'); assert.equal(await submit().isDisabled(), true);
  assert.equal(await tp().getAttribute('aria-invalid'), 'true');
  assert.match(await tp().getAttribute('aria-describedby'), /-unit /);
  assert.match(await page.getByRole('dialog').textContent(), /must be above/);
  await page.locator('.open-tpsl-draft').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal((await saved()).enabled, false); assert.equal(await page.getByLabel('Financial calls').textContent(), '0');
});

test('Remove disables only saved next-order attachment and retains remembered values', async () => {
  await open(); await tp().fill('120'); await submit().click(); await open();
  await page.getByRole('button',{name:'Remove TP/SL from next order'}).click();
  assert.equal((await saved()).enabled,false); assert.equal((await saved()).tpValue,'120');
  assert.equal(await page.getByLabel('Financial calls').textContent(),'0');
});

test('venue validation and limit notices preserve supported attachment semantics', async () => {
  await page.getByLabel('Fixture venue').selectOption('ostium'); await open();
  await tp().fill('200');
  assert.equal(await submit().isDisabled(), true, 'Ostium max-profit limit is checked');
  await tp().fill('120'); await submit().click();
  assert.equal((await saved()).enabled, true);
  await page.getByLabel('Fixture venue').selectOption('risex');
  await page.getByLabel('Fixture order type').selectOption('limit'); await open();
  assert.match(await page.getByRole('dialog').textContent(), /after the limit fills/);
  await close(); await page.getByLabel('Fixture venue').selectOption('bulk'); await open();
  assert.doesNotMatch(await page.getByRole('dialog').textContent(), /after the limit fills/);
  await page.getByRole('button', {name:'% PnL',exact:true}).click(); await tp().fill('10');
  assert.match(await page.locator('[data-leg="tp"]').textContent(), /Trigger \$101[.,]00/);
  await submit().click(); assert.equal((await saved()).mode,'pct');
  assert.equal(await page.getByLabel('Financial calls').textContent(),'0');
});

test('live-position Set remains a separate explicit action with original shared input calculations', async () => {
  await page.getByRole('button',{name:'Toggle existing position editor'}).click();
  const editor=page.getByRole('region',{name:'Existing position editor'});
  assert.equal(await editor.getByRole('button',{name:'Set',exact:true}).isDisabled(),true);
  await editor.getByPlaceholder('TP Price').fill('120');
  assert.equal(await page.getByLabel('Financial calls').textContent(),'0');
  await editor.getByRole('button',{name:'Set',exact:true}).click();
  assert.equal(await page.getByLabel('Financial calls').textContent(),'1');
  assert.equal(await page.evaluate(()=>window.fixture.calls[0].tp.price),120);
  assert.equal((await saved()).enabled,false);
});

test('native focus containment, responsive layout, readable previews and theme surfaces', async () => {
  for (const theme of ['light','dark']) for (const width of [360,480,1000]) {
    await page.setViewportSize({width,height:900});
    await page.getByLabel('Fixture theme').selectOption(theme); await open(); await tp().fill('120');
    const dimensions=await page.getByRole('dialog').evaluate(dialog=>({width:dialog.getBoundingClientRect().width,scroll:dialog.scrollWidth,client:dialog.clientWidth,columns:getComputedStyle(dialog.querySelector('.open-tpsl-draft__targets')).gridTemplateColumns.split(' ').length,preview:getComputedStyle(dialog.querySelector('.open-tpsl-draft__preview')).whiteSpace}));
    assert.ok(dimensions.width<=Math.min(480,width-24)+1);
    assert.ok(dimensions.scroll<=dimensions.client+1);
    assert.equal(dimensions.columns,width<420?1:2); assert.equal(dimensions.preview,'normal');
    await submit().focus(); await page.keyboard.press('Tab');
    // Native modal Tab may visit browser chrome (document.body), but must not
    // focus an inert control in the underlying order form.
    assert.equal(await page.evaluate(()=>document.activeElement===document.body||document.querySelector('dialog').contains(document.activeElement)),true);
    await close();
  }
});
