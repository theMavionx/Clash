import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPublicClient, createWalletClient, formatEther, http, parseAbiItem, parseEther, webSocket } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { CancelOrderType, MIN_OPEN_SIZE_USD, OrderType, OstiumClient } from '@ostium/builder-sdk';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import {
  ostiumOrderMatchesTarget,
  resolveOstiumCancelTarget,
} from '../lib/ostiumOrderCancel';
import {
  OSTIUM_BUILDER_ADDRESS,
  OSTIUM_BUILDER_FEE_BPS,
  OSTIUM_CHAIN_ID,
  OSTIUM_DELEGATE_MIN_ETH,
  OSTIUM_DELEGATE_TARGET_ETH,
  OSTIUM_MAX_ALLOWANCE_CHECK_USD,
  OSTIUM_ORACLE_FEE_BUFFER_USD,
  OSTIUM_ALCHEMY_WS_URL,
  OSTIUM_RPC_URL,
  OSTIUM_TRADING_CALLBACKS_ADDRESS,
  ostiumOracleFeeBufferMessage,
  ostiumClientConfig,
} from '../lib/ostiumConfig';
import {
  clearOstiumDelegate,
  ensureOstiumDelegate,
  loadOstiumDelegate,
  loadOstiumDelegates,
  saveOstiumDelegate,
} from '../lib/ostiumDelegateWallet';
import {
  validateOstiumStopLossDirection,
  validateOstiumTakeProfitDirection,
  validateOstiumTakeProfitLimit,
} from '../lib/ostiumTpLimits';
import {
  ostiumOpenTradeBlockMessage,
  ostiumOpenTradeBlockReason,
} from '../lib/ostiumMarketStatus';

const FUTURES_API = '/api/futures';
const POLL_INTERVAL_MS = 45_000;
const TX_TIMEOUT_MS = 120_000;
const CLAIM_LOOKBACK_ATTEMPTS = 5;
const ORDER_VISIBLE_TIMEOUT_MS = 45_000;
const ORDER_VISIBLE_POLL_MS = 800;
const ORDER_VISIBLE_BACKGROUND_TIMEOUT_MS = 60_000;
const ORDER_VISIBLE_BACKGROUND_POLL_MS = 1_000;
const CLOSE_SYNC_TIMEOUT_MS = 18_000;
const CLOSE_SYNC_POLL_MS = 900;
const TPSL_SYNC_TIMEOUT_MS = 20_000;
const TPSL_SYNC_POLL_MS = 1_000;
const PENDING_TPSL_TTL_MS = 120_000;
const PENDING_CLOSE_TTL_MS = 60_000;
const OSTIUM_OPTIMISTIC_ROW_TTL_MS = 75_000;
const OSTIUM_SDK_CLIENT_CACHE_MS = 2 * 60_000;
const OSTIUM_PRICE_STREAM_WS = 'wss://builder.ostium.io/v1/prices/stream';
const OSTIUM_LIVE_PRICE_FLUSH_MS = 750;
const OSTIUM_LIVE_PRICE_RECONNECT_MS = 2_500;
const OSTIUM_LIVE_PRICE_RECONNECT_MAX_MS = 60_000;
const OSTIUM_LIVE_SUBSCRIPTION_LIMIT = 48;
const OSTIUM_CLOSE_PERCENT_FULL = 10_000n;
const OSTIUM_OPEN_EXECUTED_EVENT = parseAbiItem(
  'event MarketOpenExecuted(uint256 indexed orderId, (uint256 collateral, uint192 openPrice, uint192 tp, uint192 sl, address trader, uint32 leverage, uint16 pairIndex, uint8 index, bool buy, bool isDayTrade) t, uint256 priceImpactP, uint256 tradeNotional)',
);
const OSTIUM_CLOSE_EXECUTED_EVENT = parseAbiItem(
  'event MarketCloseExecutedV2(uint256 indexed orderId, uint256 indexed tradeId, uint256 price, uint256 priceImpactP, int256 percentProfit, uint256 usdcSentToTrader, uint256 percentageClosed)',
);

function safeParseEther(value, fallback) {
  try { return parseEther(String(value || fallback)); } catch { return parseEther(fallback); }
}

const DELEGATE_GAS_MIN_WEI = safeParseEther(OSTIUM_DELEGATE_MIN_ETH, '0.00005');
const DELEGATE_GAS_TARGET_WEI = safeParseEther(OSTIUM_DELEGATE_TARGET_ETH, '0.00030');
const OSTIUM_TRADING_DELEGATION_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'delegator', type: 'address' }],
    name: 'delegations',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];
function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function trimNumber(value, decimals = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(decimals).replace(/0+$/u, '').replace(/\.$/u, '') || '0';
}

function ostiumAvailableUsdc(account) {
  const fields = [
    account?.usdc_balance,
    account?.wallet_usdc,
    account?.available_to_spend,
    account?.free_margin,
    account?.available_to_withdraw,
  ];
  for (const value of fields) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return null;
}

function assertOstiumUsdcBalance(account, requiredCollateral) {
  const required = Number(requiredCollateral);
  if (!Number.isFinite(required) || required <= 0) throw new Error('Enter a valid margin amount');
  const available = ostiumAvailableUsdc(account);
  if (available == null) {
    throw new Error('Could not verify Ostium USDC balance. Refresh balance and try again.');
  }
  const maxMargin = Math.max(0, available - OSTIUM_ORACLE_FEE_BUFFER_USD);
  if (required > maxMargin + 0.000001) {
    throw new Error(ostiumOracleFeeBufferMessage(maxMargin, available));
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

function normalizeSide(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'short' || s === 'sell' ? 'ask' : 'bid';
}

function slippagePercentToBps(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.max(1, Math.min(500, Math.round(n * 100)));
}

function formatEthAmount(valueWei) {
  try {
    const text = formatEther(valueWei || 0n);
    const n = Number(text);
    if (!Number.isFinite(n)) return text;
    return n.toFixed(6).replace(/0+$/u, '').replace(/\.$/u, '') || '0';
  } catch {
    return '0';
  }
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/-PERP$/u, '').replace('-', '/');
}

function positivePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function openTpslOption(options, keys) {
  if (!options || typeof options !== 'object') return undefined;
  for (const key of keys) {
    const price = positivePrice(options[key]);
    if (price != null) return String(price);
  }
  return undefined;
}

function pricesNear(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return false;
  const tolerance = Math.max(0.000001, Math.abs(right) * 0.00001);
  return Math.abs(left - right) <= tolerance;
}

function optimisticRowKey(prefix, symbol, side, txHash = '', extra = '') {
  return [
    prefix,
    normalizeSymbol(symbol),
    normalizeSide(side),
    String(txHash || ''),
    String(extra || ''),
    Date.now(),
  ].join(':');
}

function pendingTpslKey({ symbol, pairIndex, tradeIndex }) {
  const pair = pairIndex != null && Number.isFinite(Number(pairIndex)) ? String(Number(pairIndex)) : '';
  const trade = tradeIndex != null && Number.isFinite(Number(tradeIndex)) ? String(Number(tradeIndex)) : '';
  return `${normalizeSymbol(symbol)}:${pair}:${trade}`;
}

function numericId(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positionPairIndex(row) {
  return numericId(row?.pair_index ?? row?.pairIndex ?? row?.pair_id ?? row?._raw?.pairId ?? row?._raw?.position?.pairId);
}

function positionTradeIndex(row) {
  return numericId(row?.trade_index ?? row?.tradeIndex ?? row?.idx ?? row?._raw?.idx ?? row?._raw?.position?.idx);
}

function positionPid(row) {
  return String(row?.pid ?? row?._raw?.pid ?? row?._raw?.position?.pid ?? '').trim();
}

function positionIdentity(row) {
  return String(row?.position_id ?? row?.positionId ?? row?.id ?? row?.positionKey ?? row?._raw?.key ?? row?._raw?.positionKey ?? '').trim();
}

function positionIdentityMatchesId(row, id) {
  const target = String(id ?? '').trim();
  if (!target) return false;
  const values = [
    positionPid(row),
    row?.orderId,
    row?.order_id,
    row?._raw?.orderId,
    row?._raw?.position?.orderId,
    positionIdentity(row),
  ];
  return values.some((value) => {
    const text = String(value ?? '').trim();
    if (!text) return false;
    return text === target || text.split(/[:|]/u).includes(target);
  });
}

function positionSide(row) {
  return normalizeSide(row?.side ?? row?.raw_side ?? row?._raw?.side ?? row?._raw?.position?.side);
}

function pendingCloseKey(pending) {
  return [
    normalizeSymbol(pending?.symbol),
    normalizeSide(pending?.side),
    pending?.pairIndex ?? '',
    pending?.tradeIndex ?? '',
    pending?.pid || '',
    pending?.id || '',
  ].join(':');
}

function createPendingClose(position, { symbol, side, pairIndex, tradeIndex, txHash } = {}) {
  const pending = {
    symbol: normalizeSymbol(position?.symbol || position?.display_symbol || symbol),
    side: normalizeSide(position?.side || side),
    pairIndex: positionPairIndex(position) ?? numericId(pairIndex),
    tradeIndex: positionTradeIndex(position) ?? numericId(tradeIndex),
    pid: positionPid(position),
    id: positionIdentity(position),
    txHash: txHash || null,
    createdAt: Date.now(),
    expiresAt: Date.now() + PENDING_CLOSE_TTL_MS,
  };
  pending.key = pendingCloseKey(pending);
  return pending;
}

function positionMatchesPendingClose(row, pending) {
  if (!row || !pending) return false;
  const rowPair = positionPairIndex(row);
  const rowTrade = positionTradeIndex(row);
  const rowPid = positionPid(row);
  const rowId = positionIdentity(row);
  const rowSymbol = normalizeSymbol(row?.symbol || row?.display_symbol || row?._raw?.symbol);
  const rowSide = positionSide(row);

  if (pending.pairIndex != null && rowPair != null && rowPair !== pending.pairIndex) return false;
  if (pending.tradeIndex != null && rowTrade != null && rowTrade !== pending.tradeIndex) return false;
  if (pending.pid && rowPid && rowPid !== pending.pid) return false;
  if (pending.id && rowId && rowId !== pending.id) return false;
  if (pending.symbol && rowSymbol && rowSymbol !== pending.symbol) return false;
  if (pending.side && rowSide && rowSide !== pending.side) return false;

  return Boolean(
    (pending.pairIndex != null && rowPair != null)
    || (pending.tradeIndex != null && rowTrade != null)
    || (pending.pid && rowPid)
    || (pending.id && rowId)
    || (pending.symbol && rowSymbol && pending.side && rowSide)
  );
}

function filterPendingClosedPositions(rows, pendingMap, now = Date.now()) {
  const list = Array.isArray(rows) ? rows : [];
  if (!pendingMap?.size || !list.length) {
    if (pendingMap?.size) {
      for (const [key, pending] of pendingMap.entries()) {
        if (!pending || pending.expiresAt <= now) pendingMap.delete(key);
      }
    }
    return { rows: list, suppressed: 0 };
  }

  for (const [key, pending] of pendingMap.entries()) {
    if (!pending || pending.expiresAt <= now) pendingMap.delete(key);
  }
  if (!pendingMap.size) return { rows: list, suppressed: 0 };

  let suppressed = 0;
  const nextRows = [];
  for (const row of list) {
    let hidden = false;
    for (const pending of pendingMap.values()) {
      if (positionMatchesPendingClose(row, pending)) {
        hidden = true;
        break;
      }
    }
    if (hidden) suppressed += 1;
    else nextRows.push(row);
  }

  for (const [key, pending] of pendingMap.entries()) {
    if (!list.some(row => positionMatchesPendingClose(row, pending))) {
      pendingMap.delete(key);
    }
  }

  return { rows: suppressed > 0 ? nextRows : list, suppressed };
}

function positionMatchesPendingTpsl(row, pending) {
  if (!row || !pending) return false;
  const rowPair = row?.pair_index ?? row?.pairIndex ?? row?._raw?.pairId;
  if (pending.pairIndex != null && rowPair != null && Number(rowPair) !== Number(pending.pairIndex)) return false;
  const rowTrade = row?.trade_index ?? row?.tradeIndex ?? row?.idx ?? row?._raw?.idx;
  if (pending.tradeIndex != null && rowTrade != null && Number(rowTrade) !== Number(pending.tradeIndex)) return false;
  const rowSymbol = normalizeSymbol(row?.symbol || row?.display_symbol || row?._raw?.symbol);
  return !pending.symbol || !rowSymbol || rowSymbol === normalizeSymbol(pending.symbol);
}

function readPositionTpsl(row, leg) {
  if (leg === 'tp') {
    return positivePrice(
      row?.take_profit
        ?? row?.takeProfit
        ?? row?.take_profit_price
        ?? row?.takeProfitPrice
        ?? row?.tp
        ?? row?._raw?.tpPx
        ?? row?._raw?.takeProfit
        ?? row?._raw?.take_profit
    );
  }
  return positivePrice(
    row?.stop_loss
      ?? row?.stopLoss
      ?? row?.stop_loss_price
      ?? row?.stopLossPrice
      ?? row?.sl
      ?? row?._raw?.slPx
      ?? row?._raw?.stopLoss
      ?? row?._raw?.stop_loss
  );
}

function mergePendingTpslRows(rows, pendingMap, now = Date.now()) {
  if (!pendingMap?.size || !Array.isArray(rows) || !rows.length) return Array.isArray(rows) ? rows : [];
  return rows.map((row) => {
    let next = row;
    for (const [key, pending] of pendingMap.entries()) {
      if (!pending || pending.expiresAt <= now) {
        pendingMap.delete(key);
        continue;
      }
      if (!positionMatchesPendingTpsl(row, pending)) continue;
      const actualTp = readPositionTpsl(row, 'tp');
      const actualSl = readPositionTpsl(row, 'sl');
      const tpConfirmed = pending.takeProfit == null || pricesNear(actualTp, pending.takeProfit);
      const slConfirmed = pending.stopLoss == null || pricesNear(actualSl, pending.stopLoss);
      if (tpConfirmed && slConfirmed) {
        pendingMap.delete(key);
        continue;
      }
      next = {
        ...next,
        _ostiumPendingTpsl: true,
        ...(pending.takeProfit != null && !tpConfirmed ? {
          take_profit: pending.takeProfit,
          _ostiumOptimisticTakeProfitPrice: pending.takeProfit,
        } : {}),
        ...(pending.stopLoss != null && !slConfirmed ? {
          stop_loss: pending.stopLoss,
          _ostiumOptimisticStopLossPrice: pending.stopLoss,
        } : {}),
      };
    }
    return next;
  });
}

function ostiumStreamPair(symbol) {
  const raw = String(symbol || '').toUpperCase().trim();
  if (!raw) return '';
  if (raw.includes('-') || raw.includes('/')) {
    const [base, quote = 'USD'] = raw.split(/[-/]/u);
    return `${base.trim()}-${quote.trim() || 'USD'}`;
  }
  return `${raw}-USD`;
}

function ostiumTickPrice(tick) {
  const price = Number(tick?.mid ?? tick?.mark ?? tick?.mark_price ?? tick?.price ?? tick?.bid ?? tick?.ask);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function ostiumTickSymbol(tick) {
  const explicit = tick?.symbol || tick?.name || tick?.market || tick?.market_name || tick?.pair;
  if (explicit) {
    const text = String(explicit).toUpperCase().trim();
    if (text.includes('-') || text.includes('/')) {
      const [base, quote = 'USD'] = text.split(/[-/]/u);
      return normalizeSymbol(`${base}/${quote || 'USD'}`);
    }
    return normalizeSymbol(text);
  }
  const from = String(tick?.from || tick?.base || '').toUpperCase().trim();
  const to = String(tick?.to || tick?.quote || 'USD').toUpperCase().trim();
  return from ? normalizeSymbol(`${from}/${to || 'USD'}`) : '';
}

function ostiumTicksFromPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload?.type === 'tick') return payload.data ? [payload.data] : [];
  if (payload?.type === 'snapshot' && Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.prices)) return payload.prices;
  if (Array.isArray(payload?.ticks)) return payload.ticks;
  return payload?.data && typeof payload.data === 'object' ? [payload.data] : [payload];
}

function rowSymbolMatches(row, symbol) {
  const target = normalizeSymbol(symbol);
  if (!target) return false;
  const compactTarget = target.replace(/[/\s-]/gu, '');
  const candidates = [
    row?.symbol,
    row?.display_symbol,
    row?.pair,
    row?.market,
    row?.market_name,
    row?._raw?.symbol,
    row?._raw?.pair,
    row?._raw?.market,
    row?._raw?.market_name,
  ];
  return candidates.some((value) => {
    const normalized = normalizeSymbol(value);
    if (!normalized) return false;
    const compact = normalized.replace(/[/\s-]/gu, '');
    return normalized === target
      || compact === compactTarget
      || normalized.split('/')[0] === target.split('/')[0];
  });
}

function priceDeltaMeaningful(current, next) {
  const left = Number(current);
  const right = Number(next);
  if (!Number.isFinite(left) || left <= 0) return true;
  if (!Number.isFinite(right) || right <= 0) return false;
  return Math.abs(left - right) > Math.max(0.0000001, Math.abs(right) * 0.0000001);
}

function applyOstiumLiveTicksToPrices(rows, ticks) {
  if (!Array.isArray(ticks) || !ticks.length) return Array.isArray(rows) ? rows : [];
  const bySymbol = new Map();
  for (const tick of ticks) {
    const symbol = ostiumTickSymbol(tick);
    const price = ostiumTickPrice(tick);
    if (symbol && price != null) bySymbol.set(symbol, { symbol, price, tick });
  }
  if (!bySymbol.size) return Array.isArray(rows) ? rows : [];
  const list = Array.isArray(rows) ? rows : [];
  let changed = false;
  const nextRows = list.map((row) => {
    let match = null;
    for (const item of bySymbol.values()) {
      if (rowSymbolMatches(row, item.symbol)) {
        match = item;
        break;
      }
    }
    if (!match) return row;
    const current = row?.mark ?? row?.mark_price ?? row?.price ?? row?.mid;
    if (!priceDeltaMeaningful(current, match.price)) return row;
    changed = true;
    return {
      ...row,
      mark: match.price,
      mark_price: match.price,
      price: match.price,
      mid: match.price,
      _ostiumLivePrice: true,
      _ostiumLivePriceAt: Date.now(),
    };
  });
  return changed ? nextRows : list;
}

function ostiumPositionAmount(row, entry) {
  const direct = Math.abs(num(row?.amount ?? row?.base_amount ?? row?.baseAmount ?? row?.position ?? row?.qty, 0));
  if (direct > 0) return direct;
  const sizeUsd = Math.abs(num(row?.size_usd ?? row?.sizeUsd ?? row?.notional_usd ?? row?.notionalUsd, 0));
  return entry > 0 && sizeUsd > 0 ? sizeUsd / entry : 0;
}

function ostiumPositionSideMultiplier(row) {
  const text = String(row?.side ?? row?.raw_side ?? row?._raw?.position?.side ?? row?._raw?.side ?? '').toLowerCase();
  if (text === 'ask' || text === 'short' || text === 'sell' || text === 'false') return -1;
  if (text === 'bid' || text === 'long' || text === 'buy' || text === 'true') return 1;
  if (row?.isLong === false || row?.long === false || row?.buy === false) return -1;
  return 1;
}

function applyOstiumLiveTicksToPositions(rows, ticks) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(ticks) || !ticks.length) return Array.isArray(rows) ? rows : [];
  const bySymbol = new Map();
  for (const tick of ticks) {
    const symbol = ostiumTickSymbol(tick);
    const price = ostiumTickPrice(tick);
    if (symbol && price != null) bySymbol.set(symbol, price);
  }
  if (!bySymbol.size) return rows;
  let changed = false;
  const nextRows = rows.map((row) => {
    let livePrice = null;
    for (const [symbol, price] of bySymbol.entries()) {
      if (rowSymbolMatches(row, symbol)) {
        livePrice = price;
        break;
      }
    }
    if (livePrice == null) return row;
    const entry = positivePrice(row?.entry_price ?? row?.entryPrice ?? row?._raw?.position?.entryPx ?? row?._raw?.entryPx);
    const amount = entry ? ostiumPositionAmount(row, entry) : 0;
    const margin = num(row?.margin ?? row?.collateral ?? row?._raw?.position?.collateralUsed, 0);
    const currentMark = row?.mark_price ?? row?.mark ?? row?.price;
    const markChanged = priceDeltaMeaningful(currentMark, livePrice);
    if (!entry || !amount) {
      if (!markChanged) return row;
      changed = true;
      return {
        ...row,
        mark_price: livePrice,
        mark: livePrice,
        price: livePrice,
        _ostiumLivePrice: true,
        _ostiumLivePriceAt: Date.now(),
      };
    }
    const pnlUsdRaw = (livePrice - entry) * amount * ostiumPositionSideMultiplier(row);
    const pnlUsd = Math.abs(pnlUsdRaw) < 0.0000001 ? 0 : pnlUsdRaw;
    const pnlPct = margin > 0 ? (pnlUsd / margin) * 100 : row?.pnl_pct;
    const oldPnl = Number(row?.pnl_usd);
    const pnlChanged = !Number.isFinite(oldPnl) || Math.abs(oldPnl - pnlUsd) > 0.005;
    const oldPct = Number(row?.pnl_pct);
    const pctChanged = Number.isFinite(Number(pnlPct)) && (!Number.isFinite(oldPct) || Math.abs(oldPct - Number(pnlPct)) > 0.005);
    if (!markChanged && !pnlChanged && !pctChanged) return row;
    changed = true;
    return {
      ...row,
      mark_price: livePrice,
      mark: livePrice,
      price: livePrice,
      pnl_usd: pnlUsd,
      pnl_source: 'ostium_live_stream',
      ...(Number.isFinite(Number(pnlPct)) ? {
        pnl_pct: Number(pnlPct),
        pnl_pct_source: 'ostium_live_stream',
        return_on_equity: margin > 0 ? pnlUsd / margin : row?.return_on_equity,
      } : {}),
      _ostiumLivePrice: true,
      _ostiumLivePriceAt: Date.now(),
    };
  });
  return changed ? nextRows : rows;
}

function gasWithBuffer(value, fallback = 30_000n, bufferBps = 2_000n) {
  const gas = typeof value === 'bigint' && value > 0n ? value : fallback;
  return (gas * (10_000n + bufferBps) + 9_999n) / 10_000n;
}

function isGasLimitTooLowError(text) {
  return /gas required exceeds allowance\s*\(21000\)|intrinsic gas too low|out of gas|gas limit/i.test(String(text || ''));
}

function isGasFundingError(text) {
  return /insufficient funds|insufficient.*gas|gas.*balance|native token balance/i.test(String(text || ''));
}

function errorMessage(error, fallback = 'Ostium request failed') {
  const chain = [error, error?.cause, error?.cause?.cause].filter(Boolean);
  for (const item of chain) {
    const text = item?.shortMessage || item?.reason || item?.details || item?.message;
    if (!text) continue;
    if (/Too Many Requests|rate[_\s-]?limit|\b429\b/i.test(text)) {
      return 'Ostium is rate-limiting requests. Wait a few seconds, then try again.';
    }
    if (item?.code === 'WRONG_EVM_CHAIN') return String(text).slice(0, 300);
    if (/user rejected|denied|rejected the request/i.test(text)) return 'Signature cancelled';
    if (isGasLimitTooLowError(text)) return 'Ostium setup used too low gas. Reload and retry; Clash will send an explicit Arbitrum gas limit.';
    if (isGasFundingError(text)) return 'Not enough ETH on Arbitrum for Ostium one tap gas top-up.';
    if (/usdc.*allowance|allowance.*usdc|approve.*usdc|insufficient allowance|erc20.*allowance/i.test(text)) {
      return 'USDC allowance is not ready. Approve USDC and retry.';
    }
    const minCollateral = String(text).match(/collateral\s+([0-9.]+)\s+below minimum\s+([0-9.]+)/i);
    if (minCollateral) return `Ostium minimum margin is ${minCollateral[2]} USDC. Your margin is ${minCollateral[1]} USDC.`;
    return String(text).slice(0, 300);
  }
  return fallback;
}

function isOstiumValidationError(error) {
  const chain = [error, error?.cause, error?.cause?.cause].filter(Boolean);
  return chain.some((item) => {
    const code = String(item?.code || item?.name || '').toLowerCase();
    const text = String(item?.shortMessage || item?.reason || item?.details || item?.message || '').toLowerCase();
    return code.includes('validation')
      || /validation failed|below minimum|exceeds maximum|invalid collateral|invalid leverage|invalid price|invalid pair|invalid amount/.test(text);
  });
}

function findBySymbol(rows, symbol) {
  const target = String(symbol || '').toUpperCase().replace(/-PERP$/u, '').replace('-', '/');
  return (rows || []).find(row => (
    String(row?.symbol || '').toUpperCase() === target
    || String(row?.display_symbol || '').toUpperCase() === target
    || String(row?.pair || '').toUpperCase() === target
    || String(row?.market_name || '').toUpperCase() === target
    || String(row?.pair || '').toUpperCase().split('/')[0] === target
    || String(row?.market_name || '').toUpperCase().split('/')[0] === target
  )) || null;
}

function priceFromRows(rows, symbol, pairId = null) {
  const byPair = pairId != null
    ? (rows || []).find(row => String(row?.pair_index ?? row?.pairIndex ?? row?.market_id ?? row?.marketId) === String(pairId))
    : null;
  const row = byPair || findBySymbol(rows, symbol);
  return positivePrice(row?.mark ?? row?.mid ?? row?.oracle ?? row?.price ?? row?.last_price);
}

function symbolRowCount(rows, symbol) {
  return symbolRows(rows, symbol).length;
}

function symbolRows(rows, symbol) {
  const target = String(symbol || '').toUpperCase().replace(/-PERP$/u, '').replace('-', '/');
  if (!target) return [];
  return (rows || []).filter(row => (
    String(row?.symbol || '').toUpperCase() === target
    || String(row?.display_symbol || '').toUpperCase() === target
    || String(row?.pair || '').toUpperCase() === target
    || String(row?.market_name || '').toUpperCase() === target
    || String(row?.pair || '').toUpperCase().split('/')[0] === target
    || String(row?.market_name || '').toUpperCase().split('/')[0] === target
  ));
}

function symbolExposure(rows, symbol) {
  return symbolRows(rows, symbol).reduce((sum, row) => {
    const amount = Math.abs(num(row?.amount ?? row?.size ?? row?.qty, 0));
    const notional = Math.abs(num(row?.notional_usd ?? row?.position_value ?? row?.value_usd, 0));
    return sum + (notional > 0 ? notional : amount);
  }, 0);
}

function trimOstiumOptimisticRows(map, actualRows, matcher, now = Date.now()) {
  if (!map?.size) return [];
  for (const [key, row] of map.entries()) {
    if (!row || Number(row._optimisticExpiresAt || 0) <= now) {
      map.delete(key);
      continue;
    }
    if ((actualRows || []).some(actual => matcher(actual, row))) {
      map.delete(key);
    }
  }
  return Array.from(map.values());
}

function ostiumOptimisticPositionMatches(actual, pending) {
  if (!actual || !pending) return false;
  const actualSymbol = normalizeSymbol(actual.symbol || actual.display_symbol || actual.pair || actual.market_name);
  const pendingSymbol = normalizeSymbol(pending.symbol || pending.display_symbol || pending.pair || pending.market_name);
  if (actualSymbol && pendingSymbol && actualSymbol !== pendingSymbol) return false;
  const actualSide = normalizeSide(actual.side || actual.raw_side);
  const pendingSide = normalizeSide(pending.side || pending.raw_side);
  if (actualSide && pendingSide && actualSide !== pendingSide) return false;
  const actualPair = numericId(actual.pair_index ?? actual.pairIndex);
  const pendingPair = numericId(pending.pair_index ?? pending.pairIndex);
  if (actualPair != null && pendingPair != null && actualPair !== pendingPair) return false;
  return Boolean(actualSymbol || actualPair != null);
}

function ostiumOptimisticOrderMatches(actual, pending) {
  if (!actual || !pending) return false;
  const actualSymbol = normalizeSymbol(actual.symbol || actual.display_symbol || actual.pair || actual.market_name);
  const pendingSymbol = normalizeSymbol(pending.symbol || pending.display_symbol || pending.pair || pending.market_name);
  if (actualSymbol && pendingSymbol && actualSymbol !== pendingSymbol) return false;
  const actualSide = normalizeSide(actual.side || actual.raw_side);
  const pendingSide = normalizeSide(pending.side || pending.raw_side);
  if (actualSide && pendingSide && actualSide !== pendingSide) return false;
  const actualPair = numericId(actual.pair_index ?? actual.pairIndex);
  const pendingPair = numericId(pending.pair_index ?? pending.pairIndex);
  if (actualPair != null && pendingPair != null && actualPair !== pendingPair) return false;
  const actualPrice = positivePrice(actual.price ?? actual.limit_price ?? actual.trigger_price);
  const pendingPrice = positivePrice(pending.price ?? pending.limit_price ?? pending.trigger_price);
  if (actualPrice != null && pendingPrice != null && !pricesNear(actualPrice, pendingPrice)) return false;
  return Boolean(actualSymbol || actualPair != null);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || data?.message || `HTTP ${res.status}`);
  return data;
}

async function waitForReceipt(publicClient, hash) {
  if (!publicClient?.waitForTransactionReceipt) return null;
  try {
    return await publicClient.waitForTransactionReceipt({ hash, timeout: TX_TIMEOUT_MS });
  } catch (error) {
    if (/timed? ?out|WaitForTransactionReceipt/i.test(String(error?.message || error))) {
      const err = new Error('Transaction is still pending. Check your wallet activity before retrying.');
      err.code = 'TX_TIMEOUT';
      throw err;
    }
    throw error;
  }
}

export function useOstium() {
  const { dex } = useDex();
  const isActiveDex = dex === 'ostium';
  const {
    address,
    getWalletClient,
    getPublicClient,
    ensureChain,
    source: walletSource,
    sendTransaction: sendPrivyTransaction,
  } = useEvmWallet();
  const player = usePlayer();
  const walletAddr = address || null;

  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [walletUsdcStatus, setWalletUsdcStatus] = useState({
    status: 'idle',
    message: 'Connect wallet to check Arbitrum USDC balance',
    chainId: null,
  });
  const [delegateSigner, setDelegateSigner] = useState(null);
  const [delegateStatus, setDelegateStatus] = useState({
    enabled: false,
    approved: false,
    signer: null,
    gasBalanceEth: null,
    gasReady: false,
    allowanceReady: false,
    delegateReady: false,
    message: null,
  });
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [oneTapWalletFallback, setOneTapWalletFallback] = useState(null);

  const marketsRef = useRef([]);
  const pricesRef = useRef([]);
  const claimGoldRef = useRef(null);
  const importFillsRef = useRef(null);
  const linkedWalletRef = useRef({ key: '', promise: null });
  const positionsRef = useRef([]);
  const ordersRef = useRef([]);
  const delegateSignerRef = useRef(null);
  const pendingTpslRef = useRef(new Map());
  const pendingCloseRef = useRef(new Map());
  const optimisticPositionsRef = useRef(new Map());
  const optimisticOrdersRef = useRef(new Map());
  const submissionLocksRef = useRef(new Set());
  const selfClientCacheRef = useRef({ key: null, at: 0, promise: null });
  const delegatedClientCacheRef = useRef(new Map());

  const token = useMemo(() => (
    (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null
  ), [player?.token]);

  const authHeaders = useCallback((extra = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token, 'x-dex': 'ostium' } : {}),
    };
    for (const [key, value] of Object.entries(extra)) {
      if (value == null) delete headers[key];
      else headers[key] = value;
    }
    return headers;
  }, [token]);

  const ensureOstiumWalletLinked = useCallback(async () => {
    const normalizedWallet = String(walletAddr || '').trim().toLowerCase();
    if (!token || !isEvmAddress(normalizedWallet)) return false;
    const key = `${token}:${normalizedWallet}`;
    if (linkedWalletRef.current.key === key && linkedWalletRef.current.promise) {
      return linkedWalletRef.current.promise;
    }
    const promise = fetchJson('/api/players/dex-accounts/ostium/link', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        wallet: normalizedWallet,
        walletSource: walletSource || 'evm-wallet',
      }),
    }).then(() => true).catch((error) => {
      linkedWalletRef.current = { key: '', promise: null };
      throw error;
    });
    linkedWalletRef.current = { key, promise };
    return promise;
  }, [authHeaders, token, walletAddr, walletSource]);

  useEffect(() => {
    if (!isActiveDex || !token || !isEvmAddress(walletAddr)) return;
    ensureOstiumWalletLinked().catch((error) => {
      console.warn('[useOstium] dex wallet link failed:', error?.message || error);
    });
  }, [ensureOstiumWalletLinked, isActiveDex, token, walletAddr]);

  const ostiumLivePairKey = useMemo(() => {
    if (!isActiveDex) return '';
    const symbols = new Set();
    const addSymbol = (value) => {
      const normalized = normalizeSymbol(value);
      if (!normalized || symbols.size >= OSTIUM_LIVE_SUBSCRIPTION_LIMIT) return;
      symbols.add(normalized);
    };
    for (const row of positions || []) {
      addSymbol(row?.symbol || row?.display_symbol || row?.pair || row?.market_name);
    }
    for (const row of markets || []) {
      if (symbols.size >= OSTIUM_LIVE_SUBSCRIPTION_LIMIT) break;
      addSymbol(row?.symbol || row?.display_symbol || row?.pair || row?.market_name);
    }
    return Array.from(symbols)
      .map(ostiumStreamPair)
      .filter(Boolean)
      .sort()
      .join('|');
  }, [isActiveDex, markets, positions]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const clearOneTapWalletFallback = useCallback(() => setOneTapWalletFallback(null), []);

  useEffect(() => {
    delegateSignerRef.current = delegateSigner;
  }, [delegateSigner]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) setOneTapWalletFallback(null);
  }, [isActiveDex, walletAddr]);

  useEffect(() => {
    selfClientCacheRef.current = { key: null, at: 0, promise: null };
    delegatedClientCacheRef.current.clear();
  }, [walletAddr]);

  const createBuildClient = useCallback(async () => {
    if (!walletAddr || !isEvmAddress(walletAddr)) throw new Error('Connect your EVM wallet first');
    const key = String(walletAddr).toLowerCase();
    const cached = selfClientCacheRef.current;
    if (cached.promise && cached.key === key && Date.now() - cached.at < OSTIUM_SDK_CLIENT_CACHE_MS) {
      return cached.promise;
    }
    const promise = OstiumClient.createSelfAndSelf(ostiumClientConfig({
      traderAddress: walletAddr,
    }));
    selfClientCacheRef.current = { key, at: Date.now(), promise };
    try {
      return await promise;
    } catch (e) {
      if (selfClientCacheRef.current.promise === promise) {
        selfClientCacheRef.current = { key: null, at: 0, promise: null };
      }
      throw e;
    }
  }, [walletAddr]);

  const createDelegatedClient = useCallback(async (signer = delegateSignerRef.current) => {
    if (!walletAddr || !isEvmAddress(walletAddr)) throw new Error('Connect your EVM wallet first');
    if (!signer?.privateKey) throw new Error('Ostium one tap signer is not ready');
    const key = `${String(walletAddr).toLowerCase()}:${String(signer.address || '').toLowerCase()}`;
    const cached = delegatedClientCacheRef.current.get(key);
    if (cached?.promise && Date.now() - cached.at < OSTIUM_SDK_CLIENT_CACHE_MS) {
      return cached.promise;
    }
    const promise = OstiumClient.createDelegatedAndSelf(ostiumClientConfig({
      traderAddress: walletAddr,
      delegatePrivateKey: signer.privateKey,
    }));
    delegatedClientCacheRef.current.set(key, { at: Date.now(), promise });
    try {
      return await promise;
    } catch (e) {
      if (delegatedClientCacheRef.current.get(key)?.promise === promise) {
        delegatedClientCacheRef.current.delete(key);
      }
      throw e;
    }
  }, [walletAddr]);

  const requireOstiumWalletClient = useCallback(async () => {
    if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
    const walletClient = typeof getWalletClient === 'function' ? getWalletClient(OSTIUM_CHAIN_ID) : null;
    if (!walletClient?.sendTransaction) {
      throw new Error('Connect an Arbitrum-capable EVM wallet first.');
    }
    return walletClient;
  }, [ensureChain, getWalletClient]);

  const sendWalletTransaction = useCallback(async ({
    to,
    data,
    value = 0n,
    gas,
    label = 'ostium.tx',
    uiOptions = {},
  }) => {
    if (walletSource === 'privy') {
      if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
      if (typeof sendPrivyTransaction !== 'function') {
        throw new Error('Privy embedded wallet transaction sender is not ready');
      }
      const tx = {
        to,
        ...(data ? { data } : {}),
        ...(value != null ? { value } : {}),
        ...(gas ? { gas } : {}),
        chainId: OSTIUM_CHAIN_ID,
      };
      console.info('[useOstium] privy tx send', {
        label,
        to,
        hasData: Boolean(data),
        valueEth: formatEthAmount(value || 0n),
        gas: gas ? gas.toString() : null,
      });
      const result = await sendPrivyTransaction(tx, {
        uiOptions: {
          showWalletUIs: false,
          ...uiOptions,
        },
      });
      return result?.hash || result?.txHash || result;
    }
    const walletClient = await requireOstiumWalletClient();
    return walletClient.sendTransaction({
      account: walletAddr,
      to,
      data,
      value,
      ...(gas ? { gas } : {}),
    });
  }, [ensureChain, requireOstiumWalletClient, sendPrivyTransaction, walletAddr, walletSource]);

  const estimateWalletTxGas = useCallback(async ({ account, to, data, value = 0n, label = 'ostium.tx', fallback = 180_000n, requireSuccess = false }) => {
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    if (!publicClient?.estimateGas) return gasWithBuffer(fallback, fallback);
    try {
      const estimated = await publicClient.estimateGas({
        account,
        to,
        ...(data ? { data } : {}),
        value,
      });
      return gasWithBuffer(estimated, fallback);
    } catch (e) {
      console.warn(`[useOstium] ${label} gas estimate failed:`, e?.message || e);
      if (requireSuccess) {
        const error = new Error(`${label} preflight reverted`);
        error.code = 'OSTIUM_TX_PREFLIGHT_FAILED';
        error.cause = e;
        throw error;
      }
      return gasWithBuffer(fallback, fallback);
    }
  }, [getPublicClient]);

  const sendBuiltTx = useCallback(async (tx, label = 'ostium.tx', { requireSuccessfulEstimate = false } = {}) => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    if (tx?.kind !== 'eoa') throw new Error('Ostium returned a non-EOA transaction. This integration supports EOA wallet signing only.');
    if (tx?.from && String(tx.from).toLowerCase() !== String(walletAddr).toLowerCase()) {
      throw new Error('Ostium transaction signer does not match connected wallet');
    }
    const value = tx.value || 0n;
    const gas = await estimateWalletTxGas({
      account: walletAddr,
      to: tx.to,
      data: tx.data,
      value,
      label,
      fallback: tx?.data ? 180_000n : 30_000n,
      requireSuccess: requireSuccessfulEstimate,
    });
    console.info('[useOstium] wallet tx send', {
      label,
      to: tx.to,
      hasData: Boolean(tx.data),
      valueEth: formatEthAmount(value),
      gas: gas.toString(),
    });
    const hash = await sendWalletTransaction({
      to: tx.to,
      data: tx.data,
      value,
      gas,
      label,
    });
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt?.status && receipt.status !== 'success') throw new Error(`${label} reverted`);
    return { txHash: hash, receipt };
  }, [estimateWalletTxGas, getPublicClient, sendWalletTransaction, walletAddr]);

  const waitForSubmittedTx = useCallback(async (result, label = 'ostium.delegate_tx') => {
    const hash = result?.txHash || result?.hash;
    if (!hash) throw new Error(`${label} did not return a transaction hash`);
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt?.status && receipt.status !== 'success') throw new Error(`${label} reverted`);
    return { txHash: hash, receipt };
  }, [getPublicClient]);

  const getTradingContractAddress = useCallback(async (client, delegateAddress) => {
    const tx = client.getSetDelegateTx(delegateAddress);
    return tx?.to || null;
  }, []);

  const readRegisteredDelegate = useCallback(async (client, delegateAddress) => {
    if (!walletAddr || !delegateAddress) return null;
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    if (!publicClient?.readContract) return null;
    const trading = await getTradingContractAddress(client, delegateAddress);
    if (!trading) return null;
    try {
      return await publicClient.readContract({
        address: trading,
        abi: OSTIUM_TRADING_DELEGATION_ABI,
        functionName: 'delegations',
        args: [walletAddr],
      });
    } catch (e) {
      console.warn('[useOstium] delegation read failed:', e?.message || e);
      return null;
    }
  }, [getPublicClient, getTradingContractAddress, walletAddr]);

  const delegateGasBalance = useCallback(async (delegateAddress) => {
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    if (!publicClient?.getBalance || !delegateAddress) return null;
    return publicClient.getBalance({ address: delegateAddress });
  }, [getPublicClient]);

  const sendDelegateBuiltTx = useCallback(async (tx, signer, label = 'ostium.delegate_tx', { requireSuccessfulEstimate = false } = {}) => {
    if (!signer?.privateKey) throw new Error('Ostium one tap signer is not ready');
    if (tx?.kind !== 'eoa') throw new Error('Ostium delegate transaction must be an EOA transaction');
    const delegateAccount = privateKeyToAccount(signer.privateKey);
    if (tx?.from && String(tx.from).toLowerCase() !== delegateAccount.address.toLowerCase()) {
      throw new Error('Ostium delegate transaction signer does not match local delegate wallet');
    }
    const value = tx.value || 0n;
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    let gas;
    if (publicClient?.estimateGas) {
      gas = await publicClient.estimateGas({
        account: delegateAccount.address,
        to: tx.to,
        data: tx.data,
        value,
      }).then((estimated) => gasWithBuffer(estimated, 180_000n)).catch((e) => {
        console.warn(`[useOstium] ${label} delegate gas estimate failed:`, e?.message || e);
        if (requireSuccessfulEstimate) {
          const error = new Error(`${label} preflight reverted`);
          error.code = 'OSTIUM_TX_PREFLIGHT_FAILED';
          error.cause = e;
          throw error;
        }
        return gasWithBuffer(180_000n, 180_000n);
      });
    }
    const walletClient = createWalletClient({
      account: delegateAccount,
      chain: arbitrum,
      transport: http(OSTIUM_RPC_URL || undefined),
    });
    console.info('[useOstium] delegate tx send', {
      label,
      to: tx.to,
      delegate: delegateAccount.address,
      hasData: Boolean(tx.data),
      valueEth: formatEthAmount(value),
      gas: gas ? gas.toString() : null,
    });
    const hash = await walletClient.sendTransaction({
      account: delegateAccount,
      chain: arbitrum,
      to: tx.to,
      data: tx.data,
      value,
      ...(gas ? { gas } : {}),
    });
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt?.status && receipt.status !== 'success') throw new Error(`${label} reverted`);
    return { txHash: hash, receipt };
  }, [getPublicClient]);

  const topUpDelegateGas = useCallback(async (delegateAddress, { force = false } = {}) => {
    if (!walletAddr || !delegateAddress) throw new Error('Ostium delegate wallet is missing');
    const current = await delegateGasBalance(delegateAddress);
    if (current != null && current >= DELEGATE_GAS_MIN_WEI && !force) {
      return { skipped: true, balanceWei: current, balanceEth: formatEther(current) };
    }
    const target = DELEGATE_GAS_TARGET_WEI > DELEGATE_GAS_MIN_WEI ? DELEGATE_GAS_TARGET_WEI : DELEGATE_GAS_MIN_WEI;
    const amount = current == null ? target : target - current;
    if (amount <= 0n) return { skipped: true, balanceWei: current, balanceEth: formatEther(current || 0n) };
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    const walletBalance = publicClient?.getBalance
      ? await publicClient.getBalance({ address: walletAddr }).catch(() => null)
      : null;
    let gasCost = 0n;
    let gasLimit = gasWithBuffer(30_000n, 30_000n);
    if (publicClient?.estimateGas && publicClient?.getGasPrice) {
      const [estimatedGas, gasPrice] = await Promise.all([
        publicClient.estimateGas({
          account: walletAddr,
          to: delegateAddress,
          value: amount,
        }).catch((e) => {
          console.warn('[useOstium] delegate gas top-up estimate failed:', e?.message || e);
          return 30_000n;
        }),
        publicClient.getGasPrice().catch(() => 0n),
      ]);
      gasLimit = gasWithBuffer(estimatedGas, 30_000n);
      gasCost = gasLimit * gasPrice;
    }
    const required = amount + gasCost;
    if (walletBalance != null && walletBalance < required) {
      const err = new Error(`Need ${formatEthAmount(required)} ETH on Arbitrum for Ostium one tap gas top-up. Your Arbitrum ETH balance is ${formatEthAmount(walletBalance)} ETH.`);
      err.code = 'OSTIUM_DELEGATE_GAS_INSUFFICIENT';
      err.requiredWei = required;
      err.balanceWei = walletBalance;
      throw err;
    }
    console.info('[useOstium] delegate gas top-up', {
      delegate: delegateAddress,
      amountEth: formatEthAmount(amount),
      walletEth: walletBalance == null ? null : formatEthAmount(walletBalance),
      estimatedGasEth: formatEthAmount(gasCost),
      requiredEth: formatEthAmount(required),
      gas: gasLimit.toString(),
    });
    const hash = await sendWalletTransaction({
      to: delegateAddress,
      value: amount,
      gas: gasLimit,
      label: 'ostium.delegate_gas_top_up',
    });
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt?.status && receipt.status !== 'success') throw new Error('Ostium delegate gas top-up reverted');
    return {
      txHash: hash,
      amountWei: amount,
      amountEth: formatEther(amount),
      balanceWei: current == null ? null : current + amount,
      balanceEth: current == null ? null : formatEther(current + amount),
    };
  }, [delegateGasBalance, getPublicClient, sendWalletTransaction, walletAddr]);

  const ensureMaxAllowance = useCallback(async (client) => {
    const allowance = await client.checkUsdcAllowance(OSTIUM_MAX_ALLOWANCE_CHECK_USD);
    if (allowance?.sufficient) return { skipped: true, current: allowance.current };
    const tx = client.getApproveUsdcTx('max');
    return sendBuiltTx(tx, 'ostium.approve_usdc_max');
  }, [sendBuiltTx]);

  const ensureAllowance = useCallback(async (client, collateralUsd) => {
    const needed = String(Math.max(0, Number(collateralUsd) || 0));
    const allowance = await client.checkUsdcAllowance(needed);
    if (allowance?.sufficient) return null;
    const tx = client.getApproveUsdcTx('max');
    return sendBuiltTx(tx, 'ostium.approve_usdc');
  }, [sendBuiltTx]);

  const loadDelegateCandidates = useCallback(async (preferredSigner = null) => {
    const rows = [];
    const push = (signer) => {
      if (!signer?.privateKey || !signer?.address) return;
      const key = String(signer.address).toLowerCase();
      if (rows.some(row => String(row.address).toLowerCase() === key)) return;
      rows.push(signer);
    };
    push(preferredSigner);
    push(delegateSignerRef.current);
    const stored = await loadOstiumDelegates(walletAddr).catch(() => []);
    stored.forEach(push);
    return rows;
  }, [walletAddr]);

  const promoteDelegateSigner = useCallback(async (signer, reason = 'unknown') => {
    if (!signer?.privateKey) return null;
    setDelegateSigner(signer);
    delegateSignerRef.current = signer;
    await saveOstiumDelegate(walletAddr, signer).catch((e) => {
      console.warn('[useOstium] failed to save promoted delegate:', e?.message || e);
    });
    console.info('[useOstium] one tap delegate selected', {
      reason,
      delegate: signer.address,
      wallet: walletAddr,
    });
    return signer;
  }, [walletAddr]);

  const findRegisteredDelegateSigner = useCallback(async (client, preferredSigner = null) => {
    const candidates = await loadDelegateCandidates(preferredSigner);
    if (!candidates.length) return { signer: null, registered: null, candidates };
    const registered = await readRegisteredDelegate(client, candidates[0].address);
    const registeredKey = String(registered || '').toLowerCase();
    const signer = registeredKey
      ? candidates.find(row => String(row.address).toLowerCase() === registeredKey) || null
      : null;
    if (signer && String(preferredSigner?.address || '').toLowerCase() !== registeredKey) {
      await promoteDelegateSigner(signer, 'registered_on_chain');
    }
    return { signer, registered, candidates };
  }, [loadDelegateCandidates, promoteDelegateSigner, readRegisteredDelegate]);

  const refreshDelegateStatus = useCallback(async (providedSigner = null) => {
    if (!walletAddr || !isEvmAddress(walletAddr)) {
      setDelegateSigner(null);
      delegateSignerRef.current = null;
      setDelegateStatus({
        enabled: false,
        approved: false,
        signer: null,
        gasBalanceEth: null,
        gasReady: false,
        allowanceReady: false,
        delegateReady: false,
        message: 'Connect wallet to enable Ostium one tap',
      });
      return null;
    }
    try {
      const client = await createBuildClient();
      const registeredMatch = await findRegisteredDelegateSigner(client, providedSigner);
      const signer = registeredMatch.signer
        || providedSigner
        || delegateSignerRef.current
        || await loadOstiumDelegate(walletAddr);
      if (!signer?.privateKey) {
        setDelegateSigner(null);
        delegateSignerRef.current = null;
        setDelegateStatus({
          enabled: false,
          approved: false,
          signer: null,
          gasBalanceEth: null,
          gasReady: false,
          allowanceReady: false,
          delegateReady: false,
          message: 'Ostium one tap is off',
        });
        return null;
      }
      setDelegateSigner(signer);
      delegateSignerRef.current = signer;
      const [registered, gasWei, allowance] = await Promise.all([
        Promise.resolve(registeredMatch.registered || readRegisteredDelegate(client, signer.address)),
        delegateGasBalance(signer.address),
        client.checkUsdcAllowance(OSTIUM_MAX_ALLOWANCE_CHECK_USD).catch(() => null),
      ]);
      const delegateReady = String(registered || '').toLowerCase() === String(signer.address).toLowerCase();
      const gasReady = gasWei != null ? gasWei >= DELEGATE_GAS_MIN_WEI : false;
      const allowanceReady = allowance?.sufficient === true;
      const next = {
        enabled: true,
        approved: delegateReady && gasReady && allowanceReady,
        signer: signer.address,
        gasBalanceEth: gasWei == null ? null : formatEther(gasWei),
        gasReady,
        allowanceReady,
        delegateReady,
        registeredDelegate: registered || null,
        message: delegateReady && gasReady && allowanceReady
          ? 'Ostium one tap ready'
          : !allowanceReady
          ? 'USDC allowance needs approval'
          : !delegateReady && !gasReady
          ? 'Approve delegate and keep a small Arbitrum ETH balance'
          : !delegateReady
          ? 'Approve Ostium delegate on Arbitrum'
          : 'Need small Arbitrum ETH balance for one tap',
      };
      setDelegateStatus(next);
      return { ...next, privateKey: signer.privateKey };
    } catch (e) {
      const msg = errorMessage(e, 'Failed to check Ostium one tap');
      console.warn('[useOstium] one tap status:', msg);
      setDelegateStatus(status => ({
        ...status,
        approved: false,
        message: msg,
      }));
      return null;
    }
  }, [createBuildClient, delegateGasBalance, findRegisteredDelegateSigner, readRegisteredDelegate, walletAddr]);

  const ensureOneTapReady = useCallback(async ({ topUpGas = true, requireAllowance = true, setupIfNeeded = true } = {}) => {
    if (!walletAddr || !isEvmAddress(walletAddr)) throw new Error('Connect your EVM wallet first');
    if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
    const selfClient = await createBuildClient();
    const registeredMatch = await findRegisteredDelegateSigner(selfClient);
    const signer = registeredMatch.signer || (setupIfNeeded
      ? await ensureOstiumDelegate(walletAddr)
      : (delegateSignerRef.current || await loadOstiumDelegate(walletAddr)));
    if (!signer?.privateKey) throw new Error('Ostium one tap is not enabled');
    await promoteDelegateSigner(signer, registeredMatch.signer ? 'ensure_ready_registered' : 'ensure_ready_active');
    if (requireAllowance) {
      if (setupIfNeeded) {
        await ensureMaxAllowance(selfClient);
      } else {
        const allowance = await selfClient.checkUsdcAllowance(OSTIUM_MAX_ALLOWANCE_CHECK_USD).catch(() => null);
        if (allowance?.sufficient !== true) throw new Error('Ostium one tap needs USDC allowance approval before opening trades.');
      }
    }
    const registered = registeredMatch.registered || await readRegisteredDelegate(selfClient, signer.address);
    if (String(registered || '').toLowerCase() !== String(signer.address).toLowerCase()) {
      if (!setupIfNeeded) throw new Error('Ostium one tap delegate is not approved on-chain.');
      const tx = selfClient.getSetDelegateTx(signer.address);
      await sendBuiltTx(tx, 'ostium.set_delegate');
    }
    const gasWei = await delegateGasBalance(signer.address).catch(() => null);
    if (gasWei != null && gasWei < DELEGATE_GAS_MIN_WEI && !(topUpGas && setupIfNeeded)) {
      throw new Error(`Ostium one tap delegate needs Arbitrum ETH gas top-up. Current delegate gas is ${formatEthAmount(gasWei)} ETH.`);
    }
    if (topUpGas && setupIfNeeded) await topUpDelegateGas(signer.address);
    await refreshDelegateStatus(signer);
    return signer;
  }, [createBuildClient, delegateGasBalance, ensureChain, ensureMaxAllowance, findRegisteredDelegateSigner, promoteDelegateSigner, readRegisteredDelegate, refreshDelegateStatus, sendBuiltTx, topUpDelegateGas, walletAddr]);

  const submitWithDelegateOrWallet = useCallback(async ({
    buildSelfTx,
    buildDelegateTx = null,
    submitDelegate,
    label,
    requiredCollateral = null,
    allowWalletFallback = true,
    requireAllowance = true,
    setupIfNeeded = true,
    topUpGas = true,
    forceWallet = false,
    dedupeKey = null,
    requireSuccessfulEstimate = false,
  }) => {
    const lockKey = dedupeKey || label;
    if (submissionLocksRef.current.has(lockKey)) {
      throw new Error('Ostium is already submitting this action. Wait for the current transaction to finish.');
    }
    submissionLocksRef.current.add(lockKey);
    try {
      if (forceWallet) {
        const selfClient = await createBuildClient();
        if (requiredCollateral != null) await ensureAllowance(selfClient, requiredCollateral);
        const tx = buildSelfTx(selfClient);
        return sendBuiltTx(tx, `${label}.wallet`, { requireSuccessfulEstimate });
      }
      const existingSigner = delegateSignerRef.current || await loadOstiumDelegate(walletAddr).catch(() => null);
      const hadOneTapEnabled = !!existingSigner?.privateKey;
      try {
        const signer = await ensureOneTapReady({ topUpGas, requireAllowance, setupIfNeeded });
        const delegatedClient = await createDelegatedClient(signer);
        if (typeof buildDelegateTx === 'function') {
          // Avoid SDK submitPrepared here: it fire-and-forgets Ostium /v1/trade
          // attribution after the tx hash, and that endpoint is user-visible
          // as noisy 429s in the browser console.
          const tx = buildDelegateTx(delegatedClient);
          return await sendDelegateBuiltTx(tx, signer, `${label}.delegated`, { requireSuccessfulEstimate });
        }
        const result = await submitDelegate(delegatedClient);
        return await waitForSubmittedTx(result, `${label}.delegated`);
      } catch (delegateError) {
        const text = String(delegateError?.message || delegateError || '');
        if (/user rejected|denied|cancelled/i.test(text)) throw delegateError;
        if (isOstiumValidationError(delegateError)) throw delegateError;
        const fallbackBlocked = allowWalletFallback === false
          || (allowWalletFallback === 'when_one_tap_enabled' && hadOneTapEnabled);
        if (fallbackBlocked) {
          await refreshDelegateStatus(existingSigner).catch(() => null);
          const err = new Error(`Ostium one tap failed for ${label.replace(/^ostium\./u, '')}: ${text || 'delegated submission failed'}`);
          err.code = 'OSTIUM_ONE_TAP_FAILED';
          err.cause = delegateError;
          throw err;
        }
        console.warn('[useOstium] delegated path failed, falling back to wallet signature:', text);
        const selfClient = await createBuildClient();
        if (requiredCollateral != null) await ensureAllowance(selfClient, requiredCollateral);
        const tx = buildSelfTx(selfClient);
        return sendBuiltTx(tx, `${label}.self`, { requireSuccessfulEstimate });
      }
    } finally {
      submissionLocksRef.current.delete(lockKey);
    }
  }, [createBuildClient, createDelegatedClient, ensureAllowance, ensureOneTapReady, refreshDelegateStatus, sendBuiltTx, sendDelegateBuiltTx, waitForSubmittedTx, walletAddr]);

  const fetchMarkets = useCallback(async () => {
    try {
      const rows = await fetchJson(`${FUTURES_API}/markets?dex=ostium`);
      const next = Array.isArray(rows) ? rows : [];
      marketsRef.current = next;
      setMarkets(next);
      return next;
    } catch (e) {
      const msg = errorMessage(e, 'Failed to load Ostium markets');
      setError(msg);
      return [];
    }
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const rows = await fetchJson(`${FUTURES_API}/prices?dex=ostium`);
      const next = Array.isArray(rows) ? rows : [];
      pricesRef.current = next;
      setPrices(next);
      return next;
    } catch (e) {
      console.warn('[useOstium] prices:', e?.message || e);
      return [];
    }
  }, []);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr) {
      pendingTpslRef.current.clear();
      pendingCloseRef.current.clear();
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setWalletUsdc(null);
      setDataReady(false);
      setWalletUsdcStatus({
        status: 'idle',
        message: 'Connect wallet to check Arbitrum USDC balance',
        chainId: null,
      });
      return;
    }
    try {
      const noStore = { cache: 'no-store' };
      const [acct, pos, ord] = await Promise.all([
        fetchJson(`${FUTURES_API}/account?dex=ostium&address=${encodeURIComponent(walletAddr)}`, noStore),
        fetchJson(`${FUTURES_API}/positions?dex=ostium&address=${encodeURIComponent(walletAddr)}`, noStore).catch(() => []),
        fetchJson(`${FUTURES_API}/orders?dex=ostium&address=${encodeURIComponent(walletAddr)}`, noStore).catch(() => []),
      ]);
      const mergedPositions = mergePendingTpslRows(Array.isArray(pos) ? pos : [], pendingTpslRef.current);
      const closeFiltered = filterPendingClosedPositions(mergedPositions, pendingCloseRef.current);
      const optimisticPositions = trimOstiumOptimisticRows(
        optimisticPositionsRef.current,
        closeFiltered.rows,
        ostiumOptimisticPositionMatches,
      );
      const nextPositions = closeFiltered.rows.concat(optimisticPositions);
      const nextAccount = acct && closeFiltered.suppressed > 0
        ? { ...acct, positions_count: nextPositions.length }
        : (acct || null);
      setAccount(nextAccount);
      const baseOrders = Array.isArray(ord) ? ord : [];
      const optimisticOrders = trimOstiumOptimisticRows(
        optimisticOrdersRef.current,
        baseOrders,
        ostiumOptimisticOrderMatches,
      );
      const nextOrders = baseOrders.concat(optimisticOrders);
      positionsRef.current = nextPositions;
      ordersRef.current = nextOrders;
      setPositions(nextPositions);
      setOrders(nextOrders);
      setWalletUsdc(num(acct?.usdc_balance, 0));
      setWalletUsdcStatus({
        status: 'ready',
        message: null,
        chainId: OSTIUM_CHAIN_ID,
        checkedAt: Date.now(),
      });
      setDataReady(true);
      return { account: nextAccount, positions: nextPositions, orders: nextOrders };
    } catch (e) {
      const msg = errorMessage(e, 'Failed to load Ostium account');
      console.warn('[useOstium] account:', msg);
      setError(msg);
      setDataReady(false);
      setWalletUsdcStatus({
        status: 'error',
        message: msg,
        chainId: OSTIUM_CHAIN_ID,
      });
      return null;
    }
  }, [walletAddr]);

  const waitForTradeVisible = useCallback(async ({ symbol, kind, beforePositions, beforeOrders, timeoutMs = ORDER_VISIBLE_TIMEOUT_MS, pollMs = ORDER_VISIBLE_POLL_MS }) => {
    const startedAt = Date.now();
    const beforePositionCount = symbolRowCount(beforePositions, symbol);
    const beforeOrderCount = symbolRowCount(beforeOrders, symbol);
    const beforePositionExposure = symbolExposure(beforePositions, symbol);
    let lastFresh = null;

    while (Date.now() - startedAt < timeoutMs) {
      lastFresh = await fetchAccount();
      const freshPositions = lastFresh?.positions || positionsRef.current || [];
      const freshOrders = lastFresh?.orders || ordersRef.current || [];
      if (kind === 'position') {
        const nextCount = symbolRowCount(freshPositions, symbol);
        const nextExposure = symbolExposure(freshPositions, symbol);
        if (nextCount > beforePositionCount) return lastFresh;
        if (beforePositionCount === 0 && findBySymbol(freshPositions, symbol)) return lastFresh;
        if (beforePositionCount > 0 && Math.abs(nextExposure - beforePositionExposure) > 0.000001) return lastFresh;
      } else {
        const nextCount = symbolRowCount(freshOrders, symbol);
        if (nextCount > beforeOrderCount) return lastFresh;
        if (beforeOrderCount === 0 && findBySymbol(freshOrders, symbol)) return lastFresh;
      }
      await sleep(pollMs);
    }

    // Keep the latest refresh in state even if Ostium indexing is slower
    // than usual. The tx is already confirmed; background polling will catch up.
    return lastFresh;
  }, [fetchAccount]);

  const pollTradeVisibleInBackground = useCallback((args) => {
    const startedAt = Date.now();
    let stopped = false;
    const run = async () => {
      if (stopped || Date.now() - startedAt >= ORDER_VISIBLE_BACKGROUND_TIMEOUT_MS) return;
      try {
        await fetchAccount();
        const map = args?.kind === 'position' ? optimisticPositionsRef.current : optimisticOrdersRef.current;
        if (args?.optimisticKey && !map.has(args.optimisticKey)) return;
      } catch (e) {
        console.warn('[useOstium] post-submit visibility poll failed:', e?.message || e);
      }
      if (!stopped) setTimeout(run, ORDER_VISIBLE_BACKGROUND_POLL_MS);
    };
    setTimeout(run, 250);
    return () => { stopped = true; };
  }, [fetchAccount]);

  const rememberOptimisticOpen = useCallback(({ kind, symbol, side, params, txHash }) => {
    const market = findBySymbol(marketsRef.current, symbol)
      || marketsRef.current.find(row => String(row?.pair_index) === String(params?.pairId));
    const entry = positivePrice(params?.price || market?.mark || market?.mid || market?.oracle);
    const margin = num(params?.collateral, 0);
    const leverage = num(params?.leverage, 1);
    const sizeUsd = margin > 0 && leverage > 0 ? margin * leverage : 0;
    const amount = entry ? sizeUsd / entry : 0;
    const normalizedSymbol = normalizeSymbol(symbol || market?.symbol || market?.display_symbol);
    const normalizedSide = normalizeSide(side);
    const now = Date.now();
    const base = {
      dex: 'ostium',
      symbol: normalizedSymbol,
      side: normalizedSide,
      amount,
      amount_display: trimNumber(amount, 6),
      size_usd: sizeUsd,
      margin,
      leverage,
      entry_price: entry || 0,
      mark_price: entry || 0,
      price: entry || 0,
      take_profit: positivePrice(params?.takeProfit) || null,
      stop_loss: positivePrice(params?.stopLoss) || null,
      pair_index: numericId(params?.pairId),
      is_isolated: true,
      status: 'pending',
      tx_hash: txHash || null,
      _optimistic: true,
      _optimistic_at: now,
      _optimisticExpiresAt: now + OSTIUM_OPTIMISTIC_ROW_TTL_MS,
      _raw: { optimistic: true, source: 'ostium_post_receipt', txHash: txHash || null, params },
    };

    if (kind === 'position') {
      const key = optimisticRowKey('ostium-position', normalizedSymbol, normalizedSide, txHash, params?.pairId);
      const row = {
        ...base,
        id: key,
        position_id: key,
        pnl_usd: 0,
        pnl_pct: 0,
        return_on_equity: 0,
      };
      optimisticPositionsRef.current.set(key, row);
      setPositions((prev) => {
        const actual = Array.isArray(prev)
          ? prev.filter(item => !(item?._optimistic && ostiumOptimisticPositionMatches(item, row)))
          : [];
        const next = actual.concat(row);
        positionsRef.current = next;
        return next;
      });
      setAccount((prev) => prev ? { ...prev, positions_count: Math.max(Number(prev.positions_count || 0), positionsRef.current.length) } : prev);
      return row;
    }

    const key = optimisticRowKey('ostium-order', normalizedSymbol, normalizedSide, txHash, params?.price || params?.pairId);
    const row = {
      ...base,
      id: key,
      order_id: key,
      idx: key,
      type: 'limit',
      order_type: 'limit',
      tif: 'GTC',
      price: entry || 0,
      limit_price: entry || 0,
    };
    optimisticOrdersRef.current.set(key, row);
    setOrders((prev) => {
      const actual = Array.isArray(prev)
        ? prev.filter(item => !(item?._optimistic && ostiumOptimisticOrderMatches(item, row)))
        : [];
      const next = actual.concat(row);
      ordersRef.current = next;
      return next;
    });
    setAccount((prev) => prev ? { ...prev, orders_count: Math.max(Number(prev.orders_count || 0), ordersRef.current.length) } : prev);
    return row;
  }, []);

  const rememberPendingClose = useCallback((pending) => {
    if (!pending?.key) return null;
    pendingCloseRef.current.set(pending.key, pending);
    setPositions((prev) => {
      const filtered = filterPendingClosedPositions(prev, pendingCloseRef.current);
      positionsRef.current = filtered.rows;
      return filtered.rows;
    });
    if (pendingCloseRef.current.has(pending.key)) {
      setAccount((prev) => (
        prev
          ? { ...prev, positions_count: Math.max(0, Number(prev.positions_count || 0) - 1) }
          : prev
      ));
    }
    return pending;
  }, []);

  const findPendingCloseForPosition = useCallback((position) => {
    if (!position) return null;
    const now = Date.now();
    for (const pending of pendingCloseRef.current.values()) {
      if (pending?.expiresAt && pending.expiresAt <= now) continue;
      if (positionMatchesPendingClose(position, pending)) return pending;
    }
    return null;
  }, []);

  const verifyPendingClose = useCallback(async (pending) => {
    if (!pending?.key) return null;
    const startedAt = Date.now();
    let lastFresh = null;
    while (pendingCloseRef.current.has(pending.key) && Date.now() - startedAt < CLOSE_SYNC_TIMEOUT_MS) {
      await sleep(CLOSE_SYNC_POLL_MS);
      lastFresh = await fetchAccount();
    }
    return lastFresh;
  }, [fetchAccount]);

  const rememberPendingTpsl = useCallback(({ symbol, pairIndex, tradeIndex, takeProfit, stopLoss }) => {
    const pending = {
      symbol: normalizeSymbol(symbol),
      pairIndex: pairIndex != null && Number.isFinite(Number(pairIndex)) ? Number(pairIndex) : null,
      tradeIndex: tradeIndex != null && Number.isFinite(Number(tradeIndex)) ? Number(tradeIndex) : null,
      takeProfit: positivePrice(takeProfit),
      stopLoss: positivePrice(stopLoss),
      createdAt: Date.now(),
      expiresAt: Date.now() + PENDING_TPSL_TTL_MS,
    };
    if (pending.takeProfit == null && pending.stopLoss == null) return null;
    const key = pendingTpslKey(pending);
    pendingTpslRef.current.set(key, pending);
    const applyPending = (rows) => mergePendingTpslRows(Array.isArray(rows) ? rows : [], pendingTpslRef.current);
    positionsRef.current = applyPending(positionsRef.current);
    setPositions(applyPending);
    return { ...pending, key };
  }, []);

  const waitForTpslSync = useCallback(async (pending) => {
    if (!pending?.key) return null;
    const startedAt = Date.now();
    let lastFresh = null;
    while (Date.now() - startedAt < TPSL_SYNC_TIMEOUT_MS && pendingTpslRef.current.has(pending.key)) {
      await sleep(TPSL_SYNC_POLL_MS);
      lastFresh = await fetchAccount();
    }
    return lastFresh;
  }, [fetchAccount]);

  const refreshAll = useCallback(async () => {
    if (!isActiveDex) return;
    await Promise.all([
      fetchMarkets(),
      fetchPrices(),
      walletAddr ? fetchAccount() : Promise.resolve(),
    ]);
  }, [fetchAccount, fetchMarkets, fetchPrices, isActiveDex, walletAddr]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refreshAll();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      refreshAll();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refreshAll();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [isActiveDex, refreshAll]);

  useEffect(() => {
    if (!isActiveDex || !ostiumLivePairKey || typeof WebSocket === 'undefined') return undefined;
    let cancelled = false;
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    let flushTimer = null;
    let ws = null;
    const pairs = ostiumLivePairKey.split('|').filter(Boolean);
    const pairSet = new Set(pairs.map((pair) => String(pair).toUpperCase()));
    const pendingTicks = new Map();

    const flushTicks = () => {
      flushTimer = null;
      if (cancelled || !pendingTicks.size) return;
      const ticks = Array.from(pendingTicks.values());
      pendingTicks.clear();
      setPrices((prev) => {
        const next = applyOstiumLiveTicksToPrices(prev, ticks);
        pricesRef.current = next;
        return next;
      });
      setPositions((prev) => {
        const liveRows = applyOstiumLiveTicksToPositions(prev, ticks);
        const next = filterPendingClosedPositions(liveRows, pendingCloseRef.current).rows;
        if (next !== prev) positionsRef.current = next;
        return next;
      });
    };

    const scheduleFlush = () => {
      if (cancelled || flushTimer) return;
      flushTimer = window.setTimeout(flushTicks, OSTIUM_LIVE_PRICE_FLUSH_MS);
    };

    const enqueueTick = (tick) => {
      const symbol = ostiumTickSymbol(tick);
      const price = ostiumTickPrice(tick);
      if (!symbol || price == null) return;
      const pair = ostiumStreamPair(symbol).toUpperCase();
      if (pairSet.size && !pairSet.has(pair)) return;
      pendingTicks.set(symbol, tick);
      scheduleFlush();
    };

    const handlePayload = (payload) => {
      reconnectAttempt = 0;
      for (const tick of ostiumTicksFromPayload(payload)) enqueueTick(tick);
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      const delay = Math.min(
        OSTIUM_LIVE_PRICE_RECONNECT_MAX_MS,
        OSTIUM_LIVE_PRICE_RECONNECT_MS * (2 ** Math.min(reconnectAttempt, 5)),
      );
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled || !pairs.length) return;
      try {
        ws = new WebSocket(OSTIUM_PRICE_STREAM_WS);
        ws.addEventListener('open', () => {
          if (!cancelled && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'subscribe', pairs }));
          }
        });
        ws.addEventListener('message', (event) => {
          try {
            handlePayload(JSON.parse(event.data));
          } catch {}
        });
        ws.addEventListener('close', () => {
          scheduleReconnect();
        });
        ws.addEventListener('error', () => {
          try { ws?.close(); } catch {}
        });
      } catch {
        scheduleReconnect();
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (flushTimer) window.clearTimeout(flushTimer);
      try {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'unsubscribe', pairs }));
        ws?.close();
      } catch {}
    };
  }, [isActiveDex, ostiumLivePairKey]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) {
      pendingTpslRef.current.clear();
      pendingCloseRef.current.clear();
      setDelegateSigner(null);
      delegateSignerRef.current = null;
      setDelegateStatus({
        enabled: false,
        approved: false,
        signer: null,
        gasBalanceEth: null,
        gasReady: false,
        allowanceReady: false,
        delegateReady: false,
        message: null,
      });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const signer = await loadOstiumDelegate(walletAddr).catch(() => null);
      if (cancelled) return;
      if (signer) {
        setDelegateSigner(signer);
        delegateSignerRef.current = signer;
        await refreshDelegateStatus(signer);
      } else {
        setDelegateSigner(null);
        delegateSignerRef.current = null;
        setDelegateStatus({
          enabled: false,
          approved: false,
          signer: null,
          gasBalanceEth: null,
          gasReady: false,
          allowanceReady: false,
          delegateReady: false,
          message: 'Ostium one tap is off',
        });
      }
    })();
    return () => { cancelled = true; };
  }, [isActiveDex, refreshDelegateStatus, walletAddr]);

  const importFills = useCallback(async ({ attempts = CLAIM_LOOKBACK_ATTEMPTS, delayMs = 1500 } = {}) => {
    if (!walletAddr || !token) return null;
    try {
      await ensureOstiumWalletLinked();
      return await fetchJson(`${FUTURES_API}/ostium/import-fills?dex=ostium`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          account: walletAddr,
          attempts,
          delay_ms: delayMs,
        }),
      });
    } catch (e) {
      console.warn('[useOstium] import-fills:', e?.message || e);
      return null;
    }
  }, [authHeaders, ensureOstiumWalletLinked, token, walletAddr]);

  importFillsRef.current = importFills;

  const refreshServerResources = useCallback(async () => {
    if (!token) return null;
    try {
      const res = await fetch('/api/resources', { headers: { 'x-token': token } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return null;
      window.onGodotMessage?.({
        action: 'resources',
        data: {
          gold: Number(data.gold || 0),
          wood: Number(data.wood || 0),
          ore: Number(data.ore || 0),
        },
      });
      return data;
    } catch {
      return null;
    }
  }, [token]);

  const claimGold = useCallback(async ({ reason = 'poll' } = {}) => {
    if (!walletAddr || !token) return null;
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'ostium' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data;
      if (data.gold > 0) {
        console.info('[useOstium] claim-gold result', { reason, gold: data.gold, detail: data.reason || null });
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      return data;
    } catch (e) {
      console.warn('[useOstium] claim-gold:', e?.message || e);
      return null;
    }
  }, [refreshServerResources, token, walletAddr]);

  claimGoldRef.current = claimGold;

  const syncRewards = useCallback((label = 'trade') => {
    if (!walletAddr || !token) return;
    const run = async (attempts, delayMs) => {
      const imported = await importFills({ attempts, delayMs });
      const claimed = await claimGoldRef.current?.({ reason: label });
      if (imported?.imported > 0 || Number(claimed?.gold || 0) > 0) {
        await refreshServerResources();
      }
    };
    run(5, 1500);
    setTimeout(() => run(3, 2000), 12_000);
  }, [importFills, refreshServerResources, token, walletAddr]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !OSTIUM_ALCHEMY_WS_URL || typeof WebSocket === 'undefined') return undefined;
    let stopped = false;
    let client = null;
    const unwatchers = [];
    const refreshTimers = new Set();
    const refreshSoon = () => {
      const timer = setTimeout(() => {
        refreshTimers.delete(timer);
        if (!stopped) void fetchAccount();
      }, 250);
      refreshTimers.add(timer);
    };

    try {
      client = createPublicClient({
        chain: arbitrum,
        transport: webSocket(OSTIUM_ALCHEMY_WS_URL, {
          reconnect: { attempts: 3, delay: 2_000 },
          retryCount: 0,
        }),
      });

      unwatchers.push(client.watchEvent({
        address: OSTIUM_TRADING_CALLBACKS_ADDRESS,
        event: OSTIUM_CLOSE_EXECUTED_EVENT,
        poll: false,
        onLogs: (logs) => {
          if (stopped) return;
          for (const log of logs || []) {
            const percentageClosed = BigInt(log?.args?.percentageClosed ?? 0);
            if (percentageClosed !== OSTIUM_CLOSE_PERCENT_FULL) continue;
            const tradeId = String(log?.args?.tradeId ?? '');
            const position = (positionsRef.current || []).find(row => positionIdentityMatchesId(row, tradeId));
            if (!position) continue;
            rememberPendingClose(createPendingClose(position, {
              symbol: position.symbol,
              side: position.side,
              pairIndex: positionPairIndex(position),
              tradeIndex: positionTradeIndex(position),
              txHash: log?.transactionHash || null,
            }));
            refreshSoon();
            syncRewards('close ws');
          }
        },
        onError: (err) => {
          if (!stopped) console.warn('[useOstium] close event stream:', err?.message || err);
        },
      }));

      unwatchers.push(client.watchEvent({
        address: OSTIUM_TRADING_CALLBACKS_ADDRESS,
        event: OSTIUM_OPEN_EXECUTED_EVENT,
        poll: false,
        onLogs: (logs) => {
          if (stopped) return;
          const owner = String(walletAddr || '').toLowerCase();
          const matched = (logs || []).some(log => String(log?.args?.t?.trader || '').toLowerCase() === owner);
          if (!matched) return;
          refreshSoon();
          syncRewards('open ws');
        },
        onError: (err) => {
          if (!stopped) console.warn('[useOstium] open event stream:', err?.message || err);
        },
      }));
    } catch (e) {
      console.warn('[useOstium] account event stream unavailable:', e?.message || e);
      return undefined;
    }

    return () => {
      stopped = true;
      for (const timer of refreshTimers) clearTimeout(timer);
      refreshTimers.clear();
      for (const unwatch of unwatchers.splice(0)) {
        try { unwatch?.(); } catch {}
      }
    };
  }, [fetchAccount, isActiveDex, rememberPendingClose, syncRewards, walletAddr]);

  useEffect(() => {
    if (!walletAddr || !isActiveDex) return undefined;
    const fire = async () => {
      await importFillsRef.current?.({ attempts: 1 });
      await claimGoldRef.current?.({ reason: 'poll' });
    };
    const kickoff = setTimeout(fire, 3000);
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fire();
    }, 60_000);
    return () => { clearTimeout(kickoff); clearInterval(timer); };
  }, [isActiveDex, walletAddr]);

  const buildOpenParams = useCallback((symbol, side, amount, price, type, leverage, slippage = '0.5', options = {}) => {
    const market = findBySymbol(marketsRef.current, symbol);
    if (!market) throw new Error(`Ostium market ${symbol} is not loaded`);
    const collateral = Number(amount);
    const lev = Number(leverage);
    const pairId = market.pair_index ?? market.market_id;
    const entryPrice = positivePrice(price)
      ?? positivePrice(market.mark ?? market.mid ?? market.oracle ?? market.price)
      ?? priceFromRows(pricesRef.current, symbol, pairId);
    const marketBlockReason = ostiumOpenTradeBlockReason(market, lev);
    if (marketBlockReason) {
      throw new Error(ostiumOpenTradeBlockMessage(market, symbol, lev));
    }
    if (!Number.isFinite(collateral) || collateral <= 0) throw new Error('Enter a valid margin amount');
    if (collateral < MIN_OPEN_SIZE_USD) {
      throw new Error(`Ostium minimum margin is ${MIN_OPEN_SIZE_USD} USDC. Increase margin before signing.`);
    }
    if (!Number.isFinite(lev) || lev <= 0) throw new Error('Enter a valid leverage');
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('Ostium price is not available yet');
    const overnight = Number(market.overnight_max_leverage || market.overnightMaxLeverage || 0);
    const params = {
      pairId,
      buy: normalizeSide(side) === 'bid',
      price: String(entryPrice),
      collateral: String(collateral),
      leverage: String(lev),
      type,
      slippage: slippagePercentToBps(slippage),
      isDayTrade: overnight > 0 && lev > overnight,
      builder: {
        address: OSTIUM_BUILDER_ADDRESS,
        feeBps: OSTIUM_BUILDER_FEE_BPS,
      },
    };
    const takeProfit = openTpslOption(options, ['takeProfit', 'take_profit', 'tp']);
    const stopLoss = openTpslOption(options, ['stopLoss', 'stop_loss', 'sl']);
    if (takeProfit) params.takeProfit = takeProfit;
    if (stopLoss) params.stopLoss = stopLoss;
    return params;
  }, []);

  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage = '0.5', leverage = 1, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const beforePositions = positionsRef.current || [];
      const beforeOrders = ordersRef.current || [];
      if (!marketsRef.current.length) await fetchMarkets();
      const market = findBySymbol(marketsRef.current, symbol);
      const pairId = market?.pair_index ?? market?.market_id;
      if (!positivePrice(market?.mark ?? market?.mid ?? market?.oracle ?? market?.price)
        && !priceFromRows(pricesRef.current, symbol, pairId)) {
        await fetchPrices();
      }
      const params = buildOpenParams(symbol, side, amount, null, OrderType.Market, leverage, slippage, options);
      const fresh = await fetchAccount();
      assertOstiumUsdcBalance(fresh?.account || account, params.collateral);
      const submitted = await submitWithDelegateOrWallet({
        label: 'ostium.open_market',
        dedupeKey: `open:market:${symbol}:${side}`,
        requiredCollateral: params.collateral,
        buildSelfTx: (client) => client.getOpenTradeTx(params),
        buildDelegateTx: (client) => client.getOpenTradeTx(params),
        submitDelegate: (client) => client.openTrade(params),
      });
      const optimistic = rememberOptimisticOpen({ kind: 'position', symbol, side, params, txHash: submitted.txHash });
      pollTradeVisibleInBackground({ symbol, kind: 'position', beforePositions, beforeOrders, optimisticKey: optimistic?.id });
      syncRewards('market order');
      return { success: true, status: 'submitted', txHash: submitted.txHash, info: 'Ostium market order confirmed. Syncing position.' };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium market order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [account, buildOpenParams, fetchAccount, fetchMarkets, fetchPrices, pollTradeVisibleInBackground, rememberOptimisticOpen, submitWithDelegateOrWallet, syncRewards]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1, options = {}) => {
    void _tif;
    setLoading(true);
    setError(null);
    try {
      const beforePositions = positionsRef.current || [];
      const beforeOrders = ordersRef.current || [];
      if (!marketsRef.current.length) await fetchMarkets();
      const market = findBySymbol(marketsRef.current, symbol);
      const pairId = market?.pair_index ?? market?.market_id;
      if (!positivePrice(price)
        && !positivePrice(market?.mark ?? market?.mid ?? market?.oracle ?? market?.price)
        && !priceFromRows(pricesRef.current, symbol, pairId)) {
        await fetchPrices();
      }
      const params = buildOpenParams(symbol, side, amount, price, OrderType.Limit, leverage, '0.5', options);
      const fresh = await fetchAccount();
      assertOstiumUsdcBalance(fresh?.account || account, params.collateral);
      const submitted = await submitWithDelegateOrWallet({
        label: 'ostium.open_limit',
        dedupeKey: `open:limit:${symbol}:${side}:${price}`,
        requiredCollateral: params.collateral,
        buildSelfTx: (client) => client.getOpenTradeTx(params),
        buildDelegateTx: (client) => client.getOpenTradeTx(params),
        submitDelegate: (client) => client.openTrade(params),
      });
      const optimistic = rememberOptimisticOpen({ kind: 'order', symbol, side, params, txHash: submitted.txHash });
      pollTradeVisibleInBackground({ symbol, kind: 'order', beforePositions, beforeOrders, optimisticKey: optimistic?.order_id });
      syncRewards('limit order');
      return { success: true, status: 'submitted', txHash: submitted.txHash, info: 'Ostium limit order confirmed. Syncing order.' };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [account, buildOpenParams, fetchAccount, fetchMarkets, fetchPrices, pollTradeVisibleInBackground, rememberOptimisticOpen, submitWithDelegateOrWallet, syncRewards]);

  const closePosition = useCallback(async (symbol, side, amountBase, pairIndex = null, tradeIndex = null, fullClose = false, options = {}) => {
    setLoading(true);
    setError(null);
    const forceWallet = options?.forceWallet === true || options?.ostiumForceWallet === true;
    try {
      if (!marketsRef.current.length) await fetchMarkets();
      const position = (positions || []).find(pos => (
        (pairIndex != null && Number(pos?.pair_index) === Number(pairIndex))
        && (tradeIndex == null || Number(pos?.trade_index ?? pos?.idx) === Number(tradeIndex))
      )) || findBySymbol(positions, symbol);
      if (!position) throw new Error('Ostium position not found');
      const existingPendingClose = findPendingCloseForPosition(position);
      if (existingPendingClose) {
        return {
          success: true,
          status: 'pending',
          txHash: existingPendingClose.txHash || null,
          info: 'Ostium close is already submitted. Syncing position.',
        };
      }
      const market = findBySymbol(marketsRef.current, symbol) || marketsRef.current.find(m => Number(m?.pair_index) === Number(position?.pair_index));
      const price = Number(market?.mark || market?.mid || position?.mark_price || position?.entry_price);
      const currentAmount = Math.abs(Number(position?.amount || 0));
      const requestedAmount = Math.abs(Number(amountBase || 0));
      const closePercent = fullClose || currentAmount <= 0
        ? 100
        : Math.max(1, Math.min(100, Math.round((requestedAmount / currentAmount) * 100)));
      const params = {
        pairId: position.pair_index ?? pairIndex,
        idx: Number(position.idx ?? position.trade_index ?? tradeIndex ?? 0),
        price: String(price),
        closePercent,
        slippage: 50,
      };
      const submitted = await submitWithDelegateOrWallet({
        label: 'ostium.close',
        dedupeKey: `close:${position.pair_index ?? pairIndex}:${position.idx ?? position.trade_index ?? tradeIndex ?? 0}`,
        buildSelfTx: (buildClient) => buildClient.getCloseTradeTx(params),
        buildDelegateTx: (delegatedClient) => delegatedClient.getCloseTradeTx(params),
        submitDelegate: (delegatedClient) => delegatedClient.closeTrade(params),
        allowWalletFallback: 'when_one_tap_enabled',
        requireAllowance: false,
        setupIfNeeded: false,
        topUpGas: false,
        forceWallet,
      });
      setOneTapWalletFallback(null);
      const pendingClose = closePercent >= 100
        ? rememberPendingClose(createPendingClose(position, {
          symbol,
          side,
          pairIndex,
          tradeIndex,
          txHash: submitted.txHash,
        }))
        : null;
      await fetchAccount();
      if (pendingClose) {
        void verifyPendingClose(pendingClose).catch((err) => {
          console.warn('[useOstium] close sync polling failed:', err?.message || err);
        });
      }
      syncRewards('close');
      return { success: true, status: 'submitted', txHash: submitted.txHash };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium close failed');
      if (e?.code === 'OSTIUM_ONE_TAP_FAILED' && !forceWallet) {
        setOneTapWalletFallback({
          type: 'close',
          symbol,
          side,
          amountBase: String(amountBase ?? ''),
          pairIndex,
          tradeIndex,
          fullClose: !!fullClose,
          message: msg,
          createdAt: Date.now(),
        });
      }
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [fetchAccount, fetchMarkets, findPendingCloseForPosition, positions, rememberPendingClose, submitWithDelegateOrWallet, syncRewards, verifyPendingClose]);

  const executeOneTapWalletFallback = useCallback(async () => {
    const action = oneTapWalletFallback;
    if (!action || action.type !== 'close') return { error: 'No Ostium wallet fallback is pending' };
    return closePosition(
      action.symbol,
      action.side,
      action.amountBase,
      action.pairIndex,
      action.tradeIndex,
      action.fullClose,
      { forceWallet: true },
    );
  }, [closePosition, oneTapWalletFallback]);

  const discardOrder = useCallback((target) => {
    if (!target) return;
    for (const [key, row] of optimisticOrdersRef.current.entries()) {
      if (ostiumOrderMatchesTarget(row, target)) optimisticOrdersRef.current.delete(key);
    }
    const next = (ordersRef.current || []).filter(row => !ostiumOrderMatchesTarget(row, target));
    ordersRef.current = next;
    setOrders(next);
    setAccount(prev => (prev ? { ...prev, orders_count: next.length } : prev));
  }, []);

  const readLiveCancelTarget = useCallback(async ({ symbol, orderId, pairIndex }) => {
    const client = await createBuildClient();
    const liveOrders = await client.getOpenOrders({ user: walletAddr });
    return resolveOstiumCancelTarget(liveOrders, { symbol, orderId, pairIndex });
  }, [createBuildClient, walletAddr]);

  const cancelOrder = useCallback(async (symbol, orderId, pairIndex = null) => {
    setLoading(true);
    setError(null);
    try {
      let target = resolveOstiumCancelTarget(ordersRef.current, { symbol, orderId, pairIndex });
      let liveTarget = null;
      let liveReadSucceeded = false;
      try {
        liveTarget = await readLiveCancelTarget({ symbol, orderId, pairIndex });
        liveReadSucceeded = true;
      } catch (readError) {
        console.warn('[useOstium] cancel preflight order read failed:', readError?.message || readError);
      }
      if (liveTarget) target = liveTarget;
      else if (target && liveReadSucceeded) {
        // A successful empty live read means the cached/UI order already filled or was cancelled.
        discardOrder(target);
        await fetchAccount();
        return { success: true, status: 'already_resolved', noop: true };
      }
      if (!target) {
        if (!liveReadSucceeded) {
          throw new Error('Ostium could not verify this order before cancellation. Refresh and try again.');
        }
        await fetchAccount();
        return { success: true, status: 'already_resolved', noop: true };
      }
      const params = {
        type: CancelOrderType.Limit,
        pairId: target.pairId,
        idx: target.idx,
      };
      let submitted;
      try {
        submitted = await submitWithDelegateOrWallet({
          label: 'ostium.cancel_order',
          dedupeKey: `cancel:${params.type}:${params.pairId}:${params.idx}`,
          buildSelfTx: (client) => client.getCancelOrderTx(params),
          buildDelegateTx: (client) => client.getCancelOrderTx(params),
          submitDelegate: (client) => client.cancelOrder(params),
          allowWalletFallback: true,
          requireAllowance: false,
          setupIfNeeded: false,
          topUpGas: false,
          requireSuccessfulEstimate: true,
        });
      } catch (submitError) {
        if (submitError?.code === 'OSTIUM_TX_PREFLIGHT_FAILED') {
          let stillOpen = null;
          let postFailureReadSucceeded = false;
          try {
            stillOpen = await readLiveCancelTarget({
              symbol,
              orderId: params.idx,
              pairIndex: params.pairId,
            });
            postFailureReadSucceeded = true;
          } catch (readError) {
            console.warn('[useOstium] cancel post-failure order read failed:', readError?.message || readError);
          }
          if (postFailureReadSucceeded && !stillOpen) {
            discardOrder(params);
            await fetchAccount();
            return { success: true, status: 'already_resolved', noop: true };
          }
        }
        throw submitError;
      }
      discardOrder(params);
      await fetchAccount();
      return { success: true, status: 'submitted', txHash: submitted.txHash };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium cancel failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [discardOrder, fetchAccount, readLiveCancelTarget, submitWithDelegateOrWallet]);

  const setTpsl = useCallback(async (symbol, _closeOrderSide, takeProfit, stopLoss, pairIndex = null, tradeIndex = null) => {
    setLoading(true);
    setError(null);
    try {
      const position = (positions || []).find(pos => (
        (pairIndex != null && Number(pos?.pair_index) === Number(pairIndex))
        && (tradeIndex == null || Number(pos?.trade_index ?? pos?.idx) === Number(tradeIndex))
      )) || findBySymbol(positions, symbol);
      if (!position) throw new Error('Ostium position not found');
      const base = {
        pairId: position.pair_index ?? pairIndex,
        idx: Number(position.idx ?? position.trade_index ?? tradeIndex ?? 0),
      };
      const hashes = [];
      if (takeProfit != null && takeProfit !== '') {
        const tpDirectionCheck = validateOstiumTakeProfitDirection(position, takeProfit);
        if (!tpDirectionCheck.ok) throw new Error(tpDirectionCheck.error);
        const tpCheck = validateOstiumTakeProfitLimit(position, takeProfit);
        if (!tpCheck.ok) throw new Error(tpCheck.error);
        const params = { ...base, takeProfit: String(takeProfit) };
        hashes.push((await submitWithDelegateOrWallet({
          label: 'ostium.take_profit',
          dedupeKey: `tpsl:tp:${base.pairId}:${base.idx}`,
          buildSelfTx: (client) => client.getModifyOrderTx(params),
          buildDelegateTx: (client) => client.getModifyOrderTx(params),
          submitDelegate: (client) => client.modifyOrder(params),
          allowWalletFallback: delegateStatus.enabled ? false : 'when_one_tap_enabled',
          requireAllowance: false,
          setupIfNeeded: false,
          topUpGas: false,
        })).txHash);
        if (stopLoss != null && stopLoss !== '') await sleep(500);
      }
      if (stopLoss != null && stopLoss !== '') {
        const slDirectionCheck = validateOstiumStopLossDirection(position, stopLoss);
        if (!slDirectionCheck.ok) throw new Error(slDirectionCheck.error);
        const params = { ...base, stopLoss: String(stopLoss) };
        hashes.push((await submitWithDelegateOrWallet({
          label: 'ostium.stop_loss',
          dedupeKey: `tpsl:sl:${base.pairId}:${base.idx}`,
          buildSelfTx: (client) => client.getModifyOrderTx(params),
          buildDelegateTx: (client) => client.getModifyOrderTx(params),
          submitDelegate: (client) => client.modifyOrder(params),
          allowWalletFallback: delegateStatus.enabled ? false : 'when_one_tap_enabled',
          requireAllowance: false,
          setupIfNeeded: false,
          topUpGas: false,
        })).txHash);
      }
      const pending = rememberPendingTpsl({
        symbol,
        pairIndex: position.pair_index ?? pairIndex,
        tradeIndex: position.idx ?? position.trade_index ?? tradeIndex ?? 0,
        takeProfit,
        stopLoss,
      });
      void waitForTpslSync(pending).catch((err) => {
        console.warn('[useOstium] TP/SL sync polling failed:', err?.message || err);
      });
      return {
        success: true,
        txHash: hashes[hashes.length - 1],
        txHashes: hashes,
        info: 'TP/SL submitted. Syncing Ostium indexer.',
      };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium TP/SL update failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [delegateStatus.enabled, positions, rememberPendingTpsl, submitWithDelegateOrWallet, waitForTpslSync]);

  const switchToArbitrum = useCallback(async () => {
    try {
      if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
      await fetchAccount();
      return { success: true };
    } catch (e) {
      const msg = errorMessage(e, 'Switch to Arbitrum failed');
      setError(msg);
      return { error: msg };
    }
  }, [ensureChain, fetchAccount]);

  const setOstiumOneTapTradingEnabled = useCallback(async (enabled) => {
    if (!walletAddr || !isEvmAddress(walletAddr)) return { error: 'Connect your EVM wallet first' };
    setLoading(true);
    setError(null);
    try {
      if (!enabled) {
        const signer = delegateSignerRef.current || await loadOstiumDelegate(walletAddr).catch(() => null);
        if (signer?.address) {
          const client = await createBuildClient();
          const registered = await readRegisteredDelegate(client, signer.address);
          if (String(registered || '').toLowerCase() === String(signer.address).toLowerCase()) {
            await sendBuiltTx(client.getRemoveDelegateTx(), 'ostium.remove_delegate');
          }
        }
        await clearOstiumDelegate(walletAddr);
        setDelegateSigner(null);
        delegateSignerRef.current = null;
        setDelegateStatus({
          enabled: false,
          approved: false,
          signer: null,
          gasBalanceEth: null,
          gasReady: false,
          allowanceReady: false,
          delegateReady: false,
          message: 'Ostium one tap is off',
        });
        return { success: true, enabled: false };
      }
      const signer = await ensureOneTapReady({ topUpGas: true });
      return { success: true, enabled: true, signer: signer.address };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium one tap setup failed');
      setError(msg);
      await refreshDelegateStatus();
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [createBuildClient, ensureOneTapReady, readRegisteredDelegate, refreshDelegateStatus, sendBuiltTx, walletAddr]);

  const activateOstium = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
      const signer = await ensureOneTapReady({ topUpGas: true });
      await fetchAccount();
      return { success: true, enabled: true, signer: signer.address };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium setup failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [ensureChain, ensureOneTapReady, fetchAccount]);

  const openOstiumApp = useCallback(async () => {
    const url = walletAddr && isEvmAddress(walletAddr)
      ? `https://app.ostium.io/?address=${encodeURIComponent(walletAddr)}`
      : 'https://app.ostium.io/';
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return {
      success: true,
      status: 'opened',
      url,
      info: 'Opened Ostium app. Use the connected Arbitrum wallet there to deposit or withdraw USDC.',
    };
  }, [walletAddr]);

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    walletUsdcStatus,
    walletEth: account?.eth_balance ?? null,
    leverageSettings: {},
    marginModes: {},
    dataReady,
    accountReady: dataReady,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    oneTapWalletFallback,
    executeOneTapWalletFallback,
    clearOneTapWalletFallback,
    depositStatus: null,
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setTpsl,
    setLeverage: async () => ({ success: true }),
    setMarginMode: async () => ({ success: true }),
    depositToPacifica: openOstiumApp,
    withdraw: openOstiumApp,
    fetchAccount,
    activate: activateOstium,
    switchToRise: switchToArbitrum,
    switchToInk: switchToArbitrum,
    claimGold,
    isSelfCustody: true,
    isReady: true,
    setupVerified: true,
    oneTapTrading: {
      enabled: delegateStatus.enabled,
      approved: delegateStatus.approved,
      signer: delegateStatus.signer,
      gasBalanceEth: delegateStatus.gasBalanceEth,
      gasReady: delegateStatus.gasReady,
      allowanceReady: delegateStatus.allowanceReady,
      delegateReady: delegateStatus.delegateReady,
      message: delegateStatus.message,
      mode: 'delegated-self',
    },
    setOneTapTradingEnabled: setOstiumOneTapTradingEnabled,
    walletMismatch: false,
    registeredEvmWallet: null,
    ostiumBuilder: {
      address: OSTIUM_BUILDER_ADDRESS,
      feeBps: OSTIUM_BUILDER_FEE_BPS,
    },
  };
}
