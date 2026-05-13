import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const baseDeploymentPath = path.join(NFT_DIR, 'deployments', 'base-mainnet.json');
const shopDeploymentPath = path.join(NFT_DIR, 'deployments', 'base-shop-mainnet.json');
const artifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBase.json');
if (!fs.existsSync(baseDeploymentPath)) throw new Error('Missing deployments/base-mainnet.json');
if (!fs.existsSync(shopDeploymentPath)) throw new Error('Missing deployments/base-shop-mainnet.json');

const baseDeployment = JSON.parse(fs.readFileSync(baseDeploymentPath, 'utf8'));
const shopDeployment = JSON.parse(fs.readFileSync(shopDeploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://base-rpc.publicnode.com';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

const hash = await walletClient.writeContract({
  address: baseDeployment.contract,
  abi: artifact.abi,
  functionName: 'transferOwnership',
  args: [shopDeployment.shop],
});
console.log(`transferOwnership tx: ${hash}`);
await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
baseDeployment.ownerTransferredToShop = shopDeployment.shop;
baseDeployment.ownerTransferredAt = new Date().toISOString();
fs.writeFileSync(baseDeploymentPath, `${JSON.stringify(baseDeployment, null, 2)}\n`);
console.log(`Base NFT ownership transferred to shop ${shopDeployment.shop}`);
