// Local mocked migration flow: never connects to RPC or sends a funded transaction.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { installTestWallet } from './wallet-test-fixture.mjs';
import { previewSolanaMnemonic } from './solana-mnemonic.js';
const { chromium } = await import(pathToFileURL(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const owner = Keypair.generate().publicKey;
const tx = new Transaction({ feePayer: owner, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
const encoded = tx.serialize({ requireAllSignatures: false }).toString('base64');
const output = new URL('../../artifacts/migration/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  const retryPage = await browser.newPage();
  let initialStatusCalls = 0;
  await retryPage.route('**/api/migration/status', route => ++initialStatusCalls === 1
    ? route.fulfill({ status: 503, json: { error: 'MIGRATION_UNAVAILABLE' } })
    : route.fulfill({ json: { enabled: true, ready: true, sourceDecimals: 6 } }));
  await retryPage.goto('http://127.0.0.1:5211/migration');
  await retryPage.getByText('Migration available', { exact: true }).waitFor({ timeout: 20000 });
  assert.equal(initialStatusCalls, 2, 'Disconnected page recovers automatically after initial provider failure');
  await retryPage.close();
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(); const errors = []; let submitted = 0, quoteCalls = 0;
    let rejectSubmit = width === 1440, depositConfirmed = false;
    const usdg = width === 390 ? '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' : null;
    page.on('pageerror', error => { if (!errors.length) errors.push(error.stack); });
    await page.addInitScript(installTestWallet, { wallet: owner.toBase58(), publicKey: [...owner.toBytes()] });
    await page.route('**/api/migration/**', async route => {
      const path = new URL(route.request().url()).pathname.split('/').pop();
      if (path === 'submit' && rejectSubmit) {
        rejectSubmit = false;
        return route.fulfill({ status: 400, json: { error: 'TRANSACTION_CHANGED', traceId: 'd110cb96-7b5c-495d-b792-92d1728d1d34' } });
      }
      const data = {
        status: { payoutDelay: { enabled: true, minSeconds: 150, maxSeconds: 420 }, enabled: true, ready: true, sourceDecimals: 6, ratio: usdg ? '0.001' : '1', targetToken: usdg || '0x' + '2'.repeat(40), feeUsd: '2', snapshot: { slot: 360000000, ...(width === 320 ? { mode: 'historical', requestedAt: Date.parse('2026-09-20T13:45:00Z') } : {}) } },
        challenge: { id: 'challenge', message: 'Local test signature only' }, verify: { token: 'mock-session', wallet: owner.toBase58() },
        account: { eligibleUnits: '1000000000', remainingUnits: width === 390 ? '234567891' : '1000000000', balanceUnits: width === 320 ? '123456789' : '1000000000', requests: submitted ? [{ id: 'q1', targetToken: usdg || '0x' + '2'.repeat(40), inputUnits: '1000000', outputUnits: usdg ? '1000' : '1000000000000000000', targetDecimals: usdg ? 6 : 18, status: depositConfirmed ? 'deposited' : 'deposit_pending', destination: '0x' + '1'.repeat(40) }] : [] },
        quote: { id: 'q1', inputUnits: '1000000', outputUnits: usdg ? '1000' : '1000000000000000000', targetDecimals: usdg ? 6 : 18, destination: '0x' + '1'.repeat(40), sourceMint: 'SOURCE_TEST_MINT', targetToken: usdg || '0x' + '2'.repeat(40), feeLamports: '15000000', expiresAt: Date.now() + 120000, transaction: encoded },
        submit: { id: 'q1', status: 'deposit_pending' },
      };
      if (path === 'submit') { submitted++; assert.equal(route.request().postDataJSON().id, 'q1'); }
      if (path === 'quote') quoteCalls++;
      await route.fulfill({ json: data[path] || {} });
    });
    await page.goto('http://127.0.0.1:5211/migration');
    await page.getByText('Migration available', { exact: true }).waitFor();
    await page.locator('.migration-payout-timing').filter({ hasText: '2.5–7 minutes' }).waitFor();
    assert.equal(await page.locator('.migration-brand').evaluate(node => node.getBoundingClientRect().left), width > 720 ? 24 : 16, 'Brand uses compact page-edge gutter, not centered max-width margin');
    const heroImages = page.locator('.migration-intro img');
    assert.equal(await heroImages.count(), 3, 'Hero shows CLASH, Solana and Robinhood logos');
    await page.waitForFunction(() => [...document.querySelectorAll('.migration-intro img')].every(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Hero must not overflow mobile viewport');
    if (width === 320) await page.getByText('2026-09-20 13:45:00 UTC', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('CLASH to migrate', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Use maximum available CLASH', exact: true }).isDisabled(), true);
    await page.screenshot({ path: new URL(`disconnected-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    const headerConnect = page.locator('header').getByRole('button', { name: 'Connect wallet', exact: true });
    await headerConnect.click();
    const picker = page.getByRole('dialog', { name: 'Connect your Solana wallet', exact: true });
    await picker.waitFor();
    assert.equal(await picker.evaluate(node => node.contains(document.activeElement)), true);
    await page.screenshot({ path: new URL(`wallet-picker-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    assert.equal(await page.evaluate(() => window.connectCalls), 0, 'Opening picker must not connect or sign');
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.equal(await picker.evaluate(node => node.contains(document.activeElement)), true); }
    await page.keyboard.press('Escape');
    assert.equal(await headerConnect.evaluate(node => node === document.activeElement), true);
    await page.locator('form').getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Phantom/ }).click();
    const maxButton = page.getByRole('button', { name: 'Use maximum available CLASH', exact: true });
    await maxButton.click();
    assert.equal(await page.getByLabel('CLASH to migrate', { exact: true }).inputValue(), width === 320 ? '123.456789' : width === 390 ? '234.567891' : '1000');
    assert.equal(quoteCalls, 0); assert.equal(submitted, 0);
    assert.equal(await page.evaluate(() => window.signCalls), 0);
    await page.screenshot({ path: new URL(`max-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    await page.getByLabel('CLASH to migrate', { exact: true }).fill('1');
    await page.getByLabel('Robinhood EVM recipient address').fill('0x' + '1'.repeat(40));
    await page.getByRole('button', { name: 'Review migration', exact: true }).click();
    const sign = page.getByRole('button', { name: 'Sign deposit and migrate' });
    await sign.waitFor(); assert.equal(await sign.isDisabled(), true);
    if (usdg) { await page.getByText('0.001 USDG', { exact: true }).waitFor(); await page.getByText('1000 CLASH = 1 USDG', { exact: true }).waitFor(); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: new URL(`review-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('checkbox').check(); await sign.click();
    if (width === 1440) {
      await page.locator('.migration-notice').filter({ hasText: 'The wallet changed the prepared deposit transaction.' }).waitFor();
      assert.match(await page.locator('.migration-notice').innerText(), /Reference: d110cb96-7b5c-495d-b792-92d1728d1d34/);
      assert.equal(submitted, 0);
      assert.equal(await page.getByRole('button', { name: 'Retry same submission' }).count(), 0);
      const cancel = page.getByRole('button', { name: 'Cancel review', exact: true });
      assert.equal(await cancel.isEnabled(), true);
      await cancel.click();
      assert.equal(await page.evaluate(() => window.signCalls), 1);
      await page.getByRole('button', { name: 'Review migration', exact: true }).click();
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Sign deposit and migrate' }).click();
    }
    await page.getByText('Deposit submitted — awaiting confirmation', { exact: true }).waitFor(); assert.equal(submitted, 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: new URL(`submitted-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    depositConfirmed = true;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.getByText('Processing — your Robinhood payout is queued', { exact: true }).waitFor();
    await page.screenshot({ path: new URL(`processing-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    await page.evaluate(() => window.mockWalletChange());
    await page.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).waitFor();
    assert.equal(await page.getByText('Deposit submitted — awaiting confirmation', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  const recovery = await browser.newPage();
  const recoveryErrors = []; recovery.on('pageerror', error => recoveryErrors.push(error.message));
  let state = 'quoted', unauthorized = false, cancelled = 0, recoverySubmits = 0;
  let expireFirstSubmit = true;
  const restoredQuote = { id: 'recover1', status: 'quoted', inputUnits: '1000000', outputUnits: '1000000000000000000', targetDecimals: 18, destination: '0x' + '1'.repeat(40), sourceMint: 'SOURCE_TEST_MINT', targetToken: '0x' + '2'.repeat(40), feeLamports: '15000000', expiresAt: Date.now() + 120000, transaction: encoded };
  await recovery.addInitScript(installTestWallet, { wallet: owner.toBase58(), publicKey: [...owner.toBytes()] });
  await recovery.route('**/api/migration/**', async route => {
    const path = new URL(route.request().url()).pathname.split('/').pop();
    if (path === 'account' && unauthorized) return route.fulfill({ status: 401, json: { error: 'AUTH_REQUIRED' } });
    if (path === 'cancel') { assert.equal(route.request().postDataJSON().id, 'recover1'); cancelled++; state = 'expired'; }
    if (path === 'quote') state = 'quoted';
    if (path === 'submit') {
      if (expireFirstSubmit) {
        expireFirstSubmit = false; state = 'expired';
        return route.fulfill({ json: { id: 'recover1', status: 'expired' } });
      }
      recoverySubmits++; state = 'deposit_signed'; return route.abort('failed');
    }
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
  await recovery.getByRole('dialog').getByRole('button', { name: /Phantom/ }).click();
  await recovery.getByRole('button', { name: 'Cancel review' }).waitFor();
  assert.equal(await recovery.evaluate(() => window.signCalls), 0); // Existing quote restored without signing.
  await recovery.getByRole('button', { name: 'Cancel review' }).click();
  await recovery.getByLabel('CLASH to migrate', { exact: true }).waitFor(); assert.equal(cancelled, 1);
  await recovery.getByLabel('CLASH to migrate', { exact: true }).fill('1');
  await recovery.getByLabel('Robinhood EVM recipient address').fill('0x' + '1'.repeat(40));
  await recovery.getByRole('button', { name: 'Review migration', exact: true }).click();
  await recovery.getByRole('checkbox').check();
  await recovery.getByRole('button', { name: 'Sign deposit and migrate' }).click();
  await recovery.locator('.migration-notice').filter({ hasText: 'This quote has expired.' }).waitFor();
  assert.equal(await recovery.getByText('Deposit submitted — awaiting confirmation', { exact: true }).count(), 0);
  await recovery.getByRole('button', { name: 'Review migration', exact: true }).click();
  await recovery.getByRole('checkbox').check();
  await recovery.getByRole('button', { name: 'Sign deposit and migrate' }).click();
  await recovery.getByText('Deposit submitted — awaiting confirmation', { exact: true }).waitFor();
  assert.equal(recoverySubmits, 1); assert.equal(await recovery.evaluate(() => window.signCalls), 2);
  assert.equal(await recovery.getByRole('button', { name: 'Sign deposit and migrate' }).count(), 0);
  unauthorized = true;
  await recovery.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await recovery.locator('header').getByRole('button', { name: 'Verify wallet', exact: true }).waitFor();
  assert.equal(await recovery.getByText('Deposit submitted — awaiting confirmation', { exact: true }).count(), 0);
  assert.deepEqual(recoveryErrors, []); await recovery.close();
  // Auth cancellation can retry; disconnect while the signature is pending cannot publish stale auth.
  const safety = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await safety.addInitScript(installTestWallet, { wallet: owner.toBase58(), publicKey: [...owner.toBytes()] });
  let verifies = 0;
  await safety.route('**/api/migration/**', async route => {
    const path = new URL(route.request().url()).pathname.split('/').pop();
    if (path === 'verify') verifies++;
    await route.fulfill({ json: {
      status: { enabled: true, ready: true, sourceDecimals: 6, ratio: '1', feeUsd: '2' },
      challenge: { id: 'safety', message: 'Test wallet ownership only' },
      verify: { wallet: owner.toBase58(), token: 'safety', expiresAt: Date.now() + 60000 },
      account: { remainingUnits: '1000000000', balanceUnits: '1000000000', requests: [] },
    }[path] || {} });
  });
  await safety.goto('http://127.0.0.1:5211/migration');
  await safety.evaluate(() => { window.rejectMessage = true; });
  await safety.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await safety.getByRole('dialog').getByRole('button', { name: /Phantom/ }).click();
  await safety.waitForFunction(() => window.messageCalls === 1);
  assert.equal(verifies, 0);
  await safety.evaluate(() => { window.rejectMessage = false; window.messageGate = new Promise(resolve => { window.releaseMessage = resolve; }); });
  await safety.locator('header').getByRole('button', { name: 'Verify wallet', exact: true }).click();
  await safety.getByRole('menuitem', { name: 'Verify wallet', exact: true }).click();
  await safety.waitForFunction(() => window.messageCalls === 2);
  await safety.evaluate(() => { window.mockWalletChange(); window.releaseMessage(); });
  await safety.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).waitFor();
  assert.equal(verifies, 0, 'Disconnected wallet must not send stale verification');
  await safety.close();
  const empty = await browser.newPage({ viewport: { width: 320, height: 700 } });
  await empty.route('**/api/migration/status', route => route.fulfill({ json: { enabled: false, ready: false, ratio: '1', feeUsd: '2' } }));
  await empty.goto('http://127.0.0.1:5211/migration');
  await empty.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
  const emptyPicker = empty.getByRole('dialog', { name: 'Connect your Solana wallet', exact: true });
  await emptyPicker.waitFor();
  assert.ok(await emptyPicker.getByRole('link').count() >= 2, 'No wallet state offers installation links');
  await empty.screenshot({ path: new URL('wallet-picker-empty-320.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await empty.getByRole('button', { name: 'Close wallet picker', exact: true }).click();
  await emptyPicker.waitFor({ state: 'hidden' });
  await empty.close();
  const legacy = await browser.newPage();
  await legacy.addInitScript(({ address }) => {
    window.phantom = { solana: { publicKey: { toBase58: () => address }, connect: async () => {}, signMessage: async () => ({ signature: new Uint8Array(64) }), signTransaction: async tx => tx, on: () => {}, removeListener: () => {} } };
  }, { address: owner.toBase58() });
  await legacy.route('**/api/migration/**', route => route.fulfill({ json: {
    status: { ready: false, enabled: false, ratio: '1', feeUsd: '2' }, challenge: { id: 'legacy', message: 'Test legacy wallet' },
    verify: { wallet: owner.toBase58(), token: 'legacy' }, account: { requests: [] },
  }[new URL(route.request().url()).pathname.split('/').pop()] || {} }));
  await legacy.goto('http://127.0.0.1:5211/migration');
  await legacy.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await legacy.getByRole('dialog').getByRole('button', { name: /Phantom/ }).click();
  await legacy.locator('header').getByRole('button', { name: new RegExp(owner.toBase58().slice(0, 5)) }).waitFor();
  await legacy.close();
  const unsupported = await browser.newPage();
  await unsupported.addInitScript(installTestWallet, { wallet: owner.toBase58(), publicKey: [...owner.toBytes()], unsupportedAccount: true });
  let unsupportedAuthCalls = 0;
  await unsupported.route('**/api/migration/**', route => {
    if (!route.request().url().endsWith('/status')) unsupportedAuthCalls++;
    return route.fulfill({ json: { ready: false, enabled: false, ratio: '1', feeUsd: '2' } });
  });
  await unsupported.goto('http://127.0.0.1:5211/migration');
  await unsupported.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await unsupported.getByRole('dialog').getByRole('button', { name: /Phantom/ }).click();
  await unsupported.waitForFunction(() => window.connectCalls === 1);
  await unsupported.getByRole('status').filter({ hasText: /sign/i }).waitFor();
  assert.equal(unsupportedAuthCalls, 0, 'Unsupported account must not request authentication');
  assert.equal(await unsupported.evaluate(() => window.messageCalls), 0);
  await unsupported.close();
  const longName = await browser.newPage({ viewport: { width: 320, height: 700 } });
  await longName.addInitScript(installTestWallet, { wallet: owner.toBase58(), publicKey: [...owner.toBytes()], name: 'LongBrandedSolanaWalletNameWithoutSpaces' });
  await longName.route('**/api/migration/status', route => route.fulfill({ json: { ready: false, enabled: false, ratio: '1', feeUsd: '2' } }));
  await longName.goto('http://127.0.0.1:5211/migration');
  await longName.locator('header').getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await longName.getByRole('dialog').getByRole('button', { name: /LongBranded/ }).waitFor();
  assert.equal(await longName.getByRole('dialog').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Long discovered wallet name must wrap without overflow');
  await longName.close();
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Pacific/Honolulu' });
  const writes = []; const adminErrors = [];
  let snapshotLocked = false, settledReplacement = false, adminSnapshot = { slot: 100, wallets: 10, createdAt: 1790000000000 };
  admin.on('pageerror', error => { if (!adminErrors.length) adminErrors.push(error.stack); });
  admin.on('dialog', dialog => dialog.accept());
  await admin.route('**/api/migration/admin**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/ledger')) return route.fulfill({ json: {
      page: 1, pageSize: 50, pages: 1, summary: { requests: 1, wallets: 1, confirmedDeposits: 1,
        confirmedInputUnits: '4000000000', confirmedFeeLamports: '20000000', paidRequests: 1,
        payouts: [{ targetToken: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6, units: '4000000' }] },
      requests: [{ id: 'ledger-test', wallet: owner.toBase58(), destination: '0x'+'1'.repeat(40), status: 'paid',
        inputUnits:'4000000000', outputUnits:'4000000', feeLamports:'20000000', targetDecimals:6,
        targetToken:'0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', createdAt:1790000000000,
        depositedAt:1790000001000, payoutNotBefore:1790000151000, paidAt:1790000152000 }],
    } });
    if (route.request().method() !== 'GET') writes.push(route.request().postDataJSON());
    if (route.request().url().endsWith('/snapshot') && route.request().method() === 'POST') adminSnapshot = { ...adminSnapshot, mode: 'historical', requestedAt: Date.parse(route.request().postDataJSON().at), blockTime: Date.parse(route.request().postDataJSON().at) - 1000, wallets: 0 };
    return route.fulfill({ json: { config: { payoutDelayEnabled: true, payoutDelayMinSeconds: 150, payoutDelayMaxSeconds: 420, enabled: false, ratio: '1', targetToken: '0x' + '2'.repeat(40), feeUsd: '2', batchUsd: 400, idleSeconds: 600, residualUsd: 100, slippageBps: 500, maxSlippageBps: 1000 }, readiness: { ready: false, reasons: ['SNAPSHOT_REQUIRED'] }, snapshot: adminSnapshot, canReplaceSnapshot: !snapshotLocked, canReplaceSettledSnapshot: settledReplacement, wallets: { solana: owner.toBase58(), evm: '0x' + '3'.repeat(40) }, requests: [], sales: [], audit: [{ event: 'snapshot_published', at: 1790000000000 }] } });
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
  assert.match((await admin.locator('tbody').allTextContents()).join(' '), /UTC/);
  await admin.getByRole('heading', { name: 'Migration ledger', exact: true }).waitFor();
  await admin.getByText(/Payout eligible after:/).waitFor();
  await admin.getByText('4000 CLASH', { exact: false }).waitFor();
  const ledgerCard = admin.getByRole('heading', { name: 'Migration ledger', exact: true }).locator('..');
  await ledgerCard.screenshot({ path: new URL('admin-ledger-desktop.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  await admin.setViewportSize({ width: 390, height: 844 });
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Ledger table scroll stays inside the mobile card');
  await ledgerCard.screenshot({ path: new URL('admin-ledger-mobile.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.getByLabel('New secret', { exact: true }).fill('local-test-private-key');
  await admin.getByRole('button', { name: 'Store encrypted credential' }).click();
  await admin.getByText('Saved. Readiness and settlement status refreshed.').waitFor();
  assert.equal(await admin.getByLabel('New secret', { exact: true }).inputValue(), '');
  assert.deepEqual(writes[0], { kind: 'solana', secret: 'local-test-private-key' });
  assert.equal(await admin.evaluate(() => JSON.stringify(localStorage).includes('local-test-private-key')), false);
  const delayToggle = admin.getByLabel('Enable Robinhood payout delay', { exact: true });
  assert.equal(await delayToggle.isChecked(), true);
  await delayToggle.uncheck();
  await admin.getByLabel('Minimum Robinhood payout delay (seconds)', { exact: true }).fill('120');
  await admin.getByLabel('Maximum Robinhood payout delay (seconds, ≤ 3600)', { exact: true }).fill('300');
  await admin.getByRole('button', { name: 'Save configuration' }).click();
  await admin.getByText('Saved. Readiness and settlement status refreshed.').waitFor();
  assert.equal(writes[1].maxSlippageBps, 1000);
  assert.equal(writes[1].batchUsd, '400');
  assert.equal(writes[1].residualUsd, '100');
  assert.equal(writes[1].feeUsd, '2');
  assert.equal(writes[1].payoutDelayEnabled, false);
  assert.equal(writes[1].payoutDelayMinSeconds, 120);
  assert.equal(writes[1].payoutDelayMaxSeconds, 300);
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
  await admin.getByRole('combobox').selectOption('solanaHex');
  const testSeed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
  const expectedKey = Keypair.fromSeed(Uint8Array.from(Buffer.from(testSeed, 'hex')));
  const secretInput = admin.getByLabel('New secret', { exact: true });
  const previewButton = admin.getByRole('button', { name: 'Preview Solana address', exact: true });
  const keySave = admin.getByRole('button', { name: 'Store encrypted credential', exact: true });
  const keyConfirm = admin.getByLabel('I checked this Solana address and want to use it as the treasury.', { exact: true });
  await secretInput.fill('0x' + '1'.repeat(40));
  await previewButton.click();
  assert.equal(await keySave.isDisabled(), true);
  await secretInput.fill('0x' + testSeed);
  await previewButton.click();
  await admin.getByText(expectedKey.publicKey.toBase58(), { exact: true }).waitFor();
  assert.equal(writes.length, 4, 'Preview must never POST a key or mutate settings');
  assert.equal(await keySave.isDisabled(), true);
  assert.equal(await admin.evaluate(seed => JSON.stringify(localStorage).includes(seed) || JSON.stringify(sessionStorage).includes(seed), testSeed), false);
  await keyConfirm.check();
  await secretInput.fill(testSeed);
  assert.equal(await keySave.isDisabled(), true, 'Editing secret invalidates prior preview/confirmation');
  await previewButton.click(); await keyConfirm.check();
  await admin.locator('section').filter({ has: admin.getByRole('heading', { name: 'Treasury credentials', exact: true }) }).screenshot({ path: new URL('admin-solana-hex-preview.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  await keySave.click();
  await admin.getByText('Saved. Readiness and settlement status refreshed.').waitFor();
  assert.equal(writes.length, 5);
  assert.equal(writes[4].kind, 'solana');
  assert.equal(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(writes[4].secret))).publicKey.toBase58(), expectedKey.publicKey.toBase58());
  assert.equal(await secretInput.inputValue(), '');
  assert.equal(await keySave.isDisabled(), true);
  assert.deepEqual(adminErrors, []);
  await admin.getByRole('combobox').selectOption('solanaMnemonic');
  const testPhrase = 'abandon '.repeat(11) + 'about';
  await secretInput.fill('abandon '.repeat(12)); await previewButton.click();
  assert.equal(await keySave.isDisabled(), true);
  await secretInput.fill(testPhrase); await previewButton.click();
  await admin.getByText(previewSolanaMnemonic(testPhrase), { exact: true }).waitFor();
  assert.equal(writes.length, 5, 'Phrase preview must not save or transmit credentials');
  await keyConfirm.check();
  await admin.getByLabel('Solana account index', { exact: true }).fill('1');
  assert.equal(await keySave.isDisabled(), true);
  await previewButton.click();
  await admin.getByText(previewSolanaMnemonic(testPhrase, '1'), { exact: true }).waitFor();
  await keyConfirm.check();
  assert.equal(await admin.evaluate(value => JSON.stringify(localStorage).includes(value) || JSON.stringify(sessionStorage).includes(value), testPhrase), false);
  await admin.locator('section').filter({ has: admin.getByRole('heading', { name: 'Treasury credentials', exact: true }) }).screenshot({ path: new URL('admin-solana-mnemonic-preview.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  await keySave.click(); await admin.getByText('Saved. Readiness and settlement status refreshed.').waitFor();
  assert.equal(writes.length, 6); assert.equal(writes[5].kind, 'solana');
  assert.equal(JSON.stringify(writes).includes(testPhrase), false);
  assert.equal(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(writes[5].secret))).publicKey.toBase58(), previewSolanaMnemonic(testPhrase, '1'));
  assert.equal(await secretInput.inputValue(), ''); assert.equal(await keySave.isDisabled(), true);
  assert.deepEqual(adminErrors, []);
  settledReplacement = true;
  adminSnapshot = { slot: 123, wallets: 1, mode: 'historical', requestedAt: Date.parse('2026-09-20T13:45:00Z'), checksum: 'old-snapshot-checksum' };
  await admin.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await admin.getByRole('note').filter({ hasText: 'Previously migrated CLASH' }).waitFor();
  assert.equal(await cutoffInput.isDisabled(), false);
  await cutoffInput.fill('2026-09-21T17:28');
  await cutoffConfirm.check();
  await cutoffSave.click();
  await admin.getByText('Snapshot cutoff: 2026-09-21 17:28:00 UTC', { exact: true }).waitFor();
  assert.deepEqual(writes.at(-1), { confirm: true, at: '2026-09-21T17:28:00.000Z', replaceSettled: true, expectedChecksum: 'old-snapshot-checksum' });
  assert.deepEqual(adminErrors, []);
  await admin.screenshot({ path: new URL('admin-1440.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await admin.close();
  console.log('PASS: desktop/mobile flow; active quote restoration/cancel; lost-submit-response reconciliation without re-sign; 401 session reset; admin write-only keys, bounded config, snapshot replacement and UTC audit.');
} finally { await browser.close(); }
