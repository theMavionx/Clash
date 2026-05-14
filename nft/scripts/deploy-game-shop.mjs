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
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const shopArtifactPath = path.join(NFT_DIR, 'artifacts', 'ClashGameShopV1.json');
const proxyArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingProxy.json');
for (const file of [shopArtifactPath, proxyArtifactPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(NFT_DIR, file)}. Run npm run compile:base first.`);
}

const shopArtifact = JSON.parse(fs.readFileSync(shopArtifactPath, 'utf8'));
const proxyArtifact = JSON.parse(fs.readFileSync(proxyArtifactPath, 'utf8'));

const rpcUrl = env.GAME_SHOP_BASE_RPC_URL || env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
if (chainId !== 8453) throw new Error(`Expected Base mainnet chainId 8453, got ${chainId}`);

const maxPriorityFeePerGas = env.NFT_BASE_PRIORITY_GWEI || env.GAME_SHOP_BASE_PRIORITY_GWEI
  ? parseGwei(env.GAME_SHOP_BASE_PRIORITY_GWEI || env.NFT_BASE_PRIORITY_GWEI)
  : undefined;

const quoteSigner = getAddress(env.GAME_SHOP_QUOTE_SIGNER || env.NFT_BASE_SHOP_QUOTE_SIGNER || account.address);
const treasury = getAddress(env.GAME_SHOP_TREASURY || env.NFT_FEE_RECIPIENT || account.address);
const copToken = getOptionalAddress(env.GAME_SHOP_COP_TOKEN || env.NFT_BASE_CLASH_TOKEN || env.CLASH_BASE_TOKEN);
if (!copToken) throw new Error('Missing GAME_SHOP_COP_TOKEN / NFT_BASE_CLASH_TOKEN / CLASH_BASE_TOKEN');

const implHash = await walletClient.deployContract({
  abi: shopArtifact.abi,
  bytecode: shopArtifact.bytecode,
  maxPriorityFeePerGas,
});
console.log(`ClashGameShopV1 implementation tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
console.log(`ClashGameShopV1 implementation: ${implementation}`);

const initData = encodeFunctionData({
  abi: shopArtifact.abi,
  functionName: 'initialize',
  args: [account.address, quoteSigner, treasury, copToken],
});

const proxyHash = await walletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode,
  args: [implementation, initData],
  maxPriorityFeePerGas,
});
console.log(`ClashGameShopV1 proxy tx: ${proxyHash}`);
const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash, confirmations: 2 });
const shop = proxyReceipt.contractAddress;
console.log(`ClashGameShopV1 proxy: ${shop}`);

let saleActive = false;
if (env.GAME_SHOP_SALE_ACTIVE !== '0') {
  const saleHash = await walletClient.writeContract({
    address: shop,
    abi: shopArtifact.abi,
    functionName: 'setSaleActive',
    args: [true],
    maxPriorityFeePerGas,
  });
  console.log(`Activate game shop sale tx: ${saleHash}`);
  await publicClient.waitForTransactionReceipt({ hash: saleHash, confirmations: 2 });
  saleActive = true;
}

const deployment = {
  chain: 'base',
  chainId,
  shop,
  proxy: shop,
  implementation,
  deployer: account.address,
  owner: account.address,
  quoteSigner,
  treasury,
  copToken,
  saleActive,
  upgradeable: true,
  implementationTxHash: implHash,
  proxyTxHash: proxyHash,
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(NFT_DIR, 'deployments', 'game-shop-base-mainnet.json'), `${JSON.stringify(deployment, null, 2)}\n`);

function getOptionalAddress(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || /^0x0{40}$/i.test(raw)) return null;
  return getAddress(raw);
}
