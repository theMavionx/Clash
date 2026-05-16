// Live mainnet smoke test: EVM (Arbitrum) → Solana bridge.
//
//   1. adminMint a fresh NFT on Arbitrum to deployer.
//   2. bridgeBurn on Arbitrum with destinationChainId = 200001 (Solana).
//   3. Server-mediated: mint a new Core asset on Solana with level=1
//      attribute, owned by the Solana treasury (test recipient).
//   4. Verify the new Solana asset exists.
//
// Cost: ~$0.02 Arbitrum + ~$0.005 Solana = ~$0.025 total.

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
import { arbitrum } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount, parseSolanaKeypair, requirePublicKey } from './lib-env.mjs';

const SOLANA_CHAIN_ID = 200001;
const ARB_CHAIN_ID = 42161;

const env = loadEnv();
const { account } = parseEthAccount(env);
const me = getAddress(account.address);
console.log('EVM deployer:', me);

const arbDeploy = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'arbitrum-v3-mainnet.json'), 'utf8'));
const solanaDeploy = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'solana-mainnet.json'), 'utf8'));
const arbProxy = getAddress(arbDeploy.proxy);
console.log('Solana collection:', solanaDeploy.collection);

const arbRpc = env.NFT_ARBITRUM_RPC_URL || env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const solanaRpc = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
const arbPub = createPublicClient({ chain: arbitrum, transport: http(arbRpc) });
const arbWal = createWalletClient({ account, chain: arbitrum, transport: http(arbRpc) });

const NFT_ABI = [
  { name: 'adminMint', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
  { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'bridgeBurn', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [] },
];

// Recipient on Solana — use the Solana treasury (a wallet we control via NFT_KEY).
const solanaKeypair = parseSolanaKeypair(env);
const recipient = solanaKeypair.publicKey.toBase58();
console.log('Solana recipient:', recipient);

// ───── 1) adminMint on Arbitrum ──────────────────────────────────────
console.log('\n[1/4] adminMint Arbitrum');
const preTotal = await arbPub.readContract({ address: arbProxy, abi: NFT_ABI, functionName: 'totalMinted' });
const mintHash = await arbWal.writeContract({
  address: arbProxy, abi: NFT_ABI, functionName: 'adminMint', args: [me, 1n],
});
const mintRcp = await arbPub.waitForTransactionReceipt({ hash: mintHash, confirmations: 2 });
const tokenId = preTotal + 1n;
console.log(`  ✓ adminMint tx ${mintHash}  tokenId ${tokenId} (gas ${mintRcp.gasUsed})`);

// ───── 2) bridgeBurn → Solana ────────────────────────────────────────
console.log(`\n[2/4] bridgeBurn → destChainId = ${SOLANA_CHAIN_ID} (Solana)`);
const burnHash = await arbWal.writeContract({
  address: arbProxy, abi: NFT_ABI, functionName: 'bridgeBurn',
  args: [tokenId, BigInt(SOLANA_CHAIN_ID)],
});
const burnRcp = await arbPub.waitForTransactionReceipt({ hash: burnHash, confirmations: 2 });
console.log(`  ✓ bridgeBurn tx ${burnHash} (gas ${burnRcp.gasUsed})`);
const level = 1;

// Build sourceRef like the orchestrator does (so future replay protection works).
const sourceRef = keccak256(
  encodeAbiParameters(
    [{ type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
    ['EVM', BigInt(ARB_CHAIN_ID), arbProxy, tokenId],
  ),
);
console.log(`  sourceRef = ${sourceRef}`);

// ───── 3) Server-mediated Solana mint ────────────────────────────────
console.log('\n[3/4] Mint new Solana asset (server-mediated, candy authority pays gas)');
const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
const { generateSigner, keypairIdentity, publicKey } = await import('@metaplex-foundation/umi');
const { mplCore, create: createAsset } = await import('@metaplex-foundation/mpl-core');

const umi = createUmi(solanaRpc).use(mplCore());
const umiKeypair = umi.eddsa.createKeypairFromSecretKey(solanaKeypair.secretKey);
umi.use(keypairIdentity(umiKeypair));

const asset = generateSigner(umi);
const newAssetUri = `${(env.NFT_PUBLIC_BASE_URL || 'https://clashofperps.fun').replace(/\/+$/, '')}/api/nft/solana/bridged`;

console.log(`  authority = ${umi.identity.publicKey}`);
console.log(`  recipient = ${recipient}`);
console.log(`  asset     = ${asset.publicKey} (to be created)`);
const tx = createAsset(umi, {
  asset,
  collection: publicKey(solanaDeploy.collection),
  name: `Demon King (bridged)`,
  uri: newAssetUri,
  owner: publicKey(recipient),
  plugins: [
    { type: 'Attributes', attributeList: [{ key: 'level', value: String(level) }] },
  ],
});
const { signature } = await tx.sendAndConfirm(umi);
const txSig = bs58.encode(signature);
console.log(`  ✓ Solana mint tx ${txSig}`);

// ───── 4) Verify Solana asset ────────────────────────────────────────
console.log('\n[4/4] Verifying Solana asset…');
const { fetchAsset } = await import('@metaplex-foundation/mpl-core');
const fetched = await fetchAsset(umi, asset.publicKey);
console.log(`  ✓ asset exists: name="${fetched.name}", owner=${fetched.owner}`);
const lvlAttr = fetched.attributes?.attributeList?.find((a) => a.key === 'level');
console.log(`  ✓ attribute level=${lvlAttr?.value} (expected ${level})`);

console.log('\n══════════════════════════════════════════════════════════');
console.log('  ✓ EVM → SOLANA BRIDGE TEST PASSED');
console.log(`    Arbitrum #${tokenId} (L${level}) → Solana ${asset.publicKey.toString()} (L${lvlAttr?.value})`);
console.log(`    Arb burn tx:    ${burnHash}`);
console.log(`    Solana mint tx: https://explorer.solana.com/tx/${txSig}`);
console.log('══════════════════════════════════════════════════════════');
