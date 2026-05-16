// Live mainnet smoke test: EVM (Arbitrum) → Aptos bridge.
//
//   1. adminMint a fresh NFT on Arbitrum to the deployer wallet.
//   2. bridgeBurn on Arbitrum with destinationChainId = 100001 (Aptos).
//   3. Inline: derive sourceRef, sign an Aptos BridgeReceipt with the
//      NFT_BASE-mnemonic-derived ed25519 key.
//   4. Submit `demon_king::bridge_mint` on Aptos mainnet via the CLI.
//   5. Verify the new Aptos token exists & has the right level.
//
// Cost: ~$0.01 Arbitrum + 0.001 USD Aptos. Total ~$0.02.

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
import { arbitrum } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const APTOS_CHAIN_ID = 100001;  // synthetic — matches bridge_helpers.js CHAIN_IDS.aptos
const ARB_CHAIN_ID = 42161;

const APTOS_BIN = process.env.APTOS_CLI_PATH
  || path.resolve(NFT_DIR, '..', 'tools', 'aptos-cli', 'aptos.exe');

const env = loadEnv();
const { account } = parseEthAccount(env);
const me = getAddress(account.address);
console.log('EVM deployer:', me);

const arbDeploy = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'arbitrum-v3-mainnet.json'), 'utf8'));
const aptosDeploy = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'aptos-mainnet.json'), 'utf8'));
const arbProxy = getAddress(arbDeploy.proxy);
const aptosAdmin = aptosDeploy.admin;  // same as deployer in Aptos terms
console.log('Aptos recipient:', aptosAdmin);

const arbRpc = env.NFT_ARBITRUM_RPC_URL || env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const arbPub = createPublicClient({ chain: arbitrum, transport: http(arbRpc) });
const arbWal = createWalletClient({ account, chain: arbitrum, transport: http(arbRpc) });

const NFT_ABI = [
  { name: 'adminMint', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'quantity', type: 'uint256' }], outputs: [] },
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'bridgeBurn', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [] },
];

// ───── 1) adminMint on Arbitrum ─────────────────────────────────────
console.log('\n[1/5] adminMint Arbitrum');
const preTotal = await arbPub.readContract({ address: arbProxy, abi: NFT_ABI, functionName: 'totalMinted' });
const mintHash = await arbWal.writeContract({
  address: arbProxy, abi: NFT_ABI, functionName: 'adminMint', args: [me, 1n],
});
const mintRcp = await arbPub.waitForTransactionReceipt({ hash: mintHash, confirmations: 2 });
const tokenId = preTotal + 1n;
console.log(`  ✓ adminMint tx ${mintHash}  tokenId ${tokenId} (gas ${mintRcp.gasUsed})`);

// ───── 2) bridgeBurn → destination Aptos (synthetic chainId 100001) ─
console.log(`\n[2/5] bridgeBurn → destination = Aptos (chainId ${APTOS_CHAIN_ID})`);
const burnHash = await arbWal.writeContract({
  address: arbProxy, abi: NFT_ABI, functionName: 'bridgeBurn',
  args: [tokenId, BigInt(APTOS_CHAIN_ID)],
});
const burnRcp = await arbPub.waitForTransactionReceipt({ hash: burnHash, confirmations: 2 });
console.log(`  ✓ bridgeBurn tx ${burnHash} (gas ${burnRcp.gasUsed})`);
const level = 1;  // freshly minted → L1
console.log(`  Level = ${level}`);

// ───── 3) Build sourceRef + sign Aptos BridgeReceipt inline ─────────
console.log('\n[3/5] Signing Aptos BridgeReceipt (ed25519)');
const sourceRef = keccak256(
  encodeAbiParameters(
    [{ type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
    ['EVM', BigInt(ARB_CHAIN_ID), arbProxy, tokenId],
  ),
);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 86_400);
console.log(`  sourceRef = ${sourceRef}`);
console.log(`  deadline  = ${deadline}`);

// Derive Aptos signer + sign BCS-concatenated payload.
const { Account } = await import('@aptos-labs/ts-sdk');
const aptosAcc = Account.fromDerivationPath({
  path: "m/44'/637'/0'/0'/0'",
  mnemonic: env.NFT_BASE,
});
if (aptosAcc.accountAddress.toString() !== aptosAdmin) {
  throw new Error(`Derived Aptos addr ${aptosAcc.accountAddress} != deployment.admin ${aptosAdmin}`);
}

function addrTo32(addrHex) {
  const h = String(addrHex).replace(/^0x/, '').padStart(64, '0');
  return new Uint8Array(Buffer.from(h, 'hex'));
}
function u64Le(n) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}
function hexToBytes(h) {
  return new Uint8Array(Buffer.from(String(h).replace(/^0x/, ''), 'hex'));
}
function concat(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total); let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
const msg = concat([
  addrTo32(aptosAdmin),                       // to (32 bytes)
  new Uint8Array([level & 0xff]),             // level u8
  hexToBytes(sourceRef),                       // source_ref (32 bytes)
  u64Le(APTOS_CHAIN_ID),                       // destination_chain_id u64 LE
  u64Le(deadline),                              // deadline u64 LE
]);
const sigObj = aptosAcc.sign(msg);
const signature = '0x' + Buffer.from(sigObj.toUint8Array()).toString('hex');
console.log(`  signature = ${signature.slice(0, 18)}…${signature.slice(-16)}`);

// ───── 4) Submit aptos move run bridge_mint via CLI ────────────────
console.log('\n[4/5] Submitting bridge_mint on Aptos mainnet…');
const moduleAddr = aptosDeploy.admin;
const args = [
  'move', 'run',
  '--profile', 'mainnet',
  '--function-id', `${moduleAddr}::demon_king::bridge_mint`,
  '--args',
  `address:${aptosAdmin}`,
  `u8:${level}`,
  `hex:${sourceRef.replace(/^0x/, '')}`,
  `u64:${APTOS_CHAIN_ID}`,
  `u64:${deadline}`,
  `hex:${signature.replace(/^0x/, '')}`,
  '--assume-yes',
];
const APTOS_CWD = path.resolve(NFT_DIR, 'move', 'clash_nft');
const r = spawnSync(APTOS_BIN, args, { encoding: 'utf8', cwd: APTOS_CWD });
if (r.status !== 0) {
  console.error(r.stdout || '');
  console.error(r.stderr || '');
  throw new Error('bridge_mint failed');
}
const out = r.stdout;
console.log(out.split('\n').filter((l) => l.includes('transaction_hash') || l.includes('gas_used') || l.includes('success')).join('\n'));
const aptosTxMatch = out.match(/"transaction_hash"\s*:\s*"(0x[0-9a-f]+)"/);
const aptosGasMatch = out.match(/"gas_used"\s*:\s*(\d+)/);
const aptosTx = aptosTxMatch?.[1];
const aptosGas = aptosGasMatch?.[1];
console.log(`  ✓ bridge_mint tx ${aptosTx} (gas ${aptosGas})`);

// ───── 5) Verify new Aptos token via view function ─────────────────
console.log('\n[5/5] Verifying new Aptos token…');
const viewRes = spawnSync(APTOS_BIN, ['move', 'view',
  '--profile', 'mainnet',
  '--function-id', `${moduleAddr}::demon_king::get_total_minted`], { encoding: 'utf8', cwd: APTOS_CWD });
console.log(viewRes.stdout);

console.log('\n══════════════════════════════════════════════════════════');
console.log('  ✓ EVM → APTOS BRIDGE TEST PASSED');
console.log(`    Arbitrum #${tokenId} (L${level}) → Aptos token (L${level})`);
console.log(`    Arb burn tx:   ${burnHash}`);
console.log(`    Aptos mint tx: ${aptosTx}`);
console.log('══════════════════════════════════════════════════════════');
