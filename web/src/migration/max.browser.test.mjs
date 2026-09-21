// Local fixture only: a consumed allocation must not invite another deposit.
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Keypair } from '@solana/web3.js';
import { installTestWallet } from './wallet-test-fixture.mjs';
const { chromium } = await import(pathToFileURL(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const owner = Keypair.generate().publicKey;
    let remainingUnits = '0', balanceUnits = '0', writes = 0;
    await page.addInitScript(installTestWallet, { wallet: owner.toBase58(), publicKey: [...owner.toBytes()] });
    await page.route('**/api/migration/**', route => {
      const path = new URL(route.request().url()).pathname.split('/').pop();
      if (['quote', 'submit'].includes(path)) writes++;
      const data = {
        status: { enabled: true, ready: true, sourceDecimals: 6 },
        challenge: { id: 'local', message: 'Local test only' },
        verify: { token: 'local-session', wallet: owner.toBase58() },
        account: { eligibleUnits: '6512792978019', remainingUnits, balanceUnits, requests: [{ id: 'local-existing', inputUnits: '6512792978019', outputUnits: '6512792978019000000000000', targetDecimals: 18, status: 'deposited', destination: '0x' + '1'.repeat(40) }] },
      };
      return route.fulfill({ json: data[path] || {} });
    });
    await page.goto('http://127.0.0.1:5211/migration');
    await page.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Phantom/ }).click();
    const max = page.getByRole('button', { name: 'Use maximum available CLASH', exact: true });
    await page.getByText(/No remaining allocation\. Existing migration/).waitFor();
    assert.equal(await max.isDisabled(), true);
    await page.getByText('Processing — your Robinhood payout is queued', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Review migration', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `web/artifacts/migration/max-consumed-${width}.png`, fullPage: true });
    remainingUnits = '1234567';
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.getByText(/No CLASH is currently available/).waitFor();
    assert.equal(await max.isDisabled(), true);
    balanceUnits = '1234567';
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await max.click();
    assert.equal(await page.getByLabel('CLASH to migrate', { exact: true }).inputValue(), '1.234567');
    assert.equal(await page.locator('#migration-max-hint').count(), 0);
    assert.equal(writes, 0);
    assert.equal(await page.evaluate(() => window.signCalls), 0);
    await page.close();
  }
  console.log('MAX allocation/explanation browser checks passed (desktop/mobile, no transactions).');
} finally { await browser.close(); }
