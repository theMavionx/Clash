const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-ondo-claim-'));
process.env.CLASH_MAIN_DB = path.join(tmpDir, 'clash.db');
process.env.CLASH_FUTURES_DB = path.join(tmpDir, 'futures.db');
process.env.ONDO_PERPS_BUILDER_CODE = 'clashofperps';
process.env.ONDO_PERPS_BUILDER_FEE_BPS = '1';

const wallet = '0x1111111111111111111111111111111111111111';
const sessionToken = 'test-ondo-browser-session';
const player = {
  id: 'test-ondo-player',
  name: 'Ondo Claim Test',
  dex: 'ondo',
  wallet,
};

const ondo = require('../server-futures/ondo');
const originalVerifySessionOwner = ondo.verifySessionOwner;
const originalImportFillsForPlayer = ondo.importFillsForPlayer;

let verifyCalls = 0;
let importCalls = 0;

ondo.verifySessionOwner = async (token, expectedWallet) => {
  verifyCalls += 1;
  assert.strictEqual(token, sessionToken);
  assert.strictEqual(expectedWallet, wallet);
  return { wallet };
};

ondo.importFillsForPlayer = async (playerId, owner, token, opts) => {
  importCalls += 1;
  assert.strictEqual(playerId, player.id);
  assert.strictEqual(owner, wallet);
  assert.strictEqual(token, sessionToken);
  assert.strictEqual(opts.limit, 100);
  assert.strictEqual(opts.pageCap, 4);
  return { scanned: 1, eligible: 1, imported: 1, duplicates: 0 };
};

async function main() {
  const reconciliation = require('./trade_reconciliation');

  const missingSession = await reconciliation.reconcileTradesForPlayer(player, {
    dex: 'ondo',
    wallet,
    reason: 'claim_gold_missing_session',
    force: true,
  });
  assert.strictEqual(missingSession.ok, false);
  assert.strictEqual(missingSession.skipped, 'browser_session_required');
  assert.strictEqual(verifyCalls, 0);
  assert.strictEqual(importCalls, 0);

  const result = await reconciliation.reconcileTradesForPlayer(player, {
    dex: 'ondo',
    wallet,
    reason: 'claim_gold',
    force: true,
    limit: 100,
    headers: { 'x-ondo-token': sessionToken },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.dex, 'ondo');
  assert.strictEqual(result.wallet, wallet);
  assert.strictEqual(result.imported, 1);
  assert.strictEqual(result.eligible, 1);
  assert.strictEqual(verifyCalls, 1);
  assert.strictEqual(importCalls, 1);

  console.log('Ondo claim reconciliation PASS: verified browser session imports fills before gold claim');
}

main()
  .finally(() => {
    ondo.verifySessionOwner = originalVerifySessionOwner;
    ondo.importFillsForPlayer = originalImportFillsForPlayer;
    try { require('./db').db.close(); } catch {}
    try { require('../server-futures/db').db.close(); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
