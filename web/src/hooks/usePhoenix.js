import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useSignAndSendTransaction as usePrivySignAndSend, useWallets as usePrivyWallets } from '@privy-io/react-auth/solana';
import { Direction, MarginType, OrderFlags, Side, StopLossOrderKind, priceUsdToTicks } from '@ellipsis-labs/rise';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import {
  asPhoenixArray,
  getPhoenixClient,
  phoenixFetch,
  phoenixSymbol,
} from '../lib/phoenixClient';
import { sendPhoenixInstructions } from '../lib/phoenixTx';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;
const POLL_MS = 10_000;
const USDC_DECIMALS = 6;
const PHOENIX_ACCESS_CODE = import.meta.env.VITE_PHOENIX_ACCESS_CODE || '';
const PHOENIX_REFERRAL_CODE = import.meta.env.VITE_PHOENIX_REFERRAL_CODE || '';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

function getATA(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOC_TOKEN_PROGRAM
  )[0];
}

function parseMaybeUsdc(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  if (Number.isInteger(n) && Math.abs(n) >= 1_000_000) return n / 1e6;
  return n;
}

function toRawUsdc(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive USDC amount');
  return BigInt(Math.floor(n * 10 ** USDC_DECIMALS));
}

function sideToPhoenix(side) {
  const s = String(side || '').toLowerCase();
  return (s === 'bid' || s === 'buy' || s === 'long') ? Side.Bid : Side.Ask;
}

function sideToUi(side) {
  if (side === Side.Bid || String(side).toLowerCase() === 'bid' || String(side).toLowerCase() === 'buy') return 'bid';
  return 'ask';
}

function roundDownToLot(value, lotSize) {
  const n = Number(value);
  const lot = Number(lotSize);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(lot) || lot <= 0) return n;
  const decimals = Math.max(0, String(lotSize).split('.')[1]?.length || 0);
  return Number((Math.floor(n / lot) * lot).toFixed(decimals));
}

function fundingPercentToDecimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 100 : 0;
}

function phoenixTickSizeUsd(m) {
  const tickSizeRaw = Number(m?.tickSize ?? 0);
  const baseLotsDecimals = Number(m?.baseLotsDecimals ?? 4);
  if (!Number.isFinite(tickSizeRaw) || tickSizeRaw <= 0) return 0.01;
  return tickSizeRaw * 10 ** baseLotsDecimals / 1_000_000;
}

function normalizeMarket(m) {
  const symbol = phoenixSymbol(m?.symbol);
  if (!symbol || String(m?.marketStatus || 'active').toLowerCase() !== 'active') return null;
  const tickSizeRaw = Number(m?.tickSize || 0);
  const tickSize = phoenixTickSizeUsd(m);
  const baseLotsDecimals = Number(m?.baseLotsDecimals ?? 4);
  const lotSize = 1 / 10 ** baseLotsDecimals;
  const maxLev = Math.max(1, ...(m?.leverageTiers || []).map(t => Number(t?.maxLeverage || 0)));
  return {
    symbol,
    base: symbol,
    pair: `${symbol}/USD`,
    market_name: symbol,
    market_addr: m?.marketPubkey || m?.marketKey || null,
    lot_size: String(lotSize),
    tick_size: String(tickSize),
    min_order_size: String(lotSize),
    max_leverage: maxLev || 15,
    isolated_only: !!m?.isolatedOnly,
    maker_fee: Number(m?.makerFee ?? 0.00005),
    taker_fee: Number(m?.takerFee ?? 0.00035),
    funding_rate: fundingPercentToDecimal(m?.fundingRate ?? m?.fundingRatePercentage ?? m?.currentFundingRatePercentage),
    next_funding_rate: fundingPercentToDecimal(m?.fundingRate ?? m?.fundingRatePercentage ?? m?.currentFundingRatePercentage),
    volume_24h: 0,
    open_interest: 0,
    _phoenix: m,
    _phoenixBaseLotsDecimals: baseLotsDecimals,
    _phoenixTickSizeRaw: tickSizeRaw,
  };
}

function enrichMarketsWithFunding(markets, fundingOverview) {
  const bySymbol = {};
  for (const series of fundingOverview?.series || []) {
    const symbol = phoenixSymbol(series?.symbol);
    const points = Array.isArray(series?.points) ? series.points : [];
    const latest = points.length ? points[points.length - 1] : null;
    if (symbol && latest?.fundingRate != null) {
      bySymbol[symbol] = fundingPercentToDecimal(latest.fundingRate);
    }
  }
  return markets.map(m => {
    const rate = bySymbol[m.symbol];
    return Number.isFinite(rate) ? { ...m, funding_rate: rate, next_funding_rate: rate } : m;
  });
}

function normalizePrice(symbol, stats, fallbackMarket = null) {
  const latest = Array.isArray(stats) && stats.length ? stats[stats.length - 1] : null;
  const prev = Array.isArray(stats) && stats.length > 1 ? stats[0] : latest;
  const mark = Number(latest?.mark_price ?? latest?.markPrice ?? latest?.price ?? 0);
  const spot = Number(latest?.spot_price ?? latest?.spotPrice ?? mark);
  const previous = Number(prev?.mark_price ?? prev?.markPrice ?? mark);
  return {
    symbol,
    mark: mark > 0 ? String(mark) : '',
    oracle: spot > 0 ? String(spot) : (mark > 0 ? String(mark) : ''),
    yesterday_price: previous > 0 ? String(previous) : '',
    volume_24h: String(latest?.volume_quote ?? latest?.volumeQuote ?? fallbackMarket?.volume_24h ?? 0),
    open_interest: String(latest?.open_interest ?? latest?.openInterest ?? fallbackMarket?.open_interest ?? 0),
  };
}

function ticksToUsd(value, market) {
  if (value == null) return null;
  const ticksNum = Number(value);
  const raw = Number(market?._phoenixTickSizeRaw ?? market?._phoenix?.tickSize ?? 0);
  const decimals = Number(market?._phoenixBaseLotsDecimals ?? market?._phoenix?.baseLotsDecimals ?? 4);
  if (!Number.isFinite(ticksNum) || !Number.isFinite(raw) || raw <= 0) return null;
  return ticksNum * raw * 10 ** decimals / 1_000_000;
}

function priceToTicks(price, market) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive Phoenix trigger price');
  const raw = Number(market?._phoenixTickSizeRaw ?? market?._phoenix?.tickSize ?? 0);
  const decimals = Number(market?._phoenixBaseLotsDecimals ?? market?._phoenix?.baseLotsDecimals ?? 4);
  if (!Number.isFinite(raw) || raw <= 0) throw new Error('Phoenix market tick metadata is missing');
  return BigInt(priceUsdToTicks(String(price), {
    baseLotsDecimals: decimals,
    tickSizeInQuoteLotsPerBaseLot: raw,
  }));
}

function activeTriggerPrice(triggers, market) {
  const rows = Array.isArray(triggers) ? triggers : [];
  const row = rows.find(t => !/cancel|disable|fill|execut/i.test(String(t?.status || '')))
    || rows[0]
    || null;
  return ticksToUsd(row?.trigger?.triggerPriceTicks, market);
}

function positionFromSnapshot(p, marketsBySymbol, collateral, subaccountIndex = 0) {
  const symbol = phoenixSymbol(p?.symbol);
  if (!symbol) return null;
  const m = marketsBySymbol.current[symbol];
  const lotDecimals = Number(m?._phoenixBaseLotsDecimals ?? 4);
  const rawBase = p?.basePositionUnits != null
    ? Number(p.basePositionUnits)
    : Number(p?.basePositionLots || 0) / 10 ** lotDecimals;
  if (!Number.isFinite(rawBase) || rawBase === 0) return null;
  const amount = Math.abs(rawBase);
  const entry = Number(p?.entryPriceUsd || p?.entryPrice || 0);
  const price = Number(m?._mark || entry || 0);
  const notional = amount * (entry || price || 0);
  const margin = collateral > 0 ? Math.min(collateral, notional) : 0;
  const directTakeProfitPrice = activeTriggerPrice(p?.takeProfitTriggers, m);
  const directStopLossPrice = activeTriggerPrice(p?.stopLossTriggers, m);
  const conditionalTakeProfitPrice = activeTriggerPrice(p?.conditionalTakeProfitTriggers, m);
  const conditionalStopLossPrice = activeTriggerPrice(p?.conditionalStopLossTriggers, m);
  return {
    symbol,
    side: rawBase >= 0 ? 'bid' : 'ask',
    amount,
    size_usd: notional,
    entry_price: entry || price,
    mark_price: price || entry,
    liquidation_price: null,
    margin,
    leverage: margin > 0 ? Math.max(1, Math.round((notional / margin) * 10) / 10) : null,
    pnl_usd: (price && entry) ? (price - entry) * amount * (rawBase >= 0 ? 1 : -1) : 0,
    is_isolated: Number(subaccountIndex) > 0,
    take_profit_price: directTakeProfitPrice ?? conditionalTakeProfitPrice,
    stop_loss_price: directStopLossPrice ?? conditionalStopLossPrice,
    market_addr: m?.market_addr || null,
    pair_index: null,
    trade_index: null,
    _phoenixSubaccountIndex: Number(subaccountIndex) || 0,
    _phoenixDirectTakeProfitPrice: directTakeProfitPrice,
    _phoenixDirectStopLossPrice: directStopLossPrice,
    _raw: p,
  };
}

function ordersFromSnapshot(group, marketsBySymbol, subaccountIndex = 0) {
  const symbol = phoenixSymbol(group?.symbol);
  if (!symbol) return [];
  const m = marketsBySymbol.current[symbol];
  const lotDecimals = Number(m?._phoenixBaseLotsDecimals ?? 4);
  return (group?.orders || []).map(o => {
    const amount = o?.sizeRemainingUnits != null
      ? Number(o.sizeRemainingUnits)
      : Number(o?.sizeRemainingLots || 0) / 10 ** lotDecimals;
    return {
      symbol,
      side: sideToUi(o?.side),
      amount: String(Math.abs(amount || 0)),
      price: String(o?.priceUsd ?? o?.price ?? 0),
      order_type: String(o?.orderType || '').toUpperCase() || 'LIMIT',
      tif: 'GTC',
      order_id: String(o?.orderSequenceNumber ?? o?.id ?? ''),
      orderSequenceNumber: o?.orderSequenceNumber,
      reduce_only: !!o?.reduceOnly,
      market_addr: m?.market_addr || null,
      market_name: symbol,
      _phoenixSubaccountIndex: Number(subaccountIndex) || 0,
      _raw: o,
    };
  });
}

export function usePhoenix() {
  const { dex } = useDex();
  const isActiveDex = dex === 'phoenix';
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const player = usePlayer();

  let privyWalletObj = null;
  let privySendTx = null;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { wallets } = usePrivyWallets();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signAndSendTransaction } = usePrivySignAndSend();
    privyWalletObj = (wallets || []).find(w => w && w.walletClientType === 'privy') || (wallets || [])[0] || null;
    privySendTx = signAndSendTransaction;
  }

  const privyAddr = privyWalletObj?.address || null;
  const privyActive = !publicKey && !!privyAddr;
  const walletAddr = publicKey?.toBase58() || privyAddr || null;
  const ownerPk = useMemo(() => walletAddr ? new PublicKey(walletAddr) : null, [walletAddr]);
  const registeredWallet = typeof player?.wallet === 'string' ? player.wallet.trim() : '';
  const registeredSolanaWallet = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(registeredWallet) ? registeredWallet : null;
  const walletMismatch = !!(registeredSolanaWallet && walletAddr && registeredSolanaWallet !== walletAddr);

  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);

  const marketsRef = useRef([]);
  const marketsBySymbolRef = useRef({});
  const pricesRef = useRef([]);
  const subaccountsRef = useRef([]);
  const traderRegisteredRef = useRef(false);
  const tokenRef = useRef(null);
  const claimGoldRef = useRef(null);
  const inFlightRef = useRef(new Map());

  useEffect(() => {
    tokenRef.current = player?.token || null;
  }, [player?.token]);

  const client = getPhoenixClient(connection?.rpcEndpoint);
  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const runOnce = useCallback((key, fn) => {
    const map = inFlightRef.current;
    if (map.has(key)) return map.get(key);
    const p = Promise.resolve().then(fn).finally(() => {
      if (map.get(key) === p) map.delete(key);
    });
    map.set(key, p);
    return p;
  }, []);

  const sendIxs = useCallback((instructions) => {
    if (!ownerPk) throw new Error('Wallet not connected');
    return sendPhoenixInstructions({
      instructions,
      ownerPk,
      connection,
      sendTransaction,
      privyActive,
      privySendTx,
      privyWalletObj,
    });
  }, [ownerPk, connection, sendTransaction, privyActive, privySendTx, privyWalletObj]);

  const claimGold = useCallback(async () => {
    if (!walletAddr) return null;
    const token = tokenRef.current || window._playerToken;
    if (!token) return null;
    try {
      const res = await fetch(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'phoenix' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Phoenix trading rewards' });
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      return data;
    } catch {
      return null;
    }
  }, [walletAddr]);

  useEffect(() => {
    claimGoldRef.current = claimGold;
  }, [claimGold]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) return undefined;
    const fire = () => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn();
    };
    const first = setTimeout(fire, 6_000);
    const iv = setInterval(fire, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [isActiveDex, walletAddr]);

  const fetchWalletUsdc = useCallback(async () => {
    if (!walletAddr || !ownerPk) {
      setWalletUsdc(null);
      return 0;
    }
    try {
      const bal = await connection.getTokenAccountBalance(getATA(ownerPk, USDC_MINT));
      const n = Number(bal?.value?.uiAmount || 0);
      setWalletUsdc(n);
      return n;
    } catch {
      setWalletUsdc(0);
      return 0;
    }
  }, [walletAddr, ownerPk, connection]);

  const fetchPrices = useCallback(async (marketList = marketsRef.current) => {
    if (!isActiveDex || !marketList.length) return [];
    const rows = await Promise.allSettled(marketList.map(async (m) => {
      const data = await phoenixFetch(`/v1/market/${encodeURIComponent(m.symbol)}/stats?limit=2`);
      const row = normalizePrice(m.symbol, asPhoenixArray(data?.stats ? data.stats : data), m);
      return row;
    }));
    const next = rows
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(Boolean);
    if (next.length) {
      const bySymbol = { ...marketsBySymbolRef.current };
      for (const p of next) {
        if (bySymbol[p.symbol]) bySymbol[p.symbol] = { ...bySymbol[p.symbol], _mark: Number(p.mark || 0) };
      }
      marketsBySymbolRef.current = bySymbol;
      pricesRef.current = next;
      setPrices(next);
    }
    return next;
  }, [isActiveDex]);

  const fetchMarkets = useCallback(async () => {
    if (!isActiveDex) return [];
    try {
      const raw = await client.api.markets().getMarkets();
      const baseList = asPhoenixArray(raw).map(normalizeMarket).filter(Boolean);
      let list = baseList;
      try {
        const overview = await client.api.funding().getFundingOverview({ perMarketLimit: 1 });
        list = enrichMarketsWithFunding(baseList, overview);
      } catch {
        list = baseList;
      }
      marketsRef.current = list;
      marketsBySymbolRef.current = Object.fromEntries(list.map(m => [m.symbol, m]));
      setMarkets(list);
      setAccount(prev => prev ? {
        ...prev,
        maker_fee: list[0]?.maker_fee ?? prev.maker_fee,
        taker_fee: list[0]?.taker_fee ?? prev.taker_fee,
      } : prev);
      fetchPrices(list);
      return list;
    } catch (e) {
      setError(e?.message || 'Could not load Phoenix markets');
      return [];
    }
  }, [client, fetchPrices, isActiveDex]);

  const refreshTraderState = useCallback(async () => {
    if (!isActiveDex || !walletAddr) {
      setAccountReady(false);
      return null;
    }
    try {
      const state = await client.api.traders().getTraderStateSnapshot(walletAddr, { traderPdaIndex: 0 });
      traderRegisteredRef.current = true;
      const subaccounts = Array.isArray(state?.snapshot?.subaccounts) ? state.snapshot.subaccounts : [];
      subaccountsRef.current = subaccounts;
      const cross = subaccounts.find(s => Number(s.subaccountIndex) === 0) || subaccounts[0] || null;
      const crossCollateral = parseMaybeUsdc(cross?.collateral);
      const totalCollateral = subaccounts.reduce((sum, s) => sum + parseMaybeUsdc(s?.collateral), 0);
      const pos = subaccounts
        .flatMap(sub => {
          const subIndex = Number(sub?.subaccountIndex) || 0;
          const collateral = parseMaybeUsdc(sub?.collateral);
          return (sub?.positions || [])
            .map(p => positionFromSnapshot(p, marketsBySymbolRef, collateral, subIndex))
            .filter(Boolean);
        });
      const ord = subaccounts.flatMap(sub => {
        const subIndex = Number(sub?.subaccountIndex) || 0;
        return (sub?.orders || []).flatMap(group => ordersFromSnapshot(group, marketsBySymbolRef, subIndex));
      });
      const notional = pos.reduce((sum, p) => sum + Number(p.size_usd || 0), 0);
      const marginUsed = pos.reduce((sum, p) => sum + Number(p.margin || 0), 0);
      const pnl = pos.reduce((sum, p) => sum + Number(p.pnl_usd || 0), 0);
      const equity = Math.max(0, totalCollateral + pnl);
      const crossMarginUsed = pos
        .filter(p => !p.is_isolated)
        .reduce((sum, p) => sum + Number(p.margin || 0), 0);
      const available = Math.max(0, crossCollateral - crossMarginUsed);
      const firstMarket = marketsRef.current[0] || {};
      setPositions(pos);
      setOrders(ord);
      setAccount({
        authority: walletAddr,
        balance: String(crossCollateral),
        account_equity: String(equity),
        available_to_spend: String(available),
        available_to_withdraw: String(available),
        total_margin_used: String(Math.min(marginUsed, notional)),
        positions_count: pos.length,
        orders_count: ord.length,
        maker_fee: firstMarket.maker_fee ?? 0.00005,
        taker_fee: firstMarket.taker_fee ?? 0.00035,
        fee_level: '0',
        _raw: state,
      });
      setAccountReady(true);
      setDataReady(true);
      return state;
    } catch {
      traderRegisteredRef.current = false;
      subaccountsRef.current = [];
      setPositions([]);
      setOrders([]);
      setAccount({
        authority: walletAddr,
        balance: '0',
        account_equity: '0',
        available_to_spend: '0',
        available_to_withdraw: '0',
        total_margin_used: '0',
        positions_count: 0,
        orders_count: 0,
        maker_fee: 0.00005,
        taker_fee: 0.00035,
        fee_level: '0',
      });
      setAccountReady(true);
      setDataReady(true);
      return null;
    }
  }, [client, isActiveDex, walletAddr]);

  const activate = useCallback(async () => {
    if (!walletAddr) {
      setError('Wallet not connected');
      return false;
    }
    return runOnce(`activate:${walletAddr}`, async () => {
      setLoading(true);
      setError(null);
      try {
        if (!traderRegisteredRef.current) {
          try {
            const check = await client.api.invite().checkWallet(walletAddr);
            if (!check?.whitelisted && PHOENIX_ACCESS_CODE) {
              await client.api.invite().activateInvite({ authority: walletAddr, code: PHOENIX_ACCESS_CODE });
            } else if (!check?.whitelisted && PHOENIX_REFERRAL_CODE) {
              await client.api.invite().activateInviteWithReferral({ authority: walletAddr, referral_code: PHOENIX_REFERRAL_CODE });
            }
          } catch {
            // Some Phoenix environments allow direct registration; let the
            // on-chain registration path be the source of truth.
          }
          const ix = await client.ixs.buildRegisterTrader({
            authority: walletAddr,
            marginType: MarginType.Cross || 'cross',
          });
          await sendIxs(ix);
          traderRegisteredRef.current = true;
        }
        await refreshTraderState();
        return true;
      } catch (e) {
        const text = e?.message || 'Phoenix activation failed';
        if (/already|exists|initialized/i.test(text)) {
          traderRegisteredRef.current = true;
          await refreshTraderState();
          return true;
        }
        setError(text);
        return false;
      } finally {
        setLoading(false);
      }
    });
  }, [client, refreshTraderState, runOnce, sendIxs, walletAddr]);

  const depositToPacifica = useCallback(async (amountUsdc) => {
    if (!walletAddr) {
      setError('Wallet not connected');
      return { error: 'Wallet not connected' };
    }
    return runOnce(`deposit:${walletAddr}:${amountUsdc}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const ok = await activate();
        if (!ok) throw new Error('Phoenix account is not ready');
        const amount = toRawUsdc(amountUsdc);
        const built = await client.ixs.buildDepositIxs({ authority: walletAddr, amount });
        const signature = await sendIxs(built.instructions);
        await Promise.all([refreshTraderState(), fetchWalletUsdc()]);
        claimGold();
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix deposit failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [activate, claimGold, client, fetchWalletUsdc, refreshTraderState, runOnce, sendIxs, walletAddr]);

  const withdraw = useCallback(async (amountUsdc) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    return runOnce(`withdraw:${walletAddr}:${amountUsdc}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const amount = toRawUsdc(amountUsdc);
        const built = await client.ixs.buildWithdrawIxs({ authority: walletAddr, amount });
        const signature = await sendIxs(built.instructions);
        await Promise.all([refreshTraderState(), fetchWalletUsdc()]);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix withdraw failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [client, fetchWalletUsdc, refreshTraderState, runOnce, sendIxs, walletAddr]);

  const buildBaseUnitsFromMargin = useCallback((symbol, margin, leverage, priceOverride = null) => {
    const priceRow = pricesRef.current.find(p => p.symbol === phoenixSymbol(symbol));
    const mark = Number(priceOverride || priceRow?.mark || 0);
    const m = marketsBySymbolRef.current[phoenixSymbol(symbol)];
    if (!Number.isFinite(mark) || mark <= 0) throw new Error('No Phoenix mark price yet');
    const raw = (Number(margin) * Number(leverage || 1)) / mark;
    const rounded = roundDownToLot(raw, m?.lot_size || '0.0001');
    if (!Number.isFinite(rounded) || rounded <= 0) throw new Error('Order size is below this market lot size');
    return String(rounded);
  }, []);

  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage = '0.5', leverage = 1) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    const phx = phoenixSymbol(symbol);
    return runOnce(`market:${walletAddr}:${phx}:${side}:${amount}:${leverage}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const ok = await activate();
        if (!ok) throw new Error('Phoenix account is not ready');
        const priceRow = pricesRef.current.find(p => p.symbol === phx);
        const mark = Number(priceRow?.mark || 0);
        const sideEnum = sideToPhoenix(side);
        const priceLimitUsd = mark > 0
          ? mark * (sideEnum === Side.Bid ? (1 + Number(slippage || 0.5) / 100) : (1 - Number(slippage || 0.5) / 100))
          : null;
        const packet = await client.orderPackets.buildMarketOrderPacket({
          symbol: phx,
          side: sideEnum,
          baseUnits: buildBaseUnitsFromMargin(phx, amount, leverage),
          priceLimitUsd,
        });
        const ix = await client.ixs.buildPlaceMarketOrder({
          authority: walletAddr,
          symbol: phx,
          orderPacket: packet,
          traderPdaIndex: 0,
          traderSubaccountIndex: 0,
        });
        const signature = await sendIxs(ix);
        await refreshTraderState();
        setTimeout(() => claimGold(), 3000);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix market order failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [activate, buildBaseUnitsFromMargin, claimGold, client, refreshTraderState, runOnce, sendIxs, walletAddr]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1) => {
    void _tif;
    if (!walletAddr) return { error: 'Wallet not connected' };
    const phx = phoenixSymbol(symbol);
    return runOnce(`limit:${walletAddr}:${phx}:${side}:${price}:${amount}:${leverage}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const ok = await activate();
        if (!ok) throw new Error('Phoenix account is not ready');
        const packet = await client.orderPackets.buildLimitOrderPacket({
          symbol: phx,
          side: sideToPhoenix(side),
          priceUsd: String(price),
          baseUnits: buildBaseUnitsFromMargin(phx, amount, leverage, Number(price)),
        });
        const ix = await client.ixs.buildPlaceLimitOrder({
          authority: walletAddr,
          symbol: phx,
          orderPacket: packet,
          traderPdaIndex: 0,
          traderSubaccountIndex: 0,
        });
        const signature = await sendIxs(ix);
        await refreshTraderState();
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix limit order failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [activate, buildBaseUnitsFromMargin, client, refreshTraderState, runOnce, sendIxs, walletAddr]);

  const closePosition = useCallback(async (symbol, side, amount) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    const phx = phoenixSymbol(symbol);
    return runOnce(`close:${walletAddr}:${phx}:${side}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const closeSide = side === 'bid' ? Side.Ask : Side.Bid;
        const existing = positions.find(p => p.symbol === phx && p.side === side)
          || positions.find(p => p.symbol === phx)
          || null;
        const subaccountIndex = Number(existing?._phoenixSubaccountIndex || 0);
        const m = marketsBySymbolRef.current[phx];
        const baseUnits = String(roundDownToLot(amount, m?.lot_size || '0.0001'));
        const packet = await client.orderPackets.buildMarketOrderPacket({
          symbol: phx,
          side: closeSide,
          baseUnits,
          orderFlags: OrderFlags.ReduceOnly || 128,
        });
        const ix = await client.ixs.buildPlaceMarketOrder({
          authority: walletAddr,
          symbol: phx,
          orderPacket: packet,
          traderPdaIndex: 0,
          traderSubaccountIndex: subaccountIndex,
        });
        const signature = await sendIxs(ix);
        await refreshTraderState();
        setTimeout(() => claimGold(), 3000);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix close failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [claimGold, client, positions, refreshTraderState, runOnce, sendIxs, walletAddr]);

  const cancelOrder = useCallback(async (symbol, orderId) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    const phx = phoenixSymbol(symbol);
    return runOnce(`cancel:${walletAddr}:${phx}:${orderId}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const existing = orders.find(o => String(o.order_id) === String(orderId) || String(o.orderSequenceNumber) === String(orderId));
        const subaccountIndex = Number(existing?._phoenixSubaccountIndex || 0);
        const ix = existing?.price
          ? await client.ixs.buildCancelOrdersById({
              authority: walletAddr,
              symbol: phx,
              orders: [{ price: Number(existing.price), orderSequenceNumber: existing.orderSequenceNumber || orderId }],
              traderPdaIndex: 0,
              traderSubaccountIndex: subaccountIndex,
            })
          : await client.ixs.buildCancelAll({
              authority: walletAddr,
              symbol: phx,
              traderPdaIndex: 0,
              traderSubaccountIndex: subaccountIndex,
            });
        const signature = await sendIxs(ix);
        await refreshTraderState();
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix cancel failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [client, orders, refreshTraderState, runOnce, sendIxs, walletAddr]);

  const setLeverage = useCallback(async () => ({ success: true }), []);
  const setMarginMode = useCallback(async (_symbol, isolated) => (
    isolated
      ? { error: 'Phoenix isolated subaccounts are readable, but new Clash orders are placed from cross margin.' }
      : { success: true }
  ), []);

  const setTpsl = useCallback(async (symbol, side, takeProfit, stopLoss) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    const phx = phoenixSymbol(symbol);
    return runOnce(`tpsl:${walletAddr}:${phx}:${side}:${takeProfit || ''}:${stopLoss || ''}`, async () => {
      setLoading(true);
      setError(null);
      try {
        if (!takeProfit && !stopLoss) return { success: true };
        const closeSide = sideToPhoenix(side);
        const expectedPositionSide = closeSide === Side.Ask ? 'bid' : 'ask';
        const position = positions.find(p => p.symbol === phx && p.side === expectedPositionSide)
          || positions.find(p => p.symbol === phx)
          || null;
        if (!position) throw new Error(`No open ${phx} position to attach TP/SL to`);
        const market = marketsBySymbolRef.current[phx];
        if (!market) throw new Error(`No Phoenix market metadata for ${phx}`);

        const isLong = position.side === 'bid';
        const subaccountIndex = Number(position._phoenixSubaccountIndex || 0);
        const buildTrigger = async (price, executionDirection) => client.ixs.buildPlaceStopLoss({
          authority: walletAddr,
          symbol: phx,
          triggerPrice: priceToTicks(price, market),
          tradeSide: closeSide,
          executionDirection,
          orderKind: StopLossOrderKind.IOC,
          traderPdaIndex: 0,
          traderSubaccountIndex: subaccountIndex,
        });

        const instructions = [];
        if (takeProfit) {
          const direction = isLong ? Direction.GreaterThan : Direction.LessThan;
          if (position._phoenixDirectTakeProfitPrice != null) {
            instructions.push(await client.ixs.buildCancelStopLoss({
              authority: walletAddr,
              symbol: phx,
              executionDirection: direction,
              traderPdaIndex: 0,
              traderSubaccountIndex: subaccountIndex,
            }));
          }
          instructions.push(await buildTrigger(takeProfit, direction));
        }
        if (stopLoss) {
          const direction = isLong ? Direction.LessThan : Direction.GreaterThan;
          if (position._phoenixDirectStopLossPrice != null) {
            instructions.push(await client.ixs.buildCancelStopLoss({
              authority: walletAddr,
              symbol: phx,
              executionDirection: direction,
              traderPdaIndex: 0,
              traderSubaccountIndex: subaccountIndex,
            }));
          }
          instructions.push(await buildTrigger(stopLoss, direction));
        }

        const signature = await sendIxs(instructions);
        await refreshTraderState();
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix TP/SL failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [client, positions, refreshTraderState, runOnce, sendIxs, walletAddr]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      if (!marketsRef.current.length) await fetchMarkets();
      else await fetchPrices();
      if (walletAddr) {
        await Promise.all([refreshTraderState(), fetchWalletUsdc()]);
      } else {
        setAccountReady(false);
        setDataReady(true);
      }
    }
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [fetchMarkets, fetchPrices, fetchWalletUsdc, isActiveDex, refreshTraderState, walletAddr]);

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    leverageSettings: {},
    marginModes: {},
    dataReady,
    accountReady,
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
    fetchAccount: refreshTraderState,
    fetchPositions: refreshTraderState,
    fetchOrders: refreshTraderState,
    isSelfCustody: true,
    isReady: true,
    setupVerified: true,
    walletMismatch,
    registeredEvmWallet: registeredSolanaWallet,
  };
}
