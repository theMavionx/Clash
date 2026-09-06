'use strict';

// Read-only projections for the protected earnings endpoint. Never import fills,
// advance reward cursors, settle gold, or return stored signed request payloads.
const { verifiedSourceClauseForDex } = require('./trade_reconciliation');

function safeJson(column) {
  return `(CASE WHEN json_valid(COALESCE(${column}, '')) THEN ${column} ELSE '{}' END)`;
}

function signerMode(proof) {
  const signer = `json_extract(${proof}, '$.order.signer')`;
  const account = `json_extract(${proof}, '$.account')`;
  return `CASE WHEN COALESCE(${signer}, '') = '' OR COALESCE(${account}, '') = '' THEN 'unknown'
    WHEN ${signer} = ${account} THEN 'owner' ELSE 'one_tap' END`;
}

function readExecutions(futuresDb, dex) {
  const proof = safeJson('trade_history.proof_json');
  const mode = dex === 'bulk' ? signerMode(proof) : "'unknown'";
  const rows = futuresDb.prepare(`
    SELECT ${mode} AS signer_mode, COUNT(*) AS trades, COUNT(DISTINCT player_id) AS traders,
      COALESCE(SUM(CASE WHEN notional_usd > 0 THEN notional_usd
        ELSE ABS(CAST(amount AS REAL) * CAST(price AS REAL)) END), 0) AS volume_usd,
      MAX(created_at) AS latest_fill_at
    FROM trade_history WHERE dex = ? AND status = 'filled'
      AND (${verifiedSourceClauseForDex(dex)}) GROUP BY signer_mode
  `).all(dex);
  const totals = rows.reduce((sum, row) => ({ trades: sum.trades + row.trades,
    volume_usd: sum.volume_usd + row.volume_usd }), { trades: 0, volume_usd: 0 });
  return { status: 'available', ...totals, signer_breakdown: rows,
    signer_evidence: dex === 'bulk' ? 'server_verified_order_signer' : 'not_recorded',
    note: 'Indexed, proof-eligible fills only. Submitted orders and account setup are not executions.' };
}

function readSubmissions(futuresDb, dex) {
  if (dex === 'imperial') {
    const row = futuresDb.prepare(`SELECT COUNT(*) AS orders, MAX(created_at) AS latest_order_at
      FROM imperial_order_proofs WHERE upper(builder_code) = ?
        AND (COALESCE(order_pda, '') != '' OR COALESCE(tx_signature, '') != '')
    `).get(String(process.env.IMPERIAL_BUILDER_CODE || 'CLASH').trim().toUpperCase());
    return { status: 'available', ...row, signer_evidence: 'not_recorded' };
  }
  const json = safeJson('response_json');
  const signer = `json_extract(${json}, '$.clash_verified_signer')`;
  const rows = futuresDb.prepare(`SELECT COUNT(*) AS orders,
    CASE WHEN COALESCE(${signer}, '') = '' THEN 'unknown'
      WHEN ${signer} = account THEN 'owner' ELSE 'one_tap' END AS signer_mode,
    MAX(created_at) AS latest_order_at FROM bulk_order_builder_proofs GROUP BY signer_mode
  `).all();
  return { status: 'available', orders: rows.reduce((sum, row) => sum + row.orders, 0),
    signer_breakdown: rows, signer_evidence: 'server_verified_order_signer' };
}

function readRewards(mainDb, dex) {
  const row = mainDb.prepare(`SELECT COUNT(*) AS accounts,
    COALESCE(SUM(total_gold), 0) AS earned_gold,
    COALESCE(SUM(pending_gold), 0) AS pending_gold,
    COALESCE(SUM(total_gold - pending_gold), 0) AS paid_gold,
    MAX(updated_at) AS latest_reward_at FROM trading_rewards WHERE dex = ?
  `).get(dex);
  return { status: 'available', ...row,
    note: 'Paid = lifetime ledger Gold minus stored pending Gold. Pending is already-earned storage overflow, not an estimate for unclaimed trades.' };
}

function readClaims(mainDb, dex) {
  const summary = mainDb.prepare(`SELECT COUNT(*) AS attempts,
    COALESCE(SUM(total_gold_paid), 0) AS observed_paid_gold,
    MAX(created_at) AS last_claim_at FROM trade_claim_results WHERE dex = ?
  `).get(dex);
  const recent = mainDb.prepare(`SELECT created_at, result, credited_trade_count,
    credited_volume_usd, total_gold_paid FROM trade_claim_results WHERE dex = ?
    ORDER BY id DESC LIMIT 5`).all(dex);
  return { status: 'available', ...summary, recent,
    note: 'Claim telemetry may cover less history than the reward ledger. No attempts does not mean no eligible trades.' };
}

function readSection(db, reader, dex) {
  if (!db) return { status: 'unavailable' };
  try { return reader(db, dex); } catch { return { status: 'unavailable' }; }
}

/** Read proof and Gold aggregates without exposing credentials or mutating either database. */
function readTradingDiagnostics({ futuresDb = null, mainDb = null, dex }) {
  if (!['bulk', 'imperial'].includes(dex)) throw new Error('Unsupported trading diagnostics venue');
  return {
    observed_at: new Date().toISOString(),
    read_only: true,
    executions: readSection(futuresDb, readExecutions, dex),
    submissions: readSection(futuresDb, readSubmissions, dex),
    rewards: readSection(mainDb, readRewards, dex),
    claims: readSection(mainDb, readClaims, dex),
  };
}

module.exports = { readTradingDiagnostics };
