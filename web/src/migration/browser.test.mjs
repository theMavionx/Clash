// Local mocked migration flow: never connects to RPC or sends a funded transaction.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
const { chromium } = await import(pathToFileURL(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const owner = Keypair.generate().publicKey;
const tx = new Transaction({ feePayer: owner, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
const encoded = tx.serialize({ requireAllSignatures: false }).toString('base64');
const output = new URL('../../artifacts/migration/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(); const errors = []; let submitted = 0;
    page.on('pageerror', error => { if (!errors.length) errors.push(error.stack); });
    await page.addInitScript(({ wallet }) => {
      const events = {};
      window.phantom = { solana: { publicKey: { toBase58: () => wallet }, connect: async () => {}, signMessage: async () => ({ signature: new Uint8Array(64) }), signTransaction: async transaction => transaction,
        on: (name, listener) => { events[name] = listener; }, removeListener: name => { delete events[name]; }, disconnect: () => events.disconnect?.() } };
      window.mockWalletChange = () => events.accountChanged?.();
    }, { wallet: owner.toBase58() });
    await page.route('**/api/migration/**', async route => {
      const path = new URL(route.request().url()).pathname.split('/').pop();
      const data = {
        status: { enabled: true, ready: true, sourceDecimals: 6, ratio: '1', feeUsd: '2', snapshot: { slot: 360000000, ...(width === 320 ? { mode: 'historical', requestedAt: Date.parse('2026-09-20T13:45:00Z') } : {}) } },
        challenge: { id: 'challenge', message: 'Local test signature only' }, verify: { token: 'mock-session', wallet: owner.toBase58() },
        account: { eligibleUnits: '1000000000', remainingUnits: '1000000000', balanceUnits: '1000000000', requests: submitted ? [{ id: 'q1', inputUnits: '1000000', outputUnits: '1000000000000000000', targetDecimals: 18, status: 'deposit_pending', destination: '0x' + '1'.repeat(40) }] : [] },
        quote: { id: 'q1', inputUnits: '1000000', outputUnits: '1000000000000000000', targetDecimals: 18, destination: '0x' + '1'.repeat(40), sourceMint: 'SOURCE_TEST_MINT', targetToken: '0x' + '2'.repeat(40), feeLamports: '15000000', expiresAt: Date.now() + 120000, transaction: encoded },
        submit: { id: 'q1', status: 'deposit_pending' },
      };
      if (path === 'submit') { submitted++; assert.equal(route.request().postDataJSON().id, 'q1'); }
      await route.fulfill({ json: data[path] || {} });
    });
    await page.goto('http://127.0.0.1:5211/migration');
    await page.getByText('Migration available', { exact: true }).waitFor();
    if (width === 320) await page.getByText('2026-09-20 13:45:00 UTC', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('CLASH to migrate', { exact: true }).isDisabled(), true);
    await page.screenshot({ path: new URL(`disconnected-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    const headerConnect = page.locator('header').getByRole('button', { name: 'Connect wallet', exact: true });
    await headerConnect.click();
    assert.equal(await page.getByRole('menuitem', { name: 'Phantom', exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.getByRole('menuitem', { name: 'Solflare', exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await headerConnect.evaluate(node => node === document.activeElement), true);
    await page.locator('form').getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Phantom', exact: true }).click();
    await page.getByLabel('CLASH to migrate', { exact: true }).fill('1');
    await page.getByLabel('Robinhood EVM recipient address').fill('0x' + '1'.repeat(40));
    await page.getByRole('button', { name: 'Review migration', exact: true }).click();
    const sign = page.getByRole('button', { name: 'Sign deposit and migrate' });
    await sign.waitFor(); assert.equal(await sign.isDisabled(), true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: new URL(`review-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('checkbox').check(); await sign.click();
    await page.getByText('Deposit submitted — awaiting confirmation', { exact: true }).waitFor(); assert.equal(submitted, 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: new URL(`submitted-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    await page.evaluate(() => window.mockWalletChange());
    await page.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).waitFor();
    assert.equal(await page.getByText('Deposit submitted — awaiting confirmation', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  const recovery = await browser.newPage();
  const recoveryErrors = []; recovery.on('pageerror', error => recoveryErrors.push(error.message));
  let state = 'quoted', unauthorized = false, cancelled = 0, recoverySubmits = 0;
  const restoredQuote = { id: 'recover1', status: 'quoted', inputUnits: '1000000', outputUnits: '1000000000000000000', targetDecimals: 18, destination: '0x' + '1'.repeat(40), sourceMint: 'SOURCE_TEST_MINT', targetToken: '0x' + '2'.repeat(40), feeLamports: '15000000', expiresAt: Date.now() + 120000, transaction: encoded };
  await recovery.addInitScript(({ wallet }) => {
    window.signCalls = 0;
    window.phantom = { solana: { publicKey: { toBase58: () => wallet }, connect: async () => {}, signMessage: async () => ({ signature: new Uint8Array(64) }), signTransaction: async tx => { window.signCalls++; return tx; }, on: () => {}, removeListener: () => {} } };
  }, { wallet: owner.toBase58() });
  await recovery.route('**/api/migration/**', async route => {
    const path = new URL(route.request().url()).pathname.split('/').pop();
    if (path === 'account' && unauthorized) return route.fulfill({ status: 401, json: { error: 'AUTH_REQUIRED' } });
    if (path === 'cancel') { assert.equal(route.request().postDataJSON().id, 'recover1'); cancelled++; state = 'expired'; }
    if (path === 'quote') state = 'quoted';
    if (path === 'submit') { recoverySubmits++; state = 'deposit_signed'; return route.abort('failed'); }
    const payload = {
      status: { enabled: true, ready: true, sourceDecimals: 6, ratio: '1', feeUsd: '2', snapshot: { slot: 1 } },
      challenge: { id: 'test', message: 'Local test signature only' }, verify: { token: 'recovery', wallet: owner.toBase58(), expiresAt: Date.now() + 60000 },
      account: { remainingUnits: '1000000000', balanceUnits: '1000000000', eligibleUnits: '1000000000', activeQuote: state === 'quoted' ? restoredQuote : null, requests: [{ ...restoredQuote, status: state }] },
      quote: restoredQuote, cancel: { id: 'recover1', status: 'expired' },
    };
    return route.fulfill({ json: payload[path] || {} });
  });
  await recovery.goto('http://127.0.0.1:5211/migration');
  await recovery.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await recovery.getByRole('menuitem', { name: 'Phantom', exact: true }).click();
  await recovery.getByRole('button', { name: 'Cancel review' }).waitFor();
  assert.equal(await recovery.evaluate(() => window.signCalls), 0); // Existing quote restored without signing.
  await recovery.getByRole('button', { name: 'Cancel review' }).click();
  await recovery.getByLabel('CLASH to migrate', { exact: true }).waitFor(); assert.equal(cancelled, 1);
  await recovery.getByLabel('CLASH to migrate', { exact: true }).fill('1');
  await recovery.getByLabel('Robinhood EVM recipient address').fill('0x' + '1'.repeat(40));
  await recovery.getByRole('button', { name: 'Review migration', exact: true }).click();
  await recovery.getByRole('checkbox').check();
  await recovery.getByRole('button', { name: 'Sign deposit and migrate' }).click();
  await recovery.getByText('Deposit submitted — awaiting confirmation', { exact: true }).waitFor();
  assert.equal(recoverySubmits, 1); assert.equal(await recovery.evaluate(() => window.signCalls), 1);
  assert.equal(await recovery.getByRole('button', { name: 'Sign deposit and migrate' }).count(), 0);
  unauthorized = true;
  await recovery.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await recovery.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).waitFor();
  assert.equal(await recovery.getByText('Deposit submitted — awaiting confirmation', { exact: true }).count(), 0);
  assert.deepEqual(recoveryErrors, []); await recovery.close();
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Pacific/Honolulu' });
  const writes = []; const adminErrors = [];
  let snapshotLocked = false, adminSnapshot = { slot: 100, wallets: 10, createdAt: 1790000000000 };
  admin.on('pageerror', error => { if (!adminErrors.length) adminErrors.push(error.stack); });
  admin.on('dialog', dialog => dialog.accept());
  await admin.route('**/api/migration/admin**', route => {
    if (route.request().method() !== 'GET') writes.push(route.request().postDataJSON());
    if (route.request().url().endsWith('/snapshot') && route.request().method() === 'POST') adminSnapshot = { ...adminSnapshot, mode: 'historical', requestedAt: Date.parse(route.request().postDataJSON().at), blockTime: Date.parse(route.request().postDataJSON().at) - 1000, wallets: 0 };
    return route.fulfill({ json: { config: { enabled: false, ratio: '1', targetToken: '0x' + '2'.repeat(40), feeUsd: '2', batchUsd: 400, idleSeconds: 600, residualUsd: 100, slippageBps: 500, maxSlippageBps: 1000 }, readiness: { ready: false, reasons: ['SNAPSHOT_REQUIRED'] }, snapshot: adminSnapshot, canReplaceSnapshot: !snapshotLocked, wallets: { solana: owner.toBase58(), evm: '0x' + '3'.repeat(40) }, requests: [], sales: [], audit: [{ event: 'snapshot_published', at: 1790000000000 }] } });
  });
  await admin.goto('http://127.0.0.1:5211/src/migration/admin-preview.html');
  await admin.getByRole('heading', { name: 'Configuration', exact: true }).waitFor();
  const cutoffInput = admin.getByLabel('Snapshot cutoff (UTC)', { exact: true });
  const cutoffSave = admin.getByRole('button', { name: 'Save snapshot cutoff', exact: true });
  const cutoffConfirm = admin.getByLabel('I confirm the selected UTC cutoff defines eligible wallets.');
  assert.equal(await cutoffInput.inputValue(), ''); assert.equal(await cutoffSave.isDisabled(), true);
  assert.equal(await cutoffConfirm.isDisabled(), true);
  await cutoffInput.fill('2099-01-01T12:00');
  assert.equal(await cutoffInput.getAttribute('aria-invalid'), 'true'); assert.equal(await cutoffSave.isDisabled(), true);
  await cutoffInput.fill('2026-09-20T13:45');
  await cutoffConfirm.check(); assert.equal(await cutoffSave.isDisabled(), false);
  await cutoffInput.fill('2026-09-20T14:45'); assert.equal(await cutoffConfirm.isChecked(), false);
  await cutoffInput.fill('2026-09-20T13:45');
  await cutoffConfirm.check();
  assert.equal(await cutoffInput.getAttribute('max'), new Date().toISOString().slice(0, 16));
  assert.match(await admin.locator('tbody').innerText(), /UTC/);
  await admin.getByLabel('New secret', { exact: true }).fill('local-test-private-key');
  await admin.getByRole('button', { name: 'Store encrypted credential' }).click();
  await admin.getByText('Saved. Readiness and settlement status refreshed.').waitFor();
  assert.equal(await admin.getByLabel('New secret', { exact: true }).inputValue(), '');
  assert.deepEqual(writes[0], { kind: 'solana', secret: 'local-test-private-key' });
  assert.equal(await admin.evaluate(() => JSON.stringify(localStorage).includes('local-test-private-key')), false);
  await admin.getByRole('button', { name: 'Save configuration' }).click();
  await admin.getByText('Saved. Readiness and settlement status refreshed.').waitFor();
  assert.equal(writes[1].maxSlippageBps, 1000);
  assert.equal(writes[1].batchUsd, '400');
  assert.equal(writes[1].residualUsd, '100');
  assert.equal(writes[1].feeUsd, '2');
  await admin.getByRole('combobox').selectOption('robinhoodRpc');
  await admin.getByLabel('New secret', { exact: true }).fill('local-test-alchemy-key');
  await admin.getByRole('button', { name: 'Store encrypted credential' }).click();
  await admin.getByText('Saved. Readiness and settlement status refreshed.').waitFor();
  assert.deepEqual(writes[2], { kind: 'robinhoodRpc', secret: 'local-test-alchemy-key' });
  assert.equal(await admin.getByLabel('New secret', { exact: true }).inputValue(), '');
  assert.equal(await admin.evaluate(() => JSON.stringify(localStorage).includes('local-test-alchemy-key')), false);
  await cutoffSave.click();
  await admin.getByText('0 wallets evaluated so far (not all holders)', { exact: true }).waitFor();
  assert.deepEqual(writes[3], { confirm: true, at: '2026-09-20T13:45:00.000Z' });
  await admin.locator('section').filter({ has: admin.getByRole('heading', { name: 'Eligibility snapshot', exact: true }) }).screenshot({ path: new URL('admin-snapshot-utc.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  snapshotLocked = true; adminSnapshot = null;
  await admin.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await admin.getByText('No snapshot cutoff saved. Select a past UTC date and time to determine eligible balances.').waitFor();
  assert.equal(await cutoffInput.isDisabled(), true); assert.equal(await cutoffConfirm.isDisabled(), true); assert.equal(await cutoffSave.isDisabled(), true);
  assert.deepEqual(adminErrors, []);
  await admin.screenshot({ path: new URL('admin-1440.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await admin.close();
  console.log('PASS: desktop/mobile flow; active quote restoration/cancel; lost-submit-response reconciliation without re-sign; 401 session reset; admin write-only keys, bounded config, snapshot replacement and UTC audit.');
} finally { await browser.close(); }
