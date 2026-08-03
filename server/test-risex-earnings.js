const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-risex-earnings-'));
const futuresDbPath = path.join(tempRoot, 'futures.db');
const mainDbPath = path.join(tempRoot, 'clash.db');
process.env.CLASH_FUTURES_DB = futuresDbPath;
process.env.RISEX_BUILDER_ID = '10';
process.env.RISEX_BUILDER_FEE_RECIPIENT = '0x39B36f1EDF2eF5a6f2e02991b3a85Fb356eB5005';

const db = new Database(futuresDbPath);
db.exec(`
  CREATE TABLE trade_history (
    id INTEGER PRIMARY KEY,
    player_id TEXT,
    dex TEXT NOT NULL,
    symbol TEXT,
    side TEXT,
    amount TEXT,
    price TEXT,
    notional_usd REAL,
    fee TEXT,
    order_id TEXT,
    client_order_id TEXT,
    status TEXT NOT NULL,
    verified_source TEXT NOT NULL,
    proof_json TEXT,
    created_at TEXT
  );
`);

const recipient = process.env.RISEX_BUILDER_FEE_RECIPIENT.toLowerCase();
function proof(overrides = {}) {
  return JSON.stringify({
    source: 'risex_place_order_onchain',
    builder: {
      verified: true,
      builder_id: 10,
      expected_builder_id: 10,
      builder_fee_bps: 100,
      expected_builder_fee_bps: 100,
      fee_recipient: recipient,
      ...(overrides.builder || {}),
    },
    ...(overrides.root || {}),
  });
}

const insert = db.prepare(`
  INSERT INTO trade_history (
    id, player_id, dex, symbol, side, amount, price, notional_usd, fee,
    order_id, client_order_id, status, verified_source, proof_json, created_at
  ) VALUES (?, ?, 'risex', 'BTC', 'buy', '1', '1000', ?, '0.5', ?, ?, 'filled', ?, ?, ?)
`);
insert.run(1, 'player-a', 1000, 'order-1', 'client-1', 'risex_builder_onchain', proof(), new Date().toISOString());
insert.run(2, 'player-b', 2000, 'order-2', 'client-2', 'risex_builder_onchain', proof({ builder: {
  builder_id: 11,
  expected_builder_id: 11,
} }), new Date().toISOString());
insert.run(3, 'player-c', 3000, 'order-3', 'client-3', 'risex_builder_onchain', proof({ builder: {
  fee_recipient: '0x0000000000000000000000000000000000000001',
} }), new Date().toISOString());
insert.run(4, 'player-d', 4000, 'order-4', 'client-4', 'risex_builder_onchain', proof({ builder: {
  builder_fee_bps: 99,
  expected_builder_fee_bps: 99,
} }), new Date().toISOString());
insert.run(5, 'player-e', 5000, 'order-5', 'client-5', 'risex_api', proof(), new Date().toISOString());
db.close();

const risex = require('../server-futures/risex');
const refreshedWallets = [];
risex.getClashBuilderConfig = async () => ({
  registered: true,
  builder_id: 10,
  builder_fee_bps: 100,
  fee_recipient: recipient,
  registry_source: 'risex_onchain',
  api_indexed: true,
});
risex.getBridgeSourceUsdcBalance = async () => ({ balance_usdc: 0 });
risex.importFillsForPlayer = async (playerId, wallet, opts) => {
  refreshedWallets.push({ playerId, wallet, opts });
  return { ok: true, imported: wallet === recipient ? 2 : 0, upgraded: 0, adopted: 0 };
};

const mainDb = new Database(mainDbPath);
mainDb.exec(`
  CREATE TABLE player_dex_accounts (
    id INTEGER PRIMARY KEY,
    player_id TEXT NOT NULL,
    dex TEXT NOT NULL,
    wallet_address TEXT,
    status TEXT,
    updated_at TEXT
  );
`);
const insertAccount = mainDb.prepare(`
  INSERT INTO player_dex_accounts (id, player_id, dex, wallet_address, status, updated_at)
  VALUES (?, ?, 'risex', ?, ?, ?)
`);
insertAccount.run(1, 'player-recipient', recipient, 'ready', '2026-08-03T00:00:00Z');
insertAccount.run(2, 'player-other', '0x0000000000000000000000000000000000000002', 'ready', '2026-08-02T00:00:00Z');
insertAccount.run(3, 'player-off', '0x0000000000000000000000000000000000000003', 'disconnected', '2026-08-04T00:00:00Z');

const earnings = require('./earnings');

(async () => {
  try {
    const result = await earnings.fetchEarningsDex('risex', { force: true, mainDb });
    assert.equal(result.dex, 'risex');
    assert.equal(result.row.ok, true);
    assert.equal(result.row.builder_id, 10);
    assert.equal(result.row.address, recipient);
    assert.equal(result.row.builder_fee_ppm, 100);
    assert.equal(result.row.builder_fee_bps, 1);
    assert.equal(result.row.trades, 1, 'only our exact builder proof is counted');
    assert.equal(result.row.traders, 1);
    assert.equal(result.row.volume_usd, 1000);
    assert.equal(result.row.earned_usd, 0, 'estimated RISEx fees must not inflate exact earnings');
    assert.equal(result.row.earned_24h_usd, 0);
    assert.equal(result.row.estimated_fee_usd, 0.1);
    assert.equal(result.row.estimated_fee_24h_usd, 0.1);
    assert.equal(result.row.model, 'risex_onchain_attributed_volume_estimate');
    assert.match(result.row.note, /not labelled exact/i);
    assert.equal(result.row.refresh.attempted_wallets, 2);
    assert.equal(result.row.refresh.imported, 2);
    assert.deepEqual(
      refreshedWallets.map(row => row.wallet),
      [recipient, '0x0000000000000000000000000000000000000002'],
      'fee recipient is refreshed first and disconnected accounts are excluded',
    );
    assert(refreshedWallets.every(row => row.opts.verifyLegacy === false));

    assert(
      earnings._test.earningsDexOrder().includes('risex'),
      'RISEx must be present in aggregate earnings order',
    );
    console.log('RISEx on-chain attributed earnings estimate reader: ok');
  } finally {
    mainDb.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
