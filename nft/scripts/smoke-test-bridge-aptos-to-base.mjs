// Reverse flow: Aptos NFT → Base bridge.
//
//   1. bridge_burn on Aptos (the token minted by the EVM→Aptos test).
//   2. Server-side (inline): build sourceRef from the burned token_address,
//      sign EIP-712 BridgeReceipt for Base.
//   3. bridgeMint on Base.
//   4. Verify Base ownership + level.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
} from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const APTOS_CHAIN_ID = 100001;
const BASE_CHAIN_ID = 8453;

// Token address minted on Aptos via the prior bridge-in test.
const APTOS_TOKEN = process.argv.find((a) => a.startsWith('--token='))?.slice(8)
  || '0xcb284b8fa792833571f53ca8297be6765af2a659a1d3db51085cb981f8e68efa';

const APTOS_BIN = process.env.APTOS_CLI_PATH
  || path.resolve(NFT_DIR, '..', 'tools', 'aptos-cli', 'aptos.exe');
const APTOS_CWD = path.resolve(NFT_DIR, 'move', 'clash_nft');

const env = loadEnv();
const { account } = parseEthAccount(env);
const me = getAddress(account.address);

const baseDeploy = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'base-v3-mainnet.json'), 'utf8'));
const aptosDeploy = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'aptos-mainnet.json'), 'utf8'));
const baseProxy = getAddress(baseDeploy.proxy);
const moduleAddr = aptosDeploy.admin;

console.log('Aptos token:', APTOS_TOKEN);
console.log('Base recipient:', me);

const NFT_ABI = [
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
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

const basePub = createPublicClient({
  chain: base,
  transport: http(env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || 'https://mainnet.base.org'),
});
const baseWal = createWalletClient({
  account, chain: base,
  transport: http(env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

// ───── 1) bridge_burn on Aptos ──────────────────────────────────────
console.log('\n[1/4] bridge_burn on Aptos → destChainId =', BASE_CHAIN_ID);
const burnArgs = [
  'move', 'run', '--profile', 'mainnet',
  '--function-id', `${moduleAddr}::demon_king::bridge_burn`,
  '--args', `address:${APTOS_TOKEN}`, `u64:${BASE_CHAIN_ID}`,
  '--assume-yes',
];
const burnRes = spawnSync(APTOS_BIN, burnArgs, { encoding: 'utf8', cwd: APTOS_CWD });
if (burnRes.status !== 0) {
  console.error(burnRes.stdout || ''); console.error(burnRes.stderr || '');
  throw new Error('bridge_burn failed');
}
const burnTxMatch = burnRes.stdout.match(/"transaction_hash"\s*:\s*"(0x[0-9a-f]+)"/);
const burnTx = burnTxMatch?.[1];
const burnGas = burnRes.stdout.match(/"gas_used"\s*:\s*(\d+)/)?.[1];
console.log(`  ✓ bridge_burn tx ${burnTx} (gas ${burnGas} octas)`);

// ───── 2) Verify burn event + derive sourceRef ──────────────────────
console.log('\n[2/4] Reading BridgeBurnEvent from Aptos tx');
const txRes = await fetch(`https://fullnode.mainnet.aptoslabs.com/v1/transactions/by_hash/${burnTx}`);
const txJson = await txRes.json();
const burnEvent = (txJson.events || []).find((e) => e.type?.endsWith('::demon_king::BridgeBurnEvent'));
if (!burnEvent) throw new Error('No BridgeBurnEvent in tx');
const level = Number(burnEvent.data.level);
console.log(`  ✓ level = ${level}, destination_chain_id = ${burnEvent.data.destination_chain_id}`);

// sourceRef = keccak256(abi.encode("APTOS", uint256(token_address)))
const tokenAddrHex = APTOS_TOKEN.replace(/^0x/, '').padStart(64, '0');
const sourceRef = keccak256(
  encodeAbiParameters(
    [{ type: 'string' }, { type: 'uint256' }],
    ['APTOS', BigInt('0x' + tokenAddrHex)],
  ),
);
console.log(`  sourceRef = ${sourceRef}`);

// ───── 3) Sign EIP-712 BridgeReceipt for Base ─────────────────────
console.log('\n[3/4] Signing EIP-712 BridgeReceipt for Base');
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
  message: { to: me, level, sourceRef, destinationChainId: BigInt(BASE_CHAIN_ID), deadline },
});
console.log(`  signature = ${signature.slice(0, 18)}…${signature.slice(-16)}`);

// ───── 4) bridgeMint on Base ───────────────────────────────────────
console.log('\n[4/4] bridgeMint on Base');
const preBaseTotal = await basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'totalMinted' });
const mintHash = await baseWal.writeContract({
  address: baseProxy, abi: NFT_ABI, functionName: 'bridgeMint',
  args: [me, level, sourceRef, deadline, signature],
});
const mintRcp = await basePub.waitForTransactionReceipt({ hash: mintHash, confirmations: 2 });
const newBaseTokenId = preBaseTotal + 1n;
const [newOwner, newLevel] = await Promise.all([
  basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'ownerOf', args: [newBaseTokenId] }),
  basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'tokenLevel', args: [newBaseTokenId] }),
]);
if (getAddress(newOwner) !== me) throw new Error(`Owner mismatch ${newOwner}`);
if (Number(newLevel) !== level) throw new Error(`Level mismatch ${newLevel}`);
console.log(`  ✓ bridgeMint tx ${mintHash} → Base #${newBaseTokenId} (gas ${mintRcp.gasUsed})`);

console.log('\n══════════════════════════════════════════════════════════');
console.log('  ✓ APTOS → BASE BRIDGE TEST PASSED');
console.log(`    Aptos ${APTOS_TOKEN.slice(0,10)}… (L${level}) → Base #${newBaseTokenId} (L${newLevel})`);
console.log(`    Aptos burn tx: ${burnTx}`);
console.log(`    Base mint tx:  ${mintHash}`);
console.log('══════════════════════════════════════════════════════════');
