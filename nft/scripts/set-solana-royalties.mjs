import fs from 'node:fs';
import path from 'node:path';
import bs58 from 'bs58';
import { NFT_DIR, loadEnv, parseSolanaKeypair, requirePublicKey } from './lib-env.mjs';

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const i = arg.indexOf('=');
    return i === -1 ? [arg.replace(/^--/, ''), 'true'] : [arg.slice(2, i), arg.slice(i + 1)];
  }));
}

function usage() {
  console.log(`Usage:
  node scripts/set-solana-royalties.mjs [--deployment=solana-mainnet.json] [--bps=250] [--treasury=<pubkey>] [--collection=<pubkey>] [--dry-run]

Adds or updates the Metaplex Core Royalties collection plugin for a Solana collection.
Defaults: --deployment=solana-mainnet.json, --bps from NFT_SOLANA_ROYALTY_BPS / NFT_SELLER_FEE_BASIS_POINTS / 250, treasury from env or the deployment file.`);
}

function sameRoyalties(current, expected) {
  if (!current) return false;
  const creators = current.creators || [];
  return Number(current.basisPoints) === expected.basisPoints
    && creators.length === 1
    && String(creators[0].address) === String(expected.creators[0].address)
    && Number(creators[0].percentage) === 100;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  usage();
  process.exit(0);
}

const deploymentFile = String(args.deployment || 'solana-mainnet.json').trim();
if (!/^[A-Za-z0-9_.-]+\.json$/.test(deploymentFile)) {
  throw new Error('--deployment must be a deployment JSON filename, for example solana-mainnet.json or dragon-solana-mainnet.json');
}
const deploymentPath = path.join(NFT_DIR, 'deployments', deploymentFile);
if (!fs.existsSync(deploymentPath)) {
  throw new Error(`Missing nft/deployments/${deploymentFile}`);
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const env = loadEnv();
const rpcUrl = args.rpc
  || env.NFT_SOLANA_RPC_URL
  || env.SOLANA_RPC_URL
  || env.VITE_SOLANA_RPC_URL
  || deployment.rpcUrl
  || 'https://solana-rpc.publicnode.com';

const royaltyBps = Number(args.bps || env.NFT_SOLANA_ROYALTY_BPS || env.NFT_SELLER_FEE_BASIS_POINTS || 250);
if (!Number.isInteger(royaltyBps) || royaltyBps < 0 || royaltyBps > 1000) {
  throw new Error('--bps must be an integer between 0 and 1000');
}

const collectionPubkey = String(args.collection || env.NFT_SOLANA_COLLECTION || deployment.collection || '').trim();
if (!collectionPubkey) throw new Error('Missing Solana collection address');
requirePublicKey(collectionPubkey, 'collection');

const treasury = String(
  args.treasury
  || env.NFT_SOLANA_ROYALTY_TREASURY
  || env.NFT_SOLANA_FEE_RECIPIENT
  || env.NFT_SOLANA_TREASURY
  || deployment.royaltyTreasury
  || deployment.treasury
  || '',
).trim();
if (!treasury) throw new Error('Missing royalty treasury. Set NFT_SOLANA_TREASURY or pass --treasury=<pubkey>.');
requirePublicKey(treasury, 'treasury');

const keypair = parseSolanaKeypair(env);

const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
const { keypairIdentity, publicKey } = await import('@metaplex-foundation/umi');
const {
  addCollectionPlugin,
  fetchCollection,
  mplCore,
  ruleSet,
  updateCollectionPlugin,
} = await import('@metaplex-foundation/mpl-core');

const umi = createUmi(rpcUrl).use(mplCore());
const umiKeypair = umi.eddsa.createKeypairFromSecretKey(keypair.secretKey);
umi.use(keypairIdentity(umiKeypair));

const plugin = {
  type: 'Royalties',
  basisPoints: royaltyBps,
  creators: [{ address: publicKey(treasury), percentage: 100 }],
  ruleSet: ruleSet('None'),
};

console.log(`Authority: ${umi.identity.publicKey}`);
console.log(`Deployment: ${deploymentFile}`);
console.log(`Collection: ${collectionPubkey}`);
console.log(`Royalty: ${royaltyBps} bps -> ${treasury}`);

const before = await fetchCollection(umi, publicKey(collectionPubkey));
const hadRoyalties = Boolean(before.royalties);
if (sameRoyalties(before.royalties, plugin)) {
  console.log('Collection royalties already match. Nothing to do.');
  if (deployment.royaltyBps !== royaltyBps || deployment.royaltyTreasury !== treasury) {
    fs.writeFileSync(deploymentPath, `${JSON.stringify({
      ...deployment,
      royaltyBps,
      royaltyTreasury: treasury,
      royaltyRuleSet: 'None',
      royaltyUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    console.log(`Updated ${deploymentPath}`);
  }
} else if (args['dry-run'] === 'true') {
  console.log(hadRoyalties ? 'Dry run: would update Royalties plugin.' : 'Dry run: would add Royalties plugin.');
} else {
  const makeBuilder = () => (hadRoyalties
    ? updateCollectionPlugin(umi, {
        collection: publicKey(collectionPubkey),
        plugin,
      })
    : addCollectionPlugin(umi, {
        collection: publicKey(collectionPubkey),
        plugin,
      }));

  let signature = null;
  let tx = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await makeBuilder().sendAndConfirm(umi, {
        send: { maxRetries: 5 },
        confirm: { commitment: 'confirmed' },
      });
      signature = result.signature;
      tx = bs58.encode(signature);
      break;
    } catch (err) {
      const maybeTx = err?.signature || null;
      console.warn(`Attempt ${attempt} failed: ${err?.message || err}`);
      await sleep(2500);
      const fetched = await fetchCollection(umi, publicKey(collectionPubkey)).catch(() => null);
      if (sameRoyalties(fetched?.royalties, plugin)) {
        tx = maybeTx || 'unknown-confirmed-after-retry';
        break;
      }
      if (attempt === 3) throw err;
    }
  }
  console.log(`${hadRoyalties ? 'Updated' : 'Added'} Royalties plugin. tx=${tx}`);

  const after = await fetchCollection(umi, publicKey(collectionPubkey));
  if (!sameRoyalties(after.royalties, plugin)) {
    throw new Error('Royalties transaction confirmed, but fetched collection does not match expected config.');
  }

  const updated = {
    ...deployment,
    royaltyBps,
    royaltyTreasury: treasury,
    royaltyRuleSet: 'None',
    royaltyTx: tx,
    royaltyUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`Updated ${deploymentPath}`);
}
