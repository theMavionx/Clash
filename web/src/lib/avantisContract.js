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
import { buildRpcFallbackList, envFlag, sameOriginRpcUrl, siteOrigin, splitRpcUrls } from './rpcPolicy';
import {
  AVANTIS_PRICE_SOURCING,
  emptyAvantisPricePayload,
  normalizeAvantisPriceUpdateResponse,
} from './avantisPricePayload';

// ───── Network ─────────────────────────────────────────────────────
export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_ID_HEX = '0x2105';

function normalizeBaseRpcUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return sameOriginRpcUrl(raw);
  try {
    const url = new URL(raw, siteOrigin());
    const host = url.hostname.toLowerCase();
    const origin = new URL(siteOrigin()).origin;
    if (url.origin === origin && url.pathname.startsWith('/rpc/base')) return url.href;
    if (host.startsWith('base-mainnet.') && host.includes('alchemy')) return sameOriginRpcUrl('/rpc/base-alchemy');
    if (host === ['mainnet', 'base', 'org'].join('.')) return url.href;
    if (
      (host.includes('publicnode') && host.includes('base'))
      || (host.includes('blockpi') && host.includes('base'))
      || (host.endsWith('drpc.org') && host.startsWith('base.'))
      || (host === 'rpcfree.com' && url.pathname.includes('base'))
      || (host === '1rpc.io' && url.pathname.includes('base'))
      || (host.includes('developer-access') && host.includes('base'))
    ) {
      return url.href;
    }
    return url.href;
  } catch {
    return '';
  }
}

export const BASE_RPC_URLS = (() => {
  const override = splitRpcUrls(import.meta.env.VITE_BASE_RPC_URLS || import.meta.env.VITE_BASE_RPC_URL);
  const normalizedOverride = override.map(normalizeBaseRpcUrl).filter(Boolean);
  if (normalizedOverride.length) return normalizedOverride;
  const includeFree = envFlag(import.meta.env.VITE_BASE_ENABLE_PUBLIC_RPC, true);
  const includeAlchemy = envFlag(import.meta.env.VITE_BASE_ENABLE_ALCHEMY_RPC, true);
  return buildRpcFallbackList({
    publicUrls: [
      'https://mainnet.base.org',
      'https://base-rpc.publicnode.com',
      'https://1rpc.io/base',
      'https://base.drpc.org',
    ],
    privateUrls: [sameOriginRpcUrl('/rpc/base-alchemy')],
    includePublic: includeFree,
    includePrivate: includeAlchemy,
  });
})();

export const BASE_PRIMARY_RPC_URL = BASE_RPC_URLS[0] || sameOriginRpcUrl('/rpc/base');

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
const PRICE_FEED_PROXY_URL = '/api/futures/avantis/price-update-data';
const PRICE_FEED_TIMEOUT_MS = 8_000;

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
// only expose the user-callable variant. `codeOwners` lets us pre-verify
// that our code is actually registered before prompting the user for a
// signature — otherwise the contract reverts with "Invalid params".
export const REFERRAL_ABI = [
  { name: 'traderReferralCodes', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'trader', type: 'address' }],
    outputs: [{ type: 'bytes32' }] },
  { name: 'codeOwners', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'code', type: 'bytes32' }],
    outputs: [{ type: 'address' }] },
  { name: 'setTraderReferralCodeByUser', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: '_code', type: 'bytes32' }],
    outputs: [] },
];

export const TRADING_ABI = [
  { name: 'delegatedAction', type: 'function', stateMutability: 'payable',
    inputs: [
      { name: 'trader', type: 'address' },
      { name: 'call_data', type: 'bytes' },
    ],
    outputs: [{ type: 'bytes' }] },
  { name: 'delegations', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'trader', type: 'address' }],
    outputs: [{ type: 'address' }] },
  { name: 'setDelegate', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'delegate', type: 'address' }],
    outputs: [] },
  { name: 'removeDelegate', type: 'function', stateMutability: 'nonpayable',
    inputs: [],
    outputs: [] },
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
export const PRICE_SOURCING = AVANTIS_PRICE_SOURCING;

// ───── Scaling helpers ─────────────────────────────────────────────
// IMPORTANT: use `parseUnits(str, 10)` instead of `Math.floor(num * 1e10)` —
// float64 loses precision past 15 sig figs, so e.g. `75500.1234 * 1e10`
// serialises to 755001229999999.9 and truncates the 4th decimal. `parseUnits`
// operates on the decimal string directly so every digit survives.
export function priceToContract(price) {
  const s = String(price ?? '').trim();
  if (!s) return 0n;
  try { return parseUnits(s, 10); } catch { return 0n; }
}
export function leverageToContract(leverage) {
  const s = String(leverage ?? '').trim();
  if (!s) return 0n;
  try { return parseUnits(s, 10); } catch { return 0n; }
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
  const payload = await fetchPriceUpdateData(pairIndex);
  return Number(payload?.price) || 0;
}

// ───── Price update fetch (Pyth via Avantis feed-v3) ───────────────
// openTrade needs no price-update-data payload (executor updates internally).
// But market-close / TP-SL updates DO need fresh Pyth data. Returns hex
// '0x...' on failure so callers can bail cleanly.
export async function fetchPriceUpdateData(pairIndex) {
  // Current response: `{ core: null, pro: { priceUpdateData, price } }` for
  // continuously traded markets. Legacy Core/Hermes remains supported.
  const index = Number(pairIndex);
  if (!Number.isInteger(index) || index < 0 || index > 10_000) return emptyAvantisPricePayload();

  // Direct Avantis is fastest. The same-origin proxy is a browser/CORS/network
  // fallback and can additionally supply a fresh Hermes reference price for
  // market-open when feed-v3 itself is transiently unavailable.
  const urls = [
    `${FEED_V3_URL}/v2/pairs/${index}/price-update-data`,
    `${PRICE_FEED_PROXY_URL}?pairIndex=${index}`,
  ];
  for (const url of urls) {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), PRICE_FEED_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const data = await res.json();
      const normalized = data?.priceSourcing !== undefined
        ? data
        : normalizeAvantisPriceUpdateResponse(data);
      if (Number(normalized?.price) > 0) return normalized;
    } catch {
      // Continue to the next independent route.
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return emptyAvantisPricePayload();
}

// ───── Execution fee — dynamic, FLOOR-not-CEILING ──────────────────
// Keeper needs enough ETH to cover gas × keeper_gas_estimate + L1 calldata.
// Previously we CAPPED at 0.00035 ETH which under-paid during gas spikes
// (e.g. @1 gwei Base the formula wants ~0.00187 ETH, cap truncated to
// 0.00035 → keeper auto-cancels). Now the fallback is a FLOOR — we always
// pay at least 0.00035 ETH, and climb higher when gas prices demand.
// Max clamp at 0.005 ETH keeps a hostile RPC (reporting 100 gwei) from
// draining the wallet on a single trade.
//
// EIP-1559: Base is fully 1559; `getGasPrice` on a type-2 chain returns
// the current best estimate (baseFee + a default priority). viem's
// `estimateFeesPerGas` gives richer data (maxFeePerGas). We prefer that
// when available and fall back to getGasPrice.
const FEE_FALLBACK_WEI = 350000000000000n;     // 0.00035 ETH - SDK outage fallback
const FEE_MAX_WEI      = 5000000000000000n;    // 0.005 ETH  — hostile-RPC safety cap
const L2_GAS_ESTIMATE  = 935000n;              // 850k × 1.1, matches avantis_trader_sdk
const L1_CALLDATA_WEI  = 5000000000n;          // ≈ SDK's estimatedL1GasEth constant
// Do not floor successful estimates to FEE_FALLBACK_WEI; the SDK only uses it
// when gas estimation fails.
export async function fetchExecutionFeeWei(publicClient) {
  if (!publicClient) return FEE_FALLBACK_WEI;
  try {
    // Match Avantis SDK's eth_gasPrice path before using EIP-1559 estimates.
    let gasPrice;
    if (typeof publicClient.getGasPrice === 'function') {
      gasPrice = await publicClient.getGasPrice();
    }
    if (!gasPrice && typeof publicClient.estimateFeesPerGas === 'function') {
      const fees = await publicClient.estimateFeesPerGas({ chain: undefined });
      gasPrice = fees?.gasPrice || fees?.maxFeePerGas;
    }
    if (!gasPrice) return FEE_FALLBACK_WEI;

    const l2Cost = gasPrice * L2_GAS_ESTIMATE;
    let fee = l2Cost + L1_CALLDATA_WEI;
    if (fee <= 0n) return FEE_FALLBACK_WEI;
    if (fee > FEE_MAX_WEI) fee = FEE_MAX_WEI;
    return fee;
  } catch {
    return FEE_FALLBACK_WEI;
  }
}

// ───── Next free trade slot per pair ───────────────────────────────
// Avantis allows up to 3 (or more) simultaneous trades per pair per trader.
// Core API's /user-data lists current open trades and pending limit orders;
// both reserve a per-pair index. We pick the first unused slot. Defaults to 0
// if Core is unreachable, which lets the contract be the final arbiter.
export async function fetchNextTradeIndex(trader, pairIndex) {
  try {
    const res = await fetch(`${CORE_API}/user-data?trader=${trader}`);
    if (!res.ok) return 0;
    const data = await res.json();
    const used = new Set();
    const rows = [
      ...(Array.isArray(data?.positions) ? data.positions : []),
      ...(Array.isArray(data?.limitOrders) ? data.limitOrders : []),
    ];
    for (const p of rows) {
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

export async function fetchAvantisDelegate(publicClient, trader) {
  if (!publicClient || !trader) return null;
  try {
    const delegate = await publicClient.readContract({
      address: TRADING_ADDRESS,
      abi: TRADING_ABI,
      functionName: 'delegations',
      args: [trader],
    });
    return delegate || null;
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

// Returns the address that owns REFERRAL_CODE on-chain. Throws on RPC error
// so callers can distinguish "RPC unavailable" from "code not registered" —
// previously both surfaced as a confusing "code not registered" message.
// Callers that want the old swallow-all behaviour should wrap in try/catch.
export async function fetchReferralCodeOwner(publicClient) {
  if (!publicClient) return null;
  const owner = await publicClient.readContract({
    address: REFERRAL_ADDRESS,
    abi: REFERRAL_ABI,
    functionName: 'codeOwners',
    args: [REFERRAL_CODE_BYTES32],
  });
  return owner || null;
}

// Writes our referral code into the user's linkage. One signature. Safe to
// call repeatedly; the Avantis contract overwrites the prior code each time
// (not frozen after first write). Returns the tx hash.
//
// Pass `publicClient` to pre-validate the code is registered on-chain — if
// it isn't, we throw a specific error instead of letting the wallet fire a
// revert the user can't interpret. If the RPC itself is unreachable, we
// throw a DIFFERENT error so the UI can suggest "try again" rather than
// mis-blaming code registration.
export async function applyReferralCode(walletClient, publicClient = null) {
  if (!walletClient) throw new Error('Wallet not connected');
  if (publicClient) {
    let owner;
    try {
      owner = await fetchReferralCodeOwner(publicClient);
    } catch (rpcErr) {
      const err = new Error('Could not verify referral code — RPC unavailable, try again');
      err.code = 'REFERRAL_PRECHECK_RPC_FAILED';
      err.cause = rpcErr;
      throw err;
    }
    if (!owner || /^0x0+$/i.test(owner)) {
      const err = new Error(`Referral code "${REFERRAL_CODE_STRING}" is not registered on Avantis. Ask an admin to run registerCode() on ${REFERRAL_ADDRESS}.`);
      err.code = 'REFERRAL_CODE_NOT_REGISTERED';
      throw err;
    }
  }
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
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const verify = async () => {
    for (let i = 0; i < 5; i += 1) {
      const next = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      if (String(next || '').toLowerCase() === BASE_CHAIN_ID_HEX) return;
      if (i < 4) await delay(120);
    }
    throw new Error('Wallet is not on Base. Switch to Base and retry.');
  };
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
    await verify();
  } catch (err) {
    if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: BASE_CHAIN_ID_HEX,
          chainName: 'Base',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: BASE_RPC_URLS,
          blockExplorerUrls: ['https://basescan.org'],
        }],
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      }).catch(() => {});
      await verify();
      return;
    }
    throw err;
  }
}
