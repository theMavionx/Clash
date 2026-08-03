#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

const requireFromServer = createRequire(path.join(__dirname, '..', 'server', 'package.json'));
const Database = requireFromServer('better-sqlite3');

const FEE_RECIPIENT = '0x39b36f1edf2ef5a6f2e02991b3a85fb356eb5005';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-risex-live-'));

process.env.NODE_ENV ||= 'development';
process.env.RISEX_BUILDER_ID ||= '10';
process.env.RISEX_BUILDER_FEE_RECIPIENT ||= FEE_RECIPIENT;
process.env.CLASH_FUTURES_DB = path.join(tempRoot, 'futures.db');

const mainDb = new Database(path.join(tempRoot, 'clash.db'));
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
mainDb.prepare(`
  INSERT INTO player_dex_accounts (
    player_id, dex, wallet_address, status, updated_at
  ) VALUES (?, 'risex', ?, 'ready', datetime('now'))
`).run('live-fee-recipient', FEE_RECIPIENT);

async function main() {
  const earnings = require('../server/earnings');
  const first = await earnings.fetchEarningsDex('risex', { force: true, mainDb });
  const second = await earnings.fetchEarningsDex('risex', { force: true, mainDb });
  const row = second.row;
  const output = {
    ok: row.ok,
    model: row.model,
    builder_id: row.builder_id,
    builder_fee_ppm: row.builder_fee_ppm,
    onchain_registered: row.onchain_registered,
    api_indexed: row.api_indexed,
    earned_usd: row.earned_usd,
    estimated_fee_usd: row.estimated_fee_usd,
    trades: row.trades,
    volume_usd: row.volume_usd,
    fee_recipient_wallet_usdc: row.fee_recipient_wallet_usdc,
    first_refresh: first.row.refresh,
    second_refresh: row.refresh,
  };
  console.log(JSON.stringify(output, null, 2));

  if (!row.ok || row.model !== 'risex_onchain_attributed_volume_estimate') {
    throw new Error('RISEx earnings reader did not return the expected model');
  }
  if (row.earned_usd !== 0 || row.builder_id !== 10) {
    throw new Error('RISEx exact/estimated earnings separation is invalid');
  }
  if (Number(first.row.refresh?.imported || 0) < 1) {
    throw new Error('Live RISEx refresh imported no builder-attributed fills');
  }
  if (Number(row.refresh?.imported || 0) !== 0) {
    throw new Error('Second RISEx refresh was not idempotent');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    mainDb.close();
    const futuresDb = require('../server-futures/db').db;
    if (futuresDb.open) futuresDb.close();
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
