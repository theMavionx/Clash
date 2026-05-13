import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, parseGwei } from 'viem';
import { base } from 'viem/chains';
import { baseContractUri, baseTokenUri, loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'base-v2-mainnet.json');
const artifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseV2.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/base-v2-mainnet.json');
if (!fs.existsSync(artifactPath)) throw new Error('Missing artifact. Run npm run compile:base first.');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
const address = deployment.proxy || deployment.contract;
const maxPriorityFeePerGas = env.NFT_BASE_PRIORITY_GWEI
  ? parseGwei(env.NFT_BASE_PRIORITY_GWEI)
  : undefined;

await maybeWrite('NFT_BASE_MAX_SUPPLY', 'setMaxSupply', [BigInt(env.NFT_BASE_MAX_SUPPLY || 0)]);
await maybeWrite('NFT_BASE_MAX_PER_TX', 'setMaxPerTx', [BigInt(env.NFT_BASE_MAX_PER_TX || 0)]);
await maybeWrite('NFT_BASE_PRICE_WEI', 'setMintPrice', [BigInt(env.NFT_BASE_PRICE_WEI || 0)]);
if (env.NFT_BASE_TOKEN_URI) await write('setBaseURI', [baseTokenUri(env)]);
if (env.NFT_BASE_CONTRACT_URI) await write('setContractURI', [baseContractUri(env)]);
if (env.NFT_BASE_SALE_ACTIVE != null) await write('setSaleActive', [env.NFT_BASE_SALE_ACTIVE !== '0']);
if (env.NFT_BASE_PAUSED === '1') await write('pause', []);
if (env.NFT_BASE_PAUSED === '0') await write('unpause', []);
if (env.NFT_BASE_AUTHORIZED_MINTER) {
  await write('setAuthorizedMinter', [env.NFT_BASE_AUTHORIZED_MINTER, env.NFT_BASE_AUTHORIZED_MINTER_ALLOWED !== '0']);
}

console.log(`DemonKingBaseV2 config checked for ${address}`);

async function maybeWrite(envKey, functionName, args) {
  if (env[envKey] == null) return;
  await write(functionName, args);
}

async function write(functionName, args) {
  const hash = await walletClient.writeContract({
    address,
    abi: artifact.abi,
    functionName,
    args,
    maxPriorityFeePerGas,
  });
  console.log(`${functionName} tx: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
}
