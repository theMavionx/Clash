// Live mainnet smoke test for the Base marketplace + indexer.
//
// Drives the full happy path:
//   1. approve marketplace for tokenId
//   2. list(tokenId, ETH, price, 0)
//   3. poll /api/marketplace/listings until indexer reports the listing
//   4. cancel(tokenId)
//   5. poll until indexer marks it cancelled
//   6. list(tokenId, ETH, price', 0) again
//   7. buyWithEth(tokenId) from the same wallet (allowed — only pays gas + royalty)
//   8. poll until indexer marks Sold + records buyer
//
// Costs ~$0.10 on Base. Defaults to using the most-recently bridged-in token
// owned by the deployer.

import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseEther,
} from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return i === -1 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)];
  }),
);

const TOKEN_ID  = String(args.tokenId || '57');
const PRICE_ETH = String(args.price || '0.0001');
const BASE_URL  = (args.baseUrl || 'http://localhost:4000/api').replace(/\/+$/, '');
const POLL_MS   = 5000;
const POLL_DEADLINE = 90_000;

const env = loadEnv();
const { account } = parseEthAccount(env);
const me = getAddress(account.address);

const nft = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'base-v3-mainnet.json'), 'utf8'));
const mkt = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'base-marketplace-mainnet.json'), 'utf8'));
const nftAddr = getAddress(nft.proxy);
const mktAddr = getAddress(mkt.marketplace);

console.log(`  Wallet:      ${me}`);
console.log(`  TokenId:     ${TOKEN_ID}`);
console.log(`  Price:       ${PRICE_ETH} ETH`);
console.log(`  NFT:         ${nftAddr}`);
console.log(`  Marketplace: ${mktAddr}`);

const rpc = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || 'https://mainnet.base.org';
const pub = createPublicClient({ chain: base, transport: http(rpc) });
const wal = createWalletClient({ account, chain: base, transport: http(rpc) });

const NFT_ABI = [
  { name: 'ownerOf',       type: 'function', stateMutability: 'view',       inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'approve',       type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
  { name: 'getApproved',   type: 'function', stateMutability: 'view',       inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
];
const MKT_ABI = [
  { name: 'list',          type: 'function', stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint64' }], outputs: [] },
  { name: 'cancel',        type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'buyWithEth',    type: 'function', stateMutability: 'payable',    inputs: [{ type: 'uint256' }], outputs: [] },
];

const ETH_TOKEN = '0x0000000000000000000000000000000000000000';

async function get(p) {
  const r = await fetch(`${BASE_URL}${p}`);
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.json();
}

async function waitForListing(predicate, label) {
  console.log(`  ↻ polling indexer for: ${label}`);
  const start = Date.now();
  while (Date.now() - start < POLL_DEADLINE) {
    try {
      const j = await get(`/marketplace/listing/base/${TOKEN_ID}`);
      if (predicate(j.listing, j.events)) {
        console.log(`  ✓ ${label} (after ${Math.round((Date.now() - start) / 1000)}s)`);
        return j;
      }
    } catch (err) {
      if (!/404/.test(String(err?.message))) throw err;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Indexer did not observe: ${label}`);
}

// ─── Step 0: verify ownership ────────────────────────────────────────
console.log('\n[0/8] checking ownership');
const owner = await pub.readContract({ address: nftAddr, abi: NFT_ABI, functionName: 'ownerOf', args: [BigInt(TOKEN_ID)] });
if (getAddress(owner) !== me) throw new Error(`Token ${TOKEN_ID} is owned by ${owner}, not ${me}. Pass --tokenId=<mine>`);
console.log(`  ✓ owner = ${owner}`);

// ─── Step 1: approve marketplace ─────────────────────────────────────
console.log('\n[1/8] approve marketplace for tokenId');
const already = await pub.readContract({ address: nftAddr, abi: NFT_ABI, functionName: 'getApproved', args: [BigInt(TOKEN_ID)] });
if (getAddress(already) !== mktAddr) {
  const h = await wal.writeContract({ address: nftAddr, abi: NFT_ABI, functionName: 'approve', args: [mktAddr, BigInt(TOKEN_ID)] });
  await pub.waitForTransactionReceipt({ hash: h, confirmations: 2 });
  console.log(`  ✓ approve tx ${h}`);
} else {
  console.log('  ✓ already approved');
}

// ─── Step 2: list ────────────────────────────────────────────────────
console.log('\n[2/8] list');
const price = parseEther(PRICE_ETH);
let h = await wal.writeContract({ address: mktAddr, abi: MKT_ABI, functionName: 'list', args: [BigInt(TOKEN_ID), ETH_TOKEN, price, 0n] });
let rcp = await pub.waitForTransactionReceipt({ hash: h, confirmations: 2 });
console.log(`  ✓ list tx ${h} (gas ${rcp.gasUsed})`);

// ─── Step 3: indexer picks up Listed ─────────────────────────────────
console.log('\n[3/8] indexer should report ACTIVE');
const after1 = await waitForListing((l) => l && l.active === true && l.priceWei === price.toString(),
  `Listed (active=true, price=${price})`);
console.log(`    seller=${after1.listing.seller} paymentToken=${after1.listing.paymentToken}`);

// ─── Step 4: cancel ──────────────────────────────────────────────────
console.log('\n[4/8] cancel');
h = await wal.writeContract({ address: mktAddr, abi: MKT_ABI, functionName: 'cancel', args: [BigInt(TOKEN_ID)] });
rcp = await pub.waitForTransactionReceipt({ hash: h, confirmations: 2 });
console.log(`  ✓ cancel tx ${h} (gas ${rcp.gasUsed})`);

// ─── Step 5: indexer picks up Cancelled ──────────────────────────────
console.log('\n[5/8] indexer should report INACTIVE');
await waitForListing((l) => l && l.active === false && l.cancelledTx, 'Cancelled (active=false)');

// ─── Step 6: list again at different price ───────────────────────────
console.log('\n[6/8] list again');
// Approve again — cancel does NOT revoke ERC-721 approval, but a previous
// failed-approve test could have. Cheap to re-approve.
const stillApproved = await pub.readContract({ address: nftAddr, abi: NFT_ABI, functionName: 'getApproved', args: [BigInt(TOKEN_ID)] });
if (getAddress(stillApproved) !== mktAddr) {
  h = await wal.writeContract({ address: nftAddr, abi: NFT_ABI, functionName: 'approve', args: [mktAddr, BigInt(TOKEN_ID)] });
  await pub.waitForTransactionReceipt({ hash: h, confirmations: 2 });
}
const price2 = parseEther((Number(PRICE_ETH) * 2).toFixed(6));
h = await wal.writeContract({ address: mktAddr, abi: MKT_ABI, functionName: 'list', args: [BigInt(TOKEN_ID), ETH_TOKEN, price2, 0n] });
rcp = await pub.waitForTransactionReceipt({ hash: h, confirmations: 2 });
console.log(`  ✓ list tx ${h} (gas ${rcp.gasUsed})  newPrice=${price2}`);

await waitForListing((l) => l && l.active === true && l.priceWei === price2.toString(),
  `re-Listed (active=true, price=${price2})`);

// ─── Step 7: buy ─────────────────────────────────────────────────────
console.log('\n[7/8] buyWithEth (self-buy — pays gas + royalty)');
h = await wal.writeContract({ address: mktAddr, abi: MKT_ABI, functionName: 'buyWithEth', args: [BigInt(TOKEN_ID)], value: price2 });
rcp = await pub.waitForTransactionReceipt({ hash: h, confirmations: 2 });
console.log(`  ✓ buyWithEth tx ${h} (gas ${rcp.gasUsed})`);

// ─── Step 8: indexer picks up Sold ───────────────────────────────────
console.log('\n[8/8] indexer should report SOLD');
const finalState = await waitForListing(
  (l) => l && l.active === false && l.soldTx && l.buyer && l.soldPriceWei === price2.toString(),
  `Sold (buyer recorded, price=${price2})`,
);
console.log(`    buyer = ${finalState.listing.buyer}`);
console.log(`    soldTx= ${finalState.listing.soldTx}`);
console.log(`    events captured: ${finalState.events.length}`);
console.log(`      ${finalState.events.map((e) => e.type).join(' → ')}`);

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  ✓ MARKETPLACE SMOKE PASSED — token #${TOKEN_ID}`);
console.log(`    Listed → Cancelled → Listed → Sold (all indexed)`);
console.log('══════════════════════════════════════════════════════════');
