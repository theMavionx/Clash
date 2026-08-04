const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-nado-earnings-'));
const mainDbPath = path.join(tempRoot, 'clash.db');
process.env.CLASH_FUTURES_DB = path.join(tempRoot, 'missing-futures.db');
process.env.NADO_BUILDER_ID = '3600';
process.env.NADO_BUILDER_FEE_RATE = '10';
process.env.NADO_ORDER_RECENT_LIMIT = '10';
process.env.NADO_ORDER_BACKFILL_LIMIT = '100';
process.env.NADO_MAX_BACKFILL_PAGES_PER_REFRESH = '3';
process.env.NADO_ARCHIVE_CONCURRENCY = '3';
process.env.NADO_ARCHIVE_WEIGHT_BUDGET = '350';
process.env.NADO_ARCHIVE_RATE_WINDOW_MS = '0';
process.env.NADO_BUILDER_LAUNCH_TIMESTAMP = '0';
process.env.NADO_REGISTRATION_LOOKBACK_SECONDS = '0';

const wallets = {
  a: '0x1111111111111111111111111111111111111111',
  b: '0x2222222222222222222222222222222222222222',
  c: '0x3333333333333333333333333333333333333333',
};

function appendix(builderId, feeRate = 10) {
  return String((BigInt(builderId) << 48n) | (BigInt(feeRate) << 38n) | 1n);
}

function raw(value) {
  return BigInt(Math.round(Number(value) * 1e6)) * 1_000_000_000_000n;
}

function order(wallet, idx, { builderId = 3600, fee = 0.1, volume = 100 } = {}) {
  const digest = `0x${BigInt(idx).toString(16).padStart(64, '0')}`;
  return {
    digest,
    subaccount: `${wallet}${Buffer.from('default').toString('hex').padEnd(24, '0')}`,
    submission_idx: String(idx),
    last_fill_submission_idx: String(idx),
    builder_fee: String(raw(fee)),
    quote_filled: String(raw(volume)),
    first_fill_timestamp: String(1_780_000_000 + idx),
    last_fill_timestamp: String(1_780_000_000 + idx),
    appendix: appendix(builderId),
  };
}

let round = 1;
const requests = [];
global.fetch = async (_url, options = {}) => {
  const body = JSON.parse(options.body || '{}');
  const query = body.orders || {};
  const subaccount = String(query.subaccounts?.[0] || '').toLowerCase();
  const wallet = subaccount.slice(0, 42);
  const cursor = query.idx == null ? null : String(query.idx);
  requests.push({ wallet, cursor, limit: query.limit });
  let rows = [];
  if (wallet === wallets.a) {
    if (cursor === '191') {
      rows = Array.from({ length: 100 }, (_, i) => order(wallet, 191 - i));
    } else if (cursor === '92') {
      rows = [92, 91, 90, 89].map(idx => order(wallet, idx));
    } else if (round === 1) {
      rows = Array.from({ length: 10 }, (_, i) => order(wallet, 200 - i));
    } else {
      rows = Array.from({ length: 10 }, (_, i) => {
        const idx = 201 - i;
        return order(wallet, idx, { fee: idx === 200 ? 0.2 : 0.1 });
      });
    }
  } else if (wallet === wallets.b) {
    rows = [order(wallet, 90, { builderId: 99, fee: 9 })];
  } else if (wallet === wallets.c) {
    rows = [order(wallet, 80, { fee: 0.25, volume: 250 })];
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ orders: rows }),
    text: async () => JSON.stringify({ orders: rows }),
  };
};

const mainDb = new Database(mainDbPath);
mainDb.exec(`
  CREATE TABLE players (
    id TEXT PRIMARY KEY,
    dex TEXT,
    wallet TEXT
  );
  CREATE TABLE player_dex_accounts (
    id INTEGER PRIMARY KEY,
    player_id TEXT NOT NULL,
    dex TEXT NOT NULL,
    wallet_address TEXT,
    status TEXT,
    created_at TEXT,
    updated_at TEXT
  );
`);
const insertAccount = mainDb.prepare(`
  INSERT INTO player_dex_accounts (id, player_id, dex, wallet_address, status, created_at, updated_at)
  VALUES (?, ?, 'nado', ?, ?, '2026-01-01 00:00:00', datetime('now'))
`);
insertAccount.run(1, 'player-a', wallets.a, 'ready');
insertAccount.run(2, 'player-b', wallets.b, 'ready');
insertAccount.run(3, 'player-c', wallets.c, 'disconnected');

const earnings = require('./earnings');

(async () => {
  try {
    const first = await earnings.fetchEarningsDex('nado', { force: true, mainDb });
    assert.equal(first.row.ok, true);
    assert.equal(first.row.model, 'nado_archive_builder_fee_exact');
    assert.equal(first.row.source_detail, 'nado_archive_orders_builder_fee');
    assert.equal(first.row.registered_wallets, 3, 'ready and historical disconnected wallets remain in cumulative scope');
    assert.equal(first.row.sync_complete, true);
    assert.equal(first.row.exact_unavailable, false);
    assert.equal(first.row.trades, 113, 'inclusive archive cursor must be deduplicated by subaccount + digest');
    assert.equal(first.row.traders, 2, 'wrong builder id must not be counted');
    assert.equal(first.row.earned_usd, 11.45);
    assert.equal(first.row.volume_usd, 11450);
    assert.equal(first.row.refresh.continuation_pages, 2, 'one pending wallet must reuse the remaining page budget');
    assert(
      requests.some(request => request.wallet === wallets.a && request.cursor === '191' && request.limit === 100),
      'full recent page must continue the historical backfill',
    );
    assert(
      requests.some(request => request.wallet === wallets.a && request.cursor === '92' && request.limit === 100),
      'continuation scheduling must advance the same high-volume wallet again in the same refresh',
    );

    round = 2;
    requests.length = 0;
    const second = await earnings.fetchEarningsDex('nado', { force: true, mainDb });
    assert.equal(second.row.sync_complete, true);
    assert.equal(second.row.trades, 114, 'one genuinely new archive order is added once');
    assert.equal(second.row.earned_usd, 11.65, 'updated cumulative builder_fee replaces the old order value');
    assert.equal(second.row.volume_usd, 11550);
    assert.equal(second.row.refresh.continuation_pages, 0, 'recent page reached the previous newest cursor');

    const indexed = mainDb.prepare('SELECT COUNT(*) AS n FROM nado_builder_fee_orders').get();
    assert.equal(indexed.n, 114);
    const snapshots = mainDb.prepare("SELECT COUNT(*) AS n FROM earnings_snapshots WHERE dex = 'nado'").get();
    assert.equal(snapshots.n, 1, 'completed exact cumulative value is snapshot-eligible and upserts the hourly bucket');

    const failedWallet = '0x4444444444444444444444444444444444444444';
    insertAccount.run(4, 'player-d', failedWallet, 'ready');
    const fetchBeforeFailure = global.fetch;
    global.fetch = async (url, options = {}) => {
      const body = JSON.parse(options.body || '{}');
      const subaccount = String(body.orders?.subaccounts?.[0] || '').toLowerCase();
      if (subaccount.startsWith(failedWallet)) throw new Error('simulated archive outage');
      return fetchBeforeFailure(url, options);
    };
    const partial = await earnings.fetchEarningsDex('nado', { force: true, mainDb });
    assert.equal(partial.row.ok, true);
    assert.equal(partial.row.sync_complete, false);
    assert.equal(partial.row.exact_unavailable, true);
    assert.equal(partial.row.refresh.failed_wallets, 1);
    const snapshotsAfterFailure = mainDb.prepare("SELECT COUNT(*) AS n FROM earnings_snapshots WHERE dex = 'nado'").get();
    assert.equal(snapshotsAfterFailure.n, 1, 'partial archive values must not create or replace earnings snapshots');
    console.log('Nado archive builder earnings index: ok');
  } finally {
    mainDb.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
