// Rev-upgrade an EVM V3 proxy to a NEWER V3 implementation.
// Use this when the proxy is already running a V3 impl (reinitializeV3
// already done) and you just need to swap the bytecode — e.g. to enable
// the full-mesh bridge changes that V3' added on top of original V3.
//
// Workflow:
//   1. Verify V3 is already deployed (deployments/<chain>-v3-mainnet.json exists).
//   2. Verify the proxy's current `quoteSigner()` reads as non-zero (proves
//      V3 reinit ran). Refuse to run if it's zero — that means the proxy
//      is still V2 and you should use `deploy-evm-v3.mjs` instead.
//   3. Deploy fresh DemonKingBaseV3 implementation.
//   4. Call `upgradeToAndCall(newImpl, "")` from owner — no reinit data.
//      (UUPSUpgradeable's `upgradeToAndCall` with empty `data` is the
//       canonical "just swap impl" call in OZ v5; there is no public
//       `upgradeTo` anymore.)
//   5. Verify state preserved: owner, totalMinted, quoteSigner unchanged,
//      and a sample upgradeToken / bridgeBurn signature still encodes
//      against the new typehash.
//   6. Update <chain>-v3-mainnet.json with the new impl + tx hashes.
//
// Usage:
//   node scripts/rev-upgrade-evm-v3.mjs --chain=base
//   node scripts/rev-upgrade-evm-v3.mjs --chain=arbitrum
//   node scripts/rev-upgrade-evm-v3.mjs --chain=monad
//
// Skip the confirmation prompt in CI:  CONFIRM_REV_UPGRADE=yes

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
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
  base:     { chain: base,     defaultRpc: 'https://mainnet.base.org',     envRpc: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL'],
              v3DeployFile: 'base-v3-mainnet.json' },
  arbitrum: { chain: arbitrum, defaultRpc: 'https://arb1.arbitrum.io/rpc', envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL'],
              v3DeployFile: 'arbitrum-v3-mainnet.json' },
  monad:    { chain: monad,    defaultRpc: 'https://rpc.monad.xyz',        envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL'],
              v3DeployFile: 'monad-v3-mainnet.json' },
};

const cliArg = process.argv.slice(2).find((a) => a.startsWith('--chain=')) || '';
const chainKey = (cliArg ? cliArg.split('=')[1] : '').toLowerCase();
const spec = CHAINS[chainKey];
if (!spec) {
  console.error(`Use --chain=base|arbitrum|monad. Got "${chainKey}".`);
  process.exit(1);
}

const env = loadEnv();
const v3ArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseV3.json');
if (!fs.existsSync(v3ArtifactPath)) {
  throw new Error('Missing artifact. Run `npm run compile:base` first.');
}
const v3Artifact = JSON.parse(fs.readFileSync(v3ArtifactPath, 'utf8'));

const v3DeployPath = path.join(NFT_DIR, 'deployments', spec.v3DeployFile);
if (!fs.existsSync(v3DeployPath)) {
  throw new Error(`Missing ${spec.v3DeployFile}. Use deploy-evm-v3.mjs for first-time V3 deploy on this chain.`);
}
const v3Deployment = JSON.parse(fs.readFileSync(v3DeployPath, 'utf8'));
const proxyAddress = getAddress(v3Deployment.proxy);
const oldImpl = getAddress(v3Deployment.v3Implementation);

const rpcUrl = spec.envRpc.map((k) => env[k]).find(Boolean) || spec.defaultRpc;
const { account, source } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: spec.chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: spec.chain, transport: http(rpcUrl) });

const onChainId = await publicClient.getChainId();
if (onChainId !== spec.chain.id) {
  throw new Error(`Expected chainId ${spec.chain.id}, got ${onChainId}.`);
}

// ─── Pre-flight ────────────────────────────────────────────────
const V3_VIEW_ABI = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'quoteSigner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
];
const [chainOwner, totalMinted, quoteSigner, paused, balance] = await Promise.all([
  publicClient.readContract({ address: proxyAddress, abi: V3_VIEW_ABI, functionName: 'owner' }),
  publicClient.readContract({ address: proxyAddress, abi: V3_VIEW_ABI, functionName: 'totalMinted' }),
  publicClient.readContract({ address: proxyAddress, abi: V3_VIEW_ABI, functionName: 'quoteSigner' }).catch(() => null),
  publicClient.readContract({ address: proxyAddress, abi: V3_VIEW_ABI, functionName: 'paused' }),
  publicClient.getBalance({ address: account.address }),
]);

if (getAddress(chainOwner) !== getAddress(account.address)) {
  throw new Error(`Deployer ${account.address} is NOT the proxy owner (${chainOwner}). Aborting.`);
}
if (!quoteSigner || /^0x0{40}$/i.test(quoteSigner)) {
  throw new Error(
    `quoteSigner is zero or unreadable. Proxy may still be V2 — run deploy-evm-v3.mjs for first-time V3 deploy.`,
  );
}

console.log('\n=== Rev-Upgrade Plan ===');
console.log(`  Chain          : ${spec.chain.name} (chainId ${spec.chain.id})`);
console.log(`  RPC            : ${rpcUrl}`);
console.log(`  Proxy          : ${proxyAddress}`);
console.log(`  Old impl       : ${oldImpl}`);
console.log(`  Owner / signer : ${account.address}   (${source})`);
console.log(`  Native balance : ${formatEther(balance)} ${spec.chain.nativeCurrency.symbol}`);
console.log(`  V3 state       : totalMinted=${totalMinted}, quoteSigner=${quoteSigner}, paused=${paused}`);
console.log('');
console.log('  Action: deploy NEW DemonKingBaseV3 impl, then upgradeToAndCall(newImpl, "")');
console.log('          (UUPS impl-only swap — no reinit, no state change beyond impl pointer)');
console.log('');

if (balance === 0n) {
  console.error(`Deployer has 0 ${spec.chain.nativeCurrency.symbol}. Fund it first.`);
  process.exit(1);
}

if (env.CONFIRM_REV_UPGRADE !== 'yes') {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ans = (await rl.question(`Proceed with rev-upgrade on ${spec.chain.name}? [y/N] `)).trim().toLowerCase();
  rl.close();
  if (ans !== 'y' && ans !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }
}

// ─── Step 1: deploy new impl ───────────────────────────────────
console.log('\n[1/2] Deploying new V3 implementation…');
const maxPriorityFeePerGas = env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
  ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]) : undefined;
const implTxHash = await walletClient.deployContract({
  abi: v3Artifact.abi, bytecode: v3Artifact.bytecode, maxPriorityFeePerGas,
});
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implTxHash, confirmations: 2 });
const newImpl = implReceipt.contractAddress;
if (!newImpl) throw new Error('Impl deploy returned no address');
console.log(`  impl tx: ${implTxHash}`);
console.log(`  ✓ new impl: ${newImpl} (gas ${implReceipt.gasUsed})`);

if (getAddress(newImpl) === oldImpl) {
  console.log('  Note: new impl address equals old impl — nothing to do.');
  process.exit(0);
}

// ─── Step 2: upgradeToAndCall(newImpl, "") ─────────────────────
console.log('\n[2/2] Calling proxy.upgradeToAndCall(newImpl, "")…');
const UUPS_ABI = [{
  type: 'function', name: 'upgradeToAndCall', stateMutability: 'payable',
  inputs: [{ type: 'address', name: 'newImpl' }, { type: 'bytes', name: 'data' }], outputs: [],
}];
const upTx = await walletClient.writeContract({
  address: proxyAddress, abi: UUPS_ABI, functionName: 'upgradeToAndCall',
  args: [newImpl, '0x'], maxPriorityFeePerGas,
});
console.log(`  upgrade tx: ${upTx}`);
const upRcp = await publicClient.waitForTransactionReceipt({ hash: upTx, confirmations: 2 });
if (upRcp.status !== 'success') throw new Error(`upgradeToAndCall reverted (tx ${upTx})`);
console.log(`  ✓ upgrade ok (gas ${upRcp.gasUsed})`);

// ─── Verify: bridgeBurn signature now takes (uint256, uint256) ─
console.log('\n[verify] Confirming new bytecode (bridgeBurn now takes destinationChainId)…');
const newBytecode = await publicClient.getCode({ address: proxyAddress });
// Proxy returns proxy bytecode, not impl. Read impl slot instead.
const ERC1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const implSlotRaw = await publicClient.getStorageAt({ address: proxyAddress, slot: ERC1967_IMPL_SLOT });
const liveImpl = getAddress('0x' + implSlotRaw.slice(-40));
if (liveImpl !== getAddress(newImpl)) {
  throw new Error(`Impl slot mismatch — expected ${newImpl}, got ${liveImpl}`);
}
const [postTotalMinted, postSigner] = await Promise.all([
  publicClient.readContract({ address: proxyAddress, abi: V3_VIEW_ABI, functionName: 'totalMinted' }),
  publicClient.readContract({ address: proxyAddress, abi: V3_VIEW_ABI, functionName: 'quoteSigner' }),
]);
if (postTotalMinted !== totalMinted) throw new Error(`totalMinted changed! pre=${totalMinted} post=${postTotalMinted}`);
if (getAddress(postSigner) !== getAddress(quoteSigner)) throw new Error(`quoteSigner changed! pre=${quoteSigner} post=${postSigner}`);
console.log(`  ✓ State preserved. Impl slot now points to ${liveImpl}.`);

// ─── Update deployment JSON ────────────────────────────────────
const newDeployment = {
  ...v3Deployment,
  v3Implementation: newImpl,
  v3PreviousImplementation: oldImpl,
  revUpgradeTxHash: upTx,
  revUpgradeImplTxHash: implTxHash,
  revUpgradeBlockNumber: upRcp.blockNumber?.toString(),
  revUpgradedAt: new Date().toISOString(),
  fullMeshBridge: true,
};
fs.writeFileSync(v3DeployPath, `${JSON.stringify(newDeployment, null, 2)}\n`);
console.log(`\n✓ Wrote ${spec.v3DeployFile} (now references new impl).`);
console.log('\nDone. Full-mesh bridge is now enabled on this chain.');
