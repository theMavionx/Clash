// Generalized DemonKingBaseShopV2 deploy for any EVM chain that already
// has a DemonKingBaseV2 NFT deployed via deploy-evm-v2.mjs. Reads target
// chain from --chain=arbitrum|monad|ink|... and pairs with the matching
// `<chain>-mainnet.json` NFT deployment file.

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

// Per-chain USDC mints. CoP is Base-only so other chains omit it (the
// contract handles zeroAddress clashToken gracefully — sale just uses USDC
// / native paths). Native (ETH/MON) pricing falls back to the NFT contract's
// initial baseUsdPrice the same way Base does.
const CHAINS = {
  base: {
    chain: base,
    defaultRpc: 'https://mainnet.base.org',
    nftDeployFile: 'base-v2-mainnet.json',
    shopDeployFile: 'base-shop-v2-mainnet.json',
    usdcToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    clashTokenEnv: ['NFT_BASE_CLASH_TOKEN', 'CLASH_BASE_TOKEN'],
    envRpc: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL', 'VITE_BASE_RPC_URL'],
  },
  arbitrum: {
    chain: arbitrum,
    defaultRpc: 'https://arb1.arbitrum.io/rpc',
    nftDeployFile: 'arbitrum-mainnet.json',
    shopDeployFile: 'arbitrum-shop-v2-mainnet.json',
    usdcToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    clashTokenEnv: [], // no CoP on Arbitrum
    envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL', 'GAME_SHOP_ARB_RPC_URL'],
  },
  monad: {
    chain: monad,
    defaultRpc: 'https://rpc.monad.xyz',
    nftDeployFile: 'monad-mainnet.json',
    shopDeployFile: 'monad-shop-v2-mainnet.json',
    usdcToken: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
    clashTokenEnv: [],
    envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL', 'GAME_SHOP_MONAD_RPC_URL'],
  },
  ink: {
    chain: ink,
    defaultRpc: 'https://rpc-gel.inkonchain.com',
    nftDeployFile: 'ink-mainnet.json',
    shopDeployFile: 'ink-shop-v2-mainnet.json',
    usdcToken: '0x2D270e6886d130D724215A266106e6832161EAEd',
    clashTokenEnv: [],
    envRpc: ['NFT_INK_RPC_URL', 'INK_RPC_URL', 'GAME_SHOP_INK_RPC_URL'],
  },
};

const cliArg = process.argv.slice(2).find((a) => a.startsWith('--chain=')) || '';
const chainKey = (cliArg ? cliArg.split('=')[1] : process.env.CLASH_DEPLOY_CHAIN || '').toLowerCase();
if (!CHAINS[chainKey]) {
  console.error(`Unknown chain "${chainKey}". Pass --chain=base, --chain=arbitrum, --chain=monad, or --chain=ink.`);
  process.exit(1);
}
const target = CHAINS[chainKey];

const env = loadEnv();
const nftDeploymentPath = path.join(NFT_DIR, 'deployments', target.nftDeployFile);
const shopArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseShopV2.json');
const nftArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseV2.json');
const proxyArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingProxy.json');
for (const file of [nftDeploymentPath, shopArtifactPath, nftArtifactPath, proxyArtifactPath]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${path.relative(NFT_DIR, file)} — run NFT deploy + compile first`);
  }
}

const nftDeployment = JSON.parse(fs.readFileSync(nftDeploymentPath, 'utf8'));
const shopArtifact = JSON.parse(fs.readFileSync(shopArtifactPath, 'utf8'));
const nftArtifact = JSON.parse(fs.readFileSync(nftArtifactPath, 'utf8'));
const proxyArtifact = JSON.parse(fs.readFileSync(proxyArtifactPath, 'utf8'));

const rpcUrl = target.envRpc.map((k) => env[k]).find(Boolean) || target.defaultRpc;
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: target.chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: target.chain, transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
if (chainId !== target.chain.id) {
  throw new Error(`Expected ${target.chain.name} chainId ${target.chain.id}, got ${chainId}`);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log(`${target.chain.name} deployer: ${account.address}`);
console.log(`Native balance: ${formatEther(balance)} ${target.chain.nativeCurrency.symbol}`);
if (balance === 0n) {
  console.error(`Deployer has 0 ${target.chain.nativeCurrency.symbol}.`);
  process.exit(1);
}

const maxPriorityFeePerGas = env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
  ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
  : undefined;

const quoteSigner = getAddress(env[`NFT_${chainKey.toUpperCase()}_SHOP_QUOTE_SIGNER`] || env.NFT_BASE_SHOP_QUOTE_SIGNER || account.address);
const usdcToken = getOptionalAddress(env[`NFT_${chainKey.toUpperCase()}_USDC_TOKEN`]) || getAddress(target.usdcToken);
const clashToken = target.clashTokenEnv.length > 0
  ? (getOptionalAddress(target.clashTokenEnv.map((k) => env[k]).find(Boolean)) || zeroAddress)
  : zeroAddress;
const baseUsdPriceE6 = decimalToUnits(
  env[`NFT_${chainKey.toUpperCase()}_USD_PRICE`] || env.NFT_BASE_USD_PRICE || '8.9',
  6,
);
const clashUsdPriceE6 = decimalToUnits(
  env[`NFT_${chainKey.toUpperCase()}_CLASH_USD_PRICE`] || env.NFT_BASE_CLASH_USD_PRICE || '5',
  6,
);

const implHash = await walletClient.deployContract({
  abi: shopArtifact.abi,
  bytecode: shopArtifact.bytecode,
  maxPriorityFeePerGas,
});
console.log(`Shop implementation tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
console.log(`Shop implementation: ${implementation}`);

const initData = encodeFunctionData({
  abi: shopArtifact.abi,
  functionName: 'initialize',
  args: [
    account.address,
    getAddress(nftDeployment.proxy || nftDeployment.contract),
    quoteSigner,
    usdcToken,
    clashToken,
    baseUsdPriceE6,
    clashUsdPriceE6,
  ],
});

const proxyHash = await walletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode,
  args: [implementation, initData],
  maxPriorityFeePerGas,
});
console.log(`Shop proxy tx: ${proxyHash}`);
const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash, confirmations: 2 });
const shop = proxyReceipt.contractAddress;
console.log(`Shop proxy: ${shop}`);

const nft = getAddress(nftDeployment.proxy || nftDeployment.contract);
const minterHash = await walletClient.writeContract({
  address: nft,
  abi: nftArtifact.abi,
  functionName: 'setAuthorizedMinter',
  args: [shop, true],
  maxPriorityFeePerGas,
});
console.log(`Authorize shop minter tx: ${minterHash}`);
await publicClient.waitForTransactionReceipt({ hash: minterHash, confirmations: 2 });

let saleActive = false;
const saleEnv = env[`NFT_${chainKey.toUpperCase()}_SHOP_SALE_ACTIVE`];
if (saleEnv !== '0') {
  const saleHash = await walletClient.writeContract({
    address: shop,
    abi: shopArtifact.abi,
    functionName: 'setSaleActive',
    args: [true],
    maxPriorityFeePerGas,
  });
  console.log(`Activate sale tx: ${saleHash}`);
  await publicClient.waitForTransactionReceipt({ hash: saleHash, confirmations: 2 });
  saleActive = true;
}

const deployment = {
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
  implementationTxHash: implHash,
  proxyTxHash: proxyHash,
  authorizeMinterTxHash: minterHash,
  saleActive,
  upgradeable: true,
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(NFT_DIR, 'deployments', target.shopDeployFile), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Wrote ${target.shopDeployFile}`);

function getOptionalAddress(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || /^0x0{40}$/i.test(raw)) return null;
  return getAddress(raw);
}
