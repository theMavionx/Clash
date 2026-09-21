// Local fixture only; no RPC or funded wallet transactions.
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Keypair } from '@solana/web3.js';
import { installTestWallet } from './wallet-test-fixture.mjs';
import { canRequoteExpiredDeposit } from './model.js';
const { chromium } = await import(pathToFileURL(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const terminal = { status: 'deposit_failed', errorCode: 'DEPOSIT_EXPIRED_UNLANDED' };
assert.equal(canRequoteExpiredDeposit(terminal), true);
for (const row of [null, { ...terminal, payoutHash: 'paid' }, { ...terminal, status: 'review' }, { ...terminal, errorCode: 'DEPOSIT_REQUIRES_RECONCILIATION' }]) assert.equal(canRequoteExpiredDeposit(row), false);
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const owner = Keypair.generate().publicKey, destination = '0x' + '3'.repeat(40);
    let recovered = false, enabled = true, closed = false, quotes = 0, submits = 0;
    await page.addInitScript(installTestWallet, { wallet: owner.toBase58(), publicKey: [...owner.toBytes()] });
    await page.route('**/api/migration/**', route => {
      const path = new URL(route.request().url()).pathname.split('/').pop();
      if (path === 'quote') {
        quotes++;
        assert.equal(route.request().postDataJSON().amount, '3000000');
        assert.equal(route.request().postDataJSON().destination, destination);
      }
      if (path === 'submit') submits++;
      const data = {
        status: { enabled, ready: true, sourceDecimals: 6, closesAt: closed ? Date.now() - 1000 : null, serverTime: Date.now() },
        challenge: { id: 'local', message: 'Local test only' }, verify: { token: 'local-session', wallet: owner.toBase58() },
        account: { eligibleUnits: '3000000000000', remainingUnits: recovered ? '3000000000000' : '0', balanceUnits: '3000000000000', requests: [{ id: 'old-request', inputUnits: '3000000000000', outputUnits: '3000000000000000000000000', targetDecimals: 18, destination, depositHash: 'old-hash', ...(recovered ? terminal : { status: 'review', errorCode: 'DEPOSIT_REQUIRES_RECONCILIATION' }) }] },
        quote: { id: 'new-quote', inputUnits: '3000000000000', outputUnits: '3000000000000000000000000', targetDecimals: 18, destination, expiresAt: Date.now() + 90000, feeLamports: '1000' },
      };
      return route.fulfill({ json: data[path] || {} });
    });
    await page.goto('http://127.0.0.1:5211/migration');
    await page.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Phantom/ }).click();
    await page.getByText('Checking transaction — do not deposit again', { exact: true }).waitFor();
    const recovery = page.getByRole('button', { name: 'Create new quote', exact: true });
    assert.equal(await recovery.count(), 0);
    recovered = true;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await recovery.click();
    assert.equal(await page.getByLabel('CLASH to migrate', { exact: true }).inputValue(), '3000000');
    assert.equal(await page.getByLabel('Robinhood EVM recipient address').inputValue(), destination);
    assert.equal(await page.getByLabel('CLASH to migrate', { exact: true }).evaluate(node => node === document.activeElement), true);
    assert.equal(quotes, 0); assert.equal(submits, 0);
    assert.equal(await page.evaluate(() => window.signCalls), 0);
    enabled = false;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.getByText('Migration is currently unavailable. No payment will be requested.', { exact: true }).waitFor();
    assert.equal(await recovery.isDisabled(), true);
    enabled = true; closed = true;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.getByText('Bridge is closed', { exact: true }).waitFor();
    assert.equal(await recovery.isDisabled(), true);
    closed = false;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.getByText('Migration available', { exact: true }).waitFor();
    assert.equal(await recovery.isEnabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `web/artifacts/migration/expiry-recovery-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Review migration', exact: true }).click();
    await page.getByRole('button', { name: 'Sign deposit and migrate' }).waitFor();
    assert.equal(quotes, 1); assert.equal(submits, 0);
    assert.equal(await recovery.isDisabled(), true);
    assert.equal(await page.evaluate(() => window.signCalls), 0);
    await page.close();
  }
  console.log('Expiry recovery passed: desktop/mobile, no automatic quote/sign/submit, review guarded.');
} finally { await browser.close(); }
