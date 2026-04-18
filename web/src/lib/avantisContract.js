// Client-side Avantis contract primitives. Mirrors server-futures/avantis.js
// so we can sign openTrade / closeTradeMarket / approve from the user's own
// wallet instead of a custodial key on the server.
//
// All scaling conventions match the Avantis V2 docs:
//   price      × 1e10
//   leverage   × 1e10
//   tp / sl    × 1e10
//   slippageP  × 1e10  (1% = 1e10)
//   collateral × 1e6   (USDC native)

import { parseUnits } from 'viem';

// ───── Network ─────────────────────────────────────────────────────
export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_ID_HEX = '0x2105';

// ───── Contract addresses (Base mainnet) ───────────────────────────
export const TRADING_ADDRESS         = '0x44914408af82bC9983bbb330e3578E1105e11d4e';
// USDC approvals go here — NOT the Trading contract. This was a day-one
// integration bug that cost us hours; keep the comment.
export const TRADING_STORAGE_ADDRESS = '0x8a311D7048c35985aa31C131B9A13e03a5f7422d';
export const USDC_ADDRESS            = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ───── Avantis endpoints ───────────────────────────────────────────
export const CORE_API    = 'https://core.avantisfi.com';
export const FEED_V3_URL = 'https://feed-v3.avantisfi.com';

// ───── Order types ─────────────────────────────────────────────────
export const ORDER_TYPE = Object.freeze({
  MARKET: 0,
  STOP_LIMIT: 1,
  LIMIT: 2,
  MARKET_ZERO_FEE: 3,
});

// ───── Minimal ABIs ────────────────────────────────────────────────
export const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 's', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
];

// The Trading contract's openTrade takes a big struct. We build it inline in
// the JS call — viem encodes by field order, so the shape must match exactly.
const TRADE_INPUT_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'trader',           type: 'address' },
    { name: 'pairIndex',        type: 'uint256' },
    { name: 'index',            type: 'uint256' },
    { name: 'initialPosToken',  type: 'uint256' },
    { name: 'positionSizeUSDC', type: 'uint256' },
    { name: 'openPrice',        type: 'uint256' },
    { name: 'buy',              type: 'bool' },
    { name: 'leverage',         type: 'uint256' },
    { name: 'tp',               type: 'uint256' },
    { name: 'sl',               type: 'uint256' },
    { name: 'timestamp',        type: 'uint256' },
  ],
};

export const TRADING_ABI = [
  { name: 'openTrade', type: 'function', stateMutability: 'payable',
    inputs: [
      TRADE_INPUT_TUPLE,
      { name: '_type', type: 'uint8' },
      { name: '_slippageP', type: 'uint256' },
    ],
    outputs: [] },
  { name: 'closeTradeMarket', type: 'function', stateMutability: 'payable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'index', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [] },
  { name: 'cancelOpenLimitOrder', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [] },
  { name: 'updateTpAndSl', type: 'function', stateMutability: 'payable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' },
      { name: 'index', type: 'uint256' },
      { name: 'newSl', type: 'uint256' },
      { name: 'newTp', type: 'uint256' },
      { name: 'priceUpdateData', type: 'bytes[]' },
    ],
    outputs: [] },
];

// ───── Scaling helpers ─────────────────────────────────────────────
export function priceToContract(price) {
  return BigInt(Math.floor(Number(price) * 1e10));
}
export function leverageToContract(leverage) {
  return BigInt(Math.floor(Number(leverage) * 1e10));
}
export function slippageToContract(percent) {
  // clamp to sane window [0.1%, 50%]
  const p = Math.max(0.1, Math.min(Number(percent) || 1, 50));
  return BigInt(Math.floor(p * 1e10));
}
export function collateralToRaw(usdc) {
  return parseUnits(String(usdc), 6);
}

// ───── Side normaliser ─────────────────────────────────────────────
// Accept every spelling we've seen (pacifica, avantis docs, wallet SDKs).
export function sideIsBuy(side) {
  const s = String(side || '').toLowerCase();
  if (s === 'long' || s === 'buy' || s === 'bid') return true;
  if (s === 'short' || s === 'sell' || s === 'ask') return false;
  throw new Error(`Invalid side: ${side}`);
}

// ───── Price update fetch (Pyth via Avantis feed-v3) ───────────────
// openTrade needs no price data (executor updates internally). But market-
// close / TP-SL updates DO need fresh Pyth data. Returns hex '0x...' on
// failure so callers can bail cleanly.
export async function fetchPriceUpdateData(pairIndex) {
  // feed-v3.avantisfi.com returns { core: { priceUpdateData, price } }.
  // Historical typo: we used `price_update_data` (snake_case) for a while
  // and got back undefined → empty '0x' update → TP/SL flows reverted.
  try {
    const res = await fetch(`${FEED_V3_URL}/v2/pairs/${pairIndex}/price-update-data`);
    if (!res.ok) return { priceUpdateData: '0x', price: 0 };
    const data = await res.json();
    return {
      priceUpdateData: data?.core?.priceUpdateData || data?.core?.price_update_data || '0x',
      price: data?.core?.price || 0,
    };
  } catch {
    return { priceUpdateData: '0x', price: 0 };
  }
}

// ───── Execution fee fetch (dynamic; falls back to 0.00035 ETH) ────
const FEE_FALLBACK_WEI = 350000000000000n; // 0.00035 ETH
export async function fetchExecutionFeeWei() {
  try {
    const res = await fetch(`${CORE_API}/fee/execution`);
    if (!res.ok) return FEE_FALLBACK_WEI;
    const data = await res.json();
    const eth = Number(data?.eth || data?.executionFee || 0);
    if (eth > 0 && eth < 0.01) return BigInt(Math.floor(eth * 1e18));
  } catch {}
  return FEE_FALLBACK_WEI;
}

// ───── Next free trade slot per pair ───────────────────────────────
// Avantis allows up to 3 (or more) simultaneous trades per pair per trader.
// Core API's /user-data lists current open trades; we pick the first
// unused (0..N-1) slot. Defaults to 0 if Core is unreachable.
export async function fetchNextTradeIndex(trader, pairIndex) {
  try {
    const res = await fetch(`${CORE_API}/user-data?trader=${trader}`);
    if (!res.ok) return 0;
    const data = await res.json();
    const positions = data?.positions || [];
    const used = new Set();
    for (const p of positions) {
      const pi = Number(p.pairIndex ?? p.pair_index ?? p.trade?.pairIndex);
      if (pi !== Number(pairIndex)) continue;
      const idx = Number(p.trade?.index ?? p.index);
      if (Number.isFinite(idx)) used.add(idx);
    }
    for (let i = 0; i < 100; i++) if (!used.has(i)) return i;
    return 0;
  } catch {
    return 0;
  }
}

// ───── Base chain switch helper (EIP-3326/3085) ────────────────────
export async function ensureBaseChain(provider) {
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === BASE_CHAIN_ID_HEX) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  } catch (err) {
    if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: BASE_CHAIN_ID_HEX,
          chainName: 'Base',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: ['https://basescan.org'],
        }],
      });
      return;
    }
    throw err;
  }
}
