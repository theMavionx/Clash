import { useState, memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSend } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePacifica } from '../hooks/usePacifica';
import { useAvantis } from '../hooks/useAvantis';
import { useDecibel } from '../hooks/useDecibel';
import { useGmx } from '../hooks/useGmx';
import { useMonad } from '../hooks/useMonad';
import { usePhoenix } from '../hooks/usePhoenix';
import { useHyperliquid } from '../hooks/useHyperliquid';
import { useRisex } from '../hooks/useRisex';
import { useNado } from '../hooks/useNado';
import { useHibachi } from '../hooks/useHibachi';
import { useHotstuff } from '../hooks/useHotstuff';
import { useGrvt } from '../hooks/useGrvt';
import { useKatana } from '../hooks/useKatana';
import { useGmtrade } from '../hooks/useGmtrade';
import { useFlash } from '../hooks/useFlash';
import { useLighter } from '../hooks/useLighter';
import { useBulk } from '../hooks/useBulk';
import { useOstium } from '../hooks/useOstium';
import { RISEX_BRIDGE_CHAINS } from '../lib/risexConfig';
import { useDex, DEX_CONFIG } from '../contexts/DexContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useFuturesMode } from '../contexts/FuturesModeContext';
import FuturesModeSelect from './FuturesModeSelect';
import BasicTradeFlow from './basic/BasicTradeFlow';
import ShareTradeModal from './basic/ShareTradeModal';
import { useFarcaster } from '../hooks/useFarcaster';
import { cartoonBtn } from '../styles/theme';
import TradingViewWidget from './TradingViewWidget';
import EvmWalletModal from './EvmWalletModal';
import { useOptionalPrivy } from './PrivyAuthProvider';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import OrderBook from './OrderBook';
import TradeHistory from './TradeHistory';
import FundingHistory from './FundingHistory';
import QuestsTab from './QuestsTab';
import TradeIdeaModal from './TradeIdeaModal';
import { useElfaSignals } from '../hooks/useElfaSignals';
import FilterPopup from './FilterPopup';
import TokenIcon from './TokenIcon';
import GoldRewardToast from './GoldRewardToast';
import { GOLD_REWARD_PANEL_TOAST_STYLE } from './goldRewardToastStyles';
import { openSolanaWallet } from '../lib/solanaWalletUi';
import { setClientActivity } from '../lib/updateCoordinator';
import { reportClientEvent } from '../lib/clientLogger';
import { resolveOrderDisplayMetrics } from '../lib/orderDisplayMetrics';
import {
  ostiumMaxTakeProfitPrice,
  validateOstiumStopLossDirection,
  validateOstiumTakeProfitDirection,
  validateOstiumTakeProfitLimit,
} from '../lib/ostiumTpLimits';
import {
  ostiumMarketSymbol,
  ostiumOpenTradeBlockMessage,
  ostiumOpenTradeBlockReason,
} from '../lib/ostiumMarketStatus';
import { OSTIUM_ORACLE_FEE_BUFFER_USD, ostiumOracleFeeBufferMessage } from '../lib/ostiumConfig';
import pacificaLogo from '../assets/pacifica.png';
import elfaBadge from '../assets/photo_5976518637193465030_x.jpg';

const TABS = [
  { id: 'Trade', icon: <svg className="tab-icon-trade" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path className="trend-line" d="m19 9-5 5-4-4-3 3"/></svg>, label: 'Trade' },
  { id: 'Positions', icon: <svg className="tab-icon-positions" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect className="briefcase-body" width="20" height="14" x="2" y="7" rx="2" ry="2"/><path className="handle" d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>, label: 'Positions' },
  { id: 'Orders', icon: <svg className="tab-icon-orders" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line className="order-line" x1="8" y1="6" x2="21" y2="6"/><line className="order-line" x1="8" y1="12" x2="21" y2="12"/><line className="order-line" x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>, label: 'Orders' },
  { id: 'Quests', icon: <svg className="tab-icon-quests" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><g className="sword-group"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></g></svg>, label: 'Quests' },
  { id: 'Account', icon: <svg className="tab-icon-account" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path className="avatar-body" d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle className="avatar-head" cx="12" cy="7" r="4"/></svg>, label: 'Account' },
];

const POPULAR_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'SUI', 'TRUMP'];
const FIAT_SYMBOLS = new Set([
  'AUD', 'BRL', 'CAD', 'CHF', 'CNH', 'EUR', 'GBP', 'IDR', 'INR', 'JPY', 'KRW',
  'MXN', 'NZD', 'SEK', 'SGD', 'TRY', 'TWD', 'USD', 'ZAR',
]);
const PACIFICA_MIN_NOTIONAL_USD = 10;
const PACIFICA_MARKET_SLIPPAGE_RATE = 0.005;
const PACIFICA_DEFAULT_TAKER_FEE_RATE = 0.0004;
const PACIFICA_FEE_BUFFER_RATE = 0.0001;
const PACIFICA_MARGIN_SAFETY_RATE = 0.015;
const PACIFICA_MARGIN_SAFETY_USD = 0.15;
const PACIFICA_MAX_BALANCE_USAGE = 0.985;
const PACIFICA_AGENT_REQUIRED_MESSAGE = 'Enable 1-tap trading, then try again. Pacifica rejected the direct wallet signature for this account setting.';
const PHOENIX_MARKET_SLIPPAGE_RATE = 0.02;
const PHOENIX_DEFAULT_TAKER_FEE_RATE = 0.00035;
const PHOENIX_FEE_BUFFER_RATE = 0.0001;
const PHOENIX_DEFAULT_REFERRAL_CODE = 'MVWG4BTW';
const HOTSTUFF_MARKET_SLIPPAGE_RATE = 0.015;
const HOTSTUFF_DEFAULT_TAKER_FEE_RATE = 0.00045;
const OSTIUM_MIN_MARGIN_USD = 5;

const HOTSTUFF_FEE_BUFFER_RATE = 0.0001;
const DEX_ERROR_LABELS = {
  avantis: 'Avantis',
  decibel: 'Decibel',
  flash: 'Flash',
  gmtrade: 'GMTrade',
  gmx: 'GMX',
  grvt: 'GRVT',
  hibachi: 'Hibachi',
  hotstuff: 'Hotstuff',
  hyperliquid: 'Hyperliquid',
  katana: 'Katana',
  lighter: 'Lighter',
  monad: 'Perpl',
  nado: 'Nado',
  ostium: 'Ostium',
  pacifica: 'Pacifica',
  phoenix: 'Phoenix',
  risex: 'RISEx',
  bulk: 'Bulk',
};
const OPEN_TPSL_NATIVE_ORDER_ATTACH_DEXES = new Set(['avantis', 'bulk', 'decibel', 'flash', 'gmx', 'hibachi', 'hotstuff', 'hyperliquid', 'katana', 'lighter', 'nado', 'ostium', 'pacifica']);
const OPEN_TPSL_NATIVE_LIMIT_ATTACH_DEXES = new Set([...OPEN_TPSL_NATIVE_ORDER_ATTACH_DEXES, 'grvt', 'phoenix']);
const OPEN_TPSL_POST_MARKET_DEXES = new Set([
  'decibel',
  'gmx',
  'hotstuff',
  'hyperliquid',
  'katana',
  'lighter',
  'monad',
  'nado',
  'ostium',
  'pacifica',
  'phoenix',
  'risex',
  'grvt',
  'gmtrade',
  'hibachi',
]);

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

function cleanIconSymbol(value) {
  const text = String(value || '').trim();
  if (!text || text === '?' || text === '-' || /^unknown$/iu.test(text)) return '';
  return text;
}

function baseSymbolForIcon(market, fallbackSymbol = '') {
  const forexPair = isForexMarket(market)
    ? cleanIconSymbol(market?.display_symbol || market?.pair || market?.market_name || fallbackSymbol)
    : '';
  if (forexPair) return forexPair;
  const raw = forexPair
    || cleanIconSymbol(market?.icon_symbol)
    || cleanIconSymbol(market?.base)
    || cleanIconSymbol(market?.base_asset)
    || cleanIconSymbol(market?.base_symbol)
    || cleanIconSymbol(market?.display_base_asset_symbol)
    || cleanIconSymbol(fallbackSymbol)
    || cleanIconSymbol(market?.symbol);
  if (!raw) return '';
  return raw
    .replace(/[_/-]?(USDT|USDC|USD|PERP)$/iu, '')
    .replace(/[_/-]?(USDT|USDC|USD)[_/-]?PERP$/iu, '')
    .replace(/[_/-]?(USDT|USDC|USD)$/iu, '');
}

function isForexMarket(market) {
  const category = String(market?.category || market?.assetClass || market?.asset_class || '').toLowerCase();
  if (category.includes('forex')) return true;
  const pair = String(market?.pair || market?.market_name || '').toUpperCase().trim();
  const parts = pair.split('/');
  return parts.length === 2 && FIAT_SYMBOLS.has(parts[0]) && FIAT_SYMBOLS.has(parts[1]);
}

function marketDisplaySymbol(market) {
  if (market?.display_symbol) return String(market.display_symbol);
  if (isForexMarket(market) && (market?.pair || market?.market_name)) {
    return String(market.pair || market.market_name).toUpperCase();
  }
  return String(market?.symbol || '');
}

function marketChange24h(priceRow) {
  if (!priceRow) return 0;
  const explicit = firstFinite(
    priceRow.price_change_24h,
    priceRow.change_24h,
    priceRow.change24h,
    priceRow.priceChange24h,
    priceRow.price_change_pct_24h,
    priceRow.percent_change_24h,
    priceRow.change_pct,
    priceRow.daily_change_pct,
  );
  if (explicit != null) return explicit;
  const mark = firstFinite(priceRow.mark, priceRow.mid, priceRow.oracle, priceRow.last_price);
  const yest = firstFinite(priceRow.yesterday_price, priceRow.prev_day_price, priceRow.open24h, priceRow.price_24h_ago);
  return mark != null && yest != null && yest > 0 ? ((mark - yest) / yest) * 100 : 0;
}

function sumObjectNumbers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let total = 0;
  let found = false;
  for (const item of Object.values(value)) {
    const n = finiteNumber(item);
    if (n == null) continue;
    total += Math.abs(n);
    found = true;
  }
  return found ? total : null;
}

function marketVolume24h(row = {}) {
  const raw = row?._raw || {};
  const volume = firstFinite(
    row.volume_24h,
    row.volume24h,
    row.volume24H,
    row.quote_volume_24h,
    row.quoteVolume24h,
    row.daily_volume,
    row.dailyVolume,
    row.turnover_24h,
    row.turnover24h,
    row.turnover,
    row.notional_volume_24h,
    row.volumeUsd24h,
    row.volume_usd_24h,
    row.daily_quote_token_volume,
    row.dailyQuoteTokenVolume,
    raw.volume_24h,
    raw.volume24h,
    raw.quote_volume_24h,
    raw.daily_volume,
    raw.dailyVolume,
    raw.turnover_24h,
    raw.turnover,
    raw.notional_volume_24h,
    raw.volumeUsd24h,
    raw.volume_usd_24h,
    raw.daily_quote_token_volume,
    raw.dailyQuoteTokenVolume,
  );
  if (volume != null && volume > 0) return volume;
  const baseVolume = firstFinite(
    row.daily_base_token_volume,
    row.dailyBaseTokenVolume,
    raw.daily_base_token_volume,
    raw.dailyBaseTokenVolume,
  );
  const mark = firstFinite(row.mark, row._mark, row.mid, row.oracle, row.price, row.last_price, raw.mark, raw.price, raw.last_trade_price);
  return baseVolume != null && baseVolume > 0 && mark != null && mark > 0 ? baseVolume * mark : 0;
}

function marketOpenInterest(row = {}) {
  const raw = row?._raw || {};
  const oi = firstFinite(
    row.open_interest,
    row.openInterest,
    row.oi,
    row.open_interest_usd,
    row.openInterestUsd,
    raw.open_interest,
    raw.openInterest,
    raw.oi,
    raw.open_interest_usd,
    raw.openInterestUsd,
  );
  if (oi != null && oi > 0) return oi;
  return sumObjectNumbers(row.openInterest) || sumObjectNumbers(raw.openInterest) || 0;
}

function popularSymbolRank(symbol) {
  const base = baseSymbolForIcon(null, symbol).toUpperCase();
  const index = POPULAR_SYMBOLS.indexOf(base);
  return index >= 0 ? (POPULAR_SYMBOLS.length - index) : 0;
}

function marketActivity(row = {}) {
  const volume = marketVolume24h(row);
  const openInterest = marketOpenInterest(row);
  const popularity = popularSymbolRank(row.symbol || row.base || row.pair || '');
  const score = volume > 0
    ? 2_000_000_000_000 + volume
    : openInterest > 0
      ? 1_000_000_000_000 + openInterest
      : popularity * 1_000_000;
  return {
    volume,
    openInterest,
    popularity,
    score,
    label: volume > 0
      ? `$${formatCompactNumber(volume)}`
      : openInterest > 0
        ? `OI ${formatCompactNumber(openInterest)}`
        : popularity > 0
          ? 'Popular'
          : '—',
  };
}

function flashMarketSessionLabel(session) {
  const text = String(session || '').trim();
  if (!text) return 'unknown session';
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function flashMarketClosedReason(market = {}) {
  if (!market || typeof market !== 'object') return '';
  if (market.trade_init_allowed === false || market.tradeInitAllowed === false) {
    return 'new positions are disabled';
  }
  const sessionKey = String(market.market_session || market.marketSession || market.session || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (sessionKey && ['closed', 'halted', 'paused', 'suspended'].includes(sessionKey)) {
    return `market session is ${flashMarketSessionLabel(market.market_session || market.marketSession || market.session)}`;
  }
  if ((market.is_market_open === false || market.isMarketOpen === false) && !sessionKey) {
    return `market session is ${flashMarketSessionLabel(market.market_status || market.market_session || market.marketSession || market.session)}`;
  }
  return '';
}

function formatCompactNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  if (n >= 1) return n.toFixed(0);
  return '<1';
}

function formatCompactUsd(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `$${formatCompactNumber(n)}` : '—';
}

function formatAccountHeaderUsd(value, compact = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  }
  if (compact && abs >= 10_000) {
    return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  }
  return `${n < 0 ? '-' : ''}$${abs.toLocaleString(undefined, {
    minimumFractionDigits: abs < 1_000 ? 2 : 0,
    maximumFractionDigits: abs < 1_000 ? 2 : 0,
  })}`;
}

function marketSideOpenInterest(row = {}) {
  const raw = row?._raw || {};
  const long = firstFinite(
    row.buy_open_interest,
    row.buyOpenInterest,
    row.long_open_interest,
    row.longOpenInterest,
    raw.buyOpenInterest,
    raw.buy_open_interest,
    raw.longOpenInterest,
    raw.long_open_interest,
  );
  const short = firstFinite(
    row.sell_open_interest,
    row.sellOpenInterest,
    row.short_open_interest,
    row.shortOpenInterest,
    raw.sellOpenInterest,
    raw.sell_open_interest,
    raw.shortOpenInterest,
    raw.short_open_interest,
  );
  const cap = firstFinite(
    row.max_open_interest,
    row.maxOpenInterest,
    raw.maxOpenInterest,
    raw.max_open_interest,
  );
  const hasSide = (long != null && long > 0) || (short != null && short > 0);
  return {
    long: long || 0,
    short: short || 0,
    cap: cap || 0,
    hasSide,
  };
}

function shortAddr(value) {
  const text = String(value || '');
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text;
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

function floorUsdCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n * 100) / 100;
}

function pacificaQtyFromMargin({ margin, price, leverage, orderType, takerFeeRate }) {
  const m = Number(margin);
  const p = Number(price);
  const lev = Number(leverage);
  if (!Number.isFinite(m) || !Number.isFinite(p) || !Number.isFinite(lev) || m <= 0 || p <= 0 || lev <= 0) {
    return 0;
  }
  // Pacifica validates required collateral against the worst executable
  // notional, not just mark-price notional. Market orders reserve slippage,
  // and the account also needs room for taker fees. Sizing from raw
  // `margin * leverage / mark` makes "100% balance" orders fail with
  // Insufficient balance; solve for qty from the collateral budget instead.
  const slippage = orderType === 'market' ? PACIFICA_MARKET_SLIPPAGE_RATE : 0;
  const feeRate = Math.max(Number(takerFeeRate) || 0, PACIFICA_DEFAULT_TAKER_FEE_RATE) + PACIFICA_FEE_BUFFER_RATE;
  return m / (p * (1 + slippage) * ((1 / lev) + feeRate));
}

function pacificaRequiredMarginForQty({ qty, price, leverage, orderType, takerFeeRate }) {
  const q = Number(qty);
  const p = Number(price);
  const lev = Number(leverage);
  if (!Number.isFinite(q) || !Number.isFinite(p) || !Number.isFinite(lev) || q <= 0 || p <= 0 || lev <= 0) {
    return 0;
  }
  const slippage = orderType === 'market' ? PACIFICA_MARKET_SLIPPAGE_RATE : 0;
  const feeRate = Math.max(Number(takerFeeRate) || 0, PACIFICA_DEFAULT_TAKER_FEE_RATE) + PACIFICA_FEE_BUFFER_RATE;
  return q * p * (1 + slippage) * ((1 / lev) + feeRate);
}

function pacificaMarginReserveDetails({ balance }) {
  const b = Number(balance);
  if (!Number.isFinite(b) || b <= 0) {
    return {
      free_balance: Number.isFinite(b) ? b : null,
      safety_margin: 0,
      max_balance_usage: PACIFICA_MAX_BALANCE_USAGE,
      usable_margin: 0,
    };
  }
  const safetyMargin = Math.max(PACIFICA_MARGIN_SAFETY_USD, b * PACIFICA_MARGIN_SAFETY_RATE);
  return {
    free_balance: b,
    safety_margin: safetyMargin,
    max_balance_usage: PACIFICA_MAX_BALANCE_USAGE,
    usable_margin: Math.max(0, Math.min(b - safetyMargin, b * PACIFICA_MAX_BALANCE_USAGE)),
  };
}

function pacificaUsableMargin({ balance }) {
  return pacificaMarginReserveDetails({ balance }).usable_margin;
}

function phoenixUsableMargin({ balance, leverage, orderType, takerFeeRate }) {
  return phoenixMarginReserveDetails({ balance, leverage, orderType, takerFeeRate }).usable_margin;
}

function phoenixQtyFromMargin({ margin, price, leverage, lotSize }) {
  const m = Number(margin);
  const p = Number(price);
  const lev = Number(leverage);
  if (!Number.isFinite(m) || !Number.isFinite(p) || !Number.isFinite(lev) || m <= 0 || p <= 0 || lev <= 0) {
    return 0;
  }
  return roundDownToLot((m * lev) / p, lotSize || '0.0001');
}

function phoenixLimitRiskFactorBps(tier) {
  const explicitBps = Number(tier?.limitOrderRiskFactorBps);
  if (Number.isFinite(explicitBps) && explicitBps > 0) return explicitBps;
  const raw = Number(tier?.limitOrderRiskFactor);
  if (!Number.isFinite(raw) || raw <= 0) return 10000;
  return raw <= 1000 ? raw * 100 : raw;
}

function phoenixLeverageTiers(market) {
  const raw = market?._phoenix || market || {};
  const source = Array.isArray(raw?.leverageTiers) ? raw.leverageTiers : [];
  const fallbackMax = Number(market?.max_leverage || raw?.maxLeverage || 1);
  const tiers = source
    .map(tier => ({
      upperBoundSize: Number(tier?.maxSizeBaseLots ?? tier?.upperBoundSize ?? 0),
      maxLeverage: Number(tier?.maxLeverage ?? fallbackMax ?? 1),
      limitOrderRiskFactorBps: phoenixLimitRiskFactorBps(tier),
    }))
    .filter(tier => Number.isFinite(tier.upperBoundSize) && tier.upperBoundSize > 0)
    .sort((a, b) => a.upperBoundSize - b.upperBoundSize);
  if (tiers.length) return tiers;
  return [{
    upperBoundSize: Number.MAX_SAFE_INTEGER,
    maxLeverage: Number.isFinite(fallbackMax) && fallbackMax > 0 ? fallbackMax : 1,
    limitOrderRiskFactorBps: 10000,
  }];
}

function phoenixBaseLotsFromQty(qty, market) {
  const q = Number(qty);
  const raw = market?._phoenix || market || {};
  const decimals = Number(
    raw?.units?.baseLotsDecimals
      ?? raw?.baseLotsDecimals
      ?? raw?.baseLotDecimals
      ?? market?._phoenixBaseLotsDecimals
      ?? 4
  );
  const scale = 10 ** Math.min(12, Math.max(0, Number.isFinite(decimals) ? decimals : 4));
  if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(scale) || scale <= 0) return 0;
  return Math.max(0, Math.ceil(q * scale - 1e-9));
}

function phoenixTierForExposure(baseLots, market) {
  const tiers = phoenixLeverageTiers(market);
  const lots = Number(baseLots);
  if (!Number.isFinite(lots) || lots <= 0) return tiers[0];
  return tiers.find(tier => lots <= tier.upperBoundSize) || tiers[tiers.length - 1];
}

function phoenixExistingPositionSignedQty(position) {
  if (!position) return 0;
  const amount = Number(position.amount ?? position.qty ?? position.size ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return position.side === 'ask' || position.side === 'short' ? -amount : amount;
}

function phoenixLimitMarginDetailForQty({ qty, price, side, market, currentPosition, takerFeeRate }) {
  const q = Math.abs(Number(qty));
  const p = Number(price);
  if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) {
    return {
      requiredMargin: 0,
      riskMargin: 0,
      feeMargin: 0,
      marginPrice: Number.isFinite(p) ? p : null,
      risk: null,
    };
  }

  const signedPosition = phoenixExistingPositionSignedQty(currentPosition);
  const isBid = side !== 'ask';
  const newExposureSigned = isBid
    ? q + signedPosition - Math.abs(signedPosition)
    : q - signedPosition - Math.abs(signedPosition);
  const feeRate = Math.max(Number(takerFeeRate) || 0, PHOENIX_DEFAULT_TAKER_FEE_RATE) + PHOENIX_FEE_BUFFER_RATE;
  const feeMargin = q * p * feeRate;

  if (newExposureSigned <= 0) {
    return {
      requiredMargin: feeMargin,
      riskMargin: 0,
      feeMargin,
      marginPrice: p,
      risk: {
        exposure_base_lots: 0,
        max_leverage: null,
        limit_order_risk_factor_bps: null,
        reducing: true,
      },
    };
  }

  const totalExposureQty = Math.abs(isBid ? signedPosition + q : signedPosition - q);
  const existingExposureQty = Math.abs(signedPosition);
  const totalTier = phoenixTierForExposure(phoenixBaseLotsFromQty(totalExposureQty, market), market);
  const existingTier = phoenixTierForExposure(phoenixBaseLotsFromQty(existingExposureQty, market), market);
  const totalLeverage = Math.max(1, Number(totalTier?.maxLeverage) || 1);
  const existingLeverage = Math.max(1, Number(existingTier?.maxLeverage) || totalLeverage);
  const totalMargin = (totalExposureQty * p) / totalLeverage;
  const existingMarginOffset = existingExposureQty > 0 ? (existingExposureQty * p) / existingLeverage : 0;
  const incrementalMargin = Math.max(0, totalMargin - existingMarginOffset);
  const riskBps = phoenixLimitRiskFactorBps(totalTier);
  const riskMargin = incrementalMargin * (riskBps / 10000);
  return {
    requiredMargin: riskMargin + feeMargin,
    riskMargin,
    feeMargin,
    marginPrice: p,
    risk: {
      exposure_base_lots: phoenixBaseLotsFromQty(totalExposureQty, market),
      max_leverage: totalLeverage,
      limit_order_risk_factor_bps: riskBps,
      existing_position_qty: signedPosition,
      total_exposure_qty: totalExposureQty,
      reducing: false,
    },
  };
}

function phoenixRequiredMarginDetailForQty({ qty, price, leverage, orderType, takerFeeRate, side, market, currentPosition }) {
  const q = Number(qty);
  const p = Number(price);
  const lev = Number(leverage);
  if (!Number.isFinite(q) || !Number.isFinite(p) || !Number.isFinite(lev) || q <= 0 || p <= 0 || lev <= 0) {
    return {
      requiredMargin: 0,
      riskMargin: 0,
      feeMargin: 0,
      marginPrice: Number.isFinite(p) ? p : null,
      risk: null,
    };
  }
  if (orderType === 'limit') {
    return phoenixLimitMarginDetailForQty({
      qty: q,
      price: p,
      side,
      market,
      currentPosition,
      takerFeeRate,
    });
  }
  const slippage = orderType === 'market' ? PHOENIX_MARKET_SLIPPAGE_RATE : 0;
  const feeRate = Math.max(Number(takerFeeRate) || 0, PHOENIX_DEFAULT_TAKER_FEE_RATE) + PHOENIX_FEE_BUFFER_RATE;
  const worstNotional = q * p * (1 + slippage);
  const riskMargin = worstNotional / lev;
  const feeMargin = worstNotional * feeRate;
  return {
    requiredMargin: riskMargin + feeMargin,
    riskMargin,
    feeMargin,
    marginPrice: p,
    risk: null,
  };
}

function phoenixMarginReserveDetails({ balance, leverage, orderType, takerFeeRate }) {
  const b = Number(balance);
  const lev = Number(leverage);
  if (!Number.isFinite(b) || !Number.isFinite(lev) || b <= 0 || lev <= 0) {
    return {
      free_balance: Number.isFinite(b) ? b : null,
      leverage: Number.isFinite(lev) ? lev : null,
      slippage_rate: 0,
      fee_rate: 0,
      reserved_per_margin: null,
      usable_margin: 0,
    };
  }
  const slippage = orderType === 'market' ? PHOENIX_MARKET_SLIPPAGE_RATE : 0;
  const feeRate = Math.max(Number(takerFeeRate) || 0, PHOENIX_DEFAULT_TAKER_FEE_RATE) + PHOENIX_FEE_BUFFER_RATE;
  const reservedPerMargin = 1 + slippage + (lev * feeRate * (1 + slippage));
  return {
    free_balance: b,
    leverage: lev,
    slippage_rate: slippage,
    fee_rate: feeRate,
    reserved_per_margin: reservedPerMargin,
    usable_margin: Math.max(0, b / reservedPerMargin),
  };
}

function hotstuffMarginReserveDetails({ balance, leverage, orderType, takerFeeRate }) {
  const b = Number(balance);
  const lev = Number(leverage);
  if (!Number.isFinite(b) || !Number.isFinite(lev) || b <= 0 || lev <= 0) {
    return {
      free_balance: Number.isFinite(b) ? b : null,
      leverage: Number.isFinite(lev) ? lev : null,
      slippage_rate: 0,
      fee_rate: 0,
      reserved_per_margin: null,
      usable_margin: 0,
    };
  }
  const slippage = orderType === 'market' ? HOTSTUFF_MARKET_SLIPPAGE_RATE : 0;
  const feeRate = Math.max(Number(takerFeeRate) || 0, HOTSTUFF_DEFAULT_TAKER_FEE_RATE) + HOTSTUFF_FEE_BUFFER_RATE;
  const reservedPerMargin = (1 + slippage) * (1 + lev * feeRate);
  return {
    free_balance: b,
    leverage: lev,
    slippage_rate: slippage,
    fee_rate: feeRate,
    reserved_per_margin: reservedPerMargin,
    usable_margin: Math.max(0, b / reservedPerMargin),
  };
}

function hotstuffUsableMargin({ balance, leverage, orderType, takerFeeRate }) {
  return hotstuffMarginReserveDetails({ balance, leverage, orderType, takerFeeRate }).usable_margin;
}

function dexErrorLabel(dex, text = '') {
  const key = String(dex || '').trim().toLowerCase();
  if (DEX_ERROR_LABELS[key]) return DEX_ERROR_LABELS[key];
  const lower = String(text || '').toLowerCase();
  for (const [dexKey, label] of Object.entries(DEX_ERROR_LABELS)) {
    if (lower.includes(dexKey) || lower.includes(label.toLowerCase())) return label;
  }
  return 'The exchange';
}

function humanizeTradeError(message, dex = null) {
  const text = String(message || '');
  if (/minimum\s+(deposit\s+is\s+)?10\s+USDC|Min deposit 10 USDC/i.test(text)) {
    return 'Minimum Pacifica deposit is 10 USDC.';
  }
  if (/Insufficient Ostium USDC/i.test(text)) {
    return text;
  }
  if (/HIBACHI_IP_BLOCKED|Hibachi is not available from your IP address|cloudflare|access denied/i.test(text)) {
    return 'Hibachi is not available from your IP address. Use a supported network or IP region, then try again.';
  }
  if (/PERPL_REGION_BLOCKED|Unavailable For Legal Reasons|not available in your country|country or IP region|451/i.test(text)) {
    return 'Perpl is not available in your country or IP region.';
  }
  if (/PERPL_NOT_WHITELISTED|not whitelisted|access not granted|I'm a teapot|418/i.test(text)) {
    return 'This wallet needs a Perpl access code. Enter one and sign in again, or connect a whitelisted wallet.';
  }
  if (/PERPL_ACCESS_CODE_INVALID|access code.*invalid|access code.*exhausted|invalid\/exhausted|423/i.test(text)) {
    return 'That Perpl access code is invalid or already exhausted. Check the code and try again.';
  }
  if (/RISEX_INVITE_REQUIRED|RISEx invite code required|invite code required before|access RISEx|redeeming code/i.test(text)) {
    return 'Enter your RISEx invite code, sign the message, then continue setup.';
  }
  if (/RISEX_BRIDGE_REQUIRED|RISEx .*deposit.*1000|exactly 1000|first-time deposit|faucet/i.test(text)) {
    return 'Use the RISEx bridge deposit flow. The 1000 USDC faucet endpoint is test-token only.';
  }
  // Phoenix returns `{"error":"invalid_invite_code"}` or
  // `{"error":"invalid_referral_code"}` for bad/used/expired codes.
  // Check this before the generic "not registered" branch so a wrong code
  // doesn't get reported as "enter a code" (which is what the user already did).
  if (/invalid_referral_code|referral[_\s-]?code[_\s-]?(invalid|expired|used|exhausted)|invalid referral/i.test(text)) {
    return 'That Phoenix referral code is invalid, already used, or expired. Check the code and try again.';
  }
  if (/invalid_invite_code|invite[_\s-]?code[_\s-]?(invalid|expired|used|exhausted)|invalid invite/i.test(text)) {
    return 'That Phoenix access code is invalid, already used, or expired. Check the code and try again.';
  }
  if (/Too Many Requests|rate[_\s-]?limit|\b429\b/i.test(text)) {
    return `${dexErrorLabel(dex, text)} is rate-limiting requests. Wait a few seconds, then try again.`;
  }
  if (/Trader not found|Phoenix access code required|not whitelisted|invite_required|invite required|needs an invite/i.test(text)) {
    return 'Enter your Phoenix access code, then create the trader account.';
  }
  const insufficient = text.match(/Insufficient balance for\s+\S+:\s*([0-9.]+)\s*<\s*([0-9.]+)/i);
  if (insufficient) {
    const need = Number(insufficient[1]);
    const available = Number(insufficient[2]);
    return `Insufficient Pacifica balance: need $${need.toFixed(2)}, available $${available.toFixed(2)}. Reduce margin a little.`;
  }
  const pacificaAccountValue = text.match(/Insufficient balance for\s+\S+:\s*([0-9.]+).*account value:\s*([0-9.]+)/i);
  if (pacificaAccountValue) {
    const need = Number(pacificaAccountValue[1]);
    const available = Number(pacificaAccountValue[2]);
    return `Insufficient Pacifica balance: need $${need.toFixed(2)}, account value $${available.toFixed(2)}. Use a little less than MAX.`;
  }
  const cannotMargin = text.match(/CannotUpdateMargin/i);
  if (cannotMargin) {
    return 'Close this symbol position and cancel its open orders before changing Cross/Isolated margin.';
  }
  if (/Invalid message/i.test(text)) {
    return PACIFICA_AGENT_REQUIRED_MESSAGE;
  }
  return text;
}

// Format price — no decimals for big numbers, appropriate precision for small
// Keep the result under ~8 chars so the price column doesn't push the
// SymbolPicker table into a horizontal scrollbar. Very small prices
// Sub-tenth-of-a-cent prices (SHIB ≈ $0.0000063, mSATS ≈ $0.0000000153)
// use the DefiLlama / Dexscreener "subscript-zero" notation:
//   $0.0₇153  = "zero point, 7 zeros, then 153"  (= $0.0000000153)
// More readable than scientific (`1.53e-8`) for non-traders, more
// information-dense than plain `0.000000` (which loses precision entirely).
const SUBSCRIPT_DIGITS = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
function subscriptN(n) {
  return String(n).split('').map(d => SUBSCRIPT_DIGITS[Number(d)] || d).join('');
}
const fmtPrice = (p) => {
  if (!Number.isFinite(p) || p <= 0) return '—';
  if (p >= 1000) return p.toLocaleString(undefined, {maximumFractionDigits: 0});
  if (p >= 1) return p.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  if (p >= 0.01) return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  // Subscript notation. exp=-8 for 1.53e-8 → zerosAfterDecimal=7 → "0.0₇153".
  const exp = Math.floor(Math.log10(p));
  const zeros = -exp - 1;
  const sig = Math.round(p * Math.pow(10, zeros + 3));
  return `0.0${subscriptN(zeros)}${String(sig).padStart(3, '0')}`;
};

function formatLimitInputPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return '';
  if (price >= 1000) return String(Math.round(price));
  if (price >= 1) return String(Number(price.toFixed(4)));
  if (price >= 0.01) return String(Number(price.toFixed(6)));
  return String(Number(price.toFixed(10)));
}

function fmtAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  const nearInt = Math.round(n);
  if (Math.abs(n - nearInt) < 1e-9) return nearInt.toLocaleString();
  const digits = Math.abs(n) >= 1 ? 6 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function numOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function displayLeverage(value) {
  const n = numOrNull(value);
  if (n == null || n <= 0) return null;
  if (n > 10000) {
    const scaled = n / 1e18;
    if (Number.isFinite(scaled) && scaled > 0 && scaled <= 500) {
      return Math.round(scaled * 10) / 10;
    }
  }
  return Math.round(n * 10) / 10;
}

function cleanSignedZero(value) {
  const n = Number(value || 0);
  return Math.abs(n) < 0.005 ? 0 : n;
}

function signedMetricDirection(pnlVal, pnlPct) {
  const usd = Number(pnlVal || 0);
  if (Math.abs(usd) >= 0.005) return usd < 0 ? -1 : 1;
  const pct = Number(pnlPct || 0);
  if (Math.abs(pct) >= 0.005) return pct < 0 ? -1 : 1;
  return 1;
}

function formatSignedPnlUsd(value, { forceSign = true } = {}) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : (forceSign ? '+' : '');
  const decimals = abs > 0 && abs < 0.01 ? 6 : (abs < 1 ? 4 : 2);
  return `${sign}$${abs.toFixed(decimals)}`;
}

function formatFeeRate(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(3)}%`;
}

function formatPositionLeverageBadge(value) {
  const n = numOrNull(value);
  return n && n > 0 ? `${n}x` : '-';
}

function isFlashPositionLike(pos) {
  const source = String(pos?.source || '').toLowerCase();
  return source.includes('flash') || !!pos?._flash || !!pos?.metric?.sizeUsdUi || !!pos?.metric?.collateralUsdUi;
}

function flashPositionDisplayLeverageStable(pos, posValueUsd, margin) {
  const sizeUsd = numOrNull(
    pos?.metric?.sizeUsdUi
      ?? pos?.metric?.size_usd_ui
      ?? pos?.sizeUsdUi
      ?? pos?.size_usd
      ?? pos?.sizeUsd
      ?? pos?.notional_usd
      ?? pos?.notionalUsd
      ?? pos?.inputUsdUi
      ?? pos?._flash?.sizeUsdUi
      ?? pos?._flash?.size_usd_ui
      ?? pos?._flash?.size_usd
      ?? pos?._flash?.sizeUsd
      ?? pos?._flash?.notional_usd
      ?? pos?._flash?.notionalUsd
  ) ?? posValueUsd;
  const collateralUsd = numOrNull(
    pos?.metric?.collateralUsdUi
      ?? pos?.metric?.collateral_usd_ui
      ?? pos?.collateralUsdUi
      ?? pos?.collateral_usd
      ?? pos?.collateralUsd
      ?? pos?.margin
      ?? pos?._flash?.collateralUsdUi
      ?? pos?._flash?.collateral_usd_ui
      ?? pos?._flash?.collateral_usd
      ?? pos?._flash?.collateralUsd
      ?? pos?._flash?.margin
  ) ?? margin;
  if (collateralUsd > 0 && sizeUsd > 0) {
    return Math.round((sizeUsd / collateralUsd) * 10) / 10;
  }
  const rawLev = displayLeverage(pos?.leverage);
  return rawLev && rawLev > 0 ? rawLev : null;
}

function getPositionMetrics(pos, prices, leverageSettings = {}) {
  const priceRow = prices.find(p => p.symbol === pos.symbol);
  const priceRowMark = numOrNull(priceRow?.mark ?? priceRow?.mark_price ?? priceRow?.price);
  const isDust = !!pos?._flashDust;
  const isFlashPosition = isFlashPositionLike(pos);
  const entryP = numOrNull(pos.entry_price) || 0;
  const markP = numOrNull(pos.mark_price) || priceRowMark || 0;
  const amt = firstPositive(
    Math.abs(Number(pos.amount) || 0),
    Math.abs(Number(pos.base_amount) || 0),
    Math.abs(Number(pos.baseAmount) || 0),
    Math.abs(Number(pos.position) || 0),
  );
  const margin = numOrNull(pos.margin) || 0;
  const providedValue = firstPositive(
    pos.size_usd,
    pos.sizeUsd,
    pos.notional_usd,
    pos.notionalUsd,
    pos.position_usd,
    pos.positionUsd,
    pos.inputUsdUi,
    pos._flash?.sizeUsdUi,
    pos._flash?.size_usd_ui,
    pos._flash?.size_usd,
    pos._flash?.sizeUsd,
    pos._flash?.notional_usd,
    pos._flash?.notionalUsd,
  );
  const posValueUsd = providedValue && providedValue > 0
    ? providedValue
    : (markP ? amt * markP : amt * entryP);
  const dustUsd = numOrNull(pos._flashDustUsd ?? pos.inputUsdUi ?? pos.sizeUsdUi ?? pos.size_usd) || posValueUsd || 0;
  const providedPnl = numOrNull(
    pos.pnl_usd
      ?? pos.pnlWithoutFeeUsdUi
      ?? pos.pnlWithFeeUsdUi
      ?? pos.unrealized_pnl
      ?? pos.unrealizedPnL
      ?? pos.pnl
  );
  const isHibachiPosition = String(pos?.source || '').toLowerCase() === 'hibachi'
    || String(pos?.pnl_source || '').toLowerCase() === 'hibachi_api';
  const isOstiumPosition = String(pos?.dex || '').toLowerCase() === 'ostium'
    || String(pos?.source || '').toLowerCase() === 'ostium'
    || String(pos?.pnl_source || '').toLowerCase() === 'ostium_api';
  const derivedPnl = markP ? (markP - entryP) * amt * (pos.side === 'bid' ? 1 : -1) : 0;
  const rawPnlVal = (isHibachiPosition || isOstiumPosition) ? (providedPnl ?? 0) : (providedPnl ?? derivedPnl);
  const pnlVal = isDust ? 0 : cleanSignedZero(rawPnlVal);
  const rawLev = displayLeverage(pos.leverage);
  const collateralLev = margin > 0 && posValueUsd > 0 ? Math.round((posValueUsd / margin) * 10) / 10 : null;
  const flashLev = isFlashPosition ? flashPositionDisplayLeverageStable(pos, posValueUsd, margin) : null;
  const setLev = isDust ? null : (isFlashPosition
    ? (flashLev ?? rawLev ?? collateralLev)
    : (rawLev && rawLev > 0 ? rawLev : (collateralLev || (leverageSettings[pos.symbol] || 1))));
  const rawProvidedPct = numOrNull(pos.pnl_pct ?? (pos.return_on_equity != null ? Number(pos.return_on_equity) * 100 : null));
  const preserveProvidedPct = isHibachiPosition || isOstiumPosition;
  const pricePct = entryP && markP
    ? ((markP - entryP) / entryP * 100 * (pos.side === 'bid' ? 1 : -1) * (typeof setLev === 'number' ? setLev : 1))
    : null;
  const providedPct = !preserveProvidedPct && rawProvidedPct === 0 && pricePct != null && Math.abs(pricePct) >= 0.005 ? null : rawProvidedPct;
  const entryNotional = numOrNull(pos.entry_notional);
  const hibachiInitialMargin = isHibachiPosition && entryNotional && entryNotional > 0 && setLev && setLev > 0
    ? entryNotional / setLev
    : null;
  const pctMargin = hibachiInitialMargin && hibachiInitialMargin > 0 ? hibachiInitialMargin : margin;
  const marginPct = pctMargin > 0 ? (pnlVal / pctMargin) * 100 : null;
  const pnlPct = isDust ? 0 : (preserveProvidedPct
    ? (rawProvidedPct ?? 0)
    : (providedPct ?? (pricePct ?? (marginPct ?? 0))));
  const pnlDirection = isDust ? 1 : signedMetricDirection(pnlVal, pnlPct);
  const pnlColor = pnlDirection >= 0 ? '#4CAF50' : '#E53935';
  return { entryP, markP, amt, margin, pnlVal, setLev, posValueUsd, pnlPct, pnlDirection, pnlColor, isDust, dustUsd };
}

function formatCloseAmountLabel(pos, closePct, posValueUsd, isDust, dustUsd) {
  if (isDust) return `$${Number(dustUsd || 0).toFixed(2)}`;
  const amount = (numOrNull(pos?.amount) || 0) * (Number(closePct) || 0) / 100;
  const usd = (numOrNull(posValueUsd) || 0) * (Number(closePct) || 0) / 100;
  return `${amount.toFixed(6)} ${pos?.symbol || ''} ($${usd.toFixed(2)})`;
}

function formatPositionAmount(amount) {
  const value = numOrNull(amount);
  if (value == null) return amount ?? '';
  return value.toFixed(6).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
}

function tpslKindFromText(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('stoplossdecrease')) return 'sl';
  if (raw.includes('limitdecrease')) return 'tp';
  if (raw === 'tp' || raw === 'take_profit' || raw === 'take-profit' || raw.includes('take')) return 'tp';
  if (raw === 'sl' || raw === 'stop_loss' || raw === 'stop-loss' || raw.includes('stop')) return 'sl';
  if (/(^|[^a-z0-9])tp([^a-z0-9]|$)/u.test(raw)) return 'tp';
  if (/(^|[^a-z0-9])sl([^a-z0-9]|$)/u.test(raw)) return 'sl';
  return '';
}

function orderTpslKind(order) {
  const raw = order?._raw || {};
  const values = [
    order?._attachedTpslKind,
    order?._phoenixTpslKind,
    order?.tpsl,
    order?.tp_sl,
    order?.tpSl,
    order?.trigger_type,
    order?.triggerType,
    order?.conditionalKind,
    order?.conditional_kind,
    order?.kind_name,
    order?.order_type,
    order?.orderType,
    order?.type,
    order?.kind,
    order?.ot,
    order?.client_order_id,
    order?.clientOrderId,
    order?.cloid,
    raw.tpsl,
    raw.tp_sl,
    raw.tpSl,
    raw.trigger_type,
    raw.triggerType,
    raw.conditionalKind,
    raw.conditional_kind,
    raw.kind_name,
    raw.order_type,
    raw.orderType,
    raw.type,
    raw.kind,
    raw.ot,
    raw.client_order_id,
    raw.clientOrderId,
    raw.cloid,
  ];
  for (const value of values) {
    const kind = tpslKindFromText(value);
    if (kind) return kind;
  }
  return '';
}

function truthyOrderFlag(value) {
  if (value == null) return false;
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (!raw || raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
    return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
  }
  return true;
}

function orderReduceOnlyLike(order) {
  const rawType = String(
    order?.type
      || order?.kind
      || order?.order_type
      || order?.ot
      || order?._raw?.kind_name
      || order?._raw?.type
      || '',
  ).toLowerCase();
  return truthyOrderFlag(order?.reduce_only)
    || truthyOrderFlag(order?.reduceOnly)
    || truthyOrderFlag(order?.is_reduce_only)
    || truthyOrderFlag(order?.isReduceOnly)
    || truthyOrderFlag(order?._raw?.reduce_only)
    || truthyOrderFlag(order?._raw?.reduceOnly)
    || truthyOrderFlag(order?._raw?.is_reduce_only)
    || truthyOrderFlag(order?._raw?.isReduceOnly)
    || truthyOrderFlag(order?._raw?.ro)
    || !!orderTpslKind(order)
    || rawType.includes('decrease');
}

function orderTriggerPrice(order) {
  return numOrNull(
    order?.stop_price
      ?? order?.sp
      ?? order?.trigger_price
      ?? order?.triggerPrice
      ?? order?.triggerPriceUi
      ?? order?.trigger_price_ui
      ?? order?.trigger_px
      ?? order?.triggerPx
      ?? order?.stopPrice
      ?? order?.trigger?.price
      ?? order?.trigger?.trigger_price
      ?? order?.trigger?.triggerPrice
      ?? order?.conditional?.trigger_price
      ?? order?.conditional?.triggerPrice
      ?? order?._raw?.stop_price
      ?? order?._raw?.stopPrice
      ?? order?._raw?.triggerPriceUi
      ?? order?._raw?.trigger_price_ui
      ?? order?._raw?.trigger_price
      ?? order?._raw?.triggerPrice
      ?? order?._raw?.trigger_px
      ?? order?._raw?.triggerPx
      ?? order?._raw?.trigger?.price
      ?? order?._raw?.trigger?.trigger_price
      ?? order?._raw?.trigger?.triggerPrice
      ?? order?._raw?.conditional?.trigger_price
      ?? order?._raw?.conditional?.triggerPrice
      ?? order?.price
      ?? order?.ip
  );
}

function orderDisplayType(order, positions = []) {
  const kind = orderTpslKind(order);
  if (kind === 'tp') return 'TAKE PROFIT';
  if (kind === 'sl') return 'STOP LOSS';
  const stopPrice = orderTriggerPrice(order);
  if (stopPrice > 0 && Array.isArray(positions)) {
    const pos = positions.find(p => orderMatchesPosition(order, p));
    const inferred = pos ? inferTpslKindFromPosition(order, pos, stopPrice) : '';
    if (inferred === 'tp') return 'TAKE PROFIT';
    if (inferred === 'sl') return 'STOP LOSS';
  }
  const rawType = order?.order_type ?? order?.orderType ?? order?.ot ?? order?.type;
  // Several SDKs expose enum ordinals (Phoenix currently returns `1`) rather
  // than a human label. Open orders with no trigger are limit orders; never
  // leak the protocol enum into the player-facing badge.
  const normalizedType = rawType == null || /^\d+$/u.test(String(rawType).trim())
    ? (stopPrice > 0 ? 'trigger' : 'limit')
    : String(rawType);
  return normalizedType.toUpperCase().replace(/_/g, ' ');
}

function orderDisplayPrice(order) {
  const trigger = orderTriggerPrice(order);
  if (trigger > 0) return saneOrderDisplayPrice(trigger);
  return saneOrderDisplayPrice(numOrNull(order?.price ?? order?.ip ?? order?._raw?.limit_price ?? order?._raw?.limitPrice) || 0);
}

function saneOrderDisplayPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return 0;
  // GMTrade can encode max/sentinel trigger prices for inactive legs. Never
  // show those as real dollar prices in the orders UI.
  if (price > 1_000_000_000) return 0;
  return price;
}

function formatOrderPrice(price) {
  const safe = saneOrderDisplayPrice(price);
  return safe > 0 ? `$${fmtPrice(safe)}` : 'Market';
}

function orderPriceDetailLabel(order, type = '') {
  const rawType = String(type || order?.order_type || order?.type || order?.ot || '').toLowerCase();
  const hasExplicitTrigger = [
    order?.trigger_price,
    order?.triggerPrice,
    order?.triggerPriceUi,
    order?.trigger_price_ui,
    order?.stop_price,
    order?.sp,
    order?._raw?.triggerPrice,
    order?._raw?.trigger_price,
    order?._raw?.triggerPriceUi,
    order?._raw?.trigger_price_ui,
  ].some((value) => {
    if (value == null) return false;
    const text = String(value).trim();
    if (!text || text === '0' || /^(none|null|undefined|no[_ -]?trigger)$/i.test(text)) return false;
    const n = Number(text);
    return !Number.isFinite(n) || n > 0;
  });
  if (hasExplicitTrigger || rawType.includes('trigger') || rawType.includes('stop')) return 'Trigger';
  if (rawType.includes('limit')) return 'Limit';
  return 'Price';
}

function orderDisplayLeverage(order, fallbackLeverage = null) {
  const direct = displayLeverage(order?.leverage);
  if (direct) return direct;
  const raw = numOrNull(order?._raw?.leverage ?? order?._raw?.trade?.leverage);
  if (raw != null && raw > 10_000) {
    const scaled = raw / 1e10;
    return Number.isFinite(scaled) && scaled > 0 ? Math.round(scaled * 10) / 10 : null;
  }
  const rawDisplay = displayLeverage(raw);
  if (rawDisplay) return rawDisplay;
  if (order?.dex === 'decibel' || order?._raw?.dex === 'decibel') return null;
  return displayLeverage(fallbackLeverage);
}

function isOrderPendingConfirmation(order) {
  return !!(order?._optimistic || order?._raw?.optimistic);
}

function OrderPendingBadge() {
  return (
    <span style={S.orderPendingBadge} title="Waiting for exchange confirmation">
      <span style={S.orderPendingSpinner} />
      Confirming
    </span>
  );
}

const PENDING_ACTION_TTL_MS = 120_000;

function pendingPhaseLabel(phase, fallback = 'Syncing...') {
  if (phase === 'preparing') return 'Preparing...';
  if (phase === 'signing') return 'Signing...';
  if (phase === 'confirming') return 'Confirming...';
  if (phase === 'indexing') return 'Syncing...';
  return fallback;
}

function pendingActionForPosition(actions, pos, kind) {
  const key = positionStableKey(pos);
  return (actions || []).find(action => action.kind === kind && action.positionKey === key) || null;
}

function pendingCloseConfirmed(action, positions) {
  const rows = Array.isArray(positions) ? positions : [];
  const originalKey = action?.positionKey || '';
  const current = rows.find(pos => positionStableKey(pos) === originalKey)
    || rows.find(pos => {
      const symbol = String(pos?.symbol || pos?.s || '').toUpperCase();
      const side = positionOpenSide(pos);
      return symbol === action?.symbol && side === action?.side;
    });
  if (!current) return true;
  const beforeAmount = Math.abs(Number(action?.startAmount || 0));
  const currentAmount = Math.abs(Number(current?.amount ?? current?.size ?? current?.position ?? 0));
  if (action?.fullClose) return false;
  return beforeAmount > 0 && currentAmount < beforeAmount - 1e-9;
}

function formatOrderUsd(value) {
  const n = numOrNull(value);
  return n != null && n > 0 ? `$${fmtAmount(n)}` : null;
}

function orderMatchesPosition(order, pos) {
  const orderPosition = String(order?.position || order?.position_id || order?.positionId || order?._raw?.position || '').trim();
  const posId = String(pos?.position_id || pos?.positionId || pos?.id || pos?._raw?.position || pos?._raw?.key || '').trim();
  if (orderPosition && posId && orderPosition === posId) return true;
  const orderSymbol = String(order?.symbol || order?.s || '').toUpperCase();
  const posSymbol = String(pos?.symbol || pos?.s || '').toUpperCase();
  if (orderSymbol && posSymbol && orderSymbol === posSymbol) {
    const orderSide = orderPositionSide(order);
    const posSide = orderPositionSide(pos);
    if (!orderSide || !posSide || orderSide === posSide) return true;
    return orderReduceOnlyLike(order) && orderSide === positionCloseSide(pos);
  }
  const orderPair = order?.pair_index ?? order?.pairIndex ?? order?._raw?.instrument_id;
  const posPair = pos?.pair_index ?? pos?.pairIndex ?? pos?._raw?.instrument_id;
  return orderPair != null && posPair != null && Number(orderPair) === Number(posPair);
}

function orderCardMetrics(order, positions, price, leverage) {
  const matchingPosition = (Array.isArray(positions) ? positions : [])
    .find(position => orderMatchesPosition(order, position)) || null;
  return resolveOrderDisplayMetrics({ order, position: matchingPosition, price, leverage });
}

function formatOrderBaseAmount(metrics, symbol) {
  if (metrics?.baseAmount != null) {
    return `${fmtAmount(metrics.baseAmount)}${symbol ? ` ${symbol}` : ''}`;
  }
  return metrics?.fullPosition ? 'Full position' : '—';
}

function inferTpslKindFromPosition(order, pos, triggerPrice) {
  const explicit = orderTpslKind(order);
  if (explicit) return explicit;
  const isReduceOnly = orderReduceOnlyLike(order);
  if (!isReduceOnly || !(triggerPrice > 0)) return '';
  const reference = numOrNull(pos?.mark_price ?? pos?.entry_price ?? pos?.open_price ?? pos?.price);
  if (!(reference > 0)) return '';
  const isLong = orderPositionSide(pos) !== 'ask' && String(pos?.side || '').toLowerCase() !== 'ask';
  if (isLong) return triggerPrice > reference ? 'tp' : 'sl';
  return triggerPrice < reference ? 'tp' : 'sl';
}

function getPositionTpsl(pos, orders = []) {
  const tp = numOrNull(
    pos?.take_profit_price
      ?? pos?.takeProfitPrice
      ?? pos?._phoenixOptimisticTakeProfitPrice
      ?? pos?.take_profit
      ?? pos?.takeProfit
      ?? pos?.tp
      ?? pos?.tp_trigger_price
      ?? pos?.tpTriggerPrice
      ?? pos?.tp_limit_price
      ?? pos?.tpLimitPrice
  );
  const sl = numOrNull(
    pos?.stop_loss_price
      ?? pos?.stopLossPrice
      ?? pos?._phoenixOptimisticStopLossPrice
      ?? pos?.stop_loss
      ?? pos?.stopLoss
      ?? pos?.sl
      ?? pos?.sl_trigger_price
      ?? pos?.slTriggerPrice
      ?? pos?.sl_limit_price
      ?? pos?.slLimitPrice
  );
  let orderTp = 0;
  let orderSl = 0;
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!orderMatchesPosition(order, pos)) continue;
    const price = orderTriggerPrice(order);
    if (!(price > 0)) continue;
    const kind = inferTpslKindFromPosition(order, pos, price);
    if (!kind) continue;
    if (kind === 'tp') orderTp = price;
    if (kind === 'sl') orderSl = price;
  }
  return {
    tp: tp && tp > 0 ? tp : orderTp,
    sl: sl && sl > 0 ? sl : orderSl,
  };
}

function formatTpslInputValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 1 ? String(Number(n.toFixed(2))) : String(Number(n.toFixed(8)));
}

function normalizeTpslInputValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

function ostiumTpInputMax(dex, pos) {
  if (dex !== 'ostium') return undefined;
  const maxPrice = ostiumMaxTakeProfitPrice(pos);
  if (!Number.isFinite(maxPrice) || maxPrice <= 0) return undefined;
  return String(Number(maxPrice.toFixed(maxPrice >= 1 ? 2 : 8)));
}

function tpslReferencePrice(pos) {
  return firstFinite(
    pos?.mark_price,
    pos?.markPrice,
    pos?.current_price,
    pos?.currentPrice,
    pos?.price,
    pos?.entry_price,
  );
}

function validateTpslBeforeSubmit({ dex, pos, tpPrice, slPrice, setLocalAlert }) {
  if (dex === 'ostium') {
    const tpDirectionCheck = validateOstiumTakeProfitDirection(pos, tpPrice);
    if (!tpDirectionCheck.ok) {
      setLocalAlert(tpDirectionCheck.error);
      return false;
    }
    const tpLimitCheck = validateOstiumTakeProfitLimit(pos, tpPrice);
    if (!tpLimitCheck.ok) {
      setLocalAlert(tpLimitCheck.error);
      return false;
    }
    const slDirectionCheck = validateOstiumStopLossDirection(pos, slPrice);
    if (!slDirectionCheck.ok) {
      setLocalAlert(slDirectionCheck.error);
      return false;
    }
    return true;
  }

  const reference = tpslReferencePrice(pos);
  const tp = Number(tpPrice);
  const sl = Number(slPrice);
  const isLong = String(pos?.side || '').toLowerCase() !== 'ask';
  const sideLabel = isLong ? 'LONG' : 'SHORT';
  if (Number.isFinite(reference) && reference > 0) {
    if (Number.isFinite(tp) && tp > 0) {
      const badTp = isLong ? tp <= reference : tp >= reference;
      if (badTp) {
        setLocalAlert(`TP for ${sideLabel} must be ${isLong ? 'above' : 'below'} current price ($${fmtPrice(reference)}).`);
        return false;
      }
    }
    if (Number.isFinite(sl) && sl > 0) {
      const badSl = isLong ? sl >= reference : sl <= reference;
      if (badSl) {
        setLocalAlert(`SL for ${sideLabel} must be ${isLong ? 'below' : 'above'} current price ($${fmtPrice(reference)}).`);
        return false;
      }
    }
  }
  return true;
}

const TPSL_INPUT_MODES = [
  { id: 'price', label: 'Price' },
  { id: 'pct', label: '% PnL' },
  { id: 'usd', label: '$ PnL' },
];

function tpslModeLabel(mode) {
  const found = TPSL_INPUT_MODES.find(m => m.id === mode);
  return found ? found.label : 'Price';
}

function firstPositive(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function tpslCollateralUsd(pos, metrics = {}) {
  const entry = firstPositive(metrics.entryP, pos?.entry_price, metrics.markP, pos?.mark_price);
  const lev = firstPositive(metrics.setLev, pos?.leverage, pos?.lev);
  const baseAmount = tpslPositionAmount(pos, metrics);
  return firstPositive(
    metrics.margin,
    pos?.metric?.collateralUsdUi,
    pos?.metric?.collateral_usd_ui,
    pos?.collateralUsdUi,
    pos?.collateral_usd_ui,
    pos?.collateral_usd,
    pos?.collateralUsd,
    pos?.margin_usd,
    pos?.marginUsd,
    pos?.initial_margin,
    pos?.initialMargin,
    pos?.margin,
    metrics.posValueUsd && metrics.setLev ? Number(metrics.posValueUsd) / Number(metrics.setLev) : null,
    entry && baseAmount && lev ? (entry * baseAmount) / lev : null,
  );
}

function tpslPositionAmount(pos, metrics = {}) {
  const direct = firstPositive(
    Math.abs(Number(metrics.amt) || 0),
    Math.abs(Number(pos?.amount) || 0),
    Math.abs(Number(pos?.base_amount) || 0),
    Math.abs(Number(pos?.baseAmount) || 0),
    Math.abs(Number(pos?.position) || 0),
    Math.abs(Number(pos?.qty) || 0),
    Math.abs(Number(pos?.quantity) || 0),
    Math.abs(Number(pos?.tokenAmount) || 0),
    Math.abs(Number(pos?.token_amount) || 0),
    Math.abs(Number(pos?._flash?.amount) || 0),
    Math.abs(Number(pos?._flash?.tokenAmount) || 0),
    Math.abs(Number(pos?._flash?.token_amount) || 0),
  );
  if (direct > 0) return direct;
  const entry = firstPositive(metrics.entryP, pos?.entry_price, metrics.markP, pos?.mark_price);
  const sizeUsd = firstPositive(
    metrics.posValueUsd,
    pos?.size_usd,
    pos?.sizeUsd,
    pos?.sizeUsdUi,
    pos?.notionalUsd,
    pos?.notional_usd,
    pos?.positionUsd,
    pos?.position_usd,
    pos?.inputUsdUi,
    pos?.input_usd_ui,
    pos?._flash?.sizeUsdUi,
    pos?._flash?.size_usd_ui,
    pos?._flash?.size_usd,
    pos?._flash?.sizeUsd,
    pos?._flash?.notional_usd,
    pos?._flash?.notionalUsd,
  );
  if (entry > 0 && sizeUsd > 0) return Math.abs(sizeUsd / entry);
  return 0;
}

function tpslPriceFromInput({ pos, metrics = {}, leg, mode, value }) {
  const raw = String(value ?? '').trim();
  if (!raw) return { price: null, error: '' };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return { price: null, error: 'Enter a positive TP/SL value.' };
  const selectedMode = ['price', 'pct', 'usd'].includes(mode) ? mode : 'price';
  if (selectedMode === 'price') return { price: amount, error: '' };

  const entry = firstPositive(metrics.entryP, pos?.entry_price, metrics.markP, pos?.mark_price);
  const baseAmount = tpslPositionAmount(pos, metrics);
  if (!(entry > 0) || !(baseAmount > 0)) {
    return { price: null, error: 'Position entry price or size is missing. Use Price mode for this position.' };
  }

  const signedPnlUsd = (() => {
    const signed = leg === 'sl' ? -Math.abs(amount) : Math.abs(amount);
    if (selectedMode === 'usd') return signed;
    const collateral = tpslCollateralUsd(pos, metrics);
    if (!(collateral > 0)) return null;
    return collateral * signed / 100;
  })();
  if (!Number.isFinite(signedPnlUsd)) {
    return { price: null, error: 'Position margin is missing. Use Price or $ PnL mode for this position.' };
  }

  const isLong = positionOpenSide(pos) !== 'ask';
  const priceDelta = signedPnlUsd / baseAmount;
  const price = isLong ? entry + priceDelta : entry - priceDelta;
  if (!Number.isFinite(price) || price <= 0) {
    return { price: null, error: 'TP/SL value resolves to an invalid trigger price.' };
  }
  return { price, error: '' };
}

function tpslSubmitValue({ pos, metrics, leg, mode, value, initialValue }) {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: null, changed: false, error: '' };
  const resolved = tpslPriceFromInput({ pos, metrics, leg, mode, value });
  if (resolved.error) return { value: null, changed: true, error: resolved.error };
  const next = formatTpslInputValue(resolved.price);
  const changed = normalizeTpslInputValue(next) !== normalizeTpslInputValue(initialValue);
  return { value: changed ? next : null, changed, error: '', price: resolved.price };
}

function tpslInputPlaceholder(leg, mode) {
  if (mode === 'pct') return leg === 'tp' ? 'TP profit %' : 'SL loss %';
  if (mode === 'usd') return leg === 'tp' ? 'TP profit $' : 'SL loss $';
  return leg === 'tp' ? 'TP Price' : 'SL Price';
}

function TpslValueInput({ leg, mode, value, onChange, pos, metrics, maxPrice }) {
  const resolved = tpslPriceFromInput({ pos, metrics, leg, mode, value });
  const hasValue = String(value ?? '').trim() !== '';
  const preview = hasValue && !resolved.error && resolved.price > 0
    ? `Trigger $${fmtPrice(resolved.price)}`
    : (hasValue && resolved.error ? resolved.error : (leg === 'tp' ? 'Take profit' : 'Stop loss'));
  return (
    <div style={S.tpslField}>
      <input
        type="number"
        min="0"
        step={mode === 'price' ? 'any' : '0.1'}
        placeholder={tpslInputPlaceholder(leg, mode)}
        value={value}
        max={mode === 'price' ? maxPrice : undefined}
        onChange={e => onChange(e.target.value)}
        style={S.tpslInput}
      />
      <div style={{
        ...S.tpslPreview,
        color: hasValue && resolved.error ? '#B71C1C' : (leg === 'tp' ? '#2e7d32' : '#8a4b20'),
      }}>
        {preview}
      </div>
    </div>
  );
}

function TpslEditor({
  mode,
  onModeChange,
  tpValue,
  slValue,
  onTpChange,
  onSlChange,
  pos,
  metrics,
  ostiumTpMax,
  busy,
  busyLabel,
  loading,
  hasChanges,
  onSubmit,
}) {
  const entry = firstPositive(metrics?.entryP, pos?.entry_price, metrics?.markP, pos?.mark_price);
  const mark = firstPositive(metrics?.markP, pos?.mark_price, pos?.price, entry);
  const isLong = positionOpenSide(pos) !== 'ask';
  return (
    <div style={S.tpslEditor}>
      <div style={S.tpslMetaRow}>
        <span>Entry {entry > 0 ? `$${fmtPrice(entry)}` : '-'}</span>
        <span>Mark {mark > 0 ? `$${fmtPrice(mark)}` : '-'}</span>
        <span>{isLong ? 'LONG' : 'SHORT'}</span>
      </div>
      <div style={S.tpslModeRow}>
        <span style={S.tpslModeLabel}>Input</span>
        <div style={S.tpslModeGroup}>
          {TPSL_INPUT_MODES.map(item => (
            <button
              key={item.id}
              type="button"
              style={mode === item.id ? S.tpslModeActive : S.tpslModeButton}
              onClick={() => onModeChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div style={S.tpslInputGrid}>
        <TpslValueInput leg="tp" mode={mode} value={tpValue} onChange={onTpChange} pos={pos} metrics={metrics} maxPrice={ostiumTpMax} />
        <TpslValueInput leg="sl" mode={mode} value={slValue} onChange={onSlChange} pos={pos} metrics={metrics} />
        <button style={S.btnBlue} onClick={onSubmit} disabled={busy || loading || !hasChanges}>
          {busy ? <ClosingButtonLabel text={busyLabel || 'Setting...'} /> : 'Set'}
        </button>
      </div>
      <div style={S.tpslHint}>
        {mode === 'price'
          ? 'Enter trigger price.'
          : `${tpslModeLabel(mode)} uses position PnL: TP = profit, SL = loss.`}
      </div>
    </div>
  );
}

function OpenTpslEditor({
  enabled,
  onEnabledChange,
  mode,
  onModeChange,
  previewSide,
  onPreviewSideChange,
  tpValue,
  slValue,
  onTpChange,
  onSlChange,
  pos,
  metrics,
  dex,
  orderType,
}) {
  const entry = firstPositive(metrics?.entryP, pos?.entry_price, metrics?.markP, pos?.mark_price);
  const isNativeLimitAttach = OPEN_TPSL_NATIVE_LIMIT_ATTACH_DEXES.has(String(dex || '').toLowerCase());
  const showLimitNotice = enabled && orderType === 'limit' && !isNativeLimitAttach;
  return (
    <div style={enabled ? S.openTpslBoxActive : S.openTpslBox}>
      <button type="button" style={S.openTpslHeader} onClick={() => onEnabledChange(!enabled)}>
        <span style={S.openTpslTitle}>TP/SL</span>
        <span style={enabled ? S.openTpslToggleOn : S.openTpslToggleOff}>{enabled ? 'ON' : 'OFF'}</span>
      </button>
      {enabled && (
        <div style={S.openTpslBody}>
          <div style={S.tpslMetaRow}>
            <span>Entry {entry > 0 ? `$${fmtPrice(entry)}` : '-'}</span>
            <span>{orderType === 'limit' ? 'Limit order' : 'Market order'}</span>
          </div>
          <div style={S.tpslModeRow}>
            <span style={S.tpslModeLabel}>Side</span>
            <div style={S.tpslModeGroup}>
              <button type="button" style={previewSide === 'bid' ? S.tpslModeActive : S.tpslModeButton} onClick={() => onPreviewSideChange('bid')}>LONG</button>
              <button type="button" style={previewSide === 'ask' ? S.tpslModeActive : S.tpslModeButton} onClick={() => onPreviewSideChange('ask')}>SHORT</button>
            </div>
          </div>
          <div style={S.tpslModeRow}>
            <span style={S.tpslModeLabel}>Input</span>
            <div style={S.tpslModeGroup}>
              {TPSL_INPUT_MODES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  style={mode === item.id ? S.tpslModeActive : S.tpslModeButton}
                  onClick={() => onModeChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div style={S.openTpslInputGrid}>
            <TpslValueInput leg="tp" mode={mode} value={tpValue} onChange={onTpChange} pos={pos} metrics={metrics} />
            <TpslValueInput leg="sl" mode={mode} value={slValue} onChange={onSlChange} pos={pos} metrics={metrics} />
          </div>
          <div style={showLimitNotice ? S.openTpslNoticeWarn : S.openTpslNotice}>
            {showLimitNotice
              ? `${dexErrorLabel(dex)} limit TP/SL can be placed after the limit fills.`
              : mode === 'price'
                ? 'Optional triggers sent with the order when the exchange supports it.'
                : `${tpslModeLabel(mode)} is converted from margin PnL into trigger price before signing.`}
          </div>
        </div>
      )}
    </div>
  );
}

function PositionTpslRow({ pos, orders }) {
  const { tp, sl } = getPositionTpsl(pos, orders);
  if (!tp && !sl) return null;
  return (
    <div style={S.row}>
      <span style={{ ...S.detail, color: tp ? '#4CAF50' : '#a3906a' }}>
        TP: {tp ? `$${fmtPrice(tp)}` : '-'}
      </span>
      <span style={{ ...S.detail, color: sl ? '#E53935' : '#a3906a' }}>
        SL: {sl ? `$${fmtPrice(sl)}` : '-'}
      </span>
    </div>
  );
}

function timeMs(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n > 1e17) return Math.floor(n / 1e6);
    if (n > 1e14) return Math.floor(n / 1000);
    if (n > 1e12) return Math.floor(n);
    if (n > 1e9) return Math.floor(n * 1000);
    return 0;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positionOpenTimeMs(pos) {
  const raw = pos?._raw || {};
  const candidates = [
    pos?.opened_at, pos?.openedAt, pos?.open_time, pos?.openTime,
    pos?.open_timestamp, pos?.openTimestamp, pos?.entry_time, pos?.entryTime,
    pos?.created_at, pos?.createdAt, pos?.timestamp, pos?.time,
    raw.opened_at, raw.openedAt, raw.open_time, raw.openTime,
    raw.open_timestamp, raw.openTimestamp, raw.entry_time, raw.entryTime,
    raw.created_at, raw.createdAt, raw.timestamp, raw.time,
    raw.increasedAtTime, raw.lastIncreasedTime, raw.lastIncreasedAtTime,
  ];
  for (const value of candidates) {
    const ms = timeMs(value);
    if (ms) return ms;
  }
  return 0;
}

function positionStableKey(pos) {
  const symbol = String(pos?.symbol || pos?.s || '').toUpperCase();
  const side = String(pos?.side || pos?.d || '').toLowerCase();
  const market = String(pos?.marketPubkey || pos?.market_pubkey || pos?.market_addr || pos?.marketAddress || pos?.market || pos?._raw?.marketAddress || '');
  const subaccount = pos?._phoenixSubaccountIndex ?? pos?.subaccount_index ?? pos?.subaccountIndex ?? '';
  const pair = pos?.pair_index ?? pos?.pairIndex ?? '';
  const trade = pos?.trade_index ?? pos?.tradeIndex ?? '';
  const id = pos?.positionKey ?? pos?.position_key ?? pos?.position_id ?? pos?.positionId ?? pos?.id ?? pos?._raw?.key ?? pos?._raw?.positionKey ?? '';
  const parts = [symbol, side, market, subaccount, pair, trade, id];
  return parts.some(Boolean) ? parts.join('|') : '';
}

function orderStableKey(order, index) {
  const sym = order?.symbol || order?.s || '';
  const side = order?.side || order?.d || '';
  const type = order?.order_type || order?.ot || '';
  const id = order?.order_id ?? order?.i ?? order?.client_order_id ?? order?.clientOrderId ?? '';
  const pair = order?.pair_index ?? order?.pairIndex ?? '';
  const trade = order?.trade_index ?? order?.tradeIndex ?? '';
  const price = order?.price ?? order?.ip ?? order?.stop_price ?? order?.sp ?? order?.triggerPriceUi ?? order?.trigger_price_ui ?? '';
  const parts = [id, sym, side, type, pair, trade, price];
  return parts.some(part => part !== '' && part != null) ? parts.join('|') : `order:${index}`;
}

function orderPositionSide(order) {
  const direction = String(order?.order_direction || order?.orderDirection || '').toLowerCase();
  if (direction.includes('long')) return 'bid';
  if (direction.includes('short')) return 'ask';
  const side = String(order?.side || order?.d || order?.sideUi || order?.tradeType || '').trim().toLowerCase();
  if (side === 'long' || side === 'buy' || side === 'bid') return 'bid';
  if (side === 'short' || side === 'sell' || side === 'ask') return 'ask';
  return side;
}

function orderSideLabel(order) {
  const direction = String(order?.order_direction || order?.orderDirection || '').trim();
  if (direction) return direction;
  const side = orderPositionSide(order);
  return side === 'bid' ? 'BUY' : 'SELL';
}

function positionOpenSide(pos) {
  const sign = Number(pos?.sign ?? pos?.position_sign ?? pos?.side_sign);
  if (Number.isFinite(sign) && sign < 0) return 'ask';
  if (Number.isFinite(sign) && sign > 0) return 'bid';
  const raw = String(pos?.side || pos?.d || pos?.position_side || pos?.direction || '').trim().toLowerCase();
  if (raw === 'ask' || raw === 'sell' || raw === 'short') return 'ask';
  if (raw === 'bid' || raw === 'buy' || raw === 'long') return 'bid';
  const amount = Number(pos?.position ?? pos?.size ?? pos?.base_amount);
  if (Number.isFinite(amount) && amount < 0) return 'ask';
  return 'bid';
}

function positionCloseSide(pos) {
  return positionOpenSide(pos) === 'bid' ? 'ask' : 'bid';
}

function isReadOnlyOrder(order) {
  if (order?._phoenixSyntheticTpsl && order?._phoenixCancelableTpsl) return false;
  return !!(order?._readOnly || order?._attachedTpslInfo || order?._phoenixSyntheticTpsl);
}

function normalizedOrderIdentity(value) {
  const text = String(value ?? '').trim();
  return text && text !== '0' ? text : '';
}

function orderIdentityValues(order) {
  return [
    order?.order_id,
    order?.i,
    order?.id,
    order?.digest,
    order?.key,
    order?.hash,
    order?.client_order_id,
    order?.clientOrderId,
    order?.cloid,
    order?.orderSequenceNumber,
    order?.sequence_number,
    order?.sequenceNumber,
    order?.nonce,
    order?._raw?.order_id,
    order?._raw?.id,
    order?._raw?.digest,
    order?._raw?.key,
    order?._raw?.hash,
    order?._raw?.client_order_id,
    order?._raw?.clientOrderId,
    order?._raw?.cloid,
    order?._raw?.orderSequenceNumber,
    order?._raw?.sequence_number,
    order?._raw?.sequenceNumber,
    order?._raw?.nonce,
  ].map(normalizedOrderIdentity).filter(Boolean);
}

function orderParentIdentityValues(order) {
  return [
    order?.parent_order_id,
    order?.parentOrderId,
    order?.parent_id,
    order?.parentId,
    order?.parent_client_order_id,
    order?.parentClientOrderId,
    order?.parent_digest,
    order?.parentDigest,
    order?.parent_hash,
    order?.parentHash,
    order?.linked_order_id,
    order?.linkedOrderId,
    order?.linked_client_order_id,
    order?.linkedClientOrderId,
    order?.oco_order_id,
    order?.ocoOrderId,
    order?.origin_order_id,
    order?.originOrderId,
    order?.dependency_order_id,
    order?.dependencyOrderId,
    order?.trigger?.parent_order_id,
    order?.trigger?.parentOrderId,
    order?.trigger?.parent_id,
    order?.trigger?.parentId,
    order?._raw?.parent_order_id,
    order?._raw?.parentOrderId,
    order?._raw?.parent_id,
    order?._raw?.parentId,
    order?._raw?.parent_client_order_id,
    order?._raw?.parentClientOrderId,
    order?._raw?.parent_digest,
    order?._raw?.parentDigest,
    order?._raw?.parent_hash,
    order?._raw?.parentHash,
    order?._raw?.linked_order_id,
    order?._raw?.linkedOrderId,
    order?._raw?.linked_client_order_id,
    order?._raw?.linkedClientOrderId,
    order?._raw?.oco_order_id,
    order?._raw?.ocoOrderId,
    order?._raw?.origin_order_id,
    order?._raw?.originOrderId,
    order?._raw?.dependency_order_id,
    order?._raw?.dependencyOrderId,
    order?._raw?.trigger?.parent_order_id,
    order?._raw?.trigger?.parentOrderId,
    order?._raw?.trigger?.parent_id,
    order?._raw?.trigger?.parentId,
  ].map(normalizedOrderIdentity).filter(Boolean);
}

function orderScopeValue(order, ...keys) {
  for (const key of keys) {
    const value = order?.[key] ?? order?._raw?.[key];
    const text = normalizedOrderIdentity(value);
    if (text) return text.toLowerCase();
  }
  return '';
}

function ordersShareInstrumentScope(parent, child) {
  const parentSymbol = String(parent?.symbol || parent?.s || '').trim().toUpperCase();
  const childSymbol = String(child?.symbol || child?.s || '').trim().toUpperCase();
  if (!parentSymbol || !childSymbol || parentSymbol !== childSymbol) return false;

  const parentMarket = orderScopeValue(parent, 'market_addr', 'marketAddress', 'market', 'market_id', 'marketId', 'market_index', 'marketIndex', 'pair_index', 'pairIndex', 'pair_id', 'pairId', 'product_id', 'productId', 'asset_id', 'assetId');
  const childMarket = orderScopeValue(child, 'market_addr', 'marketAddress', 'market', 'market_id', 'marketId', 'market_index', 'marketIndex', 'pair_index', 'pairIndex', 'pair_id', 'pairId', 'product_id', 'productId', 'asset_id', 'assetId');
  if (parentMarket && childMarket && parentMarket !== childMarket) return false;

  const parentSub = normalizedOrderIdentity(parent?._phoenixSubaccountIndex ?? parent?.subaccount_index ?? parent?.subaccountIndex ?? parent?.subaccount_id ?? parent?.subaccountId ?? parent?.account_id ?? parent?.accountId ?? parent?._raw?.subaccountIndex ?? parent?._raw?.subaccount_id ?? parent?._raw?.subaccountId ?? parent?._raw?.account_id ?? parent?._raw?.accountId);
  const childSub = normalizedOrderIdentity(child?._phoenixSubaccountIndex ?? child?.subaccount_index ?? child?.subaccountIndex ?? child?.subaccount_id ?? child?.subaccountId ?? child?.account_id ?? child?.accountId ?? child?._raw?.subaccountIndex ?? child?._raw?.subaccount_id ?? child?._raw?.subaccountId ?? child?._raw?.account_id ?? child?._raw?.accountId);
  if (parentSub && childSub && parentSub !== childSub) return false;

  return true;
}

function orderExplicitlyAttachedTo(parent, child) {
  const parentIds = new Set(orderIdentityValues(parent));
  if (!parentIds.size) return false;
  return orderParentIdentityValues(child).some(id => parentIds.has(id));
}

function orderHasAttachedTpslEvidence(order) {
  const raw = order?._raw || {};
  if (orderTpslKind(order)) return true;
  if (orderReduceOnlyLike(order) && orderTriggerPrice(order) > 0) return true;
  if (orderParentIdentityValues(order).length > 0) return true;
  return [
    order?._attachedTpslCandidate,
    order?._phoenixConditionalOrder,
    order?.is_tpsl,
    order?.isTpsl,
    order?.is_tp_sl,
    order?.isTpSl,
    order?.is_trigger,
    order?.isTrigger,
    order?.is_trigger_order,
    order?.isTriggerOrder,
    order?.isConditionalOrder,
    order?.attached_tpsl,
    order?.attachedTpsl,
    order?.tp_sl,
    order?.tpSl,
    order?.conditionalKind,
    order?.conditional_kind,
    order?.trigger,
    order?.conditional,
    raw.is_tpsl,
    raw.isTpsl,
    raw.is_tp_sl,
    raw.isTpSl,
    raw.is_trigger,
    raw.isTrigger,
    raw.is_trigger_order,
    raw.isTriggerOrder,
    raw.isConditionalOrder,
    raw.attached_tpsl,
    raw.attachedTpsl,
    raw.tp_sl,
    raw.tpSl,
    raw.conditionalKind,
    raw.conditional_kind,
    raw.trigger,
    raw.conditional,
  ].some(truthyOrderFlag);
}

function orderIsDisplayTpsl(order, positions = []) {
  const kind = orderTpslKind(order);
  if (kind) return true;
  if (orderHasAttachedTpslEvidence(order) && orderReduceOnlyLike(order) && orderTriggerPrice(order) > 0) return true;
  const type = orderDisplayType(order, positions).toLowerCase();
  return type.includes('take') || type.includes('stop') || type.includes('tp') || type.includes('sl');
}

function orderIsGroupParent(order, positions = []) {
  if (orderIsDisplayTpsl(order, positions) || orderReduceOnlyLike(order)) return false;
  const type = orderDisplayType(order, positions).toLowerCase();
  return type.includes('limit') || type.includes('trigger') || type.includes('order');
}

function priceFromAny(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    return numOrNull(
      value.stop_price
        ?? value.stopPrice
        ?? value.trigger_price
        ?? value.triggerPrice
        ?? value.triggerPriceUi
        ?? value.price
        ?? value.value
    );
  }
  return numOrNull(value);
}

function directAttachedTpslPrice(order, kind) {
  const raw = order?._raw || {};
  const candidates = kind === 'tp'
    ? [
        order?.take_profit_price,
        order?.takeProfitPrice,
        order?.tp_price,
        order?.tpPrice,
        order?.tp_trigger_price,
        order?.tpTriggerPrice,
        order?.take_profit_trigger_price,
        order?.takeProfitTriggerPrice,
        order?.take_profit,
        order?.takeProfit,
        order?.tp,
        order?.attached_tpsl?.take_profit,
        order?.attachedTpsl?.takeProfit,
        raw.take_profit_price,
        raw.takeProfitPrice,
        raw.tp_price,
        raw.tpPrice,
        raw.tp_trigger_price,
        raw.tpTriggerPrice,
        raw.take_profit_trigger_price,
        raw.takeProfitTriggerPrice,
        raw.take_profit,
        raw.takeProfit,
        raw.tp,
        raw.attached_tpsl?.take_profit,
        raw.attachedTpsl?.takeProfit,
      ]
    : [
        order?.stop_loss_price,
        order?.stopLossPrice,
        order?.sl_price,
        order?.slPrice,
        order?.sl_trigger_price,
        order?.slTriggerPrice,
        order?.stop_loss_trigger_price,
        order?.stopLossTriggerPrice,
        order?.stop_loss,
        order?.stopLoss,
        order?.sl,
        order?.attached_tpsl?.stop_loss,
        order?.attachedTpsl?.stopLoss,
        raw.stop_loss_price,
        raw.stopLossPrice,
        raw.sl_price,
        raw.slPrice,
        raw.sl_trigger_price,
        raw.slTriggerPrice,
        raw.stop_loss_trigger_price,
        raw.stopLossTriggerPrice,
        raw.stop_loss,
        raw.stopLoss,
        raw.sl,
        raw.attached_tpsl?.stop_loss,
        raw.attachedTpsl?.stopLoss,
      ];
  for (const candidate of candidates) {
    const price = priceFromAny(candidate);
    if (price != null && price > 0) return price;
  }
  return null;
}

function inferAttachedTpslKind(child, parent, positions = []) {
  const explicit = orderTpslKind(child);
  if (explicit) return explicit;
  const type = orderDisplayType(child, positions).toLowerCase();
  if (type.includes('take') || type.includes('tp')) return 'tp';
  if (type.includes('stop') || type.includes('sl')) return 'sl';

  const childPrice = orderDisplayPrice(child);
  const parentPrice = orderDisplayPrice(parent);
  if (!(childPrice > 0) || !(parentPrice > 0)) return '';
  const parentSide = orderPositionSide(parent);
  if (parentSide === 'bid') return childPrice > parentPrice ? 'tp' : 'sl';
  if (parentSide === 'ask') return childPrice < parentPrice ? 'tp' : 'sl';
  return '';
}

function attachedTpslRowFromOrder(child, parent, positions = []) {
  const kind = inferAttachedTpslKind(child, parent, positions);
  if (kind !== 'tp' && kind !== 'sl') return null;
  const price = orderDisplayPrice(child);
  if (!(price > 0)) return null;
  return {
    ...child,
    _attachedTpslKind: kind,
    _attachedTpslInfo: true,
    _readOnly: true,
    price: String(price),
    order_type: kind === 'tp' ? 'TAKE_PROFIT' : 'STOP_LOSS',
  };
}

function directAttachedTpslRows(parent) {
  const rows = [];
  const tp = directAttachedTpslPrice(parent, 'tp');
  if (tp != null && tp > 0) {
    rows.push({
      ...parent,
      _attachedTpslKind: 'tp',
      _attachedTpslInfo: true,
      _readOnly: true,
      price: String(tp),
      order_type: 'TAKE_PROFIT',
    });
  }
  const sl = directAttachedTpslPrice(parent, 'sl');
  if (sl != null && sl > 0) {
    rows.push({
      ...parent,
      _attachedTpslKind: 'sl',
      _attachedTpslInfo: true,
      _readOnly: true,
      price: String(sl),
      order_type: 'STOP_LOSS',
    });
  }
  return rows;
}

function scoreAttachedTpslParent(parent, child, positions = []) {
  if (!orderIsGroupParent(parent, positions)) return -1;
  if (!ordersShareInstrumentScope(parent, child)) return -1;
  if (orderExplicitlyAttachedTo(parent, child)) return 10_000;
  if (!orderHasAttachedTpslEvidence(child)) return -1;
  let score = 100;
  const parentSide = orderPositionSide(parent);
  const childSide = orderPositionSide(child);
  if (parentSide && childSide && parentSide === childSide) score += 8;
  const kind = inferAttachedTpslKind(child, parent, positions);
  if (kind) score += 12;
  const parentPrice = orderDisplayPrice(parent);
  const childPrice = orderDisplayPrice(child);
  if (parentPrice > 0 && childPrice > 0) score += Math.max(0, 10 - Math.min(10, Math.abs(childPrice - parentPrice) / Math.max(parentPrice * 0.01, 1)));
  return score;
}

function orderAttachedTpslRows(order) {
  const direct = directAttachedTpslRows(order);
  const grouped = Array.isArray(order?._attachedTpslRows) ? order._attachedTpslRows : [];
  const byKind = new Map();
  for (const row of [...direct, ...grouped]) {
    const kind = orderTpslKind(row);
    const price = orderDisplayPrice(row);
    if ((kind === 'tp' || kind === 'sl') && price > 0 && !byKind.has(kind)) {
      byKind.set(kind, { ...row, _attachedTpslKind: kind, price: String(price) });
    }
  }
  return ['tp', 'sl'].map(kind => byKind.get(kind)).filter(Boolean);
}

function groupOrdersForList(orders, positions = []) {
  const list = Array.isArray(orders) ? orders.filter(Boolean) : [];
  if (!list.length) return [];
  const parentEntries = list
    .map((order, index) => ({ order, index }))
    .filter(entry => orderIsGroupParent(entry.order, positions));
  if (!parentEntries.length) {
    return list.map(order => {
      const direct = directAttachedTpslRows(order);
      return direct.length ? { ...order, _attachedTpslRows: direct } : order;
    });
  }

  const attachedByParent = new Map();
  const attachedIndexes = new Set();
  list.forEach((child, childIndex) => {
    if (!orderIsDisplayTpsl(child, positions)) return;
    let best = null;
    for (const entry of parentEntries) {
      if (entry.index === childIndex) continue;
      const score = scoreAttachedTpslParent(entry.order, child, positions);
      if (score < 0) continue;
      if (!best || score > best.score) best = { ...entry, score };
    }
    if (!best) return;
    const row = attachedTpslRowFromOrder(child, best.order, positions);
    if (!row) return;
    if (!attachedByParent.has(best.index)) attachedByParent.set(best.index, []);
    attachedByParent.get(best.index).push(row);
    attachedIndexes.add(childIndex);
  });

  return list
    .map((order, index) => {
      if (attachedIndexes.has(index)) return null;
      const rows = [...directAttachedTpslRows(order), ...(attachedByParent.get(index) || [])];
      if (!rows.length) return order;
      return { ...order, _attachedTpslRows: rows };
    })
    .filter(Boolean);
}

function AttachedTpslSummary({ order, compact = false }) {
  const rows = orderAttachedTpslRows(order);
  if (!rows.length) return null;
  const byKind = Object.fromEntries(rows.map(row => [orderTpslKind(row), row]));
  const renderLeg = (kind, label) => {
    const row = byKind[kind];
    const price = row ? orderDisplayPrice(row) : 0;
    const color = kind === 'tp' ? '#118a3b' : '#b92727';
    return (
      <span style={compact ? {...S.attachedTpslLegCompact, color} : {...S.attachedTpslLeg, color}}>
        {label}: {price > 0 ? formatOrderPrice(price) : 'None'}
      </span>
    );
  };
  return (
    <div style={compact ? S.attachedTpslTableRow : S.attachedTpslRow}>
      {renderLeg('tp', 'TP')}
      {renderLeg('sl', 'SL')}
    </div>
  );
}

function useOpenedSortedPositions(positions) {
  const orderRef = useRef({ map: new Map(), nextSeq: 1 });
  return useMemo(() => {
    if (!orderRef.current?.map || typeof orderRef.current.map.get !== 'function') {
      orderRef.current = { map: new Map(), nextSeq: 1 };
    }
    const state = orderRef.current;
    const now = Date.now();
    const seen = new Set();
    const list = Array.isArray(positions)
      ? positions
      : Object.values(positions || {}).filter(Boolean);
    const rows = list.map((pos, index) => {
      const key = positionStableKey(pos) || `position:${index}`;
      seen.add(key);
      let rec = state.map.get(key);
      if (!rec) {
        rec = { firstSeenMs: now, seq: state.nextSeq++ };
        state.map.set(key, rec);
      }
      const openedMs = positionOpenTimeMs(pos);
      if (openedMs) rec.openedMs = openedMs;
      return {
        pos,
        index,
        seq: rec.seq,
        openedMs: rec.openedMs || rec.firstSeenMs,
      };
    });

    for (const key of state.map.keys()) {
      if (!seen.has(key)) state.map.delete(key);
    }

    return rows
      .sort((a, b) => (b.openedMs - a.openedMs) || (a.seq - b.seq) || (a.index - b.index))
      .map(row => row.pos);
  }, [positions]);
}

const SignalIcon = ({ type, size = 14 }) => {
  if (type === '🔥') return (
    <svg width={size} height={size} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-label="hot">
      <path fill="#FF6B35" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176A7.55 7.55 0 0 1 6.648 6.61a.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248Z" />
      <path fill="#FFD54A" d="M15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.545 3.75 3.75 0 0 1 3.255 3.717Z" />
    </svg>
  );
  if (type === '📈') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
  if (type === '📉') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#E53935" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </svg>
  );
  if (type === '💀') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#a3906a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm6 0a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5z" />
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
      <path d="M12 13c-2 0-3 1-3 3s1 3 3 3 3-1 3-3-1-3-3-3z" />
    </svg>
  );
  return null;
};

// Per-step "what is happening" hint. Keys match the labels we set in
// useDecibel.js activateApiWallet — keep them in sync. Used by the
// activate gate (full-screen, NOT a popup) to explain each Petra prompt
// inline before the user clicks sign.
const ACTIVATION_STEP_HINTS = {
  'Create trading account':
    "Petra will sign a transaction that creates your private subaccount on Decibel. This is the on-chain object that holds your USDC and your positions.",
  'Authorize fast trading':
    "Petra grants the Clash server signer permission to place orders for your Decibel subaccount. After this, trades go through without a Petra popup per order.",
  'Enable builder fee routing':
    "A 0.01% fee on each trade goes to the Clash dev wallet. Tiny vs CEX fees, and it's how we earn from this integration.",
  'Finalising…':
    "Reading the on-chain state to confirm everything landed. Don't refresh — this only takes a moment.",
  'Preparing activation…':
    'Checking your account on-chain to figure out which signatures are still needed.',
};

const HYPERLIQUID_STEP_HINTS = {
  'Checking Hyperliquid setup':
    'Reading Hyperliquid account state, builder fee approval, and one tap trading permission.',
  'Approve builder fee':
    'Your wallet signs the Hyperliquid builder fee approval. This routes the configured trade fee to Clash and must happen before trading unlocks.',
  'Enable one tap trading':
    'Your wallet approves a local Hyperliquid agent. After this, orders use the agent and avoid repeated wallet network/signature popups.',
  'Apply referral code':
    'If this wallet has no Hyperliquid referrer yet, we attach the Clash referral code. Existing referrals are left unchanged.',
  'Finalising...':
    'Refreshing Hyperliquid state to confirm the approvals are visible before the trade panel opens.',
};

// ── Hyperliquid setup-gate styles ────────────────────────────────────
// Visual language matches BridgeStatusModal in NftBridgePanel.jsx so
// the player perceives the two flows as one family. Parchment body,
// gold-on-brown title, step-bubble progress rail, big green primary
// CTA. Embedded `act-spin` keyframes are declared inline by the gate's
// `<style>` tag — see the surrounding setupGate JSX.
const hlGateStyles = {
  frame: {
    margin: '0 auto',
    width: '100%',
    maxWidth: 460,
    padding: 'clamp(14px, 3vh, 24px) clamp(14px, 4vw, 24px)',
    display: 'flex', flexDirection: 'column',
    gap: 'clamp(10px, 2vh, 16px)',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  titleBlock: {
    display: 'flex', flexDirection: 'column', gap: 4,
    alignItems: 'center', textAlign: 'center',
  },
  kicker: {
    fontSize: 11, fontWeight: 900, color: '#1B5E20',
    letterSpacing: 1.4, textTransform: 'uppercase',
  },
  title: {
    fontSize: 'clamp(18px, 2.6vh, 22px)', fontWeight: 900, color: '#5C3A21',
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 12, fontWeight: 700, color: '#8a7252',
    lineHeight: 1.45, maxWidth: 380,
  },

  stepList: {
    listStyle: 'none', margin: 0, padding: '12px 14px',
    background: '#fffbef',
    border: '1px solid #d4c8b0',
    borderRadius: 12,
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  stepItem: {
    display: 'flex', alignItems: 'flex-start', gap: 11,
  },
  stepBubble: {
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, flexShrink: 0,
    marginTop: 1,
    background: '#e8dfc8', color: '#9f8759',
    border: '2px solid #d4c8b0',
    transition: 'background 0.2s, border-color 0.2s, color 0.2s',
  },
  stepBubble_pending: {},
  stepBubble_active: {
    background: '#fff6dc', border: '2px solid #c2851b', color: '#5C3A21',
    boxShadow: '0 0 0 3px rgba(255,217,122,0.4)',
  },
  stepBubble_done: {
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    border: '2px solid #1f6d34', color: '#fff',
  },
  stepBubble_error: {
    background: '#E53935', border: '2px solid #7f0000', color: '#fff',
  },
  stepText: {
    display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25,
    flex: 1,
  },
  stepLabel: {
    fontSize: 13, fontWeight: 800, color: '#7a5a30',
  },
  stepLabel_active: { color: '#5C3A21' },
  stepLabel_done: { color: '#5C3A21' },
  stepLabel_error: { color: '#b71c1c' },
  stepLabel_pending: {},
  stepHint: {
    fontSize: 11, color: '#9f8759', fontWeight: 700,
    marginTop: 1, overflowWrap: 'anywhere',
  },

  // Spinner reuses `act-spin` keyframes injected by the gate render so
  // it animates the same way as the legacy big-circle spinner used to.
  spinner: {
    width: 12, height: 12, borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'rgba(92,58,33,0.25)',
    borderTopColor: '#5C3A21',
    animation: 'act-spin 0.9s linear infinite',
  },
  bigSpinner: {
    width: 42, height: 42, borderRadius: '50%',
    borderWidth: 4,
    borderStyle: 'solid',
    borderColor: 'rgba(92,58,33,0.18)',
    borderTopColor: '#5C3A21',
    animation: 'act-spin 0.9s linear infinite',
    alignSelf: 'center',
  },

  workingHint: {
    fontSize: 13, fontWeight: 800, color: '#5C3A21',
    background: 'linear-gradient(180deg, #fff2c2 0%, #ffd76a 100%)',
    border: '2px solid #c2851b',
    padding: '10px 14px', borderRadius: 12,
    textAlign: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
    animation: 'act-pulse 2.4s ease-in-out infinite',
  },

  primaryBtn: {
    padding: '12px 18px', borderRadius: 12,
    fontSize: 14, fontWeight: 900,
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    border: '2px solid #1f6d34',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: 0.3,
    textShadow: '0 1px 1px rgba(0,0,0,0.35)',
    boxShadow: '0 4px 10px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)',
  },
  secondaryBtn: {
    padding: '12px 18px', borderRadius: 12,
    fontSize: 14, fontWeight: 900,
    background: '#fffaf0',
    border: '2px solid #bfa77b',
    color: '#5C3A21',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: 0.3,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
  },
  primaryBtnBusy: { opacity: 0.7, cursor: 'not-allowed' },

  errorBox: {
    color: '#7a1f1c',
    background: '#fdecea',
    border: '1px solid #E53935',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12, fontWeight: 700,
    overflowWrap: 'anywhere',
  },

  // Subtle footnote below the primary action — used by the Decibel gate
  // for the "your funds stay in your wallet" reassurance line.
  footnote: {
    fontSize: 11, fontWeight: 700,
    color: '#9f8759',
    textAlign: 'center',
    lineHeight: 1.4,
  },
};

const FLASH_FUNDING_STEPS = [
  {
    id: 'ledger',
    label: 'Deposit ledger',
    hint: 'One-time collateral ledger check. Existing wallets skip this without a signature.',
  },
  {
    id: 'basket',
    label: 'Flash account',
    hint: 'One-time basket setup. This creates the Flash account that receives deposits.',
  },
  {
    id: 'basket_wait',
    label: 'Account indexing',
    hint: 'Waiting until Flash sees the new basket before building the deposit.',
  },
  {
    id: 'deposit',
    label: 'Deposit USDC',
    hint: 'Confirm the USDC transfer from your connected Solana wallet.',
  },
  {
    id: 'delegate',
    label: 'Delegation',
    hint: 'One-time basket delegation so trading works after funding.',
  },
  {
    id: 'refresh',
    label: 'Balance update',
    hint: 'Refreshing Flash account state after the confirmed transactions.',
  },
];

function FlashFundingStatusModal({ progress, onClose }) {
  if (!progress?.open) return null;
  const steps = progress.steps || {};
  const completed = !!progress.completed;
  const errored = progress.status === 'error';
  const currentStep = progress.currentStep || 'prepare';
  const currentIndex = FLASH_FUNDING_STEPS.findIndex(step => step.id === currentStep);
  const statusFor = (step, index) => {
    const explicit = steps[step.id]?.status;
    if (explicit) return explicit;
    if (completed) return 'done';
    if (errored && (currentStep === step.id || currentStep === 'error')) return 'error';
    if (currentStep === step.id) return 'active';
    if (currentIndex > index) return 'done';
    return 'pending';
  };
  const title = errored ? 'Flash deposit needs attention' : completed ? 'Flash deposit sent' : 'Flash deposit in progress';
  const subtitle = progress.hint || 'Approve wallet prompts in order and keep this window open.';
  return (
    <div style={flashFundingModalStyles.overlay} data-nodrag>
      <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.78}50%{opacity:1}}`}</style>
      <div style={flashFundingModalStyles.panel}>
        <div style={hlGateStyles.titleBlock}>
          <div style={hlGateStyles.kicker}>Flash Trade</div>
          <div style={hlGateStyles.title}>{title}</div>
          <div style={hlGateStyles.subtitle}>{subtitle}</div>
        </div>
        <ol style={hlGateStyles.stepList}>
          {FLASH_FUNDING_STEPS.map((step, index) => {
            const row = steps[step.id] || {};
            const status = statusFor(step, index);
            const bubbleStyle = {
              ...hlGateStyles.stepBubble,
              ...(hlGateStyles[`stepBubble_${status}`] || null),
            };
            const labelStyle = {
              ...hlGateStyles.stepLabel,
              ...(hlGateStyles[`stepLabel_${status}`] || null),
            };
            return (
              <li key={step.id} style={hlGateStyles.stepItem}>
                <span style={bubbleStyle}>
                  {status === 'active'
                    ? <span style={hlGateStyles.spinner} />
                    : status === 'done'
                      ? 'OK'
                      : status === 'error'
                        ? '!'
                        : index + 1}
                </span>
                <span style={hlGateStyles.stepText}>
                  <span style={labelStyle}>{row.label || step.label}</span>
                  <span style={hlGateStyles.stepHint}>
                    {row.hint || step.hint}
                    {row.skipped ? ' Skipped.' : ''}
                    {row.signature ? ` Tx ${shortAddr(row.signature)}` : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        {errored && <div style={hlGateStyles.errorBox}>{progress.error || progress.hint || 'Flash deposit failed.'}</div>}
        {!errored && !completed && <div style={hlGateStyles.workingHint}>Waiting for the current Flash step to finish</div>}
        <div style={flashFundingModalStyles.footer}>
          <button type="button" onClick={onClose} style={completed || errored ? hlGateStyles.primaryBtn : hlGateStyles.secondaryBtn}>
            {completed || errored ? 'Close' : 'Hide'}
          </button>
        </div>
      </div>
    </div>
  );
}

const flashFundingModalStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 12000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    background: 'rgba(12, 8, 4, 0.45)',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  panel: {
    width: 'min(440px, 100%)',
    maxHeight: 'min(680px, calc(100vh - 28px))',
    overflowY: 'auto',
    background: '#fdf8e7',
    border: '5px solid #d4c8b0',
    borderRadius: 16,
    boxShadow: '0 18px 44px rgba(0,0,0,0.36)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
  },
};

// Decibel deposit gate. Shown after the user has activated trading but
// before they've moved any USDC onto the subaccount. The whole panel
// turns into a deposit prompt — there's nothing else to do here, since
// you can't open positions with $0 of collateral. Mirrors the activate
// gate's full-screen "no escape until you finish" UX.
const DecibelDepositGate = ({
  panelRef, fullscreen, isMobile, isDragging, posRef,
  onClose, onPointerDown,
  walletUsdc, depositToTradingAccount, loading, error,
}) => {
  const [amt, setAmt] = useState('5');
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState(null);
  // Derived state for the input + submit button. Decibel's `min_size`
  // varies per market but is roughly $1 worth at typical leverages, so $5
  // is the sensible "starter" floor and $1 is the hard minimum we let
  // through. Anything less just isn't enough to open a single lot on most
  // markets without floating-point quirks rounding the size to zero.
  const wallet = Number(walletUsdc ?? 0);
  const amtN = Number(amt) || 0;
  const tooSmall = amtN < 1;
  const overWallet = amtN > wallet + 1e-9;
  const canSubmit = !busy && !loading && !tooSmall && !overWallet && wallet > 0;

  const handleDeposit = async () => {
    setLocalErr(null);
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await depositToTradingAccount(amtN);
      if (res?.error) setLocalErr(res.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{animCSS}</style>
      <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
        ...(fullscreen ? S.containerFull : S.container),
        ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
        transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
        transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={S.header} onPointerDown={onPointerDown}>
          <span style={S.headerTitle}>Deposit USDC to start</span>
          <button data-nodrag onClick={onClose} style={S.closeBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{
          ...S.body,
          alignItems: 'stretch',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: 0,
        }}>
        <div style={{
          margin: 'auto',
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(10px, 2vh, 16px)',
          padding: 'clamp(14px, 3vh, 24px) clamp(14px, 4vw, 24px)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 'clamp(64px, 12vh, 96px)',
            height: 'clamp(64px, 12vh, 96px)',
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #FFD54F 0%, #F57C00 100%)',
            border: '4px solid #FB8C00',
            boxShadow: '0 6px 0 #E65100, 0 10px 22px rgba(0,0,0,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'clamp(32px, 6vh, 48px)',
            flexShrink: 0,
          }}>💵</div>
          <div style={{
            color: '#5C3A21', fontSize: 'clamp(17px, 2.6vh, 22px)', fontWeight: 900,
            textAlign: 'center', letterSpacing: '0.4px',
          }}>Fund your trading account</div>
          <div style={{
            color: '#8a7252', fontSize: 13, fontWeight: 600,
            textAlign: 'center', maxWidth: 380, lineHeight: 1.5,
          }}>
            You can't trade without USDC for collateral. Deposit at least
            <b> $5</b> from your Petra wallet to start earning real PnL plus
            in-game gold rewards based on your trade volume.
          </div>

          {/* Wallet snapshot — what's available to deposit. */}
          <div style={{
            width: '100%', maxWidth: 380,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#fffbef', border: '2px solid #d4c8b0',
            borderRadius: 12, padding: '10px 14px',
          }}>
            <div style={{fontSize: 12, fontWeight: 700, color: '#8a7252'}}>In your wallet</div>
            <div style={{fontSize: 16, fontWeight: 900, color: '#5C3A21'}}>
              ${wallet.toFixed(2)} USDC
            </div>
          </div>

          {/* Amount input — defaults to $5. Quick-pick buttons let users
              tap an amount instead of typing on mobile. */}
          <div style={{width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 8}}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fffbef', border: '2px solid #d4c8b0',
              borderRadius: 12, padding: '10px 14px',
            }}>
              <div style={{fontSize: 18, fontWeight: 900, color: '#5C3A21'}}>$</div>
              <input
                type="number" min="1" step="0.5"
                value={amt}
                onChange={(e) => setAmt(e.target.value)}
                disabled={busy || loading}
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  background: 'transparent', fontSize: 18, fontWeight: 900,
                  color: '#5C3A21', minWidth: 0,
                }}
              />
              <div style={{fontSize: 11, fontWeight: 700, color: '#8a7252'}}>USDC</div>
            </div>
            <div style={{display: 'flex', gap: 6}}>
              {[5, 10, 25, 50].filter(v => v <= wallet || v === 5).map(v => (
                <button
                  key={v}
                  onClick={() => setAmt(String(v))}
                  disabled={busy || loading || v > wallet}
                  style={{
                    flex: 1, padding: '6px 0',
                    background: amtN === v ? '#5C3A21' : '#fffbef',
                    color: amtN === v ? '#fff' : '#5C3A21',
                    border: '2px solid #d4c8b0', borderRadius: 8,
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    opacity: v > wallet ? 0.4 : 1,
                  }}
                >${v}</button>
              ))}
              {wallet > 0 && (
                <button
                  onClick={() => setAmt(String(Math.floor(wallet * 100) / 100))}
                  disabled={busy || loading}
                  style={{
                    flex: 1, padding: '6px 0',
                    background: '#fffbef', color: '#5C3A21',
                    border: '2px solid #d4c8b0', borderRadius: 8,
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  }}
                >MAX</button>
              )}
            </div>
          </div>

          <button
            style={{
              ...cartoonBtn(canSubmit ? '#DAA520' : '#9CA3AF', canSubmit ? '#B8860B' : '#6B7280'),
              padding: '16px 36px',
              fontSize: 16, fontWeight: 900, letterSpacing: '0.5px',
              width: '100%', maxWidth: 380,
              opacity: canSubmit ? 1 : 0.7,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
            onClick={handleDeposit}
            disabled={!canSubmit}
          >
            {busy || loading
              ? 'WAITING FOR PETRA…'
              : tooSmall
                ? 'MINIMUM $1'
                : overWallet
                  ? 'NOT ENOUGH USDC'
                  : `DEPOSIT $${amtN.toFixed(2)}`}
          </button>

          {wallet === 0 && (
            <div style={{
              fontSize: 12, color: '#7a6a4a', fontWeight: 700,
              textAlign: 'center', maxWidth: 380, padding: '10px 14px',
              background: '#fff8d8', border: '1px solid #d4c8b0',
              borderRadius: 8, lineHeight: 1.5,
            }}>
              Your Petra wallet has no USDC yet. Get USDC on Aptos via
              a bridge (e.g. <b>Wormhole</b> or <b>LayerZero</b>) or buy
              direct on a CEX that supports Aptos withdrawals.
            </div>
          )}

          <div style={{
            fontSize: 11, color: '#a3906a', fontWeight: 700,
            textAlign: 'center', maxWidth: 320, lineHeight: 1.4,
          }}>
            You can withdraw any time — funds stay on Aptos under your control.
          </div>
          {(localErr || error) && (
            <div style={{
              color: '#B71C1C', fontSize: 12, fontWeight: 700,
              textAlign: 'center', maxWidth: 380, padding: '8px 12px',
              background: '#FFEBEE', borderRadius: 8, border: '1px solid #FFCDD2',
            }}>{localErr || error}</div>
          )}
        </div>
        </div>
      </div>
    </>
  );
};

// Symbol picker dropdown with logo, max leverage, price, 24h change
const SymbolPicker = memo(function SymbolPicker({ markets, prices, symbol, onSelect, fullscreen, signals }) {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const priceBySymbol = new Map();
    const priceByPair = new Map();
    for (const price of prices || []) {
      if (price?.symbol && !priceBySymbol.has(price.symbol)) priceBySymbol.set(price.symbol, price);
      const pairKey = price?.pair_index ?? price?.market_id ?? price?.asset_id;
      if (pairKey != null) priceByPair.set(String(pairKey), price);
    }
    return markets.map(m => {
      const pairKey = m.pair_index ?? m.market_id ?? m.asset_id;
      const displaySymbol = marketDisplaySymbol(m);
      const p = (pairKey != null ? priceByPair.get(String(pairKey)) : null)
        || priceBySymbol.get(displaySymbol)
        || priceBySymbol.get(m.symbol);
      const priceData = { ...m, ...(p || {}) };
      const mark = firstFinite(priceData.mark, priceData._mark, priceData.mid, priceData.oracle) || 0;
      const change = marketChange24h(priceData);
      const activity = marketActivity(priceData);
      return {
        key: String(pairKey ?? displaySymbol ?? m.symbol),
        symbol: displaySymbol,
        // Prefer the human-readable pair ("USD/JPY") when present; falls back
        // to the symbol key for legacy Pacifica markets that only ship base.
        label: displaySymbol,
        iconSym: baseSymbolForIcon(m, displaySymbol),
        maxLev: m.max_leverage,
        mark,
        change,
        activity,
        marketClosed: ostiumOpenTradeBlockReason(m, 1) === 'market_closed',
      };
    }).filter(r => !search || r.label.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (a.marketClosed !== b.marketClosed) return a.marketClosed ? 1 : -1;
        const byActivity = (b.activity?.score || 0) - (a.activity?.score || 0);
        if (Math.abs(byActivity) > 1e-9) return byActivity;
        return a.label.localeCompare(b.label);
      });
  }, [markets, prices, search]);

  return (
    <div style={{maxHeight: fullscreen ? '75vh' : 350, display: 'flex', flexDirection: 'column', gap: 6, flex: 1}}>
      <input
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
        style={{padding: '6px 10px', border: '2px solid #d4c8b0', borderRadius: 8, background: '#fdf8e7', fontSize: 13, fontWeight: 700, color: '#5C3A21', outline: 'none'}}
      />
      <div className="grad-scrollbar" style={{overflowY: 'auto', overflowX: 'hidden', flex: 1}}>
        <table style={{width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 12, fontFamily: '"Inter","Segoe UI",sans-serif'}}>
          <colgroup>
            <col style={{width: 'auto'}} />
            <col style={{width: '70px'}} />
            <col style={{width: '68px'}} />
            <col style={{width: '56px'}} />
          </colgroup>
          <thead><tr>
            <th style={SP.th}>Symbol</th>
            <th style={{...SP.th, textAlign: 'right'}}>Activity</th>
            <th style={{...SP.th, textAlign: 'right'}}>Price</th>
            <th style={{...SP.th, textAlign: 'right'}}>24h</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.key} onClick={() => onSelect(r.symbol)}
              style={{...SP.row, background: r.symbol === symbol ? '#e8dfc8' : 'transparent', cursor: 'pointer'}}>
              <td style={SP.td}>
                <div style={{display: 'flex', alignItems: 'center', gap: 5}}>
                  <TokenIcon sym={r.iconSym} size={18} />
                  <span style={{fontWeight: 900, color: '#5C3A21'}}>{r.label}</span>
                  <span style={{fontSize: 10, fontWeight: 800, color: '#a3906a'}}>{r.maxLev}x</span>
                  {r.marketClosed && (
                    <span style={{fontSize: 9, fontWeight: 900, color: '#B45309', background: '#FFF7D6', border: '1px solid #F59E0B', borderRadius: 5, padding: '1px 4px'}}>
                      Closed
                    </span>
                  )}
                  {(() => {
                    // If signals are loaded but this symbol isn't in the top-N trending feed,
                    // we know Elfa has no chatter for it → show 💀 "quiet" badge.
                    const loaded = signals && Object.keys(signals).length > 0;
                    const sig = signals && signals[r.symbol];
                    if (!loaded) return null;
                    const badge = sig ? sig.badge : '💀';
                    const label = sig ? sig.label : 'quiet';
                    if (badge === '·') return null;
                    return (
                      <span title={label} style={{display: 'inline-flex', alignItems: 'center'}}>
                        <SignalIcon type={badge} size={14} />
                      </span>
                    );
                  })()}
                </div>
              </td>
              <td
                title={r.activity?.volume > 0
                  ? `24h volume ${r.activity.label}`
                  : r.activity?.openInterest > 0
                    ? `Open interest ${formatCompactNumber(r.activity.openInterest)}`
                    : r.activity?.popularity > 0
                      ? 'Popular market fallback'
                      : 'No venue activity metric'}
                style={{...SP.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: r.activity?.volume > 0 ? '#7b5a22' : '#9b8a6a', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip'}}
              >
                {r.activity?.label || '—'}
              </td>
              <td style={{...SP.td, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#5C3A21', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip'}}>
                {r.mark > 0 ? fmtPrice(r.mark) : '—'}
              </td>
              <td style={{...SP.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: r.change >= 0 ? '#4CAF50' : '#E53935', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden'}}>
                {r.change >= 0 ? '+' : ''}{r.change.toFixed(2)}%
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
});

const SP = {
  th: { padding: '4px 8px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase', borderBottom: '2px solid #d4c8b0' },
  td: { padding: '6px 8px', borderBottom: '1px solid #e8dfc8' },
  row: { transition: 'background 0.1s' },
};

const ClosingButtonLabel = memo(function ClosingButtonLabel({ text = 'Closing...' }) {
  return (
    <span style={S.closeLoadingLabel}>
      <span style={S.closeLoadingSpinner} />
      {text ? <span>{text}</span> : null}
    </span>
  );
});

const OstiumWalletFallbackBar = memo(function OstiumWalletFallbackBar({
  action,
  loading,
  onRetry,
  onDismiss,
}) {
  if (!action || action.type !== 'close') return null;
  const text = humanizeTradeError(action.message || 'Ostium one tap close failed.', 'ostium');
  return (
    <div style={S.oneTapFallbackBar}>
      <div style={S.oneTapFallbackHead}>
        <span style={S.errorText}>{text}</span>
        <button
          type="button"
          onClick={onDismiss}
          style={S.oneTapFallbackDismiss}
          aria-label="Dismiss wallet fallback"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        style={{...S.btnRed, width: '100%', flex: '0 0 auto', opacity: loading ? 0.65 : 1}}
        disabled={loading}
        onClick={onRetry}
      >
        {loading ? <ClosingButtonLabel /> : 'Close via wallet'}
      </button>
    </div>
  );
});

// ==================== ORDERS LIST (mobile/tab card view) ====================
const OrdersList = memo(function OrdersList({ orders, cancelOrder, positions = [], leverageSettings = {} }) {
  const groupedOrders = useMemo(() => groupOrdersForList(orders, positions), [orders, positions]);
  if (!groupedOrders.length) {
    return (
      <div style={S.empty}>
        <div style={{opacity: 0.3, color: '#5C3A21'}}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </div>
        <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>No Orders</div>
      </div>
    );
  }
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
      {groupedOrders.map((o, i) => {
        const sym = o.symbol || o.s;
        const side = o.side || o.d;
        const price = orderDisplayPrice(o);
        const type = orderDisplayType(o, positions);
        const priceLabel = orderPriceDetailLabel(o, type);
        const leverageValue = orderDisplayLeverage(o, leverageSettings[sym]);
        const metrics = orderCardMetrics(o, positions, price, leverageValue);
        const amountLabel = formatOrderBaseAmount(metrics, sym);
        const isBid = orderPositionSide(o) === 'bid' || side === 'bid';
        const sideLabel = orderSideLabel(o);
        const isTP = type.includes('TAKE') || type.includes('TP');
        const isSL = type.includes('STOP') || type.includes('SL');
        const pending = isOrderPendingConfirmation(o);
        const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
        return (
          <div key={orderStableKey(o, i)} style={S.posCard}>
            <div style={S.row}>
              <span style={{fontSize: 16, fontWeight: 900}}>{sym}</span>
              <span style={{fontSize: 10, fontWeight: 800, color: typeColor, background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{type}</span>
              {pending ? <OrderPendingBadge /> : null}
              <span style={{fontSize: 13, fontWeight: 900, color: isBid ? '#4CAF50' : '#E53935'}}>
                {sideLabel}
              </span>
              {pending ? (
                <span style={{fontSize: 10, fontWeight: 800, color: '#8b7655'}}>Pending</span>
              ) : isReadOnlyOrder(o) ? (
                <span style={{fontSize: 10, fontWeight: 800, color: '#8b7655'}}>On position</span>
              ) : (
                <button style={S.cancelBtn} onClick={() => cancelOrder(sym, o.order_id ?? o.i, o.pair_index, o.trade_index)}>✕</button>
              )}
            </div>
            <div style={{...S.row, justifyContent: 'flex-start', flexWrap: 'wrap', gap: '4px 10px'}}>
              <span style={S.detail}>{priceLabel}: {formatOrderPrice(price)}</span>
              <span style={S.detail}>Amount: {amountLabel}</span>
              {metrics.marginUsd != null ? <span style={S.detail}>Margin: {formatOrderUsd(metrics.marginUsd)}</span> : null}
              {metrics.notionalUsd != null ? <span style={S.detail}>Size: {formatOrderUsd(metrics.notionalUsd)}</span> : null}
              {leverageValue != null ? <span style={S.detail}>Lev: {leverageValue}x</span> : null}
            </div>
            <AttachedTpslSummary order={o} />
          </div>
        );
      })}
    </div>
  );
});

// ==================== POSITIONS LIST (mobile/tab card view) ====================
const PositionsList = memo(function PositionsList({
  positions, orders, prices, dataReady, leverageSettings, marginModes, loading, error,
  closePosition, setTpsl, clearError, isBasic, dex, setLocalAlert = () => {}, setSuccessMsg = () => {},
}) {
  const [expandedPos, setExpandedPos] = useState(null);
  const [closePct, setClosePct] = useState(100);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [tpslInputMode, setTpslInputMode] = useState('price');
  const [tpslInitial, setTpslInitial] = useState({ key: null, tp: '', sl: '' });
  const [tpslSubmittingPos, setTpslSubmittingPos] = useState(null);

  if (!positions.length) {
    return (
      <div style={S.empty}>
        <div style={{opacity: 0.3, color: '#5C3A21'}}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        </div>
        <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>{dataReady ? 'No Positions' : 'Loading...'}</div>
      </div>
    );
  }
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start'}}>
      {positions.map((pos, i) => {
        const { entryP, markP, amt, margin, pnlVal, setLev, posValueUsd, pnlPct, pnlDirection, pnlColor, isDust, dustUsd } = getPositionMetrics(pos, prices, leverageSettings);
        const tpslMetrics = { entryP, markP, amt, margin, setLev, posValueUsd };
        const posKey = `${pos.symbol}-${pos.side}`;
        const expanded = expandedPos?.startsWith(posKey) ? expandedPos.split(':')[1] : null;
        const tpslBusy = tpslSubmittingPos === posKey;
        const ostiumTpMax = ostiumTpInputMax(dex, pos);
        const initialTpsl = tpslInitial.key === posKey ? tpslInitial : { tp: '', sl: '' };
        const tpSubmit = tpslSubmitValue({ pos, metrics: tpslMetrics, leg: 'tp', mode: tpslInputMode, value: tpPrice, initialValue: initialTpsl.tp });
        const slSubmit = tpslSubmitValue({ pos, metrics: tpslMetrics, leg: 'sl', mode: tpslInputMode, value: slPrice, initialValue: initialTpsl.sl });
        const changedTpPrice = tpSubmit.value;
        const changedSlPrice = slSubmit.value;
        const hasTpslChanges = tpSubmit.changed || slSubmit.changed;

        return (
          <div key={positionStableKey(pos) || i} style={S.posCard}>
            <div style={S.row}>
              <span style={{fontSize: 16, fontWeight: 900}}>{pos.symbol}</span>
              <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                {(() => {
                  const isIso = pos.is_isolated ?? marginModes?.[pos.symbol];
                  return (
                    <span style={{fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, borderWidth: 1, borderStyle: 'solid', borderColor: isIso ? '#FF9800' : '#4CAF50', color: isIso ? '#FF9800' : '#4CAF50', background: 'rgba(255,255,255,0.4)'}}>
                      {isIso ? 'ISO' : 'CROSS'}
                    </span>
                  );
                })()}
                <span style={{fontSize: 11, fontWeight: 800, color: isDust ? '#8a6d2f' : '#a3906a', background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{isDust ? 'DUST' : formatPositionLeverageBadge(setLev)}</span>
                <span style={{fontSize: 13, fontWeight: 900, color: pos.side === 'bid' ? '#4CAF50' : '#E53935'}}>
                  {pos.side === 'bid' ? 'LONG' : 'SHORT'}
                </span>
              </div>
            </div>
            <div style={S.row}>
              <span style={S.detail}>{isDust ? 'Dust' : 'Size'}: {isDust ? `$${dustUsd.toFixed(2)}` : (pos.amount_display || formatPositionAmount(pos.amount))} {!isDust && <span style={{color: '#a3906a'}}>(${posValueUsd.toFixed(2)})</span>}</span>
              <span style={S.detail}>Entry: ${fmtPrice(parseFloat(pos.entry_price))}</span>
            </div>
            <div style={S.row}>
              <span style={S.detail}>Mark: {markP ? `$${markP.toLocaleString()}` : '—'}</span>
              <span style={{fontSize: 14, fontWeight: 900, color: pnlColor}}>
                {formatSignedPnlUsd(pnlVal)} {!isDust && `(${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`}
              </span>
            </div>
            <PositionTpslRow pos={pos} orders={orders} />

            {/* Action buttons. Basic mode hides TP/SL — risk management
                features are deliberately stripped from the simplified UX. */}
            <div style={{display: 'flex', gap: 6, marginTop: 4}}>
              <button style={S.btnRed} onClick={() => { setClosePct(100); setExpandedPos(expanded === 'close' ? null : `${posKey}:close`); }}>{isDust ? 'Clean up' : 'Close'}</button>
              {!isDust && !isBasic && (
                <button style={S.btnBlue} onClick={() => {
                  if (expanded === 'tpsl') {
                    setExpandedPos(null);
                    setTpslInitial({ key: null, tp: '', sl: '' });
                    setTpslInputMode('price');
                    return;
                  }
                  const { tp, sl } = getPositionTpsl(pos, orders);
                  const nextTp = formatTpslInputValue(tp);
                  const nextSl = formatTpslInputValue(sl);
                  setTpPrice(nextTp);
                  setSlPrice(nextSl);
                  setTpslInputMode('price');
                  setTpslInitial({ key: posKey, tp: nextTp, sl: nextSl });
                  setExpandedPos(`${posKey}:tpsl`);
                }}>TP/SL</button>
              )}
            </div>

            {/* Close slider */}
            {expanded === 'close' && (
              <div style={S.expandPanel}>
                <div style={S.row}>
                  <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>{isDust ? 'Clean up Flash dust' : `Close ${closePct}%`}</span>
                  <span style={{fontSize: 11, color: '#a3906a', fontWeight: 700}}>
                    {formatCloseAmountLabel(pos, closePct, posValueUsd, isDust, dustUsd)}
                  </span>
                </div>
                {!isDust && (
                  <>
                    <input type="range" min="5" max="100" step="5" value={closePct} className="grad-slider" onChange={e => setClosePct(Number(e.target.value))} style={{...S.slider, '--val': `${((closePct - 5) / 95) * 100}%`}} />
                    <div style={S.sliderLabels}><span>5%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                  </>
                )}
                  <button style={{...S.btnRed, width: '100%'}} onClick={() => closePosition(pos.symbol, pos.side, String((dex === 'avantis' ? parseFloat(pos.margin) : parseFloat(pos.amount)) * (isDust ? 1 : closePct / 100)), pos.pair_index, pos.trade_index, isDust || closePct >= 100, dex === 'flash' ? { position: pos, inputUsdUi: String((dustUsd || posValueUsd) * (isDust ? 1 : closePct / 100)) } : undefined)} disabled={loading}>
                  {loading ? <ClosingButtonLabel /> : (isDust ? 'Clean up dust' : `Close ${closePct}%`)}
                </button>
              </div>
            )}

            {/* TP/SL panel — same isBasic gate so the inputs never reach
                the DOM in Basic mode (and never get accidentally fired). */}
            {!isDust && !isBasic && expanded === 'tpsl' && (
              <TpslEditor
                mode={tpslInputMode}
                onModeChange={(nextMode) => {
                  setTpslInputMode(nextMode);
                  setTpPrice('');
                  setSlPrice('');
                }}
                tpValue={tpPrice}
                slValue={slPrice}
                onTpChange={setTpPrice}
                onSlChange={setSlPrice}
                pos={pos}
                metrics={tpslMetrics}
                ostiumTpMax={ostiumTpMax}
                busy={tpslBusy}
                loading={loading}
                hasChanges={hasTpslChanges}
                onSubmit={async () => {
                  if (!hasTpslChanges) {
                    setLocalAlert('Change TP or SL before setting.');
                    return;
                  }
                  if (tpSubmit.error || slSubmit.error) {
                    setLocalAlert(tpSubmit.error || slSubmit.error);
                    return;
                  }
                  if (!validateTpslBeforeSubmit({ dex, pos, tpPrice: changedTpPrice, slPrice: changedSlPrice, setLocalAlert })) return;
                  setTpslSubmittingPos(posKey);
                  try {
                    const r = await setTpsl(pos.symbol, positionCloseSide(pos), changedTpPrice, changedSlPrice, pos.pair_index, pos.trade_index, pos.amount, pos.market_addr);
                    if (r?.error) {
                      setLocalAlert(r.error);
                      return;
                    }
                    setTpPrice(''); setSlPrice(''); setTpslInputMode('price'); setTpslInitial({ key: null, tp: '', sl: '' }); setExpandedPos(null);
                    if (r?.info) setSuccessMsg(r.info);
                  } catch (e) {
                    setLocalAlert(e?.message || String(e));
                  } finally {
                    setTpslSubmittingPos((current) => current === posKey ? null : current);
                  }
                }}
              />
            )}
          </div>
        );
      })}

      {error && (
        <div style={S.errorBar} onClick={clearError}>
          <span style={S.errorText}>{humanizeTradeError(error, dex)}</span>
        </div>
      )}
    </div>
  );
});

// ==================== BOTTOM PANEL (fullscreen table view) ====================
const BottomPanel = memo(function BottomPanel({
  bottomH, bottomTab, setBottomTab,
  showFilter, setShowFilter, btmFilters, setBtmFilters,
  btmSymbols, sortOptionsForTab, hasActiveFilters,
  filteredPositions, filteredOrders, orders, positions,
  prices, walletAddr, dataReady, leverageSettings,
  closePosition, cancelOrder, dex, loading, historyAccountAddr, markets,
  pendingActions = [], beginPendingClose = () => null, removePendingAction = () => {},
}) {
  const tpslOrders = Array.isArray(orders) ? orders : filteredOrders;
  // Avantis/Flash do not expose funding payments in the trading UI flow.
  const tabs = [
    { id: 'positions', label: `Positions (${filteredPositions.length})` },
    { id: 'orders', label: `Orders (${filteredOrders.length})` },
    ...(dex === 'avantis' || dex === 'flash' ? [] : [
      { id: 'history', label: 'History' },
      { id: 'funding', label: 'Funding' },
    ]),
  ];

  return (
    <div style={{...S.bottomPanel, height: bottomH}}>
      <div style={{...S.bottomTabs, position: 'relative'}}>
        {tabs.map(t => (
          <button key={t.id} style={bottomTab === t.id ? S.bottomTabActive : S.bottomTabBtn} onClick={() => { setBottomTab(t.id); setShowFilter(false); }}>
            {t.label}
          </button>
        ))}
        <button
          style={{...S.filterBtn, ...(hasActiveFilters ? S.filterBtnActive : {})}}
          onClick={() => setShowFilter(v => !v)}
          title="Filters"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46"/></svg>
          {hasActiveFilters && <span style={S.filterDot} />}
        </button>
        <FilterPopup
          visible={showFilter}
          onClose={() => setShowFilter(false)}
          filters={btmFilters}
          onChange={setBtmFilters}
          symbols={btmSymbols}
          showSide={bottomTab !== 'funding' || true}
          sortOptions={sortOptionsForTab}
        />
      </div>
      <div style={S.bottomContent}>
        {bottomTab === 'positions' && (
          filteredPositions.length ? (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Symbol</th><th style={S.th}>Side</th><th style={S.th}>Size</th>
                <th style={S.th}>Entry</th><th style={S.th}>Mark</th><th style={S.th}>PnL</th>
                <th style={S.th}>PnL %</th><th style={S.th}>TP / SL</th><th style={S.th}>Lev</th><th style={S.th}></th>
              </tr></thead>
              <tbody>{filteredPositions.map((p, i) => {
                const {
                  entryP: entryPrice,
                  markP: markPrice,
                  pnlVal,
                  setLev: lev,
                  posValueUsd: tblPosValue,
                  pnlPct,
                  pnlDirection,
                  pnlColor,
                  isDust,
                  dustUsd,
                } = getPositionMetrics(p, prices, leverageSettings);
                const { tp, sl } = getPositionTpsl(p, tpslOrders);
                const pendingClose = pendingActionForPosition(pendingActions, p, 'close');
                return (
                  <tr key={positionStableKey(p) || i} style={S.tr}>
                    <td style={S.td}>{p.symbol}</td>
                    <td style={{...S.td, color: p.side === 'bid' ? '#4CAF50' : '#E53935', fontWeight: 900}}>{p.side === 'bid' ? 'LONG' : 'SHORT'}</td>
                    <td style={S.td}>{isDust ? 'Dust' : p.amount} <span style={{color: '#a3906a', fontSize: 11}}>(${(isDust ? dustUsd : tblPosValue).toFixed(2)})</span></td>
                    <td style={S.td}>${fmtPrice(entryPrice)}</td>
                    <td style={S.td}>{markPrice ? `$${fmtPrice(markPrice)}` : '—'}</td>
                    <td style={{...S.td, color: pnlColor, fontWeight: 900}}>{formatSignedPnlUsd(pnlVal)}</td>
                    <td style={{...S.td, color: pnlColor, fontWeight: 900}}>{isDust ? '-' : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`}</td>
                    <td style={S.td}>
                      <span style={{color: tp ? '#4CAF50' : '#a3906a', fontWeight: 800}}>TP {tp ? `$${fmtPrice(tp)}` : '-'}</span>
                      <span style={{color: '#a3906a'}}> / </span>
                      <span style={{color: sl ? '#E53935' : '#a3906a', fontWeight: 800}}>SL {sl ? `$${fmtPrice(sl)}` : '-'}</span>
                    </td>
                    <td style={S.td}>{isDust ? 'Dust' : formatPositionLeverageBadge(lev)}</td>
                    <td style={S.td}>
                      <button
                        style={{...S.tblCloseBtn, opacity: loading || pendingClose ? 0.5 : 1, cursor: loading || pendingClose ? 'not-allowed' : 'pointer'}}
                        disabled={loading || !!pendingClose}
                        onClick={async () => {
                          const amount = dex === 'avantis' ? p.margin : p.amount;
                          const pending = beginPendingClose(p, amount, true);
                          const result = await closePosition(
                            p.symbol,
                            p.side,
                            amount,
                            p.pair_index,
                            p.trade_index,
                            true,
                            dex === 'flash' ? { position: p, inputUsdUi: String(isDust ? dustUsd : tblPosValue) } : undefined,
                          );
                          if (result?.error && pending?.id) removePendingAction(pending.id);
                        }}
                      >{pendingClose ? <ClosingButtonLabel text="" /> : loading ? <ClosingButtonLabel text="" /> : 'Close'}</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          ) : <div style={{padding: 20, textAlign: 'center', color: '#a3906a'}}>{!dataReady ? 'Loading...' : hasActiveFilters ? 'No positions match filters' : 'No open positions'}</div>
        )}
        {bottomTab === 'orders' && (
          filteredOrders.length ? (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Symbol</th><th style={S.th}>Side</th><th style={S.th}>Type</th>
                <th style={S.th}>Price</th><th style={S.th}>Amount</th><th style={S.th}></th>
              </tr></thead>
              <tbody>{filteredOrders.map((o, i) => {
                const sym = o.symbol || o.s;
                const price = orderDisplayPrice(o);
                const rawAmt = o.initial_amount || o.amount || o.a;
                const amt = parseFloat(rawAmt || 0) > 0 ? rawAmt : 'Full';
                const type = orderDisplayType(o, positions);
                const positionSide = orderPositionSide(o);
                const sideLabel = orderSideLabel(o);
                const isTP = type.includes('TAKE') || type.includes('TP');
                const isSL = type.includes('STOP') || type.includes('SL');
                const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
                const pending = isOrderPendingConfirmation(o);
                const attachedRows = orderAttachedTpslRows(o);
                return (
                  <tr key={orderStableKey(o, i)} style={S.tr}>
                    <td style={S.td}>{sym}</td>
                    <td style={{...S.td, color: positionSide === 'bid' ? '#4CAF50' : '#E53935', fontWeight: 900}}>{sideLabel}</td>
                    <td style={{...S.td, color: typeColor, fontWeight: 700}}>
                      <span style={{display: 'inline-flex', alignItems: 'center', gap: 6}}>
                        {type}
                        {pending ? <OrderPendingBadge /> : null}
                      </span>
                      {attachedRows.length ? <AttachedTpslSummary order={o} compact /> : null}
                    </td>
                    <td style={S.td}>${fmtPrice(price)}</td>
                    <td style={S.td}>{amt}</td>
                    <td style={S.td}>
                      {pending ? (
                        <span style={{color: '#8b7655', fontSize: 11, fontWeight: 800}}>Pending</span>
                      ) : isReadOnlyOrder(o) ? (
                        <span style={{color: '#8b7655', fontSize: 11, fontWeight: 800}}>On position</span>
                      ) : (
                        <button
                          style={S.tblCloseBtn}
                          onClick={() => dex === 'hotstuff'
                            ? cancelOrder(o)
                            : cancelOrder(sym, o.order_id ?? o.i, o.pair_index, o.trade_index)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          ) : <div style={{padding: 20, textAlign: 'center', color: '#a3906a'}}>{!dataReady ? 'Loading...' : hasActiveFilters ? 'No orders match filters' : 'No open orders'}</div>
        )}
        {bottomTab === 'history' && (
          <TradeHistory
            walletAddr={walletAddr}
            accountAddr={historyAccountAddr}
            dex={dex}
            markets={markets}
            filters={btmFilters}
          />
        )}
        {bottomTab === 'funding' && dex !== 'avantis' && dex !== 'flash' && (
          <FundingHistory
            walletAddr={walletAddr}
            accountAddr={historyAccountAddr}
            dex={dex}
            markets={markets}
            filters={btmFilters}
          />
        )}
      </div>
    </div>
  );
});

function FuturesPanel() {
  const { setFuturesOpen } = useSend();
  const { select, wallets, connect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { isInFrame: inFrame } = useFarcaster();
  const { dex } = useDex();
  const evmConnectChain = dex === 'gmx' || dex === 'hyperliquid' || dex === 'ostium'
    ? 'arbitrum'
    : dex === 'hotstuff'
    ? 'mainnet'
    : dex === 'grvt'
    ? 'baseConnect'
    : dex === 'gmtrade' || dex === 'flash'
    ? 'solana'
    : dex === 'katana'
    ? 'katana'
    : dex === 'monad'
    ? 'monad'
    : dex === 'risex'
    ? 'rise'
    : dex === 'nado'
    ? 'ink'
    : dex === 'hibachi'
    ? 'arc'
    : 'base';
  const { enabled: privyEnabled, ready: privyReady, authenticated: privyAuthed, login: privyLogin } = useOptionalPrivy();
  // Per-account UI mode (basic/pro). NULL until the user picks on first
  // entry — we use that to gate the trading UI behind the selection screen.
  const { mode: futuresMode, needsSelection: needsModeSelection } = useFuturesMode();
  const isBasic = futuresMode === 'basic';
  // In Basic mode the user only opens market trades from the wizard, so
  // limit/conditional Orders are not relevant. Hide that tab + redirect if
  // it's somehow active (e.g. Pro→Basic switch while Orders was selected).
  const visibleTabs = useMemo(
    () => isBasic ? TABS.filter(t => t.id !== 'Orders') : TABS,
    [isBasic]
  );
  // Branch on DEX. All four hooks expose the same interface shape so the
  // rest of the panel doesn't have to know which chain it's on:
  //   pacifica → Solana-signed (Privy embedded or external)
  //   avantis  → Base/EVM, self-custody via viem
  //   decibel  → Aptos, self-custody via Petra
  //   gmx      → Arbitrum/EVM, self-custody via viem (Phase 1: read-only)
  const pacificaHook = usePacifica();
  const avantisHook = useAvantis();
  const decibelHook = useDecibel();
  const gmxHook = useGmx();
  const monadHook = useMonad();
  const phoenixHook = usePhoenix();
  const hyperliquidHook = useHyperliquid();
  const risexHook = useRisex();
  const nadoHook = useNado();
  const hibachiHook = useHibachi();
  const hotstuffHook = useHotstuff();
  const grvtHook = useGrvt();
  const katanaHook = useKatana();
  const gmtradeHook = useGmtrade();
  const flashHook = useFlash();
  const lighterHook = useLighter();
  const bulkHook = useBulk();
  const ostiumHook = useOstium();
  // Aptos wallet handle — used for the "Connect Petra" CTA on the Decibel
  // pre-connect screen. Lives outside the trading hooks because the
  // wallet context is shared with future Aptos-using features.
  const aptosWallet = useAptosWallet();
  const trading = dex === 'avantis'
    ? avantisHook
    : dex === 'decibel'
    ? decibelHook
    : dex === 'gmx'
    ? gmxHook
    : dex === 'ostium'
    ? ostiumHook
    : dex === 'monad'
    ? monadHook
    : dex === 'phoenix'
    ? phoenixHook
    : dex === 'hyperliquid'
    ? hyperliquidHook
    : dex === 'risex'
    ? risexHook
    : dex === 'nado'
    ? nadoHook
    : dex === 'hibachi'
    ? hibachiHook
    : dex === 'hotstuff'
    ? hotstuffHook
    : dex === 'grvt'
    ? grvtHook
    : dex === 'katana'
    ? katanaHook
    : dex === 'gmtrade'
    ? gmtradeHook
    : dex === 'flash'
    ? flashHook
    : dex === 'lighter'
    ? lighterHook
    : dex === 'bulk'
    ? bulkHook
    : pacificaHook;
  const {
    walletAddr, account, positions, orders, prices, markets, walletUsdc, spotUsdc, leverageSettings = {}, marginModes = {}, marginModeDetails = {}, dataReady, accountReady,
    connected: tradingConnected,
    loading, error, clearError, goldEarned, clearGoldEarned, depositStatus, walletUsdcStatus,
    bridgeSourceBalances, bridgeSourceBalanceStatus,
    placeMarketOrder, placeLimitOrder, cancelOrder, setLeverage: setLeverageApi,
    closePosition, depositToPacifica, withdraw, activate, disconnect, setTpsl, setMarginMode, moveSpotToPerp, switchToRise, switchToInk,
    oneTapWalletFallback, executeOneTapWalletFallback, clearOneTapWalletFallback,
    // Avantis-only — undefined on the Pacifica branch.
    hasReferrer, linkOurReferrer, oneTapTrading, setOneTapTradingEnabled, connectPerpl, openReferralJoin, approveIntegrator, referralCode, referralUrl, referralTermsUrl, walletMismatch, registeredEvmWallet,
    // Pacifica agent-wallet — undefined on Avantis (Pacifica-only feature)
    pacAgent, bindAgent, bindingAgent, bindAgentError, forgetAgentLocally, revokeAgentOnServer,
    // Decibel-only — drives the blocking activation modal + gate screen.
    // setupVerified is the on-chain verification: null=checking,
    // true=delegation confirmed on-chain, false=needs activation.
    // subaccountAddr lets the gate distinguish "fresh user" (no
    // subaccount yet) from "returning user" (subaccount on-chain but
    // delegation missing — usually after rejecting the delegate step).
    activationStep, isReady, setupVerified, subaccountAddr, gasSponsored, apiWalletAddr, inviteStatus, builderConfig, hotstuffSetupStatus,
    bridgeDepositSourceChainId, setBridgeDepositSourceChainId, bridgeDepositSources,
    lighterNeedsIntegratorApproval, lighterNeedsReferral, lighterReferralChecking, lighterReferralStatus,
    lighterCredentials, detectAccount: detectLighterAccount,
    registerBuilderCode,
    refresh: refreshTrading,
  } = trading;
  const openedSortedPositions = useOpenedSortedPositions(positions);
  const [pendingActions, setPendingActions] = useState([]);
  const displayOrders = Array.isArray(orders) ? orders : [];
  const groupedDisplayOrders = useMemo(
    () => groupOrdersForList(displayOrders, positions),
    [displayOrders, positions],
  );
  const removePendingAction = useCallback((id) => {
    setPendingActions(current => current.filter(action => action.id !== id));
  }, []);
  const beginPendingClose = useCallback((pos, amount, fullClose) => {
    if (dex !== 'ostium') return null;
    const id = `${dex}-close-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const action = {
      id,
      kind: 'close',
      dex,
      phase: 'closing',
      createdAt: Date.now(),
      positionKey: positionStableKey(pos),
      symbol: String(pos?.symbol || pos?.s || '').toUpperCase(),
      side: positionOpenSide(pos),
      startAmount: Math.abs(Number(pos?.amount ?? pos?.size ?? pos?.position ?? 0)),
      closeAmount: Math.abs(Number(amount || 0)),
      fullClose: !!fullClose,
      orders: [],
    };
    setPendingActions(current => [...current.filter(row => !(row.kind === 'close' && row.positionKey === action.positionKey)), action]);
    return { id, options: undefined };
  }, [dex]);
  useEffect(() => {
    if (dex !== 'ostium') {
      setPendingActions([]);
      return;
    }
    const now = Date.now();
    setPendingActions(current => current.filter(action => {
      if (now - Number(action.createdAt || 0) > PENDING_ACTION_TTL_MS) return false;
      if (action.dex && action.dex !== dex) return false;
      if (action.kind === 'close') return !pendingCloseConfirmed(action, positions);
      return true;
    }));
  }, [dex, positions]);
  // The trading hook owns the active signer. Do not treat a detected adapter
  // or a stored player wallet as "connected" unless the hook resolved the
  // address it will actually use for signing.
  const hasWallet = !!walletAddr;
  // Do not interpret the hooks' initial null account as a confirmed $0
  // balance. Hooks with a dedicated accountReady flag keep this pending until
  // the venue account read completes; older hooks fall back to the first
  // account or wallet-USDC snapshot.
  const balanceCheckPending = hasWallet && (
    accountReady === false
    || (account == null && walletUsdc == null)
  );
  const isSolanaDex = dex === 'pacifica' || dex === 'phoenix' || dex === 'gmtrade' || dex === 'flash' || dex === 'bulk';
  const [solanaWalletGrace, setSolanaWalletGrace] = useState(true);
  useEffect(() => {
    if (!isSolanaDex || hasWallet) {
      setSolanaWalletGrace(false);
      return undefined;
    }
    setSolanaWalletGrace(true);
    const timer = setTimeout(() => setSolanaWalletGrace(false), 900);
    return () => clearTimeout(timer);
  }, [isSolanaDex, hasWallet]);
  const openSolanaConnect = useCallback(() => {
    openSolanaWallet({ wallets, select, connect, openWalletModal, inFrame });
  }, [inFrame, wallets, select, connect, openWalletModal]);
  const loginWithPrivyEmail = useCallback(() => {
    if (!privyEnabled) return;
    try { privyLogin({ loginMethods: ['email'] }); }
    catch { privyLogin(); }
  }, [privyEnabled, privyLogin]);
  const renderPrivyEmailButton = useCallback((color, dark) => {
    if (!privyEnabled) return null;
    return (
      <button
        style={{...cartoonBtn(color, dark), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
        onClick={loginWithPrivyEmail}
      >
        <span>{privyAuthed ? 'CONTINUE WITH EMAIL' : 'SIGN IN WITH EMAIL'}</span>
      </button>
    );
  }, [privyEnabled, privyAuthed, loginWithPrivyEmail]);
  const restoringPrivySolana = isSolanaDex && privyEnabled && privyAuthed && !walletAddr;
  const checkingSolanaWallet = isSolanaDex && !hasWallet && !inFrame && (
    (privyEnabled && !privyReady) ||
    (privyEnabled && privyAuthed && solanaWalletGrace)
  );
  const [manualTradingRefreshBusy, setManualTradingRefreshBusy] = useState(false);
  const refreshTradingSnapshot = useCallback(async () => {
    if (manualTradingRefreshBusy) return;
    setManualTradingRefreshBusy(true);
    try {
      const calls = [
        trading?.fetchAccount,
        trading?.fetchPositions,
        trading?.fetchOrders,
        trading?.fetchBalance,
      ]
        .filter(fn => typeof fn === 'function')
        .map(fn => Promise.resolve().then(() => fn()));
      if (calls.length) await Promise.allSettled(calls);
    } finally {
      setManualTradingRefreshBusy(false);
    }
  }, [manualTradingRefreshBusy, trading]);

  const { isMobile } = useLayout();
  // Drag state — ref-based: zero React re-renders during drag, no listener leaks
  const posRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('[data-nodrag]')) return;
    // On mobile, panel is fixed/centered — dragging would just throw layout off.
    if (isMobile) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const startX = clientX - posRef.current.x;
    const startY = clientY - posRef.current.y;

    const onMove = (ev) => {
      const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      posRef.current = { x: moveX - startX, y: moveY - startY };
      if (panelRef.current) {
        panelRef.current.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
      }
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
    };
    setIsDragging(true);
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive: false}); window.addEventListener('touchend', onUp);
  }, [isMobile]);

  const [activeTab, setActiveTab] = useState('Trade');
  const [symbol, setSymbol] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [leverage, setLeverage] = useState(() => leverageSettings[symbol] || 20);
  const [showLeverage, setShowLeverage] = useState(false);
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [orderBookStep, setOrderBookStep] = useState(0.01);
  const [topOfBook, setTopOfBook] = useState({ bid: null, ask: null });
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [tradeIdeaOpen, setTradeIdeaOpen] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [evmModalOpen, setEvmModalOpen] = useState(false);
  const { setExternalProvider: setEvmProvider } = useEvmWallet();
  // Referral banner state. Persists a "don't bug me again" flag in localStorage
  // so users who consciously skipped linking don't see the prompt on every
  // FuturesPanel open. Linking itself updates `hasReferrer=true` (read from
  // the chain) which auto-hides the banner without needing the dismiss flag.
  // Referral-banner dismissal is PER-WALLET. Previously a single global
  // key meant: dismiss on wallet A → banner never reappears when user
  // switches to wallet B (unlinked). Each wallet gets its own dismissal.
  const referralDismissKey = useMemo(
    () => walletAddr ? `clash_${dex}_ref_dismissed:${String(walletAddr).toLowerCase()}` : null,
    [dex, walletAddr]
  );
  const [referralDismissed, setReferralDismissed] = useState(false);
  // Load dismissal state for the CURRENT wallet. Resets when wallet changes
  // so a fresh wallet sees the banner even if the previous one dismissed it.
  useEffect(() => {
    if (!referralDismissKey) { setReferralDismissed(false); return; }
    try {
      setReferralDismissed(localStorage.getItem(referralDismissKey) === '1');
    } catch { setReferralDismissed(false); }
  }, [referralDismissKey]);
  const [referralLinking, setReferralLinking] = useState(false);
  const [pacificaAgentToggling, setPacificaAgentToggling] = useState(false);
  const handleLinkReferrer = useCallback(async () => {
    if (!linkOurReferrer || referralLinking) return;
    setReferralLinking(true);
    setLocalAlert(null);
    try {
      const result = await linkOurReferrer();
      if (result?.error) setLocalAlert(result.error);
      else if (dex === 'nado') {
        setSuccessMsg(result?.already_linked
          ? 'This Nado wallet already has a referral.'
          : `Nado referral ${referralCode || '13z8hnl'} confirmed.`);
      }
      return result;
    } finally {
      setReferralLinking(false);
    }
  }, [dex, linkOurReferrer, referralCode, referralLinking]);
  const handleDismissReferral = useCallback(() => {
    setReferralDismissed(true);
    if (referralDismissKey) {
      try { localStorage.setItem(referralDismissKey, '1'); } catch { /* storage disabled */ }
    }
  }, [referralDismissKey]);
  // Avantis: referral linkage banner. Decibel: builder-fee approval banner.
  // Avantis: referral linkage banner. Decibel runs its full activation
  // through the dedicated gate screen (see DECIBEL ACTIVATE GATE below)
  // — that flow already covers builder-fee approval, so the banner is
  // redundant for Decibel and was only showing because `builderApproved`
  // can stay false after a partial activation. Keep the banner for
  // Avantis only.
  const showReferralBanner =
    (dex === 'hyperliquid' || dex === 'nado')
    && !!walletAddr && hasReferrer === false && !referralDismissed;
  const handleEvmConnected = useCallback(({ address, walletName, provider, rdns }) => {
    setEvmModalOpen(false);
    if (!provider || !address) return;
    // Guard: if the player is already authenticated on a non-Avantis DEX
    // (e.g. Pacifica with a Solana wallet) we refuse to stamp a new EVM
    // wallet into EvmWalletContext from this panel. Doing so would leave
    // EvmWalletContext polluted with a wallet that doesn't match the
    // active session; on the next DEX switch (or auth reset) the stored
    // rdns would silent-reconnect and the refactored auth flow would pick
    // it as the Avantis candidate — effectively re-registering the user
    // under a wallet they only ever used to peek at the orderbook.
    // The legitimate use case (connecting an Avantis wallet from the
    // FuturesPanel) is still allowed: dex === 'avantis'.
    if (dex !== 'avantis' && dex !== 'gmx' && dex !== 'ostium' && dex !== 'monad' && dex !== 'hyperliquid' && dex !== 'risex' && dex !== 'nado' && dex !== 'hibachi' && dex !== 'hotstuff' && dex !== 'grvt') {
      console.warn('[futures] Ignoring EVM connect: active DEX is', dex);
      return;
    }
    setEvmProvider(provider, address, rdns, 'external');
    void walletName;
  }, [dex, setEvmProvider]);
  const elfaSignals = useElfaSignals();
  // Local validation-error state. `error` from the trading hook covers
  // on-chain / RPC errors; `localAlert` covers client-side validation
  // (min-notional, missing amount, partial-close dust etc.) so we don't
  // need blocking `alert()` popups on mobile. Cleared on next trade attempt
  // OR when the user clicks the error bar.
  const [localAlert, setLocalAlert] = useState(null);
  useEffect(() => {
    if (!localAlert) return;
    const t = setTimeout(() => setLocalAlert(null), 6000);
    return () => clearTimeout(t);
  }, [localAlert]);
  const panelAlert = localAlert || error || null;
  const closePanelAlert = useCallback(() => {
    setLocalAlert(null);
    if (error && typeof clearError === 'function') clearError();
  }, [clearError, error]);
  const [flashFundingProgress, setFlashFundingProgress] = useState(null);
  const updateFlashFundingProgress = useCallback((event = {}) => {
    setFlashFundingProgress(prev => {
      const stepId = event.step || prev?.currentStep || 'prepare';
      const steps = { ...(prev?.steps || {}) };
      if (FLASH_FUNDING_STEPS.some(step => step.id === stepId)) {
        steps[stepId] = {
          ...(steps[stepId] || {}),
          status: event.status || steps[stepId]?.status || 'active',
          label: event.label || steps[stepId]?.label,
          hint: event.hint || steps[stepId]?.hint,
          signature: event.signature || steps[stepId]?.signature || '',
          skipped: event.skipped ?? steps[stepId]?.skipped ?? false,
        };
      }
      return {
        ...(prev || {}),
        open: true,
        amount: event.amount || prev?.amount || '',
        currentStep: stepId,
        status: event.status || prev?.status || 'active',
        label: event.label || prev?.label || '',
        hint: event.hint || prev?.hint || '',
        error: event.error || prev?.error || '',
        completed: event.step === 'complete' || prev?.completed || false,
        steps,
      };
    });
  }, []);
  const closeFlashFundingProgress = useCallback(() => {
    setFlashFundingProgress(null);
  }, []);
  useEffect(() => {
    if (dex !== 'flash') setFlashFundingProgress(null);
  }, [dex]);
  // Success toast after a trade completes. Small green banner that auto-hides.
  const [successMsg, setSuccessMsg] = useState(null);
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(t);
  }, [successMsg]);
  const clearTradeFeedback = useCallback(() => {
    setLocalAlert(null);
    setSuccessMsg(null);
    if (error && clearError) clearError();
  }, [clearError, error]);
  const handleOstiumWalletFallback = useCallback(async () => {
    if (dex !== 'ostium' || typeof executeOneTapWalletFallback !== 'function') return;
    const result = await executeOneTapWalletFallback();
    if (result?.error) {
      setLocalAlert(result.error);
      return;
    }
    setSuccessMsg('Wallet close submitted.');
  }, [dex, executeOneTapWalletFallback]);
  const handleToggleOneTapTrading = useCallback(async () => {
    if (dex !== 'hyperliquid' && dex !== 'nado' && dex !== 'katana' && dex !== 'flash' && dex !== 'ostium') return;
    const dexLabel = dex === 'nado'
      ? 'Nado'
      : dex === 'katana'
        ? 'Katana'
        : dex === 'flash'
          ? 'Flash'
          : dex === 'ostium'
            ? 'Ostium'
            : 'Hyperliquid';
    if (oneTapTrading?.enabled) {
      const result = typeof setOneTapTradingEnabled === 'function'
        ? await setOneTapTradingEnabled(false)
        : null;
      if (result?.error) {
        setLocalAlert(result.error);
        return;
      }
      setSuccessMsg(`One tap trading disabled. Opening a ${dexLabel} order will ask to enable it again.`);
      return;
    }
    if (dex === 'katana' || dex === 'flash' || dex === 'ostium') {
      setReferralLinking(true);
      try {
        const result = typeof setOneTapTradingEnabled === 'function'
          ? await setOneTapTradingEnabled(true)
          : null;
        if (result?.error) setLocalAlert(result.error);
        else setSuccessMsg(`${dexLabel} one tap trading enabled.`);
      } finally {
        setReferralLinking(false);
      }
      return;
    }
    if (!linkOurReferrer || referralLinking) {
      if (typeof setOneTapTradingEnabled === 'function') setOneTapTradingEnabled(true);
      return;
    }
    setReferralLinking(true);
    try {
      const result = await linkOurReferrer();
      if (result?.error) setLocalAlert(result.error);
      else setSuccessMsg('One tap trading enabled.');
    } finally {
      setReferralLinking(false);
    }
  }, [dex, oneTapTrading?.enabled, setOneTapTradingEnabled, linkOurReferrer, referralLinking]);
  const handleTogglePacificaOneTap = useCallback(async () => {
    if (dex !== 'pacifica' || pacificaAgentToggling) return;
    clearTradeFeedback();
    if (pacAgent) {
      setPacificaAgentToggling(true);
      try {
        if (typeof revokeAgentOnServer === 'function') await revokeAgentOnServer();
        else if (typeof forgetAgentLocally === 'function') forgetAgentLocally();
        setSuccessMsg('Pacifica one tap trading disabled.');
      } catch (e) {
        setLocalAlert(e?.message || 'Failed to disable Pacifica one tap trading.');
      } finally {
        setPacificaAgentToggling(false);
      }
      return;
    }
    if (!bindAgent || bindingAgent) return;
    setPacificaAgentToggling(true);
    try {
      const bound = await bindAgent();
      if (bound || pacAgent) setSuccessMsg('Pacifica one tap trading enabled.');
      else setLocalAlert('1-tap trading is still enabling. Try again in a moment.');
    } catch (e) {
      setLocalAlert(e?.message || PACIFICA_AGENT_REQUIRED_MESSAGE);
    } finally {
      setPacificaAgentToggling(false);
    }
  }, [bindAgent, bindingAgent, clearTradeFeedback, dex, forgetAgentLocally, pacAgent, pacificaAgentToggling, revokeAgentOnServer]);
  // Pending-tx state for LONG/SHORT buttons, including pre-wallet prep time.
  const [tradePhase, setTradePhase] = useState(null); // 'preparing' | 'signing' | 'confirming' | null
  const [tradeBusy, setTradeBusy] = useState(false);
  const [amountInUsdc, setAmountInUsdc] = useState(true);
  const [sizePct, setSizePct] = useState(0);
  const [depositAmt, setDepositAmt] = useState('');
  const [nadoDepositAsset, setNadoDepositAsset] = useState('usdt0');
  const [perplAccessCode, setPerplAccessCode] = useState('');
  const [phoenixInviteCode, setPhoenixInviteCode] = useState(PHOENIX_DEFAULT_REFERRAL_CODE);
  const phoenixInviteKind = 'referral';
  const [risexInviteCode, setRisexInviteCode] = useState('');
  const [grvtApiKeyInput, setGrvtApiKeyInput] = useState('');
  const [katanaApiKeyInput, setKatanaApiKeyInput] = useState('');
  const [katanaApiSecretInput, setKatanaApiSecretInput] = useState('');
  const [lighterAccountIndexInput, setLighterAccountIndexInput] = useState('');
  const [lighterApiKeyIndexInput, setLighterApiKeyIndexInput] = useState('');
  const [lighterApiPrivateKeyInput, setLighterApiPrivateKeyInput] = useState('');
  const [lighterAccountDetectStatus, setLighterAccountDetectStatus] = useState('');
  const [lighterCredentialFormOpen, setLighterCredentialFormOpen] = useState(false);
  const [hibachiApiKeyInput, setHibachiApiKeyInput] = useState('');
  const [hibachiAccountIdInput, setHibachiAccountIdInput] = useState('');
  const [hibachiPrivateKeyInput, setHibachiPrivateKeyInput] = useState('');
  const [grvtAccountModalOpen, setGrvtAccountModalOpen] = useState(false);
  const [grvtAccountOneTap, setGrvtAccountOneTap] = useState(false);
  const [grvtPrivateKeyInput, setGrvtPrivateKeyInput] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [withdrawTo, setWithdrawTo] = useState('');
  const [fullscreen, setFullscreen] = useState(window.innerWidth < 600);

  useEffect(() => {
    if (dex !== 'lighter') return undefined;
    if (setupVerified === true || lighterCredentials?.accountIndex != null) return undefined;
    if (!hasWallet || !/^0x[a-fA-F0-9]{40}$/.test(String(walletAddr || ''))) return undefined;
    if (lighterAccountIndexInput.trim()) return undefined;
    if (typeof detectLighterAccount !== 'function') return undefined;
    let cancelled = false;
    setLighterAccountDetectStatus('checking');
    detectLighterAccount(walletAddr)
      .then((result) => {
        if (cancelled) return;
        if (result?.found && Number.isInteger(Number(result.accountIndex))) {
          setLighterAccountIndexInput(String(result.accountIndex));
          setLighterAccountDetectStatus('found');
        } else {
          setLighterAccountDetectStatus('not_found');
        }
      })
      .catch(() => {
        if (!cancelled) setLighterAccountDetectStatus('error');
      });
    return () => { cancelled = true; };
  }, [detectLighterAccount, dex, hasWallet, lighterAccountIndexInput, lighterCredentials?.accountIndex, setupVerified, walletAddr]);

  // Share-trade modal — opened only on demand via the share button next to
  // open positions. Closing a trade should not interrupt the flow with an
  // automatic image prompt.
  // Holds a SNAPSHOT of the position because the live `positions` array
  // mutates the moment the close confirms, before the user has a chance
  // to share.
  const [shareTrade, setShareTrade] = useState(null);
  const [bottomTab, setBottomTab] = useState('positions');
  const [expandedPos, setExpandedPos] = useState(null);
  const [closePct, setClosePct] = useState(100);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [tpslInputMode, setTpslInputMode] = useState('price');
  const [tpslInitial, setTpslInitial] = useState({ key: null, tp: '', sl: '' });
  const [tpslSubmittingPos, setTpslSubmittingPos] = useState(null);
  const [openTpslEnabled, setOpenTpslEnabled] = useState(false);
  const [openTpslMode, setOpenTpslMode] = useState('price');
  const [openTpslPreviewSide, setOpenTpslPreviewSide] = useState('bid');
  const [openTpPrice, setOpenTpPrice] = useState('');
  const [openSlPrice, setOpenSlPrice] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const defaultFilters = { symbol: 'All', side: 'All', sortBy: 'time', sortDir: 'desc' };
  const [btmFilters, setBtmFilters] = useState(defaultFilters);

  // Resizable panel sizes (percentages / pixels)
  const [bottomH, setBottomH] = useState(160);
  const [obWidth, setObWidth] = useState(160);
  const [chartPct, setChartPct] = useState(55);

  const bottomHRef = useRef(bottomH);
  bottomHRef.current = bottomH;
  const obWidthRef = useRef(obWidth);
  obWidthRef.current = obWidth;

  const clampBottomHeight = useCallback((height) => {
    const body = panelRef.current?.querySelector?.('.futures-panel-body');
    const availableH = body?.clientHeight || panelRef.current?.clientHeight || window.innerHeight;
    const minTopH = window.innerWidth < 900 ? 180 : 220;
    const maxBottomH = Math.max(90, Math.min(500, availableH - minTopH));
    return Math.max(60, Math.min(maxBottomH, height));
  }, []);

  const dragBottom = useCallback((e) => {
    const startY = e.touches ? e.touches[0].clientY : e.clientY;
    const startH = bottomHRef.current;
    const onMove = (ev) => {
      const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      ev.preventDefault?.();
      setBottomH(clampBottomHeight(startH - (moveY - startY)));
    };
    const onUp = () => { 
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); 
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
      document.body.style.cursor = ''; document.body.style.userSelect = ''; 
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive: false}); window.addEventListener('touchend', onUp);
  }, [clampBottomHeight]);

  const dragOb = useCallback((e) => {
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    const startW = obWidthRef.current;
    const onMove = (ev) => {
      const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      setObWidth(Math.max(80, Math.min(350, startW + (moveX - startX))));
    };
    const onUp = () => { 
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); 
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
      document.body.style.cursor = ''; document.body.style.userSelect = ''; 
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive: false}); window.addEventListener('touchend', onUp);
  }, []);

  const dragChart = useCallback((e) => {
    const onMove = (ev) => {
      const container = panelRef.current;
      if (!container) return;
      const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const rect = container.getBoundingClientRect();
      const pct = ((moveX - rect.left) / rect.width) * 100;
      setChartPct(Math.max(20, Math.min(70, pct)));
    };
    const onUp = () => { 
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); 
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
      document.body.style.cursor = ''; document.body.style.userSelect = ''; 
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive: false}); window.addEventListener('touchend', onUp);
  }, []);

  const handleClose = useCallback(() => setFuturesOpen(false), [setFuturesOpen]);

  // Cleanup leverage debounce timer on unmount
  useEffect(() => () => clearTimeout(levTimerRef.current), []);

  // On symbol change ONLY: clear stale input so the user doesn't accidentally
  // fire an order sized for the previous pair, and clamp the carried-over
  // leverage to the new pair's cap. We deliberately do NOT depend on
  // leverageSettings here — that object gets a fresh reference on every
  // fetchAccount (every ~5s), which was resetting the slider mid-drag.
  const prevSymbolRef = useRef(symbol);
  useEffect(() => {
    if (prevSymbolRef.current === symbol) return;
    prevSymbolRef.current = symbol;
    setAmount('');
    setSizePct(0);
    const serverLev = leverageSettings[symbol];
    if (serverLev) setLeverage(serverLev);
    else setLeverage(lev => Math.min(lev, Number(maxLev) || 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const currentPrice = useMemo(() => {
    const priceRow = prices.find(p => p.symbol === symbol);
    const marketRow = markets.find(m => m.symbol === symbol);
    return firstFinite(
      priceRow?.mark,
      priceRow?.mid,
      priceRow?.price,
      priceRow?.last_price,
      priceRow?.lastPrice,
      priceRow?.oracle,
      marketRow?._mark,
      marketRow?.mark,
      marketRow?.mid,
      marketRow?.price,
      marketRow?.last_price,
      marketRow?.lastPrice,
      marketRow?.index_price,
      marketRow?.last_trade_price,
      marketRow?._raw?.mark_price,
      marketRow?._raw?.index_price,
      marketRow?._raw?.last_price,
      marketRow?._raw?.last_trade_price,
    ) || null;
  }, [prices, markets, symbol]);

  const maxLev = useMemo(() => {
    const raw = markets.find(m => m.symbol === symbol)?.max_leverage;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 100;
  }, [markets, symbol]);
  useEffect(() => {
    setLeverage((lev) => {
      const current = Number(lev) || 1;
      return current > maxLev ? maxLev : current;
    });
  }, [maxLev]);

  // Trader-facing balance for the Pro panel slider / max-size calc / deposit
  // CTA. Each DEX exposes the field under a different name; keep the legacy
  // `pacBalance` identifier so the rest of the file doesn't have to change.
  //
  // Pacifica uses UNIFIED MARGIN, where:
  //   balance            = raw deposited collateral, can go negative once an
  //                        open losing position eats more than the deposit
  //                        (the position itself still has equity backing it,
  //                        so the account isn't liquidated yet).
  //   account_equity     = balance + unrealized PnL (true account value).
  //   available_to_spend = free collateral for opening NEW positions (>= 0).
  //
  // Showing raw `balance` was the bug — when a user had an open position in
  // drawdown they'd see a negative USDC number even though their actual
  // account value (equity) was still positive. We now route sizing/slider
  // math off `available_to_spend` (the only meaningful "buying power" in
  // unified margin) and use `account_equity` for the displayed value.
  //   Decibel  → `usdc_cross_withdrawable_balance` (free margin, REST)
  //   Avantis  → `usdcAvailable` / `usdc` (wallet USDC, no unified margin)
  const hlSpotAvailable = dex === 'hyperliquid'
    ? Math.max(0, Number(account?.spot_usdc_available ?? account?.spot_usdc_balance ?? 0))
    : 0;
  const hlUnifiedAccount = dex === 'hyperliquid'
    && (account?.abstraction_mode === 'unifiedAccount' || account?.abstraction_mode === 'portfolioMargin' || account?.is_unified_account === true);
  const freeMarginValue = account?.available_to_spend ?? account?.free_margin ?? account?.availableToSpend;
  const pacBalanceBase = Math.max(0, parseFloat(
    dex === 'flash'
      ? (freeMarginValue ?? 0)
      : (account?.available_to_spend            // Pacifica unified margin (preferred)
        ?? account?.free_margin
        ?? account?.usdc_cross_withdrawable_balance // Decibel
        ?? account?.usdcAvailable                   // Avantis variant
        ?? account?.usdc_balance                    // Ostium self-custody wallet balance
        ?? account?.usdc                            // GMX
        ?? account?.balance                         // last-resort
        ?? 0)
  ));
  const pacBalance = dex === 'gmtrade'
    ? Math.max(0, Number(walletUsdc || 0))
    : dex === 'ostium'
    ? Math.max(0, Number(account?.usdc_balance ?? walletUsdc ?? 0))
    : dex === 'hyperliquid'
    ? pacBalanceBase + (hlUnifiedAccount ? 0 : hlSpotAvailable)
    : pacBalanceBase;
  // Mark-to-market portfolio value. Used for the displayed "balance" number
  // and the no-funds deposit CTA gate so a losing trade doesn't make the UI
  // claim the account has $0 (and pop the deposit prompt) when the position
  // still has equity.
  const pacAccountValueBase = Math.max(0, parseFloat(
    account?.account_equity                // Pacifica unified
      ?? account?.perp_equity_balance      // Decibel
      ?? account?.equity                   // Ostium margin summary when positions exist
      ?? account?.usdc_balance             // Ostium self-custody wallet balance
      ?? account?.usdc                     // GMX (acts as equity for cross-margin spec)
      ?? account?.usdcAvailable            // Avantis fallback
      ?? account?.balance                  // last-resort
      ?? 0
  ));
  const pacAccountValue = dex === 'gmtrade'
    ? Math.max(0, Number(account?.account_equity ?? account?.balance ?? walletUsdc ?? 0))
    : dex === 'ostium'
    ? Math.max(0, Number(account?.equity ?? account?.usdc_balance ?? walletUsdc ?? 0))
    : dex === 'hyperliquid'
    ? pacAccountValueBase + (hlUnifiedAccount ? 0 : hlSpotAvailable)
    : pacAccountValueBase;
  // Free collateral is part of account value. Some exchange snapshots omit
  // equity while still returning available margin, so keep the header total
  // internally consistent until the complete snapshot arrives.
  const headerAccountValue = Math.max(pacAccountValue, pacBalance);
  const currentMarket = useMemo(() => markets.find(m => m.symbol === symbol || marketDisplaySymbol(m) === symbol), [markets, symbol]);
  const currentMarginDetail = marginModeDetails?.[symbol] || currentMarket?.margin_capabilities || {};
  const currentMarginModes = Array.isArray(currentMarket?.margin_modes)
    ? currentMarket.margin_modes
    : Array.isArray(currentMarginDetail?.margin_modes)
    ? currentMarginDetail.margin_modes
    : (currentMarket?.isolated_only ? ['isolated'] : ['cross', 'isolated']);
  const phoenixSupportsCross = dex !== 'phoenix' || currentMarginModes.includes('cross') || currentMarket?.supports_cross_margin === true;
  const phoenixSupportsIsolated = dex !== 'phoenix' || currentMarginModes.includes('isolated') || currentMarket?.supports_isolated_margin === true;
  const phoenixCanToggleMargin = dex === 'phoenix' && phoenixSupportsCross && phoenixSupportsIsolated;
  const phoenixMarginModeReadOnly = dex === 'phoenix' && !phoenixCanToggleMargin;
  const flashMarketBlockReason = dex === 'flash' ? flashMarketClosedReason(currentMarket) : '';
  const fr = currentMarket ? parseFloat(currentMarket.funding_rate || 0) : 0;
  const ostiumLongRolloverPct = dex === 'ostium'
    ? Number(currentMarket?.rollover_rate_long_pct ?? fr * 100)
    : null;
  const ostiumShortRolloverPct = dex === 'ostium'
    ? Number(currentMarket?.rollover_rate_short_pct ?? Number(currentMarket?.next_funding_rate || 0) * 100)
    : null;
  const hasOstiumRollover = dex === 'ostium'
    && Number.isFinite(ostiumLongRolloverPct)
    && Number.isFinite(ostiumShortRolloverPct);
  const formatRatePct = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return `${n >= 0 ? '+' : ''}${n.toFixed(4)}%`;
  };
  // Avantis doesn't have a signed funding rate — the number here is the
  // borrow-fee % per hour traders pay LPs. Relabel the badge so users
  // don't read it as the Pacifica-style signed periodic funding rate.
  const fundingLabel = dex === 'ostium' ? 'NET L/S 8h' : dex === 'avantis' ? 'BORROW/h' : dex === 'flash' ? 'MARGIN/h' : 'FUNDING';
  const fundingText = hasOstiumRollover
    ? `${formatRatePct(ostiumLongRolloverPct)} / ${formatRatePct(ostiumShortRolloverPct)}`
    : `${fr >= 0 ? '+' : ''}${(fr * 100).toFixed(4)}%`;
  const fundingOverlayLabel = hasOstiumRollover ? '' : fundingLabel;
  const fundingOverlayText = hasOstiumRollover
    ? `${formatRatePct(ostiumLongRolloverPct)}/${formatRatePct(ostiumShortRolloverPct)}`
    : fundingText;
  const fundingColor = hasOstiumRollover
    ? '#5C3A21'
    : (fr >= 0 ? '#4CAF50' : '#E53935');

  // Convert USDC amount to token amount, rounded to lot size
  const lotSize = useMemo(() => {
    return markets.find(m => m.symbol === symbol)?.lot_size || '0.00001';
  }, [markets, symbol]);
  const orderSizingPrice = useMemo(() => {
    if (orderType === 'limit' && Number(limitPrice) > 0) return Number(limitPrice);
    return Number(currentPrice) || 0;
  }, [orderType, limitPrice, currentPrice]);
  const midPriceValue = useMemo(() => {
    const bid = Number(topOfBook.bid);
    const ask = Number(topOfBook.ask);
    if (Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0) return (bid + ask) / 2;
    const fallback = Number(currentPrice);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }, [currentPrice, topOfBook.ask, topOfBook.bid]);
  const applyMidPrice = useCallback(() => {
    if (!(midPriceValue > 0)) return;
    clearTradeFeedback();
    setOrderType('limit');
    setLimitPrice(formatLimitInputPrice(midPriceValue));
  }, [clearTradeFeedback, midPriceValue]);
  const pacificaTakerFeeRate = useMemo(() => {
    const fee = Number(account?.taker_fee);
    return Number.isFinite(fee) && fee > 0 ? fee : PACIFICA_DEFAULT_TAKER_FEE_RATE;
  }, [account?.taker_fee]);
  const phoenixTakerFeeRate = useMemo(() => {
    const fee = Number(account?.taker_fee);
    return Number.isFinite(fee) && fee > 0 ? fee : PHOENIX_DEFAULT_TAKER_FEE_RATE;
  }, [account?.taker_fee]);
  const hotstuffTakerFeeRate = useMemo(() => {
    const fee = Number(account?.taker_fee);
    return Number.isFinite(fee) && fee > 0 ? fee : HOTSTUFF_DEFAULT_TAKER_FEE_RATE;
  }, [account?.taker_fee]);
  const phoenixMaxMargin = useMemo(() => (
    dex === 'phoenix'
      ? floorUsdCents(phoenixUsableMargin({
          balance: pacBalance,
          leverage,
          orderType,
          takerFeeRate: phoenixTakerFeeRate,
        }))
      : pacBalance
  ), [dex, pacBalance, leverage, orderType, phoenixTakerFeeRate]);
  const pacificaMaxMargin = useMemo(() => (
    dex === 'pacifica'
      ? pacificaUsableMargin({ balance: pacBalance })
      : pacBalance
  ), [dex, pacBalance]);
  const ostiumMaxMargin = useMemo(() => (
    dex === 'ostium'
      ? Math.max(0, pacBalance - OSTIUM_ORACLE_FEE_BUFFER_USD)
      : pacBalance
  ), [dex, pacBalance]);
  const hotstuffMaxMargin = useMemo(() => (
    dex === 'hotstuff'
      ? floorUsdCents(hotstuffUsableMargin({
          balance: pacBalance,
          leverage,
          orderType,
          takerFeeRate: hotstuffTakerFeeRate,
        }))
      : pacBalance
  ), [dex, pacBalance, leverage, orderType, hotstuffTakerFeeRate]);
  const flashMaxMargin = useMemo(() => (
    dex === 'flash' ? floorUsdCents(pacBalance) : pacBalance
  ), [dex, pacBalance]);
  const sizePctMarginBase = dex === 'phoenix'
    ? phoenixMaxMargin
    : dex === 'pacifica'
    ? pacificaMaxMargin
    : dex === 'ostium'
    ? ostiumMaxMargin
    : dex === 'hotstuff'
    ? hotstuffMaxMargin
    : dex === 'flash'
    ? flashMaxMargin
    : pacBalance;

  // UX semantics (updated 2026-04):
  //   amount (USDC mode) = MARGIN / collateral the user deposits per trade.
  //   position size      = amount × leverage. Displayed separately so the
  //                        trader always sees what they're risking vs the
  //                        leveraged exposure — no more "did 20 mean $20
  //                        margin or $20 notional?" ambiguity.
  //   amount (token mode) = direct token quantity (no leverage applied here;
  //                         the pair's qty itself is the exposure).
  const tokenAmount = useMemo(() => {
    const sizingPx = Number(
      dex === 'phoenix' && orderType === 'limit'
        ? (Number(currentPrice) || orderSizingPrice)
        : (orderSizingPrice || currentPrice)
    );
    if (!amount || !(sizingPx > 0)) return '';
    if (!amountInUsdc) return amount;
    // Token qty = leveraged position / price. Previously this treated the
    // amount as notional (no × leverage), so it mis-sized trades.
    const raw = dex === 'pacifica'
      ? pacificaQtyFromMargin({
          margin: amount,
          price: sizingPx,
          leverage,
          orderType,
          takerFeeRate: pacificaTakerFeeRate,
        })
      : (parseFloat(amount) * leverage) / sizingPx;
    const lot = parseFloat(lotSize);
    if (!Number.isFinite(lot) || lot <= 0) return String(raw);
    return String(Math.floor(raw / lot) * lot);
  }, [amount, currentPrice, amountInUsdc, lotSize, leverage, dex, orderSizingPrice, orderType, pacificaTakerFeeRate]);

  // Derived display: position size in USDC (margin × leverage). Kept as a
  // number so callers can format or gate on it without re-parsing.
  const positionUsdc = useMemo(() => {
    if (amountInUsdc) {
      if (dex === 'pacifica' || dex === 'nado') {
        const t = parseFloat(tokenAmount);
        const p = parseFloat(orderSizingPrice || currentPrice);
        return Number.isFinite(t) && Number.isFinite(p) && t > 0 && p > 0 ? t * p : 0;
      }
      const m = parseFloat(amount);
      return Number.isFinite(m) && m > 0 ? m * leverage : 0;
    }
    const t = parseFloat(tokenAmount);
    const p = parseFloat(orderSizingPrice || currentPrice);
    return Number.isFinite(t) && Number.isFinite(p) && t > 0 && p > 0 ? t * p : 0;
  }, [amount, amountInUsdc, leverage, tokenAmount, currentPrice, orderSizingPrice, dex]);

  // Buying power = max possible position size = balance × leverage.
  const makeOpenTpslPosition = useCallback((sideForPosition) => {
    const entry = Number(orderSizingPrice || currentPrice) || 0;
    const baseAmount = Number(tokenAmount) > 0
      ? Number(tokenAmount)
      : (entry > 0 && Number(positionUsdc) > 0 ? Number(positionUsdc) / entry : 0);
    const margin = Number(amountInUsdc ? amount : (Number(leverage) > 0 ? Number(positionUsdc) / Number(leverage) : 0)) || 0;
    return {
      symbol,
      side: sideForPosition,
      entry_price: entry,
      mark_price: entry,
      price: entry,
      amount: baseAmount,
      margin,
      leverage,
      size_usd: Number(positionUsdc) || 0,
      notional_usd: Number(positionUsdc) || 0,
    };
  }, [amount, amountInUsdc, currentPrice, leverage, orderSizingPrice, positionUsdc, symbol, tokenAmount]);

  const makeOpenTpslMetrics = useCallback((pos) => ({
    entryP: Number(pos?.entry_price || 0),
    markP: Number(pos?.mark_price || pos?.entry_price || 0),
    amt: Number(pos?.amount || 0),
    margin: Number(pos?.margin || 0),
    setLev: Number(pos?.leverage || leverage || 1),
    posValueUsd: Number(pos?.size_usd || positionUsdc || 0),
  }), [leverage, positionUsdc]);

  const openTpslPreviewPos = useMemo(
    () => makeOpenTpslPosition(openTpslPreviewSide),
    [makeOpenTpslPosition, openTpslPreviewSide]
  );
  const openTpslPreviewMetrics = useMemo(
    () => makeOpenTpslMetrics(openTpslPreviewPos),
    [makeOpenTpslMetrics, openTpslPreviewPos]
  );

  const resolveOpenTpslForSide = useCallback((sideForPosition) => {
    const hasAnyInput = String(openTpPrice || '').trim() !== '' || String(openSlPrice || '').trim() !== '';
    if (!openTpslEnabled || !hasAnyInput) {
      return { ok: true, hasTpsl: false, options: {} };
    }
    const pos = makeOpenTpslPosition(sideForPosition);
    const metrics = makeOpenTpslMetrics(pos);
    if (!(Number(pos.entry_price) > 0)) {
      setLocalAlert(orderType === 'limit' ? 'Enter a valid limit price before attaching TP/SL.' : 'Price feed unavailable. Try again in a moment.');
      return { ok: false };
    }
    if (!(Number(pos.amount) > 0)) {
      setLocalAlert('Enter a valid amount before attaching TP/SL.');
      return { ok: false };
    }
    const tpSubmit = tpslSubmitValue({ pos, metrics, leg: 'tp', mode: openTpslMode, value: openTpPrice, initialValue: '' });
    const slSubmit = tpslSubmitValue({ pos, metrics, leg: 'sl', mode: openTpslMode, value: openSlPrice, initialValue: '' });
    if (tpSubmit.error || slSubmit.error) {
      setLocalAlert(tpSubmit.error || slSubmit.error);
      return { ok: false };
    }
    const takeProfit = tpSubmit.value || null;
    const stopLoss = slSubmit.value || null;
    if (!takeProfit && !stopLoss) {
      return { ok: true, hasTpsl: false, options: {} };
    }
    if (!validateTpslBeforeSubmit({ dex, pos, tpPrice: takeProfit || '', slPrice: stopLoss || '', setLocalAlert })) {
      return { ok: false };
    }
    return {
      ok: true,
      hasTpsl: true,
      pos,
      metrics,
      takeProfit,
      stopLoss,
      amountBase: String(pos.amount),
      options: {
        attached_tpsl: true,
        take_profit: takeProfit || undefined,
        stop_loss: stopLoss || undefined,
        takeProfit: takeProfit || undefined,
        stopLoss: stopLoss || undefined,
        tp: takeProfit || undefined,
        sl: stopLoss || undefined,
        tpsl_input_mode: openTpslMode,
      },
    };
  }, [dex, makeOpenTpslMetrics, makeOpenTpslPosition, openSlPrice, openTpPrice, openTpslEnabled, openTpslMode, orderType, setLocalAlert]);

  const maxUsdc = sizePctMarginBase * leverage;
  const hasCurrentSymbolPosition = useMemo(
    () => positions.some(p => String(p.symbol || p.s || '').toUpperCase() === symbol.toUpperCase()),
    [positions, symbol]
  );
  const hasCurrentSymbolOrder = useMemo(
    () => orders.some(o => String(o.symbol || o.s || '').toUpperCase() === symbol.toUpperCase()),
    [orders, symbol]
  );
  const marginModeLocked = ((dex === 'pacifica' || dex === 'grvt' || dex === 'hotstuff') && (hasCurrentSymbolPosition || hasCurrentSymbolOrder))
    || phoenixMarginModeReadOnly;
  const ostiumMarketBlockReason = dex === 'ostium'
    ? ostiumOpenTradeBlockReason(currentMarket, leverage)
    : '';
  const ostiumMarketBlockMessage = ostiumMarketBlockReason
    ? ostiumOpenTradeBlockMessage(currentMarket, symbol, leverage)
    : '';
  const ostiumOpenMarketChoices = useMemo(() => {
    if (dex !== 'ostium') return [];
    return markets
      .filter(m => !ostiumOpenTradeBlockReason(m, leverage))
      .sort((a, b) => {
        const byActivity = (marketActivity(b).score || 0) - (marketActivity(a).score || 0);
        if (Math.abs(byActivity) > 1e-9) return byActivity;
        return ostiumMarketSymbol(a).localeCompare(ostiumMarketSymbol(b));
      })
      .slice(0, 4);
  }, [dex, markets, leverage]);
  const handleMarginModeToggle = useCallback(async () => {
    clearTradeFeedback();
    if (dex === 'phoenix' && phoenixMarginModeReadOnly) {
      setLocalAlert(
        phoenixSupportsIsolated && !phoenixSupportsCross
          ? `Phoenix ${symbol} supports isolated margin only.`
          : `Phoenix ${symbol} margin mode is not switchable right now.`
      );
      return;
    }
    if (marginModeLocked) {
      setLocalAlert(
        hasCurrentSymbolPosition
          ? `Close your ${symbol} position before changing Cross/Isolated margin.`
          : `Cancel your ${symbol} open orders before changing Cross/Isolated margin.`
      );
      return;
    }
    if (dex === 'decibel') {
      setLocalAlert('Decibel currently uses cross margin only. Isolated margin is not available yet.');
      return;
    }
    if (dex === 'pacifica' && !pacAgent && bindAgent) {
      if (bindingAgent) {
        setLocalAlert('1-tap trading is still enabling. Try again in a moment.');
        return;
      }
      try {
        const bound = await bindAgent();
        if (!bound && !pacAgent) {
          setLocalAlert('1-tap trading is still enabling. Try again in a moment.');
          return;
        }
      } catch (e) {
        setLocalAlert(e?.message || PACIFICA_AGENT_REQUIRED_MESSAGE);
        return;
      }
    }
    const result = await setMarginMode?.(symbol, !marginModes[symbol]);
    if (result?.error) setLocalAlert(result.error);
  }, [clearTradeFeedback, marginModeLocked, hasCurrentSymbolPosition, symbol, setMarginMode, marginModes, dex, pacAgent, bindAgent, bindingAgent, phoenixMarginModeReadOnly, phoenixSupportsCross, phoenixSupportsIsolated]);

  const handleSizePct = useCallback((pct) => {
    clearTradeFeedback();
    setSizePct(pct);
    if (sizePctMarginBase > 0) {
      // Slider now sets MARGIN (a fraction of the wallet balance), not
      // notional. 100% = full balance committed as collateral, which gives
      // a position = balance × leverage (= old "buying power").
      const rawMarginVal = sizePctMarginBase * pct / 100;
      const marginVal = (dex === 'phoenix' ? floorUsdCents(rawMarginVal) : rawMarginVal).toFixed(2);
      if (amountInUsdc) {
        setAmount(marginVal);
        return;
      } else {
        const sizingPrice = parseFloat(orderSizingPrice || currentPrice);
        if (!(sizingPrice > 0)) return;
        // Token-input mode: convert margin → token qty via leverage.
        const qty = dex === 'pacifica'
          ? pacificaQtyFromMargin({
              margin: marginVal,
              price: sizingPrice,
              leverage,
              orderType,
              takerFeeRate: pacificaTakerFeeRate,
            })
          : dex === 'phoenix'
          ? phoenixQtyFromMargin({
              margin: marginVal,
              price: sizingPrice,
              leverage,
              lotSize,
            })
          : ((parseFloat(marginVal) * leverage) / sizingPrice);
        setAmount(String(qty.toFixed(6)));
      }
    }
  }, [clearTradeFeedback, sizePctMarginBase, currentPrice, amountInUsdc, leverage, dex, orderSizingPrice, orderType, pacificaTakerFeeRate, lotSize]);

  const levTimerRef = useRef(null);
  const handleLeverageChange = useCallback((val) => {
    clearTradeFeedback();
    const v = Math.min(Number(val), maxLev);
    setLeverage(v);
    // Avantis + GMX take leverage per-trade (passed in placeOrder call),
    // so no leverage tx ever runs from the slider. Skip cleanly.
    if (dex === 'hibachi') {
      setLeverageApi(symbol, v);
      return;
    }
    if (dex === 'avantis' || dex === 'gmx' || dex === 'ostium' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'grvt' || dex === 'flash') return;
    // Pacifica leverage updates should use the agent key. If the user has
    // not enabled it yet, keep this UI-only and flush after auto-bind on
    // trade submit.
    if (dex === 'pacifica' && !pacAgent) return;
    // Pacifica + Decibel BOTH push leverage to the server — Pacifica via
    // its account-level /leverage endpoint, Decibel via Aptos
    // configureUserSettingsForMarket. Both want the slider drag debounced
    // so we don't fire one tx per slider tick (Decibel was firing every
    // tick before this fix). The hook's setLeverage call is also
    // idempotent-cached on (symbol, lev, isCross), so a no-op repeat is
    // free anyway.
    if (levTimerRef.current) clearTimeout(levTimerRef.current);
    levTimerRef.current = setTimeout(() => {
      // Decibel currently uses cross margin in production.
      if (dex === 'decibel') {
        setLeverageApi(symbol, v, { isCross: true });
      } else {
        setLeverageApi(symbol, v);
      }
    }, 800);
  }, [clearTradeFeedback, maxLev, symbol, setLeverageApi, dex, positions, pacAgent]);

  // Synchronous double-click guard. React's `loading` state is async, so a
  // second click can land between dispatch-1 and React committing the button's
  // `disabled` attribute. This ref flips synchronously in-callback.
  const tradeInFlight = useRef(false);
  const handleTrade = useCallback(async (side) => {
    if (tradeInFlight.current) return;
    tradeInFlight.current = true;
    setTradeBusy(true);
    setTradePhase('preparing');
    setLocalAlert(null);
    const logLighterTrade = (step, data = {}, level = 'info') => {
      if (dex !== 'lighter') return;
      const payload = {
        step,
        symbol,
        side,
        orderType,
        amount,
        amountInUsdc,
        tokenAmount,
        positionUsdc: Number.isFinite(positionUsdc) ? positionUsdc : null,
        leverage,
        currentPrice,
        orderSizingPrice,
        hasWallet,
        setupVerified,
        lighterNeedsIntegratorApproval,
        ...data,
      };
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info']('[Lighter UI] trade flow', payload);
      reportClientEvent('lighter.trade_flow', payload, {
        level,
        message: `[Lighter UI] trade ${step}`,
      });
    };
    try {
      logLighterTrade('start');
      // Pacifica API: 3rd arg is qty in base token (0.0022 BTC).
      // Avantis & Decibel APIs: 3rd arg is COLLATERAL / margin in USDC.
      // The UI's `amount` (in USDC mode) is the MARGIN the user deposits.
      // Guard against missing/NaN currentPrice (feed blip).
      const markPrice = parseFloat(currentPrice);
      const tradePrice = parseFloat(orderSizingPrice || currentPrice);
      const phoenixMarginPrice = dex === 'phoenix'
        ? (Number(currentPrice) > 0 ? Number(currentPrice) : tradePrice)
        : tradePrice;
      const isCollateralDex = dex === 'avantis' || dex === 'bulk' || dex === 'decibel' || dex === 'gmx' || dex === 'ostium' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'gmtrade' || dex === 'flash';
      const attachedTpsl = resolveOpenTpslForSide(side);
      if (!attachedTpsl?.ok) return;
      if (attachedTpsl?.hasTpsl && orderType === 'limit' && !OPEN_TPSL_NATIVE_LIMIT_ATTACH_DEXES.has(dex)) {
        setLocalAlert(`${dexErrorLabel(dex)} can attach TP/SL after a limit order fills. For now attach TP/SL directly only works for supported exchanges.`);
        return;
      }
      if (dex === 'flash' && flashMarketBlockReason) {
        setLocalAlert(`${symbol} is not open for Flash trading right now (${flashMarketBlockReason}).`);
        return;
      }
      if (dex === 'ostium' && ostiumMarketBlockMessage) {
        setLocalAlert(ostiumMarketBlockMessage);
        return;
      }
      if (dex === 'flash' && Number(leverage) > Number(maxLev) + 1e-9) {
        setLocalAlert(`${symbol} max initial leverage on Flash is ${maxLev}x. Lower leverage and retry.`);
        return;
      }
      let qty;
      if (isCollateralDex) {
        if (!Number.isFinite(positionUsdc) || positionUsdc <= 0) {
          setLocalAlert('Enter a valid amount.');
          return;
        }
        // Avantis enforces a $100 min-notional on-chain — surface client-side
        // so the user fixes the number before signing. Decibel has no such
        // floor (per-market minSize varies, and the SDK reverts will surface
        // a useful message), so we skip the 100-USDC gate for Decibel.
        if (dex === 'avantis' && positionUsdc < 100) {
          setLocalAlert(
            `Avantis requires a position ≥ $100. Yours: $${positionUsdc.toFixed(2)} ` +
            `(margin $${(positionUsdc / leverage).toFixed(2)} × ${leverage}x). Increase margin or leverage.`
          );
          return;
        }
        if (dex === 'monad') {
          const minPosting = Number(currentMarket?.min_posting_amount || 0);
          if (minPosting > 0 && positionUsdc < minPosting) {
            setLocalAlert(
              `Perpl requires a position ≥ $${minPosting.toFixed(2)}. Yours: $${positionUsdc.toFixed(2)}. Increase margin or leverage.`
            );
            return;
          }
        }
        // Avantis and Decibel hooks take USDC collateral directly. The token
        // readout is display math, so do not round collateral through it.
        const collateralReferencePrice = dex === 'phoenix' && orderType === 'limit'
          ? phoenixMarginPrice
          : tradePrice;
        let collateralUsdc = amountInUsdc
          ? parseFloat(amount)
          : (collateralReferencePrice > 0 ? (parseFloat(tokenAmount) * collateralReferencePrice) / leverage : 0);
        if (dex === 'ostium' && (!Number.isFinite(collateralUsdc) || collateralUsdc < OSTIUM_MIN_MARGIN_USD)) {
          setLocalAlert(`Ostium minimum margin is ${OSTIUM_MIN_MARGIN_USD} USDC. Increase margin before signing.`);
          return;
        }
        if (dex === 'ostium' && Number.isFinite(collateralUsdc) && collateralUsdc > ostiumMaxMargin + 0.000001) {
          setLocalAlert(ostiumOracleFeeBufferMessage(ostiumMaxMargin, pacBalance));
          return;
        }
        if (dex === 'phoenix') {
          const reserve = phoenixMarginReserveDetails({
            balance: pacBalance,
            leverage,
            orderType,
            takerFeeRate: phoenixTakerFeeRate,
          });
          const maxMargin = reserve.usable_margin;
          const phoenixOrderPrice = orderType === 'limit' ? parseFloat(limitPrice) : tradePrice;
          const phoenixRiskPrice = orderType === 'limit' ? phoenixMarginPrice : phoenixOrderPrice;
          const phoenixCurrentPosition = (positions || []).find(p => p?.symbol === symbol && (p?.side === 'bid' || p?.side === 'ask')) || null;
          const requestedQty = amountInUsdc
            ? phoenixQtyFromMargin({
                margin: collateralUsdc,
                price: phoenixRiskPrice,
                leverage,
                lotSize,
              })
            : roundDownToLot(parseFloat(tokenAmount), lotSize);
          const requiredDetail = phoenixRequiredMarginDetailForQty({
            qty: requestedQty,
            price: phoenixRiskPrice,
            leverage,
            orderType,
            takerFeeRate: phoenixTakerFeeRate,
            side,
            market: currentMarket,
            currentPosition: phoenixCurrentPosition,
          });
          const requiredMargin = requiredDetail.requiredMargin;
          console.info('[Phoenix UI] margin reserve check', {
            symbol,
            orderType,
            requested_side: side,
            requested_margin: collateralUsdc,
            requested_qty: requestedQty,
            required_margin: requiredMargin,
            required_detail: requiredDetail,
            order_price: Number.isFinite(phoenixOrderPrice) ? phoenixOrderPrice : null,
            margin_price: Number.isFinite(phoenixRiskPrice) ? phoenixRiskPrice : null,
            position_usdc: Number.isFinite(positionUsdc) ? positionUsdc : null,
            amount_mode: amountInUsdc ? 'usdc_margin' : 'token_size',
            ...reserve,
          });
          if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
            setLocalAlert('Phoenix order size is below this market lot size. Increase margin or leverage.');
            return;
          }
          if (Number.isFinite(requiredMargin) && requiredMargin > pacBalance + 1e-6) {
            console.warn('[Phoenix UI] margin blocked by fee/slippage buffer', {
              symbol,
              orderType,
              requested_side: side,
              requested_margin: collateralUsdc,
              requested_qty: requestedQty,
              required_margin: requiredMargin,
              required_detail: requiredDetail,
              order_price: Number.isFinite(phoenixOrderPrice) ? phoenixOrderPrice : null,
              margin_price: Number.isFinite(phoenixRiskPrice) ? phoenixRiskPrice : null,
              max_margin: maxMargin,
              ...reserve,
            });
            const risk = requiredDetail?.risk;
            const riskSuffix = orderType === 'limit' && risk && risk.reducing !== true
              ? ` ${symbol} limit orders are checked against Phoenix mark price and risk tier (${risk.max_leverage}x max, ${(risk.limit_order_risk_factor_bps / 100).toFixed(0)}% limit risk).`
              : '';
            setLocalAlert(
              `Phoenix needs $${requiredMargin.toFixed(2)} collateral for this order; you have $${pacBalance.toFixed(2)} free. Lower size/leverage or add collateral.${riskSuffix}`
            );
            return;
          }
          if (amountInUsdc && collateralUsdc > floorUsdCents(maxMargin) && requiredMargin <= pacBalance) {
            collateralUsdc = Math.min(collateralUsdc, maxMargin);
          }
        }
        if (dex === 'hotstuff') {
          const reserve = hotstuffMarginReserveDetails({
            balance: pacBalance,
            leverage,
            orderType,
            takerFeeRate: hotstuffTakerFeeRate,
          });
          const maxMargin = floorUsdCents(reserve.usable_margin);
          console.info('[Hotstuff UI] margin reserve check', {
            symbol,
            orderType,
            requested_side: side,
            requested_margin: collateralUsdc,
            max_margin: maxMargin,
            position_usdc: Number.isFinite(positionUsdc) ? positionUsdc : null,
            amount_mode: amountInUsdc ? 'usdc_margin' : 'token_size',
            ...reserve,
          });
          if (Number.isFinite(collateralUsdc) && collateralUsdc > maxMargin + 1e-9) {
            console.warn('[Hotstuff UI] margin blocked by slippage/fee buffer', {
              symbol,
              orderType,
              requested_side: side,
              requested_margin: collateralUsdc,
              max_margin: maxMargin,
              free_balance: pacBalance,
              ...reserve,
            });
            setLocalAlert(
              `Hotstuff needs a slippage/fee buffer at ${leverage}x. Use $${maxMargin.toFixed(2)} margin or less from your $${pacBalance.toFixed(2)} free balance.`
            );
            return;
          }
        }
        if (dex === 'flash') {
          const maxMargin = Math.max(0, Number(flashMaxMargin) || 0);
          if (Number.isFinite(collateralUsdc) && collateralUsdc > maxMargin + 1e-9) {
            setLocalAlert(`Flash margin max is $${maxMargin.toFixed(2)} USDC. At ${leverage}x that is about $${(maxMargin * leverage).toFixed(2)} position size.`);
            return;
          }
        }
        qty = String(collateralUsdc.toFixed(6));
      } else {
        if (dex === 'hotstuff') {
          if (amountInUsdc) {
            qty = amount;
          } else {
            const orderPrice = orderType === 'limit' ? parseFloat(limitPrice) : markPrice;
            const tokenQty = parseFloat(amount);
            qty = Number.isFinite(tokenQty) && tokenQty > 0 && Number.isFinite(orderPrice) && orderPrice > 0
              ? String((tokenQty * orderPrice) / Math.max(1, Number(leverage) || 1))
              : '';
          }
        } else {
          qty = amountInUsdc ? tokenAmount : amount;
        }
        if (!qty || !Number.isFinite(parseFloat(qty)) || parseFloat(qty) <= 0) {
          logLighterTrade('blocked_invalid_qty', { qty, markPrice, tradePrice }, 'warn');
          setLocalAlert('Enter a valid amount.');
          return;
        }
        if (dex === 'pacifica') {
          const enteredMargin = amountInUsdc ? parseFloat(amount) : null;
          const requiredMargin = amountInUsdc
            ? enteredMargin
            : pacificaRequiredMarginForQty({
                qty,
                price: orderType === 'limit' ? parseFloat(limitPrice) : markPrice,
                leverage,
                orderType,
                takerFeeRate: pacificaTakerFeeRate,
              });
          if (Number.isFinite(requiredMargin) && requiredMargin > pacificaMaxMargin + 1e-6) {
            const reserve = pacificaMarginReserveDetails({ balance: pacBalance });
            console.warn('[Pacifica UI] margin blocked by account-value buffer', {
              symbol,
              orderType,
              requested_side: side,
              requested_margin: requiredMargin,
              max_margin: pacificaMaxMargin,
              amount_mode: amountInUsdc ? 'usdc_margin' : 'token_size',
              ...reserve,
            });
            setLocalAlert(`Pacifica needs a small fee buffer. Use $${pacificaMaxMargin.toFixed(2)} margin or less from your $${pacBalance.toFixed(2)} free balance.`);
            return;
          }
          const orderPrice = orderType === 'limit' ? parseFloat(limitPrice) : markPrice;
          const orderNotional = parseFloat(qty) * orderPrice;
          if (!Number.isFinite(orderNotional) || orderNotional < PACIFICA_MIN_NOTIONAL_USD) {
            setLocalAlert(
              `Pacifica requires a position >= $${PACIFICA_MIN_NOTIONAL_USD}. Yours: ` +
              `$${Number.isFinite(orderNotional) ? orderNotional.toFixed(2) : '0.00'}. Increase margin or leverage.`
            );
            return;
          }
        }
      }
      // Bind before Pacifica account-settings. Direct wallet signatures from
      // some adapters can fail Pacifica verification on /account/leverage even
      // though the wallet returned a 64-byte signature.
      if (dex === 'pacifica' && !pacAgent && bindAgent) {
        if (bindingAgent) {
          setLocalAlert('1-tap trading is still enabling. Try again in a moment.');
          return;
        }
        try {
          const bound = await bindAgent();
          if (!bound && !pacAgent) {
            setLocalAlert('1-tap trading is still enabling. Try again in a moment.');
            return;
          }
        } catch (e) {
          setLocalAlert(e?.message || PACIFICA_AGENT_REQUIRED_MESSAGE);
          return;
        }
      }
      // Flush any pending leverage change before placing the order so the
      // chain sees the right leverage on fill. Pacifica and Decibel both
      // store per-symbol leverage on-chain; without a pre-flush the order
      // executes against whatever leverage was last persisted (e.g. 40× from
      // a previous session even though the slider shows 20×). Avantis/GMX
      // take leverage per-trade in the place-order call, so no pre-flush.
      if (dex === 'pacifica' || dex === 'bulk' || dex === 'decibel' || dex === 'hotstuff' || dex === 'lighter') {
        if (levTimerRef.current) {
          clearTimeout(levTimerRef.current);
          levTimerRef.current = null;
        }
        const serverLev = leverageSettings[symbol];
        const serverLevNum = serverLev != null ? Number(serverLev) : NaN;
        const levMatches = Number.isFinite(serverLevNum) && Math.abs(serverLevNum - leverage) < 0.05;
        if (!levMatches) {
          logLighterTrade('set_leverage_start', { serverLev, serverLevNum, requestedLeverage: leverage });
          // Decibel needs isCross alongside leverage; current production
          // mode is cross margin.
          const levOpts = (() => {
            if (dex !== 'decibel') return undefined;
            return { isCross: true };
          })();
          const levRes = await setLeverageApi(symbol, leverage, {
            ...levOpts,
            force: dex === 'decibel',
          });
          logLighterTrade('set_leverage_result', { ok: !!levRes && !levRes.error, result: levRes });
          if (!levRes || levRes.error) {
            setLocalAlert(levRes?.error || 'Could not set leverage. Close any open position on this symbol first.');
            return;
          }
        }
      }
      setTradePhase('signing');
      let result;
      const tradeOptions = {
        ...(Number.isFinite(positionUsdc) && positionUsdc > 0 ? { notional_usd: positionUsdc } : {}),
        ...(attachedTpsl?.options || {}),
        ...(dex === 'phoenix' ? { margin_mode: marginModes[symbol] ? 'isolated' : 'cross' } : {}),
        ...(dex === 'gmtrade' && (currentMarket?.market_token || currentMarket?.marketToken)
          ? { market_token: currentMarket.market_token || currentMarket.marketToken }
          : {}),
      };
      if (dex === 'gmtrade') {
        const gmtradeOrderPrice = orderType === 'limit' ? parseFloat(limitPrice) : tradePrice;
        if (Number.isFinite(gmtradeOrderPrice) && gmtradeOrderPrice > 0) {
          tradeOptions.price = gmtradeOrderPrice;
          if (Number.isFinite(positionUsdc) && positionUsdc > 0) {
            tradeOptions.token_amount = positionUsdc / gmtradeOrderPrice;
          }
        }
      }
      if (orderType === 'market') {
        // 5th arg (leverage) is only read by useAvantis; usePacifica ignores it.
        logLighterTrade('submit_market_start', { qty });
        result = await placeMarketOrder(symbol, side, qty, '0.5', leverage, tradeOptions);
      } else {
        if (!limitPrice) {
          logLighterTrade('blocked_missing_limit_price', { qty }, 'warn');
          return;
        }
        logLighterTrade('submit_limit_start', { qty, limitPrice });
        result = dex === 'avantis'
          ? await placeLimitOrder(symbol, side, limitPrice, qty, 'GTC', leverage, 1, tradeOptions)
          : await placeLimitOrder(symbol, side, limitPrice, qty, 'GTC', leverage, tradeOptions);
      }
      logLighterTrade('submit_result', { result });
      if (result?.error) {
        setTradePhase(null);
        setLocalAlert(result.error);
        return;
      }
      if (result && !result.error) {
        let tpslWarning = '';
        const shouldPostAttachTpsl = attachedTpsl?.hasTpsl
          && orderType === 'market'
          && !OPEN_TPSL_NATIVE_ORDER_ATTACH_DEXES.has(dex)
          && OPEN_TPSL_POST_MARKET_DEXES.has(dex)
          && typeof setTpsl === 'function';
        if (shouldPostAttachTpsl) {
          setTradePhase('tpsl');
          const closeSide = side === 'bid' ? 'ask' : 'bid';
          const tpslAmount = attachedTpsl.amountBase || tokenAmount || (tradePrice > 0 && positionUsdc > 0 ? String(positionUsdc / tradePrice) : '');
          const pairHint = result?.pair_index ?? result?.pairIndex ?? currentMarket?.pair_index ?? currentMarket?.pairIndex ?? currentMarket?.market_id ?? currentMarket?.marketId ?? currentMarket?.asset_id;
          const tradeHint = result?.trade_index ?? result?.tradeIndex ?? result?.index;
          const marketHint = result?.market_addr ?? result?.marketAddr ?? currentMarket?.market_addr ?? currentMarket?.marketAddress ?? currentMarket?.market;
          const tpslResult = await setTpsl(
            symbol,
            closeSide,
            attachedTpsl.takeProfit || null,
            attachedTpsl.stopLoss || null,
            pairHint,
            tradeHint,
            tpslAmount,
            marketHint,
          );
          if (tpslResult?.error) {
            tpslWarning = ` TP/SL failed: ${tpslResult.error}`;
            setLocalAlert(tpslWarning.trim());
          }
        }
        setTradePhase(null);
        const successText = result.info
          ? result.info
          : dex === 'gmtrade' && result.status === 'submitted'
            ? `${side.toUpperCase()} ${symbol} submitted`
            : orderType === 'market'
            ? `${side.toUpperCase()} ${symbol} opened`
            : `${side.toUpperCase()} ${symbol} limit placed`;
        setSuccessMsg(`${successText}${attachedTpsl?.hasTpsl && !tpslWarning ? ' + TP/SL' : ''}${tpslWarning}`);
        setAmount('');
        setSizePct(0);
      }
    } catch (e) {
      logLighterTrade('failed_exception', {
        error: e?.message || String(e),
        status: e?.status || null,
        data: e?.data || null,
      }, 'error');
      setLocalAlert(e?.message || String(e));
    } finally {
      tradeInFlight.current = false;
      setTradeBusy(false);
      setTradePhase(null);
    }
  }, [amount, tokenAmount, positionUsdc, limitPrice, symbol, orderType, amountInUsdc, currentPrice, orderSizingPrice, currentMarket, placeMarketOrder, placeLimitOrder, leverage, leverageSettings, setLeverageApi, dex, pacAgent, bindAgent, bindingAgent, pacBalance, pacificaMaxMargin, ostiumMaxMargin, pacificaTakerFeeRate, phoenixTakerFeeRate, hotstuffTakerFeeRate, flashMaxMargin, positions, lotSize, hasWallet, setupVerified, lighterNeedsIntegratorApproval, flashMarketBlockReason, ostiumMarketBlockMessage, maxLev, marginModes, resolveOpenTpslForSide, setTpsl]);

  // ==================== TRADE CONTROLS (reusable) ====================
  // Symbol info bar — token + market data (above chart)
  const curPriceData = useMemo(() => {
    const priceRow = prices.find(p => p.symbol === symbol);
    return { ...(currentMarket || {}), ...(priceRow || {}) };
  }, [prices, symbol, currentMarket]);
  const change24h = useMemo(() => {
    return marketChange24h(curPriceData);
  }, [curPriceData]);
  const vol24h = curPriceData ? marketVolume24h(curPriceData) : 0;
  const oi = curPriceData ? marketOpenInterest(curPriceData) : 0;
  const ostiumSideOi = dex === 'ostium' ? marketSideOpenInterest(curPriceData) : null;
  const hasOstiumSideOi = Boolean(ostiumSideOi?.hasSide);
  const volume24hText = formatCompactUsd(vol24h);
  const oiLabel = hasOstiumSideOi ? 'OI L/S' : 'OI';
  const oiText = hasOstiumSideOi
    ? `${formatCompactNumber(ostiumSideOi.long)} / ${formatCompactNumber(ostiumSideOi.short)}`
    : formatCompactUsd(oi);
  const oiTitle = hasOstiumSideOi
    ? `Open Interest Long / Short${ostiumSideOi.cap > 0 ? `, cap ${formatCompactUsd(ostiumSideOi.cap)}` : ''}`
    : 'Open Interest';
  const fundingInfoLabel = dex === 'ostium' ? 'Net L/S 8h' : fundingLabel;
  const oracle = curPriceData ? parseFloat(curPriceData.oracle || 0) : 0;
  const tradeButtonBlocked = (dex === 'flash' && !!flashMarketBlockReason) || (dex === 'ostium' && !!ostiumMarketBlockMessage);
  const tradeButtonBusy = loading || tradeBusy || tradePhase != null;
  useEffect(() => {
    setClientActivity({
      selected_dex: dex,
      active_scope: `futures:${dex}`,
      futures_busy: !!(tradeButtonBusy || tpslSubmittingPos),
      critical_action: !!(tradeButtonBusy || tpslSubmittingPos),
    });
    return () => {
      setClientActivity({
        futures_busy: false,
        critical_action: false,
      });
    };
  }, [dex, tradeButtonBusy, tpslSubmittingPos]);
  const tradeButtonPendingLabel = tradePhase === 'indexing'
    ? 'Syncing...'
    : tradePhase === 'tpsl'
    ? 'Setting TP/SL...'
    : tradePhase === 'confirming'
    ? 'Confirming...'
    : tradePhase === 'signing'
      ? 'Signing...'
      : 'Preparing...';

  const compactSymbolBar = isMobile || !fullscreen;
  const renderSymbolBar = () => (
    <>
      <div style={{...S.symbolBar, ...(compactSymbolBar ? S.symbolBarCompact : {}), ...(fullscreen ? {background: '#e8dfc8', borderBottom: '3px solid #d4c8b0'} : {})}}>
        <button style={{...S.symbolBtn, ...(compactSymbolBar ? S.symbolBtnCompact : {}), padding: compactSymbolBar ? '6px 8px' : '6px 10px', gap: compactSymbolBar ? 5 : 6, whiteSpace: 'nowrap'}} onClick={() => setShowSymbolPicker(!showSymbolPicker)} data-nodrag>
          <span style={{display: 'inline-flex', flexShrink: 0}}>
            <TokenIcon sym={baseSymbolForIcon(currentMarket, symbol)} size={20} />
          </span>
          <span style={{fontSize: 15, fontWeight: 900, flexShrink: 0}}>{symbol}</span>
          {(() => {
            const loaded = elfaSignals && Object.keys(elfaSignals).length > 0;
            if (!loaded) return null;
            const sig = elfaSignals[symbol];
            const badge = sig ? sig.badge : '💀';
            const label = sig ? sig.label : 'quiet';
            if (badge === '·') return null;
            return (
              <span title={label} style={{display: 'inline-flex', alignItems: 'center'}}>
                <SignalIcon type={badge} size={14} />
              </span>
            );
          })()}
          {!isMobile && !fullscreen && currentPrice && <span style={{...S.symbolPriceCompact, fontSize: 13, color: '#5C3A21', fontWeight: 700}}>${fmtPrice(parseFloat(currentPrice))}</span>}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{flexShrink: 0}}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {fullscreen && !isMobile && (
          <>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Mark</span><span style={S.infoCellValue}>{currentPrice ? fmtPrice(parseFloat(currentPrice)) : '—'}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Oracle</span><span style={S.infoCellValue}>{oracle > 0 ? fmtPrice(oracle) : '—'}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>24h</span><span style={{...S.infoCellValue, color: change24h >= 0 ? '#4CAF50' : '#E53935'}}>{change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Volume</span><span style={S.infoCellValue}>{volume24hText}</span></div>
            <div style={{...S.infoCell, ...(hasOstiumSideOi ? S.infoCellWide : null)}} title={oiTitle}><span style={S.infoCellLabel}>{oiLabel}</span><span style={{...S.infoCellValue, ...(hasOstiumSideOi ? S.infoCellValueCompact : null)}}>{oiText}</span></div>
            <div style={{...S.infoCell, ...(dex === 'ostium' ? S.infoCellWide : null)}}><span style={S.infoCellLabel}>{fundingInfoLabel}</span><span style={{...S.infoCellValue, ...(dex === 'ostium' ? S.infoCellValueCompact : null), color: fundingColor}}>{fundingText}</span></div>
          </>
        )}
        <div style={{...S.symbolBarActions, ...(compactSymbolBar ? S.symbolBarActionsCompact : {}), gap: compactSymbolBar ? 4 : 8}}>
          {dex === 'avantis' || dex === 'gmx' || dex === 'ostium' || dex === 'decibel' || dex === 'monad' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'katana' || dex === 'gmtrade' || dex === 'flash' || dex === 'lighter' || dex === 'bulk' ? (
            // Read-only badge for venues where the production margin mode is
            // not user-toggleable in our integration.
            <div
              style={{...S.marginSwapBtn, padding: compactSymbolBar ? '6px 8px' : '6px 10px', fontSize: 12, gap: 4, cursor: 'default', opacity: 0.85}}
              title={dex === 'gmx'
                ? 'GMX V2 uses isolated margin per position (no cross mode)'
                : dex === 'ostium'
                ? 'Ostium uses isolated collateral per trade in this integration'
                : dex === 'decibel'
                ? 'Decibel currently uses cross margin; isolated margin is not available yet'
                : dex === 'monad'
                ? 'Perpl uses isolated margin per position in this integration'
                : dex === 'hyperliquid'
                ? 'Hyperliquid uses cross margin in your Hyperliquid account'
                : dex === 'risex'
                ? 'RISEx uses cross margin in your RISE account'
                : dex === 'nado'
                ? 'Nado uses cross margin in your Ink account'
                : dex === 'hibachi'
                ? 'Hibachi margin is managed in your Hibachi account'
                : dex === 'katana'
                ? 'Katana uses cross margin in this integration'
                : dex === 'gmtrade'
                ? 'GMTrade uses isolated collateral per Solana position account'
                : dex === 'lighter'
                ? 'Lighter margin mode is managed through the Lighter account settings in this integration'
                : dex === 'bulk'
                ? 'Bulk cross margin and leverage are managed by your signed account settings'
                : 'Avantis uses isolated margin per trade (no cross mode)'}
            >
              <span style={{color: ((dex === 'decibel' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'katana' || dex === 'lighter' || dex === 'bulk') ? '#4CAF50' : '#FF9800'), fontWeight: 900}}>
                {dex === 'gmtrade'
                  ? 'Isolated'
                  : (dex === 'decibel' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'katana')
                  ? 'Cross'
                  : dex === 'lighter' || dex === 'bulk'
                  ? 'Cross'
                  : 'Isolated'}
              </span>
            </div>
          ) : (
            <button
              style={{
                ...S.marginSwapBtn,
                padding: compactSymbolBar ? '6px 8px' : '6px 10px',
                fontSize: 12,
                gap: 4,
                opacity: marginModeLocked ? 0.65 : 1,
                cursor: marginModeLocked ? 'not-allowed' : 'pointer',
              }}
              onClick={handleMarginModeToggle}
              title={dex === 'phoenix' && phoenixMarginModeReadOnly
                ? (phoenixSupportsIsolated && !phoenixSupportsCross
                  ? `Phoenix ${symbol} supports isolated margin only`
                  : `Phoenix ${symbol} margin mode is not switchable right now`)
                : marginModeLocked
                ? 'Close this symbol position and cancel its open orders before changing margin mode'
                : (marginModes[symbol] ? 'Isolated margin' : 'Cross margin')}
            >
              <span style={{color: marginModes[symbol] ? '#FF9800' : '#4CAF50', fontWeight: 900}}>
                {marginModes[symbol] ? 'Isolated' : 'Cross'}
              </span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{flexShrink: 0}}>
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </button>
          )}
          <div
            style={{
              ...S.balanceSummary,
              ...(compactSymbolBar ? S.balanceSummaryCompact : {}),
              ...(isMobile ? S.balanceSummaryMobile : {}),
            }}
            role="group"
            aria-busy={balanceCheckPending}
            aria-label={balanceCheckPending
              ? 'Loading trading account balance'
              : `Balance $${headerAccountValue.toFixed(2)}, free margin $${pacBalance.toFixed(2)}`}
            title={balanceCheckPending
              ? 'Loading trading account balance'
              : `Balance: $${headerAccountValue.toFixed(2)} total account value\nFree: $${pacBalance.toFixed(2)} available for new trades`}
          >
            <div style={{...S.balanceMetric, ...(compactSymbolBar ? S.balanceMetricCompact : {}), ...(isMobile ? S.balanceMetricMobile : {})}}>
              <span style={S.balanceMetricLabel}>Balance</span>
              <span style={S.balanceMetricValue}>
                {balanceCheckPending ? (
                  <span style={S.balanceLoadingValue}>
                    <span style={S.balanceLoadingSpinner} aria-hidden="true" />
                    <span>{isMobile ? '...' : 'Loading'}</span>
                  </span>
                ) : formatAccountHeaderUsd(headerAccountValue, isMobile)}
              </span>
            </div>
            <span style={S.balanceDivider} aria-hidden="true" />
            <div style={{...S.balanceMetric, ...(compactSymbolBar ? S.balanceMetricCompact : {}), ...(isMobile ? S.balanceMetricMobile : {})}}>
              <span style={S.balanceMetricLabel}>Free</span>
              <span style={{
                ...S.balanceMetricValue,
                color: balanceCheckPending ? '#8C7D5C' : '#2E7D32',
              }}>
                {balanceCheckPending ? '—' : formatAccountHeaderUsd(pacBalance, isMobile)}
              </span>
            </div>
          </div>
        </div>
      </div>
      {showSymbolPicker && (
        <div style={{position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60}} onClick={() => setShowSymbolPicker(false)}>
          <div style={{width: fullscreen ? 480 : '90%', maxWidth: 600, maxHeight: '80vh', background: '#fdf8e7', border: '5px solid #d4c8b0', borderRadius: 16, padding: 12, boxShadow: '0 15px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column'}} onClick={e => e.stopPropagation()}>
            <SymbolPicker markets={markets} prices={prices} symbol={symbol} onSelect={(s) => { setSymbol(s); setShowSymbolPicker(false); }} fullscreen={fullscreen} signals={elfaSignals} />
          </div>
        </div>
      )}
    </>
  );

  const renderTradeControls = ({ compactMobile = false, parentScroll = false } = {}) => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: compactMobile ? 6 : 8,
      minWidth: 0,
      ...(fullscreen && !parentScroll
        ? {width: '100%', overflowY: 'auto', overflowX: 'hidden', padding: 10, scrollbarWidth: 'none'}
        : {}),
      ...(parentScroll ? {width: '100%', padding: 10, boxSizing: 'border-box'} : {}),
    }}>

      {/* Deposit/Withdraw row — gate on account VALUE, not free margin.
          A user with an open position has available_to_spend ≈ 0 but
          account_equity > 0; gating on free margin would pop the deposit
          prompt for any user with a position. */}
      {!balanceCheckPending && pacAccountValue < 0.01 && (
        <div style={S.noBalanceHint} onClick={() => setActiveTab('Account')}>
          No balance — go to Account tab to deposit USDC
        </div>
      )}

      {dex === 'ostium' && ostiumMarketBlockMessage && (
        <div style={S.marketClosedHint}>
          <div style={S.marketClosedHead}>
            <span style={S.marketClosedTitle}>
              {ostiumMarketBlockReason === 'day_trading_closed' ? 'Day trading closed' : 'Market closed'}
            </span>
            <span style={S.marketClosedSymbol}>{ostiumMarketSymbol(currentMarket, symbol) || symbol}</span>
          </div>
          <div style={S.marketClosedCopy}>{ostiumMarketBlockMessage}</div>
          {ostiumOpenMarketChoices.length > 0 && (
            <div style={S.marketClosedActions}>
              <span style={S.marketClosedActionLabel}>Open now:</span>
              {ostiumOpenMarketChoices.map((market) => {
                const choiceSymbol = ostiumMarketSymbol(market);
                return (
                  <button
                    key={String(market.pair_index ?? market.market_id ?? choiceSymbol)}
                    type="button"
                    style={S.marketClosedChoice}
                    onClick={() => {
                      clearTradeFeedback();
                      setSymbol(choiceSymbol);
                    }}
                  >
                    {choiceSymbol}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Trade controls */}
      <div style={S.tradeBox}>
        <div style={S.row}>
          <button style={orderType === 'market' ? S.typeActive : S.typeBtn} onClick={() => { clearTradeFeedback(); setOrderType('market'); }}>Market</button>
          <button style={orderType === 'limit' ? S.typeActive : S.typeBtn} onClick={() => { clearTradeFeedback(); setOrderType('limit'); }}>Limit</button>
        </div>

        {orderType === 'limit' && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 3}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8}}>
              <span style={S.label}>Limit Price</span>
              <button
                type="button"
                style={{...S.midPriceBtn, opacity: midPriceValue > 0 ? 1 : 0.5}}
                disabled={!(midPriceValue > 0)}
                onClick={applyMidPrice}
                title="Use the mid price between best bid and ask"
              >
                Mid
              </button>
            </div>
            <input
              type="number"
              placeholder={currentPrice || '0'}
              value={limitPrice}
              onChange={e => { clearTradeFeedback(); setLimitPrice(e.target.value); }}
              style={S.input}
            />
          </div>
        )}

        <div style={{...S.row, alignItems: 'stretch'}}>
          <div style={{flex: compactMobile ? '1 1 auto' : 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span style={S.label}>{amountInUsdc ? 'Margin' : 'Amount'}</span>
              <button style={S.unitToggle} onClick={() => { clearTradeFeedback(); setAmountInUsdc(!amountInUsdc); }}>
                {amountInUsdc ? 'USDC' : symbol}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{marginLeft: 3}}>
                  <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
              </button>
            </div>
            <input type="number" placeholder={amountInUsdc ? (dex === 'flash' ? `Max ${pacBalance.toFixed(2)}` : '20') : '0.01'} value={amount}
              onChange={e => { clearTradeFeedback(); setAmount(e.target.value); setSizePct(0); }} style={S.input} />
          </div>
          <div style={{flex: compactMobile ? '0 0 92px' : 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3}}>
            <span style={S.label}>Leverage</span>
            <button style={S.levBtn} onClick={() => setShowLeverage(!showLeverage)}>
              {leverage}x
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{transform: showLeverage ? 'rotate(180deg)' : '', transition: '0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>

        {(dex === 'nado' || dex === 'flash') && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            background: oneTapTrading?.enabled ? 'rgba(22,163,74,0.10)' : 'rgba(92,58,33,0.06)',
            border: `1px solid ${oneTapTrading?.enabled ? 'rgba(22,163,74,0.35)' : 'rgba(92,58,33,0.18)'}`,
            borderRadius: 8,
            padding: '6px 8px',
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 900,
              color: oneTapTrading?.enabled ? '#166534' : '#5C3A21',
            }}>
              {dex === 'flash' ? 'Flash one tap' : 'One tap'}{oneTapTrading?.enabled && oneTapTrading?.approved === false ? ' pending' : ''}
            </span>
            <button
              type="button"
              onClick={handleToggleOneTapTrading}
              disabled={referralLinking || loading}
              title={dex === 'flash' ? 'Flash delegated session signer' : 'Nado linked signer'}
              style={{
                ...S.btnSmall,
                flex: '0 0 auto',
                minWidth: 56,
                padding: '4px 10px',
                background: oneTapTrading?.enabled ? '#16A34A' : '#fff6dc',
                color: oneTapTrading?.enabled ? '#fff' : '#5C3A21',
                border: `2px solid ${oneTapTrading?.enabled ? '#15803D' : '#b58b2a'}`,
                opacity: (referralLinking || loading) ? 0.7 : 1,
              }}
            >
              {referralLinking ? '...' : oneTapTrading?.enabled ? 'ON' : (dex === 'flash' ? 'ENABLE' : 'OFF')}
            </button>
          </div>
        )}

        {/* Position size readout — always on when the user has entered an
            amount. This is the leveraged exposure Avantis/Pacifica actually
            opens; the trader sees it explicitly instead of computing
            amount × leverage in their head. */}
        {amount && positionUsdc > 0 && (
          <div style={S.positionBox}>
            <div style={S.positionRow}>
              <span style={S.positionLabel}>Position Size</span>
              <span style={S.positionValue}>${positionUsdc.toFixed(2)}</span>
            </div>
            <div style={S.positionSub}>
              ${(positionUsdc / leverage).toFixed(2)} margin × {leverage}x
              {amountInUsdc && currentPrice && (
                <> · ≈ {parseFloat(tokenAmount).toFixed(6)} {symbol}</>
              )}
            </div>
          </div>
        )}

        {/* Size slider — % of wallet balance committed as margin */}
        <OpenTpslEditor
          enabled={openTpslEnabled}
          onEnabledChange={(next) => { clearTradeFeedback(); setOpenTpslEnabled(next); }}
          mode={openTpslMode}
          onModeChange={(next) => { clearTradeFeedback(); setOpenTpslMode(next); }}
          previewSide={openTpslPreviewSide}
          onPreviewSideChange={(next) => { clearTradeFeedback(); setOpenTpslPreviewSide(next); }}
          tpValue={openTpPrice}
          slValue={openSlPrice}
          onTpChange={(next) => { clearTradeFeedback(); setOpenTpPrice(next); }}
          onSlChange={(next) => { clearTradeFeedback(); setOpenSlPrice(next); }}
          pos={openTpslPreviewPos}
          metrics={openTpslPreviewMetrics}
          dex={dex}
          orderType={orderType}
        />

        <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: 11, fontWeight: 700, color: '#a3906a'}}>
              {sizePct}% of ${sizePctMarginBase.toFixed(2)} {(dex === 'phoenix' || dex === 'pacifica' || dex === 'hotstuff' || dex === 'ostium') ? 'usable' : dex === 'flash' ? 'free' : 'balance'}
            </span>
            <span style={{fontSize: 11, fontWeight: 700, color: '#5C3A21'}}>
              buying power ${maxUsdc.toFixed(0)}
            </span>
          </div>
          <input type="range" min="0" max="100" step={dex === 'flash' ? '1' : '5'} value={sizePct} className="grad-slider"
            onChange={e => handleSizePct(Number(e.target.value))} style={{...S.slider, '--val': `${sizePct}%`}} />
          <div style={S.sliderLabels}>
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>

        {(dex === 'pacifica' && bindAgent) && (() => {
          const enabled = !!pacAgent;
          const busy = !!bindingAgent || !!pacificaAgentToggling;
          const subtitle = enabled
            ? `Agent ${pacAgent?.agentPubkey ? shortAddr(pacAgent.agentPubkey) : 'ready'} - no wallet popups for orders.`
            : (bindAgentError || 'One wallet approval, then browser session signs Pacifica orders.');
          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              background: enabled ? 'rgba(22,163,74,0.10)' : 'rgba(249,115,22,0.08)',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: enabled ? 'rgba(22,163,74,0.35)' : 'rgba(249,115,22,0.30)',
              borderRadius: 8,
              padding: '7px 9px',
            }}>
              <div style={{display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0}}>
                <span style={{fontSize: 11, fontWeight: 900, color: enabled ? '#166534' : '#7C2D12'}}>
                  Pacifica one tap trading
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: bindAgentError && !enabled ? '#B91C1C' : '#8a7252',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {subtitle}
                </span>
              </div>
              <button
                type="button"
                onClick={handleTogglePacificaOneTap}
                disabled={busy || loading}
                style={{
                  ...S.btnSmall,
                  flex: '0 0 auto',
                  minWidth: 72,
                  padding: '5px 10px',
                  background: enabled ? '#16A34A' : '#fff6dc',
                  color: enabled ? '#fff' : '#5C3A21',
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: enabled ? '#15803D' : '#b58b2a',
                  opacity: (busy || loading) ? 0.7 : 1,
                }}
              >
                {busy ? '...' : enabled ? 'ON' : 'ENABLE'}
              </button>
            </div>
          );
        })()}

        {dex === 'ostium' && (() => {
          const enabled = !!oneTapTrading?.approved;
          const busy = !!referralLinking || !!loading;
          const subtitle = enabled
            ? `Delegate ${oneTapTrading?.signer ? shortAddr(oneTapTrading.signer) : 'ready'} - browser signs Ostium orders.`
            : oneTapTrading?.enabled
              ? oneTapTrading?.delegateReady === false && oneTapTrading?.gasReady === false
                ? 'Approve delegate and keep a small Arbitrum ETH balance.'
                : oneTapTrading?.delegateReady === false
                  ? 'Approve the Ostium delegate on Arbitrum.'
                : oneTapTrading?.allowanceReady === false
                  ? 'Approve USDC allowance for Ostium on Arbitrum.'
                  : oneTapTrading?.gasReady === false
                    ? 'Add a small ETH gas top-up to the browser delegate on Arbitrum.'
                    : 'Finish the remaining Ostium one tap setup step.'
              : 'One wallet setup, then browser delegate signs Ostium orders.';
          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              background: enabled ? 'rgba(22,163,74,0.10)' : 'rgba(249,115,22,0.08)',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: enabled ? 'rgba(22,163,74,0.35)' : 'rgba(249,115,22,0.30)',
              borderRadius: 8,
              padding: '7px 9px',
            }}>
              <div style={{display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0}}>
                <span style={{fontSize: 11, fontWeight: 900, color: enabled ? '#166534' : '#7C2D12'}}>
                  Ostium one tap trading
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#8a7252',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {subtitle}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleOneTapTrading}
                disabled={busy}
                style={{
                  ...S.btnSmall,
                  flex: '0 0 auto',
                  minWidth: 72,
                  padding: '5px 10px',
                  background: enabled ? '#16A34A' : '#fff6dc',
                  color: enabled ? '#fff' : '#5C3A21',
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: enabled ? '#15803D' : '#F97316',
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? '...' : enabled ? 'ON' : 'ENABLE'}
              </button>
            </div>
          );
        })()}

        {/* Leverage modal */}
        {showLeverage && (
          <>
            <div style={S.levBackdrop} onClick={() => setShowLeverage(false)} />
            <div style={{
              ...S.levModal,
              ...(isMobile ? {
                top: 'auto',
                left: 'max(10px, env(safe-area-inset-left))',
                right: 'max(10px, env(safe-area-inset-right))',
                bottom: 'max(12px, env(safe-area-inset-bottom))',
                transform: 'none',
                width: 'auto',
                maxWidth: 420,
                maxHeight: 'min(62vh, 360px)',
                margin: '0 auto',
                padding: 14,
                borderWidth: 4,
                borderRadius: 18,
                gap: 8,
                boxSizing: 'border-box',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                scrollbarWidth: 'none',
              } : {}),
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span style={{fontSize: isMobile ? 14 : 16, fontWeight: 900, color: '#5C3A21'}}>Adjust Leverage</span>
                <button style={S.levCloseBtn} onClick={() => setShowLeverage(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{fontSize: isMobile ? 34 : 48, fontWeight: 900, color: '#5C3A21', textAlign: 'center', padding: isMobile ? '2px 0' : '10px 0'}}>{leverage}x</div>
              <input type="range" min="1" max={maxLev} value={leverage} className="grad-slider" onChange={e => handleLeverageChange(e.target.value)} style={{...S.slider, '--val': `${maxLev > 1 ? ((leverage - 1) / (maxLev - 1)) * 100 : 0}%`}} />
              <div style={S.sliderLabels}><span>1x</span><span>{Math.floor(maxLev/4)}x</span><span>{Math.floor(maxLev/2)}x</span><span>{Math.floor(maxLev*3/4)}x</span><span>{maxLev}x</span></div>
              <div style={{display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 6}}>
                {/* Presets auto-adapt: always include the pair's own maxLev as
                    a shortcut so users can one-tap the ceiling (e.g. 75x for
                    ETH on Avantis). Coerce maxLev to Number — it arrives as a
                    string from the API, and Set dedup treats 75 !== "75". */}
                {(() => {
                  const cap = Number(maxLev) || 100;
                  return Array.from(new Set([1, 5, 10, 25, 50, 75, 100, 200, cap]))
                    .filter(v => v <= cap)
                    .sort((a, b) => a - b)
                    .map(v => (
                      <button key={v} style={{...(leverage === v ? S.levPresetActive : S.levPreset), flex: 'initial', minWidth: 0}}
                        onClick={() => {
                          handleLeverageChange(v);
                          if (isMobile) setShowLeverage(false);
                        }}>{v}x</button>
                    ));
                })()}
              </div>
              {leverage > maxLev * 0.5 && (
                <div style={{fontSize: 11, color: '#E53935', fontWeight: 700, textAlign: 'center', marginTop: 4}}>
                  High leverage increases liquidation risk
                </div>
              )}
            </div>
          </>
        )}

        {tradeButtonBlocked && (
          <div style={S.errorBar}>
            <span style={S.errorText}>{symbol} is not open for Flash trading right now ({flashMarketBlockReason}).</span>
          </div>
        )}
        {successMsg && (
          <div style={S.successBar} onClick={() => setSuccessMsg(null)}>
            <span>✓ {successMsg}</span>
          </div>
        )}

        <div style={S.row}>
          <button style={{...cartoonBtn('#4CAF50','#2E7D32'), ...S.tradeBtn, opacity: tradeButtonBlocked ? 0.55 : 1}} onClick={() => handleTrade('bid')} disabled={tradeButtonBusy || tradeButtonBlocked}>
            <span style={S.tradeBtnText}>{tradeButtonBusy ? tradeButtonPendingLabel : 'LONG'}</span>
          </button>
          <button style={{...cartoonBtn('#E53935','#B71C1C'), ...S.tradeBtn, opacity: tradeButtonBlocked ? 0.55 : 1}} onClick={() => handleTrade('ask')} disabled={tradeButtonBusy || tradeButtonBlocked}>
            <span style={S.tradeBtnText}>{tradeButtonBusy ? tradeButtonPendingLabel : 'SHORT'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  // ==================== BOTTOM PANEL (fullscreen) ====================
  const btmSymbols = useMemo(() => {
    return markets.map(m => m.symbol).sort();
  }, [markets]);

  const sortOptionsForTab = useMemo(() => {
    if (bottomTab === 'positions') return [
      { value: 'opened', label: 'Opened' },
    ];
    if (bottomTab === 'orders') return [
      { value: 'symbol', label: 'Symbol' }, { value: 'price', label: 'Price' },
    ];
    if (bottomTab === 'history') return [
      { value: 'time', label: 'Time' }, { value: 'symbol', label: 'Symbol' }, { value: 'size', label: 'Size' }, { value: 'price', label: 'Price' },
    ];
    if (bottomTab === 'funding') return [
      { value: 'time', label: 'Time' }, { value: 'symbol', label: 'Symbol' }, { value: 'amount', label: 'Amount' },
    ];
    return [{ value: 'time', label: 'Time' }];
  }, [bottomTab]);

  // Apply filters to positions
  const filteredPositions = useMemo(() => {
    let list = openedSortedPositions;
    if (btmFilters.symbol !== 'All') list = list.filter(p => p.symbol === btmFilters.symbol);
    if (btmFilters.side !== 'All') {
      const wantBid = btmFilters.side === 'Long';
      list = list.filter(p => wantBid ? p.side === 'bid' : p.side === 'ask');
    }
    return list;
  }, [openedSortedPositions, btmFilters]);

  // Apply filters to orders
  const filteredOrders = useMemo(() => {
    let list = groupedDisplayOrders;
    if (btmFilters.symbol !== 'All') list = list.filter(o => (o.symbol || o.s) === btmFilters.symbol);
    if (btmFilters.side !== 'All') {
      const wantBid = btmFilters.side === 'Long';
      list = list.filter(o => { const s = orderPositionSide(o); return wantBid ? s === 'bid' : s === 'ask'; });
    }
    const dir = btmFilters.sortDir === 'asc' ? 1 : -1;
    if (btmFilters.sortBy === 'symbol') list = [...list].sort((a, b) => dir * (a.symbol || a.s || '').localeCompare(b.symbol || b.s || ''));
    else if (btmFilters.sortBy === 'price') list = [...list].sort((a, b) => dir * (parseFloat(b.price || b.ip || 0) - parseFloat(a.price || a.ip || 0)));
    return list;
  }, [groupedDisplayOrders, btmFilters]);

  const hasActiveFilters = btmFilters.symbol !== 'All' || btmFilters.side !== 'All';

  // ==================== SOLANA WALLET RESTORE ====================
  if (checkingSolanaWallet) {
    const venueLabel = dex === 'phoenix' ? 'Phoenix' : 'Pacifica';
    const venueColor = dex === 'phoenix' ? '#F97316' : '#9945FF';
    const venueShadow = dex === 'phoenix' ? '#C2410C' : '#7B36CC';
    return (
      <>
        <style>{animCSS}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>Futures Trading</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center'}}>
            <div style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              borderWidth: 6,
              borderStyle: 'solid',
              borderColor: '#E7D9BF',
              borderTopColor: venueColor,
              boxShadow: `0 5px 0 ${venueShadow}, 0 8px 16px rgba(0,0,0,0.22)`,
              animation: 'wallet-spin 0.85s linear infinite',
            }} />
            <div style={{
              color: '#5C3A21',
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: '0.5px',
            }}>
              Loading {venueLabel}
            </div>
            <div style={{
              color: '#8a7252',
              fontSize: 12,
              fontWeight: 700,
              maxWidth: 280,
              lineHeight: 1.45,
            }}>
              Checking your trading wallet...
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== WRONG SELF-CUSTODY WALLET ====================
  const shouldBlockWalletMismatch = dex === 'flash';
  if (shouldBlockWalletMismatch && (dex === 'avantis' || dex === 'gmx' || dex === 'ostium' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana' || dex === 'gmtrade' || dex === 'flash') && walletMismatch) {
    return (
      <>
        <style>{animCSS}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>Futures Trading</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center'}}>
            <div style={{
              width: 58, height: 58, borderRadius: '50%',
              background: '#F59E0B', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, fontWeight: 900,
              boxShadow: '0 5px 0 #B45309, 0 8px 16px rgba(0,0,0,0.25)',
            }}>!</div>
            <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>
              Wrong {dex === 'gmx' || dex === 'hyperliquid' || dex === 'ostium' ? 'Arbitrum' : dex === 'hotstuff' ? 'Ethereum' : dex === 'grvt' ? 'GRVT Exchange' : dex === 'katana' ? 'Katana' : dex === 'monad' ? 'Monad' : dex === 'risex' ? 'RISE' : dex === 'nado' ? 'Ink' : dex === 'hibachi' ? 'EVM' : (dex === 'phoenix' || dex === 'gmtrade' || dex === 'flash') ? 'Solana' : 'Base'} wallet
            </div>
            <div style={{color: '#8a7252', fontSize: 12, fontWeight: 700, maxWidth: 340, lineHeight: 1.45}}>
              This game account is linked to {registeredEvmWallet?.slice(0, 6)}...{registeredEvmWallet?.slice(-4)}, but the connected wallet is {walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)}.
            </div>
            <button
              style={{...cartoonBtn('#0EA5E9', '#0284C7'), padding: '14px 28px'}}
              onClick={() => (dex === 'phoenix' || dex === 'gmtrade' || dex === 'flash') ? openWalletModal(true) : setEvmModalOpen(true)}
            >
              SWITCH WALLET
            </button>
          </div>
        </div>
        <EvmWalletModal
          open={evmModalOpen}
          onClose={() => setEvmModalOpen(false)}
          onConnected={handleEvmConnected}
          targetChain={evmConnectChain}
        />
      </>
    );
  }

  // ==================== NOT CONNECTED (skip in Farcaster — wallet auto-connects) ====================
  if (!hasWallet && !inFrame) {
    return (
      <>
        <style>{animCSS}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>Futures Trading</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'center', justifyContent: 'center', gap: 20}}>
            {dex === 'bulk' ? (
              <>
                <div style={{
                  width: 170, height: 72, borderRadius: 16,
                  background: '#1B1B18', border: '4px solid #383832',
                  boxShadow: '0 5px 0 #11110F, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  <img src={DEX_CONFIG.bulk.logo} alt="Bulk" style={{width: 158, height: 46, objectFit: 'cover'}} />
                </div>
                <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900, textAlign: 'center'}}>
                  Connect your Solana wallet
                </div>
                <div style={{color: '#8a7252', fontSize: 12, fontWeight: 600, textAlign: 'center', maxWidth: 310, lineHeight: 1.45}}>
                  Bulk is in closed beta. Connect the wallet you will fund on Bulk; Clash signs every action locally and never receives your private key.
                </div>
                {renderPrivyEmailButton('#383832', '#11110F')}
                <button
                  style={{...cartoonBtn('#383832', '#11110F'), padding: '14px 32px'}}
                  onClick={openSolanaConnect}
                >
                  CONNECT SOLANA WALLET
                </button>
                <button
                  style={{...cartoonBtn('#EAB308', '#A16207'), padding: '11px 24px'}}
                  onClick={() => window.open('https://early.bulk.trade/deposit?ref=clashofperps', '_blank', 'noopener,noreferrer')}
                >
                  JOIN BULK WITH CLASH REFERRAL
                </button>
              </>
            ) : dex === 'gmtrade' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #14B8A6 0%, #0F766E 100%)',
                  border: '4px solid #0D9488',
                  boxShadow: '0 5px 0 #0F766E, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, fontWeight: 900, color: '#fff',
                }}>GMT</div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your Solana wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 300, lineHeight: 1.4,
                }}>
                  GMTrade runs on Solana. Connect the same wallet you use for this game account.
                  Please accept our referral code in Clash to receive a GMTrade fee discount.
                  Clash confirms the code on-chain before trading rewards unlock.
                </div>
                {renderPrivyEmailButton('#14B8A6', '#0F766E')}
                <button
                  style={{...cartoonBtn('#14B8A6', '#0F766E'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => openWalletModal(true)}
                >
                  <span>CONNECT SOLANA WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#0F766E', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>GMTRADE - SOLANA</span>
                </div>
              </>
            ) : dex === 'katana' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #F04438 0%, #991B1B 100%)',
                  border: '4px solid #B42318',
                  boxShadow: '0 5px 0 #991B1B, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 900, color: '#fff',
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>KTN</div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your Katana wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 300, lineHeight: 1.4,
                }}>
                  Katana Perps runs on Katana. Connect the same EVM wallet you use for this game account.
                </div>
                {renderPrivyEmailButton('#F04438', '#991B1B')}
                <button
                  style={{...cartoonBtn('#F04438', '#991B1B'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <span>CONNECT KATANA WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#991B1B', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>KATANA PERPS - KATANA</span>
                </div>
              </>
            ) : dex === 'hibachi' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #EF4444 0%, #991B1B 100%)',
                  border: '4px solid #DC2626',
                  boxShadow: '0 5px 0 #991B1B, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, fontWeight: 900, color: '#fff',
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>HB</div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your EVM wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 300, lineHeight: 1.4,
                }}>
                  Hibachi uses an EVM wallet identity. Connect the same EVM wallet you use for this game account; API keys are requested later only for placing Hibachi orders.
                </div>
                {renderPrivyEmailButton('#EF4444', '#991B1B')}
                <button
                  style={{...cartoonBtn('#EF4444', '#991B1B'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <span>CONNECT EVM WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#991B1B', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>HIBACHI - EVM</span>
                </div>
              </>
            ) : dex === 'decibel' ? (
              // Decibel runs on Aptos, signed by Petra. Same self-custody
              // story as Avantis but a different wallet ecosystem — we use
              // AptosWalletContext directly instead of EvmWalletModal.
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #FFE600 0%, #B8860B 100%)',
                  border: '4px solid #DAA520',
                  boxShadow: '0 5px 0 #B8860B, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 44,
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>🔊</div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your Aptos wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  Decibel is non-custodial — Petra signs each trade.<br />
                  USDC for collateral, APT for gas.
                </div>
                <button
                  style={{...cartoonBtn('#DAA520', '#B8860B'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => aptosWallet.connect()}
                  disabled={aptosWallet.isConnecting}
                >
                  <span>{aptosWallet.isConnecting ? 'CONNECTING…' : aptosWallet.hasProvider ? 'CONNECT PETRA' : 'INSTALL PETRA'}</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#B8860B', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>DECIBEL · APTOS MAINNET</span>
                </div>
                {aptosWallet.error && (
                  <div style={{
                    color: '#B71C1C', fontSize: 11, fontWeight: 700,
                    textAlign: 'center', maxWidth: 280,
                  }}>{aptosWallet.error}</div>
                )}
              </>
            ) : dex === 'avantis' ? (
              // Avantis is non-custodial — the user's own EVM wallet signs
              // every trade. On page reload, external-wallet sessions are
              // lost (provider lives in React state only), so this screen
              // gives the user a direct "Connect" button instead of the
              // old fake "provisioning custodial wallet" spinner.
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #0EA5E9 0%, #0369A1 100%)',
                  border: '4px solid #0284C7',
                  boxShadow: '0 5px 0 #0284C7, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 44,
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>⚡</div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your Base wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  Avantis is non-custodial — your own wallet signs each trade.<br />
                  Nothing held on our side.
                </div>
                {renderPrivyEmailButton('#0EA5E9', '#0284C7')}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#0EA5E9', privyEnabled ? '#6B573E' : '#0284C7'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="3"/>
                    <path d="M16 14h.01"/>
                    <path d="M2 10h20"/>
                  </svg>
                  <span>CONNECT WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#0369A1', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>AVANTIS · BASE MAINNET</span>
                </div>
              </>
            ) : dex === 'ostium' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #111827 0%, #374151 100%)',
                  border: '4px solid #F97316',
                  boxShadow: '0 5px 0 #9A3412, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 30, fontWeight: 900, color: '#fff',
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>OST</div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your Arbitrum wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  Ostium is non-custodial on Arbitrum. Clash can use a browser-only delegate for one tap trading; USDC stays in your wallet.
                </div>
                {renderPrivyEmailButton('#111827', '#374151')}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#111827', privyEnabled ? '#6B573E' : '#374151'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="3"/>
                    <path d="M16 14h.01"/>
                    <path d="M2 10h20"/>
                  </svg>
                  <span>CONNECT WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#9A3412', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>OSTIUM · ARBITRUM MAINNET</span>
                </div>
              </>
            ) : dex === 'gmx' ? (
              // GMX is non-custodial on Arbitrum. Same EVM wallet plumbing
              // as Avantis (EvmWalletModal → viem walletClient), with an
              // explicit "Phase 1: read-only" hint until writes ship.
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #4F46E5 0%, #3730A3 100%)',
                  border: '4px solid #4338CA',
                  boxShadow: '0 5px 0 #3730A3, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 44,
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>🟣</div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your Arbitrum wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  GMX is non-custodial — your own wallet signs each trade.<br />
                  Read-only preview while we finish trade integration.
                </div>
                {renderPrivyEmailButton('#4F46E5', '#3730A3')}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#4F46E5', privyEnabled ? '#6B573E' : '#3730A3'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="3"/>
                    <path d="M16 14h.01"/>
                    <path d="M2 10h20"/>
                  </svg>
                  <span>CONNECT WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#3730A3', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>GMX · ARBITRUM MAINNET</span>
                </div>
              </>
            ) : dex === 'monad' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #6F5CFF 0%, #4530E0 100%)',
                  border: '4px solid #5547E5',
                  boxShadow: '0 5px 0 #4530E0, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 44,
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>↯</div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your Monad wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  Perpl trades on Monad. You need MON for gas and AUSD for collateral.
                </div>
                {renderPrivyEmailButton('#6F5CFF', '#4530E0')}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#6F5CFF', privyEnabled ? '#6B573E' : '#4530E0'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="3"/>
                    <path d="M16 14h.01"/>
                    <path d="M2 10h20"/>
                  </svg>
                  <span>CONNECT WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#4530E0', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>PERPL · MONAD MAINNET</span>
                </div>
              </>
            ) : dex === 'hyperliquid' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #22C55E 0%, #047857 100%)',
                  border: '4px solid #059669',
                  boxShadow: '0 5px 0 #047857, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>
                  <img src={DEX_CONFIG.hyperliquid.logo} alt="" style={{width: 48, height: 48, objectFit: 'contain'}} />
                </div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your EVM wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  Hyperliquid trades are signed by your wallet. Deposit USDC to Hyperliquid first, then trade here.
                </div>
                {renderPrivyEmailButton('#22C55E', '#047857')}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#22C55E', privyEnabled ? '#6B573E' : '#047857'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="3"/>
                    <path d="M16 14h.01"/>
                    <path d="M2 10h20"/>
                  </svg>
                  <span>CONNECT WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#047857', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>HYPERLIQUID</span>
                </div>
              </>
            ) : dex === 'risex' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #04DF83 0%, #009C5D 100%)',
                  border: '4px solid #00B86B',
                  boxShadow: '0 5px 0 #007A49, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>
                  <img src={DEX_CONFIG.risex.logo} alt="" style={{width: 48, height: 48, objectFit: 'contain'}} />
                </div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your RISE wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  RISEx trades are signed by your EVM wallet on RISE. Add the RISE network if your wallet asks.
                </div>
                {renderPrivyEmailButton('#04DF83', '#009C5D')}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#04DF83', privyEnabled ? '#6B573E' : '#009C5D'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="3"/>
                    <path d="M16 14h.01"/>
                    <path d="M2 10h20"/>
                  </svg>
                  <span>CONNECT RISE WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#007A49', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>RISEX - RISE MAINNET</span>
                </div>
              </>
            ) : dex === 'nado' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #00B8D9 0%, #075985 100%)',
                  border: '4px solid #0891B2',
                  boxShadow: '0 5px 0 #075985, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>
                  <img src={DEX_CONFIG.nado.logo} alt="" style={{width: 48, height: 48, objectFit: 'contain'}} />
                </div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your Ink wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  Nado trades are signed by your EVM wallet on Ink. You need USDt0 collateral and a little ETH on Ink for gas.
                </div>
                {renderPrivyEmailButton('#00B8D9', '#075985')}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#00B8D9', privyEnabled ? '#6B573E' : '#075985'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="3"/>
                    <path d="M16 14h.01"/>
                    <path d="M2 10h20"/>
                  </svg>
                  <span>CONNECT INK WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#075985', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>NADO - INK MAINNET</span>
                </div>
              </>
            ) : dex === 'hotstuff' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #FF5A5F 0%, #B91C1C 100%)',
                  border: '4px solid #DC2626',
                  boxShadow: '0 5px 0 #7F1D1D, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>
                  <img src={DEX_CONFIG.hotstuff.logo} alt="" style={{width: 48, height: 48, objectFit: 'contain'}} />
                </div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your Hotstuff wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  New Hotstuff users should join with the Clash referral first, then connect the same Ethereum wallet here. Clash also applies the referral best-effort during setup.
                </div>
                {referralUrl && (
                  <button
                    style={{...cartoonBtn('#111827', '#030712'), padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 10}}
                    onClick={() => {
                      if (typeof openReferralJoin === 'function') openReferralJoin();
                      else window.open(referralUrl, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 17 17 7"/>
                      <path d="M8 7h9v9"/>
                    </svg>
                    <span>JOIN WITH CLASH REFERRAL</span>
                  </button>
                )}
                {renderPrivyEmailButton('#FF5A5F', '#B91C1C')}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#FF5A5F', privyEnabled ? '#6B573E' : '#B91C1C'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="3"/>
                    <path d="M16 14h.01"/>
                    <path d="M2 10h20"/>
                  </svg>
                  <span>CONNECT ETHEREUM WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#B91C1C', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>HOTSTUFF - ETHEREUM MAINNET{referralCode ? ` - REF ${referralCode}` : ''}</span>
                </div>
              </>
            ) : dex === 'grvt' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #374151 0%, #111827 100%)',
                  border: '4px solid #111827',
                  boxShadow: '0 5px 0 #030712, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>
                  <img src={DEX_CONFIG.grvt.logo} alt="" style={{width: 48, height: 48, objectFit: 'contain'}} />
                </div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Connect your GRVT wallet</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  GRVT trades are signed on GRVT Exchange chain. Save your GRVT session credentials so Clash can read builder-code fills and credit gold.
                </div>
                {renderPrivyEmailButton('#374151', '#111827')}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#374151', privyEnabled ? '#6B573E' : '#111827'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => setEvmModalOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="3"/>
                    <path d="M16 14h.01"/>
                    <path d="M2 10h20"/>
                  </svg>
                  <span>CONNECT GRVT WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#111827', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>GRVT - EXCHANGE CHAIN</span>
                </div>
              </>
            ) : dex === 'phoenix' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #F97316 0%, #C2410C 100%)',
                  border: '4px solid #EA580C',
                  boxShadow: '0 5px 0 #C2410C, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>
                  <img src={DEX_CONFIG.phoenix.logo} alt="" style={{width: 48, height: 48, objectFit: 'contain'}} />
                </div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>{restoringPrivySolana ? 'Restoring email wallet' : 'Connect your Solana wallet'}</div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  {restoringPrivySolana
                    ? 'Your Privy Solana wallet is being prepared. If it does not continue, tap the email button once.'
                    : 'Phoenix is non-custodial. You need USDC for collateral and a little SOL for gas.'}
                </div>
                {privyEnabled && (
                  <button
                    style={{...cartoonBtn('#F97316', '#C2410C'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                    onClick={loginWithPrivyEmail}
                  >
                    <span>{privyAuthed ? 'CONTINUE WITH EMAIL' : 'SIGN IN WITH EMAIL'}</span>
                  </button>
                )}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#F97316', privyEnabled ? '#6B573E' : '#C2410C'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={openSolanaConnect}
                >
                  <span>CONNECT SOLANA WALLET</span>
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#C2410C', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px', marginTop: 4,
                }}>
                  <span>PHOENIX · SOLANA MAINNET</span>
                </div>
              </>
            ) : (
              <>
                <div style={{fontSize: 48, filter: 'grayscale(60%)'}}>🔗</div>
                <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900, textAlign: 'center'}}>
                  {restoringPrivySolana ? 'Restoring email wallet' : 'Connect Wallet to Trade'}
                </div>
                {restoringPrivySolana && (
                  <div style={{
                    color: '#8a7252', fontSize: 12, fontWeight: 600,
                    textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                  }}>
                    Your Privy Solana wallet is being prepared. If it does not continue, tap the email button once.
                  </div>
                )}
                {privyEnabled && (
                  <button
                    style={{...cartoonBtn('#9945FF', '#7B36CC'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                    onClick={loginWithPrivyEmail}
                  >
                    <span>{privyAuthed ? 'CONTINUE WITH EMAIL' : 'SIGN IN WITH EMAIL'}</span>
                  </button>
                )}
                <button
                  style={{...cartoonBtn(privyEnabled ? '#8A7252' : '#9945FF', privyEnabled ? '#6B573E' : '#7B36CC'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={openSolanaConnect}
                >
                  <span>CONNECT SOLANA WALLET</span>
                </button>
              </>
            )}
          </div>
        </div>
        <EvmWalletModal
          open={evmModalOpen}
          onClose={() => setEvmModalOpen(false)}
          onConnected={handleEvmConnected}
          targetChain={evmConnectChain}
        />
      </>
    );
  }

  // ==================== BULK BUILDER APPROVAL GATE ====================
  if (dex === 'bulk' && hasWallet && setupVerified !== true) {
    const isChecking = setupVerified === null || loading;
    const isRunning = Boolean(activationStep);
    return (
      <>
        <style>{animCSS}</style>
        <div ref={panelRef} className={fullscreen ? 'futures-fullscreen' : ''} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>Bulk setup</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>×</button>
          </div>
          <div style={{...S.body, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 28}}>
            <div style={{width: 210, height: 82, borderRadius: 16, background: '#1B1B18', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <img src={DEX_CONFIG.bulk.logo} alt="Bulk" style={{width: 198, height: 58, objectFit: 'cover'}} />
            </div>
            <div style={{color: '#5C3A21', fontSize: 21, fontWeight: 900, textAlign: 'center'}}>
              {isChecking ? 'Checking your Bulk account' : 'Approve Clash builder routing'}
            </div>
            <div style={{color: '#8a7252', fontSize: 13, fontWeight: 650, textAlign: 'center', maxWidth: 390, lineHeight: 1.5}}>
              Bulk requires a one-time signed approval for the Clash builder address. Every later market or limit order is independently signed by this wallet and includes the same builder routing.
            </div>
            {error && !isChecking && (
              <div style={{color: '#991B1B', background: '#FEE2E2', border: '2px solid #FCA5A5', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 750, maxWidth: 410}}>
                {error}
              </div>
            )}
            <button
              disabled={isChecking || isRunning}
              style={{...cartoonBtn(isChecking || isRunning ? '#A8A29E' : '#383832', isChecking || isRunning ? '#78716C' : '#11110F'), padding: '14px 30px', minWidth: 250}}
              onClick={async () => {
                const result = await registerBuilderCode?.();
                if (result?.error) setLocalAlert(result.error);
              }}
            >
              {isChecking ? 'CHECKING…' : isRunning ? 'SIGNING…' : 'APPROVE BUILDER & CONTINUE'}
            </button>
            <button
              style={{...cartoonBtn('#EAB308', '#A16207'), padding: '11px 24px'}}
              onClick={() => openReferralJoin?.()}
            >
              DEPOSIT WITH CLASH REFERRAL
            </button>
            <div style={{color: '#8a7252', fontSize: 11, fontWeight: 700, textAlign: 'center', maxWidth: 420, wordBreak: 'break-all'}}>
              Builder: {builderConfig?.address || 'Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9'} · {builderConfig?.fee_bps || 1} bps
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== LIGHTER API KEY GATE ====================
  if (dex === 'lighter' && hasWallet && setupVerified !== true) {
    const isRunning = referralLinking || loading;
    const hasLighterCredentials = lighterCredentials?.accountIndex != null;
    const showLighterCredentialForm = !hasLighterCredentials || lighterCredentialFormOpen;
    const lighterCanSave = showLighterCredentialForm
      && lighterAccountIndexInput.trim().length > 0
      && lighterApiKeyIndexInput.trim().length > 0
      && lighterApiPrivateKeyInput.trim().length > 0
      && !isRunning;
    const lighterCredentialState = hasLighterCredentials ? 'done' : (isRunning ? 'active' : 'pending');
    const lighterReferralState = hasReferrer === true
      ? 'done'
      : (hasLighterCredentials && (lighterReferralChecking || (isRunning && lighterNeedsReferral)))
        ? 'active'
        : 'pending';
    const lighterIntegratorState = !lighterNeedsIntegratorApproval && hasLighterCredentials
      ? 'done'
      : (hasReferrer === true && isRunning)
        ? 'active'
        : 'pending';
    const lighterGateTitle = lighterNeedsReferral
      ? `Accept ${referralCode} referral`
      : lighterReferralChecking && hasLighterCredentials
        ? 'Checking Lighter referral'
        : lighterNeedsIntegratorApproval && hasReferrer === true
          ? 'Approve Clash integrator'
          : 'Add Lighter API credentials';
    const lighterGateSubtitle = lighterNeedsReferral
      ? 'This Lighter account has no referral code. Accept the Clash code before trading unlocks; an existing code is always preserved.'
      : 'Clash verifies your Lighter account, existing referral, and integrator approval before enabling orders.';

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Connecting Lighter...' : 'Lighter setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'stretch', overflowY: 'auto', overflowX: 'hidden', padding: 0, background: '#fdf8e7'}}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{isRunning ? 'CONNECTING' : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>{lighterGateTitle}</span>
                <span style={hlGateStyles.subtitle}>
                  {lighterGateSubtitle}
                </span>
              </div>
              <ol style={hlGateStyles.stepList}>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_done }}>1</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_done }}>EVM wallet connected</span>
                    <span style={hlGateStyles.stepHint}>{walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)} is used for Lighter setup approval.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${lighterCredentialState}`] }}>
                    {lighterCredentialState === 'done' ? 'OK' : lighterCredentialState === 'active' ? <span style={hlGateStyles.spinner} /> : 2}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${lighterCredentialState}`] }}>Verify API key</span>
                    <span style={hlGateStyles.stepHint}>The key is sent transiently to Clash only for signed Lighter requests.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${lighterReferralState}`] }}>
                    {lighterReferralState === 'done' ? 'OK' : lighterReferralState === 'active' ? <span style={hlGateStyles.spinner} /> : 3}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${lighterReferralState}`] }}>Verify referral code</span>
                    <span style={hlGateStyles.stepHint}>
                      {hasReferrer === true
                        ? `Existing referral ${lighterReferralStatus?.used_code || ''} is accepted.`
                        : lighterNeedsReferral
                          ? `No referral found. Confirm ${referralCode} to continue.`
                          : 'Clash reads used_code from Lighter without replacing an existing referral.'}
                    </span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${lighterIntegratorState}`] }}>
                    {lighterIntegratorState === 'done' ? 'OK' : lighterIntegratorState === 'active' ? <span style={hlGateStyles.spinner} /> : 4}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${lighterIntegratorState}`] }}>Approve Clash integrator</span>
                    <span style={hlGateStyles.stepHint}>Required for Clash-routed Lighter orders and builder-fee attribution.</span>
                  </span>
                </li>
              </ol>
              {showLighterCredentialForm && (
              <div style={{display: 'flex', flexDirection: 'column', gap: 10, background: '#fffaf0', border: '2px solid #d4c8b0', borderRadius: 12, padding: 12}}>
                <label style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>Your Lighter account index</span>
                  <input type="number" value={lighterAccountIndexInput} onChange={(e) => {
                    setLighterAccountDetectStatus('');
                    setLighterAccountIndexInput(e.target.value);
                  }} placeholder={lighterAccountDetectStatus === 'checking' ? 'Detecting from wallet...' : 'Auto-detected or enter manually'} disabled={isRunning} style={{...S.input, padding: '10px 12px', fontSize: 14}} />
                  {lighterAccountDetectStatus && (
                    <span style={{fontSize: 11, fontWeight: 800, color: lighterAccountDetectStatus === 'found' ? '#2f9e44' : '#9f8759'}}>
                      {lighterAccountDetectStatus === 'checking'
                        ? 'Checking your Lighter account from the connected EVM wallet...'
                        : lighterAccountDetectStatus === 'found'
                          ? 'Lighter account index detected automatically.'
                          : lighterAccountDetectStatus === 'not_found'
                            ? 'No Lighter account was found for this wallet. Enter the account index manually if this wallet has a sub-account.'
                            : 'Could not auto-detect the account index. You can still enter it manually.'}
                    </span>
                  )}
                </label>
                <label style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>API key index</span>
                  <input type="number" value={lighterApiKeyIndexInput} onChange={(e) => setLighterApiKeyIndexInput(e.target.value)} placeholder="Use index > 3" disabled={isRunning} style={{...S.input, padding: '10px 12px', fontSize: 14}} />
                </label>
                <label style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>API private key</span>
                  <input
                    type="password"
                    value={lighterApiPrivateKeyInput}
                    onChange={(e) => setLighterApiPrivateKeyInput(e.target.value)}
                    placeholder="Paste Lighter API private key"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isRunning}
                    style={{...S.input, padding: '10px 12px', fontSize: 14}}
                  />
                </label>
                <div style={{fontSize: 11, fontWeight: 700, color: '#9f8759', lineHeight: 1.35}}>
                  The API key is stored only in this browser, encrypted by browser storage. Clash does not write it to the database.
                </div>
              </div>
              )}
              {hasLighterCredentials && lighterReferralChecking && (
                <div style={{fontSize: 12, fontWeight: 800, color: '#5C3A21', lineHeight: 1.35, border: '2px solid #d4c8b0', background: '#fffaf0', borderRadius: 12, padding: 12}}>
                  Reading this wallet&apos;s current referral from Lighter. Trading remains locked until Lighter returns a confirmed <code>used_code</code>.
                </div>
              )}
              {hasLighterCredentials && lighterNeedsReferral && (
                <div style={{fontSize: 12, fontWeight: 800, color: '#5C3A21', lineHeight: 1.35, border: '2px solid #e0b44c', background: '#fff6d9', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10}}>
                  <span>No Lighter referral is attached to this wallet. Confirm <strong>{referralCode}</strong> before trading. Clash never replaces an existing referral.</span>
                  <button
                    type="button"
                    style={{ ...hlGateStyles.secondaryBtn, padding: '9px 12px', fontSize: 12, alignSelf: 'stretch', background: '#fffaf0' }}
                    disabled={isRunning}
                    onClick={() => {
                      if (typeof openReferralJoin === 'function') openReferralJoin();
                      else window.open(referralUrl, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    Open official Lighter referral page
                  </button>
                </div>
              )}
              {hasLighterCredentials && lighterNeedsReferral && (
                <button
                  style={{ ...hlGateStyles.primaryBtn, ...(isRunning ? hlGateStyles.primaryBtnBusy : null) }}
                  disabled={isRunning}
                  onClick={async () => {
                    if (typeof linkOurReferrer !== 'function') return;
                    setReferralLinking(true);
                    setLocalAlert('');
                    try {
                      const res = await linkOurReferrer();
                      if (res?.referral_status?.has_referral) {
                        setSuccessMsg(`Lighter referral ${res.referral_status.used_code || referralCode} confirmed.`);
                      } else {
                        setLocalAlert('Lighter has not confirmed the referral yet. Retry in a moment.');
                      }
                    } catch (e) {
                      setLocalAlert(e?.message || String(e));
                    } finally {
                      setReferralLinking(false);
                    }
                  }}
                >
                  {isRunning ? 'Confirming referral...' : `Accept ${referralCode} referral ->`}
                </button>
              )}
              {lighterNeedsIntegratorApproval && hasReferrer === true && (
                <div style={{fontSize: 12, fontWeight: 800, color: '#5C3A21', lineHeight: 1.35, border: '2px solid #e0b44c', background: '#fff6d9', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10}}>
                  <span>Lighter API key is saved. Approve the Clash integrator fee before trading unlocks.</span>
                  <button
                    type="button"
                    style={{ ...hlGateStyles.secondaryBtn, padding: '9px 12px', fontSize: 12, alignSelf: 'stretch' }}
                    disabled={isRunning}
                    onClick={() => {
                      setLighterCredentialFormOpen(true);
                      setLighterAccountIndexInput(String(lighterCredentials?.accountIndex ?? lighterAccountIndexInput ?? ''));
                      setLighterApiKeyIndexInput(String(lighterCredentials?.apiKeyIndex ?? lighterApiKeyIndexInput ?? ''));
                      setLighterApiPrivateKeyInput('');
                      setLighterAccountDetectStatus('');
                      setLocalAlert('');
                      setSuccessMsg('Paste the replacement Lighter API private key and save it.');
                    }}
                  >
                    Change API key
                  </button>
                  {lighterCredentialFormOpen && (
                    <button
                      type="button"
                      style={{ ...hlGateStyles.secondaryBtn, padding: '9px 12px', fontSize: 12, alignSelf: 'stretch', background: '#fffaf0' }}
                      disabled={isRunning}
                      onClick={() => {
                        setLighterCredentialFormOpen(false);
                        setLighterApiPrivateKeyInput('');
                        setLocalAlert('');
                      }}
                    >
                      Cancel key change
                    </button>
                  )}
                </div>
              )}
              {lighterNeedsIntegratorApproval && hasReferrer === true && (
                <button
                  style={{ ...hlGateStyles.primaryBtn, ...(isRunning ? hlGateStyles.primaryBtnBusy : null) }}
                  disabled={isRunning}
                  onClick={async () => {
                    if (typeof approveIntegrator !== 'function') return;
                    setReferralLinking(true);
                    try {
                      await approveIntegrator();
                      setSuccessMsg('Lighter setup complete. Clash integrator fee approved.');
                    } catch (e) {
                      setLocalAlert(e?.message || String(e));
                    } finally {
                      setReferralLinking(false);
                    }
                  }}
                >
                  {isRunning ? 'Approving...' : 'Approve Clash integrator ->'}
                </button>
              )}
              {showLighterCredentialForm && (
              <button
                style={{ ...hlGateStyles.primaryBtn, ...(!lighterCanSave ? hlGateStyles.primaryBtnBusy : null) }}
                disabled={!lighterCanSave}
                onClick={async () => {
                  if (!activate) return;
                  setReferralLinking(true);
                  try {
                    const res = await activate({
                      accountIndex: lighterAccountIndexInput.trim(),
                      apiKeyIndex: lighterApiKeyIndexInput.trim(),
                      apiPrivateKey: lighterApiPrivateKeyInput.trim(),
                    });
                    if (res?.error) setLocalAlert(res.error);
                    else {
                      setLighterApiPrivateKeyInput('');
                      setLighterCredentialFormOpen(false);
                      if (res?.referralStatusError) {
                        setLocalAlert(`Lighter API key was saved, but referral verification failed: ${res.referralStatusError}`);
                      } else if (res?.referralStatus?.has_referral !== true) {
                        setSuccessMsg(`Lighter API key saved. Confirm the ${referralCode} referral to continue.`);
                      } else if (typeof approveIntegrator === 'function') {
                        try {
                          await approveIntegrator(res);
                          setSuccessMsg('Lighter setup complete. Clash integrator fee approved.');
                        } catch (approveError) {
                          setLocalAlert(approveError?.message || 'Lighter API key saved. Approve Clash integrator before trading.');
                        }
                      } else {
                        setSuccessMsg('Lighter API key and referral verified.');
                      }
                    }
                  } catch (e) {
                    setLocalAlert(e?.message || String(e));
                  } finally {
                    setReferralLinking(false);
                  }
                }}
              >
                {isRunning ? 'Connecting...' : 'Add Lighter credentials ->'}
              </button>
              )}
              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== HIBACHI API KEY GATE ====================
  if (dex === 'hibachi' && hasWallet && setupVerified !== true) {
    const isRunning = referralLinking || loading;
    const hibachiCanSave = hibachiApiKeyInput.trim().length > 0
      && hibachiAccountIdInput.trim().length > 0
      && hibachiPrivateKeyInput.trim().length > 0
      && !isRunning;

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Connecting Hibachi...' : 'Hibachi setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{
            ...S.body,
            alignItems: 'stretch',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 0,
            background: '#fdf8e7',
          }}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{isRunning ? 'CONNECTING' : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>Add Hibachi API credentials</span>
                <span style={hlGateStyles.subtitle}>
                  EVM wallet is connected. Hibachi does not expose builder codes, so Clash credits rewards only after importing fills from this Hibachi account.
                </span>
              </div>

              <ol style={hlGateStyles.stepList}>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_done }}>1</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_done }}>EVM wallet connected</span>
                    <span style={hlGateStyles.stepHint}>{walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)} is linked to this game account.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...(isRunning ? hlGateStyles.stepBubble_active : hlGateStyles.stepBubble_pending) }}>
                    {isRunning ? <span style={hlGateStyles.spinner} /> : 2}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...(isRunning ? hlGateStyles.stepLabel_active : hlGateStyles.stepLabel_pending) }}>Store Hibachi API key locally</span>
                    <span style={hlGateStyles.stepHint}>The browser stores your API key, account id, and API private key for signed order requests.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_pending }}>3</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_pending }}>Trade and import fills</span>
                    <span style={hlGateStyles.stepHint}>Gold is calculated from Hibachi fill history, not from a referral or builder-code assumption.</span>
                  </span>
                </li>
              </ol>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                background: '#fffaf0',
                border: '2px solid #d4c8b0',
                borderRadius: 12,
                padding: 12,
              }}>
                <label style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>Hibachi API key</span>
                  <input
                    type="password"
                    value={hibachiApiKeyInput}
                    onChange={(e) => setHibachiApiKeyInput(e.target.value)}
                    placeholder="Paste your Hibachi API key"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isRunning}
                    style={{...S.input, padding: '10px 12px', fontSize: 14}}
                  />
                </label>
                <label style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>Account id</span>
                  <input
                    type="text"
                    value={hibachiAccountIdInput}
                    onChange={(e) => setHibachiAccountIdInput(e.target.value)}
                    placeholder="Paste your Hibachi account id"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isRunning}
                    style={{...S.input, padding: '10px 12px', fontSize: 14}}
                  />
                </label>
                <label style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>API private key</span>
                  <input
                    type="password"
                    value={hibachiPrivateKeyInput}
                    onChange={(e) => setHibachiPrivateKeyInput(e.target.value)}
                    placeholder="Paste your Hibachi API private key"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isRunning}
                    style={{...S.input, padding: '10px 12px', fontSize: 14}}
                  />
                </label>
                <div style={{fontSize: 11, fontWeight: 700, color: '#9f8759', lineHeight: 1.35}}>
                  Stored in this browser only. Use the private key shown when you create the Hibachi API key.
                </div>
              </div>

              {referralUrl && (
                <button
                  style={{
                    ...hlGateStyles.primaryBtn,
                    width: '100%',
                    background: 'linear-gradient(180deg, #fff8e6 0%, #f5e6bd 100%)',
                    border: '2px solid #9f8759',
                    color: '#5C3A21',
                    textShadow: 'none',
                  }}
                  onClick={() => {
                    if (typeof openReferralJoin === 'function') openReferralJoin();
                    else window.open(referralUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Create Account and Deposit
                </button>
              )}

              <button
                style={{ ...hlGateStyles.primaryBtn, ...(!hibachiCanSave ? hlGateStyles.primaryBtnBusy : null) }}
                disabled={!hibachiCanSave}
                onClick={async () => {
                  if (!activate) return;
                  const apiKey = hibachiApiKeyInput.trim();
                  const accountId = hibachiAccountIdInput.trim();
                  const privateKey = hibachiPrivateKeyInput.trim();
                  if (!apiKey || !accountId || !privateKey) {
                    setLocalAlert('Enter Hibachi API key, account id, and API private key');
                    return;
                  }
                  setReferralLinking(true);
                  try {
                    const res = await activate({ apiKey, accountId, privateKey });
                    if (res?.error) setLocalAlert(res.error);
                    else {
                      setHibachiApiKeyInput('');
                      setHibachiAccountIdInput('');
                      setHibachiPrivateKeyInput('');
                      setSuccessMsg('Hibachi credentials saved in this browser.');
                    }
                  } finally {
                    setReferralLinking(false);
                  }
                }}
              >
                {isRunning ? 'Connecting...' : 'Add Hibachi credentials ->'}
              </button>

              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== GRVT API KEY GATE ====================
  if (dex === 'grvt' && hasWallet && setupVerified !== true) {
    const isRunning = referralLinking || loading;
    const grvtCanAuthorize = !isRunning;
    const grvtCanSaveManual = grvtApiKeyInput.trim().length > 0 && !isRunning;

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Connecting GRVT...' : 'GRVT setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'stretch', overflowY: 'auto', overflowX: 'hidden', padding: 0, background: '#fdf8e7'}}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{isRunning ? 'CONNECTING' : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>Authorize GRVT trading</span>
                <span style={hlGateStyles.subtitle}>
                  Sign once with your GRVT wallet. Clash creates the GRVT API key and local trading signer automatically.
                </span>
              </div>

              <ol style={hlGateStyles.stepList}>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_done }}>1</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_done }}>Ethereum wallet connected</span>
                    <span style={hlGateStyles.stepHint}>{walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)} is linked to this game account.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...(isRunning ? hlGateStyles.stepBubble_active : hlGateStyles.stepBubble_pending) }}>
                    {isRunning ? <span style={hlGateStyles.spinner} /> : 2}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...(isRunning ? hlGateStyles.stepLabel_active : hlGateStyles.stepLabel_pending) }}>Sign builder authorization</span>
                    <span style={hlGateStyles.stepHint}>One wallet signature creates the GRVT API key and tags the Clash builder.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_pending }}>3</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_pending }}>Read GRVT balance</span>
                    <span style={hlGateStyles.stepHint}>After setup, Clash polls GRVT account summary and fill history.</span>
                  </span>
                </li>
              </ol>

              <button
                style={{ ...hlGateStyles.primaryBtn, ...(!grvtCanAuthorize ? hlGateStyles.primaryBtnBusy : null) }}
                disabled={!grvtCanAuthorize}
                onClick={async () => {
                  if (!activate) return;
                  setReferralLinking(true);
                  try {
                    const res = await activate({ autoBuilderKey: true });
                    if (res?.error) setLocalAlert(res.error);
                    else {
                      setGrvtApiKeyInput('');
                      setSuccessMsg('GRVT trading authorized.');
                    }
                  } finally {
                    setReferralLinking(false);
                  }
                }}
              >
                {isRunning ? 'Connecting...' : 'Authorize with wallet ->'}
              </button>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                background: '#fffaf0',
                border: '2px solid #d4c8b0',
                borderRadius: 12,
                padding: 12,
              }}>
                <label style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>Existing GRVT API key</span>
                  <input
                    type="password"
                    value={grvtApiKeyInput}
                    onChange={(e) => setGrvtApiKeyInput(e.target.value)}
                    placeholder="Fallback: paste API key"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isRunning}
                    style={{...S.input, padding: '10px 12px', fontSize: 14}}
                  />
                </label>
                <button
                  style={{
                    ...hlGateStyles.primaryBtn,
                    ...(!grvtCanSaveManual ? hlGateStyles.primaryBtnBusy : null),
                    width: '100%',
                    padding: '10px 12px',
                    background: '#fff6dc',
                    color: '#5C3A21',
                    border: '2px solid #9f8759',
                    textShadow: 'none',
                  }}
                  disabled={!grvtCanSaveManual}
                  onClick={async () => {
                    if (!activate) return;
                    const apiKey = grvtApiKeyInput.trim();
                    if (!apiKey) {
                      setLocalAlert('Enter your GRVT API key');
                      return;
                    }
                    setReferralLinking(true);
                    try {
                      const res = await activate({ apiKey });
                      if (res?.error) setLocalAlert(res.error);
                      else {
                        setGrvtApiKeyInput('');
                        setSuccessMsg('GRVT API key saved in this browser.');
                      }
                    } finally {
                      setReferralLinking(false);
                    }
                  }}
                >
                  Use existing API key
                </button>
              </div>

              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== KATANA REFERRAL GATE ====================
  if (dex === 'katana' && hasWallet && setupVerified !== true) {
    const isRunning = referralLinking || loading;
    const missingKatanaFields = Array.isArray(inviteStatus?.missing_fields) ? inviteStatus.missing_fields : [];
    const katanaReadsReady = !!inviteStatus?.account_configured;
    const katanaAccountExists = inviteStatus?.account_exists === true;
    const katanaAccountMissing = inviteStatus?.has_credentials === true && inviteStatus?.account_exists === false;
    const katanaOneTapReady = oneTapTrading?.enabled === true && oneTapTrading?.approved === true;
    const katanaCanSave = katanaApiKeyInput.trim().length > 0 && katanaApiSecretInput.trim().length > 0 && !isRunning;
    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Checking Katana...' : 'Katana setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'stretch', overflowY: 'auto', overflowX: 'hidden', padding: 0, background: '#fdf8e7'}}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{isRunning ? 'CHECKING' : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>Katana Perps setup</span>
                <span style={hlGateStyles.subtitle}>
                  Add your Katana API key and secret, then approve a local delegated key once for one tap trading. Clash stores keys encrypted in this browser only.
                </span>
              </div>

              <ol style={hlGateStyles.stepList}>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_done }}>1</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_done }}>Katana wallet connected</span>
                    <span style={hlGateStyles.stepHint}>{walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)} is linked to this game account.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...(katanaReadsReady ? hlGateStyles.stepBubble_done : isRunning ? hlGateStyles.stepBubble_active : hlGateStyles.stepBubble_pending) }}>
                    {isRunning ? <span style={hlGateStyles.spinner} /> : 2}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...(katanaReadsReady ? hlGateStyles.stepLabel_done : isRunning ? hlGateStyles.stepLabel_active : hlGateStyles.stepLabel_pending) }}>Save Katana API credentials</span>
                    <span style={hlGateStyles.stepHint}>Code: {referralCode || 'not configured'}</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...(katanaAccountExists ? hlGateStyles.stepBubble_done : katanaAccountMissing ? hlGateStyles.stepBubble_active : hlGateStyles.stepBubble_pending) }}>
                    {katanaAccountExists ? 3 : katanaAccountMissing ? <span style={hlGateStyles.spinner} /> : 3}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...(katanaAccountExists ? hlGateStyles.stepLabel_done : katanaAccountMissing ? hlGateStyles.stepLabel_active : hlGateStyles.stepLabel_pending) }}>
                      Katana account exists
                    </span>
                    <span style={hlGateStyles.stepHint}>
                      {katanaAccountMissing
                        ? 'No Katana account was found for this wallet. Open Katana Perps and create or activate the account first.'
                        : katanaAccountExists
                        ? 'Account found. Trading can unlock after market data loads.'
                        : 'Checked after credentials are saved.'}
                    </span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...(katanaOneTapReady ? hlGateStyles.stepBubble_done : isRunning ? hlGateStyles.stepBubble_active : hlGateStyles.stepBubble_pending) }}>
                    {katanaOneTapReady ? 4 : isRunning ? <span style={hlGateStyles.spinner} /> : 4}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...(katanaOneTapReady ? hlGateStyles.stepLabel_done : isRunning ? hlGateStyles.stepLabel_active : hlGateStyles.stepLabel_pending) }}>Enable one tap trading</span>
                    <span style={hlGateStyles.stepHint}>
                      {missingKatanaFields.length
                        ? `Missing: ${missingKatanaFields.join(', ')}`
                        : katanaOneTapReady
                        ? `Delegated signer ${oneTapTrading?.signer?.slice?.(0, 6) || ''}...${oneTapTrading?.signer?.slice?.(-4) || ''} is authorized.`
                        : 'One wallet signature authorizes a browser-only delegated key. Orders then skip wallet popups.'}
                    </span>
                  </span>
                </li>
              </ol>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                background: '#fffaf0',
                border: '2px solid #d4c8b0',
                borderRadius: 12,
                padding: 12,
              }}>
                <label style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>Katana API key</span>
                  <input
                    type="password"
                    value={katanaApiKeyInput}
                    onChange={(e) => setKatanaApiKeyInput(e.target.value)}
                    placeholder="Paste your Katana API key"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isRunning}
                    style={{...S.input, padding: '10px 12px', fontSize: 14}}
                  />
                </label>
                <label style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>Katana API secret</span>
                  <input
                    type="password"
                    value={katanaApiSecretInput}
                    onChange={(e) => setKatanaApiSecretInput(e.target.value)}
                    placeholder="Paste your Katana API secret"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isRunning}
                    style={{...S.input, padding: '10px 12px', fontSize: 14}}
                  />
                </label>
                <div style={{fontSize: 11, fontWeight: 700, color: '#9f8759', lineHeight: 1.35}}>
                  Do not enter a wallet private key. Katana one tap creates a local delegated key and stores it encrypted in this browser only.
                </div>
              </div>

              <button
                style={{ ...hlGateStyles.primaryBtn, ...(!katanaCanSave ? hlGateStyles.primaryBtnBusy : null) }}
                disabled={!katanaCanSave}
                onClick={async () => {
                  if (!activate) return;
                  setReferralLinking(true);
                  try {
                    const res = await activate({
                      apiKey: katanaApiKeyInput.trim(),
                      apiSecret: katanaApiSecretInput.trim(),
                    });
                    if (res?.error) setLocalAlert(res.error);
                    else {
                      setKatanaApiKeyInput('');
                      setKatanaApiSecretInput('');
                      setSuccessMsg('Katana API credentials saved.');
                    }
                  } finally {
                    setReferralLinking(false);
                  }
                }}
              >
                {isRunning ? 'Connecting...' : 'Add Katana API credentials ->'}
              </button>

              {katanaAccountExists && (
                <button
                  style={{
                    ...(katanaOneTapReady ? hlGateStyles.secondaryBtn : hlGateStyles.primaryBtn),
                    opacity: isRunning ? 0.65 : 1,
                  }}
                  disabled={isRunning}
                  onClick={handleToggleOneTapTrading}
                >
                  {isRunning ? 'Please wait...' : katanaOneTapReady ? 'One tap enabled' : 'Enable one tap trading'}
                </button>
              )}

              <button
                style={katanaAccountMissing ? hlGateStyles.primaryBtn : hlGateStyles.secondaryBtn}
                onClick={() => {
                  if (openReferralJoin) openReferralJoin();
                  else if (referralUrl) window.open(referralUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                {katanaAccountMissing ? 'Create Katana account' : 'Open Katana Perps'}
              </button>

              {referralUrl && (
                <div style={{fontSize: 11, fontWeight: 700, color: '#9f8759', lineHeight: 1.35, wordBreak: 'break-all'}}>
                  {referralUrl}
                </div>
              )}

              {successMsg && (
                <div style={hlGateStyles.successBox || {fontSize: 12, fontWeight: 800, color: '#0F766E'}}>
                  {successMsg}
                </div>
              )}

              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== GMTRADE REFERRAL GATE ====================
  if (dex === 'gmtrade' && hasWallet && hasReferrer !== true) {
    const isRunning = referralLinking || loading;
    const isChecking = hasReferrer === null && !referralLinking;
    const stepState = isChecking || isRunning ? 'active' : 'pending';

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>GMTrade setup</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{
            ...S.body,
            alignItems: 'stretch',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 0,
            background: '#fdf8e7',
          }}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{isChecking ? 'CHECKING' : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>{isChecking ? 'Checking GMTrade referral' : 'Claim GMTrade referral'}</span>
                <span style={hlGateStyles.subtitle}>
                  {isChecking
                    ? 'Clash is reading your GMTrade user account on Solana before trading unlocks.'
                    : 'Please accept our GMTrade referral code to receive a fee discount. Clash confirms it on-chain before unlocking trading rewards.'}
                </span>
              </div>

              <ol style={hlGateStyles.stepList}>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${stepState}`] }}>
                    {stepState === 'active' ? <span style={hlGateStyles.spinner} /> : 1}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${stepState}`] }}>
                      {isChecking ? 'Read on-chain referral' : 'Confirm referral code'}
                    </span>
                    <span style={hlGateStyles.stepHint}>
                      {isChecking
                        ? `Wallet: ${String(walletAddr || '').slice(0, 6)}...${String(walletAddr || '').slice(-4)}`
                        : `Code: ${referralCode || 'gamingperps'}. If this wallet already has a GMTrade referrer, GMTrade keeps the existing one.`}
                    </span>
                  </span>
                </li>
              </ol>

              <button
                style={{ ...hlGateStyles.primaryBtn, ...((isRunning || isChecking) ? hlGateStyles.primaryBtnBusy : null) }}
                disabled={isRunning || isChecking}
                onClick={async () => {
                  setReferralLinking(true);
                  try {
                    const res = typeof linkOurReferrer === 'function'
                      ? await linkOurReferrer()
                      : { error: 'GMTrade referral approval is not available yet.' };
                    if (res?.error) setLocalAlert(res.error);
                    else if (res?.already_linked) {
                      setSuccessMsg('GMTrade referral is already set for this wallet.');
                    } else {
                      setSuccessMsg('GMTrade referral confirmed.');
                    }
                  } finally {
                    setReferralLinking(false);
                  }
                }}
              >
                {isChecking ? 'Checking referral...' : isRunning ? 'Approve in wallet...' : 'Accept referral code ->'}
              </button>

              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== FLASH REFERRAL GATE ====================
  if (dex === 'flash' && hasWallet && hasReferrer !== true) {
    const isRunning = referralLinking || loading;
    const isChecking = hasReferrer === null && !referralLinking;
    const stepState = isChecking || isRunning ? 'active' : 'pending';

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>Flash setup</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{
            ...S.body,
            alignItems: 'stretch',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 0,
            background: '#fdf8e7',
          }}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{isChecking ? 'CHECKING' : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>{isChecking ? 'Checking Flash referral' : 'Create Flash referral pass'}</span>
                <span style={hlGateStyles.subtitle}>
                  {isChecking
                    ? 'Clash is reading your Flash referral account on Solana before trading unlocks.'
                    : 'Create the on-chain Flash referral pass for the Clash code before trading. This keeps Flash trading rewards tied to your game account.'}
                </span>
              </div>

              <ol style={hlGateStyles.stepList}>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_done }}>1</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_done }}>Solana wallet connected</span>
                    <span style={hlGateStyles.stepHint}>{walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)} is the Flash wallet for this account.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${stepState}`] }}>
                    {stepState === 'active' ? <span style={hlGateStyles.spinner} /> : 2}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${stepState}`] }}>
                      {isChecking ? 'Read on-chain referral' : 'Confirm Clash referral'}
                    </span>
                    <span style={hlGateStyles.stepHint}>
                      {isChecking
                        ? 'Reading the deterministic Flash referral PDA.'
                        : `Code: ${referralCode || 'clash'}. If this wallet already has a different Flash referrer, Flash will keep the existing one.`}
                    </span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_pending }}>3</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_pending }}>Trade and earn gold</span>
                    <span style={hlGateStyles.stepHint}>Flash orders unlock after the on-chain referral pass is confirmed.</span>
                  </span>
                </li>
              </ol>

              <button
                style={{ ...hlGateStyles.primaryBtn, ...((isRunning || isChecking) ? hlGateStyles.primaryBtnBusy : null) }}
                disabled={isRunning || isChecking}
                onClick={async () => {
                  setReferralLinking(true);
                  try {
                    const res = typeof linkOurReferrer === 'function'
                      ? await linkOurReferrer()
                      : { error: 'Flash referral approval is not available yet.' };
                    if (res?.error) setLocalAlert(res.error);
                    else if (res?.already_linked) setSuccessMsg('Flash referral is already set for this wallet.');
                    else setSuccessMsg('Flash referral pass confirmed.');
                  } finally {
                    setReferralLinking(false);
                  }
                }}
              >
                {isChecking ? 'Checking referral...' : isRunning ? 'Approve in wallet...' : 'Create referral pass ->'}
              </button>

              {referralUrl && (
                <button
                  type="button"
                  style={hlGateStyles.secondaryBtn}
                  onClick={() => {
                    if (openReferralJoin) openReferralJoin();
                    else window.open(referralUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Open Flash referral page
                </button>
              )}

              {successMsg && (
                <div style={hlGateStyles.successBox || {fontSize: 12, fontWeight: 800, color: '#0F766E'}}>
                  {successMsg}
                </div>
              )}

              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== AVANTIS BUILDER-CODE GATE ====================
  if (dex === 'avantis' && hasWallet && hasReferrer !== true) {
    const isRunning = referralLinking || loading;
    const isChecking = hasReferrer === null && !isRunning;
    const codeState = isRunning ? 'active' : 'pending';

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Linking Avantis...' : 'Avantis setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{
            ...S.body,
            alignItems: 'stretch',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 0,
            background: '#fdf8e7',
          }}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{isChecking ? 'CHECKING' : isRunning ? 'APPROVING' : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>{isRunning ? 'Approve in your wallet' : 'Link Clash builder code'}</span>
                <span style={hlGateStyles.subtitle}>
                  Avantis trading opens after this Base wallet is linked to the Clash code. This keeps gold rewards and quests attached to your game account.
                </span>
              </div>

              <ol style={hlGateStyles.stepList}>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_done }}>1</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_done }}>Wallet connected</span>
                    <span style={hlGateStyles.stepHint}>{walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)} is the Avantis wallet for this account.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${codeState}`] }}>
                    {isRunning ? <span style={hlGateStyles.spinner} /> : 2}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${codeState}`] }}>Approve builder code</span>
                    <span style={hlGateStyles.stepHint}>One wallet signature links the Clash code on Avantis before orders unlock.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles.stepBubble_pending }}>3</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles.stepLabel_pending }}>Trade and earn gold</span>
                    <span style={hlGateStyles.stepHint}>New Avantis trades count toward gold and repeatable BTC tasks after this setup.</span>
                  </span>
                </li>
              </ol>

              {isRunning ? (
                <div style={hlGateStyles.workingHint}>
                  Keep this panel open and approve the Base wallet request.
                </div>
              ) : (
                <button
                  style={{ ...hlGateStyles.primaryBtn, ...(loading ? hlGateStyles.primaryBtnBusy : null) }}
                  disabled={loading}
                  onClick={async () => {
                    if (!activate) return;
                    setReferralLinking(true);
                    try {
                      const res = await activate();
                      if (res === false) setLocalAlert('Avantis builder-code approval failed. Please approve it from your wallet and retry.');
                      else if (res?.error) setLocalAlert(res.error);
                    } finally {
                      setReferralLinking(false);
                    }
                  }}
                >
                  {isChecking ? 'Verify or approve builder code ->' : 'Approve builder code ->'}
                </button>
              )}

              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== HOTSTUFF ACTIVATE GATE ====================
  // Hotstuff needs a funded account before broker approval can succeed.
  // This mirrors Decibel's blocking setup flow, but includes the bridge
  // funding step because Hotstuff has no separate account-create method.
  if (dex === 'hotstuff' && hasWallet && setupVerified !== true) {
    const isRunning = referralLinking || loading;
    const isChecking = setupVerified === null && !isRunning;
    const walletBal = Number(walletUsdc || 0);
    const spotBal = Number(spotUsdc || 0);
    const equityBal = Number(account?.account_equity ?? account?.balance ?? account?.usdc ?? 0);
    const accountExists = !!hotstuffSetupStatus?.accountExists || equityBal > 0.000001 || spotBal > 0.000001;
    const brokerApproved = !!hotstuffSetupStatus?.brokerApproved;
    const agentReady = !!hotstuffSetupStatus?.agentReady;
    const accountState = accountExists ? 'done' : 'pending';
    const builderState = brokerApproved ? 'done' : (accountExists && isRunning ? 'active' : 'pending');
    const agentState = agentReady ? 'done' : (brokerApproved && isRunning ? 'active' : 'pending');
    const perpsState = equityBal > 0.000001 ? 'done' : 'pending';

    if (isChecking) {
      return (
        <>
          <style>{animCSS}</style>
          <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
          <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
            ...(fullscreen ? S.containerFull : S.container),
            ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
            transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
            transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
            <div style={S.header} onPointerDown={handlePointerDown}>
              <span style={S.headerTitle}>Hotstuff setup</span>
              <button data-nodrag onClick={handleClose} style={S.closeBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{
              ...S.body,
              alignItems: 'stretch',
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: 0,
              background: '#fdf8e7',
            }}>
              <div style={{ ...hlGateStyles.frame, justifyContent: 'center', minHeight: 260 }}>
                <span style={hlGateStyles.bigSpinner} />
                <div style={hlGateStyles.titleBlock}>
                  <span style={hlGateStyles.kicker}>CHECKING</span>
                  <span style={hlGateStyles.title}>Checking Hotstuff setup</span>
                  <span style={hlGateStyles.subtitle}>
                    Reading your Hotstuff account, builder-code approval, funding, and browser trading agent before showing any action steps.
                  </span>
                </div>
                <div style={hlGateStyles.workingHint}>
                  Please wait while Clash checks your connected wallet.
                </div>
              </div>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Setting up Hotstuff...' : 'Hotstuff setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{
            ...S.body,
            alignItems: 'stretch',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 0,
            background: '#fdf8e7',
          }}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{isRunning ? 'APPROVE IN WALLET' : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>Set up Hotstuff trading</span>
                <span style={hlGateStyles.subtitle}>
                  Create or fund your Hotstuff account in Hotstuff official, approve the Clash builder code, then register a browser trading agent.
                </span>
              </div>

              <ol style={hlGateStyles.stepList}>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${accountState}`] }}>
                    {accountState === 'done' ? 'OK' : 1}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${accountState}`] }}>Hotstuff account credited</span>
                    <span style={hlGateStyles.stepHint}>Use Hotstuff official to deposit/onboard. Ethereum wallet USDC: ${walletBal.toFixed(2)}.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${builderState}`] }}>
                    {builderState === 'done' ? 'OK' : builderState === 'active' ? <span style={hlGateStyles.spinner} /> : 2}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${builderState}`] }}>Approve builder code</span>
                    <span style={hlGateStyles.stepHint}>One wallet signature approves Clash fee routing before orders unlock.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${perpsState}`] }}>3</span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${perpsState}`] }}>Derivatives funded</span>
                    <span style={hlGateStyles.stepHint}>Perps balance: ${equityBal.toFixed(2)}. Move Spot to Perps if funds are still in Spot.</span>
                  </span>
                </li>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${agentState}`] }}>
                    {agentState === 'done' ? 'OK' : agentState === 'active' ? <span style={hlGateStyles.spinner} /> : 4}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${agentState}`] }}>Register trading agent</span>
                    <span style={hlGateStyles.stepHint}>One wallet signature registers a local browser signer for Hotstuff orders.</span>
                  </span>
                </li>
              </ol>

              {!accountExists && referralUrl && (
                <button
                  style={{...hlGateStyles.secondaryBtn, width: '100%'}}
                  onClick={() => {
                    if (typeof openReferralJoin === 'function') openReferralJoin();
                    else window.open(referralUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Open Hotstuff official
                </button>
              )}

              {(!brokerApproved || !agentReady) && (
                <button
                  style={{ ...hlGateStyles.primaryBtn, width: '100%', marginTop: accountExists ? 0 : 8, ...(isRunning ? hlGateStyles.primaryBtnBusy : null) }}
                  disabled={isRunning}
                  onClick={async () => {
                    if (!activate) return;
                    setReferralLinking(true);
                    try {
                      const res = await activate();
                      if (res?.info) setLocalAlert(res.info);
                      else if (res?.error) setLocalAlert(res.error);
                    } finally {
                      setReferralLinking(false);
                    }
                  }}
                >
                  {brokerApproved ? 'Register trading agent' : 'Approve builder code'}
                </button>
              )}

              {spotBal > 0.000001 && (
                <button
                  style={{...S.btnSmall, width: '100%', marginTop: 8, background: '#16A34A', color: '#fff', border: '2px solid #15803D'}}
                  onClick={async () => {
                    const amountText = spotBal.toFixed(6).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
                    const r = await moveSpotToPerp?.(amountText);
                    if (!r?.error) setLocalAlert(r?.info || 'Moved USDC to Hotstuff derivatives.');
                    else setLocalAlert(r.error);
                  }}
                  disabled={isRunning || !moveSpotToPerp}
                >
                  Move ${spotBal.toFixed(2)} Spot to Perps
                </button>
              )}

              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== PACIFICA BUILDER-CODE GATE ====================
  if (dex === 'pacifica' && hasWallet && setupVerified !== true) {
    const isRunning = !!activationStep;
    const isChecking = setupVerified === null && !isRunning;
    const stepState = isRunning ? 'active' : 'pending';

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Setting up Pacifica...' : 'Pacifica setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{
            ...S.body,
            alignItems: 'stretch',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 0,
            background: '#fdf8e7',
          }}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{isChecking ? 'CHECKING' : isRunning ? 'APPROVING' : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>{isRunning ? 'Approve in your wallet' : 'Approve Clash builder code'}</span>
                <span style={hlGateStyles.subtitle}>
                  Pacifica trading opens only after builder-code routing is approved. This is required before opening, editing, or closing orders.
                </span>
              </div>

              <ol style={hlGateStyles.stepList}>
                <li style={hlGateStyles.stepItem}>
                  <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${stepState}`] }}>
                    {stepState === 'active' ? <span style={hlGateStyles.spinner} /> : 1}
                  </span>
                  <span style={hlGateStyles.stepText}>
                    <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${stepState}`] }}>
                      Approve builder code
                    </span>
                    <span style={hlGateStyles.stepHint}>One wallet signature lets every Pacifica order include Clash fee routing.</span>
                  </span>
                </li>
              </ol>

              {isRunning ? (
                <div style={hlGateStyles.workingHint}>
                  Keep this panel open and approve the wallet request.
                </div>
              ) : (
                <button
                  style={{ ...hlGateStyles.primaryBtn, ...((isChecking || loading) ? hlGateStyles.primaryBtnBusy : null) }}
                  disabled={isChecking || loading}
                  onClick={async () => {
                    if (!activate) return;
                    const res = await activate();
                    if (res === false) setLocalAlert('Pacifica builder-code approval failed. Please approve it from your wallet and retry.');
                    else if (res?.error) setLocalAlert(res.error);
                  }}
                >
                  {isChecking || loading ? 'Please wait...' : 'Approve builder code ->'}
                </button>
              )}

              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== HYPERLIQUID SETUP GATE ====================
  if (dex === 'hyperliquid' && hasWallet && setupVerified !== true) {
    const isRunning = !!activationStep;
    const isChecking = setupVerified === null && !isRunning;
    const stepHint = activationStep ? (HYPERLIQUID_STEP_HINTS[activationStep.label] || '') : '';
    const builderConfigured = account?.builder_fee_configured === true;
    const builderEligible = account?.builder_fee_eligible !== false;
    const builderApproved = !builderConfigured || account?.builder_fee_approved === true || !builderEligible;
    const builderCanApprove = account?.builder_fee_user_can_approve === true;
    const builderValue = Number(account?.builder_account_value ?? 0);
    const builderPerpValue = Number(account?.builder_perp_account_value ?? builderValue);
    const builderMode = String(account?.builder_abstraction_mode || 'unknown');
    const builderEligibilityReason = account?.builder_eligibility_reason || '';
    const oneTapApproved = oneTapTrading?.approved === true;
    const oneTapOn = oneTapTrading?.enabled === true;
    const activeLabel = activationStep?.label || '';

    // Compute per-step state for the new step-bubble UI: pending / active
    // / done / error. Mirrors how the NFT-bridge progress modal renders
    // its three burn → relay → mint stages, so HL and the bridge feel
    // like the same family of progress dialogs.
    const builderState = builderApproved
      ? 'done'
      : (isRunning && activeLabel === 'Approve builder fee') ? 'active'
      : 'pending';
    const oneTapState = (oneTapApproved && oneTapOn)
      ? 'done'
      : (isRunning && activeLabel === 'Enable one tap trading') ? 'active'
      : 'pending';
    const referralState = (isRunning && activeLabel === 'Apply referral code')
      ? 'active'
      // Treat referral as done once everything before it has cleared and
      // we are past the running phase — the server applies it best-
      // effort during finalisation.
      : (builderState === 'done' && oneTapState === 'done' && !isRunning && !isChecking)
        ? 'done'
        : 'pending';

    const steps = [
      {
        idx: 1,
        title: 'Approve builder fee',
        state: builderState,
        hint: builderApproved
          ? (account?.builder_fee_approved === true || !builderConfigured)
            ? 'Done — trade fee routes to Clash.'
            : `Skipped — ${builderEligibilityReason || 'builder wallet must be Standard mode with $100+ perps value'}`
          : builderCanApprove
            ? 'Awaiting wallet signature.'
            : builderEligibilityReason
              ? builderEligibilityReason
              : builderConfigured
                ? `Builder must be Standard mode with $100+ perps value. Current: ${builderMode}, $${builderPerpValue.toFixed(2)}.`
                : 'Not configured.',
      },
      {
        idx: 2,
        title: 'Enable one tap trading',
        state: oneTapState,
        hint: (oneTapApproved && oneTapOn)
          ? 'Done — orders skip repeated wallet popups.'
          : 'Awaiting wallet signature.',
      },
      {
        idx: 3,
        title: 'Apply referral code',
        state: referralState,
        hint: referralState === 'done'
          ? 'Done — Clash referral attached.'
          : 'Best-effort, applied if your wallet has no referrer yet.',
      },
    ];

    const headerStatus = isChecking ? 'CHECKING'
      : isRunning && activationStep?.total > 0
        ? `STEP ${Math.max(1, activationStep.index)} OF ${activationStep.total}`
        : 'ACTION REQUIRED';
    const headerTitle = isRunning
      ? (activationStep.label || 'Setting up Hyperliquid')
      : isChecking
        ? 'Checking your Hyperliquid setup'
        : 'Enable trading permissions';
    const headerSubtitle = isRunning
      ? (stepHint || 'Approve the wallet request to continue.')
      : isChecking
        ? 'Reading builder fee approval and one-tap permission before the panel opens.'
        : 'Hyperliquid opens only after builder-fee routing and one-tap trading are verified.';

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Setting up Hyperliquid…' : 'Hyperliquid setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{
            ...S.body,
            alignItems: 'stretch',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 0,
            background: '#fdf8e7',
          }}>
            <div style={hlGateStyles.frame}>
              {/* Title block — mirrors BridgeStatusModal's status / title /
                  subtitle stack so the two progress dialogs read the
                  same. */}
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{headerStatus}</span>
                <span style={hlGateStyles.title}>{headerTitle}</span>
                <span style={hlGateStyles.subtitle}>{headerSubtitle}</span>
              </div>

              {/* Step bubbles — pending number / active spinner / done ✓ /
                  error !. Same model as BridgeStatusModal.stepBubble_*. */}
              <ol style={hlGateStyles.stepList}>
                {steps.map((s) => (
                  <li key={s.idx} style={hlGateStyles.stepItem}>
                    <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${s.state}`] }}>
                      {s.state === 'done' ? '✓'
                        : s.state === 'error' ? '!'
                        : s.state === 'active' ? <span style={hlGateStyles.spinner} />
                        : s.idx}
                    </span>
                    <span style={hlGateStyles.stepText}>
                      <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${s.state}`] }}>
                        {s.title}
                      </span>
                      <span style={hlGateStyles.stepHint}>{s.hint}</span>
                    </span>
                  </li>
                ))}
              </ol>

              {isRunning ? (
                <div style={hlGateStyles.workingHint}>
                  Keep this window open until all three steps finish.
                </div>
              ) : (
                <button
                  style={{ ...hlGateStyles.primaryBtn, ...((isChecking || loading) ? hlGateStyles.primaryBtnBusy : null) }}
                  disabled={isChecking || loading}
                  onClick={async () => {
                    if (!activate) return;
                    const res = await activate();
                    if (res?.error) setLocalAlert(res.error);
                  }}
                >
                  {isChecking || loading ? 'Please wait…' : 'Set up Hyperliquid →'}
                </button>
              )}

              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== RISEX SETUP GATE ====================
  if (dex === 'risex' && hasWallet && setupVerified !== true) {
    const isRunning = !!activationStep;
    const isChecking = setupVerified === null && !isRunning;
    const needsRisexCode = inviteStatus?.hasAccess === false;
    const risexSignerReady = oneTapTrading?.signerReady === true;
    const risexBuilderApproved = oneTapTrading?.builderApproved === true;
    const risexBuilderRegistered = builderConfig?.registered === true && Number(builderConfig?.builder_id) > 0;
    const risexBuilderRegistrationPending = builderConfig != null && !risexBuilderRegistered;
    const canRegisterRisexBuilder = String(walletAddr || '').toLowerCase()
      === String(builderConfig?.fee_recipient || '').toLowerCase();
    const isRegisteringRisexBuilder = activationStep?.label === 'Register Clash builder code';
    const runIncludesInvite = needsRisexCode || Number(activationStep?.total || 0) === 4;
    const totalSteps = runIncludesInvite ? 4 : 3;
    const stepLabel = activationStep?.label || (
      isChecking
        ? 'Checking RISEx setup'
        : risexBuilderRegistrationPending
          ? 'Register Clash builder code'
        : risexSignerReady && !risexBuilderApproved
          ? 'Approve Clash builder fee (1 bps)'
          : 'Register RISEx signer'
    );
    const risexSteps = runIncludesInvite
      ? [
          { idx: 1, title: 'Redeem RISEx invite code' },
          { idx: 2, title: 'Sign RISEx signer registration' },
          { idx: 3, title: 'Approve Clash builder fee (1 bps)' },
          { idx: 4, title: 'Verify setup on RISEx mainnet' },
        ]
      : [
          { idx: 1, title: 'Sign RISEx signer registration' },
          { idx: 2, title: 'Approve Clash builder fee (1 bps)' },
          { idx: 3, title: 'Verify setup on RISEx mainnet' },
        ];
    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Setting up RISEx...' : 'RISEx setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{ ...S.body, alignItems: 'stretch', overflowY: 'auto', overflowX: 'hidden', padding: 0, background: '#fdf8e7' }}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <img src={DEX_CONFIG.risex.logo} alt="" style={{width: 56, height: 56, objectFit: 'contain', alignSelf: 'center'}} />
                <span style={hlGateStyles.kicker}>{isChecking ? 'CHECKING' : isRunning ? `STEP ${activationStep?.index || 1} OF ${activationStep?.total || totalSteps}` : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>{stepLabel}</span>
                <span style={hlGateStyles.subtitle}>
                  RISEx uses a secure browser signer. Setup also approves the Clash builder fee at exactly 1 bps (0.01%) before orders can be placed.
                </span>
              </div>
              {risexBuilderRegistrationPending && (
                <div style={{
                  width: '100%',
                  maxWidth: 420,
                  padding: 12,
                  border: '2px solid #d7b45b',
                  background: '#fff5cf',
                  boxShadow: '0 3px 0 #c69b3f',
                  color: '#5c3a21',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                }}>
                  <strong style={{fontSize: 14}}>Clash builder code is not registered yet</strong>
                  <span style={{fontSize: 11, lineHeight: 1.4, fontWeight: 700}}>
                    Fee recipient {shortAddr(builderConfig?.fee_recipient)} will receive the canonical 1 bps fee. Trading stays locked until RISEx returns a builder ID.
                  </span>
                  {canRegisterRisexBuilder ? (
                    <button
                      style={{ ...hlGateStyles.primaryBtn, ...(loading ? hlGateStyles.primaryBtnBusy : null) }}
                      disabled={loading}
                      onClick={async () => {
                        const res = await registerBuilderCode?.();
                        if (res?.error) setLocalAlert(res.error);
                        else setLocalAlert(null);
                      }}
                    >
                      {loading ? 'Registering on RISE...' : 'Register Clash builder code'}
                    </button>
                  ) : (
                    <span style={{fontSize: 11, lineHeight: 1.4, fontWeight: 800, color: '#9a6218'}}>
                      Connect the Clash fee-recipient wallet to complete this one-time registration.
                    </span>
                  )}
                </div>
              )}
              <ol style={hlGateStyles.stepList}>
                {risexSteps.map((s) => {
                  const active = isRunning
                    && !isRegisteringRisexBuilder
                    && Number(activationStep?.index || 1) === s.idx;
                  const inviteDone = s.title.includes('invite code') && !needsRisexCode;
                  const signerDone = s.title.includes('signer registration') && risexSignerReady;
                  const builderDone = s.title.includes('builder fee') && risexBuilderApproved;
                  const state = active ? 'active' : (inviteDone || signerDone || builderDone) ? 'done' : 'pending';
                  return (
                    <li key={s.idx} style={hlGateStyles.stepItem}>
                      <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${state}`] }}>
                        {active ? <span style={hlGateStyles.spinner} /> : state === 'done' ? '\u2713' : s.idx}
                      </span>
                      <span style={hlGateStyles.stepText}>
                        <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${state}`] }}>{s.title}</span>
                        <span style={hlGateStyles.stepHint}>
                          {needsRisexCode && s.idx === 1
                            ? 'Sign a message to redeem access before trading.'
                            : s.title.includes('Sign')
                            ? 'Approve the wallet popup on RISE.'
                            : s.title.includes('builder fee')
                            ? `The browser signer caps Clash at 1 bps for builder #${builderConfig?.builder_id || 'pending'}.`
                            : 'The API checks the signer session before opening the panel.'}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {needsRisexCode && !isRunning && (
                <div style={{display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 360}}>
                  <input
                    type="text"
                    placeholder="RISEx invite code"
                    value={risexInviteCode}
                    onChange={e => setRisexInviteCode(e.target.value)}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{...S.input, width: '100%', padding: '10px 12px', fontSize: 14}}
                  />
                  <div style={{fontSize: 11, color: '#B45309', fontWeight: 800, lineHeight: 1.35}}>
                    RISEx mainnet is invite-gated. Redeemed but pending accounts need RISEx to activate access before trading.
                  </div>
                </div>
              )}
              <button
                style={{ ...hlGateStyles.primaryBtn, ...((isChecking || loading) ? hlGateStyles.primaryBtnBusy : null) }}
                disabled={isChecking || loading || risexBuilderRegistrationPending}
                onClick={async () => {
                  if (!activate) return;
                  const res = await activate({ inviteCode: risexInviteCode });
                  if (res?.error) setLocalAlert(res.error);
                  else setRisexInviteCode('');
                }}
              >
                {isChecking || loading ? 'Please wait...' : 'Set up RISEx ->'}
              </button>
              {(error || localAlert) && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error || localAlert, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== PERPL / MONAD SETUP GATE ====================
  if (dex === 'monad' && hasWallet && setupVerified !== true) {
    const perplAuthed = !!tradingConnected;
    const perplChecking = perplAuthed && setupVerified === null;
    const walletAusd = Number(walletUsdc || 0);
    const createAmt = Number(depositAmt || 10);
    const canCreate = perplAuthed && !perplChecking && Number.isFinite(createAmt) && createAmt > 0 && walletAusd + 1e-9 >= createAmt;
    return (
      <>
        <style>{animCSS}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>Setup Perpl Trading</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 24}}>
            <img src={DEX_CONFIG.monad.logo} alt="" style={{width: 64, height: 64, objectFit: 'contain'}} />
            <div style={{color: '#5C3A21', fontSize: 19, fontWeight: 900}}>
              {perplChecking ? 'Checking your Perpl account' : perplAuthed ? 'Create or fund your Perpl account' : 'Sign in to Perpl'}
            </div>
            <div style={{color: '#8a7252', fontSize: 12, fontWeight: 700, maxWidth: 360, lineHeight: 1.45}}>
              {perplChecking
                ? 'Waiting for Perpl to send your wallet snapshot. This usually takes a moment.'
                : perplAuthed
                ? 'Perpl keeps collateral as AUSD inside its Exchange contract. Create the account with AUSD, then the trading panel will unlock.'
                : 'One wallet signature opens a Perpl API session. If this wallet is not approved yet, enter your Perpl access code first.'}
            </div>
            {!perplAuthed && (
              <div style={{width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 6}}>
                <label style={{...S.label, textAlign: 'left'}}>Access Code</label>
                <input
                  type="text"
                  placeholder="Input access code"
                  value={perplAccessCode}
                  onChange={e => setPerplAccessCode(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{...S.input, width: '100%', padding: '10px 12px', fontSize: 14}}
                />
              </div>
            )}
            {perplAuthed && !perplChecking && (
              <div style={{width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 8}}>
                <div style={{...S.fullCard, margin: 0}}>
                  <div style={S.row}>
                    <span style={S.label}>Wallet AUSD</span>
                    <span style={S.detail}>${walletAusd.toFixed(2)}</span>
                  </div>
                  <input
                    type="number"
                    placeholder="Amount (AUSD)"
                    value={depositAmt}
                    onChange={e => setDepositAmt(e.target.value)}
                    style={{...S.input, width: '100%', padding: '10px 12px', fontSize: 14}}
                  />
                </div>
                {walletAusd <= 0 && (
                  <div style={{fontSize: 11, color: '#8a7252', fontWeight: 700, lineHeight: 1.4}}>
                    Your wallet has no AUSD on Monad. Swap or bridge into AUSD first, and keep a small MON balance for gas.
                  </div>
                )}
              </div>
            )}
            <button
              style={{
                ...cartoonBtn(perplAuthed ? '#6F5CFF' : '#4530E0', '#3724B8'),
                padding: '14px 30px',
                minWidth: 240,
                opacity: perplAuthed && !canCreate ? 0.65 : 1,
              }}
              disabled={loading || perplChecking || (perplAuthed && !canCreate)}
              onClick={async () => {
                if (!perplAuthed) {
                  const fn = connectPerpl || linkOurReferrer;
                  if (fn) {
                    const res = await fn({ accessCode: perplAccessCode });
                    if (res && !res.error) setPerplAccessCode('');
                  }
                  return;
                }
                const res = await activate(depositAmt || '10');
                if (!res?.error) setDepositAmt('');
              }}
            >
              {loading || perplChecking ? 'PLEASE WAIT...' : perplAuthed ? 'CREATE ACCOUNT' : 'SIGN IN'}
            </button>
            {error && (
              <div style={{...S.errorBar, maxWidth: 380}} onClick={clearError}>
                <span style={S.errorText}>{humanizeTradeError(error, dex)}</span>
                <span style={S.errorCloseIcon}>×</span>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ==================== PHOENIX SETUP GATE ====================
  if (dex === 'phoenix' && hasWallet && setupVerified !== true) {
    const whitelisted = inviteStatus?.whitelisted === true;
    const waitingForPhoenixState = setupVerified === null;
    const restoringPhoenixSetup = !!inviteStatus?.setupCached && waitingForPhoenixState;
    const checkingInvite = waitingForPhoenixState || (inviteStatus?.whitelisted == null && inviteStatus?.checking);
    const needsCode = inviteStatus?.whitelisted === false;
    return (
      <>
        <style>{animCSS}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>Setup Phoenix Trading</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 24}}>
            <img src={DEX_CONFIG.phoenix.logo} alt="" style={{width: 64, height: 64, objectFit: 'contain'}} />
            <div style={{color: '#5C3A21', fontSize: 19, fontWeight: 900}}>
              {checkingInvite ? (waitingForPhoenixState ? 'Loading Phoenix account' : 'Checking Phoenix access') : whitelisted ? 'Create your Phoenix account' : 'Enter your Phoenix code'}
            </div>
            <div style={{color: '#8a7252', fontSize: 12, fontWeight: 700, maxWidth: 360, lineHeight: 1.45}}>
              {waitingForPhoenixState
                ? (restoringPhoenixSetup ? 'This wallet has a cached Phoenix account. Loading live state now.' : 'Checking live Phoenix trader state before asking for a code.')
                : whitelisted
                ? 'This wallet is allowlisted. Create the on-chain trader account, then deposit USDC to trade.'
                : 'Clash creates the Phoenix trader account first, then applies your referral code with a wallet signature.'}
            </div>
            {checkingInvite ? (
              <div style={{width: '100%', maxWidth: 360, minHeight: 108, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10}}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  borderWidth: 5,
                  borderStyle: 'solid',
                  borderColor: 'rgba(249,115,22,0.22)',
                  borderTopColor: DEX_CONFIG.phoenix.color,
                  animation: 'wallet-spin 0.85s linear infinite',
                }} />
                <div style={{fontSize: 12, color: '#8a7252', fontWeight: 800}}>
                  {waitingForPhoenixState ? 'Loading trader account...' : 'Checking wallet allowlist...'}
                </div>
              </div>
            ) : !whitelisted && (
              <div style={{width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 8}}>
                <input
                  type="text"
                  placeholder="Referral code"
                  value={phoenixInviteCode}
                  onChange={e => setPhoenixInviteCode(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{...S.input, width: '100%', padding: '10px 12px', fontSize: 14}}
                />
                {needsCode && !phoenixInviteCode.trim() && (
                  <div style={{fontSize: 11, color: '#C2410C', fontWeight: 800, lineHeight: 1.35}}>
                    This wallet is not allowlisted yet.
                  </div>
                )}
              </div>
            )}
            <button
              style={{
                ...cartoonBtn('#F97316', '#C2410C'),
                padding: '14px 30px',
                minWidth: 240,
                opacity: loading || checkingInvite ? 0.7 : 1,
              }}
              disabled={loading || checkingInvite}
              onClick={async () => {
                const inviteCode = phoenixInviteCode.trim();
                const ok = await activate({
                  inviteCode,
                  inviteKind: phoenixInviteKind,
                });
                if (ok) setPhoenixInviteCode(inviteCode || PHOENIX_DEFAULT_REFERRAL_CODE);
              }}
            >
              {loading || checkingInvite ? 'PLEASE WAIT...' : whitelisted ? 'CREATE ACCOUNT' : 'ACTIVATE PHOENIX'}
            </button>
            {error && (
              <div style={{
                color: '#B71C1C', fontSize: 12, fontWeight: 700,
                textAlign: 'center', maxWidth: 380, padding: '8px 12px',
                background: '#FFEBEE', borderRadius: 8, border: '1px solid #FFCDD2',
                overflowWrap: 'anywhere', wordBreak: 'break-word',
              }}>{humanizeTradeError(error, dex)}</div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ==================== DECIBEL ACTIVATE GATE ====================
  // Petra is connected but the on-chain trading setup isn't done. The gate
  // takes over the WHOLE futures panel — no trading UI is reachable behind
  // it. The same gate switches between two states without ever showing a
  // popup over something else:
  //   IDLE     → big call-to-action: explanation + step preview + huge
  //              ACTIVATE TRADING button. The button is the only thing the
  //              user can reasonably click here.
  //   RUNNING  → same panel, body replaced by big spinner + current step
  //              + "what's happening" hint + "approve in Petra" prompt.
  //              No buttons (the user is blocked from doing anything else
  //              until they finish or reject the Petra popup).
  // Once activation finishes (`isReady` flips true) the gate falls away
  // and the regular trade tabs render.
  // Show the gate while verification is loading too — that prevents a
  // flash of trading UI before we can confirm the on-chain delegation.
  if (dex === 'decibel' && hasWallet && setupVerified !== true) {
    const isRunning = !!activationStep;
    const isChecking = setupVerified === null && !isRunning;
    const stepHint = activationStep ? (ACTIVATION_STEP_HINTS[activationStep.label] || '') : '';
    const isReturning = !!subaccountAddr;
    const activeLabel = activationStep?.label || '';
    const runIndex = Number(activationStep?.index || 0);

    // Steps shown in the new bridge-style step rail. `runLabels` is what
    // the activation state machine emits when this step is in flight
    // (different from the displayed title for some steps — e.g. "Verify
    // fee routing" maps to the runtime "Enable builder fee routing").
    const decibelSteps = isReturning
      ? (gasSponsored
          ? [
              { idx: 1, title: 'Authorize fast trading',
                hint: 'Lets the Clash server signer place orders for you.',
                runLabels: ['Authorize fast trading'] },
              { idx: 2, title: 'Verify fee routing',
                hint: 'Confirms the builder-fee approval required by this integration.',
                runLabels: ['Enable builder fee routing'] },
            ]
          : [
              { idx: 1, title: 'Check server signer',
                hint: 'The server-side API wallet pays Aptos gas for orders.',
                runLabels: ['Preparing activation…'] },
              { idx: 2, title: 'Authorize fast trading',
                hint: 'Lets the Clash server signer place orders for you.',
                runLabels: ['Authorize fast trading'] },
              { idx: 3, title: 'Verify fee routing',
                hint: 'Confirms the builder-fee approval required by this integration.',
                runLabels: ['Enable builder fee routing'] },
            ])
      : [
          { idx: 1, title: 'Create trading account',
            hint: 'Your subaccount on Decibel — holds USDC + positions.',
            runLabels: ['Create trading account'] },
          { idx: 2, title: 'Authorize fast trading',
            hint: gasSponsored ? 'Trades go through silently after this.' : 'Trades are signed server-side after this.',
            runLabels: ['Authorize fast trading'] },
          { idx: 3, title: 'Enable fee routing',
            hint: 'Required builder-fee approval for this integration.',
            runLabels: ['Enable builder fee routing'] },
        ];

    const steps = decibelSteps.map((s) => {
      let state = 'pending';
      if (isRunning) {
        const isActive = s.runLabels.includes(activeLabel);
        if (isActive) state = 'active';
        else if (runIndex > 0 && s.idx < runIndex) state = 'done';
      }
      return { ...s, state };
    });

    const headerStatus = isChecking ? 'VERIFYING ON-CHAIN'
      : isRunning && activationStep?.total > 0
        ? `STEP ${Math.max(1, activationStep.index)} OF ${activationStep.total}`
        : isRunning ? 'PREPARING'
        : 'ACTION REQUIRED';
    const headerTitle = isRunning
      ? (activationStep.label || 'Setting up Decibel')
      : isChecking
        ? 'Checking your Decibel account'
        : isReturning ? 'Authorize this device' : 'Activate to start trading';
    const headerSubtitle = isRunning
      ? (stepHint || 'Open Petra and approve the request to continue.')
      : isChecking
        ? 'Reading your subaccount and trading delegations from Aptos. This takes a moment on first load.'
        : isReturning
          ? (apiWalletAddr
              ? 'We found your Decibel account and server signer. Just authorize the missing on-chain approvals.'
              : 'We found your Decibel account. Authorize the Clash server signer once so trades sign safely server-side.')
          : 'You cannot open positions until setup verifies on-chain. New accounts usually need 3 one-time Petra signatures.';

    return (
      <>
        <style>{animCSS}</style>
        <style>{`@keyframes act-spin{to{transform:rotate(360deg)}}@keyframes act-pulse{0%,100%{opacity:.7}50%{opacity:1}}`}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>{isRunning ? 'Activating Decibel…' : 'Decibel setup'}</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{
            ...S.body,
            alignItems: 'stretch',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 0,
            background: '#fdf8e7',
          }}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <span style={hlGateStyles.kicker}>{headerStatus}</span>
                <span style={hlGateStyles.title}>{headerTitle}</span>
                <span style={hlGateStyles.subtitle}>{headerSubtitle}</span>
              </div>

              <ol style={hlGateStyles.stepList}>
                {steps.map((s) => (
                  <li key={s.idx} style={hlGateStyles.stepItem}>
                    <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${s.state}`] }}>
                      {s.state === 'done' ? '✓'
                        : s.state === 'error' ? '!'
                        : s.state === 'active' ? <span style={hlGateStyles.spinner} />
                        : s.idx}
                    </span>
                    <span style={hlGateStyles.stepText}>
                      <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${s.state}`] }}>
                        {s.title}
                      </span>
                      <span style={hlGateStyles.stepHint}>{s.hint}</span>
                    </span>
                  </li>
                ))}
              </ol>

              {isRunning ? (
                <div style={hlGateStyles.workingHint}>
                  Open Petra and approve the request — don't close this window.
                </div>
              ) : (
                <button
                  style={{ ...hlGateStyles.primaryBtn, ...(isChecking ? hlGateStyles.primaryBtnBusy : null) }}
                  disabled={isChecking}
                  onClick={() => { if (linkOurReferrer) linkOurReferrer(); }}
                >
                  {isChecking ? 'Please wait…' : isReturning ? 'Authorize this device →' : 'Activate trading →'}
                </button>
              )}

              {!isRunning && !isChecking && (
                <div style={hlGateStyles.footnote}>
                  Your USDC and APT stay in your wallet — Decibel is non-custodial.
                </div>
              )}

              {error && (
                <div style={hlGateStyles.errorBox}>
                  {humanizeTradeError(error, dex)}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ==================== DECIBEL DEPOSIT GATE ====================
  // User is fully activated but has no USDC on the subaccount yet — no
  // collateral means no trading. Take over the panel with a deposit
  // prompt, same vibe as the activate gate. The user enters an amount,
  // hits DEPOSIT, Petra signs `deposit_to_subaccount_at`, gate falls
  // away once the balance shows up.
  //
  // Skipped if any of:
  //   • `dataReady` is false (still loading) — avoid flashing the gate
  //     before the first poll comes in
  //   - `accountReady` is false (still loading the Decibel balance read)
  //   • user has open positions (they're in the middle of trading)
  //   • subaccount has any equity OR withdrawable USDC > 0
  if (
    dex === 'decibel' && hasWallet && isReady && dataReady && accountReady
    && (positions?.length || 0) === 0
    && Number(account?.perp_equity_balance ?? 0) <= 0
    && Number(account?.usdc_cross_withdrawable_balance ?? 0) <= 0
  ) {
    return (
      <DecibelDepositGate
        panelRef={panelRef}
        fullscreen={fullscreen}
        isMobile={isMobile}
        isDragging={isDragging}
        posRef={posRef}
        onClose={handleClose}
        onPointerDown={handlePointerDown}
        walletUsdc={walletUsdc}
        depositToTradingAccount={depositToPacifica}
        loading={loading}
        error={error}
      />
    );
  }

  // ==================== TRADE TAB ====================
  const renderTrade = () => {
    // Funding / borrow rate badge (top-right of chart).
    const fundingBadge = currentMarket ? (
      <div style={{ ...S.fundingOverlay, ...(hasOstiumRollover ? S.fundingOverlayCompact : null) }}>
        {fundingOverlayLabel ? <span style={S.fundingOLabel}>{fundingOverlayLabel}</span> : null}
        <span style={{ ...S.fundingOValue, ...(hasOstiumRollover ? S.fundingOValueCompact : null), color: fundingColor }}>
          {fundingOverlayText}
        </span>
      </div>
    ) : null;

    // Floating pill — bottom-right of chart, opposite TradingView logo.
    // Single button opens the Trade Idea modal (chart + narrative in one).
    const explainBadge = (
      <button
        data-nodrag
        onClick={() => setTradeIdeaOpen(true)}
        className="explain-chart-pill"
        title="Get a trade idea (entry / TP / SL)"
        aria-label="Trade Idea"
      >
        <img src={elfaBadge} alt="" className="explain-q" />
        <span className="explain-label">Trade idea</span>
      </button>
    );

    if (fullscreen) {
      if (isMobile) {
        return (
          <div style={{display: 'flex', flexDirection: 'column', flex: '0 0 auto', minHeight: '100%', overflow: 'visible'}}>
            {renderSymbolBar()}
            {/* Top: chart */}
            <div style={{flex: '0 0 clamp(220px, 38vh, 360px)', position: 'relative', minHeight: 180}}>
              <TradingViewWidget symbol={symbol} pythSymbol={currentMarket?.pyth_symbol} positions={positions} orders={displayOrders} currentPrice={currentPrice} chartOverlay={explainBadge} dex={dex} />
              {fundingBadge}
            </div>

            {/* Bottom: Trade controls */}
            <div style={{
              flex: '0 0 auto',
              minHeight: 'auto',
              overflow: 'visible',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
              background: '#e8dfc8',
              borderTop: '2px solid #d4c8b0',
            }}>
              {renderTradeControls({ compactMobile: true, parentScroll: true })}
            </div>
          </div>
        );
      }

      return (
        <div style={{display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden'}}>
          {renderSymbolBar()}
          {/* Top: chart + orderbook + controls */}
          <div style={{display: 'flex', flex: '1 1 auto', minHeight: 0, overflow: 'hidden'}}>
            <div style={{flex: `0 0 ${chartPct}%`, maxWidth: `${chartPct}%`, minHeight: 0, overflow: 'hidden', position: 'relative'}}>
              <TradingViewWidget symbol={symbol} pythSymbol={currentMarket?.pyth_symbol} positions={positions} orders={displayOrders} currentPrice={currentPrice} chartOverlay={explainBadge} dex={dex} />
            </div>
            {(dex === 'pacifica' || dex === 'phoenix' || dex === 'decibel' || dex === 'bulk') && (
              <>
                {/* Drag handle: chart ↔ orderbook */}
                <div style={S.dragHandleV} onMouseDown={dragChart} />
                <div style={{flex: `0 0 ${obWidth}px`, minHeight: 0, overflow: 'hidden'}}>
                  {/* Decibel paints an authenticated snapshot first, then
                      follows its live depth WebSocket with key failover. */}
                  <OrderBook
                    symbol={symbol}
                    dex={dex}
                    marketName={currentMarket?.market_name}
                    marketAddr={currentMarket?.market_addr}
                    priceStep={orderBookStep}
                    onPriceStepChange={setOrderBookStep}
                    onTopOfBookChange={setTopOfBook}
                  />
                </div>
                {/* Drag handle: orderbook ↔ controls */}
                <div style={S.dragHandleV} onMouseDown={dragOb} />
              </>
            )}
            <div style={{flex: '1 1 0', minWidth: 0, minHeight: 0, overflow: 'hidden'}}>{renderTradeControls()}</div>
          </div>
          {/* Drag handle: top ↔ bottom */}
          <div style={S.dragHandleH} onMouseDown={dragBottom} />
          {/* Bottom: positions/orders panel */}
          <BottomPanel
            bottomH={bottomH}
            bottomTab={bottomTab}
            setBottomTab={setBottomTab}
            showFilter={showFilter}
            setShowFilter={setShowFilter}
            btmFilters={btmFilters}
            setBtmFilters={setBtmFilters}
            btmSymbols={btmSymbols}
            sortOptionsForTab={sortOptionsForTab}
            hasActiveFilters={hasActiveFilters}
            filteredPositions={filteredPositions}
            filteredOrders={filteredOrders}
            orders={displayOrders}
            positions={positions}
            prices={prices}
            walletAddr={walletAddr}
            historyAccountAddr={(dex === 'decibel' || dex === 'grvt') ? subaccountAddr : walletAddr}
            markets={markets}
            dataReady={dataReady}
            leverageSettings={leverageSettings}
            closePosition={closePosition}
            cancelOrder={cancelOrder}
            dex={dex}
            loading={loading}
            pendingActions={pendingActions}
            beginPendingClose={beginPendingClose}
            removePendingAction={removePendingAction}
          />
        </div>
      );
    }
    // Normal (mobile) layout: symbol bar, chart with funding overlay, controls
    return (
      <>
        {renderSymbolBar()}
        <div style={{...S.chartArea, position: 'relative'}}>
          <TradingViewWidget symbol={symbol} pythSymbol={currentMarket?.pyth_symbol} positions={positions} orders={displayOrders} currentPrice={currentPrice} chartOverlay={explainBadge} dex={dex} />
          {fundingBadge}
        </div>
        {renderTradeControls()}
      </>
    );
  };

  // ==================== POSITIONS TAB ====================
  const renderPositions = () => {
    if (!openedSortedPositions.length) {
      return (
        <div style={S.empty}>
          <div style={{opacity: 0.3, color: '#5C3A21'}}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>{dataReady ? 'No Positions' : 'Loading...'}</div>
        </div>
      );
    }
    return (
      // Stack positions vertically so every card stretches to the panel's
      // full width. Earlier `flexWrap: 'wrap'` + `flex: '0 0 auto'` on each
      // card auto-sized them by content — markets with longer Size strings
      // (e.g. "186.4830769386677") rendered visibly wider than markets
      // with short numbers (e.g. "0.00617758"), giving the position list
      // a ragged staircase look. Column + stretch (the default
      // `align-items` for column flex) gives a clean uniform list.
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {openedSortedPositions.map((pos, i) => {
          const { entryP, markP, margin, pnlVal, setLev, posValueUsd, pnlPct, pnlDirection, pnlColor, isDust, dustUsd } = getPositionMetrics(pos, prices, leverageSettings);
          const amt = numOrNull(pos.amount) || 0;
          const tpslMetrics = { entryP, markP, amt, margin, setLev, posValueUsd };
          const posKey = `${pos.symbol}-${pos.side}`;
          const expanded = expandedPos?.startsWith(posKey) ? expandedPos.split(':')[1] : null;
          const tpslBusy = tpslSubmittingPos === posKey;
          const ostiumTpMax = ostiumTpInputMax(dex, pos);
          const initialTpsl = tpslInitial.key === posKey ? tpslInitial : { tp: '', sl: '' };
          const tpSubmit = tpslSubmitValue({ pos, metrics: tpslMetrics, leg: 'tp', mode: tpslInputMode, value: tpPrice, initialValue: initialTpsl.tp });
          const slSubmit = tpslSubmitValue({ pos, metrics: tpslMetrics, leg: 'sl', mode: tpslInputMode, value: slPrice, initialValue: initialTpsl.sl });
          const changedTpPrice = tpSubmit.value;
          const changedSlPrice = slSubmit.value;
          const hasTpslChanges = tpSubmit.changed || slSubmit.changed;

          // Basic mode shows a stripped-down card: ticker + UP/DOWN icon +
          // leverage + dollar PnL + Close. No size, no entry/mark prices,
          // no percentages, no ISO/CROSS badge — those are noise for a
          // first-time trader who just wants "am I winning?".
          if (isBasic) {
            // Snapshot of the open trade for the manual share button.
            // Stored as a plain object so the image generator does not depend
            // on live positions[] mutating after a close.
            const snapshot = {
              symbol: pos.symbol,
              side: pos.side === 'bid' ? 'long' : 'short',
              leverage: isDust ? 0 : setLev,
              entryPrice: entryP,
              exitPrice: markP,
              pnlUsd: pnlVal,
              pnlPct: pnlPct,
              isOpen: true,
            };
            const handleClose = async () => {
              const amount = dex === 'avantis' ? parseFloat(pos.margin) : parseFloat(pos.amount);
              const pending = beginPendingClose(pos, amount, true);
              const result = await closePosition(
                pos.symbol, pos.side,
                String(amount),
                pos.pair_index, pos.trade_index, true,
                dex === 'flash' ? { position: pos, inputUsdUi: String(dustUsd || posValueUsd) } : undefined,
              );
              if (result?.error && pending?.id) removePendingAction(pending.id);
            };
            const pendingClose = pendingActionForPosition(pendingActions, pos, 'close');
            return (
              <div key={positionStableKey(pos) || i} style={S.posCard}>
                <div style={S.row}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 8, minWidth: 0}}>
                    <span style={{fontSize: 16, fontWeight: 900}}>{pos.symbol}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 900,
                      padding: '2px 8px', borderRadius: 6,
                      color: '#fff',
                      background: pos.side === 'bid'
                        ? 'linear-gradient(180deg, #4caf50 0%, #2e7d32 100%)'
                        : 'linear-gradient(180deg, #ef5350 0%, #c62828 100%)',
                      letterSpacing: '0.5px',
                      textShadow: '0 1px 0 rgba(0,0,0,0.3)',
                    }}>
                      {pos.side === 'bid' ? '▲ UP' : '▼ DOWN'}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: '#a3906a',
                      background: '#fdf8e7', padding: '2px 6px',
                      borderRadius: 5, border: '1px solid #d4c8b0',
                    }}>{isDust ? 'DUST' : formatPositionLeverageBadge(setLev)}</span>
                  </div>
                  <span style={{
                    fontSize: 18, fontWeight: 900, color: pnlColor,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatSignedPnlUsd(pnlVal)}
                  </span>
                </div>

                {/* Action row: Close (big) + Share (icon-only). Share works
                    only when the user explicitly asks for the image. */}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    style={{...S.btnRed, flex: 1, padding: '10px'}}
                    onClick={handleClose}
                    disabled={loading || !!pendingClose}
                  >
                    {pendingClose
                      ? <ClosingButtonLabel text={pendingPhaseLabel(pendingClose.phase, 'Closing position...')} />
                      : loading ? <ClosingButtonLabel text="Closing position..." /> : (isDust ? 'Clean up dust' : 'Close position')}
                  </button>
                  <button
                    style={{
                      width: 44, padding: 0,
                      background: 'rgba(255,255,255,0.6)',
                      border: '2px solid #d4c8b0',
                      borderRadius: 8,
                      color: '#5C3A21',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    onClick={() => setShareTrade(snapshot)}
                    title="Share this trade"
                    aria-label="Share trade"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2.5"
                         strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          }

          // Pro path — same open-trade snapshot pattern as Basic. Captured
          // once per render so a later positions[] mutation can't blank out
          // the image when the user taps Share.
          const proSnapshot = {
            symbol: pos.symbol,
            side: pos.side === 'bid' ? 'long' : 'short',
            leverage: isDust ? 0 : setLev,
            entryPrice: entryP,
            exitPrice: markP,
            pnlUsd: pnlVal,
            pnlPct: pnlPct,
            isOpen: true,
          };
          const handleProClose = async (closeFraction) => {
            const amount = (dex === 'avantis' ? parseFloat(pos.margin) : parseFloat(pos.amount)) * closeFraction;
            const pending = beginPendingClose(pos, amount, closeFraction >= 1);
            const result = await closePosition(
              pos.symbol, pos.side, String(amount),
              pos.pair_index, pos.trade_index, closeFraction >= 1,
              dex === 'flash' ? { position: pos, inputUsdUi: String((dustUsd || posValueUsd) * closeFraction) } : undefined,
            );
            if (result?.error && pending?.id) removePendingAction(pending.id);
          };
          const pendingClose = pendingActionForPosition(pendingActions, pos, 'close');
          return (
            <div key={positionStableKey(pos) || i} style={S.posCard}>
              <div style={S.row}>
                <span style={{fontSize: 16, fontWeight: 900}}>{pos.symbol}</span>
                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  {(() => {
                    const isIso = dex === 'gmtrade' ? true : (pos.is_isolated ?? marginModes?.[pos.symbol]);
                    return (
                      <span style={{fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, borderWidth: 1, borderStyle: 'solid', borderColor: isIso ? '#FF9800' : '#4CAF50', color: isIso ? '#FF9800' : '#4CAF50', background: 'rgba(255,255,255,0.4)'}}>
                        {isIso ? 'ISO' : 'CROSS'}
                      </span>
                    );
                  })()}
                  <span style={{fontSize: 11, fontWeight: 800, color: isDust ? '#8a6d2f' : '#a3906a', background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{isDust ? 'DUST' : formatPositionLeverageBadge(setLev)}</span>
                  <span style={{fontSize: 13, fontWeight: 900, color: pos.side === 'bid' ? '#4CAF50' : '#E53935'}}>
                    {pos.side === 'bid' ? 'LONG' : 'SHORT'}
                  </span>
                </div>
              </div>
              <div style={S.row}>
                <span style={S.detail}>{isDust ? 'Dust' : 'Size'}: {isDust ? `$${dustUsd.toFixed(2)}` : (pos.amount_display || formatPositionAmount(pos.amount))} {!isDust && <span style={{color: '#a3906a'}}>(${posValueUsd.toFixed(2)})</span>}</span>
                <span style={S.detail}>Entry: ${fmtPrice(parseFloat(pos.entry_price))}</span>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Mark: ${fmtPrice(markP)}</span>
                <span style={{fontSize: 14, fontWeight: 900, color: pnlColor}}>
                  {formatSignedPnlUsd(pnlVal)} {!isDust && `(${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`}
                </span>
              </div>
              {/* Liquidation price row — visible on every venue that ships
                  it through the position normaliser. Reading the figure
                  off the card was raised in the audit as a critical UX
                  hazard for any leveraged trader. We colour it red as a
                  passive warning when the mark sits within ±10% of liq. */}
              {(() => {
                if (isDust) return null;
                const liq = parseFloat(pos.liquidation_price || 0);
                if (!(liq > 0)) return null;
                const distPct = markP > 0 ? Math.abs(markP - liq) / markP * 100 : 100;
                const danger = distPct < 10;
                return (
                  <div style={S.row}>
                    <span style={{ ...S.detail, color: danger ? '#E53935' : '#a3906a' }}>
                      Liq: ${fmtPrice(liq)}
                      {markP > 0 && <span style={{ marginLeft: 6, fontWeight: 700 }}>({distPct.toFixed(1)}% away)</span>}
                    </span>
                    <span style={S.detail} />
                  </div>
                );
              })()}
              <PositionTpslRow pos={pos} orders={displayOrders} />

              {/* Action buttons: Close + TP/SL + Share-icon. Share lives in
                  Pro too (per-user-request) — same icon as Basic for
                  consistency. */}
              <div style={{display: 'flex', gap: 6, marginTop: 4}}>
                <button style={S.btnRed} onClick={() => { setClosePct(100); setExpandedPos(expanded === 'close' ? null : `${posKey}:close`); }}>{isDust ? 'Clean up' : 'Close'}</button>
                {!isDust && !isBasic && (
                  <button style={S.btnBlue} onClick={() => {
                    if (expanded === 'tpsl') {
                      setExpandedPos(null);
                      setTpslInitial({ key: null, tp: '', sl: '' });
                      setTpslInputMode('price');
                      return;
                    }
                    const { tp, sl } = getPositionTpsl(pos, displayOrders);
                    const nextTp = formatTpslInputValue(tp);
                    const nextSl = formatTpslInputValue(sl);
                    setTpPrice(nextTp);
                    setSlPrice(nextSl);
                    setTpslInputMode('price');
                    setTpslInitial({ key: posKey, tp: nextTp, sl: nextSl });
                    setExpandedPos(`${posKey}:tpsl`);
                  }}>TP/SL</button>
                )}
                <button
                  style={{
                    width: 32, padding: 0,
                    background: 'rgba(255,255,255,0.6)',
                    border: '1px solid #d4c8b0',
                    borderRadius: 6,
                    color: '#5C3A21',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  onClick={() => setShareTrade(proSnapshot)}
                  title="Share this trade"
                  aria-label="Share trade"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2.5"
                       strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
              </div>

              {/* Close slider */}
              {expanded === 'close' && (
                <div style={S.expandPanel}>
                  <div style={S.row}>
                    <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>{isDust ? 'Clean up Flash dust' : `Close ${closePct}%`}</span>
                    <span style={{fontSize: 11, color: '#a3906a', fontWeight: 700}}>
                      {formatCloseAmountLabel(pos, closePct, posValueUsd, isDust, dustUsd)}
                    </span>
                  </div>
                  {!isDust && (
                    <>
                      <input type="range" min="5" max="100" step="5" value={closePct} className="grad-slider" onChange={e => setClosePct(Number(e.target.value))} style={{...S.slider, '--val': `${((closePct - 5) / 95) * 100}%`}} />
                      <div style={S.sliderLabels}><span>5%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                    </>
                  )}
                  <button style={{...S.btnRed, width: '100%'}} onClick={() => handleProClose(isDust ? 1 : closePct / 100)} disabled={loading || !!pendingClose}>
                    {pendingClose
                      ? <ClosingButtonLabel text={pendingPhaseLabel(pendingClose.phase, 'Closing...')} />
                      : loading ? <ClosingButtonLabel /> : (isDust ? 'Clean up dust' : `Close ${closePct}%`)}
                  </button>
                </div>
              )}

              {/* TP/SL panel — gated on Basic mode (button is hidden too). */}
              {!isDust && !isBasic && expanded === 'tpsl' && (
                <TpslEditor
                  mode={tpslInputMode}
                  onModeChange={(nextMode) => {
                    setTpslInputMode(nextMode);
                    setTpPrice('');
                    setSlPrice('');
                  }}
                  tpValue={tpPrice}
                  slValue={slPrice}
                  onTpChange={setTpPrice}
                  onSlChange={setSlPrice}
                  pos={pos}
                  metrics={tpslMetrics}
                  ostiumTpMax={ostiumTpMax}
                  busy={tpslBusy}
                  busyLabel="Setting..."
                  loading={loading}
                  hasChanges={hasTpslChanges}
                  onSubmit={async () => {
                    if (!hasTpslChanges) {
                      setLocalAlert('Change TP or SL before setting.');
                      return;
                    }
                    if (tpSubmit.error || slSubmit.error) {
                      setLocalAlert(tpSubmit.error || slSubmit.error);
                      return;
                    }
                    if (!validateTpslBeforeSubmit({ dex, pos, tpPrice: changedTpPrice, slPrice: changedSlPrice, setLocalAlert })) return;
                    setTpslSubmittingPos(posKey);
                    try {
                      const r = await setTpsl(pos.symbol, positionCloseSide(pos), changedTpPrice, changedSlPrice, pos.pair_index, pos.trade_index, pos.amount, pos.market_addr);
                    if (r?.error) {
                      setLocalAlert(r.error);
                      return;
                    }
                    setTpPrice(''); setSlPrice(''); setTpslInputMode('price'); setTpslInitial({ key: null, tp: '', sl: '' }); setExpandedPos(null);
                    if (r?.info) setSuccessMsg(r.info);
                  } catch (e) {
                    setLocalAlert(e?.message || String(e));
                  } finally {
                    setTpslSubmittingPos((current) => current === posKey ? null : current);
                  }
                }}
              />
              )}
            </div>
          );
        })}

        {successMsg && (
          <div style={S.successBar} onClick={() => setSuccessMsg(null)}>
            <span>✓ {successMsg}</span>
          </div>
        )}
      </div>
    );
  };

  // ==================== ORDERS TAB ====================
  const renderOrders = () => {
    if (!groupedDisplayOrders.length) {
      return (
        <div style={S.empty}>
          <div style={{opacity: 0.3, color: '#5C3A21'}}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </div>
          <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>No Orders</div>
        </div>
      );
    }
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {groupedDisplayOrders.map((o, i) => {
          const sym = o.symbol || o.s;
          const side = o.side || o.d;
          const price = orderDisplayPrice(o);
          const type = orderDisplayType(o, positions);
          const priceLabel = orderPriceDetailLabel(o, type);
          const leverageValue = orderDisplayLeverage(o, leverageSettings[sym]);
          const metrics = orderCardMetrics(o, positions, price, leverageValue);
          const amountLabel = formatOrderBaseAmount(metrics, sym);
          const isBid = orderPositionSide(o) === 'bid' || side === 'bid';
          const sideLabel = orderSideLabel(o);
          const isTP = type.includes('TAKE') || type.includes('TP');
          const isSL = type.includes('STOP') || type.includes('SL');
          const pending = isOrderPendingConfirmation(o);
          const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
          return (
            <div key={orderStableKey(o, i)} style={S.posCard}>
              <div style={S.row}>
                <span style={{fontSize: 16, fontWeight: 900}}>{sym}</span>
                <span style={{fontSize: 10, fontWeight: 800, color: typeColor, background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{type}</span>
                {pending ? <OrderPendingBadge /> : null}
                <span style={{fontSize: 13, fontWeight: 900, color: isBid ? '#4CAF50' : '#E53935'}}>
                  {sideLabel}
                </span>
                {pending ? (
                  <span style={{fontSize: 10, fontWeight: 800, color: '#8b7655'}}>Pending</span>
                ) : isReadOnlyOrder(o) ? (
                  <span style={{fontSize: 10, fontWeight: 800, color: '#8b7655'}}>On position</span>
                ) : (
                  <button
                    style={S.cancelBtn}
                    onClick={() => dex === 'hotstuff'
                      ? cancelOrder(o)
                      : cancelOrder(sym, o.order_id ?? o.i, o.pair_index, o.trade_index)}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div style={{...S.row, justifyContent: 'flex-start', flexWrap: 'wrap', gap: '4px 10px'}}>
                <span style={S.detail}>{priceLabel}: {formatOrderPrice(price)}</span>
                <span style={S.detail}>Amount: {amountLabel}</span>
                {metrics.marginUsd != null ? <span style={S.detail}>Margin: {formatOrderUsd(metrics.marginUsd)}</span> : null}
                {metrics.notionalUsd != null ? <span style={S.detail}>Size: {formatOrderUsd(metrics.notionalUsd)}</span> : null}
              {leverageValue != null ? <span style={S.detail}>Lev: {leverageValue}x</span> : null}
            </div>
            <AttachedTpslSummary order={o} />
          </div>
        );
      })}
      </div>
    );
  };

  // ==================== RENDER ====================
  // ==================== ACCOUNT TAB ====================
  const renderAccount = () => {
    // Pacifica: direct human-USDC fields. Avantis: also direct USDC. Decibel:
    // raw 1e6 base units in `usdc_*_balance` keys. Branch on `dex` so the
    // Balance card shows the right number on each venue instead of $0 (the
    // Decibel keys don't exist on the Pacifica/Avantis schema and vice
    // versa).
    let equity, available, marginUsed;
    if (dex === 'decibel') {
      // Decibel's `/api/v1/account_overviews` returns USDC fields as
      // HUMAN-READABLE doubles (e.g. 5.0 = $5), NOT raw 1e6 chain units.
      // Verified via REST: `{ "perp_equity_balance": 5.0, ... }`. Earlier
      // /1e6 scaling here showed every balance as $0.000005.
      const cross = Number(account?.usdc_cross_withdrawable_balance || 0);
      const isol = Number(account?.usdc_isolated_withdrawable_balance || 0);
      const perpEquity = Number(account?.perp_equity_balance || 0);
      // `total_margin` is the gross margin allocated to open positions.
      // The earlier formula subtracted `available` (free margin) from it,
      // double-counting and producing a wrong number once a position
      // existed (Margin Used would underread by the free-margin value).
      // total_margin IS Margin Used directly. Fall back to maintenance_margin
      // (the liquidation threshold) only when total_margin is missing.
      const totalMargin = Number(account?.total_margin || 0);
      const maintMargin = Number(account?.maintenance_margin || 0);
      equity = perpEquity || (cross + isol);
      available = cross + isol;
      marginUsed = Math.max(0, totalMargin || maintMargin);
    } else if (dex === 'ostium') {
      const walletBalance = Number(account?.usdc_balance ?? walletUsdc ?? 0);
      equity = Math.max(0, Number(account?.equity || 0), Number.isFinite(walletBalance) ? walletBalance : 0);
      available = Math.max(0, Number.isFinite(walletBalance) ? walletBalance : 0);
      marginUsed = parseFloat(account?.margin_used ?? 0);
    } else if (dex === 'grvt') {
      equity = parseFloat(account?.account_equity ?? account?.total_account_value ?? account?.equity ?? account?.balance ?? account?.usdc ?? 0);
      available = parseFloat(account?.available_to_withdraw ?? account?.available_to_spend ?? account?.available_balance ?? account?.usdc ?? 0);
      marginUsed = parseFloat(account?.total_margin_used ?? account?.total_initial_margin ?? account?.initial_margin ?? 0);
    } else if (dex === 'flash') {
      equity = parseFloat(account?.account_equity ?? account?.equity ?? account?.balance ?? 0);
      available = parseFloat(account?.available_to_spend ?? account?.free_margin ?? account?.available_to_withdraw ?? 0);
      marginUsed = parseFloat(account?.total_margin_used ?? account?.margin_used ?? 0);
    } else {
      equity = parseFloat(account?.account_equity || 0);
      available = parseFloat(account?.available_to_withdraw || 0);
      marginUsed = parseFloat(account?.total_margin_used || 0);
    }
    const phoenixHasMarginRisk = dex === 'phoenix' && ((positions?.length || 0) > 0 || (orders?.length || 0) > 0);
    const withdrawReserve = phoenixHasMarginRisk ? 0.01 : (dex === 'nado' ? 1 : 0);
    const withdrawMax = Math.max(0, available - withdrawReserve);
    const hyperliquidSpot = dex === 'hyperliquid'
      ? Math.max(0, Number(account?.spot_usdc_balance ?? 0))
      : 0;
    const hyperliquidSpotFree = dex === 'hyperliquid'
      ? Math.max(0, Number(account?.spot_usdc_available ?? account?.spot_usdc_balance ?? 0))
      : 0;
    const hyperliquidUnified = dex === 'hyperliquid'
      && (account?.abstraction_mode === 'unifiedAccount' || account?.abstraction_mode === 'portfolioMargin' || account?.is_unified_account === true);
    const grvtFundingBalance = dex === 'grvt'
      ? Math.max(0, Number(account?.funding_balance ?? account?.funding_total_equity ?? 0))
      : 0;
    const grvtFundingCurrency = account?.funding_currency || 'USDT';
    const risexWalletState = dex === 'risex'
      ? (walletUsdcStatus?.status || (walletUsdc == null ? 'checking' : 'ready'))
      : null;
    const risexWalletBusy = risexWalletState === 'checking' || risexWalletState === 'switching';
    const risexWalletNeedsSwitch = risexWalletState === 'wrong_chain';
    const risexWalletError = risexWalletState === 'error';
    const risexWalletMessage = dex === 'risex'
      ? (walletUsdcStatus?.message
        || (risexWalletNeedsSwitch ? 'Switch your wallet to RISE to read your RISE USDC balance.' : null))
      : null;
    const risexWalletValue = (() => {
      if (dex !== 'risex') return walletUsdc !== null ? `$${walletUsdc.toFixed(2)}` : '$--';
      if (walletUsdc !== null && !risexWalletNeedsSwitch && !risexWalletError) return `$${walletUsdc.toFixed(2)}`;
      if (risexWalletNeedsSwitch) return 'Switch to RISE';
      if (risexWalletError) return 'Unavailable';
      return risexWalletState === 'switching' ? 'Switching...' : 'Checking...';
    })();
    const risexWalletValueColor = risexWalletNeedsSwitch
      ? '#B45309'
      : risexWalletError
      ? '#B91C1C'
      : '#5C3A21';
    const risexDepositSources = Array.isArray(bridgeDepositSources) && bridgeDepositSources.length
      ? bridgeDepositSources
      : RISEX_BRIDGE_CHAINS;
    const risexDepositSource = risexDepositSources.find(chain => Number(chain.id) === Number(bridgeDepositSourceChainId))
      || risexDepositSources[0];
    const risexSourceBalance = dex === 'risex' && risexDepositSource
      ? bridgeSourceBalances?.[Number(risexDepositSource.id)]
      : null;
    const risexSourceBalanceState = dex === 'risex' && risexDepositSource
      ? bridgeSourceBalanceStatus?.[Number(risexDepositSource.id)]?.status
      : null;
    const risexSourceBalanceText = (() => {
      if (dex !== 'risex') return '';
      if (typeof risexSourceBalance === 'number' && Number.isFinite(risexSourceBalance)) return `$${risexSourceBalance.toFixed(2)}`;
      if (risexSourceBalanceState === 'checking') return 'checking...';
      if (risexSourceBalanceState === 'error') return 'unavailable';
      return '$--';
    })();
    const depositActionBusy = ['preparing', 'switching', 'approving', 'signing', 'confirming', 'bridging', 'depositing']
      .includes(String(depositStatus?.status || ''));
    const risexDepositBusy = dex === 'risex' && depositActionBusy;
    const depositButtonLabel = (() => {
      if (dex === 'grvt') return loading ? '...' : 'Open';
      if (depositStatus?.status === 'preparing') return 'Preparing...';
      if (depositStatus?.status === 'switching') return 'Switching...';
      if (depositStatus?.status === 'approving') return 'Approve...';
      if (depositStatus?.status === 'signing') return 'Sign...';
      if (depositStatus?.status === 'confirming') return 'Confirming...';
      if (depositStatus?.status === 'bridging') return 'Bridging...';
      if (depositStatus?.status === 'depositing') return 'Depositing...';
      return loading ? '...' : 'Deposit';
    })();
    const handleSwitchToRise = async () => {
      if (!switchToRise) return;
      const res = await switchToRise();
      if (res?.error) setLocalAlert(res.error);
      else setLocalAlert('Wallet switched to RISE. Balance is refreshing.');
    };
    const nadoWalletState = dex === 'nado'
      ? (walletUsdcStatus?.status || (walletUsdc == null ? 'checking' : 'ready'))
      : null;
    const nadoWalletBusy = nadoWalletState === 'checking' || nadoWalletState === 'switching';
    const nadoWalletError = nadoWalletState === 'wrong_chain' || nadoWalletState === 'error';
    const nadoWalletMessage = dex === 'nado' ? walletUsdcStatus?.message : null;
    const nadoDepositAssets = [
      { id: 'usdt0', label: 'USDt0' },
      { id: 'usdc', label: 'USDC' },
    ];
    const selectedNadoDepositAsset = nadoDepositAssets.find(row => row.id === nadoDepositAsset) || nadoDepositAssets[0];
    const nadoWalletBalances = dex === 'nado' && walletUsdcStatus?.balances && typeof walletUsdcStatus.balances === 'object'
      ? walletUsdcStatus.balances
      : {};
    const selectedNadoWalletBalance = Number(nadoWalletBalances[selectedNadoDepositAsset.id]);
    const nadoWalletValue = (() => {
      if (dex !== 'nado') return walletUsdc !== null ? `$${walletUsdc.toFixed(2)}` : '$--';
      if (Number.isFinite(selectedNadoWalletBalance) && !nadoWalletError) return `$${selectedNadoWalletBalance.toFixed(2)}`;
      if (walletUsdc !== null && !nadoWalletError) return `$${walletUsdc.toFixed(2)}`;
      if (nadoWalletState === 'wrong_chain') return 'Switch to Ink';
      if (nadoWalletState === 'error') return 'Unavailable';
      return nadoWalletState === 'switching' ? 'Switching...' : 'Checking...';
    })();
    const nadoWalletValueColor = nadoWalletError ? '#B91C1C' : '#5C3A21';
    const handleSwitchToInk = async () => {
      const fn = switchToInk || activate;
      if (!fn) return;
      const res = await fn();
      if (res?.error) setLocalAlert(res.error);
      else setLocalAlert('Wallet switched to Ink. Balance is refreshing.');
    };
    const showWalletBalanceCard = dex !== 'hibachi';
    const walletBalanceLabel = dex === 'hyperliquid'
      ? 'Arbitrum Wallet USDC'
      : dex === 'hotstuff'
      ? 'Ethereum Wallet USDC'
      : dex === 'gmtrade'
      ? 'GMTrade Wallet'
      : dex === 'katana'
      ? 'Katana Available USDC'
      : dex === 'risex'
      ? 'RISE Wallet USDC'
      : dex === 'nado'
      ? `Ink Wallet ${selectedNadoDepositAsset.label}`
      : dex === 'grvt'
      ? 'GRVT Trading USDC'
      : 'Wallet USDC';
    const walletBalanceValue = dex === 'risex'
      ? risexWalletValue
      : dex === 'nado'
      ? nadoWalletValue
      : dex === 'grvt'
      ? `$${pacAccountValue.toFixed(2)}`
      : `$${walletUsdc !== null ? walletUsdc.toFixed(2) : '--'}`;
    const walletBalanceColor = dex === 'risex' ? risexWalletValueColor : dex === 'nado' ? nadoWalletValueColor : '#5C3A21';

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        {/* Wallet address */}
        <div style={S.fullCard}>
          <div style={S.row}>
            <span style={S.label}>Connected Wallet</span>
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              <span style={{fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#5C3A21'}}>
                {walletCopied ? 'Copied' : `${walletAddr?.slice(0, 6)}...${walletAddr?.slice(-4)}`}
              </span>
              <button
                title="Copy full address"
                onClick={async () => {
                  if (!walletAddr) return;
                  try { await navigator.clipboard.writeText(walletAddr); } catch {}
                  setWalletCopied(true);
                  setTimeout(() => setWalletCopied(false), 1500);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, padding: 0, borderRadius: 6,
                  background: walletCopied ? 'rgba(67,160,71,0.18)' : 'rgba(0,0,0,0.08)',
                  border: `1px solid ${walletCopied ? 'rgba(46,125,50,0.5)' : 'rgba(92,58,33,0.3)'}`,
                  cursor: 'pointer', color: walletCopied ? '#2E7D32' : '#5C3A21',
                  transition: 'all 0.15s ease',
                }}
              >
                {walletCopied ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {dex === 'hibachi' && setupVerified === true && (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={S.label}>Hibachi API</span>
              <button
                style={{
                  ...S.btnSmall,
                  padding: '6px 10px',
                  fontSize: 10,
                  background: '#fff8e6',
                  color: '#991B1B',
                  border: '2px solid #DC2626',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  disconnect?.();
                  setHibachiApiKeyInput('');
                  setHibachiAccountIdInput('');
                  setHibachiPrivateKeyInput('');
                  setLocalAlert('Enter the correct Hibachi API credentials.');
                }}
              >
                EDIT API
              </button>
            </div>
            <div style={{fontSize: 10, fontWeight: 800, color: '#9f8759', lineHeight: 1.35}}>
              Stored encrypted in this browser. Balance, margin, positions, and orders are read from Hibachi.
            </div>
          </div>
        )}

        {dex === 'hotstuff' && setupVerified === true && (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#9A3412'}}>Hotstuff agent</span>
              <button
                style={{
                  ...S.btnSmall,
                  padding: '6px 10px',
                  fontSize: 10,
                  background: '#fff8e6',
                  color: '#9A3412',
                  border: '2px solid #F97316',
                  whiteSpace: 'nowrap',
                }}
                onClick={async () => {
                  try {
                    await disconnect?.();
                    setLocalAlert('Hotstuff browser trading agent cleared. Set up Hotstuff again to trade.');
                  } catch (e) {
                    setLocalAlert(e?.message || 'Failed to clear Hotstuff browser trading agent.');
                  }
                }}
              >
                CLEAR AGENT
              </button>
            </div>
            <div style={{fontSize: 10, fontWeight: 800, color: '#9f8759', lineHeight: 1.35}}>
              Stored encrypted in this browser. Clearing it only removes the local Hotstuff order signer; your Hotstuff account and funds stay unchanged.
            </div>
          </div>
        )}

        {dex === 'lighter' && lighterCredentials?.accountIndex != null && (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#0284C7'}}>Lighter API</span>
              <button
                style={{
                  ...S.btnSmall,
                  padding: '6px 10px',
                  fontSize: 10,
                  background: '#EFF6FF',
                  color: '#075985',
                  border: '2px solid #38BDF8',
                  whiteSpace: 'nowrap',
                }}
                onClick={async () => {
                  try {
                    await disconnect?.();
                  } catch {}
                  setLighterCredentialFormOpen(true);
                  setLighterAccountIndexInput(String(lighterCredentials.accountIndex ?? ''));
                  setLighterApiKeyIndexInput(String(lighterCredentials.apiKeyIndex ?? ''));
                  setLighterApiPrivateKeyInput('');
                  setLighterAccountDetectStatus('');
                  setLocalAlert('Paste the replacement Lighter API key.');
                }}
              >
                CHANGE API
              </button>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8}}>
              <div style={{background: '#fffaf0', border: '2px solid #d4c8b0', borderRadius: 10, padding: '8px 10px'}}>
                <div style={{fontSize: 10, fontWeight: 900, color: '#9f8759', textTransform: 'uppercase'}}>Account index</div>
                <div style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>{lighterCredentials.accountIndex}</div>
              </div>
              <div style={{background: '#fffaf0', border: '2px solid #d4c8b0', borderRadius: 10, padding: '8px 10px'}}>
                <div style={{fontSize: 10, fontWeight: 900, color: '#9f8759', textTransform: 'uppercase'}}>API key index</div>
                <div style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>{lighterCredentials.apiKeyIndex ?? '-'}</div>
              </div>
            </div>
            <div style={{fontSize: 10, fontWeight: 800, color: '#9f8759', lineHeight: 1.35}}>
              Stored encrypted in this browser only. Changing the key removes the saved approval and asks you to approve the Clash integrator again.
            </div>
          </div>
        )}

        {/* Wallet USDC */}
        {showWalletBalanceCard && (
        <div style={S.fullCard}>
          <div style={S.row}>
            <span style={S.label}>{walletBalanceLabel}</span>
            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
              <span style={{fontSize: 18, fontWeight: 900, color: walletBalanceColor}}>
                {walletBalanceValue}
              </span>
              {dex === 'risex' && (risexWalletNeedsSwitch || risexWalletError) && (
                <button
                  type="button"
                  onClick={handleSwitchToRise}
                  disabled={risexWalletBusy || loading}
                  style={{
                    ...S.btnSmall,
                    padding: '5px 9px',
                    fontSize: 10,
                    background: '#16A34A',
                    color: '#fff',
                    border: '2px solid #15803D',
                    opacity: (risexWalletBusy || loading) ? 0.65 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {risexWalletState === 'switching' ? 'Switching...' : 'Switch'}
                </button>
              )}
              {dex === 'nado' && nadoWalletError && (
                <button
                  type="button"
                  onClick={handleSwitchToInk}
                  disabled={nadoWalletBusy || loading}
                  style={{
                    ...S.btnSmall,
                    padding: '5px 9px',
                    fontSize: 10,
                    background: '#0891B2',
                    color: '#fff',
                    border: '2px solid #075985',
                    opacity: (nadoWalletBusy || loading) ? 0.65 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {nadoWalletState === 'switching' ? 'Switching...' : 'Switch'}
                </button>
              )}
            </div>
          </div>
          {dex === 'risex' && risexWalletMessage && (
            <div style={{marginTop: 6, fontSize: 10, lineHeight: 1.35, color: risexWalletNeedsSwitch ? '#B45309' : '#B91C1C', fontWeight: 800}}>
              {risexWalletMessage}
            </div>
          )}
          {dex === 'nado' && nadoWalletMessage && (
            <div style={{marginTop: 6, fontSize: 10, lineHeight: 1.35, color: nadoWalletError ? '#B91C1C' : '#075985', fontWeight: 800}}>
              {nadoWalletMessage}
            </div>
          )}
        </div>
        )}

        {dex === 'hyperliquid' && hyperliquidSpot > 0.000001 && (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={S.label}>{hyperliquidUnified ? 'Hyperliquid USDC' : 'Legacy Spot USDC'}</span>
              <span style={{fontSize: 18, fontWeight: 900, color: '#5C3A21'}}>
                ${hyperliquidSpot.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Pacifica unified-margin balances. "Equity" is the portfolio's
            mark-to-market value (always >= 0 unless margin call). "Free
            Margin" is what's left to open NEW trades — distinct from
            equity once margin gets locked in open positions. */}
        <div style={{display: 'flex', gap: 8}}>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>{dex === 'hyperliquid' ? 'Account Value' : 'Equity'}</span>
            <span style={S.balCardValue}>${equity.toFixed(2)}</span>
          </div>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>{dex === 'hyperliquid' ? 'Available' : dex === 'flash' ? 'Free Balance' : 'Free Margin'}</span>
            <span style={S.balCardValue}>${pacBalance.toFixed(2)}</span>
          </div>
        </div>
        <div style={{display: 'flex', gap: 8}}>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Margin Used</span>
            <span style={S.balCardValue}>${marginUsed.toFixed(2)}</span>
          </div>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Withdrawable</span>
            <span style={S.balCardValue}>${available.toFixed(2)}</span>
          </div>
        </div>

        {dex === 'grvt' && grvtFundingBalance > 0.000001 && (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={S.label}>GRVT Funding Account</span>
              <span style={{fontSize: 18, fontWeight: 900, color: '#5C3A21'}}>
                {grvtFundingBalance.toFixed(2)} {grvtFundingCurrency}
              </span>
            </div>
            <div style={{marginTop: 6, fontSize: 10, lineHeight: 1.35, color: '#8a7252', fontWeight: 800}}>
              Deposits can land in GRVT funding first. Move funds to your GRVT trading account in the GRVT app if Free Margin is still $0.
            </div>
          </div>
        )}

        {dex === 'grvt' && (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#1D4ED8'}}>GRVT account</span>
              <span style={S.detail}>Browser only</span>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8}}>
              <div style={{background: '#fffaf0', border: '2px solid #d4c8b0', borderRadius: 10, padding: '8px 10px'}}>
                <div style={{fontSize: 10, fontWeight: 900, color: '#9f8759', textTransform: 'uppercase'}}>API key</div>
                <div style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>Saved</div>
              </div>
              <div style={{background: oneTapTrading?.enabled ? '#DCFCE7' : '#fffaf0', border: `2px solid ${oneTapTrading?.enabled ? '#16A34A' : '#d4c8b0'}`, borderRadius: 10, padding: '8px 10px'}}>
                <div style={{fontSize: 10, fontWeight: 900, color: oneTapTrading?.enabled ? '#166534' : '#9f8759', textTransform: 'uppercase'}}>One tap</div>
                <div style={{fontSize: 13, fontWeight: 900, color: oneTapTrading?.enabled ? '#166534' : '#5C3A21'}}>
                  {oneTapTrading?.enabled ? 'Enabled' : 'Off'}
                </div>
              </div>
            </div>
            {oneTapTrading?.enabled && oneTapTrading?.signer && (
              <div style={{
                marginBottom: 8,
                background: 'rgba(22,163,74,0.08)',
                border: '2px dashed rgba(22,163,74,0.35)',
                borderRadius: 10,
                padding: '8px 10px',
                fontSize: 10,
                fontWeight: 800,
                color: '#166534',
                wordBreak: 'break-all',
              }}>
                Signer: {oneTapTrading.signer}
              </div>
            )}
            <button
              style={{...S.btnSmall, width: '100%', padding: '9px 10px', background: '#2563EB', color: '#fff', border: '2px solid #1D4ED8'}}
              onClick={() => {
                setGrvtApiKeyInput('');
                setGrvtPrivateKeyInput('');
                setGrvtAccountOneTap(!!oneTapTrading?.enabled);
                setGrvtAccountModalOpen(true);
              }}
            >
              Change account
            </button>
            <span style={{display: 'block', marginTop: 8, fontSize: 10, color: '#a3906a', fontWeight: 700, lineHeight: 1.35}}>
              GRVT credentials are stored encrypted in this browser only. Private keys are never sent to Clash servers.
            </span>
          </div>
        )}

        {/* Avantis & GMX are non-custodial — no deposit/withdraw. Show a
            read-only info card that explains funds live in the user's own
            wallet. Per-DEX accent colour + chain copy keeps the brand
            consistent (Avantis blue / Base, GMX purple / Arbitrum). */}
        {dex === 'grvt' && grvtAccountModalOpen && (
          <>
            <div style={S.levBackdrop} onClick={() => { if (!loading) setGrvtAccountModalOpen(false); }} />
            <div style={{...S.levModal, width: isMobile ? 'calc(100% - 32px)' : 380, maxWidth: 420, gap: 12}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span style={{fontSize: 16, fontWeight: 900, color: '#5C3A21'}}>Change GRVT account</span>
                <button style={S.levCloseBtn} disabled={loading} onClick={() => setGrvtAccountModalOpen(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <button
                type="button"
                style={{...S.btnSmall, width: '100%', padding: '10px 12px', background: '#16A34A', color: '#fff', border: '2px solid #15803D'}}
                disabled={loading}
                onClick={async () => {
                  const res = await activate?.({ autoBuilderKey: true });
                  if (res?.error) {
                    setLocalAlert(res.error);
                    return;
                  }
                  setGrvtApiKeyInput('');
                  setGrvtPrivateKeyInput('');
                  setGrvtAccountModalOpen(false);
                  setSuccessMsg('GRVT trading authorized.');
                }}
              >
                {loading ? 'Authorizing...' : 'Authorize with wallet'}
              </button>
              <label style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>New GRVT API key</span>
                <input
                  type="password"
                  placeholder="Paste GRVT API key"
                  value={grvtApiKeyInput}
                  onChange={e => setGrvtApiKeyInput(e.target.value)}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={loading}
                  style={{...S.input, width: '100%', padding: '10px 12px', fontSize: 14}}
                />
              </label>
              <button
                type="button"
                style={{
                  ...S.btnSmall,
                  width: '100%',
                  padding: '9px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: grvtAccountOneTap ? '#DCFCE7' : '#fffaf0',
                  color: grvtAccountOneTap ? '#166534' : '#5C3A21',
                  border: `2px solid ${grvtAccountOneTap ? '#16A34A' : '#d4c8b0'}`,
                }}
                disabled={loading}
                onClick={() => setGrvtAccountOneTap(v => !v)}
              >
                <span>One tap trading</span>
                <span style={{
                  minWidth: 46,
                  textAlign: 'center',
                  borderRadius: 999,
                  padding: '3px 8px',
                  background: grvtAccountOneTap ? '#16A34A' : '#e8dfc8',
                  color: grvtAccountOneTap ? '#fff' : '#5C3A21',
                  fontSize: 11,
                  fontWeight: 900,
                }}>
                  {grvtAccountOneTap ? 'ON' : 'OFF'}
                </span>
              </button>
              {grvtAccountOneTap && (
                <label style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                  <span style={{fontSize: 11, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase'}}>
                    GRVT Secret Private Key {oneTapTrading?.enabled ? '(optional replacement)' : ''}
                  </span>
                  <input
                    type="password"
                    placeholder={oneTapTrading?.enabled ? 'Leave empty to keep current signer' : 'Paste GRVT Secret Private Key'}
                    value={grvtPrivateKeyInput}
                    onChange={e => setGrvtPrivateKeyInput(e.target.value)}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loading}
                    style={{...S.input, width: '100%', padding: '10px 12px', fontSize: 14}}
                  />
                </label>
              )}
              <div style={{fontSize: 10, color: '#8a7252', fontWeight: 800, lineHeight: 1.35}}>
                API key is used to read your GRVT account. One tap private key stays encrypted in this browser and is used only to sign orders locally.
              </div>
              <div style={{display: 'flex', gap: 8}}>
                <button
                  style={{...S.btnSmall, flex: 1, padding: '9px 10px', background: '#fffaf0', color: '#5C3A21', border: '2px solid #d4c8b0'}}
                  disabled={loading}
                  onClick={() => {
                    setGrvtAccountModalOpen(false);
                    setGrvtApiKeyInput('');
                    setGrvtPrivateKeyInput('');
                  }}
                >
                  Cancel
                </button>
                <button
                  style={{
                    ...S.btnSmall,
                    flex: 1,
                    padding: '9px 10px',
                    background: '#16A34A',
                    color: '#fff',
                    border: '2px solid #15803D',
                    opacity: loading || !grvtApiKeyInput.trim() || (grvtAccountOneTap && !oneTapTrading?.enabled && !grvtPrivateKeyInput.trim()) ? 0.65 : 1,
                  }}
                  disabled={loading || !grvtApiKeyInput.trim() || (grvtAccountOneTap && !oneTapTrading?.enabled && !grvtPrivateKeyInput.trim())}
                  onClick={async () => {
                    const apiKey = grvtApiKeyInput.trim();
                    if (!apiKey) {
                      setLocalAlert('Enter your GRVT API key');
                      return;
                    }
                    if (grvtAccountOneTap && !oneTapTrading?.enabled && !grvtPrivateKeyInput.trim()) {
                      setLocalAlert('Enter your GRVT Secret Private Key or turn one tap off');
                      return;
                    }
                    const res = await activate?.({ apiKey });
                    if (res?.error) {
                      setLocalAlert(res.error);
                      return;
                    }
                    if (grvtAccountOneTap) {
                      if (grvtPrivateKeyInput.trim()) {
                        const oneTapRes = await setOneTapTradingEnabled?.(true, grvtPrivateKeyInput.trim());
                        if (oneTapRes?.error) {
                          setLocalAlert(oneTapRes.error);
                          return;
                        }
                      }
                    } else if (oneTapTrading?.enabled) {
                      const oneTapRes = await setOneTapTradingEnabled?.(false);
                      if (oneTapRes?.error) {
                        setLocalAlert(oneTapRes.error);
                        return;
                      }
                    }
                    setGrvtApiKeyInput('');
                    setGrvtPrivateKeyInput('');
                    setGrvtAccountModalOpen(false);
                    setSuccessMsg('GRVT account updated.');
                  }}
                >
                  {loading ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </div>
          </>
        )}

        {(dex === 'avantis' || dex === 'gmx' || dex === 'ostium' || dex === 'hyperliquid' || dex === 'gmtrade') ? (() => {
          const isGmx = dex === 'gmx';
          const isOstium = dex === 'ostium';
          const isHyperliquid = dex === 'hyperliquid';
          const isGmtrade = dex === 'gmtrade';
          const isFlash = dex === 'flash';
          const isHibachi = dex === 'hibachi';
          const accentLight = isFlash ? '#4CAF50' : isGmtrade ? '#14B8A6' : isHibachi ? '#EF4444' : isOstium ? '#111827' : isHyperliquid ? '#16A34A' : isGmx ? '#4F46E5' : '#0EA5E9';
          const accentDark = isFlash ? '#166534' : isGmtrade ? '#0F766E' : isHibachi ? '#991B1B' : isOstium ? '#9A3412' : isHyperliquid ? '#166534' : isGmx ? '#3730A3' : '#0369A1';
          const accentBg = isFlash ? 'rgba(34,197,94,0.08)' : isGmtrade ? 'rgba(20,184,166,0.08)' : isHibachi ? 'rgba(239,68,68,0.08)' : isOstium ? 'rgba(249,115,22,0.08)' : isHyperliquid ? 'rgba(22,163,74,0.08)' : isGmx ? 'rgba(79,70,229,0.08)' : 'rgba(14,165,233,0.08)';
          const accentBorder = isFlash ? 'rgba(34,197,94,0.30)' : isGmtrade ? 'rgba(20,184,166,0.35)' : isHibachi ? 'rgba(239,68,68,0.35)' : isOstium ? 'rgba(249,115,22,0.35)' : isHyperliquid ? 'rgba(22,163,74,0.35)' : isGmx ? 'rgba(79,70,229,0.35)' : 'rgba(14,165,233,0.35)';
          const accentBtnBorder = isFlash ? '#15803D' : isGmtrade ? '#0F766E' : isHibachi ? '#DC2626' : isOstium ? '#F97316' : isHyperliquid ? '#15803D' : isGmx ? '#4338CA' : '#0284C7';
          const chainName = (isGmtrade || isFlash) ? 'Solana' : isHibachi ? 'Base / Arbitrum' : isHyperliquid || isGmx || isOstium ? 'Arbitrum' : 'Base';
          const isDepositing = isHyperliquid && depositStatus?.status === 'depositing';
          const isMovingToPerp = isHyperliquid && depositStatus?.status === 'moving_to_perp';
          const isFundingBusy = isDepositing || isMovingToPerp;
          const pendingDepositAmount = Number(depositStatus?.amount);
          const pendingDepositLabel = Number.isFinite(pendingDepositAmount)
            ? pendingDepositAmount.toFixed(2)
            : String(depositStatus?.amount || '');
          const hibachiBaseUsdc = Number(walletUsdcStatus?.balances?.base);
          const hibachiArbitrumUsdc = Number(walletUsdcStatus?.balances?.arbitrum);
          const hibachiWalletText = [
            Number.isFinite(hibachiBaseUsdc) ? `Base $${hibachiBaseUsdc.toFixed(2)}` : null,
            Number.isFinite(hibachiArbitrumUsdc) ? `Arbitrum $${hibachiArbitrumUsdc.toFixed(2)}` : null,
          ].filter(Boolean).join(' / ');
          const walletUsdcText = walletUsdc !== null
            ? (isHibachi ? `USDC: ${hibachiWalletText || `$${walletUsdc.toFixed(2)}`}` : `${isGmtrade ? 'Solana wallet ' : isHyperliquid ? 'Arbitrum ' : ''}USDC: $${walletUsdc.toFixed(2)}`)
            : isHibachi && walletUsdcStatus?.status === 'checking'
            ? 'Base / Arbitrum USDC: checking...'
            : null;
          return (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: accentLight}}>{isFlash ? 'Deposit USDC' : isGmtrade ? 'GMTrade native wallet' : isHibachi ? 'Hibachi funding' : isHyperliquid ? 'Hyperliquid funding' : 'Self-custody wallet'}</span>
              {isFundingBusy
                ? <span style={{...S.detail, color: '#15803D'}}>{isMovingToPerp ? 'Moving to trading' : 'Depositing'}{pendingDepositLabel ? ` ${pendingDepositLabel} USDC` : ''}...</span>
                : walletUsdcText && (
                  <span style={{...S.detail, display: 'inline-flex', alignItems: 'center', gap: 6}}>
                    {walletUsdcText}
                    <button
                      type="button"
                      data-nodrag
                      title="Refresh balance and orders"
                      aria-label="Refresh balance and orders"
                      aria-busy={manualTradingRefreshBusy}
                      onClick={refreshTradingSnapshot}
                      disabled={manualTradingRefreshBusy}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        border: `2px solid ${accentBtnBorder}`,
                        background: manualTradingRefreshBusy ? '#e7dcc2' : '#fff8e6',
                        color: accentDark,
                        fontWeight: 900,
                        cursor: manualTradingRefreshBusy ? 'default' : 'pointer',
                        lineHeight: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          animation: manualTradingRefreshBusy ? 'wallet-spin 0.75s linear infinite' : 'none',
                          transformOrigin: '50% 50%',
                        }}
                      >
                        {'\u21bb'}
                      </span>
                    </button>
                  </span>
                )}
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              {!isHyperliquid && !isHibachi && !isFlash && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: accentBg,
                border: `2px dashed ${accentBorder}`,
                borderRadius: 10, padding: '8px 10px',
              }}>
                <code style={{
                  flex: 1, fontSize: 11, fontFamily: 'monospace',
                  color: accentDark, wordBreak: 'break-all', lineHeight: 1.3,
                }}>{walletAddr || 'connect wallet…'}</code>
                {walletAddr && (
                  <button
                    style={{
                      ...S.btnSmall, padding: '6px 10px', fontSize: 10,
                      background: accentLight, color: '#fff',
                      border: `2px solid ${accentBtnBorder}`, whiteSpace: 'nowrap',
                    }}
                    onClick={async () => { try { await navigator.clipboard.writeText(walletAddr); } catch {} }}
                  >COPY</button>
                )}
              </div>
              )}
              {isHibachi && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: accentBg,
                  border: `2px dashed ${accentBorder}`,
                  borderRadius: 10, padding: '8px 10px',
                }}>
                  <span style={{
                    flex: 1,
                    fontSize: 11,
                    fontWeight: 800,
                    color: accentDark,
                    lineHeight: 1.35,
                  }}>
                    Fund and withdraw in the Hibachi app. Clash reads your Base and Arbitrum wallet USDC, then trades from the Hibachi account tied to the API credentials you saved.
                  </span>
                  <button
                    style={{
                      ...S.btnSmall, padding: '6px 10px', fontSize: 10,
                      background: accentLight, color: '#fff',
                      border: `2px solid ${accentBtnBorder}`, whiteSpace: 'nowrap',
                    }}
                    onClick={() => {
                      if (typeof openReferralJoin === 'function') openReferralJoin();
                      else window.open(referralUrl || 'https://hibachi.xyz/r/M4S4XNAGP4', '_blank', 'noopener,noreferrer');
                    }}
                  >OPEN</button>
                  <button
                    style={{
                      ...S.btnSmall, padding: '6px 10px', fontSize: 10,
                      background: '#fff8e6', color: accentDark,
                      border: `2px solid ${accentBtnBorder}`, whiteSpace: 'nowrap',
                    }}
                    onClick={() => {
                      disconnect?.();
                      setHibachiApiKeyInput('');
                      setHibachiAccountIdInput('');
                      setHibachiPrivateKeyInput('');
                      setLocalAlert('Enter the correct Hibachi API credentials.');
                    }}
                  >EDIT API</button>
                </div>
              )}
              {isHyperliquid && (
                <div style={{display: 'flex', gap: 6, alignItems: 'stretch'}}>
                  <input
                    type="number"
                    placeholder="Min 5 USDC"
                    value={depositAmt}
                    onChange={e => setDepositAmt(e.target.value)}
                    style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}}
                  />
                  <button
                    style={{
                      ...S.depositBtn,
                      flex: isFundingBusy ? '0 0 118px' : 1.4,
                      whiteSpace: 'nowrap',
                      padding: '8px 4px',
                      fontSize: isFundingBusy ? 11 : undefined,
                    }}
                    onClick={async () => {
                      const v = parseFloat(depositAmt);
                      if (!Number.isFinite(v) || v < 5) {
                        setLocalAlert('Min deposit 5 USDC');
                        return;
                      }
                      if (walletUsdc !== null && v > walletUsdc) {
                        setLocalAlert(`Wallet has ${walletUsdc.toFixed(2)} USDC on Arbitrum`);
                        return;
                      }
                      const r = await depositToPacifica(depositAmt);
                      if (!r?.error) {
                        setDepositAmt('');
                        setLocalAlert(r?.info || 'Deposit sent. Hyperliquid credits it shortly.');
                      }
                    }}
                    disabled={loading || isFundingBusy}
                  >
                    {isMovingToPerp ? 'Moving...' : isDepositing ? 'Depositing...' : loading ? '...' : 'Deposit'}
                  </button>
                </div>
              )}
              {isFlash && (
                <div style={{...S.row, paddingTop: 2}}>
                  <span style={{...S.label, color: '#9945FF'}}>Withdraw USDC</span>
                  {available > 0 && <span style={S.detail}>Max: ${withdrawMax.toFixed(2)}</span>}
                </div>
              )}
              {isFlash && (
                <div style={{display: 'flex', gap: 6, alignItems: 'stretch'}}>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={depositAmt}
                    onChange={e => setDepositAmt(e.target.value)}
                    style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}}
                  />
                  <button
                    style={{...S.depositBtn, flex: 1.4, whiteSpace: 'nowrap', padding: '8px 4px'}}
                    onClick={async () => {
                      const v = parseFloat(depositAmt);
                      if (!Number.isFinite(v) || v <= 0) {
                        setLocalAlert('Enter a positive Flash deposit amount');
                        return;
                      }
                      if (walletUsdc !== null && v > walletUsdc + 0.000001) {
                        setLocalAlert(`Solana wallet has ${walletUsdc.toFixed(2)} USDC`);
                        return;
                      }
                      setFlashFundingProgress({
                        open: true,
                        amount: String(v),
                        currentStep: 'prepare',
                        status: 'active',
                        label: 'Preparing Flash funding',
                        hint: 'Approve the wallet prompts in order. Clash will continue automatically after each signature.',
                        error: '',
                        completed: false,
                        steps: {},
                      });
                      const r = await depositToPacifica(depositAmt, { onProgress: updateFlashFundingProgress });
                      if (!r?.error) {
                        setDepositAmt('');
                        setLocalAlert(r?.info || 'Flash v2 deposit sent.');
                      } else {
                        setLocalAlert(r.error);
                      }
                    }}
                    disabled={loading}
                  >
                    {loading ? '...' : 'Deposit'}
                  </button>
                </div>
              )}
              {isFlash && (
                <div style={{display: 'flex', gap: 6, alignItems: 'stretch'}}>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={withdrawAmt}
                    onChange={e => setWithdrawAmt(e.target.value)}
                    style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}}
                  />
                  <button
                    style={{...S.btnPurple, flex: 1.4, whiteSpace: 'nowrap', padding: '8px 4px'}}
                    onClick={async () => {
                      const v = parseFloat(withdrawAmt);
                      if (!Number.isFinite(v) || v <= 0) {
                        setLocalAlert('Enter a positive Flash withdrawal amount');
                        return;
                      }
                      const r = await withdraw(withdrawAmt);
                      if (!r?.error) {
                        setWithdrawAmt('');
                        setLocalAlert(r?.info || 'Flash v2 withdrawal request sent.');
                      } else {
                        setLocalAlert(r.error);
                      }
                    }}
                    disabled={loading}
                  >
                    {loading ? '...' : 'Withdraw'}
                  </button>
                </div>
              )}
              {isHyperliquid && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  background: oneTapTrading?.enabled ? 'rgba(22,163,74,0.10)' : 'rgba(92,58,33,0.06)',
                  border: `1px solid ${oneTapTrading?.enabled ? 'rgba(22,163,74,0.35)' : 'rgba(92,58,33,0.18)'}`,
                  borderRadius: 8,
                  padding: '7px 9px',
                }}>
                  <span style={{fontSize: 11, fontWeight: 900, color: oneTapTrading?.enabled ? '#166534' : '#5C3A21'}}>
                    One tap trading
                    {oneTapTrading?.enabled && oneTapTrading?.approved === false ? ' pending' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleOneTapTrading}
                    disabled={referralLinking}
                    style={{
                      ...S.btnSmall,
                      minWidth: 72,
                      padding: '5px 10px',
                      background: oneTapTrading?.enabled ? '#16A34A' : '#fff6dc',
                      color: oneTapTrading?.enabled ? '#fff' : '#5C3A21',
                      border: `2px solid ${oneTapTrading?.enabled ? '#15803D' : '#b58b2a'}`,
                      opacity: referralLinking ? 0.7 : 1,
                    }}
                  >
                    {referralLinking ? '...' : oneTapTrading?.enabled ? 'ON' : 'ENABLE'}
                  </button>
                </div>
              )}
              {isHyperliquid && !hyperliquidUnified && hyperliquidSpotFree > 0.000001 && (
                <button
                  style={{
                    ...S.btnSmall,
                    width: '100%',
                    background: '#16A34A',
                    color: '#fff',
                    border: '2px solid #15803D',
                    opacity: isFundingBusy ? 0.65 : 1,
                  }}
                  onClick={async () => {
                    const amountText = hyperliquidSpotFree.toFixed(6).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
                    const r = await moveSpotToPerp?.(amountText);
                    if (!r?.error) setLocalAlert(r?.info || 'Moved USDC to trading balance.');
                  }}
                  disabled={loading || isFundingBusy || !moveSpotToPerp}
                >
                  Move legacy ${hyperliquidSpotFree.toFixed(2)} to Trading
                </button>
              )}
              <span style={{fontSize: 10, color: '#a3906a', fontWeight: 700, lineHeight: 1.35}}>
                {isHyperliquid
                  ? hyperliquidUnified
                    ? <>{isFundingBusy ? 'Waiting for Hyperliquid to finish funding. ' : ''}Sends native <b>USDC on {chainName}</b> to Hyperliquid Bridge2. Unified account is active, so credited USDC is already available for trading. Minimum is <b>5 USDC</b>.</>
                    : <>{isFundingBusy ? 'Waiting for Hyperliquid to finish funding. ' : ''}Sends native <b>USDC on {chainName}</b> to Hyperliquid Bridge2. Legacy accounts may need one extra move from Spot into the trading balance. Minimum is <b>5 USDC</b>.</>
                  : isGmtrade
                  ? <>Orders are built natively in Clash and signed by your connected <b>Solana wallet</b>. Use the normal Long/Short buttons in the Trade tab; keep <b>USDC</b> collateral and a small <b>SOL</b> gas float in this wallet.</>
                  : isFlash
                  ? <>Sends USDC between your connected <b>Solana wallet</b> and Flash. Each action opens a wallet signature; keep a small <b>SOL</b> gas float.</>
                  : isHibachi
                  ? <>Hibachi deposit and withdrawal are not exposed through this Clash API flow. Use the official Hibachi app to manage funds on <b>{chainName}</b>.</>
                  : isOstium
                  ? <>USDC stays in your <b>Arbitrum wallet</b>. One-time setup approves Ostium USDC spending and registers a browser-only delegate. The delegate pays trade gas from a small ETH float; Clash does not sponsor gas.</>
                  : <>Funds stay in YOUR wallet. Each trade prompts a signature. Make sure you have <b>USDC</b> + a small <b>ETH</b> gas float on <b>{chainName}</b>.</>}
              </span>
            </div>
          </div>
          );
        })() : (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#4CAF50'}}>{dex === 'monad' ? 'Deposit AUSD' : dex === 'nado' ? `Deposit ${selectedNadoDepositAsset.label}` : dex === 'hotstuff' ? 'Hotstuff funding' : dex === 'grvt' ? 'Open GRVT Deposit' : dex === 'katana' ? 'Open Katana Deposit' : 'Deposit USDC'}</span>
              {dex === 'risex'
                ? (
                  <span style={{...S.detail, color: '#15803D'}}>
                    {risexDepositSource?.name || 'Arbitrum'} USDC: {risexSourceBalanceText}
                  </span>
                )
                : dex === 'nado'
                ? <span style={S.detail}>Wallet: {nadoWalletValue} {selectedNadoDepositAsset.label}</span>
                : walletUsdc !== null && <span style={S.detail}>Wallet: ${walletUsdc.toFixed(2)} {dex === 'monad' ? 'AUSD' : 'USDC'}</span>}
            </div>
            {dex === 'hotstuff' ? (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                <div style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.28)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: '#5C3A21',
                  fontWeight: 750,
                }}>
                  Hotstuff deposit and withdrawal are handled in the official Hotstuff app. Clash reads your account balance and trades through the registered browser agent.
                </div>
                <button
                  style={{...S.depositBtn, width: '100%', whiteSpace: 'nowrap', padding: '9px 10px'}}
                  onClick={() => {
                    if (typeof openReferralJoin === 'function') openReferralJoin();
                    else window.open(referralUrl || 'https://app.hotstuff.trade/join/clashofperps', '_blank', 'noopener,noreferrer');
                  }}
                  disabled={loading}
                >
                  {loading ? '...' : 'Open Hotstuff'}
                </button>
                {Number(spotUsdc || 0) > 0.000001 && (
                  <button
                    style={{...S.btnSmall, width: '100%', background: '#16A34A', color: '#fff', border: '2px solid #15803D'}}
                    onClick={async () => {
                      const amountText = Number(spotUsdc || 0).toFixed(6).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
                      const r = await moveSpotToPerp?.(amountText);
                      if (!r?.error) setLocalAlert(r?.info || 'Moved USDC to Hotstuff derivatives.');
                      else setLocalAlert(r.error);
                    }}
                    disabled={loading || !moveSpotToPerp}
                  >
                    Move ${Number(spotUsdc || 0).toFixed(2)} Spot to Perps
                  </button>
                )}
              </div>
            ) : dex === 'grvt' ? (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                <div style={{
                  background: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.24)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: '#5C3A21',
                  fontWeight: 750,
                }}>
                  GRVT deposits must be completed in the GRVT app. Clash reads your credited GRVT trading balance and builder-code fills after the deposit is processed.
                </div>
                <button
                  style={{...S.depositBtn, width: '100%', whiteSpace: 'nowrap', padding: '9px 10px'}}
                  onClick={async () => {
                    const r = await depositToPacifica('');
                    if (!r?.error && r?.info) setLocalAlert(r.info);
                  }}
                  disabled={loading}
                >
                  {loading ? '...' : 'Open'}
                </button>
              </div>
            ) : dex === 'katana' ? (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                <div style={{
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.28)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: '#5C3A21',
                  fontWeight: 750,
                }}>
                  Katana supports USDC deposits through its official bridge flow, including Arbitrum via Stargate. Native in-game deposit needs the full Katana bridge contract flow; for now Clash opens Katana so the deposit is handled by their app.
                </div>
                <button
                  style={{...S.depositBtn, width: '100%', whiteSpace: 'nowrap', padding: '9px 10px'}}
                  onClick={async () => {
                    const r = await depositToPacifica?.('');
                    if (r?.info) setLocalAlert(r.info);
                  }}
                  disabled={loading}
                >
                  {loading ? '...' : 'Open Katana Deposit'}
                </button>
              </div>
            ) : dex === 'bulk' ? (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                <div style={{
                  background: 'rgba(17,24,39,0.07)',
                  border: '1px solid rgba(17,24,39,0.22)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: '#5C3A21',
                  fontWeight: 750,
                }}>
                  Bulk funding is currently handled by the closed-beta deposit page. The Clash referral is included automatically.
                </div>
                <button
                  style={{...S.depositBtn, width: '100%', whiteSpace: 'nowrap', padding: '9px 10px'}}
                  onClick={() => openReferralJoin?.()}
                  disabled={loading}
                >
                  {loading ? '...' : 'Open Bulk Deposit'}
                </button>
              </div>
            ) : (
            <div style={{display: 'flex', gap: 6, alignItems: 'stretch'}}>
              {dex === 'risex' && (
                <select
                  value={risexDepositSource?.id || 42161}
                  onChange={e => setBridgeDepositSourceChainId?.(Number(e.target.value))}
                  disabled={loading || risexDepositBusy}
                  style={{
                    ...S.input,
                    flex: 2.1,
                    minWidth: 0,
                    padding: '8px 8px',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {risexDepositSources.map(chain => (
                    <option key={chain.id} value={chain.id}>{chain.name}</option>
                  ))}
                </select>
              )}
              {dex === 'nado' && (
                <select
                  value={nadoDepositAsset}
                  onChange={e => setNadoDepositAsset(e.target.value)}
                  disabled={loading}
                  style={{
                    ...S.input,
                    flex: 1.7,
                    minWidth: 0,
                    padding: '8px 8px',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {nadoDepositAssets.map(asset => (
                    <option key={asset.id} value={asset.id}>{asset.label}</option>
                  ))}
                </select>
              )}
              {/* Pacifica enforces a $10 deposit floor. Decibel/Phoenix/Perpl
                  do not have this fixed UI floor here (per-market minSize
                  matters for trading; deposits are free-form). */}
              <input type="number"
                placeholder={dex === 'monad' ? 'Amount (AUSD)' : dex === 'pacifica' ? 'Min 10 USDC' : dex === 'nado' && !account?.exists ? `Min 5 ${selectedNadoDepositAsset.label}` : dex === 'nado' ? `Amount (${selectedNadoDepositAsset.label})` : dex === 'risex' ? 'Amount (USDC)' : 'Amount (USDC)'}
                value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}} />
              <button style={{...S.depositBtn, flex: 1, whiteSpace: 'nowrap', padding: '8px 4px'}} onClick={async () => {
                const minDeposit = dex === 'pacifica' ? 10 : (dex === 'nado' && !account?.exists ? 5 : 0);
                const v = parseFloat(depositAmt);
                if (!Number.isFinite(v) || v <= 0 || (minDeposit > 0 && v < minDeposit)) {
                  setLocalAlert(dex === 'pacifica'
                    ? 'Minimum Pacifica deposit is 10 USDC.'
                    : minDeposit > 0
                      ? `Minimum deposit is ${minDeposit} ${dex === 'nado' ? selectedNadoDepositAsset.label : 'USDC'}.`
                      : 'Enter a positive amount.');
                  return;
                }
                if (dex === 'pacifica' && Number.isFinite(Number(walletUsdc)) && v > Number(walletUsdc) + 0.000001) {
                  setLocalAlert(`Your wallet has ${Number(walletUsdc).toFixed(2)} USDC. Deposit less, or add USDC first.`);
                  return;
                }
                if (dex === 'risex') {
                  if (!risexDepositSource) {
                    setLocalAlert('Select a source chain for the RISEx bridge deposit.');
                    return;
                  }
                  if (typeof risexSourceBalance === 'number' && Number.isFinite(risexSourceBalance) && v > risexSourceBalance + 0.000001) {
                    setLocalAlert(`${risexDepositSource.name} wallet has ${risexSourceBalance.toFixed(2)} USDC`);
                    return;
                  }
                }
                if (dex === 'nado' && Number.isFinite(selectedNadoWalletBalance) && v > selectedNadoWalletBalance + 0.000001) {
                  setLocalAlert(`Ink wallet has ${selectedNadoWalletBalance.toFixed(2)} ${selectedNadoDepositAsset.label}`);
                  return;
                }
                const r = await depositToPacifica(depositAmt, dex === 'risex' ? { sourceChainId: risexDepositSource?.id } : dex === 'nado' ? { asset: selectedNadoDepositAsset.id } : undefined);
                if (!r?.error) {
                  setDepositAmt('');
                  if (r?.info) setLocalAlert(r.info);
                }
              }} disabled={loading || depositActionBusy}>
                {depositButtonLabel}
              </button>
            </div>
            )}
            <span style={{fontSize: 10, color: '#a3906a', fontWeight: 700}}>
              {dex === 'decibel'
                ? 'Sends USDC from your Aptos wallet to your Decibel trading subaccount. Needs a small APT float for gas.'
                : dex === 'monad'
                ? 'Sends AUSD from your Monad wallet to your Perpl account. Needs a small MON float for gas.'
                : dex === 'phoenix'
                ? 'Sends USDC from your Solana wallet to your Phoenix trader account. Needs a small SOL float for gas.'
                : dex === 'flash'
                ? 'Sends USDC from your Solana wallet to your Flash account. Needs a small SOL float for gas.'
                : dex === 'nado'
                ? 'Approves the selected Ink stablecoin, then deposits it into your Nado default subaccount. Needs a small ETH float on Ink for gas.'
                : dex === 'hotstuff'
                ? 'Use Hotstuff official to deposit or withdraw. Clash only handles trading and optional Spot to Perps internal transfer.'
                : dex === 'grvt'
                ? 'Opens GRVT deposit. Native in-game deposit needs GRVT bridge approval data or a GRVT-supported deposit-address API; the current builder API key is not enough for that.'
                : dex === 'katana'
                ? 'Opens Katana deposit. Katana deposits can be bridged from Arbitrum USDC through the official Stargate/Katana bridge flow.'
                : dex === 'bulk'
                ? 'Opens the Bulk closed-beta deposit page with the Clash referral code already applied.'
                : dex === 'risex'
                ? (
                  <>
                    Transfers native <b>USDC on {risexDepositSource?.name || 'Arbitrum'}</b> to the RISEx bridge deposit address, then submits the tx to RISEx. Needs source-chain gas.
                  </>
                )
                : dex === 'pacifica'
                ? 'Sends USDC from your wallet to Pacifica. Needs ~0.005 SOL for gas.'
                : 'Use the connected venue account to fund or manage your USDC balance.'}
            </span>
          </div>
        )}

        {/* Withdraw card. Avantis & GMX are non-custodial → no withdraw.
            Pacifica shows when there's something to take out. Decibel and
            RISEx always show the action from day one (the button disables at
            available=0 instead of hiding the whole card). */}
        {dex !== 'avantis' && dex !== 'gmx' && dex !== 'ostium' && dex !== 'hibachi' && dex !== 'katana' && dex !== 'gmtrade' && dex !== 'hotstuff' && (dex === 'decibel' || dex === 'risex' || dex === 'hyperliquid' || dex === 'nado' || dex === 'flash' || available > 0) && (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#9945FF'}}>{dex === 'monad' ? 'Withdraw AUSD' : dex === 'nado' ? 'Withdraw USDt0' : 'Withdraw USDC'}</span>
              <span style={S.detail}>Max: ${withdrawMax.toFixed(2)}</span>
            </div>
            <div style={{display: 'flex', gap: 6, alignItems: 'stretch'}}>
              <input type="number" placeholder="Amount" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}} />
              <button
                style={{...S.btnSmall, flex: 1, whiteSpace: 'nowrap', padding: '8px 4px', opacity: withdrawMax <= 0 ? 0.5 : 1}}
                onClick={() => setWithdrawAmt(String(Math.floor(withdrawMax * 100) / 100))}
                disabled={withdrawMax <= 0}
              >MAX</button>
              <button
                style={{...S.btnPurple, flex: 2, whiteSpace: 'nowrap', padding: '8px 4px', opacity: withdrawMax <= 0 ? 0.5 : 1}}
                onClick={async () => {
                  const v = parseFloat(withdrawAmt);
                  if (dex === 'grvt') {
                    const r = await withdraw(withdrawAmt);
                    if (r?.info) setLocalAlert(r.info);
                    return;
                  }
                  if (!Number.isFinite(v) || v <= 0) {
                    setLocalAlert('Enter a positive amount');
                    return;
                  }
                  if (v > withdrawMax + 0.000001) {
                    setLocalAlert(`Max withdraw is ${withdrawMax.toFixed(2)} ${dex === 'monad' ? 'AUSD' : dex === 'nado' ? 'USDt0' : 'USDC'}`);
                    return;
                  }
                  const r = await withdraw(withdrawAmt);
                  if (!r?.error) {
                    setWithdrawAmt('');
                    if (r?.info) setLocalAlert(r.info);
                  }
                }}
                disabled={loading || (dex !== 'grvt' && (!withdrawAmt || withdrawMax <= 0))}
              >
                {loading ? '...' : dex === 'grvt' ? 'Open' : (withdrawMax <= 0 ? 'No funds' : 'Withdraw')}
              </button>
            </div>
            <span style={{fontSize: 10, color: '#a3906a', fontWeight: 700}}>
              {dex === 'hyperliquid'
                ? 'Requests a Hyperliquid withdrawal to your connected Arbitrum address. Arrival usually takes a few minutes.'
                : dex === 'risex'
                ? 'Withdraws USDC from RISEx directly to your connected RISE wallet through the official CollateralManager contract. Requires RISE ETH for gas.'
                : dex === 'decibel'
                ? 'Withdraws from your Decibel trading subaccount back to your Aptos wallet.'
                : dex === 'monad'
                ? 'Withdraws AUSD from Perpl back to your Monad wallet.'
                : dex === 'phoenix'
                ? 'Withdraws USDC from your Phoenix trader account back to your Solana wallet.'
                : dex === 'flash'
                ? 'Withdraws USDC from your Flash account back to your Solana wallet.'
                : dex === 'nado'
                ? 'Withdraws USDt0 from your Nado default subaccount back to your Ink wallet. Nado charges a 1 USDt0 withdrawal fee, so Max subtracts it.'
                : dex === 'grvt'
                ? 'Opens GRVT so you can withdraw or manage funds on your GRVT account.'
                : dex === 'pacifica'
                ? 'Withdraws USDC from Pacifica back to your wallet.'
                : 'Use the connected venue account to withdraw or manage your USDC balance.'}
            </span>
          </div>
        )}

        {/* Account stats */}
        <div style={S.fullCard}>
          <span style={S.label}>Account Info</span>
          {[
            ['Positions', account?.positions_count || 0],
            ['Open Orders', account?.orders_count || 0],
            ['Fee Tier', account?.fee_level ?? account?._raw?.feeLevel ?? account?._raw?.feeTier ?? '—'],
            ['Maker Fee', formatFeeRate(account?.maker_fee)],
            ['Taker Fee', formatFeeRate(account?.taker_fee)],
          ].map(([k, v]) => (
            <div key={k} style={{...S.row, padding: '4px 0', borderBottom: '1px solid #d4c8b0'}}>
              <span style={S.detail}>{k}</span>
              <span style={{fontSize: 13, fontWeight: 800, color: '#5C3A21'}}>{v}</span>
            </div>
          ))}
        </div>

        {successMsg && (
          <div style={S.successBar} onClick={() => setSuccessMsg(null)}>
            <span>✓ {successMsg}</span>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    // Basic mode: replace Trade with the wizard, and redirect away from
    // Orders if the user landed there before flipping to Basic — Orders
    // is hidden in Basic so any attempt to render it would 404 visually.
    if (isBasic && activeTab === 'Orders') {
      // Side-effect inside render is mild here — setActiveTab will queue a
      // re-render and the next pass renders Trade. Wrapped so we don't
      // re-fire after the state already moved.
      setTimeout(() => setActiveTab('Trade'), 0);
      return null;
    }
    if (activeTab === 'Trade' && isBasic) {
      return (
        <BasicTradeFlow
          markets={markets}
          prices={prices}
          account={account}
          walletUsdc={walletUsdc}
          maxTradableMargin={dex === 'pacifica' ? pacificaMaxMargin : undefined}
          placeMarketOrder={placeMarketOrder}
          setLeverageApi={setLeverageApi}
          setMarginMode={setMarginMode}
          // Pass the current per-symbol settings so the wizard can SKIP
          // signing setMarginMode / setLeverage when the values already
          // match what the user picked. Returning Pacifica users with
          // unchanged settings will see exactly one wallet popup (the
          // trade itself) instead of three.
          marginModes={marginModes}
          leverageSettings={leverageSettings}
          dex={dex}
          setActiveTab={setActiveTab}
          // Pacifica agent-wallet props (undefined on Avantis path).
          pacAgent={pacAgent}
          bindAgent={bindAgent}
          bindingAgent={bindingAgent}
          bindAgentError={bindAgentError}
        />
      );
    }
    if (activeTab === 'Trade') return renderTrade();
    if (activeTab === 'Positions') return renderPositions();
    if (activeTab === 'Orders') return renderOrders();
    if (activeTab === 'Account') return renderAccount();
    if (activeTab === 'Quests') return <QuestsTab markets={markets} />;
  };

  // First-time mode selection: hide the trading UI behind a parchment card
  // until the user picks Pro vs Basic. After they pick, the choice is
  // persisted server-side and FuturesModeContext flips `needsSelection`
  // to false on the next render. We keep the same panel chrome (header
  // + close button) so the user can dismiss with `Decide later` or X.
  if (needsModeSelection) {
    return (
      <>
        <style>{animCSS}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>Futures Trading</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, justifyContent: 'flex-start', overflow: 'auto'}}>
            <FuturesModeSelect onClose={handleClose} />
          </div>
        </div>
      </>
    );
  }

  // After mode is chosen, `futuresMode` is 'basic' or 'pro' and the trading
  // UI below renders normally. UI customization for each mode is layered on
  // by reading futuresMode in conditional blocks (e.g. hide TradeIdeaModal
  // in basic, show simpler trade form, etc.) — wired later as UX is decided.
  void futuresMode;

  return (
    <>
      <style>{animCSS}</style>
      <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
        ...(fullscreen ? S.containerFull : S.container),
        ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
        transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
        transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <div style={S.header} onPointerDown={handlePointerDown}>
          <div className="futures-tabs-scroll" style={{display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none'}}>
            {visibleTabs.map(t => {
              const active = activeTab === t.id;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)} className={`tab-btn ${active ? 'active' : ''}`} style={{...(active ? S.tabActive : S.tabInactive), flexShrink: 0}}>
                  {t.icon}
                  {active && <span style={{fontSize: 14, fontWeight: 800}}>{t.label}</span>}
                </button>
              );
            })}
          </div>
          <div style={{display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 8}}>
            <button data-nodrag onClick={() => setFullscreen(!fullscreen)} style={S.headerBtn} title={fullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
              {fullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              )}
            </button>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        {showReferralBanner && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px',
            background: 'linear-gradient(180deg, #FFF3CD 0%, #FFE69C 100%)',
            borderBottom: '2px solid #D4A017',
            color: '#5C3A21', fontSize: 12, fontWeight: 800,
          }}>
            <span style={{fontSize: 16}}>🎁</span>
            <span style={{flex: 1, minWidth: 0}}>
              {/* Banner copy: same component handles both Avantis (5% referral
                  discount, on-chain link) and Decibel (one-time delegation +
                  builder fee approval). The visible label and CTA differ
                  because the underlying mechanic differs — Decibel is NOT a
                  trader-side discount, it's how the game gets attribution. */}
              <span style={{display: 'block'}}>
                {dex === 'decibel'
                  ? 'Activate trading on Decibel'
                  : dex === 'nado'
                  ? 'Add the Clash referral on Nado'
                  : dex === 'hyperliquid'
                  ? (oneTapTrading?.approved ? 'One tap trading is ready' : 'Enable Hyperliquid one tap trading')
                  : 'Unlock 5% off every Avantis trade'}
              </span>
              <span style={{fontSize: 10, fontWeight: 700, color: '#8a6914'}}>
                {dex === 'nado'
                  ? (
                    <>
                      Sign the exact message for code {referralCode || '13z8hnl'}; Clash verifies it through Nado&apos;s referral API.
                      {referralTermsUrl && (
                        <>
                          {' '}By accepting, you agree to the{' '}
                          <a
                            href={referralTermsUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={event => event.stopPropagation()}
                            style={{color: '#6d4f08', textDecoration: 'underline'}}
                          >Nado referral terms</a>.
                        </>
                      )}
                    </>
                  )
                  : dex === 'hyperliquid'
                  ? 'Optional: one Arbitrum signature approves a local agent so future orders do not hit wallet chainId errors.'
                  : dex === 'decibel'
                  ? 'One Petra signature — sets up an api wallet so trades sign silently.'
                  : 'One signature — links your wallet to our referral code.'}
              </span>
            </span>
            <button
              data-nodrag
              onClick={handleLinkReferrer}
              disabled={referralLinking}
              style={{
                background: referralLinking ? '#b8860b' : 'linear-gradient(180deg, #e8b830 0%, #b8860b 100%)',
                border: '2px solid #8a6914', borderRadius: 8,
                color: '#fff', padding: '6px 12px',
                fontSize: 11, fontWeight: 900, letterSpacing: '0.5px',
                cursor: referralLinking ? 'wait' : 'pointer',
                textShadow: '0 1px 0 rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              {referralLinking ? 'SIGNING...' : (dex === 'decibel' ? 'ACTIVATE' : dex === 'nado' ? 'ACCEPT' : dex === 'hyperliquid' ? 'ENABLE' : 'UNLOCK')}
            </button>
            <button
              data-nodrag
              onClick={handleDismissReferral}
              title="Dismiss"
              style={{
                background: 'transparent', border: 'none',
                color: '#8a6914', cursor: 'pointer',
                fontSize: 18, fontWeight: 900, padding: '0 4px', lineHeight: 1,
              }}
            >×</button>
          </div>
        )}
        {panelAlert && (
          <div
            style={{
              ...S.panelErrorToast,
              top: showReferralBanner ? 94 : 48,
            }}
            onClick={closePanelAlert}
            role="status"
          >
            <span style={S.panelErrorIcon}>!</span>
            <span style={S.panelErrorText}>{humanizeTradeError(panelAlert, dex)}</span>
            <button
              type="button"
              data-nodrag
              style={S.panelErrorClose}
              onClick={(e) => {
                e.stopPropagation();
                closePanelAlert();
              }}
              aria-label="Close error"
            >
              x
            </button>
          </div>
        )}
        <div className="futures-panel-body" style={S.body}>
          <div key={activeTab} style={{
            animation: 'fadeIn 0.25s ease-out',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            height: activeTab === 'Trade' && fullscreen && isMobile ? 'auto' : '100%',
            minHeight: activeTab === 'Trade' && fullscreen && isMobile ? '100%' : 0,
          }}>
            {renderContent()}
          </div>
        </div>

        {dex === 'ostium' && oneTapWalletFallback && (
          <div style={S.oneTapFallbackWrap}>
            <OstiumWalletFallbackBar
              action={oneTapWalletFallback}
              loading={loading}
              onRetry={handleOstiumWalletFallback}
              onDismiss={clearOneTapWalletFallback}
            />
          </div>
        )}

        {/* Powered by DEX footer — switches logo + label per active DEX */}
        <div style={S.pacificaFooter}>
          {(() => {
            const cfg = DEX_CONFIG[dex] || DEX_CONFIG.pacifica;
            const brand = cfg.id === 'monad' ? 'Perpl' : cfg.label;
            const logoFilter = cfg.id === 'avantis'
              ? 'brightness(0) saturate(100%) invert(49%) sepia(88%) saturate(1854%) hue-rotate(173deg) brightness(93%) contrast(97%)'
              : 'none';
            return (
              <>
                <img
                  src={cfg.logo || pacificaLogo}
                  alt={brand}
                  style={{
                    height: cfg.id === 'hibachi' ? 18 : 16,
                    width: 'auto',
                    objectFit: 'contain',
                    filter: logoFilter,
                  }}
                />
                <span style={S.pacificaText}>Powered by</span>
                <span style={{ ...S.pacificaBrand, color: cfg.colorDark || S.pacificaBrand.color }}>
                  {brand}
                </span>
              </>
            );
          })()}
        </div>

        {tradeIdeaOpen && (
          <TradeIdeaModal
            symbol={symbol}
            currentPrice={currentPrice}
            onClose={() => setTradeIdeaOpen(false)}
            onApply={(idea) => {
              // Pre-fill the order form with the suggested idea.
              setOrderType('limit');
              setLimitPrice(String(idea.entry));
              setAmountInUsdc(true);
              // Size → small default, user adjusts leverage/amount before confirming.
              setAmount('');
              setSizePct(0);
            }}
          />
        )}

        {/* Gold earned notification */}
        {goldEarned && (
          <GoldRewardToast
            amount={typeof goldEarned === 'number' ? goldEarned : goldEarned.amount}
            reason={typeof goldEarned === 'number' ? 'Trading rewards' : (goldEarned.reason || 'Trading rewards')}
            onClose={() => clearGoldEarned()}
            style={GOLD_REWARD_PANEL_TOAST_STYLE}
          />
        )}
      </div>
      <FlashFundingStatusModal
        progress={dex === 'flash' ? flashFundingProgress : null}
        onClose={closeFlashFundingProgress}
      />
      <ShareTradeModal
        open={!!shareTrade}
        trade={shareTrade}
        onClose={() => setShareTrade(null)}
      />
    </>
  );
}

export default memo(FuturesPanel);

const animCSS = `
  .futures-tabs-scroll::-webkit-scrollbar { display: none; }

  /* Floating Explain pill — starts as a circle (just "?"), expands on hover to show "Explain" */
  .explain-chart-pill {
    position: absolute; bottom: 8px; right: 8px; z-index: 20;
    display: inline-flex; align-items: center;
    height: 28px; width: 28px; padding: 0;
    background: rgba(255, 255, 255, 0.92);
    color: #5C3A21;
    border: 2px solid #5C3A21;
    border-radius: 999px;
    cursor: pointer; overflow: hidden;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    transition: width 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), padding 0.22s ease, background 0.15s ease;
    font-family: inherit;
  }
  .explain-chart-pill:hover,
  .explain-chart-pill:focus-visible {
    width: 112px;
    padding: 0 10px 0 4px;
    background: #fff;
    outline: none;
  }
  .explain-chart-pill .explain-q {
    width: 22px; height: 22px; flex-shrink: 0;
    margin-left: 1px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }
  .explain-chart-pill .explain-label {
    max-width: 0; opacity: 0;
    overflow: hidden; white-space: nowrap;
    font-size: 12px; font-weight: 800;
    margin-left: 0;
    transition: max-width 0.22s ease, opacity 0.15s ease 0.05s, margin-left 0.22s ease;
  }
  .explain-chart-pill:hover .explain-label,
  .explain-chart-pill:focus-visible .explain-label {
    max-width: 100px; opacity: 1; margin-left: 6px;
  }
  /* On touch devices — stay as a circle; a tap just opens the modal */
  @media (hover: none) {
    .explain-chart-pill:hover { width: 28px; padding: 0; }
    .explain-chart-pill:hover .explain-label { max-width: 0; opacity: 0; margin-left: 0; }
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 0 rgba(232, 184, 48, 0.6); }
    50% { box-shadow: 0 0 12px rgba(232, 184, 48, 0.9); }
  }
  @keyframes wallet-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes futures-close-spin {
    to { transform: rotate(360deg); }
  }
  /* Gradient Scrollbar */
  .grad-scrollbar::-webkit-scrollbar { width: 8px; }
  .grad-scrollbar::-webkit-scrollbar-track { background: #fdf8e7; border-radius: 4px; }
  .grad-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #d4c8b0 0%, #bba882 100%); border-radius: 4px; border: 1px solid #fdf8e7; }
  .grad-scrollbar::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #bba882 0%, #a3906a 100%); }

  /* Gradient Range Slider */
  .grad-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 8px;
    background: linear-gradient(90deg, #5C3A21 0%, #5C3A21 var(--val, 0%), #d4c8b0 var(--val, 0%), #d4c8b0 100%);
    border-radius: 4px;
    outline: none;
    cursor: pointer;
  }
  .grad-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fdf8e7;
    border: 4px solid #5C3A21;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    cursor: pointer;
  }
  .grad-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fdf8e7;
    border: 4px solid #5C3A21;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    cursor: pointer;
  }

  .futures-panel-body::-webkit-scrollbar { display: none; }
  .futures-panel-body { overflow-x: hidden !important; }
  .futures-panel-body input[type=number]::-webkit-inner-spin-button,
  .futures-panel-body input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .futures-panel-body input[type=number] { -moz-appearance: textfield; }
  @keyframes slideDown { from { opacity:0; transform:scaleY(0.95); } to { opacity:1; transform:scaleY(1); } }
  @keyframes fadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }

  /* Tab Icon Animations */
  @keyframes drawLine {
    0% { stroke-dashoffset: 20; }
    100% { stroke-dashoffset: 0; }
  }
  .tab-icon-trade .trend-line { stroke-dasharray: 20; stroke-dashoffset: 0; }
  .tab-btn:hover .tab-icon-trade .trend-line, .tab-btn.active .tab-icon-trade .trend-line {
    animation: drawLine 0.6s ease-out forwards;
  }
  
  @keyframes briefcase-pop {
    0%, 100% { transform: scale(1) translateY(0); }
    50% { transform: scale(1.1, 0.9) translateY(2px); }
  }
  @keyframes handle-pop {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  .tab-icon-positions .handle { transform-origin: center; }
  .tab-icon-positions .briefcase-body { transform-origin: bottom center; }
  .tab-btn:hover .tab-icon-positions .handle, .tab-btn.active .tab-icon-positions .handle {
    animation: handle-pop 0.5s ease;
  }
  .tab-btn:hover .tab-icon-positions .briefcase-body, .tab-btn.active .tab-icon-positions .briefcase-body {
    animation: briefcase-pop 0.5s ease;
  }

  @keyframes order-slide {
    0% { transform: translateX(-6px); opacity: 0; }
    100% { transform: translateX(0); opacity: 1; }
  }
  .tab-icon-orders .order-line { opacity: 1; }
  .tab-btn:hover .tab-icon-orders .order-line, .tab-btn.active .tab-icon-orders .order-line {
    animation: order-slide 0.4s both;
  }
  .tab-btn:hover .tab-icon-orders .order-line:nth-child(2), .tab-btn.active .tab-icon-orders .order-line:nth-child(2) { animation-delay: 0.1s; }
  .tab-btn:hover .tab-icon-orders .order-line:nth-child(3), .tab-btn.active .tab-icon-orders .order-line:nth-child(3) { animation-delay: 0.2s; }
  
  @keyframes head-bob {
    0%, 100% { transform: translateY(0) rotate(0); }
    25% { transform: translateY(-2px) rotate(-10deg); }
    75% { transform: translateY(-2px) rotate(10deg); }
  }
  @keyframes body-shrug {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(0.9); }
  }
  .tab-icon-account .avatar-head { transform-origin: center 7px; }
  .tab-icon-account .avatar-body { transform-origin: bottom center; }
  .tab-btn:hover .tab-icon-account .avatar-head, .tab-btn.active .tab-icon-account .avatar-head {
    animation: head-bob 0.6s ease-in-out;
  }
  .tab-btn:hover .tab-icon-account .avatar-body, .tab-btn.active .tab-icon-account .avatar-body {
    animation: body-shrug 0.6s ease-in-out;
  }
  
  @keyframes sword-swing {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-25deg); }
  }
  .tab-icon-quests .sword-group { transform-origin: 16px 16px; }
  .tab-btn:hover .tab-icon-quests .sword-group, .tab-btn.active .tab-icon-quests .sword-group {
    animation: sword-swing 0.5s ease-out;
  }

`;

const DESKTOP_PANEL_WIDTH = 'clamp(400px, 30vw, 620px)';
const DESKTOP_PANEL_GUTTER = 'clamp(12px, 1.25vw, 24px)';

const S = {
  containerFull: {
    position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%',
    background: '#e8dfc8', border: '0px solid #d4c8b0', borderRadius: 0,
    display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflow: 'hidden', zIndex: 100,
    boxShadow: '0 0 0 rgba(0,0,0,0)', fontFamily: '"Inter","Segoe UI",sans-serif',
    boxSizing: 'border-box',
  },
  container: {
    position: 'fixed',
    top: DESKTOP_PANEL_GUTTER,
    right: DESKTOP_PANEL_GUTTER,
    bottom: 150,
    width: DESKTOP_PANEL_WIDTH,
    maxWidth: 'calc(100vw - 32px)',
    background: '#e8dfc8', border: '6px solid #d4c8b0', borderRadius: 24,
    display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflow: 'hidden', zIndex: 100,
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)', fontFamily: '"Inter","Segoe UI",sans-serif',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
    cursor: 'grab', userSelect: 'none',
  },
  headerTitle: { fontSize: 16, fontWeight: 900, color: '#5C3A21' },
  tabActive: {
    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
    background: '#fdf8e7', border: '3px solid #bba882', borderRadius: 12,
    color: '#333', boxShadow: '0 3px 0 #bba882', transform: 'translateY(-1px)', cursor: 'default',
    minHeight: 36,
  },
  tabInactive: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
    background: '#bba882', border: '3px solid #a3906a', borderRadius: 12,
    color: '#333', boxShadow: '0 3px 0 #a3906a', cursor: 'pointer', padding: 0,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: '50%', background: '#E53935', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    boxShadow: '0 3px 5px rgba(0,0,0,0.3)',
  },
  body: {
    flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    overflowY: 'auto', overflowX: 'hidden', background: '#fdf8e7', scrollbarWidth: 'none',
    minHeight: 0,
  },
  pacificaFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '6px 12px', borderTop: '3px solid #d4c8b0',
    background: 'linear-gradient(90deg, #e8dfc8 0%, #fdf8e7 50%, #e8dfc8 100%)',
    flexShrink: 0,
  },
  pacificaLogo: { width: 20, height: 20, objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' },
  pacificaText: { fontSize: 10, fontWeight: 700, color: '#a3906a', letterSpacing: '0.05em', textTransform: 'uppercase' },
  pacificaBrand: { fontSize: 11, fontWeight: 900, color: '#5C3A21', letterSpacing: '0.08em', textTransform: 'uppercase' },
  symbolBar: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '4px 15px',
    background: 'transparent', flexShrink: 0,
    overflowX: 'auto', scrollbarWidth: 'none', minHeight: 0,
  },
  symbolBarCompact: {
    gap: 6, padding: '4px 8px', justifyContent: 'space-between',
    overflowX: 'hidden',
  },
  infoCell: { display: 'flex', flexDirection: 'column', gap: 0, width: 90, flexShrink: 0 },
  infoCellWide: { width: 118 },
  infoCellLabel: { fontSize: 9, fontWeight: 700, color: '#a3906a', textTransform: 'uppercase', lineHeight: 1 },
  infoCellValue: { fontSize: 13, fontWeight: 900, color: '#5C3A21', fontFamily: 'monospace', whiteSpace: 'nowrap', lineHeight: 1.2 },
  infoCellValueCompact: { fontSize: 11 },
  fundingOverlay: {
    position: 'absolute', top: 5, right: 10, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 6,
    pointerEvents: 'none',
  },
  fundingOverlayCompact: { right: 6, gap: 3 },
  fundingOLabel: { fontSize: 10, fontWeight: 800, color: '#a3906a', letterSpacing: '0.04em' },
  fundingOValue: { fontSize: 11, fontWeight: 900, fontFamily: 'monospace' },
  fundingOValueCompact: { fontSize: 10 },
  // Common
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { color: '#5C3A21', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' },
  detail: { fontSize: 12, fontWeight: 700, color: '#77573d' },
  orderPendingBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 6px',
    borderRadius: 6,
    border: '1px solid #d4c8b0',
    background: '#fff7d6',
    color: '#8a6d2f',
    fontSize: 10,
    fontWeight: 900,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  orderPendingSpinner: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#d4c8b0',
    borderTopColor: '#8a6d2f',
    animation: 'wallet-spin 0.75s linear infinite',
    flexShrink: 0,
  },
  attachedTpslRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: '5px 7px',
    borderRadius: 8,
    background: 'rgba(255, 248, 231, 0.72)',
    border: '1px solid #d4c8b0',
  },
  attachedTpslLeg: {
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1.15,
    whiteSpace: 'nowrap',
  },
  attachedTpslTableRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
    color: '#77573d',
  },
  attachedTpslLegCompact: {
    fontSize: 10,
    fontWeight: 900,
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
  },
  input: {
    background: '#fff', border: '3px solid #d4c8b0', borderRadius: 10,
    padding: '9px 10px', color: '#333', fontSize: 15, fontWeight: 700, outline: 'none',
    width: '100%', boxSizing: 'border-box', minWidth: 0,
  },
  errorBar: {
    background: '#E5393520', border: '2px solid #E53935', borderRadius: 8,
    padding: '7px 10px', color: '#B71C1C', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
    minWidth: 0, maxWidth: '100%', overflow: 'hidden', overflowWrap: 'anywhere', wordBreak: 'break-word',
  },
  errorText: {
    flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word',
  },
  errorCloseIcon: {
    color: '#B71C1C', fontSize: 14, fontWeight: 900, opacity: 0.7, flexShrink: 0,
  },
  panelErrorToast: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 45,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    padding: '8px 10px',
    background: 'linear-gradient(180deg, #fff4e6 0%, #ffe3e0 100%)',
    border: '2px solid #E53935',
    borderRadius: 10,
    boxShadow: '0 5px 14px rgba(92,58,33,0.24)',
    color: '#8A1C13',
    fontSize: 11,
    fontWeight: 850,
    lineHeight: 1.25,
    cursor: 'pointer',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  },
  panelErrorIcon: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#E53935',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 950,
    flexShrink: 0,
    lineHeight: 1,
  },
  panelErrorText: {
    flex: '1 1 auto',
    minWidth: 0,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  panelErrorClose: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'rgba(138,28,19,0.12)',
    border: 'none',
    color: '#8A1C13',
    fontSize: 12,
    fontWeight: 950,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
    lineHeight: 1,
  },
  oneTapFallbackWrap: {
    padding: '0 10px 8px',
    flex: '0 0 auto',
  },
  oneTapFallbackBar: {
    background: '#E5393520',
    border: '2px solid #E53935',
    borderRadius: 8,
    padding: 9,
    color: '#B71C1C',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  oneTapFallbackHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
  },
  oneTapFallbackDismiss: {
    background: 'transparent',
    border: 'none',
    color: '#B71C1C',
    fontSize: 16,
    fontWeight: 900,
    lineHeight: 1,
    padding: 0,
    cursor: 'pointer',
    opacity: 0.75,
    flexShrink: 0,
  },
  successBar: {
    background: '#4CAF5020', border: '2px solid #4CAF50', borderRadius: 8,
    padding: '7px 10px', color: '#2E7D32', fontSize: 12, fontWeight: 800, cursor: 'pointer',
    textAlign: 'center',
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    flex: 1, gap: 12, opacity: 0.5,
  },
  // Trade
  chartArea: {
    width: '100%', flex: 1, minHeight: 200, background: '#fff', borderRadius: 12,
    border: '4px solid #d4c8b0', overflow: 'hidden', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.1)',
    position: 'relative',
  },
  chartFullscreen: {
    width: '100%', flex: 3, minHeight: 400, background: '#fff', borderRadius: 12,
    border: '4px solid #d4c8b0', overflow: 'hidden', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.1)',
    position: 'relative',
  },
  headerBtn: {
    width: 32, height: 32, borderRadius: '50%', background: '#1E88E5', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    boxShadow: '0 3px 5px rgba(0,0,0,0.3)',
  },
  symbolBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 10, cursor: 'pointer', color: '#333',
  },
  symbolBtnCompact: {
    flex: '0 1 auto', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box',
  },
  symbolPriceCompact: {
    flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
  },
  symbolBarActions: {
    marginLeft: 'auto', display: 'flex', alignItems: 'center', flexShrink: 0,
  },
  symbolBarActionsCompact: {
    marginLeft: 0, minWidth: 0,
  },
  balanceSummary: {
    display: 'flex', alignItems: 'stretch', flexShrink: 0,
    minWidth: 142, padding: '4px 7px',
    background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
    boxSizing: 'border-box',
  },
  balanceSummaryCompact: {
    minWidth: 134, padding: '4px',
  },
  balanceSummaryMobile: {
    minWidth: 116,
    padding: '4px 5px',
  },
  balanceMetric: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center',
    minWidth: 56, padding: '0 4px',
  },
  balanceMetricCompact: {
    minWidth: 52, padding: '0 3px',
  },
  balanceMetricMobile: {
    minWidth: 46,
    padding: '0 2px',
  },
  balanceMetricLabel: {
    fontSize: 8, fontWeight: 800, color: '#8C7D5C', lineHeight: 1,
    letterSpacing: 0, textTransform: 'uppercase', whiteSpace: 'nowrap',
  },
  balanceMetricValue: {
    fontSize: 12, fontWeight: 900, color: '#5C3A21', lineHeight: 1.2,
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  },
  balanceLoadingValue: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
    minHeight: 14, color: '#8C7D5C', fontSize: 9, textTransform: 'uppercase',
  },
  balanceLoadingSpinner: {
    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
    borderWidth: 2, borderStyle: 'solid', borderColor: '#c7b996',
    borderTopColor: '#5C3A21', animation: 'wallet-spin 0.75s linear infinite',
  },
  balanceDivider: {
    width: 1, alignSelf: 'stretch', margin: '0 2px',
    background: '#c7b996', opacity: 0.9,
  },
  chips: {
    display: 'flex', flexWrap: 'wrap', gap: 5, padding: 8,
    background: '#e8dfc8', borderRadius: 10, border: '2px solid #d4c8b0', animation: 'slideDown 0.2s',
  },
  chip: {
    padding: '5px 10px', background: '#fdf8e7', border: '2px solid #d4c8b0',
    borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#5C3A21',
  },
  chipActive: {
    padding: '5px 10px', background: '#4CAF50', border: '2px solid #2E7D32',
    borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#fff',
  },
  depositRow: {
    display: 'flex', gap: 6, background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 10, padding: 8,
  },
  depositBtn: {
    padding: '8px 14px', background: '#4CAF50', border: '2px solid #2E7D32', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer',
  },
  tradeBox: {
    display: 'flex', flexDirection: 'column', gap: 10, background: '#e8dfc8',
    padding: 12, borderRadius: 14, border: '3px solid #d4c8b0',
    minWidth: 0, boxSizing: 'border-box',
  },
  typeBtn: {
    flex: 1, padding: '7px', background: '#d4c8b0', border: '2px solid #bba882',
    borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12, color: '#5C3A21', textTransform: 'uppercase',
  },
  typeActive: {
    flex: 1, padding: '7px', background: '#fdf8e7', border: '2px solid #bba882',
    borderRadius: 8, fontWeight: 800, fontSize: 12, color: '#333', textTransform: 'uppercase',
    boxShadow: '0 2px 0 #bba882',
  },
  levBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000,
  },
  levModal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 320, background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 20,
    padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
    boxShadow: '0 15px 40px rgba(0,0,0,0.4)', zIndex: 10001,
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  levCloseBtn: {
    width: 28, height: 28, borderRadius: '50%', background: '#E53935', border: '2px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  marginSwapBtn: {
    padding: '8px 12px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
    fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    height: '100%', boxSizing: 'border-box', whiteSpace: 'nowrap', flexShrink: 0,
    lineHeight: 1,
  },
  levPreset: {
    flex: 1, padding: '8px 0', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
    fontWeight: 800, fontSize: 13, color: '#5C3A21', cursor: 'pointer', textAlign: 'center',
  },
  levPresetActive: {
    flex: 1, padding: '8px 0', background: '#4CAF50', border: '2px solid #2E7D32', borderRadius: 8,
    fontWeight: 800, fontSize: 13, color: '#fff', cursor: 'pointer', textAlign: 'center',
    boxShadow: '0 2px 0 #2E7D32',
  },
  unitToggle: {
    padding: '2px 8px', background: '#d4c8b0', border: '2px solid #bba882', borderRadius: 6,
    fontSize: 10, fontWeight: 800, color: '#5C3A21', cursor: 'pointer', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center',
  },
  midPriceBtn: {
    padding: '2px 9px',
    background: '#fdf8e7',
    border: '2px solid #bba882',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 900,
    color: '#5C3A21',
    cursor: 'pointer',
    textTransform: 'uppercase',
    lineHeight: 1.2,
  },
  levBtn: {
    width: '100%', background: '#fff', border: '3px solid #d4c8b0', borderRadius: 10,
    padding: '9px 10px', color: '#333', fontSize: 15, fontWeight: 800, cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    boxSizing: 'border-box', minWidth: 0,
  },
  sliderBox: {
    background: '#fdf8e7', border: '2px solid #d4c8b0', borderRadius: 10, padding: 10,
    display: 'flex', flexDirection: 'column', gap: 6, animation: 'slideDown 0.2s',
  },
  slider: { width: '100%', cursor: 'pointer', accentColor: '#E53935' },
  sliderLabels: { display: 'flex', justifyContent: 'space-between', color: '#a3906a', fontSize: 11, fontWeight: 700 },
  // Position-size readout — sits right below the Amount+Leverage row so the
  // trader sees leveraged exposure before they commit.
  positionBox: {
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3e8c8 100%)',
    border: '2px solid #d4c8b0', borderRadius: 10,
    padding: '8px 12px',
    display: 'flex', flexDirection: 'column', gap: 2,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  positionRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  },
  positionLabel: {
    fontSize: 11, fontWeight: 900, color: '#a3906a',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  positionValue: {
    fontSize: 18, fontWeight: 900, color: '#5C3A21',
  },
  positionSub: {
    fontSize: 11, fontWeight: 700, color: '#5C3A21',
  },
  tradeBtn: { flex: 1, minWidth: 0, padding: '11px 6px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tradeBtnText: { color: '#fff', fontSize: 20, fontWeight: 900, textShadow: '0 2px 0 rgba(0,0,0,0.4)' },
  // Positions
  posCard: {
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
    padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5,
    // `flex: 0 0 auto` keeps the card sized to its content. Older value
    // `0 1 380px` set flex-basis=380px which, inside a column flex parent,
    // becomes a 380px MIN HEIGHT — fine for positions cards (size + entry +
    // mark + leverage + PnL fill the space), but order cards have only 2
    // rows so they ballooned with empty whitespace below.
    flex: '0 0 auto',
  },
  fullCard: {
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
    padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5,
    width: '100%',
  },
  expandPanel: {
    display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4,
    animation: 'slideDown 0.2s ease-out',
  },
  tpslEditor: {
    display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4,
    animation: 'slideDown 0.2s ease-out',
  },
  tpslMetaRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
    flexWrap: 'wrap', fontSize: 11, fontWeight: 800, color: '#77573d',
    background: 'rgba(255,255,255,0.35)', border: '1px solid #d4c8b0',
    borderRadius: 8, padding: '5px 8px',
  },
  tpslModeRow: {
    display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
  },
  tpslModeLabel: {
    fontSize: 10, fontWeight: 900, color: '#77573d', textTransform: 'uppercase', flexShrink: 0,
  },
  tpslModeGroup: {
    display: 'flex', gap: 4, flex: '1 1 auto', minWidth: 0,
  },
  tpslModeButton: {
    flex: 1, minWidth: 0, padding: '5px 4px', background: '#d4c8b0',
    border: '2px solid #bba882', borderRadius: 7, color: '#5C3A21',
    fontWeight: 900, fontSize: 10, cursor: 'pointer', textAlign: 'center',
  },
  tpslModeActive: {
    flex: 1, minWidth: 0, padding: '5px 4px', background: '#fdf8e7',
    border: '2px solid #8a5f35', borderRadius: 7, color: '#5C3A21',
    fontWeight: 950, fontSize: 10, cursor: 'pointer', textAlign: 'center',
    boxShadow: '0 1px 0 rgba(92,58,33,0.25)',
  },
  tpslInputGrid: {
    display: 'flex', gap: 6, alignItems: 'stretch', flexWrap: 'wrap',
  },
  tpslField: {
    flex: '1 1 118px', minWidth: 118, display: 'flex', flexDirection: 'column', gap: 3,
  },
  tpslInput: {
    background: '#fff', border: '3px solid #d4c8b0', borderRadius: 10,
    padding: '7px 8px', color: '#333', fontSize: 12, fontWeight: 800,
    outline: 'none', width: '100%', boxSizing: 'border-box', minWidth: 0,
  },
  tpslPreview: {
    minHeight: 13, fontSize: 10, fontWeight: 850, lineHeight: 1.25,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  tpslHint: {
    fontSize: 10, fontWeight: 750, color: '#8a7252', lineHeight: 1.2,
  },
  openTpslBox: {
    border: '2px solid #d4c8b0', borderRadius: 10, background: 'rgba(255,255,255,0.28)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  openTpslBoxActive: {
    border: '2px solid #f2a000', borderRadius: 10, background: '#fff7d6',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 1px 0 rgba(92,58,33,0.16)',
  },
  openTpslHeader: {
    width: '100%', border: 'none', background: 'transparent', padding: '7px 9px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    cursor: 'pointer', color: '#5C3A21',
  },
  openTpslTitle: { fontSize: 12, fontWeight: 950, textTransform: 'uppercase' },
  openTpslToggleOff: {
    fontSize: 10, fontWeight: 950, padding: '2px 7px', borderRadius: 999,
    background: '#d4c8b0', color: '#6f5a3d',
  },
  openTpslToggleOn: {
    fontSize: 10, fontWeight: 950, padding: '2px 7px', borderRadius: 999,
    background: '#16A34A', color: '#fff',
  },
  openTpslBody: {
    display: 'flex', flexDirection: 'column', gap: 6, padding: '0 8px 8px',
  },
  openTpslInputGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6,
  },
  openTpslNotice: {
    fontSize: 10, fontWeight: 750, color: '#8a7252', lineHeight: 1.2,
  },
  openTpslNoticeWarn: {
    fontSize: 10, fontWeight: 850, color: '#9A3412', lineHeight: 1.2,
  },
  btnRed: {
    flex: 1, padding: '8px', background: '#E53935', border: '2px solid #B71C1C', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 0 #B71C1C', textAlign: 'center',
  },
  closeLoadingLabel: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 14, whiteSpace: 'nowrap',
  },
  closeLoadingSpinner: {
    width: 12, height: 12, borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.42)',
    borderTopColor: '#fff',
    animation: 'futures-close-spin 0.75s linear infinite',
    flexShrink: 0,
  },
  btnBlue: {
    padding: '8px 12px', background: '#1E88E5', border: '2px solid #1565C0', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 0 #1565C0',
  },
  btnPurple: {
    padding: '8px 12px', background: '#9945FF', border: '2px solid #7B36CC', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 0 #7B36CC',
  },
  btnSmall: {
    padding: '8px 10px', background: '#d4c8b0', border: '2px solid #bba882', borderRadius: 8,
    fontWeight: 800, fontSize: 12, color: '#5C3A21', cursor: 'pointer',
  },
  marketClosedHint: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '8px 10px',
    background: '#FFF7D6',
    border: '2px solid #F59E0B',
    borderRadius: 10,
    color: '#7C2D12',
    fontSize: 11,
    fontWeight: 750,
    lineHeight: 1.25,
    boxShadow: '0 2px 0 rgba(181,139,42,0.25)',
  },
  marketClosedHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  marketClosedTitle: {
    fontSize: 12,
    fontWeight: 950,
    textTransform: 'uppercase',
    color: '#B45309',
  },
  marketClosedSymbol: {
    fontSize: 11,
    fontWeight: 950,
    color: '#5C3A21',
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(180,83,9,0.22)',
    borderRadius: 6,
    padding: '2px 6px',
    whiteSpace: 'nowrap',
  },
  marketClosedCopy: {
    color: '#7C2D12',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  marketClosedActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  marketClosedActionLabel: {
    fontSize: 10,
    fontWeight: 900,
    color: '#9A6B24',
    textTransform: 'uppercase',
  },
  marketClosedChoice: {
    padding: '4px 7px',
    background: '#fdf8e7',
    border: '2px solid #d4c8b0',
    borderRadius: 7,
    cursor: 'pointer',
    color: '#5C3A21',
    fontSize: 11,
    fontWeight: 900,
  },
  noBalanceHint: {
    padding: '8px 12px', background: '#FFF3E0', border: '2px solid #FF9800', borderRadius: 8,
    color: '#E65100', fontSize: 12, fontWeight: 700, textAlign: 'center', cursor: 'pointer',
  },
  balCard: {
    flex: 1, background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
    padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  },
  balCardLabel: { fontSize: 10, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase' },
  balCardValue: { fontSize: 18, fontWeight: 900, color: '#5C3A21' },
  cancelBtn: {
    width: 26, height: 26, borderRadius: '50%', background: '#E53935', border: '2px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, padding: 0,
  },
  // Bottom panel (fullscreen)
  bottomPanel: {
    background: '#e8dfc8',
    display: 'flex', flexDirection: 'column', minHeight: 60,
    overflow: 'hidden', flexShrink: 0,
  },
  bottomTabs: {
    display: 'flex', gap: 0, background: '#d4c8b0', flexShrink: 0,
  },
  bottomTabBtn: {
    padding: '6px 20px', background: 'transparent', border: 'none',
    fontSize: 12, fontWeight: 700, color: '#77573d', cursor: 'pointer',
    borderBottom: '2px solid transparent',
  },
  bottomTabActive: {
    padding: '6px 20px', background: '#e8dfc8', border: 'none',
    fontSize: 12, fontWeight: 800, color: '#5C3A21', cursor: 'default',
    borderBottom: '2px solid #4CAF50',
  },
  dragHandleV: {
    width: 6, cursor: 'col-resize', background: '#d4c8b0', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  },
  dragHandleH: {
    height: 6, cursor: 'row-resize', background: '#bba882', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  },
  bottomContent: { flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', position: 'relative' },
  filterBtn: {
    marginLeft: 'auto', padding: '4px 8px', background: 'transparent', border: 'none',
    cursor: 'pointer', color: '#77573d', display: 'flex', alignItems: 'center', gap: 4, position: 'relative',
  },
  filterBtnActive: { color: '#4CAF50' },
  filterDot: {
    position: 'absolute', top: 2, right: 2, width: 6, height: 6,
    borderRadius: '50%', background: '#4CAF50',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' },
  th: { padding: '4px 12px', textAlign: 'left', color: '#a3906a', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', background: '#e8dfc8' },
  td: { padding: '4px 12px', color: '#5C3A21', fontSize: 12, borderBottom: '1px solid #d4c8b0' },
  tr: { background: '#fdf8e7' },
  tblCloseBtn: {
    padding: '2px 8px', background: '#E53935', border: 'none', borderRadius: 4,
    color: '#fff', fontWeight: 800, fontSize: 10, cursor: 'pointer',
  },
};
