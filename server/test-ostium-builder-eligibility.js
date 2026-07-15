'use strict';

const assert = require('assert');
const Database = require('better-sqlite3');
const tradeRecon = require('./trade_reconciliation');

const BUILDER = String(
  process.env.OSTIUM_BUILDER_ADDRESS
  || process.env.VITE_OSTIUM_BUILDER_ADDRESS
  || '0xB36402e87a86206D3a114a98B53f31362291fe1B',
).toLowerCase();
const TRADER = '0x1111111111111111111111111111111111111111';

function proof(action, pid, builder = '0x0000000000000000000000000000000000000000') {
  return JSON.stringify({ fill: { action, pid, trader: TRADER, builder } });
}

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE trade_history (
    id INTEGER PRIMARY KEY,
    dex TEXT NOT NULL,
    status TEXT NOT NULL,
    verified_source TEXT NOT NULL,
    proof_json TEXT
  );
`);
const insert = db.prepare('INSERT INTO trade_history (id,dex,status,verified_source,proof_json) VALUES (?,?,?,?,?)');
insert.run(1, 'ostium', 'filled', 'ostium_api', proof('Open', 101, BUILDER));
insert.run(2, 'ostium', 'filled', 'ostium_api', proof('Close', 101));
insert.run(3, 'ostium', 'filled', 'ostium_api', proof('Open', 202));
insert.run(4, 'ostium', 'filled', 'ostium_api', proof('Close', 202));
insert.run(5, 'ostium', 'filled', 'ostium_api', '{bad json');
insert.run(6, 'ostium', 'filled', 'worker', proof('Open', 303, BUILDER));
insert.run(7, 'gmx', 'filled', 'worker', null);
db.exec(`
  CREATE INDEX idx_trade_history_ostium_position_route
  ON trade_history (
    lower(json_extract(proof_json, '$.fill.trader')),
    CAST(json_extract(proof_json, '$.fill.pid') AS TEXT),
    lower(json_extract(proof_json, '$.fill.action')),
    lower(json_extract(proof_json, '$.fill.builder'))
  )
  WHERE dex = 'ostium'
    AND status = 'filled'
    AND verified_source = 'ostium_api'
    AND json_valid(COALESCE(proof_json, ''))
`);

const ostiumSql = `
  SELECT id FROM trade_history
  WHERE dex='ostium' AND ${tradeRecon.verifiedSourceClauseForDex('ostium')}
  ORDER BY id
`;
const ostiumIds = db.prepare(ostiumSql).all().map(row => row.id);
assert.deepStrictEqual(ostiumIds, [1, 2], 'only builder-routed Ostium positions should be eligible');
const queryPlan = db.prepare(`EXPLAIN QUERY PLAN ${ostiumSql}`).all().map(row => String(row.detail || ''));
assert(
  queryPlan.some(detail => detail.includes('idx_trade_history_ostium_position_route')),
  `Ostium position lookup should use its route index: ${queryPlan.join(' | ')}`,
);

const gmxIds = db.prepare(`
  SELECT id FROM trade_history
  WHERE dex='gmx' AND ${tradeRecon.verifiedSourceClauseForDex('gmx')}
`).all().map(row => row.id);
assert.deepStrictEqual(gmxIds, [7], 'other DEX source filters must remain unchanged');

console.log('ostium builder eligibility tests passed');
