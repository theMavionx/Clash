// GMX V2 (Arbitrum) — Phase 1: read-only.
//
// Mirrors the public shape of useAvantis() so FuturesPanel can branch on
// useDex() with minimum call-site churn. All write methods (placeMarketOrder,
// placeLimitOrder, closePosition, …) are stubs in this phase — they surface
// a clear "Phase 2" error rather than silently failing or pretending to work.
//
// Data path: GmxApiSdk (HTTP-only) → public endpoint
// `https://arbitrum-api.gmxinfra.io`. No RPC, no wallet signature for reads.
// We only need the user's connected EVM address to filter positions/orders.
//
// Phase 2 (writes) will:
//   1. Add GmxSdk (v1) for createOrder via viem walletClient
//   2. Wire executionFee + ETH-balance gate
//   3. Wire ReferralStorage.setTraderReferralCodeByUser when ref code arrives
//   4. server-futures/gmx.js for trade-history indexer + claim-gold

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { getGmxApiSdk } from '../lib/gmxClient';
import {
  ARBITRUM_CHAIN_ID,
  GMX_SYNTHETICS_ROUTER,
  ERC20_ABI,
  MAX_UINT256,
  ARBITRUM_USDC_NATIVE,
  ARBITRUM_USDC_DECIMALS,
} from '../lib/gmxConfig';

// ───── Decimal scaling constants ─────
// GMX expresses USD-denominated values in 30 decimals everywhere. Tokens
// keep their native decimals (USDC = 6, ETH = 18, BTC = 8). Don't conflate.
const USD_DECIMALS = 30;

function fmtUsd(big) {
  if (big == null) return null;
  try { return Number(formatUnits(BigInt(big), USD_DECIMALS)); } catch { return null; }
}

function fmtPriceUsd(big) {
  // GMX prices have an extra factor depending on token decimals — for the
  // ticker shape (markPrice in 30-decimal USD per 1 unit of index token), the
  // raw → human conversion is the same formatUnits call. Index tokens with
  // non-18 decimals may need symbol-specific math; revisit in Phase 2 when
  // we tie it to actual order-sizing.
  return fmtUsd(big);
}

// GMX V2 market `symbol` looks like `"ETH/USD [WETH-WETH]"` —
// `<base>/<quote> [longToken-shortToken]` — because the venue exposes
// multiple markets per asset distinguished by their collateral pool. Parse
// the human base out for FuturesPanel (which expects bare ticker symbols
// like Pacifica/Avantis return).
function parseGmxMarketName(raw) {
  const s = String(raw || '');
  // Drop the "[longToken-shortToken]" pool tag and split off the quote.
  const left = s.split('[')[0].trim();           // "ETH/USD"
  const base = left.split(/[\/-]/)[0].trim();    // "ETH"
  const pool = (s.match(/\[([^\]]+)\]/) || [])[1] || '';
  return {
    base: base.toUpperCase(),
    pool,
    isSwapOnly: /swap[\s-]?only/i.test(s),
    rawName: s,
  };
}

// Normalise a MarketTicker into the shape FuturesPanel expects from every
// DEX hook (matches Pacifica/Decibel/Avantis output). The panel uses
// `symbol`, `lot_size`, `tick_size`, `min_order_size`, `max_leverage`.
// Where GMX's free read API doesn't expose a value (lot/tick/min), we ship
// sensible defaults — the actual on-chain limits come from market config in
// Phase 2 where we'll fetch them via GmxSdk v1.
function normalizeMarket(t) {
  const parsed = parseGmxMarketName(t?.symbol);
  // Swap-only markets aren't tradeable as perps; skip them so the picker
  // doesn't show "SWAP-ONLY" rows. Phase 2 may add a separate Spot tab.
  if (parsed.isSwapOnly || !parsed.base) return null;
  const sym = parsed.base;
  return {
    symbol: sym,
    base: sym,
    pair: `${sym}/USD`,
    pool: parsed.pool,
    market_name: parsed.rawName,
    market_addr: t?.marketTokenAddress || null,
    // Lot/tick are taken from per-market config on GMX; ticker shape doesn't
    // include them. UI uses these to format inputs and round on submit. In
    // Phase 1 we surface conservative defaults that won't reject any plausible
    // user input (Phase 2 replaces with on-chain values).
    lot_size: '0.0001',
    tick_size: '0.01',
    min_order_size: '2',           // GMX min position is ~$2 USD on Arbitrum.
    max_leverage: 100,             // Up to 100x on Arbitrum (per market may cap lower).
    isolated_only: true,           // GMX V2 is isolated by design.
    // Live ticker fields — used by the symbol bar / chart header.
    mark: fmtPriceUsd(t?.markPrice),
    oracle: fmtPriceUsd(t?.markPrice),
    high_24h: fmtPriceUsd(t?.high24h),
    low_24h: fmtPriceUsd(t?.low24h),
    open_24h: fmtPriceUsd(t?.open24h),
    yesterday_price: fmtPriceUsd(t?.open24h),
    volume_24h: 0,                 // Ticker shape doesn't carry 24h vol; rates endpoint does (Phase 2 wire-up).
    open_interest: fmtUsd(t?.longInterestUsd) || 0,
    funding_rate: fmtUsd(t?.fundingRateLong) || 0,
    next_funding_rate: fmtUsd(t?.fundingRateLong) || 0,
    _raw: t,
  };
}

// Live price row (matches the Pacifica shape for `prices`). FuturesPanel
// resolves `mark`, `oracle`, `volume_24h`, `yesterday_price`, `open_interest`.
function normalizePrice(t) {
  const parsed = parseGmxMarketName(t?.symbol);
  if (parsed.isSwapOnly || !parsed.base) return null;
  return {
    symbol: parsed.base,
    mark: String(fmtPriceUsd(t?.markPrice) ?? ''),
    oracle: String(fmtPriceUsd(t?.markPrice) ?? ''),
    yesterday_price: String(fmtPriceUsd(t?.open24h) ?? ''),
    volume_24h: 0,
    open_interest: String(fmtUsd(t?.longInterestUsd) || 0),
  };
}

// Position normaliser — ApiPositionInfo → FuturesPanel shape.
// FuturesPanel expects `{ symbol, side ('bid'|'ask'), size_usd, entry_price,
// margin, leverage, pnl_usd, liquidation_price, mark_price, market_addr }`.
function normalizePosition(p) {
  if (!p) return null;
  // The V2 ApiPositionInfo type OMITS indexToken/longToken/shortToken
  // (those live on V1's PositionInfo). All we have is `indexName` like
  // "SYRUP/USD" and `poolName` like "WETH-USDC". Parse the base out so
  // FuturesPanel's `prices.find(p => p.symbol === pos.symbol)` lookup hits
  // — that's what feeds the mark price into the PnL math. Without this,
  // pos.symbol was '' and the panel never found a mark, so pnlVal=0 and
  // the card always showed "+$0.00".
  const symFromName = String(p?.indexName || '').split(/[\/-]/)[0].trim().toUpperCase();
  const symbol = symFromName
    || String(p?.indexToken?.symbol || p?.market?.indexToken?.symbol || '').toUpperCase();
  const sizeUsd = fmtUsd(p?.sizeInUsd);
  const collateralUsd = fmtUsd(p?.collateralUsd ?? p?.collateralAmountUsd);
  const entryPrice = fmtPriceUsd(p?.entryPrice);
  // V2 returns `leverage` as a BPS string (e.g. "132742" = 13.2742×). When
  // present, prefer it — division of $size/$collateral can overshoot when
  // PnL has eaten into collateral. V1's PositionInfo also exposes leverage.
  let leverage = null;
  if (p?.leverage != null) {
    try { leverage = Number(BigInt(p.leverage)) / 10000; } catch {}
  }
  if (leverage == null && sizeUsd && collateralUsd && collateralUsd > 0) {
    leverage = Math.round(sizeUsd / collateralUsd);
  }
  // FuturesPanel's basic-mode card calls parseFloat(pos.amount) and uses it
  // for PnL math: `(markP - entryP) * amt * dirSign`. amount = position
  // size in BASE TOKENS (not USD). GMX gives `sizeInTokens` directly; fall
  // back to sizeUsd / entryPrice when sizeInTokens is missing.
  const indexDecimals = Number(p?.indexToken?.decimals || 18);
  let amount = null;
  if (p?.sizeInTokens != null) {
    try { amount = Number(formatUnits(BigInt(p.sizeInTokens), indexDecimals)); } catch {}
  }
  if ((amount == null || !Number.isFinite(amount)) && sizeUsd != null && entryPrice && entryPrice > 0) {
    amount = sizeUsd / entryPrice;
  }
  return {
    symbol,
    side: p?.isLong ? 'bid' : 'ask',
    amount,                          // BASE-TOKEN units (panel reads this)
    size_usd: sizeUsd,
    entry_price: entryPrice,
    mark_price: fmtPriceUsd(p?.markPrice),
    liquidation_price: fmtPriceUsd(p?.liquidationPrice),
    margin: collateralUsd,
    leverage,
    // V2 uses `pnl`; V1 PositionInfo has the same name. Older code paths
    // expected `pnlUsd` — not present in either. Read `pnl` and fall
    // through if the SDK ever renames.
    pnl_usd: fmtUsd(p?.pnl ?? p?.pnlAfterFees ?? p?.pnlUsd),
    market_addr: p?.marketAddress,
    // Cross-DEX close-handler fields. Avantis uses these on-chain; GMX
    // doesn't (we resolve by symbol+side), but FuturesPanel passes them
    // blindly so set null to avoid undefined warnings.
    pair_index: null,
    trade_index: null,
    _raw: p,
  };
}

// Order normaliser. ApiOrderInfo's price fields (`triggerPrice` /
// `acceptablePrice`) are stored in the raw on-chain CONTRACT format —
// `humanPrice * 10^(30 - indexTokenDecimals)` — NOT the 30-decimal-USD that
// V2 ticker/position endpoints normalise to. Pass `marketMap` so we can
// look up indexToken decimals by market address and format the right
// number of digits. Without this, ZORA / any 18-decimal token displays as
// `$0.0₁₉xxx` (off by 10^18 from the real price).
function normalizeOrder(o, marketMap) {
  if (!o) return null;
  const marketKey = String(o?.marketAddress || '').toLowerCase();
  const mi = marketMap?.[marketKey];
  const indexDecimals = Number(mi?.indexTokenDecimals ?? o?.indexToken?.decimals ?? 18);
  // Contract-format → human price in one shot. formatUnits(big, 30-N)
  // shifts the decimal point exactly the way GMX stores it on-chain.
  const fmtContractPrice = (big) => {
    if (big == null) return null;
    try { return Number(formatUnits(BigInt(big), 30 - indexDecimals)); } catch { return null; }
  };
  const symbol = mi?.baseSymbol
    || String(o?.indexToken?.symbol || '').toUpperCase();
  return {
    symbol,
    side: o?.isLong ? 'bid' : 'ask',
    size_usd: fmtUsd(o?.sizeDeltaUsd),
    price: fmtContractPrice(o?.triggerPrice ?? o?.acceptablePrice),
    order_id: o?.key,
    type: o?.orderType,
    market_addr: o?.marketAddress,
    _raw: o,
  };
}

const POLL_INTERVAL_MS = 5_000;
const TX_TIMEOUT_MS = 90_000;

// Pick the best GMX V2 market identifier for a given base symbol. The V2
// prepareOrder API expects a string like "ETH/USD [WETH-USDC]" — that's
// `indexName + " [" + poolName + "]"` for the chosen collateral pool.
//
// Selection rule mirrors the deduped picker on the trade panel: prefer a
// USDC-short pool (most liquid + UX-consistent — collateral matches deposit
// currency), fall back to any non-disabled tradeable pool. `tickerList` is
// the raw, NOT-deduped ticker array from `apiSdk.fetchMarketsTickers()` so
// every pool variant is visible.
function findGmxMarketSymbol(tickerList, base) {
  const target = String(base || '').toUpperCase();
  if (!Array.isArray(tickerList)) return null;
  // Each ticker.symbol looks like "ETH/USD [WETH-USDC]". Parse and filter.
  const candidates = tickerList
    .map(t => {
      const sym = String(t?.symbol || '');
      const left = sym.split('[')[0].trim();        // "ETH/USD"
      const baseSym = left.split(/[\/-]/)[0].trim().toUpperCase();
      const pool = (sym.match(/\[([^\]]+)\]/) || [])[1] || '';
      const shortToken = pool.split('-').pop() || '';
      return { full: sym, baseSym, pool, shortToken, isSwapOnly: /swap[\s-]?only/i.test(sym) };
    })
    .filter(c => c.baseSym === target && !c.isSwapOnly && c.full);
  if (!candidates.length) return null;
  // Prefer USDC-short pool. USDC.E variant only used as last resort to
  // avoid creating a position locked in bridged USDC the user doesn't want.
  const usdc = candidates.find(c => c.shortToken.toUpperCase() === 'USDC');
  if (usdc) return usdc.full;
  const usdcE = candidates.find(c => /^USDC\.E$/i.test(c.shortToken));
  if (usdcE) return usdcE.full;
  return candidates[0].full;
}

// viem revert errors carry the human reason in `.shortMessage` /
// `.cause.shortMessage`. We mine those for actionable text so the panel's
// error bar isn't a wall of "execution reverted: 0x...".
function decodeWriteError(e, fallback = 'GMX order failed') {
  if (!e) return fallback;
  const chain = [e, e.cause, e.cause?.cause, e.cause?.cause?.cause].filter(Boolean);
  for (const err of chain) {
    if (err?.data?.errorName) return String(err.data.errorName);
    const reason = err.reason || err.shortMessage;
    if (reason) {
      if (/insufficient funds/i.test(reason)) return 'Insufficient ETH on Arbitrum for gas + execution fee';
      if (/user rejected|denied/i.test(reason)) return 'Signature cancelled';
      if (/insufficient allowance|allowance/i.test(reason)) return 'USDC allowance not set — approve USDC and retry';
      return String(reason).slice(0, 200);
    }
  }
  return String(e.message || fallback).slice(0, 240);
}

export function useGmx() {
  const { dex } = useDex();
  const isActiveDex = dex === 'gmx';
  const { address, isReady, getWalletClient, getPublicClient, ensureChain } = useEvmWallet();
  const player = usePlayer();
  const walletAddr = address || null;

  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [walletEth, setWalletEth] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);

  const marketsRef = useRef([]);
  // Raw ticker list (NOT deduped) — `findGmxMarketSymbol` searches through
  // every pool variant when the user opens/closes a position so we pick the
  // USDC-collateral pool deterministically.
  const marketsRawRef = useRef([]);
  const sdkRef = useRef(null);
  // Forward-ref to claimGold so the heartbeat useEffect declared earlier
  // in the file can fire without referencing the const before its TDZ
  // window closes. Populated immediately after the const declaration.
  const claimGoldRef = useRef(null);
  // Address → symbol map cached from the V2 /tokens endpoint. Used to
  // translate a position's `collateralTokenAddress` into the
  // `collateralToken: "USDC"` string the /orders/txns/prepare endpoint
  // expects.
  const tokenSymbolMapRef = useRef({ map: null, fetchedAt: 0 });
  // marketAddress → { indexTokenAddress, indexTokenDecimals, baseSymbol }.
  // Needed to display order prices correctly: ApiOrderInfo returns
  // triggerPrice/acceptablePrice in contract format (humanPrice *
  // 10^(30-decimals)) and the formatter has to know `decimals` per market
  // to recover the human number.
  const marketInfoMapRef = useRef({ map: null, fetchedAt: 0 });
  const tradeInFlightRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  // Wallet-mismatch guard: same gate Avantis uses. The player's registered
  // EVM wallet (from server) must match the currently connected wallet,
  // otherwise a fresh wallet shouldn't be able to operate on the registered
  // user's balances. Returns true ONLY when both are present and differ.
  const registeredWallet = typeof player?.wallet === 'string' ? player.wallet.trim() : '';
  const registeredEvmWallet = /^0x[0-9a-fA-F]{40}$/.test(registeredWallet)
    ? registeredWallet.toLowerCase()
    : null;
  const activeEvmWallet = walletAddr ? String(walletAddr).toLowerCase() : null;
  const walletMismatch = !!(registeredEvmWallet && activeEvmWallet && registeredEvmWallet !== activeEvmWallet);

  // Lazy-load the SDK on first need. Cached via module singleton — repeat
  // calls return immediately. Failures bubble up; UI surfaces them.
  const ensureSdk = useCallback(async () => {
    if (sdkRef.current) return sdkRef.current;
    try {
      const sdk = await getGmxApiSdk();
      sdkRef.current = sdk;
      return sdk;
    } catch (e) {
      console.warn('[useGmx] failed to load GmxApiSdk:', e?.message || e);
      throw e;
    }
  }, []);

  // V2 token registry — keyed by lowercase address → upper-case symbol.
  // Fetched once and cached for 5 min; the list barely changes between
  // weekly listings. Used by the V2-classic close path to map a position's
  // `collateralTokenAddress` to the `collateralToken: "USDC"` string the
  // GMX prepareOrder API expects.
  const ensureTokenSymbolMap = useCallback(async () => {
    const cached = tokenSymbolMapRef.current;
    if (cached.map && Date.now() - cached.fetchedAt < 300_000) return cached.map;
    const sdk = await ensureSdk();
    const tokens = await sdk.fetchTokens();
    const map = {};
    for (const t of tokens || []) {
      if (!t?.address || !t?.symbol) continue;
      map[String(t.address).toLowerCase()] = String(t.symbol);
    }
    tokenSymbolMapRef.current = { map, fetchedAt: Date.now() };
    return map;
  }, [ensureSdk]);

  // marketAddress → { indexTokenAddress, indexTokenDecimals, baseSymbol }.
  // Built from `/markets` (gives marketAddress + indexTokenAddress) joined
  // with `/tokens` (gives address → decimals + symbol). 5-min TTL because
  // new market listings are weekly at most. Required to display order
  // prices — see normalizeOrder above for why.
  const ensureMarketInfoMap = useCallback(async () => {
    const cached = marketInfoMapRef.current;
    if (cached.map && Date.now() - cached.fetchedAt < 300_000) return cached.map;
    const sdk = await ensureSdk();
    const [marketsList, tokens] = await Promise.all([
      sdk.fetchMarkets(),
      sdk.fetchTokens(),
    ]);
    const tokenByAddr = {};
    for (const t of tokens || []) {
      if (t?.address) tokenByAddr[String(t.address).toLowerCase()] = t;
    }
    const map = {};
    for (const m of marketsList || []) {
      if (!m?.marketTokenAddress) continue;
      const idx = tokenByAddr[String(m.indexTokenAddress || '').toLowerCase()];
      // Market `symbol` is "ETH/USD [WETH-USDC]"; baseSymbol is the part
      // before "/", upper-cased, used by normalizeOrder so the orders tab
      // shows "ETH" instead of empty when the order has no nested
      // indexToken object (V2 fetchOrders ApiOrderInfo doesn't include one).
      const baseSymbol = String(m.symbol || '').split('/')[0].trim().toUpperCase();
      map[String(m.marketTokenAddress).toLowerCase()] = {
        indexTokenAddress: m.indexTokenAddress,
        indexTokenSymbol: idx?.symbol || baseSymbol,
        indexTokenDecimals: idx?.decimals ?? 18,
        baseSymbol,
      };
    }
    marketInfoMapRef.current = { map, fetchedAt: Date.now() };
    return map;
  }, [ensureSdk]);

  // ───── Public market data ─────
  // GMX exposes multiple markets per asset (different collateral pools), so
  // a raw ticker dump has duplicate base symbols (e.g. three ETH rows for
  // WETH-WETH, WETH-USDC, WETH-USDC.E pools). The trade panel expects ONE
  // row per ticker; keep the first non-null entry per base. Phase 2 should
  // pick the deepest-liquidity pool — for now first-wins keeps the picker
  // tidy without committing to a sort order before we read pool depth.
  function dedupBySymbol(rows) {
    const out = [];
    const seen = new Set();
    for (const r of rows) {
      if (!r || !r.symbol || seen.has(r.symbol)) continue;
      seen.add(r.symbol);
      out.push(r);
    }
    return out;
  }

  const fetchMarkets = useCallback(async () => {
    try {
      const sdk = await ensureSdk();
      const tickers = await sdk.fetchMarketsTickers();
      // Cache the raw, non-deduped tickers so `findGmxMarketSymbol` can
      // pick the USDC-collateral pool when opening/closing positions.
      // Without this, `markets` (deduped first-wins) would sometimes have
      // a non-USDC pool variant for a base symbol — opens routing through
      // it would either fail or lock collateral in the wrong token.
      marketsRawRef.current = tickers || [];
      const norm = dedupBySymbol((tickers || []).map(normalizeMarket));
      marketsRef.current = norm;
      setMarkets(norm);
      // Tickers double as price rows so the panel renders before the first
      // price-poll cycle. This matches how Pacifica's WS warmup populates
      // both arrays from the initial /info call.
      setPrices(dedupBySymbol((tickers || []).map(normalizePrice)));
    } catch (e) {
      console.warn('[useGmx] fetchMarkets:', e?.message || e);
    }
  }, [ensureSdk]);

  const fetchPrices = useCallback(async () => {
    try {
      const sdk = await ensureSdk();
      const tickers = await sdk.fetchMarketsTickers();
      const fresh = dedupBySymbol((tickers || []).map(normalizePrice));
      // Merge by symbol so we don't lose entries during transient gaps.
      setPrices(prev => {
        if (!fresh.length) return prev;
        const byKey = new Map((prev || []).map(p => [p.symbol, p]));
        for (const p of fresh) byKey.set(p.symbol, p);
        return Array.from(byKey.values());
      });
    } catch (e) {
      console.warn('[useGmx] fetchPrices:', e?.message || e);
    }
  }, [ensureSdk]);

  // ───── Account / positions / orders ─────
  const fetchAccount = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const sdk = await ensureSdk();
      // GmxApiSdk doesn't expose a single "account summary" call; we derive
      // a Pacifica-shaped object from wallet balances so the symbol-bar
      // BALANCE chip can render the same way for every DEX. Covers ETH
      // (gas) and USDC (collateral) on Arbitrum.
      const balances = await sdk.fetchWalletBalances({ address: walletAddr });
      // Prefer native USDC over bridged USDC.e — they're listed in the same
      // response and the bridged variant is always present (often with $0).
      // First-match ordering would otherwise pick USDC.e and report $0 even
      // when the user holds the real native USDC. Same precedence wallet
      // dropdowns use everywhere on Arbitrum since native rolled out.
      const usdc = (balances || []).find(b => b?.symbol === 'USDC')
        || (balances || []).find(b => /^USDC\.E$/i.test(b?.symbol || ''));
      const usdcHuman = usdc ? Number(formatUnits(BigInt(usdc.balance || 0), Number(usdc.decimals || 6))) : 0;
      // Native ETH is NOT in /balances/wallet (which only enumerates ERC20s).
      // The user holds native ETH for gas, not WETH — so reading the WETH
      // entry shows 0 and we'd incorrectly warn about insufficient gas. Read
      // native balance directly via the chain-bound publicClient.
      let ethHuman = 0;
      try {
        const pc = getPublicClient ? getPublicClient(ARBITRUM_CHAIN_ID) : null;
        if (pc) {
          const ethWei = await pc.getBalance({ address: walletAddr });
          ethHuman = Number(formatUnits(ethWei, 18));
        }
      } catch (e) {
        console.warn('[useGmx] native ETH balance read failed:', e?.message || e);
      }
      setWalletUsdc(usdcHuman);
      setWalletEth(ethHuman);
      setAccount({
        balance: String(usdcHuman),
        account_equity: String(usdcHuman),
        available_to_spend: String(usdcHuman),
        available_to_withdraw: String(usdcHuman),
        positions_count: 0, // Filled by fetchPositions.
      });
    } catch (e) {
      console.warn('[useGmx] fetchAccount:', e?.message || e);
    }
  }, [walletAddr, ensureSdk, getPublicClient]);

  const fetchPositions = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const sdk = await ensureSdk();
      const list = await sdk.fetchPositionsInfo({ address: walletAddr, includeRelatedOrders: false });
      const norm = (list || []).map(normalizePosition).filter(Boolean);
      setPositions(norm);
      setDataReady(true);
      // Mirror Avantis side-effect: global counter feeds non-React systems
      // (Godot battle UI peeks at this to gate the "you have positions open"
      // hint). Keeping the side-effect identical avoids a per-DEX branch.
      window._openPositionsCount = norm.length;
    } catch (e) {
      console.warn('[useGmx] fetchPositions:', e?.message || e);
    }
  }, [walletAddr, ensureSdk]);

  const fetchOrders = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const sdk = await ensureSdk();
      const [list, marketMap] = await Promise.all([
        sdk.fetchOrders({ address: walletAddr }),
        ensureMarketInfoMap(),
      ]);
      const norm = (list || []).map(o => normalizeOrder(o, marketMap)).filter(Boolean);
      setOrders(norm);
    } catch (e) {
      console.warn('[useGmx] fetchOrders:', e?.message || e);
    }
  }, [walletAddr, ensureSdk, ensureMarketInfoMap]);

  // ───── Polling lifecycle ─────
  // fetchMarkets runs once on mount (and once when GMX becomes the active
  // DEX) so the panel can render market tiles before the user connects.
  useEffect(() => { if (isActiveDex) fetchMarkets(); }, [isActiveDex, fetchMarkets]);

  useEffect(() => {
    if (!isActiveDex) return;
    const tick = () => {
      fetchPrices();
      if (walletAddr) {
        fetchAccount();
        fetchPositions();
        fetchOrders();
      }
    };
    tick();
    const iv = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [isActiveDex, walletAddr, fetchPrices, fetchAccount, fetchPositions, fetchOrders]);

  // Periodic claim-gold heartbeat. Same cadence as useAvantis: kick once
  // ~3s after mount (catches a stale "pending claim" from the worker if
  // it polled while the panel was closed) and every 30s after that. The
  // server endpoint is idempotent + cursor-gated, so over-calling is safe.
  //
  // We dispatch through `claimGoldRef.current` instead of the callback
  // directly so this effect can sit ABOVE the `const claimGold = …` decl
  // without hitting JavaScript's temporal-dead-zone (`Cannot access
  // 'claimGold' before initialization`). The ref is populated below.
  useEffect(() => {
    if (!walletAddr || !isActiveDex) return;
    const fire = () => { const fn = claimGoldRef.current; if (typeof fn === 'function') fn(); };
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(fire, 30_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [walletAddr, isActiveDex]);

  // ───── Writes (V2 prepareOrder API) ─────
  // Every write goes through GMX's `/orders/txns/prepare` endpoint in
  // `classic` mode: backend computes acceptable price, fees, exec fee,
  // decreaseAmounts, builds the `{to,data,value}` payload — we just send
  // the tx via the user's wallet. No on-chain multicalls, no per-market
  // SDK token config, no skipped-market issues for new listings.
  //
  // The previous V1 SDK path (sdk.orders.long/short/createDecreaseOrder)
  // needed a fully-loaded marketsInfoData/tokensData snapshot, which:
  //   1. Fired 100-500 multicall HTTP requests per refresh under viem's
  //      default 1KB batchSize — flooding even paid Alchemy.
  //   2. Silently skipped any market whose tokens weren't in the SDK's
  //      bundled config (every recent listing — SYRUP, etc.) — opens
  //      against those routed nowhere; closes raised "no open position".
  //   3. Required loading ~700KB of V1 SDK bundle code we don't need.
  // The V2 API has none of those problems.

  /**
   * Ensure the user has approved USDC to the GMX SyntheticsRouter for at
   * least `requiredAmount`. If allowance is short, fires an ERC20.approve
   * with MAX_UINT256 (one-time wallet popup; infinite approve is the
   * standard UX every perp DEX uses) and waits for the receipt.
   *
   * Returns true once allowance is sufficient. Throws on user-rejection so
   * the caller bails out of the trade flow with a useful error.
   */
  const ensureUsdcAllowance = useCallback(async (requiredAmount) => {
    if (!walletAddr) throw new Error('Wallet not connected');
    const wc = getWalletClient(ARBITRUM_CHAIN_ID);
    const pc = getPublicClient(ARBITRUM_CHAIN_ID);
    if (!wc || !pc) throw new Error('Failed to build Arbitrum clients');

    const required = BigInt(requiredAmount);
    const current = await pc.readContract({
      address: ARBITRUM_USDC_NATIVE,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [walletAddr, GMX_SYNTHETICS_ROUTER],
    });
    if (current >= required) return true;

    console.log(`[useGmx] USDC allowance ${current} < required ${required} — approving MAX_UINT256`);
    const hash = await wc.writeContract({
      address: ARBITRUM_USDC_NATIVE,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [GMX_SYNTHETICS_ROUTER, MAX_UINT256],
      account: walletAddr,
    });
    const receipt = await pc.waitForTransactionReceipt({ hash, timeout: TX_TIMEOUT_MS });
    if (receipt.status !== 'success') throw new Error('USDC approve tx reverted');
    console.log(`[useGmx] USDC approve confirmed in block ${receipt.blockNumber}`);
    return true;
  }, [walletAddr, getWalletClient, getPublicClient]);

  /**
   * Find a V2-API-recognised position by base symbol + side. Used by
   * close/TP-SL paths that need the rich position fields (sizeInUsd,
   * indexName/poolName, collateralTokenAddress) the V2 /positions endpoint
   * exposes — the same source the panel already uses for display, so any
   * position the user can SEE we can ACT on.
   */
  const findV2Position = useCallback(async (apiSdk, target, isLong) => {
    const livePositions = await apiSdk.fetchPositionsInfo({ address: walletAddr, includeRelatedOrders: false });
    return (livePositions || []).find(p => {
      const base = String(p?.indexName || '').split(/[\/-]/)[0].trim().toUpperCase();
      return base === String(target || '').toUpperCase() && Boolean(p?.isLong) === isLong;
    });
  }, [walletAddr]);

  /**
   * Send a V2-prepared classic-mode tx via the user's wallet. Pulls the
   * Arbitrum walletClient, validates the payload shape, and forwards to
   * sendTransaction. Centralised so every write share the same error shape.
   */
  const sendPreparedClassicTx = useCallback(async (prepared) => {
    if (prepared.payloadType !== 'transaction' || !prepared.payload?.to) {
      throw new Error('GMX prepareOrder did not return a transaction payload');
    }
    const wc = getWalletClient(ARBITRUM_CHAIN_ID);
    if (!wc) throw new Error('Failed to build Arbitrum wallet client');
    return wc.sendTransaction({
      to: prepared.payload.to,
      data: prepared.payload.data,
      value: BigInt(prepared.payload.value ?? 0),
      account: walletAddr,
    });
  }, [walletAddr, getWalletClient]);

  /**
   * Open a market position on GMX V2 (Arbitrum).
   *
   * Cross-DEX shape (matches Pacifica/Avantis/Decibel):
   *   placeMarketOrder(symbol, side, collateralUsdc, slippage, leverage)
   *   - side: 'bid' (long) | 'ask' (short)  ──or── 'long'|'short' (Avantis-mode)
   *   - collateralUsdc: USDC margin to deposit (string, human units)
   *   - slippage: percent string ('0.5' = 0.5%)
   *   - leverage: integer multiplier
   *
   * Implementation: V2 `/orders/txns/prepare` (classic mode). Backend
   * resolves market, computes acceptable price + fees + execution fee,
   * returns a ready-to-broadcast `{to,data,value}` payload. We approve
   * USDC if needed, then send the tx.
   */
  const placeMarketOrder = useCallback(async (symbol, side, collateralUsdc, slippage, leverage) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your Arbitrum wallet first');
      await ensureChain(ARBITRUM_CHAIN_ID);

      const collateral = parseFloat(collateralUsdc);
      const lev = Math.max(1, Math.floor(Number(leverage) || 1));
      if (!Number.isFinite(collateral) || collateral <= 0) {
        throw new Error('Invalid collateral amount');
      }

      const apiSdk = await ensureSdk();
      const marketSymbol = findGmxMarketSymbol(marketsRawRef.current, symbol);
      if (!marketSymbol) throw new Error(`No GMX market for ${symbol}`);

      // payAmount = USDC margin in token base units (6 decimals).
      const payAmount = parseUnits(String(collateral), ARBITRUM_USDC_DECIMALS);
      // Position size = collateral * leverage, expressed in 30-decimal USD
      // (the unit GMX uses everywhere internally for USD math).
      const sizeUsd = parseUnits(String(collateral * lev), 30);
      const slippageBps = Math.max(1, Math.round(parseFloat(slippage || '0.5') * 100));
      const isLong = side === 'bid' || side === 'long';

      console.log(`[useGmx] placeMarketOrder (V2 classic) ${isLong ? 'LONG' : 'SHORT'} ${symbol} via ${marketSymbol}`,
        { payAmount: String(payAmount), sizeUsd: String(sizeUsd), leverage: lev, slippageBps });

      // First-trade approval. Idempotent: returns immediately if already
      // approved, otherwise pops one signature for an infinite approve.
      await ensureUsdcAllowance(payAmount);

      const prepared = await apiSdk.prepareOrder({
        kind: 'increase',
        symbol: marketSymbol,
        direction: isLong ? 'long' : 'short',
        orderType: 'market',
        size: sizeUsd,
        collateralToPay: { amount: payAmount, token: 'USDC' },
        collateralToken: 'USDC',
        slippage: slippageBps,
        mode: 'classic',
        from: walletAddr,
      });

      const hash = await sendPreparedClassicTx(prepared);
      console.log(`[useGmx] placeMarketOrder tx submitted: ${hash}`);

      // GMX V2 orders are 2-step: tx lands instantly, keeper executes within
      // 1-3s. Poll positions for ~10s to confirm, then refresh UI state.
      const start = Date.now();
      let confirmed = false;
      while (Date.now() - start < 10_000) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const list = await apiSdk.fetchPositionsInfo({ address: walletAddr });
          if ((list || []).some(p => {
            const base = String(p?.indexName || '').split(/[\/-]/)[0].trim().toUpperCase();
            return base === String(symbol).toUpperCase() && Boolean(p?.isLong) === isLong;
          })) {
            confirmed = true;
            break;
          }
        } catch { /* keep polling */ }
      }
      // Refresh UI state regardless — orders pending/executing both visible.
      fetchAccount();
      fetchPositions();
      fetchOrders();
      return confirmed ? { success: true, txHash: hash } : { success: true, pending: true, txHash: hash };
    } catch (e) {
      const msg = decodeWriteError(e, 'GMX market order failed');
      console.warn('[useGmx] placeMarketOrder error:', msg, e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [walletAddr, ensureChain, ensureSdk, ensureUsdcAllowance, sendPreparedClassicTx, fetchAccount, fetchPositions, fetchOrders]);

  /**
   * Limit order = increase order with `orderType: 'limit'` and a trigger
   * price. Collateral is deposited now; execution waits for the trigger.
   */
  const placeLimitOrder = useCallback(async (symbol, side, limitPrice, collateralUsdc, _tif, leverage) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your Arbitrum wallet first');
      await ensureChain(ARBITRUM_CHAIN_ID);

      const collateral = parseFloat(collateralUsdc);
      const lev = Math.max(1, Math.floor(Number(leverage) || 1));
      const limit = parseFloat(limitPrice);
      if (!Number.isFinite(collateral) || collateral <= 0) throw new Error('Invalid collateral');
      if (!Number.isFinite(limit) || limit <= 0) throw new Error('Invalid limit price');

      const apiSdk = await ensureSdk();
      const marketSymbol = findGmxMarketSymbol(marketsRawRef.current, symbol);
      if (!marketSymbol) throw new Error(`No GMX market for ${symbol}`);

      const payAmount = parseUnits(String(collateral), ARBITRUM_USDC_DECIMALS);
      const sizeUsd = parseUnits(String(collateral * lev), 30);
      // V2 prepareOrder takes the trigger price in 30-decimal USD (not the
      // contract's 30-indexDecimals format — backend handles that math).
      const triggerPriceBig = parseUnits(String(limit), 30);
      const isLong = side === 'bid' || side === 'long';

      await ensureUsdcAllowance(payAmount);

      const prepared = await apiSdk.prepareOrder({
        kind: 'increase',
        symbol: marketSymbol,
        direction: isLong ? 'long' : 'short',
        orderType: 'limit',
        size: sizeUsd,
        triggerPrice: triggerPriceBig,
        collateralToPay: { amount: payAmount, token: 'USDC' },
        collateralToken: 'USDC',
        slippage: 100,                 // 1% — limit fills tend to be tighter, room for safety
        mode: 'classic',
        from: walletAddr,
      });

      const hash = await sendPreparedClassicTx(prepared);
      console.log(`[useGmx] placeLimitOrder tx submitted: ${hash}`);

      fetchOrders();
      return { success: true, txHash: hash };
    } catch (e) {
      const msg = decodeWriteError(e, 'GMX limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [walletAddr, ensureChain, ensureSdk, ensureUsdcAllowance, sendPreparedClassicTx, fetchOrders]);

  /**
   * Cancel a pending order via V2 prepareCancelOrder + classic send.
   */
  const cancelOrder = useCallback(async (_symbol, orderId) => {
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your Arbitrum wallet first');
      if (!orderId) throw new Error('Missing order id');
      await ensureChain(ARBITRUM_CHAIN_ID);

      const apiSdk = await ensureSdk();
      const prepared = await apiSdk.prepareCancelOrder({
        orderId,
        mode: 'classic',
        from: walletAddr,
      });
      const hash = await sendPreparedClassicTx(prepared);
      console.log(`[useGmx] cancelOrder tx submitted: ${hash}`);
      fetchOrders();
      return { success: true, txHash: hash };
    } catch (e) {
      const msg = decodeWriteError(e, 'Cancel failed');
      setError(msg);
      return { error: msg };
    }
  }, [walletAddr, ensureChain, ensureSdk, sendPreparedClassicTx, fetchOrders]);

  // GMX V2 doesn't have an account-level "set leverage" call — leverage is
  // per-order (sizeDeltaUsd / collateralAmount). Surface a no-op success so
  // the panel's pre-trade leverage flush doesn't error; the leverage will be
  // applied when placeMarketOrder runs.
  const setLeverage = useCallback(async () => ({ success: true }), []);
  // V2 markets are isolated by design — toggle is a no-op too.
  const setMarginMode = setLeverage;

  /**
   * Close (or partially close) an open GMX position.
   *
   * Cross-DEX shape (matches Pacifica/Avantis):
   *   closePosition(symbol, side, sizePct = 100)
   *
   * Implementation: GMX V2 `/orders/txns/prepare` API in `classic` mode.
   * The endpoint returns a ready-to-broadcast `{ to, data, value }` payload
   * with the GMX backend resolving market lookup, decreaseAmounts, fees,
   * acceptable-price math server-side. We just send the tx via the user's
   * wallet — no client-side multicall, no V1 SDK marketsInfoData, no risk
   * of "Unsupported market" skips for newly listed pairs (SYRUP, etc.).
   *
   * The previous V1 path (`sdk.orders.createDecreaseOrder`) needed the V1
   * `PositionInfo` with embedded marketInfo. The V1 SDK silently skips any
   * market whose tokens aren't in its bundled config — at alpha-13 that's
   * every recent listing — so the position lookup returned undefined and
   * the close errored with "No open <side> <symbol> position".
   */
  const closePosition = useCallback(async (symbol, side, sizePct = 100) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your Arbitrum wallet first');
      await ensureChain(ARBITRUM_CHAIN_ID);

      const apiSdk = await ensureSdk();
      const isLong = side === 'bid' || side === 'long';
      const target = String(symbol || '').toUpperCase();
      const pos = await findV2Position(apiSdk, target, isLong);
      if (!pos) throw new Error(`No open ${isLong ? 'long' : 'short'} ${target} position`);

      // Build the full GMX market identifier the API expects, e.g.
      // "SYRUP/USD [WETH-USDC]". `indexName` is "SYRUP/USD", `poolName` is
      // "WETH-USDC" — straight concatenation works for every market.
      const marketSymbol = `${pos.indexName} [${pos.poolName}]`;

      // Map collateral address → symbol via the cached /tokens registry.
      // For the receive token we keep the same symbol so PnL settles in
      // the deposited collateral (matches "Receive USDC" UX everywhere).
      const tokenMap = await ensureTokenSymbolMap();
      const collateralSym = tokenMap[String(pos.collateralTokenAddress || '').toLowerCase()];
      if (!collateralSym) {
        throw new Error(`Unknown collateral token ${pos.collateralTokenAddress} (token registry stale)`);
      }

      const pct = Math.max(1, Math.min(100, Number(sizePct) || 100));
      // sizeInUsd is in 30-decimal USD. BigInt has no fractional ops, so
      // route the percentage through 1e4 basis points (100% → 10000 bps).
      const sizeBp = BigInt(Math.round(pct * 100));
      const closeSizeUsd = (BigInt(pos.sizeInUsd) * sizeBp) / 10_000n;

      console.log(`[useGmx] closePosition (V2 classic) ${isLong ? 'LONG' : 'SHORT'} ${target} ${pct}%`, {
        marketSymbol, sizeInUsd: String(pos.sizeInUsd), closeSizeUsd: String(closeSizeUsd), collateralToken: collateralSym,
      });

      const prepared = await apiSdk.prepareOrder({
        kind: 'decrease',
        symbol: marketSymbol,
        direction: isLong ? 'long' : 'short',
        orderType: 'market',
        size: closeSizeUsd,
        collateralToken: collateralSym,
        receiveToken: collateralSym,
        slippage: 100,                  // 1% — bps
        keepLeverage: false,            // Full close releases all collateral.
        mode: 'classic',
        from: walletAddr,
      });

      const hash = await sendPreparedClassicTx(prepared);
      console.log(`[useGmx] closePosition tx submitted: ${hash}`);

      // Keeper executes the decrease in 1-3s; refresh state and let polling
      // catch the close. We don't poll-confirm here because partial closes
      // don't make the position disappear, just shrink — relying on size
      // diff would be brittle.
      fetchAccount();
      fetchPositions();
      fetchOrders();
      return { success: true, txHash: hash };
    } catch (e) {
      const msg = decodeWriteError(e, 'GMX close failed');
      console.warn('[useGmx] closePosition error:', msg, e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [walletAddr, ensureChain, ensureSdk, ensureTokenSymbolMap, findV2Position, sendPreparedClassicTx, fetchAccount, fetchPositions, fetchOrders]);

  /**
   * Submit Take-Profit and/or Stop-Loss orders against an open position.
   * Each is a separate `createDecreaseOrder` with `isTrigger=true` and the
   * trigger order type (LimitDecrease for TP, StopLossDecrease for SL).
   *
   * Cross-DEX shape:
   *   setTpsl(symbol, side, takeProfit, stopLoss)
   *   - takeProfit / stopLoss: human price strings or null to skip
   */
  const setTpsl = useCallback(async (symbol, side, takeProfit, stopLoss) => {
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your Arbitrum wallet first');
      if (!takeProfit && !stopLoss) return { success: true };
      await ensureChain(ARBITRUM_CHAIN_ID);

      const apiSdk = await ensureSdk();
      // FuturesPanel passes the CLOSE side here, NOT the position direction —
      // it inverts pos.side because Pacifica's /positions/tpsl endpoint
      // needs the closing direction ('ask' to sell-close a long). Flip back
      // to find the actual position. closePosition in the same panel passes
      // pos.side directly (un-inverted), so this asymmetry is panel-side and
      // intentional. See FuturesPanel.jsx where setTpsl() is invoked.
      const isLong = side === 'ask' || side === 'sell' || side === 'short';
      const target = String(symbol || '').toUpperCase();
      const pos = await findV2Position(apiSdk, target, isLong);
      if (!pos) throw new Error(`No open ${target} position to attach TP/SL to`);

      const marketSymbol = `${pos.indexName} [${pos.poolName}]`;
      const tokenMap = await ensureTokenSymbolMap();
      const collateralSym = tokenMap[String(pos.collateralTokenAddress || '').toLowerCase()];
      if (!collateralSym) {
        throw new Error(`Unknown collateral token ${pos.collateralTokenAddress} (token registry stale)`);
      }
      const fullSizeUsd = BigInt(pos.sizeInUsd);

      // Submit TP and SL as two separate decrease orders. Each takes the
      // full position size (typical UX — most users set TP/SL to close the
      // whole position when triggered). V2 prepareOrder handles trigger
      // direction internally based on `direction` + `orderType`.
      const submitTrigger = async (priceStr, orderType) => {
        const triggerPriceBig = parseUnits(String(priceStr), 30);
        const prepared = await apiSdk.prepareOrder({
          kind: 'decrease',
          symbol: marketSymbol,
          direction: isLong ? 'long' : 'short',
          orderType,                      // 'take-profit' | 'stop-loss'
          size: fullSizeUsd,
          triggerPrice: triggerPriceBig,
          collateralToken: collateralSym,
          receiveToken: collateralSym,
          slippage: 100,                  // 1% — same as close path
          mode: 'classic',
          from: walletAddr,
        });
        const hash = await sendPreparedClassicTx(prepared);
        console.log(`[useGmx] setTpsl ${orderType} tx submitted: ${hash}`);
      };

      if (takeProfit) await submitTrigger(takeProfit, 'take-profit');
      if (stopLoss) await submitTrigger(stopLoss, 'stop-loss');

      fetchOrders();
      return { success: true };
    } catch (e) {
      const msg = decodeWriteError(e, 'GMX TP/SL failed');
      setError(msg);
      return { error: msg };
    }
  }, [walletAddr, ensureChain, ensureSdk, ensureTokenSymbolMap, findV2Position, sendPreparedClassicTx, fetchOrders]);

  // GMX is non-custodial — there's no "deposit to GMX" or "withdraw from
  // GMX" call: USDC stays in the user's wallet until an order locks it as
  // collateral. Surface a soft success so the cross-DEX deposit/withdraw
  // panel can no-op cleanly without confusing the user.
  const depositToPacifica = useCallback(async () => ({
    success: true, info: 'GMX is non-custodial — USDC stays in your wallet until you open a trade.',
  }), []);
  const withdraw = depositToPacifica;
  const activate = async () => ({});

  // ───── Trading rewards (gold) ─────
  // Mirrors useAvantis.claimGold: POST /api/trading/claim-gold with the
  // active wallet + dex. Server reads trade_history (populated by the
  // gmx-rewards-worker subsquid poller) and credits trading_gold + writes
  // gold_history row + dispatches onGodotMessage to update the in-game UI.
  // Idempotent server-side via trading_rewards.last_trade_id cursor.
  const claimGold = useCallback(async () => {
    if (!walletAddr) return null;
    const token = window._playerToken || (player && player.token) || null;
    if (!token) {
      console.warn('[useGmx] claimGold skipped — no token yet');
      return null;
    }
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'gmx' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[useGmx] claim-gold failed:', res.status, data?.error || data?.reason || '(no body)');
        return data;
      }
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      return data;
    } catch (e) {
      console.warn('[useGmx] claim-gold network error:', e?.message || e);
      return null;
    }
  }, [walletAddr, player]);

  // Publish the latest claimGold to the shared ref so the heartbeat
  // useEffect (declared earlier) can dispatch it. Mirrors useAvantis's
  // claimGoldRef.current = claimGold pattern.
  claimGoldRef.current = claimGold;

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    walletEth,
    leverageSettings: {},
    marginModes: {},
    dataReady,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    // Write methods — Phase 1 stubs.
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setTpsl,
    setLeverage,
    setMarginMode,
    depositToPacifica,
    withdraw,
    activate,
    claimGold,
    // GMX-specific extras + parity flags expected by FuturesPanel branches.
    isSelfCustody: true,
    isReady,
    walletMismatch,
    registeredEvmWallet,
    // Avantis-side flags read by the panel — undefined keeps the GMX branch
    // out of the referral / builder UIs we haven't designed for it yet.
    hasReferrer: null,
    linkOurReferrer: undefined,
  };
}
