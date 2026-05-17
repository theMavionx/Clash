// Monad mainnet + Perpl Foundation (perp DEX) integration constants.
//
// Perpl is structurally different from our other 4 DEXes:
//   - Trading is exclusively over a private WebSocket (mt:22 envelopes), not
//     REST. REST is read-only (markets, history, fills).
//   - Auth is SIWE login → JWT cookie + nonce, NOT per-trade signatures or an
//     agent-wallet pattern. Once signed in, every WS order is authorized by
//     a session-monotonic `rq` (nonce/sequence) — no wallet popup per trade.
//   - Collateral is AUSD (Agora USD), NOT USDC.
//   - Markets are referenced by numeric `market_id` (BTC=1, ETH=20, SOL=30,
//     MON=10), not symbol strings.
//   - Leverage is per-order (`lv` field), not a separate set-leverage call.
//   - No margin-mode toggle — collateral is per-position via mt:22 t=6
//     (IncreasePositionCollateral).
//   - Order TTL is bounded by `lb` (last block valid). Even GTC orders expire.
//   - Funds live in an Exchange contract on Monad: deposit/withdraw + the
//     one-time `createAccount(amount)` call are the only on-chain steps.
//
// Phase 1 surface: chain config, contract addresses, REST/WS URLs, market-id
// map, scaling constants. The hook (useMonad) and the WS client live in
// separate files; this file is constants only.

import { defineChain } from 'viem';

// ───── Chain ─────────────────────────────────────────────────────────────
export const MONAD_CHAIN_ID = 143;
export const MONAD_CHAIN_ID_HEX = '0x8f';

// Public RPCs in fallback order. The first three are official Monad
// Foundation provider entries (QuickNode / Alchemy / Goldsky); the rest are
// secondary endpoints documented in `docs.monad.xyz/developer-essentials`.
// Free tier limits are modest (15-25 rps) — fine for read-only adapter use.
export const MONAD_RPC_URLS = [
  'https://rpc.monad.xyz',
  'https://rpc1.monad.xyz',
  'https://rpc2.monad.xyz',
  'https://rpc3.monad.xyz',
  'https://rpc-mainnet.monadinfra.com',
];

// viem chain definition. RainbowKit / Reown AppKit / Privy all accept this
// shape directly via their `chains` config.
export const monadChain = defineChain({
  id: MONAD_CHAIN_ID,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: {
      http: [MONAD_RPC_URLS[0]],
      webSocket: [MONAD_RPC_URLS[0].replace(/^https/, 'wss')],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monadscan',
      url: 'https://monadscan.com',
      apiUrl: 'https://api.monadscan.com/api',
    },
  },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

// EIP-3326/3085 helper — mirrors ensureBaseChain (Avantis) and
// ensureArbitrumChain (GMX). Idempotent; safe to call before every write.
// Monad is not preloaded in any wallet yet (mainnet launched Nov 2025), so
// we always need to be ready to fall through to wallet_addEthereumChain.
export async function ensureMonadChain(provider) {
  if (!provider) throw new Error('No EVM wallet connected');
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === MONAD_CHAIN_ID_HEX) return;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const verify = async () => {
    for (let i = 0; i < 5; i += 1) {
      const next = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      if (String(next || '').toLowerCase() === MONAD_CHAIN_ID_HEX) return;
      if (i < 4) await delay(120);
    }
    throw new Error('Wallet is not on Monad. Switch to Monad and retry.');
  };
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_CHAIN_ID_HEX }],
    });
    await verify();
  } catch (err) {
    if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: MONAD_CHAIN_ID_HEX,
          chainName: 'Monad',
          nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
          rpcUrls: [MONAD_RPC_URLS[0]],
          blockExplorerUrls: ['https://monadscan.com'],
        }],
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MONAD_CHAIN_ID_HEX }],
      }).catch(() => {});
      await verify();
      return;
    }
    throw err;
  }
}

// ───── Token contracts ───────────────────────────────────────────────────
// AUSD (Agora USD) is Perpl's settlement token on Monad mainnet — NOT USDC.
// Address verified in the Perpl api-docs README (`.env.example`). Decimals
// are 6 (matches every USDC-like stablecoin), but we DO NOT assume — we
// resolve at runtime via decimals() in case Perpl/Agora ever rebases.
export const AUSD_ADDRESS = '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a';

// Native USDC on Monad — Circle CCTP-bridged (the only canonical USDC on
// the chain). Surfaced here so a future swap-AUSD-from-USDC helper has a
// known source. NOTE: USDC on Monad uses 18 decimals, not 6 — the most
// common porting bug from Arbitrum/Base.
export const MONAD_USDC_ADDRESS = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
export const MONAD_USDC_DECIMALS = 18;

// ───── Perpl Exchange contract (account / deposit / withdraw) ────────────
// Source: api-docs README + .env.example. Address checked against on-chain
// `cast code` (matches a deployed proxy).
export const PERPL_EXCHANGE_ADDRESS = '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F';

// Minimal ABI for the on-chain steps a user has to do before they can
// trade: approve AUSD to the Exchange, then call createAccount(amount).
// Subsequent deposits go through the same Exchange contract via deposit /
// withdraw entry points (wired in Phase 2; createAccount is what gates
// entry to the trading WS).
export const PERPL_EXCHANGE_ABI = [
  { name: 'createAccount', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'accountId', type: 'uint256' }] },
  { name: 'allowOrderForwarding', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'allow', type: 'bool' }],
    outputs: [] },
  { name: 'depositCollateral', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [] },
  { name: 'withdrawCollateral', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [] },
];

// Standard ERC20 ABI — only the bits we need to read allowance and call
// approve on AUSD before createAccount/deposit. Keep separate from gmxConfig's
// ERC20_ABI so each DEX's lib stays self-contained.
export const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 's', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
];

// ───── Perpl REST / WS endpoints ─────────────────────────────────────────
function perplWsUrl(path) {
  if (typeof window === 'undefined' || !window.location?.host) {
    return `wss://app.perpl.xyz/ws/v1${path}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/perpl-ws${path}`;
}

// REST and WS are reverse-proxied via Vite/nginx because Perpl validates
// browser Origin/Referer against its own app domain during auth handshakes.
export const PERPL_API_BASE = '/perpl-api';
export const PERPL_WS_TRADING = perplWsUrl('/trading');
export const PERPL_WS_MARKET_DATA = perplWsUrl('/market-data');

// ───── Market-id mapping ─────────────────────────────────────────────────
// Mainnet only. Perpl's REST/WS uses numeric market_id; UI/quest code
// wants symbol strings. Source: api-docs README. New listings will need
// to be added here OR fetched dynamically from /pub/context (preferred,
// but this static map is the boot-time fallback).
export const PERPL_MARKETS_MAINNET = Object.freeze({
  1: 'BTC',
  10: 'MON',
  20: 'ETH',
  30: 'SOL',
});
export const PERPL_MARKET_BY_SYMBOL = Object.freeze(
  Object.fromEntries(
    Object.entries(PERPL_MARKETS_MAINNET).map(([id, sym]) => [sym, Number(id)]),
  ),
);

// ───── Scaling helpers ───────────────────────────────────────────────────
// Perpl's wire format is integer-scaled — price/size carry their own
// decimal exponents per market (delivered in the MarketConfig stream as
// `price_decimals` / `size_decimals`). These helpers operate on the
// resolved decimals; the hook caches the per-market scale so we don't
// re-fetch on every order.
export function scaleToWire(human, decimals) {
  if (!Number.isFinite(human)) return 0;
  const factor = 10 ** decimals;
  return Math.round(human * factor);
}

export function scaleFromWire(wire, decimals) {
  const n = Number(wire);
  if (!Number.isFinite(n)) return 0;
  return n / 10 ** decimals;
}

// ───── Order envelope constants ──────────────────────────────────────────
// Field `t` (OrderType) on the mt:22 trading envelope. Keeping the enum
// inline so the WS client doesn't need a separate types file.
export const PERPL_ORDER_TYPE = Object.freeze({
  OPEN_LONG: 1,
  OPEN_SHORT: 2,
  CLOSE_LONG: 3,
  CLOSE_SHORT: 4,
  CANCEL: 5,
  INCREASE_COLLATERAL: 6,
  CHANGE: 7,
});

// Field `fl` (TimeInForce flags) on the mt:22 envelope. Bitfield, but only
// these singletons are documented as valid combinations.
export const PERPL_TIF = Object.freeze({
  GTC: 0,
  POST_ONLY: 1,
  FOK: 2,
  IOC: 4,
});

// WS message types we send (mt). Used by the trading client; here as
// constants to keep magic numbers out of call sites.
export const PERPL_MT = Object.freeze({
  PING: 1,
  AUTH: 4,
  SUBSCRIBE: 5,
  GAS_PRICE_UPDATE: 7,
  MARKET_CONFIG_UPDATE: 8,
  MARKET_STATE_UPDATE: 9,
  MARKET_FUNDING_UPDATE: 10,
  CANDLES_SNAPSHOT: 11,
  CANDLES_UPDATE: 12,
  ORDER_BOOK_SNAPSHOT: 15,
  ORDER_BOOK_DELTA: 16,
  TRADES_SNAPSHOT: 17,
  TRADES_DELTA: 18,
  WALLET_SNAPSHOT: 19,
  WALLET_UPDATE: 20,
  ACCOUNT_UPDATE: 21,
  ORDER: 22,
  ORDERS_SNAPSHOT: 23,
  ORDERS_DELTA: 24,
  FILL_UPDATES: 25,
  POSITIONS_SNAPSHOT: 26,
  POSITIONS_DELTA: 27,
  HEARTBEAT: 100,
});
