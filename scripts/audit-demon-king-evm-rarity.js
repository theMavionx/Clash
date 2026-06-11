#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(process.env.CLASH_ROOT || path.join(__dirname, '..'));
const NFT_ROOT = path.join(ROOT, 'nft');
const LABELS = new Set(['Common', 'Epic', 'Legendary']);
const args = process.argv.slice(2);
const COLLECTION_ARG = String(args.find((arg) => arg.startsWith('--collection='))?.slice('--collection='.length) || 'demonking')
  .trim()
  .toLowerCase()
  .replace(/[-\s_]+/g, '');
const COLLECTION = COLLECTION_ARG === 'dragon' ? 'dragon' : 'demonking';
const COLLECTION_LABEL = COLLECTION === 'dragon' ? 'Dragon' : 'Demon King';

function loadEnvFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim().replace(/^export\s+/, '');
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {}
}

for (const envPath of [
  path.join(ROOT, '.env'),
  path.join(ROOT, 'server', '.env'),
  path.join(ROOT, 'nft', '.env'),
  '/opt/clash/shared/.env',
  '/opt/clash/shared/server/.env',
  '/opt/clash/.env',
]) {
  loadEnvFile(envPath);
}

function localRequireFrom(...roots) {
  for (const root of roots) {
    try {
      return createRequire(root);
    } catch {}
  }
  return require;
}

const packageRequire = localRequireFrom(
  path.join(ROOT, 'web', 'package.json'),
  path.join(ROOT, 'server-futures', 'package.json'),
  path.join(ROOT, 'server', 'package.json'),
);

const { createPublicClient, http, parseAbi, defineChain } = packageRequire('viem');
const viemChains = (() => {
  try { return packageRequire('viem/chains'); } catch { return {}; }
})();

const ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function totalMinted() view returns (uint256)',
  'function currentSupply() view returns (uint256)',
]);

const CHAINS = {
  base: {
    chain: viemChains.base,
    env: ['NFT_BASE_RPC_URL', 'NFT_DRAGON_BASE_RPC_URL', 'BASE_RPC_URL', 'VITE_BASE_RPC_URL'],
    fallbacks: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'],
  },
  arbitrum: {
    chain: viemChains.arbitrum,
    env: ['NFT_ARBITRUM_RPC_URL', 'NFT_DRAGON_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL', 'VITE_ARBITRUM_RPC_URL'],
    fallbacks: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one.publicnode.com', 'https://arbitrum.llamarpc.com'],
  },
  monad: {
    chain: defineChain({
      id: 143,
      name: 'Monad',
      nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
    }),
    env: ['NFT_MONAD_RPC_URL', 'NFT_DRAGON_MONAD_RPC_URL', 'MONAD_RPC_URL', 'VITE_MONAD_RPC_URL'],
    fallbacks: ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz', 'https://rpc2.monad.xyz', 'https://rpc3.monad.xyz', 'https://rpc-mainnet.monadinfra.com'],
  },
  ink: {
    chain: defineChain({
      id: 57073,
      name: 'Ink',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc-gel.inkonchain.com'] } },
    }),
    env: ['NFT_INK_RPC_URL', 'NFT_DRAGON_INK_RPC_URL', 'INK_RPC_URL', 'VITE_INK_RPC_URL'],
    fallbacks: ['https://rpc-gel.inkonchain.com', 'https://rpc-qnd.inkonchain.com', 'https://ink.drpc.org'],
  },
};

function readJsonIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
  } catch {
    return null;
  }
}

function deployment(chainKey) {
  if (COLLECTION === 'dragon') {
    return readJsonIfExists(path.join(NFT_ROOT, 'deployments', `dragon-${chainKey}-mainnet.json`));
  }
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', `${chainKey}-v3-mainnet.json`));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function rpcUrls(chainKey) {
  const cfg = CHAINS[chainKey];
  return unique([
    ...cfg.env.flatMap((key) => String(process.env[key] || '').split(/[,\s]+/).filter(Boolean)),
    ...cfg.fallbacks,
  ]).filter((url) => /^https?:\/\//i.test(url));
}

async function withRpcFallback(chainKey, fn) {
  const cfg = CHAINS[chainKey];
  let lastErr = null;
  for (const rpc of rpcUrls(chainKey)) {
    try {
      const client = createPublicClient({
        chain: cfg.chain,
        transport: http(rpc, { retryCount: 1, timeout: 20_000 }),
      });
      return await fn(client, rpc);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`No RPC URL worked for ${chainKey}`);
}

function attrValue(attrs, name) {
  const needle = String(name || '').toLowerCase();
  const row = (attrs || []).find((attr) => String(attr?.trait_type || attr?.key || '').toLowerCase() === needle);
  return row ? String(row.value ?? '') : '';
}

async function fetchMetadata(uri) {
  const response = await fetch(uri, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!response.ok || !json) {
    throw new Error(`metadata ${response.status} ${uri}: ${text.slice(0, 120)}`);
  }
  return json;
}

async function readMaybe(client, address, functionName, args = []) {
  try {
    return await client.readContract({ address, abi: ABI, functionName, args });
  } catch {
    return null;
  }
}

async function auditChain(chainKey) {
  const dep = deployment(chainKey);
  if (!dep?.contract && !dep?.proxy) {
    return { chain: chainKey, ok: false, error: 'missing deployment' };
  }
  const address = dep.proxy || dep.contract;
  return withRpcFallback(chainKey, async (client, rpc) => {
    const totalMintedRaw = await readMaybe(client, address, 'totalMinted');
    const currentSupplyRaw = await readMaybe(client, address, 'currentSupply');
    const totalMinted = Number(totalMintedRaw || 0n);
    const active = [];
    const inactive = [];
    const problems = [];

    for (let tokenId = 1; tokenId <= totalMinted; tokenId += 1) {
      // eslint-disable-next-line no-await-in-loop
      const owner = await readMaybe(client, address, 'ownerOf', [BigInt(tokenId)]);
      if (!owner) {
        inactive.push(tokenId);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const uri = await client.readContract({ address, abi: ABI, functionName: 'tokenURI', args: [BigInt(tokenId)] });
      // eslint-disable-next-line no-await-in-loop
      const metadata = await fetchMetadata(uri);
      const attrs = Array.isArray(metadata.attributes) ? metadata.attributes : [];
      const rarity = attrValue(attrs, 'Rarity');
      const level = attrValue(attrs, 'Level') || attrValue(attrs, 'level');
      const stars = attrValue(attrs, 'Stars') || attrValue(attrs, 'stars');
      const uriText = String(uri);
      const uriChainOk = COLLECTION === 'dragon'
        ? uriText.includes(`/api/nft/dragon/${chainKey}/`)
        : (uriText.includes(`/api/nft/${chainKey}/`)
          || new RegExp(`/api/nft/revealed/${chainKey}(?:-v\\d+)?/`).test(uriText));
      const hasRarity = LABELS.has(rarity);
      const row = { tokenId, owner, uri, rarity, level, stars, uriChainOk };
      active.push(row);
      if (!uriChainOk || !hasRarity || level || stars) {
        problems.push({
          tokenId,
          owner,
          uri,
          rarity: rarity || null,
          level: level || null,
          stars: stars || null,
          uriChainOk,
          hasRarity,
        });
      }
    }

    return {
      chain: chainKey,
      ok: problems.length === 0,
      rpc_host: new URL(rpc).hostname,
      contract: address,
      totalMinted,
      currentSupply: currentSupplyRaw == null ? null : Number(currentSupplyRaw),
      active: active.length,
      inactive: inactive.length,
      problems,
      samples: active.slice(0, 5).map((row) => ({
        tokenId: row.tokenId,
        rarity: row.rarity,
        uri: row.uri,
      })),
    };
  });
}

async function main() {
  const requested = args.find((arg) => arg.startsWith('--chains='))?.slice('--chains='.length);
  const chains = requested ? requested.split(',').map((c) => c.trim()).filter(Boolean) : Object.keys(CHAINS);
  const results = [];
  for (const chainKey of chains) {
    if (!CHAINS[chainKey]) throw new Error(`Unsupported chain ${chainKey}`);
    // eslint-disable-next-line no-await-in-loop
    results.push(await auditChain(chainKey));
  }
  const problems = results.flatMap((row) => row.problems || []);
  console.log(JSON.stringify({
    ok: results.every((row) => row.ok),
    collection: COLLECTION,
    collectionLabel: COLLECTION_LABEL,
    chains: results,
    totalProblems: problems.length,
  }, null, 2));
  if (problems.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.stack || err?.message || String(err) }, null, 2));
  process.exitCode = 1;
});
