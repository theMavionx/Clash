'use strict';

const db = require('./db');
const ostium = require('./ostium');

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadRows({ playerId = null, since = null } = {}) {
  const where = ["dex = 'ostium'", "json_valid(COALESCE(proof_json, ''))"];
  const params = [];
  if (playerId) {
    where.push('player_id = ?');
    params.push(playerId);
  }
  if (since) {
    where.push('created_at >= ?');
    params.push(since);
  }
  return db.db.prepare(`
    SELECT id, player_id, client_order_id, pnl, fee, proof_json, created_at
    FROM trade_history
    WHERE ${where.join(' AND ')}
    ORDER BY id ASC
  `).all(...params);
}

async function refreshFromApi(rows, { limit, delayMs, since }) {
  const identities = new Map();
  for (const row of rows) {
    let proof;
    try { proof = JSON.parse(row.proof_json || '{}'); } catch { continue; }
    const account = ostium.normalizeAddress(proof?.fill?.trader);
    if (!account) continue;
    identities.set(`${row.player_id}:${account}`, { playerId: row.player_id, account });
  }

  const summary = { players: identities.size, imported: 0, updated: 0, failed: 0 };
  for (const identity of identities.values()) {
    try {
      const result = await ostium.importFillsForPlayer(identity.playerId, identity.account, {
        attempts: 1,
        limit,
        since,
      });
      summary.imported += Number(result.imported || 0);
      summary.updated += Number(result.updated || 0);
    } catch (error) {
      summary.failed += 1;
      console.warn(`[ostium-net-pnl] API refresh failed player=${identity.playerId}:`, error.message || error);
    }
    if (delayMs > 0) await wait(delayMs);
  }
  return summary;
}

function backfillRows(rows, { dryRun }) {
  const update = db.db.prepare(`
    UPDATE trade_history
    SET pnl = ?, fee = ?, proof_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `);
  const summary = {
    scanned: rows.length,
    changed: 0,
    unchanged: 0,
    invalid: 0,
    pnl_before: 0,
    pnl_after: 0,
    fees_after: 0,
  };

  const apply = db.db.transaction((items) => {
    for (const row of items) {
      let proof;
      try { proof = JSON.parse(row.proof_json || '{}'); } catch { summary.invalid += 1; continue; }
      if (!proof?.fill || typeof proof.fill !== 'object') {
        summary.invalid += 1;
        continue;
      }
      const enrichedFill = ostium.enrichOstiumFillAccounting(proof.fill);
      const accounting = ostium.ostiumFillAccounting(enrichedFill);
      const nextProof = JSON.stringify({ ...proof, accounting, fill: enrichedFill });
      const beforePnl = Number(row.pnl || 0) || 0;
      const beforeFee = row.fee == null ? null : Number(row.fee);
      summary.pnl_before += beforePnl;
      summary.pnl_after += accounting.netPnl;
      summary.fees_after += accounting.chargedFee;
      const changed = Math.abs(beforePnl - accounting.netPnl) > 1e-12
        || beforeFee == null
        || Math.abs(beforeFee - accounting.chargedFee) > 1e-12
        || row.proof_json !== nextProof;
      if (!changed) {
        summary.unchanged += 1;
        continue;
      }
      summary.changed += 1;
      if (!dryRun) update.run(
        String(accounting.netPnl),
        String(accounting.chargedFee),
        nextProof,
        row.id,
      );
    }
  });
  apply(rows);
  return summary;
}

async function main() {
  const playerId = argValue('player-id');
  const since = argValue('since');
  const limit = Math.max(10, Math.min(250, Number(argValue('limit', 250)) || 250));
  const delayMs = Math.max(0, Math.min(10_000, Number(argValue('delay-ms', 750)) || 0));
  const dryRun = hasFlag('dry-run');
  const refreshApi = hasFlag('refresh-api');

  let rows = loadRows({ playerId, since });
  let api = null;
  if (refreshApi && !dryRun) {
    api = await refreshFromApi(rows, { limit, delayMs, since });
    rows = loadRows({ playerId, since });
  }
  const backfill = backfillRows(rows, { dryRun });
  console.log(JSON.stringify({ ok: true, dry_run: dryRun, refresh_api: refreshApi, since, player_id: playerId, api, backfill }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => {
    try { db.db.close(); } catch {}
  });
