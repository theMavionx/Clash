// Set the V3 NFT base token URI on Base / Arbitrum / Monad / Ink.
//
// By default this is a dry-run. Pass --execute to submit the transaction.
// Examples:
//   node scripts/set-evm-v3-metadata-uri.mjs --chain=arbitrum --execute
//   node scripts/set-evm-v3-metadata-uri.mjs --all --execute

import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseGwei,
} from 'viem';
import { arbitrum, base } from 'viem/chains';
import { evmTokenUri, loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://monadexplorer.com' } },
});
const ink = defineChain({
  id: 57073,
  name: 'Ink',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-gel.inkonchain.com'] } },
  blockExplorers: { default: { name: 'Ink Explorer', url: 'https://explorer.inkonchain.com' } },
});

const CHAINS = {
  base: {
    chain: base,
    rpcEnv: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL', 'VITE_BASE_RPC_URL'],
    defaultRpc: 'https://mainnet.base.org',
    deployFile: 'base-v3-mainnet.json',
  },
  arbitrum: {
    chain: arbitrum,
    rpcEnv: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL', 'GAME_SHOP_ARB_RPC_URL'],
    defaultRpc: 'https://arb1.arbitrum.io/rpc',
    deployFile: 'arbitrum-v3-mainnet.json',
  },
  monad: {
    chain: monad,
    rpcEnv: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL', 'GAME_SHOP_MONAD_RPC_URL'],
    defaultRpc: 'https://rpc.monad.xyz',
    deployFile: 'monad-v3-mainnet.json',
  },
  ink: {
    chain: ink,
    rpcEnv: ['NFT_INK_RPC_URL', 'INK_RPC_URL', 'GAME_SHOP_INK_RPC_URL'],
    defaultRpc: 'https://rpc-gel.inkonchain.com',
    deployFile: 'ink-v3-mainnet.json',
  },
};

const ABI = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
  { name: 'setBaseURI', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'string' }], outputs: [] },
];

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const all = args.includes('--all');
const chainArg = args.find((arg) => arg.startsWith('--chain='))?.split('=')[1]?.toLowerCase();
const targets = all ? Object.keys(CHAINS) : [chainArg || process.env.CLASH_DEPLOY_CHAIN || ''];

const env = loadEnv();
const { account, source } = parseEthAccount(env);

for (const chainKey of targets) {
  const spec = CHAINS[chainKey];
  if (!spec) throw new Error(`Unknown chain "${chainKey}". Use --chain=base|arbitrum|monad|ink or --all.`);

  const deployPath = path.join(NFT_DIR, 'deployments', spec.deployFile);
  if (!fs.existsSync(deployPath)) throw new Error(`Missing ${spec.deployFile}`);
  const deployment = JSON.parse(fs.readFileSync(deployPath, 'utf8'));
  const address = getAddress(deployment.proxy || deployment.contract);
  const rpcUrl = spec.rpcEnv.map((key) => env[key]).find(Boolean) || spec.defaultRpc;
  const publicClient = createPublicClient({ chain: spec.chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: spec.chain, transport: http(rpcUrl) });
  const desiredBaseUri = evmTokenUri(env, chainKey);
  const [owner, totalMinted] = await Promise.all([
    publicClient.readContract({ address, abi: ABI, functionName: 'owner' }),
    publicClient.readContract({ address, abi: ABI, functionName: 'totalMinted' }),
  ]);

  if (getAddress(owner) !== getAddress(account.address)) {
    throw new Error(`${chainKey}: signer ${account.address} (${source}) is not NFT owner ${owner}`);
  }

  let currentTokenUri = null;
  if (totalMinted > 0n) {
    currentTokenUri = await publicClient
      .readContract({ address, abi: ABI, functionName: 'tokenURI', args: [1n] })
      .catch(() => null);
  }
  const currentBaseLooksCorrect = currentTokenUri
    ? String(currentTokenUri).startsWith(desiredBaseUri)
    : deployment.baseTokenUri === desiredBaseUri;

  console.log(`\n${chainKey}: ${address}`);
  console.log(`  desired base URI : ${desiredBaseUri}`);
  console.log(`  totalMinted      : ${totalMinted}`);
  if (currentTokenUri) console.log(`  tokenURI(1)      : ${currentTokenUri}`);
  console.log(`  mode             : ${execute ? 'execute' : 'dry-run'}`);

  if (currentBaseLooksCorrect && !env.NFT_FORCE_SET_BASE_URI) {
    console.log('  ok: already configured');
    continue;
  }
  if (!execute) {
    console.log('  planned: setBaseURI');
    continue;
  }

  const maxPriorityFeePerGas = env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
    ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
    : undefined;
  const hash = await walletClient.writeContract({
    address,
    abi: ABI,
    functionName: 'setBaseURI',
    args: [desiredBaseUri],
    maxPriorityFeePerGas,
  });
  console.log(`  setBaseURI tx    : ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  if (receipt.status !== 'success') throw new Error(`${chainKey}: setBaseURI reverted (${hash})`);

  deployment.baseTokenUri = desiredBaseUri;
  deployment.baseUriTxHash = hash;
  deployment.baseUriUpdatedAt = new Date().toISOString();
  fs.writeFileSync(deployPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log('  ok: deployment JSON updated');
}
