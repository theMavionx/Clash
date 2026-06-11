#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(process.env.CLASH_ROOT || path.join(__dirname, '..'));
const SERVER_ROOT = path.join(ROOT, 'server');
const COLLECTION = 'dragon';
const BRIDGE_COLLECTION = 'dragon';
const LABELS = { common: 'Common', epic: 'Epic', legendary: 'Legendary' };
const EVM_CHAINS = ['base', 'arbitrum', 'monad', 'ink'];
const ALL_CHAINS = [...EVM_CHAINS, 'aptos', 'solana'];
const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DB_ONLY = args.includes('--db-only');
const SEED = String(process.env.NFT_DRAGON_RARITY_REVEAL_SEED || process.env.NFT_RARITY_REVEAL_SEED || '').trim()
  || args.find((arg) => arg.startsWith('--seed='))?.slice('--seed='.length)
  || 'clash-dragon-rarity-v1';

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim().replace(/^export\s+/, '');
      if (!key || process.env[key] != null) continue;
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {}
}

for (const envPath of [
  path.join(ROOT, '.env'),
  path.join(SERVER_ROOT, '.env'),
  path.join(ROOT, 'nft', '.env'),
  '/opt/clash/.env',
  '/opt/clash/shared/.env',
  '/opt/clash/shared/server/.env',
]) {
  loadEnvFile(envPath);
}

const gameDb = require(path.join(SERVER_ROOT, 'db'));
const { deploymentOf, normalizeAptosAddress } = require(path.join(SERVER_ROOT, 'bridge_helpers'));
const { solanaRpcUrls, withSolanaRpcFallback } = require(path.join(SERVER_ROOT, 'solana_rpc'));

function packageRequire(name) {
  const roots = [
    path.join(ROOT, 'web', 'package.json'),
    path.join(ROOT, 'server-futures', 'package.json'),
    path.join(ROOT, 'server', 'package.json'),
    path.join(ROOT, 'package.json'),
  ];
  let lastErr = null;
  for (const root of roots) {
    try { return createRequire(root)(name); } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

async function importPackage(name) {
  try { return await import(name); } catch (err) {
    if (!/Cannot find package|ERR_MODULE_NOT_FOUND|Cannot find module/i.test(String(err?.message || err))) throw err;
    return packageRequire(name);
  }
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function scoreFor(row) {
  return sha256(`${SEED}|${row.chain}|${row.token_id}`);
}

function normalizeCandidate(row) {
  const chain = String(row.chain || '').toLowerCase().trim();
  const tokenId = String(row.token_id || row.tokenId || row.asset || row.mint || row.tokenAddress || '').trim();
  if (!chain || !tokenId) return null;
  return {
    chain,
    token_id: tokenId,
    owner_wallet: row.owner_wallet || row.wallet || row.owner || null,
    source: row.source || 'unknown',
  };
}

function compareCandidate(a, b) {
  return `${a.chain}:${a.token_id}`.localeCompare(`${b.chain}:${b.token_id}`, undefined, { numeric: true });
}

function readDbCandidateRows() {
  const rows = [];
  rows.push(...gameDb.db.prepare(`
    SELECT chain, token_id, MAX(wallet) AS owner_wallet, 'player_nfts' AS source
      FROM player_nfts
     WHERE collection = 'dragon'
       AND token_id IS NOT NULL
       AND token_id != ''
     GROUP BY chain, token_id
  `).all());

  const hasOrders = gameDb.db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'custodial_marketplace_orders'
  `).get();
  if (hasOrders) {
    rows.push(...gameDb.db.prepare(`
      SELECT asset_chain AS chain, asset_id AS token_id,
             MAX(seller_wallet) AS owner_wallet,
             'custodial_marketplace_orders' AS source
        FROM custodial_marketplace_orders
       WHERE lower(COALESCE(asset_collection, '')) IN ('dragon', 'fire_dragon')
         AND asset_id IS NOT NULL
         AND asset_id != ''
       GROUP BY asset_chain, asset_id
    `).all());
  }

  const byKey = new Map();
  for (const raw of rows) {
    const row = normalizeCandidate(raw);
    if (!row) continue;
    const key = `${row.chain}:${row.token_id}`;
    const prev = byKey.get(key);
    byKey.set(key, {
      ...prev,
      ...row,
      owner_wallet: row.owner_wallet || prev?.owner_wallet || null,
      source: prev?.source && prev.source !== row.source ? `${prev.source}+${row.source}` : row.source,
    });
  }
  return [...byKey.values()].sort(compareCandidate);
}

function readExisting() {
  const rows = gameDb.db.prepare(`
    SELECT chain, token_id, rarity
      FROM nft_rarities
     WHERE collection = 'dragon'
  `).all();
  const byKey = new Map();
  for (const row of rows) {
    const rarity = gameDb.normalizeNftRarity(row.rarity);
    if (rarity) byKey.set(`${row.chain}:${row.token_id}`, rarity);
  }
  return byKey;
}

function evmRpcUrls(chainKey, deployment = {}) {
  const upper = chainKey.toUpperCase();
  const defaults = {
    base: ['https://mainnet.base.org', 'https://base.llamarpc.com', 'https://base-rpc.publicnode.com'],
    arbitrum: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com', 'https://arbitrum-one.publicnode.com'],
    monad: ['https://rpc.monad.xyz'],
    ink: ['https://rpc-gel.inkonchain.com', 'https://rpc-qnd.inkonchain.com', 'https://ink.drpc.org'],
  }[chainKey] || [];
  return [
    process.env[`NFT_DRAGON_${upper}_RPC_URL`],
    process.env[`NFT_${upper}_RPC_URL`],
    process.env[`${upper}_RPC_URL`],
    deployment.rpcUrl,
    ...defaults,
  ].filter(Boolean);
}

const ERC721_SCAN_ABI = [
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
];

async function readEvmCandidates(chainKey) {
  const deployment = deploymentOf(chainKey, BRIDGE_COLLECTION) || {};
  const contract = deployment.proxy || deployment.contract;
  if (!contract) return [];
  const { createPublicClient, getAddress, http } = await importPackage('viem');
  let lastErr = null;
  for (const rpc of evmRpcUrls(chainKey, deployment)) {
    try {
      const client = createPublicClient({ transport: http(rpc) });
      const total = Number(await client.readContract({
        address: getAddress(contract),
        abi: ERC721_SCAN_ABI,
        functionName: 'totalMinted',
      }));
      const rows = [];
      for (let id = 1; id <= total; id += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const owner = await client.readContract({
            address: getAddress(contract),
            abi: ERC721_SCAN_ABI,
            functionName: 'ownerOf',
            args: [BigInt(id)],
          });
          if (String(owner).toLowerCase() === ZERO_EVM_ADDRESS) continue;
          rows.push({ chain: chainKey, token_id: String(id), owner_wallet: String(owner), source: 'evm-ownerOf' });
        } catch {}
      }
      return rows;
    } catch (err) {
      lastErr = err;
    }
  }
  console.warn(JSON.stringify({ warn: 'evm_scan_failed', chain: chainKey, error: String(lastErr?.message || lastErr) }));
  return [];
}

function tokenEditionFromName(name) {
  const match = String(name || '').match(/#\s*(\d+)\s*$/);
  return match ? String(Number(match[1])) : '';
}

async function readAptosCandidates() {
  const deployment = deploymentOf('aptos', BRIDGE_COLLECTION) || {};
  const collection = process.env.NFT_DRAGON_APTOS_COLLECTION || deployment.collection;
  if (!collection) return [];
  const indexerUrl = process.env.APTOS_INDEXER_URL || 'https://indexer.mainnet.aptoslabs.com/v1/graphql';
  const headers = { 'content-type': 'application/json' };
  if (process.env.APTOS_NODE_API_KEY) headers.Authorization = `Bearer ${process.env.APTOS_NODE_API_KEY}`;
  const query = `query Q($collection:String!, $limit:Int!, $offset:Int!) {
    current_token_datas_v2(
      where: {current_collection:{collection_id:{_eq:$collection}}},
      limit: $limit,
      offset: $offset,
      order_by: {token_name: asc}
    ) {
      token_data_id
      token_name
    }
  }`;
  const rows = [];
  const limit = 100;
  for (let offset = 0; offset < 10000; offset += limit) {
    const response = await fetch(indexerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: { collection, limit, offset } }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.errors?.length) {
      throw new Error(json?.errors?.[0]?.message || `Aptos indexer ${response.status}`);
    }
    const pageRows = json?.data?.current_token_datas_v2 || [];
    for (const row of pageRows) {
      const tokenDataId = normalizeAptosAddress(row.token_data_id) || String(row.token_data_id || '').trim();
      const edition = tokenEditionFromName(row.token_name);
      if (tokenDataId) rows.push({ chain: 'aptos', token_id: tokenDataId, source: 'aptos-indexer' });
      if (edition) rows.push({ chain: 'aptos', token_id: edition, source: 'aptos-indexer-edition' });
    }
    if (pageRows.length < limit) break;
  }
  return rows;
}

async function rpcCall(rpc, method, params) {
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${Date.now()}-${Math.random()}`, method, params }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.error) throw new Error(`${method} failed: ${response.status} ${JSON.stringify(json?.error || json).slice(0, 300)}`);
  return json?.result;
}

async function readSolanaCandidates() {
  const deployment = deploymentOf('solana', BRIDGE_COLLECTION) || {};
  const collection = process.env.NFT_DRAGON_SOLANA_COLLECTION || deployment.collection;
  if (!collection) return [];
  return withSolanaRpcFallback(async (rpc) => {
    const out = [];
    const limit = 1000;
    for (let page = 1; page < 100; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await rpcCall(rpc, 'getAssetsByGroup', {
        groupKey: 'collection',
        groupValue: collection,
        page,
        limit,
      });
      const items = Array.isArray(result?.items) ? result.items : [];
      for (const item of items) {
        const owner = String(item?.ownership?.owner || item?.ownership?.delegate || item?.owner || '').trim();
        out.push({ chain: 'solana', token_id: String(item.id), owner_wallet: owner || null, source: 'solana-das' });
      }
      if (items.length < limit || out.length >= Number(result?.total || 0)) break;
    }
    return out;
  }, {
    urls: solanaRpcUrls([deployment.rpcUrl]),
    label: 'Dragon Solana DAS scan',
  }).catch((err) => {
    console.warn(JSON.stringify({ warn: 'solana_scan_failed', error: String(err?.message || err) }));
    return [];
  });
}

function assignMissingRarities(missing, existing) {
  const counts = { common: 0, epic: 0, legendary: 0 };
  for (const rarity of existing.values()) {
    if (counts[rarity] != null) counts[rarity] += 1;
  }
  const sorted = [...missing].sort((a, b) => scoreFor(a).localeCompare(scoreFor(b)));
  const finalTotal = existing.size + sorted.length;
  let needLegendary = Math.max(0, Math.round(finalTotal * 0.10) - counts.legendary);
  let needEpic = Math.max(0, Math.round(finalTotal * 0.30) - counts.epic);
  return sorted.map((row) => {
    let rarity = 'common';
    if (needLegendary > 0) {
      rarity = 'legendary';
      needLegendary -= 1;
    } else if (needEpic > 0) {
      rarity = 'epic';
      needEpic -= 1;
    }
    return { ...row, rarity, score: scoreFor(row) };
  });
}

async function collectCandidates() {
  const byKey = new Map();
  for (const row of readDbCandidateRows()) {
    byKey.set(`${row.chain}:${row.token_id}`, row);
  }
  if (!DB_ONLY) {
    const chainRows = [];
    for (const chain of EVM_CHAINS) {
      // eslint-disable-next-line no-await-in-loop
      chainRows.push(...await readEvmCandidates(chain));
    }
    chainRows.push(...await readAptosCandidates());
    chainRows.push(...await readSolanaCandidates());
    for (const raw of chainRows) {
      const row = normalizeCandidate(raw);
      if (!row) continue;
      const key = `${row.chain}:${row.token_id}`;
      const prev = byKey.get(key);
      byKey.set(key, {
        ...prev,
        ...row,
        owner_wallet: row.owner_wallet || prev?.owner_wallet || null,
        source: prev?.source && prev.source !== row.source ? `${prev.source}+${row.source}` : row.source,
      });
    }
  }
  return [...byKey.values()]
    .filter((row) => ALL_CHAINS.includes(row.chain))
    .sort(compareCandidate);
}

async function main() {
  const candidates = await collectCandidates();
  const existing = readExisting();
  const missing = candidates.filter((row) => !existing.has(`${row.chain}:${row.token_id}`));
  const assigned = assignMissingRarities(missing, existing);
  if (APPLY) {
    for (const row of assigned) {
      gameDb.upsertNftRarity({
        collection: COLLECTION,
        chain: row.chain,
        tokenId: row.token_id,
        rarity: row.rarity,
        legacyLevel: 1,
        ownerWallet: row.owner_wallet || null,
        source: row.source || 'dragon-reveal',
        revealSeed: SEED,
        snapshotHash: row.score,
        metadata: { score: row.score, source: row.source || null },
      });
    }
  }
  const finalRows = [...existing.values(), ...assigned.map((row) => row.rarity)];
  const counts = { common: 0, epic: 0, legendary: 0 };
  for (const rarity of finalRows) {
    if (counts[rarity] != null) counts[rarity] += 1;
  }
  console.log(JSON.stringify({
    ok: true,
    applied: APPLY,
    collection: COLLECTION,
    seed: SEED,
    candidates: candidates.length,
    existing: existing.size,
    missing: missing.length,
    assigned: assigned.length,
    counts,
    sample: assigned.slice(0, 20).map((row) => ({
      chain: row.chain,
      tokenId: row.token_id,
      rarity: LABELS[row.rarity],
      source: row.source,
      owner: row.owner_wallet || null,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.stack || err?.message || String(err) }, null, 2));
  process.exitCode = 1;
});
