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
import {
  TRADING_ADDRESS, TRADING_STORAGE_ADDRESS, USDC_ADDRESS,
  ERC20_ABI, TRADING_ABI, ORDER_TYPE,
  priceToContract, leverageToContract, slippageToContract, collateralToRaw,
  sideIsBuy, fetchPriceUpdateData, fetchExecutionFeeWei, fetchNextTradeIndex,
  fetchLiveMarkPrice,
  isLinkedToOurReferrer, applyReferralCode, fetchReferralCode,
  REFERRAL_CODE_BYTES32, REFERRAL_CODE_STRING,
  PRICE_SOURCING,
} from '../lib/avantisContract';

const FUTURES_API = '/api/futures';

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

function normalizePosition(p, markets) {
  // Avantis Core API /user-data.positions shape (confirmed via live probe):
  //   { trader, pairIndex, index, buy, collateral, leverage, openPrice, sl, tp, ... }
  // All numeric fields are strings. Scalings:
  //   collateral      → raw 1e6 (USDC)
  //   leverage/openPrice/tp/sl → raw 1e10
  const pairIdx = p.pairIndex ?? p.pair_index ?? p.trade?.pairIndex;
  const isBuy = p.buy ?? p.isLong ?? p.trade?.buy ?? false;
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
  const isBuy = o.buy ?? o.trade?.buy ?? false;
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

function normalizeMarkets(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.pairs || raw?.data || []);
  return list.map((p, i) => {
    const from = String(p.from || p.base || '').toUpperCase();
    const to = String(p.to || p.quote || 'USD').toUpperCase();
    const symbol = from === 'USD' && to && to !== 'USD' ? `${from}${to}` : from;
    const fullPair = from === 'USD' && to && to !== 'USD'
      ? `${to}/${from}`
      : (from && to ? `${from}/${to}` : String(p.symbol || '').toUpperCase());
    const iconBase = from === 'USD' && to && to !== 'USD' ? to : from;
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
  const scheduleClaim = useCallback((delayMs = 2500) => {
    const t = setTimeout(() => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn();
    }, delayMs);
    return () => clearTimeout(t);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

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
      const hash = await applyReferralCode(walletClient);
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
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Referral link failed';
      console.warn('[avantis] linkOurReferrer error:', msg);
      setError(String(msg).slice(0, 300));
      return { error: msg };
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

  // ───── Report a trade to server so gold-rewards worker can credit ─────
  // Fire-and-forget: the server ALSO polls /user-data so even if this fails,
  // the trade will be picked up on the next worker tick. This is just a
  // nudge for instant feedback.
  const reportTrade = useCallback(async ({ tx_hash, symbol, side, amount, leverage, price, order_type = 'market', dedup_key }) => {
    if (!walletAddr) return;
    try {
      const notional = Number(amount) * Number(leverage);
      const token = window._playerToken;
      await fetch(`${FUTURES_API}/trade-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dex': 'avantis', ...(token ? { 'x-token': token } : {}) },
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
    } catch { /* fire-and-forget */ }
  }, [walletAddr]);

  // ───── Client-side approval helper ─────
  const ensureApproval = useCallback(async (amountRaw) => {
    if (!walletClient || !walletAddr || !publicClient) throw new Error('Wallet not connected');
    const allowance = await publicClient.readContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
      args: [walletAddr, TRADING_STORAGE_ADDRESS],
    });
    if (allowance >= amountRaw) return null;
    // Approve +1% cushion for fees; user will see ONE wallet popup to approve.
    const approveAmount = (amountRaw * 101n) / 100n;
    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
      args: [TRADING_STORAGE_ADDRESS, approveAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }, [walletClient, walletAddr, publicClient]);

  // ───── Guards ─────
  function requireWallet() {
    if (!isReady || !walletClient || !walletAddr) {
      throw new Error('Connect your Base wallet to trade on Avantis');
    }
  }

  // ───── Place market order ─────
  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage, leverage) => {
    setLoading(true);
    setError(null);
    try {
      requireWallet();
      await ensureChain();

      const collateralUsdc = Number(amount);
      if (!Number.isFinite(collateralUsdc) || collateralUsdc <= 0) throw new Error('Invalid amount');
      const levNum = Math.min(Math.max(Number(leverage) || 1, 1), 1000);

      const market = marketsRef.current.find(m => m.symbol === symbol);
      if (!market) throw new Error(`Unknown market: ${symbol}`);
      const pairIndex = Number(market.pair_index);

      const positionSizeUSDC = collateralToRaw(collateralUsdc);
      // Min-notional $100 pre-check (saves a wallet popup + revert).
      if (Number(collateralUsdc) * levNum < 100) {
        throw new Error(`Avantis min position size = $100 (yours: $${(collateralUsdc * levNum).toFixed(2)})`);
      }

      await ensureApproval(positionSizeUSDC);

      const tradeIndex = await fetchNextTradeIndex(walletAddr, pairIndex);
      const execFee = await fetchExecutionFeeWei(publicClient);
      const isBuy = sideIsBuy(side);

      // Avantis keeper auto-cancels MARKET trades that arrive with openPrice=0
      // (verified live). Pass the current Pyth price as the executor reference.
      const livePrice = await fetchLiveMarkPrice(pairIndex);
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
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      reportTrade({
        tx_hash: hash, symbol, side: isBuy ? 'long' : 'short',
        amount: collateralUsdc, leverage: levNum, order_type: 'market',
      });

      fetchPositions();
      fetchAccount();
      fetchBalance();
      // Fire-and-forget gold claim. Delay 2.5s so server-side trade-report
      // (which this hook POSTs above) lands in futures.db BEFORE
      // /trading/claim-gold reads it.
      scheduleClaim();
      return { tx_hash: hash, status: receipt.status === 'success' ? 'submitted' : 'failed' };
    } catch (e) {
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Trade failed';
      setError(String(msg).slice(0, 300));
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletClient, walletAddr, publicClient, ensureChain, ensureApproval, reportTrade, fetchPositions, fetchAccount, fetchBalance, scheduleClaim]);

  // ───── Place limit order ─────
  // `slippage` added as optional 7th arg (percent, e.g. 0.5). Defaults to 1%
  // to match previous hardcoded behaviour — callers that already pass 6
  // args continue to work unchanged. Clamped to [0.1%, 50%] inside
  // `slippageToContract`.
  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif, leverage, slippage = 1) => {
    setLoading(true);
    setError(null);
    try {
      requireWallet();
      await ensureChain();

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

      await ensureApproval(positionSizeUSDC);

      const tradeIndex = await fetchNextTradeIndex(walletAddr, pairIndex);
      const execFee = await fetchExecutionFeeWei(publicClient);
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
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      reportTrade({
        tx_hash: hash, symbol, side: isBuy ? 'long' : 'short',
        amount: collateralUsdc, leverage: levNum, price: priceNum, order_type: 'limit',
      });

      fetchOrders();
      fetchAccount();
      fetchBalance();
      // Limit orders ALSO generate volume credit server-side, so claim now.
      scheduleClaim();
      return { tx_hash: hash, status: receipt.status === 'success' ? 'open' : 'failed' };
    } catch (e) {
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Limit order failed';
      setError(String(msg).slice(0, 300));
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletClient, walletAddr, publicClient, ensureChain, ensureApproval, reportTrade, fetchOrders, fetchAccount, fetchBalance, scheduleClaim]);

  // ───── Close position (full or partial) ─────
  const closePosition = useCallback(async (symbol, side, amount, pairIndex, tradeIndex) => {
    setLoading(true);
    setError(null);
    try {
      requireWallet();
      await ensureChain();
      if (pairIndex === undefined || tradeIndex === undefined) throw new Error('Missing pair/trade index');

      const amt = Number(amount);
      // $0.01 floor — anything smaller is dust that reverts on-chain with
      // a generic "execution reverted" and wastes gas. Surface a friendly
      // error before we sign the tx.
      if (!Number.isFinite(amt) || amt < 0.01) throw new Error('Close amount must be at least $0.01');
      const amountRaw = collateralToRaw(amt);
      const execFee = await fetchExecutionFeeWei(publicClient);

      // Look up leverage from local positions state BEFORE the close lands,
      // because after waitForTransactionReceipt the position row is gone.
      // Notional = collateral × leverage — matches how openTrade is reported
      // and what the task verifier / gold volume calc expects.
      const posMatch = positions.find(p =>
        Number(p.pair_index) === Number(pairIndex) &&
        Number(p.trade_index) === Number(tradeIndex)
      );
      const closeLeverage = posMatch ? Number(posMatch.leverage) || 1 : 1;

      const hash = await walletClient.writeContract({
        address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'closeTradeMarket',
        args: [BigInt(pairIndex), BigInt(tradeIndex), amountRaw],
        value: execFee,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Client-side trade report — DO NOT rely on avantis-rewards-worker for
      // closes. The worker polls every 2 min and its in-memory "seen opens"
      // cache is lost on server restart, so fast trades and restart-spanning
      // trades go uncredited. Reporting immediately fixes both races.
      //
      // We tag the close with a distinct side ('close_long'/'close_short')
      // so the task verifier's classifyTrade() recognises it separately from
      // the matching open and credits it as independent volume.
      //
      // `dedupKey` is a deterministic id the worker can reproduce — (pair
      // index, trade index) uniquely identify an Avantis trade per trader,
      // and "close:" distinguishes it from an open report. UNIQUE index on
      // client_order_id then prevents the worker's later poll from writing
      // the same close a second time.
      const closeSide = String(side || '').toLowerCase();
      const closedSideLabel = closeSide === 'long' || closeSide === 'bid' ? 'close_long' : 'close_short';
      const dedupKey = `avantis:close:${walletAddr.toLowerCase()}:${pairIndex}:${tradeIndex}`;
      reportTrade({
        tx_hash: hash, symbol, side: closedSideLabel,
        amount: amt, leverage: closeLeverage, order_type: 'close',
        dedup_key: dedupKey,
      });

      fetchPositions();
      fetchAccount();
      fetchBalance();
      // Claim twice: immediately for the trade-report we just sent, and
      // again ~8s later in case the worker-poll fires in between and adds
      // its own (dedupe-safe) row.
      scheduleClaim(2500);
      scheduleClaim(8000);
      return { tx_hash: hash, status: receipt.status === 'success' ? 'closed' : 'failed' };
    } catch (e) {
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Close failed';
      setError(String(msg).slice(0, 300));
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletClient, publicClient, ensureChain, fetchPositions, fetchAccount, fetchBalance, scheduleClaim, reportTrade, positions]);

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
      await publicClient.waitForTransactionReceipt({ hash });
      fetchOrders();
      return { tx_hash: hash, status: 'cancelled' };
    } catch (e) {
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Cancel failed';
      setError(String(msg).slice(0, 300));
      return { error: msg };
    }
  }, [walletClient, publicClient, ensureChain, fetchOrders]);

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
      const hash = await walletClient.writeContract({
        address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'updateTpAndSl',
        args: [BigInt(pairIndex), BigInt(tradeIndex), slContract, tpContract, [priceUpdateData], PRICE_SOURCING.HERMES],
        value: 1n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      fetchPositions();
      return { tx_hash: hash, status: 'updated' };
    } catch (e) {
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'TP/SL update failed';
      setError(String(msg).slice(0, 300));
      return { error: msg };
    }
  }, [walletClient, publicClient, ensureChain, fetchPositions]);

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
    try {
      const token = window._playerToken;
      if (!token) return null;
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'avantis' }),
      });
      const data = await res.json();
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      return data;
    } catch { return null; }
  }, [walletAddr]);

  // Publish the latest claimGold to the shared ref so earlier-declared
  // callbacks (placeMarketOrder / closePosition / scheduleClaim) can
  // invoke it without forward-referencing the useCallback.
  claimGoldRef.current = claimGold;

  // ───── Startup & polling ─────
  useEffect(() => { fetchMarkets(); }, [fetchMarkets]);

  useEffect(() => {
    if (!walletAddr) return;
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
  }, [walletAddr, fetchAccount, fetchPositions, fetchOrders, fetchPrices, fetchBalance]);

  // Referral linkage read — runs once per wallet (on-chain state, no polling).
  useEffect(() => { fetchReferralStatus(); }, [fetchReferralStatus]);

  // Periodic claim-gold poll — catches trades that the server-side rewards
  // worker detected (closes, worker polls Avantis Core every 2 min) after
  // our in-hook scheduleClaim() already fired. Runs while the hook is
  // mounted (i.e. FuturesPanel or ProfileModal is open). Claim endpoint
  // is idempotent + rate-limited server-side so over-calling is safe.
  useEffect(() => {
    if (!walletAddr) return;
    const fire = () => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn();
    };
    // Fire once shortly after mount so a stale "pending claim" from a
    // worker-polled close lands quickly.
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(fire, 30_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [walletAddr]);

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
    // Referral linkage — FuturesPanel reads these to show the "Unlock 5% off"
    // banner until the user either signs the one-tx linkage or dismisses it.
    hasReferrer,          // true | false | null (loading)
    linkOurReferrer,      // async () => { tx_hash, status } | { error }
    isReady,
  };
}
