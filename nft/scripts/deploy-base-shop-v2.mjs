import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  parseGwei,
  zeroAddress,
} from 'viem';
import { base } from 'viem/chains';
import { decimalToUnits } from './lib-prices.mjs';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const baseDeploymentPath = path.join(NFT_DIR, 'deployments', 'base-v2-mainnet.json');
const shopArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseShopV2.json');
const nftArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseV2.json');
const proxyArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingProxy.json');
for (const file of [baseDeploymentPath, shopArtifactPath, nftArtifactPath, proxyArtifactPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(NFT_DIR, file)}`);
}

const baseDeployment = JSON.parse(fs.readFileSync(baseDeploymentPath, 'utf8'));
const shopArtifact = JSON.parse(fs.readFileSync(shopArtifactPath, 'utf8'));
const nftArtifact = JSON.parse(fs.readFileSync(nftArtifactPath, 'utf8'));
const proxyArtifact = JSON.parse(fs.readFileSync(proxyArtifactPath, 'utf8'));

const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
if (chainId !== 8453) throw new Error(`Expected Base mainnet chainId 8453, got ${chainId}`);

const maxPriorityFeePerGas = env.NFT_BASE_PRIORITY_GWEI
  ? parseGwei(env.NFT_BASE_PRIORITY_GWEI)
  : undefined;

const quoteSigner = getAddress(env.NFT_BASE_SHOP_QUOTE_SIGNER || account.address);
const usdcToken = getOptionalAddress(env.NFT_BASE_USDC_TOKEN) || getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
const clashToken = getOptionalAddress(env.NFT_BASE_CLASH_TOKEN || env.CLASH_BASE_TOKEN) || zeroAddress;
const baseUsdPriceE6 = decimalToUnits(env.NFT_BASE_USD_PRICE || env.NFT_BASE_NATIVE_USD_PRICE || '8.9', 6);
const clashUsdPriceE6 = decimalToUnits(env.NFT_BASE_CLASH_USD_PRICE || '5', 6);

const implHash = await walletClient.deployContract({
  abi: shopArtifact.abi,
  bytecode: shopArtifact.bytecode,
  maxPriorityFeePerGas,
});
console.log(`DemonKingBaseShopV2 implementation tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
console.log(`DemonKingBaseShopV2 implementation: ${implementation}`);

const initData = encodeFunctionData({
  abi: shopArtifact.abi,
  functionName: 'initialize',
  args: [
    account.address,
    getAddress(baseDeployment.proxy || baseDeployment.contract),
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
console.log(`DemonKingBaseShopV2 proxy tx: ${proxyHash}`);
const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash, confirmations: 2 });
const shop = proxyReceipt.contractAddress;
console.log(`DemonKingBaseShopV2 proxy: ${shop}`);

const nft = getAddress(baseDeployment.proxy || baseDeployment.contract);
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
if (env.NFT_BASE_SHOP_SALE_ACTIVE !== '0') {
  const saleHash = await walletClient.writeContract({
    address: shop,
    abi: shopArtifact.abi,
    functionName: 'setSaleActive',
    args: [true],
    maxPriorityFeePerGas,
  });
  console.log(`Activate shop sale tx: ${saleHash}`);
  await publicClient.waitForTransactionReceipt({ hash: saleHash, confirmations: 2 });
  saleActive = true;
}

const deployment = {
  chain: 'base',
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
fs.writeFileSync(path.join(NFT_DIR, 'deployments', 'base-shop-v2-mainnet.json'), `${JSON.stringify(deployment, null, 2)}\n`);

function getOptionalAddress(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || /^0x0{40}$/i.test(raw)) return null;
  return getAddress(raw);
}
