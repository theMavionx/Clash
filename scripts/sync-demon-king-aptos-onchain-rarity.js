#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(process.env.CLASH_ROOT || path.join(__dirname, '..'));
const SERVER_ROOT = path.join(ROOT, 'server');
const COLLECTION = 'demon_king';
const LABELS = { common: 'Common', epic: 'Epic', legendary: 'Legendary' };

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const TOKEN_FILTER = args.find((arg) => arg.startsWith('--token='))?.slice('--token='.length).toLowerCase() || '';
const LIMIT = Math.max(0, Number(args.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length) || 0) || 0);
const BATCH_SIZE = Math.max(1, Math.min(50, Number(args.find((arg) => arg.startsWith('--batch-size='))?.slice('--batch-size='.length) || 20) || 20));

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
  '/opt/clash/.env',
]) {
  loadEnvFile(envPath);
}

const gameDb = require(path.join(SERVER_ROOT, 'db'));
const { deploymentOf, normalizeAptosAddress } = require(path.join(SERVER_ROOT, 'bridge_helpers'));

function loadAptosSdk() {
  const roots = [
    path.join(ROOT, 'server-futures', 'index.js'),
    path.join(ROOT, 'nft', 'package.json'),
    path.join(ROOT, 'server', 'index.js'),
  ];
  for (const root of roots) {
    try {
      const localRequire = createRequire(root);
      return localRequire('@aptos-labs/ts-sdk');
    } catch {}
  }
  return require('@aptos-labs/ts-sdk');
}

function readAptosProfileKey() {
  for (const filePath of [
    path.join(ROOT, 'nft', 'move', 'clash_nft', '.aptos', 'config.yaml'),
    path.join(ROOT, '.aptos', 'config.yaml'),
  ]) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const text = fs.readFileSync(filePath, 'utf8');
      const match = text.match(/mainnet:\s*[\s\S]*?private_key:\s*ed25519-priv-(0x[0-9a-fA-F]+)/);
      if (match) return match[1];
    } catch {}
  }
  return '';
}

function aptosAccount(sdk) {
  const explicit = String(process.env.GAME_SHOP_APTOS_KEY || process.env.NFT_APTOS_KEY || readAptosProfileKey() || '').trim();
  const mnemonic = String(process.env.GAME_SHOP_APTOS_MNEMONIC || process.env.NFT_BASE || '').trim();
  if (explicit) return sdk.Account.fromPrivateKey({ privateKey: new sdk.Ed25519PrivateKey(explicit) });
  if (!mnemonic) throw new Error('Missing GAME_SHOP_APTOS_KEY / NFT_APTOS_KEY / GAME_SHOP_APTOS_MNEMONIC / NFT_BASE');
  return sdk.Account.fromDerivationPath({ path: "m/44'/637'/0'/0'/0'", mnemonic });
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function tokenEditionFromName(name) {
  const match = String(name || '').match(/#\s*(\d+)\s*$/);
  return match ? String(Number(match[1])) : '';
}

function propValue(props, key) {
  const needle = String(key || '').toLowerCase();
  for (const [rawKey, rawValue] of Object.entries(props || {})) {
    if (String(rawKey).toLowerCase() !== needle) continue;
    if (rawValue && typeof rawValue === 'object' && Object.prototype.hasOwnProperty.call(rawValue, 'value')) {
      return String(rawValue.value ?? '');
    }
    return String(rawValue ?? '');
  }
  return '';
}

function rarityLabel(rarity) {
  return LABELS[String(rarity || '').toLowerCase()] || '';
}

function normalizeRarity(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LABELS, key) ? key : '';
}

function metadataAttributeValue(attrs, name) {
  const needle = String(name || '').toLowerCase();
  const row = (attrs || []).find((attr) => String(attr?.trait_type || attr?.key || '').toLowerCase() === needle);
  return row ? String(row.value ?? '') : '';
}

function needsOnchainSync(token, rarity) {
  const label = rarityLabel(rarity);
  const props = token.properties || {};
  const current = propValue(props, 'Rarity');
  const level = propValue(props, 'level') || propValue(props, 'Level');
  const stars = propValue(props, 'stars') || propValue(props, 'Stars');
  return {
    currentRarity: current,
    hasLevel: !!level,
    hasStars: !!stars,
    wrongRarity: !!label && current !== label,
    needsSync: !!level || !!stars || (!!label && current !== label),
  };
}

async function fetchAptosTokens() {
  const deployment = deploymentOf('aptos', 'demonking') || {};
  const collection = process.env.NFT_APTOS_COLLECTION || deployment.collection;
  if (!collection) throw new Error('Aptos Demon King collection is not configured');

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
      token_uri
      token_properties
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
      const tokenName = String(row.token_name || '').trim();
      const edition = tokenEditionFromName(tokenName);
      if (!tokenDataId || !edition) continue;
      rows.push({
        tokenDataId,
        tokenName,
        edition,
        uri: String(row.token_uri || ''),
        properties: parseJson(row.token_properties),
      });
    }
    if (pageRows.length < limit) break;
  }
  return rows;
}

async function fetchRarityFromUri(uri) {
  if (!/^https?:\/\//i.test(String(uri || ''))) return null;
  try {
    const separator = uri.includes('?') ? '&' : '?';
    const response = await fetch(`${uri}${separator}_rarity_audit=${Date.now()}`, {
      headers: { accept: 'application/json' },
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json) return null;
    const rarity = normalizeRarity(metadataAttributeValue(json.attributes, 'Rarity'));
    return rarity ? { rarity, rarityLabel: rarityLabel(rarity), source: 'token-uri' } : null;
  } catch {
    return null;
  }
}

async function rarityForToken(token) {
  const objectRow = gameDb.getNftRarity(COLLECTION, 'aptos', token.tokenDataId, { legacyLevel: 1 });
  const editionRow = gameDb.getNftRarity(COLLECTION, 'aptos', token.edition, { legacyLevel: 1 });
  if (objectRow?.rarity) return objectRow;
  if (editionRow?.rarity) return editionRow;
  return fetchRarityFromUri(token.uri);
}

async function submitBatch({ aptos, account, moduleId, batch, gasUnitPrice, maxGasAmount }) {
  const tx = await aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: {
      function: `${moduleId}::admin_set_rarity_batch`,
      functionArguments: [
        batch.map((row) => row.tokenDataId),
        batch.map((row) => row.rarityLabel),
      ],
    },
    options: { gasUnitPrice, maxGasAmount },
  });
  const submitted = await aptos.signAndSubmitTransaction({ signer: account, transaction: tx });
  const receipt = await aptos.waitForTransaction({ transactionHash: submitted.hash });
  if (receipt?.success === false) {
    throw new Error(`Aptos rarity tx failed ${submitted.hash}: ${receipt?.vm_status || 'unknown'}`);
  }
  return submitted.hash;
}

async function main() {
  const deployment = deploymentOf('aptos', 'demonking') || {};
  const moduleId = deployment.module;
  if (!moduleId) throw new Error('Missing Aptos Demon King module deployment');

  const tokens = await fetchAptosTokens();
  const unique = new Map(tokens.map((token) => [token.tokenDataId, token]));
  let candidates = [];
  for (const token of unique.values()) {
    // eslint-disable-next-line no-await-in-loop
    const rarity = await rarityForToken(token);
    const status = needsOnchainSync(token, rarity?.rarity);
    candidates.push({
      ...token,
      rarity: rarity?.rarity || '',
      rarityLabel: rarity?.rarityLabel || rarityLabel(rarity?.rarity),
      status,
    });
  }
  if (TOKEN_FILTER) {
    candidates = candidates.filter((row) => (
      row.tokenDataId.toLowerCase() === TOKEN_FILTER
      || row.edition === TOKEN_FILTER
      || row.tokenName.toLowerCase() === TOKEN_FILTER
    ));
  }

  const missingRarity = candidates.filter((row) => !row.rarity);
  let updates = candidates.filter((row) => row.rarity && row.status.needsSync);
  if (LIMIT > 0) updates = updates.slice(0, LIMIT);

  const batches = [];
  if (APPLY && updates.length) {
    const sdk = loadAptosSdk();
    const account = aptosAccount(sdk);
    const expectedAdmin = String(deployment.admin || '').toLowerCase();
    if (expectedAdmin && account.accountAddress.toString().toLowerCase() !== expectedAdmin) {
      throw new Error(`Aptos signer ${account.accountAddress} is not deployment admin ${deployment.admin}`);
    }
    const fullnode = process.env.NFT_APTOS_RPC_URL || process.env.APTOS_RPC_URL || 'https://fullnode.mainnet.aptoslabs.com/v1';
    const aptos = new sdk.Aptos(new sdk.AptosConfig({ network: sdk.Network.MAINNET, fullnode }));
    const gasUnitPrice = Number(process.env.NFT_APTOS_GAS_UNIT_PRICE || process.env.APTOS_GAS_UNIT_PRICE || 100);
    const maxGasAmount = Number(process.env.NFT_APTOS_MAX_GAS_AMOUNT || process.env.APTOS_MAX_GAS_AMOUNT || 300000);

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop
      const txHash = await submitBatch({ aptos, account, moduleId, batch, gasUnitPrice, maxGasAmount });
      batches.push({ txHash, count: batch.length, first: batch[0]?.tokenName, last: batch[batch.length - 1]?.tokenName });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(JSON.stringify({
    ok: true,
    applied: APPLY,
    module: moduleId,
    onchainAptosTokens: unique.size,
    checked: candidates.length,
    missingRarity: missingRarity.length,
    needsUpdate: updates.length,
    submittedBatches: batches,
    samples: candidates
      .filter((row) => row.status.needsSync || ['58', '98'].includes(row.edition))
      .slice(0, 20)
      .map((row) => ({
        token: row.tokenName,
        tokenDataId: row.tokenDataId,
        edition: row.edition,
        rarity: row.rarityLabel || null,
        currentRarity: row.status.currentRarity || null,
        hasLevel: row.status.hasLevel,
        hasStars: row.status.hasStars,
        uri: row.uri,
      })),
  }, null, 2));

  if (missingRarity.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.stack || err?.message || String(err) }, null, 2));
  process.exitCode = 1;
});
