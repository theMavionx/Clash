#!/usr/bin/env node
'use strict';

const path = require('path');
const Database = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'));
const {
  recordRecentBulkFills,
  resolvePhantomDecibelSubaccount,
} = require('../server-futures/decibel-bulk-rewards');
const { decibelBulkTradeIdFromRow } = require('../server/tournament_trade_sync');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function sqlDate(value) {
  const parsed = Date.parse(String(value || '').includes('T')
    ? String(value)
    : `${String(value || '').replace(' ', 'T')}Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function laterDate(...values) {
  return values.map(sqlDate).filter(Boolean).sort().at(-1) || '';
}

function main() {
  return (async () => {
    const apply = process.argv.includes('--apply');
    const playerIdArg = argValue('--player-id');
    const playerName = argValue('--player') || 'clashbot';
    const tournamentIdArg = Number(argValue('--tournament-id'));
    const explicitSubaccount = argValue('--subaccount');
    const mainDbPath = process.env.CLASH_MAIN_DB || path.join(__dirname, '..', 'server', 'clash.db');
    const futuresDbPath = process.env.CLASH_FUTURES_DB || path.join(__dirname, '..', 'server-futures', 'futures.db');
    const mainRead = new Database(mainDbPath, { readonly: true, fileMustExist: true });
    const player = playerIdArg
      ? mainRead.prepare('SELECT id, name FROM players WHERE id = ?').get(playerIdArg)
      : mainRead.prepare('SELECT id, name FROM players WHERE lower(name) = lower(?)').get(playerName);
    if (!player) throw new Error('player not found');
    const tournament = Number.isFinite(tournamentIdArg) && tournamentIdArg > 0
      ? mainRead.prepare(`
          SELECT t.*, tp.joined_at, tp.left_at
          FROM tournaments t
          JOIN tournament_participants tp ON tp.tournament_id = t.id
          WHERE t.id = ? AND tp.player_id = ?
        `).get(tournamentIdArg, player.id)
      : mainRead.prepare(`
          SELECT t.*, tp.joined_at, tp.left_at
          FROM tournaments t
          JOIN tournament_participants tp ON tp.tournament_id = t.id
          WHERE tp.player_id = ? AND tp.left_at IS NULL
            AND t.dex = 'decibel'
            AND datetime(t.start_at) <= datetime('now')
            AND (t.end_at IS NULL OR datetime(t.end_at) >= datetime('now'))
          ORDER BY t.id DESC LIMIT 1
        `).get(player.id);
    if (!tournament) throw new Error('eligible Decibel tournament not found for player');
    const startAt = laterDate(tournament.start_at, tournament.joined_at);
    const endAt = sqlDate(tournament.end_at) || new Date().toISOString();
    const subaccount = explicitSubaccount || await resolvePhantomDecibelSubaccount(player.id);
    if (!subaccount) throw new Error('active Phantom Decibel subaccount not found');

    const previewStore = {
      getTradeByClientOrderId() { return null; },
    };
    const bulk = await recordRecentBulkFills(player.id, subaccount, {
      startAt,
      endAt,
      dryRun: !apply,
      tradeDb: apply ? undefined : previewStore,
      maxRows: Number(process.env.DECIBEL_BULK_FILL_BACKFILL_MAX_ROWS || 5_000),
    });
    const result = {
      mode: apply ? 'apply' : 'dry-run',
      player_id: player.id,
      player_name: player.name,
      tournament_id: tournament.id,
      window: { start_at: startAt, end_at: endAt },
      bulk,
      tournament_credit: null,
    };

    if (apply) {
      const futuresRead = new Database(futuresDbPath, { readonly: true, fileMustExist: true });
      const rows = futuresRead.prepare(`
        SELECT id, symbol, side, amount, notional_usd, pnl, status, created_at,
               dex, client_order_id, proof_json
        FROM trade_history
        WHERE player_id = ? AND dex = 'decibel' AND status = 'filled'
          AND verified_source = 'decibel_fill'
          AND datetime(created_at) >= datetime(?)
          AND datetime(created_at) <= datetime(?)
          AND json_valid(COALESCE(proof_json, ''))
          AND json_extract(proof_json, '$.source') = 'decibel_bulk_fill'
        ORDER BY id ASC
      `).all(player.id, startAt, endAt);
      futuresRead.close();
      mainRead.close();

      const mainDb = require('../server/db');
      const legacyIds = new Set(
        mainDb.listTournamentTradeCreditIds(tournament.id, 'decibel_bulk_fill', player.id),
      );
      let legacySkipped = 0;
      const creditRows = rows.filter((row) => {
        const bulkTradeId = decibelBulkTradeIdFromRow(row);
        const duplicate = bulkTradeId && legacyIds.has(bulkTradeId);
        if (duplicate) legacySkipped++;
        return !duplicate;
      });
      const credit = mainDb.recordTournamentTradeRows(player.id, creditRows, {
        tournamentId: tournament.id,
        source: 'trade_history',
        dex: 'decibel',
        count: true,
        volume: true,
        pnl: false,
      });
      result.tournament_credit = {
        futures_bulk_rows: rows.length,
        legacy_bulk_rows_skipped: legacySkipped,
        rows_considered: creditRows.length,
        ...credit,
      };
    } else {
      mainRead.close();
    }
    console.log(JSON.stringify(result, null, 2));
  })();
}

main().catch((error) => {
  console.error(`[decibel-bulk-volume] ${error.message}`);
  process.exit(1);
});
