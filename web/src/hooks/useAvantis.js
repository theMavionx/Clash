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
      funding_rate: p.fundingRate || p.funding_rate || '0',
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
  const marketsRef = useRef([]);

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
  const reportTrade = useCallback(async ({ tx_hash, symbol, side, amount, leverage, price, order_type = 'market' }) => {
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
        }),
      });
    } catch {}
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
      const execFee = await fetchExecutionFeeWei();
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
      return { tx_hash: hash, status: receipt.status === 'success' ? 'submitted' : 'failed' };
    } catch (e) {
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Trade failed';
      setError(String(msg).slice(0, 300));
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletClient, walletAddr, publicClient, ensureChain, ensureApproval, reportTrade, fetchPositions, fetchAccount, fetchBalance]);

  // ───── Place limit order ─────
  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif, leverage) => {
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
      const execFee = await fetchExecutionFeeWei();
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
        args: [tradeInput, ORDER_TYPE.LIMIT, slippageToContract(1)],
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
      return { tx_hash: hash, status: receipt.status === 'success' ? 'open' : 'failed' };
    } catch (e) {
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Limit order failed';
      setError(String(msg).slice(0, 300));
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletClient, walletAddr, publicClient, ensureChain, ensureApproval, reportTrade, fetchOrders, fetchAccount, fetchBalance]);

  // ───── Close position (full or partial) ─────
  const closePosition = useCallback(async (symbol, side, amount, pairIndex, tradeIndex) => {
    setLoading(true);
    setError(null);
    try {
      requireWallet();
      await ensureChain();
      if (pairIndex === undefined || tradeIndex === undefined) throw new Error('Missing pair/trade index');

      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid close amount');
      const amountRaw = collateralToRaw(amt);
      const execFee = await fetchExecutionFeeWei();

      const hash = await walletClient.writeContract({
        address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'closeTradeMarket',
        args: [BigInt(pairIndex), BigInt(tradeIndex), amountRaw],
        value: execFee,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      fetchPositions();
      fetchAccount();
      fetchBalance();
      return { tx_hash: hash, status: receipt.status === 'success' ? 'closed' : 'failed' };
    } catch (e) {
      const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Close failed';
      setError(String(msg).slice(0, 300));
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletClient, publicClient, ensureChain, fetchPositions, fetchAccount, fetchBalance]);

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

      const hash = await walletClient.writeContract({
        address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'updateTpAndSl',
        args: [BigInt(pairIndex), BigInt(tradeIndex), slContract, tpContract, [priceUpdateData]],
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
    isReady,
  };
}
