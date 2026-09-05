const assert = require('assert');
const Database = require('better-sqlite3');

const tradeRecon = require('./trade_reconciliation');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE trade_history (
    id INTEGER PRIMARY KEY,
    dex TEXT NOT NULL,
    verified_source TEXT NOT NULL,
    proof_json TEXT
  );
`);

const builderAddress = process.env.BULK_BUILDER_ADDRESS
  || 'Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9';
const mainnetProof = {
  source: 'bulk_mainnet_signed_order',
  network: 'mainnet',
  routed_by_clash: true,
  builder: { enabled: false, address: null, fee_bps: 0, verified: false },
};
const builderProof = {
  ...mainnetProof,
  builder: { enabled: true, address: builderAddress, fee_bps: 1, verified: true },
};

const rows = [
  [1, 'bulk_clash_signed', JSON.stringify(mainnetProof)],
  [2, 'bulk_builder_signed', JSON.stringify(builderProof)],
  [3, 'bulk_clash_signed', JSON.stringify({ ...mainnetProof, routed_by_clash: false })],
  [4, 'bulk_builder_signed', JSON.stringify({ ...builderProof, builder: { ...builderProof.builder, address: 'wrong' } })],
  [5, 'bulk_clash_signed', null],
  [6, 'bulk_builder_signed', JSON.stringify({ ...builderProof, source: 'unverified' })],
];
const insert = db.prepare('INSERT INTO trade_history(id, dex, verified_source, proof_json) VALUES (?, ?, ?, ?)');
for (const row of rows) insert.run(row[0], 'bulk', row[1], row[2]);

const ids = db.prepare(`
  SELECT id
  FROM trade_history
  WHERE dex = 'bulk' AND ${tradeRecon.verifiedSourceClauseForDex('bulk')}
  ORDER BY id
`).all().map(row => row.id);

assert.deepStrictEqual(ids, [1, 2], 'only exact Clash-routed or valid builder-attributed Bulk fills should be eligible');
console.log('Bulk mainnet reward eligibility tests passed');
