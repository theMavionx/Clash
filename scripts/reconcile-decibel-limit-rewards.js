#!/usr/bin/env node

const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const mainDb = require(path.join(repoRoot, 'server', 'db'));
const futuresDb = require(path.join(repoRoot, 'server-futures', 'db'));
const decibelRewards = require(path.join(repoRoot, 'server-futures', 'decibel-rewards-worker'));

const GOLD_PER_USD_VOLUME = 0.5;
const VERIFIED_SOURCE_SQL = "('decibel_fill','server')";
const SANE_MIN_NOTIONAL = 10;
const SANE_MAX_NOTIONAL = 10_000_000;

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sqlDateMs(value) {
  if (!value) return null;
  const s = String(value).replace(/[zZ]$/, '').replace(/\s*UTC$/i, '').replace(' ', 'T').trim();
  const ms = Date.parse(`${s}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function tradeInWindow(scope, row) {
  if (!scope) return true;
  const tradeMs = sqlDateMs(row?.created_at) ?? Date.now();
  const startMs = Math.max(sqlDateMs(scope.start_at) ?? 0, sqlDateMs(scope.joined_at) ?? 0);
  const endMs = sqlDateMs(scope.end_at) ?? Infinity;
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

function isAptosWallet(value) {
  return /^0x[0-9a-f]{1,64}$/i.test(String(value || '').trim());
}

function getTournament(tournamentId) {
  if (tournamentId) {
    return mainDb.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  }
  return mainDb.db.prepare(`
    SELECT * FROM tournaments
    WHERE lower(dex) = 'decibel'
      AND status = 'active'
      AND replace(replace(start_at, 'T', ' '), ' UTC', '') <= datetime('now')
      AND (end_at IS NULL OR replace(replace(end_at, 'T', ' '), ' UTC', '') > datetime('now'))
    ORDER BY id DESC
    LIMIT 1
  `).get();
}

function getAccounts(tournament, names = [], allDecibelAccounts = false) {
  const nameFilter = names.length ? `AND p.name IN (${names.map(() => '?').join(',')})` : '';
  const params = [];
  let fromSql = 'players p';
  let whereSql = `
    WHERE (lower(p.dex) = 'decibel' OR EXISTS (
      SELECT 1 FROM player_dex_accounts pda2
      WHERE pda2.player_id = p.id AND lower(pda2.dex) = 'decibel'
    ) OR EXISTS (
      SELECT 1 FROM trading_rewards tr2
      WHERE tr2.player_id = p.id AND lower(tr2.dex) = 'decibel'
    ))
    ${nameFilter}
  `;
  if (tournament && !allDecibelAccounts) {
    fromSql = 'tournament_participants tp JOIN players p ON p.id = tp.player_id';
    whereSql = `
      WHERE tp.tournament_id = ?
        AND tp.left_at IS NULL
        ${nameFilter}
    `;
    params.push(tournament.id);
  }
  params.push(...names);
  return mainDb.db.prepare(`
    SELECT p.id, p.name, p.wallet AS player_wallet, p.dex, p.gold, p.created_at,
           NULLIF(pda.wallet_address, '') AS dex_wallet,
           NULLIF(tr.wallet, '') AS reward_wallet,
           ${tournament && !allDecibelAccounts ? 'tp.tournament_id, tp.joined_at, tp.left_at,' : 'NULL AS tournament_id, NULL AS joined_at, NULL AS left_at,'}
           COALESCE(p.is_seeker, 0) AS is_seeker
    FROM ${fromSql}
    LEFT JOIN player_dex_accounts pda ON pda.id = (
      SELECT id FROM player_dex_accounts
      WHERE player_id = p.id AND dex = 'decibel'
      ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END, updated_at DESC, id DESC
      LIMIT 1
    )
    LEFT JOIN trading_rewards tr ON tr.player_id = p.id AND tr.dex = 'decibel'
    ${whereSql}
    ORDER BY p.name COLLATE NOCASE
  `).all(...params).map((row) => ({
    ...row,
    wallet: [row.dex_wallet, row.reward_wallet, row.player_wallet].find(isAptosWallet) || '',
  }));
}

function getReward(playerId, wallet = '') {
  let reward = mainDb.db.prepare("SELECT * FROM trading_rewards WHERE player_id = ? AND dex = 'decibel'").get(playerId);
  if (!reward) {
    mainDb.db.prepare("INSERT INTO trading_rewards (player_id, dex, wallet) VALUES (?, 'decibel', ?)").run(playerId, wallet || '');
    reward = mainDb.db.prepare("SELECT * FROM trading_rewards WHERE player_id = ? AND dex = 'decibel'").get(playerId);
  }
  return reward;
}

function getFilledRows(playerId) {
  return futuresDb.db.prepare(`
    SELECT id, symbol, side, amount, notional_usd, pnl, status, verified_source, client_order_id, created_at
    FROM trade_history
    WHERE player_id = ?
      AND dex = 'decibel'
      AND status = 'filled'
      AND verified_source IN ${VERIFIED_SOURCE_SQL}
    ORDER BY id ASC
  `).all(playerId);
}

function getUncreditedTournamentRows(playerId, tournament, scope) {
  if (!tournament) return [];
  const credited = new Set(mainDb.db.prepare(`
    SELECT trade_id
    FROM tournament_trade_credits
    WHERE tournament_id = ? AND source = 'trade_history'
  `).all(tournament.id).map((row) => String(row.trade_id)));
  return getFilledRows(playerId)
    .filter((row) => !credited.has(String(row.id)))
    .filter((row) => tradeInWindow(scope, row));
}

function tournamentGoldMultiplier(tournament) {
  if (!tournament) return 1;
  const baseBoost = Number(tournament.gold_boost || 1) || 1;
  const seekerBoost = Number(tournament.is_seeker || 0) === 1
    ? (Number(tournament.seeker_gold_boost || 1) || 1)
    : 1;
  return Math.min(10, Math.max(0.1, baseBoost) * Math.max(0.1, seekerBoost));
}

async function main() {
  const apply = hasFlag('apply');
  const allDecibelAccounts = hasFlag('all-decibel-accounts');
  const tournamentId = Number(argValue('tournament-id', 0)) || null;
  const names = String(argValue('names', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const tournament = getTournament(tournamentId);
  if (!tournament && !allDecibelAccounts) {
    throw new Error('No active Decibel tournament found. Pass --all-decibel-accounts or --tournament-id=<id>.');
  }
  const accounts = getAccounts(tournament, names, allDecibelAccounts);
  const out = [];

  for (const p of accounts) {
    if (!isAptosWallet(p.wallet)) {
      out.push({ name: p.name, player_id: p.id, skipped: 'missing_aptos_wallet' });
      continue;
    }
    const importResult = apply
      ? await decibelRewards.importRecentLimitFillsForPlayer(p.id, p.wallet)
      : { imported: 0, skipped: 'dry_run_no_remote_import' };
    const reward = getReward(p.id, p.wallet);
    const scope = tournament
      ? { ...tournament, joined_at: p.joined_at, is_seeker: p.is_seeker }
      : { start_at: p.created_at, joined_at: p.created_at, end_at: null, is_seeker: p.is_seeker };
    const unpaidRows = getFilledRows(p.id)
      .filter((row) => Number(row.id || 0) > Number(reward.last_trade_id || 0))
      .filter((row) => tradeInWindow(scope, row));
    const uncreditedRows = getUncreditedTournamentRows(p.id, tournament, scope);
    const goldCalc = volumeGoldForRows(unpaidRows);
    const tournamentGold = Math.round(goldCalc.gold * tournamentGoldMultiplier(scope));
    const paidGold = apply && tournamentGold > 0
      ? Math.max(0, Math.floor(Number(mainDb.applyAltarProsperityResourceBonus(p.id, { gold: tournamentGold, wood: 0, ore: 0 })?.gold || tournamentGold)))
      : tournamentGold;

    let tournamentCredit = { credited_rows: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0 };
    if (apply && tournament && uncreditedRows.length > 0) {
      tournamentCredit = mainDb.recordTournamentTradeRows(p.id, uncreditedRows, {
        tournamentId: tournament.id,
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
           WHERE player_id = ? AND dex = 'decibel'
        `).run(maxId, goldCalc.volume, paidGold, p.id);
        if (tournament) {
          mainDb.db.prepare(`
            UPDATE tournament_participants
               SET gold = gold + ?, last_activity_at = datetime('now')
             WHERE tournament_id = ? AND player_id = ?
          `).run(tournamentGold, tournament.id, p.id);
        }
        mainDb.addResources(p.id, paidGold, 0, 0, {
          sourceType: 'decibel_limit_reconcile',
          metadata: {
            tournament_id: tournament ? tournament.id : null,
            credited_trades: goldCalc.credited,
            credited_volume_usd: goldCalc.volume,
            base_gold: goldCalc.gold,
            paid_gold: paidGold,
          },
        });
        mainDb.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)')
          .run(p.id, paidGold, `Decibel limit-fill reconciliation: ${goldCalc.credited} trades`);
      })();
    }

    const afterReward = getReward(p.id, p.wallet);
    out.push({
      name: p.name,
      player_id: p.id,
      wallet: p.wallet,
      mode: apply ? 'apply' : 'dry-run',
      import: importResult,
      reward_before: {
        last_trade_id: reward.last_trade_id || 0,
        total_volume: reward.total_volume || 0,
        total_gold: reward.total_gold || 0,
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
        paid_gold: paidGold,
        tournament_rows: tournamentCredit.credited_rows,
        tournament_volume_usd: Number((tournamentCredit.volume_usd || 0).toFixed(6)),
      },
    });
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    tournament_id: tournament?.id || null,
    players: out.length,
    results: out,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
