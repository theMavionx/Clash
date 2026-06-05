// Production V3 deploy + UUPS upgrade for Base / Arbitrum / Monad / Ink.
//
// Performs all three steps atomically:
//   1. Deploys a fresh DemonKingBaseV3 implementation on the target chain.
//   2. Calls upgradeToAndCall(implV3, encode(reinitializeV3, ...)) on the
//      existing V2 proxy as the owner. This atomically swaps the impl AND
//      initializes V3-only fields, leaving zero half-upgraded state.
//   3. Writes the resulting addresses + tx hashes to
//      nft/deployments/<chain>-v3-mainnet.json for indexer pickup.
//
// Usage:
//   node scripts/deploy-evm-v3.mjs --chain=base
//   node scripts/deploy-evm-v3.mjs --chain=arbitrum
//   node scripts/deploy-evm-v3.mjs --chain=monad
//   node scripts/deploy-evm-v3.mjs --chain=ink
//
// Pre-flight: run the fork test first to validate storage compat:
//   npx hardhat test nodejs --network hardhatMainnet test/v3-fork.test.js
//
// SAFETY: this script touches mainnet contracts owned by NFT_BASE. It will
// not run with `--dry-run` if any sanity check fails. Always inspect the
// printed plan before answering 'y' at the confirmation prompt (or set
// CONFIRM_V3_DEPLOY=yes to skip the prompt in CI/scripts).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  parseGwei,
  zeroAddress,
} from 'viem';
import { arbitrum, base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

// ---------------------------------------------------------------------------
// Chain registry — proxy addresses + per-chain reinit args.
// ---------------------------------------------------------------------------
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

const TREASURY = '0xC024884ad9C5540996492Cc2DD080964941A3094';

const CHAINS = {
  base: {
    chain: base,
    defaultRpc: 'https://mainnet.base.org',
    envRpc: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL', 'VITE_BASE_RPC_URL'],
    v2DeployFile: 'base-v2-mainnet.json',
    v3DeployFile: 'base-v3-mainnet.json',
    eip712Name: 'DemonKingBase',
    usdcDefault: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  arbitrum: {
    chain: arbitrum,
    defaultRpc: 'https://arb1.arbitrum.io/rpc',
    envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL', 'GAME_SHOP_ARB_RPC_URL'],
    v2DeployFile: 'arbitrum-mainnet.json',
    v3DeployFile: 'arbitrum-v3-mainnet.json',
    eip712Name: 'DemonKingArbitrum',
    usdcDefault: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  monad: {
    chain: monad,
    defaultRpc: 'https://rpc.monad.xyz',
    envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL', 'GAME_SHOP_MONAD_RPC_URL'],
    v2DeployFile: 'monad-mainnet.json',
    v3DeployFile: 'monad-v3-mainnet.json',
    eip712Name: 'DemonKingMonad',
    usdcDefault: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
  },
  ink: {
    chain: ink,
    defaultRpc: 'https://rpc-gel.inkonchain.com',
    envRpc: ['NFT_INK_RPC_URL', 'INK_RPC_URL', 'GAME_SHOP_INK_RPC_URL'],
    v2DeployFile: 'ink-mainnet.json',
    v3DeployFile: 'ink-v3-mainnet.json',
    eip712Name: 'DemonKingInk',
    usdcDefault: '0x2D270e6886d130D724215A266106e6832161EAEd',
  },
};

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const cliArg = process.argv.slice(2).find((a) => a.startsWith('--chain=')) || '';
const chainKey = (cliArg ? cliArg.split('=')[1] : process.env.CLASH_DEPLOY_CHAIN || '').toLowerCase();
const spec = CHAINS[chainKey];
if (!spec) {
  console.error(`Unknown chain "${chainKey}". Use --chain=base|arbitrum|monad|ink.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Env + artifact load
// ---------------------------------------------------------------------------
const env = loadEnv();
const v3ArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseV3.json');
if (!fs.existsSync(v3ArtifactPath)) {
  throw new Error('Missing DemonKingBaseV3 artifact. Run `npm run compile:base` first.');
}
const v3Artifact = JSON.parse(fs.readFileSync(v3ArtifactPath, 'utf8'));

const v2DeployPath = path.join(NFT_DIR, 'deployments', spec.v2DeployFile);
if (!fs.existsSync(v2DeployPath)) {
  throw new Error(`Missing existing V2 deployment file ${spec.v2DeployFile}.`);
}
const v2Deployment = JSON.parse(fs.readFileSync(v2DeployPath, 'utf8'));
const proxyAddress = getAddress(v2Deployment.proxy || v2Deployment.contract);

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const rpcUrl = spec.envRpc.map((k) => env[k]).find(Boolean) || spec.defaultRpc;
const { account, source } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: spec.chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: spec.chain, transport: http(rpcUrl) });

const onChainChainId = await publicClient.getChainId();
if (onChainChainId !== spec.chain.id) {
  throw new Error(`Expected ${spec.chain.name} chainId ${spec.chain.id}, got ${onChainChainId} — RPC URL is wrong.`);
}

// ---------------------------------------------------------------------------
// Resolve per-chain reinit args
// ---------------------------------------------------------------------------
function envOr(keyList, fallback) {
  for (const k of keyList) if (env[k]) return env[k];
  return fallback;
}

const quoteSigner = getAddress(
  envOr([`NFT_${chainKey.toUpperCase()}_QUOTE_SIGNER`, 'NFT_QUOTE_SIGNER'], account.address),
);
const usdcToken = getAddress(
  envOr([`NFT_${chainKey.toUpperCase()}_USDC_TOKEN`, 'NFT_USDC_TOKEN'], spec.usdcDefault),
);
// CoP is optional — pass zero when not bridged to this chain yet.
const copTokenRaw = envOr([`NFT_${chainKey.toUpperCase()}_CLASH_TOKEN`, 'NFT_CLASH_TOKEN', 'GAME_SHOP_COP_TOKEN'], '');
const copToken = copTokenRaw ? getAddress(copTokenRaw) : zeroAddress;
const royaltyReceiver = getAddress(envOr([`NFT_${chainKey.toUpperCase()}_ROYALTY_RECEIVER`, 'NFT_ROYALTY_RECEIVER'], TREASURY));
const royaltyBps = Number(envOr([`NFT_${chainKey.toUpperCase()}_ROYALTY_BPS`, 'NFT_ROYALTY_BPS'], '250'));
const eip712Version = '3';

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------
const V2_VIEW_ABI = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'maxSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
];

const [proxyOwner, totalMinted, maxSupply, paused, balance] = await Promise.all([
  publicClient.readContract({ address: proxyAddress, abi: V2_VIEW_ABI, functionName: 'owner' }),
  publicClient.readContract({ address: proxyAddress, abi: V2_VIEW_ABI, functionName: 'totalMinted' }),
  publicClient.readContract({ address: proxyAddress, abi: V2_VIEW_ABI, functionName: 'maxSupply' }),
  publicClient.readContract({ address: proxyAddress, abi: V2_VIEW_ABI, functionName: 'paused' }),
  publicClient.getBalance({ address: account.address }),
]);

if (getAddress(proxyOwner) !== getAddress(account.address)) {
  throw new Error(
    `Deployer ${account.address} is NOT the proxy owner (${proxyOwner}). ` +
    `Owner key required to upgrade. Aborting.`,
  );
}

console.log('\n=== V3 Upgrade Plan ===');
console.log(`  Chain          : ${spec.chain.name} (chainId ${spec.chain.id})`);
console.log(`  RPC            : ${rpcUrl}`);
console.log(`  V2 proxy       : ${proxyAddress}`);
console.log(`  Owner / signer : ${account.address}   (${source})`);
console.log(`  Native balance : ${formatEther(balance)} ${spec.chain.nativeCurrency.symbol}`);
console.log(`  V2 state       : totalMinted=${totalMinted} / maxSupply=${maxSupply} / paused=${paused}`);
console.log('');
console.log('  reinitializeV3 args:');
console.log(`    quoteSigner     : ${quoteSigner}`);
console.log(`    usdcToken       : ${usdcToken}`);
console.log(`    copToken        : ${copToken}${copToken === zeroAddress ? '   (CoP path disabled — set later via setCopToken)' : ''}`);
console.log(`    royaltyReceiver : ${royaltyReceiver}`);
console.log(`    royaltyBps      : ${royaltyBps}   (=${royaltyBps / 100}%)`);
console.log(`    eip712Name      : ${spec.eip712Name}`);
console.log(`    eip712Version   : ${eip712Version}`);
console.log('');

if (balance === 0n) {
  console.error(`Deployer has 0 ${spec.chain.nativeCurrency.symbol}. Fund it before deploying.`);
  process.exit(1);
}
if (royaltyBps > 1000) {
  console.error(`royaltyBps ${royaltyBps} exceeds 10% cap. Aborting.`);
  process.exit(1);
}

// Confirm unless CI override
if (env.CONFIRM_V3_DEPLOY !== 'yes') {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`Proceed with V3 upgrade on ${spec.chain.name}? [y/N] `)).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Step 1: deploy V3 implementation
// ---------------------------------------------------------------------------
console.log('\n[1/2] Deploying DemonKingBaseV3 implementation…');
const maxPriorityFeePerGas = env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
  ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
  : undefined;

const implTxHash = await walletClient.deployContract({
  abi: v3Artifact.abi,
  bytecode: v3Artifact.bytecode,
  maxPriorityFeePerGas,
});
console.log(`  impl tx: ${implTxHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implTxHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
if (!implementation) throw new Error('Impl deploy returned no contract address');
console.log(`  ✓ V3 implementation: ${implementation}`);

// ---------------------------------------------------------------------------
// Step 2: upgradeToAndCall(implV3, reinitializeV3(...))
// ---------------------------------------------------------------------------
console.log('\n[2/2] Calling proxy.upgradeToAndCall(impl, reinitializeV3(...))…');
const reinitData = encodeFunctionData({
  abi: v3Artifact.abi,
  functionName: 'reinitializeV3',
  args: [
    quoteSigner,
    usdcToken,
    copToken,
    royaltyReceiver,
    royaltyBps,
    spec.eip712Name,
    eip712Version,
  ],
});

const UUPS_ABI = [{
  type: 'function',
  name: 'upgradeToAndCall',
  stateMutability: 'payable',
  inputs: [{ type: 'address', name: 'newImplementation' }, { type: 'bytes', name: 'data' }],
  outputs: [],
}];

const upgradeTxHash = await walletClient.writeContract({
  address: proxyAddress,
  abi: UUPS_ABI,
  functionName: 'upgradeToAndCall',
  args: [implementation, reinitData],
  maxPriorityFeePerGas,
});
console.log(`  upgrade tx: ${upgradeTxHash}`);
const upgradeReceipt = await publicClient.waitForTransactionReceipt({ hash: upgradeTxHash, confirmations: 2 });
if (upgradeReceipt.status !== 'success') {
  throw new Error(`upgradeToAndCall reverted on-chain (tx ${upgradeTxHash}). Implementation is deployed but proxy still points at V2.`);
}
console.log(`  ✓ Upgrade complete. Gas used: ${upgradeReceipt.gasUsed}`);

// ---------------------------------------------------------------------------
// Step 3: verify V3 state on-chain
// ---------------------------------------------------------------------------
console.log('\n[verify] Reading V3 state through the proxy…');
const V3_VIEW_ABI = [
  ...V2_VIEW_ABI,
  { name: 'quoteSigner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'usdcToken', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'copToken', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'royaltyReceiver', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'royaltyBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  // EIP-5267 domain: bytes1 fields, string name, string version, uint256 chainId,
  // address verifyingContract, bytes32 salt, uint256[] extensions.
  { name: 'eip712Domain', type: 'function', stateMutability: 'view', inputs: [], outputs: [
    { type: 'bytes1' }, { type: 'string' }, { type: 'string' }, { type: 'uint256' },
    { type: 'address' }, { type: 'bytes32' }, { type: 'uint256[]' },
  ] },
];
// Helper that retries each read up to 3 times against fallback RPCs — Base
// default RPC occasionally flaps on read calls right after a successful
// write. We do NOT want a transient read failure to abort a successful deploy.
const FALLBACK_RPCS = {
  base: ['https://base.publicnode.com', 'https://base.drpc.org', rpcUrl],
  arbitrum: [rpcUrl, 'https://arbitrum-one.publicnode.com'],
  monad: [rpcUrl],
  ink: [rpcUrl, 'https://rpc-gel.inkonchain.com'],
};
async function readWithFallback(functionName, args = []) {
  let lastErr;
  for (const url of FALLBACK_RPCS[chainKey] || [rpcUrl]) {
    const fbClient = createPublicClient({ chain: spec.chain, transport: http(url) });
    try {
      return await fbClient.readContract({ address: proxyAddress, abi: V3_VIEW_ABI, functionName, args });
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
const [vSigner, vUsdc, vCop, vRoy, vBps, vTotal, vDomain] = await Promise.all([
  readWithFallback('quoteSigner'),
  readWithFallback('usdcToken'),
  readWithFallback('copToken'),
  readWithFallback('royaltyReceiver'),
  readWithFallback('royaltyBps'),
  readWithFallback('totalMinted'),
  readWithFallback('eip712Domain'),
]);
if (getAddress(vSigner) !== quoteSigner) throw new Error(`signer mismatch: on-chain ${vSigner}`);
if (getAddress(vUsdc) !== usdcToken) throw new Error(`usdc mismatch: on-chain ${vUsdc}`);
if (getAddress(vCop) !== copToken) throw new Error(`cop mismatch: on-chain ${vCop}`);
if (getAddress(vRoy) !== royaltyReceiver) throw new Error(`royalty receiver mismatch: on-chain ${vRoy}`);
if (vBps !== royaltyBps) throw new Error(`royaltyBps mismatch: on-chain ${vBps}`);
if (vTotal !== totalMinted) throw new Error(`totalMinted changed! pre=${totalMinted} post=${vTotal}. CRITICAL — investigate.`);
if (vDomain[1] !== spec.eip712Name) throw new Error(`EIP-712 name mismatch: on-chain "${vDomain[1]}" vs expected "${spec.eip712Name}"`);
console.log('  ✓ All V3 fields verified on-chain. Pre-existing totalMinted preserved.');

// ---------------------------------------------------------------------------
// Step 4: write deployment JSON
// ---------------------------------------------------------------------------
const v3Deployment = {
  chain: chainKey,
  chainId: spec.chain.id,
  proxy: proxyAddress,
  contract: proxyAddress,
  v2Implementation: v2Deployment.implementation,
  v3Implementation: implementation,
  deployer: account.address,
  owner: account.address,
  quoteSigner,
  usdcToken,
  copToken,
  royaltyReceiver,
  royaltyBps,
  eip712Name: spec.eip712Name,
  eip712Version,
  totalMintedAtUpgrade: totalMinted.toString(),
  maxSupplyAtUpgrade: maxSupply.toString(),
  implTxHash,
  upgradeTxHash,
  implBlockNumber: implReceipt.blockNumber?.toString(),
  upgradeBlockNumber: upgradeReceipt.blockNumber?.toString(),
  upgradedAt: new Date().toISOString(),
};
fs.mkdirSync(path.join(NFT_DIR, 'deployments'), { recursive: true });
fs.writeFileSync(path.join(NFT_DIR, 'deployments', spec.v3DeployFile), `${JSON.stringify(v3Deployment, null, 2)}\n`);
console.log(`\n✓ Wrote ${spec.v3DeployFile}.`);

console.log('\nNext:');
console.log(`  - Update server's config to read ${spec.v3DeployFile} (replaces ${spec.v2DeployFile} as canonical).`);
console.log(`  - Bump maxSupply to 333 with setMaxSupply if you want per-chain cap = global cap.`);
console.log(`  - If CoP is bridged to ${spec.chain.name} later, call setCopToken to enable the CoP upgrade path.`);
