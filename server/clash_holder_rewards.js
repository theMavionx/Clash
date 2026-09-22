"use strict";

const robinhoodShop = require('./robinhood_shop');

const TOKEN_DECIMALS = 18;
const USD_MICROS = 1_000_000n;
const PICO_PER_USD = 1_000_000_000_000n;
const WEI_PER_TOKEN = 10n ** BigInt(TOKEN_DECIMALS);
const USD_DIVISOR = WEI_PER_TOKEN * PICO_PER_USD / USD_MICROS;
const MAX_USD_MICROS = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAMPLES = 2;
const MIN_COVERAGE_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 3;
const TIERS = Object.freeze([
  { usd: 50, gold: 1000 },
  { usd: 100, gold: 5000 },
  { usd: 500, gold: 10000 },
]);

class ClashHolderRewardError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function utcDay(value = Date.now()) { return new Date(value).toISOString().slice(0, 10); }
function nextUtcDay(value = Date.now()) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}
function sampleBucket(value = Date.now()) {
  const d = new Date(value);
  return d.getUTCHours() * 2 + (d.getUTCMinutes() >= 30 ? 1 : 0);
}
function normalizeWallet(value) {
  const wallet = String(value || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    throw new ClashHolderRewardError('INVALID_WALLET', 'Connect a valid Robinhood EVM wallet');
  }
  return wallet;
}
function pricePico(value) {
  const text = String(value || '').trim();
  if (!/^(?:\d+)(?:\.\d+)?$/.test(text)) throw new Error('CLASH USD price unavailable');
  const [whole, fraction = ''] = text.split('.');
  const amount = BigInt(whole) * PICO_PER_USD + BigInt((fraction + '0'.repeat(12)).slice(0, 12));
  if (amount <= 0n || amount > 100n * PICO_PER_USD) throw new Error('CLASH USD price outside supported range');
  return amount;
}
function holdingUsdMicros(balanceWei, priceUsd) {
  const balance = BigInt(String(balanceWei));
  if (balance < 0n) throw new Error('Invalid CLASH balance');
  const value = balance * pricePico(priceUsd) / USD_DIVISOR;
  if (value > MAX_USD_MICROS) throw new Error('CLASH holding exceeds supported range');
  return Number(value);
}
function goldForUsdMicros(value) {
  const micros = BigInt(value);
  if (micros >= 500n * USD_MICROS) return 10000;
  if (micros >= 100n * USD_MICROS) return 5000;
  if (micros >= 50n * USD_MICROS) return 1000;
  return 0;
}

async function defaultReadBalance(wallet) {
  const { createPublicClient, http, parseAbi } = await import('viem');
  const client = createPublicClient({ transport: http(robinhoodShop.rpcUrl(), { retryCount: 1, timeout: 10_000 }) });
  if (await client.getChainId() !== 4663) throw new Error('Robinhood RPC chain mismatch');
  const block = await client.getBlockNumber();
  const balance = await client.readContract({
    address: robinhoodShop.TOKEN,
    abi: parseAbi(['function balanceOf(address owner) view returns (uint256)']),
    functionName: 'balanceOf', args: [wallet], blockNumber: block,
  });
  return { balanceWei: balance.toString(), blockNumber: Number(block) };
}

function createClashHolderRewardsService({
  db, getResourceCaps, readBalance = defaultReadBalance, readPrice = robinhoodShop.price,
  now = () => Date.now(),
} = {}) {
  if (!db?.prepare || typeof getResourceCaps !== 'function') {
    throw new TypeError('CLASH holder rewards require SQLite and resource caps');
  }
  function resolveLinkedWallet(playerId, requestedWallet = '') {
    const linked = db.prepare('SELECT wallet FROM clash_holder_wallets WHERE player_id = ?').get(playerId)?.wallet || null;
    if (!requestedWallet) return linked;
    return linked === normalizeWallet(requestedWallet) ? linked : null;
  }
  function linkWallet({ playerId, wallet }) {
    const normalized = normalizeWallet(wallet);
    const owner = db.prepare('SELECT player_id FROM clash_holder_wallets WHERE wallet = ?').get(normalized);
    if (owner && owner.player_id !== playerId) {
      throw new ClashHolderRewardError('WALLET_ALREADY_LINKED', 'This wallet already earns CLASH holder rewards for another player', 409);
    }
    const previous = resolveLinkedWallet(playerId);
    if (previous && previous !== normalized) {
      const sampled = db.prepare(`SELECT 1 FROM clash_holder_observations
        WHERE player_id = ? AND observed_day_utc = ? LIMIT 1`).get(playerId, utcDay(now()));
      if (sampled) throw new ClashHolderRewardError('WALLET_SWITCH_LOCKED', 'Today’s wallet has already been sampled. Switch after 00:00 UTC.', 409);
    }
    db.prepare(`INSERT INTO clash_holder_wallets (player_id, wallet) VALUES (?, ?)
      ON CONFLICT(player_id) DO UPDATE SET wallet = excluded.wallet,
      verified_at = datetime('now'), updated_at = datetime('now')`).run(playerId, normalized);
    return normalized;
  }

  async function recordObservation({ playerId, wallet, observedAt } = {}) {
    const linked = resolveLinkedWallet(playerId, wallet);
    if (!linked) throw new ClashHolderRewardError('WALLET_NOT_LINKED', 'Link your Robinhood CLASH wallet first', 409);
    const [balance, usdPrice] = await Promise.all([readBalance(linked), readPrice()]);
    if (resolveLinkedWallet(playerId) !== linked) throw new ClashHolderRewardError('WALLET_CHANGED', 'Wallet changed during balance read', 409);
    const wei = BigInt(String(balance.balanceWei));
    const block = Number(balance.blockNumber);
    if (wei < 0n || !Number.isSafeInteger(block) || block <= 0) throw new Error('Invalid Robinhood balance proof');
    const micros = holdingUsdMicros(wei, usdPrice);
    // Attribute a slow RPC read to the UTC bucket in which it completed, never
    // to the preceding day if the request happened to cross midnight.
    const capturedAt = observedAt ?? now();
    const day = utcDay(capturedAt), bucket = sampleBucket(capturedAt);
    const stored = db.prepare(`INSERT INTO clash_holder_observations
      (player_id, wallet, observed_day_utc, sample_bucket, balance_wei, price_pico, usd_micros, block_number, observed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'))
      ON CONFLICT(wallet, observed_day_utc, sample_bucket) DO UPDATE SET
        balance_wei = excluded.balance_wei, price_pico = excluded.price_pico,
        usd_micros = excluded.usd_micros, block_number = excluded.block_number,
        observed_at = excluded.observed_at
      WHERE excluded.usd_micros < clash_holder_observations.usd_micros`)
      .run(playerId, linked, day, bucket, wei.toString(), pricePico(usdPrice).toString(), micros, block, Math.floor(capturedAt / 1000));
    return { wallet: linked, day, bucket, usd_micros: micros, balance_wei: wei.toString(), block_number: block,
      stored: stored.changes > 0 };
  }

  function finalizeCompletedDays() {
    const day = utcDay(now());
    const groups = db.prepare(`SELECT o.player_id, o.wallet, o.observed_day_utc,
      COUNT(*) AS sample_count, MIN(o.usd_micros) AS minimum_usd_micros,
      MIN(o.observed_at) AS first_at, MAX(o.observed_at) AS last_at
      FROM clash_holder_observations o
      WHERE o.observed_day_utc < ? AND NOT EXISTS
        (SELECT 1 FROM clash_holder_daily_rewards r
         WHERE r.player_id = o.player_id AND r.reward_day_utc = o.observed_day_utc)
      GROUP BY o.player_id, o.wallet, o.observed_day_utc
      ORDER BY o.observed_day_utc, o.player_id`).all(day);
    const insert = db.prepare(`INSERT OR IGNORE INTO clash_holder_daily_rewards
      (player_id, wallet, reward_day_utc, minimum_usd_micros, sample_count, reward_gold, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    let created = 0;
    for (const row of groups) {
      const first = Date.parse(`${row.first_at}Z`), last = Date.parse(`${row.last_at}Z`);
      const covered = row.sample_count >= MIN_SAMPLES && Number.isFinite(first) && Number.isFinite(last)
        && last - first >= MIN_COVERAGE_MS;
      const gold = covered ? goldForUsdMicros(row.minimum_usd_micros) : 0;
      created += insert.run(row.player_id, row.wallet, row.observed_day_utc,
        row.minimum_usd_micros, row.sample_count, gold, !covered ? 'insufficient' : gold ? 'ready' : 'zero').changes;
    }
    return { created, attempted: groups.length };
  }

  function status({ playerId }) {
    finalizeCompletedDays();
    const wallet = resolveLinkedWallet(playerId);
    const pending = db.prepare(`SELECT COALESCE(SUM(reward_gold - claimed_gold), 0) AS gold,
      COUNT(*) AS days FROM clash_holder_daily_rewards
      WHERE player_id = ? AND status = 'ready'`).get(playerId);
    const resources = db.prepare('SELECT gold FROM players WHERE id = ?').get(playerId);
    const cap = Number(getResourceCaps(playerId)?.gold || 0);
    const observation = wallet ? db.prepare(`SELECT MIN(usd_micros) AS minimum_usd_micros,
      COUNT(*) AS sample_count, MAX(observed_at) AS last_observed_at
      FROM clash_holder_observations WHERE player_id = ? AND wallet = ? AND observed_day_utc = ?`)
      .get(playerId, wallet, utcDay(now())) : null;
    const recent = db.prepare(`SELECT reward_day_utc, minimum_usd_micros, reward_gold, claimed_gold, status
      FROM clash_holder_daily_rewards WHERE player_id = ? ORDER BY reward_day_utc DESC LIMIT 7`).all(playerId);
    const pendingGold = Number(pending.gold || 0);
    return {
      linked: !!wallet, wallet, tiers: TIERS, token: robinhoodShop.TOKEN,
      today: observation?.sample_count ? {
        minimum_usd: Number(observation.minimum_usd_micros) / 1e6,
        projected_gold: goldForUsdMicros(observation.minimum_usd_micros),
        sample_count: observation.sample_count,
        last_observed_at: observation.last_observed_at,
      } : null,
      pending_gold: pendingGold,
      pending_days: Number(pending.days || 0),
      claimable_now: Math.max(0, Math.min(pendingGold, cap - Number(resources?.gold || 0))),
      gold_capacity_remaining: Math.max(0, cap - Number(resources?.gold || 0)),
      next_reset_at: nextUtcDay(now()),
      recent,
    };
  }

  const claimTransaction = db.transaction((playerId, cap) => {
    const rows = db.prepare(`SELECT id, reward_gold, claimed_gold FROM clash_holder_daily_rewards
      WHERE player_id = ? AND status = 'ready' AND reward_gold > claimed_gold
      ORDER BY reward_day_utc, id`).all(playerId);
    if (!rows.length) throw new ClashHolderRewardError('NOTHING_TO_CLAIM', 'No completed UTC-day CLASH reward is ready', 409);
    const resources = db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(playerId);
    if (!resources) throw new ClashHolderRewardError('PLAYER_NOT_FOUND', 'Player not found', 404);
    let room = Math.max(0, cap - Number(resources.gold || 0));
    if (room <= 0) throw new ClashHolderRewardError('GOLD_STORAGE_FULL', 'Gold storage is full. Your reward remains banked.', 409);
    const allocations = [];
    for (const row of rows) {
      const amount = Math.min(room, row.reward_gold - row.claimed_gold);
      if (amount > 0) allocations.push({ id: row.id, amount });
      room -= amount;
      if (room <= 0) break;
    }
    const total = allocations.reduce((sum, row) => sum + row.amount, 0);
    if (!total) throw new ClashHolderRewardError('GOLD_STORAGE_FULL', 'Gold storage is full. Your reward remains banked.', 409);
    const update = db.prepare(`UPDATE clash_holder_daily_rewards SET claimed_gold = claimed_gold + ?,
      status = CASE WHEN claimed_gold + ? >= reward_gold THEN 'claimed' ELSE 'ready' END,
      claimed_at = CASE WHEN claimed_gold + ? >= reward_gold THEN datetime('now') ELSE claimed_at END,
      updated_at = datetime('now') WHERE id = ? AND player_id = ? AND status = 'ready'`);
    for (const item of allocations) {
      if (update.run(item.amount, item.amount, item.amount, item.id, playerId).changes !== 1) {
        throw new ClashHolderRewardError('CLAIM_STATE_CHANGED', 'Reward changed. Refresh and retry.', 409);
      }
    }
    db.prepare('UPDATE players SET gold = gold + ? WHERE id = ?').run(total, playerId);
    const after = Number(resources.gold || 0) + total;
    db.prepare(`INSERT INTO resource_delta_events
      (player_id, source_type, gold_delta, wood_delta, ore_delta,
       gold_before, wood_before, ore_before, gold_after, wood_after, ore_after,
       gold_cap_before, wood_cap_before, ore_cap_before,
       gold_cap_after, wood_cap_after, ore_cap_after,
       lost_gold_to_cap, lost_wood_to_cap, lost_ore_to_cap, metadata_json)
      VALUES (?, 'robinhood_clash_holder_daily', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, 0, 0, 0, ?)`)
      .run(playerId, total, resources.gold, resources.wood, resources.ore,
        after, resources.wood, resources.ore, cap, cap, JSON.stringify({ allocations, token: robinhoodShop.TOKEN }));
    return { claimed_gold: total, resources: { ...resources, gold: after } };
  });
  function claim({ playerId }) {
    finalizeCompletedDays();
    return claimTransaction(playerId, Math.max(0, Number(getResourceCaps(playerId)?.gold || 0)));
  }

  async function snapshotAllEligiblePlayers() {
    const finalized = finalizeCompletedDays();
    const day = utcDay(now()), bucket = sampleBucket(now());
    // Always re-read even if the wallet manually refreshed this half-hour:
    // user-triggered high-price checks must not suppress independent samples.
    const rows = db.prepare(`SELECT w.player_id, w.wallet FROM clash_holder_wallets w
      JOIN players p ON p.id = w.player_id WHERE COALESCE(p.is_bot, 0) = 0
      ORDER BY w.player_id`).all();
    let cursor = 0;
    const result = { day, attempted: rows.length, created: 0, failed: 0, finalized };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        try {
          // eslint-disable-next-line no-await-in-loop
          const observation = await recordObservation({ playerId: row.player_id, wallet: row.wallet });
          db.prepare(`INSERT INTO clash_holder_snapshot_events
            (player_id, wallet, observed_day_utc, sample_bucket, result, block_number)
            VALUES (?, ?, ?, ?, 'success', ?)`)
            .run(row.player_id, row.wallet, observation.day, observation.bucket, observation.block_number);
          if (observation.stored) result.created++;
        } catch (error) {
          db.prepare(`INSERT INTO clash_holder_snapshot_events
            (player_id, wallet, observed_day_utc, sample_bucket, result, error)
            VALUES (?, ?, ?, ?, 'failed', ?)`)
            .run(row.player_id, row.wallet, day, bucket, String(error?.code || error?.name || 'READ_FAILED').slice(0, 80));
          result.failed++;
          console.warn('[clash-holder] snapshot failed', { playerId: row.player_id,
            code: String(error?.code || error?.name || 'READ_FAILED').slice(0, 80) });
        }
      }
    }));
    return result;
  }
  return { linkWallet, resolveLinkedWallet, recordObservation, finalizeCompletedDays,
    status, claim, snapshotAllEligiblePlayers };
}

module.exports = { ClashHolderRewardError, createClashHolderRewardsService,
  holdingUsdMicros, goldForUsdMicros, utcDay, nextUtcDay, TIERS };
