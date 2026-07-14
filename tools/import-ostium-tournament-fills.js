#!/usr/bin/env node
'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const tournamentId = Number(process.argv.find(v => v.startsWith('--tournament='))?.split('=')[1] || 0);
if (!tournamentId) throw new Error('Use --tournament=<id>');
const mainPath = process.env.CLASH_MAIN_DB || path.join(__dirname, '..', 'server', 'clash.db');
const ostiumPath = process.env.OSTIUM_MODULE || path.join(__dirname, '..', 'server-futures', 'ostium.js');
const main = new Database(mainPath, { readonly: true, fileMustExist: true });
main.pragma('query_only = ON');
const ostium = require(ostiumPath);

const rows = main.prepare(`
  WITH ranked_accounts AS (
    SELECT player_id, lower(wallet_address) AS wallet, created_at AS linked_at,
           ROW_NUMBER() OVER (
             PARTITION BY player_id
             ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END,
                      updated_at DESC,
                      id DESC
           ) AS account_rank
    FROM player_dex_accounts
    WHERE dex = 'ostium'
      AND wallet_address IS NOT NULL
      AND wallet_address != ''
  )
  SELECT tp.player_id, p.name, a.wallet, a.linked_at
  FROM tournament_participants tp
  JOIN players p ON p.id=tp.player_id
  JOIN ranked_accounts a ON a.player_id=tp.player_id AND a.account_rank=1
  WHERE tp.tournament_id=? AND tp.left_at IS NULL
`).all(tournamentId);

(async () => {
  const results = [];
  for (const row of rows) {
    try {
      const result = await ostium.importFillsForPlayer(row.player_id, row.wallet, {
        limit: 250,
        attempts: 2,
        since: row.linked_at,
      });
      results.push({ player: row.name, player_id: row.player_id, wallet: row.wallet, ...result });
    } catch (error) {
      results.push({ player: row.name, player_id: row.player_id, wallet: row.wallet, error: error.message || String(error) });
    }
  }
  console.log(JSON.stringify({ tournament_id: tournamentId, players: rows.length, results }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
