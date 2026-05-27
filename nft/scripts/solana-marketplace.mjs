import fs from 'node:fs';
import path from 'node:path';
import bs58 from 'bs58';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { NFT_DIR, loadEnv, parseSolanaKeypair, requirePublicKey } from './lib-env.mjs';

const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const SOL_MINT = new PublicKey('11111111111111111111111111111111');
const CONFIG_SEED = Buffer.from('config');
const LISTING_SEED = Buffer.from('listing');
const CONFIG_TAG = Buffer.from('CPMCONF1');
const LISTING_TAG = Buffer.from('CPMLIST1');

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const i = arg.indexOf('=');
    if (i === -1) args[arg.replace(/^--/, '')] = 'true';
    else args[arg.slice(2, i)] = arg.slice(i + 1);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/solana-marketplace.mjs pda [--asset=<coreAsset>]
  node scripts/solana-marketplace.mjs init [--fee-bps=100] [--treasury=<pubkey>] [--collection=<pubkey>]
  node scripts/solana-marketplace.mjs update-config --fee-bps=100 [--treasury=<pubkey>] [--collection=<pubkey>]
  node scripts/solana-marketplace.mjs list --asset=<coreAsset> --price-lamports=<amount> [--payment-mint=<mint>] [--expires-at=<unix>]
  node scripts/solana-marketplace.mjs cancel --asset=<coreAsset>
  node scripts/solana-marketplace.mjs buy --asset=<coreAsset> --seller=<pubkey> [--buyer-token=<ata> --seller-token=<ata> --treasury-token=<ata>]
  node scripts/solana-marketplace.mjs read [--asset=<coreAsset>]

Requires NFT_SOLANA_MARKETPLACE_PROGRAM_ID after deploying nft/solana/marketplace.
The marketplace program charges market_fee_bps to treasury; default is 100 bps (1%).`);
}

function u16le(value) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(Number(value), 0);
  return b;
}

function u64le(value) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(value), 0);
  return b;
}

function i64le(value) {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(value), 0);
  return b;
}

function pubkey(value, label) {
  return requirePublicKey(String(value || '').trim(), label);
}

function readPubkey(data, offset) {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function readConfig(data) {
  if (!data || data.length < 139 || !data.subarray(0, 8).equals(CONFIG_TAG)) return null;
  return {
    bump: data[8],
    marketFeeBps: data.readUInt16LE(9),
    authority: readPubkey(data, 11),
    treasury: readPubkey(data, 43),
    collection: readPubkey(data, 75),
  };
}

function readListing(data) {
  if (!data || data.length < 154 || !data.subarray(0, 8).equals(LISTING_TAG)) return null;
  return {
    bump: data[8],
    active: data[9] !== 0,
    seller: readPubkey(data, 10),
    asset: readPubkey(data, 42),
    collection: readPubkey(data, 74),
    paymentMint: readPubkey(data, 106),
    price: data.readBigUInt64LE(138).toString(),
    expiresAt: data.readBigInt64LE(146).toString(),
  };
}

function deploymentPath() {
  return path.join(NFT_DIR, 'deployments', 'solana-mainnet.json');
}

function loadDeployment() {
  const file = deploymentPath();
  if (!fs.existsSync(file)) throw new Error('Missing nft/deployments/solana-mainnet.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveDeployment(update) {
  const file = deploymentPath();
  const deployment = loadDeployment();
  fs.writeFileSync(file, `${JSON.stringify({ ...deployment, ...update }, null, 2)}\n`);
}

function resolveProgramId(env, args) {
  const raw = args['program-id'] || env.NFT_SOLANA_MARKETPLACE_PROGRAM_ID;
  if (!raw) throw new Error('Missing NFT_SOLANA_MARKETPLACE_PROGRAM_ID or --program-id=<pubkey>');
  return pubkey(raw, 'NFT_SOLANA_MARKETPLACE_PROGRAM_ID');
}

function configPda(programId) {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

function listingPda(programId, asset) {
  return PublicKey.findProgramAddressSync([LISTING_SEED, asset.toBuffer()], programId);
}

function marketplaceIx({ programId, keys, data }) {
  return new TransactionInstruction({ programId, keys, data });
}

async function send(connection, payer, instructions) {
  const tx = new Transaction().add(...instructions);
  return sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
}

async function ensureTransferDelegate({ rpcUrl, payer, asset, collection, delegate }) {
  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const { keypairIdentity, publicKey } = await import('@metaplex-foundation/umi');
  const {
    addPlugin,
    approvePluginAuthority,
    fetchAsset,
    mplCore,
  } = await import('@metaplex-foundation/mpl-core');

  const umi = createUmi(rpcUrl).use(mplCore());
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(payer.secretKey);
  umi.use(keypairIdentity(umiKeypair));

  const assetPk = publicKey(asset.toBase58());
  const collectionPk = publicKey(collection.toBase58());
  const delegatePk = publicKey(delegate.toBase58());
  const fetched = await fetchAsset(umi, assetPk);
  if (!fetched.transferDelegate) {
    const { signature } = await addPlugin(umi, {
      asset: assetPk,
      collection: collectionPk,
      plugin: {
        type: 'TransferDelegate',
        authority: { type: 'Address', address: delegatePk },
      },
    }).sendAndConfirm(umi, {
      send: { maxRetries: 5 },
      confirm: { commitment: 'confirmed' },
    });
    console.log(`transferDelegate add tx=${bs58.encode(signature)}`);
    return;
  }

  try {
    const { signature } = await approvePluginAuthority(umi, {
      asset: assetPk,
      collection: collectionPk,
      plugin: { type: 'TransferDelegate' },
      newAuthority: { type: 'Address', address: delegatePk },
    }).sendAndConfirm(umi, {
      send: { maxRetries: 5 },
      confirm: { commitment: 'confirmed' },
    });
    console.log(`transferDelegate approve tx=${bs58.encode(signature)}`);
  } catch (err) {
    console.warn(`TransferDelegate already exists and could not be re-approved by owner: ${err?.message || err}`);
    console.warn('Continuing; buy will only work if the current delegate is this listing PDA.');
  }
}

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));
if (!command || command === 'help' || args.help || args.h) {
  usage();
  process.exit(command ? 0 : 1);
}

const env = loadEnv();
const deployment = loadDeployment();
const rpcUrl = args.rpc
  || env.NFT_SOLANA_RPC_URL
  || env.SOLANA_RPC_URL
  || env.VITE_SOLANA_RPC_URL
  || deployment.rpcUrl
  || 'https://solana-rpc.publicnode.com';
const connection = new Connection(rpcUrl, 'confirmed');
const programId = resolveProgramId(env, args);
const [config, configBump] = configPda(programId);

const needsSigner = !['pda', 'read'].includes(command);
let payer = null;
if (needsSigner) {
  const kp = parseSolanaKeypair(env);
  payer = Keypair.fromSecretKey(kp.secretKey);
}

if (command === 'pda') {
  const out = { programId: programId.toBase58(), config: config.toBase58(), configBump };
  if (args.asset) {
    const asset = pubkey(args.asset, 'asset');
    const [listing, listingBump] = listingPda(programId, asset);
    out.asset = asset.toBase58();
    out.listing = listing.toBase58();
    out.listingBump = listingBump;
  }
  console.log(JSON.stringify(out, null, 2));
} else if (command === 'read') {
  const configAccount = await connection.getAccountInfo(config);
  const out = { programId: programId.toBase58(), config: config.toBase58(), configState: readConfig(configAccount?.data || null) };
  if (args.asset) {
    const asset = pubkey(args.asset, 'asset');
    const [listing] = listingPda(programId, asset);
    const listingAccount = await connection.getAccountInfo(listing);
    out.asset = asset.toBase58();
    out.listing = listing.toBase58();
    out.listingState = readListing(listingAccount?.data || null);
  }
  console.log(JSON.stringify(out, null, 2));
} else if (command === 'init' || command === 'update-config') {
  const feeBps = Number(args['fee-bps'] || env.NFT_SOLANA_MARKETPLACE_FEE_BPS || 100);
  const treasury = pubkey(args.treasury || env.NFT_SOLANA_MARKETPLACE_TREASURY || env.NFT_SOLANA_TREASURY || deployment.treasury, 'treasury');
  const collection = pubkey(args.collection || env.NFT_SOLANA_COLLECTION || deployment.collection, 'collection');
  const data = Buffer.concat([Buffer.from([command === 'init' ? 0 : 1]), u16le(feeBps)]);
  const sig = await send(connection, payer, [marketplaceIx({
    programId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: collection, isSigner: false, isWritable: false },
      ...(command === 'init' ? [{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }] : []),
    ],
    data,
  })]);
  saveDeployment({
    solanaMarketplaceProgram: programId.toBase58(),
    solanaMarketplaceConfig: config.toBase58(),
    solanaMarketplaceFeeBps: feeBps,
    solanaMarketplaceTreasury: treasury.toBase58(),
    solanaMarketplaceCollection: collection.toBase58(),
    solanaMarketplaceUpdatedAt: new Date().toISOString(),
  });
  console.log(`${command} tx=${sig}`);
} else if (command === 'list') {
  const asset = pubkey(args.asset, 'asset');
  const collection = pubkey(args.collection || env.NFT_SOLANA_COLLECTION || deployment.collection, 'collection');
  const paymentMint = args['payment-mint'] ? pubkey(args['payment-mint'], 'payment-mint') : SOL_MINT;
  const price = args['price-lamports'] || args.price;
  if (!price || BigInt(price) <= 0n) throw new Error('--price-lamports=<amount> is required');
  const expiresAt = args['expires-at'] || '0';
  const [listing] = listingPda(programId, asset);
  const data = Buffer.concat([Buffer.from([2]), u64le(price), paymentMint.toBuffer(), i64le(expiresAt)]);
  await ensureTransferDelegate({ rpcUrl, payer, asset, collection, delegate: listing });
  const sig = await send(connection, payer, [
    marketplaceIx({
      programId,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: listing, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: collection, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
  ]);
  console.log(`list tx=${sig}`);
  console.log(`listing=${listing.toBase58()}`);
} else if (command === 'cancel') {
  const asset = pubkey(args.asset, 'asset');
  const [listing] = listingPda(programId, asset);
  const sig = await send(connection, payer, [marketplaceIx({
    programId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: listing, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([3]),
  })]);
  console.log(`cancel tx=${sig}`);
} else if (command === 'buy') {
  const asset = pubkey(args.asset, 'asset');
  const seller = pubkey(args.seller, 'seller');
  const treasury = pubkey(args.treasury || env.NFT_SOLANA_MARKETPLACE_TREASURY || env.NFT_SOLANA_TREASURY || deployment.treasury, 'treasury');
  const collection = pubkey(args.collection || env.NFT_SOLANA_COLLECTION || deployment.collection, 'collection');
  const [listing] = listingPda(programId, asset);
  const keys = [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: listing, isSigner: false, isWritable: true },
    { pubkey: seller, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: asset, isSigner: false, isWritable: true },
    { pubkey: collection, isSigner: false, isWritable: false },
    { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  if (args['buyer-token'] || args['seller-token'] || args['treasury-token']) {
    keys.push(
      { pubkey: pubkey(args['buyer-token'], 'buyer-token'), isSigner: false, isWritable: true },
      { pubkey: pubkey(args['seller-token'], 'seller-token'), isSigner: false, isWritable: true },
      { pubkey: pubkey(args['treasury-token'], 'treasury-token'), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    );
  }
  const sig = await send(connection, payer, [marketplaceIx({ programId, keys, data: Buffer.from([4]) })]);
  console.log(`buy tx=${sig}`);
} else {
  throw new Error(`Unknown command: ${command}`);
}
