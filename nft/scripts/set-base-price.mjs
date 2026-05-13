import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'base-mainnet.json');
const artifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBase.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/base-mainnet.json');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

const price = env.NFT_BASE_PRICE_WEI
  ? BigInt(env.NFT_BASE_PRICE_WEI)
  : parseEther(env.NFT_BASE_PRICE_ETH || env.NFT_PRICE_ETH || '0');

const hash = await walletClient.writeContract({
  address: deployment.contract,
  abi: artifact.abi,
  functionName: 'setMintPrice',
  args: [price],
});
console.log(`setMintPrice tx: ${hash}`);
await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
console.log(`Base mint price set to ${price.toString()} wei`);
