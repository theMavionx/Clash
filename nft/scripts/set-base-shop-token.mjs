import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, getAddress, http, zeroAddress } from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const tokenArg = process.argv[2] || '';
const mode = (process.argv[3] || 'allow').toLowerCase();
if (!tokenArg || !['allow', 'deny'].includes(mode)) {
  console.error('Usage: npm run token:base-shop -- native|usdc|cop|0xToken allow|deny');
  process.exit(1);
}

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'base-shop-mainnet.json');
const artifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseShop.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/base-shop-mainnet.json');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const token = tokenArg.toLowerCase() === 'native'
  ? zeroAddress
  : tokenArg.toLowerCase() === 'usdc'
    ? getAddress(env.NFT_BASE_USDC_TOKEN || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    : tokenArg.toLowerCase() === 'cop' || tokenArg.toLowerCase() === 'clash'
      ? getAddress(env.NFT_BASE_CLASH_TOKEN || env.CLASH_BASE_TOKEN)
      : getAddress(tokenArg);
const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://base-rpc.publicnode.com';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

const hash = await walletClient.writeContract({
  address: deployment.shop,
  abi: artifact.abi,
  functionName: 'setPaymentToken',
  args: [token, mode === 'allow'],
});
console.log(`setPaymentToken tx: ${hash}`);
await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
deployment.allowedPaymentTokens = deployment.allowedPaymentTokens || {};
deployment.allowedPaymentTokens[token] = mode === 'allow';
deployment.updatedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`${mode === 'allow' ? 'Allowed' : 'Denied'} Base shop payment token ${token}`);
