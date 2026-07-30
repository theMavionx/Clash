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

const validProof = JSON.stringify({
  source: 'risex_place_order_onchain',
  builder: {
    verified: true,
    builder_id: 7,
    expected_builder_id: 7,
    builder_fee_bps: 100,
    expected_builder_fee_bps: 100,
  },
});

const rows = [
  [1, 'risex_builder_onchain', validProof],
  [2, 'risex_api', validProof],
  [3, 'risex_builder_onchain', JSON.stringify({
    ...JSON.parse(validProof),
    builder: { ...JSON.parse(validProof).builder, builder_id: 0 },
  })],
  [4, 'risex_builder_onchain', JSON.stringify({
    ...JSON.parse(validProof),
    builder: { ...JSON.parse(validProof).builder, builder_fee_bps: 0 },
  })],
  [5, 'risex_builder_onchain', null],
];
const insert = db.prepare('INSERT INTO trade_history(id, dex, verified_source, proof_json) VALUES (?, ?, ?, ?)');
for (const row of rows) insert.run(row[0], 'risex', row[1], row[2]);

const ids = db.prepare(`
  SELECT id
  FROM trade_history
  WHERE dex = 'risex' AND ${tradeRecon.verifiedSourceClauseForDex('risex')}
  ORDER BY id
`).all().map(row => row.id);

assert.deepStrictEqual(ids, [1], 'only exact on-chain Clash builder proof should be eligible');
console.log('RISEx builder eligibility tests passed');
