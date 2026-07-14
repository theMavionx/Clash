#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const tournamentId = Number(process.argv.find(v => v.startsWith('--tournament='))?.split('=')[1] || 0);
const apply = process.argv.includes('--apply');
if (!tournamentId) throw new Error('Use --tournament=<id> [--apply]');

const mainPath = process.env.CLASH_MAIN_DB || path.join(__dirname, '..', 'server', 'clash.db');
const futuresPath = process.env.CLASH_FUTURES_DB || path.join(__dirname, '..', 'server-futures', 'futures.db');
const main = new Database(mainPath, { readonly: !apply, fileMustExist: true });
const futures = new Database(futuresPath, { readonly: !apply, fileMustExist: true });
if (!apply) {
  main.pragma('query_only = ON');
  futures.pragma('query_only = ON');
}

const tournament = main.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
if (!tournament || String(tournament.dex).toLowerCase() !== 'ostium') throw new Error('Ostium tournament not found');
const participants = main.prepare(`
  SELECT tp.*, p.name FROM tournament_participants tp JOIN players p ON p.id = tp.player_id
  WHERE tp.tournament_id = ? AND tp.left_at IS NULL
`).all(tournamentId);
const participantById = new Map(participants.map(p => [p.player_id, p]));
const walletOwnerCandidates = new Map();
for (const row of main.prepare(`
  SELECT lower(wallet_address) wallet, player_id, status FROM player_dex_accounts
  WHERE dex = 'ostium' AND wallet_address IS NOT NULL AND wallet_address != ''
  ORDER BY CASE WHEN status='ready' THEN 0 ELSE 1 END, updated_at DESC
`).all()) {
  const owners = walletOwnerCandidates.get(row.wallet) || [];
  if (!owners.includes(row.player_id)) owners.push(row.player_id);
  walletOwnerCandidates.set(row.wallet, owners);
}
const walletOwners = new Map(
  [...walletOwnerCandidates.entries()].filter(([, owners]) => owners.length === 1).map(([wallet, owners]) => [wallet, owners[0]])
);

function ms(value) {
  if (!value) return null;
  const text = String(value).replace(/[zZ]$/, '').replace(/\s*UTC$/i, '').replace(' ', 'T');
  const parsed = Date.parse(`${text}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}
function inWindow(row, participant) {
  const at = ms(row.created_at);
  const start = Math.max(ms(tournament.start_at) || 0, ms(participant?.joined_at) || 0);
  const end = ms(tournament.end_at) || Infinity;
  return at != null && at >= start && at <= end;
}
function inTournamentPeriod(row) {
  const at = ms(row.created_at);
  return at != null && at >= (ms(tournament.start_at) || 0) && at <= (ms(tournament.end_at) || Infinity);
}
function proofTrader(row) {
  try {
    const proof = JSON.parse(row.proof_json || '{}');
    return String(proof?.fill?.trader || proof?.trader || '').toLowerCase();
  } catch { return ''; }
}
function proofFill(row) {
  try { return JSON.parse(row.proof_json || '{}')?.fill || null; } catch { return null; }
}
function canonicalFillKey(row) {
  const fill = proofFill(row);
  if (!fill) return null;
  const trader = String(fill.trader || '').toLowerCase();
  const hash = String(fill.hash || fill.txHash || '').toLowerCase();
  const oid = String(fill.oid ?? fill.orderId ?? '');
  if (!trader || !hash || !oid) return null;
  return `${trader}:${hash}:${oid}:${String(fill.action || '')}:${String(fill.pairId ?? '')}`;
}
function canonicalClientOrderId(row) {
  const fill = proofFill(row);
  const hash = String(fill?.hash || fill?.txHash || '').toLowerCase();
  const oid = String(fill?.oid ?? fill?.orderId ?? '');
  if (!hash || !oid) return null;
  const rawSide = String(fill?.side || '').toLowerCase();
  const legacySide = ['short', 'sell', 'ask', 'false'].includes(rawSide) ? 'ask' : 'bid';
  return `ostium:${hash}:${oid}:${legacySide}`;
}
function activityDay(createdAt) {
  const eventMs = ms(createdAt);
  const date = new Date(eventMs);
  const utcDay = date.toISOString().slice(0, 10);
  if (String(tournament.scoring_mode || 'live').toLowerCase() !== 'daily_pool') return utcDay;
  const [hours, minutes] = String(tournament.daily_pool_award_time_utc || '00:00').split(':').map(Number);
  const cutoff = Date.parse(`${utcDay}T00:00:00Z`) + ((hours || 0) * 60 + (minutes || 0)) * 60 * 1000;
  if (eventMs >= cutoff) return utcDay;
  return new Date(Date.parse(`${utcDay}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

const tradeRows = futures.prepare(`
  SELECT id, player_id, dex, status, verified_source, client_order_id, notional_usd, pnl, created_at, proof_json
  FROM trade_history WHERE dex = 'ostium' AND status = 'filled' AND verified_source = 'ostium_api'
`).all();
const duplicateTradeIds = new Set();
const byCanonicalFill = new Map();
for (const row of tradeRows) {
  const key = canonicalFillKey(row);
  if (!key) continue;
  const existing = byCanonicalFill.get(key);
  if (!existing || Number(row.id) < Number(existing.id)) {
    if (existing) duplicateTradeIds.add(String(existing.id));
    byCanonicalFill.set(key, row);
  } else {
    duplicateTradeIds.add(String(row.id));
  }
}
const transfers = [];
const provenOwnerByTrade = new Map();
for (const row of tradeRows) {
  if (duplicateTradeIds.has(String(row.id))) continue;
  const owner = walletOwners.get(proofTrader(row));
  if (owner) provenOwnerByTrade.set(String(row.id), owner);
  const participant = participantById.get(owner);
  if (
    owner
    && owner !== row.player_id
    && participantById.has(row.player_id)
    && inTournamentPeriod(row)
    && (!participant || inWindow(row, participant))
  ) {
    transfers.push({ trade_id: row.id, from: row.player_id, to: owner, volume_usd: Number(row.notional_usd || 0), created_at: row.created_at });
  }
}

const valid = new Map();
for (const row of tradeRows) {
  if (duplicateTradeIds.has(String(row.id))) continue;
  const playerId = provenOwnerByTrade.get(String(row.id)) || row.player_id;
  const participant = participantById.get(playerId);
  if (participant && inWindow(row, participant)) valid.set(String(row.id), { ...row, player_id: playerId });
}
const credits = main.prepare(`SELECT * FROM tournament_trade_credits WHERE tournament_id = ? AND source = 'trade_history'`).all(tournamentId);
const invalidCredits = credits.filter(c => {
  const row = valid.get(String(c.trade_id));
  return !row || row.player_id !== c.player_id;
});
const missingCredits = [...valid.values()].filter(row => !credits.some(c => String(c.trade_id) === String(row.id) && c.player_id === row.player_id));
const clientOrderUpdates = [];
for (const row of tradeRows) {
  if (duplicateTradeIds.has(String(row.id))) continue;
  const canonicalId = canonicalClientOrderId(row);
  if (canonicalId && canonicalId !== row.client_order_id) {
    clientOrderUpdates.push({ trade_id: row.id, from: row.client_order_id, to: canonicalId });
  }
}
const pnlUpdates = [];
for (const row of valid.values()) {
  const fill = proofFill(row);
  const rawPnl = fill?.realizedPnl ?? fill?.closedPnl ?? fill?.pnl;
  if (rawPnl === undefined || rawPnl === null || rawPnl === '') continue;
  const targetPnl = Number(rawPnl);
  if (Number.isFinite(targetPnl) && Math.abs(targetPnl - Number(row.pnl || 0)) > 0.000000001) {
    pnlUpdates.push({ trade_id: row.id, player_id: row.player_id, from: Number(row.pnl || 0), to: targetPnl });
  }
}
const linkedPlayerIds = new Set(walletOwners.values());
const unlinkedCreditedRows = tradeRows
  .filter(row => participantById.has(row.player_id) && !linkedPlayerIds.has(row.player_id) && inWindow(row, participantById.get(row.player_id)))
  .map(row => ({
    trade_id: row.id,
    player: participantById.get(row.player_id)?.name || row.player_id,
    volume_usd: row.notional_usd,
    created_at: row.created_at,
    proof_trader: proofTrader(row),
    linked_owner: walletOwners.get(proofTrader(row)) || null,
    proof: String(row.proof_json || '').slice(0, 1200),
  }));
const affectedDays = new Set();
for (const c of invalidCredits) {
  for (const row of main.prepare(`SELECT day_utc FROM tournament_daily_activity WHERE tournament_id=? AND source='trade_history' AND event_id=?`).all(tournamentId, String(c.trade_id))) {
    affectedDays.add(row.day_utc);
  }
}
const awardedPointMismatches = main.prepare(`
  SELECT tp.player_id, p.name, tp.awarded_points,
         COALESCE((SELECT SUM(a.points) FROM tournament_daily_awards a WHERE a.tournament_id=tp.tournament_id AND a.player_id=tp.player_id),0) ledger_points
  FROM tournament_participants tp JOIN players p ON p.id=tp.player_id
  WHERE tp.tournament_id=?
    AND ABS(tp.awarded_points - COALESCE((SELECT SUM(a.points) FROM tournament_daily_awards a WHERE a.tournament_id=tp.tournament_id AND a.player_id=tp.player_id),0)) > 0.000001
`).all(tournamentId);

const summary = {
  tournament_id: tournamentId,
  participants: participants.length,
  verified_rows_in_window: valid.size,
  duplicate_trade_ids: [...duplicateTradeIds],
  transfers,
  invalid_credits: invalidCredits.map(c => ({ trade_id: c.trade_id, player: participantById.get(c.player_id)?.name || c.player_id, volume_usd: c.volume_usd })),
  missing_credits: missingCredits.map(r => ({ trade_id: r.id, player: participantById.get(r.player_id)?.name || r.player_id, volume_usd: r.notional_usd, created_at: r.created_at })),
  pnl_updates: pnlUpdates,
  client_order_updates: clientOrderUpdates,
  unlinked_credited_rows: unlinkedCreditedRows,
  affected_days: [...affectedDays],
  awarded_point_mismatches: awardedPointMismatches,
  applied: apply,
};

if (apply) {
  const backupDir = process.env.CLASH_AUDIT_BACKUP_DIR || '/tmp';
  const backupPath = path.join(backupDir, `ostium-t${tournamentId}-repair-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ tournament, participants, credits, transfers, invalidCredits, missingCredits }, null, 2));
  const tx = main.transaction(() => {
    for (const tradeId of duplicateTradeIds) {
      const dailyRows = main.prepare(`SELECT day_utc FROM tournament_daily_activity WHERE tournament_id=? AND source='trade_history' AND event_id=?`).all(tournamentId, tradeId);
      for (const row of dailyRows) affectedDays.add(row.day_utc);
      main.prepare(`DELETE FROM tournament_daily_activity WHERE tournament_id=? AND source='trade_history' AND event_id=?`).run(tournamentId, tradeId);
      main.prepare(`DELETE FROM tournament_trade_credits WHERE tournament_id=? AND source='trade_history' AND trade_id=?`).run(tournamentId, tradeId);
      futures.prepare('DELETE FROM trade_history WHERE id=?').run(Number(tradeId));
    }
    for (const transfer of transfers) {
      futures.prepare('UPDATE trade_history SET player_id = ? WHERE id = ? AND player_id = ?').run(transfer.to, transfer.trade_id, transfer.from);
      main.prepare(`UPDATE tournament_trade_credits SET player_id=? WHERE tournament_id=? AND source='trade_history' AND trade_id=?`).run(transfer.to, tournamentId, String(transfer.trade_id));
      main.prepare(`UPDATE tournament_daily_activity SET player_id=? WHERE tournament_id=? AND source='trade_history' AND event_id=?`).run(transfer.to, tournamentId, String(transfer.trade_id));
    }
    for (const credit of invalidCredits) {
      main.prepare(`DELETE FROM tournament_daily_activity WHERE tournament_id=? AND source='trade_history' AND event_id=?`).run(tournamentId, String(credit.trade_id));
      main.prepare(`DELETE FROM tournament_trade_credits WHERE tournament_id=? AND source='trade_history' AND trade_id=?`).run(tournamentId, String(credit.trade_id));
    }
    const insertCredit = main.prepare(`
      INSERT OR IGNORE INTO tournament_trade_credits
        (tournament_id,source,trade_id,player_id,dex,trades_count,volume_usd,pnl_usd)
      VALUES (?,'trade_history',?,?,'ostium',1,?,?)
    `);
    const insertDaily = main.prepare(`
      INSERT OR IGNORE INTO tournament_daily_activity
        (tournament_id,day_utc,player_id,source,event_id,dex,trades_count,volume_usd,pnl_usd,trophies,gold)
      VALUES (?,?,?,'trade_history',?,'ostium',1,?,?,0,0)
    `);
    for (const row of missingCredits) {
      insertCredit.run(tournamentId, String(row.id), row.player_id, Number(row.notional_usd || 0), Number(row.pnl || 0));
      const day = activityDay(row.created_at);
      insertDaily.run(tournamentId, day, row.player_id, String(row.id), Number(row.notional_usd || 0), Number(row.pnl || 0));
      affectedDays.add(day);
    }
    for (const update of pnlUpdates) {
      futures.prepare('UPDATE trade_history SET pnl=? WHERE id=?').run(String(update.to), update.trade_id);
      main.prepare(`UPDATE tournament_trade_credits SET pnl_usd=? WHERE tournament_id=? AND source='trade_history' AND trade_id=? AND player_id=?`)
        .run(update.to, tournamentId, String(update.trade_id), update.player_id);
      const dailyRows = main.prepare(`SELECT day_utc FROM tournament_daily_activity WHERE tournament_id=? AND source='trade_history' AND event_id=?`).all(tournamentId, String(update.trade_id));
      for (const row of dailyRows) affectedDays.add(row.day_utc);
      main.prepare(`UPDATE tournament_daily_activity SET pnl_usd=? WHERE tournament_id=? AND source='trade_history' AND event_id=? AND player_id=?`)
        .run(update.to, tournamentId, String(update.trade_id), update.player_id);
    }
    for (const update of clientOrderUpdates) {
      futures.prepare('UPDATE trade_history SET client_order_id=? WHERE id=?').run(update.to, update.trade_id);
    }
    main.prepare(`
      UPDATE tournament_participants SET
        trades_count=COALESCE((SELECT SUM(trades_count) FROM tournament_trade_credits c WHERE c.tournament_id=? AND c.player_id=tournament_participants.player_id),0),
        volume_usd=COALESCE((SELECT SUM(volume_usd) FROM tournament_trade_credits c WHERE c.tournament_id=? AND c.player_id=tournament_participants.player_id),0),
        pnl_usd=COALESCE((SELECT SUM(pnl_usd) FROM tournament_trade_credits c WHERE c.tournament_id=? AND c.player_id=tournament_participants.player_id),0)
      WHERE tournament_id=?
    `).run(tournamentId, tournamentId, tournamentId, tournamentId);
    for (const day of affectedDays) {
      main.prepare('DELETE FROM tournament_daily_awards WHERE tournament_id=? AND day_utc=?').run(tournamentId, day);
      main.prepare('DELETE FROM tournament_daily_point_runs WHERE tournament_id=? AND day_utc=?').run(tournamentId, day);
    }
    main.prepare(`
      UPDATE tournament_participants SET awarded_points=COALESCE((
        SELECT SUM(a.points) FROM tournament_daily_awards a
        WHERE a.tournament_id=tournament_participants.tournament_id
          AND a.player_id=tournament_participants.player_id
      ),0)
      WHERE tournament_id=?
    `).run(tournamentId);
  });
  tx();
  summary.backup = backupPath;
}

console.log(JSON.stringify(summary, null, 2));
