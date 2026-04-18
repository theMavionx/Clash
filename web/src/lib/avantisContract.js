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

import { parseUnits, stringToHex } from 'viem';

// ───── Network ─────────────────────────────────────────────────────
export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_ID_HEX = '0x2105';

// ───── Contract addresses (Base mainnet) ───────────────────────────
export const TRADING_ADDRESS         = '0x44914408af82bC9983bbb330e3578E1105e11d4e';
// USDC approvals go here — NOT the Trading contract. This was a day-one
// integration bug that cost us hours; keep the comment.
export const TRADING_STORAGE_ADDRESS = '0x8a311D7048c35985aa31C131B9A13e03a5f7422d';
export const USDC_ADDRESS            = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
// GMX-style referral registry. `setTraderReferralCodeByUser(bytes32)` stores
// our code against the caller's address; all subsequent open/close fees get
// the referral rebate (~5%). Idempotent — can be called again to re-link.
export const REFERRAL_ADDRESS        = '0x1A110bBA13A1f16cCa4b79758BD39290f29De82D';
// Our code ("clashofperps") encoded as right-zero-padded 32-byte ASCII. Avantis
// uses raw padding (GMX convention), not keccak hashing. If you ever rotate
// the code, update this constant — nowhere else reads the string.
export const REFERRAL_CODE_STRING    = 'clashofperps';
export const REFERRAL_CODE_BYTES32   = stringToHex(REFERRAL_CODE_STRING, { size: 32 });

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

// Minimal ABI for the Avantis Referral registry. Read current linkage +
// write a new one. The 2-arg setTraderReferralCode is handler-gated, so we
// only expose the user-callable variant.
export const REFERRAL_ABI = [
  { name: 'traderReferralCodes', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'trader', type: 'address' }],
    outputs: [{ type: 'bytes32' }] },
  { name: 'setTraderReferralCodeByUser', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: '_code', type: 'bytes32' }],
    outputs: [] },
];

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
      // Current on-chain signature takes a 6th arg `priceSourcing` enum:
      //   0 = Hermes (Pyth v2 price-update-data from feed-v3)
      //   1 = Pyth Lazer / PRO (not used by our integration)
      // Calling the old 5-arg selector reverts with a generic
      // "execution reverted" — this caused TP/SL to fail in Warpcast.
      { name: 'priceSourcing', type: 'uint8' },
    ],
    outputs: [] },
];

// Matches the `priceSourcing` enum in the 6-arg updateTpAndSl signature.
export const PRICE_SOURCING = Object.freeze({ HERMES: 0, PRO: 1 });

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

// ───── Live mark price (Pyth via Avantis feed-v3) ──────────────────
// Market openTrade REQUIRES a live reference price in the trade struct. If
// you pass `openPrice=0`, the Avantis keeper auto-cancels (verified live).
// The feed-v3 response already includes the current price next to the
// priceUpdateData payload, so this is a single request.
export async function fetchLiveMarkPrice(pairIndex) {
  try {
    const res = await fetch(`${FEED_V3_URL}/v2/pairs/${pairIndex}/price-update-data`);
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data?.core?.price) || 0;
  } catch { return 0; }
}

// ───── Price update fetch (Pyth via Avantis feed-v3) ───────────────
// openTrade needs no price-update-data payload (executor updates internally).
// But market-close / TP-SL updates DO need fresh Pyth data. Returns hex
// '0x...' on failure so callers can bail cleanly.
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

// ───── Execution fee — dynamic with hard-cap fallback ──────────────
// Avantis deleted the /fee/execution endpoint, so we reproduce the SDK's
// on-chain formula (gasPrice * 850k * 1.1 + L1 calldata) and attach a 2x
// safety buffer to survive gas spikes between quote and tx submit. The
// computed value is then CAPPED by the SDK's known-good fallback (0.00035
// ETH) — that's the value the keeper has accepted in prod for a year,
// overpaying there is ~$1 but pays 100% of the time. Under-paying reverts
// the trade and the user eats the L2 gas + the bad UX ("tx failed").
//
// Net effect on Base mainnet (typical ~0.01 gwei): ~0.00002 ETH needed,
// 2x buffer → 0.00004 ETH, capped by 0.00035 is a no-op → fee stays at
// 0.00004 ETH. Saves ~$1/trade vs the old flat 0.00035.
// Gas spikes to 1 gwei+: computed climbs above the cap, we fall back to
// 0.00035 — same behaviour as before, no regression.
const FEE_FALLBACK_WEI = 350000000000000n; // 0.00035 ETH — SDK default
const L2_GAS_ESTIMATE   = 935000n;          // 850k × 1.1, matches avantis_trader_sdk
const L1_CALLDATA_WEI   = 5000000000n;      // ≈ SDK's estimatedL1GasEth constant
const SAFETY_BUFFER_NUM = 2n;
const SAFETY_BUFFER_DEN = 1n;

export async function fetchExecutionFeeWei(publicClient) {
  if (!publicClient || typeof publicClient.getGasPrice !== 'function') {
    return FEE_FALLBACK_WEI;
  }
  try {
    const gasPrice = await publicClient.getGasPrice(); // wei per gas
    const l2Cost = gasPrice * L2_GAS_ESTIMATE;
    const raw = l2Cost + L1_CALLDATA_WEI;
    const withBuffer = (raw * SAFETY_BUFFER_NUM) / SAFETY_BUFFER_DEN;
    // Cap at fallback to avoid pricing the trade out on gas spikes.
    return withBuffer > FEE_FALLBACK_WEI ? FEE_FALLBACK_WEI : withBuffer;
  } catch {
    return FEE_FALLBACK_WEI;
  }
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
      // Flat `p.index` first — that's the verified live Core API shape. Fall
      // back to nested `p.trade.index` in case Core changes the schema.
      const idx = Number(p.index ?? p.trade?.index);
      if (Number.isFinite(idx)) used.add(idx);
    }
    for (let i = 0; i < 100; i++) if (!used.has(i)) return i;
    return 0;
  } catch {
    return 0;
  }
}

// ───── Referral linkage ────────────────────────────────────────────
// Returns the bytes32 code the trader is currently linked to (or 0x0…00 if
// none). Cheap on-chain read — no signing required.
export async function fetchReferralCode(publicClient, trader) {
  if (!publicClient || !trader) return null;
  try {
    const code = await publicClient.readContract({
      address: REFERRAL_ADDRESS,
      abi: REFERRAL_ABI,
      functionName: 'traderReferralCodes',
      args: [trader],
    });
    return code || null;
  } catch {
    return null;
  }
}

// Convenience: is this trader already linked to OUR code? Compares the
// stored bytes32 against REFERRAL_CODE_BYTES32 case-insensitively to
// tolerate any casing quirks in RPC responses.
export async function isLinkedToOurReferrer(publicClient, trader) {
  const code = await fetchReferralCode(publicClient, trader);
  if (!code) return false;
  return String(code).toLowerCase() === String(REFERRAL_CODE_BYTES32).toLowerCase();
}

// Writes our referral code into the user's linkage. One signature. Safe to
// call repeatedly; the Avantis contract overwrites the prior code each time
// (not frozen after first write). Returns the tx hash.
export async function applyReferralCode(walletClient) {
  if (!walletClient) throw new Error('Wallet not connected');
  return walletClient.writeContract({
    address: REFERRAL_ADDRESS,
    abi: REFERRAL_ABI,
    functionName: 'setTraderReferralCodeByUser',
    args: [REFERRAL_CODE_BYTES32],
  });
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
