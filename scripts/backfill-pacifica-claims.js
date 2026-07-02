#!/usr/bin/env node

const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const mainDb = require(path.join(repoRoot, 'server', 'db'));
const tasks = require(path.join(repoRoot, 'server', 'tasks'));

const DEFAULT_API_BASE = process.env.CLAIM_API_BASE
  || process.env.CLASH_API_BASE
  || `http://127.0.0.1:${process.env.PORT || 4000}/api`;

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSolanaWallet(value) {
  const text = String(value || '').trim();
  return /^[1-9A-HJ-NP-Za-km-z]{43,44}$/u.test(text);
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function tradeVolumeUsd(row) {
  const volume = Number(row?.price || 0) * Number(row?.amount || 0);
  return Number.isFinite(volume) ? volume : 0;
}

function getCandidates({ names = [], playerIds = [], wallets = [], limit = 1000 } = {}) {
  const clauses = [];
  const args = [];
  if (names.length) {
    clauses.push(`p.name IN (${names.map(() => '?').join(',')})`);
    args.push(...names);
  }
  if (playerIds.length) {
    clauses.push(`p.id IN (${playerIds.map(() => '?').join(',')})`);
    args.push(...playerIds);
  }
  if (wallets.length) {
    clauses.push(`(
      p.wallet IN (${wallets.map(() => '?').join(',')})
      OR tr.wallet IN (${wallets.map(() => '?').join(',')})
      OR da.wallet_address IN (${wallets.map(() => '?').join(',')})
      OR EXISTS (
        SELECT 1 FROM pacifica_agents pa
        WHERE pa.player_id = p.id
          AND pa.agent_wallet IN (${wallets.map(() => '?').join(',')})
      )
    )`);
    args.push(...wallets, ...wallets, ...wallets, ...wallets);
  }
  const explicitFilter = clauses.length ? `AND (${clauses.join(' OR ')})` : '';
  return mainDb.db.prepare(`
    SELECT p.id,
           p.name,
           p.token,
           p.wallet AS player_wallet,
           p.dex AS player_dex,
           tr.wallet AS reward_wallet,
           COALESCE(tr.last_trade_id, 0) AS last_trade_id,
           COALESCE(tr.total_volume, 0) AS total_volume,
           COALESCE(tr.total_gold, 0) AS total_gold,
           tr.updated_at AS reward_updated_at,
           da.wallet_address AS dex_wallet,
           da.status AS dex_status,
           COALESCE((
             SELECT COUNT(*)
             FROM pacifica_agents pa
             WHERE pa.player_id = p.id
           ), 0) AS agent_count
    FROM players p
    LEFT JOIN trading_rewards tr
      ON tr.player_id = p.id AND tr.dex = 'pacifica'
    LEFT JOIN player_dex_accounts da
      ON da.id = (
        SELECT id
        FROM player_dex_accounts
        WHERE player_id = p.id AND dex = 'pacifica'
        ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END,
                 updated_at DESC,
                 id DESC
        LIMIT 1
      )
    WHERE p.token IS NOT NULL
      AND (
        lower(COALESCE(p.dex, '')) = 'pacifica'
        OR tr.player_id IS NOT NULL
        OR da.id IS NOT NULL
        OR EXISTS (SELECT 1 FROM pacifica_agents pa WHERE pa.player_id = p.id)
      )
      ${explicitFilter}
    ORDER BY COALESCE(tr.updated_at, p.created_at) DESC, p.name COLLATE NOCASE
    LIMIT ?
  `).all(...args, limit);
}

async function claimViaApi(player, apiBase) {
  const wallet = player.claim_wallet || player.dex_wallet || player.reward_wallet || player.player_wallet || '';
  const res = await fetch(`${apiBase.replace(/\/+$/u, '')}/trading/claim-gold`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-token': player.token,
      'x-dex': 'pacifica',
    },
    body: JSON.stringify({ wallet, dex: 'pacifica' }),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

async function inspectCandidate(row, { firstPageOnly = false } = {}) {
  const claimWallet = [row.dex_wallet, row.reward_wallet, row.player_wallet].find(isSolanaWallet) || row.dex_wallet || row.reward_wallet || row.player_wallet || '';
  const linked = String(row.player_dex || '').toLowerCase() === 'pacifica'
    || String(row.dex_status || '').toLowerCase() === 'ready';
  const out = {
    player_id: row.id,
    name: row.name,
    player_dex: row.player_dex,
    linked_pacifica: linked,
    claim_wallet: claimWallet,
    agent_count: Number(row.agent_count || 0),
    reward_before: {
      last_trade_id: Number(row.last_trade_id || 0),
      total_volume: Number(row.total_volume || 0),
      total_gold: Number(row.total_gold || 0),
      updated_at: row.reward_updated_at || null,
    },
  };
  if (!linked) {
    return { ...out, skipped: 'pacifica_not_active_or_linked' };
  }
  if (!isSolanaWallet(claimWallet) && Number(row.agent_count || 0) <= 0) {
    return { ...out, skipped: 'no_solana_wallet_or_agent' };
  }

  const trades = await tasks.fetchPacificaAllTrades(
    { id: row.id, name: row.name, wallet: claimWallet },
    { since: Number(row.last_trade_id || 0), firstPageOnly },
  );
  const newTrades = trades.filter((trade) => Number(trade.history_id || 0) > Number(row.last_trade_id || 0));
  const newVolume = newTrades.reduce((sum, trade) => sum + tradeVolumeUsd(trade), 0);
  return {
    ...out,
    new_trades: newTrades.length,
    new_trade_ids: newTrades.map((trade) => Number(trade.history_id || 0)).filter(Boolean),
    new_volume_usd: Number(newVolume.toFixed(6)),
    latest_trade_id: newTrades.reduce((max, trade) => Math.max(max, Number(trade.history_id || 0)), Number(row.last_trade_id || 0)),
  };
}

async function main() {
  const apply = hasFlag('apply');
  const quiet = hasFlag('quiet');
  const firstPageOnly = hasFlag('first-page-only');
  const names = parseCsv(argValue('names', ''));
  const playerIds = parseCsv(argValue('player-ids', ''));
  const wallets = parseCsv(argValue('wallets', ''));
  const limit = Math.max(1, Math.min(5000, Number(argValue('limit', '1000')) || 1000));
  const sleepMs = Math.max(0, Number(argValue('sleep-ms', '1250')) || 0);
  const apiBase = argValue('api-base', DEFAULT_API_BASE);
  const candidates = getCandidates({ names, playerIds, wallets, limit });
  const results = [];

  for (const row of candidates) {
    const inspected = await inspectCandidate(row, { firstPageOnly });
    if (apply && Number(inspected.new_trades || 0) > 0 && !inspected.skipped) {
      inspected.claim = await claimViaApi({ ...row, claim_wallet: inspected.claim_wallet }, apiBase);
      const after = mainDb.db.prepare("SELECT last_trade_id, total_volume, total_gold, updated_at FROM trading_rewards WHERE player_id = ? AND dex = 'pacifica'").get(row.id);
      inspected.reward_after = after ? {
        last_trade_id: Number(after.last_trade_id || 0),
        total_volume: Number(after.total_volume || 0),
        total_gold: Number(after.total_gold || 0),
        updated_at: after.updated_at || null,
      } : null;
    }
    results.push(inspected);
    if (!quiet) {
      console.error(`${apply ? 'apply' : 'dry-run'} ${row.name}: new=${inspected.new_trades || 0} skipped=${inspected.skipped || '-'} gold=${inspected.claim?.data?.gold ?? '-'}`);
    }
    if (sleepMs > 0) await sleep(sleepMs);
  }

  const missed = results.filter((row) => Number(row.new_trades || 0) > 0);
  console.log(JSON.stringify({
    ok: true,
    apply,
    api_base: apply ? apiBase : null,
    candidates: candidates.length,
    missed_players: missed.length,
    missed_trades: missed.reduce((sum, row) => sum + Number(row.new_trades || 0), 0),
    missed_volume_usd: Number(missed.reduce((sum, row) => sum + Number(row.new_volume_usd || 0), 0).toFixed(6)),
    credited_gold: results.reduce((sum, row) => sum + Number(row.claim?.data?.gold || 0), 0),
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
