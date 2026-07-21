const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.HYPERLIQUID_BUILDER_ADDRESS = '0xe2723c1a95692096b4f967eb928f5cc55f098db5';
process.env.HYPERLIQUID_BUILDER_FEE_TENTH_BPS = '10';
process.env.NODE_ENV = 'development';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-hyperliquid-test-'));
process.env.CLASH_FUTURES_DB = path.join(tempDir, 'futures.db');

const worker = require('./hyperliquid-rewards-worker');
const hyperliquid = require('./hyperliquid');
const db = require('./db');

const officialFill = {
  coin: 'CHIP',
  px: '0.030027',
  sz: '492',
  dir: 'Open Short',
  side: 'A',
  crossed: true,
  builderFee: '0.001477',
  closedPnl: '0.0',
  time: 1784641023926,
  tid: 123,
  oid: 456,
  hash: '0xabc',
};

const attributed = worker.classifyClashBuilderFill(officialFill, { approvalTenthBps: 50 });
assert.equal(attributed.ok, true);
assert.equal(attributed.mode, 'legacy_builder_fee_and_approval');

const clashAttributed = worker.classifyClashBuilderFill({
  ...officialFill,
  cloid: '0x434f5001000000000000000000000001',
}, { approvalTenthBps: 50 });
assert.equal(clashAttributed.ok, true);
assert.equal(clashAttributed.mode, 'cloid_and_builder_fee');
assert.equal(worker.isClashCloid({ cloid: '0x434f5001000000000000000000000001' }), true);
assert.equal(worker.isClashCloid(officialFill), false);

assert.equal(worker.classifyClashBuilderFill(officialFill, { approvalTenthBps: 9 }).ok, false);
assert.equal(worker.classifyClashBuilderFill({ ...officialFill, builderFee: '0.010000' }, { approvalTenthBps: 50 }).ok, false);
assert.equal(worker.classifyClashBuilderFill({
  ...officialFill,
  builder: '0x1111111111111111111111111111111111111111',
}, { approvalTenthBps: 50 }).ok, false);

const explicit = worker.classifyClashBuilderFill({
  ...officialFill,
  builder: process.env.HYPERLIQUID_BUILDER_ADDRESS,
});
assert.equal(explicit.ok, true);
assert.equal(explicit.mode, 'explicit_builder');

const normalized = worker.normalizeFill(
  '0x1393ffefdd7a8ebda633f35c62977266a0c51493',
  officialFill,
);
assert.equal(normalized.symbol, 'CHIP');
assert.equal(normalized.side, 'short');
assert.equal(normalized.status, 'filled');
assert.equal(normalized.createdAt, new Date(officialFill.time).toISOString());
assert.equal(normalized.fee, officialFill.builderFee);
assert.equal(worker.sideFromFill({ dir: 'Close Short', side: 'B' }), 'close_short');
assert.equal(worker.sideFromFill({ dir: 'Close Long', side: 'A' }), 'close_long');
assert.equal(worker.sideFromFill({ dir: '', side: 'B' }), 'long');

(async () => {
  const wallet = '0x1393ffefdd7a8ebda633f35c62977266a0c51493';
  hyperliquid.getUserFills = async (requestedWallet) => {
    assert.equal(requestedWallet, wallet);
    return [officialFill];
  };
  hyperliquid.getMaxBuilderFee = async (requestedWallet, builder) => {
    assert.equal(requestedWallet, wallet);
    assert.equal(builder, process.env.HYPERLIQUID_BUILDER_ADDRESS);
    return 50;
  };

  const result = await worker.importFillsForPlayer('player-1', wallet, { lookbackMs: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.imported, 1);
  assert.equal(result.builderApprovalTenthBps, 50);

  const row = db.db.prepare(`
    SELECT player_id, symbol, side, status, dex, notional_usd,
           verified_source, fee, proof_json, created_at
    FROM trade_history
    WHERE player_id = ? AND dex = 'hyperliquid'
  `).get('player-1');
  assert.equal(row.symbol, 'CHIP');
  assert.equal(row.side, 'short');
  assert.equal(row.status, 'filled');
  assert.equal(row.verified_source, 'hyperliquid_api');
  assert.equal(row.fee, officialFill.builderFee);
  assert.equal(row.created_at, new Date(officialFill.time).toISOString());
  const proof = JSON.parse(row.proof_json);
  assert.equal(proof.builder, process.env.HYPERLIQUID_BUILDER_ADDRESS);
  assert.equal(proof.verification_mode, 'legacy_builder_fee_and_approval');
  assert.equal(proof.fill.tid, officialFill.tid);

  console.log('hyperliquid rewards attribution tests passed');
})().finally(() => {
  try { db.db.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
