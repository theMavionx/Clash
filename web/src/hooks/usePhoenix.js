import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useSignAndSendTransaction as usePrivySignAndSend, useSignTransaction as usePrivySignTransaction, useWallets as usePrivyWallets } from '@privy-io/react-auth/solana';
import { DEFAULT_MARKET_ORDER_SLIPPAGE, Direction, MAX_SUBACCOUNTS, MarginType, OrderFlags, SelfTradeBehavior, Side, StopLossOrderKind, buildDepositIxsResolved, buildNormalizedMarketParamsBySymbol, buildWithdrawIxsResolved, computeTraderMarginFromInputs, createPhoenixTraderStateManager, priceUsdToTicks, quoteLots } from '@ellipsis-labs/rise';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import {
  asPhoenixArray,
  createPhoenixPublicWsClient,
  createPhoenixTransactionClient,
  disposePhoenixClient,
  PHOENIX_DIRECT_API_URL,
  PHOENIX_PROXY_API_URL,
  getPhoenixBrowserRestClient,
  getPhoenixClient,
  getPhoenixProxyRestClient,
  phoenixSymbol,
  shouldBypassPhoenixFlightForAuthority,
} from '../lib/phoenixClient';
import { sendPhoenixInstructions } from '../lib/phoenixTx';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;
const POLL_MS = 10_000;
const PHOENIX_PRICE_CACHE_MS = 15_000;
const PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS = 60_000;
const PHOENIX_MARKET_STATS_WS_FLUSH_MS = 100;
const USDC_DECIMALS = 6;
const PHOENIX_MARKET_MIN_BASE_UNITS_TO_FILL = '0';
const PHOENIX_MARKET_MIN_QUOTE_LOTS_TO_FILL = quoteLots(0n);
const PHOENIX_TX_METADATA_TTL_MS = 5 * 60_000;
const PHOENIX_TRADER_STATE_DEDUP_MS = 1_200;
const PHOENIX_TRADER_STATE_ERROR_RETRY_MS = 15_000;
const PHOENIX_TRADER_STATE_REST_FALLBACK_MS = 60_000;
const PHOENIX_TRADER_STATE_POST_TX_REST_FALLBACK_MS = 8_000;
const PHOENIX_UNREGISTERED_RETRY_MS = 10 * 60_000;
const PHOENIX_WITHDRAW_RISK_BUFFER_USDC = 0.01;
const PHOENIX_ORDER_COMPUTE_UNIT_LIMIT = 1_000_000;
const PHOENIX_DEFAULT_TAKER_FEE_RATE = 0.00035;
const PHOENIX_ISOLATED_FEE_BUFFER_RATE = 0.0001;
const PHOENIX_ISOLATED_TRANSFER_BUFFER_USDC = 0.005;
const PHOENIX_CONDITIONAL_ORDER_CAPACITY = 16;
const PHOENIX_CONDITIONAL_ORDER_ACCOUNT_BASE_BYTES = 224;
const PHOENIX_CONDITIONAL_ORDER_BYTES = 112;
const PHOENIX_TPSL_SETUP_FEE_BUFFER_LAMPORTS = 100_000;
const PHOENIX_TPSL_OPTIMISTIC_TTL_MS = 45_000;
const PHOENIX_ACCESS_CACHE_PREFIX = 'clash:phoenix:access:v1';
const PHOENIX_SETUP_CACHE_PREFIX = 'clash:phoenix:setup:v1';
const PHOENIX_ACCESS_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const PHOENIX_PROGRAM_ID = 'EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih';
const LIGHTHOUSE_PROGRAM_ID = 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function phoenixSimulationCode(error) {
  const logs = phoenixErrorLogs(error);
  const text = `${error?.transactionMessage || ''}\n${error?.message || ''}\n${logs.join('\n')}`;
  const hex = text.match(/custom program error:\s*(0x[0-9a-f]+)/i)?.[1]?.toLowerCase();
  if (hex) return hex;
  const instructionError = error?.transactionError?.InstructionError
    || error?.simulationErr?.InstructionError
    || error?.simulationResult?.err?.InstructionError;
  const custom = instructionError?.[1]?.Custom ?? instructionError?.[1]?.custom;
  if (Number.isFinite(Number(custom))) return `0x${Number(custom).toString(16)}`;
  return null;
}

function phoenixErrorLogs(error) {
  const logs = error?.logs
    || error?.transactionLogs
    || error?.simulationLogs
    || error?.simulationResult?.logs
    || error?.transactionError?.logs
    || error?.cause?.logs
    || error?.cause?.transactionLogs;
  return Array.isArray(logs) ? logs : [];
}

function isLighthouseAssertionError(error) {
  return phoenixErrorLogs(error).some(line => (
    String(line || '').includes(LIGHTHOUSE_PROGRAM_ID)
    || /Program log:\s*Result \(Failed\)/i.test(String(line || ''))
  ));
}

function isPhoenixTraderNotFoundError(error) {
  return /404|Trader not found|no trader|not registered|does not exist/i.test(String(error?.message || error || ''));
}

function phoenixFailedProgramId(error) {
  const logs = phoenixErrorLogs(error);
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const match = String(logs[i] || '').match(/^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) failed:/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function isPhoenixMetadataDriftError(error) {
  const code = phoenixSimulationCode(error);
  const lighthouse = isLighthouseAssertionError(error);
  if (lighthouse) return !code || code === '0x1900' || code === '0x1902';
  if (code !== '0x1900' && code !== '0x1902') return false;
  const failedProgram = phoenixFailedProgramId(error);
  if (failedProgram && failedProgram !== PHOENIX_PROGRAM_ID) return false;
  // Phoenix exchange/orderbook snapshot mismatches surface as 0x1900/0x1902.
  // Some RPCs omit simulation logs, so the code itself is enough to rebuild.
  // The same drift can fail inside Lighthouse before the Phoenix instruction.
  return true;
}

function shortPhoenixAddress(value) {
  const text = String(value || '');
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text || null;
}

function phoenixPositionTpslKey(symbol, side, subaccountIndex = 0) {
  return `${phoenixSymbol(symbol)}:${String(side || '').toLowerCase()}:${Number(subaccountIndex) || 0}`;
}

function phoenixLamportsToSol(lamports) {
  const n = Number(lamports || 0);
  if (!Number.isFinite(n)) return '0';
  return (n / 1_000_000_000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function phoenixConditionalOrderAccountSize(capacity = PHOENIX_CONDITIONAL_ORDER_CAPACITY) {
  return PHOENIX_CONDITIONAL_ORDER_ACCOUNT_BASE_BYTES + (Number(capacity) || 0) * PHOENIX_CONDITIONAL_ORDER_BYTES;
}

function phoenixInsufficientLamportsMessage(error) {
  const logs = phoenixErrorLogs(error);
  for (const line of logs) {
    const match = String(line || '').match(/Transfer:\s*insufficient lamports\s*(\d+),\s*need\s*(\d+)/i);
    if (!match) continue;
    const have = Number(match[1]);
    const need = Number(match[2]);
    const missing = Math.max(0, need - have);
    return `Phoenix TP/SL first setup needs ${phoenixLamportsToSol(need)} SOL rent for its conditional order account. Your wallet had ${phoenixLamportsToSol(have)} SOL, missing about ${phoenixLamportsToSol(missing + PHOENIX_TPSL_SETUP_FEE_BUFFER_LAMPORTS)} SOL. This is a one-time refundable account rent, not the trading balance.`;
  }
  return null;
}

function phoenixCacheWallet(value) {
  return String(value || '').trim().toLowerCase();
}

function phoenixCacheKey(prefix, wallet) {
  const normalized = phoenixCacheWallet(wallet);
  return normalized ? `${prefix}:${normalized}` : null;
}

function readPhoenixCache(prefix, wallet) {
  const key = phoenixCacheKey(prefix, wallet);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > PHOENIX_ACCESS_CACHE_TTL_MS) {
      window.localStorage?.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try { window.localStorage?.removeItem(key); } catch {}
    return null;
  }
}

function writePhoenixCache(prefix, wallet, data = {}) {
  const key = phoenixCacheKey(prefix, wallet);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(key, JSON.stringify({
      ...data,
      wallet: phoenixCacheWallet(wallet),
      savedAt: Date.now(),
    }));
  } catch {}
}

function clearPhoenixCache(prefix, wallet) {
  const key = phoenixCacheKey(prefix, wallet);
  if (!key || typeof window === 'undefined') return;
  try { window.localStorage?.removeItem(key); } catch {}
}

function cachedPhoenixAccess(wallet) {
  return readPhoenixCache(PHOENIX_ACCESS_CACHE_PREFIX, wallet);
}

function cachedPhoenixSetup(wallet) {
  return readPhoenixCache(PHOENIX_SETUP_CACHE_PREFIX, wallet);
}

function phoenixCachedInviteCode(cache) {
  return cache?.codeUsed || cache?.code || cache?.inviteCode || cache?.referralCode || null;
}

function cachedPhoenixInviteStatus(wallet) {
  const setupCache = cachedPhoenixSetup(wallet);
  if (setupCache) {
    return {
      checking: true,
      whitelisted: true,
      codeUsed: phoenixCachedInviteCode(setupCache),
      inviteKind: setupCache?.inviteKind || null,
      cached: true,
      setupCached: true,
    };
  }
  const accessCache = cachedPhoenixAccess(wallet);
  if (accessCache) {
    return {
      checking: false,
      whitelisted: true,
      codeUsed: phoenixCachedInviteCode(accessCache),
      inviteKind: accessCache?.inviteKind || null,
      cached: true,
      setupCached: false,
    };
  }
  return null;
}

function cachePhoenixAccess(wallet, data = {}) {
  writePhoenixCache(PHOENIX_ACCESS_CACHE_PREFIX, wallet, data);
}

function cachePhoenixSetup(wallet, data = {}) {
  writePhoenixCache(PHOENIX_SETUP_CACHE_PREFIX, wallet, data);
  cachePhoenixAccess(wallet, data);
}

function clearPhoenixSetup(wallet) {
  clearPhoenixCache(PHOENIX_SETUP_CACHE_PREFIX, wallet);
}

function clearPhoenixAccess(wallet) {
  clearPhoenixCache(PHOENIX_ACCESS_CACHE_PREFIX, wallet);
}

function phoenixEmptyAccount(wallet, market = {}) {
  return {
    authority: wallet,
    balance: '0',
    account_equity: '0',
    available_to_spend: '0',
    available_to_withdraw: '0',
    total_margin_used: '0',
    positions_count: 0,
    orders_count: 0,
    maker_fee: market?.maker_fee ?? 0.00005,
    taker_fee: market?.taker_fee ?? 0.00035,
    fee_level: '0',
  };
}

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_MINT_ADDRESS = USDC_MINT.toBase58();
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

function quoteLotsToUsd(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n / 10 ** USDC_DECIMALS;
}

function negateIntegerString(value) {
  try {
    return String(-BigInt(value ?? '0'));
  } catch {
    const n = Number(value || 0);
    return Number.isFinite(n) ? String(-Math.trunc(n)) : '0';
  }
}

function toRawUsdc(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive USDC amount');
  const raw = BigInt(Math.floor(n * 10 ** USDC_DECIMALS));
  if (raw <= 0n) throw new Error(`Minimum amount is ${1 / 10 ** USDC_DECIMALS} USDC`);
  return raw;
}

function toRawUsdcCeil(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive USDC amount');
  const raw = BigInt(Math.ceil((n * 10 ** USDC_DECIMALS) - 1e-9));
  if (raw <= 0n) throw new Error(`Minimum amount is ${1 / 10 ** USDC_DECIMALS} USDC`);
  return raw;
}

function formatUsdcAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(6).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
}

function sideToPhoenix(side) {
  const s = String(side || '').toLowerCase();
  return (s === 'bid' || s === 'buy' || s === 'long') ? Side.Bid : Side.Ask;
}

function sideToUi(side) {
  if (side === Side.Bid || String(side).toLowerCase() === 'bid' || String(side).toLowerCase() === 'buy') return 'bid';
  return 'ask';
}

function decimalPlaces(value) {
  const text = String(value || '');
  const exponent = text.match(/e-(\d+)$/i);
  if (exponent) return Number(exponent[1]) || 0;
  return Math.max(0, text.split('.')[1]?.replace(/e.*$/i, '').length || 0);
}

function roundDownToLot(value, lotSize) {
  const n = Number(value);
  const lot = Number(lotSize);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(lot) || lot <= 0) return n;
  const decimals = Math.min(12, Math.max(decimalPlaces(value), decimalPlaces(lotSize)));
  const scale = 10 ** decimals;
  const lotUnits = Math.max(1, Math.round(lot * scale));
  const valueUnits = Math.floor(n * scale + 1e-9);
  return Number(((Math.floor(valueUnits / lotUnits) * lotUnits) / scale).toFixed(decimals));
}

function formatBaseUnits(value, lotSize) {
  const n = Number(value);
  const lot = Number(lotSize);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const decimals = Number.isFinite(lot) && lot > 0
    ? decimalPlaces(lotSize)
    : Math.min(8, Math.max(0, String(value).split('.')[1]?.length || 0));
  return Number(n.toFixed(decimals)).toString();
}

function marketOrderPriceLimitUsd(side, mark) {
  const n = Number(mark);
  if (!Number.isFinite(n) || n <= 0) return null;
  const multiplier = side === Side.Bid
    ? 1 + DEFAULT_MARKET_ORDER_SLIPPAGE
    : 1 - DEFAULT_MARKET_ORDER_SLIPPAGE;
  return String(Math.max(0, n * multiplier));
}

function isPhoenixIsolatedOnlyMarket(market) {
  return !!(market?.isolated_only ?? market?._phoenix?.isolatedOnly);
}

function phoenixTakerFeeRate(market) {
  const fee = Number(market?.taker_fee ?? market?._phoenix?.takerFee ?? market?._phoenix?.fees?.takerFee);
  return Number.isFinite(fee) && fee >= 0 ? fee : PHOENIX_DEFAULT_TAKER_FEE_RATE;
}

function phoenixRequiredIsolatedTransferUsdc({ baseUnits, priceUsd, leverage, market }) {
  const qty = Number(baseUnits);
  const price = Number(priceUsd);
  const lev = Math.max(1, Number(leverage) || 1);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) return 0;
  const notional = qty * price;
  const feeRate = Math.max(phoenixTakerFeeRate(market), PHOENIX_DEFAULT_TAKER_FEE_RATE)
    + PHOENIX_ISOLATED_FEE_BUFFER_RATE;
  return (notional / lev) + (notional * feeRate) + PHOENIX_ISOLATED_TRANSFER_BUFFER_USDC;
}

function phoenixSubaccountIndex(value) {
  const n = Number(value?.subaccountIndex ?? value?.traderSubaccountIndex ?? value?._phoenixSubaccountIndex);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function phoenixSubaccountSymbols(subaccount) {
  const symbols = new Set();
  for (const position of subaccount?.positions || []) {
    const symbol = phoenixSymbol(position?.symbol);
    const base = firstFinite(position?.basePositionUnits, position?.basePositionLots, 0);
    if (symbol && Number(base || 0) !== 0) symbols.add(symbol);
  }
  for (const group of subaccount?.orders || []) {
    const groupSymbol = phoenixSymbol(group?.symbol);
    const rows = Array.isArray(group?.orders) ? group.orders : [];
    if (groupSymbol && rows.length) symbols.add(groupSymbol);
    for (const order of rows) {
      const orderSymbol = phoenixSymbol(order?.symbol || group?.symbol);
      if (orderSymbol) symbols.add(orderSymbol);
    }
  }
  return symbols;
}

function phoenixSubaccountIsEmpty(subaccount) {
  return phoenixSubaccountSymbols(subaccount).size === 0;
}

function rawPhoenixPositionAmount(position, market) {
  const raw = position?._raw;
  if (!raw) return null;
  const lotDecimals = Number(market?._phoenixBaseLotsDecimals ?? 4);
  if (raw.basePositionUnits != null) {
    const units = Number(raw.basePositionUnits);
    return Number.isFinite(units) && units !== 0 ? Math.abs(units) : null;
  }
  if (raw.basePositionLots != null) {
    const lots = Number(raw.basePositionLots);
    return Number.isFinite(lots) && lots !== 0 ? Math.abs(lots) / 10 ** lotDecimals : null;
  }
  return null;
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

function phoenixMarketStatsFundingToDecimal(stats) {
  const percentage = firstFinite(stats?.currentFundingRatePercentage, stats?.currentFundingRate);
  if (percentage != null) return fundingPercentageToDecimal(percentage);
  const bps = firstFinite(stats?.fundingRate, stats?.funding_rate);
  return bps != null ? fundingBasisPointsToDecimal(bps) : null;
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

function phoenixMarketToMarginParams(market, priceRow = null) {
  const raw = market?._phoenix || market;
  const symbol = phoenixSymbol(raw?.symbol || market?.symbol);
  const mark = firstFinite(
    priceRow?.mark,
    priceRow?.price,
    market?._mark,
    raw?.markPrice?.price,
    raw?.markPrice,
    raw?.price
  );
  const tickSizeRaw = Number(
    raw?.units?.tickSizeInQuoteLotsPerBaseLot
    ?? raw?.tickSize
    ?? market?._phoenixTickSizeRaw
    ?? 0
  );
  const baseLotsDecimals = Number(
    raw?.units?.baseLotsDecimals
    ?? raw?.baseLotsDecimals
    ?? raw?.baseLotDecimals
    ?? market?._phoenixBaseLotsDecimals
    ?? 4
  );
  const assetId = Number(raw?.assetId ?? market?.assetId);
  if (!symbol || mark == null || mark <= 0 || !Number.isFinite(tickSizeRaw) || tickSizeRaw <= 0) {
    return null;
  }
  const leverageTiers = (Array.isArray(raw?.leverageTiers) ? raw.leverageTiers : [])
    .map(tier => ({
      upperBoundSize: String(tier?.maxSizeBaseLots ?? tier?.upperBoundSize ?? 0),
      maxLeverage: String(tier?.maxLeverage ?? 1),
      limitOrderRiskFactorBps: String(tier?.limitOrderRiskFactor ?? tier?.limitOrderRiskFactorBps ?? 100),
    }))
    .filter(tier => Number(tier.upperBoundSize) > 0);
  if (!leverageTiers.length) {
    leverageTiers.push({
      upperBoundSize: '9007199254740991',
      maxLeverage: String(market?.max_leverage || 1),
      limitOrderRiskFactorBps: '100',
    });
  }
  return {
    symbol,
    assetId: Number.isFinite(assetId) ? assetId : 0,
    markPriceTicks: priceUsdToTicks(String(mark), {
      baseLotsDecimals,
      tickSizeInQuoteLotsPerBaseLot: tickSizeRaw,
    }),
    tickSize: String(tickSizeRaw),
    baseLotDecimals: Number.isFinite(baseLotsDecimals) ? baseLotsDecimals : 4,
    leverageTiers,
    riskFactors: {
      maintenanceMarginFactorBps: String(raw?.riskFactors?.maintenance ?? raw?.riskFactors?.maintenanceMarginFactorBps ?? 0),
      backstopMarginFactorBps: String(raw?.riskFactors?.backstop ?? raw?.riskFactors?.backstopMarginFactorBps ?? 0),
      highRiskMarginFactorBps: String(raw?.riskFactors?.highRisk ?? raw?.riskFactors?.highRiskMarginFactorBps ?? 0),
    },
    cancelOrderRiskFactorBps: String(raw?.riskFactors?.cancelOrder ?? raw?.cancelOrderRiskFactorBps ?? 0),
    upnlRiskFactor: String(raw?.riskFactors?.upnl ?? raw?.upnlRiskFactor ?? 100),
    upnlRiskFactorForWithdrawals: String(raw?.riskFactors?.upnlForWithdrawals ?? raw?.upnlRiskFactorForWithdrawals ?? 100),
    isolatedOnly: !!(raw?.isolatedOnly ?? market?.isolated_only),
  };
}

function computePhoenixMarginResult(marginInputs, markets, prices) {
  if (!marginInputs || !Array.isArray(marginInputs.subaccounts)) return null;
  const priceBySymbol = new Map((prices || []).map(row => [phoenixSymbol(row?.symbol), row]));
  const symbols = new Set();
  for (const sub of marginInputs.subaccounts) {
    for (const market of sub?.markets || []) {
      const symbol = phoenixSymbol(market?.symbol);
      if (symbol) symbols.add(symbol);
    }
  }
  const params = (markets || [])
    .filter(market => symbols.has(phoenixSymbol(market?.symbol)))
    .map(market => phoenixMarketToMarginParams(market, priceBySymbol.get(phoenixSymbol(market?.symbol))))
    .filter(Boolean);
  if (!params.length) return null;
  try {
    return computeTraderMarginFromInputs(marginInputs, buildNormalizedMarketParamsBySymbol(params));
  } catch (error) {
    console.warn('[Phoenix] WS margin compute failed', error?.message || error);
    return null;
  }
}

function buildPhoenixMarginInputsFromSnapshot(authority, traderPdaIndex, subaccounts) {
  return {
    authority,
    traderPdaIndex: Number(traderPdaIndex) || 0,
    subaccounts: (subaccounts || []).map(sub => {
      const positionsBySymbol = new Map();
      for (const position of sub?.positions || []) {
        const symbol = phoenixSymbol(position?.symbol);
        if (symbol) positionsBySymbol.set(symbol, position);
      }
      const ordersBySymbol = new Map();
      for (const event of sub?.orders || []) {
        const symbol = phoenixSymbol(event?.symbol);
        if (symbol) ordersBySymbol.set(symbol, Array.isArray(event?.orders) ? event.orders : []);
      }
      const symbols = new Set([...positionsBySymbol.keys(), ...ordersBySymbol.keys()]);
      return {
        subaccountIndex: Number(sub?.subaccountIndex) || 0,
        collateralBalanceQuoteLots: String(sub?.collateral ?? '0'),
        markets: Array.from(symbols).map(symbol => {
          const position = positionsBySymbol.get(symbol);
          const orders = ordersBySymbol.get(symbol) || [];
          return {
            symbol,
            position: position ? {
              basePositionLots: String(position.basePositionLots ?? '0'),
              virtualQuotePositionLots: String(position.virtualQuotePositionLots ?? '0'),
              entryPriceTicks: String(position.entryPriceTicks ?? '0'),
              unsettledFundingQuoteLots: negateIntegerString(position.unsettledFundingQuoteLots ?? '0'),
              accumulatedFundingQuoteLots: String(position.accumulatedFundingQuoteLots ?? '0'),
            } : undefined,
            limitOrders: orders.map(order => ({
              orderSequenceNumber: String(order?.orderSequenceNumber ?? ''),
              side: sideToUi(order?.side),
              priceTicks: String(order?.priceTicks ?? '0'),
              sizeRemainingLots: String(order?.sizeRemainingLots ?? '0'),
              initialSizeLots: String(order?.initialSizeLots ?? order?.sizeRemainingLots ?? '0'),
              reduceOnly: !!order?.reduceOnly,
              isStopLoss: !!order?.isStopLoss,
              isStopLossDirection: !!order?.isStopLossDirection,
              status: String(order?.status || 'active'),
            })).filter(order => order.orderSequenceNumber),
          };
        }),
      };
    }),
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

function phoenixSoftRateLimitedPayload(value) {
  return !!(
    value
    && typeof value === 'object'
    && value.rate_limited
    && /phoenix_proxy_soft_429/i.test(String(value.source || ''))
  );
}

function priceRowFromMarketStats(update, market = {}) {
  const symbol = phoenixSymbol(update?.symbol);
  const stats = update?.stats || {};
  const mark = firstFinite(stats.markPrice, stats.mark_price);
  if (!symbol || mark == null || mark <= 0) return null;
  const oracle = firstFinite(stats.oraclePrice, stats.oracle_price, mark);
  const previous = firstFinite(stats.prevDayMarkPrice, stats.prev_day_mark_price, mark);
  const volume = firstFinite(stats.dayVolumeUsd, stats.day_volume_usd, market?.volume_24h, 0);
  const openInterest = firstFinite(stats.openInterest, stats.open_interest, market?.open_interest, 0);
  return {
    symbol,
    mark: String(mark),
    oracle: String(oracle ?? mark),
    yesterday_price: previous != null && previous > 0 ? String(previous) : String(mark),
    volume_24h: String(volume ?? 0),
    open_interest: String(openInterest ?? 0),
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
  return triggerRowPrice(row, market);
}

function triggerRowPrice(row, market) {
  const tickPrice = ticksToUsd(
    row?.trigger?.triggerPriceTicks
      ?? row?.triggerPriceTicks
      ?? row?.trigger_price_ticks
      ?? row?.trigger?.trigger_price_ticks,
    market,
  );
  if (tickPrice != null) return tickPrice;
  const directPriceCandidates = [
    tokenAmountValue(row?.trigger?.triggerPrice),
    tokenAmountValue(row?.triggerPrice),
    row?.trigger?.triggerPriceUsd,
    row?.triggerPriceUsd,
    row?.priceUsd,
    row?.price,
  ].filter(value => value != null);
  return firstFinite(...directPriceCandidates);
}

function activeTriggerRow(triggers) {
  const rows = Array.isArray(triggers) ? triggers : [];
  return rows.find(t => !/cancel|disable|fill|execut/i.test(String(t?.status || '')))
    || rows[0]
    || null;
}

function collateralForTraderView(traderView) {
  return firstFinite(
    tokenAmountValue(traderView?.collateralBalance),
    tokenAmountValue(traderView?.effectiveCollateral),
    tokenAmountValue(traderView?.portfolioValue)
  ) || 0;
}

function phoenixTraderFreeCollateral(traderView, fallbackCollateral = 0, fallbackMargin = 0) {
  const effectiveCollateral = firstFinite(
    tokenAmountValue(traderView?.effectiveCollateral),
    fallbackCollateral
  ) || 0;
  const initialMargin = firstFinite(
    tokenAmountValue(traderView?.initialMargin),
    fallbackMargin,
    0
  ) || 0;
  return Math.max(0, effectiveCollateral - initialMargin);
}

function phoenixTraderWithdrawableCollateral(traderView, fallbackCollateral = 0, fallbackMargin = 0) {
  const effectiveCollateral = firstFinite(
    tokenAmountValue(traderView?.effectiveCollateralForWithdrawals),
    tokenAmountValue(traderView?.effectiveCollateral),
    fallbackCollateral
  ) || 0;
  const initialMargin = firstFinite(
    tokenAmountValue(traderView?.initialMarginForWithdrawals),
    tokenAmountValue(traderView?.initialMargin),
    fallbackMargin,
    0
  ) || 0;
  return Math.max(0, effectiveCollateral - initialMargin);
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
  const rawBase = Number.isFinite(snapshotBase) && snapshotBase !== 0
    ? (Number.isFinite(sizeValue) && sizeValue !== 0 ? Math.abs(sizeValue) * Math.sign(snapshotBase) : snapshotBase)
    : sizeValue;
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
  const directTakeProfitPrice = firstFinite(...[
    tokenAmountValue(vp?.takeProfitPrice),
    activeTriggerPrice(snapshotRow?.takeProfitTriggers, m),
  ].filter(value => value != null));
  const directStopLossPrice = firstFinite(...[
    tokenAmountValue(vp?.stopLossPrice),
    activeTriggerPrice(snapshotRow?.stopLossTriggers, m),
  ].filter(value => value != null));
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
    leverage: margin > 0 && positionValue > 0 ? Math.round((positionValue / margin) * 10) / 10 : null,
    pnl_usd: pnl,
    pnl_pct: pnlPct,
    is_isolated: Number(subaccountIndex) > 0,
    take_profit_price: directTakeProfitPrice ?? conditionalTakeProfitPrice,
    stop_loss_price: directStopLossPrice ?? conditionalStopLossPrice,
    market_addr: m?.market_addr || null,
    pair_index: null,
    trade_index: null,
    _phoenixSubaccountIndex: Number(subaccountIndex) || 0,
    _phoenixAccountCollateral: accountCollateral,
    _phoenixDirectTakeProfitPrice: directTakeProfitPrice,
    _phoenixDirectStopLossPrice: directStopLossPrice,
    _raw: snapshotRow || vp,
    _view: vp,
  };
}

function phoenixUiPositionKey(position) {
  if (!position) return '';
  return [
    Number(position._phoenixSubaccountIndex || 0),
    phoenixSymbol(position.symbol),
    String(position.side || '').toLowerCase(),
  ].join(':');
}

function mergeSnapshotPositionMargin(position, marketMargin, previousPosition = null) {
  if (!position || !marketMargin) {
    return previousPosition?.liquidation_price
      ? { ...position, liquidation_price: previousPosition.liquidation_price }
      : position;
  }
  const margin = quoteLotsToUsd(marketMargin.positionInitialMarginQuoteLots ?? marketMargin.initialMarginQuoteLots);
  const pnl = quoteLotsToUsd(marketMargin.unrealizedPnlQuoteLots);
  const positionValue = Math.abs(quoteLotsToUsd(marketMargin.positionValueQuoteLots));
  const next = {
    ...position,
    size_usd: positionValue > 0 ? positionValue : position.size_usd,
    margin: margin > 0 ? margin : position.margin,
    pnl_usd: pnl,
    pnl_pct: margin > 0 ? (pnl / margin) * 100 : position.pnl_pct,
    leverage: margin > 0 && positionValue > 0 ? Math.round((positionValue / margin) * 10) / 10 : position.leverage,
    liquidation_price: previousPosition?.liquidation_price ?? position.liquidation_price,
    _phoenixMargin: marketMargin,
  };
  return next;
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

function ordersFromTraderView(traderView, marketsBySymbol) {
  const subaccountIndex = Number(traderView?.traderSubaccountIndex) || 0;
  const byMarket = traderView?.limitOrders && typeof traderView.limitOrders === 'object'
    ? traderView.limitOrders
    : {};
  return Object.entries(byMarket).flatMap(([marketSymbol, rows]) => {
    const symbol = phoenixSymbol(marketSymbol);
    if (!symbol || !Array.isArray(rows)) return [];
    const m = marketsBySymbol.current[symbol];
    return rows.map(o => {
      const amount = firstFinite(
        tokenAmountValue(o?.tradeSizeRemaining),
        tokenAmountValue(o?.initialTradeSize),
        tokenAmountValue(o?.size),
        0
      ) || 0;
      const price = firstFinite(tokenAmountValue(o?.price), o?.price, 0) || 0;
      return {
        symbol,
        side: sideToUi(o?.side),
        amount: String(Math.abs(amount || 0)),
        price: String(price),
        order_type: o?.isStopLoss ? 'STOP' : 'LIMIT',
        tif: 'GTC',
        order_id: String(o?.orderSequenceNumber ?? o?.id ?? ''),
        orderSequenceNumber: o?.orderSequenceNumber,
        reduce_only: !!o?.isReduceOnly || !!o?.reduceOnly,
        market_addr: m?.market_addr || null,
        market_name: symbol,
        _phoenixSubaccountIndex: subaccountIndex,
        _raw: o,
      };
    });
  });
}

function tpslOrdersFromPositions(positions) {
  return (positions || []).flatMap(position => {
    const symbol = phoenixSymbol(position?.symbol);
    if (!symbol) return [];
    const subaccountIndex = Number(position?._phoenixSubaccountIndex || 0);
    const direction = position.side === 'bid' ? 'LONG' : 'SHORT';
    const amount = Number(position.amount || 0);
    const common = {
      symbol,
      side: position.side,
      order_direction: direction,
      amount: amount > 0 ? String(amount) : 'Full position',
      tif: 'CONDITIONAL',
      reduce_only: true,
      market_addr: position.market_addr || null,
      market_name: symbol,
      _phoenixSubaccountIndex: subaccountIndex,
      _phoenixSyntheticTpsl: true,
      _readOnly: true,
    };
    const rows = [];
    const tp = Number(position.take_profit_price || position._phoenixOptimisticTakeProfitPrice || 0);
    if (Number.isFinite(tp) && tp > 0) {
      rows.push({
        ...common,
        price: String(tp),
        order_type: 'TAKE_PROFIT',
        order_id: `phoenix-tp:${symbol}:${position.side}:${subaccountIndex}:${tp}`,
        _phoenixTpslKind: 'take_profit',
      });
    }
    const sl = Number(position.stop_loss_price || position._phoenixOptimisticStopLossPrice || 0);
    if (Number.isFinite(sl) && sl > 0) {
      rows.push({
        ...common,
        price: String(sl),
        order_type: 'STOP_LOSS',
        order_id: `phoenix-sl:${symbol}:${position.side}:${subaccountIndex}:${sl}`,
        _phoenixTpslKind: 'stop_loss',
      });
    }
    return rows;
  });
}

export function usePhoenix() {
  const { dex } = useDex();
  const isActiveDex = dex === 'phoenix';
  const solWallet = useWallet();
  const { publicKey, sendTransaction, signTransaction } = solWallet;
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
  const walletSource = adapterAddr ? 'adapter' : (privyAddr ? 'privy' : 'none');
  const privyActive = walletSource === 'privy';
  const walletAddr = adapterAddr || privyAddr || null;
  const ownerPk = useMemo(() => walletAddr ? new PublicKey(walletAddr) : null, [walletAddr]);
  const registeredWallet = typeof player?.wallet === 'string' ? player.wallet.trim() : '';
  const registeredSolanaWallet = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(registeredWallet) ? registeredWallet : null;
  const walletMismatch = !!(registeredSolanaWallet && walletAddr && registeredSolanaWallet !== walletAddr);
  const walletMismatchMessage = useMemo(() => {
    if (!walletMismatch) return '';
    const connected = shortPhoenixAddress(walletAddr) || 'current wallet';
    const registered = shortPhoenixAddress(registeredSolanaWallet) || 'registered wallet';
    return `Wrong Solana wallet: connected ${connected}, account uses ${registered}.`;
  }, [registeredSolanaWallet, walletAddr, walletMismatch]);

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
  const [depositStatus, setDepositStatus] = useState(null);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);

  const marketsRef = useRef([]);
  const marketsBySymbolRef = useRef({});
  const pricesRef = useRef([]);
  const pricesFetchedAtRef = useRef(0);
  const priceBackoffUntilRef = useRef(0);
  const subaccountsRef = useRef([]);
  const positionsRef = useRef([]);
  const ordersRef = useRef([]);
  const traderRegisteredRef = useRef(false);
  const traderStateWsReadyRef = useRef(false);
  const traderStateResourceRef = useRef(null);
  const traderStateReleaseRef = useRef(null);
  const lastTraderStateRestAtRef = useRef(0);
  const lastTraderStatePostTxRestAtRef = useRef(0);
  const lastTraderStateRiskRestAtRef = useRef(0);
  const refreshTraderStateRef = useRef(null);
  const tokenRef = useRef(null);
  const claimGoldRef = useRef(null);
  const claimInFlightRef = useRef(null);
  const lastClaimAtRef = useRef(0);
  const inFlightRef = useRef(new Map());
  const refreshTraderStateInFlightRef = useRef(null);
  const refreshTraderStateCachedAtRef = useRef(0);
  const refreshTraderStateLastResultRef = useRef(undefined);
  const refreshTraderStateRetryMsRef = useRef(PHOENIX_TRADER_STATE_DEDUP_MS);
  const tpslOptimisticRef = useRef(new Map());
  const accountRef = useRef(null);
  const txClientRef = useRef(null);
  const txClientEndpointRef = useRef(null);
  const txClientFlightDisabledRef = useRef(false);
  const txClientReadyAtRef = useRef(0);
  const txClientInFlightRef = useRef(null);
  const sessionKeyRef = useRef(null);
  const inviteCheckInFlightRef = useRef(null);
  useEffect(() => {
    tokenRef.current = player?.token || null;
  }, [player?.token]);

  const client = getPhoenixClient(connection?.rpcEndpoint);
  const phoenixBrowserRestClient = useMemo(
    () => getPhoenixBrowserRestClient(connection?.rpcEndpoint),
    [connection?.rpcEndpoint],
  );
  const phoenixProxyRestClient = useMemo(
    () => getPhoenixProxyRestClient(connection?.rpcEndpoint),
    [connection?.rpcEndpoint],
  );
  const phoenixRestSources = useMemo(() => {
    const rows = [
      { name: 'browser', client: phoenixBrowserRestClient },
      { name: 'proxy', client: phoenixProxyRestClient },
    ];
    const seen = new Set();
    return rows.filter(row => {
      if (!row.client || seen.has(row.client)) return false;
      seen.add(row.client);
      return true;
    });
  }, [phoenixBrowserRestClient, phoenixProxyRestClient]);
  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const setPhoenixPositions = useCallback((nextOrUpdater) => {
    setPositions(prev => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      positionsRef.current = Array.isArray(next) ? next : [];
      return positionsRef.current;
    });
  }, []);
  const setPhoenixOrders = useCallback((nextOrUpdater) => {
    setOrders(prev => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      ordersRef.current = Array.isArray(next) ? next : [];
      return ordersRef.current;
    });
  }, []);
  const setPhoenixAccount = useCallback((nextOrUpdater) => {
    setAccount(prev => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      accountRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const sessionKey = `${walletAddr || ''}:${walletMismatch ? 'mismatch' : 'ok'}`;
    if (sessionKeyRef.current === sessionKey) return;
    sessionKeyRef.current = sessionKey;
    traderRegisteredRef.current = false;
    refreshTraderStateInFlightRef.current = null;
    refreshTraderStateCachedAtRef.current = 0;
    refreshTraderStateLastResultRef.current = undefined;
    refreshTraderStateRetryMsRef.current = PHOENIX_TRADER_STATE_DEDUP_MS;
    traderStateWsReadyRef.current = false;
    lastTraderStateRestAtRef.current = 0;
    lastTraderStatePostTxRestAtRef.current = 0;
    lastTraderStateRiskRestAtRef.current = 0;
    inviteCheckInFlightRef.current = null;
    tpslOptimisticRef.current.clear();
    subaccountsRef.current = [];
    positionsRef.current = [];
    ordersRef.current = [];
    setTraderRegistered(false);
    setAccountReady(false);
    setDataReady(false);
    setPhoenixPositions([]);
    setPhoenixOrders([]);
    setPhoenixAccount(null);
    setDepositStatus(null);
    setInviteStatus(cachedPhoenixInviteStatus(walletAddr) || { checking: false, whitelisted: null, codeUsed: null });
  }, [setPhoenixAccount, setPhoenixOrders, setPhoenixPositions, walletAddr, walletMismatch]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch) return;
    const cachedStatus = cachedPhoenixInviteStatus(walletAddr);
    if (cachedStatus) {
      setInviteStatus(cachedStatus);
    }
  }, [isActiveDex, walletAddr, walletMismatch]);

  const disposeTransactionClient = useCallback(() => {
    disposePhoenixClient(txClientRef.current);
    txClientRef.current = null;
    txClientEndpointRef.current = null;
    txClientFlightDisabledRef.current = false;
    txClientReadyAtRef.current = 0;
    txClientInFlightRef.current = null;
  }, []);

  useEffect(() => () => {
    disposeTransactionClient();
  }, [disposeTransactionClient]);

  const getTransactionClient = useCallback(async (forceFresh = false) => {
    const endpoint = connection?.rpcEndpoint || null;
    const disableFlight = shouldBypassPhoenixFlightForAuthority(walletAddr);
    const now = Date.now();
    const cached = txClientRef.current;
    const cacheFresh = cached
      && txClientEndpointRef.current === endpoint
      && txClientFlightDisabledRef.current === disableFlight
      && now - txClientReadyAtRef.current < PHOENIX_TX_METADATA_TTL_MS;

    if (!forceFresh && cacheFresh) return cached;
    if (!forceFresh && txClientInFlightRef.current) return txClientInFlightRef.current;

    if (cached) disposeTransactionClient();
    const promise = (async () => {
      const apiUrls = [
        { name: 'browser', apiUrl: PHOENIX_DIRECT_API_URL },
        { name: 'proxy', apiUrl: PHOENIX_PROXY_API_URL },
      ];
      const errors = [];
      for (const source of apiUrls) {
        const next = createPhoenixTransactionClient(endpoint, {
          disableFlight,
          apiUrl: source.apiUrl,
        });
        try {
          await next.exchange?.ready?.();
          if (errors.length) {
            console.info('[Phoenix] transaction metadata recovered through fallback', {
              source: source.name,
              previous: errors.map(row => `${row.name}: ${row.message}`).slice(0, 2),
            });
          }
          txClientRef.current = next;
          txClientEndpointRef.current = endpoint;
          txClientFlightDisabledRef.current = disableFlight;
          txClientReadyAtRef.current = Date.now();
          return next;
        } catch (e) {
          disposePhoenixClient(next);
          errors.push({ name: source.name, message: e?.message || String(e) });
        }
      }
      throw new Error(errors.map(row => `${row.name}: ${row.message}`).join(' | ') || 'Phoenix metadata client failed');
    })();
    txClientInFlightRef.current = promise;
    try {
      return await promise;
    } finally {
      if (txClientInFlightRef.current === promise) {
        txClientInFlightRef.current = null;
      }
    }
  }, [connection?.rpcEndpoint, disposeTransactionClient, walletAddr]);

  const buildCollateralIxs = useCallback(async (txClient, amount, direction, authority) => {
    await txClient.exchange?.ready?.();
    const snapshot = txClient.exchange?.snapshot?.();
    const exchangeSnapshot = snapshot?.exchange;
    if (!exchangeSnapshot?.canonicalMint) throw new Error('Phoenix exchange metadata is not ready');
    const phoenixProgramAddress = txClient.pda.getProgramAddress();
    const [
      logAuthorityAddress,
      emberState,
      emberVault,
      traderAccount,
      phoenixTokenAccount,
      usdcTokenAccount,
    ] = await Promise.all([
      txClient.pda.getLogAuthorityAddress({ phoenixProgramAddress }),
      txClient.pda.getEmberStateAddress({ phoenixProgramAddress }),
      txClient.pda.getEmberVaultAddress({ phoenixProgramAddress }),
      txClient.pda.getTraderAddress({
        authority,
        traderPdaIndex: 0,
        subaccountIndex: 0,
        phoenixProgramAddress,
      }),
      txClient.pda.getTraderTokenAccountAddress({
        authority,
        mint: exchangeSnapshot.canonicalMint,
      }),
      txClient.pda.getTraderTokenAccountAddress({
        authority,
        mint: USDC_MINT_ADDRESS,
      }),
    ]);
    const resolved = {
      exchange: {
        phoenixProgramAddress,
        logAuthorityAddress,
        globalConfigurationAddress: exchangeSnapshot.globalConfig,
        canonicalMint: exchangeSnapshot.canonicalMint,
        usdcMint: USDC_MINT_ADDRESS,
        perpAssetMap: exchangeSnapshot.perpAssetMap,
        globalVault: exchangeSnapshot.globalVault,
        withdrawQueue: exchangeSnapshot.withdrawQueue,
        globalTraderIndex: exchangeSnapshot.globalTraderIndex,
        activeTraderBuffer: exchangeSnapshot.activeTraderBuffer,
        emberState,
        emberVault,
      },
      trader: {
        authority,
        traderAccount,
        usdcTokenAccount,
        phoenixTokenAccount,
      },
      amount,
    };
    return direction === 'withdraw'
      ? buildWithdrawIxsResolved(resolved)
      : buildDepositIxsResolved(resolved);
  }, []);

  const withFreshPhoenixMetadataRetry = useCallback(async (label, symbol, buildAndSend) => {
    const phx = phoenixSymbol(symbol);
    const runWithTransactionClient = async (forceFresh = false) => {
      const orderClient = await getTransactionClient(forceFresh);
      return buildAndSend(orderClient);
    };
    try {
      return await runWithTransactionClient(false);
    } catch (e) {
      if (!isPhoenixMetadataDriftError(e)) throw e;
      console.warn('[Phoenix] exchange metadata drift; rebuilding instruction once', {
        label,
        symbol: phx,
        code: phoenixSimulationCode(e),
        failed_program_id: phoenixFailedProgramId(e),
        lighthouse_assertion: isLighthouseAssertionError(e),
        logs: phoenixErrorLogs(e).slice(-6),
      });
      return runWithTransactionClient(true);
    }
  }, [getTransactionClient]);

  const runOnce = useCallback((key, fn) => {
    const map = inFlightRef.current;
    if (map.has(key)) return map.get(key);
    const p = Promise.resolve().then(fn).finally(() => {
      if (map.get(key) === p) map.delete(key);
    });
    map.set(key, p);
    return p;
  }, []);

  const readPhoenixRestFallback = useCallback(async (label, reader) => {
    const errors = [];
    for (const source of phoenixRestSources) {
      try {
        const data = await reader(source.client);
        if (errors.length) {
          console.info(`[Phoenix] REST fallback recovered via ${source.name}`, {
            label,
            previous: errors.map(row => `${row.name}: ${row.message}`).slice(0, 2),
          });
        }
        return data;
      } catch (error) {
        errors.push({
          name: source.name,
          error,
          message: error?.message || String(error),
        });
        if (/^trader-state/.test(label) && isPhoenixTraderNotFoundError(error)) break;
      }
    }
    const detail = errors.map(row => `${row.name}: ${row.message}`).join(' | ');
    throw new Error(detail || `Phoenix REST ${label} failed`);
  }, [phoenixRestSources]);

  const getTraderStateViewWithFallback = useCallback(async (authority, request) => {
    try {
      return await readPhoenixRestFallback('trader-state-view', restClient => (
        restClient.api.traders().getTraderState(authority, request)
      ));
    } catch (error) {
      if (isPhoenixTraderNotFoundError(error)) return null;
      throw error;
    }
  }, [readPhoenixRestFallback]);

  const getTraderStateSnapshotWithFallback = useCallback(async (authority, request) => {
    return readPhoenixRestFallback('trader-state-snapshot', restClient => (
      restClient.api.traders().getTraderStateSnapshot(authority, request)
    ));
  }, [readPhoenixRestFallback]);

  const checkInviteWalletWithFallback = useCallback((authority) => (
    readPhoenixRestFallback('invite-check', restClient => (
      restClient.api.invite().checkWallet(authority)
    ))
  ), [readPhoenixRestFallback]);

  const activateInviteCodeWithFallback = useCallback((authority, code) => (
    readPhoenixRestFallback('invite-activate', restClient => (
      restClient.api.invite().activateInvite({ authority, code })
    ))
  ), [readPhoenixRestFallback]);

  const activateInviteReferralWithFallback = useCallback((authority, referralCode) => (
    readPhoenixRestFallback('invite-activate-referral', restClient => (
      restClient.api.invite().activateInviteWithReferral({
        authority,
        referral_code: referralCode,
      })
    ))
  ), [readPhoenixRestFallback]);

  const sendIxs = useCallback((instructions, label = 'phoenix', options = {}) => {
    if (!ownerPk) throw new Error('Wallet not connected');
    if (walletMismatch) throw new Error(walletMismatchMessage || 'Wrong Solana wallet');
    const computeUnitLimit = options?.computeUnitLimit || null;
    const maxAttemptsRaw = Number(options?.maxAttempts);
    const maxAttempts = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0
      ? Math.floor(maxAttemptsRaw)
      : undefined;
    return sendPhoenixInstructions({
      instructions,
      ownerPk,
      connection,
      sendTransaction,
      signTransaction,
      solWallet,
      privyActive,
      privySendTx,
      privySignTx,
      privyWalletObj,
      label,
      computeUnitLimit,
      skipPreflight: !!options?.skipPreflight,
      preferWalletSendTransaction: options?.preferWalletSendTransaction !== undefined
        ? !!options.preferWalletSendTransaction
        : true,
      fastBlockhash: !!options?.fastBlockhash,
      maxAttempts,
    });
  }, [ownerPk, walletMismatch, walletMismatchMessage, connection, sendTransaction, signTransaction, solWallet, privyActive, privySendTx, privySignTx, privyWalletObj]);

  const resolvePhoenixIsolatedSubaccount = useCallback(async (orderClient, symbol) => {
    if (!walletAddr) throw new Error('Wallet not connected');
    const target = phoenixSymbol(symbol);
    const positionMatch = positionsRef.current.find(position => (
      phoenixSymbol(position?.symbol) === target
      && phoenixSubaccountIndex(position) > 0
    ));
    if (positionMatch) {
      return { subaccountIndex: phoenixSubaccountIndex(positionMatch), registerIx: null, source: 'position' };
    }

    const orderMatch = ordersRef.current.find(order => (
      phoenixSymbol(order?.symbol) === target
      && phoenixSubaccountIndex(order) > 0
    ));
    if (orderMatch) {
      return { subaccountIndex: phoenixSubaccountIndex(orderMatch), registerIx: null, source: 'order' };
    }

    const subaccounts = Array.isArray(subaccountsRef.current) ? subaccountsRef.current : [];
    const symbolMatch = subaccounts.find(subaccount => (
      phoenixSubaccountIndex(subaccount) > 0
      && phoenixSubaccountSymbols(subaccount).has(target)
    ));
    if (symbolMatch) {
      return { subaccountIndex: phoenixSubaccountIndex(symbolMatch), registerIx: null, source: 'snapshot' };
    }

    const emptyMatch = subaccounts.find(subaccount => (
      phoenixSubaccountIndex(subaccount) > 0
      && phoenixSubaccountIsEmpty(subaccount)
    ));
    if (emptyMatch) {
      return { subaccountIndex: phoenixSubaccountIndex(emptyMatch), registerIx: null, source: 'empty' };
    }

    const used = new Set([
      ...subaccounts.map(phoenixSubaccountIndex),
      ...positionsRef.current.map(phoenixSubaccountIndex),
      ...ordersRef.current.map(phoenixSubaccountIndex),
    ].filter(index => index > 0));
    const maxSubaccounts = Math.max(2, Number(MAX_SUBACCOUNTS) || 100);
    for (let index = 1; index < maxSubaccounts; index += 1) {
      if (used.has(index)) continue;
      try {
        const registerIx = await orderClient.ixs.buildRegisterTrader({
          authority: walletAddr,
          marginType: MarginType.Isolated,
          traderPdaIndex: 0,
          traderSubaccountIndex: index,
        });
        return { subaccountIndex: index, registerIx, source: 'new' };
      } catch (error) {
        const text = String(error?.message || error || '');
        if (/already|exist|initialized/i.test(text)) {
          used.add(index);
          continue;
        }
        throw error;
      }
    }

    throw new Error(`No Phoenix isolated subaccount slot available for ${target}`);
  }, [walletAddr]);

  const ensureConditionalOrdersAccountIx = useCallback(async (subaccountIndex = 0, orderClient = client) => {
    if (!walletAddr) throw new Error('Wallet not connected');
    if (walletMismatch) throw new Error(walletMismatchMessage || 'Wrong Solana wallet');
    const traderAccount = await orderClient.pda.getTraderAddress({
      authority: walletAddr,
      traderPdaIndex: 0,
      subaccountIndex: Number(subaccountIndex) || 0,
    });
    const conditionalOrders = await orderClient.pda.getConditionalOrdersAddress({ traderAccount });
    const info = await connection.getAccountInfo(new PublicKey(conditionalOrders));
    if (info) return null;
    try {
      const [rentLamports, walletLamports] = await Promise.all([
        connection.getMinimumBalanceForRentExemption(
          phoenixConditionalOrderAccountSize(PHOENIX_CONDITIONAL_ORDER_CAPACITY),
          'confirmed',
        ),
        connection.getBalance(new PublicKey(walletAddr), 'confirmed'),
      ]);
      const requiredLamports = Number(rentLamports || 0) + PHOENIX_TPSL_SETUP_FEE_BUFFER_LAMPORTS;
      if (Number.isFinite(requiredLamports) && Number(walletLamports || 0) < requiredLamports) {
        throw new Error(`Phoenix TP/SL first setup needs ${phoenixLamportsToSol(requiredLamports)} SOL for conditional order rent and fees. Your wallet has ${phoenixLamportsToSol(walletLamports)} SOL. This is a one-time refundable account rent, not the trading balance.`);
      }
    } catch (error) {
      if (/Phoenix TP\/SL first setup needs/i.test(error?.message || '')) throw error;
      console.warn('[Phoenix] conditional order rent precheck failed', {
        message: error?.message || String(error),
        capacity: PHOENIX_CONDITIONAL_ORDER_CAPACITY,
      });
    }
    return orderClient.ixs.buildCreateConditionalOrdersAccount({
      authority: walletAddr,
      traderPdaIndex: 0,
      traderSubaccountIndex: Number(subaccountIndex) || 0,
      capacity: PHOENIX_CONDITIONAL_ORDER_CAPACITY,
    });
  }, [client, connection, walletAddr, walletMismatch, walletMismatchMessage]);

  const reportPhoenixTradeTx = useCallback(async (details = {}) => {
    if (!walletAddr || walletMismatch) return null;
    const signature = String(details.signature || details.tx_hash || details.hash || '').trim();
    if (!signature) return null;
    const token = tokenRef.current || window._playerToken;
    if (!token) {
      console.warn('[Phoenix rewards] tx report skipped - no player token');
      return null;
    }
    let last = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`${GAME_API}/futures/phoenix/import-fills?dex=phoenix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': token },
          body: JSON.stringify({
            wallet: walletAddr,
            tx_hash: signature,
            ...details,
          }),
        });
        const data = await res.json().catch(() => ({}));
        last = data;
        if (res.ok && data?.ok !== false) return data;
        console.warn('[Phoenix rewards] tx import failed', res.status, data);
        if (res.status < 500 && data?.reason !== 'transaction_not_found') return data;
      } catch (e) {
        last = { ok: false, error: e?.message || String(e) };
        console.warn('[Phoenix rewards] tx import request failed', e?.message || e);
      }
      await sleep(1500 + attempt * 2500);
    }
    return last;
  }, [walletAddr, walletMismatch]);

  const claimGold = useCallback(async (opts = {}) => {
    if (!walletAddr) return null;
    if (walletMismatch) return null;
    const token = tokenRef.current || window._playerToken;
    if (!token) return null;
    if (claimInFlightRef.current) return claimInFlightRef.current;
    const now = Date.now();
    const minGap = opts.force ? 750 : 5000;
    if (now - lastClaimAtRef.current < minGap) return null;
    lastClaimAtRef.current = now;

    const promise = (async () => {
      if (opts.importFills === true && (opts.tx_hash || opts.signature || opts.hash)) {
        try {
          const importRes = await fetch(`${GAME_API}/futures/phoenix/import-fills?dex=phoenix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-token': token },
            body: JSON.stringify({ wallet: walletAddr, ...opts }),
          });
          const importData = await importRes.json().catch(() => ({}));
          if (!importRes.ok) {
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
      if (!res.ok) {
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
  }, [walletAddr, walletMismatch]);

  useEffect(() => {
    claimGoldRef.current = claimGold;
  }, [claimGold]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch) return undefined;
    const fire = () => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn({ importFills: false });
    };
    const first = setTimeout(fire, 10_000);
    const iv = setInterval(fire, 45_000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [isActiveDex, walletAddr, walletMismatch]);

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

  const mergePriceRows = useCallback((rows) => {
    const incoming = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (!incoming.length) return pricesRef.current;
    const marketSymbols = new Set(marketsRef.current.map(m => m.symbol));
    const priceBySymbol = new Map(pricesRef.current.map(p => [p.symbol, p]));
    const marketBySymbol = { ...marketsBySymbolRef.current };

    for (const raw of incoming) {
      const symbol = phoenixSymbol(raw?.symbol);
      if (!symbol) continue;
      const row = { ...(priceBySymbol.get(symbol) || {}), ...raw, symbol };
      priceBySymbol.set(symbol, row);
      if (marketBySymbol[symbol]) {
        const mark = Number(row.mark || 0);
        marketBySymbol[symbol] = {
          ...marketBySymbol[symbol],
          ...(Number.isFinite(mark) && mark > 0 ? { _mark: mark } : {}),
          ...(row.volume_24h != null ? { volume_24h: row.volume_24h } : {}),
          ...(row.open_interest != null ? { open_interest: row.open_interest } : {}),
        };
      }
    }

    const next = [];
    for (const market of marketsRef.current) {
      const row = priceBySymbol.get(market.symbol);
      if (row) next.push(row);
    }
    for (const row of priceBySymbol.values()) {
      if (!marketSymbols.has(row.symbol)) next.push(row);
    }

    marketsBySymbolRef.current = marketBySymbol;
    pricesRef.current = next;
    pricesFetchedAtRef.current = Date.now();
    priceBackoffUntilRef.current = 0;
    setPrices(next);
    return next;
  }, []);

  const applyMarketStatsUpdates = useCallback((updates) => {
    const batch = Array.isArray(updates) ? updates.filter(Boolean) : [];
    if (!batch.length) return;
    const byUpdate = new Map();
    const priceRows = [];
    for (const update of batch) {
      const symbol = phoenixSymbol(update?.symbol);
      if (!symbol) continue;
      byUpdate.set(symbol, update);
      const row = priceRowFromMarketStats(update, marketsBySymbolRef.current[symbol]);
      if (row) priceRows.push(row);
    }

    let marketsChanged = false;
    const nextMarkets = marketsRef.current.map(market => {
      const update = byUpdate.get(market.symbol);
      if (!update) return market;
      const stats = update.stats || {};
      const mark = firstFinite(stats.markPrice, stats.mark_price);
      const funding = phoenixMarketStatsFundingToDecimal(stats);
      const volume = firstFinite(stats.dayVolumeUsd, stats.day_volume_usd);
      const openInterest = firstFinite(stats.openInterest, stats.open_interest);
      let changed = false;
      const next = { ...market };
      if (mark != null && mark > 0 && Number(next._mark || 0) !== mark) {
        next._mark = mark;
        changed = true;
      }
      if (volume != null && String(next.volume_24h ?? '') !== String(volume)) {
        next.volume_24h = volume;
        changed = true;
      }
      if (openInterest != null && String(next.open_interest ?? '') !== String(openInterest)) {
        next.open_interest = openInterest;
        changed = true;
      }
      if (funding != null && Number.isFinite(funding) && Number(next.funding_rate || 0) !== funding) {
        next.funding_rate = funding;
        next.next_funding_rate = funding;
        changed = true;
      }
      if (changed) marketsChanged = true;
      return changed ? next : market;
    });

    if (marketsChanged) {
      marketsRef.current = nextMarkets;
      marketsBySymbolRef.current = {
        ...marketsBySymbolRef.current,
        ...Object.fromEntries(nextMarkets.map(m => [m.symbol, m])),
      };
      setMarkets(nextMarkets);
    }
    mergePriceRows(priceRows);
  }, [mergePriceRows]);

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
      const overview = await readPhoenixRestFallback('funding-overview', restClient => (
        restClient.api.funding().getFundingOverview({ perMarketLimit: 2 })
      ));
      if (phoenixSoftRateLimitedPayload(overview)) {
        priceBackoffUntilRef.current = Date.now() + PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS;
        return pricesRef.current;
      }
      return applyPriceRows(pricesFromFundingOverview(marketList, overview));
    } catch (e) {
      const text = String(e?.message || e || '');
      if (/429|Too Many Requests/i.test(text) || Number(e?.status) === 429) {
        priceBackoffUntilRef.current = Date.now() + PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS;
      }
      return pricesRef.current;
    }
  }, [applyPriceRows, isActiveDex, readPhoenixRestFallback]);

  const fetchMarkets = useCallback(async () => {
    if (!isActiveDex) return [];
    try {
      const raw = await readPhoenixRestFallback('markets', restClient => (
        restClient.api.markets().getMarkets()
      ));
      if (phoenixSoftRateLimitedPayload(raw)) {
        return marketsRef.current;
      }
      const baseList = asPhoenixArray(raw).map(normalizeMarket).filter(Boolean);
      if (!baseList.length && marketsRef.current.length) {
        return marketsRef.current;
      }
      let list = baseList;
      let overview = null;
      try {
        overview = await readPhoenixRestFallback('funding-overview', restClient => (
          restClient.api.funding().getFundingOverview({ perMarketLimit: 2 })
        ));
        if (!phoenixSoftRateLimitedPayload(overview)) {
          list = enrichMarketsWithFunding(baseList, overview);
        } else {
          overview = null;
        }
      } catch (e) {
        const text = String(e?.message || e || '');
        if (/429|Too Many Requests/i.test(text) || Number(e?.status) === 429) {
          priceBackoffUntilRef.current = Date.now() + PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS;
        }
        list = baseList;
      }
      marketsRef.current = list;
      marketsBySymbolRef.current = Object.fromEntries(list.map(m => [m.symbol, m]));
      setMarkets(list);
      setPhoenixAccount(prev => prev ? {
        ...prev,
        maker_fee: list[0]?.maker_fee ?? prev.maker_fee,
        taker_fee: list[0]?.taker_fee ?? prev.taker_fee,
      } : prev);
      if (overview) fetchPrices(list, { overview });
      return list;
    } catch (e) {
      if (marketsRef.current.length) return marketsRef.current;
      const text = String(e?.message || e || '');
      setError(/429|Too Many Requests/i.test(text)
        ? 'Phoenix market data is rate-limited right now. Live WS prices will continue when available.'
        : e?.message || 'Could not load Phoenix markets');
      return marketsRef.current;
    }
  }, [fetchPrices, isActiveDex, readPhoenixRestFallback, setPhoenixAccount]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    const streams = createPhoenixPublicWsClient();
    const pending = new Map();
    let flushTimer = null;

    const flush = () => {
      flushTimer = null;
      if (cancelled || !pending.size) return;
      const batch = Array.from(pending.values());
      pending.clear();
      applyMarketStatsUpdates(batch);
    };

    (async () => {
      try {
        for await (const update of streams.marketStats(undefined, controller.signal)) {
          if (cancelled) break;
          const symbol = phoenixSymbol(update?.symbol);
          if (!symbol) continue;
          pending.set(symbol, update);
          if (!flushTimer) flushTimer = setTimeout(flush, PHOENIX_MARKET_STATS_WS_FLUSH_MS);
        }
      } catch (e) {
        if (!cancelled && e?.name !== 'AbortError') {
          console.warn('[Phoenix] marketStats WS failed; REST fallback remains active', e);
        }
      } finally {
        flush();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [applyMarketStatsUpdates, isActiveDex]);

  const applyTraderSnapshotState = useCallback((storeState, options = {}) => {
    const snapshot = storeState?.snapshot;
    const authority = snapshot?.authority || walletAddr;
    if (!authority || !snapshot) return false;

    const traderPdaIndex = Number(snapshot?.traderPdaIndex ?? 0) || 0;
    const subaccounts = Array.isArray(snapshot?.subaccounts) ? snapshot.subaccounts : [];
    const marginInputs = storeState?.marginInputs
      || buildPhoenixMarginInputsFromSnapshot(authority, traderPdaIndex, subaccounts);
    const marginResult = computePhoenixMarginResult(marginInputs, marketsRef.current, pricesRef.current);
    const marginBySubaccount = new Map(
      (marginResult?.subaccounts || []).map(row => [Number(row?.subaccountIndex) || 0, row])
    );
    const previousByKey = new Map(
      positionsRef.current.map(position => [phoenixUiPositionKey(position), position])
    );

    subaccountsRef.current = subaccounts;
    const positionsFromSnapshot = subaccounts.flatMap(sub => {
      const subIndex = Number(sub?.subaccountIndex) || 0;
      const collateral = quoteLotsToUsd(sub?.collateral);
      const subMargin = marginBySubaccount.get(subIndex);
      const marketMarginBySymbol = new Map(
        (subMargin?.marketMargins || []).map(row => [phoenixSymbol(row?.symbol), row])
      );
      return (sub?.positions || [])
        .map(row => {
          const position = positionFromSnapshot(row, marketsBySymbolRef, collateral, subIndex);
          if (!position) return null;
          return mergeSnapshotPositionMargin(
            position,
            marketMarginBySymbol.get(position.symbol),
            previousByKey.get(phoenixUiPositionKey(position))
          );
        })
        .filter(Boolean);
    });
    const limitOrders = subaccounts.flatMap(sub => {
      const subIndex = Number(sub?.subaccountIndex) || 0;
      return (sub?.orders || []).flatMap(group => ordersFromSnapshot(group, marketsBySymbolRef, subIndex));
    });
    const nextOrders = [...limitOrders, ...tpslOrdersFromPositions(positionsFromSnapshot)];

    const crossSubaccount = subaccounts.find(sub => Number(sub?.subaccountIndex) === 0) || subaccounts[0] || null;
    const crossMargin = marginBySubaccount.get(0) || marginResult?.subaccounts?.[0] || null;
    const totalMarginUsed = marginResult
      ? marginResult.subaccounts.reduce((sum, sub) => sum + quoteLotsToUsd(sub?.margin?.initialMarginQuoteLots), 0)
      : positionsFromSnapshot.reduce((sum, position) => sum + Number(position.margin || 0), 0);
    const equity = marginResult
      ? marginResult.subaccounts.reduce((sum, sub) => sum + quoteLotsToUsd(sub?.margin?.portfolioValueQuoteLots), 0)
      : Math.max(0,
        subaccounts.reduce((sum, sub) => sum + quoteLotsToUsd(sub?.collateral), 0)
        + positionsFromSnapshot.reduce((sum, position) => sum + Number(position.pnl_usd || 0), 0)
      );
    const crossCollateral = crossMargin
      ? quoteLotsToUsd(crossMargin?.margin?.collateralBalanceQuoteLots)
      : quoteLotsToUsd(crossSubaccount?.collateral);
    const availableToSpend = crossMargin
      ? Math.max(0,
        quoteLotsToUsd(crossMargin?.margin?.effectiveCollateralQuoteLots)
        - quoteLotsToUsd(crossMargin?.margin?.initialMarginQuoteLots)
      )
      : Math.max(0, crossCollateral - totalMarginUsed);
    const availableToWithdraw = crossMargin
      ? Math.max(0,
        quoteLotsToUsd(crossMargin?.margin?.effectiveCollateralForWithdrawalsQuoteLots)
        - quoteLotsToUsd(crossMargin?.margin?.initialMarginForWithdrawalsQuoteLots)
      )
      : availableToSpend;
    const firstMarket = marketsRef.current[0] || {};
    const hasTraderState = !!snapshot;
    traderRegisteredRef.current = hasTraderState;
    setTraderRegistered(hasTraderState);
    if (hasTraderState) {
      cachePhoenixSetup(authority, { source: options.source || 'trader_state_ws' });
      setInviteStatus(prev => ({
        checking: false,
        whitelisted: true,
        codeUsed: prev?.codeUsed || null,
        inviteKind: prev?.inviteKind || null,
        cached: true,
        setupCached: true,
      }));
    }
    setPhoenixPositions(positionsFromSnapshot);
    setPhoenixOrders(nextOrders);
    setPhoenixAccount({
      authority,
      balance: String(crossCollateral),
      account_equity: String(equity),
      available_to_spend: String(availableToSpend),
      available_to_withdraw: String(availableToWithdraw),
      total_margin_used: String(Math.max(0, totalMarginUsed)),
      positions_count: positionsFromSnapshot.length,
      orders_count: nextOrders.length,
      maker_fee: firstMarket.maker_fee ?? 0.00005,
      taker_fee: firstMarket.taker_fee ?? 0.00035,
      fee_level: '0',
      _raw: {
        authority,
        traderPdaIndex,
        slot: Number(snapshot?.slot ?? 0),
        snapshot: { subaccounts },
        margin: marginResult,
        source: options.source || 'trader_state_ws',
        status: storeState?.status || null,
      },
    });
    setAccountReady(true);
    setDataReady(true);
    traderStateWsReadyRef.current = !!(
      storeState?.status?.isConnected
      || storeState?.status?.health === 'live'
    );
    refreshTraderStateLastResultRef.current = {
      authority,
      traderPdaIndex,
      slot: Number(snapshot?.slot ?? 0),
      snapshot: { subaccounts },
      margin: marginResult,
      source: options.source || 'trader_state_ws',
    };
    refreshTraderStateCachedAtRef.current = Date.now();
    refreshTraderStateRetryMsRef.current = PHOENIX_TRADER_STATE_DEDUP_MS;
    const needsRiskReconcile = positionsFromSnapshot.some(position => !(Number(position?.liquidation_price) > 0));
    if (needsRiskReconcile && Date.now() - lastTraderStateRiskRestAtRef.current > PHOENIX_TRADER_STATE_REST_FALLBACK_MS) {
      lastTraderStateRiskRestAtRef.current = Date.now();
      setTimeout(() => {
        refreshTraderStateRef.current?.({ force: true }).catch(error => {
          console.warn('[Phoenix] trader risk REST reconcile failed', error?.message || error);
        });
      }, 0);
    }
    return true;
  }, [setPhoenixAccount, setPhoenixOrders, setPhoenixPositions, walletAddr]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch) return undefined;
    if (!traderRegistered) {
      if (refreshTraderStateLastResultRef.current === null) {
        setAccountReady(true);
        setDataReady(true);
      }
      return undefined;
    }
    let cancelled = false;
    const streams = createPhoenixPublicWsClient();
    const manager = createPhoenixTraderStateManager({
      api: {
        getTraderStateSnapshot: getTraderStateSnapshotWithFallback,
      },
      traderState: streams.traderState,
      onBackgroundError: error => {
        if (!cancelled) console.warn('[Phoenix] traderState WS background error', error?.message || error);
      },
    });
    const resource = manager.resource({ authority: walletAddr, traderPdaIndex: 0 });
    traderStateResourceRef.current = resource;
    const release = resource.retain();
    traderStateReleaseRef.current = release;
    const unsubscribe = resource.subscribe(state => {
      if (cancelled) return;
      if (state?.snapshot) {
        applyTraderSnapshotState(state, { source: 'trader_state_ws' });
      }
    });

    (async () => {
      try {
        if (!marketsRef.current.length) {
          await fetchMarkets();
        }
        if (cancelled) return;
        await resource.ready();
        if (!cancelled) {
          applyTraderSnapshotState(resource.store.getState(), { source: 'trader_state_ws' });
        }
      } catch (error) {
        if (cancelled) return;
        traderStateWsReadyRef.current = false;
        const msg = String(error?.message || error || '');
        const looksUnregistered = isPhoenixTraderNotFoundError(msg);
        if (looksUnregistered) {
          clearPhoenixSetup(walletAddr);
          clearPhoenixAccess(walletAddr);
          traderRegisteredRef.current = false;
          subaccountsRef.current = [];
          setTraderRegistered(false);
          setPhoenixPositions([]);
          setPhoenixOrders([]);
          setPhoenixAccount(phoenixEmptyAccount(walletAddr, marketsRef.current[0] || {}));
          setAccountReady(true);
          setDataReady(true);
          setInviteStatus(prev => ({
            checking: false,
            whitelisted: null,
            codeUsed: prev?.codeUsed || null,
            inviteKind: prev?.inviteKind || null,
            cached: false,
            setupCached: false,
          }));
          refreshTraderStateLastResultRef.current = null;
          refreshTraderStateCachedAtRef.current = Date.now();
          refreshTraderStateRetryMsRef.current = PHOENIX_UNREGISTERED_RETRY_MS;
          return;
        }
        console.warn('[Phoenix] traderState WS bootstrap failed; REST fallback remains available', msg);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      try { release(); } catch {}
      try { resource.close(); } catch {}
      try { manager.close(); } catch {}
      if (traderStateResourceRef.current === resource) traderStateResourceRef.current = null;
      if (traderStateReleaseRef.current === release) traderStateReleaseRef.current = null;
      traderStateWsReadyRef.current = false;
    };
  }, [applyTraderSnapshotState, fetchMarkets, getTraderStateSnapshotWithFallback, isActiveDex, setPhoenixAccount, setPhoenixOrders, setPhoenixPositions, traderRegistered, walletAddr, walletMismatch]);

  const refreshTraderState = useCallback(async (options = {}) => {
    if (!isActiveDex || !walletAddr || walletMismatch) {
      setAccountReady(false);
      return null;
    }
    const force = !!options.force;
    const now = Date.now();
    if (!force && refreshTraderStateInFlightRef.current) return refreshTraderStateInFlightRef.current;
    if (
      !force
      && refreshTraderStateLastResultRef.current !== undefined
      && now - refreshTraderStateCachedAtRef.current < (
        refreshTraderStateLastResultRef.current === null
          ? refreshTraderStateRetryMsRef.current
          : PHOENIX_TRADER_STATE_DEDUP_MS
      )
    ) {
      return refreshTraderStateLastResultRef.current;
    }

    const promise = (async () => {
      try {
      lastTraderStateRestAtRef.current = Date.now();
      const viewState = await getTraderStateViewWithFallback(walletAddr, { pdaIndex: 0 });
      if (!viewState) {
        clearPhoenixSetup(walletAddr);
        clearPhoenixAccess(walletAddr);
        traderRegisteredRef.current = false;
        setTraderRegistered(false);
        subaccountsRef.current = [];
        setPhoenixPositions([]);
        setPhoenixOrders([]);
        setPhoenixAccount(phoenixEmptyAccount(walletAddr, marketsRef.current[0] || {}));
        setAccountReady(true);
        setDataReady(true);
        setInviteStatus(prev => ({
          checking: false,
          whitelisted: null,
          codeUsed: prev?.codeUsed || null,
          inviteKind: prev?.inviteKind || null,
          cached: false,
          setupCached: false,
        }));
        refreshTraderStateLastResultRef.current = null;
        refreshTraderStateCachedAtRef.current = Date.now();
        refreshTraderStateRetryMsRef.current = PHOENIX_UNREGISTERED_RETRY_MS;
        return null;
      }
      const state = {
        authority: viewState?.authority || walletAddr,
        traderPdaIndex: Number(viewState?.pdaIndex ?? viewState?.traderPdaIndex ?? 0),
        slot: Number(viewState?.slot ?? 0),
        slotIndex: Number(viewState?.slotIndex ?? 0),
        snapshot: {
          subaccounts: [],
        },
        view: viewState,
      };
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
      const hasTraderState = viewTraders.length > 0;
      traderRegisteredRef.current = hasTraderState;
      setTraderRegistered(hasTraderState);
      if (hasTraderState) {
        cachePhoenixSetup(walletAddr, { source: 'trader_state' });
        setInviteStatus(prev => ({
          checking: false,
          whitelisted: true,
          codeUsed: prev?.codeUsed || null,
          inviteKind: prev?.inviteKind || null,
          cached: true,
          setupCached: true,
        }));
      }
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
      const optimisticNow = Date.now();
      const pos = (viewPositions.length ? viewPositions : fallbackPositions).map(p => {
        const key = phoenixPositionTpslKey(p?.symbol, p?.side, p?._phoenixSubaccountIndex);
        const optimistic = tpslOptimisticRef.current.get(key);
        if (!optimistic) return p;
        if (optimisticNow - Number(optimistic.at || 0) > PHOENIX_TPSL_OPTIMISTIC_TTL_MS) {
          tpslOptimisticRef.current.delete(key);
          return p;
        }
        const currentTakeProfit = Number(p.take_profit_price);
        const currentStopLoss = Number(p.stop_loss_price);
        const nextTakeProfit = Number.isFinite(currentTakeProfit) && currentTakeProfit > 0
          ? currentTakeProfit
          : optimistic.takeProfit;
        const nextStopLoss = Number.isFinite(currentStopLoss) && currentStopLoss > 0
          ? currentStopLoss
          : optimistic.stopLoss;
        return {
          ...p,
          take_profit_price: nextTakeProfit,
          stop_loss_price: nextStopLoss,
          _phoenixOptimisticTakeProfitPrice: optimistic.takeProfit,
          _phoenixOptimisticStopLossPrice: optimistic.stopLoss,
          _phoenixTpslPendingRefresh: true,
        };
      });
      const limitOrders = subaccounts.flatMap(sub => {
        const subIndex = Number(sub?.subaccountIndex) || 0;
        return (sub?.orders || []).flatMap(group => ordersFromSnapshot(group, marketsBySymbolRef, subIndex));
      });
      const viewLimitOrders = viewTraders.flatMap(trader => ordersFromTraderView(trader, marketsBySymbolRef));
      const ord = [...(viewLimitOrders.length ? viewLimitOrders : limitOrders), ...tpslOrdersFromPositions(pos)];
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
      const availableToSpend = phoenixTraderFreeCollateral(crossView, crossCollateral, crossMarginUsed);
      const availableToWithdraw = phoenixTraderWithdrawableCollateral(crossView, crossCollateral, crossMarginUsed);
      const totalInitialMargin = viewTraders.length
        ? viewTraders.reduce((sum, t) => sum + (tokenAmountValue(t?.initialMargin) || 0), 0)
        : marginUsed;
      const totalMarginUsed = Math.max(0, totalInitialMargin || marginUsed);
      const firstMarket = marketsRef.current[0] || {};
      setPhoenixPositions(pos);
      setPhoenixOrders(ord);
      setPhoenixAccount({
        authority: walletAddr,
        balance: String(crossCollateral),
        account_equity: String(equity),
        available_to_spend: String(availableToSpend),
        available_to_withdraw: String(availableToWithdraw),
        total_margin_used: String(totalMarginUsed),
        positions_count: pos.length,
        orders_count: ord.length,
        maker_fee: firstMarket.maker_fee ?? 0.00005,
        taker_fee: firstMarket.taker_fee ?? 0.00035,
        fee_level: '0',
        _raw: state,
      });
      setAccountReady(true);
      setDataReady(true);
      refreshTraderStateLastResultRef.current = hasTraderState ? state : null;
      refreshTraderStateCachedAtRef.current = Date.now();
      refreshTraderStateRetryMsRef.current = hasTraderState
        ? PHOENIX_TRADER_STATE_DEDUP_MS
        : PHOENIX_UNREGISTERED_RETRY_MS;
      return hasTraderState ? state : null;
    } catch (e) {
      const msg = String(e?.message || e || '');
      const looksUnregistered = isPhoenixTraderNotFoundError(msg);
      if (!looksUnregistered && traderRegisteredRef.current) {
        traderRegisteredRef.current = true;
        setTraderRegistered(true);
        setAccountReady(true);
        setDataReady(true);
        refreshTraderStateCachedAtRef.current = Date.now();
        refreshTraderStateRetryMsRef.current = PHOENIX_TRADER_STATE_ERROR_RETRY_MS;
        return refreshTraderStateLastResultRef.current || null;
      }
      if (!looksUnregistered) {
        const cachedStatus = cachedPhoenixInviteStatus(walletAddr);
        if (cachedStatus?.setupCached) {
          setInviteStatus(cachedStatus);
        }
        setAccountReady(false);
        setDataReady(true);
        refreshTraderStateLastResultRef.current = undefined;
        refreshTraderStateCachedAtRef.current = Date.now();
        refreshTraderStateRetryMsRef.current = PHOENIX_TRADER_STATE_ERROR_RETRY_MS;
        return null;
      }
      clearPhoenixSetup(walletAddr);
      clearPhoenixAccess(walletAddr);
      traderRegisteredRef.current = false;
      setTraderRegistered(false);
      subaccountsRef.current = [];
      setPhoenixPositions([]);
      setPhoenixOrders([]);
      setPhoenixAccount(phoenixEmptyAccount(walletAddr, marketsRef.current[0] || {}));
      setAccountReady(true);
      setDataReady(true);
      setInviteStatus(prev => ({
        checking: false,
        whitelisted: null,
        codeUsed: prev?.codeUsed || null,
        inviteKind: prev?.inviteKind || null,
        cached: false,
        setupCached: false,
      }));
      refreshTraderStateLastResultRef.current = null;
      refreshTraderStateCachedAtRef.current = Date.now();
      refreshTraderStateRetryMsRef.current = looksUnregistered
        ? PHOENIX_UNREGISTERED_RETRY_MS
        : PHOENIX_TRADER_STATE_ERROR_RETRY_MS;
      return null;
      }
    })();

    refreshTraderStateInFlightRef.current = promise;
    try {
      return await promise;
    } finally {
      if (refreshTraderStateInFlightRef.current === promise) {
        refreshTraderStateInFlightRef.current = null;
      }
    }
  }, [getTraderStateViewWithFallback, isActiveDex, setPhoenixAccount, setPhoenixOrders, setPhoenixPositions, walletAddr, walletMismatch]);

  useEffect(() => {
    refreshTraderStateRef.current = refreshTraderState;
    return () => {
      if (refreshTraderStateRef.current === refreshTraderState) {
        refreshTraderStateRef.current = null;
      }
    };
  }, [refreshTraderState]);

  const waitForTraderState = useCallback(async (attempts = 8) => {
    for (let i = 0; i < attempts; i += 1) {
      const state = await refreshTraderState({ force: i > 0 });
      if (state) return state;
      await sleep(Math.min(2_500, 700 + i * 300));
    }
    return null;
  }, [refreshTraderState]);

  const refreshTraderStateSoon = useCallback((delays = [800, 3_500]) => {
    for (const delay of delays) {
      setTimeout(() => {
        const status = traderStateResourceRef.current?.status?.();
        const wsReady = traderStateWsReadyRef.current || status?.isConnected || status?.health === 'live';
        if (wsReady && Number(delay) < 2_500) return;
        const now = Date.now();
        if (now - lastTraderStatePostTxRestAtRef.current < PHOENIX_TRADER_STATE_POST_TX_REST_FALLBACK_MS) {
          return;
        }
        lastTraderStatePostTxRestAtRef.current = now;
        refreshTraderState({ force: true }).catch(e => {
          console.warn('[Phoenix] background trader refresh failed', e?.message || e);
        });
      }, delay);
    }
  }, [refreshTraderState]);

  const applyOptimisticMarginUse = useCallback((marginAmount) => {
    const margin = Number(marginAmount);
    if (!Number.isFinite(margin) || margin <= 0) return;
    setPhoenixAccount(prev => {
      if (!prev) return prev;
      const availableToSpend = Math.max(0, Number(prev.available_to_spend ?? prev.balance ?? 0) - margin);
      const availableToWithdraw = Math.max(0, Number(prev.available_to_withdraw ?? prev.available_to_spend ?? prev.balance ?? 0) - margin);
      const totalMarginUsed = Math.max(0, Number(prev.total_margin_used || 0) + margin);
      return {
        ...prev,
        available_to_spend: String(availableToSpend),
        available_to_withdraw: String(availableToWithdraw),
        total_margin_used: String(totalMarginUsed),
      };
    });
  }, [setPhoenixAccount]);

  const checkInviteStatus = useCallback(async () => {
    if (!isActiveDex || !walletAddr || walletMismatch) {
      setInviteStatus({ checking: false, whitelisted: null, codeUsed: null });
      return null;
    }
    const setupCachedStatus = cachedPhoenixInviteStatus(walletAddr);
    if (setupCachedStatus?.setupCached) {
      setInviteStatus(setupCachedStatus);
      return {
        whitelisted: true,
        invite_code_used: setupCachedStatus.codeUsed || null,
        cached: true,
        setupCached: true,
      };
    }
    if (inviteCheckInFlightRef.current?.wallet === walletAddr) {
      return inviteCheckInFlightRef.current.promise;
    }
    const accessCache = cachedPhoenixAccess(walletAddr);
    if (accessCache) {
      setInviteStatus({
        checking: true,
        whitelisted: null,
        codeUsed: accessCache.codeUsed || accessCache.code || null,
        cached: true,
      });
    } else {
      setInviteStatus(prev => ({ ...prev, checking: true }));
    }

    const promise = (async () => {
      const check = await checkInviteWalletWithFallback(walletAddr);
      if (check?.whitelisted) {
        cachePhoenixAccess(walletAddr, {
          source: 'invite_check',
          codeUsed: check?.invite_code_used || null,
        });
      } else {
        clearPhoenixAccess(walletAddr);
      }
      const next = {
        checking: false,
        whitelisted: !!check?.whitelisted,
        codeUsed: check?.invite_code_used || null,
        cached: false,
      };
      setInviteStatus(next);
      return check;
    })();

    inviteCheckInFlightRef.current = { wallet: walletAddr, promise };
    try {
      return await promise;
    } catch {
      setInviteStatus(prev => ({ ...prev, checking: false }));
      return null;
    } finally {
      if (inviteCheckInFlightRef.current?.promise === promise) {
        inviteCheckInFlightRef.current = null;
      }
    }
  }, [checkInviteWalletWithFallback, isActiveDex, walletAddr, walletMismatch]);

  const activate = useCallback(async (inviteOptions = {}) => {
    if (!walletAddr) {
      setError('Wallet not connected');
      return false;
    }
    if (walletMismatch) {
      setError(walletMismatchMessage || 'Wrong Solana wallet');
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
      || (inviteOptions?.accessCode ? 'access' : 'referral')
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
                await activateInviteReferralWithFallback(walletAddr, inviteCode);
              } else {
                await activateInviteCodeWithFallback(walletAddr, inviteCode);
              }
              cachePhoenixAccess(walletAddr, { source: 'activate_invite', codeUsed: inviteCode, inviteKind });
              setInviteStatus({ checking: false, whitelisted: true, codeUsed: inviteCode, inviteKind });
            } else {
              clearPhoenixAccess(walletAddr);
              setInviteStatus(prev => ({
                ...prev,
                checking: false,
                whitelisted: false,
              }));
              throw new Error('Phoenix access code required');
            }
          } else {
            cachePhoenixAccess(walletAddr, { source: 'activate_check', codeUsed: check?.invite_code_used || null });
          }
          const registerClient = await getTransactionClient(false);
          const ix = await registerClient.ixs.buildRegisterTrader({
            authority: walletAddr,
            marginType: MarginType.Cross || 'cross',
          });
          await sendIxs(ix, 'phoenix.register');
          traderRegisteredRef.current = true;
          setTraderRegistered(true);
          cachePhoenixSetup(walletAddr, { source: 'register' });
          setInviteStatus(prev => ({
            checking: false,
            whitelisted: true,
            codeUsed: prev?.codeUsed || inviteCode || null,
            inviteKind: prev?.inviteKind || inviteKind || null,
            cached: true,
            setupCached: true,
          }));
        }
        const state = await waitForTraderState();
        if (!state) throw new Error('Phoenix account is not visible on RPC yet; retry in a few seconds');
        cachePhoenixSetup(walletAddr, { source: 'activate_verified' });
        setInviteStatus(prev => ({
          checking: false,
          whitelisted: true,
          codeUsed: prev?.codeUsed || inviteCode || null,
          inviteKind: prev?.inviteKind || inviteKind || null,
          cached: true,
          setupCached: true,
        }));
        return true;
      } catch (e) {
        const text = e?.message || 'Phoenix activation failed';
        if (/already|exists|initialized/i.test(text)) {
          traderRegisteredRef.current = true;
          setTraderRegistered(true);
          cachePhoenixSetup(walletAddr, { source: 'register_already_exists' });
          setInviteStatus(prev => ({
            checking: false,
            whitelisted: true,
            codeUsed: prev?.codeUsed || inviteCode || null,
            inviteKind: prev?.inviteKind || inviteKind || null,
            cached: true,
            setupCached: true,
          }));
          const state = await waitForTraderState(6);
          if (!state) {
            setError('Phoenix account is not visible on RPC yet; retry in a few seconds');
            return false;
          }
          return true;
        }
        setError(text);
        return false;
      } finally {
        setLoading(false);
      }
    });
  }, [activateInviteCodeWithFallback, activateInviteReferralWithFallback, checkInviteStatus, getTransactionClient, runOnce, sendIxs, waitForTraderState, walletAddr, walletMismatch, walletMismatchMessage]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch || traderRegistered) return undefined;
    let cancelled = false;
    (async () => {
      if (!cancelled) await checkInviteStatus();
    })();
    return () => { cancelled = true; };
  }, [checkInviteStatus, isActiveDex, traderRegistered, walletAddr, walletMismatch]);

  const depositToPacifica = useCallback(async (amountUsdc) => {
    if (!walletAddr) {
      setError('Wallet not connected');
      return { error: 'Wallet not connected' };
    }
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    return runOnce(`deposit:${walletAddr}:${amountUsdc}`, async () => {
      const amountLabel = String(amountUsdc ?? '');
      setLoading(true);
      setDepositStatus({ status: 'preparing', amount: amountLabel });
      setError(null);
      try {
        if (!traderRegisteredRef.current && !traderRegistered) {
          const ok = await activate();
          if (!ok) throw new Error('Phoenix account is not ready');
          setDepositStatus({ status: 'preparing', amount: amountLabel });
        }
        const requested = Number(amountUsdc);
        if (!Number.isFinite(requested) || requested <= 0) throw new Error('Enter a positive USDC amount');
        let walletBalance = Number(walletUsdc);
        if (!Number.isFinite(walletBalance)) walletBalance = await fetchWalletUsdc();
        if (requested > walletBalance + 0.000001) walletBalance = await fetchWalletUsdc();
        if (requested > walletBalance + 0.000001) {
          throw new Error(`Not enough Solana USDC: need ${formatUsdcAmount(requested)}, wallet has ${formatUsdcAmount(walletBalance)}.`);
        }
        const amount = toRawUsdc(amountUsdc);
        const txClient = await getTransactionClient(false);
        const built = await buildCollateralIxs(txClient, amount, 'deposit', walletAddr);
        setDepositStatus({ status: 'depositing', amount: amountLabel });
        const signature = await sendIxs(built.instructions, 'phoenix.deposit', {
          skipPreflight: true,
          fastBlockhash: true,
          maxAttempts: 2,
        });
        await Promise.all([refreshTraderState({ force: true }), fetchWalletUsdc()]);
        claimGold();
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix deposit failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
        setDepositStatus(null);
      }
    });
  }, [activate, buildCollateralIxs, claimGold, fetchWalletUsdc, getTransactionClient, refreshTraderState, runOnce, sendIxs, traderRegistered, walletAddr, walletMismatch, walletMismatchMessage, walletUsdc]);

  const withdraw = useCallback(async (amountUsdc) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    return runOnce(`withdraw:${walletAddr}:${amountUsdc}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const requested = Number(amountUsdc);
        if (!Number.isFinite(requested) || requested <= 0) throw new Error('Enter a positive USDC amount');
        await refreshTraderState({ force: true });
        const latestAccount = accountRef.current;
        const rawAvailable = Math.max(0, Number(latestAccount?.available_to_withdraw || 0));
        const hasRisk = Number(latestAccount?.positions_count || 0) > 0
          || Number(latestAccount?.orders_count || 0) > 0;
        const availableForWithdraw = Math.max(0, rawAvailable - (hasRisk ? PHOENIX_WITHDRAW_RISK_BUFFER_USDC : 0));
        if (requested > availableForWithdraw + 0.000001) {
          throw new Error(`Phoenix withdrawable collateral is ${formatUsdcAmount(availableForWithdraw)} USDC. Withdraw less, or close positions/cancel orders first.`);
        }
        const amount = toRawUsdc(amountUsdc);
        const txClient = await getTransactionClient(false);
        const built = await buildCollateralIxs(txClient, amount, 'withdraw', walletAddr);
        const signature = await sendIxs(built.instructions, 'phoenix.withdraw');
        await Promise.all([refreshTraderState({ force: true }), fetchWalletUsdc()]);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix withdraw failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [buildCollateralIxs, fetchWalletUsdc, getTransactionClient, refreshTraderState, runOnce, sendIxs, walletAddr, walletMismatch, walletMismatchMessage]);

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

  const placeMarketOrder = useCallback(async (symbol, side, amount, _slippage = '0.5', leverage = 1) => {
    void _slippage;
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
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
        const baseUnits = buildBaseUnitsFromMargin(phx, amount, leverage);
        const priceLimitUsd = marketOrderPriceLimitUsd(sideEnum, mark);
        const signature = await withFreshPhoenixMetadataRetry('phoenix.market', phx, async (orderClient) => {
          const market = marketsBySymbolRef.current[phx];
          const packet = await orderClient.orderPackets.buildMarketOrderPacket({
            symbol: phx,
            side: sideEnum,
            baseUnits,
            priceLimitUsd,
            minBaseUnitsToFill: PHOENIX_MARKET_MIN_BASE_UNITS_TO_FILL,
            minQuoteLotsToFill: PHOENIX_MARKET_MIN_QUOTE_LOTS_TO_FILL,
          });
          if (isPhoenixIsolatedOnlyMarket(market)) {
            const isolated = await resolvePhoenixIsolatedSubaccount(orderClient, phx);
            const transferUsdc = Math.max(
              Number(amount),
              phoenixRequiredIsolatedTransferUsdc({
                baseUnits,
                priceUsd: priceLimitUsd || mark,
                leverage,
                market,
              })
            );
            const transferIx = await orderClient.ixs.buildTransferCollateral({
              authority: walletAddr,
              traderPdaIndex: 0,
              srcSubaccountIndex: 0,
              dstSubaccountIndex: isolated.subaccountIndex,
              amount: toRawUsdcCeil(transferUsdc),
            });
            const orderIx = await orderClient.ixs.placeMarketOrder({
              authority: walletAddr,
              symbol: phx,
              orderPacket: packet,
              traderPdaIndex: 0,
              traderSubaccountIndex: isolated.subaccountIndex,
            });
            const sweepIx = await orderClient.ixs.buildTransferCollateralChildToParent({
              authority: walletAddr,
              traderPdaIndex: 0,
              childSubaccountIndex: isolated.subaccountIndex,
            });
            console.info('[Phoenix] isolated market order path', {
              symbol: phx,
              subaccount_index: isolated.subaccountIndex,
              subaccount_source: isolated.source,
              transfer_usdc: formatUsdcAmount(transferUsdc),
            });
            return sendIxs(
              [isolated.registerIx, transferIx, orderIx, sweepIx].filter(Boolean),
              'phoenix.market.isolated',
              { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT }
            );
          }
          const ix = await orderClient.ixs.placeMarketOrder({
            authority: walletAddr,
            symbol: phx,
            orderPacket: packet,
            traderPdaIndex: 0,
            traderSubaccountIndex: 0,
          });
          return sendIxs(ix, 'phoenix.market', { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT });
        });
        applyOptimisticMarginUse(amount);
        refreshTraderStateSoon([250, 1_000, 3_500, 8_000]);
        void reportPhoenixTradeTx({
          signature,
          symbol: phx,
          side: sideEnum === Side.Bid ? 'long' : 'short',
          amount,
          leverage,
          notional_usd: Number(amount) * Number(leverage || 1),
          price: mark,
          order_type: 'market',
          trade_kind: 'open',
        }).then(() => claimGold({ force: true, importFills: false }));
        setTimeout(() => claimGold({ force: true, importFills: false }), 12_000);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix market order failed';
        console.warn('[Phoenix] placeMarketOrder failed', {
          symbol: phx,
          side,
          amount,
          leverage,
          message: msg,
          code: phoenixSimulationCode(e),
          failed_program_id: phoenixFailedProgramId(e),
          logs: phoenixErrorLogs(e).slice(-10),
        });
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [activate, applyOptimisticMarginUse, buildBaseUnitsFromMargin, claimGold, refreshTraderStateSoon, reportPhoenixTradeTx, resolvePhoenixIsolatedSubaccount, runOnce, sendIxs, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1) => {
    void _tif;
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    const phx = phoenixSymbol(symbol);
    return runOnce(`limit:${walletAddr}:${phx}:${side}:${price}:${amount}:${leverage}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const ok = await activate();
        if (!ok) throw new Error('Phoenix account is not ready');
        const signature = await withFreshPhoenixMetadataRetry('phoenix.limit', phx, async (orderClient) => {
          const market = marketsBySymbolRef.current[phx];
          const baseUnits = buildBaseUnitsFromMargin(phx, amount, leverage, Number(price));
          const packet = await orderClient.orderPackets.buildLimitOrderPacket({
            symbol: phx,
            side: sideToPhoenix(side),
            priceUsd: String(price),
            baseUnits,
          });
          if (isPhoenixIsolatedOnlyMarket(market)) {
            const isolated = await resolvePhoenixIsolatedSubaccount(orderClient, phx);
            const transferUsdc = Math.max(
              Number(amount),
              phoenixRequiredIsolatedTransferUsdc({
                baseUnits,
                priceUsd: price,
                leverage,
                market,
              })
            );
            const transferIx = await orderClient.ixs.buildTransferCollateral({
              authority: walletAddr,
              traderPdaIndex: 0,
              srcSubaccountIndex: 0,
              dstSubaccountIndex: isolated.subaccountIndex,
              amount: toRawUsdcCeil(transferUsdc),
            });
            const orderIx = await orderClient.ixs.buildPlaceLimitOrder({
              authority: walletAddr,
              symbol: phx,
              orderPacket: packet,
              traderPdaIndex: 0,
              traderSubaccountIndex: isolated.subaccountIndex,
            });
            const sweepIx = await orderClient.ixs.buildTransferCollateralChildToParent({
              authority: walletAddr,
              traderPdaIndex: 0,
              childSubaccountIndex: isolated.subaccountIndex,
            });
            console.info('[Phoenix] isolated limit order path', {
              symbol: phx,
              subaccount_index: isolated.subaccountIndex,
              subaccount_source: isolated.source,
              transfer_usdc: formatUsdcAmount(transferUsdc),
            });
            return sendIxs(
              [isolated.registerIx, transferIx, orderIx, sweepIx].filter(Boolean),
              'phoenix.limit.isolated',
              { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT }
            );
          }
          const ix = await orderClient.ixs.buildPlaceLimitOrder({
            authority: walletAddr,
            symbol: phx,
            orderPacket: packet,
            traderPdaIndex: 0,
            traderSubaccountIndex: 0,
          });
          return sendIxs(ix, 'phoenix.limit', { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT });
        });
        applyOptimisticMarginUse(amount);
        refreshTraderStateSoon([250, 1_000, 3_500, 8_000]);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix limit order failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [activate, applyOptimisticMarginUse, buildBaseUnitsFromMargin, refreshTraderStateSoon, resolvePhoenixIsolatedSubaccount, runOnce, sendIxs, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  const closePosition = useCallback(async (symbol, side, amount, _pairIndex = null, _tradeIndex = null, fullClose = false) => {
    void _pairIndex;
    void _tradeIndex;
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    const phx = phoenixSymbol(symbol);
    return runOnce(`close:${walletAddr}:${phx}:${side}:${amount}:${fullClose ? 'full' : 'partial'}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const existing = positions.find(p => p.symbol === phx && p.side === side)
          || positions.find(p => p.symbol === phx)
          || null;
        const positionSide = existing?.side || side;
        const closeSide = positionSide === 'bid' ? Side.Ask : Side.Bid;
        const subaccountIndex = Number(existing?._phoenixSubaccountIndex || 0);
        const m = marketsBySymbolRef.current[phx];
        const requested = Number(amount);
        const openAmount = Number(existing?.amount || 0);
        const rawFullCloseAmount = fullClose ? rawPhoenixPositionAmount(existing, m) : null;
        const amountToClose = fullClose && (rawFullCloseAmount || openAmount) > 0
          ? (rawFullCloseAmount || openAmount)
          : (openAmount > 0 && Number.isFinite(requested) ? Math.min(requested, openAmount) : requested);
        const roundedAmount = roundDownToLot(amountToClose, m?.lot_size || '0.0001');
        const baseUnits = formatBaseUnits(roundedAmount, m?.lot_size || '0.0001');
        if (!(Number(baseUnits) > 0)) throw new Error('Phoenix close amount is below this market lot size');
        const mark = Number(existing?.mark_price || pricesRef.current.find(p => p.symbol === phx)?.mark || 0);
        const priceLimitUsd = marketOrderPriceLimitUsd(closeSide, mark);
        const signature = await withFreshPhoenixMetadataRetry('phoenix.close', phx, async (orderClient) => {
          const packet = await orderClient.orderPackets.buildMarketOrderPacket({
            symbol: phx,
            side: closeSide,
            baseUnits,
            priceLimitUsd,
            minBaseUnitsToFill: PHOENIX_MARKET_MIN_BASE_UNITS_TO_FILL,
            minQuoteLotsToFill: PHOENIX_MARKET_MIN_QUOTE_LOTS_TO_FILL,
            selfTradeBehavior: SelfTradeBehavior.Abort,
            orderFlags: OrderFlags.ReduceOnly,
            cancelExisting: false,
          });
          const ix = await orderClient.ixs.placeMarketOrder({
            authority: walletAddr,
            symbol: phx,
            orderPacket: packet,
            traderPdaIndex: 0,
            traderSubaccountIndex: subaccountIndex,
          });
          return sendIxs(ix, 'phoenix.close', { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT });
        });
        refreshTraderStateSoon();
        void reportPhoenixTradeTx({
          signature,
          symbol: phx,
          side: positionSide === 'bid' ? 'close_long' : 'close_short',
          amount: baseUnits,
          leverage: 1,
          notional_usd: Number(baseUnits) * Number(mark || 0),
          price: mark,
          order_type: 'market',
          trade_kind: 'close',
        }).then(() => claimGold({ force: true, importFills: false }));
        setTimeout(() => claimGold({ force: true, importFills: false }), 12_000);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix close failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [claimGold, positions, refreshTraderStateSoon, reportPhoenixTradeTx, runOnce, sendIxs, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  const cancelOrder = useCallback(async (symbol, orderId) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    const phx = phoenixSymbol(symbol);
    return runOnce(`cancel:${walletAddr}:${phx}:${orderId}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const existing = orders.find(o => String(o.order_id) === String(orderId) || String(o.orderSequenceNumber) === String(orderId));
        const subaccountIndex = Number(existing?._phoenixSubaccountIndex || 0);
        const signature = await withFreshPhoenixMetadataRetry('phoenix.cancel', phx, async (orderClient) => {
          const ix = existing?.price
            ? await orderClient.ixs.buildCancelOrdersById({
                authority: walletAddr,
                symbol: phx,
                orders: [{ price: Number(existing.price), orderSequenceNumber: existing.orderSequenceNumber || orderId }],
                traderPdaIndex: 0,
                traderSubaccountIndex: subaccountIndex,
              })
            : await orderClient.ixs.buildCancelAll({
                authority: walletAddr,
                symbol: phx,
                traderPdaIndex: 0,
                traderSubaccountIndex: subaccountIndex,
              });
          return sendIxs(ix, 'phoenix.cancel', { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT });
        });
        refreshTraderStateSoon();
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix cancel failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [orders, refreshTraderStateSoon, runOnce, sendIxs, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  const setLeverage = useCallback(async () => ({ success: true }), []);
  const setMarginMode = useCallback(async (_symbol, isolated) => (
    isolated
      ? { error: 'Phoenix isolated subaccounts are readable, but new Clash orders are placed from cross margin.' }
      : { success: true }
  ), []);

  const setTpsl = useCallback(async (symbol, side, takeProfit, stopLoss) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    const phx = phoenixSymbol(symbol);
    return runOnce(`tpsl:${walletAddr}:${phx}:${side}:${takeProfit || ''}:${stopLoss || ''}`, async () => {
      setLoading(true);
      setError(null);
      try {
        if (!takeProfit && !stopLoss) return { success: true };
        const requestedPositionSide = sideToUi(sideToPhoenix(side));
        const position = positions.find(p => p.symbol === phx && p.side === requestedPositionSide)
          || positions.find(p => p.symbol === phx)
          || null;
        if (!position) throw new Error(`No open ${phx} position to attach TP/SL to`);
        const closeSide = position.side === 'bid' ? Side.Ask : Side.Bid;
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

        const signature = await withFreshPhoenixMetadataRetry('phoenix.tpsl', phx, async (orderClient) => {
          const createConditionalIx = await ensureConditionalOrdersAccountIx(subaccountIndex, orderClient);
          const placeConditionalIx = await orderClient.ixs.buildPlacePositionConditionalOrder({
            authority: walletAddr,
            symbol: phx,
            greaterTriggerOrder,
            lessTriggerOrder,
            sizePercent: 100,
            traderPdaIndex: 0,
            traderSubaccountIndex: subaccountIndex,
          });
          const instructions = [createConditionalIx, placeConditionalIx].filter(Boolean);
          console.info('[Phoenix] TP/SL build', {
            symbol: phx,
            requested_side: side,
            position_side: position.side,
            close_side: closeSide === Side.Bid ? 'bid' : 'ask',
            wallet: shortPhoenixAddress(walletAddr),
            subaccount_index: subaccountIndex,
            mark_price: mark || null,
            take_profit: tp,
            stop_loss: sl,
            has_conditional_account: !createConditionalIx,
            creates_conditional_account: !!createConditionalIx,
            greater_trigger: !!greaterTriggerOrder,
            less_trigger: !!lessTriggerOrder,
            instruction_count: instructions.length,
            conditional_order_capacity: createConditionalIx ? PHOENIX_CONDITIONAL_ORDER_CAPACITY : null,
          });
          return sendIxs(instructions, 'phoenix.tpsl', { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT });
        });
        const optimisticKey = phoenixPositionTpslKey(phx, position.side, subaccountIndex);
        tpslOptimisticRef.current.set(optimisticKey, {
          takeProfit: tp,
          stopLoss: sl,
          at: Date.now(),
        });
        setPhoenixPositions(prev => prev.map(p => {
          const samePosition = p?.symbol === phx
            && p?.side === position.side
            && Number(p?._phoenixSubaccountIndex || 0) === subaccountIndex;
          if (!samePosition) return p;
          return {
            ...p,
            take_profit_price: tp != null ? tp : p.take_profit_price,
            stop_loss_price: sl != null ? sl : p.stop_loss_price,
            _phoenixOptimisticTakeProfitPrice: tp != null ? tp : p._phoenixOptimisticTakeProfitPrice,
            _phoenixOptimisticStopLossPrice: sl != null ? sl : p._phoenixOptimisticStopLossPrice,
            _phoenixTpslPendingRefresh: true,
          };
        }));
        const optimisticPosition = {
          ...position,
          take_profit_price: tp != null ? tp : position.take_profit_price,
          stop_loss_price: sl != null ? sl : position.stop_loss_price,
          _phoenixOptimisticTakeProfitPrice: tp != null ? tp : position._phoenixOptimisticTakeProfitPrice,
          _phoenixOptimisticStopLossPrice: sl != null ? sl : position._phoenixOptimisticStopLossPrice,
          _phoenixTpslPendingRefresh: true,
        };
        setPhoenixOrders(prev => [
          ...prev.filter(o => !(
            o?._phoenixSyntheticTpsl
            && o?.symbol === phx
            && o?.side === position.side
            && Number(o?._phoenixSubaccountIndex || 0) === subaccountIndex
          )),
          ...tpslOrdersFromPositions([optimisticPosition]),
        ]);
        refreshTraderStateSoon([1_000, 4_000, 10_000, 20_000]);
        return { success: true, signature };
      } catch (e) {
        const msg = phoenixInsufficientLamportsMessage(e) || e?.message || 'Phoenix TP/SL failed';
        console.warn('[Phoenix] setTpsl failed', {
          symbol: phx,
          requested_side: side,
          take_profit: takeProfit || null,
          stop_loss: stopLoss || null,
          code: phoenixSimulationCode(e),
          failed_program_id: phoenixFailedProgramId(e),
          lighthouse_assertion: isLighthouseAssertionError(e),
          logs: phoenixErrorLogs(e).slice(-10),
          message: msg,
        });
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [ensureConditionalOrdersAccountIx, positions, refreshTraderStateSoon, runOnce, sendIxs, setPhoenixOrders, setPhoenixPositions, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      if (!marketsRef.current.length) await fetchMarkets();
      else await fetchPrices();
      if (walletAddr && !walletMismatch) {
        await fetchWalletUsdc();
        const status = traderStateResourceRef.current?.status?.();
        const wsHealthy = traderStateWsReadyRef.current || status?.isConnected || status?.health === 'live';
        const needsRestFallback = !wsHealthy
          && Date.now() - lastTraderStateRestAtRef.current > PHOENIX_TRADER_STATE_REST_FALLBACK_MS;
        if (needsRestFallback) {
          await refreshTraderState().catch(e => {
            console.warn('[Phoenix] periodic REST trader fallback failed', e?.message || e);
            return null;
          });
        }
      } else {
        setAccountReady(false);
        setDataReady(true);
      }
    }
    const runTick = () => {
      tick().catch(e => {
        console.warn('[Phoenix] periodic refresh failed', e?.message || e);
      });
    };
    runTick();
    const iv = setInterval(runTick, POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [fetchMarkets, fetchPrices, fetchWalletUsdc, isActiveDex, refreshTraderState, walletAddr, walletMismatch]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch) return undefined;
    if (!traderRegisteredRef.current && !traderRegistered) return undefined;
    const timer = setTimeout(() => {
      getTransactionClient(false).catch(() => {});
    }, 750);
    return () => clearTimeout(timer);
  }, [getTransactionClient, isActiveDex, traderRegistered, walletAddr, walletMismatch]);

  const effectiveTraderRegistered = traderRegistered;
  const effectiveAccountReady = accountReady;
  const effectiveDataReady = dataReady;
  const effectiveInviteStatus = inviteStatus;

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
    dataReady: effectiveDataReady,
    accountReady: effectiveAccountReady,
    isReady: !!walletAddr && effectiveTraderRegistered,
    setupVerified: walletAddr ? (effectiveAccountReady ? effectiveTraderRegistered : null) : false,
    inviteStatus: effectiveInviteStatus,
    loading,
    depositStatus,
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
