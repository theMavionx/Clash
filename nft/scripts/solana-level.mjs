// Solana level-attribute admin tool.
//
// Three sub-commands (driven by --action=...):
//
//   --action=read     --asset=<pubkey>
//       Print the current `level` attribute of the asset (or 'unset').
//
//   --action=add      --asset=<pubkey> [--level=N]
//       Attach an Attributes plugin with `level: N` (default 1).
//       Idempotent: if the plugin already exists, prints a warning and exits 0.
//       Used to backfill the 7 pre-V3 Solana NFTs.
//
//   --action=set      --asset=<pubkey> --level=N
//       Update the existing Attributes plugin's `level` to N.
//       Used by the upgrade endpoint after server verifies payment.
//
//   --action=list     [--limit=N]
//       List all assets minted in the candy machine's collection.
//
// Auth: signed by NFT_KEY (the candy-machine authority).
// Treasury covers the tiny SOL rent for plugin storage (~0.001 SOL per asset).

import fs from 'node:fs';
import path from 'node:path';
import { NFT_DIR, loadEnv, parseSolanaKeypair } from './lib-env.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return i === -1 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)];
  }),
);
const action = (args.action || 'read').toLowerCase();
if (!['read', 'add', 'set', 'list'].includes(action)) {
  console.error(`Unknown --action=${action}. Use read|add|set|list.`);
  process.exit(1);
}

const env = loadEnv();
const rpcUrl = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
const keypair = parseSolanaKeypair(env);

const deploymentPath = path.join(NFT_DIR, 'deployments', 'solana-mainnet.json');
if (!fs.existsSync(deploymentPath)) {
  throw new Error('Missing nft/deployments/solana-mainnet.json. Deploy the candy machine first.');
}
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const collectionPubkey = deployment.collection;

// Lazy-import heavy UMI deps — only when needed.
const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
const { generateSigner, keypairIdentity, publicKey, signerIdentity } = await import('@metaplex-foundation/umi');
const {
  addPlugin, updatePlugin, fetchAsset, fetchAssetsByCollection, mplCore,
} = await import('@metaplex-foundation/mpl-core');

const umi = createUmi(rpcUrl).use(mplCore());
const umiKeypair = umi.eddsa.createKeypairFromSecretKey(keypair.secretKey);
umi.use(keypairIdentity(umiKeypair));
console.log(`Authority: ${umi.identity.publicKey}`);
console.log(`Collection: ${collectionPubkey}`);

// Find the level attribute from an asset's plugin list.
function readLevel(asset) {
  const plugin = asset.attributes;
  if (!plugin || !plugin.attributeList) return null;
  const entry = plugin.attributeList.find((a) => a.key === 'level');
  return entry ? Number(entry.value) : null;
}

async function doRead(assetAddress) {
  const asset = await fetchAsset(umi, publicKey(assetAddress));
  const level = readLevel(asset);
  console.log(`Asset ${assetAddress}: level=${level ?? 'unset (legacy — treat as L1)'}`);
  if (asset.attributes) {
    console.log('  Attributes plugin present:', JSON.stringify(asset.attributes.attributeList));
  } else {
    console.log('  Attributes plugin: NOT attached.');
  }
}

async function doAdd(assetAddress, levelValue) {
  const asset = await fetchAsset(umi, publicKey(assetAddress));
  if (asset.attributes) {
    const current = readLevel(asset);
    console.log(`Asset ${assetAddress} already has Attributes plugin (level=${current ?? 'no level key'}). Nothing to do.`);
    return;
  }
  console.log(`Adding Attributes plugin to ${assetAddress} with level=${levelValue}…`);
  const txBuilder = addPlugin(umi, {
    asset: publicKey(assetAddress),
    collection: publicKey(collectionPubkey),
    plugin: {
      type: 'Attributes',
      attributeList: [{ key: 'level', value: String(levelValue) }],
    },
  });
  const { signature } = await txBuilder.sendAndConfirm(umi);
  const sigStr = Buffer.from(signature).toString('hex');
  console.log(`  ✓ tx (hex): ${sigStr}`);
}

async function doSet(assetAddress, levelValue) {
  const asset = await fetchAsset(umi, publicKey(assetAddress));
  if (!asset.attributes) {
    console.log(`Asset ${assetAddress} has no Attributes plugin yet — falling back to add.`);
    await doAdd(assetAddress, levelValue);
    return;
  }
  const current = readLevel(asset);
  if (current === levelValue) {
    console.log(`Asset ${assetAddress} already at level ${levelValue}. Nothing to do.`);
    return;
  }
  console.log(`Updating ${assetAddress} level: ${current ?? 'none'} → ${levelValue}…`);
  // Build the new attributeList preserving other keys if any.
  const newList = (asset.attributes.attributeList || [])
    .filter((a) => a.key !== 'level')
    .concat([{ key: 'level', value: String(levelValue) }]);
  const txBuilder = updatePlugin(umi, {
    asset: publicKey(assetAddress),
    collection: publicKey(collectionPubkey),
    plugin: {
      type: 'Attributes',
      attributeList: newList,
    },
  });
  const { signature } = await txBuilder.sendAndConfirm(umi);
  const sigStr = Buffer.from(signature).toString('hex');
  console.log(`  ✓ tx (hex): ${sigStr}`);
}

async function doList(limit) {
  console.log(`Fetching all assets in collection ${collectionPubkey}…`);
  const assets = await fetchAssetsByCollection(umi, publicKey(collectionPubkey));
  console.log(`Total: ${assets.length} asset(s).`);
  const cap = Math.min(assets.length, limit || assets.length);
  for (let i = 0; i < cap; i++) {
    const a = assets[i];
    const level = readLevel(a);
    console.log(`  ${i + 1}. ${a.publicKey}  owner=${a.owner}  level=${level ?? '—'}  name="${a.name}"`);
  }
}

// Dispatch
if (action === 'read') {
  if (!args.asset) throw new Error('--asset=<pubkey> required for read');
  await doRead(args.asset);
} else if (action === 'add') {
  if (!args.asset) throw new Error('--asset=<pubkey> required for add');
  await doAdd(args.asset, Number(args.level || 1));
} else if (action === 'set') {
  if (!args.asset || args.level === undefined) throw new Error('--asset=<pubkey> --level=N required for set');
  await doSet(args.asset, Number(args.level));
} else if (action === 'list') {
  await doList(Number(args.limit || 100));
}
