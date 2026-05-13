import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const mode = (process.argv[2] || '').toLowerCase();
if (!['open', 'close', 'pause', 'unpause'].includes(mode)) {
  console.error('Usage: npm run sale:base -- open|close|pause|unpause');
  process.exit(1);
}

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'base-mainnet.json');
const artifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBase.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/base-mainnet.json');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://base-rpc.publicnode.com';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

async function write(functionName, args = []) {
  const hash = await walletClient.writeContract({
    address: deployment.contract,
    abi: artifact.abi,
    functionName,
    args,
  });
  console.log(`${functionName} tx: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
}

if (mode === 'open') {
  await write('setSaleActive', [true]);
  await write('unpause');
} else if (mode === 'close') {
  await write('setSaleActive', [false]);
  await write('pause');
} else if (mode === 'pause') {
  await write('pause');
} else if (mode === 'unpause') {
  await write('unpause');
}

console.log(`Base sale command complete: ${mode}`);
