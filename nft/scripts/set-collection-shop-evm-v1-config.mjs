import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, parseGwei } from 'viem';
import { arbitrum, base } from 'viem/chains';
import { decimalToUnits, unitsToDecimalString } from './lib-prices.mjs';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://monadexplorer.com' } },
});

const ink = defineChain({
  id: 57073,
  name: 'Ink',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-gel.inkonchain.com'] } },
  blockExplorers: { default: { name: 'Ink Explorer', url: 'https://explorer.inkonchain.com' } },
});

const CHAINS = {
  base: { chain: base, envRpc: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL', 'VITE_BASE_RPC_URL'], defaultRpc: 'https://mainnet.base.org' },
  arbitrum: { chain: arbitrum, envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL', 'GAME_SHOP_ARB_RPC_URL'], defaultRpc: 'https://arb1.arbitrum.io/rpc' },
  monad: { chain: monad, envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL', 'GAME_SHOP_MONAD_RPC_URL'], defaultRpc: 'https://rpc.monad.xyz' },
  ink: { chain: ink, envRpc: ['NFT_INK_RPC_URL', 'INK_RPC_URL', 'GAME_SHOP_INK_RPC_URL'], defaultRpc: 'https://rpc-gel.inkonchain.com' },
};

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

function envKeyPart(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function envOr(env, keys, fallback = '') {
  for (const key of keys) {
    if (env[key] != null && env[key] !== '') return env[key];
  }
  return fallback;
}

function unitsE6ToDecimal(value, fallback = '0') {
  try {
    return unitsToDecimalString(BigInt(value), 6);
  } catch {
    return fallback;
  }
}

const env = loadEnv();
const collection = normalizeSlug(argValue('collection', env.NFT_COLLECTION_SLUG || env.NEW_NFT_SLUG || 'dragon'));
const chainKey = String(argValue('chain', env.CLASH_DEPLOY_CHAIN || env.NFT_COLLECTION_CHAIN || '')).toLowerCase();
const spec = CHAINS[chainKey];
if (!spec) throw new Error(`Unknown chain "${chainKey}". Use --chain=base|arbitrum|monad|ink.`);

const collectionKey = envKeyPart(collection);
const chainEnvPrefix = `NFT_${collectionKey}_${envKeyPart(chainKey)}`;
const collectionEnvPrefix = `NFT_${collectionKey}`;
const deploymentPath = path.join(NFT_DIR, 'deployments', `${collection}-${chainKey}-shop-mainnet.json`);
const artifactPath = path.join(NFT_DIR, 'artifacts', 'ClashCollectionShopV1.json');
if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployments/${collection}-${chainKey}-shop-mainnet.json`);
if (!fs.existsSync(artifactPath)) throw new Error('Missing artifacts/ClashCollectionShopV1.json');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const rpcUrl = spec.envRpc.map((key) => env[key]).find(Boolean) || spec.defaultRpc;
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: spec.chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: spec.chain, transport: http(rpcUrl) });
const address = getAddress(deployment.shop || deployment.proxy);
const maxPriorityFeePerGas = env[`${chainEnvPrefix}_PRIORITY_GWEI`]
  ? parseGwei(env[`${chainEnvPrefix}_PRIORITY_GWEI`])
  : env[`NFT_${envKeyPart(chainKey)}_PRIORITY_GWEI`]
    ? parseGwei(env[`NFT_${envKeyPart(chainKey)}_PRIORITY_GWEI`])
    : undefined;

const defaultBase = collection === 'dragon' ? '15' : unitsE6ToDecimal(deployment.baseUsdPriceE6, '5.5');
const defaultClash = collection === 'dragon' ? '10' : unitsE6ToDecimal(deployment.clashUsdPriceE6, '4');
const baseUsdPriceE6 = decimalToUnits(envOr(env, [
  `${chainEnvPrefix}_USD_PRICE`,
  `${collectionEnvPrefix}_USD_PRICE`,
  'NFT_COLLECTION_USD_PRICE',
  'NFT_BASE_USD_PRICE',
], defaultBase), 6);
const clashUsdPriceE6 = decimalToUnits(envOr(env, [
  `${chainEnvPrefix}_CLASH_USD_PRICE`,
  `${collectionEnvPrefix}_CLASH_USD_PRICE`,
  'NFT_COLLECTION_CLASH_USD_PRICE',
  'NFT_BASE_CLASH_USD_PRICE',
], defaultClash), 6);

const currentBase = await publicClient.readContract({
  address,
  abi: artifact.abi,
  functionName: 'baseUsdPriceE6',
});
const currentClash = await publicClient.readContract({
  address,
  abi: artifact.abi,
  functionName: 'clashUsdPriceE6',
});

console.log(`[${collection}:${chainKey}] shop=${address}`);
console.log(`[${collection}:${chainKey}] current base=${currentBase.toString()} clash=${currentClash.toString()}`);
console.log(`[${collection}:${chainKey}] target  base=${baseUsdPriceE6.toString()} clash=${clashUsdPriceE6.toString()}`);

if (currentBase !== baseUsdPriceE6 || currentClash !== clashUsdPriceE6) {
  const hash = await walletClient.writeContract({
    address,
    abi: artifact.abi,
    functionName: 'setUsdPrices',
    args: [baseUsdPriceE6, clashUsdPriceE6],
    maxPriorityFeePerGas,
  });
  console.log(`[${collection}:${chainKey}] setUsdPrices tx=${hash}`);
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  deployment.priceUpdateTxHash = hash;
  deployment.priceUpdatedAt = new Date().toISOString();
} else {
  console.log(`[${collection}:${chainKey}] prices already match`);
}

deployment.baseUsdPriceE6 = baseUsdPriceE6.toString();
deployment.clashUsdPriceE6 = clashUsdPriceE6.toString();
deployment.priceCheckedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`[${collection}:${chainKey}] ok`);
