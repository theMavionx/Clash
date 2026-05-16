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
    feeEnv: 'NFT_BRIDGE_BASE_FEE_WEI',
    defaultFeeWei: 100000000000000n,
  },
  arbitrum: {
    chain: arbitrum,
    defaultRpc: 'https://arb1.arbitrum.io/rpc',
    envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL'],
    file: 'arbitrum-v3-mainnet.json',
    feeEnv: 'NFT_BRIDGE_ARBITRUM_FEE_WEI',
    defaultFeeWei: 100000000000000n,
  },
  monad: {
    chain: monad,
    defaultRpc: 'https://rpc.monad.xyz',
    envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL'],
    file: 'monad-v3-mainnet.json',
    feeEnv: 'NFT_BRIDGE_MONAD_FEE_WEI',
    defaultFeeWei: 6000000000000000000n,
  },
};

const ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'bridgeFeeWei',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'setBridgeFeeWei',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newFeeWei', type: 'uint256' }],
    outputs: [],
  },
];

const env = loadEnv();
const chainArg = process.argv.find((arg) => arg.startsWith('--chain='))?.slice('--chain='.length) || 'all';
const selected = chainArg === 'all' ? Object.keys(CHAINS) : [chainArg.toLowerCase()];
const { account, source } = parseEthAccount(env);

for (const chainKey of selected) {
  const spec = CHAINS[chainKey];
  if (!spec) throw new Error(`Unsupported chain ${chainKey}`);
  const deploymentPath = path.join(NFT_DIR, 'deployments', spec.file);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const proxy = getAddress(deployment.proxy);
  const rpcUrl = spec.envRpc.map((key) => env[key]).find(Boolean) || spec.defaultRpc;
  const publicClient = createPublicClient({ chain: spec.chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: spec.chain, transport: http(rpcUrl) });
  const targetFee = BigInt(env[spec.feeEnv] || spec.defaultFeeWei);
  const balance = await publicClient.getBalance({ address: account.address });
  const owner = await publicClient.readContract({ address: proxy, abi: ABI, functionName: 'owner' });
  if (getAddress(owner) !== getAddress(account.address)) {
    throw new Error(`${chainKey}: signer ${account.address} is not owner ${owner}`);
  }

  const currentFee = await publicClient.readContract({
    address: proxy,
    abi: ABI,
    functionName: 'bridgeFeeWei',
  });
  console.log(`\n[${chainKey}] proxy=${proxy}`);
  console.log(`  signer=${account.address} (${source}) balance=${formatEther(balance)} ${spec.chain.nativeCurrency.symbol}`);
  console.log(`  current=${currentFee.toString()} target=${targetFee.toString()} wei`);
  if (currentFee === targetFee) {
    console.log('  already set');
    continue;
  }

  const maxPriorityFeePerGas = env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
    ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
    : undefined;
  const txHash = await walletClient.writeContract({
    address: proxy,
    abi: ABI,
    functionName: 'setBridgeFeeWei',
    args: [targetFee],
    maxPriorityFeePerGas,
  });
  console.log(`  tx=${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 2 });
  if (receipt.status !== 'success') throw new Error(`${chainKey}: setBridgeFeeWei reverted`);
  const postFee = await publicClient.readContract({ address: proxy, abi: ABI, functionName: 'bridgeFeeWei' });
  if (postFee !== targetFee) throw new Error(`${chainKey}: fee mismatch after tx`);
  deployment.bridgeFeeWei = targetFee.toString();
  deployment.bridgeFeeTxHash = txHash;
  deployment.bridgeFeeUpdatedAt = new Date().toISOString();
  fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`  ok gas=${receipt.gasUsed} updated ${spec.file}`);
}
