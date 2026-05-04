// Avantis is NON-CUSTODIAL: the user's own EVM wallet signs every trade. The
// server is a read-only proxy for markets/prices/positions and a gold-reward
// indexer that reads Avantis Core API by address. No custodial privkey lives
// on the server for Avantis any more.
//
// The hook still exposes the same shape as usePacifica() so FuturesPanel can
// branch on useDex() with minimal call-site changes.

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatUnits, formatEther } from 'viem';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import {
  TRADING_ADDRESS, TRADING_STORAGE_ADDRESS, USDC_ADDRESS,
  ERC20_ABI, TRADING_ABI, ORDER_TYPE,
  priceToContract, leverageToContract, slippageToContract, collateralToRaw,
  sideIsBuy, fetchPriceUpdateData, fetchExecutionFeeWei, fetchNextTradeIndex,
  fetchLiveMarkPrice,
  applyReferralCode, fetchReferralCode,
  REFERRAL_CODE_BYTES32, REFERRAL_CODE_STRING,
  PRICE_SOURCING,
} from '../lib/avantisContract';

const FUTURES_API = '/api/futures';

// Max time we wait for a single on-chain tx receipt before surfacing a
// "pending too long" error. 90 s is comfortably above Base's 2 s block time
// and typical keeper execution window; going higher just leaves the UI
// spinner stuck if the tx was dropped from the mempool.
const TX_TIMEOUT_MS = 90_000;

// Unwraps viem revert errors to the most specific human-readable message
// available. Traders care about reasons like "SLIPPAGE_EXCEEDED" or
// "COLLATERAL_NOT_ACTIVE" — the top-level `shortMessage` often just says
// "execution reverted" and hides the real cause in `.cause.cause.data`.
function decodeTradeError(e, fallback) {
  if (!e) return fallback || 'Trade failed';
  // Dig into viem's nested cause chain (max 3 hops — openTrade reverts can be
  // wrapped in Simulate + Contract + Revert error classes).
  const chain = [e, e.cause, e.cause?.cause, e.cause?.cause?.cause].filter(Boolean);
  for (const err of chain) {
    // Contract-decoded revert name → most actionable.
    if (err.data?.errorName) return String(err.data.errorName);
    // Short reason string from Solidity `require(false, "...")`.
    const reason = err.reason || err.shortMessage;
    if (reason) {
      if (/slippage/i.test(reason)) return 'Price moved past slippage — widen slippage or retry';
      if (/allowance/i.test(reason)) return 'USDC allowance not settled yet — retry in a few seconds';
      if (/insufficient funds/i.test(reason)) return 'Insufficient ETH on Base for gas + execution fee';
      if (/user rejected|denied/i.test(reason)) return 'Signature cancelled';
      return String(reason);
    }
  }
  return String(e.message || fallback || 'Trade failed').slice(0, 300);
}

function shortAddress(addr) {
  const s = String(addr || '');
  return s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

// Wraps waitForTransactionReceipt with a timeout so dropped txs don't leave
// the UI spinner on forever. Throws a specific "pending too long" error the
// caller can show with a retry hint.
async function waitForReceiptWithTimeout(publicClient, hash) {
  try {
    return await publicClient.waitForTransactionReceipt({ hash, timeout: TX_TIMEOUT_MS });
  } catch (e) {
    if (/timed? ?out|WaitForTransactionReceipt/i.test(String(e?.message || e))) {
      const err = new Error('Transaction pending too long — check your wallet and retry');
      err.code = 'TX_TIMEOUT';
      throw err;
    }
    throw e;
  }
}

// ───── Normalisers ────────────────────────────────────────────────
// Avantis returns values scaled by 10^10 for prices/leverage and 10^6 for USDC.
// FuturesPanel expects Pacifica-shape — we flatten both into the same keys
// (symbol, side 'bid'|'ask', amount, entry_price, margin) so the UI doesn't
// need to know which DEX it came from.
function pairIndexToSymbol(pairIdx, markets) {
  const hit = Array.isArray(markets)
    ? markets.find(m => Number(m.index) === Number(pairIdx) || Number(m.pair_index) === Number(pairIdx))
    : null;
  if (hit) return hit.symbol || (hit.pair || '').split('/')[0].toUpperCase();
  return `#${pairIdx}`;
}

function asBool(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return false;
}

function normalizePosition(p, markets) {
  // Avantis Core API /user-data.positions shape (confirmed via live probe):
  //   { trader, pairIndex, index, buy, collateral, leverage, openPrice, sl, tp, ... }
  // All numeric fields are strings. Scalings:
  //   collateral      → raw 1e6 (USDC)
  //   leverage/openPrice/tp/sl → raw 1e10
  const pairIdx = p.pairIndex ?? p.pair_index ?? p.trade?.pairIndex;
  const isBuy = asBool(p.buy ?? p.isLong ?? p.trade?.buy ?? false);
  const symbol = p.symbol || pairIndexToSymbol(pairIdx, markets);
  const openPrice = Number(p.openPrice ?? p.trade?.openPrice ?? 0) / 1e10 || Number(p.entry_price ?? 0);
  // Collateral = USDC posted as margin. Flat field on current Core API.
  let collateral = 0;
  if (p.collateral !== undefined && p.collateral !== null) {
    collateral = Number(p.collateral) / 1e6;
  } else if (p.trade?.positionSizeUSDC !== undefined) {
    collateral = Number(p.trade.positionSizeUSDC) / 1e6;
  } else if (p.positionSizeUSDC !== undefined) {
    collateral = Number(p.positionSizeUSDC) / 1e6;
  }
  const leverage = Number(p.leverage ?? p.trade?.leverage ?? 0) / 1e10 || 1;
  const amountBase = openPrice > 0 ? (collateral * leverage) / openPrice : 0;
  const pnl = Number(p.pnl ?? p.pnlUSD ?? 0);
  return {
    symbol,
    side: isBuy ? 'bid' : 'ask',
    amount: String(amountBase),
    entry_price: String(openPrice || 0),
    margin: String(collateral),
    leverage: String(leverage),
    pnl: String(pnl),
    pair_index: Number(pairIdx),
    trade_index: Number(p.index ?? p.trade?.index ?? 0),
    is_isolated: true,
  };
}

function normalizeOrder(o, markets) {
  // Avantis Core API /user-data.limitOrders shape (verified live):
  //   { trader, pairIndex, index, buy, collateral, leverage, openPrice, ... }
  // Same flat scaling as positions: collateral raw 1e6, prices/leverage 1e10.
  const pairIdx = o.pairIndex ?? o.pair_index ?? o.trade?.pairIndex;
  const isBuy = asBool(o.buy ?? o.trade?.buy ?? false);
  const symbol = o.symbol || pairIndexToSymbol(pairIdx, markets);
  const openPrice = Number(o.openPrice ?? o.trade?.openPrice ?? 0) / 1e10 || Number(o.price ?? 0);
  let collateral = 0;
  if (o.collateral !== undefined && o.collateral !== null) {
    collateral = Number(o.collateral) / 1e6;
  } else if (o.positionSizeUSDC !== undefined) {
    collateral = Number(o.positionSizeUSDC) / 1e6;
  } else if (o.trade?.positionSizeUSDC !== undefined) {
    collateral = Number(o.trade.positionSizeUSDC) / 1e6;
  }
  const leverage = Number(o.leverage ?? o.trade?.leverage ?? 0) / 1e10 || 1;
  return {
    symbol,
    side: isBuy ? 'bid' : 'ask',
    amount: String(collateral),
    price: String(openPrice),
    leverage: String(leverage),
    order_type: 'LIMIT',
    tif: 'GTC',
    pair_index: Number(pairIdx),
    trade_index: Number(o.index ?? o.trade?.index ?? 0),
  };
}

// Avantis doesn't publish a per-pair "fundingRate" in the Pacifica sense —
// traders pay a **borrow fee** to LPs, scaled by open-interest utilization
// within [minBorrowFee, maxBorrowFee] bps/day. We compute the utilization-
// weighted hourly rate from the socket-api response so the FuturesPanel
// badge shows a meaningful number instead of the old flat 0.0000%.
//
//   minBF, maxBF  ← storagePairParams  (bps per day)
//   OI.long/short ← openInterest      (USDC notional)
//   pairMaxOI     ← cap               (USDC)
//   util_side = OI[side] / pairMaxOI
//   borrow_side = (minBF + (maxBF-minBF) * util_side)     (bps/day)
//   hourly_pct  = (borrow_side / 10000) / 24 * 100        (%)
//
// The badge reports the MAX of long/short hourly rate — that's the worst
// case a trader on the dominant side pays. Returned as a string to match
// the existing `funding_rate` contract so FuturesPanel keeps working.
function computeAvantisBorrowRatePct(pairData) {
  try {
    const sp = pairData?.storagePairParams || {};
    const minBF = Number(sp.minBorrowFee || 0);
    const rawMaxBF = Number(sp.maxBorrowFee || 0);
    if (!(rawMaxBF > 0) && !(minBF > 0)) return 0;
    // Avantis uses huge sentinel values for maxBorrowFee on illiquid pairs
    // (e.g. DOGE ships 10_000_000 bps = 100_000%/day). Linear interpolation
    // with that ceiling blows the displayed rate up to 5%/hour even at
    // <1% utilization, which is nonsense for a trader comparing pairs.
    // Cap the maxBF input at 500 bps/day (≈0.02%/h at 100% util) so the
    // badge stays in a human-readable range. Positions that actually
    // breach liquidity limits will still revert at the contract level.
    const SANE_MAX_BF_BPS_DAY = 500;
    const maxBF = Math.min(rawMaxBF, SANE_MAX_BF_BPS_DAY);
    const oi = pairData?.openInterest || {};
    const oiLong = Number(oi.long || 0);
    const oiShort = Number(oi.short || 0);
    const cap = Number(pairData?.pairMaxOI || 0);
    if (cap <= 0) return minBF / 10000 / 24 * 100;
    const utilLong = Math.min(1, oiLong / cap);
    const utilShort = Math.min(1, oiShort / cap);
    const rateLong = minBF + (maxBF - minBF) * utilLong;
    const rateShort = minBF + (maxBF - minBF) * utilShort;
    const maxBps = Math.max(rateLong, rateShort);
    // bps/day → %/hour. 1 bps = 0.01%, /24 = per hour.
    return maxBps / 10000 / 24 * 100;
  } catch { return 0; }
}

const FX_CODES = new Set([
  'USD', 'EUR', 'JPY', 'GBP', 'CAD', 'CHF', 'SEK', 'AUD', 'NZD', 'SGD',
  'TRY', 'CNH', 'INR', 'KRW', 'MXN', 'ZAR', 'BRL', 'IDR', 'TWD',
]);

function normalizeMarkets(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.pairs || raw?.data || []);
  return list.map((p, i) => {
    const from = String(p.from || p.base || '').toUpperCase();
    const to = String(p.to || p.quote || 'USD').toUpperCase();
    const isFxPair = FX_CODES.has(from) && FX_CODES.has(to) && from !== to;
    const symbol = from === 'USD' && to && to !== 'USD' ? `${from}${to}` : from;
    const fullPair = from === 'USD' && to && to !== 'USD'
      ? `${to}/${from}`
      : (from && to ? `${from}/${to}` : String(p.symbol || '').toUpperCase());
    const iconBase = isFxPair ? `${from}${to}` : (from === 'USD' && to && to !== 'USD' ? to : from);
    const maxLev = p.leverages?.maxLeverage ?? p.maxLeverage ?? p.max_leverage ?? 100;
    const minLev = p.pairMinLeverage ?? p.leverages?.minLeverage ?? 1;
    // Exact Pyth feed symbol (e.g. "Commodities.BRENTM6/USD") — TradingView
     // widget needs this to avoid guess-reconstructing from the short ticker.
    const pythSymbol = p?.feed?.attributes?.symbol || p?.pyth_symbol || null;
    // Prefer an explicit fundingRate if upstream ever publishes one; else
    // fall back to the computed borrow-fee proxy (as a % fraction per hour
    // — e.g. 0.0001 = 0.01%/hour — to match Pacifica's fundingRate shape).
    const explicit = p.fundingRate ?? p.funding_rate;
    const fundingRate = explicit != null
      ? String(explicit)
      : String(computeAvantisBorrowRatePct(p) / 100); // %→fraction for UI
    return {
      symbol,
      pair: fullPair,
      base: iconBase,
      icon_symbol: iconBase,
      quote: to,
      index: i,
      pair_index: p.index ?? i,
      pyth_symbol: pythSymbol,
      max_leverage: String(maxLev),
      min_leverage: String(minLev),
      lot_size: String(p.lotSize || p.lot_size || '0.0001'),
      tick_size: String(p.tickSize || p.tick_size || '0.01'),
      funding_rate: fundingRate,
      _raw: p,
    };
  });
}

function normalizePrices(raw) {
  const toSymbol = (pair) => {
    const parts = String(pair || '').toUpperCase().split('/');
    const [from, to] = [parts[0] || '', parts[1] || 'USD'];
    if (from === 'USD' && to && to !== 'USD') return `${from}${to}`;
    return from;
  };
  if (Array.isArray(raw)) {
    return raw.map(p => ({
      symbol: toSymbol(p.symbol || p.pair),
      mark: String(p.price || p.mark || 0),
      yesterday_price: String(p.yesterday_price || 0),
    }));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([pair, val]) => {
      const isObj = val && typeof val === 'object';
      return {
        symbol: toSymbol(pair),
        mark: String(isObj ? (val.mark ?? 0) : val),
        yesterday_price: String(isObj ? (val.yesterday_price ?? 0) : 0),
      };
    });
  }
  return [];
}

// ───── Hook ────────────────────────────────────────────────────────

export function useAvantis() {
  const { address: walletAddr, walletClient, publicClient, isReady, ensureChain } = useEvmWallet();
  // Gate polling / on-chain reads on the active DEX. FuturesPanel
  // instantiates BOTH hooks (Pacifica + Avantis) so it can switch between
  // them at render time, but if the user is on Pacifica we shouldn't be
  // hammering Base RPC for an Avantis account they aren't trading. Without
  // this guard, every Pacifica user with a Privy-created EVM embedded
  // wallet would burn their Base RPC quota (mainnet.base.org returns 429
  // after ~10 requests/sec) just by sitting on the FuturesPanel.
  const { dex } = useDex();
  const isActiveDex = dex === 'avantis';

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
  // Referral linkage. `hasReferrer` is `true` once we confirm the wallet is
  // linked to our code, `false` if linked to someone else / no code, `null`
  // while the read is still in flight so the UI can show a neutral state.
  const [hasReferrer, setHasReferrer] = useState(null);
  const marketsRef = useRef([]);
  // Ref-held reference to `claimGold` so early-declared callbacks
  // (placeMarketOrder etc.) can fire a claim after a successful trade
  // without forward-referencing the useCallback. The ref is updated at the
  // end of the hook body to the latest-render claimGold closure.
  const claimGoldRef = useRef(null);

  // Reactive player token — `window._playerToken` alone can be briefly null
  // during logout transitions or not-yet-set right after a Farcaster auto-
  // login, causing reportTrade/claimGold to silently 401. Read from the
  // GodotProvider's player state (authoritative) and keep it in a ref so
  // the existing `[walletAddr]` deps don't need to include token churn.
  const player = usePlayer();
  const tokenRef = useRef(null);
  useEffect(() => {
    tokenRef.current = player?.token || null;
  }, [player?.token]);
  const registeredWallet = typeof player?.wallet === 'string' ? player.wallet.trim() : '';
  const registeredEvmWallet = /^0x[0-9a-fA-F]{40}$/.test(registeredWallet)
    ? registeredWallet.toLowerCase()
    : null;
  const activeEvmWallet = walletAddr ? String(walletAddr).toLowerCase() : null;
  const walletMismatch = !!(registeredEvmWallet && activeEvmWallet && registeredEvmWallet !== activeEvmWallet);
  const scheduleClaim = useCallback((delayMs = 2500) => {
    const t = setTimeout(() => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn();
    }, delayMs);
    return () => clearTimeout(t);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  // Session generation token — bumped whenever the wallet address changes.
  // Every trade function captures its starting generation and checks it after
  // each await. If the wallet switched mid-flight (Privy logout, MetaMask
  // account change, FC frame background), the in-flight closure bails out
  // cleanly instead of signing with a stale provider or poisoning state for
  // the new wallet. Ref so updates don't trigger re-renders.
  const walletGenRef = useRef(0);
  useEffect(() => {
    walletGenRef.current += 1;
  }, [walletAddr]);

  // In-flight guard for `ensureApproval`. A double-click on LONG otherwise
  // triggers two parallel approval promises → two MM popups → wasted gas.
  // The second caller awaits the first's result.
  const approvalInFlightRef = useRef(null);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 10000);
    return () => clearTimeout(t);
  }, [error]);

  // ───── Public market data (server proxy, no auth) ─────
  const fetchMarkets = useCallback(async () => {
    try {
      const r = await fetch(`${FUTURES_API}/markets?dex=avantis`);
      const j = await r.json();
      const list = normalizeMarkets(j?.pairs || j?.data || j);
      setMarkets(list);
      marketsRef.current = list;
    } catch {}
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const r = await fetch(`${FUTURES_API}/prices?dex=avantis`);
      const j = await r.json();
      const fresh = normalizePrices(j?.prices || j?.data || j);
      setPrices(prev => {
        if (!fresh.length) return prev;
        const byKey = new Map((prev || []).map(p => [p.symbol, p]));
        for (const p of fresh) byKey.set(p.symbol, p);
        return Array.from(byKey.values());
      });
    } catch {}
  }, []);

  // ───── Account data (server proxy — read-only by address) ─────
  // Server resolves these from Avantis Core API /user-data?trader=<addr>.
  // No auth required — the address is public anyway.
  const fetchAccount = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const r = await fetch(`${FUTURES_API}/account?dex=avantis&address=${walletAddr}`);
      const j = await r.json();
      setAccount(j);
    } catch {}
  }, [walletAddr]);

  const fetchPositions = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const r = await fetch(`${FUTURES_API}/positions?dex=avantis&address=${walletAddr}`);
      const j = await r.json();
      const raw = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      const list = raw.map(p => normalizePosition(p, marketsRef.current));
      setPositions(list);
      setDataReady(true);
      window._openPositionsCount = list.length;
    } catch {}
  }, [walletAddr]);

  const fetchOrders = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const r = await fetch(`${FUTURES_API}/orders?dex=avantis&address=${walletAddr}`);
      const j = await r.json();
      const raw = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      const list = raw.map(o => normalizeOrder(o, marketsRef.current));
      setOrders(list);
    } catch {}
  }, [walletAddr]);

  // ───── Referral linkage ─────
  // Reads the Avantis Referral registry to see if the current wallet is
  // already linked to our code. Called once when the wallet becomes known
  // and again after the user submits the linkage tx.
  const fetchReferralStatus = useCallback(async () => {
    if (!walletAddr || !publicClient) { setHasReferrer(null); return null; }
    try {
      const storedCode = await fetchReferralCode(publicClient, walletAddr);
      const expected = String(REFERRAL_CODE_BYTES32).toLowerCase();
      const actual = storedCode ? String(storedCode).toLowerCase() : null;
      const linked = actual === expected;
      setHasReferrer(linked);
      if (actual && actual !== expected) {
        // User is linked to SOMETHING, but not our code. Could be a prior
        // referral from another dApp, or a stale state. Log so we can
        // diagnose without asking the user for BaseScan URLs.
        console.info('[avantis] referral: wallet linked to', actual, '≠', expected, `(ours: "${REFERRAL_CODE_STRING}")`);
      }
      return actual;
    } catch (e) {
      console.warn('[avantis] fetchReferralStatus failed:', e?.message || e);
      setHasReferrer(null);
      return null;
    }
  }, [walletAddr, publicClient]);

  // Applies our referral code. Single wallet signature; server-free. Idempotent.
  // After the tx lands we re-read the state so the UI can dismiss the prompt.
  //
  // Base RPC nodes can lag a few hundred ms behind the block in which the
  // tx was mined, so the immediate readContract after waitForTransactionReceipt
  // often returns the PRE-tx value. Retry the read up to 6× with 1s spacing;
  // if we STILL don't see our code after ~6s, stop and surface it — likely
  // means the tx actually failed to update state (rare, but e.g. a contract
  // upgrade or RPC routing issue).
  const linkOurReferrer = useCallback(async () => {
    setError(null);
    try {
      if (!walletClient || !walletAddr) throw new Error('Wallet not connected');
      await ensureChain();
      // Precheck: if our code isn't registered on-chain, the contract will
      // revert with "Invalid params" — surface that BEFORE MetaMask prompts
      // for a signature the user would otherwise reject/blame on gas.
      const hash = await applyReferralCode(walletClient, publicClient);
      console.info('[avantis] referral tx submitted:', hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.info('[avantis] referral tx mined:', { status: receipt.status, block: receipt.blockNumber?.toString() });
      if (receipt.status !== 'success') {
        setError('Referral tx reverted on-chain');
        return { error: 'Referral tx reverted on-chain' };
      }

      // Poll on-chain read until we see our code (or give up).
      const expected = String(REFERRAL_CODE_BYTES32).toLowerCase();
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, i === 0 ? 500 : 1000));
        const actual = await fetchReferralStatus();
        if (actual && String(actual).toLowerCase() === expected) {
          console.info('[avantis] referral linkage confirmed on-chain');
          return { tx_hash: hash, status: 'linked' };
        }
      }
      // Mined successfully but read-back mismatched — strange. Leave
      // hasReferrer at whatever the last fetch returned.
      console.warn('[avantis] referral read-back never showed our code after 6 attempts — check BaseScan');
      return { tx_hash: hash, status: 'submitted_but_unverified' };
    } catch (e) {
      const msg = decodeTradeError(e, 'Referral link failed');
      // Distinguish three failure modes so the UI can react differently:
      //   REFERRAL_CODE_NOT_REGISTERED → admin-side problem, dev-facing hint
      //   REFERRAL_PRECHECK_RPC_FAILED → transient, suggest retry
      //   anything else → normal error surface
      if (e?.code === 'REFERRAL_CODE_NOT_REGISTERED') {
        console.warn('[avantis] referral code not registered on-chain yet:', msg);
        setError(msg.slice(0, 300));
        return { error: msg, code: 'REFERRAL_CODE_NOT_REGISTERED' };
      }
      if (e?.code === 'REFERRAL_PRECHECK_RPC_FAILED') {
        console.warn('[avantis] referral precheck RPC failed:', msg);
        setError('Network error verifying referral — try again in a moment');
        return { error: msg, code: 'REFERRAL_PRECHECK_RPC_FAILED' };
      }
      console.warn('[avantis] linkOurReferrer error:', msg);
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    }
  }, [walletClient, walletAddr, publicClient, ensureChain, fetchReferralStatus]);

  // ───── Wallet balances — direct on-chain read ─────
  // USDC + ETH of the user's OWN wallet. No server round-trip.
  const fetchBalance = useCallback(async () => {
    if (!walletAddr || !publicClient) return;
    try {
      const [usdcRaw, ethRaw] = await Promise.all([
        publicClient.readContract({
          address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
          args: [walletAddr],
        }),
        publicClient.getBalance({ address: walletAddr }),
      ]);
      setWalletUsdc(Number(formatUnits(usdcRaw, 6)));
      setWalletEth(Number(formatEther(ethRaw)));
    } catch (e) {
      console.warn('[avantis] fetchBalance failed:', e?.message || e);
    }
  }, [walletAddr, publicClient]);

  // ───── Report a trade to server for backwards-compatible telemetry ─────
  // Rewards are credited only after the server worker sees the trade in
  // Avantis Core API, so this endpoint cannot mint gold from client payloads.
  const reportTrade = useCallback(async ({ tx_hash, symbol, side, amount, leverage, price, order_type = 'market', dedup_key }) => {
    if (!walletAddr) return;
    try {
      const notional = Number(amount) * Number(leverage);
      const token = tokenRef.current || window._playerToken;
      if (!token) {
        // Worker polling will still pick up verified trades; log only so token
        // propagation issues are visible in DevTools.
        console.warn('[useAvantis] reportTrade skipped — no token yet');
        return;
      }
      const res = await fetch(`${FUTURES_API}/trade-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dex': 'avantis', 'x-token': token },
        body: JSON.stringify({
          address: walletAddr, tx_hash, symbol, side,
          amount: Number(amount), leverage: Number(leverage), price: price || 0,
          notional_usd: notional, order_type,
          // Optional deterministic dedup key. Server uses it as client_order_id
          // so the rewards-worker's later poll (using the same format) dedupes
          // via UNIQUE index instead of landing a duplicate row.
          ...(dedup_key ? { dedup_key } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.warn('[useAvantis] trade-report failed:', res.status, body?.error || '(no body)');
      }
    } catch (e) {
      console.warn('[useAvantis] trade-report network error:', e?.message || e);
    }
  }, [walletAddr]);

  // ───── Client-side approval helper ─────
  //
  // Approves MAX_UINT256 (standard DEX practice) so the user sees ONE wallet
  // popup in their lifetime on this DEX, and never again. Previously we
  // approved `amountRaw + 1%`, which forced a fresh approval every time the
  // collateral grew — and, worse, triggered "ERC20: transfer amount exceeds
  // allowance" inside Farcaster's tx simulator when the approve receipt
  // hadn't propagated to FC's RPC cache before the openTrade simulation ran.
  // Max-approval eliminates both failure modes.
  const ensureApproval = useCallback(async (amountRaw) => {
    if (!walletClient || !walletAddr || !publicClient) throw new Error('Wallet not connected');
    // Concurrency guard: if an approval is already in flight for this wallet,
    // await its result instead of firing a parallel approve tx. Second clicker
    // gets the first one's hash (or null) instead of a duplicate popup.
    if (approvalInFlightRef.current) {
      return approvalInFlightRef.current;
    }
    const run = (async () => {
      let allowance;
      try {
        allowance = await publicClient.readContract({
          address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
          args: [walletAddr, TRADING_STORAGE_ADDRESS],
        });
      } catch {
        throw new Error('Could not read USDC allowance — RPC unavailable');
      }
      if (allowance >= amountRaw) return null;
      // uint256 max — the contract can never transfer more than the wallet
      // balance anyway, so "infinite" is bounded in practice by the user's
      // funds. Matches Uniswap / Aave / every major EVM DEX default.
      const MAX_UINT256 = (1n << 256n) - 1n;
      const hash = await walletClient.writeContract({
        address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
        args: [TRADING_STORAGE_ADDRESS, MAX_UINT256],
      });
      await waitForReceiptWithTimeout(publicClient, hash);
      // Poll until the freshly-approved allowance is visible to the RPC we're
      // reading from (Farcaster's provider can lag 1-2 blocks behind the
      // executor that mined the tx). If the poll exhausts without success,
      // THROW so the caller aborts instead of firing an openTrade that would
      // pre-simulate-revert with "exceeds allowance".
      let visible = false;
      for (let i = 0; i < 8; i++) {
        try {
          const cur = await publicClient.readContract({
            address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
            args: [walletAddr, TRADING_STORAGE_ADDRESS],
          });
          if (cur >= amountRaw) { visible = true; break; }
        } catch { /* transient RPC hiccup — keep polling */ }
        await new Promise(r => setTimeout(r, 500));
      }
      if (!visible) {
        throw new Error('USDC approval not yet visible on-chain — retry in a few seconds');
      }
      return hash;
    })();
    approvalInFlightRef.current = run;
    try {
      return await run;
    } finally {
      approvalInFlightRef.current = null;
    }
  }, [walletClient, walletAddr, publicClient]);

  // ───── Guards ─────
  const requireWallet = useCallback(() => {
    if (!isReady || !walletClient || !walletAddr) {
      throw new Error('Connect your Base wallet to trade on Avantis');
    }
    if (walletMismatch) {
      throw new Error(
        `Connected wallet ${shortAddress(walletAddr)} does not match this game account (${shortAddress(registeredEvmWallet)}). ` +
        'Switch wallet or log in with the connected wallet first.'
      );
    }
  }, [isReady, walletClient, walletAddr, walletMismatch, registeredEvmWallet]);

  // ───── Place market order ─────
  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage, leverage) => {
    setLoading(true);
    setError(null);
    // Capture wallet generation — if it changes during any await below, the
    // user switched wallets mid-trade; bail out cleanly instead of signing
    // with a stale provider.
    const gen = walletGenRef.current;
    const checkGen = () => {
      if (walletGenRef.current !== gen) {
        const err = new Error('Wallet changed during trade — please retry');
        err.code = 'WALLET_CHANGED';
        throw err;
      }
    };
    try {
      requireWallet();
      await ensureChain(); checkGen();

      const collateralUsdc = Number(amount);
      if (!Number.isFinite(collateralUsdc) || collateralUsdc <= 0) throw new Error('Invalid amount');
      const levNum = Math.min(Math.max(Number(leverage) || 1, 1), 1000);

      const market = marketsRef.current.find(m => m.symbol === symbol);
      if (!market) throw new Error(`Unknown market: ${symbol}`);
      const pairIndex = Number(market.pair_index);

      const positionSizeUSDC = collateralToRaw(collateralUsdc);
      // Min-notional $100 pre-check (saves a wallet popup + revert).
      if (collateralUsdc * levNum < 100) {
        throw new Error(`Avantis min position size = $100 (yours: $${(collateralUsdc * levNum).toFixed(2)})`);
      }

      // Balance sanity re-check: the user may have spent USDC in another tab
      // between slider adjustment and click, or a tx inclusion reduced it.
      // Fail fast with a helpful error instead of letting transferFrom revert.
      try {
        const liveUsdcRaw = await publicClient.readContract({
          address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
          args: [walletAddr],
        });
        if (liveUsdcRaw < positionSizeUSDC) {
          const have = Number(liveUsdcRaw) / 1e6;
          throw new Error(`Insufficient USDC: need $${collateralUsdc.toFixed(2)}, have $${have.toFixed(2)}`);
        }
      } catch (balErr) {
        if (/Insufficient USDC/.test(String(balErr?.message))) throw balErr;
        // RPC failures aren't fatal — let transferFrom do final arbitration.
      }
      checkGen();

      await ensureApproval(positionSizeUSDC); checkGen();

      const tradeIndex = await fetchNextTradeIndex(walletAddr, pairIndex); checkGen();
      // Re-fetch execFee JUST before signing — if fetched earlier it could be
      // stale after the approve+poll block (gas can spike in those seconds).
      const execFee = await fetchExecutionFeeWei(publicClient); checkGen();
      const isBuy = sideIsBuy(side);

      // Avantis keeper auto-cancels MARKET trades that arrive with openPrice=0
      // (verified live). Pass the current Pyth price as the executor reference.
      const livePrice = await fetchLiveMarkPrice(pairIndex); checkGen();
      if (!(livePrice > 0)) throw new Error('Price feed unavailable — try again in a moment.');

      const tradeInput = {
        trader: walletAddr,
        pairIndex: BigInt(pairIndex),
        index: BigInt(tradeIndex),
        initialPosToken: 0n,
        positionSizeUSDC,
        openPrice: priceToContract(livePrice),
        buy: isBuy,
        leverage: leverageToContract(levNum),
        tp: 0n,
        sl: 0n,
        timestamp: 0n,
      };

      const hash = await walletClient.writeContract({
        address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'openTrade',
        args: [tradeInput, ORDER_TYPE.MARKET, slippageToContract(slippage)],
        value: execFee,
      });
      const receipt = await waitForReceiptWithTimeout(publicClient, hash);
      // Guard against reverted trades still nudging the server's reward flow.
      const ok = receipt.status === 'success';
      if (!ok) {
        // The tx mined but reverted. Refresh state so UI doesn't show a
        // non-existent position; don't claim gold for a failed trade.
        fetchPositions();
        fetchBalance();
        return { tx_hash: hash, status: 'failed', error: 'Trade reverted on-chain' };
      }

      // Deterministic dedup_key: per (wallet, pair, tradeIndex). Prevents the
      // server-futures worker from inserting a duplicate row for this open.
      const openDedup = `avantis:open:${walletAddr.toLowerCase()}:${pairIndex}:${tradeIndex}`;
      // Await reportTrade so the server-side /trade-report write lands before
      // scheduleClaim fires — closes the race where a slow POST left
      // claim-gold reading an empty futures.db.
      await reportTrade({
        tx_hash: hash, symbol, side: isBuy ? 'long' : 'short',
        amount: collateralUsdc, leverage: levNum, order_type: 'market',
        dedup_key: openDedup,
      });

      fetchPositions();
      fetchAccount();
      fetchBalance();
      scheduleClaim();
      return { tx_hash: hash, status: 'submitted' };
    } catch (e) {
      const msg = decodeTradeError(e, 'Trade failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    } finally {
      setLoading(false);
    }
  }, [walletClient, walletAddr, publicClient, ensureChain, ensureApproval, requireWallet, reportTrade, fetchPositions, fetchAccount, fetchBalance, scheduleClaim]);

  // ───── Place limit order ─────
  // `slippage` added as optional 7th arg (percent, e.g. 0.5). Defaults to 1%
  // to match previous hardcoded behaviour — callers that already pass 6
  // args continue to work unchanged. Clamped to [0.1%, 50%] inside
  // `slippageToContract`.
  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif, leverage, slippage = 1) => {
    setLoading(true);
    setError(null);
    const gen = walletGenRef.current;
    const checkGen = () => {
      if (walletGenRef.current !== gen) {
        const err = new Error('Wallet changed during order — please retry');
        err.code = 'WALLET_CHANGED';
        throw err;
      }
    };
    try {
      requireWallet();
      await ensureChain(); checkGen();

      const collateralUsdc = Number(amount);
      const priceNum = Number(price);
      if (!Number.isFinite(collateralUsdc) || collateralUsdc <= 0) throw new Error('Invalid amount');
      if (!Number.isFinite(priceNum) || priceNum <= 0) throw new Error('Invalid limit price');
      const levNum = Math.min(Math.max(Number(leverage) || 1, 1), 1000);

      const market = marketsRef.current.find(m => m.symbol === symbol);
      if (!market) throw new Error(`Unknown market: ${symbol}`);
      const pairIndex = Number(market.pair_index);

      const positionSizeUSDC = collateralToRaw(collateralUsdc);
      if (collateralUsdc * levNum < 100) {
        throw new Error(`Avantis min position size = $100 (yours: $${(collateralUsdc * levNum).toFixed(2)})`);
      }

      // Sanity-check limit price against live market to avoid the trader
      // accidentally placing a short LIMIT below market (which fills worse
      // than a market order) or a long LIMIT above market (same trap).
      try {
        const livePrice = await fetchLiveMarkPrice(pairIndex); checkGen();
        if (livePrice > 0) {
          const isBuyProbe = sideIsBuy(side);
          const drift = Math.abs(priceNum - livePrice) / livePrice;
          if (isBuyProbe && priceNum > livePrice * 1.01 && drift > 0.01) {
            throw new Error(`Long limit $${priceNum} is above market $${livePrice.toFixed(2)} — use MARKET or lower the price`);
          }
          if (!isBuyProbe && priceNum < livePrice * 0.99 && drift > 0.01) {
            throw new Error(`Short limit $${priceNum} is below market $${livePrice.toFixed(2)} — use MARKET or raise the price`);
          }
        }
      } catch (priceCheckErr) {
        if (/above market|below market/.test(String(priceCheckErr?.message))) throw priceCheckErr;
        // Ignore price-feed transient failures — contract is still the source of truth.
      }

      // Balance re-check (same reasoning as placeMarketOrder).
      try {
        const liveUsdcRaw = await publicClient.readContract({
          address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
          args: [walletAddr],
        });
        if (liveUsdcRaw < positionSizeUSDC) {
          const have = Number(liveUsdcRaw) / 1e6;
          throw new Error(`Insufficient USDC: need $${collateralUsdc.toFixed(2)}, have $${have.toFixed(2)}`);
        }
      } catch (balErr) {
        if (/Insufficient USDC/.test(String(balErr?.message))) throw balErr;
      }
      checkGen();

      await ensureApproval(positionSizeUSDC); checkGen();

      const tradeIndex = await fetchNextTradeIndex(walletAddr, pairIndex); checkGen();
      const execFee = await fetchExecutionFeeWei(publicClient); checkGen();
      const isBuy = sideIsBuy(side);

      const tradeInput = {
        trader: walletAddr,
        pairIndex: BigInt(pairIndex),
        index: BigInt(tradeIndex),
        initialPosToken: 0n,
        positionSizeUSDC,
        openPrice: priceToContract(priceNum),
        buy: isBuy,
        leverage: leverageToContract(levNum),
        tp: 0n,
        sl: 0n,
        timestamp: 0n,
      };

      const hash = await walletClient.writeContract({
        address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'openTrade',
        args: [tradeInput, ORDER_TYPE.LIMIT, slippageToContract(slippage)],
        value: execFee,
      });
      const receipt = await waitForReceiptWithTimeout(publicClient, hash);
      if (receipt.status !== 'success') {
        fetchOrders();
        fetchBalance();
        return { tx_hash: hash, status: 'failed', error: 'Limit order reverted on-chain' };
      }

      const openDedup = `avantis:open:${walletAddr.toLowerCase()}:${pairIndex}:${tradeIndex}`;
      await reportTrade({
        tx_hash: hash, symbol, side: isBuy ? 'long' : 'short',
        amount: collateralUsdc, leverage: levNum, price: priceNum, order_type: 'limit',
        dedup_key: openDedup,
      });

      fetchOrders();
      fetchAccount();
      fetchBalance();
      scheduleClaim();
      return { tx_hash: hash, status: 'open' };
    } catch (e) {
      const msg = decodeTradeError(e, 'Limit order failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    } finally {
      setLoading(false);
    }
  }, [walletClient, walletAddr, publicClient, ensureChain, ensureApproval, requireWallet, reportTrade, fetchOrders, fetchAccount, fetchBalance, scheduleClaim]);

  // ───── Close position (full or partial) ─────
  const closePosition = useCallback(async (symbol, side, amount, pairIndex, tradeIndex) => {
    setLoading(true);
    setError(null);
    const gen = walletGenRef.current;
    const checkGen = () => {
      if (walletGenRef.current !== gen) {
        const err = new Error('Wallet changed during close — please retry');
        err.code = 'WALLET_CHANGED';
        throw err;
      }
    };
    try {
      requireWallet();
      await ensureChain(); checkGen();
      if (pairIndex === undefined || tradeIndex === undefined) throw new Error('Missing pair/trade index');

      const amt = Number(amount);
      // $0.01 floor — anything smaller is dust that reverts on-chain.
      if (!Number.isFinite(amt) || amt < 0.01) throw new Error('Close amount must be at least $0.01');
      const amountRaw = collateralToRaw(amt);

      // Look up the position to pre-validate partial closes. Avantis rejects
      // closes that leave a position with notional below its pair min ($100).
      const posMatch = positions.find(p =>
        Number(p.pair_index) === Number(pairIndex) &&
        Number(p.trade_index) === Number(tradeIndex)
      );
      const closeLeverage = posMatch ? Number(posMatch.leverage) || 1 : 1;
      if (posMatch) {
        const posMargin = Number(posMatch.margin) || 0;
        const leftoverMargin = posMargin - amt;
        const leftoverNotional = leftoverMargin * closeLeverage;
        // Leftover above $0 but below min → contract reverts. Warn client-side.
        if (leftoverMargin > 0.0001 && leftoverNotional < 100) {
          throw new Error(
            `Partial close would leave $${leftoverNotional.toFixed(2)} notional — below Avantis $100 minimum. ` +
            `Close fully or reduce by a smaller amount.`
          );
        }
      }

      const execFee = await fetchExecutionFeeWei(publicClient); checkGen();

      const hash = await walletClient.writeContract({
        address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'closeTradeMarket',
        args: [BigInt(pairIndex), BigInt(tradeIndex), amountRaw],
        value: execFee,
      });
      const receipt = await waitForReceiptWithTimeout(publicClient, hash);

      // Refuse to credit rewards / fire reportTrade if the tx reverted.
      // Previously any mined-but-failed close still nudged gold claim and
      // poisoned server-side state.
      if (receipt.status !== 'success') {
        fetchPositions();
        fetchBalance();
        return { tx_hash: hash, status: 'failed', error: 'Close reverted on-chain' };
      }

      // Client-side trade report tagged with 'close_long'/'close_short' so
      // the task verifier's classifyTrade() treats it as independent volume.
      // dedup_key (wallet+pair+idx+"close:") lets the worker's later poll
      // dedupe via UNIQUE index instead of inserting a duplicate.
      const closeSide = String(side || '').toLowerCase();
      const closedSideLabel = closeSide === 'long' || closeSide === 'bid' ? 'close_long' : 'close_short';
      const dedupKey = `avantis:close:${walletAddr.toLowerCase()}:${pairIndex}:${tradeIndex}`;
      await reportTrade({
        tx_hash: hash, symbol, side: closedSideLabel,
        amount: amt, leverage: closeLeverage, order_type: 'close',
        dedup_key: dedupKey,
      });

      fetchPositions();
      fetchAccount();
      fetchBalance();
      scheduleClaim(2500);
      scheduleClaim(8000);
      return { tx_hash: hash, status: 'closed' };
    } catch (e) {
      const msg = decodeTradeError(e, 'Close failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    } finally {
      setLoading(false);
    }
  }, [walletClient, walletAddr, publicClient, ensureChain, requireWallet, fetchPositions, fetchAccount, fetchBalance, scheduleClaim, reportTrade, positions]);

  // ───── Cancel limit order ─────
  const cancelOrder = useCallback(async (_symbol, _orderId, pairIndex, tradeIndex) => {
    try {
      requireWallet();
      await ensureChain();
      if (pairIndex === undefined || tradeIndex === undefined) throw new Error('Missing pair/trade index');
      const hash = await walletClient.writeContract({
        address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'cancelOpenLimitOrder',
        args: [BigInt(pairIndex), BigInt(tradeIndex)],
      });
      await waitForReceiptWithTimeout(publicClient, hash);
      fetchOrders();
      return { tx_hash: hash, status: 'cancelled' };
    } catch (e) {
      const msg = decodeTradeError(e, 'Cancel failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    }
  }, [walletClient, publicClient, ensureChain, requireWallet, fetchOrders]);

  // ───── Update TP/SL ─────
  const setTpsl = useCallback(async (_symbol, _side, takeProfit, stopLoss, pairIndex, tradeIndex) => {
    try {
      requireWallet();
      await ensureChain();
      if (pairIndex === undefined || tradeIndex === undefined) throw new Error('Missing pair/trade index');

      const { priceUpdateData } = await fetchPriceUpdateData(pairIndex);
      if (!priceUpdateData || priceUpdateData === '0x') {
        throw new Error('Price feed unavailable — try again in a moment.');
      }
      const tpContract = Number(takeProfit) > 0 ? priceToContract(Number(takeProfit)) : 0n;
      const slContract = Number(stopLoss) > 0 ? priceToContract(Number(stopLoss)) : 0n;

      // 6-arg signature (contract was upgraded). `priceSourcing=0` = Hermes,
      // matching the feed-v3 URL we fetched `priceUpdateData` from. `value`
      // is the 1-wei Pyth fee sentinel — NOT the 0.00035 ETH execution fee
      // (updateTpAndSl runs inline with the price update, no keeper queue).
      // Arg order verified against Avantis official SDK
      // (avantis_trader_sdk/rpc/trade.py): updateTpAndSl(pair, trade,
      // stop_loss, take_profit, [price_update_data], sourcing). Keep
      // slContract AT POSITION 3 and tpContract AT POSITION 4.
      const hash = await walletClient.writeContract({
        address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'updateTpAndSl',
        args: [BigInt(pairIndex), BigInt(tradeIndex), slContract, tpContract, [priceUpdateData], PRICE_SOURCING.HERMES],
        value: 1n,
      });
      await waitForReceiptWithTimeout(publicClient, hash);
      fetchPositions();
      return { tx_hash: hash, status: 'updated' };
    } catch (e) {
      const msg = decodeTradeError(e, 'TP/SL update failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    }
  }, [walletClient, publicClient, ensureChain, requireWallet, fetchPositions]);

  // Leverage + margin mode are per-trade on Avantis (no account-level API).
  // Silent no-ops keep the FuturesPanel interface uniform with Pacifica.
  const setLeverage = useCallback(async () => ({ ok: true }), []);
  const setMarginMode = useCallback(async () => ({ ok: true }), []);

  // Deposit/withdraw are N/A in non-custodial mode — the user's own wallet
  // IS the trading wallet. These are kept as no-ops so UI calls don't blow up
  // during the transition.
  const depositToPacifica = useCallback(async () => ({ ok: true }), []);
  const withdraw = useCallback(async () => ({ error: 'N/A in non-custodial mode' }), []);
  const activate = useCallback(async () => ({ success: true }), []);

  // Server-verified gold rewards. Server reads on-chain trades for this
  // address and credits notional-based gold. Still uses the main /api/trading
  // endpoint for the reward accounting.
  const claimGold = useCallback(async () => {
    if (!walletAddr) return null;
    const token = tokenRef.current || window._playerToken;
    if (!token) {
      console.warn('[useAvantis] claimGold skipped — no token yet (account still loading)');
      return null;
    }
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'avantis' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[useAvantis] claim-gold failed:', res.status, data?.error || data?.reason || '(no body)');
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
      console.warn('[useAvantis] claim-gold network error:', e?.message || e);
      return null;
    }
  }, [walletAddr]);

  // Publish the latest claimGold to the shared ref so earlier-declared
  // callbacks (placeMarketOrder / closePosition / scheduleClaim) can
  // invoke it without forward-referencing the useCallback.
  claimGoldRef.current = claimGold;

  // ───── Startup & polling ─────
  // Gate on active DEX — FuturesPanel mounts ALL hooks; without this
  // Avantis was hitting its markets endpoint for every GMX/Decibel/Pacifica
  // user too. Mirror useGmx + (post-fix) useDecibel.
  useEffect(() => { if (isActiveDex) fetchMarkets(); }, [isActiveDex, fetchMarkets]);

  useEffect(() => {
    if (!walletAddr || !isActiveDex) return;
    const tick = () => {
      fetchAccount();
      fetchPositions();
      fetchOrders();
      fetchPrices();
      fetchBalance();
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, [walletAddr, isActiveDex, fetchAccount, fetchPositions, fetchOrders, fetchPrices, fetchBalance]);

  // Referral linkage read — runs once per wallet (on-chain state, no polling).
  useEffect(() => {
    if (!isActiveDex) return;
    fetchReferralStatus();
  }, [isActiveDex, fetchReferralStatus]);

  // Periodic claim-gold poll — catches trades that the server-side rewards
  // worker detected (closes, worker polls Avantis Core every 2 min) after
  // our in-hook scheduleClaim() already fired. Runs while the hook is
  // mounted (i.e. FuturesPanel or ProfileModal is open). Claim endpoint
  // is idempotent + rate-limited server-side so over-calling is safe.
  useEffect(() => {
    if (!walletAddr || !isActiveDex) return;
    const fire = () => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn();
    };
    // Fire once shortly after mount so a stale "pending claim" from a
    // worker-polled close lands quickly.
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(fire, 30_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [walletAddr, isActiveDex]);

  const marginModes = {};
  const leverageSettings = {};

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
    leverageSettings,
    marginModes,
    dataReady,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    depositToPacifica,
    withdraw,
    activate,
    claimGold,
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setTpsl,
    setLeverage,
    setMarginMode,
    // Avantis-specific extras
    avantisDepositAddress: walletAddr,
    avantisChain: 'base',
    // Signals to UI that Avantis is now non-custodial — hides deposit/withdraw
    // panels, shows "Connect Wallet" CTA if isReady === false.
    isSelfCustody: true,
    walletMismatch,
    registeredEvmWallet,
    // Referral linkage — FuturesPanel reads these to show the "Unlock 5% off"
    // banner until the user either signs the one-tx linkage or dismisses it.
    hasReferrer,          // true | false | null (loading)
    linkOurReferrer,      // async () => { tx_hash, status } | { error }
    isReady,
  };
}
