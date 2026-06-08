// Deploy a Metaplex Core Candy Machine for a new configurable collection.
//
// Usage:
//   node scripts/deploy-collection-solana-core-candy-machine.mjs --collection=new-nft
//
// Output:
//   nft/deployments/<collection>-solana-mainnet.json

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import {
  loadEnv,
  NFT_DIR,
  parseSolanaKeypair,
  publicBaseUrl,
  requirePublicKey,
} from './lib-env.mjs';
import { buildUsdPriceQuote, decimalToUnits, usdToNativeUnits, unitsToDecimalString } from './lib-prices.mjs';

const LAMPORTS_PER_SOL = 1_000_000_000n;
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function argValue(name, fallback = '') {
  const row = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!row) return fallback;
  if (row === `--${name}`) return '1';
  return row.split('=').slice(1).join('=');
}

function normalizeSlug(value) {
  const slug = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('Collection slug is required. Pass --collection=<slug>.');
  return slug;
}

function envKeyPart(slug) {
  return slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function envOr(env, keys, fallback = '') {
  for (const key of keys) {
    if (env[key] != null && env[key] !== '') return env[key];
  }
  return fallback;
}

function collectionDefaults(slug) {
  if (slug === 'voidspore') return { name: 'Voidspore', symbol: 'VOID' };
  if (slug === 'dragon') {
    return {
      name: 'Dragon',
      symbol: 'DRGN',
      maxSupply: '333',
      usdPrice: '15',
      clashUsdPrice: '10',
      skrUsdPrice: '13',
    };
  }
  return {
    name: 'Clash Collection',
    symbol: 'CLASH',
    maxSupply: '555',
    usdPrice: '5.5',
    clashUsdPrice: '4',
    skrUsdPrice: '5',
  };
}

function solToLamports(solValue) {
  const [whole, frac = ''] = String(solValue || '0').split('.');
  return BigInt(whole || '0') * LAMPORTS_PER_SOL + BigInt((frac + '000000000').slice(0, 9));
}

function priceLamports(env, prefix, collectionPrefix) {
  const direct = envOr(env, [
    `${prefix}_PRICE_LAMPORTS`,
    `${collectionPrefix}_SOLANA_PRICE_LAMPORTS`,
    'NFT_COLLECTION_SOLANA_PRICE_LAMPORTS',
    'NFT_SOLANA_PRICE_LAMPORTS',
  ], '');
  if (direct) return BigInt(direct);
  const sol = envOr(env, [
    `${prefix}_PRICE_SOL`,
    `${collectionPrefix}_SOLANA_PRICE_SOL`,
    'NFT_COLLECTION_SOLANA_PRICE_SOL',
    'NFT_SOLANA_PRICE_SOL',
    'NFT_PRICE_SOL',
  ], '');
  return sol ? solToLamports(sol) : null;
}

async function getSolanaBalance(rpcUrl, address) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return BigInt(json.result.value || 0);
}

async function fetchSolanaTokenUsdPrice(env, mint, label, prefix, collectionPrefix) {
  const upper = String(label || '').toUpperCase();
  const override = envOr(env, [
    `${prefix}_${upper}_TOKEN_USD`,
    `${collectionPrefix}_SOLANA_${upper}_TOKEN_USD`,
    `NFT_COLLECTION_SOLANA_${upper}_TOKEN_USD`,
    `NFT_SOLANA_${upper}_TOKEN_USD`,
    `NFT_${upper}_USD`,
    `GAME_SHOP_SOLANA_${upper}_USD`,
  ], '');
  if (override) return String(override);

  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  if (!response.ok) throw new Error(`DexScreener ${upper} price failed: ${response.status}`);
  const json = await response.json();
  const minLiquidityUsd = Math.max(0, Number(env.NFT_SPL_MIN_LIQUIDITY_USD || 5_000));
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
  const bestPair = pairs
    .filter((pair) => (
      String(pair?.chainId || '').toLowerCase() === 'solana'
      && String(pair?.baseToken?.address || '') === String(mint)
      && Number(pair?.priceUsd) > 0
      && Number(pair?.liquidity?.usd || 0) >= minLiquidityUsd
      && ['USDC', 'USDT', 'SOL', 'WSOL'].includes(String(pair?.quoteToken?.symbol || '').toUpperCase())
    ))
    .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
  if (!bestPair) throw new Error(`DexScreener ${upper} price missing or liquidity below ${minLiquidityUsd}`);
  return String(bestPair.priceUsd);
}

async function solanaTokenProgramAndDecimals(connection, mint, fallbackDecimals = 6) {
  const account = await connection.getAccountInfo(mint);
  const tokenProgram = account?.owner?.equals?.(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  try {
    const mintInfo = await getMint(connection, mint, 'confirmed', tokenProgram);
    return {
      tokenProgram,
      decimals: Number.isInteger(mintInfo.decimals) ? mintInfo.decimals : fallbackDecimals,
    };
  } catch {
    return { tokenProgram, decimals: fallbackDecimals };
  }
}

async function ensureAta(connection, payer, owner, mint, tokenProgram, skipEnv) {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  if (skipEnv !== '1') {
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        ata,
        owner,
        mint,
        tokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ));
      await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
    }
  }
  return ata;
}

const env = loadEnv();
const collectionSlug = normalizeSlug(argValue('collection', env.NFT_COLLECTION_SLUG || env.NEW_NFT_SLUG));
const defaults = collectionDefaults(collectionSlug);
const collectionKey = envKeyPart(collectionSlug);
const collectionPrefix = `NFT_${collectionKey}`;
const prefix = `${collectionPrefix}_SOLANA`;
const baseUrl = publicBaseUrl(env);

const rpcUrl = envOr(env, [
  `${prefix}_RPC_URL`,
  'NFT_SOLANA_RPC_URL',
  'SOLANA_RPC_URL',
  'VITE_SOLANA_RPC_URL',
], 'https://solana-rpc.publicnode.com');
const maxSupply = Number(envOr(env, [
  `${prefix}_SUPPLY`,
  `${prefix}_GLOBAL_SUPPLY_CAP`,
  `${collectionPrefix}_GLOBAL_SUPPLY_CAP`,
  'NFT_COLLECTION_GLOBAL_SUPPLY_CAP',
  `${prefix}_MAX_SUPPLY`,
  `${collectionPrefix}_MAX_SUPPLY`,
  'NFT_COLLECTION_MAX_SUPPLY',
  'NFT_GLOBAL_SUPPLY_CAP',
], defaults.maxSupply));
if (!Number.isInteger(maxSupply) || maxSupply <= 0) throw new Error(`Bad Solana maxSupply: ${maxSupply}`);

const useConfigLines = env[`${prefix}_USE_CONFIG_LINES`] === '1'
  || env.NFT_SOLANA_USE_CONFIG_LINES === '1'
  || String(envOr(env, [`${prefix}_METADATA_MODE`, 'NFT_SOLANA_METADATA_MODE'], '')).toLowerCase() === 'config-lines';
const metadataMode = useConfigLines ? 'config-lines' : 'hidden-settings';

const solanaKeypair = parseSolanaKeypair(env);
const connection = new Connection(rpcUrl, 'confirmed');
const balance = await getSolanaBalance(rpcUrl, solanaKeypair.publicKey.toBase58());
const minSol = Number(envOr(env, [
  `${prefix}_DEPLOY_MIN_SOL`,
  'NFT_COLLECTION_SOLANA_DEPLOY_MIN_SOL',
  'NFT_SOLANA_DEPLOY_MIN_SOL',
], useConfigLines ? '0.6' : '0.02'));

console.log(`Solana deployer: ${solanaKeypair.publicKey.toBase58()}`);
console.log(`Solana balance: ${Number(balance) / Number(LAMPORTS_PER_SOL)} SOL`);
console.log(`Collection slug: ${collectionSlug}`);
console.log(`Solana max supply: ${maxSupply}`);
console.log(`Solana metadata mode: ${metadataMode}`);
if (balance < solToLamports(String(minSol))) {
  throw new Error(`Solana balance is below ${minSol} SOL. Fund deployer before creating collection/candy machine.`);
}

const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
const { dateTime, generateSigner, keypairIdentity, lamports, none, publicKey, some, transactionBuilder } = await import('@metaplex-foundation/umi');
const { mplCore, createCollectionV1 } = await import('@metaplex-foundation/mpl-core');
const {
  addConfigLines,
  create,
  findCandyGuardPda,
  mplCandyMachine,
} = await import('@metaplex-foundation/mpl-core-candy-machine');

const umi = createUmi(rpcUrl).use(mplCore()).use(mplCandyMachine());
const umiKeypair = umi.eddsa.createKeypairFromSecretKey(solanaKeypair.secretKey);
umi.use(keypairIdentity(umiKeypair));

const name = argValue('name', envOr(env, [
  `${prefix}_NAME`,
  `${collectionPrefix}_NAME`,
  'NFT_COLLECTION_NAME',
  'NEW_NFT_NAME',
], defaults.name));
const symbol = argValue('symbol', envOr(env, [
  `${prefix}_SYMBOL`,
  `${collectionPrefix}_SYMBOL`,
  'NFT_COLLECTION_SYMBOL',
  'NEW_NFT_SYMBOL',
], defaults.symbol));
const usdAmount = envOr(env, [
  `${prefix}_USD_PRICE`,
  `${collectionPrefix}_SOLANA_USD_PRICE`,
  `${collectionPrefix}_USD_PRICE`,
  'NFT_COLLECTION_SOLANA_USD_PRICE',
  'NFT_COLLECTION_USD_PRICE',
], defaults.usdPrice);
const quote = await buildUsdPriceQuote(env, usdAmount);
const price = priceLamports(env, prefix, collectionPrefix) || quote.solLamports;
const usdcAmount = decimalToUnits(usdAmount, 6);
const skrUsdAmount = envOr(env, [
  `${prefix}_SKR_USD_PRICE`,
  `${collectionPrefix}_SOLANA_SKR_USD_PRICE`,
  `${collectionPrefix}_SKR_USD_PRICE`,
  'NFT_COLLECTION_SOLANA_SKR_USD_PRICE',
  'NFT_COLLECTION_SKR_USD_PRICE',
], defaults.skrUsdPrice);
const saleActive = ['1', 'true'].includes(String(envOr(env, [
  `${prefix}_SALE_ACTIVE`,
  'NFT_COLLECTION_SOLANA_SALE_ACTIVE',
  'NFT_SOLANA_SALE_ACTIVE',
], '0')).toLowerCase());
const closedStartDate = envOr(env, [
  `${prefix}_CLOSED_START_DATE`,
  'NFT_SOLANA_CLOSED_START_DATE',
], '2100-01-01T00:00:00.000Z');
const startDate = envOr(env, [
  `${prefix}_START_DATE`,
  'NFT_SOLANA_START_DATE',
], saleActive ? '' : closedStartDate);
const destination = envOr(env, [
  `${prefix}_TREASURY`,
  `${collectionPrefix}_TREASURY`,
  'NFT_COLLECTION_SOLANA_TREASURY',
  'NFT_SOLANA_TREASURY',
], '')
  ? requirePublicKey(envOr(env, [
      `${prefix}_TREASURY`,
      `${collectionPrefix}_TREASURY`,
      'NFT_COLLECTION_SOLANA_TREASURY',
      'NFT_SOLANA_TREASURY',
    ]), 'Solana treasury').toBase58()
  : umi.identity.publicKey;

const treasuryPk = new PublicKey(destination.toString());
const usdcMint = new PublicKey(envOr(env, [
  `${prefix}_USDC_MINT`,
  `${collectionPrefix}_SOLANA_USDC_MINT`,
  'NFT_COLLECTION_SOLANA_USDC_MINT',
  'NFT_SOLANA_USDC_MINT',
], USDC_MINT));
const usdcDestinationAta = await ensureAta(
  connection,
  solanaKeypair,
  treasuryPk,
  usdcMint,
  TOKEN_PROGRAM_ID,
  envOr(env, [`${prefix}_SKIP_USDC_ATA`, 'NFT_COLLECTION_SOLANA_SKIP_USDC_ATA'], '0'),
);

async function buildSplPaymentGroup({ label, mintRaw, usdAmountForGroup, envTokenPrefix, defaultDecimals = 6 }) {
  if (!mintRaw) return null;
  const mint = new PublicKey(mintRaw);
  const fallbackDecimals = Number(envOr(env, [
    `${prefix}_${envTokenPrefix}_DECIMALS`,
    `${collectionPrefix}_SOLANA_${envTokenPrefix}_DECIMALS`,
    `NFT_COLLECTION_SOLANA_${envTokenPrefix}_DECIMALS`,
    `GAME_SHOP_SOLANA_${envTokenPrefix}_DECIMALS`,
  ], String(defaultDecimals)));
  const { tokenProgram, decimals } = await solanaTokenProgramAndDecimals(connection, mint, fallbackDecimals);
  const tokenProgramLabel = tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'token-2022' : 'spl-token';
  const destinationAta = await ensureAta(
    connection,
    solanaKeypair,
    treasuryPk,
    mint,
    tokenProgram,
    envOr(env, [`${prefix}_SKIP_${envTokenPrefix}_ATA`, `NFT_COLLECTION_SOLANA_SKIP_${envTokenPrefix}_ATA`], '0'),
  );
  const tokenUsd = await fetchSolanaTokenUsdPrice(env, mint.toBase58(), envTokenPrefix, prefix, collectionPrefix);
  const amount = usdToNativeUnits(usdAmountForGroup, tokenUsd, decimals);
  return {
    usdPrice: usdAmountForGroup,
    tokenUsd,
    amount: amount.toString(),
    amountUi: unitsToDecimalString(amount, decimals),
    decimals,
    symbol: label,
    tokenProgram: tokenProgramLabel,
    mint: mint.toBase58(),
    destinationAta: destinationAta.toBase58(),
  };
}

let skrPaymentGroup = null;
const skrMintRaw = envOr(env, [
  `${prefix}_SKR_MINT`,
  `${collectionPrefix}_SOLANA_SKR_MINT`,
  'NFT_COLLECTION_SOLANA_SKR_MINT',
  'NFT_SOLANA_SKR_MINT',
  'GAME_SHOP_SOLANA_SKR_MINT',
], '');
if (skrMintRaw) {
  skrPaymentGroup = await buildSplPaymentGroup({
    label: 'SKR',
    mintRaw: skrMintRaw,
    usdAmountForGroup: skrUsdAmount,
    envTokenPrefix: 'SKR',
  });
}

let clashPaymentGroup = null;
const clashUsdAmount = envOr(env, [
  `${prefix}_CLASH_USD_PRICE`,
  `${collectionPrefix}_SOLANA_CLASH_USD_PRICE`,
  `${collectionPrefix}_CLASH_USD_PRICE`,
  'NFT_COLLECTION_SOLANA_CLASH_USD_PRICE',
  'NFT_COLLECTION_CLASH_USD_PRICE',
], defaults.clashUsdPrice);
const clashMintRaw = envOr(env, [
  `${prefix}_CLASH_MINT`,
  `${collectionPrefix}_SOLANA_CLASH_MINT`,
  'NFT_COLLECTION_SOLANA_CLASH_MINT',
  'NFT_SOLANA_CLASH_MINT',
  'GAME_SHOP_SOLANA_CLASH_MINT',
], '');
if (clashMintRaw) {
  clashPaymentGroup = await buildSplPaymentGroup({
    label: 'CLASH',
    mintRaw: clashMintRaw,
    usdAmountForGroup: clashUsdAmount,
    envTokenPrefix: 'CLASH',
  });
}

const collection = generateSigner(umi);
const candyMachine = generateSigner(umi);
const collectionUri = envOr(env, [
  `${prefix}_COLLECTION_URI`,
  `${collectionPrefix}_SOLANA_COLLECTION_URI`,
  'NFT_COLLECTION_SOLANA_COLLECTION_URI',
], `${baseUrl}/api/nft/${collectionSlug}/solana/collection`);
const hiddenUri = envOr(env, [
  `${prefix}_HIDDEN_URI`,
  `${collectionPrefix}_SOLANA_HIDDEN_URI`,
  'NFT_COLLECTION_SOLANA_HIDDEN_URI',
], `${baseUrl}/api/nft/${collectionSlug}/solana/hidden`);
const itemUriBase = envOr(env, [
  `${prefix}_ITEM_URI_BASE`,
  `${collectionPrefix}_SOLANA_ITEM_URI_BASE`,
  'NFT_COLLECTION_SOLANA_ITEM_URI_BASE',
], `${baseUrl}/api/nft/${collectionSlug}/solana/`);
const hiddenHash = Uint8Array.from(
  crypto.createHash('sha256').update(JSON.stringify({
    collectionSlug,
    name,
    symbol,
    hiddenUri,
    maxSupply,
  })).digest(),
);

const configLineSettings = useConfigLines
  ? {
      prefixName: '',
      nameLength: 32,
      prefixUri: '',
      uriLength: 200,
      isSequential: true,
    }
  : none();
const hiddenSettings = useConfigLines
  ? none()
  : some({
      name,
      uri: hiddenUri,
      hash: hiddenHash,
    });

const startDateGuard = startDate ? some({ date: dateTime(startDate) }) : none();
const paymentGroups = {
  sol: {
    usdPrice: usdAmount,
    solUsd: quote.solUsd,
    lamports: price.toString(),
    destination: destination.toString(),
  },
  usdc: {
    usdPrice: usdAmount,
    amount: usdcAmount.toString(),
    decimals: 6,
    symbol: 'USDC',
    mint: usdcMint.toBase58(),
    destinationAta: usdcDestinationAta.toBase58(),
  },
};
if (skrPaymentGroup) paymentGroups.skr = skrPaymentGroup;
if (clashPaymentGroup) paymentGroups.clash = clashPaymentGroup;

const groups = [
  {
    label: 'sol',
    guards: {
      solPayment: some({
        lamports: lamports(price),
        destination: publicKey(destination.toString()),
      }),
      startDate: startDateGuard,
    },
  },
  {
    label: 'usdc',
    guards: {
      tokenPayment: some({
        amount: usdcAmount,
        mint: publicKey(usdcMint.toBase58()),
        destinationAta: publicKey(usdcDestinationAta.toBase58()),
      }),
      startDate: startDateGuard,
    },
  },
];
if (skrPaymentGroup) {
  groups.push({
    label: 'skr',
    guards: {
      tokenPayment: some({
        amount: BigInt(skrPaymentGroup.amount),
        mint: publicKey(skrPaymentGroup.mint),
        destinationAta: publicKey(skrPaymentGroup.destinationAta),
      }),
      startDate: startDateGuard,
    },
  });
}
if (clashPaymentGroup) {
  const paymentGuard = String(clashPaymentGroup.tokenProgram || clashPaymentGroup.program || '').toLowerCase().includes('2022')
    ? 'token2022Payment'
    : 'tokenPayment';
  groups.push({
    label: 'clash',
    guards: {
      [paymentGuard]: some({
        amount: BigInt(clashPaymentGroup.amount),
        mint: publicKey(clashPaymentGroup.mint),
        destinationAta: publicKey(clashPaymentGroup.destinationAta),
      }),
      startDate: startDateGuard,
    },
  });
}

console.log(`Creating MPL Core collection: ${collection.publicKey}`);
console.log(`Creating Core Candy Machine: ${candyMachine.publicKey}`);
await transactionBuilder()
  .add(createCollectionV1(umi, {
    collection,
    name,
    uri: collectionUri,
    plugins: none(),
  }))
  .add(await create(umi, {
    candyMachine,
    collection: collection.publicKey,
    collectionUpdateAuthority: umi.identity,
    itemsAvailable: maxSupply,
    maxEditionSupply: 0,
    isMutable: true,
    configLineSettings,
    hiddenSettings,
    guards: {
      startDate: startDateGuard,
    },
    groups,
  }))
  .sendAndConfirm(umi);

if (useConfigLines) {
  const batchSize = Number(envOr(env, [`${prefix}_CONFIG_BATCH_SIZE`, 'NFT_SOLANA_CONFIG_BATCH_SIZE'], '8'));
  for (let start = 0; start < maxSupply; start += batchSize) {
    const configLines = [];
    for (let i = start + 1; i <= Math.min(start + batchSize, maxSupply); i++) {
      configLines.push({
        name: `${name} #${i}`,
        uri: `${itemUriBase}${i}`,
      });
    }
    console.log(`Adding config lines ${start + 1}-${start + configLines.length}`);
    await addConfigLines(umi, {
      candyMachine: candyMachine.publicKey,
      index: start,
      configLines,
    }).sendAndConfirm(umi);
  }
} else {
  console.log(`Using hidden settings metadata: ${hiddenUri}`);
}

const [candyGuard] = findCandyGuardPda(umi, { base: candyMachine.publicKey });
const deployment = {
  collectionSlug,
  chain: 'solana',
  standard: 'metaplex-core-candy-machine',
  rpcUrl,
  authority: umi.identity.publicKey,
  collection: collection.publicKey,
  candyMachine: candyMachine.publicKey,
  candyGuard,
  maxSupply,
  globalSupplyCap: maxSupply,
  usdPrice: usdAmount,
  priceLamports: price.toString(),
  treasury: destination.toString(),
  paymentGroups,
  saleActive,
  startDate: startDate || null,
  metadataBase: `${baseUrl}/api/nft/${collectionSlug}/solana/`,
  metadataMode,
  collectionUri,
  hiddenUri: useConfigLines ? null : hiddenUri,
  hiddenHash: useConfigLines ? null : Buffer.from(hiddenHash).toString('hex'),
  deployedAt: new Date().toISOString(),
};
fs.mkdirSync(path.join(NFT_DIR, 'deployments'), { recursive: true });
const deploymentPath = path.join(NFT_DIR, 'deployments', `${collectionSlug}-solana-mainnet.json`);
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Solana deployment saved: ${deploymentPath}`);
