// Mint Token-2022 replacement NFTs for legacy Metaplex Core Solana assets.
//
// This intentionally does not burn user-held Core assets. Instead it records
// a migration registry that the bridge backend uses to reject old Core asset
// ids after their replacements exist.
//
// Dry run:
//   node scripts/migrate-solana-core-to-token2022.mjs
// Execute:
//   node scripts/migrate-solana-core-to-token2022.mjs --execute

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Connection } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, fetchAssetsByCollection } from '@metaplex-foundation/mpl-core';
import { publicKey } from '@metaplex-foundation/umi';
import { loadEnv, NFT_DIR, parseSolanaKeypair } from './lib-env.mjs';

const require = createRequire(import.meta.url);
const {
  completeExistingToken2022NftMint,
  mintToken2022Nft,
} = require('../../server/solana_token2022_nft');

const env = loadEnv();
const execute = process.argv.includes('--execute');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? Math.max(0, Number(limitArg) || 0) : 0;
const resumeOld = process.argv.find((arg) => arg.startsWith('--resume-old='))?.split('=')[1] || '';
const resumeMint = process.argv.find((arg) => arg.startsWith('--resume-mint='))?.split('=')[1] || '';
const resumeSetupSig = process.argv.find((arg) => arg.startsWith('--resume-setup-sig='))?.split('=')[1] || null;
const deploymentPath = path.join(NFT_DIR, 'deployments', 'solana-mainnet.json');
const migrationPath = path.join(NFT_DIR, 'deployments', 'solana-token2022-migration-mainnet.json');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
if (!deployment.collection) throw new Error('Missing solana-mainnet.json collection');

const migration = fs.existsSync(migrationPath)
  ? JSON.parse(fs.readFileSync(migrationPath, 'utf8'))
  : {
      chain: 'solana',
      fromStandard: 'metaplex-core',
      toStandard: 'token2022',
      collection: deployment.collection,
      entries: [],
    };

function readLevel(asset) {
  const attrs = asset?.attributes?.attributeList || [];
  const level = Number(attrs.find((row) => String(row?.key || '').toLowerCase() === 'level')?.value || 1);
  return [1, 2, 3].includes(level) ? level : 1;
}

function ownerOf(asset) {
  return String(asset?.owner || asset?.ownerAddress || '');
}

function assetId(asset) {
  return asset?.publicKey?.toString?.() || String(asset?.publicKey || '');
}

function writeMigrationFile() {
  migration.updatedAt = new Date().toISOString();
  migration.count = migration.entries.length;
  fs.writeFileSync(migrationPath, `${JSON.stringify(migration, null, 2)}\n`);
}

const rpcUrl = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || deployment.rpcUrl || 'https://solana-rpc.publicnode.com';
const payer = parseSolanaKeypair(env);
const umi = createUmi(rpcUrl).use(mplCore());
const connection = new Connection(rpcUrl, 'confirmed');

console.log(`[solana-migrate] collection=${deployment.collection}`);
console.log(`[solana-migrate] payer=${payer.publicKey.toBase58()}`);
console.log(`[solana-migrate] mode=${execute ? 'execute' : 'dry-run'}`);

const assets = await fetchAssetsByCollection(umi, publicKey(deployment.collection));
const migratedOldAssets = new Set((migration.entries || []).map((entry) => String(entry.oldAsset || '')));
let candidates = assets
  .map((asset) => ({
    oldAsset: assetId(asset),
    owner: ownerOf(asset),
    level: readLevel(asset),
    name: asset.name || 'Demon King',
    uri: asset.uri || '',
  }))
  .filter((row) => row.oldAsset && row.owner && !migratedOldAssets.has(row.oldAsset));
if (limit) candidates = candidates.slice(0, limit);

console.log(`[solana-migrate] liveCoreAssets=${assets.length} pending=${candidates.length}`);
for (const row of candidates) {
  console.log(`[solana-migrate] ${row.oldAsset} owner=${row.owner} level=${row.level}`);
}

if (!execute) {
  console.log('[solana-migrate] dry-run only; add --execute to mint replacements');
} else {
  for (const row of candidates) {
    const existing = migration.entries.find((entry) => String(entry.oldAsset || '') === row.oldAsset);
    if (existing) continue;
    const resumeThisMint = resumeOld && resumeMint && row.oldAsset === resumeOld;
    const mint = await (resumeThisMint ? completeExistingToken2022NftMint : mintToken2022Nft)({
      mint: resumeThisMint ? resumeMint : undefined,
      recipient: row.owner,
      level: row.level,
      sourceRef: `migration:${row.oldAsset}`,
      payerSecretKey: payer.secretKey,
      connection,
      setupSig: resumeThisMint ? resumeSetupSig : undefined,
    });
    const entry = {
      ...row,
      newMint: mint.mint,
      tokenAccount: mint.tokenAccount,
      txSig: mint.txSig,
      setupSig: mint.setupSig,
      metadataSig: mint.metadataSig,
      uri: mint.uri,
      migratedAt: new Date().toISOString(),
    };
    migration.entries.push(entry);
    writeMigrationFile();
    console.log(`[solana-migrate] minted ${entry.newMint} for old ${entry.oldAsset}`);
  }

  writeMigrationFile();
  console.log(`[solana-migrate] done entries=${migration.entries.length} file=${migrationPath}`);
}
