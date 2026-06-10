#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] != null) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {}
}

for (const envPath of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', 'server', '.env'),
  '/opt/clash/.env',
  '/opt/clash/shared/.env',
  '/opt/clash/shared/server/.env',
]) {
  loadEnvFile(envPath);
}

const gameDb = require(path.resolve(__dirname, '..', 'server', 'db'));
const { deploymentOf, normalizeAptosAddress } = require(path.resolve(__dirname, '..', 'server', 'bridge_helpers'));
const { solanaRpcUrls } = require(path.resolve(__dirname, '..', 'server', 'solana_rpc'));

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const RESET = args.has('--reset');
const DB_ONLY = args.has('--db-only');
const KEEP_STALE = args.has('--keep-stale');
const INCLUDE_APTOS_EXCLUDED = args.has('--include-aptos-excluded') || args.has('--include-aptos-reserve');
const SEED = String(process.env.DEMON_KING_RARITY_REVEAL_SEED || '').trim()
  || process.argv.find((arg) => arg.startsWith('--seed='))?.slice('--seed='.length)
  || 'clash-demon-king-rarity-v1';

const COLLECTION = 'demon_king';
const EVM_CHAINS = ['base', 'arbitrum', 'monad', 'ink'];
const ALL_CHAINS = [...EVM_CHAINS, 'aptos', 'solana'];
const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000';

const ERC721_SCAN_ABI = [
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'currentSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'tokenLevel', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];

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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function warn(message, meta = {}) {
  console.warn(JSON.stringify({ warn: message, ...meta }));
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function readJsonIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
  } catch {
    return null;
  }
}

function normalizeCandidate(row) {
  const chain = String(row.chain || '').toLowerCase().trim();
  const tokenId = String(row.token_id || row.tokenId || row.asset || row.mint || '').trim();
  if (!chain || !tokenId) return null;
  return {
    chain,
    token_id: tokenId,
    legacy_level: normalizeLevel(row.legacy_level ?? row.level),
    owner_wallet: row.owner_wallet || row.wallet || row.owner || null,
    player_id: row.player_id || row.playerId || null,
    source: row.source || 'unknown',
  };
}

function readDbCandidateRows() {
  const rows = [];
  rows.push(...gameDb.db.prepare(`
    SELECT chain, token_id,
           MAX(COALESCE(level, 1)) AS legacy_level,
           MAX(wallet) AS owner_wallet,
           MAX(player_id) AS player_id,
           'player_nfts' AS source
      FROM player_nfts
     WHERE collection = 'demon_king'
       AND token_id IS NOT NULL
       AND token_id != ''
     GROUP BY chain, token_id
  `).all());

  const orderTables = gameDb.db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'custodial_marketplace_orders'
  `).get();
  if (orderTables) {
    rows.push(...gameDb.db.prepare(`
      SELECT asset_chain AS chain,
             asset_id AS token_id,
             MAX(COALESCE(level, 1)) AS legacy_level,
             MAX(seller_wallet) AS owner_wallet,
             NULL AS player_id,
             'custodial_marketplace_orders' AS source
        FROM custodial_marketplace_orders
       WHERE lower(COALESCE(asset_collection, '')) IN (
          'demon_king',
          'demonking',
          '0x1a0009da9be37571dc640647220c88bb2158a711289d6603178a8cc169392f92',
          '0x404807f93e47af3eaaec0e983f18dcb35e966fec',
          'fangunf3rqjrwzaueagvwj63oaguh5j3mc8wputhas4m'
       )
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
      legacy_level: Math.max(prev?.legacy_level || 1, row.legacy_level || 1),
      owner_wallet: row.owner_wallet || prev?.owner_wallet || null,
      player_id: row.player_id || prev?.player_id || null,
      source: prev?.source && prev.source !== row.source ? `${prev.source}+${row.source}` : row.source,
    });
  }
  return [...byKey.values()].sort(compareCandidate);
}

function readDbCandidateMap() {
  const map = new Map();
  for (const row of readDbCandidateRows()) {
    map.set(`${row.chain}:${row.token_id}`, row);
  }
  return map;
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

function evmRpcUrls(chainKey, deployment = {}) {
  const upper = chainKey.toUpperCase();
  const defaults = {
    base: ['https://mainnet.base.org', 'https://base.llamarpc.com', 'https://base-rpc.publicnode.com'],
    arbitrum: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com', 'https://arbitrum-one.publicnode.com'],
    monad: ['https://rpc.monad.xyz'],
    ink: ['https://rpc-gel.inkonchain.com', 'https://rpc-qnd.inkonchain.com', 'https://ink.drpc.org'],
  }[chainKey] || [];
  return unique([
    process.env[`NFT_${upper}_RPC_URL`],
    process.env[`${upper}_RPC_URL`],
    deployment.rpcUrl,
    ...defaults,
  ]);
}

function evmChainSpec(chainKey, defineChain, viemChains) {
  if (chainKey === 'base') return viemChains.base;
  if (chainKey === 'arbitrum') return viemChains.arbitrum;
  if (chainKey === 'monad') {
    return defineChain({
      id: 143,
      name: 'Monad',
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
    });
  }
  if (chainKey === 'ink') {
    return defineChain({
      id: 57073,
      name: 'Ink',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc-gel.inkonchain.com'] } },
    });
  }
  return null;
}

async function withRpcFallback(urls, task, label) {
  let lastErr = null;
  for (const url of urls) {
    try {
      return await task(url);
    } catch (err) {
      lastErr = err;
      warn(`${label} failed on RPC`, { host: safeHost(url), error: String(err?.shortMessage || err?.message || err).slice(0, 180) });
    }
  }
  throw lastErr || new Error(`${label} failed: no RPCs`);
}

async function readContractsAllowFailure(publicClient, contracts, label) {
  try {
    return await publicClient.multicall({ contracts, allowFailure: true });
  } catch (err) {
    const message = String(err?.shortMessage || err?.message || err);
    if (!/multicall|does not support contract|not configured/i.test(message)) throw err;
    warn(`${label} multicall unavailable, using sequential reads`, { error: message.slice(0, 180) });
    const rows = [];
    for (const contract of contracts) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await publicClient.readContract(contract);
        rows.push({ status: 'success', result });
      } catch (readErr) {
        rows.push({ status: 'failure', error: readErr });
      }
    }
    return rows;
  }
}

function safeHost(url) {
  try { return new URL(url).hostname; } catch { return String(url || '').slice(0, 80); }
}

function parseEvmAddressList(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => /^0x[0-9a-fA-F]{40}$/.test(item));
}

async function evmExcludedOwners({ chainKey, deployment, publicClient, contract }) {
  const { getAddress } = await import('viem');
  const upper = chainKey.toUpperCase();
  const set = new Set([
    ...parseEvmAddressList(process.env.NFT_EVM_SUPPLY_EXCLUDED_OWNERS),
    ...parseEvmAddressList(process.env[`NFT_${upper}_SUPPLY_EXCLUDED_OWNERS`]),
  ].map((addr) => getAddress(addr).toLowerCase()));
  let contractOwner = null;
  try {
    contractOwner = await publicClient.readContract({ address: contract, abi: ERC721_SCAN_ABI, functionName: 'owner' });
  } catch {}
  if (chainKey === 'arbitrum' && process.env.NFT_ARBITRUM_COUNT_OPERATOR_SUPPLY !== '1') {
    for (const candidate of [deployment?.owner, deployment?.deployer, contractOwner]) {
      if (/^0x[0-9a-fA-F]{40}$/.test(String(candidate || ''))) {
        set.add(getAddress(candidate).toLowerCase());
      }
    }
  }
  return set;
}

async function readEvmOnchainCandidates(chainKey, dbMeta) {
  const deployment = deploymentOf(chainKey, 'demonking') || readJsonIfExists(path.resolve(__dirname, '..', 'nft', 'deployments', `${chainKey}-v3-mainnet.json`)) || {};
  const contractRaw = process.env[`NFT_${chainKey.toUpperCase()}_CONTRACT`] || deployment.proxy || deployment.contract;
  if (!contractRaw) return { chain: chainKey, ok: true, rows: [], source: 'not_deployed' };

  const { createPublicClient, defineChain, getAddress, http } = await import('viem');
  const viemChains = await import('viem/chains');
  const chain = evmChainSpec(chainKey, defineChain, viemChains);
  const rpcs = evmRpcUrls(chainKey, deployment);
  const contract = getAddress(contractRaw);
  if (!chain || !rpcs.length) throw new Error(`${chainKey} RPC not configured`);

  return withRpcFallback(rpcs, async (rpc) => {
    const publicClient = createPublicClient({ chain, transport: http(rpc) });
    const totalMinted = Number(await publicClient.readContract({
      address: contract,
      abi: ERC721_SCAN_ABI,
      functionName: 'totalMinted',
    }));
    const currentSupply = Number(await publicClient.readContract({
      address: contract,
      abi: ERC721_SCAN_ABI,
      functionName: 'currentSupply',
    }).catch(() => NaN));
    if (!Number.isSafeInteger(totalMinted) || totalMinted < 0 || totalMinted > 5000) {
      throw new Error(`${chainKey} totalMinted out of range: ${totalMinted}`);
    }

    const excluded = await evmExcludedOwners({ chainKey, deployment, publicClient, contract });
    const ids = Array.from({ length: totalMinted }, (_, index) => BigInt(index + 1));
    const owners = [];
    for (const part of chunk(ids, 75)) {
      owners.push(...await readContractsAllowFailure(publicClient, part.map((id) => ({
          address: contract,
          abi: ERC721_SCAN_ABI,
          functionName: 'ownerOf',
          args: [id],
        })), `${chainKey} ownerOf scan`));
    }

    const live = [];
    let missingOwners = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const result = owners[i];
      if (result?.status !== 'success' || !result.result) {
        missingOwners += 1;
        continue;
      }
      const owner = getAddress(result.result);
      if (owner.toLowerCase() === ZERO_EVM_ADDRESS) continue;
      if (excluded.has(owner.toLowerCase())) continue;
      live.push({ id: ids[i], owner });
    }
    // Arbitrum had bridge burns before the live-supply view matched ownerOf
    // semantics. The production supply reader treats ownerOf scan as the
    // canonical Arbitrum set; keep the same rule here.
    if (chainKey !== 'arbitrum' && Number.isSafeInteger(currentSupply) && currentSupply > 0 && live.length < currentSupply && missingOwners > 0) {
      throw new Error(`${chainKey} owner scan incomplete: live=${live.length}, currentSupply=${currentSupply}, missing=${missingOwners}`);
    }

    const levelById = new Map();
    for (const part of chunk(live, 75)) {
      const results = await readContractsAllowFailure(publicClient, part.map((row) => ({
          address: contract,
          abi: ERC721_SCAN_ABI,
          functionName: 'tokenLevel',
          args: [row.id],
        })), `${chainKey} tokenLevel scan`);
      results.forEach((result, index) => {
        if (result?.status === 'success') levelById.set(part[index].id.toString(), normalizeLevel(result.result));
      });
    }

    const rows = live.map(({ id, owner }) => {
      const tokenId = id.toString();
      const dbRow = dbMeta.get(`${chainKey}:${tokenId}`);
      return normalizeCandidate({
        chain: chainKey,
        token_id: tokenId,
        legacy_level: Math.max(normalizeLevel(levelById.get(tokenId)), dbRow?.legacy_level || 1),
        owner_wallet: owner,
        player_id: dbRow?.player_id || null,
        source: `onchain-evm:${safeHost(rpc)}`,
      });
    }).filter(Boolean);
    return { chain: chainKey, ok: true, rows, source: `onchain-evm:${safeHost(rpc)}`, totalMinted, currentSupply };
  }, `${chainKey} Demon King scan`);
}

function publicKeyText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toBase58 === 'function') return value.toBase58();
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) return value.toString();
  return '';
}

function solanaCoreAssetId(asset) {
  return publicKeyText(asset?.publicKey || asset?.address || asset?.id);
}

function solanaCoreAssetOwner(asset) {
  return publicKeyText(asset?.owner || asset?.ownership?.owner);
}

function solanaCoreAssetLevel(asset) {
  const attrs = [
    asset?.attributes?.attributeList,
    asset?.plugins?.attributes?.attributeList,
    asset?.content?.metadata?.attributes,
    asset?.content?.metadata?.properties?.attributes,
  ].filter(Array.isArray).flat();
  const levelAttr = attrs.find((row) => String(row?.key || row?.trait_type || '').toLowerCase() === 'level');
  const level = Number(levelAttr?.value);
  if ([1, 2, 3].includes(level)) return level;
  const text = `${asset?.name || ''} ${asset?.uri || ''} ${asset?.content?.metadata?.name || ''} ${asset?.content?.json_uri || ''}`;
  const nameLevel = text.match(/\bL(?:evel)?\s*([123])\b/i);
  return nameLevel ? Number(nameLevel[1]) : 1;
}

async function readSolanaOnchainCandidates(dbMeta) {
  const deployment = deploymentOf('solana', 'demonking') || {};
  const collection = process.env.NFT_SOLANA_COLLECTION || deployment.collection;
  if (!collection) return { chain: 'solana', ok: true, rows: [], source: 'not_deployed' };
  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const { mplCore, fetchAssetsByCollection } = await import('@metaplex-foundation/mpl-core');
  const { publicKey } = await import('@metaplex-foundation/umi');
  const urls = solanaRpcUrls([deployment.rpcUrl]);
  return withRpcFallback(urls, async (rpc) => {
    const umi = createUmi(rpc).use(mplCore());
    const assets = await fetchAssetsByCollection(umi, publicKey(collection), { skipDerivePlugins: true });
    const rows = assets.map((asset) => {
      const tokenId = solanaCoreAssetId(asset);
      const dbRow = dbMeta.get(`solana:${tokenId}`);
      return normalizeCandidate({
        chain: 'solana',
        token_id: tokenId,
        legacy_level: Math.max(normalizeLevel(solanaCoreAssetLevel(asset)), dbRow?.legacy_level || 1),
        owner_wallet: solanaCoreAssetOwner(asset) || dbRow?.owner_wallet || null,
        player_id: dbRow?.player_id || null,
        source: `onchain-solana-core:${safeHost(rpc)}`,
      });
    }).filter(Boolean);
    return { chain: 'solana', ok: true, rows, source: `onchain-solana-core:${safeHost(rpc)}` };
  }, 'Solana Demon King collection scan');
}

function parseMaybeJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

async function readAptosOnchainCandidates(dbMeta) {
  const deployment = deploymentOf('aptos', 'demonking') || {};
  const collection = process.env.NFT_APTOS_COLLECTION || deployment.collection;
  if (!collection) return { chain: 'aptos', ok: true, rows: [], source: 'not_deployed' };
  const excludedOwners = new Set([
    deployment.resourceAccount,
    process.env.NFT_APTOS_RARITY_EXCLUDED_OWNERS,
  ].flatMap((value) => String(value || '').split(/[,\s]+/))
    .map((value) => normalizeAptosAddress(value))
    .filter(Boolean));
  const indexerUrl = process.env.APTOS_INDEXER_URL || 'https://indexer.mainnet.aptoslabs.com/v1/graphql';
  const headers = { 'content-type': 'application/json' };
  if (process.env.APTOS_NODE_API_KEY) headers.Authorization = `Bearer ${process.env.APTOS_NODE_API_KEY}`;
  const query = `query Q($collection:String!, $limit:Int!, $offset:Int!) {
    current_token_ownerships_v2(
      where: {current_token_data:{collection_id:{_eq:$collection}}, amount:{_gt:0}},
      limit: $limit,
      offset: $offset
    ) {
      owner_address
      token_data_id
      current_token_data { token_name token_uri token_properties }
    }
  }`;

  const rows = [];
  const limit = 100;
  for (let offset = 0; offset < 5000; offset += limit) {
    const response = await fetch(indexerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: { collection, limit, offset } }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.errors?.length) {
      throw new Error(json?.errors?.[0]?.message || `Aptos indexer ${response.status}`);
    }
    const pageRows = json?.data?.current_token_ownerships_v2 || [];
    for (const row of pageRows) {
      const props = parseMaybeJsonObject(row.current_token_data?.token_properties);
      const tokenId = String(row.token_data_id || '').trim();
      const dbRow = dbMeta.get(`aptos:${tokenId}`);
      const owner = normalizeAptosAddress(row.owner_address);
      if (!INCLUDE_APTOS_EXCLUDED && owner && excludedOwners.has(owner)) continue;
      rows.push(normalizeCandidate({
        chain: 'aptos',
        token_id: tokenId,
        legacy_level: Math.max(normalizeLevel(props?.level), dbRow?.legacy_level || 1),
        owner_wallet: owner || dbRow?.owner_wallet || null,
        player_id: dbRow?.player_id || null,
        source: 'onchain-aptos-indexer',
      }));
    }
    if (pageRows.length < limit) break;
  }
  return { chain: 'aptos', ok: true, rows: rows.filter(Boolean), source: 'onchain-aptos-indexer' };
}

function mergeCandidates(primaryRows, dbMeta) {
  const byKey = new Map();
  for (const raw of primaryRows) {
    const row = normalizeCandidate(raw);
    if (!row) continue;
    const key = `${row.chain}:${row.token_id}`;
    const dbRow = dbMeta.get(key);
    const prev = byKey.get(key);
    byKey.set(key, {
      ...prev,
      ...row,
      legacy_level: Math.max(prev?.legacy_level || 1, row.legacy_level || 1, dbRow?.legacy_level || 1),
      owner_wallet: row.owner_wallet || prev?.owner_wallet || dbRow?.owner_wallet || null,
      player_id: row.player_id || prev?.player_id || dbRow?.player_id || null,
      source: row.source || prev?.source || dbRow?.source || 'unknown',
    });
  }
  return [...byKey.values()].sort(compareCandidate);
}

function compareCandidate(a, b) {
  return a.chain.localeCompare(b.chain) || a.token_id.localeCompare(b.token_id, undefined, { numeric: true });
}

async function readCandidates() {
  const dbRows = readDbCandidateRows();
  const dbMeta = new Map(dbRows.map((row) => [`${row.chain}:${row.token_id}`, row]));
  if (DB_ONLY) return { rows: dbRows, sources: { mode: 'db-only' }, dbRows: dbRows.length };

  const rows = [];
  const sources = {};
  for (const chain of ALL_CHAINS) {
    try {
      let result;
      if (EVM_CHAINS.includes(chain)) result = await readEvmOnchainCandidates(chain, dbMeta);
      else if (chain === 'solana') result = await readSolanaOnchainCandidates(dbMeta);
      else if (chain === 'aptos') result = await readAptosOnchainCandidates(dbMeta);
      const chainRows = result?.rows || [];
      rows.push(...chainRows);
      sources[chain] = {
        source: result?.source || 'onchain',
        rows: chainRows.length,
        fallback: false,
      };
    } catch (err) {
      const fallbackRows = dbRows.filter((row) => row.chain === chain);
      rows.push(...fallbackRows);
      sources[chain] = {
        source: 'db-fallback',
        rows: fallbackRows.length,
        fallback: true,
        error: String(err?.message || err).slice(0, 240),
      };
      warn(`Using DB fallback for ${chain}`, { error: sources[chain].error, rows: fallbackRows.length });
    }
  }
  return { rows: mergeCandidates(rows, dbMeta), sources, dbRows: dbRows.length };
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
  const counts = { common: 0, epic: 0, legendary: 0, existing: 0, forcedLegendary: 0 };
  const assignments = new Map();

  for (const row of candidates) {
    const key = `${row.chain}:${row.token_id}`;
    const current = !RESET ? existing.get(key) : null;
    if (current) {
      assignments.set(key, { ...row, rarity: current, source: 'existing' });
      counts[current] += 1;
      counts.existing += 1;
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
    rows: [...assignments.values()].sort(compareCandidate),
  };
}

function applyAssignments(plan) {
  let pruned = 0;
  const tx = gameDb.db.transaction(() => {
    if (!KEEP_STALE) {
      const validKeys = new Set(plan.rows.map((row) => `${row.chain}:${row.token_id}`));
      const staleRows = gameDb.db.prepare(`
        SELECT chain, token_id
          FROM nft_rarities
         WHERE collection = ?
      `).all(COLLECTION).filter((row) => !validKeys.has(`${row.chain}:${row.token_id}`));
      const del = gameDb.db.prepare(`
        DELETE FROM nft_rarities
         WHERE collection = ?
           AND chain = ?
           AND token_id = ?
      `);
      for (const row of staleRows) {
        del.run(COLLECTION, row.chain, row.token_id);
        pruned += 1;
      }
    }
    for (const [rank, row] of plan.rows.entries()) {
      gameDb.upsertNftRarity({
        collection: COLLECTION,
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
          candidate_source: row.source || null,
        },
      });
    }
  });
  tx();
  return { pruned };
}

async function main() {
  const candidateResult = await readCandidates();
  const candidates = candidateResult.rows;
  const existing = readExisting();
  const plan = assignRarities(candidates, existing);
  const applyResult = APPLY ? applyAssignments(plan) : { pruned: 0 };
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
    dbOnly: DB_ONLY,
    keepStale: KEEP_STALE,
    seedHash: sha256(SEED),
    snapshotHash: plan.snapshotHash,
    dbCandidateRows: candidateResult.dbRows,
    total: plan.rows.length,
    target: plan.target,
    counts: plan.counts,
    sources: candidateResult.sources,
    byChain,
    missingExistingRows: plan.rows.length - plan.counts.existing,
    stalePruned: applyResult.pruned,
    sample: plan.rows.slice(0, 12).map((row) => ({
      chain: row.chain,
      token_id: row.token_id,
      legacy_level: row.legacy_level,
      rarity: row.rarity,
      source: row.source,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.stack || err?.message || String(err) }, null, 2));
  process.exitCode = 1;
});
