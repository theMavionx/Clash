import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useSignAndSendTransaction as usePrivySignAndSend, useSignTransaction as usePrivySignTransaction, useWallets as usePrivyWallets } from '@privy-io/react-auth/solana';
import { Direction, MarginType, OrderFlags, Side, StopLossOrderKind, priceUsdToTicks } from '@ellipsis-labs/rise';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { isFarcasterFrame } from './useFarcaster';
import {
  asPhoenixArray,
  getPhoenixClient,
  phoenixSymbol,
} from '../lib/phoenixClient';
import { sendPhoenixInstructions } from '../lib/phoenixTx';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;
const POLL_MS = 10_000;
const PHOENIX_PRICE_CACHE_MS = 15_000;
const PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS = 60_000;
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

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = finiteNumber(value);
    if (n != null) return n;
  }
  return null;
}

function tokenAmountValue(value) {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') {
    return finiteNumber(value);
  }
  const ui = finiteNumber(value.ui);
  if (ui != null) return ui;
  const raw = finiteNumber(value.value ?? value.amount ?? value.raw);
  const decimals = Number(value.decimals);
  if (raw != null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) {
    return raw / 10 ** decimals;
  }
  return raw;
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

function formatBaseUnits(value, lotSize) {
  const n = Number(value);
  const lot = Number(lotSize);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const decimals = Number.isFinite(lot) && lot > 0
    ? Math.max(0, String(lotSize).split('.')[1]?.length || 0)
    : Math.min(8, Math.max(0, String(value).split('.')[1]?.length || 0));
  return Number(n.toFixed(decimals)).toString();
}

function fundingBasisPointsToDecimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 10_000 : 0;
}

function fundingPercentageToDecimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 100 : 0;
}

function phoenixFundingToDecimal(row) {
  if (!row) return 0;
  if (row.fundingRatePercentage != null || row.currentFundingRatePercentage != null) {
    return fundingPercentageToDecimal(row.fundingRatePercentage ?? row.currentFundingRatePercentage);
  }
  return fundingBasisPointsToDecimal(row.fundingRate);
}

function phoenixTickSizeUsd(m) {
  const tickSizeRaw = Number(m?.tickSize ?? m?.units?.tickSizeInQuoteLotsPerBaseLot ?? 0);
  const baseLotsDecimals = Number(m?.baseLotsDecimals ?? m?.units?.baseLotsDecimals ?? 4);
  if (!Number.isFinite(tickSizeRaw) || tickSizeRaw <= 0) return 0.01;
  return tickSizeRaw * 10 ** baseLotsDecimals / 1_000_000;
}

function normalizeMarket(m) {
  const symbol = phoenixSymbol(m?.symbol);
  if (!symbol || String(m?.marketStatus || 'active').toLowerCase() !== 'active') return null;
  const tickSizeRaw = Number(m?.tickSize ?? m?.units?.tickSizeInQuoteLotsPerBaseLot ?? 0);
  const tickSize = phoenixTickSizeUsd(m);
  const baseLotsDecimals = Number(m?.baseLotsDecimals ?? m?.units?.baseLotsDecimals ?? 4);
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
    maker_fee: Number(m?.makerFee ?? m?.fees?.makerFee ?? 0.00005),
    taker_fee: Number(m?.takerFee ?? m?.fees?.takerFee ?? 0.00035),
    funding_rate: phoenixFundingToDecimal(m),
    next_funding_rate: phoenixFundingToDecimal(m),
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
    if (symbol && (latest?.fundingRate != null || latest?.fundingRatePercentage != null || latest?.currentFundingRatePercentage != null)) {
      bySymbol[symbol] = phoenixFundingToDecimal(latest);
    }
  }
  return markets.map(m => {
    const rate = bySymbol[m.symbol];
    return Number.isFinite(rate) ? { ...m, funding_rate: rate, next_funding_rate: rate } : m;
  });
}

function pricesFromFundingOverview(markets, fundingOverview) {
  const bySymbol = {};
  for (const series of fundingOverview?.series || []) {
    const symbol = phoenixSymbol(series?.symbol);
    const points = Array.isArray(series?.points) ? series.points : [];
    const latest = points.length ? points[points.length - 1] : null;
    const prev = points.length > 1 ? points[0] : latest;
    const mark = Number(latest?.markPrice ?? latest?.mark_price ?? latest?.price ?? 0);
    const previous = Number(prev?.markPrice ?? prev?.mark_price ?? mark);
    if (symbol && mark > 0) {
      bySymbol[symbol] = {
        symbol,
        mark: String(mark),
        oracle: String(mark),
        yesterday_price: previous > 0 ? String(previous) : String(mark),
        volume_24h: '0',
        open_interest: '0',
      };
    }
  }
  return markets
    .map(m => {
      const p = bySymbol[m.symbol];
      if (!p) return null;
      return {
        ...p,
        volume_24h: String(m?.volume_24h ?? 0),
        open_interest: String(m?.open_interest ?? 0),
      };
    })
    .filter(Boolean);
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

function collateralForTraderView(traderView) {
  return firstFinite(
    tokenAmountValue(traderView?.collateralBalance),
    tokenAmountValue(traderView?.effectiveCollateral),
    tokenAmountValue(traderView?.portfolioValue)
  ) || 0;
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
  const entry = firstFinite(p?.entryPriceUsd, p?.entryPrice, ticksToUsd(p?.entryPriceTicks, m)) || 0;
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

function positionFromTraderView(vp, traderView, snapshotRow, marketsBySymbol) {
  const symbol = phoenixSymbol(vp?.symbol);
  if (!symbol) return null;
  const m = marketsBySymbol.current[symbol];
  const lotDecimals = Number(m?._phoenixBaseLotsDecimals ?? 4);
  const snapshotBase = snapshotRow?.basePositionUnits != null
    ? Number(snapshotRow.basePositionUnits)
    : Number(snapshotRow?.basePositionLots || 0) / 10 ** lotDecimals;
  const sizeValue = tokenAmountValue(vp?.positionSize);
  const rawBase = Number.isFinite(sizeValue) && sizeValue !== 0 ? sizeValue : snapshotBase;
  if (!Number.isFinite(rawBase) || rawBase === 0) return null;

  const sideSign = rawBase >= 0 ? 1 : -1;
  const amount = Math.abs(rawBase);
  const entry = firstFinite(
    tokenAmountValue(vp?.entryPrice),
    snapshotRow?.entryPriceUsd,
    ticksToUsd(snapshotRow?.entryPriceTicks, m)
  ) || 0;
  const pnl = firstFinite(tokenAmountValue(vp?.unrealizedPnl), 0) || 0;
  const derivedMark = entry > 0 && amount > 0 ? entry + (pnl / amount) * sideSign : 0;
  const mark = firstFinite(derivedMark > 0 ? derivedMark : null, m?._mark, entry) || 0;
  const signedPositionValue = firstFinite(tokenAmountValue(vp?.positionValue), amount * (mark || entry || 0)) || 0;
  const positionValue = Math.abs(signedPositionValue);
  const accountCollateral = collateralForTraderView(traderView);
  const margin = firstFinite(
    tokenAmountValue(vp?.positionInitialMargin),
    tokenAmountValue(vp?.initialMargin),
    tokenAmountValue(traderView?.initialMargin),
    accountCollateral
  ) || 0;
  const leverageBase = accountCollateral > 0 ? accountCollateral : margin;
  const directTakeProfitPrice = firstFinite(tokenAmountValue(vp?.takeProfitPrice), activeTriggerPrice(snapshotRow?.takeProfitTriggers, m));
  const directStopLossPrice = firstFinite(tokenAmountValue(vp?.stopLossPrice), activeTriggerPrice(snapshotRow?.stopLossTriggers, m));
  const conditionalTakeProfitPrice = activeTriggerPrice(snapshotRow?.conditionalTakeProfitTriggers, m);
  const conditionalStopLossPrice = activeTriggerPrice(snapshotRow?.conditionalStopLossTriggers, m);
  const subaccountIndex = Number(traderView?.traderSubaccountIndex) || 0;
  const pnlPct = margin > 0 ? (pnl / margin) * 100 : (
    entry > 0 && mark > 0 ? ((mark - entry) / entry * 100 * sideSign) : 0
  );

  return {
    symbol,
    side: sideSign >= 0 ? 'bid' : 'ask',
    amount,
    size_usd: positionValue,
    entry_price: entry || mark,
    mark_price: mark || entry,
    liquidation_price: tokenAmountValue(vp?.liquidationPrice),
    margin,
    leverage: leverageBase > 0 && positionValue > 0 ? Math.round((positionValue / leverageBase) * 10) / 10 : null,
    pnl_usd: pnl,
    pnl_pct: pnlPct,
    is_isolated: Number(subaccountIndex) > 0,
    take_profit_price: directTakeProfitPrice ?? conditionalTakeProfitPrice,
    stop_loss_price: directStopLossPrice ?? conditionalStopLossPrice,
    market_addr: m?.market_addr || null,
    pair_index: null,
    trade_index: null,
    _phoenixSubaccountIndex: Number(subaccountIndex) || 0,
    _phoenixDirectTakeProfitPrice: directTakeProfitPrice,
    _phoenixDirectStopLossPrice: directStopLossPrice,
    _raw: snapshotRow || vp,
    _view: vp,
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
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const player = usePlayer();

  let privyWalletObj = null;
  let privySendTx = null;
  let privySignTx = null;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { wallets } = usePrivyWallets();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signAndSendTransaction } = usePrivySignAndSend();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signTransaction: signPrivyTransaction } = usePrivySignTransaction();
    privyWalletObj = (wallets || []).find(w => w && w.walletClientType === 'privy') || (wallets || [])[0] || null;
    privySendTx = signAndSendTransaction;
    privySignTx = signPrivyTransaction;
  }

  const privyAddr = privyWalletObj?.address || null;
  const adapterAddr = publicKey?.toBase58() || null;
  const inFarcasterFrame = isFarcasterFrame();
  const privyActive = !!privyAddr && (!inFarcasterFrame || !adapterAddr);
  const walletAddr = privyActive ? privyAddr : (adapterAddr || privyAddr || null);
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
  const [traderRegistered, setTraderRegistered] = useState(false);
  const [inviteStatus, setInviteStatus] = useState({ checking: false, whitelisted: null, codeUsed: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);

  const marketsRef = useRef([]);
  const marketsBySymbolRef = useRef({});
  const pricesRef = useRef([]);
  const pricesFetchedAtRef = useRef(0);
  const priceBackoffUntilRef = useRef(0);
  const subaccountsRef = useRef([]);
  const traderRegisteredRef = useRef(false);
  const tokenRef = useRef(null);
  const claimGoldRef = useRef(null);
  const claimInFlightRef = useRef(null);
  const lastClaimAtRef = useRef(0);
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
      signTransaction,
      privyActive,
      privySendTx,
      privySignTx,
      privyWalletObj,
      label: 'phoenix',
    });
  }, [ownerPk, connection, sendTransaction, signTransaction, privyActive, privySendTx, privySignTx, privyWalletObj]);

  const ensureConditionalOrdersAccountIx = useCallback(async (subaccountIndex = 0) => {
    if (!walletAddr) throw new Error('Wallet not connected');
    const traderAccount = await client.pda.getTraderAddress({
      authority: walletAddr,
      traderPdaIndex: 0,
      subaccountIndex: Number(subaccountIndex) || 0,
    });
    const conditionalOrders = await client.pda.getConditionalOrdersAddress({ traderAccount });
    const info = await connection.getAccountInfo(new PublicKey(conditionalOrders));
    if (info) return null;
    return client.ixs.buildCreateConditionalOrdersAccount({
      authority: walletAddr,
      traderPdaIndex: 0,
      traderSubaccountIndex: Number(subaccountIndex) || 0,
      capacity: 32,
    });
  }, [client, connection, walletAddr]);

  const claimGold = useCallback(async (opts = {}) => {
    if (!walletAddr) return null;
    const token = tokenRef.current || window._playerToken;
    if (!token) return null;
    if (claimInFlightRef.current) return claimInFlightRef.current;
    const now = Date.now();
    const minGap = opts.force ? 750 : 5000;
    if (now - lastClaimAtRef.current < minGap) return null;
    lastClaimAtRef.current = now;

    const promise = (async () => {
      if (opts.importFills !== false) {
        try {
          const importRes = await fetch(`${GAME_API}/futures/phoenix/import-fills?dex=phoenix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-token': token },
            body: JSON.stringify({ wallet: walletAddr }),
          });
          const importData = await importRes.json().catch(() => ({}));
          if (importRes.ok) {
            console.log('[Phoenix rewards] import-fills', importData);
          } else {
            console.warn('[Phoenix rewards] import-fills failed', importRes.status, importData);
          }
        } catch (e) {
          console.warn('[Phoenix rewards] import-fills request failed', e?.message || e);
        }
      }

      const res = await fetch(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'phoenix' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        console.warn('[Phoenix rewards] claim-gold rate limited', data);
        return data;
      }
      if (res.ok && data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Phoenix trading rewards' });
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      if (res.ok) {
        console.log('[Phoenix rewards] claim-gold', data);
      } else {
        console.warn('[Phoenix rewards] claim-gold failed', res.status, data);
      }
      return data;
    })();

    claimInFlightRef.current = promise;
    try {
      return await promise;
    } catch (e) {
      console.warn('[Phoenix rewards] claim-gold request failed', e?.message || e);
      return null;
    } finally {
      if (claimInFlightRef.current === promise) claimInFlightRef.current = null;
    }
  }, [walletAddr]);

  useEffect(() => {
    claimGoldRef.current = claimGold;
  }, [claimGold]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) return undefined;
    const fire = () => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn({ importFills: true });
    };
    const first = setTimeout(fire, 10_000);
    const iv = setInterval(fire, 45_000);
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

  const applyPriceRows = useCallback((rows) => {
    const next = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (!next.length) return pricesRef.current;
    const bySymbol = { ...marketsBySymbolRef.current };
    for (const p of next) {
      if (bySymbol[p.symbol]) bySymbol[p.symbol] = { ...bySymbol[p.symbol], _mark: Number(p.mark || 0) };
    }
    marketsBySymbolRef.current = bySymbol;
    pricesRef.current = next;
    pricesFetchedAtRef.current = Date.now();
    priceBackoffUntilRef.current = 0;
    setPrices(next);
    return next;
  }, []);

  const fetchPrices = useCallback(async (marketList = marketsRef.current, options = {}) => {
    if (!isActiveDex || !marketList.length) return [];
    if (options.overview) {
      return applyPriceRows(pricesFromFundingOverview(marketList, options.overview));
    }
    const now = Date.now();
    if (!options.force && pricesRef.current.length && now - pricesFetchedAtRef.current < PHOENIX_PRICE_CACHE_MS) {
      return pricesRef.current;
    }
    if (!options.force && now < priceBackoffUntilRef.current) {
      return pricesRef.current;
    }
    try {
      // One overview request returns markPrice for all markets. Avoid the old
      // N-markets -> N `/v1/market/{symbol}/stats` burst that quickly hit 429.
      const overview = await client.api.funding().getFundingOverview({ perMarketLimit: 2 });
      return applyPriceRows(pricesFromFundingOverview(marketList, overview));
    } catch (e) {
      const text = String(e?.message || e || '');
      if (/429|Too Many Requests/i.test(text) || Number(e?.status) === 429) {
        priceBackoffUntilRef.current = Date.now() + PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS;
      }
      return pricesRef.current;
    }
  }, [applyPriceRows, client, isActiveDex]);

  const fetchMarkets = useCallback(async () => {
    if (!isActiveDex) return [];
    try {
      const raw = await client.api.markets().getMarkets();
      const baseList = asPhoenixArray(raw).map(normalizeMarket).filter(Boolean);
      let list = baseList;
      let overview = null;
      try {
        overview = await client.api.funding().getFundingOverview({ perMarketLimit: 2 });
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
      fetchPrices(list, overview ? { overview } : {});
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
      const [state, viewState] = await Promise.all([
        client.api.traders().getTraderStateSnapshot(walletAddr, { traderPdaIndex: 0 }),
        client.api.traders().getTraderState(walletAddr, { pdaIndex: 0 }).catch(e => {
          console.warn('[Phoenix] trader view unavailable; falling back to snapshot math', e?.message || e);
          return null;
        }),
      ]);
      traderRegisteredRef.current = true;
      setTraderRegistered(true);
      const subaccounts = Array.isArray(state?.snapshot?.subaccounts) ? state.snapshot.subaccounts : [];
      subaccountsRef.current = subaccounts;
      const cross = subaccounts.find(s => Number(s.subaccountIndex) === 0) || subaccounts[0] || null;
      const snapshotRowsByKey = new Map();
      for (const sub of subaccounts) {
        const subIndex = Number(sub?.subaccountIndex) || 0;
        for (const row of sub?.positions || []) {
          const symbol = phoenixSymbol(row?.symbol);
          if (symbol) snapshotRowsByKey.set(`${subIndex}:${symbol}`, row);
        }
      }
      const viewTraders = Array.isArray(viewState?.traders) ? viewState.traders : [];
      const viewPositions = viewTraders
        .flatMap(trader => {
          const subIndex = Number(trader?.traderSubaccountIndex) || 0;
          return (trader?.positions || [])
            .map(row => positionFromTraderView(
              row,
              trader,
              snapshotRowsByKey.get(`${subIndex}:${phoenixSymbol(row?.symbol)}`),
              marketsBySymbolRef
            ))
            .filter(Boolean);
        });
      const fallbackPositions = subaccounts
        .flatMap(sub => {
          const subIndex = Number(sub?.subaccountIndex) || 0;
          const collateral = parseMaybeUsdc(sub?.collateral);
          return (sub?.positions || [])
            .map(p => positionFromSnapshot(p, marketsBySymbolRef, collateral, subIndex))
            .filter(Boolean);
        });
      const pos = viewPositions.length ? viewPositions : fallbackPositions;
      const ord = subaccounts.flatMap(sub => {
        const subIndex = Number(sub?.subaccountIndex) || 0;
        return (sub?.orders || []).flatMap(group => ordersFromSnapshot(group, marketsBySymbolRef, subIndex));
      });
      const notional = pos.reduce((sum, p) => sum + Number(p.size_usd || 0), 0);
      const marginUsed = pos.reduce((sum, p) => sum + Number(p.margin || 0), 0);
      const pnl = pos.reduce((sum, p) => sum + Number(p.pnl_usd || 0), 0);
      const crossView = viewTraders.find(t => Number(t?.traderSubaccountIndex) === 0) || viewTraders[0] || null;
      const crossCollateral = firstFinite(tokenAmountValue(crossView?.collateralBalance), parseMaybeUsdc(cross?.collateral)) || 0;
      const totalCollateral = viewTraders.length
        ? viewTraders.reduce((sum, t) => sum + collateralForTraderView(t), 0)
        : subaccounts.reduce((sum, s) => sum + parseMaybeUsdc(s?.collateral), 0);
      const equityFromView = viewTraders.reduce((sum, t) => sum + (tokenAmountValue(t?.portfolioValue) || 0), 0);
      const equity = Math.max(0, equityFromView > 0 ? equityFromView : totalCollateral + pnl);
      const crossMarginUsed = pos
        .filter(p => !p.is_isolated)
        .reduce((sum, p) => sum + Number(p.margin || 0), 0);
      const available = Math.max(0, firstFinite(tokenAmountValue(crossView?.effectiveCollateralForWithdrawals), crossCollateral - crossMarginUsed) || 0);
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
      setTraderRegistered(false);
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

  const checkInviteStatus = useCallback(async () => {
    if (!isActiveDex || !walletAddr) {
      setInviteStatus({ checking: false, whitelisted: null, codeUsed: null });
      return null;
    }
    setInviteStatus(prev => ({ ...prev, checking: true }));
    try {
      const check = await client.api.invite().checkWallet(walletAddr);
      const next = {
        checking: false,
        whitelisted: !!check?.whitelisted,
        codeUsed: check?.invite_code_used || null,
      };
      setInviteStatus(next);
      return check;
    } catch (e) {
      setInviteStatus(prev => ({ ...prev, checking: false }));
      return null;
    }
  }, [client, isActiveDex, walletAddr]);

  const activate = useCallback(async (inviteOptions = {}) => {
    if (!walletAddr) {
      setError('Wallet not connected');
      return false;
    }
    const inviteCode = String(
      inviteOptions?.code
      || inviteOptions?.inviteCode
      || inviteOptions?.accessCode
      || inviteOptions?.referralCode
      || ''
    ).trim();
    const inviteKind = String(
      inviteOptions?.inviteKind
      || inviteOptions?.codeType
      || (inviteOptions?.referralCode ? 'referral' : 'access')
    ).toLowerCase();
    return runOnce(`activate:${walletAddr}:${inviteKind}:${inviteCode}`, async () => {
      setLoading(true);
      setError(null);
      try {
        if (!traderRegisteredRef.current) {
          const check = await checkInviteStatus();
          if (!check?.whitelisted) {
            if (inviteCode) {
              if (inviteKind === 'referral') {
                await client.api.invite().activateInviteWithReferral({ authority: walletAddr, referral_code: inviteCode });
              } else {
                await client.api.invite().activateInvite({ authority: walletAddr, code: inviteCode });
              }
              setInviteStatus({ checking: false, whitelisted: true, codeUsed: inviteCode });
            } else if (PHOENIX_ACCESS_CODE) {
              await client.api.invite().activateInvite({ authority: walletAddr, code: PHOENIX_ACCESS_CODE });
              setInviteStatus({ checking: false, whitelisted: true, codeUsed: PHOENIX_ACCESS_CODE });
            } else if (PHOENIX_REFERRAL_CODE) {
              await client.api.invite().activateInviteWithReferral({ authority: walletAddr, referral_code: PHOENIX_REFERRAL_CODE });
              setInviteStatus({ checking: false, whitelisted: true, codeUsed: PHOENIX_REFERRAL_CODE });
            } else if (check) {
              setInviteStatus(prev => ({ ...prev, whitelisted: false }));
              throw new Error('Phoenix access code required');
            }
          }
          const ix = await client.ixs.buildRegisterTrader({
            authority: walletAddr,
            marginType: MarginType.Cross || 'cross',
          });
          await sendIxs(ix);
          traderRegisteredRef.current = true;
          setTraderRegistered(true);
        }
        await refreshTraderState();
        return true;
      } catch (e) {
        const text = e?.message || 'Phoenix activation failed';
        if (/already|exists|initialized/i.test(text)) {
          traderRegisteredRef.current = true;
          setTraderRegistered(true);
          await refreshTraderState();
          return true;
        }
        setError(text);
        return false;
      } finally {
        setLoading(false);
      }
    });
  }, [checkInviteStatus, client, refreshTraderState, runOnce, sendIxs, walletAddr]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || traderRegistered) return undefined;
    let cancelled = false;
    (async () => {
      if (!cancelled) await checkInviteStatus();
    })();
    return () => { cancelled = true; };
  }, [checkInviteStatus, isActiveDex, traderRegistered, walletAddr]);

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
        setTimeout(() => claimGold({ force: true }), 3000);
        setTimeout(() => claimGold({ force: true }), 12000);
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

  const closePosition = useCallback(async (symbol, side, amount, _pairIndex = null, _tradeIndex = null, fullClose = false) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    const phx = phoenixSymbol(symbol);
    return runOnce(`close:${walletAddr}:${phx}:${side}:${amount}:${fullClose ? 'full' : 'partial'}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const closeSide = side === 'bid' ? Side.Ask : Side.Bid;
        const existing = positions.find(p => p.symbol === phx && p.side === side)
          || positions.find(p => p.symbol === phx)
          || null;
        const subaccountIndex = Number(existing?._phoenixSubaccountIndex || 0);
        const m = marketsBySymbolRef.current[phx];
        const requested = Number(amount);
        const openAmount = Number(existing?.amount || 0);
        const amountToClose = fullClose && openAmount > 0
          ? openAmount
          : (openAmount > 0 && Number.isFinite(requested) ? Math.min(requested, openAmount) : requested);
        const roundedAmount = roundDownToLot(amountToClose, m?.lot_size || '0.0001');
        const baseUnits = formatBaseUnits(roundedAmount, m?.lot_size || '0.0001');
        if (!(Number(baseUnits) > 0)) throw new Error('Phoenix close amount is below this market lot size');
        const priceRow = pricesRef.current.find(p => p.symbol === phx);
        const mark = firstFinite(existing?.mark_price, priceRow?.mark, m?._mark, existing?.entry_price);
        const priceLimitUsd = mark > 0 ? mark * (closeSide === Side.Bid ? 1.03 : 0.97) : null;
        console.log('[Phoenix] closePosition', {
          symbol: phx,
          uiSide: side,
          closeSide: closeSide === Side.Bid ? 'bid' : 'ask',
          requested,
          openAmount,
          baseUnits,
          minBaseUnitsToFill: m?.lot_size || baseUnits,
          fullClose: !!fullClose,
          subaccountIndex,
          mark,
          priceLimitUsd,
        });
        const packet = await client.orderPackets.buildMarketOrderPacket({
          symbol: phx,
          side: closeSide,
          baseUnits,
          priceLimitUsd,
          minBaseUnitsToFill: m?.lot_size || baseUnits,
          minQuoteLotsToFill: null,
          orderFlags: OrderFlags.ReduceOnly || 128,
          cancelExisting: true,
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
        setTimeout(() => claimGold({ force: true }), 3000);
        setTimeout(() => claimGold({ force: true }), 12000);
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
        const mark = Number(position.mark_price || pricesRef.current.find(p => p.symbol === phx)?.mark || 0);
        const tp = takeProfit ? Number(takeProfit) : null;
        const sl = stopLoss ? Number(stopLoss) : null;
        if (tp != null && (!Number.isFinite(tp) || tp <= 0)) throw new Error('Enter a positive Phoenix TP price');
        if (sl != null && (!Number.isFinite(sl) || sl <= 0)) throw new Error('Enter a positive Phoenix SL price');
        if (mark > 0 && tp != null) {
          if (isLong && tp <= mark) throw new Error(`Phoenix long TP must be above mark ($${mark.toFixed(2)})`);
          if (!isLong && tp >= mark) throw new Error(`Phoenix short TP must be below mark ($${mark.toFixed(2)})`);
        }
        if (mark > 0 && sl != null) {
          if (isLong && sl >= mark) throw new Error(`Phoenix long SL must be below mark ($${mark.toFixed(2)})`);
          if (!isLong && sl <= mark) throw new Error(`Phoenix short SL must be above mark ($${mark.toFixed(2)})`);
        }

        const buildTriggerOrder = (price, triggerDirection) => {
          const n = Number(price);
          const executionPrice = closeSide === Side.Bid ? n * 1.02 : n * 0.98;
          return {
            triggerDirection,
            tradeSide: closeSide,
            orderKind: StopLossOrderKind.IOC,
            triggerPrice: priceToTicks(n, market),
            executionPrice: priceToTicks(executionPrice, market),
          };
        };

        let greaterTriggerOrder = null;
        let lessTriggerOrder = null;
        if (tp != null) {
          const direction = isLong ? Direction.GreaterThan : Direction.LessThan;
          const trigger = buildTriggerOrder(tp, direction);
          if (direction === Direction.GreaterThan) greaterTriggerOrder = trigger;
          else lessTriggerOrder = trigger;
        }
        if (sl != null) {
          const direction = isLong ? Direction.LessThan : Direction.GreaterThan;
          const trigger = buildTriggerOrder(sl, direction);
          if (direction === Direction.GreaterThan) greaterTriggerOrder = trigger;
          else lessTriggerOrder = trigger;
        }

        const createConditionalIx = await ensureConditionalOrdersAccountIx(subaccountIndex);
        const placeConditionalIx = await client.ixs.buildPlacePositionConditionalOrder({
          authority: walletAddr,
          symbol: phx,
          greaterTriggerOrder,
          lessTriggerOrder,
          sizePercent: 100,
          traderPdaIndex: 0,
          traderSubaccountIndex: subaccountIndex,
        });
        const instructions = [createConditionalIx, placeConditionalIx].filter(Boolean);
        console.log('[Phoenix] setTpsl', {
          symbol: phx,
          positionSide: position.side,
          closeSide: closeSide === Side.Bid ? 'bid' : 'ask',
          subaccountIndex,
          mark,
          takeProfit: tp,
          stopLoss: sl,
          createdConditionalAccount: !!createConditionalIx,
        });

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
  }, [client, ensureConditionalOrdersAccountIx, positions, refreshTraderState, runOnce, sendIxs, walletAddr]);

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
    isReady: !!walletAddr && traderRegistered,
    setupVerified: walletAddr ? (accountReady ? traderRegistered : null) : false,
    inviteStatus,
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
    walletMismatch,
    registeredEvmWallet: registeredSolanaWallet,
  };
}
