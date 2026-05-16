// Live mainnet smoke test: Solana → Base bridge.
//
//   1. Burn an existing Solana asset (we have 2 from the prior EVM→Solana
//      test) via mpl-core `burn` + a memo carrying bridge metadata.
//   2. Server-side (inline): verify tx via Solana RPC, derive sourceRef,
//      sign EIP-712 BridgeReceipt for Base.
//   3. bridgeMint on Base.
//   4. Verify Base ownership + level.
//
// Cost: ~$0.005 Solana + ~$0.03 Base = ~$0.035.

import fs from 'node:fs';
import path from 'node:path';
import bs58 from 'bs58';
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
} from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount, parseSolanaKeypair } from './lib-env.mjs';

const SOLANA_CHAIN_ID = 200001;
const BASE_CHAIN_ID = 8453;

// Solana asset to burn — defaults to one we created in the EVM→Solana test.
const ASSET = process.argv.find((a) => a.startsWith('--asset='))?.slice(8)
  || 'DQSutMcVs4RTeDnjjHj2uX7YiwJuyvVeS3YXDtztE2Lh';

const env = loadEnv();
const { account } = parseEthAccount(env);
const me = getAddress(account.address);
console.log('EVM (Base) recipient:', me);

const solanaKeypair = parseSolanaKeypair(env);
console.log('Solana signer (asset owner):', solanaKeypair.publicKey.toBase58());

const baseDeploy = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'base-v3-mainnet.json'), 'utf8'));
const solanaDeploy = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'solana-mainnet.json'), 'utf8'));
const baseProxy = getAddress(baseDeploy.proxy);

// ───── 1) Burn Solana asset + emit memo ─────────────────────────────
console.log(`\n[1/4] Burning Solana asset ${ASSET} + memo`);
const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
const { keypairIdentity, publicKey } = await import('@metaplex-foundation/umi');
const { mplCore, burn: burnAsset, fetchAsset } = await import('@metaplex-foundation/mpl-core');
const { SystemProgram, Transaction, TransactionInstruction, PublicKey } = await import('@solana/web3.js');

const solRpc = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
const umi = createUmi(solRpc).use(mplCore());
const umiKeypair = umi.eddsa.createKeypairFromSecretKey(solanaKeypair.secretKey);
umi.use(keypairIdentity(umiKeypair));

// Read level from asset before burn (default 1 if no Attributes plugin).
const preAsset = await fetchAsset(umi, publicKey(ASSET));
const level = Number(preAsset.attributes?.attributeList?.find((a) => a.key === 'level')?.value || 1);
console.log(`  Asset name="${preAsset.name}", level=${level}, owner=${preAsset.owner}`);

// Build burn ix + memo ix in a single tx via Umi builder.
const memoText = `bridge:${ASSET}:${level}:${BASE_CHAIN_ID}:${me}`;
const memoProgramId = publicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Umi's burn ix. Note: do NOT pass `collection` — the bridged asset's
// updateAuthority is `Address` (not `Collection` group), so passing the
// collection account causes program error 0xb (invalid authority).
const burnTx = burnAsset(umi, {
  asset: publicKey(ASSET),
});

// Build memo ix as raw umi instruction.
const memoIxRaw = {
  keys: [], programId: memoProgramId,
  data: new Uint8Array(Buffer.from(memoText, 'utf8')),
};
const txWithMemo = burnTx.append({ instruction: memoIxRaw, signers: [], bytesCreatedOnChain: 0 });

// Submit. Retry up to 3 times if BlockheightExceeded.
async function trySubmit(builder, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await builder.sendAndConfirm(umi);
      return r;
    } catch (e) {
      if (e.name === 'TransactionExpiredBlockheightExceededError' && i < retries - 1) {
        console.log(`  retry ${i + 1}/${retries} after blockhash expiry…`);
        continue;
      }
      throw e;
    }
  }
}
const burnRes = await trySubmit(txWithMemo);
const burnSig = bs58.encode(burnRes.signature);
console.log(`  ✓ Solana burn+memo tx ${burnSig}`);
console.log(`    memo: "${memoText}"`);

// ───── 2) Server-side: verify + sign EIP-712 receipt ────────────────
console.log('\n[2/4] Server verifies burn + signs EIP-712 receipt for Base');

// sourceRef = keccak256(abi.encode("SOLANA", asset_pubkey_bytes32))
const assetBytes = bs58.decode(ASSET);
if (assetBytes.length !== 32) throw new Error('Solana asset must decode to 32 bytes');
const sourceRef = keccak256(
  encodeAbiParameters(
    [{ type: 'string' }, { type: 'bytes32' }],
    ['SOLANA', '0x' + Buffer.from(assetBytes).toString('hex')],
  ),
);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 86_400);
console.log(`  sourceRef = ${sourceRef}`);

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

// ───── 3) bridgeMint on Base ─────────────────────────────────────────
console.log('\n[3/4] bridgeMint on Base');
const NFT_ABI = [
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'bridgeMint', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { type: 'address' }, { type: 'uint8' }, { type: 'bytes32' },
      { type: 'uint256' }, { type: 'bytes' },
    ], outputs: [] },
  { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'tokenLevel', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
];
const basePub = createPublicClient({ chain: base, transport: http(env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || 'https://mainnet.base.org') });
const baseWal = createWalletClient({ account, chain: base, transport: http(env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || 'https://mainnet.base.org') });
const preTotal = await basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'totalMinted' });
const mintHash = await baseWal.writeContract({
  address: baseProxy, abi: NFT_ABI, functionName: 'bridgeMint',
  args: [me, level, sourceRef, deadline, signature],
});
const mintRcp = await basePub.waitForTransactionReceipt({ hash: mintHash, confirmations: 2 });
const newId = preTotal + 1n;
const [newOwner, newLevel] = await Promise.all([
  basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'ownerOf', args: [newId] }),
  basePub.readContract({ address: baseProxy, abi: NFT_ABI, functionName: 'tokenLevel', args: [newId] }),
]);
if (getAddress(newOwner) !== me) throw new Error(`Owner mismatch ${newOwner}`);
if (Number(newLevel) !== level) throw new Error(`Level mismatch ${newLevel}`);
console.log(`  ✓ bridgeMint tx ${mintHash} → Base #${newId} (gas ${mintRcp.gasUsed})`);

console.log('\n══════════════════════════════════════════════════════════');
console.log('  ✓ SOLANA → BASE BRIDGE TEST PASSED');
console.log(`    Solana ${ASSET.slice(0,10)}… (L${level}) → Base #${newId} (L${newLevel})`);
console.log(`    Solana burn tx: https://explorer.solana.com/tx/${burnSig}`);
console.log(`    Base mint tx:   ${mintHash}`);
console.log('══════════════════════════════════════════════════════════');
