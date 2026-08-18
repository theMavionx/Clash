const { Connection, PublicKey } = require('@solana/web3.js');
const {
  createSolanaConnection,
  solanaRpcUrls,
  withSolanaRpcFallback,
} = require('./solana_rpc');
const { LIVE_CLASHSOL_MINT } = require('./sanctum');

const CLASHSOL_DECIMALS = 9;
const CLASHSOL_SCALE = 1_000_000_000n;
const DEFAULT_GOLD_PER_CLASHSOL = 2000;
const MAX_GOLD_PER_CLASHSOL = 1_000_000;
const MAX_REWARD_GOLD = 1_000_000_000;
const SNAPSHOT_CONCURRENCY = 3;
const MIN_DAILY_SAMPLES = 2;
const MIN_DAILY_COVERAGE_MS = 6 * 60 * 60 * 1000;

class SanctumRewardError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'SanctumRewardError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function utcDay(value = Date.now()) {
  return new Date(value).toISOString().slice(0, 10);
}

function nextUtcDayStart(value = Date.now()) {
  const now = new Date(value);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

function previousUtcDay(value = Date.now()) {
  return utcDay(Number(value) - 24 * 60 * 60 * 1000);
}

function sampleBucket(value = Date.now()) {
  const date = new Date(value);
  return date.getUTCHours() * 2 + (date.getUTCMinutes() >= 30 ? 1 : 0);
}

function normalizeSolanaWallet(value) {
  try {
    return new PublicKey(String(value || '').trim()).toBase58();
  } catch {
    throw new SanctumRewardError('INVALID_WALLET', 'Connect a valid Solana wallet', 400);
  }
}

function parseTokenAmount(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error('Solana RPC returned an invalid token balance');
  return BigInt(text);
}

function rewardGoldForBalance(balanceAtomics, rate) {
  const amount = parseTokenAmount(balanceAtomics);
  const safeRate = Number(rate);
  if (!Number.isInteger(safeRate) || safeRate < 0 || safeRate > MAX_GOLD_PER_CLASHSOL) {
    throw new SanctumRewardError('INVALID_REWARD_RATE', 'clashSOL reward rate is invalid', 503);
  }
  const value = (amount * BigInt(safeRate)) / CLASHSOL_SCALE;
  return Number(value > BigInt(MAX_REWARD_GOLD) ? BigInt(MAX_REWARD_GOLD) : value);
}

function createDefaultBalanceReader({ mint, rpcUrls = solanaRpcUrls() } = {}) {
  const mintKey = new PublicKey(mint);
  return async function readBalance(wallet) {
    const owner = new PublicKey(wallet);
    return withSolanaRpcFallback(async (rpcUrl) => {
      const connection = createSolanaConnection(Connection, rpcUrl, 'confirmed');
      const response = await connection.getParsedTokenAccountsByOwner(owner, { mint: mintKey }, 'confirmed');
      let atomics = 0n;
      for (const row of response?.value || []) {
        const amount = row?.account?.data?.parsed?.info?.tokenAmount?.amount;
        atomics += parseTokenAmount(amount || '0');
      }
      return {
        balanceAtomics: atomics.toString(),
        slot: Number(response?.context?.slot) || null,
      };
    }, {
      urls: rpcUrls,
      label: 'clashSOL balance read',
      onError: (error, rpcUrl) => {
        let host = 'configured-rpc';
        try { host = new URL(rpcUrl).hostname; } catch {}
        console.warn('[sanctum-rewards] balance RPC failed:', host, error?.message || error);
      },
    });
  };
}

function createSanctumRewardsService({
  db,
  clashSolMint = process.env.CLASHSOL_MINT || LIVE_CLASHSOL_MINT,
  getResourceCaps,
  readBalance,
  now = () => Date.now(),
} = {}) {
  if (!db?.prepare || typeof getResourceCaps !== 'function') {
    throw new TypeError('createSanctumRewardsService requires SQLite and getResourceCaps');
  }
  const mint = normalizeSolanaWallet(clashSolMint);
  const balanceReader = readBalance || createDefaultBalanceReader({ mint });

  async function getWalletBalances(wallet) {
    const normalized = normalizeSolanaWallet(wallet);
    const [clashSol, sol] = await Promise.all([
      balanceReader(normalized),
      withSolanaRpcFallback(async (rpcUrl) => {
        const connection = createSolanaConnection(Connection, rpcUrl, 'confirmed');
        const lamports = await connection.getBalance(new PublicKey(normalized), 'confirmed');
        return { balanceAtomics: String(lamports) };
      }, { urls: solanaRpcUrls(), label: 'SOL balance read' }),
    ]);
    return {
      wallet: normalized,
      sol_atomics: String(sol.balanceAtomics || '0'),
      clashsol_atomics: String(clashSol.balanceAtomics || '0'),
      decimals: CLASHSOL_DECIMALS,
      rpc_slot: clashSol.slot,
    };
  }

  const getEffectiveSettingsStmt = db.prepare(`
    SELECT id, enabled, gold_per_clashsol, effective_day_utc, changed_by, created_at
    FROM sanctum_reward_settings
    WHERE effective_day_utc <= ?
    ORDER BY effective_day_utc DESC, id DESC
    LIMIT 1
  `);
  const getNextSettingsStmt = db.prepare(`
    SELECT id, enabled, gold_per_clashsol, effective_day_utc, changed_by, created_at
    FROM sanctum_reward_settings
    WHERE effective_day_utc > ?
    ORDER BY effective_day_utc ASC, id DESC
    LIMIT 1
  `);

  function effectiveSettings(day = utcDay(now())) {
    return getEffectiveSettingsStmt.get(day) || {
      id: null,
      enabled: 1,
      gold_per_clashsol: DEFAULT_GOLD_PER_CLASHSOL,
      effective_day_utc: day,
      changed_by: 'system:fallback',
      created_at: null,
    };
  }

  function settingsStatus(day = utcDay(now())) {
    const current = effectiveSettings(day);
    const next = getNextSettingsStmt.get(day) || null;
    return {
      current: {
        ...current,
        enabled: Number(current.enabled) === 1,
        gold_per_clashsol: Number(current.gold_per_clashsol),
      },
      next: next ? {
        ...next,
        enabled: Number(next.enabled) === 1,
        gold_per_clashsol: Number(next.gold_per_clashsol),
      } : null,
    };
  }

  function resolveLinkedWallet(playerId, requestedWallet = '') {
    const row = db.prepare(`
      SELECT wallet FROM sanctum_reward_wallets WHERE player_id = ? LIMIT 1
    `).get(playerId);
    if (!row?.wallet) return null;
    if (!requestedWallet) return row.wallet;
    const wallet = normalizeSolanaWallet(requestedWallet);
    return row.wallet === wallet ? wallet : null;
  }

  function linkRewardWallet({ playerId, wallet }) {
    const normalized = normalizeSolanaWallet(wallet);
    const owner = db.prepare(`
      SELECT player_id FROM sanctum_reward_wallets WHERE wallet = ? LIMIT 1
    `).get(normalized);
    if (owner && owner.player_id !== playerId) {
      throw new SanctumRewardError(
        'WALLET_ALREADY_LINKED',
        'This wallet already receives clashSOL rewards for another Clash account',
        409,
      );
    }
    const current = db.prepare(`
      SELECT wallet FROM sanctum_reward_wallets WHERE player_id = ? LIMIT 1
    `).get(playerId);
    if (current?.wallet && current.wallet !== normalized) {
      const observedToday = db.prepare(`
        SELECT 1 FROM sanctum_balance_observations
        WHERE player_id = ? AND wallet = ? AND observed_day_utc = ?
        LIMIT 1
      `).get(playerId, current.wallet, utcDay(now()));
      if (observedToday) {
        throw new SanctumRewardError(
          'WALLET_SWITCH_LOCKED',
          'Today’s reward wallet has already been sampled. Switch after the next UTC day begins.',
          409,
          { activeWallet: current.wallet, retryAt: nextUtcDayStart(now()) },
        );
      }
    }
    db.prepare(`
      INSERT INTO sanctum_reward_wallets (player_id, wallet, verified_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(player_id) DO UPDATE SET
        wallet = excluded.wallet,
        verified_at = datetime('now'),
        updated_at = datetime('now')
    `).run(playerId, normalized);
    return normalized;
  }

  function rewardRow(row) {
    if (!row) return null;
    return {
      ...row,
      enabled: row.status !== 'disabled',
      balance_atomics: String(row.balance_atomics || '0'),
      token_decimals: Number(row.token_decimals || CLASHSOL_DECIMALS),
      gold_per_clashsol: Number(row.gold_per_clashsol || 0),
      reward_gold: Number(row.reward_gold || 0),
      claimed_gold: Number(row.claimed_gold || 0),
      remaining_gold: Math.max(0, Number(row.reward_gold || 0) - Number(row.claimed_gold || 0)),
      rpc_slot: row.rpc_slot == null ? null : Number(row.rpc_slot),
    };
  }

  async function recordBalanceObservation({ playerId, wallet, observedAt = now() }) {
    const linkedWallet = resolveLinkedWallet(playerId, wallet);
    if (!linkedWallet) {
      throw new SanctumRewardError(
        'WALLET_NOT_LINKED',
        'Link the Solana wallet holding clashSOL to this Clash account',
        409,
      );
    }
    const balance = await balanceReader(linkedWallet);
    const activeWallet = resolveLinkedWallet(playerId);
    if (activeWallet !== linkedWallet) {
      throw new SanctumRewardError(
        'WALLET_CHANGED_DURING_READ',
        'The clashSOL reward wallet changed while its balance was being read. The stale sample was discarded.',
        409,
      );
    }
    const day = utcDay(observedAt);
    const bucket = sampleBucket(observedAt);
    db.prepare(`
      INSERT INTO sanctum_balance_observations (
        player_id, wallet, observed_day_utc, sample_bucket,
        balance_atomics, rpc_slot, observed_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'))
      ON CONFLICT(wallet, observed_day_utc, sample_bucket) DO UPDATE SET
        balance_atomics = CASE
          WHEN length(excluded.balance_atomics) < length(sanctum_balance_observations.balance_atomics)
            OR (length(excluded.balance_atomics) = length(sanctum_balance_observations.balance_atomics)
                AND excluded.balance_atomics < sanctum_balance_observations.balance_atomics)
          THEN excluded.balance_atomics ELSE sanctum_balance_observations.balance_atomics END,
        rpc_slot = excluded.rpc_slot,
        observed_at = excluded.observed_at
    `).run(playerId, linkedWallet, day, bucket, String(balance.balanceAtomics), balance.slot, Math.floor(observedAt / 1000));
    return { wallet: linkedWallet, day, bucket, balance_atomics: String(balance.balanceAtomics), rpc_slot: balance.slot };
  }

  function finalizeCompletedRewards({ beforeDay = utcDay(now()) } = {}) {
    const groups = db.prepare(`
      SELECT player_id, wallet, observed_day_utc,
             COUNT(*) AS sample_count,
             MIN(observed_at) AS first_observed_at,
             MAX(observed_at) AS last_observed_at,
             MAX(rpc_slot) AS rpc_slot
      FROM sanctum_balance_observations o
      WHERE observed_day_utc < ?
        AND NOT EXISTS (
          SELECT 1 FROM sanctum_daily_rewards r
          WHERE r.player_id = o.player_id AND r.reward_day_utc = o.observed_day_utc
        )
      GROUP BY player_id, wallet, observed_day_utc
      ORDER BY observed_day_utc, player_id
    `).all(beforeDay);
    let created = 0;
    for (const group of groups) {
      const observations = db.prepare(`
        SELECT balance_atomics FROM sanctum_balance_observations
        WHERE player_id = ? AND wallet = ? AND observed_day_utc = ?
      `).all(group.player_id, group.wallet, group.observed_day_utc);
      const minimum = observations.reduce((value, row) => {
        const amount = parseTokenAmount(row.balance_atomics);
        return value == null || amount < value ? amount : value;
      }, null) || 0n;
      const firstMs = Date.parse(`${group.first_observed_at}Z`);
      const lastMs = Date.parse(`${group.last_observed_at}Z`);
      const hasCoverage = Number(group.sample_count) >= MIN_DAILY_SAMPLES
        && Number.isFinite(firstMs) && Number.isFinite(lastMs)
        && lastMs - firstMs >= MIN_DAILY_COVERAGE_MS;
      const settings = effectiveSettings(group.observed_day_utc);
      const enabled = Number(settings.enabled) === 1;
      const rewardGold = enabled && hasCoverage
        ? rewardGoldForBalance(minimum.toString(), settings.gold_per_clashsol)
        : 0;
      const status = !enabled ? 'disabled' : rewardGold > 0 ? 'ready' : 'zero';
      const inserted = db.prepare(`
        INSERT OR IGNORE INTO sanctum_daily_rewards (
          player_id, wallet, reward_day_utc, balance_atomics, token_decimals,
          gold_per_clashsol, reward_gold, claimed_gold, rpc_slot, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        group.player_id,
        group.wallet,
        group.observed_day_utc,
        minimum.toString(),
        CLASHSOL_DECIMALS,
        Number(settings.gold_per_clashsol),
        rewardGold,
        group.rpc_slot,
        status,
      );
      created += inserted.changes;
    }
    return { finalized_before: beforeDay, attempted: groups.length, created };
  }

  function pendingRows(playerId) {
    return db.prepare(`
      SELECT * FROM sanctum_daily_rewards
      WHERE player_id = ? AND status = 'ready' AND reward_gold > claimed_gold
      ORDER BY reward_day_utc ASC, id ASC
    `).all(playerId).map(rewardRow);
  }

  async function getPlayerStatus({ playerId, wallet = '' }) {
    finalizeCompletedRewards();
    const linkedWallet = resolveLinkedWallet(playerId, wallet);
    if (!linkedWallet) {
      return {
        linked: false,
        wallet: null,
        settings: settingsStatus(),
        today: null,
        pending_gold: 0,
        claimable_now: 0,
        pending_days: 0,
        next_snapshot_at: nextUtcDayStart(now()),
      };
    }
    const todayObservations = db.prepare(`
      SELECT wallet, observed_day_utc, balance_atomics, observed_at
      FROM sanctum_balance_observations
      WHERE player_id = ? AND wallet = ? AND observed_day_utc = ?
      ORDER BY observed_at ASC
    `).all(playerId, linkedWallet, utcDay(now()));
    const minimumToday = todayObservations.reduce((value, row) => {
      const amount = parseTokenAmount(row.balance_atomics);
      return value == null || amount < value ? amount : value;
    }, null);
    const today = todayObservations.length ? {
      wallet: linkedWallet,
      observed_day_utc: utcDay(now()),
      sample_count: todayObservations.length,
      minimum_balance_atomics: String(minimumToday || 0n),
      token_decimals: CLASHSOL_DECIMALS,
      first_observed_at: todayObservations[0].observed_at,
      last_observed_at: todayObservations[todayObservations.length - 1].observed_at,
    } : null;
    const pending = pendingRows(playerId);
    const resources = db.prepare('SELECT gold FROM players WHERE id = ?').get(playerId);
    const cap = Number(getResourceCaps(playerId)?.gold || 0);
    const pendingGold = pending.reduce((sum, row) => sum + row.remaining_gold, 0);
    const claimableNow = Math.max(0, Math.min(pendingGold, cap - Number(resources?.gold || 0)));
    return {
      linked: true,
      wallet: linkedWallet,
      mint,
      settings: settingsStatus(),
      today,
      pending_gold: pendingGold,
      claimable_now: claimableNow,
      gold_capacity_remaining: Math.max(0, cap - Number(resources?.gold || 0)),
      pending_days: pending.length,
      claimed_today: false,
      last_snapshot_at: today?.last_observed_at || null,
      next_snapshot_at: nextUtcDayStart(now()),
    };
  }

  const claimTransaction = db.transaction((playerId, cap) => {
    const rows = db.prepare(`
      SELECT id, reward_gold, claimed_gold FROM sanctum_daily_rewards
      WHERE player_id = ? AND status = 'ready' AND reward_gold > claimed_gold
      ORDER BY reward_day_utc ASC, id ASC
    `).all(playerId);
    if (!rows.length) throw new SanctumRewardError('NOTHING_TO_CLAIM', 'No clashSOL Gold is ready to claim', 409);
    const resources = db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(playerId);
    if (!resources) throw new SanctumRewardError('PLAYER_NOT_FOUND', 'Player not found', 404);
    let capacity = Math.max(0, Number(cap || 0) - Number(resources.gold || 0));
    if (capacity <= 0) {
      throw new SanctumRewardError(
        'GOLD_STORAGE_FULL',
        'Gold storage is full. Make room, then claim the preserved reward.',
        409,
        { currentGold: Number(resources.gold || 0), goldCap: Number(cap || 0) },
      );
    }
    const allocations = [];
    for (const row of rows) {
      if (capacity <= 0) break;
      const remaining = Math.max(0, Number(row.reward_gold || 0) - Number(row.claimed_gold || 0));
      const amount = Math.min(remaining, capacity);
      if (amount > 0) allocations.push({ id: Number(row.id), amount, completes: amount === remaining });
      capacity -= amount;
    }
    const total = allocations.reduce((sum, row) => sum + row.amount, 0);
    if (total <= 0) throw new SanctumRewardError('NOTHING_TO_CLAIM', 'No clashSOL Gold fits in storage', 409);
    db.prepare(`UPDATE players SET gold = gold + ?, last_activity_at = datetime('now') WHERE id = ?`)
      .run(total, playerId);
    const updateReward = db.prepare(`
      UPDATE sanctum_daily_rewards
      SET claimed_gold = claimed_gold + ?,
          status = CASE WHEN claimed_gold + ? >= reward_gold THEN 'claimed' ELSE 'ready' END,
          claimed_at = CASE WHEN claimed_gold + ? >= reward_gold THEN datetime('now') ELSE claimed_at END,
          updated_at = datetime('now')
      WHERE player_id = ? AND id = ? AND status = 'ready'
    `);
    for (const allocation of allocations) {
      const updated = updateReward.run(
        allocation.amount,
        allocation.amount,
        allocation.amount,
        playerId,
        allocation.id,
      );
      if (updated.changes !== 1) {
        throw new SanctumRewardError('CLAIM_STATE_CHANGED', 'Reward state changed. Refresh and try again.', 409);
      }
    }
    const after = Number(resources.gold || 0) + total;
    db.prepare(`
      INSERT INTO resource_delta_events (
        player_id, source_type, gold_delta, wood_delta, ore_delta,
        gold_before, wood_before, ore_before, gold_after, wood_after, ore_after,
        gold_cap_before, wood_cap_before, ore_cap_before,
        gold_cap_after, wood_cap_after, ore_cap_after,
        lost_gold_to_cap, lost_wood_to_cap, lost_ore_to_cap, metadata_json
      ) VALUES (?, 'sanctum_clashsol_daily', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, 0, 0, 0, ?)
    `).run(
      playerId,
      total,
      Number(resources.gold || 0),
      Number(resources.wood || 0),
      Number(resources.ore || 0),
      after,
      Number(resources.wood || 0),
      Number(resources.ore || 0),
      Number(cap || 0),
      Number(cap || 0),
      JSON.stringify({ allocations, mint }),
    );
    const remaining = db.prepare(`
      SELECT COALESCE(SUM(reward_gold - claimed_gold), 0) AS total
      FROM sanctum_daily_rewards
      WHERE player_id = ? AND status = 'ready' AND reward_gold > claimed_gold
    `).get(playerId);
    return {
      total,
      ids: allocations.map(row => row.id),
      allocations,
      pending_remaining: Number(remaining?.total || 0),
      resources: { ...resources, gold: after },
    };
  });

  function claim({ playerId }) {
    const cap = Number(getResourceCaps(playerId)?.gold || 0);
    return claimTransaction(playerId, cap);
  }

  function history({ playerId, limit = 50, cursor = 0 }) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    const safeCursor = Math.max(0, Number(cursor) || 0);
    const items = db.prepare(`
      SELECT * FROM (
        SELECT 'gold' AS type, CAST(id AS TEXT) AS id, reward_day_utc, wallet,
               balance_atomics, token_decimals, gold_per_clashsol, reward_gold,
               claimed_gold, status, rpc_slot, claimed_at, NULL AS direction,
               NULL AS input_mint, NULL AS output_mint, NULL AS input_amount,
               NULL AS output_amount, NULL AS slippage_bps, NULL AS tx_signature,
               NULL AS consumed_at, created_at, NULL AS last_error,
               NULL AS last_error_code, NULL AS last_error_stage,
               NULL AS submitted_at, NULL AS confirmed_at,
               NULL AS confirmation_status, NULL AS confirmation_slot,
               COALESCE(claimed_at, created_at) AS event_at
        FROM sanctum_daily_rewards WHERE player_id = ?
        UNION ALL
        SELECT 'swap' AS type, id, NULL AS reward_day_utc, wallet,
               NULL AS balance_atomics, 9 AS token_decimals, NULL AS gold_per_clashsol,
               NULL AS reward_gold, NULL AS claimed_gold, status, NULL AS rpc_slot,
               NULL AS claimed_at, direction, input_mint, output_mint, input_amount,
               output_amount, slippage_bps, tx_signature, consumed_at, created_at,
               last_error, last_error_code, last_error_stage,
               submitted_at, confirmed_at, confirmation_status, confirmation_slot,
               COALESCE(confirmed_at, submitted_at, consumed_at, created_at) AS event_at
        FROM sanctum_order_intents WHERE player_id = ?
      )
      ORDER BY event_at DESC, type ASC, id DESC
      LIMIT ? OFFSET ?
    `).all(playerId, playerId, safeLimit + 1, safeCursor);
    const hasMore = items.length > safeLimit;
    return {
      items: items.slice(0, safeLimit).map(row => row.type === 'gold' ? rewardRow(row) : row),
      next_cursor: hasMore ? safeCursor + safeLimit : null,
    };
  }

  function updateSettings({ enabled, goldPerClashSol, changedBy }) {
    const rate = Number(goldPerClashSol);
    if (!Number.isInteger(rate) || rate < 0 || rate > MAX_GOLD_PER_CLASHSOL) {
      throw new SanctumRewardError(
        'INVALID_REWARD_RATE',
        `Gold per clashSOL must be a whole number from 0 to ${MAX_GOLD_PER_CLASHSOL.toLocaleString()}`,
        400,
      );
    }
    const effectiveDay = utcDay(Date.parse(nextUtcDayStart(now())));
    db.prepare(`
      INSERT INTO sanctum_reward_settings
        (enabled, gold_per_clashsol, effective_day_utc, changed_by)
      VALUES (?, ?, ?, ?)
    `).run(enabled ? 1 : 0, rate, effectiveDay, String(changedBy || 'admin').slice(0, 120));
    return settingsStatus();
  }

  function adminMetrics({ limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const summary = db.prepare(`
      WITH latest_today AS (
        SELECT o.*
        FROM sanctum_balance_observations o
        JOIN (
          SELECT wallet, MAX(observed_at) AS observed_at
          FROM sanctum_balance_observations
          WHERE observed_day_utc = date('now')
          GROUP BY wallet
        ) latest ON latest.wallet = o.wallet AND latest.observed_at = o.observed_at
        WHERE o.observed_day_utc = date('now')
      )
      SELECT
        (SELECT COUNT(*) FROM sanctum_reward_wallets) AS verified_holders,
        (SELECT COUNT(*) FROM latest_today WHERE CAST(balance_atomics AS INTEGER) > 0) AS current_holders,
        (SELECT COUNT(*) FROM sanctum_daily_rewards WHERE reward_day_utc = date('now', '-1 day') AND reward_gold > 0) AS eligible_today,
        COALESCE((SELECT SUM(CAST(balance_atomics AS REAL) / 1000000000.0) FROM latest_today), 0) AS clashsol_today,
        COALESCE((SELECT AVG(CAST(balance_atomics AS REAL) / 1000000000.0) FROM latest_today WHERE CAST(balance_atomics AS INTEGER) > 0), 0) AS avg_positive_balance,
        COALESCE((SELECT SUM(reward_gold - claimed_gold) FROM sanctum_daily_rewards WHERE status = 'ready'), 0) AS pending_gold,
        COALESCE((SELECT SUM(gold_delta) FROM resource_delta_events WHERE source_type = 'sanctum_clashsol_daily'), 0) AS issued_lifetime,
        COALESCE((SELECT SUM(gold_delta) FROM resource_delta_events WHERE source_type = 'sanctum_clashsol_daily' AND created_at >= datetime('now', '-1 day')), 0) AS issued_24h,
        COALESCE((SELECT SUM(gold_delta) FROM resource_delta_events WHERE source_type = 'sanctum_clashsol_daily' AND created_at >= datetime('now', '-7 days')), 0) AS issued_7d,
        COALESCE((SELECT SUM(gold_delta) FROM resource_delta_events WHERE source_type = 'sanctum_clashsol_daily' AND created_at >= datetime('now', '-30 days')), 0) AS issued_30d,
        (SELECT COUNT(*) FROM resource_delta_events WHERE source_type = 'sanctum_clashsol_daily' AND created_at >= datetime('now', '-1 day')) AS claims_24h,
        (SELECT COUNT(*) FROM resource_delta_events WHERE source_type = 'sanctum_clashsol_daily' AND created_at >= datetime('now', '-7 days')) AS claims_7d,
        (SELECT COUNT(*) FROM resource_delta_events WHERE source_type = 'sanctum_clashsol_daily' AND created_at >= datetime('now', '-30 days')) AS claims_30d,
        (SELECT MAX(observed_at) FROM sanctum_balance_observations) AS last_snapshot_at,
        (SELECT COUNT(*) FROM sanctum_balance_observations WHERE observed_day_utc = date('now')) AS samples_today,
        (SELECT COUNT(*) FROM sanctum_snapshot_events WHERE result = 'failed' AND created_at >= datetime('now', '-1 day')) AS snapshot_failures_24h
    `).get();
    const swaps = db.prepare(`
      SELECT
        COUNT(DISTINCT player_id) AS swap_users,
        COUNT(CASE WHEN status IN ('consumed', 'confirmed') THEN 1 END) AS swaps_complete,
        COUNT(CASE WHEN status IN ('pending', 'executing', 'submission_unknown', 'submitted') THEN 1 END) AS swaps_pending,
        COUNT(CASE WHEN status = 'expired' THEN 1 END) AS swaps_expired
      FROM sanctum_order_intents
    `).get();
    const daily = db.prepare(`
      SELECT reward_day_utc,
             COUNT(CASE WHEN reward_gold > 0 THEN 1 END) AS eligible_holders,
             COALESCE(SUM(CAST(balance_atomics AS REAL) / 1000000000.0), 0) AS eligible_clashsol,
             COUNT(CASE WHEN claimed_gold > 0 THEN 1 END) AS claims,
             COALESCE(SUM(claimed_gold), 0) AS gold_issued
      FROM sanctum_daily_rewards
      GROUP BY reward_day_utc
      ORDER BY reward_day_utc DESC
      LIMIT 30
    `).all();
    const claims = db.prepare(`
      SELECT r.*, p.name AS player_name
      FROM sanctum_daily_rewards r
      LEFT JOIN players p ON p.id = r.player_id
      ORDER BY r.id DESC
      LIMIT ?
    `).all(safeLimit).map(rewardRow);
    const swapHistory = db.prepare(`
      SELECT s.id, s.player_id, p.name AS player_name, s.wallet, s.direction,
             s.input_amount, s.output_amount, s.status, s.tx_signature,
             s.last_error, s.last_error_code, s.last_error_stage,
             s.confirmation_status, s.confirmation_slot,
             s.submitted_at, s.confirmed_at, s.consumed_at, s.created_at
      FROM sanctum_order_intents s
      LEFT JOIN players p ON p.id = s.player_id
      ORDER BY s.created_at DESC
      LIMIT ?
    `).all(safeLimit);
    const configHistory = db.prepare(`
      SELECT id, enabled, gold_per_clashsol, effective_day_utc, changed_by, created_at
      FROM sanctum_reward_settings
      ORDER BY id DESC
      LIMIT 100
    `).all();
    return {
      mint,
      settings: settingsStatus(),
      summary: { ...summary, ...swaps },
      daily,
      claims,
      swaps: swapHistory,
      config_history: configHistory,
    };
  }

  function adminExport({ dataset, limit = 50_000 } = {}) {
    const safeLimit = Math.max(1, Math.min(100_000, Number(limit) || 50_000));
    const name = String(dataset || '').trim().toLowerCase();
    if (name === 'rewards') {
      return db.prepare(`
        SELECT r.*, p.name AS player_name
        FROM sanctum_daily_rewards r
        LEFT JOIN players p ON p.id = r.player_id
        ORDER BY r.id DESC LIMIT ?
      `).all(safeLimit);
    }
    if (name === 'swaps') {
      return db.prepare(`
        SELECT s.id, s.player_id, p.name AS player_name, s.wallet, s.direction,
               s.input_mint, s.output_mint, s.input_amount, s.output_amount,
               s.slippage_bps, s.status, s.tx_signature, s.last_error,
               s.last_error_code, s.last_error_stage, s.confirmation_status,
               s.confirmation_slot, s.expires_at_ms, s.submitted_at,
               s.confirmed_at, s.consumed_at, s.created_at
        FROM sanctum_order_intents s
        LEFT JOIN players p ON p.id = s.player_id
        ORDER BY s.created_at DESC LIMIT ?
      `).all(safeLimit);
    }
    if (name === 'observations') {
      return db.prepare(`
        SELECT o.*, p.name AS player_name
        FROM sanctum_balance_observations o
        LEFT JOIN players p ON p.id = o.player_id
        ORDER BY o.id DESC LIMIT ?
      `).all(safeLimit);
    }
    if (name === 'snapshot-events') {
      return db.prepare(`
        SELECT e.*, p.name AS player_name
        FROM sanctum_snapshot_events e
        LEFT JOIN players p ON p.id = e.player_id
        ORDER BY e.id DESC LIMIT ?
      `).all(safeLimit);
    }
    if (name === 'settings') {
      return db.prepare(`
        SELECT * FROM sanctum_reward_settings ORDER BY id DESC LIMIT ?
      `).all(safeLimit);
    }
    throw new SanctumRewardError('INVALID_EXPORT', 'Choose rewards, swaps, observations, snapshot-events, or settings', 400);
  }

  async function snapshotAllEligiblePlayers() {
    const finalized = finalizeCompletedRewards();
    const day = utcDay(now());
    const rows = db.prepare(`
      SELECT rw.player_id, rw.wallet
      FROM sanctum_reward_wallets rw
      JOIN players p ON p.id = rw.player_id
      WHERE 1 = 1
        AND COALESCE(p.is_bot, 0) = 0
        AND NOT EXISTS (
          SELECT 1 FROM sanctum_balance_observations o
          WHERE o.player_id = rw.player_id
            AND o.observed_day_utc = ?
            AND o.sample_bucket = ?
        )
      ORDER BY rw.player_id
    `).all(day, sampleBucket(now()));
    let cursor = 0;
    const result = { day, attempted: rows.length, created: 0, failed: 0, finalized };
    const workers = Array.from({ length: Math.min(SNAPSHOT_CONCURRENCY, rows.length) }, async () => {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        try {
          // eslint-disable-next-line no-await-in-loop
          const observation = await recordBalanceObservation({ playerId: row.player_id, wallet: row.wallet });
          db.prepare(`
            INSERT INTO sanctum_snapshot_events (
              player_id, wallet, observed_day_utc, sample_bucket, result, rpc_slot
            ) VALUES (?, ?, ?, ?, 'success', ?)
          `).run(row.player_id, row.wallet, observation.day, observation.bucket, observation.rpc_slot);
          result.created += 1;
        } catch (error) {
          result.failed += 1;
          db.prepare(`
            INSERT INTO sanctum_snapshot_events (
              player_id, wallet, observed_day_utc, sample_bucket, result, error
            ) VALUES (?, ?, ?, ?, 'failed', ?)
          `).run(
            row.player_id,
            row.wallet,
            day,
            sampleBucket(now()),
            String(error?.message || error).slice(0, 500),
          );
          console.warn('[sanctum-rewards] daily snapshot failed:', row.player_id, error?.message || error);
        }
      }
    });
    await Promise.all(workers);
    return result;
  }

  return {
    mint,
    effectiveSettings,
    settingsStatus,
    getWalletBalances,
    linkRewardWallet,
    recordBalanceObservation,
    finalizeCompletedRewards,
    getPlayerStatus,
    claim,
    history,
    updateSettings,
    adminMetrics,
    adminExport,
    snapshotAllEligiblePlayers,
    resolveLinkedWallet,
  };
}

module.exports = {
  CLASHSOL_DECIMALS,
  DEFAULT_GOLD_PER_CLASHSOL,
  MAX_GOLD_PER_CLASHSOL,
  SanctumRewardError,
  createSanctumRewardsService,
  nextUtcDayStart,
  previousUtcDay,
  rewardGoldForBalance,
  utcDay,
};
