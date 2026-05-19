import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getAddress,
  http,
  parseGwei,
} from 'viem';
import { arbitrum, base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const DEFAULT_CAP = 333n;

const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
});

const CHAINS = {
  base: {
    chain: base,
    defaultRpc: 'https://mainnet.base.org',
    envRpc: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL'],
    file: 'base-v3-mainnet.json',
  },
  arbitrum: {
    chain: arbitrum,
    defaultRpc: 'https://arb1.arbitrum.io/rpc',
    envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL'],
    file: 'arbitrum-v3-mainnet.json',
  },
  monad: {
    chain: monad,
    defaultRpc: 'https://rpc.monad.xyz',
    envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL'],
    file: 'monad-v3-mainnet.json',
  },
};

const ABI = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'maxSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'currentSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'setMaxSupply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newMaxSupply', type: 'uint256' }],
    outputs: [],
  },
];

const env = loadEnv();
const chainArg = process.argv.find((arg) => arg.startsWith('--chain='))?.slice('--chain='.length) || 'all';
const selected = chainArg === 'all' ? Object.keys(CHAINS) : [chainArg.toLowerCase()];
const targetCap = BigInt(env.NFT_TARGET_GLOBAL_SUPPLY_CAP || env.NFT_GLOBAL_SUPPLY_CAP || DEFAULT_CAP);
const { account, source } = parseEthAccount(env);

for (const chainKey of selected) {
  const spec = CHAINS[chainKey];
  if (!spec) throw new Error(`Unsupported chain ${chainKey}`);

  const deploymentPath = path.join(NFT_DIR, 'deployments', spec.file);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const proxy = getAddress(deployment.proxy || deployment.contract);
  const rpcUrl = spec.envRpc.map((key) => env[key]).find(Boolean) || spec.defaultRpc;
  const publicClient = createPublicClient({ chain: spec.chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: spec.chain, transport: http(rpcUrl) });

  const [chainId, balance, owner, maxSupply, totalMinted, currentSupply] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBalance({ address: account.address }),
    publicClient.readContract({ address: proxy, abi: ABI, functionName: 'owner' }),
    publicClient.readContract({ address: proxy, abi: ABI, functionName: 'maxSupply' }),
    publicClient.readContract({ address: proxy, abi: ABI, functionName: 'totalMinted' }),
    publicClient.readContract({ address: proxy, abi: ABI, functionName: 'currentSupply' }).catch(() => null),
  ]);

  if (chainId !== spec.chain.id) {
    throw new Error(`${chainKey}: expected chainId ${spec.chain.id}, got ${chainId}`);
  }
  if (getAddress(owner) !== getAddress(account.address)) {
    throw new Error(`${chainKey}: signer ${account.address} is not owner ${owner}`);
  }
  if (totalMinted > targetCap) {
    throw new Error(`${chainKey}: totalMinted ${totalMinted} is above target cap ${targetCap}`);
  }

  console.log(`\n[${chainKey}] proxy=${proxy}`);
  console.log(`  signer=${account.address} (${source}) balance=${formatEther(balance)} ${spec.chain.nativeCurrency.symbol}`);
  console.log(`  maxSupply=${maxSupply} totalMinted=${totalMinted} currentSupply=${currentSupply ?? 'n/a'} target=${targetCap}`);

  if (maxSupply <= targetCap) {
    console.log('  already at or below target; no on-chain change');
    deployment.currentMaxSupply = maxSupply.toString();
    deployment.currentMaxSupplyCheckedAt = new Date().toISOString();
    fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
    continue;
  }

  const maxPriorityFeePerGas = env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
    ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
    : undefined;
  const txHash = await walletClient.writeContract({
    address: proxy,
    abi: ABI,
    functionName: 'setMaxSupply',
    args: [targetCap],
    maxPriorityFeePerGas,
  });
  console.log(`  tx=${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 2 });
  if (receipt.status !== 'success') throw new Error(`${chainKey}: setMaxSupply reverted`);
  const postMaxSupply = await publicClient.readContract({ address: proxy, abi: ABI, functionName: 'maxSupply' });
  if (postMaxSupply !== targetCap) throw new Error(`${chainKey}: maxSupply mismatch after tx`);

  deployment.currentMaxSupply = targetCap.toString();
  deployment.currentMaxSupplyTxHash = txHash;
  deployment.currentMaxSupplyUpdatedAt = new Date().toISOString();
  fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`  ok gas=${receipt.gasUsed} updated ${spec.file}`);
}
