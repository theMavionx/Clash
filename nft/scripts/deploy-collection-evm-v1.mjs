// Deploy a configurable ClashCollectionNftV1 proxy for a new NFT collection.
//
// Usage:
//   node scripts/deploy-collection-evm-v1.mjs --collection=new-nft --chain=base
//   node scripts/deploy-collection-evm-v1.mjs --collection=new-nft --chain=arbitrum
//   node scripts/deploy-collection-evm-v1.mjs --collection=new-nft --chain=monad
//
// Output:
//   nft/deployments/<collection>-<chain>-mainnet.json

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
import { loadEnv, NFT_DIR, parseEthAccount, publicBaseUrl } from './lib-env.mjs';

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

const TREASURY = '0xC024884ad9C5540996492Cc2DD080964941A3094';

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

function collectionDefaults(slug) {
  if (slug === 'voidspore') return { name: 'Voidspore', symbol: 'VOID' };
  if (slug === 'succubus') return { name: 'Succubus', symbol: 'SCBS', maxSupply: '333' };
  return { name: 'Clash Collection', symbol: 'CLASH', maxSupply: '555' };
}

function optionalAddress(value) {
  if (!value || /^0x0{40}$/i.test(String(value))) return zeroAddress;
  return getAddress(value);
}

const env = loadEnv();
const collection = normalizeSlug(argValue('collection', env.NFT_COLLECTION_SLUG || env.NEW_NFT_SLUG));
const defaults = collectionDefaults(collection);
const collectionKey = envKeyPart(collection);
const chainKey = String(argValue('chain', env.CLASH_DEPLOY_CHAIN || env.NFT_COLLECTION_CHAIN || '')).toLowerCase();
const spec = CHAINS[chainKey];
if (!spec) {
  console.error(`Unknown chain "${chainKey}". Use --chain=base|arbitrum|monad|ink.`);
  process.exit(1);
}

const nftArtifactPath = path.join(NFT_DIR, 'artifacts', 'ClashCollectionNftV1.json');
const proxyArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingProxy.json');
for (const file of [nftArtifactPath, proxyArtifactPath]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${path.relative(NFT_DIR, file)}. Run npm run compile:base first.`);
  }
}
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

const baseUrl = publicBaseUrl(env);
const chainEnvPrefix = `NFT_${collectionKey}_${chainKey.toUpperCase()}`;
const collectionEnvPrefix = `NFT_${collectionKey}`;

const collectionName = argValue('name', envOr(env, [
  `${chainEnvPrefix}_NAME`,
  `${collectionEnvPrefix}_NAME`,
  'NFT_COLLECTION_NAME',
  'NEW_NFT_NAME',
], defaults.name));
const collectionSymbol = argValue('symbol', envOr(env, [
  `${chainEnvPrefix}_SYMBOL`,
  `${collectionEnvPrefix}_SYMBOL`,
  'NFT_COLLECTION_SYMBOL',
  'NEW_NFT_SYMBOL',
], defaults.symbol));
const maxSupply = BigInt(envOr(env, [
  `${chainEnvPrefix}_GLOBAL_SUPPLY_CAP`,
  `${collectionEnvPrefix}_GLOBAL_SUPPLY_CAP`,
  'NFT_COLLECTION_GLOBAL_SUPPLY_CAP',
  `${chainEnvPrefix}_MAX_SUPPLY`,
  `${collectionEnvPrefix}_MAX_SUPPLY`,
  'NFT_COLLECTION_MAX_SUPPLY',
  'NFT_GLOBAL_SUPPLY_CAP',
], defaults.maxSupply));
const maxPerTx = BigInt(envOr(env, [
  `${chainEnvPrefix}_MAX_PER_TX`,
  `${collectionEnvPrefix}_MAX_PER_TX`,
  'NFT_COLLECTION_MAX_PER_TX',
  'NFT_BASE_MAX_PER_TX',
], '10'));
const mintPrice = BigInt(envOr(env, [
  `${chainEnvPrefix}_PRICE_WEI`,
  `${collectionEnvPrefix}_PRICE_WEI`,
  'NFT_COLLECTION_PRICE_WEI',
], '0'));
const tokenUri = envOr(env, [
  `${chainEnvPrefix}_TOKEN_URI`,
  `${collectionEnvPrefix}_${chainKey.toUpperCase()}_TOKEN_URI`,
  'NFT_COLLECTION_TOKEN_URI',
], `${baseUrl}/api/nft/${collection}/${chainKey}/`);
const contractUri = envOr(env, [
  `${chainEnvPrefix}_CONTRACT_URI`,
  `${collectionEnvPrefix}_${chainKey.toUpperCase()}_CONTRACT_URI`,
  'NFT_COLLECTION_CONTRACT_URI',
], `${baseUrl}/api/nft/${collection}/${chainKey}/contract`);
const quoteSigner = getAddress(envOr(env, [
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
const copToken = optionalAddress(envOr(env, [
  `${chainEnvPrefix}_CLASH_TOKEN`,
  `${collectionEnvPrefix}_CLASH_TOKEN`,
  'NFT_COLLECTION_CLASH_TOKEN',
  'NFT_CLASH_TOKEN',
  'GAME_SHOP_COP_TOKEN',
], ''));
const royaltyReceiver = getAddress(envOr(env, [
  `${chainEnvPrefix}_ROYALTY_RECEIVER`,
  `${collectionEnvPrefix}_ROYALTY_RECEIVER`,
  'NFT_COLLECTION_ROYALTY_RECEIVER',
  'NFT_ROYALTY_RECEIVER',
], TREASURY));
const royaltyBps = Number(envOr(env, [
  `${chainEnvPrefix}_ROYALTY_BPS`,
  `${collectionEnvPrefix}_ROYALTY_BPS`,
  'NFT_COLLECTION_ROYALTY_BPS',
  'NFT_ROYALTY_BPS',
], '250'));
const eip712Name = envOr(env, [
  `${chainEnvPrefix}_EIP712_NAME`,
  `${collectionEnvPrefix}_EIP712_NAME`,
  'NFT_COLLECTION_EIP712_NAME',
], `ClashCollection:${collection}:${chainKey}`);
const eip712Version = envOr(env, [
  `${chainEnvPrefix}_EIP712_VERSION`,
  `${collectionEnvPrefix}_EIP712_VERSION`,
  'NFT_COLLECTION_EIP712_VERSION',
], '1');

if (royaltyBps > 1000) throw new Error(`Royalty ${royaltyBps} exceeds 10% cap.`);

console.log('\n=== Collection Deploy Plan ===');
console.log(`  Collection     : ${collectionName} (${collectionSymbol})`);
console.log(`  Slug           : ${collection}`);
console.log(`  Chain          : ${spec.chain.name} (${chainId})`);
console.log(`  maxSupply      : ${maxSupply.toString()}`);
console.log(`  maxPerTx       : ${maxPerTx.toString()}`);
console.log(`  baseURI        : ${tokenUri}`);
console.log(`  contractURI    : ${contractUri}`);
console.log(`  quoteSigner    : ${quoteSigner}`);
console.log(`  usdcToken      : ${usdcToken}`);
console.log(`  copToken       : ${copToken}`);
console.log(`  royalty        : ${royaltyBps / 100}% -> ${royaltyReceiver}`);
console.log(`  EIP712         : ${eip712Name} / ${eip712Version}`);

const maxPriorityFeePerGas = env[`${chainEnvPrefix}_PRIORITY_GWEI`]
  ? parseGwei(env[`${chainEnvPrefix}_PRIORITY_GWEI`])
  : env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
    ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
    : undefined;

console.log('\n[1/2] Deploying ClashCollectionNftV1 implementation...');
const implHash = await walletClient.deployContract({
  abi: nftArtifact.abi,
  bytecode: nftArtifact.bytecode,
  maxPriorityFeePerGas,
});
console.log(`  implementation tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
if (!implementation) throw new Error('Implementation deploy returned no address');
console.log(`  implementation: ${implementation}`);

console.log('\n[2/2] Deploying ERC1967 proxy...');
const initData = encodeFunctionData({
  abi: nftArtifact.abi,
  functionName: 'initialize',
  args: [
    collectionName,
    collectionSymbol,
    account.address,
    tokenUri,
    contractUri,
    maxSupply,
    maxPerTx,
    mintPrice,
    quoteSigner,
    usdcToken,
    copToken,
    royaltyReceiver,
    royaltyBps,
    eip712Name,
    eip712Version,
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
const proxy = proxyReceipt.contractAddress;
if (!proxy) throw new Error('Proxy deploy returned no address');
console.log(`  proxy: ${proxy}`);

const [owner, onChainMaxSupply, onChainMaxPerTx, totalMinted, paused] = await Promise.all([
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'owner' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'maxSupply' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'maxPerTx' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'totalMinted' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'paused' }),
]);

const deployment = {
  collection,
  name: collectionName,
  symbol: collectionSymbol,
  chain: chainKey,
  chainId,
  proxy,
  contract: proxy,
  implementation,
  deployer: account.address,
  owner: getAddress(owner),
  quoteSigner,
  usdcToken,
  copToken,
  royaltyReceiver,
  royaltyBps,
  eip712Name,
  eip712Version,
  maxSupply: onChainMaxSupply.toString(),
  globalSupplyCap: maxSupply.toString(),
  maxPerTx: onChainMaxPerTx.toString(),
  totalMinted: totalMinted.toString(),
  paused,
  saleActive: false,
  baseTokenUri: tokenUri,
  contractUri,
  initialPriceWei: mintPrice.toString(),
  implementationTxHash: implHash,
  proxyTxHash: proxyHash,
  implementationBlockNumber: implReceipt.blockNumber?.toString(),
  proxyBlockNumber: proxyReceipt.blockNumber?.toString(),
  upgradeable: true,
  deployedAt: new Date().toISOString(),
};

const deploymentFile = `${collection}-${chainKey}-mainnet.json`;
fs.mkdirSync(path.join(NFT_DIR, 'deployments'), { recursive: true });
fs.writeFileSync(path.join(NFT_DIR, 'deployments', deploymentFile), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`\nWrote ${deploymentFile}`);
console.log('\nNext: deploy shop with:');
console.log(`  node scripts/deploy-collection-shop-evm-v1.mjs --collection=${collection} --chain=${chainKey}`);
console.log('Sale remains paused/closed until the image + metadata endpoints are ready.');
