// Deploy ClashCollectionShopV1 for a previously deployed collection NFT.
//
// Usage:
//   node scripts/deploy-collection-shop-evm-v1.mjs --collection=new-nft --chain=base
//
// Output:
//   nft/deployments/<collection>-<chain>-shop-mainnet.json

import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  parseGwei,
  zeroAddress,
} from 'viem';
import { arbitrum, base } from 'viem/chains';
import { decimalToUnits } from './lib-prices.mjs';
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
  base: {
    chain: base,
    defaultRpc: 'https://mainnet.base.org',
    envRpc: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL', 'VITE_BASE_RPC_URL'],
    usdcDefault: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  arbitrum: {
    chain: arbitrum,
    defaultRpc: 'https://arb1.arbitrum.io/rpc',
    envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL', 'GAME_SHOP_ARB_RPC_URL'],
    usdcDefault: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  monad: {
    chain: monad,
    defaultRpc: 'https://rpc.monad.xyz',
    envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL', 'GAME_SHOP_MONAD_RPC_URL'],
    usdcDefault: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
  },
  ink: {
    chain: ink,
    defaultRpc: 'https://rpc-gel.inkonchain.com',
    envRpc: ['NFT_INK_RPC_URL', 'INK_RPC_URL', 'GAME_SHOP_INK_RPC_URL'],
    usdcDefault: '0x2D270e6886d130D724215A266106e6832161EAEd',
  },
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

function envKeyPart(slug) {
  return slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function envOr(env, keys, fallback = '') {
  for (const key of keys) {
    if (env[key] != null && env[key] !== '') return env[key];
  }
  return fallback;
}

function optionalAddress(value) {
  if (!value || /^0x0{40}$/i.test(String(value))) return zeroAddress;
  return getAddress(value);
}

const env = loadEnv();
const collection = normalizeSlug(argValue('collection', env.NFT_COLLECTION_SLUG || env.NEW_NFT_SLUG));
const collectionKey = envKeyPart(collection);
const collectionDefaults = collection === 'dragon'
  ? { usdPrice: '15', clashUsdPrice: '10' }
  : { usdPrice: '5.5', clashUsdPrice: '4' };
const chainKey = String(argValue('chain', env.CLASH_DEPLOY_CHAIN || env.NFT_COLLECTION_CHAIN || '')).toLowerCase();
const spec = CHAINS[chainKey];
if (!spec) {
  console.error(`Unknown chain "${chainKey}". Use --chain=base|arbitrum|monad|ink.`);
  process.exit(1);
}

const chainEnvPrefix = `NFT_${collectionKey}_${chainKey.toUpperCase()}`;
const collectionEnvPrefix = `NFT_${collectionKey}`;
const nftDeploymentFile = `${collection}-${chainKey}-mainnet.json`;
const nftDeploymentPath = path.join(NFT_DIR, 'deployments', nftDeploymentFile);
const shopArtifactPath = path.join(NFT_DIR, 'artifacts', 'ClashCollectionShopV1.json');
const nftArtifactPath = path.join(NFT_DIR, 'artifacts', 'ClashCollectionNftV1.json');
const proxyArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingProxy.json');

for (const file of [nftDeploymentPath, shopArtifactPath, nftArtifactPath, proxyArtifactPath]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${path.relative(NFT_DIR, file)}. Deploy collection and run npm run compile:base first.`);
  }
}

const nftDeployment = JSON.parse(fs.readFileSync(nftDeploymentPath, 'utf8'));
const shopArtifact = JSON.parse(fs.readFileSync(shopArtifactPath, 'utf8'));
const nftArtifact = JSON.parse(fs.readFileSync(nftArtifactPath, 'utf8'));
const proxyArtifact = JSON.parse(fs.readFileSync(proxyArtifactPath, 'utf8'));

const rpcUrl = spec.envRpc.map((key) => env[key]).find(Boolean) || spec.defaultRpc;
const { account, source } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: spec.chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: spec.chain, transport: http(rpcUrl) });

const chainId = await publicClient.getChainId();
if (chainId !== spec.chain.id) {
  throw new Error(`Expected ${spec.chain.name} chainId ${spec.chain.id}, got ${chainId}. Check RPC URL.`);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log(`${spec.chain.name} deployer: ${account.address}`);
console.log(`Key source: ${source}`);
console.log(`Native balance: ${formatEther(balance)} ${spec.chain.nativeCurrency.symbol}`);
if (balance === 0n) {
  throw new Error(`Deployer has 0 ${spec.chain.nativeCurrency.symbol}. Fund it before deploying.`);
}

const nft = getAddress(nftDeployment.proxy || nftDeployment.contract);
const quoteSigner = getAddress(envOr(env, [
  `${chainEnvPrefix}_SHOP_QUOTE_SIGNER`,
  `${collectionEnvPrefix}_SHOP_QUOTE_SIGNER`,
  'NFT_COLLECTION_SHOP_QUOTE_SIGNER',
  `${chainEnvPrefix}_QUOTE_SIGNER`,
  `${collectionEnvPrefix}_QUOTE_SIGNER`,
  'NFT_COLLECTION_QUOTE_SIGNER',
  'NFT_QUOTE_SIGNER',
], account.address));
const usdcToken = optionalAddress(envOr(env, [
  `${chainEnvPrefix}_USDC_TOKEN`,
  `${collectionEnvPrefix}_USDC_TOKEN`,
  'NFT_COLLECTION_USDC_TOKEN',
  'NFT_USDC_TOKEN',
], spec.usdcDefault));
const clashToken = optionalAddress(envOr(env, [
  `${chainEnvPrefix}_CLASH_TOKEN`,
  `${collectionEnvPrefix}_CLASH_TOKEN`,
  'NFT_COLLECTION_CLASH_TOKEN',
  'NFT_CLASH_TOKEN',
  'GAME_SHOP_COP_TOKEN',
], ''));
const baseUsdPriceE6 = decimalToUnits(envOr(env, [
  `${chainEnvPrefix}_USD_PRICE`,
  `${collectionEnvPrefix}_USD_PRICE`,
  'NFT_COLLECTION_USD_PRICE',
  'NFT_BASE_USD_PRICE',
], collectionDefaults.usdPrice), 6);
const clashUsdPriceE6 = decimalToUnits(envOr(env, [
  `${chainEnvPrefix}_CLASH_USD_PRICE`,
  `${collectionEnvPrefix}_CLASH_USD_PRICE`,
  'NFT_COLLECTION_CLASH_USD_PRICE',
  'NFT_BASE_CLASH_USD_PRICE',
], collectionDefaults.clashUsdPrice), 6);
const shopEip712Name = envOr(env, [
  `${chainEnvPrefix}_SHOP_EIP712_NAME`,
  `${collectionEnvPrefix}_SHOP_EIP712_NAME`,
  'NFT_COLLECTION_SHOP_EIP712_NAME',
], `ClashCollectionShop:${collection}:${chainKey}`);
const shopEip712Version = envOr(env, [
  `${chainEnvPrefix}_SHOP_EIP712_VERSION`,
  `${collectionEnvPrefix}_SHOP_EIP712_VERSION`,
  'NFT_COLLECTION_SHOP_EIP712_VERSION',
], '1');

const maxPriorityFeePerGas = env[`${chainEnvPrefix}_PRIORITY_GWEI`]
  ? parseGwei(env[`${chainEnvPrefix}_PRIORITY_GWEI`])
  : env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
    ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
    : undefined;

console.log('\n=== Collection Shop Deploy Plan ===');
console.log(`  Collection     : ${collection}`);
console.log(`  Chain          : ${spec.chain.name} (${chainId})`);
console.log(`  NFT proxy      : ${nft}`);
console.log(`  quoteSigner    : ${quoteSigner}`);
console.log(`  usdcToken      : ${usdcToken}`);
console.log(`  clashToken     : ${clashToken}`);
console.log(`  baseUsdPriceE6 : ${baseUsdPriceE6.toString()}`);
console.log(`  clashUsdPriceE6: ${clashUsdPriceE6.toString()}`);
console.log(`  EIP712         : ${shopEip712Name} / ${shopEip712Version}`);

console.log('\n[1/3] Deploying ClashCollectionShopV1 implementation...');
const implHash = await walletClient.deployContract({
  abi: shopArtifact.abi,
  bytecode: shopArtifact.bytecode,
  maxPriorityFeePerGas,
});
console.log(`  implementation tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
if (!implementation) throw new Error('Implementation deploy returned no address');
console.log(`  implementation: ${implementation}`);

console.log('\n[2/3] Deploying ERC1967 proxy...');
const initData = encodeFunctionData({
  abi: shopArtifact.abi,
  functionName: 'initialize',
  args: [
    account.address,
    nft,
    quoteSigner,
    usdcToken,
    clashToken,
    baseUsdPriceE6,
    clashUsdPriceE6,
    shopEip712Name,
    shopEip712Version,
  ],
});
const proxyHash = await walletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode,
  args: [implementation, initData],
  maxPriorityFeePerGas,
});
console.log(`  proxy tx: ${proxyHash}`);
const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash, confirmations: 2 });
const shop = proxyReceipt.contractAddress;
if (!shop) throw new Error('Proxy deploy returned no address');
console.log(`  shop proxy: ${shop}`);

console.log('\n[3/3] Authorizing shop as NFT minter...');
const minterHash = await walletClient.writeContract({
  address: nft,
  abi: nftArtifact.abi,
  functionName: 'setAuthorizedMinter',
  args: [shop, true],
  maxPriorityFeePerGas,
});
console.log(`  authorize tx: ${minterHash}`);
await publicClient.waitForTransactionReceipt({ hash: minterHash, confirmations: 2 });

let saleActive = false;
const saleFlag = envOr(env, [
  `${chainEnvPrefix}_SHOP_SALE_ACTIVE`,
  `${collectionEnvPrefix}_SHOP_SALE_ACTIVE`,
  'NFT_COLLECTION_SHOP_SALE_ACTIVE',
], '0');
if (saleFlag === '1' || String(saleFlag).toLowerCase() === 'true') {
  const saleHash = await walletClient.writeContract({
    address: shop,
    abi: shopArtifact.abi,
    functionName: 'setSaleActive',
    args: [true],
    maxPriorityFeePerGas,
  });
  console.log(`  sale active tx: ${saleHash}`);
  await publicClient.waitForTransactionReceipt({ hash: saleHash, confirmations: 2 });
  saleActive = true;
}

const deployment = {
  collection,
  chain: chainKey,
  chainId,
  shop,
  proxy: shop,
  implementation,
  nft,
  deployer: account.address,
  owner: account.address,
  quoteSigner,
  usdcToken,
  clashToken,
  baseUsdPriceE6: baseUsdPriceE6.toString(),
  clashUsdPriceE6: clashUsdPriceE6.toString(),
  eip712Name: shopEip712Name,
  eip712Version: shopEip712Version,
  saleActive,
  implementationTxHash: implHash,
  proxyTxHash: proxyHash,
  authorizeMinterTxHash: minterHash,
  upgradeable: true,
  deployedAt: new Date().toISOString(),
};

const deploymentFile = `${collection}-${chainKey}-shop-mainnet.json`;
fs.writeFileSync(path.join(NFT_DIR, 'deployments', deploymentFile), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`\nWrote ${deploymentFile}`);
if (!saleActive) console.log('Shop sale remains inactive. Set NFT_COLLECTION_SHOP_SALE_ACTIVE=1 only for final launch.');
