import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, formatEther, http, parseGwei } from 'viem';
import { base } from 'viem/chains';
import { baseContractUri, baseTokenUri, loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const artifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBase.json');
if (!fs.existsSync(artifactPath)) {
  throw new Error('Missing artifact. Run npm run compile:base first.');
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
const { account, source } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

const chainId = await publicClient.getChainId();
if (chainId !== 8453) throw new Error(`Expected Base mainnet chainId 8453, got ${chainId}`);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Base deployer: ${account.address}`);
console.log(`Key source: ${source}`);
console.log(`Base balance: ${formatEther(balance)} ETH`);
if (balance === 0n) {
  console.error('Base deployer has 0 ETH. Fund it before deploying.');
  process.exit(1);
}

const initialPriceWei = BigInt(env.NFT_BASE_PRICE_WEI || env.NFT_PRICE_WEI || '0');
const args = [
  account.address,
  baseTokenUri(env),
  baseContractUri(env),
  initialPriceWei,
];

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args,
  maxPriorityFeePerGas: env.NFT_BASE_PRIORITY_GWEI ? parseGwei(env.NFT_BASE_PRIORITY_GWEI) : undefined,
});
console.log(`Deploy tx: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });
console.log(`DemonKingBase deployed: ${receipt.contractAddress}`);

const deployment = {
  chain: 'base',
  chainId,
  contract: receipt.contractAddress,
  deployer: account.address,
  txHash: hash,
  blockNumber: receipt.blockNumber?.toString(),
  maxSupply: 250,
  baseTokenUri: args[1],
  contractUri: args[2],
  initialPriceWei: initialPriceWei.toString(),
  deployedAt: new Date().toISOString(),
};
fs.mkdirSync(path.join(NFT_DIR, 'deployments'), { recursive: true });
fs.writeFileSync(path.join(NFT_DIR, 'deployments', 'base-mainnet.json'), `${JSON.stringify(deployment, null, 2)}\n`);
