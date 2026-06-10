#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const path = require('path');

const gameDb = require(path.resolve(__dirname, '..', 'server', 'db'));

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const RESET = args.has('--reset');
const SEED = String(process.env.DEMON_KING_RARITY_REVEAL_SEED || '').trim()
  || process.argv.find((arg) => arg.startsWith('--seed='))?.slice('--seed='.length)
  || 'clash-demon-king-rarity-v1';

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function scoreFor(row) {
  return sha256(`${SEED}|${row.chain}|${row.token_id}`);
}

function normalizeLevel(value) {
  const n = Number(value);
  return [1, 2, 3].includes(n) ? n : 1;
}

function pctCount(total, pct) {
  return Math.round(total * pct);
}

function readCandidates() {
  const rows = gameDb.db.prepare(`
    SELECT collection, chain, token_id,
           MAX(COALESCE(level, 1)) AS legacy_level,
           MAX(wallet) AS owner_wallet,
           MAX(player_id) AS player_id
      FROM player_nfts
     WHERE collection = 'demon_king'
       AND active = 1
       AND token_id IS NOT NULL
       AND token_id != ''
     GROUP BY collection, chain, token_id
     ORDER BY chain ASC, token_id ASC
  `).all();
  return rows.map((row) => ({
    chain: String(row.chain || '').toLowerCase(),
    token_id: String(row.token_id || ''),
    legacy_level: normalizeLevel(row.legacy_level),
    owner_wallet: row.owner_wallet || null,
    player_id: row.player_id || null,
  })).filter((row) => row.chain && row.token_id);
}

function readExisting() {
  const rows = gameDb.db.prepare(`
    SELECT chain, token_id, rarity
      FROM nft_rarities
     WHERE collection = 'demon_king'
  `).all();
  const byKey = new Map();
  for (const row of rows) {
    const rarity = gameDb.normalizeNftRarity(row.rarity);
    if (rarity) byKey.set(`${row.chain}:${row.token_id}`, rarity);
  }
  return byKey;
}

function assignRarities(candidates, existing) {
  const snapshotHash = sha256(JSON.stringify(candidates.map((row) => ({
    chain: row.chain,
    token_id: row.token_id,
    legacy_level: row.legacy_level,
  }))));
  const total = candidates.length;
  const target = {
    legendary: Math.max(0, pctCount(total, 0.10)),
    epic: Math.max(0, pctCount(total, 0.30)),
  };
  const counts = { common: 0, epic: 0, legendary: 0, existing: existing.size, forcedLegendary: 0 };
  const assignments = new Map();

  for (const row of candidates) {
    const key = `${row.chain}:${row.token_id}`;
    const current = !RESET ? existing.get(key) : null;
    if (current) {
      assignments.set(key, { ...row, rarity: current, source: 'existing' });
      counts[current] += 1;
      continue;
    }
    if (row.legacy_level > 1) {
      assignments.set(key, { ...row, rarity: 'legendary', source: 'legacy-upgrade' });
      counts.legendary += 1;
      counts.forcedLegendary += 1;
    }
  }

  const remaining = candidates
    .filter((row) => !assignments.has(`${row.chain}:${row.token_id}`))
    .map((row) => ({ ...row, score: scoreFor(row) }))
    .sort((a, b) => a.score.localeCompare(b.score));

  const legendarySlots = Math.max(0, target.legendary - counts.legendary);
  const epicSlots = Math.max(0, target.epic - counts.epic);
  remaining.forEach((row, idx) => {
    const rarity = idx < legendarySlots
      ? 'legendary'
      : idx < legendarySlots + epicSlots
        ? 'epic'
        : 'common';
    assignments.set(`${row.chain}:${row.token_id}`, { ...row, rarity, source: 'reveal-random' });
    counts[rarity] += 1;
  });

  return {
    snapshotHash,
    target,
    counts,
    rows: [...assignments.values()].sort((a, b) => (
      a.chain.localeCompare(b.chain) || a.token_id.localeCompare(b.token_id, undefined, { numeric: true })
    )),
  };
}

function applyAssignments(plan) {
  const tx = gameDb.db.transaction(() => {
    for (const [rank, row] of plan.rows.entries()) {
      gameDb.upsertNftRarity({
        collection: 'demon_king',
        chain: row.chain,
        tokenId: row.token_id,
        rarity: row.rarity,
        legacyLevel: row.legacy_level,
        ownerWallet: row.owner_wallet,
        playerId: row.player_id,
        source: row.source,
        revealSeed: SEED,
        snapshotHash: plan.snapshotHash,
        metadata: {
          rank: rank + 1,
          total: plan.rows.length,
          score: row.score || null,
        },
      });
    }
  });
  tx();
}

function main() {
  const candidates = readCandidates();
  const existing = readExisting();
  const plan = assignRarities(candidates, existing);
  if (APPLY) applyAssignments(plan);
  const byChain = {};
  for (const row of plan.rows) {
    byChain[row.chain] ||= { total: 0, common: 0, epic: 0, legendary: 0 };
    byChain[row.chain].total += 1;
    byChain[row.chain][row.rarity] += 1;
  }
  console.log(JSON.stringify({
    ok: true,
    applied: APPLY,
    reset: RESET,
    seedHash: sha256(SEED),
    snapshotHash: plan.snapshotHash,
    total: plan.rows.length,
    target: plan.target,
    counts: plan.counts,
    byChain,
    sample: plan.rows.slice(0, 12).map((row) => ({
      chain: row.chain,
      token_id: row.token_id,
      legacy_level: row.legacy_level,
      rarity: row.rarity,
      source: row.source,
    })),
  }, null, 2));
}

main();
