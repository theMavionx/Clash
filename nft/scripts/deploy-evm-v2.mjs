// Generalized DemonKingBaseV2 + DemonKingBaseShopV2 deploy for any EVM
// chain we want NFTs on. Reads target chain from --chain=arbitrum|monad|...
// (or env CLASH_DEPLOY_CHAIN). Writes a per-chain deployment JSON so the
// server can pick the contract addresses up from
// `nft/deployments/<chain>-mainnet.json`.

import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  parseGwei,
} from 'viem';
import { arbitrum, base } from 'viem/chains';
import { baseContractUri, evmTokenUri, loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

// Monad isn't in viem/chains yet (newer launch). Hand-define so the
// deployment doesn't depend on the lib version. Update RPC if the
// official endpoint moves.
const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://monadexplorer.com' } },
});

const CHAINS = {
  base:     { chain: base,     defaultRpc: 'https://mainnet.base.org',     deployFile: 'base-v2-mainnet.json',     envRpc: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL', 'VITE_BASE_RPC_URL'] },
  arbitrum: { chain: arbitrum, defaultRpc: 'https://arb1.arbitrum.io/rpc', deployFile: 'arbitrum-mainnet.json',    envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL', 'GAME_SHOP_ARB_RPC_URL'] },
  monad:    { chain: monad,    defaultRpc: 'https://rpc.monad.xyz',        deployFile: 'monad-mainnet.json',       envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL', 'GAME_SHOP_MONAD_RPC_URL'] },
};

// CLI arg parsing — accept --chain=arbitrum or env CLASH_DEPLOY_CHAIN.
const cliArg = process.argv.slice(2).find((a) => a.startsWith('--chain=')) || '';
const chainKey = (cliArg ? cliArg.split('=')[1] : process.env.CLASH_DEPLOY_CHAIN || '').toLowerCase();
if (!CHAINS[chainKey]) {
  console.error(`Unknown chain "${chainKey}". Pass --chain=arbitrum or --chain=monad.`);
  process.exit(1);
}
const target = CHAINS[chainKey];

const env = loadEnv();
const nftArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseV2.json');
const proxyArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingProxy.json');
if (!fs.existsSync(nftArtifactPath) || !fs.existsSync(proxyArtifactPath)) {
  throw new Error('Missing artifacts. Run npm run compile:base first.');
}

const nftArtifact = JSON.parse(fs.readFileSync(nftArtifactPath, 'utf8'));
const proxyArtifact = JSON.parse(fs.readFileSync(proxyArtifactPath, 'utf8'));
const rpcUrl = target.envRpc.map((k) => env[k]).find(Boolean) || target.defaultRpc;
const { account, source } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: target.chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: target.chain, transport: http(rpcUrl) });

const chainId = await publicClient.getChainId();
if (chainId !== target.chain.id) {
  throw new Error(`Expected ${target.chain.name} chainId ${target.chain.id}, got ${chainId} (check RPC URL)`);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log(`${target.chain.name} deployer: ${account.address}`);
console.log(`Key source: ${source}`);
console.log(`Native balance: ${formatEther(balance)} ${target.chain.nativeCurrency.symbol}`);
if (balance === 0n) {
  console.error(`Deployer has 0 ${target.chain.nativeCurrency.symbol}. Fund it before deploying.`);
  process.exit(1);
}

const maxPriorityFeePerGas = env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
  ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
  : undefined;

const implHash = await walletClient.deployContract({
  abi: nftArtifact.abi,
  bytecode: nftArtifact.bytecode,
  maxPriorityFeePerGas,
});
console.log(`DemonKingBaseV2 implementation tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
console.log(`Implementation: ${implementation}`);

// Each chain gets its own per-chain max supply (the contract enforces this
// as a hard ceiling). Server's NFT_GLOBAL_SUPPLY_CAP is the cross-chain
// gate — set the per-chain cap loose enough that one chain can absorb
// most of the demand without hitting the floor. Default 500 = same as
// the global cap, i.e. the server is the binding constraint.
const initialMaxSupply = BigInt(env[`NFT_${chainKey.toUpperCase()}_MAX_SUPPLY`] || env.NFT_GLOBAL_SUPPLY_CAP || 500);
const initialMaxPerTx = BigInt(env[`NFT_${chainKey.toUpperCase()}_MAX_PER_TX`] || env.NFT_BASE_MAX_PER_TX || 10);
const initialPriceWei = BigInt(env[`NFT_${chainKey.toUpperCase()}_PRICE_WEI`] || env.NFT_PRICE_WEI || '0');

// Token metadata is chain-specific so the server reads the level from the
// matching V3 contract before choosing L1/L2/L3 art.
const initArgs = [
  account.address,
  evmTokenUri(env, chainKey),
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
console.log(`Proxy tx: ${proxyHash}`);
const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash, confirmations: 2 });
const proxy = proxyReceipt.contractAddress;
console.log(`Proxy: ${proxy}`);

const [owner, maxSupply, maxPerTx, totalMinted] = await Promise.all([
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'owner' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'maxSupply' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'maxPerTx' }),
  publicClient.readContract({ address: proxy, abi: nftArtifact.abi, functionName: 'totalMinted' }),
]);

const deployment = {
  chain: chainKey,
  chainId,
  proxy,
  implementation,
  contract: proxy,
  deployer: account.address,
  owner: getAddress(owner),
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
fs.writeFileSync(path.join(NFT_DIR, 'deployments', target.deployFile), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Wrote ${target.deployFile}`);
console.log();
console.log(`Next steps for ${target.chain.name}:`);
console.log(`  1. Deploy DemonKingBaseShopV2 with --chain=${chainKey} (npm run deploy:evm-shop -- --chain=${chainKey})`);
console.log(`  2. authorizeMinter on NFT contract = shop proxy address`);
console.log(`  3. setSaleActive(true)`);
