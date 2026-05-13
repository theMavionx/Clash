import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  parseGwei,
} from 'viem';
import { base } from 'viem/chains';
import { baseContractUri, baseTokenUri, loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const nftArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseV2.json');
const proxyArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingProxy.json');
if (!fs.existsSync(nftArtifactPath) || !fs.existsSync(proxyArtifactPath)) {
  throw new Error('Missing artifacts. Run npm run compile:base first.');
}

const nftArtifact = JSON.parse(fs.readFileSync(nftArtifactPath, 'utf8'));
const proxyArtifact = JSON.parse(fs.readFileSync(proxyArtifactPath, 'utf8'));
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

const maxPriorityFeePerGas = env.NFT_BASE_PRIORITY_GWEI
  ? parseGwei(env.NFT_BASE_PRIORITY_GWEI)
  : undefined;

const implHash = await walletClient.deployContract({
  abi: nftArtifact.abi,
  bytecode: nftArtifact.bytecode,
  maxPriorityFeePerGas,
});
console.log(`DemonKingBaseV2 implementation tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
console.log(`DemonKingBaseV2 implementation: ${implementation}`);

const initialMaxSupply = BigInt(env.NFT_BASE_MAX_SUPPLY || 250);
const initialMaxPerTx = BigInt(env.NFT_BASE_MAX_PER_TX || 10);
const initialPriceWei = BigInt(env.NFT_BASE_PRICE_WEI || env.NFT_PRICE_WEI || '0');
const initArgs = [
  account.address,
  baseTokenUri(env),
  baseContractUri(env),
  initialMaxSupply,
  initialMaxPerTx,
  initialPriceWei,
];
const initData = encodeFunctionData({
  abi: nftArtifact.abi,
  functionName: 'initialize',
  args: initArgs,
});

const proxyHash = await walletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode,
  args: [implementation, initData],
  maxPriorityFeePerGas,
});
console.log(`DemonKingBaseV2 proxy tx: ${proxyHash}`);
const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash, confirmations: 2 });
const proxy = proxyReceipt.contractAddress;
console.log(`DemonKingBaseV2 proxy: ${proxy}`);

const [owner, maxSupply, maxPerTx, totalMinted] = await Promise.all([
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'owner' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'maxSupply' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'maxPerTx' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'totalMinted' }),
]);

const deployment = {
  chain: 'base',
  chainId,
  proxy,
  implementation,
  contract: proxy,
  deployer: account.address,
  owner,
  implementationTxHash: implHash,
  proxyTxHash: proxyHash,
  implementationBlockNumber: implReceipt.blockNumber?.toString(),
  proxyBlockNumber: proxyReceipt.blockNumber?.toString(),
  maxSupply: maxSupply.toString(),
  maxPerTx: maxPerTx.toString(),
  totalMinted: totalMinted.toString(),
  baseTokenUri: initArgs[1],
  contractUri: initArgs[2],
  initialPriceWei: initialPriceWei.toString(),
  upgradeable: true,
  deployedAt: new Date().toISOString(),
};
fs.mkdirSync(path.join(NFT_DIR, 'deployments'), { recursive: true });
fs.writeFileSync(path.join(NFT_DIR, 'deployments', 'base-v2-mainnet.json'), `${JSON.stringify(deployment, null, 2)}\n`);
