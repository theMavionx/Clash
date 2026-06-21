#!/usr/bin/env node

const futuresDb = require('../server-futures/db');
const gmtrade = require('../server-futures/gmtrade');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(v => String(v).startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function safeJson(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function dryRunRecord(playerId, row) {
  const body = safeJson(row.body_json);
  body.signature = body.signature || row.signature;
  body.tx_hash = body.tx_hash || row.signature;
  const fakeDb = {
    addTrade(id, trade) {
      return {
        id: null,
        changes: 1,
        dry_run: true,
        player_id: id,
        trade,
      };
    },
    deletePendingGmtradeTradeReport() {
      return { changes: 0 };
    },
  };
  return gmtrade.recordTradeReport(fakeDb, playerId, body, row.wallet, { storePending: false });
}

async function main() {
  const playerId = arg('player');
  const limit = Math.max(1, Math.min(500, Number(arg('limit', '50')) || 50));
  const apply = flag('apply');
  const all = flag('all');
  if (!playerId && !all) {
    console.error('Usage: node scripts/reconcile-gmtrade-pending.js --player=<player_id>|--all [--limit=50] [--apply]');
    process.exit(2);
  }
  const playerIds = all
    ? futuresDb.db.prepare(`
        SELECT DISTINCT player_id
        FROM gmtrade_pending_trade_reports
        ORDER BY player_id
      `).all().map(row => row.player_id).filter(Boolean)
    : [playerId];

  const totals = { checked: 0, imported: 0, pending: 0, errors: 0 };
  const allSamples = [];

  for (const currentPlayerId of playerIds) {
    const rows = futuresDb.listPendingGmtradeTradeReports(currentPlayerId, limit);
    let imported = 0;
    let pending = 0;
    let errors = 0;
    const samples = [];

    if (apply) {
      const result = await gmtrade.reconcilePendingTradeReportsForPlayer(futuresDb, currentPlayerId, { limit });
      totals.checked += Number(result.checked || 0);
      totals.imported += Number(result.imported || 0);
      totals.pending += Number(result.pending || 0);
      totals.errors += Number(result.errors || 0);
      allSamples.push({ player_id: currentPlayerId, ...result });
      continue;
    }

    for (const row of rows) {
      try {
        const result = await dryRunRecord(currentPlayerId, row);
        if (result?.notional_usd > 0) imported += 1;
        else if (result?.pending) pending += 1;
        samples.push({
          signature: row.signature,
          notional_usd: result?.notional_usd || null,
          pending: result?.pending === true,
          warning: result?.warning || null,
        });
      } catch (e) {
        errors += 1;
        samples.push({ signature: row.signature, error: e.message });
      }
    }
    totals.checked += rows.length;
    totals.imported += imported;
    totals.pending += pending;
    totals.errors += errors;
    allSamples.push({ player_id: currentPlayerId, checked: rows.length, importable: imported, pending, errors, samples: samples.slice(0, 10) });
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    player_id: playerId || null,
    all,
    player_count: playerIds.length,
    limit,
    ...totals,
    importable: totals.imported,
    samples: allSamples.slice(0, 30),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
