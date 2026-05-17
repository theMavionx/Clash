import fs from 'node:fs';
import path from 'node:path';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { dateTime, keypairIdentity, lamports, none, publicKey, some } from '@metaplex-foundation/umi';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplCandyMachine, updateCandyGuard } from '@metaplex-foundation/mpl-core-candy-machine';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { loadEnv, NFT_DIR, parseSolanaKeypair, requirePublicKey } from './lib-env.mjs';
import { buildUsdPriceQuote, usdToNativeUnits, unitsToDecimalString } from './lib-prices.mjs';
import { buildSolanaGuardConfig } from './lib-solana-guards.mjs';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchSolanaTokenUsdPrice(env, mint, label) {
  const override = env[`NFT_${label}_USD`]
    || env[`NFT_SOLANA_${label}_USD`]
    || env[`GAME_SHOP_SOLANA_${label}_USD`];
  if (override) return String(override);

  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  if (!response.ok) throw new Error(`DexScreener ${label} price failed: ${response.status}`);
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
  if (!bestPair) throw new Error(`DexScreener ${label} price missing or liquidity below ${minLiquidityUsd}`);
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

async function finalizedSignatureStatus(connection, signature) {
  for (let i = 0; i < 20; i += 1) {
    const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
    if (status.value?.err) return status.value;
    if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
      return status.value;
    }
    await sleep(1500);
  }
  return null;
}

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'solana-mainnet.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/solana-mainnet.json');

async function sendAndConfirmOrFinalized(connection, transaction, signers) {
  try {
    return await sendAndConfirmTransaction(connection, transaction, signers, { commitment: 'confirmed' });
  } catch (err) {
    if (!err.signature) throw err;
    const status = await finalizedSignatureStatus(connection, err.signature);
    if (status?.err) throw err;
    if (status) {
      return err.signature;
    }
    throw err;
  }
}

async function sendUmiOrFinalized(connection, builder, umi) {
  try {
    return await builder.sendAndConfirm(umi);
  } catch (err) {
    if (!err.signature) throw err;
    const status = await finalizedSignatureStatus(connection, err.signature);
    if (status?.err) throw err;
    if (status) {
      return { signature: err.signature };
    }
    throw err;
  }
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const rpcUrl = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_URL || deployment.rpcUrl || 'https://solana-rpc.publicnode.com';
const keypair = parseSolanaKeypair(env);
const connection = new Connection(rpcUrl, 'confirmed');
const umi = createUmi(rpcUrl).use(mplCore()).use(mplCandyMachine());
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(keypair.secretKey)));

const usdAmount = env.NFT_SOLANA_USD_PRICE || env.NFT_USD_PRICE || '8.9';
const quote = await buildUsdPriceQuote(env, usdAmount);
const treasury = env.NFT_SOLANA_TREASURY
  ? requirePublicKey(env.NFT_SOLANA_TREASURY, 'NFT_SOLANA_TREASURY')
  : new PublicKey(deployment.treasury || keypair.publicKey.toBase58());
const usdcMint = new PublicKey(env.NFT_SOLANA_USDC_MINT || USDC_MINT);
const usdcDestinationAta = getAssociatedTokenAddressSync(
  usdcMint,
  treasury,
  false,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
);

if (env.NFT_SOLANA_SKIP_USDC_ATA !== '1') {
  const ataInfo = await connection.getAccountInfo(usdcDestinationAta);
  if (!ataInfo) {
    const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(
      keypair.publicKey,
      usdcDestinationAta,
      treasury,
      usdcMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ));
    const ataSig = await sendAndConfirmOrFinalized(connection, tx, [keypair]);
    console.log(`Created/confirmed Solana USDC destination ATA: ${usdcDestinationAta.toBase58()} tx=${ataSig}`);
  }
}

let skrPaymentGroup = deployment.paymentGroups?.skr || null;
const skrMintRaw = env.NFT_SOLANA_SKR_MINT
  || env.GAME_SHOP_SOLANA_SKR_MINT
  || deployment.paymentGroups?.skr?.mint
  || '';
if (skrMintRaw) {
  const skrMint = new PublicKey(skrMintRaw);
  const envSkrDecimals = env.NFT_SOLANA_SKR_DECIMALS || env.GAME_SHOP_SOLANA_SKR_DECIMALS;
  const fallbackSkrDecimals = envSkrDecimals ? Number(envSkrDecimals) : 6;
  const { tokenProgram, decimals: skrDecimals } = await solanaTokenProgramAndDecimals(connection, skrMint, fallbackSkrDecimals);
  const skrDestinationAta = getAssociatedTokenAddressSync(
    skrMint,
    treasury,
    false,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  if (env.NFT_SOLANA_SKIP_SKR_ATA !== '1') {
    const ataInfo = await connection.getAccountInfo(skrDestinationAta);
    if (!ataInfo) {
      const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey,
        skrDestinationAta,
        treasury,
        skrMint,
        tokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ));
      const ataSig = await sendAndConfirmOrFinalized(connection, tx, [keypair]);
      console.log(`Created/confirmed Solana SKR destination ATA: ${skrDestinationAta.toBase58()} tx=${ataSig}`);
    }
  }
  const skrUsd = await fetchSolanaTokenUsdPrice(env, skrMint.toBase58(), 'SKR');
  const skrUnits = usdToNativeUnits(usdAmount, skrUsd, skrDecimals);
  skrPaymentGroup = {
    usdPrice: usdAmount,
    skrUsd,
    amount: skrUnits.toString(),
    amountUi: unitsToDecimalString(skrUnits, skrDecimals),
    decimals: skrDecimals,
    symbol: 'SKR',
    mint: skrMint.toBase58(),
    destinationAta: skrDestinationAta.toBase58(),
  };
}

const saleActive = deployment.saleActive === true || env.NFT_SOLANA_SALE_ACTIVE === '1';
deployment.priceLamports = quote.solLamports.toString();
deployment.treasury = treasury.toBase58();
deployment.saleActive = saleActive;
deployment.startDate = saleActive ? null : (deployment.startDate || env.NFT_SOLANA_CLOSED_START_DATE || '2100-01-01T00:00:00.000Z');
deployment.paymentGroups = {
  sol: {
    usdPrice: usdAmount,
    solUsd: quote.solUsd,
    lamports: quote.solLamports.toString(),
    destination: treasury.toBase58(),
  },
  usdc: {
    usdPrice: usdAmount,
    amount: quote.usdcUnits.toString(),
    decimals: 6,
    symbol: 'USDC',
    mint: usdcMint.toBase58(),
    destinationAta: usdcDestinationAta.toBase58(),
  },
};
if (skrPaymentGroup) deployment.paymentGroups.skr = skrPaymentGroup;

const guardConfig = buildSolanaGuardConfig(deployment, { dateTime, lamports, none, publicKey, some });
const sig = await sendUmiOrFinalized(connection, updateCandyGuard(umi, {
  candyGuard: publicKey(deployment.candyGuard),
  authority: umi.identity,
  ...guardConfig,
}), umi);

deployment.updatedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(JSON.stringify({
  signature: sig.signature,
  usdAmount,
  solUsd: quote.solUsd,
  solLamports: quote.solLamports.toString(),
  solAmount: quote.solAmount,
  usdcAmount: quote.usdcAmount,
  usdcDestinationAta: usdcDestinationAta.toBase58(),
  skrAmount: skrPaymentGroup?.amountUi || null,
  skrMint: skrPaymentGroup?.mint || null,
  skrDecimals: skrPaymentGroup?.decimals ?? null,
  skrDestinationAta: skrPaymentGroup?.destinationAta || null,
  saleActive,
  startDate: deployment.startDate,
}, null, 2));
