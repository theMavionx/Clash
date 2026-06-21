#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

for (const file of [
  path.join(ROOT, '.env'),
  path.join(ROOT, 'server', '.env'),
  path.join(ROOT, 'nft', '.env'),
  '/opt/clash/shared/.env',
  '/opt/clash/.env',
]) {
  loadEnvFile(file);
}

const gameDb = require(path.join(ROOT, 'server', 'db'));
const { deploymentOf, normalizeAptosAddress } = require(path.join(ROOT, 'server', 'bridge_helpers'));

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const COLLECTION = 'demon_king';

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function normalizeLevel(value) {
  const n = Number(value);
  return [1, 2, 3].includes(n) ? n : 1;
}

function tokenEditionFromName(name) {
  const match = String(name || '').match(/#\s*(\d+)\s*$/);
  return match ? String(Number(match[1])) : null;
}

async function fetchAptosTokens() {
  const deployment = deploymentOf('aptos', 'demonking') || {};
  const collection = process.env.NFT_APTOS_COLLECTION || deployment.collection;
  if (!collection) throw new Error('Aptos Demon King collection is not configured');

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
      current_token_data { token_name token_properties }
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
      const tokenDataId = String(row.token_data_id || '').trim();
      const tokenName = String(row.current_token_data?.token_name || '').trim();
      const edition = tokenEditionFromName(tokenName);
      if (!tokenDataId || !edition) continue;
      const props = parseJson(row.current_token_data?.token_properties);
      rows.push({
        tokenDataId,
        edition,
        tokenName,
        owner: normalizeAptosAddress(row.owner_address) || row.owner_address || null,
        legacyLevel: normalizeLevel(props?.level?.value ?? props?.level ?? props?.Level),
      });
    }
    if (pageRows.length < limit) break;
  }
  return rows;
}

function sameRarity(a, b) {
  return String(a?.rarity || '') === String(b?.rarity || '');
}

async function main() {
  const tokens = await fetchAptosTokens();
  const unique = new Map(tokens.map((row) => [row.tokenDataId, row]));
  const updates = [];
  const missing = [];
  const mismatches = [];

  for (const token of unique.values()) {
    const objectRow = gameDb.getNftRarity(COLLECTION, 'aptos', token.tokenDataId, { legacyLevel: token.legacyLevel });
    const editionRow = gameDb.getNftRarity(COLLECTION, 'aptos', token.edition, { legacyLevel: token.legacyLevel });
    const source = objectRow?.rarity ? objectRow : editionRow?.rarity ? editionRow : null;
    if (!source?.rarity) {
      missing.push(token);
      continue;
    }
    if (objectRow?.rarity && editionRow?.rarity && !sameRarity(objectRow, editionRow)) {
      mismatches.push({ token, objectRarity: objectRow.rarity, editionRarity: editionRow.rarity });
    }
    const targets = [
      { tokenId: token.tokenDataId, current: objectRow, alias: 'object' },
      { tokenId: token.edition, current: editionRow, alias: 'edition' },
    ];
    for (const target of targets) {
      if (target.current?.rarity === source.rarity) continue;
      updates.push({
        ...token,
        tokenId: target.tokenId,
        alias: target.alias,
        rarity: source.rarity,
        rarityLabel: source.rarityLabel,
        fromTokenId: source.tokenId,
      });
    }
  }

  if (APPLY && updates.length) {
    const tx = gameDb.db.transaction(() => {
      for (const row of updates) {
        gameDb.upsertNftRarity({
          collection: COLLECTION,
          chain: 'aptos',
          tokenId: row.tokenId,
          rarity: row.rarity,
          legacyLevel: row.legacyLevel,
          ownerWallet: row.owner,
          source: 'aptos-rarity-alias-sync',
          metadata: {
            tokenName: row.tokenName,
            edition: row.edition,
            tokenDataId: row.tokenDataId,
            alias: row.alias,
            copiedFrom: row.fromTokenId,
          },
        });
      }
    });
    tx();
  }

  console.log(JSON.stringify({
    ok: true,
    applied: APPLY,
    onchainAptosTokens: unique.size,
    updatesNeeded: updates.length,
    missingRarity: missing.length,
    mismatches: mismatches.length,
    sampleUpdates: updates.slice(0, 12),
    sampleMissing: missing.slice(0, 12),
    sampleMismatches: mismatches.slice(0, 12),
  }, null, 2));

  if (missing.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.stack || err?.message || String(err) }, null, 2));
  process.exitCode = 1;
});
