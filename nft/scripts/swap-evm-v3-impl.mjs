// Swap the V3 implementation on an existing V3 proxy WITHOUT calling any
// reinitializer. Used when the new implementation introduces no new storage
// (e.g. the N-to-N bridge upgrade in V3.1 that only changes function logic +
// EIP-712 typehash).
//
// Usage:
//   node scripts/swap-evm-v3-impl.mjs --chain=base
//   node scripts/swap-evm-v3-impl.mjs --chain=arbitrum
//   node scripts/swap-evm-v3-impl.mjs --chain=monad

import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient, createWalletClient, defineChain, formatEther, getAddress, http, parseGwei,
} from 'viem';
import { arbitrum, base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const monad = defineChain({
  id: 143, name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
});

const CHAINS = {
  base:     { chain: base,     defaultRpc: 'https://mainnet.base.org',     envRpc: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL'],         v3DeployFile: 'base-v3-mainnet.json' },
  arbitrum: { chain: arbitrum, defaultRpc: 'https://arb1.arbitrum.io/rpc', envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL'], v3DeployFile: 'arbitrum-v3-mainnet.json' },
  monad:    { chain: monad,    defaultRpc: 'https://rpc.monad.xyz',        envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL'],       v3DeployFile: 'monad-v3-mainnet.json' },
};

const arg = process.argv.slice(2).find((a) => a.startsWith('--chain=')) || '';
const chainKey = (arg ? arg.split('=')[1] : '').toLowerCase();
const spec = CHAINS[chainKey];
if (!spec) { console.error('Usage: --chain=base|arbitrum|monad'); process.exit(1); }

const env = loadEnv();
const v3Artifact = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'artifacts', 'DemonKingBaseV3.json'), 'utf8'));
const v3DeployPath = path.join(NFT_DIR, 'deployments', spec.v3DeployFile);
const v3 = JSON.parse(fs.readFileSync(v3DeployPath, 'utf8'));
const proxy = getAddress(v3.proxy);

const rpcUrl = spec.envRpc.map((k) => env[k]).find(Boolean) || spec.defaultRpc;
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: spec.chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: spec.chain, transport: http(rpcUrl) });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`\n=== ${spec.chain.name} V3 impl swap ===`);
console.log(`  proxy   : ${proxy}`);
console.log(`  deployer: ${account.address}  balance: ${formatEther(balance)} ${spec.chain.nativeCurrency.symbol}`);
console.log(`  previous impl: ${v3.v3Implementation}`);

const maxPriorityFeePerGas = env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
  ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
  : undefined;

console.log('\n[1/2] Deploying new V3 implementation...');
const implHash = await walletClient.deployContract({
  abi: v3Artifact.abi, bytecode: v3Artifact.bytecode, maxPriorityFeePerGas,
});
console.log(`  tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const newImpl = implReceipt.contractAddress;
console.log(`  ✓ new impl: ${newImpl}`);

console.log('\n[2/2] Calling upgradeToAndCall(newImpl, "0x") — swap only, no reinit...');
const UUPS_ABI = [{
  type: 'function', name: 'upgradeToAndCall', stateMutability: 'payable',
  inputs: [{ type: 'address' }, { type: 'bytes' }], outputs: [],
}];
const upHash = await walletClient.writeContract({
  address: proxy, abi: UUPS_ABI, functionName: 'upgradeToAndCall',
  args: [newImpl, '0x'], maxPriorityFeePerGas,
});
const upReceipt = await publicClient.waitForTransactionReceipt({ hash: upHash, confirmations: 2 });
if (upReceipt.status !== 'success') throw new Error(`upgradeToAndCall reverted: ${upHash}`);
console.log(`  ✓ upgrade tx: ${upHash}, gas: ${upReceipt.gasUsed}`);

// Update deployment JSON
v3.v3ImplementationPrevious = v3.v3Implementation;
v3.v3Implementation = getAddress(newImpl);
v3.v3SwapHistory = (v3.v3SwapHistory || []).concat([{
  fromImpl: v3.v3ImplementationPrevious,
  toImpl: getAddress(newImpl),
  implTxHash: implHash,
  upgradeTxHash: upHash,
  swappedAt: new Date().toISOString(),
  note: process.env.V3_UPGRADE_NOTE || 'V3 implementation swap (see code diff for changes).',
}]);
fs.writeFileSync(v3DeployPath, JSON.stringify(v3, null, 2) + '\n');
console.log(`\n✓ Updated ${spec.v3DeployFile}`);
