#!/usr/bin/env node

const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const mainDb = require(path.join(repoRoot, 'server', 'db'));
const futuresDb = require(path.join(repoRoot, 'server-futures', 'db'));
const gmtrade = require(path.join(repoRoot, 'server-futures', 'gmtrade'));

const GOLD_PER_USD_VOLUME = 0.5;
const VERIFIED_SOURCE_SQL = "('gmtrade_tx','gmtrade_position_after_tx','gmtrade_close_tx_client_notional')";
const SANE_MIN_NOTIONAL = 10;
const SANE_MAX_NOTIONAL = 10_000_000;

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sqlDateMs(value) {
  if (!value) return null;
  const s = String(value)
    .replace(/[zZ]$/, '')
    .replace(/\s*UTC$/i, '')
    .replace(' ', 'T')
    .trim();
  const ms = Date.parse(`${s}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function tradeInWindow(tournament, row) {
  if (!tournament) return true;
  const tradeMs = sqlDateMs(row?.created_at) ?? Date.now();
  const startMs = Math.max(sqlDateMs(tournament.start_at) ?? 0, sqlDateMs(tournament.joined_at) ?? 0);
  const endMs = sqlDateMs(tournament.end_at) ?? Infinity;
  return tradeMs >= startMs && tradeMs <= endMs;
}

function safeUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < SANE_MIN_NOTIONAL || n > SANE_MAX_NOTIONAL) return 0;
  return n;
}

function volumeGoldForRows(rows) {
  let volume = 0;
  let gold = 0;
  let credited = 0;
  for (const row of rows) {
    const usd = safeUsd(row.notional_usd);
    if (usd <= 0) continue;
    volume += usd;
    gold += Math.floor(usd * GOLD_PER_USD_VOLUME);
    credited += 1;
  }
  return { credited, volume, gold };
}

function tournamentGoldMultiplier(tournament) {
  const baseBoost = Number(tournament.gold_boost || 1) || 1;
  const seekerBoost = Number(tournament.is_seeker || 0) === 1
    ? (Number(tournament.seeker_gold_boost || 1) || 1)
    : 1;
  return Math.min(10, Math.max(0.1, baseBoost) * Math.max(0.1, seekerBoost));
}

function getTournament(tournamentId) {
  if (tournamentId) {
    return mainDb.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  }
  return mainDb.db.prepare(`
    SELECT * FROM tournaments
    WHERE lower(dex) = 'gmtrade'
      AND status = 'active'
      AND replace(replace(start_at, 'T', ' '), ' UTC', '') <= datetime('now')
      AND (end_at IS NULL OR replace(replace(end_at, 'T', ' '), ' UTC', '') > datetime('now'))
    ORDER BY id DESC
    LIMIT 1
  `).get();
}

function getParticipants(tournamentId, names = []) {
  const nameFilter = names.length ? `AND p.name IN (${names.map(() => '?').join(',')})` : '';
  return mainDb.db.prepare(`
    SELECT p.id, p.name,
           COALESCE(NULLIF(da.wallet_address, ''), p.wallet) AS wallet,
           p.dex, p.gold, p.token, p.created_at,
           tp.tournament_id, tp.joined_at, tp.left_at,
           t.start_at, t.end_at, t.gold_boost, t.seeker_gold_boost,
           COALESCE(p.is_seeker, 0) AS is_seeker
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    JOIN tournaments t ON t.id = tp.tournament_id
    LEFT JOIN player_dex_accounts da ON da.id = (
      SELECT id FROM player_dex_accounts
      WHERE player_id = p.id AND dex = 'gmtrade'
      ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END, updated_at DESC, id DESC
      LIMIT 1
    )
    WHERE tp.tournament_id = ?
      AND tp.left_at IS NULL
      ${nameFilter}
    ORDER BY p.name COLLATE NOCASE
  `).all(tournamentId, ...names);
}

function getAllGmtradeAccounts(names = []) {
  const nameFilter = names.length ? `AND p.name IN (${names.map(() => '?').join(',')})` : '';
  return mainDb.db.prepare(`
    SELECT p.id, p.name,
           COALESCE(NULLIF(da.wallet_address, ''), p.wallet) AS wallet,
           p.dex, p.gold, p.token, p.created_at,
           da.status AS gmtrade_status,
           COALESCE(p.is_seeker, 0) AS is_seeker
    FROM players p
    LEFT JOIN player_dex_accounts da ON da.id = (
      SELECT id FROM player_dex_accounts
      WHERE player_id = p.id AND dex = 'gmtrade'
      ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END, updated_at DESC, id DESC
      LIMIT 1
    )
    WHERE (lower(COALESCE(p.dex, '')) = 'gmtrade' OR da.id IS NOT NULL)
      ${nameFilter}
    ORDER BY p.name COLLATE NOCASE
  `).all(...names);
}

function getPlayerTournamentScope(playerId, tournament) {
  if (!tournament?.id) return null;
  const row = mainDb.db.prepare(`
    SELECT tp.tournament_id, tp.joined_at, tp.left_at,
           t.start_at, t.end_at, t.gold_boost, t.seeker_gold_boost,
           COALESCE(p.is_seeker, 0) AS is_seeker
    FROM tournament_participants tp
    JOIN tournaments t ON t.id = tp.tournament_id
    JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = ?
      AND tp.player_id = ?
      AND tp.left_at IS NULL
    LIMIT 1
  `).get(tournament.id, playerId);
  return row || null;
}

function getReward(playerId) {
  let reward = mainDb.db.prepare("SELECT * FROM trading_rewards WHERE player_id = ? AND dex = 'gmtrade'").get(playerId);
  if (!reward) {
    mainDb.db.prepare("INSERT INTO trading_rewards (player_id, dex, wallet) VALUES (?, 'gmtrade', '')").run(playerId);
    reward = mainDb.db.prepare("SELECT * FROM trading_rewards WHERE player_id = ? AND dex = 'gmtrade'").get(playerId);
  }
  return reward;
}

function getFilledRows(playerId) {
  return futuresDb.db.prepare(`
    SELECT id, symbol, side, amount, notional_usd, pnl, status, verified_source, client_order_id, created_at
    FROM trade_history
    WHERE player_id = ?
      AND dex = 'gmtrade'
      AND status = 'filled'
      AND verified_source IN ${VERIFIED_SOURCE_SQL}
    ORDER BY id ASC
  `).all(playerId);
}

function getUnpaidRows(playerId, reward, tournament) {
  return getFilledRows(playerId)
    .filter((row) => Number(row.id || 0) > Number(reward.last_trade_id || 0))
    .filter((row) => tradeInWindow(tournament, row));
}

function getUncreditedTournamentRows(playerId, tournament) {
  const credited = new Set(mainDb.db.prepare(`
    SELECT trade_id
    FROM tournament_trade_credits
    WHERE tournament_id = ? AND source = 'trade_history'
  `).all(tournament.tournament_id || tournament.id).map((row) => String(row.trade_id)));
  return futuresDb.db.prepare(`
    SELECT th.id, th.symbol, th.side, th.amount, th.notional_usd, th.pnl, th.status, th.verified_source, th.client_order_id, th.created_at
    FROM trade_history th
    WHERE th.player_id = ?
      AND th.dex = 'gmtrade'
      AND th.status = 'filled'
      AND th.verified_source IN ${VERIFIED_SOURCE_SQL}
    ORDER BY th.id ASC
  `).all(playerId)
    .filter((row) => !credited.has(String(row.id)))
    .filter((row) => tradeInWindow(tournament, row));
}

async function main() {
  const printJson = console.log.bind(console);
  if (hasFlag('quiet')) {
    console.log = (...args) => console.error(...args);
  }
  const apply = hasFlag('apply');
  const allGmtradeAccounts = hasFlag('all-gmtrade-accounts');
  const tournamentId = Number(argValue('tournament-id', 0)) || null;
  const limit = Math.max(1, Math.min(1000, Number(argValue('limit', process.env.GMTRADE_RECONCILE_SIGNATURE_LIMIT || 300))));
  const names = String(argValue('names', '') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const tournament = getTournament(tournamentId);
  if (!tournament && !allGmtradeAccounts) throw new Error('No GMTrade tournament found');
  const participants = allGmtradeAccounts ? getAllGmtradeAccounts(names) : getParticipants(tournament.id, names);
  const out = [];

  for (const p of participants) {
    if (!gmtrade.isSolanaAddress(p.wallet)) {
      out.push({ name: p.name, wallet: p.wallet || null, skipped: 'missing_or_non_solana_wallet' });
      continue;
    }
    const beforeReward = getReward(p.id);
    const beforeRows = getFilledRows(p.id);
    const scan = await gmtrade.backfillRecentOnchainTradesForPlayer(futuresDb, p.id, p.wallet, {
      limit,
      dryRun: !apply,
    });
    const reward = getReward(p.id);
    const tournamentScope = allGmtradeAccounts ? getPlayerTournamentScope(p.id, tournament) : { ...tournament, joined_at: p.joined_at, is_seeker: p.is_seeker };
    const goldScope = tournamentScope || { start_at: p.created_at, joined_at: p.created_at, end_at: null, is_seeker: p.is_seeker };
    const unpaidRows = getUnpaidRows(p.id, reward, goldScope);
    const uncreditedRows = tournamentScope ? getUncreditedTournamentRows(p.id, tournamentScope) : [];
    const goldCalc = volumeGoldForRows(unpaidRows);
    const tournamentMultiplier = tournamentScope ? tournamentGoldMultiplier(tournamentScope) : 1;
    const tournamentGold = Math.round(goldCalc.gold * tournamentMultiplier);
    const prosperityGold = apply && tournamentGold > 0
      ? mainDb.applyAltarProsperityResourceBonus(p.id, { gold: tournamentGold, wood: 0, ore: 0 })
      : { gold: tournamentGold, bonus: { gold: 0 }, prosperity_bonus_pct: 0 };
    const paidGold = Math.max(0, Math.floor(Number(prosperityGold.gold || 0)));

    let tournamentCredit = { credited_rows: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0 };
    if (apply && uncreditedRows.length > 0) {
      tournamentCredit = mainDb.recordTournamentTradeRows(p.id, uncreditedRows, {
        tournamentId: tournamentScope.tournament_id || tournamentScope.id,
        source: 'trade_history',
        count: true,
        volume: true,
        pnl: true,
      });
    } else if (!apply) {
      const calc = volumeGoldForRows(uncreditedRows);
      tournamentCredit = {
        credited_rows: uncreditedRows.length,
        trades_count: calc.credited,
        volume_usd: calc.volume,
        pnl_usd: uncreditedRows.reduce((sum, row) => sum + (Number(row.pnl) || 0), 0),
      };
    }

    if (apply && paidGold > 0 && unpaidRows.length > 0) {
      const maxId = unpaidRows.reduce((m, row) => Math.max(m, Number(row.id || 0)), Number(reward.last_trade_id || 0));
      mainDb.db.transaction(() => {
        mainDb.db.prepare(`
          UPDATE trading_rewards
             SET last_trade_id = ?,
                 total_volume = total_volume + ?,
                 total_gold = total_gold + ?,
                 first_deposit = CASE WHEN first_trade = 1 THEN 1 ELSE first_deposit END,
                 updated_at = datetime('now')
          WHERE player_id = ? AND dex = 'gmtrade'
        `).run(maxId, goldCalc.volume, paidGold, p.id);
        if (tournamentScope) {
          mainDb.db.prepare(`
            UPDATE tournament_participants
               SET gold = gold + ?, last_activity_at = datetime('now')
             WHERE tournament_id = ? AND player_id = ?
          `).run(tournamentGold, tournamentScope.tournament_id || tournamentScope.id, p.id);
        }
        mainDb.addResources(p.id, paidGold, 0, 0, {
          sourceType: 'gmtrade_reconcile',
          metadata: {
            tournament_id: tournamentScope ? (tournamentScope.tournament_id || tournamentScope.id) : null,
            credited_trades: goldCalc.credited,
            credited_volume_usd: goldCalc.volume,
            base_gold: goldCalc.gold,
            tournament_gold: tournamentGold,
            altar_bonus_gold: Math.max(0, paidGold - tournamentGold),
          },
        });
        mainDb.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)')
          .run(p.id, paidGold, `GMTrade on-chain fill reconciliation: ${goldCalc.credited} trades`);
      })();
    }

    const afterReward = getReward(p.id);
    const afterRows = getFilledRows(p.id);
    out.push({
      name: p.name,
      wallet: p.wallet,
      player_id: p.id,
      mode: apply ? 'apply' : 'dry-run',
      scope: tournamentScope
        ? { type: 'tournament', tournament_id: tournamentScope.tournament_id || tournamentScope.id, joined_at: tournamentScope.joined_at }
        : { type: 'account', start_at: p.created_at || null },
      scan,
      rows_before: beforeRows.length,
      rows_after: afterRows.length,
      reward_before: {
        last_trade_id: beforeReward.last_trade_id || 0,
        total_volume: beforeReward.total_volume || 0,
        total_gold: beforeReward.total_gold || 0,
      },
      reward_after: {
        last_trade_id: afterReward.last_trade_id || 0,
        total_volume: afterReward.total_volume || 0,
        total_gold: afterReward.total_gold || 0,
      },
      unpaid_rows: unpaidRows.length,
      uncredited_tournament_rows: uncreditedRows.length,
      would_or_did_credit: {
        gold_trades: goldCalc.credited,
        gold_volume_usd: Number(goldCalc.volume.toFixed(6)),
        base_gold: goldCalc.gold,
        tournament_gold: tournamentGold,
        paid_gold: paidGold,
        tournament_rows: tournamentCredit.credited_rows,
        tournament_volume_usd: Number((tournamentCredit.volume_usd || 0).toFixed(6)),
      },
    });
  }

  printJson(JSON.stringify({
    ok: true,
    apply,
    all_gmtrade_accounts: allGmtradeAccounts,
    tournament_id: tournament?.id || null,
    tournament: tournament?.name || null,
    participants: participants.length,
    limit,
    results: out,
  }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message, stack: e.stack }, null, 2));
  process.exit(1);
});
