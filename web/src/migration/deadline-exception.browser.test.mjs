// Local mocked wallets and API only; no chain connection or funded transaction.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Keypair } from '@solana/web3.js';
import { installTestWallet } from './wallet-test-fixture.mjs';
const { chromium } = await import(pathToFileURL(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = new URL('../../artifacts/migration/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const owner = Keypair.generate().publicKey;
    let allowed = false, enabled = true, writes = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(installTestWallet, { wallet: owner.toBase58(), publicKey: [...owner.toBytes()] });
    await page.route('**/api/migration/**', route => {
      const path = new URL(route.request().url()).pathname.split('/').pop();
      if (['quote', 'submit'].includes(path)) writes++;
      const data = {
        status: { enabled, ready: true, sourceDecimals: 6, ratio: '1', closesAt: Date.now() - 60000, serverTime: Date.now() },
        challenge: { id: 'local', message: 'Local test only' },
        verify: { token: 'local-session', wallet: owner.toBase58() },
        account: { wallet: owner.toBase58(), deadlineExempt: allowed, eligibleUnits: '122225280069', remainingUnits: '122225280069', balanceUnits: '122225280069', requests: [] },
      };
      return route.fulfill({ json: data[path] || {} });
    });
    await page.goto('http://127.0.0.1:5211/migration');
    await page.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Phantom/ }).click();
    await page.getByText('Your migrations', { exact: true }).waitFor();
    const max = page.getByRole('button', { name: 'Use maximum available CLASH', exact: true });
    assert.equal(await max.isDisabled(), true);
    allowed = true;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.getByText('Migration after closing is enabled for your wallet.', { exact: true }).waitFor();
    await max.click();
    assert.equal(await page.getByLabel('CLASH to migrate', { exact: true }).inputValue(), '122225.280069');
    await page.getByPlaceholder('0x…', { exact: true }).fill('0x' + '1'.repeat(40));
    const review = page.getByRole('button', { name: 'Review migration', exact: true });
    assert.equal(await review.isEnabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: new URL(`deadline-exception-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    enabled = false;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    assert.equal(await review.isDisabled(), true);
    enabled = true; allowed = false;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    assert.equal(await review.isDisabled(), true);
    assert.equal(writes, 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const wallet = Keypair.generate().publicKey.toBase58();
  let exceptions = [];
  await page.route('**/api/migration/admin**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/deadline-exception')) {
      assert.equal(route.request().method(), 'PUT');
      const body = route.request().postDataJSON();
      assert.equal(body.wallet, wallet);
      exceptions = body.allowed ? [{ wallet, createdAt: Date.now() }] : [];
      return route.fulfill({ json: { wallet, deadlineExempt: body.allowed } });
    }
    if (url.pathname.endsWith('/ledger')) return route.fulfill({ json: { summary: { payouts: [] }, requests: [], page: 1, pages: 1 } });
    return route.fulfill({ json: { config: { enabled: true, closesAt: Date.now() - 1000 }, readiness: { ready: true }, wallets: {}, deadlineExceptions: exceptions, requests: [], sales: [], audit: [] } });
  });
  await page.goto('http://127.0.0.1:5211/src/migration/admin-preview.html');
  await page.getByLabel('Solana sender wallet', { exact: true }).fill(wallet);
  await page.getByRole('button', { name: 'Allow after closing', exact: true }).click();
  const revoke = page.getByRole('button', { name: 'Revoke access', exact: true });
  await revoke.waitFor();
  assert.equal(exceptions.length, 1);
  await page.getByRole('heading', { name: 'Wallet access after closing' }).locator('..').screenshot({ path: new URL('deadline-exception-admin.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  await revoke.click();
  await page.getByText('No wallet exceptions.', { exact: true }).waitFor();
  assert.equal(exceptions.length, 0);
  console.log('Deadline exception browser checks passed: desktop/mobile access, pause, revocation, admin grant/revoke. No payments.');
} finally { await browser.close(); }
