import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createWalletClient, getAddress, http, zeroAddress } from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';
import { fetchTokenUsdPrice, fetchUsdPrice, unitsToDecimalString, usdToNativeUnits, usdToTokenUnits } from './lib-prices.mjs';

const payment = (process.argv[2] || '').toLowerCase();
const buyerArg = process.argv[3] || '';
const quantity = BigInt(process.argv[4] || '1');
if (!payment || !buyerArg) {
  console.error('Usage: npm run quote:base-shop -- native|usdc|cop 0xBuyer [quantity]');
  process.exit(1);
}

const env = loadEnv();
const deploymentPath = fs.existsSync(path.join(NFT_DIR, 'deployments', 'base-shop-v2-mainnet.json'))
  ? path.join(NFT_DIR, 'deployments', 'base-shop-v2-mainnet.json')
  : path.join(NFT_DIR, 'deployments', 'base-shop-mainnet.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/base-shop-mainnet.json');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const { account } = parseEthAccount(env);
const walletClient = createWalletClient({ account, chain: base, transport: http() });
const buyer = getAddress(buyerArg);
const ttlSeconds = Number(env.NFT_BASE_QUOTE_TTL_SECONDS || 300);
const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
const nonce = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`);

let paymentToken;
let unitPrice;
let decimals;
let usdPrice;
let usdPriceE6;
let priceSource = 'fixed';
if (payment === 'native' || payment === 'eth') {
  paymentToken = zeroAddress;
  decimals = 18;
  usdPrice = env.NFT_BASE_NATIVE_USD_PRICE || env.NFT_BASE_USD_PRICE || '8.9';
  usdPriceE6 = usdToTokenUnits(usdPrice, 6);
  const ethUsd = await fetchUsdPrice(env, 'eth');
  unitPrice = usdToNativeUnits(usdPrice, ethUsd, decimals);
  priceSource = `ETH/USD ${ethUsd}`;
} else if (payment === 'usdc') {
  paymentToken = getAddress(env.NFT_BASE_USDC_TOKEN || deployment.usdcToken || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  decimals = Number(env.NFT_BASE_USDC_DECIMALS || 6);
  usdPrice = env.NFT_BASE_USDC_USD_PRICE || env.NFT_BASE_USD_PRICE || '8.9';
  usdPriceE6 = usdToTokenUnits(usdPrice, 6);
  unitPrice = usdToTokenUnits(usdPrice, decimals);
} else if (payment === 'cop' || payment === 'clash') {
  paymentToken = getAddress(env.NFT_BASE_CLASH_TOKEN || env.CLASH_BASE_TOKEN || deployment.clashToken);
  decimals = Number(env.NFT_BASE_CLASH_DECIMALS || 18);
  usdPrice = env.NFT_BASE_CLASH_USD_PRICE || '5';
  usdPriceE6 = usdToTokenUnits(usdPrice, 6);
  const clashUsd = await fetchTokenUsdPrice(env, paymentToken, 'cop');
  unitPrice = usdToNativeUnits(usdPrice, clashUsd.price, decimals);
  priceSource = `CoP/USD ${clashUsd.price} (${clashUsd.source})`;
} else {
  throw new Error(`Unsupported payment mode: ${payment}`);
}

const domain = {
  name: 'DemonKingBaseShop',
  version: '1',
  chainId: 8453,
  verifyingContract: getAddress(deployment.shop),
};
const types = {
  MintQuote: [
    { name: 'buyer', type: 'address' },
    { name: 'paymentToken', type: 'address' },
    { name: 'unitPrice', type: 'uint256' },
    { name: 'quantity', type: 'uint256' },
    { name: 'usdPriceE6', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};
const message = { buyer, paymentToken, unitPrice, quantity, usdPriceE6, nonce, deadline };
const signature = await walletClient.signTypedData({
  account,
  domain,
  types,
  primaryType: 'MintQuote',
  message,
});

const total = unitPrice * quantity;
console.log(JSON.stringify({
  payment,
  buyer,
  paymentToken,
  quantity: quantity.toString(),
  unitPrice: unitPrice.toString(),
  unitPriceFormatted: unitsToDecimalString(unitPrice, decimals),
  total: total.toString(),
  totalFormatted: unitsToDecimalString(total, decimals),
  decimals,
  usdPrice,
  usdPriceE6: usdPriceE6.toString(),
  priceSource,
  deadline: deadline.toString(),
  nonce: nonce.toString(),
  quote: {
    buyer,
    paymentToken,
    unitPrice: unitPrice.toString(),
    quantity: quantity.toString(),
    usdPriceE6: usdPriceE6.toString(),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  },
  signature,
}, null, 2));
