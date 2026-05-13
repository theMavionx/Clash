import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, getAddress, http, parseGwei, zeroAddress } from 'viem';
import { base } from 'viem/chains';
import { decimalToUnits } from './lib-prices.mjs';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'base-shop-v2-mainnet.json');
const artifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseShopV2.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/base-shop-v2-mainnet.json');
if (!fs.existsSync(artifactPath)) throw new Error('Missing artifact. Run npm run compile:base first.');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
const address = deployment.shop || deployment.proxy;
const maxPriorityFeePerGas = env.NFT_BASE_PRIORITY_GWEI
  ? parseGwei(env.NFT_BASE_PRIORITY_GWEI)
  : undefined;

let nextUsdc = deployment.usdcToken;
let nextClash = deployment.clashToken || zeroAddress;
if (env.NFT_BASE_USDC_TOKEN) nextUsdc = getAddress(env.NFT_BASE_USDC_TOKEN);
if (env.NFT_BASE_CLASH_TOKEN || env.CLASH_BASE_TOKEN) {
  nextClash = getAddress(env.NFT_BASE_CLASH_TOKEN || env.CLASH_BASE_TOKEN);
}
if (env.NFT_BASE_USDC_TOKEN || env.NFT_BASE_CLASH_TOKEN || env.CLASH_BASE_TOKEN) {
  await write('setCorePaymentTokens', [nextUsdc || zeroAddress, nextClash || zeroAddress]);
  deployment.usdcToken = nextUsdc || zeroAddress;
  deployment.clashToken = nextClash || zeroAddress;
}

if (env.NFT_BASE_USD_PRICE || env.NFT_BASE_CLASH_USD_PRICE) {
  const baseUsdPriceE6 = decimalToUnits(env.NFT_BASE_USD_PRICE || unitsE6ToDecimal(deployment.baseUsdPriceE6 || '8900000'), 6);
  const clashUsdPriceE6 = decimalToUnits(env.NFT_BASE_CLASH_USD_PRICE || unitsE6ToDecimal(deployment.clashUsdPriceE6 || '5000000'), 6);
  await write('setUsdPrices', [baseUsdPriceE6, clashUsdPriceE6]);
  deployment.baseUsdPriceE6 = baseUsdPriceE6.toString();
  deployment.clashUsdPriceE6 = clashUsdPriceE6.toString();
}

if (env.NFT_BASE_SHOP_MAX_PER_TX) await write('setMaxPerTx', [BigInt(env.NFT_BASE_SHOP_MAX_PER_TX)]);
if (env.NFT_BASE_SHOP_SALE_ACTIVE != null) {
  const active = env.NFT_BASE_SHOP_SALE_ACTIVE !== '0';
  await write('setSaleActive', [active]);
  deployment.saleActive = active;
}
if (env.NFT_BASE_NATIVE_ALLOWED != null) await write('setPaymentToken', [zeroAddress, env.NFT_BASE_NATIVE_ALLOWED !== '0']);
if (env.NFT_BASE_USDC_ALLOWED != null) await write('setPaymentToken', [nextUsdc, env.NFT_BASE_USDC_ALLOWED !== '0']);
if (env.NFT_BASE_CLASH_ALLOWED != null) await write('setPaymentToken', [nextClash, env.NFT_BASE_CLASH_ALLOWED !== '0']);
if (nextClash && !/^0x0{40}$/i.test(nextClash) && env.NFT_BASE_CLASH_ALLOWED == null) {
  await write('setPaymentToken', [nextClash, true]);
}

fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`DemonKingBaseShopV2 config checked for ${address}`);

async function write(functionName, args) {
  const hash = await walletClient.writeContract({
    address,
    abi: artifact.abi,
    functionName,
    args,
    maxPriorityFeePerGas,
  });
  console.log(`${functionName} tx: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
}

function unitsE6ToDecimal(value) {
  const raw = BigInt(value);
  const whole = raw / 1_000_000n;
  const frac = (raw % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
