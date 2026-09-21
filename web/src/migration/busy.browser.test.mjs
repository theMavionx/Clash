// Mocked local wallet and server only; never broadcasts or signs real funds.
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { installTestWallet } from './wallet-test-fixture.mjs';
const { chromium } = await import(pathToFileURL(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const mode of ['mobile', 'desktop', 'expiry']) {
    const width = mode === 'desktop' ? 1440 : 390;
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const owner = Keypair.generate().publicKey, id = 'd110cb96-7b5c-495d-b792-92d1728d1d34';
    const tx = new Transaction({ feePayer: owner, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
    const events = [], submits = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(installTestWallet, { wallet: owner.toBase58(), publicKey: [...owner.toBytes()], name: 'Mobile Test Wallet' });
    await page.route('**/api/migration/**', route => {
      const path = new URL(route.request().url()).pathname.split('/').pop();
      if (path === 'client-events') { events.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); }
      if (path === 'submit') {
        submits.push(route.request().postDataJSON());
        if (submits.length === 1) return route.fulfill({ status: 409, json: { error: 'WORKER_BUSY' } });
      }
      const data = {
        status: { enabled: true, ready: true, sourceDecimals: 6 },
        challenge: { id: 'test', message: 'Local test' }, verify: { token: 'mock-token', wallet: owner.toBase58() },
        account: { eligibleUnits: '1000000', remainingUnits: '1000000', balanceUnits: '1000000', requests: [] },
        quote: { id, inputUnits: '1000000', outputUnits: '1000000000000000000', targetDecimals: 18, destination: '0x' + '1'.repeat(40), feeLamports: '1', expiresAt: Date.now() + (mode === 'expiry' ? 2000 : 90000), transaction: tx.serialize({ requireAllSignatures: false }).toString('base64') },
        submit: { id, status: 'deposit_signed' },
      };
      return route.fulfill({ json: data[path] || {} });
    });
    await page.goto('http://127.0.0.1:5211/migration');
    await page.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Mobile Test Wallet/ }).click();
    await page.getByLabel('CLASH to migrate', { exact: true }).fill('1');
    await page.getByLabel('Robinhood EVM recipient address').fill('0x' + '1'.repeat(40));
    await page.getByRole('button', { name: 'Review migration', exact: true }).click();
    await page.getByRole('note').filter({ hasText: 'A reservation is not a token transfer' }).waitFor();
    await page.getByRole('checkbox').check();
    await page.evaluate(() => { window.transactionGate = new Promise(resolve => { window.finishSigning = resolve; }); });
    await page.getByRole('button', { name: 'Sign deposit and migrate' }).click();
    await page.waitForFunction(() => window.signCalls === 1);
    assert.equal(submits.length, 0);
    if (mode === 'expiry') {
      await page.getByText('This quote expired. Cancel this review and request a new quote.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Cancel review', exact: true }).isEnabled(), true);
      await page.evaluate(() => window.finishSigning());
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(submits.length, 0);
      assert.ok(events.some(e => e.stage === 'sign_expired'));
      assert.deepEqual(errors, []);
      await page.close(); continue;
    }
    await page.evaluate(() => window.finishSigning());
    await page.getByText('Deposit submitted. Keep this page open to follow confirmation and payout.', { exact: true }).waitFor();
    for (let i = 0; i < 30 && !events.some(e => e.stage === 'submit_returned'); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(submits.length, 2);
    assert.deepEqual(submits[0], submits[1]);
    assert.equal(await page.evaluate(() => window.signCalls), 1);
    for (const stage of ['sign_started', 'sign_returned', 'submit_started', 'submit_returned']) assert.ok(events.some(e => e.stage === stage && e.adapter === 'mobile'));
    assert.ok(!JSON.stringify(events).includes('transaction'));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Mobile/desktop: pending wallet, safe busy retry, one signature and redacted stage telemetry passed.');
} finally { await browser.close(); }
