#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(process.env.CLASH_ROOT || path.join(__dirname, '..'));
const SERVER_ROOT = path.join(ROOT, 'server');
const COLLECTION = 'demon_king';
const SOLANA_COLLECTION = process.env.NFT_SOLANA_CORE_COLLECTION
  || process.env.NFT_SOLANA_COLLECTION
  || 'FaNGuNf3rQjrWZaUeaGvwj63oAGuh5J3mc8wPUtHas4m';
const DEFAULT_SEED = 'clash-demon-king-rarity-v1';
const LABELS = { common: 'Common', epic: 'Epic', legendary: 'Legendary' };

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const JSON_ONLY = args.includes('--json');
const ASSET_FILTER = args.find((arg) => arg.startsWith('--asset='))?.slice('--asset='.length) || '';
const LIMIT = Number(args.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length) || 0);

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] != null) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {}
}

for (const envPath of [
  path.join(ROOT, '.env'),
  path.join(SERVER_ROOT, '.env'),
  '/opt/clash/.env',
  '/opt/clash/shared/.env',
  '/opt/clash/shared/server/.env',
]) {
  loadEnvFile(envPath);
}

const gameDb = require(path.join(SERVER_ROOT, 'db'));
const { parseSolanaSecretKey } = require(path.join(SERVER_ROOT, 'bridge_helpers'));
const { solanaRpcUrls, withSolanaRpcFallback } = require(path.join(SERVER_ROOT, 'solana_rpc'));
const serverRequire = createRequire(path.join(SERVER_ROOT, 'index.js'));

async function importServerPackage(name) {
  try {
    return await import(name);
  } catch (err) {
    if (!/Cannot find package|ERR_MODULE_NOT_FOUND|Cannot find module/i.test(String(err?.message || err))) {
      throw err;
    }
    return import(pathToFileURL(serverRequire.resolve(name)).href);
  }
}

function log(event, data = {}) {
  if (JSON_ONLY) return;
  console.log(JSON.stringify({ event, ...data }));
}

function publicBase() {
  return String(
    process.env.NFT_PUBLIC_BASE_URL
    || process.env.PUBLIC_BASE_URL
    || process.env.APP_PUBLIC_URL
    || 'https://clashofperps.fun'
  ).replace(/\/+$/, '');
}

function metadataUrl(assetId) {
  const url = new URL('/api/nft/solana/bridged', `${publicBase()}/`);
  url.searchParams.set('asset', assetId);
  return url.toString();
}

function rarityLabel(rarity) {
  return LABELS[String(rarity || '').toLowerCase()] || '';
}

function rarityScore(assetId) {
  const seed = process.env.DEMON_KING_RARITY_REVEAL_SEED || DEFAULT_SEED;
  return crypto.createHash('sha256').update(`${seed}|solana|${assetId}`).digest('hex');
}

function ownerOfDasAsset(asset) {
  return String(asset?.ownership?.owner || asset?.ownership?.delegate || asset?.owner || '').trim();
}

async function rpcCall(rpc, method, params) {
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${Date.now()}-${Math.random()}`, method, params }),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok || json?.error) {
    throw new Error(`${method} failed on ${new URL(rpc).hostname}: ${response.status} ${JSON.stringify(json?.error || text).slice(0, 500)}`);
  }
  return json?.result;
}

async function fetchDasCollectionAssets(rpc) {
  const out = [];
  let page = 1;
  const limit = 1000;
  for (;;) {
    const result = await rpcCall(rpc, 'getAssetsByGroup', {
      groupKey: 'collection',
      groupValue: SOLANA_COLLECTION,
      page,
      limit,
    });
    const items = Array.isArray(result?.items) ? result.items : [];
    out.push(...items);
    if (items.length < limit || out.length >= Number(result?.total || 0)) break;
    page += 1;
  }
  return out;
}

function readRarityRows() {
  return gameDb.db.prepare(`
    SELECT collection, chain, token_id, rarity, legacy_level, owner_wallet, metadata_json, updated_at
      FROM nft_rarities
     WHERE collection = ? AND chain = 'solana'
  `).all(COLLECTION);
}

function readAllCounts() {
  const rows = gameDb.db.prepare(`
    SELECT rarity, COUNT(*) AS count
      FROM nft_rarities
     WHERE collection = ?
       AND rarity IN ('common', 'epic', 'legendary')
     GROUP BY rarity
  `).all(COLLECTION);
  const counts = { common: 0, epic: 0, legendary: 0 };
  for (const row of rows) counts[row.rarity] = Number(row.count || 0);
  counts.total = counts.common + counts.epic + counts.legendary;
  return counts;
}

function assignMissingRarities(missingAssets, existingCounts) {
  const sorted = [...missingAssets].sort((a, b) => rarityScore(a.id).localeCompare(rarityScore(b.id)));
  const finalTotal = existingCounts.total + sorted.length;
  const targetLegendary = Math.round(finalTotal * 0.10);
  const targetEpic = Math.round(finalTotal * 0.30);
  let needLegendary = Math.max(0, targetLegendary - existingCounts.legendary);
  let needEpic = Math.max(0, targetEpic - existingCounts.epic);
  return sorted.map((asset) => {
    let rarity = 'common';
    if (needLegendary > 0) {
      rarity = 'legendary';
      needLegendary -= 1;
    } else if (needEpic > 0) {
      rarity = 'epic';
      needEpic -= 1;
    }
    return { asset, rarity, score: rarityScore(asset.id) };
  });
}

function upsertMissingRarity(asset, rarity, score) {
  const seed = process.env.DEMON_KING_RARITY_REVEAL_SEED || DEFAULT_SEED;
  const metadata = {
    source: 'solana-das-backfill',
    score,
    collection: SOLANA_COLLECTION,
    owner: ownerOfDasAsset(asset),
    uri_at_backfill: asset?.content?.json_uri || '',
  };
  gameDb.db.prepare(`
    INSERT INTO nft_rarities
      (collection, chain, token_id, rarity, legacy_level, owner_wallet, player_id,
       rarity_source, reveal_seed, snapshot_hash, metadata_json, revealed_at, updated_at)
    VALUES (?, 'solana', ?, ?, 1, ?, NULL, 'solana-das-backfill', ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(collection, chain, token_id) DO NOTHING
  `).run(
    COLLECTION,
    String(asset.id),
    rarity,
    ownerOfDasAsset(asset) || null,
    seed,
    `solana-das-${SOLANA_COLLECTION}`,
    JSON.stringify(metadata),
  );
}

function attributeValue(attrs, name) {
  const needle = String(name).toLowerCase();
  const row = (attrs || []).find((attr) => String(attr?.trait_type || attr?.key || '').toLowerCase() === needle);
  return row ? String(row.value ?? '') : '';
}

function dasAttributes(asset) {
  return [
    asset?.content?.metadata?.attributes,
    asset?.content?.json?.attributes,
    asset?.attributes?.attributeList,
    asset?.plugins?.attributes?.attributeList,
  ].find(Array.isArray) || [];
}

function coreAttributeList(asset) {
  return [
    asset?.attributes?.attributeList,
    asset?.plugins?.attributes?.attributeList,
  ].find(Array.isArray) || [];
}

function normalizedDemonKingAttributes({ existing = [], rarity }) {
  const protectedKeys = new Set(['game', 'character', 'chain', 'standard', 'rarity', 'level', 'stars', 'max supply']);
  const output = [
    { key: 'Game', value: 'Clash of Perps' },
    { key: 'Character', value: 'Demon King' },
    { key: 'Chain', value: 'Solana' },
    { key: 'Standard', value: 'Metaplex Core' },
    { key: 'Rarity', value: rarityLabel(rarity) },
    { key: 'Max Supply', value: '333' },
  ];
  const seen = new Set(output.map((row) => row.key.toLowerCase()));
  for (const attr of existing || []) {
    const rawKey = String(attr?.key || attr?.trait_type || '').trim();
    if (!rawKey) continue;
    const key = rawKey.toLowerCase();
    if (protectedKeys.has(key) || seen.has(key)) continue;
    output.push({ key: rawKey, value: String(attr?.value ?? '') });
    seen.add(key);
  }
  return output.filter((row) => row.key !== 'Rarity' || row.value);
}

function assetNeedsAttributeSync(asset, rarity) {
  const attrs = dasAttributes(asset);
  const currentRarity = attributeValue(attrs, 'Rarity');
  const level = attributeValue(attrs, 'Level');
  const stars = attributeValue(attrs, 'Stars');
  return {
    currentRarity,
    hasLevel: !!level,
    hasStars: !!stars,
    wrongRarity: !!rarity && currentRarity !== rarityLabel(rarity),
    needsSync: !!level || !!stars || (!!rarity && currentRarity !== rarityLabel(rarity)),
  };
}

async function fetchEndpointMetadata(assetId) {
  const url = metadataUrl(assetId);
  const response = await fetch(`${url}&_audit=${Date.now()}`, { headers: { accept: 'application/json' } });
  const json = await response.json();
  return {
    url,
    ok: response.ok,
    status: response.status,
    rarity: attributeValue(json?.attributes, 'Rarity'),
    attributes: json?.attributes || [],
  };
}

async function syncSolanaAssets(rpc, assets, rowsByAsset) {
  if (!APPLY) return [];
  const rawKey = process.env.SOLANA_NFT_KEY || process.env.NFT_SOLANA_KEY || process.env.NFT_KEY;
  if (!rawKey) throw new Error('SOLANA_NFT_KEY/NFT_SOLANA_KEY/NFT_KEY is required for --apply.');

  const secretBytes = parseSolanaSecretKey(rawKey);
  const { createUmi } = await importServerPackage('@metaplex-foundation/umi-bundle-defaults');
  const { keypairIdentity, publicKey } = await importServerPackage('@metaplex-foundation/umi');
  const { base58 } = await importServerPackage('@metaplex-foundation/umi/serializers');
  const { mplCore, fetchAsset, fetchCollection, update, updatePlugin } = await importServerPackage('@metaplex-foundation/mpl-core');
  const umi = createUmi(rpc).use(mplCore());
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secretBytes)));

  const results = [];
  let index = 0;
  for (const dasAsset of assets) {
    index += 1;
    const assetId = String(dasAsset.id);
    if (dasAsset?.burnt) continue;
    const targetUri = metadataUrl(assetId);
    const currentUri = String(dasAsset?.content?.json_uri || '');
    const rarityRow = rowsByAsset.get(assetId);
    const rarity = rarityRow?.rarity || '';
    const attrStatus = assetNeedsAttributeSync(dasAsset, rarity);
    if (ASSET_FILTER && assetId !== ASSET_FILTER) continue;
    if (LIMIT > 0 && results.length >= LIMIT) break;
    if (currentUri === targetUri && !attrStatus.needsSync) continue;
    if (!rarityRow) continue;

    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const asset = await fetchAsset(umi, publicKey(assetId));
        const collectionAddress = String(asset?.updateAuthority?.type || '') === 'Collection'
          ? String(asset.updateAuthority.address || '')
          : '';
        // eslint-disable-next-line no-await-in-loop
        const collection = collectionAddress ? await fetchCollection(umi, publicKey(collectionAddress)) : undefined;
        let uriTxSig = null;
        let attributesTxSig = null;
        if (currentUri !== targetUri) {
          // eslint-disable-next-line no-await-in-loop
          const sig = await update(umi, {
            asset,
            ...(collection ? { collection } : {}),
            authority: umi.identity,
            name: process.env.NFT_NAME || 'Demon King',
            uri: targetUri,
          }).sendAndConfirm(umi, {
            send: { skipPreflight: false, commitment: 'processed', maxRetries: 5 },
            confirm: { commitment: 'confirmed', strategy: { type: 'blockhash' } },
          });
          uriTxSig = base58.deserialize(sig.signature)[0];
        }
        if (attrStatus.needsSync) {
          // eslint-disable-next-line no-await-in-loop
          const sig = await updatePlugin(umi, {
            asset: publicKey(assetId),
            ...(collectionAddress ? { collection: publicKey(collectionAddress) } : {}),
            authority: umi.identity,
            plugin: {
              type: 'Attributes',
              attributeList: normalizedDemonKingAttributes({
                existing: coreAttributeList(asset),
                rarity,
              }),
            },
          }).sendAndConfirm(umi, {
            send: { skipPreflight: false, commitment: 'processed', maxRetries: 5 },
            confirm: { commitment: 'confirmed', strategy: { type: 'blockhash' } },
          });
          attributesTxSig = base58.deserialize(sig.signature)[0];
        }
        const row = {
          asset: assetId,
          index,
          uriTxSig,
          attributesTxSig,
          from: currentUri,
          to: targetUri,
          rarity,
          hadLevel: attrStatus.hasLevel,
          hadStars: attrStatus.hasStars,
          previousRarity: attrStatus.currentRarity,
          attempt,
        };
        results.push(row);
        log('updated_asset', row);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        log('update_retry', { asset: assetId, attempt, error: err?.message || String(err) });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
    if (lastErr) results.push({ asset: assetId, index, error: lastErr?.message || String(lastErr) });
  }
  return results;
}

async function main() {
  const rpcUrls = solanaRpcUrls();
  if (!rpcUrls.length) throw new Error('No paid Solana RPC configured.');

  const result = await withSolanaRpcFallback(async (rpc) => {
    log('audit_start', { apply: APPLY, rpc_host: new URL(rpc).hostname, collection: SOLANA_COLLECTION });
    const assets = await fetchDasCollectionAssets(rpc);
    const filteredAssets = ASSET_FILTER ? assets.filter((asset) => String(asset.id) === ASSET_FILTER) : assets;
    const beforeRows = readRarityRows();
    const rowsByAsset = new Map(beforeRows.map((row) => [String(row.token_id), row]));
    const missing = assets.filter((asset) => !rowsByAsset.has(String(asset.id)));
    const assignments = assignMissingRarities(missing, readAllCounts());
    if (APPLY && assignments.length) {
      const tx = gameDb.db.transaction((rows) => {
        for (const row of rows) upsertMissingRarity(row.asset, row.rarity, row.score);
      });
      tx(assignments);
    }

    const afterRows = readRarityRows();
    const afterRowsByAsset = new Map(afterRows.map((row) => [String(row.token_id), row]));
    const wrongUri = assets.filter((asset) => String(asset?.content?.json_uri || '') !== metadataUrl(asset.id));
    const wrongUriActive = wrongUri.filter((asset) => !asset?.burnt);
    const wrongUriBurnt = wrongUri.filter((asset) => asset?.burnt);
    const hiddenUri = assets.filter((asset) => /\/hidden(?:\.json)?(?:$|\?)/i.test(String(asset?.content?.json_uri || '')));
    const hiddenUriActive = hiddenUri.filter((asset) => !asset?.burnt);
    const attributeStatuses = assets.map((asset) => ({
      asset,
      status: assetNeedsAttributeSync(asset, afterRowsByAsset.get(String(asset.id))?.rarity || ''),
    }));
    const needsAttributeSync = attributeStatuses.filter((row) => row.status.needsSync);
    const needsAttributeSyncActive = needsAttributeSync.filter((row) => !row.asset?.burnt);
    const missingDasRarity = attributeStatuses.filter((row) => !row.status.currentRarity);
    const levelAttribute = attributeStatuses.filter((row) => row.status.hasLevel || row.status.hasStars);
    const wrongDasRarity = attributeStatuses.filter((row) => row.status.wrongRarity);
    const targetAssets = filteredAssets.filter((asset) => (
      String(asset?.content?.json_uri || '') !== metadataUrl(asset.id)
      || assetNeedsAttributeSync(asset, afterRowsByAsset.get(String(asset.id))?.rarity || '').needsSync
    ));
    const updates = await syncSolanaAssets(rpc, targetAssets, afterRowsByAsset);
    const samples = await Promise.all(['9BX81uoR9t46dWqjwkiDByLxMScXYiiVgN7NacjKDoHk', 'Aj1ARUPGzKK1ycyGDcNfcVKTmtHTXWJprS54eWWbnHpJ']
      .filter((id) => assets.some((asset) => asset.id === id))
      .map(async (id) => ({
        asset: id,
        db: afterRowsByAsset.get(id)?.rarity || null,
        endpoint: await fetchEndpointMetadata(id),
        das_uri: assets.find((asset) => asset.id === id)?.content?.json_uri || '',
        das_rarity: attributeValue(dasAttributes(assets.find((asset) => asset.id === id)), 'Rarity') || null,
        das_level: attributeValue(dasAttributes(assets.find((asset) => asset.id === id)), 'Level') || null,
      })));

    return {
      ok: true,
      apply: APPLY,
      rpc_host: new URL(rpc).hostname,
      collection: SOLANA_COLLECTION,
      solana_assets: assets.length,
      db_solana_before: beforeRows.length,
      db_solana_after: afterRows.length,
      missing_before: missing.length,
      backfilled: APPLY ? assignments.length : 0,
      assignment_preview: assignments.slice(0, 12).map((row) => ({ asset: row.asset.id, rarity: row.rarity, owner: ownerOfDasAsset(row.asset) })),
      wrong_uri_before: wrongUri.length,
      wrong_uri_active_before: wrongUriActive.length,
      wrong_uri_burnt_before: wrongUriBurnt.length,
      hidden_uri_before: hiddenUri.length,
      hidden_uri_active_before: hiddenUriActive.length,
      missing_das_rarity_before: missingDasRarity.length,
      level_attribute_before: levelAttribute.length,
      wrong_das_rarity_before: wrongDasRarity.length,
      attribute_sync_needed_before: needsAttributeSync.length,
      attribute_sync_needed_active_before: needsAttributeSyncActive.length,
      asset_updates_attempted: updates.length,
      asset_update_errors: updates.filter((row) => row.error).length,
      samples,
    };
  }, { urls: rpcUrls, label: 'Solana Demon King DAS rarity sync' });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.stack || err?.message || String(err) }, null, 2));
  process.exitCode = 1;
});
