import fs from 'node:fs';
import path from 'node:path';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { dateTime, keypairIdentity, lamports, none, publicKey, some } from '@metaplex-foundation/umi';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplCandyMachine, updateCandyGuard } from '@metaplex-foundation/mpl-core-candy-machine';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import { loadEnv, NFT_DIR, parseSolanaKeypair } from './lib-env.mjs';
import { usdToNativeUnits, unitsToDecimalString } from './lib-prices.mjs';
import { buildSolanaGuardConfig } from './lib-solana-guards.mjs';

const PRICE_FIELD_BY_PAYMENT = {
  clash: 'clashUsd',
  skr: 'skrUsd',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function argValue(name, fallback = '') {
  const row = process.argv.slice(2).find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (!row) return fallback;
  if (row === `--${name}`) return '1';
  return row.split('=').slice(1).join('=');
}

function argFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function envFirst(env, keys) {
  for (const key of keys) {
    if (env[key] != null && String(env[key]).trim() !== '') return String(env[key]).trim();
  }
  return '';
}

function bpsDifference(oldValue, newValue) {
  const oldUnits = BigInt(oldValue || '0');
  const newUnits = BigInt(newValue || '0');
  if (oldUnits <= 0n) return 1_000_000;
  const diff = oldUnits > newUnits ? oldUnits - newUnits : newUnits - oldUnits;
  return Number((diff * 10000n) / oldUnits);
}

async function fetchSolanaTokenUsdPrice(env, mint, label) {
  const overrideAllowed = env.NFT_SOLANA_PAYMENT_SYNC_ALLOW_PRICE_OVERRIDE === '1';
  const upperLabel = String(label || '').toUpperCase();
  if (overrideAllowed) {
    const override = env[`NFT_${upperLabel}_USD`]
      || env[`NFT_SOLANA_${upperLabel}_USD`]
      || env[`GAME_SHOP_SOLANA_${upperLabel}_USD`];
    if (override) {
      return {
        priceUsd: String(override),
        source: 'env override',
        pairAddress: null,
        dexId: null,
        liquidityUsd: null,
      };
    }
  }

  const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`DexScreener ${upperLabel} price failed: ${response.status}`);
  const json = await response.json();
  const minLiquidityUsd = Math.max(0, Number(env.NFT_SPL_MIN_LIQUIDITY_USD || 5_000));
  const pairs = Array.isArray(json) ? json : [];
  const bestPair = pairs
    .filter((pair) => (
      String(pair?.chainId || '').toLowerCase() === 'solana'
      && String(pair?.baseToken?.address || '') === String(mint)
      && Number(pair?.priceUsd) > 0
      && Number(pair?.liquidity?.usd || 0) >= minLiquidityUsd
      && ['USDC', 'USDT', 'SOL', 'WSOL'].includes(String(pair?.quoteToken?.symbol || '').toUpperCase())
    ))
    .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
  if (!bestPair) throw new Error(`DexScreener ${upperLabel} price missing or liquidity below ${minLiquidityUsd}`);
  return {
    priceUsd: String(bestPair.priceUsd),
    source: `DexScreener ${bestPair.dexId || 'solana'} ${bestPair.pairAddress || ''}`.trim(),
    pairAddress: bestPair.pairAddress || null,
    dexId: bestPair.dexId || null,
    liquidityUsd: Number(bestPair?.liquidity?.usd || 0),
  };
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

async function sendUmiOrFinalized(connection, builder, umi) {
  try {
    return await builder.sendAndConfirm(umi);
  } catch (err) {
    if (!err.signature) throw err;
    const status = await finalizedSignatureStatus(connection, err.signature);
    if (status?.err) throw err;
    if (status) return { signature: err.signature };
    throw err;
  }
}

async function main() {
  const env = loadEnv();
  const collectionSlug = normalizeSlug(argValue('collection', env.NFT_COLLECTION_SLUG || env.NEW_NFT_SLUG || 'dragon'));
  const paymentLabel = String(argValue('payment', env.NFT_SOLANA_PAYMENT_SYNC_PAYMENT || 'clash')).trim().toLowerCase();
  const collectionKey = collectionSlug.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const paymentKey = paymentLabel.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const solanaPrefix = `NFT_${collectionKey}_SOLANA`;
  const collectionPrefix = `NFT_${collectionKey}`;
  const deploymentFile = `${collectionSlug}-solana-mainnet.json`;
  const deploymentPath = path.join(NFT_DIR, 'deployments', deploymentFile);
  const dryRun = argFlag('dry-run');
  const force = argFlag('force');
  const minChangeBps = Math.max(0, Number(argValue('min-change-bps', env.NFT_SOLANA_PAYMENT_SYNC_MIN_CHANGE_BPS || '50')));

  if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployments/${deploymentFile}`);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const group = deployment.paymentGroups?.[paymentLabel] || deployment.groups?.[paymentLabel] || null;
  if (!group) throw new Error(`Missing ${paymentLabel} payment group in ${deploymentFile}`);

  const rpcUrl = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_URL || deployment.rpcUrl || 'https://solana-rpc.publicnode.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const mint = new PublicKey(group.mint);
  const targetUsd = argValue('usd-price')
    || envFirst(env, [
      `${solanaPrefix}_${paymentKey}_USD_PRICE`,
      `${collectionPrefix}_${paymentKey}_USD_PRICE`,
      `NFT_SOLANA_${paymentKey}_USD_PRICE`,
    ])
    || group.usdPrice
    || deployment.usdPrice
    || '10';
  const fallbackDecimals = Number(group.decimals || env[`${solanaPrefix}_${paymentKey}_DECIMALS`] || env.NFT_SOLANA_SPL_DECIMALS || 6);
  const { tokenProgram, decimals } = await solanaTokenProgramAndDecimals(connection, mint, fallbackDecimals);
  const price = await fetchSolanaTokenUsdPrice(env, mint.toBase58(), paymentLabel);
  const nextUnits = usdToNativeUnits(targetUsd, price.priceUsd, decimals);
  const nextAmount = nextUnits.toString();
  const nextAmountUi = unitsToDecimalString(nextUnits, decimals);
  const changeBps = bpsDifference(group.amount, nextAmount);

  if (!force && changeBps < minChangeBps) {
    console.log(JSON.stringify({
      status: 'skipped',
      reason: 'change_below_threshold',
      collection: collectionSlug,
      payment: paymentLabel,
      targetUsd,
      priceUsd: price.priceUsd,
      source: price.source,
      oldAmountUi: group.amountUi || unitsToDecimalString(BigInt(group.amount || '0'), Number(group.decimals || decimals)),
      nextAmountUi,
      changeBps,
      minChangeBps,
    }, null, 2));
    return;
  }

  const priceField = PRICE_FIELD_BY_PAYMENT[paymentLabel] || `${paymentLabel}Usd`;
  const tokenProgramLabel = tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'token-2022' : 'spl-token';
  deployment.paymentGroups = deployment.paymentGroups || deployment.groups || {};
  deployment.paymentGroups[paymentLabel] = {
    ...group,
    usdPrice: String(targetUsd),
    [priceField]: price.priceUsd,
    amount: nextAmount,
    amountUi: nextAmountUi,
    decimals,
    symbol: String(group.symbol || paymentLabel).toUpperCase(),
    tokenProgram: tokenProgramLabel,
    mint: mint.toBase58(),
    destinationAta: group.destinationAta,
  };
  deployment.updatedAt = new Date().toISOString();
  deployment.paymentPriceSync = {
    ...(deployment.paymentPriceSync || {}),
    [paymentLabel]: {
      priceUsd: price.priceUsd,
      source: price.source,
      dexId: price.dexId,
      pairAddress: price.pairAddress,
      liquidityUsd: price.liquidityUsd,
      targetUsd: String(targetUsd),
      amount: nextAmount,
      amountUi: nextAmountUi,
      syncedAt: deployment.updatedAt,
    },
  };

  if (dryRun) {
    console.log(JSON.stringify({
      status: 'dry-run',
      collection: collectionSlug,
      payment: paymentLabel,
      targetUsd,
      priceUsd: price.priceUsd,
      source: price.source,
      oldAmountUi: group.amountUi || unitsToDecimalString(BigInt(group.amount || '0'), Number(group.decimals || decimals)),
      nextAmountUi,
      changeBps,
      minChangeBps,
    }, null, 2));
    return;
  }

  const keypair = parseSolanaKeypair(env);
  const umi = createUmi(rpcUrl).use(mplCore()).use(mplCandyMachine());
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(keypair.secretKey)));
  const guardConfig = buildSolanaGuardConfig(deployment, { dateTime, lamports, none, publicKey, some });
  const sig = await sendUmiOrFinalized(connection, updateCandyGuard(umi, {
    candyGuard: publicKey(deployment.candyGuard),
    authority: umi.identity,
    ...guardConfig,
  }), umi);

  const tempPath = `${deploymentPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(deployment, null, 2)}\n`);
  fs.renameSync(tempPath, deploymentPath);
  console.log(JSON.stringify({
    status: 'updated',
    signature: sig.signature,
    collection: collectionSlug,
    payment: paymentLabel,
    targetUsd,
    priceUsd: price.priceUsd,
    source: price.source,
    oldAmountUi: group.amountUi || unitsToDecimalString(BigInt(group.amount || '0'), Number(group.decimals || decimals)),
    nextAmountUi,
    changeBps,
    minChangeBps,
    updatedAt: deployment.updatedAt,
  }, null, 2));
}

main().catch((err) => {
  console.error(`[solana-payment-sync] ${err?.message || err}`);
  process.exit(1);
});
