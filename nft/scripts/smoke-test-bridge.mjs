// Live mainnet smoke test of the EVM↔EVM bridge.
//
// Flow exercised:
//   1. adminMint a fresh NFT on Arbitrum to the deployer wallet.
//   2. bridgeBurn that NFT with destinationChainId=8453 (Base).
//   3. Sign EIP-712 BridgeReceipt for Base inline (same logic as
//      server /bridge/confirm — server may not be running locally).
//   4. bridgeMint on Base, recipient = deployer wallet.
//   5. Verify ownerOf + tokenLevel on the new Base NFT.
//
// Cost: ~$0.10 USD total across 3 txs (Arb is cheap).
//
// Run:  node scripts/smoke-test-bridge.mjs

import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  formatEther,
  getAddress,
  http,
  keccak256,
  parseGwei,
} from 'viem';
import { arbitrum, base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const BASE_CHAIN_ID = 8453;
const ARB_CHAIN_ID = 42161;

const env = loadEnv();
const { account } = parseEthAccount(env);
const me = getAddress(account.address);
console.log('Deployer:', me);

function loadDeploy(name) {
  return JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', name), 'utf8'));
}

const arbDeploy = loadDeploy('arbitrum-v3-mainnet.json');
const baseDeploy = loadDeploy('base-v3-mainnet.json');
const arbProxy = getAddress(arbDeploy.proxy);
const baseProxy = getAddress(baseDeploy.proxy);

const arbRpc = env.NFT_ARBITRUM_RPC_URL || env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const baseRpc = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || 'https://mainnet.base.org';
const arbPub = createPublicClient({ chain: arbitrum, transport: http(arbRpc) });
const arbWal = createWalletClient({ account, chain: arbitrum, transport: http(arbRpc) });
const basePub = createPublicClient({ chain: base, transport: http(baseRpc) });
const baseWal = createWalletClient({ account, chain: base, transport: http(baseRpc) });

// ──────────────────────────────────────────────────────────────
// Step 1: adminMint a fresh NFT on Arbitrum
// ──────────────────────────────────────────────────────────────
console.log('\n[1/5] adminMint on Arbitrum → recipient =', me);
const NFT_ABI = [
  { name: 'adminMint', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'quantity', type: 'uint256' }], outputs: [] },
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'unpause', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'bridgeBurn', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'destinationChainId', type: 'uint256' }], outputs: [] },
  { name: 'bridgeMint', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' }, { name: 'level', type: 'uint8' },
      { name: 'sourceRef', type: 'bytes32' }, { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ], outputs: [] },
  { name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'tokenLevel', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
];

// Make sure Arbitrum is not paused.
const arbPaused = await arbPub.readContract({ address: arbProxy, abi: NFT_ABI, functionName: 'paused' });
if (arbPaused) {
  console.log('  Arbitrum paused → unpausing first');
  const h = await arbWal.writeContract({ address: arbProxy, abi: NFT_ABI, functionName: 'unpause' });
  await arbPub.waitForTransactionReceipt({ hash: h, confirmations: 1 });
}

const preTotalArb = await arbPub.readContract({ address: arbProxy, abi: NFT_ABI, functionName: 'totalMinted' });
const mintHash = await arbWal.writeContract({
  address: arbProxy, abi: NFT_ABI, functionName: 'adminMint', args: [me, 1n],
});
const mintRcp = await arbPub.waitForTransactionReceipt({ hash: mintHash, confirmations: 2 });
const newArbTokenId = preTotalArb + 1n;
console.log(`  ✓ adminMint tx ${mintHash}  → tokenId ${newArbTokenId} (gas ${mintRcp.gasUsed})`);

// ──────────────────────────────────────────────────────────────
// Step 2: bridgeBurn on Arbitrum
// ──────────────────────────────────────────────────────────────
console.log('\n[2/5] bridgeBurn on Arbitrum → destination = Base (chainId 8453)');
const burnHash = await arbWal.writeContract({
  address: arbProxy, abi: NFT_ABI, functionName: 'bridgeBurn',
  args: [newArbTokenId, BigInt(BASE_CHAIN_ID)],
});
const burnRcp = await arbPub.waitForTransactionReceipt({ hash: burnHash, confirmations: 2 });
if (burnRcp.status !== 'success') throw new Error('bridgeBurn reverted');
console.log(`  ✓ bridgeBurn tx ${burnHash} (gas ${burnRcp.gasUsed})`);

// Parse BridgeBurn log for level.
const burnTopic = keccak256(new TextEncoder().encode('BridgeBurn(uint256,address,uint8,uint256)'));
const burnLog = burnRcp.logs.find((l) =>
  l.address.toLowerCase() === arbProxy.toLowerCase() && l.topics[0] === burnTopic,
);
if (!burnLog) throw new Error('No BridgeBurn log');
const burnedTokenId = BigInt(burnLog.topics[1]);
const burnedLevel = Number(BigInt('0x' + burnLog.data.replace(/^0x/, '').slice(0, 64)));
console.log(`  Burned tokenId=${burnedTokenId}, level=${burnedLevel}`);

// ──────────────────────────────────────────────────────────────
// Step 3: server-side EIP-712 BridgeReceipt signing (inline)
// ──────────────────────────────────────────────────────────────
console.log('\n[3/5] Signing BridgeReceipt for Base');
const sourceRef = keccak256(
  encodeAbiParameters(
    [{ type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
    ['EVM', BigInt(ARB_CHAIN_ID), arbProxy, burnedTokenId],
  ),
);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 86_400);

const signature = await account.signTypedData({
  domain: {
    name: baseDeploy.eip712Name || 'DemonKingBase',
    version: baseDeploy.eip712Version || '3',
    chainId: BASE_CHAIN_ID,
    verifyingContract: baseProxy,
  },
  types: {
    BridgeReceipt: [
      { name: 'to', type: 'address' },
      { name: 'level', type: 'uint8' },
      { name: 'sourceRef', type: 'bytes32' },
      { name: 'destinationChainId', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'BridgeReceipt',
  message: {
    to: me, level: burnedLevel, sourceRef,
    destinationChainId: BigInt(BASE_CHAIN_ID), deadline,
  },
});
console.log(`  sourceRef = ${sourceRef}`);
console.log(`  deadline  = ${deadline}`);
console.log(`  signature = ${signature.slice(0, 18)}…${signature.slice(-16)}`);

// ──────────────────────────────────────────────────────────────
// Step 4: bridgeMint on Base
// ──────────────────────────────────────────────────────────────
console.log('\n[4/5] bridgeMint on Base');
const basePaused = await basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'paused' });
if (basePaused) {
  console.log('  Base paused → unpausing first');
  const h = await baseWal.writeContract({ address: baseProxy, abi: NFT_ABI, functionName: 'unpause' });
  await basePub.waitForTransactionReceipt({ hash: h, confirmations: 1 });
}
const preTotalBase = await basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'totalMinted' });
const mintBaseHash = await baseWal.writeContract({
  address: baseProxy, abi: NFT_ABI, functionName: 'bridgeMint',
  args: [me, burnedLevel, sourceRef, deadline, signature],
});
const mintBaseRcp = await basePub.waitForTransactionReceipt({ hash: mintBaseHash, confirmations: 2 });
if (mintBaseRcp.status !== 'success') throw new Error('bridgeMint reverted');
const newBaseTokenId = preTotalBase + 1n;
console.log(`  ✓ bridgeMint tx ${mintBaseHash} → tokenId ${newBaseTokenId} (gas ${mintBaseRcp.gasUsed})`);

// ──────────────────────────────────────────────────────────────
// Step 5: verify Base state
// ──────────────────────────────────────────────────────────────
console.log('\n[5/5] Verifying Base state…');
const [chainOwner, chainLevel] = await Promise.all([
  basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'ownerOf', args: [newBaseTokenId] }),
  basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'tokenLevel', args: [newBaseTokenId] }),
]);
if (getAddress(chainOwner) !== me) throw new Error(`Owner mismatch: ${chainOwner}`);
if (Number(chainLevel) !== burnedLevel) throw new Error(`Level mismatch: source=${burnedLevel} dest=${chainLevel}`);
console.log(`  ✓ New Base tokenId ${newBaseTokenId} owned by ${chainOwner}, level=${chainLevel}`);

console.log('\n══════════════════════════════════════════════════════════');
console.log('  ✓ END-TO-END BRIDGE TEST PASSED');
console.log(`    Arbitrum #${burnedTokenId} (level ${burnedLevel}) → Base #${newBaseTokenId} (level ${chainLevel})`);
console.log(`    Arb burn tx:  ${burnHash}`);
console.log(`    Base mint tx: ${mintBaseHash}`);
console.log('══════════════════════════════════════════════════════════');
