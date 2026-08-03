#!/usr/bin/env node
'use strict';

// Exact, idempotent Decibel tournament reconciliation.
//
// Default mode is read-only. Pass --apply to import fills into futures.db and
// credit the matching tournament rows in clash.db. Every upstream execution is
// verified against its Aptos TradeEvent and keyed by subaccount + trade id, so
// both sides of the same Decibel match can be credited without colliding.

const fs = require('fs');
const path = require('path');

const APP_ROOT = process.env.CLASH_APP_ROOT || path.resolve(__dirname, '..');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match || process.env[match[1]] != null) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/gu, '');
  }
}

loadEnv(path.join(APP_ROOT, 'server-futures', '.env'));
loadEnv(path.join(APP_ROOT, 'server', '.env'));

const Database = require(path.join(APP_ROOT, 'server-futures', 'node_modules', 'better-sqlite3'));
const decibel = require(path.join(APP_ROOT, 'server-futures', 'decibel'));
const {
  resolvePhantomDecibelSubaccount,
} = require(path.join(APP_ROOT, 'server-futures', 'decibel-bulk-rewards'));
const {
  decibelBulkTradeIdFromRow,
} = require(path.join(APP_ROOT, 'server', 'tournament_trade_sync'));

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function sqlDateMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;
  return Date.parse(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
}

function laterMs(...values) {
  const parsed = values.map(sqlDateMs).filter(Number.isFinite);
  return parsed.length ? Math.max(...parsed) : Number.NaN;
}

function normalizeSubaccount(value) {
  const normalized = decibel.normalizeAptosAddress(String(value || ''));
  return /^0x[0-9a-f]{64}$/u.test(normalized) ? normalized : '';
}

function parseJson(value) {
  try { return JSON.parse(String(value || '')); } catch { return null; }
}

async function ownerSubaccounts(owner) {
  const normalizedOwner = normalizeSubaccount(owner);
  if (!normalizedOwner) return [];
  try {
    const rows = await decibel.fetchUserSubaccounts(normalizedOwner);
    return [...new Set((Array.isArray(rows) ? rows : [])
      .map(row => normalizeSubaccount(row?.subaccount_address || row?.address))
      .filter(Boolean))];
  } catch {
    return [];
  }
}

function storedSubaccounts(futuresDb, playerId) {
  const out = new Set();
  try {
    for (const row of futuresDb.prepare(`
      SELECT subaccount FROM decibel_order_proofs WHERE player_id = ?
    `).all(playerId)) {
      const subaccount = normalizeSubaccount(row.subaccount);
      if (subaccount) out.add(subaccount);
    }
  } catch {}
  try {
    for (const row of futuresDb.prepare(`
      SELECT proof_json
      FROM trade_history
      WHERE player_id = ? AND dex = 'decibel'
        AND json_valid(COALESCE(proof_json, ''))
    `).all(playerId)) {
      const subaccount = normalizeSubaccount(parseJson(row.proof_json)?.subaccount);
      if (subaccount) out.add(subaccount);
    }
  } catch {}
  return out;
}

function participantRows(mainDb, tournamentId, filter) {
  let rows = mainDb.prepare(`
    SELECT tp.player_id, tp.joined_at, tp.left_at,
           p.name AS player_name, p.wallet,
           pda.wallet_address
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    LEFT JOIN player_dex_accounts pda
      ON pda.player_id = p.id AND pda.dex = 'decibel'
    WHERE tp.tournament_id = ?
    ORDER BY lower(p.name), tp.player_id
  `).all(tournamentId);
  if (!filter.size) return rows;
  rows = rows.filter(row => filter.has(String(row.player_id).toLowerCase())
    || filter.has(String(row.player_name || '').toLowerCase()));
  return rows;
}

function creditableRows(futuresDb, playerId, startAt, endAt) {
  return futuresDb.prepare(`
    SELECT id, symbol, side, amount, notional_usd, pnl, status, created_at,
           dex, client_order_id, proof_json
    FROM trade_history
    WHERE player_id = ? AND dex = 'decibel' AND status = 'filled'
      AND verified_source IN ('decibel_fill', 'server')
      AND datetime(created_at) >= datetime(?)
      AND datetime(created_at) <= datetime(?)
    ORDER BY id ASC
  `).all(playerId, startAt, endAt);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const tournamentIdArg = Number(argValue('--tournament-id'));
  const maxRows = Math.max(100, Math.min(5_000, Number(argValue('--max-rows') || 5_000)));
  const maxPages = Math.ceil(maxRows / 100);
  const playerFilter = new Set(String(argValue('--players') || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  const requestedCutoff = String(argValue('--cutoff-at') || '').trim();
  const cutoffMs = requestedCutoff ? Date.parse(requestedCutoff) : Date.now();
  if (!Number.isFinite(cutoffMs)) throw new Error('--cutoff-at must be a valid ISO timestamp');

  const mainDbPath = process.env.CLASH_MAIN_DB || path.join(APP_ROOT, 'server', 'clash.db');
  const futuresDbPath = process.env.CLASH_FUTURES_DB || path.join(APP_ROOT, 'server-futures', 'futures.db');
  const mainRead = new Database(mainDbPath, { readonly: true, fileMustExist: true });
  const futuresRead = new Database(futuresDbPath, { readonly: true, fileMustExist: true });
  // Loading the writable futures store runs its normal schema migrations, so
  // do it only after the operator explicitly selected --apply. The default
  // mode remains genuinely read-only; use audit-decibel-tournament-volume.js
  // when an exact upstream preview is required before applying.
  const futuresStore = apply
    ? require(path.join(APP_ROOT, 'server-futures', 'db'))
    : null;
  const rewardsWorker = apply
    ? require(path.join(APP_ROOT, 'server-futures', 'decibel-rewards-worker'))
    : null;
  const tournament = Number.isFinite(tournamentIdArg) && tournamentIdArg > 0
    ? mainRead.prepare("SELECT * FROM tournaments WHERE id = ? AND lower(dex) = 'decibel'").get(tournamentIdArg)
    : mainRead.prepare("SELECT * FROM tournaments WHERE lower(dex) = 'decibel' ORDER BY id DESC LIMIT 1").get();
  if (!tournament) throw new Error('Decibel tournament not found');

  const participants = participantRows(mainRead, tournament.id, playerFilter);
  if (!participants.length) throw new Error('No tournament participants matched the requested filter');
  const results = [];
  const creditPlans = [];

  for (const participant of participants) {
    const startMs = laterMs(tournament.start_at, participant.joined_at);
    const tournamentEndMs = sqlDateMs(tournament.end_at);
    const leftMs = sqlDateMs(participant.left_at);
    const endMs = Math.min(
      Date.now(),
      cutoffMs,
      Number.isFinite(tournamentEndMs) ? tournamentEndMs : Number.POSITIVE_INFINITY,
      Number.isFinite(leftMs) ? leftMs : Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(startMs) || endMs < startMs) {
      results.push({
        player_id: participant.player_id,
        player_name: participant.player_name,
        error: 'invalid tournament participation window',
      });
      continue;
    }

    const subaccounts = storedSubaccounts(futuresRead, participant.player_id);
    for (const subaccount of await ownerSubaccounts(participant.wallet_address || participant.wallet)) {
      subaccounts.add(subaccount);
    }
    const phantom = await resolvePhantomDecibelSubaccount(participant.player_id);
    if (phantom) subaccounts.add(normalizeSubaccount(phantom));
    subaccounts.delete('');

    const scans = [];
    for (const subaccount of subaccounts) {
      if (!apply) {
        scans.push({ subaccount, planned: true });
        continue;
      }
      const stats = await rewardsWorker.__test.recordRecentLimitFills(
        participant.player_id,
        subaccount,
        {
          details: true,
          dryRun: false,
          tradeDb: futuresStore,
          cutoverMs: startMs,
          scanFromMs: startMs,
          scanToMs: endMs,
          advanceCursor: false,
          pageSize: 100,
          maxPages,
        },
      );
      scans.push({ subaccount, ...stats });
    }

    const startAt = new Date(startMs).toISOString();
    const endAt = new Date(endMs).toISOString();
    const legacyBulkIds = new Set(mainRead.prepare(`
      SELECT trade_id FROM tournament_trade_credits
      WHERE tournament_id = ? AND player_id = ? AND source = 'decibel_bulk_fill'
    `).all(tournament.id, participant.player_id).map(row => String(row.trade_id)));
    results.push({
      player_id: participant.player_id,
      player_name: participant.player_name,
      window: { start_at: startAt, end_at: endAt },
      subaccounts: [...subaccounts],
      scans,
      incomplete: scans.some(row => row.truncated || row.retryable || row.missing_fill_id || row.missing_fill_time),
    });
    if (apply) creditPlans.push({ participant, startAt, endAt, legacyBulkIds });
  }

  mainRead.close();
  let tournamentCredit = null;
  if (apply) {
    const mainStore = require(path.join(APP_ROOT, 'server', 'db'));
    const credited = [];
    for (const plan of creditPlans) {
      const rows = creditableRows(
        futuresRead,
        plan.participant.player_id,
        plan.startAt,
        plan.endAt,
      );
      let legacyBulkRowsSkipped = 0;
      const filtered = rows.filter(row => {
        const bulkId = decibelBulkTradeIdFromRow(row);
        const duplicate = bulkId && plan.legacyBulkIds.has(bulkId);
        if (duplicate) legacyBulkRowsSkipped++;
        return !duplicate;
      });
      const credit = mainStore.recordTournamentTradeRows(plan.participant.player_id, filtered, {
        tournamentId: tournament.id,
        source: 'trade_history',
        dex: 'decibel',
        count: true,
        volume: true,
        pnl: false,
      });
      credited.push({
        player_id: plan.participant.player_id,
        player_name: plan.participant.player_name,
        rows_considered: filtered.length,
        legacy_bulk_rows_skipped: legacyBulkRowsSkipped,
        ...credit,
      });
    }
    tournamentCredit = credited;
  }
  futuresRead.close();

  const summary = {
    participants: results.length,
    participants_without_subaccounts: results.filter(row => !row.subaccounts?.length).length,
    incomplete_participants: results.filter(row => row.incomplete).length,
    verified_fills: results.reduce((sum, row) => sum + (row.scans || []).reduce((n, scan) => n + Number(scan.verified || 0), 0), 0),
    would_import: results.reduce((sum, row) => sum + (row.scans || []).reduce((n, scan) => n + Number(scan.would_import || 0), 0), 0),
    imported: results.reduce((sum, row) => sum + (row.scans || []).reduce((n, scan) => n + Number(scan.imported || 0), 0), 0),
    imported_volume_usd: Number(results.reduce((sum, row) => sum + (row.scans || []).reduce((n, scan) => n + Number(scan.imported_volume_usd || 0), 0), 0).toFixed(6)),
  };
  console.log(JSON.stringify({
    reconciliation: 'decibel_tournament_fills_v2',
    mode: apply ? 'apply' : 'read_only_plan',
    tournament: { id: tournament.id, name: tournament.name, start_at: tournament.start_at, end_at: tournament.end_at },
    summary,
    participants: results,
    tournament_credit: tournamentCredit,
    exact_audit_command: apply
      ? null
      : `node deploy/audit-decibel-tournament-volume.js --tournament-id ${tournament.id} --include-fill-details`,
  }, null, 2));

  if (summary.participants_without_subaccounts || summary.incomplete_participants) process.exitCode = 2;
}

main().catch(error => {
  console.error(`[decibel-reconcile] ${error.stack || error.message}`);
  process.exit(1);
});
