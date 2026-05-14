import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, parseGwei } from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'game-shop-base-mainnet.json');
const artifactPath = path.join(NFT_DIR, 'artifacts', 'ClashGameShopV1.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/game-shop-base-mainnet.json');
if (!fs.existsSync(artifactPath)) throw new Error('Missing artifact. Run npm run compile:base first.');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const rpcUrl = env.GAME_SHOP_BASE_RPC_URL || env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
const address = deployment.shop || deployment.proxy;
const maxPriorityFeePerGas = env.GAME_SHOP_BASE_PRIORITY_GWEI || env.NFT_BASE_PRIORITY_GWEI
  ? parseGwei(env.GAME_SHOP_BASE_PRIORITY_GWEI || env.NFT_BASE_PRIORITY_GWEI)
  : undefined;

const implHash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  maxPriorityFeePerGas,
});
console.log(`New ClashGameShop implementation tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
console.log(`New ClashGameShop implementation: ${implementation}`);

const upgradeHash = await walletClient.writeContract({
  address,
  abi: artifact.abi,
  functionName: 'upgradeToAndCall',
  args: [implementation, '0x'],
  maxPriorityFeePerGas,
});
console.log(`Upgrade game shop tx: ${upgradeHash}`);
await publicClient.waitForTransactionReceipt({ hash: upgradeHash, confirmations: 2 });

deployment.previousImplementation = deployment.implementation || null;
deployment.implementation = implementation;
deployment.implementationTxHash = implHash;
deployment.upgradeTxHash = upgradeHash;
deployment.upgradedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
