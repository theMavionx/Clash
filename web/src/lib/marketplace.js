// Marketplace client — pairs with DemonKingMarketplace on Base and the
// server-side /marketplace/* endpoints backed by marketplace_indexer.js.
//
// The marketplace itself is Base-only (see production/nft-v3-system/07).
// Players on other chains can browse via the read endpoints but must
// connect a Base wallet to list / buy / cancel — the wiring lives in
// NftMarketplacePanel and reuses the existing EvmWalletContext helpers
// (ensureChain / getPublicClient / getWalletClient).
//
// Three payment tokens at launch:
//   - ETH  (address 0x0)   → buyWithEth(tokenId), value = price
//   - USDC (Circle Base)   → buyWithToken(tokenId), allowance required
//   - CoP  (game token)    → buyWithToken(tokenId), allowance required
//
// All write fns return { hash, receipt } so the caller can surface a tx
// link + refresh listings once the indexer has caught up.

import { createPublicClient, getAddress, http } from 'viem';
import { base } from 'viem/chains';

export const BASE_CHAIN_ID = 8453;

// Mirrors nft/deployments/base-marketplace-mainnet.json. Hardcoded here
// because the file lives outside the web bundle; if the deployment ever
// moves, update both this constant and the deployment json so the
// server-side indexer stays in sync.
export const MARKETPLACE_BASE = {
  chainId: BASE_CHAIN_ID,
  marketplace: '0x802CFeAA28565C6974502A6ca37839327891E126',
  demonKing:   '0x404807F93E47AF3eaAec0E983f18DCB35E966FEC',
  treasury:    '0xC024884ad9C5540996492Cc2DD080964941A3094',
  defaultRoyaltyBps: 250,
  paymentTokens: {
    eth:  '0x0000000000000000000000000000000000000000',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    cop:  '0xd8Db4C337d09Da8d7ceb7d87ADFE224D17785ba3',
  },
};

const NFT_IMAGE_BASE_URL = String(import.meta.env?.VITE_NFT_IMAGE_BASE_URL || '/cdn/nft').replace(/\/+$/, '');
const NFT_USE_TOKEN_IMAGE_PATHS = String(import.meta.env?.VITE_NFT_USE_TOKEN_IMAGE_PATHS || '').trim() === '1';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Per-token decimals + display label. The contract stores prices in the
// token's smallest unit; we format to a human string for UI and parse
// the inverse for listing input.
const TOKEN_META_BY_ADDRESS = (() => {
  const m = new Map();
  m.set(ZERO_ADDRESS.toLowerCase(),                                  { symbol: 'ETH',  decimals: 18 });
  m.set(MARKETPLACE_BASE.paymentTokens.usdc.toLowerCase(),           { symbol: 'USDC', decimals: 6  });
  m.set(MARKETPLACE_BASE.paymentTokens.cop.toLowerCase(),            { symbol: 'CoP',  decimals: 18 });
  return m;
})();

export function paymentTokenMeta(address) {
  const key = String(address || '').toLowerCase();
  return TOKEN_META_BY_ADDRESS.get(key) || { symbol: 'TOK', decimals: 18 };
}

export function isEthPayment(address) {
  return !address || /^0x0{40}$/i.test(address);
}

export function paymentSymbolFromId(id) {
  if (id === 'eth')  return 'ETH';
  if (id === 'usdc') return 'USDC';
  if (id === 'cop')  return 'CoP';
  return id?.toUpperCase?.() || '';
}

export function paymentAddressFromId(id) {
  if (id === 'eth')  return MARKETPLACE_BASE.paymentTokens.eth;
  if (id === 'usdc') return MARKETPLACE_BASE.paymentTokens.usdc;
  if (id === 'cop')  return MARKETPLACE_BASE.paymentTokens.cop;
  return null;
}

export function nftImageUrl(level, tokenId) {
  const lvl = [1, 2, 3].includes(Number(level)) ? Number(level) : 1;
  if (NFT_USE_TOKEN_IMAGE_PATHS && tokenId != null && tokenId !== '') {
    return `${NFT_IMAGE_BASE_URL}/${lvl}/${encodeURIComponent(String(tokenId))}.jpg`;
  }
  return `${NFT_IMAGE_BASE_URL}/${lvl}/default.jpg`;
}

// ───────────────── Display helpers ────────────────────────────────────

export function formatPriceWei(priceWei, paymentToken) {
  const { decimals, symbol } = paymentTokenMeta(paymentToken);
  const wei = BigInt(String(priceWei || '0'));
  const denom = 10n ** BigInt(decimals);
  const whole = wei / denom;
  const fractional = wei % denom;
  if (fractional === 0n) return `${whole.toString()} ${symbol}`;
  // Show up to 4 significant fractional digits — enough resolution for
  // ETH listings while staying readable for USDC/CoP.
  const digits = decimals <= 4 ? decimals : 4;
  const scaled = fractional * 10n ** BigInt(digits) / denom;
  const fracStr = scaled.toString().padStart(digits, '0').replace(/0+$/, '');
  return fracStr ? `${whole.toString()}.${fracStr} ${symbol}` : `${whole.toString()} ${symbol}`;
}

export function parsePriceToWei(input, paymentToken) {
  const { decimals } = paymentTokenMeta(paymentToken);
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Enter a price');
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('Price must be a number');
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  const denom = 10n ** BigInt(decimals);
  const fracPadded = (frac + '0'.repeat(decimals - frac.length));
  const wei = BigInt(whole) * denom + (fracPadded ? BigInt(fracPadded) : 0n);
  if (wei <= 0n) throw new Error('Price must be greater than zero');
  return wei;
}

export function royaltyPreview(priceWei, bps = MARKETPLACE_BASE.defaultRoyaltyBps) {
  const wei = BigInt(String(priceWei || '0'));
  const royalty = wei * BigInt(bps) / 10_000n;
  return { royalty, seller: wei - royalty };
}

// ───────────────── ABI fragments ──────────────────────────────────────

export const MARKETPLACE_ABI = [
  { type: 'function', name: 'list', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId',      type: 'uint256' },
      { name: 'paymentToken', type: 'address' },
      { name: 'price',        type: 'uint256' },
      { name: 'expiresAt',    type: 'uint64'  },
    ], outputs: [] },
  { type: 'function', name: 'cancel', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'buyWithEth', stateMutability: 'payable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'buyWithToken', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'isActive', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const ERC721_ABI = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'getApproved', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'setApprovalForAll', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [] },
  { type: 'function', name: 'tokenLevel', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
];

const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

// ───────────────── Read endpoints ─────────────────────────────────────

export async function fetchMarketplaceListings({ chain = 'base', seller, activeOnly = true, limit = 50, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  params.set('chain', chain);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  params.set('active', activeOnly ? '1' : '0');
  if (seller) params.set('seller', String(seller).toLowerCase());
  const url = `/api/marketplace/listings?${params.toString()}`;
  const res = await fetch(url, { signal, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `listings (${res.status})`);
  return json;
}

let cachedReadClient = null;
function readClient() {
  if (cachedReadClient) return cachedReadClient;
  cachedReadClient = createPublicClient({ chain: base, transport: http() });
  return cachedReadClient;
}

// Multicall tokenLevel for a batch of token ids. Used to enrich indexer
// rows with their current level (the indexer doesn't track upgrades).
export async function fetchTokenLevels(tokenIds) {
  const ids = (tokenIds || []).map((id) => String(id)).filter(Boolean);
  if (!ids.length) return {};
  const client = readClient();
  const calls = ids.map((id) => ({
    address: getAddress(MARKETPLACE_BASE.demonKing),
    abi: ERC721_ABI, functionName: 'tokenLevel', args: [BigInt(id)],
  }));
  const rows = await client.multicall({ contracts: calls, allowFailure: true });
  const out = {};
  rows.forEach((row, idx) => {
    out[ids[idx]] = row?.status === 'success' ? Number(row.result) || 1 : 1;
  });
  return out;
}

// ───────────────── Approval helpers ───────────────────────────────────

export async function isMarketplaceApprovedForAll({ evmWallet, ownerAddress }) {
  if (!evmWallet?.getPublicClient || !ownerAddress) return false;
  const client = evmWallet.getPublicClient(BASE_CHAIN_ID) || readClient();
  return client.readContract({
    address: getAddress(MARKETPLACE_BASE.demonKing),
    abi: ERC721_ABI, functionName: 'isApprovedForAll',
    args: [getAddress(ownerAddress), getAddress(MARKETPLACE_BASE.marketplace)],
  });
}

export async function setMarketplaceApprovalForAll({ evmWallet, ownerAddress }) {
  await evmWallet.ensureChain(BASE_CHAIN_ID);
  const walletClient = evmWallet.getWalletClient(BASE_CHAIN_ID);
  const publicClient = evmWallet.getPublicClient(BASE_CHAIN_ID) || readClient();
  const hash = await walletClient.writeContract({
    account: getAddress(ownerAddress),
    address: getAddress(MARKETPLACE_BASE.demonKing),
    abi: ERC721_ABI, functionName: 'setApprovalForAll',
    args: [getAddress(MARKETPLACE_BASE.marketplace), true],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

async function ensureErc20Allowance({ evmWallet, ownerAddress, tokenAddress, amount }) {
  const publicClient = evmWallet.getPublicClient(BASE_CHAIN_ID) || readClient();
  const allowance = await publicClient.readContract({
    address: getAddress(tokenAddress),
    abi: ERC20_ABI, functionName: 'allowance',
    args: [getAddress(ownerAddress), getAddress(MARKETPLACE_BASE.marketplace)],
  });
  if (allowance >= amount) return null;
  const walletClient = evmWallet.getWalletClient(BASE_CHAIN_ID);
  const hash = await walletClient.writeContract({
    account: getAddress(ownerAddress),
    address: getAddress(tokenAddress),
    abi: ERC20_ABI, functionName: 'approve',
    args: [getAddress(MARKETPLACE_BASE.marketplace), amount],
  });
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return hash;
}

// ───────────────── Write flows ────────────────────────────────────────

export async function listNftOnMarketplace({
  evmWallet, ownerAddress, tokenId, paymentToken, priceWei, expiresAt = 0,
}) {
  await evmWallet.ensureChain(BASE_CHAIN_ID);
  // setApprovalForAll first if needed — the contract's `list` reverts
  // with "Marketplace not approved" otherwise.
  const approved = await isMarketplaceApprovedForAll({ evmWallet, ownerAddress });
  if (!approved) {
    await setMarketplaceApprovalForAll({ evmWallet, ownerAddress });
  }
  const publicClient = evmWallet.getPublicClient(BASE_CHAIN_ID) || readClient();
  const walletClient = evmWallet.getWalletClient(BASE_CHAIN_ID);
  const hash = await walletClient.writeContract({
    account: getAddress(ownerAddress),
    address: getAddress(MARKETPLACE_BASE.marketplace),
    abi: MARKETPLACE_ABI, functionName: 'list',
    args: [
      BigInt(tokenId),
      getAddress(paymentToken),
      BigInt(priceWei),
      BigInt(expiresAt || 0),
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

export async function cancelMarketplaceListing({ evmWallet, ownerAddress, tokenId }) {
  await evmWallet.ensureChain(BASE_CHAIN_ID);
  const publicClient = evmWallet.getPublicClient(BASE_CHAIN_ID) || readClient();
  const walletClient = evmWallet.getWalletClient(BASE_CHAIN_ID);
  const hash = await walletClient.writeContract({
    account: getAddress(ownerAddress),
    address: getAddress(MARKETPLACE_BASE.marketplace),
    abi: MARKETPLACE_ABI, functionName: 'cancel',
    args: [BigInt(tokenId)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

export async function buyMarketplaceListing({
  evmWallet, buyerAddress, tokenId, paymentToken, priceWei,
}) {
  await evmWallet.ensureChain(BASE_CHAIN_ID);
  const publicClient = evmWallet.getPublicClient(BASE_CHAIN_ID) || readClient();
  const walletClient = evmWallet.getWalletClient(BASE_CHAIN_ID);
  const isEth = isEthPayment(paymentToken);
  if (!isEth) {
    await ensureErc20Allowance({
      evmWallet, ownerAddress: buyerAddress, tokenAddress: paymentToken, amount: BigInt(priceWei),
    });
  }
  const hash = await walletClient.writeContract({
    account: getAddress(buyerAddress),
    address: getAddress(MARKETPLACE_BASE.marketplace),
    abi: MARKETPLACE_ABI,
    functionName: isEth ? 'buyWithEth' : 'buyWithToken',
    args: [BigInt(tokenId)],
    value: isEth ? BigInt(priceWei) : 0n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return { hash, receipt };
}

// ───────────────── Owner check (Base only) ────────────────────────────

export async function fetchOwnedBaseNfts({ ownerAddress, signal } = {}) {
  if (!ownerAddress) return [];
  const r = await fetch(`/api/nft/owned/base/${encodeURIComponent(ownerAddress)}`, {
    signal, cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `owned (${r.status})`);
  return Array.isArray(j?.tokens) ? j.tokens : [];
}
