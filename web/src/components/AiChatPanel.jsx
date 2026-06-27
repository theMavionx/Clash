import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPublicClient, createWalletClient, custom, http, verifyTypedData } from 'viem';
import { arbitrum, base } from 'viem/chains';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePlayer } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useAvantis } from '../hooks/useAvantis';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import EvmWalletModal from './EvmWalletModal';
import { BASE_CHAIN_ID, TRADING_ADDRESS, ensureBaseChain } from '../lib/avantisContract';
import { ARBITRUM_CHAIN_ID, ensureArbitrumChain } from '../lib/gmxConfig';
import { MONAD_CHAIN_ID, ensureMonadChain, monadChain } from '../lib/monadConfig';
import { INK_CHAIN_ID, ensureInkChain, inkChain } from '../lib/nadoConfig';
import { fetchGameShopConfig, buySolanaShopItem, buyEvmShopItem, buyAptosShopItem } from '../lib/gameShop';
import {
  avantisPlaceOrderSignature,
  duplicateAvantisPlaceOrderMessage,
  findDuplicateAvantisPlaceOrder,
} from '../lib/avantisDuplicateGuard';

const CHAT_HISTORY_LIMIT = 40;
const CONTEXT_MESSAGE_LIMIT = 4;
const PENDING_REQUEST_TTL_MS = 10 * 60 * 1000;
const INITIAL_MESSAGES = [
  { role: 'assistant', text: 'Ready when you are.' },
];
const AGENT_PROGRESS_MESSAGES = [
  'Reading your request...',
  'Preparing the game agent...',
  'Checking the current game state...',
  'Planning the next game action...',
  'Calling Clash game tools...',
  'Waiting for the agent route...',
  'Finalizing the answer...',
];
const AVANTIS_BROWSER_ACTION_STORAGE_KEY = 'clash_avantis_browser_actions_v1';
const AVANTIS_AGENT_PERMISSION_STORAGE_KEY = 'clash_avantis_agent_permission_v2';
const AVANTIS_AI_TRADE_SETTINGS_STORAGE_KEY = 'clash_avantis_ai_trade_settings_v1';
const AVANTIS_AGENT_PERMISSION_TTL_MS = 30 * 60 * 1000;
const AVANTIS_AGENT_SCOPE = 'avantis:place_order,close_position,cancel_order,set_tpsl';
const AVANTIS_AGENT_PERMISSION_TYPES = {
  AvantisAgentPermission: [
    { name: 'wallet', type: 'address' },
    { name: 'scope', type: 'string' },
    { name: 'maxCollateralCents', type: 'uint256' },
    { name: 'maxBalanceBps', type: 'uint256' },
    { name: 'maxLeverage', type: 'uint256' },
    { name: 'maxNotionalCents', type: 'uint256' },
    { name: 'maxSlippageBps', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
};
const AVANTIS_BROWSER_POLICY_DEFAULTS = {
  max_collateral_usd: 100,
  max_leverage: Number(import.meta.env?.VITE_CLASH_AVANTIS_AI_MAX_LEVERAGE || 50),
  max_notional_usd: 1000,
  max_slippage_pct: 5,
};
const AVANTIS_AI_TRADE_SETTINGS_DEFAULTS = {
  collateral_limit_mode: 'percent',
  max_balance_pct: 100,
  max_collateral_usd: 100,
  max_leverage: Number(import.meta.env?.VITE_CLASH_AVANTIS_AI_MAX_LEVERAGE || 50),
  max_slippage_pct: 5,
};
const HERMES_JOB_DEFAULTS = {
  name: 'RSI / MACD watcher',
  instruction: 'Buy only when RSI hits 25 or lower, MACD crosses up, and volume is good. Otherwise just report no action.',
  mode: 'monitor_only',
  symbols: ['BTC', 'ETH', 'SOL'],
  interval_minutes: 60,
  max_runs_per_day: 6,
  max_messages_total: 0,
  policy: {
    scan_timeframe: '1h',
    lookback_candles: 160,
    max_collateral_usd: 10,
    max_balance_pct: 25,
    max_leverage: 3,
    max_slippage_pct: 2,
    max_trades_per_day: 1,
    cooldown_minutes: 240,
    max_open_positions: 1,
    allow_open: true,
    allow_close: false,
    allow_tpsl: false,
    allow_cancel: false,
  },
};
const HERMES_JOB_INTERVALS = [15, 30, 60, 120, 240, 720, 1440];
const HERMES_JOB_TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];

function cloneHermesJobDefaults() {
  return JSON.parse(JSON.stringify(HERMES_JOB_DEFAULTS));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, safe));
}

function policyNumber(policy, key) {
  const value = Number(policy?.[key]);
  const fallback = Number(AVANTIS_BROWSER_POLICY_DEFAULTS[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeAvantisAiTradeSettings(settings = {}, basePolicy = AVANTIS_BROWSER_POLICY_DEFAULTS) {
  const maxPolicyCollateral = policyNumber(basePolicy, 'max_collateral_usd');
  const maxPolicyLeverage = policyNumber(basePolicy, 'max_leverage');
  const maxPolicySlippage = policyNumber(basePolicy, 'max_slippage_pct');
  const collateralMode = settings?.collateral_limit_mode === 'usdc' ? 'usdc' : 'percent';
  return {
    collateral_limit_mode: collateralMode,
    max_balance_pct: Number(clampNumber(settings?.max_balance_pct, 1, 100, AVANTIS_AI_TRADE_SETTINGS_DEFAULTS.max_balance_pct).toFixed(2)),
    max_collateral_usd: Number(clampNumber(settings?.max_collateral_usd, 1, maxPolicyCollateral, Math.min(AVANTIS_AI_TRADE_SETTINGS_DEFAULTS.max_collateral_usd, maxPolicyCollateral)).toFixed(2)),
    max_leverage: Number(clampNumber(settings?.max_leverage, 1, maxPolicyLeverage, Math.min(AVANTIS_AI_TRADE_SETTINGS_DEFAULTS.max_leverage, maxPolicyLeverage)).toFixed(1)),
    max_slippage_pct: Number(clampNumber(settings?.max_slippage_pct, 0.1, maxPolicySlippage, Math.min(AVANTIS_AI_TRADE_SETTINGS_DEFAULTS.max_slippage_pct, maxPolicySlippage)).toFixed(2)),
  };
}

function effectiveAvantisPolicy(basePolicy = AVANTIS_BROWSER_POLICY_DEFAULTS, settings = {}, walletUsdc = null) {
  const normalized = normalizeAvantisAiTradeSettings(settings, basePolicy);
  const baseCollateral = policyNumber(basePolicy, 'max_collateral_usd');
  const walletBalance = Number(walletUsdc);
  const percentCollateral = Number.isFinite(walletBalance) && walletBalance > 0
    ? walletBalance * normalized.max_balance_pct / 100
    : baseCollateral;
  const maxCollateral = normalized.collateral_limit_mode === 'usdc'
    ? normalized.max_collateral_usd
    : Math.min(baseCollateral, percentCollateral);
  const maxLeverage = Math.min(policyNumber(basePolicy, 'max_leverage'), normalized.max_leverage);
  return {
    ...basePolicy,
    collateral_limit_mode: normalized.collateral_limit_mode,
    max_balance_pct: normalized.max_balance_pct,
    max_collateral_usd: Number(Math.max(0.01, Math.min(baseCollateral, maxCollateral)).toFixed(6)),
    max_leverage: maxLeverage,
    max_notional_usd: Number(Math.min(policyNumber(basePolicy, 'max_notional_usd'), maxCollateral * maxLeverage).toFixed(6)),
    max_slippage_pct: Math.min(policyNumber(basePolicy, 'max_slippage_pct'), normalized.max_slippage_pct),
  };
}

function loadAvantisAiTradeSettings(wallet, basePolicy = AVANTIS_BROWSER_POLICY_DEFAULTS) {
  if (typeof window === 'undefined') return normalizeAvantisAiTradeSettings(AVANTIS_AI_TRADE_SETTINGS_DEFAULTS, basePolicy);
  const key = String(wallet || 'default').toLowerCase();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AVANTIS_AI_TRADE_SETTINGS_STORAGE_KEY) || '{}');
    return normalizeAvantisAiTradeSettings(parsed?.[key] || parsed?.default || AVANTIS_AI_TRADE_SETTINGS_DEFAULTS, basePolicy);
  } catch {
    return normalizeAvantisAiTradeSettings(AVANTIS_AI_TRADE_SETTINGS_DEFAULTS, basePolicy);
  }
}

function saveAvantisAiTradeSettings(wallet, settings, basePolicy = AVANTIS_BROWSER_POLICY_DEFAULTS) {
  const normalized = normalizeAvantisAiTradeSettings(settings, basePolicy);
  if (typeof window === 'undefined') return normalized;
  const key = String(wallet || 'default').toLowerCase();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AVANTIS_AI_TRADE_SETTINGS_STORAGE_KEY) || '{}');
    parsed[key] = normalized;
    if (!parsed.default) parsed.default = normalized;
    window.localStorage.setItem(AVANTIS_AI_TRADE_SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {}
  return normalized;
}

function buildAvantisAiTradeSettingsPayload(settings, effectivePolicy, walletUsdc) {
  return {
    dex: 'avantis',
    collateral_limit_mode: settings.collateral_limit_mode,
    max_balance_pct: settings.max_balance_pct,
    max_collateral_usd: settings.max_collateral_usd,
    effective_max_collateral_usd: effectivePolicy.max_collateral_usd,
    max_leverage: settings.max_leverage,
    effective_max_leverage: effectivePolicy.max_leverage,
    effective_max_notional_usd: effectivePolicy.max_notional_usd,
    max_slippage_pct: settings.max_slippage_pct,
    wallet_usdc: Number.isFinite(Number(walletUsdc)) ? Number(walletUsdc) : null,
  };
}

function policyCents(value) {
  const n = Number(value);
  return BigInt(Math.max(0, Math.round((Number.isFinite(n) ? n : 0) * 100)));
}

function policyBps(value) {
  const n = Number(value);
  return BigInt(Math.max(0, Math.round((Number.isFinite(n) ? n : 0) * 100)));
}

function policyBalanceBps(value) {
  const n = Number(value);
  return BigInt(Math.max(0, Math.round((Number.isFinite(n) ? n : 0) * 100)));
}

function makeAvantisAgentPermissionDomain() {
  return {
    name: 'ClashHermes Avantis Agent',
    version: '1',
    chainId: BASE_CHAIN_ID,
    verifyingContract: TRADING_ADDRESS,
  };
}

function makeAvantisAgentPermissionMessage(wallet, policy, expiresAt) {
  return {
    wallet,
    scope: AVANTIS_AGENT_SCOPE,
    maxCollateralCents: policyCents(policy?.max_collateral_usd),
    maxBalanceBps: policyBalanceBps(policy?.max_balance_pct ?? 100),
    maxLeverage: BigInt(Math.round(policyNumber(policy, 'max_leverage'))),
    maxNotionalCents: policyCents(policy?.max_notional_usd),
    maxSlippageBps: policyBps(policy?.max_slippage_pct),
    expiresAt: BigInt(Math.floor(Number(expiresAt || 0) / 1000)),
  };
}

async function verifyAvantisAgentPermission(record) {
  if (!record?.wallet || !record?.signature || !record?.policy) return false;
  if (Date.now() > Number(record.expires_at || 0)) return false;
  try {
    return await verifyTypedData({
      address: record.wallet,
      domain: makeAvantisAgentPermissionDomain(),
      types: AVANTIS_AGENT_PERMISSION_TYPES,
      primaryType: 'AvantisAgentPermission',
      message: makeAvantisAgentPermissionMessage(record.wallet, record.policy, record.expires_at),
      signature: record.signature,
    });
  } catch {
    return false;
  }
}

function loadAvantisAgentPermission(wallet) {
  if (typeof window === 'undefined' || !wallet) return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(AVANTIS_AGENT_PERMISSION_STORAGE_KEY) || '{}');
    const record = parsed?.[String(wallet).toLowerCase()];
    if (!record || record.scope !== AVANTIS_AGENT_SCOPE) return null;
    if (String(record.wallet || '').toLowerCase() !== String(wallet).toLowerCase()) return null;
    if (!record.signature || Date.now() > Number(record.expires_at || 0)) return null;
    return record;
  } catch {
    return null;
  }
}

function saveAvantisAgentPermission(record) {
  if (typeof window === 'undefined' || !record?.wallet) return;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(AVANTIS_AGENT_PERMISSION_STORAGE_KEY) || '{}');
    parsed[String(record.wallet).toLowerCase()] = record;
    window.sessionStorage.setItem(AVANTIS_AGENT_PERMISSION_STORAGE_KEY, JSON.stringify(parsed));
  } catch {}
}

function actionFitsAvantisAgentPermission(action, permission, options = {}) {
  if (!action || !permission || Date.now() > Number(permission.expires_at || 0)) return false;
  if (!['place_order', 'close_position', 'cancel_order', 'set_tpsl'].includes(action.type)) return false;
  if (action.type !== 'place_order') return true;
  const args = action.args || {};
  const policy = permission.policy || {};
  const effectivePolicy = effectiveAvantisPolicy(policy, {
    collateral_limit_mode: policy.collateral_limit_mode || 'usdc',
    max_balance_pct: policy.max_balance_pct ?? 100,
    max_collateral_usd: policy.max_collateral_usd,
    max_leverage: policy.max_leverage,
    max_slippage_pct: policy.max_slippage_pct,
  }, options.walletUsdc);
  const collateral = Number(args.collateral_usd);
  const leverage = Number(args.leverage || 1);
  const slippage = Number(args.slippage_pct || 1);
  const notional = collateral * leverage;
  const marketMaxLeverage = Number(args.market_max_leverage ?? args.market_analysis?.max_leverage ?? 0);
  return Number.isFinite(collateral)
    && Number.isFinite(leverage)
    && Number.isFinite(slippage)
    && collateral > 0
    && leverage > 0
    && collateral <= Number(effectivePolicy.max_collateral_usd)
    && leverage <= Number(effectivePolicy.max_leverage)
    && (!(marketMaxLeverage > 0) || leverage <= marketMaxLeverage)
    && notional <= Number(effectivePolicy.max_notional_usd)
    && slippage <= Number(effectivePolicy.max_slippage_pct);
}

function avantisActionPolicyError(action, policy, walletUsdc = null) {
  if (!action || action.type !== 'place_order') return '';
  const args = action.args || {};
  const collateral = Number(args.collateral_usd);
  const leverage = Number(args.leverage || 1);
  const slippage = Number(args.slippage_pct || 1);
  const notional = collateral * leverage;
  const marketMaxLeverage = Number(args.market_max_leverage ?? args.market_analysis?.max_leverage ?? 0);
  const effectivePolicy = effectiveAvantisPolicy(policy, {
    collateral_limit_mode: policy?.collateral_limit_mode || 'usdc',
    max_balance_pct: policy?.max_balance_pct ?? 100,
    max_collateral_usd: policy?.max_collateral_usd,
    max_leverage: policy?.max_leverage,
    max_slippage_pct: policy?.max_slippage_pct,
  }, walletUsdc);
  if (!Number.isFinite(collateral) || collateral <= 0) return 'Prepared order has invalid collateral.';
  if (!Number.isFinite(leverage) || leverage <= 0) return 'Prepared order has invalid leverage.';
  if (collateral > Number(effectivePolicy.max_collateral_usd) + 1e-9) {
    return `AI policy blocks collateral above ${formatAiUsd(effectivePolicy.max_collateral_usd)}.`;
  }
  if (leverage > Number(effectivePolicy.max_leverage) + 1e-9) {
    return `AI policy blocks leverage above ${effectivePolicy.max_leverage}x.`;
  }
  if (marketMaxLeverage > 0 && leverage > marketMaxLeverage + 1e-9) {
    return `Avantis ${args.symbol || 'market'} supports max ${marketMaxLeverage}x leverage, but this action prepared ${leverage}x.`;
  }
  if (notional > Number(effectivePolicy.max_notional_usd) + 1e-9) {
    return `AI policy blocks notional above ${formatAiUsd(effectivePolicy.max_notional_usd)}.`;
  }
  if (slippage > Number(effectivePolicy.max_slippage_pct) + 1e-9) {
    return `AI policy blocks slippage above ${effectivePolicy.max_slippage_pct}%.`;
  }
  return '';
}

function formatAiUsd(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(n >= 100 ? 0 : 2)}` : '$0.00';
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanAiSignedZero(value) {
  const n = Number(value || 0);
  return Math.abs(n) < 0.005 ? 0 : n;
}

function formatSignedAiUsd(value) {
  const n = cleanAiSignedZero(value);
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
}

function formatSignedAiPct(value) {
  const n = cleanAiSignedZero(value);
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;
}

function shortEvmAddress(addr, head = 6, tail = 4) {
  const s = String(addr || '');
  return s.length > head + tail + 3 ? `${s.slice(0, head)}...${s.slice(-tail)}` : s;
}

function shortTxHash(hash) {
  const s = String(hash || '');
  return s.length > 18 ? `${s.slice(0, 10)}...${s.slice(-6)}` : s;
}

function formatSmartWalletExpiry(value) {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return 'until expiry';
  try {
    return `until ${new Date(ms).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch {
    return 'until expiry';
  }
}

function normalizeAvantisPanelSide(side) {
  const value = String(side || '').toLowerCase();
  return value === 'short' || value === 'sell' || value === 'ask' ? 'ask' : 'bid';
}

function normalizeAvantisCloseSide(side) {
  const value = String(side || '').toLowerCase();
  return value === 'ask' || value === 'short' || value === 'sell' ? 'short' : 'long';
}

function normalizeAvantisCloseSnapshot(pos, prices = []) {
  if (!pos) return null;
  const symbol = String(pos.symbol || '').toUpperCase();
  const side = normalizeAvantisCloseSide(pos.side);
  const margin = finiteNumber(pos.collateral_usd ?? pos.margin);
  const leverage = finiteNumber(pos.leverage) || 1;
  const entry = finiteNumber(pos.entry_price);
  const priceRow = symbol ? prices.find((p) => String(p.symbol || '').toUpperCase() === symbol) : null;
  const mark = finiteNumber(pos.mark_price ?? pos.current_price ?? pos.price ?? priceRow?.mark ?? priceRow?.mark_price ?? priceRow?.price);
  const amount = finiteNumber(pos.amount) || (entry && margin ? (margin * leverage) / entry : null);
  const notional = finiteNumber(pos.notional_usd ?? pos.size_usd) || (margin ? margin * leverage : null);
  const providedPnl = finiteNumber(pos.pnl_usd ?? pos.pnl);
  const derivedPnl = entry && mark && amount
    ? (mark - entry) * amount * (side === 'long' ? 1 : -1)
    : null;
  return {
    symbol,
    side,
    margin,
    leverage,
    entry,
    mark,
    amount,
    notional,
    pnlUsd: derivedPnl ?? providedPnl,
    pairIndex: finiteNumber(pos.pair_index),
    tradeIndex: finiteNumber(pos.trade_index),
  };
}

function findAvantisCloseSnapshot(action, positions = [], prices = []) {
  const args = action?.args || {};
  const wantedPair = finiteNumber(args.pair_index);
  const wantedTrade = finiteNumber(args.trade_index);
  const wantedSymbol = String(args.symbol || '').toUpperCase();
  const wantedSide = args.side ? normalizeAvantisCloseSide(args.side) : '';
  const live = (positions || []).find((pos) => {
    const pairOk = wantedPair == null || Number(pos.pair_index) === wantedPair;
    const tradeOk = wantedTrade == null || Number(pos.trade_index) === wantedTrade;
    const symbolOk = !wantedSymbol || String(pos.symbol || '').toUpperCase() === wantedSymbol;
    const sideOk = !wantedSide || normalizeAvantisCloseSide(pos.side) === wantedSide;
    return pairOk && tradeOk && symbolOk && sideOk;
  });
  return normalizeAvantisCloseSnapshot(live, prices)
    || normalizeAvantisCloseSnapshot(args.position, prices);
}

function describeAvantisCloseResult(action, positions = [], prices = [], result = {}) {
  if (action?.type !== 'close_position') return '';
  const closeResult = result?.close_result || result?.closeResult || null;
  if (closeResult && typeof closeResult === 'object') {
    const closedCollateral = finiteNumber(closeResult.closed_collateral_usd ?? closeResult.collateral_usd);
    const symbol = String(closeResult.symbol || action.args?.symbol || 'position').toUpperCase();
    const side = normalizeAvantisCloseSide(closeResult.side || action.args?.side).toUpperCase();
    const pnlUsd = finiteNumber(closeResult.realized_pnl_usd_estimate ?? closeResult.pnl_usd);
    const pnlPct = finiteNumber(closeResult.realized_pnl_pct_estimate ?? closeResult.pnl_pct);
    const notional = finiteNumber(closeResult.closed_notional_usd ?? closeResult.notional_usd);
    const entry = finiteNumber(closeResult.entry_price);
    const exit = finiteNumber(closeResult.exit_price ?? closeResult.close_mark_price);
    const bits = [
      `I estimate the close at ${formatAiUsd(closedCollateral || 0)} collateral on ${side} ${symbol}`,
    ];
    if (notional) bits.push(`notional about ${formatAiUsd(notional)}`);
    if (pnlUsd != null) bits.push(`PnL ${formatSignedAiUsd(pnlUsd)}${pnlPct != null ? ` (${formatSignedAiPct(pnlPct)})` : ''}`);
    if (entry || exit) {
      const priceBits = [];
      if (entry) priceBits.push(`entry ${formatAiUsd(entry)}`);
      if (exit) priceBits.push(`close mark ${formatAiUsd(exit)}`);
      bits.push(priceBits.join(', '));
    }
    return `${bits.join('. ')}.`;
  }
  const args = action.args || {};
  const snapshot = findAvantisCloseSnapshot(action, positions, prices);
  if (!snapshot) return '';
  const requestedPercent = Math.max(0.01, Math.min(100, finiteNumber(args.percent ?? args.close_percent) || 100));
  const explicitCollateral = finiteNumber(args.collateral_usd ?? args.collateralUsd ?? args.amount);
  const closeCollateral = explicitCollateral
    ?? (snapshot.margin ? snapshot.margin * requestedPercent / 100 : null);
  const closeFraction = snapshot.margin && closeCollateral
    ? Math.max(0, Math.min(1, closeCollateral / snapshot.margin))
    : requestedPercent / 100;
  const pnlUsd = snapshot.pnlUsd == null ? null : cleanAiSignedZero(snapshot.pnlUsd * closeFraction);
  const pnlPct = pnlUsd == null || !closeCollateral ? null : (pnlUsd / closeCollateral) * 100;
  const bits = [
    `I estimate the close at ${formatAiUsd(closeCollateral || 0)} collateral on ${snapshot.side.toUpperCase()} ${snapshot.symbol || 'position'}`,
  ];
  if (snapshot.notional && closeFraction) bits.push(`notional about ${formatAiUsd(snapshot.notional * closeFraction)}`);
  if (pnlUsd != null) bits.push(`PnL ${formatSignedAiUsd(pnlUsd)}${pnlPct != null ? ` (${formatSignedAiPct(pnlPct)})` : ''}`);
  if (snapshot.entry || snapshot.mark) {
    const priceBits = [];
    if (snapshot.entry) priceBits.push(`entry ${formatAiUsd(snapshot.entry)}`);
    if (snapshot.mark) priceBits.push(`close mark ${formatAiUsd(snapshot.mark)}`);
    bits.push(priceBits.join(', '));
  }
  return `${bits.join('. ')}.`;
}

function loadBrowserActionLedger() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AVANTIS_BROWSER_ACTION_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveBrowserActionLedger(ledger) {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(ledger || {}).slice(-80);
    window.localStorage.setItem(AVANTIS_BROWSER_ACTION_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

function markBrowserAction(actionId, status, result = {}) {
  if (!actionId) return;
  const ledger = loadBrowserActionLedger();
  const previous = ledger[actionId] || {};
  ledger[actionId] = {
    ...previous,
    status,
    at: Date.now(),
    tx_hash: result.tx_hash || result.hash || previous.tx_hash || null,
    error: result.error || null,
    signature: result.signature || previous.signature || null,
    action: result.action || previous.action || null,
    summary: result.summary || previous.summary || null,
  };
  saveBrowserActionLedger(ledger);
}

function browserActionAlreadySubmitted(actionId) {
  const row = actionId ? loadBrowserActionLedger()[actionId] : null;
  return row?.status === 'submitted'
    || row?.status === 'confirmed'
    || row?.status === 'done'
    || row?.status === 'cancelled'
    || row?.status === 'failed'
    || row?.status === 'blocked_duplicate';
}

function describeAvantisBrowserAction(action) {
  const args = action?.args || {};
  if (action?.type === 'place_order') {
    const side = String(args.side || 'long').toUpperCase();
    const type = String(args.order_type || 'market').toUpperCase();
    return `${side} ${args.symbol || 'BTC'} ${type}, ${formatAiUsd(args.collateral_usd)} collateral, ${Number(args.leverage || 1)}x`;
  }
  if (action?.type === 'close_position') {
    return `Close ${Number(args.percent || 100).toFixed(0)}% of ${args.symbol || 'position'}`;
  }
  if (action?.type === 'cancel_order') {
    return `Cancel ${args.symbol || 'Avantis'} order`;
  }
  if (action?.type === 'set_tpsl') {
    const bits = [];
    if (Number(args.take_profit) > 0) {
      const pct = Number(args.take_profit_pnl_pct);
      bits.push(`TP ${Number.isFinite(pct) && pct > 0 ? `${pct}% profit, ` : ''}${formatAiUsd(args.take_profit)}`);
    }
    if (Number(args.stop_loss) > 0) {
      const pct = Number(args.stop_loss_pnl_pct);
      bits.push(`SL ${Number.isFinite(pct) && pct > 0 ? `${pct}% loss, ` : ''}${formatAiUsd(args.stop_loss)}`);
    }
    return `Set ${bits.join(' / ') || 'TP/SL'} on ${args.symbol || 'position'}`;
  }
  return action?.summary || 'Avantis browser action';
}

function avantisBrowserActionStatusMessage(phase, {
  useSmartWallet = false,
  silentPrivy = false,
  summary = 'Avantis action',
  hash = '',
  error = '',
  closeResult = '',
} = {}) {
  const tx = hash ? ` Tx: ${shortTxHash(hash)}` : '';
  if (phase === 'wallet_prompt') {
    return `I have the Avantis transaction ready. Your wallet needs one signature for: ${summary}.`;
  }
  if (phase === 'signing') {
    if (useSmartWallet) return `I am signing through your Avantis Smart Wallet now: ${summary}.`;
    if (silentPrivy) return `I am signing through your Privy wallet now: ${summary}.`;
    return `Waiting for your wallet signature now: ${summary}.`;
  }
  if (phase === 'submitted' || phase === 'confirming') {
    const suffix = hash ? `: ${shortTxHash(hash)}` : '';
    return `The transaction is on Base now; I am waiting for confirmation${suffix}.`;
  }
  if (phase === 'cancelled') {
    return 'I stopped before submitting because the wallet confirmation was cancelled.';
  }
  if (phase === 'confirmed') {
    return `Base confirmed it: ${summary}.${tx}${closeResult ? `\n${closeResult}` : ''}`;
  }
  if (phase === 'failed') {
    return `I could not finish the Avantis action: ${error || 'unknown browser error'}`;
  }
  return `${summary}.`;
}

function aiBrowserActionsSatisfiedFollowUp(followUp, results = []) {
  if (!followUp?.message) return false;
  const requiredTypes = Array.isArray(followUp.after_action_types) ? followUp.after_action_types : [];
  if (!requiredTypes.length) return true;
  return requiredTypes.every((type) => results.some((row) => (
    row?.action?.type === type
    && row?.result
    && !row.result.error
    && !row.result.cancelled
    && !row.result.skipped
    && !row.result.duplicate
  )));
}

const aiShopBasePublicClient = createPublicClient({ chain: base, transport: http() });
const aiShopArbitrumPublicClient = createPublicClient({ chain: arbitrum, transport: http() });
const aiShopMonadPublicClient = createPublicClient({ chain: monadChain, transport: http() });
const aiShopInkPublicClient = createPublicClient({ chain: inkChain, transport: http() });
const AI_SHOP_EVM_PUBLIC_CLIENTS = {
  [BASE_CHAIN_ID]: aiShopBasePublicClient,
  [ARBITRUM_CHAIN_ID]: aiShopArbitrumPublicClient,
  [MONAD_CHAIN_ID]: aiShopMonadPublicClient,
  [INK_CHAIN_ID]: aiShopInkPublicClient,
};
const AI_SHOP_EVM_CHAINS = {
  [BASE_CHAIN_ID]: base,
  [ARBITRUM_CHAIN_ID]: arbitrum,
  [MONAD_CHAIN_ID]: monadChain,
  [INK_CHAIN_ID]: inkChain,
};
const AI_SHOP_CHAIN_IDS = {
  base: BASE_CHAIN_ID,
  arbitrum: ARBITRUM_CHAIN_ID,
  monad: MONAD_CHAIN_ID,
  ink: INK_CHAIN_ID,
};
const AI_SHOP_CHAIN_OPTIONS = [
  { id: 'base', label: 'Base', sub: 'USDC / ETH' },
  { id: 'solana', label: 'Solana', sub: 'USDC / SOL / CLASH / SKR' },
  { id: 'arbitrum', label: 'Arbitrum', sub: 'USDC / ETH' },
  { id: 'monad', label: 'Monad', sub: 'USDC / MON' },
  { id: 'ink', label: 'Ink', sub: 'USDC / ETH' },
  { id: 'aptos', label: 'Aptos', sub: 'USDC / APT' },
];
const AI_SHOP_PAYMENTS_BY_CHAIN = {
  base: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'eth', label: 'ETH', sub: 'Native' },
  ],
  solana: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'sol', label: 'SOL', sub: 'Native' },
    { id: 'clash', label: 'CLASH', sub: '20% off' },
    { id: 'skr', label: 'SKR', sub: 'Seeker' },
  ],
  arbitrum: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'eth', label: 'ETH', sub: 'Native' },
  ],
  monad: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'mon', label: 'MON', sub: 'Native' },
  ],
  ink: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'eth', label: 'ETH', sub: 'Native' },
  ],
  aptos: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'apt', label: 'APT', sub: 'Native' },
  ],
};
const DEX_TO_AI_SHOP_CHAIN = {
  avantis: 'base',
  pacifica: 'solana',
  phoenix: 'solana',
  gmx: 'arbitrum',
  hyperliquid: 'arbitrum',
  nado: 'ink',
  monad: 'monad',
  decibel: 'aptos',
};

function makeAiChatEvmWallet(provider, address) {
  if (!provider || !address) return null;
  return {
    address,
    provider,
    source: 'ai-chat',
    isReady: true,
    ensureChain: async (targetChainId = BASE_CHAIN_ID) => {
      const id = Number(targetChainId) || BASE_CHAIN_ID;
      if (id === ARBITRUM_CHAIN_ID) return ensureArbitrumChain(provider);
      if (id === MONAD_CHAIN_ID) return ensureMonadChain(provider);
      if (id === INK_CHAIN_ID) return ensureInkChain(provider);
      return ensureBaseChain(provider);
    },
    getPublicClient: (targetChainId = BASE_CHAIN_ID) => (
      AI_SHOP_EVM_PUBLIC_CLIENTS[Number(targetChainId)] || aiShopBasePublicClient
    ),
    getWalletClient: (targetChainId = BASE_CHAIN_ID) => createWalletClient({
      account: address,
      chain: AI_SHOP_EVM_CHAINS[Number(targetChainId)] || base,
      transport: custom(provider),
    }),
  };
}

function aiShopChainForDex(dex) {
  return DEX_TO_AI_SHOP_CHAIN[dex] || 'base';
}

function aiPaymentLabel(chain, payment) {
  return (AI_SHOP_PAYMENTS_BY_CHAIN[chain] || []).find((p) => p.id === payment)?.label || String(payment || 'USDC').toUpperCase();
}

// Per-token icon mapping — mirrors NftMintPanel.TOKEN_LOGO_SRC so the
// AI shop chips read the same as the NFT mint chips (USDC = Circle
// glyph, ETH = Ethereum diamond, CLASH = our app icon, etc).
const AI_TOKEN_LOGO = {
  usdc: '/tokens/USDC.svg',
  eth:  '/tokens/ETH.svg',
  ink:  '/tokens/INK.png',
  clash: '/icons/icon-192.png',
  sol:  '/tokens/SOL.svg',
  skr:  '/tokens/SKR.png',
  mon:  '/tokens/MON.svg',
  apt:  '/tokens/APT.png',
};
function aiTokenLogo(paymentId) {
  return AI_TOKEN_LOGO[String(paymentId || '').toLowerCase()] || null;
}

// Brand mark for ClashHermes — a winged-helmet "H" monogram, sized to
// drop into a 28px or 22px circle. Reads as the Greek messenger god at a
// glance and gives the chat a face beyond a text title.
// Brand mark for ClashHermes — reuses the same artwork as the in-HUD
// "open chat" button (/icons/ai-agent.png) cropped into a circle, so
// the chat surface, the launcher button, and any future references all
// read as one identity.
function HermesAvatar({ size = 28 }) {
  return (
    <img
      src="/icons/ai-agent.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'block',
      }}
    />
  );
}

// Welcome chips shown when the chat thread is empty (only the initial
// "Ready when you are." line). These are concrete game actions so Hermes
// starts as a commander, not a generic assistant.
const STARTER_PROMPTS = [
  { id: 'arrange-base', label: 'Arrange base', text: 'Arrange my base optimally and build the most useful buildings.' },
  { id: 'attack-enemy', label: 'Start attack', text: 'Find a good enemy, load troops into ships, and start an attack.' },
  { id: 'collect-res',  label: 'Collect loot', text: 'Collect all available resources on my base.' },
];

// Animations used by the chat surface. Inline styles can't hold
// @keyframes, so the rules are mounted once at the top of the panel via
// <style dangerouslySetInnerHTML>. Scoped class names keep this from
// colliding with anything global.
const HERMES_CHAT_CSS = `
@keyframes hermesStatusPulse {
  0%   { box-shadow: 0 0 0 0 rgba(76,175,80,0.55); }
  70%  { box-shadow: 0 0 0 6px rgba(76,175,80,0); }
  100% { box-shadow: 0 0 0 0 rgba(76,175,80,0); }
}
@keyframes hermesTypingDot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30%           { transform: translateY(-3px); opacity: 1; }
}
.hermes-status-dot { animation: hermesStatusPulse 1.6s ease-in-out infinite; }
.hermes-typing-dot { animation: hermesTypingDot 1s ease-in-out infinite; }
.hermes-starter-chip:hover {
  border-color: #c2851b !important;
  background: #fff6dc !important;
  transform: translateY(-1px);
}
.hermes-send-glow:not(:disabled) {
  box-shadow:
    0 4px 12px rgba(31,109,52,0.4),
    0 0 0 3px rgba(145,223,125,0.25),
    inset 0 1px 0 rgba(255,255,255,0.45) !important;
}
.hermes-send-glow:not(:disabled):hover { transform: translateY(-1px); }
.hermes-send-glow:disabled { filter: grayscale(0.4) brightness(0.95); }
.hermes-shop-toggle:hover { filter: brightness(1.05); transform: translateY(-1px); }
.hermes-shop-toggle { transition: transform 0.12s ease, filter 0.12s ease; }
.hermes-starter-chip, .hermes-send-glow {
  transition: transform 0.12s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}
/* BEST-VALUE ribbon on the premium product card — slow shimmer so it
   reads as "the one to pick" without aggressive blink. */
@keyframes hermesRibbonShimmer {
  0%, 100% { box-shadow: 0 2px 5px rgba(0,0,0,0.25), 0 0 0 0 rgba(255,215,0,0); }
  50%      { box-shadow: 0 2px 8px rgba(0,0,0,0.28), 0 0 0 4px rgba(255,215,0,0.35); }
}
.hermes-ribbon { animation: hermesRibbonShimmer 2.6s ease-in-out infinite; }
/* Step-rail spinner (same animation as Bridge modal's nft-mint-ring-spin
   but scoped locally so this file doesn't depend on NftMintPanel being
   mounted simultaneously). */
@keyframes hermesRingSpin { to { transform: rotate(360deg); } }
.hermes-step-spinner { animation: hermesRingSpin 0.9s linear infinite; }
`;

function formatQuotaLine(quota) {
  if (!quota) return 'Loading message balance...';
  const credits = Math.max(0, Number(quota.credits || 0));
  const total = Math.max(0, Number(quota.available_messages || 0));
  if (quota.lifetime_daily_limit > 0) {
    return `${total} available | Pro ${quota.subscription_available}/${quota.lifetime_daily_limit} today | Paid ${credits}`;
  }
  return `${total} available | Free ${quota.free_available}/${quota.free_daily_limit} today | Paid ${credits}`;
}

function quotaSummaryRows(quota) {
  if (!quota) {
    return [
      { label: 'Free today', value: '...' },
      { label: 'Paid messages', value: '...' },
      { label: 'Used today', value: '...' },
    ];
  }
  const credits = Math.max(0, Number(quota.credits || 0));
  const total = Math.max(0, Number(quota.available_messages || 0));
  const used = Math.max(0, Number(quota.total_used_today || 0));
  if (quota.lifetime_daily_limit > 0) {
    return [
      { label: 'Pro today', value: `${quota.subscription_available}/${quota.lifetime_daily_limit}` },
      { label: 'Paid messages', value: String(credits) },
      { label: 'Used today', value: String(used) },
      { label: 'Total available', value: String(total), strong: true },
    ];
  }
  return [
    { label: 'Free today', value: `${quota.free_available}/${quota.free_daily_limit}` },
    { label: 'Paid messages', value: String(credits) },
    { label: 'Used today', value: String(used) },
    { label: 'Total available', value: String(total), strong: true },
  ];
}

function AiQuotaSummary({ quota, compact = false }) {
  const rows = quotaSummaryRows(quota);
  return (
    <div style={{ ...styles.quotaSummary, ...(compact ? styles.quotaSummaryCompact : null) }}>
      <div style={styles.quotaSummaryHeader}>
        <span style={styles.quotaSummaryTitle}>AI message balance</span>
        <span style={styles.quotaSummaryTotal}>
          {quota ? `${Math.max(0, Number(quota.available_messages || 0))} left` : 'Loading'}
        </span>
      </div>
      <div style={styles.quotaStats}>
        {rows.map((row) => (
          <div key={row.label} style={{ ...styles.quotaStat, ...(row.strong ? styles.quotaStatStrong : null) }}>
            <span style={styles.quotaStatLabel}>{row.label}</span>
            <span style={styles.quotaStatValue}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getChatStorageKey(player, token) {
  const id = player?.id || player?.player_id || player?.name || token || 'local';
  return `clash_ai_chat:${String(id).slice(0, 96)}`;
}

function normalizeMessages(value) {
  if (!Array.isArray(value)) return INITIAL_MESSAGES;
  const rows = value
    .map((item) => {
      const traceId = typeof item?.traceId === 'string'
        ? item.traceId
        : typeof item?.trace_id === 'string'
          ? item.trace_id
          : '';
      return {
        role: item?.role === 'user' ? 'user' : 'assistant',
        text: typeof item?.text === 'string' ? item.text.slice(0, 4000) : '',
        ...(traceId ? { traceId: traceId.slice(0, 120) } : {}),
      };
    })
    .filter((item) => item.text.trim())
    .slice(-CHAT_HISTORY_LIMIT);
  return rows.length ? rows : INITIAL_MESSAGES;
}

function loadChatMessages(storageKey) {
  if (typeof window === 'undefined') return INITIAL_MESSAGES;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? normalizeMessages(JSON.parse(raw)) : INITIAL_MESSAGES;
  } catch {
    return INITIAL_MESSAGES;
  }
}

function saveChatMessages(storageKey, rows) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeMessages(rows)));
  } catch {
    // Storage can be unavailable in private mode; chat should still work.
  }
}

function pendingStorageKey(storageKey) {
  return `${storageKey}:pending`;
}

function loadPendingRequests(storageKey) {
  if (typeof window === 'undefined') return [];
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(pendingStorageKey(storageKey));
    const rows = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) return [];
    return rows
      .map((item) => ({
        traceId: typeof item?.traceId === 'string' ? item.traceId.slice(0, 120) : '',
        message: typeof item?.message === 'string' ? item.message.slice(0, 1000) : '',
        startedAt: Number(item?.startedAt || 0),
      }))
      .filter((item) => item.traceId && item.startedAt && now - item.startedAt < PENDING_REQUEST_TTL_MS);
  } catch {
    return [];
  }
}

function savePendingRequests(storageKey, rows) {
  if (typeof window === 'undefined') return;
  try {
    const next = rows.filter((item) => item?.traceId).slice(-8);
    if (next.length) window.localStorage.setItem(pendingStorageKey(storageKey), JSON.stringify(next));
    else window.localStorage.removeItem(pendingStorageKey(storageKey));
  } catch {
    // Ignore storage failures; the live request can still finish.
  }
}

function addPendingRequest(storageKey, request) {
  const rows = loadPendingRequests(storageKey).filter((item) => item.traceId !== request.traceId);
  rows.push(request);
  savePendingRequests(storageKey, rows);
}

function removePendingRequest(storageKey, traceId) {
  savePendingRequests(storageKey, loadPendingRequests(storageKey).filter((item) => item.traceId !== traceId));
}

function resetStoredChat(storageKey) {
  const initial = INITIAL_MESSAGES.map((item) => ({ ...item }));
  savePendingRequests(storageKey, []);
  saveChatMessages(storageKey, initial);
  return initial;
}

function appendStoredChatMessage(storageKey, row) {
  const rows = loadChatMessages(storageKey);
  const traceId = row?.traceId || '';
  const role = row?.role === 'user' ? 'user' : 'assistant';
  if (traceId && rows.some((item) => item.traceId === traceId && item.role === role)) {
    return rows;
  }
  const next = normalizeMessages([...rows, row]);
  saveChatMessages(storageKey, next);
  return next;
}

function hasStoredChatMessage(storageKey, traceId, role = 'assistant') {
  if (!traceId) return false;
  return loadChatMessages(storageKey).some((item) => (
    item?.traceId === traceId && item?.role === role
  ));
}

function aiErrorMessage(err, fallback = 'AI request failed') {
  const raw = String(err?.message || fallback).trim();
  if (!raw) return fallback;
  if (err?.name === 'AbortError') return 'AI request is still running. Reopen the chat in a moment to see the result.';
  return raw;
}

function buildContextHistory(rows) {
  return normalizeMessages(rows)
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .slice(-CONTEXT_MESSAGE_LIMIT)
    .map((item) => ({
      role: item.role,
      text: item.text.slice(0, 1000),
    }));
}

function makeAiChatTraceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAiChatStoredResult(traceId, token) {
  const r = await fetch(`/api/ai-chat/result/${encodeURIComponent(traceId)}`, {
    headers: { 'x-token': token },
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({}));
  if (data?.pending) return null;
  if (!r.ok && r.status !== 402) {
    throw new Error(data?.error || 'AI result lookup failed');
  }
  return data;
}

async function waitForAiChatStoredResult(traceId, token, {
  initialDelayMs = 7000,
  intervalMs = 2500,
  timeoutMs = 105000,
} = {}) {
  const started = Date.now();
  if (initialDelayMs > 0) await sleep(initialDelayMs);
  while (Date.now() - started < timeoutMs) {
    const result = await fetchAiChatStoredResult(traceId, token).catch(() => null);
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error('AI result is still pending');
}

function describeAgentProgress(progress) {
  const explicit = typeof progress?.message === 'string' ? progress.message.trim() : '';
  if (explicit) return explicit.endsWith('...') ? explicit : `${explicit}...`;
  const phase = String(progress?.phase || '');
  const route = Number(progress?.model_index || 0);
  const backup = route > 0;
  switch (phase) {
    case 'preparing':
      return 'Preparing the game agent...';
    case 'starting_model':
      return 'Starting the agent route...';
    case 'fallback_model':
      return 'Trying a backup route...';
    case 'thinking':
      return 'Reading the game state and planning...';
    case 'fallback_thinking':
      return 'Backup route is planning the answer...';
    case 'checking_answer':
      return 'Checking the answer before sending...';
    case 'model_start_failed':
      return 'That route did not start cleanly, switching routes...';
    case 'route_rejected':
      return 'That route produced a bad answer, trying another one...';
    case 'route_timeout':
      return backup ? 'Backup route is slow, trying another one...' : 'Agent route is slow, trying another one...';
    case 'completed':
      return 'Answer ready...';
    case 'failed':
      return 'All routes failed for this request...';
    default:
      return '';
  }
}

// ── Desktop drag / resize tuning ────────────────────────────────────
// Limits picked to keep the panel usable: anything smaller than ~300×320
// crushes the composer below the message list, anything bigger than
// 760×900 starts colliding with the right HUD column on 1440p laptops.
const DESKTOP_MIN_W = 360;
const DESKTOP_MIN_H = 240;
const DESKTOP_MAX_W = 1100;
const DESKTOP_MAX_H = 720;
// Wide-but-short rectangle that opens hugging the bottom edge of the
// screen — the mobile bottom-sheet feel. Width sized to slot between
// the bottom-left action cluster (~310px wide) and the bottom-right
// column (~280px wide including AI/TRADE), so action buttons stay
// clickable on 1280px-and-up monitors. Height stays tight so the chat
// reads as a strip rather than dominating the screen.
const DESKTOP_DEFAULT_W = 720;
const DESKTOP_DEFAULT_H = 420;
// Pixel gap between the bottom of the chat panel and the viewport
// bottom edge. Small (~30px) so the panel sits visibly at the bottom
// "like a mobile sheet" — the action buttons live in the corners and
// are cleared horizontally by the panel's narrower width, not by
// vertical clearance.
const DESKTOP_BOTTOM_CLEARANCE = 30;
// Persist the player's resized/moved chat shape across sessions — they
// dragged it where they wanted, don't reset that on reload. Bumped to
// v4 along with the bottom-hugging default so existing users get the
// new position on next open instead of staying stuck on the previous
// mid-screen layout.
const CHAT_LAYOUT_STORAGE_KEY = 'clash_ai_chat_layout_v4';

function loadDesktopLayout() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CHAT_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    const w = Number(j?.w); const h = Number(j?.h);
    const x = Number(j?.x); const y = Number(j?.y);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
    return {
      w: Math.max(DESKTOP_MIN_W, Math.min(DESKTOP_MAX_W, w)),
      h: Math.max(DESKTOP_MIN_H, Math.min(DESKTOP_MAX_H, h)),
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    };
  } catch { return null; }
}

function saveDesktopLayout(layout) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CHAT_LAYOUT_STORAGE_KEY, JSON.stringify(layout)); } catch {}
}

function AiChatPanel({ onClose }) {
  const { isMobile } = useLayout();
  const { dex } = useDex();
  const avantisTrading = useAvantis();
  const player = usePlayer();
  const tradingEvmWallet = useEvmWallet();
  const solWallet = useSolWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const aptosWallet = useAptosWallet();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
  const storageKey = useMemo(() => getChatStorageKey(player, token), [player, token]);
  const skipNextPersist = useRef(true);
  const mountedRef = useRef(true);
  const activeTraceRef = useRef('');
  const sendingStartedAtRef = useRef(0);
  const browserActionRunRef = useRef(new Set());
  const browserActionSignatureRunRef = useRef(new Set());
  const [messages, setMessages] = useState(() => loadChatMessages(storageKey));
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [progressText, setProgressText] = useState('');
  const [resettingChat, setResettingChat] = useState(false);
  // Shop is now a separate modal layered on top of the chat panel —
  // earlier it was a tab inside the same chat body which duplicated the
  // header quota and crammed the buy flow into a narrow column. The
  // chat itself always renders the message list + composer; this flag
  // just toggles the shop overlay.
  const [shopOpen, setShopOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsBusy, setJobsBusy] = useState('');
  const [jobsNotice, setJobsNotice] = useState('');
  const [jobForm, setJobForm] = useState(() => cloneHermesJobDefaults());
  const [quota, setQuota] = useState(null);
  const [shopConfig, setShopConfig] = useState(null);
  const [shopChain, setShopChain] = useState(() => aiShopChainForDex(dex));
  const [shopPayment, setShopPayment] = useState('usdc');
  const [shopBusy, setShopBusy] = useState(null);
  const [shopNotice, setShopNotice] = useState('');
  // Bridge-style purchase modal — drives a 3-step rail (sign → confirm
  // → credit) on top of the shop while a buy is in flight, then flips
  // to success when the server credits messages.
  // Shape: { status, product, granted, pass, error }.
  //   status ∈ 'signing'|'confirming'|'crediting'|'success'|'error'
  const [topUpFlow, setTopUpFlow] = useState(null);
  const topUpTimers = useRef([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const confirmDialogResolveRef = useRef(null);
  const [avantisSmartWalletSetup, setAvantisSmartWalletSetup] = useState(null);
  const avantisSmartWalletSetupResolveRef = useRef(null);
  const [localEvmWalletState, setLocalEvmWalletState] = useState(null);
  const [evmModalOpen, setEvmModalOpen] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Heuristic step pacing: real wallet/network/server timing varies wildly,
  // so we advance the rail on a soft timer that matches typical EVM/Sol
  // flows — sign (~immediate) → confirm (1.5s) → credit (4s). On success
  // we jump straight to "success" regardless of where the timer was.
  const clearTopUpTimers = useCallback(() => {
    topUpTimers.current.forEach((t) => clearTimeout(t));
    topUpTimers.current = [];
  }, []);
  const beginTopUpFlow = useCallback((product) => {
    clearTopUpTimers();
    setTopUpFlow({ status: 'signing', product, granted: 0, pass: null, error: '' });
    const t1 = setTimeout(() => {
      setTopUpFlow((prev) => prev && prev.status === 'signing' ? { ...prev, status: 'confirming' } : prev);
    }, 1500);
    const t2 = setTimeout(() => {
      setTopUpFlow((prev) => prev && prev.status === 'confirming' ? { ...prev, status: 'crediting' } : prev);
    }, 4500);
    topUpTimers.current = [t1, t2];
  }, [clearTopUpTimers]);
  useEffect(() => () => clearTopUpTimers(), [clearTopUpTimers]);

  const loadHermesJobs = useCallback(async () => {
    if (!token) return;
    setJobsLoading(true);
    try {
      const data = await fetch('/api/ai-jobs', {
        headers: { 'x-token': token },
        cache: 'no-store',
      }).then((r) => r.json().catch(() => ({})));
      if (data?.ok === false) throw new Error(data?.error || 'Failed to load jobs');
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      if (data?.quota) setQuota(data.quota);
    } catch (err) {
      setJobsNotice(err?.message || 'Failed to load jobs');
    } finally {
      if (mountedRef.current) setJobsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (jobsOpen) loadHermesJobs();
  }, [jobsOpen, loadHermesJobs]);

  const saveHermesJob = useCallback(async (activate = false) => {
    if (!token) {
      setJobsNotice('Game session is not ready yet.');
      return;
    }
    setJobsBusy('save');
    setJobsNotice('');
    try {
      const body = {
        ...jobForm,
        status: activate ? 'active' : 'draft',
        symbols: Array.isArray(jobForm.symbols)
          ? jobForm.symbols
          : String(jobForm.symbols || '').split(/[,\s]+/).filter(Boolean),
      };
      const r = await fetch('/api/ai-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.ok === false) throw new Error(data?.error || 'Failed to save job');
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      if (data?.quota) setQuota(data.quota);
      setJobsNotice(activate ? 'Job activated. The first check will run shortly.' : 'Draft saved.');
      setJobForm(cloneHermesJobDefaults());
    } catch (err) {
      setJobsNotice(err?.message || 'Failed to save job');
    } finally {
      if (mountedRef.current) setJobsBusy('');
    }
  }, [jobForm, token]);

  const patchHermesJob = useCallback(async (jobId, patch) => {
    if (!token || !jobId) return;
    setJobsBusy(jobId);
    setJobsNotice('');
    try {
      const r = await fetch(`/api/ai-jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify(patch),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.ok === false) throw new Error(data?.error || 'Failed to update job');
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      if (data?.quota) setQuota(data.quota);
    } catch (err) {
      setJobsNotice(err?.message || 'Failed to update job');
    } finally {
      if (mountedRef.current) setJobsBusy('');
    }
  }, [token]);

  const runHermesJobNow = useCallback(async (jobId) => {
    if (!token || !jobId) return;
    setJobsBusy(`run:${jobId}`);
    setJobsNotice('');
    try {
      const r = await fetch(`/api/ai-jobs/${encodeURIComponent(jobId)}/run-now`, {
        method: 'POST',
        headers: { 'x-token': token },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.ok === false) throw new Error(data?.error || 'Failed to run job');
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      if (data?.quota) setQuota(data.quota);
      setJobsNotice('Job queued to run now. It will spend 1 AI message when the worker executes.');
    } catch (err) {
      setJobsNotice(err?.message || 'Failed to run job');
    } finally {
      if (mountedRef.current) setJobsBusy('');
    }
  }, [token]);

  const deleteHermesJob = useCallback(async (jobId) => {
    if (!token || !jobId) return;
    setJobsBusy(`delete:${jobId}`);
    setJobsNotice('');
    try {
      const r = await fetch(`/api/ai-jobs/${encodeURIComponent(jobId)}`, {
        method: 'DELETE',
        headers: { 'x-token': token },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.ok === false) throw new Error(data?.error || 'Failed to delete job');
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
    } catch (err) {
      setJobsNotice(err?.message || 'Failed to delete job');
    } finally {
      if (mountedRef.current) setJobsBusy('');
    }
  }, [token]);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const localEvmWallet = useMemo(
    () => makeAiChatEvmWallet(localEvmWalletState?.provider, localEvmWalletState?.address),
    [localEvmWalletState?.provider, localEvmWalletState?.address],
  );
  const evmWallet = localEvmWallet || tradingEvmWallet;
  const {
    walletAddr: avantisWalletAddr,
    walletUsdc: avantisWalletUsdc,
    isReady: avantisReady,
    walletMismatch: avantisWalletMismatch,
    placeMarketOrder: avantisPlaceMarketOrder,
    placeLimitOrder: avantisPlaceLimitOrder,
    closePosition: avantisClosePosition,
    cancelOrder: avantisCancelOrder,
    setTpsl: avantisSetTpsl,
    positions: avantisPositions,
    prices: avantisPrices,
    smartWallet: avantisSmartWallet,
    enableSmartWallet: avantisEnableSmartWallet,
    revokeSmartWallet: avantisRevokeSmartWallet,
    fundSmartWallet: avantisFundSmartWallet,
    refreshSmartWallet: avantisRefreshSmartWallet,
  } = avantisTrading;
  const evmAddress = evmWallet?.address || null;
  const solAddress = solWallet?.publicKey?.toBase58?.() || null;
  const aptosAddress = aptosWallet?.address || null;
  const [avantisAiTradeSettings, setAvantisAiTradeSettings] = useState(() => (
    loadAvantisAiTradeSettings('', AVANTIS_BROWSER_POLICY_DEFAULTS)
  ));
  useEffect(() => {
    setAvantisAiTradeSettings(loadAvantisAiTradeSettings(avantisWalletAddr, AVANTIS_BROWSER_POLICY_DEFAULTS));
  }, [avantisWalletAddr]);
  const saveAvantisSettings = useCallback((nextSettings, basePolicy = AVANTIS_BROWSER_POLICY_DEFAULTS) => {
    const saved = saveAvantisAiTradeSettings(avantisWalletAddr, nextSettings, basePolicy);
    setAvantisAiTradeSettings(saved);
    return saved;
  }, [avantisWalletAddr]);
  const activeAvantisPolicy = useMemo(() => (
    effectiveAvantisPolicy(AVANTIS_BROWSER_POLICY_DEFAULTS, avantisAiTradeSettings, avantisWalletUsdc)
  ), [avantisAiTradeSettings, avantisWalletUsdc]);
  const activeAvantisSettingsPayload = useMemo(() => (
    buildAvantisAiTradeSettingsPayload(avantisAiTradeSettings, activeAvantisPolicy, avantisWalletUsdc)
  ), [avantisAiTradeSettings, activeAvantisPolicy, avantisWalletUsdc]);

  // Auto-size the message textarea: grows with content up to ~5 lines,
  // then scrolls inside its own box. Keeps the composer compact (single
  // line at rest) without cutting off longer messages while typing.
  const COMPOSER_MIN_H = 40;
  const COMPOSER_MAX_H = 120;
  const autoSizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.max(COMPOSER_MIN_H, Math.min(COMPOSER_MAX_H, el.scrollHeight));
    el.style.height = next + 'px';
  }, []);
  useEffect(() => { autoSizeInput(); }, [input, autoSizeInput]);

  // ── Desktop drag + resize state ─────────────────────────────────────
  // Mirrors FuturesPanel's pattern: refs for the live position/size so
  // pointermove can update the DOM at 60fps without React re-renders;
  // `desktopShape` state version is bumped on drop so React commits the
  // final value back into the render. On mobile this whole block is
  // dormant — none of it runs.
  const panelRef = useRef(null);
  const initLayout = useMemo(() => loadDesktopLayout() || {
    w: DESKTOP_DEFAULT_W, h: DESKTOP_DEFAULT_H, x: 0, y: 0,
  }, []);
  const posRef = useRef({ x: initLayout.x, y: initLayout.y });
  const sizeRef = useRef({ w: initLayout.w, h: initLayout.h });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  // Bumped on drag/resize end so React reads the new refs into the
  // inline style + persists the layout. Cheap (one render per release).
  const [, setShapeRev] = useState(0);

  const onHeaderPointerDown = useCallback((e) => {
    if (isMobile) return;
    if (e.target.closest('[data-nodrag]')) return;
    e.preventDefault();
    const startCX = e.clientX, startCY = e.clientY;
    const startX = posRef.current.x, startY = posRef.current.y;
    const onMove = (ev) => {
      posRef.current = {
        x: startX + (ev.clientX - startCX),
        y: startY + (ev.clientY - startCY),
      };
      if (panelRef.current) {
        panelRef.current.style.transform =
          `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
      }
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setShapeRev((r) => r + 1);
      saveDesktopLayout({ ...sizeRef.current, ...posRef.current });
    };
    setIsDragging(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [isMobile]);

  const onResizePointerDown = useCallback((e) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    const startCX = e.clientX, startCY = e.clientY;
    const startW = sizeRef.current.w, startH = sizeRef.current.h;
    const onMove = (ev) => {
      const nextW = Math.max(DESKTOP_MIN_W, Math.min(DESKTOP_MAX_W, startW + (ev.clientX - startCX)));
      const nextH = Math.max(DESKTOP_MIN_H, Math.min(DESKTOP_MAX_H, startH + (ev.clientY - startCY)));
      sizeRef.current = { w: nextW, h: nextH };
      if (panelRef.current) {
        panelRef.current.style.width = `${nextW}px`;
        panelRef.current.style.height = `${nextH}px`;
      }
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setShapeRev((r) => r + 1);
      saveDesktopLayout({ ...sizeRef.current, ...posRef.current });
    };
    setIsResizing(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [isMobile]);

  // ── Mobile bottom-sheet gesture ──────────────────────────────────────
  // Drag the header (or the small drag handle) down to dismiss. Threshold
  // is ~120px — once exceeded on touchend we trigger onClose. While
  // dragging we kill the transform transition so the sheet tracks the
  // finger 1:1; on release the transition snaps the sheet back to rest.
  const dragStartY = useRef(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Mount animation: sheet slides up from below on first render. Toggled
  // off after a tick so the transition runs once.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!isMobile) { setMounted(true); return; }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [isMobile]);

  const onDragStart = useCallback((e) => {
    if (!isMobile) return;
    const y = e.touches?.[0]?.clientY ?? e.clientY;
    if (y == null) return;
    dragStartY.current = y;
    setDragging(true);
  }, [isMobile]);
  const onDragMove = useCallback((e) => {
    if (!isMobile || dragStartY.current == null) return;
    const y = e.touches?.[0]?.clientY ?? e.clientY;
    if (y == null) return;
    const dy = y - dragStartY.current;
    setDragY(Math.max(0, dy));
  }, [isMobile]);
  const onDragEnd = useCallback(() => {
    if (!isMobile) return;
    setDragging(false);
    dragStartY.current = null;
    if (dragY > 120) {
      // Slide out, then unmount. Math: panel height ~60vh; translating
      // by window height guarantees it's off-screen before parent drops it.
      const h = typeof window !== 'undefined' ? window.innerHeight : 800;
      setDragY(h);
      setTimeout(() => onClose?.(), 220);
    } else {
      setDragY(0);
    }
  }, [isMobile, dragY, onClose]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    skipNextPersist.current = true;
    setMessages(loadChatMessages(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    const pending = loadPendingRequests(storageKey);
    if (!pending.length) return undefined;

    activeTraceRef.current = pending[pending.length - 1]?.traceId || '';
    sendingStartedAtRef.current = pending[pending.length - 1]?.startedAt || Date.now();
    setStatus('sending');
    setProgressText('Finishing the previous game action...');

    const recover = async () => {
      for (const item of pending) {
        try {
          const data = await waitForAiChatStoredResult(item.traceId, token, {
            initialDelayMs: 0,
            intervalMs: 2500,
            timeoutMs: 105000,
          });
          if (cancelled || !data) continue;
          if (data?.quota) setQuota(data.quota);
          const isBlocked = data?.status === 'quota_blocked' || data?.ok === false;
          const text = isBlocked
            ? (data?.error || 'AI request failed')
            : (data?.message || 'Done.');
          appendStoredChatMessage(storageKey, {
            role: 'assistant',
            text,
            traceId: `${item.traceId}:assistant`,
          });
          removePendingRequest(storageKey, item.traceId);
          if (activeTraceRef.current === item.traceId) activeTraceRef.current = '';
        } catch (err) {
          if (!cancelled) setError(aiErrorMessage(err, 'AI request is still running. Reopen the chat in a moment to see the result.'));
        }
      }
      if (!cancelled) {
        setMessages(loadChatMessages(storageKey));
        setStatus('idle');
        setProgressText('');
      }
    };

    recover();
    return () => { cancelled = true; };
  }, [storageKey, token]);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    saveChatMessages(storageKey, messages);
  }, [storageKey, messages]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/ai-chat/status?provision=0', { headers: { 'x-token': token }, cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!cancelled && data?.quota) setQuota(data.quota);
        if (!cancelled && !r.ok && data?.error) setError(data.error);
      })
      .catch(() => {
        if (!cancelled) setError('AI chat is not reachable yet.');
      });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    setShopChain(aiShopChainForDex(dex));
  }, [dex]);

  useEffect(() => {
    const allowed = AI_SHOP_PAYMENTS_BY_CHAIN[shopChain]?.map((p) => p.id) || ['usdc'];
    if (!allowed.includes(shopPayment)) setShopPayment('usdc');
  }, [shopChain, shopPayment]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [shop, q] = await Promise.all([
          fetchGameShopConfig(),
          fetch('/api/ai-chat/quota', { headers: { 'x-token': token }, cache: 'no-store' })
            .then((r) => r.json().catch(() => ({}))),
        ]);
        if (!cancelled) {
          setShopConfig(shop);
          if (q?.quota) setQuota(q.quota);
        }
      } catch (err) {
        if (!cancelled) setShopNotice(err?.message || 'AI shop is not reachable yet.');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (status !== 'sending') {
      setProgressText('');
      return undefined;
    }
    let cancelled = false;
    let step = 0;
    const updateFallback = () => {
      if (!cancelled) {
        setProgressText((current) => current || AGENT_PROGRESS_MESSAGES[step % AGENT_PROGRESS_MESSAGES.length]);
        step += 1;
      }
    };
    updateFallback();
    const fallbackTimer = setInterval(() => {
      if (!cancelled) {
        setProgressText(AGENT_PROGRESS_MESSAGES[step % AGENT_PROGRESS_MESSAGES.length]);
        step += 1;
      }
    }, 5000);
    const poll = async () => {
      if (!token) return;
      try {
        const r = await fetch('/api/ai-chat/status?provision=0', { headers: { 'x-token': token }, cache: 'no-store' });
        const data = await r.json().catch(() => ({}));
        const next = describeAgentProgress(data?.hermes?.player?.last_progress);
        if (!cancelled && next) setProgressText(next);
      } catch {
        // The rotating local status keeps the chat alive if polling fails.
      }
    };
    poll();
    const pollTimer = setInterval(poll, 1800);
    return () => {
      cancelled = true;
      clearInterval(fallbackTimer);
      clearInterval(pollTimer);
    };
  }, [status, token]);

  useEffect(() => {
    if (status !== 'sending' || !token) return undefined;
    let cancelled = false;

    const checkStoredAnswer = async () => {
      const pending = loadPendingRequests(storageKey);
      if (!pending.length) return;

      let changed = false;
      for (const item of pending) {
        try {
          const data = await fetchAiChatStoredResult(item.traceId, token);
          if (cancelled || !data) continue;
          if (data?.quota) setQuota(data.quota);
          const isBlocked = data?.status === 'quota_blocked' || data?.ok === false;
          const text = isBlocked
            ? (data?.error || 'AI request failed')
            : (data?.message || 'Done.');
          appendStoredChatMessage(storageKey, {
            role: 'assistant',
            text,
            traceId: `${item.traceId}:assistant`,
          });
          removePendingRequest(storageKey, item.traceId);
          if (activeTraceRef.current === item.traceId) activeTraceRef.current = '';
          if (data?.status === 'quota_blocked') setShopOpen(true);
          changed = true;
        } catch {
          // The main request/recovery path still owns visible errors.
        }
      }

      if (!cancelled && changed && mountedRef.current) {
        setMessages(loadChatMessages(storageKey));
        if (!loadPendingRequests(storageKey).length) {
          setStatus('idle');
          setProgressText('');
        }
      }
    };

    checkStoredAnswer();
    const timer = setInterval(checkStoredAnswer, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, storageKey, token]);

  useEffect(() => {
    if (status !== 'sending') return undefined;
    let cancelled = false;

    const settleIfStored = () => {
      const activeTrace = activeTraceRef.current;
      const pending = loadPendingRequests(storageKey);
      const activeAnswerStored = activeTrace
        ? hasStoredChatMessage(storageKey, `${activeTrace}:assistant`, 'assistant')
        : false;
      const staleWithoutPending = !pending.length
        && sendingStartedAtRef.current > 0
        && Date.now() - sendingStartedAtRef.current > 3000;

      if (!cancelled && mountedRef.current && (activeAnswerStored || staleWithoutPending)) {
        setMessages(loadChatMessages(storageKey));
        setStatus('idle');
        setProgressText('');
        if (activeAnswerStored || !pending.length) activeTraceRef.current = '';
      }
    };

    settleIfStored();
    const timer = setInterval(settleIfStored, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, storageKey]);

  const appendAssistantBrowserActionMessage = useCallback((text, traceId) => {
    appendStoredChatMessage(storageKey, {
      role: 'assistant',
      text,
      traceId: `${traceId || makeAiChatTraceId()}:browser-action:${Date.now().toString(36)}`,
    });
    if (mountedRef.current) setMessages(loadChatMessages(storageKey));
  }, [storageKey]);

  const requestConfirmDialog = useCallback((payload) => new Promise((resolve) => {
    if (confirmDialogResolveRef.current) confirmDialogResolveRef.current(false);
    confirmDialogResolveRef.current = resolve;
    setConfirmDialog(payload);
  }), []);

  const resolveConfirmDialog = useCallback((accepted) => {
    const resolve = confirmDialogResolveRef.current;
    confirmDialogResolveRef.current = null;
    setConfirmDialog(null);
    if (resolve) resolve(!!accepted);
  }, []);

  const resolveAvantisSmartWalletSetup = useCallback((result) => {
    const resolve = avantisSmartWalletSetupResolveRef.current;
    avantisSmartWalletSetupResolveRef.current = null;
    setAvantisSmartWalletSetup(null);
    if (resolve) resolve(result || null);
  }, []);

  const requestAvantisSmartWalletSetup = useCallback((payload) => new Promise((resolve) => {
    if (avantisSmartWalletSetupResolveRef.current) avantisSmartWalletSetupResolveRef.current(null);
    avantisSmartWalletSetupResolveRef.current = resolve;
    setAvantisSmartWalletSetup({
      ...payload,
      phase: payload?.status?.active ? 'needs_eth' : 'idle',
      error: '',
      status: payload?.status || null,
    });
  }), []);

  const handleAvantisSmartWalletSettingsChange = useCallback((nextSettings) => {
    setAvantisSmartWalletSetup((prev) => {
      if (!prev) return prev;
      const basePolicy = prev.base_policy || AVANTIS_BROWSER_POLICY_DEFAULTS;
      const walletUsdc = prev.wallet_usdc ?? avantisWalletUsdc;
      const saved = saveAvantisSettings(nextSettings, basePolicy);
      return {
        ...prev,
        settings: saved,
        policy: effectiveAvantisPolicy(basePolicy, saved, walletUsdc),
      };
    });
  }, [avantisWalletUsdc, saveAvantisSettings]);

  const handleAvantisSmartWalletSetup = useCallback(async () => {
    if (!avantisSmartWalletSetup || typeof avantisEnableSmartWallet !== 'function') return;
    if (avantisSmartWalletSetup.settings) {
      saveAvantisSettings(avantisSmartWalletSetup.settings, avantisSmartWalletSetup.base_policy || AVANTIS_BROWSER_POLICY_DEFAULTS);
    }
    setAvantisSmartWalletSetup((prev) => prev ? { ...prev, phase: 'delegating', error: '' } : prev);
    try {
      const result = await avantisEnableSmartWallet();
      const status = typeof avantisRefreshSmartWallet === 'function'
        ? await avantisRefreshSmartWallet().catch(() => null)
        : null;
      const merged = { ...(status || {}), ...(result || {}) };
      if (!merged?.active) throw new Error('Avantis Smart Wallet delegation was not confirmed on-chain.');
      if (merged?.needs_eth || merged?.needsEth) {
        setAvantisSmartWalletSetup((prev) => prev ? { ...prev, phase: 'needs_eth', status: merged, error: '' } : prev);
        return;
      }
      resolveAvantisSmartWalletSetup({ mode: 'smart_wallet', ...merged, policy: avantisSmartWalletSetup.policy });
    } catch (err) {
      setAvantisSmartWalletSetup((prev) => prev ? {
        ...prev,
        phase: 'error',
        error: err?.message || String(err),
      } : prev);
    }
  }, [avantisSmartWalletSetup, avantisEnableSmartWallet, avantisRefreshSmartWallet, resolveAvantisSmartWalletSetup, saveAvantisSettings]);

  const handleAvantisSmartWalletFund = useCallback(async () => {
    if (!avantisSmartWalletSetup || typeof avantisFundSmartWallet !== 'function') return;
    setAvantisSmartWalletSetup((prev) => prev ? { ...prev, phase: 'funding', error: '' } : prev);
    try {
      const result = await avantisFundSmartWallet('0.001');
      const merged = { ...(result || {}) };
      if (merged?.active && !merged?.needsEth) {
        resolveAvantisSmartWalletSetup({ mode: 'smart_wallet', ...merged, policy: avantisSmartWalletSetup.policy });
        return;
      }
      setAvantisSmartWalletSetup((prev) => prev ? {
        ...prev,
        phase: merged?.active ? 'needs_eth' : 'idle',
        status: merged,
        error: merged?.active ? '' : 'Delegate is not active on-chain yet.',
      } : prev);
    } catch (err) {
      setAvantisSmartWalletSetup((prev) => prev ? {
        ...prev,
        phase: 'error',
        error: err?.message || String(err),
      } : prev);
    }
  }, [avantisSmartWalletSetup, avantisFundSmartWallet, resolveAvantisSmartWalletSetup]);

  const handleAvantisSmartWalletRecheck = useCallback(async () => {
    if (!avantisSmartWalletSetup || typeof avantisRefreshSmartWallet !== 'function') return;
    setAvantisSmartWalletSetup((prev) => prev ? { ...prev, phase: 'checking', error: '' } : prev);
    try {
      const status = await avantisRefreshSmartWallet();
      if (status?.active && !status?.needsEth) {
        resolveAvantisSmartWalletSetup({ mode: 'smart_wallet', ...status, policy: avantisSmartWalletSetup.policy });
        return;
      }
      setAvantisSmartWalletSetup((prev) => prev ? {
        ...prev,
        phase: status?.active ? 'needs_eth' : 'idle',
        status,
        error: status?.active ? '' : 'Delegate is not active on-chain yet.',
      } : prev);
    } catch (err) {
      setAvantisSmartWalletSetup((prev) => prev ? { ...prev, phase: 'error', error: err?.message || String(err) } : prev);
    }
  }, [avantisSmartWalletSetup, avantisRefreshSmartWallet, resolveAvantisSmartWalletSetup]);

  const handleAvantisSmartWalletRevoke = useCallback(async () => {
    if (!avantisSmartWalletSetup || typeof avantisRevokeSmartWallet !== 'function') return;
    setAvantisSmartWalletSetup((prev) => prev ? { ...prev, phase: 'revoking', error: '' } : prev);
    try {
      await avantisRevokeSmartWallet();
      setAvantisSmartWalletSetup((prev) => prev ? {
        ...prev,
        phase: 'revoked',
        status: null,
        error: '',
      } : prev);
    } catch (err) {
      setAvantisSmartWalletSetup((prev) => prev ? { ...prev, phase: 'error', error: err?.message || String(err) } : prev);
    }
  }, [avantisSmartWalletSetup, avantisRevokeSmartWallet]);

  const ensureAvantisAgentPermission = useCallback(async (action, policy) => {
    if (tradingEvmWallet?.source !== 'privy' || typeof tradingEvmWallet?.sendTransaction !== 'function') {
      return null;
    }
    if (!avantisWalletAddr) return null;
    const existing = loadAvantisAgentPermission(avantisWalletAddr);
    if (
      actionFitsAvantisAgentPermission(action, existing, { walletUsdc: avantisWalletUsdc })
      && await verifyAvantisAgentPermission(existing)
    ) {
      return existing;
    }

    const walletClient = tradingEvmWallet.walletClient || tradingEvmWallet.getWalletClient?.(BASE_CHAIN_ID);
    if (!walletClient?.signTypedData) return null;
    const signedPolicy = {
      collateral_limit_mode: policy.collateral_limit_mode || 'usdc',
      max_balance_pct: Number(policy.max_balance_pct ?? 100),
      max_collateral_usd: policyNumber(policy, 'max_collateral_usd'),
      max_leverage: policyNumber(policy, 'max_leverage'),
      max_notional_usd: policyNumber(policy, 'max_notional_usd'),
      max_slippage_pct: policyNumber(policy, 'max_slippage_pct'),
    };
    const expiresAt = Date.now() + AVANTIS_AGENT_PERMISSION_TTL_MS;
    const confirmed = await requestConfirmDialog({
      title: 'Enable Avantis auto-signing',
      body: 'This applies only to this Privy browser wallet and expires in 30 minutes.',
      summary: `Limits: collateral <= ${formatAiUsd(signedPolicy.max_collateral_usd)}${signedPolicy.collateral_limit_mode === 'percent' ? ` or ${signedPolicy.max_balance_pct}% balance` : ''}, leverage <= ${signedPolicy.max_leverage}x, notional <= ${formatAiUsd(signedPolicy.max_notional_usd)}, slippage <= ${signedPolicy.max_slippage_pct}%.`,
      confirmText: 'Enable',
      cancelText: 'Not now',
    });
    if (!confirmed) return null;

    await tradingEvmWallet.ensureChain?.(BASE_CHAIN_ID);
    const message = makeAvantisAgentPermissionMessage(avantisWalletAddr, signedPolicy, expiresAt);
    const signature = await walletClient.signTypedData({
      account: avantisWalletAddr,
      domain: makeAvantisAgentPermissionDomain(),
      types: AVANTIS_AGENT_PERMISSION_TYPES,
      primaryType: 'AvantisAgentPermission',
      message,
    });
    const record = {
      wallet: avantisWalletAddr,
      scope: AVANTIS_AGENT_SCOPE,
      policy: signedPolicy,
      expires_at: expiresAt,
      signature,
      source: 'privy',
      created_at: Date.now(),
    };
    saveAvantisAgentPermission(record);
    return actionFitsAvantisAgentPermission(action, record, { walletUsdc: avantisWalletUsdc }) ? record : null;
  }, [tradingEvmWallet, avantisWalletAddr, avantisWalletUsdc, requestConfirmDialog]);

  const ensureAvantisSmartWalletRoute = useCallback(async (action, policy) => {
    if (!avantisWalletAddr || typeof avantisEnableSmartWallet !== 'function') return null;
    if (!actionFitsAvantisAgentPermission(action, {
      expires_at: Date.now() + 60_000,
      policy: {
        collateral_limit_mode: policy.collateral_limit_mode || 'usdc',
        max_balance_pct: Number(policy.max_balance_pct ?? 100),
        max_collateral_usd: policyNumber(policy, 'max_collateral_usd'),
        max_leverage: policyNumber(policy, 'max_leverage'),
        max_notional_usd: policyNumber(policy, 'max_notional_usd'),
        max_slippage_pct: policyNumber(policy, 'max_slippage_pct'),
      },
    }, { walletUsdc: avantisWalletUsdc })) {
      return null;
    }
    let currentSmartWallet = avantisSmartWallet;
    if (!(currentSmartWallet?.active && !currentSmartWallet?.needsEth) && typeof avantisRefreshSmartWallet === 'function') {
      currentSmartWallet = await avantisRefreshSmartWallet().catch(() => avantisSmartWallet);
    }
    if (currentSmartWallet?.active && !currentSmartWallet?.needsEth) {
      return { mode: 'smart_wallet', ...currentSmartWallet };
    }

    const setupResult = await requestAvantisSmartWalletSetup({
      action,
      policy: {
        collateral_limit_mode: policy.collateral_limit_mode || 'usdc',
        max_balance_pct: Number(policy.max_balance_pct ?? 100),
        max_collateral_usd: policyNumber(policy, 'max_collateral_usd'),
        max_leverage: policyNumber(policy, 'max_leverage'),
        max_notional_usd: policyNumber(policy, 'max_notional_usd'),
        max_slippage_pct: policyNumber(policy, 'max_slippage_pct'),
      },
      base_policy: { ...AVANTIS_BROWSER_POLICY_DEFAULTS, ...(action.policy || {}) },
      settings: avantisAiTradeSettings,
      wallet_usdc: Number.isFinite(Number(avantisWalletUsdc)) ? Number(avantisWalletUsdc) : null,
      summary: describeAvantisBrowserAction(action),
      status: currentSmartWallet,
    });
    if (!setupResult) {
      const err = new Error('Avantis Smart Wallet setup was closed before the action was submitted.');
      err.code = 'AVANTIS_SMART_WALLET_SETUP_CANCELLED';
      throw err;
    }
    return setupResult;
  }, [avantisWalletAddr, avantisEnableSmartWallet, avantisRefreshSmartWallet, avantisSmartWallet, requestAvantisSmartWalletSetup, avantisAiTradeSettings, avantisWalletUsdc]);

  const executeAvantisBrowserAction = useCallback(async (action, traceId) => {
    if (!action || action.dex !== 'avantis' || !action.id) return null;
    if (browserActionRunRef.current.has(action.id) || browserActionAlreadySubmitted(action.id)) {
      return { skipped: true };
    }
    const summary = describeAvantisBrowserAction(action);
    const signature = avantisPlaceOrderSignature(action);
    const duplicate = findDuplicateAvantisPlaceOrder(action, {
      ledger: loadBrowserActionLedger(),
      positions: avantisPositions,
      locks: browserActionSignatureRunRef.current,
    });
    if (duplicate) {
      markBrowserAction(action.id, 'blocked_duplicate', {
        action,
        signature,
        summary,
        error: duplicate.status || duplicate.type || 'duplicate',
      });
      appendAssistantBrowserActionMessage(duplicateAvantisPlaceOrderMessage(action, duplicate), traceId);
      return { skipped: true, duplicate: true };
    }
    browserActionRunRef.current.add(action.id);
    if (signature) browserActionSignatureRunRef.current.add(signature);
    const args = action.args || {};
    const basePolicy = { ...AVANTIS_BROWSER_POLICY_DEFAULTS, ...(action.policy || {}) };
    const policy = effectiveAvantisPolicy(basePolicy, avantisAiTradeSettings, avantisWalletUsdc);
    try {
      if (dex !== 'avantis') throw new Error('Switch this game account to Avantis before signing the action.');
      if (!avantisReady || !avantisWalletAddr) throw new Error('Connect your Base wallet before signing the Avantis action.');
      if (action.wallet && String(action.wallet).toLowerCase() !== String(avantisWalletAddr).toLowerCase()) {
        throw new Error('Prepared action is for a different Avantis wallet.');
      }
      const expiresAt = Date.parse(action.policy?.expires_at || '');
      if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt) {
        throw new Error('Prepared Avantis action expired. Ask Hermes again.');
      }

      if (action.type === 'place_order') {
        const collateral = Number(args.collateral_usd);
        const policyError = avantisActionPolicyError(action, policy, avantisWalletUsdc);
        if (policyError) throw new Error(policyError);
        const knownUsdc = Number(avantisWalletUsdc);
        if (avantisWalletUsdc != null && Number.isFinite(knownUsdc) && collateral > knownUsdc + 1e-9) {
          throw new Error(`Not enough USDC in browser wallet: need ${formatAiUsd(collateral)}, have ${formatAiUsd(avantisWalletUsdc)}.`);
        }
      }

      const smartWalletRoute = await ensureAvantisSmartWalletRoute(action, policy).catch((err) => {
        console.warn('[ai-chat] Avantis Smart Wallet route failed:', err?.message || err);
        throw err;
      });
      const routePolicy = smartWalletRoute?.policy || policy;
      const routePolicyError = avantisActionPolicyError(action, routePolicy, avantisWalletUsdc);
      if (routePolicyError) throw new Error(routePolicyError);
      const useSmartWallet = !!smartWalletRoute;
      const agentPermission = useSmartWallet ? null : await ensureAvantisAgentPermission(action, policy).catch((err) => {
        console.warn('[ai-chat] Avantis agent permission failed:', err?.message || err);
        return null;
      });
      const silentPrivy = !!agentPermission && actionFitsAvantisAgentPermission(action, agentPermission);
      const txStatusSeen = new Set();
      const onTxStatus = (event = {}) => {
        const phase = String(event.phase || '');
        const hash = event.hash || event.tx_hash;
        if (phase === 'wallet_prompt' && !txStatusSeen.has('wallet_prompt')) {
          txStatusSeen.add('wallet_prompt');
          markBrowserAction(action.id, 'wallet_prompt', { action, signature, summary });
          appendAssistantBrowserActionMessage(avantisBrowserActionStatusMessage('wallet_prompt', {
            useSmartWallet,
            silentPrivy,
            summary,
          }), traceId);
          return;
        }
        if (phase === 'signing' && !txStatusSeen.has('signing')) {
          txStatusSeen.add('signing');
          markBrowserAction(action.id, 'signing', { action, signature, summary });
          appendAssistantBrowserActionMessage(avantisBrowserActionStatusMessage('signing', {
            useSmartWallet,
            silentPrivy,
            summary,
          }), traceId);
          return;
        }
        if ((phase === 'submitted' || phase === 'confirming') && !txStatusSeen.has('submitted')) {
          txStatusSeen.add('submitted');
          markBrowserAction(action.id, 'confirming', { tx_hash: hash, action, signature, summary });
          appendAssistantBrowserActionMessage(avantisBrowserActionStatusMessage('confirming', {
            useSmartWallet,
            silentPrivy,
            summary,
            hash,
          }), traceId);
        }
      };
      if (!useSmartWallet && !silentPrivy) {
        const confirmed = await requestConfirmDialog({
          title: 'Submit Avantis action',
          body: 'ClashHermes prepared this transaction. Your wallet will show the final Base transaction.',
          summary,
          confirmText: 'Continue',
          cancelText: 'Cancel',
        });
        if (!confirmed) {
          markBrowserAction(action.id, 'cancelled', { error: 'User cancelled browser confirmation', action, signature, summary });
          appendAssistantBrowserActionMessage(avantisBrowserActionStatusMessage('cancelled', {
            useSmartWallet,
            silentPrivy,
            summary,
          }), traceId);
          return { cancelled: true };
        }
      }

      markBrowserAction(action.id, 'started', { action, signature, summary });
      let result;
      const actionOptions = { silentPrivy, smartWallet: useSmartWallet, onStatus: onTxStatus };
      if (action.type === 'place_order') {
        const side = normalizeAvantisPanelSide(args.side);
        const orderOptions = {
          take_profit: Number(args.take_profit) > 0 ? Number(args.take_profit) : undefined,
          stop_loss: Number(args.stop_loss) > 0 ? Number(args.stop_loss) : undefined,
          silentPrivy,
          smartWallet: useSmartWallet,
          onStatus: onTxStatus,
        };
        if (String(args.order_type || 'market').toLowerCase() === 'limit') {
          result = await avantisPlaceLimitOrder(args.symbol, side, Number(args.price), String(args.collateral_usd), 'GTC', Number(args.leverage || 1), Number(args.slippage_pct || 1), orderOptions);
        } else {
          result = await avantisPlaceMarketOrder(args.symbol, side, String(args.collateral_usd), String(args.slippage_pct || 1), Number(args.leverage || 1), orderOptions);
        }
      } else if (action.type === 'close_position') {
        result = await avantisClosePosition(args.symbol, normalizeAvantisPanelSide(args.side), String(args.collateral_usd), args.pair_index, args.trade_index, actionOptions);
      } else if (action.type === 'cancel_order') {
        result = await avantisCancelOrder(args.symbol, null, args.pair_index, args.trade_index, actionOptions);
      } else if (action.type === 'set_tpsl') {
        result = await avantisSetTpsl(args.symbol, normalizeAvantisPanelSide(args.side), args.take_profit || null, args.stop_loss || null, args.pair_index, args.trade_index, actionOptions);
      } else {
        throw new Error(`Unsupported Avantis browser action: ${action.type}`);
      }

      if (!result || result.error) throw new Error(result?.error || 'Avantis browser transaction failed.');
      markBrowserAction(action.id, 'confirmed', { ...result, action, signature, summary });
      const closeResult = describeAvantisCloseResult(action, avantisPositions, avantisPrices, result);
      appendAssistantBrowserActionMessage(avantisBrowserActionStatusMessage('confirmed', {
        useSmartWallet,
        silentPrivy,
        summary,
        hash: result.tx_hash,
        closeResult,
      }), traceId);
      return result;
    } catch (err) {
      markBrowserAction(action.id, 'failed', { error: err?.message || String(err), action, signature, summary });
      appendAssistantBrowserActionMessage(avantisBrowserActionStatusMessage('failed', {
        summary,
        error: err?.message || String(err),
      }), traceId);
      return { error: err?.message || String(err) };
    } finally {
      if (signature) browserActionSignatureRunRef.current.delete(signature);
    }
  }, [
    dex,
    avantisReady,
    avantisWalletAddr,
    avantisWalletMismatch,
    avantisWalletUsdc,
    avantisPlaceMarketOrder,
    avantisPlaceLimitOrder,
    avantisClosePosition,
    avantisCancelOrder,
    avantisSetTpsl,
    avantisPositions,
    avantisPrices,
    avantisAiTradeSettings,
    ensureAvantisSmartWalletRoute,
    ensureAvantisAgentPermission,
    requestConfirmDialog,
    appendAssistantBrowserActionMessage,
  ]);

  const executeAiBrowserActions = useCallback(async (actions = [], traceId = '') => {
    const list = Array.isArray(actions) ? actions.filter((action) => action?.dex === 'avantis') : [];
    const results = [];
    for (const action of list) {
      const result = await executeAvantisBrowserAction(action, traceId);
      results.push({ action, result });
    }
    return results;
  }, [executeAvantisBrowserAction]);

  const runFollowUpAfterBrowserActions = useCallback(async (followUp, parentTraceId, browserResults = []) => {
    if (!token || !aiBrowserActionsSatisfiedFollowUp(followUp, browserResults)) return;
    const text = String(followUp.message || '').trim();
    if (!text) return;
    const traceId = makeAiChatTraceId();
    const idempotencyKey = `${traceId}:after-browser-actions`;
    activeTraceRef.current = traceId;
    sendingStartedAtRef.current = Date.now();
    setProgressText('Continuing after Base confirmation...');
    appendAssistantBrowserActionMessage(followUp.notice || 'Close confirmed. I am continuing the Avantis request now.', parentTraceId);
    addPendingRequest(storageKey, {
      traceId,
      message: text,
      startedAt: Date.now(),
    });
    try {
      const history = buildContextHistory(loadChatMessages(storageKey));
      const requestResult = fetch('/api/ai-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({
          message: text,
          history,
          trace_id: traceId,
          idempotency_key: idempotencyKey,
          ai_trade_settings: activeAvantisSettingsPayload,
          metadata: {
            continuation: followUp.kind || 'after_browser_actions',
            parent_trace_id: parentTraceId,
          },
        }),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) {
            const err = new Error(data?.error || 'AI follow-up failed');
            err.status = r.status;
            err.data = data;
            throw err;
          }
          return data;
        })
        .then((data) => ({ kind: 'data', data }))
        .catch((err) => ({ kind: 'request_error', err }));
      const recoveryResult = waitForAiChatStoredResult(traceId, token)
        .then((data) => ({ kind: 'data', data }))
        .catch((err) => ({ kind: 'recovery_error', err }));
      let result = await Promise.race([requestResult, recoveryResult]);
      if (result.kind === 'request_error') {
        if (result.err?.status && result.err.status < 500) throw result.err;
        const recovered = await recoveryResult;
        result = recovered.kind === 'data' ? recovered : result;
      } else if (result.kind === 'recovery_error') {
        const requested = await requestResult;
        result = requested.kind === 'data' ? requested : requested;
      }
      if (result.kind !== 'data') throw result.err || new Error('AI follow-up failed');
      const data = result.data || {};
      if (data?.quota) setQuota(data.quota);
      if (data?.ok === false) throw new Error(data?.error || 'AI follow-up failed');
      appendStoredChatMessage(storageKey, {
        role: 'assistant',
        text: data?.message || 'Done.',
        traceId: `${traceId}:assistant`,
      });
      const browserResults = await executeAiBrowserActions(data?.browser_actions, traceId);
      await runFollowUpAfterBrowserActions(data?.follow_up_after_browser_actions, traceId, browserResults);
      removePendingRequest(storageKey, traceId);
    } catch (err) {
      if (err?.data?.quota) setQuota(err.data.quota);
      appendStoredChatMessage(storageKey, {
        role: 'assistant',
        text: aiErrorMessage(err),
        traceId: `${traceId}:assistant`,
      });
      removePendingRequest(storageKey, traceId);
    } finally {
      if (activeTraceRef.current === traceId) activeTraceRef.current = '';
      sendingStartedAtRef.current = 0;
      if (mountedRef.current) setMessages(loadChatMessages(storageKey));
    }
  }, [
    token,
    storageKey,
    activeAvantisSettingsPayload,
    executeAiBrowserActions,
    appendAssistantBrowserActionMessage,
  ]);

  const startNewChat = useCallback(async () => {
    if (status === 'sending' || resettingChat || activeTraceRef.current || loadPendingRequests(storageKey).length) return;
    const initial = resetStoredChat(storageKey);
    activeTraceRef.current = '';
    sendingStartedAtRef.current = 0;
    browserActionRunRef.current.clear();
    browserActionSignatureRunRef.current.clear();
    setInput('');
    setError('');
    setProgressText('');
    setStatus('idle');
    setMessages(initial);
    if (!token) return;
    setResettingChat(true);
    try {
      const r = await fetch('/api/ai-chat/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({
          delete_recent_memory: true,
          restart: true,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to reset AI chat');
    } catch (err) {
      setError(`New chat opened locally. Agent reset failed: ${err?.message || String(err)}`);
    } finally {
      if (mountedRef.current) setResettingChat(false);
    }
  }, [resettingChat, status, storageKey, token]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || status === 'sending') return;
    if (!token) {
      setError('Game session is not ready yet.');
      return;
    }
    setInput('');
    setError('');
    setStatus('sending');
    setProgressText('Reading your request...');
    const history = buildContextHistory(messages);
    const traceId = makeAiChatTraceId();
    const idempotencyKey = traceId;
    activeTraceRef.current = traceId;
    sendingStartedAtRef.current = Date.now();
    appendStoredChatMessage(storageKey, {
      role: 'user',
      text,
      traceId: `${traceId}:user`,
    });
    addPendingRequest(storageKey, {
      traceId,
      message: text,
      startedAt: Date.now(),
    });
    setMessages(loadChatMessages(storageKey));
    try {
      const requestResult = fetch('/api/ai-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({
          message: text,
          history,
          trace_id: traceId,
          idempotency_key: idempotencyKey,
          ai_trade_settings: activeAvantisSettingsPayload,
        }),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) {
            const err = new Error(data?.error || 'AI request failed');
            err.status = r.status;
            err.data = data;
            throw err;
          }
          return data;
        })
        .then((data) => ({ kind: 'data', data }))
        .catch((err) => ({ kind: 'request_error', err }));

      const recoveryResult = waitForAiChatStoredResult(traceId, token)
        .then((data) => ({ kind: 'data', data }))
        .catch((err) => ({ kind: 'recovery_error', err }));

      let result = await Promise.race([requestResult, recoveryResult]);
      if (result.kind === 'request_error') {
        if (result.err?.status && result.err.status < 500) throw result.err;
        const recovered = await recoveryResult;
        result = recovered.kind === 'data' ? recovered : result;
      } else if (result.kind === 'recovery_error') {
        const requested = await requestResult;
        result = requested.kind === 'data' ? requested : requested;
      }

      if (result.kind !== 'data') {
        throw result.err || new Error('AI request failed');
      }

      const data = result.data || {};
      if (data?.quota) setQuota(data.quota);
      if (data?.status === 'quota_blocked') {
        // 402 = out of quota → pop the shop modal so the player can
        // top up without re-reading the error first.
        setShopOpen(true);
        throw new Error(data?.error || 'AI request failed');
      }
      if (data?.ok === false) throw new Error(data?.error || 'AI request failed');
      appendStoredChatMessage(storageKey, {
        role: 'assistant',
        text: data?.message || 'Done.',
        traceId: `${traceId}:assistant`,
      });
      await executeAiBrowserActions(data?.browser_actions, traceId);
      removePendingRequest(storageKey, traceId);
      if (activeTraceRef.current === traceId) activeTraceRef.current = '';
      if (mountedRef.current) setMessages(loadChatMessages(storageKey));
    } catch (err) {
      if (err?.data?.quota) setQuota(err.data.quota);
      if (err?.status === 402) setShopOpen(true);
      const recovered = await fetchAiChatStoredResult(traceId, token).catch(() => null);
      if (recovered?.quota) setQuota(recovered.quota);
      if (recovered && recovered.status !== 'quota_blocked' && recovered.ok !== false) {
        appendStoredChatMessage(storageKey, {
          role: 'assistant',
          text: recovered.message || 'Done.',
          traceId: `${traceId}:assistant`,
        });
        const browserResults = await executeAiBrowserActions(recovered?.browser_actions, traceId);
        await runFollowUpAfterBrowserActions(recovered?.follow_up_after_browser_actions, traceId, browserResults);
        removePendingRequest(storageKey, traceId);
        if (activeTraceRef.current === traceId) activeTraceRef.current = '';
        if (mountedRef.current) setMessages(loadChatMessages(storageKey));
        return;
      }
      if (recovered?.status === 'quota_blocked') setShopOpen(true);
      const msg = aiErrorMessage(err);
      if (recovered || (err?.status && err.status < 500)) {
        appendStoredChatMessage(storageKey, {
          role: 'assistant',
          text: msg,
          traceId: `${traceId}:assistant`,
        });
        removePendingRequest(storageKey, traceId);
        if (activeTraceRef.current === traceId) activeTraceRef.current = '';
        if (mountedRef.current) setMessages(loadChatMessages(storageKey));
      }
      if (mountedRef.current) setError(msg);
    } finally {
      if (mountedRef.current) {
        setStatus('idle');
        setProgressText('');
      }
      sendingStartedAtRef.current = 0;
    }
  }, [input, messages, status, storageKey, token, executeAiBrowserActions, runFollowUpAfterBrowserActions, activeAvantisSettingsPayload]);

  const onKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }, [send]);

  const handleBuyAiProduct = useCallback(async (product) => {
    if (!token) {
      setShopNotice('Game session is not ready yet.');
      return;
    }
    const chainConfig = shopConfig?.[shopChain];
    if (!chainConfig?.ready || !chainConfig?.saleActive) {
      setShopNotice(`${AI_SHOP_CHAIN_OPTIONS.find((c) => c.id === shopChain)?.label || shopChain} shop is not live yet.`);
      return;
    }
    if (shopChain === 'base' || shopChain === 'arbitrum' || shopChain === 'monad' || shopChain === 'ink') {
      if (!evmAddress || !evmWallet) {
        setEvmModalOpen(true);
        return;
      }
    } else if (shopChain === 'solana') {
      if (!solAddress) {
        setSolanaModalVisible(true);
        return;
      }
    } else if (shopChain === 'aptos') {
      if (!aptosAddress) {
        try { await aptosWallet.connect(); } catch {}
        return;
      }
    }

    setShopBusy(product.id);
    setShopNotice('');
    beginTopUpFlow(product);
    try {
      let result;
      if (shopChain === 'solana') {
        result = await buySolanaShopItem({
          solWallet,
          buyer: solAddress,
          token,
          sku: product.sku,
          payment: shopPayment,
          quantity: 1,
        });
      } else if (shopChain === 'base') {
        result = await buyEvmShopItem({
          evmWallet,
          buyer: evmAddress,
          token,
          chain: shopChain,
          sku: product.sku,
          payment: shopPayment,
          quantity: 1,
        });
      } else if (shopChain === 'arbitrum' || shopChain === 'monad' || shopChain === 'ink') {
        result = await buyEvmShopItem({
          evmWallet,
          buyer: evmAddress,
          token,
          chain: shopChain,
          sku: product.sku,
          payment: shopPayment,
          quantity: 1,
        });
      } else if (shopChain === 'aptos') {
        result = await buyAptosShopItem({
          aptosWallet,
          buyer: aptosAddress,
          token,
          sku: product.sku,
          payment: shopPayment,
          quantity: 1,
        });
      } else {
        throw new Error(`Unsupported chain: ${shopChain}`);
      }
      if (result?.grant?.ai_quota) setQuota(result.grant.ai_quota);
      else {
        const q = await fetch('/api/ai-chat/quota', { headers: { 'x-token': token }, cache: 'no-store' })
          .then((r) => r.json().catch(() => ({})));
        if (q?.quota) setQuota(q.quota);
      }
      const granted = result?.grant?.ai_messages_granted;
      const pass = result?.grant?.ai_subscription;
      setShopNotice(pass
        ? `Lifetime AI Pass active: ${pass.lifetime_daily_limit || 100} messages/day.`
        : `${granted || product.messageCredits || 0} AI messages added.`);
      setMessages((rows) => [...rows, {
        role: 'assistant',
        text: pass
          ? 'AI Lifetime Pass is active. I can keep helping you every day.'
          : `${granted || product.messageCredits || 0} AI message credits added. Ready for the next order.`,
      }]);
      clearTopUpTimers();
      setTopUpFlow({
        status: 'success',
        product,
        granted: granted || product.messageCredits || 0,
        pass,
        error: '',
      });
    } catch (err) {
      const msg = (err?.shortMessage || err?.message || 'Purchase failed').slice(0, 180);
      setShopNotice(msg);
      clearTopUpTimers();
      setTopUpFlow((prev) => ({
        status: 'error',
        product,
        granted: 0,
        pass: null,
        error: msg,
        // Preserve which step we were on so the rail shows where it
        // failed (sign vs confirm vs credit).
        failedAt: prev?.status || 'signing',
      }));
    } finally {
      setShopBusy(null);
    }
  }, [aptosAddress, aptosWallet, beginTopUpFlow, clearTopUpTimers, evmAddress, evmWallet, setSolanaModalVisible, shopChain, shopConfig, shopPayment, solAddress, solWallet, token]);

  // On desktop the chat is a sidebar — it must not dim the game or steal
  // clicks from buildings underneath. Make the backdrop transparent and
  // non-interactive; only the panel itself catches pointer events. On
  // mobile it becomes a bottom-sheet — half-height, anchored to the
  // bottom, with a drag-down-to-dismiss gesture and a tap-outside-to-
  // close backdrop.
  const backdropStyle = isMobile
    ? { ...styles.backdrop, ...styles.backdropMobile }
    : { ...styles.backdrop, background: 'transparent', pointerEvents: 'none' };

  // Mobile sheet transform: when mounted=false we start translated all
  // the way down (off-screen) so the open animation slides up. While
  // dragging we mirror finger movement; on release the transition
  // animates back to 0 (or further down + unmount on dismiss).
  const sheetTransform = !mounted
    ? 'translateY(100%)'
    : `translateY(${dragY}px)`;
  const panelStyle = isMobile
    ? {
        ...styles.panel,
        ...styles.panelMobile,
        transform: sheetTransform,
        transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        willChange: 'transform',
      }
    : {
        ...styles.panel,
        pointerEvents: 'auto',
        // Override base width/height with the user's resized values.
        width: sizeRef.current.w,
        height: sizeRef.current.h,
        // Drag translation. Transition off during drag/resize so the
        // panel tracks the cursor 1:1.
        transform: `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
        transition: (isDragging || isResizing) ? 'none' : 'transform 0.18s ease',
      };

  // Tap on the dimmed backdrop dismisses the sheet on mobile. Desktop
  // backdrop is non-interactive, so this is mobile-only behavior.
  const handleBackdropClick = isMobile ? (e) => {
    // Only close when the click actually lands on the backdrop itself,
    // not on the panel that's bubbling up.
    if (e.target === e.currentTarget) onClose?.();
  } : undefined;
  const aiProducts = (shopConfig?.products || []).filter((product) => (
    product.kind === 'ai_messages' || product.kind === 'ai_subscription'
  ));
  const shopReady = !!shopConfig?.[shopChain]?.ready && !!shopConfig?.[shopChain]?.saleActive;
  const shopPayments = (AI_SHOP_PAYMENTS_BY_CHAIN[shopChain] || [])
    .filter((payment) => payment.id !== 'skr' || !!shopConfig?.solana?.skrReady)
    .filter((payment) => payment.id !== 'clash' || !!shopConfig?.solana?.clashReady);

  return (
    <div style={backdropStyle} onClick={handleBackdropClick}>
      <style dangerouslySetInnerHTML={{ __html: HERMES_CHAT_CSS }} />
      <section ref={panelRef} style={panelStyle}>
        {isMobile && (
          <div
            style={styles.dragHandleArea}
            onTouchStart={onDragStart}
            onTouchMove={onDragMove}
            onTouchEnd={onDragEnd}
            onTouchCancel={onDragEnd}
          >
            <div style={styles.dragHandle} />
          </div>
        )}
        {/* On mobile the title row + close button are gone — the drag
            handle pill above + tap-outside-to-close (and swipe-down)
            cover dismissal, and shaving these saves precious height in
            the half-sheet. Desktop keeps the full header which doubles
            as the drag grip. */}
        {!isMobile && (
          <header
            style={{ ...styles.header, ...styles.headerDesktop, cursor: isDragging ? 'grabbing' : 'grab' }}
            onPointerDown={onHeaderPointerDown}
          >
            <div style={styles.brandRow}>
              <span style={styles.brandAvatar}>
                <HermesAvatar size={28} />
              </span>
              <div style={styles.titleBlock}>
                <div style={styles.titleLine}>
                  <span style={styles.title}>ClashHermes</span>
                </div>
              </div>
            </div>
            <div data-nodrag style={styles.headerActions}>
              <button
                type="button"
                style={{
                  ...styles.newChatToggle,
                  ...((status === 'sending' || resettingChat) ? styles.headerButtonDisabled : null),
                }}
                className="hermes-new-chat-toggle"
                onClick={startNewChat}
                disabled={status === 'sending' || resettingChat}
                title={(status === 'sending' || resettingChat) ? 'Wait for the current answer' : 'Start a new chat'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                New chat
              </button>
              <button
                type="button"
                style={styles.newChatToggle}
                className="hermes-jobs-toggle"
                onClick={() => setJobsOpen(true)}
                title="Scheduled Hermes jobs"
              >
                Jobs
              </button>
              <button
                type="button"
                style={styles.shopToggle}
                className="hermes-shop-toggle"
                onClick={() => setShopOpen(true)}
                title="Top up messages"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" style={{ marginRight: 4 }}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Top up
              </button>
              <button style={styles.close} onClick={onClose} aria-label="Close ClashHermes chat">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </header>
        )}
        {isMobile && (
          <div style={styles.mobileTopBar}>
            <div style={styles.brandRow}>
              <span style={styles.brandAvatar}>
                <HermesAvatar size={24} />
              </span>
              <div style={styles.titleBlock}>
                <div style={styles.titleLine}>
                  <span style={styles.title}>ClashHermes</span>
                </div>
              </div>
            </div>
            <div style={styles.mobileHeaderActions}>
              <button
                type="button"
                style={{
                  ...styles.newChatToggle,
                  ...styles.newChatToggleMobile,
                  ...((status === 'sending' || resettingChat) ? styles.headerButtonDisabled : null),
                }}
                onClick={startNewChat}
                disabled={status === 'sending' || resettingChat}
                title={(status === 'sending' || resettingChat) ? 'Wait for the current answer' : 'Start a new chat'}
              >
                New
              </button>
              <button
                type="button"
                style={styles.shopToggle}
                onClick={() => setJobsOpen(true)}
                title="Scheduled Hermes jobs"
              >
                Jobs
              </button>
              <button
                type="button"
                style={styles.shopToggle}
                onClick={() => setShopOpen(true)}
                title="Top up messages"
              >
                Top up
              </button>
            </div>
          </div>
        )}

        <div ref={listRef} className="shop-scroll" style={styles.messages}>
          {/* Empty state: when the only thing in the thread is the seed
              "Ready when you are." line, swap the bare bubble for a
              welcome card with one-tap starter prompts. Once the player
              sends their first message the seed disappears and the
              normal bubble flow takes over. */}
          {messages.length === 1 && messages[0].role === 'assistant' && messages[0].text === INITIAL_MESSAGES[0].text ? (
            <div style={styles.welcomeCard}>
              <div style={styles.welcomeMark}><HermesAvatar size={44} /></div>
              <div style={styles.welcomeTitle}>Hermes is listening</div>
              <div style={styles.welcomeSub}>
                Pick a game action or tell Hermes what to handle next.
              </div>
              <div style={styles.starterChips}>
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={styles.starterChip}
                    className="hermes-starter-chip"
                    onClick={() => setInput(p.text)}
                    title={p.text}
                  >
                    <span style={styles.starterChipLabel}>{p.label}</span>
                    <span style={styles.starterChipText}>{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div key={idx} style={m.role === 'user' ? styles.bubbleRowUser : styles.bubbleRowAi}>
                {m.role === 'assistant' && (
                  <span style={styles.bubbleAvatar}><HermesAvatar size={22} /></span>
                )}
                <div style={{ ...styles.bubble, ...(m.role === 'user' ? styles.userBubble : styles.aiBubble) }}>
                  <div style={styles.role}>{m.role === 'user' ? 'You' : 'ClashHermes'}</div>
                  <div style={styles.text}>{m.text}</div>
                  {m.meta && <div style={styles.meta}>{m.meta}</div>}
                </div>
              </div>
            ))
          )}
          {status === 'sending' && (
            <div style={styles.bubbleRowAi}>
              <span style={styles.bubbleAvatar}><HermesAvatar size={22} /></span>
              <div style={{ ...styles.bubble, ...styles.aiBubble }}>
                <div style={styles.role}>ClashHermes</div>
                <div style={styles.thinkingRow}>
                  <span style={styles.typingDots}>
                    <span className="hermes-typing-dot" style={{ ...styles.typingDot, animationDelay: '0s' }} />
                    <span className="hermes-typing-dot" style={{ ...styles.typingDot, animationDelay: '0.15s' }} />
                    <span className="hermes-typing-dot" style={{ ...styles.typingDot, animationDelay: '0.3s' }} />
                  </span>
                  <span style={styles.text}>{progressText || 'Thinking and checking tools...'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.composer}>
          <div style={{ ...styles.inputWrap, ...(input.trim() ? styles.inputWrapActive : null) }}>
            <textarea
              ref={inputRef}
              className="shop-scroll"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask ClashHermes anything..."
              style={styles.input}
              rows={1}
            />
          </div>
          <button
            style={{ ...styles.send, ...(input.trim() && status !== 'sending' ? styles.sendReady : null) }}
            className="hermes-send-glow"
            onClick={send}
            disabled={status === 'sending' || !input.trim()}
            aria-label="Send message"
            title="Send"
          >
            {/* Crossed-swords mark mirrors the in-game Tournament icon so
                the send button reads as "execute" / "engage" in the same
                visual language as the rest of the HUD. */}
            <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
              <g transform="rotate(45 32 32)">
                <rect x="30" y="6"  width="4"  height="36" fill="#e6e6e6" stroke="#1f4a14" strokeWidth="1.5" />
                <polygon points="32,2 35,8 29,8" fill="#f0f0f0" stroke="#1f4a14" strokeWidth="1.5" />
                <rect x="24" y="42" width="16" height="3.5" fill="#8b5a2b" stroke="#3d1f00" strokeWidth="1.5" />
                <rect x="29" y="45" width="6"  height="12"  fill="#8b5a2b" stroke="#3d1f00" strokeWidth="1.5" />
                <circle cx="32" cy="59" r="3.5" fill="#FFD700" stroke="#3d1f00" strokeWidth="1.5" />
              </g>
              <g transform="rotate(-45 32 32)">
                <rect x="30" y="6"  width="4"  height="36" fill="#e6e6e6" stroke="#1f4a14" strokeWidth="1.5" />
                <polygon points="32,2 35,8 29,8" fill="#f0f0f0" stroke="#1f4a14" strokeWidth="1.5" />
                <rect x="24" y="42" width="16" height="3.5" fill="#8b5a2b" stroke="#3d1f00" strokeWidth="1.5" />
                <rect x="29" y="45" width="6"  height="12"  fill="#8b5a2b" stroke="#3d1f00" strokeWidth="1.5" />
                <circle cx="32" cy="59" r="3.5" fill="#FFD700" stroke="#3d1f00" strokeWidth="1.5" />
              </g>
            </svg>
          </button>
        </div>

        {/* Desktop-only resize grip in the bottom-right corner. Two
            stacked chevron lines drawn with conic-gradient so it reads
            as a resize handle without needing an extra SVG. */}
        {!isMobile && (
          <div
            style={styles.resizeHandle}
            onPointerDown={onResizePointerDown}
            aria-label="Resize chat panel"
            role="button"
          />
        )}
      </section>

      {shopOpen && (
        <AiShopModal
          products={aiProducts}
          quota={quota}
          chain={shopChain}
          payment={shopPayment}
          payments={shopPayments}
          ready={shopReady}
          loading={!shopConfig}
          busy={shopBusy}
          notice={shopNotice}
          evmAddress={evmAddress}
          solAddress={solAddress}
          aptosAddress={aptosAddress}
          onPaymentChange={setShopPayment}
          onBuy={handleBuyAiProduct}
          onClose={() => setShopOpen(false)}
        />
      )}

      {jobsOpen && (
        <AiJobsModal
          jobs={jobs}
          form={jobForm}
          quota={quota}
          dex={dex}
          loading={jobsLoading}
          busy={jobsBusy}
          notice={jobsNotice}
          onFormChange={setJobForm}
          onSaveDraft={() => saveHermesJob(false)}
          onActivate={() => saveHermesJob(true)}
          onRefresh={loadHermesJobs}
          onPatch={patchHermesJob}
          onRunNow={runHermesJobNow}
          onDelete={deleteHermesJob}
          onClose={() => setJobsOpen(false)}
        />
      )}

      {topUpFlow && (
        <AiTopUpStatusModal
          flow={topUpFlow}
          paymentLabel={aiPaymentLabel(shopChain, shopPayment)}
          onClose={() => {
            clearTopUpTimers();
            setTopUpFlow(null);
          }}
          onRetry={() => {
            const p = topUpFlow.product;
            setTopUpFlow(null);
            if (p) handleBuyAiProduct(p);
          }}
        />
      )}

      {confirmDialog && (
        <AiConfirmDialog
          dialog={confirmDialog}
          onCancel={() => resolveConfirmDialog(false)}
          onConfirm={() => resolveConfirmDialog(true)}
        />
      )}

      {avantisSmartWalletSetup && (
        <AvantisSmartWalletSetupModal
          flow={avantisSmartWalletSetup}
          walletUsdc={avantisWalletUsdc}
          onSettingsChange={handleAvantisSmartWalletSettingsChange}
          onSetup={handleAvantisSmartWalletSetup}
          onFund={handleAvantisSmartWalletFund}
          onRecheck={handleAvantisSmartWalletRecheck}
          onRevoke={handleAvantisSmartWalletRevoke}
          onClose={() => resolveAvantisSmartWalletSetup(null)}
        />
      )}

      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        targetChain={shopChain === 'arbitrum' || shopChain === 'monad' || shopChain === 'ink' ? shopChain : 'base'}
        onConnected={({ provider, address }) => {
          setLocalEvmWalletState({ provider, address });
          setEvmModalOpen(false);
          setShopNotice(`${AI_SHOP_CHAIN_OPTIONS.find((c) => c.id === shopChain)?.label || 'EVM'} wallet connected.`);
        }}
      />
    </div>
  );
}

// ── Parchment palette ────────────────────────────────────────────────
// Matches the Battle Shop / NFT panels: cream parchment `#fdf8e7` body,
// brown borders, gold accents, red close pill. Same visual language as
// the rest of the in-game UI so the AI panel doesn't feel like a
// foreign element.
// ── Top-up progress modal ────────────────────────────────────────────
// Bridge-modal pattern adapted for AI message purchases. Step rail
// (sign → confirm → credit) sits on top of the shop while a buy is in
// flight; flips to a success card when the server credits messages,
// or to an error card with the failure reason. zIndex 320 so it sits
// above both chat (80) and shop (90).
function fmtJobTime(value) {
  if (!value) return 'not scheduled';
  const d = new Date(`${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtJobMode(mode) {
  if (mode === 'auto_trade') return 'Auto trade';
  if (mode === 'ask_before_trade') return 'Ask first';
  return 'Monitor only';
}

function updateJobFormPolicy(form, key, value) {
  return { ...form, policy: { ...(form.policy || {}), [key]: value } };
}

function AiJobsModal({
  jobs, form, quota, dex, loading, busy, notice,
  onFormChange, onSaveDraft, onActivate, onRefresh, onPatch, onRunNow, onDelete, onClose,
}) {
  const isDecibel = dex === 'decibel';
  const symbolsText = Array.isArray(form.symbols) ? form.symbols.join(', ') : String(form.symbols || '');
  const setForm = (patch) => onFormChange((prev) => ({ ...prev, ...patch }));
  const setPolicy = (key, value) => onFormChange((prev) => updateJobFormPolicy(prev, key, value));

  return (
    <div style={styles.shopBackdrop}>
      <section style={{ ...styles.shopPanel, width: 'min(720px, calc(100vw - 24px))' }}>
        <header style={styles.shopHeader}>
          <div style={styles.shopHeaderLeft}>
            <div style={styles.shopHeaderTitle}>Hermes Jobs</div>
            <div style={styles.shopHeaderSub}>
              Scheduled Decibel checks spend 1 AI message per run. {quota ? `${quota.available_messages} messages available.` : ''}
            </div>
          </div>
          <div style={styles.shopHeaderRight}>
            <button type="button" style={styles.newChatToggle} onClick={onRefresh} disabled={loading}>Refresh</button>
            <button type="button" style={styles.close} onClick={onClose} aria-label="Close jobs">×</button>
          </div>
        </header>
        <div className="shop-scroll" style={{ ...styles.shopBody, gap: 12 }}>
          {!isDecibel && <div style={styles.error}>Scheduled jobs are enabled for Decibel accounts first.</div>}
          <div style={styles.jobsGrid}>
            <div style={styles.jobsColumn}>
              <div style={styles.jobsSectionTitle}>Active jobs</div>
              {loading ? (
                <div style={styles.jobsEmpty}>Loading jobs...</div>
              ) : jobs.length ? jobs.map((job) => (
                <div key={job.id} style={styles.jobCard}>
                  <div style={styles.jobCardTop}>
                    <div>
                      <div style={styles.jobName}>{job.name}</div>
                      <div style={styles.jobMeta}>{fmtJobMode(job.mode)} · every {job.interval_minutes}m · {job.status}</div>
                    </div>
                    <span style={{ ...styles.jobStatus, ...(job.status === 'active' ? styles.jobStatusActive : null), ...(job.status === 'quota_blocked' ? styles.jobStatusBlocked : null) }}>{job.status}</span>
                  </div>
                  <div style={styles.jobInstruction}>{job.instruction}</div>
                  <div style={styles.jobFacts}>
                    <span>{(job.symbols || []).join(', ') || 'markets unset'}</span>
                    <span>Next: {fmtJobTime(job.next_run_at)}</span>
                    <span>Used: {job.messages_used || 0}</span>
                  </div>
                  {job.last_summary && <div style={styles.jobSummary}>{job.last_summary}</div>}
                  {job.last_error && <div style={styles.jobError}>{job.last_error}</div>}
                  <div style={styles.jobActions}>
                    {job.status === 'active' ? (
                      <button type="button" style={styles.jobSmallButton} disabled={!!busy} onClick={() => onPatch(job.id, { ...job, status: 'paused' })}>Pause</button>
                    ) : (
                      <button type="button" style={styles.jobSmallButton} disabled={!!busy} onClick={() => onPatch(job.id, { ...job, status: 'active' })}>Resume</button>
                    )}
                    <button type="button" style={styles.jobSmallButton} disabled={!!busy} onClick={() => onRunNow(job.id)}>Run now</button>
                    <button type="button" style={styles.jobDangerButton} disabled={!!busy} onClick={() => onDelete(job.id)}>Delete</button>
                  </div>
                </div>
              )) : (
                <div style={styles.jobsEmpty}>No jobs yet. Create a watcher on the right.</div>
              )}
            </div>
            <div style={styles.jobsColumn}>
              <div style={styles.jobsSectionTitle}>Create watcher</div>
              <label style={styles.jobLabel}>Name
                <input style={styles.jobInput} value={form.name} onChange={(e) => setForm({ name: e.target.value })} />
              </label>
              <label style={styles.jobLabel}>Instruction
                <textarea className="shop-scroll" style={{ ...styles.jobInput, minHeight: 78, resize: 'vertical' }} value={form.instruction} onChange={(e) => setForm({ instruction: e.target.value })} />
              </label>
              <label style={styles.jobLabel}>Symbols
                <input style={styles.jobInput} value={symbolsText} onChange={(e) => setForm({ symbols: e.target.value.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean) })} />
              </label>
              <div style={styles.jobSegment}>
                {[
                  ['monitor_only', 'Monitor'],
                  ['ask_before_trade', 'Ask first'],
                  ['auto_trade', 'Auto'],
                ].map(([id, label]) => (
                  <button key={id} type="button" style={{ ...styles.jobSegmentButton, ...(form.mode === id ? styles.jobSegmentActive : null) }} onClick={() => setForm({ mode: id })}>{label}</button>
                ))}
              </div>
              <label style={styles.jobLabel}>Interval: {form.interval_minutes}m
                <input type="range" min="0" max={HERMES_JOB_INTERVALS.length - 1} step="1" value={Math.max(0, HERMES_JOB_INTERVALS.indexOf(Number(form.interval_minutes)))} onChange={(e) => setForm({ interval_minutes: HERMES_JOB_INTERVALS[Number(e.target.value)] || 60 })} />
              </label>
              <label style={styles.jobLabel}>Max runs/day: {form.max_runs_per_day}
                <input type="range" min="1" max="24" value={form.max_runs_per_day} onChange={(e) => setForm({ max_runs_per_day: Number(e.target.value) })} />
              </label>
              <div style={styles.jobFieldRow}>
                <label style={styles.jobLabel}>Timeframe
                  <select style={styles.jobInput} value={form.policy.scan_timeframe} onChange={(e) => setPolicy('scan_timeframe', e.target.value)}>
                    {HERMES_JOB_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                  </select>
                </label>
                <label style={styles.jobLabel}>Lookback
                  <input style={styles.jobInput} type="number" min="50" max="500" value={form.policy.lookback_candles} onChange={(e) => setPolicy('lookback_candles', Number(e.target.value))} />
                </label>
              </div>
              <label style={styles.jobLabel}>Max collateral: ${form.policy.max_collateral_usd}
                <input type="range" min="1" max="100" value={form.policy.max_collateral_usd} onChange={(e) => setPolicy('max_collateral_usd', Number(e.target.value))} />
              </label>
              <label style={styles.jobLabel}>Max leverage: {form.policy.max_leverage}x
                <input type="range" min="1" max="50" value={form.policy.max_leverage} onChange={(e) => setPolicy('max_leverage', Number(e.target.value))} />
              </label>
              <label style={styles.jobLabel}>Max trades/day: {form.policy.max_trades_per_day}
                <input type="range" min="0" max="6" value={form.policy.max_trades_per_day} onChange={(e) => setPolicy('max_trades_per_day', Number(e.target.value))} />
              </label>
              <div style={styles.jobActions}>
                <button type="button" style={styles.jobSmallButton} disabled={!isDecibel || !!busy} onClick={onSaveDraft}>Save draft</button>
                <button type="button" style={styles.shopToggle} disabled={!isDecibel || !!busy} onClick={onActivate}>Activate</button>
              </div>
            </div>
          </div>
          {notice && <div style={styles.shopNotice}>{notice}</div>}
        </div>
      </section>
    </div>
  );
}

function AiTopUpStatusModal({ flow, paymentLabel, onClose, onRetry }) {
  if (!flow) return null;
  const { status, product, granted, pass, error, failedAt } = flow;
  const isFinished = status === 'success' || status === 'error';
  const isWorking = !isFinished;

  const stepIndex = status === 'signing' ? 1
    : status === 'confirming' ? 2
    : status === 'crediting' ? 3
    : status === 'success' ? 4 : 0;
  const failedIndex = status === 'error'
    ? (failedAt === 'crediting' ? 3 : failedAt === 'confirming' ? 2 : 1)
    : 0;

  const stepState = (idx) => {
    if (status === 'success') return 'done';
    if (status === 'error') {
      if (idx < failedIndex) return 'done';
      if (idx === failedIndex) return 'error';
      return 'pending';
    }
    if (idx < stepIndex) return 'done';
    if (idx === stepIndex) return 'active';
    return 'pending';
  };

  const steps = [
    { idx: 1, label: 'Approve in wallet',     hint: `Sign ${paymentLabel} payment` },
    { idx: 2, label: 'Confirming on chain',   hint: 'Waiting for block confirmation' },
    { idx: 3, label: 'Crediting AI messages', hint: 'Server is granting your quota' },
  ];

  const title = status === 'success'
    ? (pass ? 'Lifetime Pass activated' : 'Messages credited')
    : status === 'error' ? 'Purchase failed'
    : 'Processing your purchase…';

  return (
    <div
      style={topUpStyles.overlay}
      onClick={isWorking ? undefined : onClose}
      role="dialog" aria-modal="true"
    >
      <div style={topUpStyles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={topUpStyles.header}>
          <span style={topUpStyles.title}>{title}</span>
          {isFinished && (
            <button type="button" onClick={onClose} style={topUpStyles.closeBtn} aria-label="Close">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div style={topUpStyles.body}>
          {/* Step rail — same look + state machine as the bridge modal */}
          <ol style={topUpStyles.stepList}>
            {steps.map((step) => {
              const st = stepState(step.idx);
              return (
                <li key={step.idx} style={topUpStyles.stepItem}>
                  <span style={{ ...topUpStyles.stepBubble, ...topUpStyles[`stepBubble_${st}`] }}>
                    {st === 'done'    ? '✓'
                    : st === 'error'  ? '!'
                    : st === 'active' ? <span className="hermes-step-spinner" style={topUpStyles.spinner} />
                    : step.idx}
                  </span>
                  <span style={topUpStyles.stepText}>
                    <span style={{ ...topUpStyles.stepLabel, ...topUpStyles[`stepLabel_${st}`] }}>
                      {step.label}
                    </span>
                    <span style={topUpStyles.stepHint}>{step.hint}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          {status === 'success' && (
            <div style={topUpStyles.successBox}>
              <div style={topUpStyles.successHeadline}>
                {pass ? 'Lifetime AI Pass active' : `${granted} AI messages added`}
              </div>
              <div style={topUpStyles.successSub}>
                {pass
                  ? `${pass.lifetime_daily_limit || 100} messages every day, forever.`
                  : product?.title || 'Ready for the next order.'}
              </div>
            </div>
          )}

          {status === 'error' && error && (
            <div style={topUpStyles.errorBox}>{error}</div>
          )}

          {isWorking && (
            <div style={topUpStyles.workingHint}>
              Keep this window open until all three steps finish.
            </div>
          )}
        </div>

        <div style={topUpStyles.footer}>
          {status === 'success' && (
            <button type="button" onClick={onClose} style={topUpStyles.primaryBtn}>
              Start chatting
            </button>
          )}
          {status === 'error' && (
            <>
              <button type="button" onClick={onClose} style={topUpStyles.secondaryBtn}>
                Close
              </button>
              <button type="button" onClick={onRetry} style={topUpStyles.primaryBtn}>
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shop modal ──────────────────────────────────────────────────────
// Standalone overlay that opens on top of the chat panel (or
// automatically on a 402 quota error). Earlier this was an embedded
// view inside the chat which duplicated the header quota line and
// shoved every selector into one cramped column — bad UX. Now it's a
// clean centered modal: one quota line in its own header, network
// chip + payment selector + product list in the body, single close X.
function AiConfirmDialog({ dialog, onCancel, onConfirm }) {
  if (!dialog) return null;
  return (
    <div style={topUpStyles.overlay} role="dialog" aria-modal="true" onClick={onCancel}>
      <div style={topUpStyles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={topUpStyles.header}>
          <span style={topUpStyles.title}>{dialog.title || 'Confirm action'}</span>
          <button type="button" onClick={onCancel} style={topUpStyles.closeBtn} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={topUpStyles.body}>
          {dialog.body && <div style={topUpStyles.pendingBox}>{dialog.body}</div>}
          {dialog.summary && (
            <div style={topUpStyles.resultBox}>
              <div style={topUpStyles.resultHeadline}>{dialog.summary}</div>
            </div>
          )}
        </div>
        <div style={topUpStyles.footer}>
          <button type="button" onClick={onCancel} style={topUpStyles.secondaryBtn}>
            {dialog.cancelText || 'Cancel'}
          </button>
          <button type="button" onClick={onConfirm} style={topUpStyles.primaryBtn}>
            {dialog.confirmText || 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvantisAgentPolicyControls({
  settings,
  basePolicy,
  effectivePolicy,
  walletUsdc,
  action,
  disabled,
  onChange,
}) {
  const maxPolicyLeverage = policyNumber(basePolicy, 'max_leverage');
  const maxPolicyCollateral = policyNumber(basePolicy, 'max_collateral_usd');
  const normalized = normalizeAvantisAiTradeSettings(settings, basePolicy);
  const walletBalance = Number(walletUsdc);
  const hasWalletBalance = Number.isFinite(walletBalance) && walletBalance >= 0;
  const policyError = avantisActionPolicyError(action, effectivePolicy, walletUsdc);
  const effectiveCollateral = effectivePolicy?.max_collateral_usd ?? 0;
  const effectiveNotional = effectivePolicy?.max_notional_usd ?? 0;
  const update = (patch) => {
    if (disabled) return;
    onChange?.({ ...normalized, ...patch });
  };

  return (
    <div style={topUpStyles.policyBox}>
      <div style={topUpStyles.policyHeader}>
        <div>
          <div style={topUpStyles.policyTitle}>Agent trade limits</div>
          <div style={topUpStyles.policySub}>These caps are saved in this browser and checked before the delegate signs.</div>
        </div>
        <div style={topUpStyles.policyPill}>
          max {formatAiUsd(effectiveCollateral)}
        </div>
      </div>

      <label style={topUpStyles.fieldBlock}>
        <span style={topUpStyles.fieldLabel}>Max leverage</span>
        <div style={topUpStyles.fieldRow}>
          <input
            type="range"
            min="1"
            max={maxPolicyLeverage}
            step="1"
            value={normalized.max_leverage}
            disabled={disabled}
            onChange={(e) => update({ max_leverage: e.target.value })}
            style={topUpStyles.range}
          />
          <input
            type="number"
            min="1"
            max={maxPolicyLeverage}
            step="1"
            value={normalized.max_leverage}
            disabled={disabled}
            onChange={(e) => update({ max_leverage: e.target.value })}
            style={topUpStyles.numberInput}
          />
          <span style={topUpStyles.unitText}>x</span>
        </div>
      </label>

      <div style={topUpStyles.fieldBlock}>
        <span style={topUpStyles.fieldLabel}>Max collateral per AI trade</span>
        <div style={topUpStyles.segmented}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => update({ collateral_limit_mode: 'percent' })}
            style={{
              ...topUpStyles.segmentButton,
              ...(normalized.collateral_limit_mode === 'percent' ? topUpStyles.segmentButtonActive : null),
            }}
          >
            % balance
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => update({ collateral_limit_mode: 'usdc' })}
            style={{
              ...topUpStyles.segmentButton,
              ...(normalized.collateral_limit_mode === 'usdc' ? topUpStyles.segmentButtonActive : null),
            }}
          >
            USDC cap
          </button>
        </div>

        {normalized.collateral_limit_mode === 'percent' ? (
          <div style={topUpStyles.fieldRow}>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={normalized.max_balance_pct}
              disabled={disabled}
              onChange={(e) => update({ max_balance_pct: e.target.value })}
              style={topUpStyles.range}
            />
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={normalized.max_balance_pct}
              disabled={disabled}
              onChange={(e) => update({ max_balance_pct: e.target.value })}
              style={topUpStyles.numberInput}
            />
            <span style={topUpStyles.unitText}>%</span>
          </div>
        ) : (
          <div style={topUpStyles.fieldRow}>
            <input
              type="range"
              min="1"
              max={maxPolicyCollateral}
              step="1"
              value={normalized.max_collateral_usd}
              disabled={disabled}
              onChange={(e) => update({ max_collateral_usd: e.target.value })}
              style={topUpStyles.range}
            />
            <input
              type="number"
              min="1"
              max={maxPolicyCollateral}
              step="1"
              value={normalized.max_collateral_usd}
              disabled={disabled}
              onChange={(e) => update({ max_collateral_usd: e.target.value })}
              style={topUpStyles.numberInput}
            />
            <span style={topUpStyles.unitText}>USDC</span>
          </div>
        )}
      </div>

      <div style={topUpStyles.policySummary}>
        Wallet: {hasWalletBalance ? formatAiUsd(walletBalance) : 'unknown'} · Effective cap: {formatAiUsd(effectiveCollateral)} collateral · Notional cap: {formatAiUsd(effectiveNotional)}
      </div>
      {policyError && (
        <div style={topUpStyles.errorBox}>
          Current action does not fit these limits: {policyError}
        </div>
      )}
    </div>
  );
}

function AvantisSmartWalletSetupModal({ flow, walletUsdc, onSettingsChange, onSetup, onFund, onRecheck, onRevoke, onClose }) {
  if (!flow) return null;
  const status = flow.status || {};
  const basePolicy = flow.base_policy || flow.policy || AVANTIS_BROWSER_POLICY_DEFAULTS;
  const settings = normalizeAvantisAiTradeSettings(flow.settings || flow.policy || AVANTIS_AI_TRADE_SETTINGS_DEFAULTS, basePolicy);
  const policy = effectiveAvantisPolicy(basePolicy, settings, walletUsdc ?? flow.wallet_usdc);
  const phase = flow.phase || 'idle';
  const busy = ['delegating', 'funding', 'checking', 'revoking'].includes(phase);
  const address = status.address || status.onchainDelegate || '';
  const active = !!status.active;
  const needsEth = active && (status.needsEth ?? status.needs_eth) !== false;
  const ready = active && !needsEth;
  const eth = Number(status.eth || 0);
  const expiryText = formatSmartWalletExpiry(status.validUntil || status.valid_until || flow.validUntil || flow.valid_until);
  const policyError = avantisActionPolicyError(flow.action, policy, walletUsdc ?? flow.wallet_usdc);
  const actionFitsPolicy = !policyError;

  const stepState = (idx) => {
    if (phase === 'error') return idx === 2 ? 'error' : (idx < 2 ? 'done' : 'pending');
    if (phase === 'revoked') return 'pending';
    if (ready) return 'done';
    if (idx === 1) return address ? 'done' : (phase === 'idle' ? 'active' : 'pending');
    if (idx === 2) return active ? 'done' : (phase === 'delegating' ? 'active' : 'pending');
    if (idx === 3) return active ? 'done' : (phase === 'delegating' ? 'active' : 'pending');
    if (idx === 4) {
      if (active && !needsEth) return 'done';
      if (active && needsEth) return phase === 'funding' || phase === 'checking' ? 'active' : 'error';
      return 'pending';
    }
    return 'pending';
  };

  const steps = [
    { idx: 1, label: 'Create delegate wallet', hint: `Saved in this browser ${expiryText}` },
    { idx: 2, label: 'Enable Avantis delegate', hint: 'EOA signs setDelegate on Base' },
    { idx: 3, label: 'Approve USDC trading', hint: 'EOA approves Avantis TradingStorage' },
    { idx: 4, label: 'Fund gas wallet', hint: 'Delegate needs Base ETH for gas' },
  ];

  const copyAddress = async () => {
    if (!address || typeof navigator === 'undefined') return;
    try { await navigator.clipboard?.writeText(address); } catch { /* clipboard unavailable */ }
  };

  const title = ready
    ? 'Avantis Smart Wallet ready'
    : needsEth ? 'Fund Avantis Smart Wallet'
    : phase === 'error' ? 'Smart Wallet setup needs attention'
    : 'Set up Avantis Smart Wallet';

  return (
    <div style={topUpStyles.overlay} role="dialog" aria-modal="true" onClick={busy ? undefined : onClose}>
      <div style={topUpStyles.panelWide} onClick={(e) => e.stopPropagation()}>
        <div style={topUpStyles.header}>
          <span style={topUpStyles.title}>{title}</span>
          {!busy && (
            <button type="button" onClick={onClose} style={topUpStyles.closeBtn} aria-label="Close">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div style={topUpStyles.body}>
          <ol style={topUpStyles.stepList}>
            {steps.map((step) => {
              const st = stepState(step.idx);
              return (
                <li key={step.idx} style={topUpStyles.stepItem}>
                  <span style={{ ...topUpStyles.stepBubble, ...topUpStyles[`stepBubble_${st}`] }}>
                    {st === 'done' ? 'OK'
                    : st === 'error' ? '!'
                    : st === 'active' ? <span className="hermes-step-spinner" style={topUpStyles.spinner} />
                    : step.idx}
                  </span>
                  <span style={topUpStyles.stepText}>
                    <span style={{ ...topUpStyles.stepLabel, ...topUpStyles[`stepLabel_${st}`] }}>
                      {step.label}
                    </span>
                    <span style={topUpStyles.stepHint}>{step.hint}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          <AvantisAgentPolicyControls
            settings={settings}
            basePolicy={basePolicy}
            effectivePolicy={policy}
            walletUsdc={walletUsdc ?? flow.wallet_usdc}
            action={flow.action}
            disabled={busy}
            onChange={onSettingsChange}
          />

          <div style={topUpStyles.infoGrid}>
            <div style={topUpStyles.infoCard}>
              <span style={topUpStyles.infoLabel}>Action</span>
              <span style={topUpStyles.infoValue}>{flow.summary || 'Avantis action'}</span>
            </div>
            <div style={topUpStyles.infoCard}>
              <span style={topUpStyles.infoLabel}>Policy</span>
              <span style={topUpStyles.infoValue}>
                {formatAiUsd(policy.max_collateral_usd)} collateral, {policy.max_leverage}x, {formatAiUsd(policy.max_notional_usd)} notional
              </span>
            </div>
            <div style={topUpStyles.infoCard}>
              <span style={topUpStyles.infoLabel}>Delegate wallet</span>
              <span style={topUpStyles.monoRow}>
                <span style={topUpStyles.resultMono}>{address ? shortEvmAddress(address, 8, 6) : 'created during setup'}</span>
                {address && <button type="button" onClick={copyAddress} style={topUpStyles.miniBtn}>Copy</button>}
              </span>
            </div>
            <div style={topUpStyles.infoCard}>
              <span style={topUpStyles.infoLabel}>Gas balance</span>
              <span style={topUpStyles.infoValue}>{eth.toFixed(6)} ETH on Base</span>
            </div>
          </div>

          <div style={topUpStyles.pendingBox}>
            Your USDC stays in your EOA wallet. The delegate key is saved in this browser profile {expiryText}, so reloads and new tabs keep auto-trading available. It is never sent to Clash servers. Use Revoke to disable it on-chain.
          </div>

          {needsEth && (
            <div style={topUpStyles.errorBox}>
              Send Base ETH to the delegate wallet before auto-trading. 0.001 ETH is enough for testing several Base transactions.
            </div>
          )}
          {flow.error && <div style={topUpStyles.errorBox}>{flow.error}</div>}
        </div>
        <div style={topUpStyles.footer}>
          <button type="button" onClick={onClose} disabled={busy} style={topUpStyles.secondaryBtn}>
            Close
          </button>
          {active && (
            <button type="button" onClick={onRevoke} disabled={busy} style={topUpStyles.secondaryBtn}>
              Revoke
            </button>
          )}
          {active && (
            <button type="button" onClick={onRecheck} disabled={busy} style={topUpStyles.secondaryBtn}>
              Recheck
            </button>
          )}
          {active && needsEth && (
            <button type="button" onClick={onFund} disabled={busy || !actionFitsPolicy} style={{ ...topUpStyles.primaryBtn, ...((busy || !actionFitsPolicy) ? topUpStyles.disabledBtn : null) }}>
              Fund 0.001 ETH
            </button>
          )}
          {!ready && !active && (
            <button type="button" onClick={onSetup} disabled={busy || !actionFitsPolicy} style={{ ...topUpStyles.primaryBtn, ...((busy || !actionFitsPolicy) ? topUpStyles.disabledBtn : null) }}>
              Enable delegate
            </button>
          )}
          {ready && (
            <button type="button" onClick={onRecheck} disabled={busy || !actionFitsPolicy} style={{ ...topUpStyles.primaryBtn, ...((busy || !actionFitsPolicy) ? topUpStyles.disabledBtn : null) }}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AiShopModal({
  products,
  quota,
  chain,
  payment,
  payments,
  ready,
  loading,
  busy,
  notice,
  evmAddress,
  solAddress,
  aptosAddress,
  onPaymentChange,
  onBuy,
  onClose,
}) {
  const chainOption = AI_SHOP_CHAIN_OPTIONS.find((item) => item.id === chain) || { label: chain, sub: '' };
  const chainLabel = chainOption.label;
  const walletConnected = chain === 'solana'
    ? !!solAddress
    : chain === 'aptos'
      ? !!aptosAddress
      : !!evmAddress;
  const paymentLabel = aiPaymentLabel(chain, payment);

  return (
    <div
      style={styles.shopBackdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={styles.shopPanel} onClick={(e) => e.stopPropagation()}>
        <header style={styles.shopHeader}>
          <div style={styles.shopHeaderLeft}>
            <div style={styles.shopHeaderTitle}>Top up ClashHermes</div>
            <div style={styles.shopHeaderSub}>{formatQuotaLine(quota)}</div>
          </div>
          <div style={styles.shopHeaderRight}>
            {/* The previous "Base live / Offline" badge was visual noise —
                the Buy button already disables itself when the shop is
                offline, so the chip wasn't telling the player anything
                new. Dropped per design feedback. */}
            <button style={styles.close} onClick={onClose} aria-label="Close top-up shop">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="shop-scroll" style={styles.shopBody}>
          <AiQuotaSummary quota={quota} compact />

          {/* Payment selector — chips, no duplicate "Pay token" header
              since the chip set is self-explanatory. */}
          <div style={styles.shopPaymentGrid}>
            {payments.map((option) => {
              const active = option.id === payment;
              const logo = aiTokenLogo(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  style={{ ...styles.shopPaymentBtn, ...(active ? styles.shopPaymentBtnActive : null) }}
                  onClick={() => onPaymentChange(option.id)}
                >
                  <span style={styles.shopPaymentLogo}>
                    {logo
                      ? <img src={logo} alt={option.label} style={styles.shopPaymentLogoImg} />
                      : <span style={styles.shopPaymentLogoFallback}>{option.label?.charAt(0) || '?'}</span>}
                  </span>
                  <span style={styles.shopPaymentText}>
                    <span style={styles.shopPaymentLabel}>{option.label}</span>
                    <span style={styles.shopPaymentSub}>{option.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {notice && <div style={styles.shopNotice}>{notice}</div>}

          <div style={styles.aiProductList}>
            {loading && (
              <div style={styles.aiProductCard}>
                <div style={styles.aiProductTitle}>Loading packs…</div>
                <div style={styles.aiProductSub}>Checking available shop routes.</div>
              </div>
            )}
            {!loading && products.map((product) => {
              const isPack = product.kind === 'ai_messages';
              const paidWithClash = chain === 'solana' && payment === 'clash';
              const credits = paidWithClash && product.copBonusCredits ? product.copBonusCredits : product.messageCredits;
              const price = paidWithClash && (product.clashPriceUsd || product.copPriceUsd) ? (product.clashPriceUsd || product.copPriceUsd) : product.priceUsd;
              const isBusy = busy === product.id;
              const action = !walletConnected
                ? `Connect ${chainLabel}`
                : isBusy
                  ? 'Buying…'
                  : `Buy with ${paymentLabel}`;
              // Per-message effective cost so the player can compare
              // packs vs the lifetime plan at a glance ("$0.033/msg").
              const perMsg = isPack && credits > 0 ? (Number(price) / credits) : null;
              const dailyLimit = product.dailyLimit || 100;
              const cardStyle = isPack
                ? styles.aiProductCard
                : { ...styles.aiProductCard, ...styles.aiProductCardPremium };
              return (
                <div key={product.id} style={cardStyle}>
                  {!isPack && (
                    <div className="hermes-ribbon" style={styles.aiProductRibbon}>BEST VALUE</div>
                  )}
                  <div style={isPack ? styles.aiProductIconPack : styles.aiProductIconPro}>
                    {isPack ? (
                      // Scroll / message icon — three stacked lines on a
                      // parchment scroll glyph.
                      <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
                        <path d="M5 7c0-1.5 1-2 2-2h18c2 0 3 1.5 3 3v15c0 2-1.5 3-3 3H10c-2 0-3-1.5-3-3V8H5z" fill="#fff7df" stroke="#5C3A21" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M11 11h12M11 16h12M11 21h8" stroke="#5C3A21" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M5 7c0 1.5 1 2 2 2h2V5H7c-1 0-2 .5-2 2z" fill="#c2851b" stroke="#5C3A21" strokeWidth="2" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      // Crown with infinity — premium / lifetime.
                      <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                        <path d="M4 22l3-12 5 6 4-8 4 8 5-6 3 12z" fill="#FFD700" stroke="#5C3A21" strokeWidth="2" strokeLinejoin="round"/>
                        <rect x="4" y="22" width="24" height="4" rx="1" fill="#c2851b" stroke="#5C3A21" strokeWidth="2"/>
                        <circle cx="7" cy="9" r="1.4" fill="#fff" stroke="#5C3A21" strokeWidth="1.2"/>
                        <circle cx="16" cy="6"  r="1.6" fill="#fff" stroke="#5C3A21" strokeWidth="1.2"/>
                        <circle cx="25" cy="9" r="1.4" fill="#fff" stroke="#5C3A21" strokeWidth="1.2"/>
                      </svg>
                    )}
                  </div>

                  <div style={styles.aiProductInfo}>
                    <div style={styles.aiProductTitle}>{product.title}</div>
                    <div style={styles.aiProductSub}>{product.subtitle}</div>
                    <div style={styles.aiProductMeta}>
                      <span style={styles.aiProductPrice}>${price}</span>
                      <span style={styles.aiProductDot}>·</span>
                      {isPack ? (
                        <span style={styles.aiProductMetaMain}>{credits} messages</span>
                      ) : (
                        <span style={styles.aiProductMetaMain}>{dailyLimit}/day · forever</span>
                      )}
                      {isPack && perMsg != null && (
                        <span style={styles.aiProductPerMsg}>≈ ${perMsg.toFixed(3)}/msg</span>
                      )}
                    </div>
                  </div>

                  {/* Stack the CLASH-bonus chip directly above the Buy CTA
                      so it reads as a label on the action (not buried in
                      the price meta). When CLASH isn't selected the column
                      still holds the button as before. */}
                  <div style={styles.aiProductActionCol}>
                    {paidWithClash && (
                      <span style={styles.aiProductBonus}>
                        {isPack ? '+50% with CLASH' : '-$10 with CLASH'}
                      </span>
                    )}
                    <button
                      type="button"
                      style={{
                        ...styles.aiBuyBtn,
                        ...((ready && !busy) ? styles.aiBuyBtnReady : null),
                        ...(!isPack && ready && !busy ? styles.aiBuyBtnPremium : null),
                      }}
                      disabled={!ready || !!busy}
                      onClick={() => onBuy(product)}
                    >
                      {action}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 80,
    pointerEvents: 'auto',
    background: 'rgba(20, 12, 4, 0.55)',
    display: 'flex',
    // Bottom-center on desktop — sits above the action button row but
    // not stuck to either edge of the viewport. Mobile sheet inherits
    // alignItems: 'flex-end' so this matches its rest position too;
    // mobile-only `padding: 0` override (backdropMobile) keeps the
    // sheet hugging the screen edge.
    alignItems: 'flex-end',
    justifyContent: 'center',
    // 30px bottom clearance keeps the panel visually hugging the screen
    // edge — like the mobile bottom-sheet. Action buttons stay
    // clickable because the panel is narrower than the gap between the
    // bottom-left and bottom-right action clusters.
    padding: '16px 16px 30px',
  },
  panel: {
    width: 'min(420px, calc(100vw - 24px))',
    height: 'min(640px, calc(100vh - 32px))',
    background:
      'radial-gradient(120% 80% at 0% 0%, rgba(255,247,205,0.85) 0%, rgba(253,248,231,0) 55%),' +
      ' linear-gradient(180deg, #fdf8e7 0%, #f7ecc9 100%)',
    border: '2px solid #d4c8b0',
    borderRadius: 18,
    boxShadow:
      '0 24px 60px rgba(0,0,0,0.45),' +
      ' 0 2px 0 rgba(255,255,255,0.55) inset,' +
      ' 0 0 0 1px rgba(255,255,255,0.4) inset',
    color: '#5C3A21',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  // ── Mobile bottom-sheet overrides ─────────────────────────────────
  // backdrop anchors content to the BOTTOM so the sheet rises from the
  // bottom edge. Padding 0 so the sheet hugs the screen edges; rounded
  // top corners + flat bottom gives the bottom-sheet feel.
  backdropMobile: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: 0,
    background: 'rgba(20, 12, 4, 0.45)',
  },
  panelMobile: {
    width: '100%',
    // Bottom sheet at 42vh — 30% shorter than the original 60vh so the
    // player keeps more of the game (resources, map, bottom HUD) visible
    // while chatting. Accounts for iOS safe-area at the bottom via env()
    // so the composer doesn't sit under the home bar.
    height: '42vh',
    maxWidth: '100%',
    borderRadius: '16px 16px 0 0',
    borderBottom: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderTopWidth: 1,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  },
  // Tappable drag area at the very top of the mobile sheet — contains
  // the visible pill handle. Bigger than the pill so a fat finger can
  // start the drag reliably. `touch-action: none` so the browser
  // doesn't fight the gesture with native scroll.
  dragHandleArea: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3px 0 1px',
    cursor: 'grab',
    touchAction: 'none',
    background: 'transparent',
    flex: '0 0 auto',
  },
  dragHandle: {
    width: 40, height: 4,
    borderRadius: 3,
    background: 'linear-gradient(90deg, #bba882 0%, #d4c8b0 50%, #bba882 100%)',
    boxShadow: '0 1px 0 rgba(255,255,255,0.4)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '8px 12px 10px',
    // Subtle warm wash so the header reads as a distinct band above
    // the message stream — like a banner on parchment, not flat.
    background: 'linear-gradient(180deg, rgba(255,246,220,0.85) 0%, rgba(253,248,231,0) 100%)',
    borderBottom: '1px solid #e6dcc1',
    flex: '0 0 auto',
  },
  // Desktop-only header overrides — turn it into a drag handle with the
  // right cursor and disable text selection so click-drag works cleanly.
  headerDesktop: {
    padding: '8px 12px 10px',
    userSelect: 'none',
    touchAction: 'none',
  },
  // Avatar + title cluster on the left of the header. Avatar gets a
  // soft glow ring so the brand mark stands out against the parchment
  // wash without needing a heavy outline.
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    minWidth: 0,
  },
  brandAvatar: {
    width: 32, height: 32,
    minWidth: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fff6dc',
    boxShadow:
      '0 0 0 1.5px #d4c8b0,' +
      ' 0 0 0 4px rgba(255,215,0,0.18),' +
      ' 0 2px 4px rgba(95,58,33,0.18)',
    flexShrink: 0,
  },
  titleLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 6px 2px 5px',
    borderRadius: 999,
    background: 'rgba(76,175,80,0.14)',
    border: '1px solid rgba(76,175,80,0.35)',
    color: '#1B5E20',
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    lineHeight: 1,
  },
  statusDot: {
    display: 'inline-block',
    width: 6, height: 6,
    borderRadius: '50%',
    background: '#4caf50',
  },
  // Resize grip — sits in the bottom-right corner of the desktop panel.
  // Two diagonal stripes drawn with linear-gradient so it doesn't need
  // an SVG and stays crisp at any size. `cursor: nwse-resize` is the
  // standard "drag the corner to resize" affordance.
  resizeHandle: {
    position: 'absolute',
    right: 2, bottom: 2,
    width: 14, height: 14,
    cursor: 'nwse-resize',
    touchAction: 'none',
    background:
      'linear-gradient(135deg,' +
      ' transparent 0%, transparent 40%,' +
      ' #bba882 40%, #bba882 50%,' +
      ' transparent 50%, transparent 65%,' +
      ' #bba882 65%, #bba882 75%,' +
      ' transparent 75%, transparent 100%)',
    borderBottomRightRadius: 14,
    opacity: 0.7,
  },
  title: {
    fontSize: 15, fontWeight: 900, color: '#5C3A21',
    letterSpacing: 0.2,
    lineHeight: 1.1,
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
  },
  sub: {
    fontSize: 11, fontWeight: 800, color: '#1B5E20',
    textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2,
    display: 'inline-flex', alignItems: 'center', gap: 5,
  },
  onlineDot: {
    display: 'inline-block',
    width: 8, height: 8, borderRadius: '50%',
    background: '#4caf50',
    boxShadow: '0 0 6px rgba(76,175,80,0.7)',
  },
  close: {
    width: 22, height: 22, borderRadius: '50%',
    background: '#E53935', border: '1.5px solid #fff', color: '#fff',
    cursor: 'pointer', padding: 0,
    fontSize: 12, fontWeight: 900, lineHeight: '20px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  titleBlock: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  quotaSummary: {
    margin: '10px 14px 0',
    padding: '8px 10px',
    borderRadius: 12,
    border: '1px solid #d7c49a',
    background: 'linear-gradient(180deg, #fff7df 0%, #f6e8bf 100%)',
    boxShadow: '0 1px 3px rgba(95,58,33,0.10), inset 0 1px 0 rgba(255,255,255,0.55)',
    flex: '0 0 auto',
  },
  quotaSummaryCompact: {
    margin: 0,
  },
  quotaSummaryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 7,
  },
  quotaSummaryTitle: {
    fontSize: 11,
    fontWeight: 900,
    color: '#5C3A21',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  quotaSummaryTotal: {
    fontSize: 11,
    fontWeight: 900,
    color: '#1B5E20',
    whiteSpace: 'nowrap',
  },
  quotaStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(82px, 1fr))',
    gap: 6,
  },
  quotaStat: {
    minWidth: 0,
    padding: '6px 7px',
    borderRadius: 9,
    border: '1px solid rgba(139,107,63,0.22)',
    background: 'rgba(255,250,240,0.72)',
  },
  quotaStatStrong: {
    border: '1px solid rgba(31,109,52,0.35)',
    background: 'rgba(225,246,211,0.72)',
  },
  quotaStatLabel: {
    display: 'block',
    fontSize: 9,
    fontWeight: 850,
    color: '#8b6b3f',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  quotaStatValue: {
    display: 'block',
    marginTop: 2,
    fontSize: 13,
    fontWeight: 950,
    color: '#3a1f00',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  shopToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1.5px solid #b88a26',
    borderRadius: 10,
    background: 'linear-gradient(180deg, #fff2c2 0%, #d99d27 100%)',
    color: '#3a1f00',
    padding: '6px 11px 6px 9px',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: '0 2px 5px rgba(194,133,27,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
    transition: 'transform 120ms ease, box-shadow 120ms ease',
  },

  // ── Shop modal (separate overlay above the chat panel) ───────────
  // Centered modal with parchment palette + cream body. The chat
  // backdrop sits at zIndex 80 so this layer sits above it.
  newChatToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1.5px solid #9f8b66',
    borderRadius: 10,
    background: 'linear-gradient(180deg, #fffaf0 0%, #e2d4a8 100%)',
    color: '#4b351c',
    padding: '6px 10px 6px 8px',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.25,
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(95,58,33,0.16), inset 0 1px 0 rgba(255,255,255,0.55)',
    transition: 'transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
    whiteSpace: 'nowrap',
  },
  newChatToggleMobile: {
    padding: '6px 9px',
  },
  headerButtonDisabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  shopBackdrop: {
    position: 'fixed', inset: 0,
    zIndex: 90,
    background: 'rgba(20, 12, 4, 0.55)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    pointerEvents: 'auto',
  },
  shopPanel: {
    width: 'min(460px, calc(100vw - 24px))',
    maxHeight: 'min(640px, calc(100vh - 32px))',
    background:
      'radial-gradient(120% 80% at 0% 0%, rgba(255,247,205,0.85) 0%, rgba(253,248,231,0) 55%),' +
      ' linear-gradient(180deg, #fdf8e7 0%, #f7ecc9 100%)',
    border: '2px solid #d4c8b0',
    borderRadius: 18,
    boxShadow:
      '0 28px 60px rgba(0,0,0,0.55),' +
      ' 0 2px 0 rgba(255,255,255,0.55) inset',
    color: '#5C3A21',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  shopHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '12px 14px 12px',
    borderBottom: '1px solid #e6dcc1',
    background:
      'linear-gradient(180deg, rgba(255,246,220,0.95) 0%, rgba(255,246,220,0.55) 100%)',
    flex: '0 0 auto',
  },
  shopHeaderLeft: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
  },
  shopHeaderRight: {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
  },
  shopHeaderTitle: {
    fontSize: 15, fontWeight: 900, color: '#5C3A21',
    lineHeight: 1.1, letterSpacing: 0.2,
  },
  shopHeaderSub: {
    fontSize: 11, fontWeight: 700, color: '#8b6b3f',
    lineHeight: 1.2,
  },
  shopBody: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fdf8e7',
  },
  shopToggleActive: {
    background: 'linear-gradient(180deg, #c4f4ff 0%, #4ca5d2 100%)',
    border: '1px solid #377d9f',
    color: '#07324a',
  },
  mobileTopBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '4px 12px 7px',
    borderBottom: '1px solid #e6dcc1',
    flex: '0 0 auto',
  },
  mobileHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  shopView: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fdf8e7',
  },
  shopSummary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 10,
    background: '#fff6dc',
    border: '1px solid #d4c8b0',
  },
  shopSummaryTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: '#5C3A21',
  },
  shopSummarySub: {
    fontSize: 11,
    fontWeight: 800,
    color: '#1B5E20',
    marginTop: 2,
  },
  shopReadyBadge: {
    padding: '5px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 900,
    color: '#7a1f1c',
    background: '#fdecea',
    border: '1px solid #e8a39f',
    whiteSpace: 'nowrap',
  },
  shopReadyBadgeOn: {
    color: '#145a1f',
    background: '#e4f8dc',
    border: '1px solid #8ecf84',
  },
  shopSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  shopSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '0 2px',
    fontSize: 10,
    fontWeight: 900,
    color: '#8b6b3f',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  shopChainRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))',
    gap: 6,
  },
  shopChainRowSingle: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 6,
  },
  shopChainBtn: {
    border: '1px solid #d4c8b0',
    borderRadius: 9,
    background: '#fff9e9',
    color: '#5C3A21',
    padding: '7px 6px',
    cursor: 'pointer',
    textAlign: 'left',
    minWidth: 0,
  },
  shopChainBtnActive: {
    background: 'linear-gradient(180deg, #dff5ff 0%, #9fd7ee 100%)',
    border: '1px solid #377d9f',
  },
  shopChainLocked: {
    cursor: 'default',
  },
  shopChainLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  shopChainSub: {
    display: 'block',
    marginTop: 2,
    fontSize: 9,
    fontWeight: 800,
    color: '#8b6b3f',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  shopPaymentRow: {
    display: 'flex',
    gap: 6,
    overflowX: 'auto',
    paddingBottom: 1,
  },
  shopPaymentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(74px, 1fr))',
    gap: 6,
  },
  shopPaymentBtn: {
    minWidth: 62,
    border: '1.5px solid #d4c8b0',
    borderRadius: 11,
    background: '#fffaf0',
    color: '#5C3A21',
    padding: '7px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'transform 0.12s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
    boxShadow: '0 1px 2px rgba(95,58,33,0.05)',
  },
  shopPaymentBtnActive: {
    background: 'linear-gradient(180deg, #fff2c2 0%, #ffd76a 100%)',
    border: '1.5px solid #c2851b',
    boxShadow:
      '0 2px 6px rgba(194,133,27,0.30),' +
      ' 0 0 0 3px rgba(255,215,0,0.18),' +
      ' inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  // Per-token icon circle on the left side of each payment chip — same
  // approach as NftMintPanel.optionBadge so token icons all read
  // with their familiar brand glyphs instead of bare text.
  shopPaymentLogo: {
    width: 24, height: 24,
    minWidth: 24,
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: 'transparent',
  },
  shopPaymentLogoImg: {
    width: '100%', height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
  },
  shopPaymentLogoFallback: {
    fontSize: 11, fontWeight: 900, color: '#5C3A21',
  },
  shopPaymentText: {
    display: 'flex', flexDirection: 'column', minWidth: 0,
    textAlign: 'left',
  },
  shopPaymentLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 900,
  },
  shopPaymentSub: {
    display: 'block',
    fontSize: 9,
    fontWeight: 800,
    color: '#8b6b3f',
  },
  shopNotice: {
    color: '#5C3A21',
    background: '#fff2c2',
    border: '1px solid #d7a536',
    borderRadius: 9,
    padding: '7px 9px',
    fontSize: 12,
    fontWeight: 800,
  },
  jobsGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 0.95fr)',
    gap: 12,
  },
  jobsColumn: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  jobsSectionTitle: {
    fontSize: 11,
    fontWeight: 950,
    color: '#8b6b3f',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  jobsEmpty: {
    border: '1px dashed #d4c8b0',
    borderRadius: 10,
    padding: 12,
    color: '#8b6b3f',
    fontSize: 12,
    fontWeight: 800,
    background: 'rgba(255,250,240,0.58)',
  },
  jobCard: {
    border: '1px solid #d4c8b0',
    borderRadius: 12,
    padding: 10,
    background: 'linear-gradient(180deg, #fffaf0 0%, #fff2d4 100%)',
    boxShadow: '0 1px 3px rgba(95,58,33,0.10)',
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  jobCardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  jobName: {
    fontSize: 13,
    fontWeight: 950,
    color: '#3a1f00',
  },
  jobMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: 800,
    color: '#8b6b3f',
  },
  jobStatus: {
    flexShrink: 0,
    borderRadius: 999,
    border: '1px solid #d4c8b0',
    background: '#f7ecc9',
    color: '#6b4a20',
    padding: '3px 7px',
    fontSize: 9,
    fontWeight: 950,
    textTransform: 'uppercase',
  },
  jobStatusActive: {
    border: '1px solid #8ecf84',
    background: '#e4f8dc',
    color: '#145a1f',
  },
  jobStatusBlocked: {
    border: '1px solid #e8a39f',
    background: '#fdecea',
    color: '#7a1f1c',
  },
  jobInstruction: {
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 750,
    color: '#5C3A21',
  },
  jobFacts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    fontSize: 10,
    fontWeight: 850,
    color: '#8b6b3f',
  },
  jobSummary: {
    borderRadius: 8,
    background: '#fff6dc',
    border: '1px solid rgba(139,107,63,0.2)',
    padding: '6px 7px',
    fontSize: 11,
    fontWeight: 750,
    color: '#5C3A21',
  },
  jobError: {
    borderRadius: 8,
    background: '#fdecea',
    border: '1px solid #e8a39f',
    padding: '6px 7px',
    fontSize: 11,
    fontWeight: 850,
    color: '#7a1f1c',
  },
  jobActions: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  jobSmallButton: {
    border: '1px solid #bba882',
    borderRadius: 9,
    background: 'linear-gradient(180deg, #fffaf0 0%, #e2d4a8 100%)',
    color: '#4b351c',
    padding: '6px 9px',
    fontSize: 10,
    fontWeight: 900,
    cursor: 'pointer',
  },
  jobDangerButton: {
    border: '1px solid #b23b32',
    borderRadius: 9,
    background: 'linear-gradient(180deg, #ff8d83 0%, #d9342c 100%)',
    color: '#fff',
    padding: '6px 9px',
    fontSize: 10,
    fontWeight: 900,
    cursor: 'pointer',
  },
  jobLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 10,
    fontWeight: 900,
    color: '#8b6b3f',
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  jobInput: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #d4c8b0',
    borderRadius: 9,
    background: '#fffaf0',
    color: '#3a1f00',
    padding: '8px 9px',
    fontSize: 12,
    fontWeight: 750,
    outline: 'none',
    textTransform: 'none',
  },
  jobFieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  jobSegment: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
  },
  jobSegmentButton: {
    border: '1px solid #d4c8b0',
    borderRadius: 9,
    background: '#fffaf0',
    color: '#5C3A21',
    padding: '7px 6px',
    fontSize: 10,
    fontWeight: 900,
    cursor: 'pointer',
  },
  jobSegmentActive: {
    border: '1px solid #377d9f',
    background: 'linear-gradient(180deg, #dff5ff 0%, #9fd7ee 100%)',
    color: '#07324a',
  },
  aiProductList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  // Product cards — single-line layout: icon | (title + sub + meta) | buy
  // button. Default card is the "starter" (pack); the premium variant
  // adds a gold background, ribbon, and a glowing CTA so it visually
  // sells itself as the better deal.
  aiProductCard: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '52px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 12,
    padding: '12px 13px',
    borderRadius: 14,
    border: '1.5px solid #d4c8b0',
    background: 'linear-gradient(180deg, #fffaf0 0%, #fff2d4 100%)',
    boxShadow:
      '0 2px 6px rgba(95,58,33,0.08),' +
      ' inset 0 1px 0 rgba(255,255,255,0.55)',
  },
  // Premium card — stronger gold halo + warmer border so it visibly
  // out-weighs the starter pack at a glance. The halo size grows with
  // the card (0/0/0 + 4px) so the eye lands here first.
  aiProductCardPremium: {
    border: '2px solid #c2851b',
    background:
      'linear-gradient(180deg, #fff2c2 0%, #ffd76a 100%)',
    boxShadow:
      '0 6px 18px rgba(194,133,27,0.32),' +
      ' 0 0 0 4px rgba(255,215,0,0.22),' +
      ' inset 0 1px 0 rgba(255,255,255,0.6)',
  },
  aiProductRibbon: {
    position: 'absolute',
    top: -8, right: 12,
    padding: '3px 8px',
    fontSize: 9,
    fontWeight: 900,
    color: '#3a1f00',
    background: 'linear-gradient(180deg, #fff2c2 0%, #ffd76a 100%)',
    border: '1.5px solid #5C3A21',
    borderRadius: 6,
    letterSpacing: 0.6,
    boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
  },

  // Two icon container variants share the same shape but different
  // palettes: blue for the entry pack, gold for the premium.
  aiProductIconPack: {
    width: 48, height: 48,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, #fff6dc 0%, #ead9b2 100%)',
    border: '2px solid #9f8759',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 3px rgba(0,0,0,0.1)',
    flexShrink: 0,
  },
  aiProductIconPro: {
    width: 48, height: 48,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, #fff7c2 0%, #ffd049 100%)',
    border: '2px solid #c2851b',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 5px rgba(194,133,27,0.4)',
    flexShrink: 0,
  },

  aiProductInfo: { minWidth: 0 },
  aiProductTitle: {
    fontSize: 14, fontWeight: 900, color: '#5C3A21', lineHeight: 1.2,
  },
  aiProductSub: {
    fontSize: 11, fontWeight: 700, color: '#7a5a30',
    marginTop: 2, lineHeight: 1.35,
  },
  aiProductMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 6,
    fontSize: 11,
    fontWeight: 800,
    color: '#5C3A21',
  },
  aiProductPrice: {
    fontSize: 15,
    fontWeight: 900,
    color: '#1B5E20',
    textShadow: '0 1px 0 rgba(255,255,255,0.4)',
  },
  aiProductDot: { color: '#bba882', fontWeight: 900 },
  aiProductMetaMain: { color: '#5C3A21' },
  aiProductPerMsg: {
    fontSize: 10, fontWeight: 700,
    color: '#8b6b3f',
    fontStyle: 'italic',
  },
  aiProductBonus: {
    padding: '2px 6px',
    borderRadius: 6,
    background: '#1B5E20',
    color: '#fff7df',
    fontSize: 9.5,
    fontWeight: 900,
    letterSpacing: 0.3,
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },

  // Column that stacks the optional CLASH-bonus chip on top of the Buy
  // CTA — pulls the bonus closer to the action instead of leaving it
  // hidden in the price meta on the left side of the card.
  aiProductActionCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 5,
  },
  aiBuyBtn: {
    border: '1.5px solid #9d7a31',
    borderRadius: 10,
    background: '#e8dcc1',
    color: '#6b5630',
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
    letterSpacing: 0.3,
    minWidth: 102,
  },
  aiBuyBtnReady: {
    cursor: 'pointer',
    color: '#fff',
    border: '2px solid #1f6d34',
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    textShadow: '0 1px 1px rgba(0,0,0,0.4)',
    boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.4)',
  },
  // Premium CTA — same green base but with a warmer halo so the
  // "best value" card's button has more visual weight than the pack's.
  aiBuyBtnPremium: {
    boxShadow:
      '0 3px 8px rgba(0,0,0,0.25),' +
      ' 0 0 0 3px rgba(255,215,0,0.28),' +
      ' inset 0 1px 0 rgba(255,255,255,0.5)',
  },
  messages: {
    flex: 1, minHeight: 0,
    padding: 14,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fdf8e7',
  },
  bubble: {
    padding: '8px 12px',
    border: '1px solid #d4c8b0',
    lineHeight: 1.45,
    boxShadow:
      '0 1px 2px rgba(95,58,33,0.08),' +
      ' inset 0 1px 0 rgba(255,255,255,0.45)',
    minWidth: 0,
  },
  userBubble: {
    // Gold-on-gold gradient mirrors the "primary action" tone used on
    // mint/list buttons elsewhere — feels like the player's own voice.
    // Asymmetric bottom-right corner gives the bubble a "speech tail"
    // anchored to the right edge.
    background: 'linear-gradient(180deg, #fff2c2 0%, #ffd76a 100%)',
    border: '1px solid #c2851b',
    color: '#3a1f00',
    borderRadius: '14px 14px 4px 14px',
  },
  aiBubble: {
    // Cream parchment with a hairline darker bottom edge — the
    // asymmetric bottom-left corner mirrors the user bubble's tail so
    // the two voices read as opposite halves of the same conversation.
    background: 'linear-gradient(180deg, #fffaee 0%, #fff2cf 100%)',
    color: '#5C3A21',
    borderRadius: '14px 14px 14px 4px',
  },
  role: {
    fontSize: 10, color: '#8b6b3f', fontWeight: 900,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
  },
  text: { fontSize: 13, fontWeight: 600, whiteSpace: 'pre-wrap' },
  meta: { fontSize: 10, color: '#9f8759', marginTop: 6, fontStyle: 'italic' },
  error: {
    margin: '0 12px 8px',
    color: '#7a1f1c',
    background: '#fdecea',
    border: '1px solid #E53935',
    borderRadius: 8,
    padding: '6px 9px',
    fontSize: 12, fontWeight: 700,
  },
  composer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    padding: '10px 12px 12px',
    // Soft gradient fade into the message stream so the composer reads
    // as floating above the content, not as a hard band stuck to the
    // bottom edge.
    background:
      'linear-gradient(180deg, rgba(245,236,210,0) 0%, #f5ecd2 30%, #ead9b2 100%)',
    borderTop: '1px solid #e6dcc1',
    flex: '0 0 auto',
  },
  // Pill wrapper around the textarea — owns the border, background and
  // shadow so the textarea itself can stay transparent. Active state
  // adds a gold ring + lift so the player sees the input is "armed".
  inputWrap: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'stretch',
    background: '#fffaf0',
    border: '1.5px solid #d4c8b0',
    borderRadius: 14,
    padding: '0 4px 0 12px',
    boxShadow:
      'inset 0 1px 2px rgba(95,58,33,0.08),' +
      ' 0 1px 0 rgba(255,255,255,0.6)',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  },
  inputWrapActive: {
    // Use the full `border` shorthand here so React doesn't warn about
    // mixing shorthand (base) + longhand (active) during re-render.
    border: '1.5px solid #c2851b',
    boxShadow:
      'inset 0 1px 2px rgba(95,58,33,0.06),' +
      ' 0 0 0 3px rgba(194,133,27,0.18)',
  },
  input: {
    flex: 1,
    resize: 'none',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    color: '#3a2810',
    padding: '9px 4px 9px 0',
    outline: 'none',
    fontSize: 13.5,
    fontFamily: 'inherit',
    lineHeight: 1.45,
    minWidth: 0,
    minHeight: 40,
    maxHeight: 120,
    overflowY: 'auto',
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fffaf0',
    height: 40,
  },
  send: {
    width: 44, height: 44,
    minWidth: 44,
    padding: 0,
    border: '1.5px solid #1f6d34',
    borderRadius: 12,
    // Disabled / resting tone keeps the green identity but flattens
    // it; the `.hermes-send-glow:not(:disabled)` rule and sendReady
    // override paint the live glow.
    background: 'linear-gradient(180deg, #b8e6a5 0%, #5fb466 100%)',
    color: '#fff',
    cursor: 'pointer',
    boxShadow:
      '0 2px 4px rgba(0,0,0,0.18),' +
      ' inset 0 1px 0 rgba(255,255,255,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendReady: {
    background: 'linear-gradient(180deg, #91df7d 0%, #2f8b3a 100%)',
    // Full shorthand again — base has `border: '1.5px solid #1f6d34'`,
    // mixing shorthand + longhand makes React warn on transitions.
    border: '1.5px solid #1f6d34',
  },

  // ── Welcome / empty state ─────────────────────────────────────────
  // Shown on first open: a soft card explaining who Hermes is + three
  // one-tap starter chips. Replaces the lone "Ready when you are."
  // bubble that used to leave the chat feeling lifeless on launch.
  welcomeCard: {
    alignSelf: 'center',
    margin: '6px 4px 2px',
    padding: '14px 14px 12px',
    borderRadius: 16,
    border: '1.5px solid #e2d4a8',
    background:
      'radial-gradient(120% 80% at 50% 0%, #fff7d9 0%, #fdf3c8 50%, #f5e9b8 100%)',
    boxShadow:
      '0 3px 10px rgba(95,58,33,0.10),' +
      ' inset 0 1px 0 rgba(255,255,255,0.6)',
    textAlign: 'center',
    width: '100%',
    maxWidth: 420,
    boxSizing: 'border-box',
  },
  welcomeMark: {
    margin: '0 auto 6px',
    width: 56, height: 56,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fff6dc',
    boxShadow:
      '0 0 0 2px #d4c8b0,' +
      ' 0 0 0 6px rgba(255,215,0,0.18),' +
      ' 0 3px 6px rgba(95,58,33,0.2)',
  },
  welcomeTitle: {
    fontSize: 15,
    fontWeight: 900,
    color: '#5C3A21',
    letterSpacing: 0.3,
    margin: '4px 0 4px',
  },
  welcomeSub: {
    fontSize: 11.5,
    fontWeight: 600,
    color: '#7a5a30',
    lineHeight: 1.45,
    margin: '0 4px 10px',
  },
  starterChips: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 6,
    marginTop: 4,
  },
  starterChip: {
    appearance: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    border: '1.5px solid #d4c8b0',
    background: '#fffaf0',
    borderRadius: 11,
    padding: '8px 10px',
    color: '#5C3A21',
    fontFamily: 'inherit',
    boxShadow: '0 1px 2px rgba(95,58,33,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  starterChipLabel: {
    fontSize: 10,
    fontWeight: 900,
    color: '#c2851b',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  starterChipText: {
    fontSize: 12,
    fontWeight: 700,
    color: '#5C3A21',
    lineHeight: 1.35,
  },

  // ── Bubble row (avatar + bubble) ──────────────────────────────────
  // Assistant rows lead with a small Hermes avatar so each AI line
  // carries the brand mark. User rows are right-aligned with no avatar.
  bubbleRowAi: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 7,
    alignSelf: 'flex-start',
    maxWidth: '95%',
  },
  bubbleRowUser: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    maxWidth: '86%',
  },
  bubbleAvatar: {
    width: 26, height: 26,
    minWidth: 26,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fff6dc',
    boxShadow:
      '0 0 0 1px #d4c8b0,' +
      ' 0 1px 2px rgba(95,58,33,0.18)',
    marginBottom: 2,
    flexShrink: 0,
  },

  // Thinking row — typing dots + status text inline so the player sees
  // motion the entire time the agent is working.
  thinkingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  typingDots: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
  },
  typingDot: {
    display: 'inline-block',
    width: 5, height: 5,
    borderRadius: '50%',
    background: '#8b6b3f',
    willChange: 'transform, opacity',
  },
};

// ── Top-up status modal styles ───────────────────────────────────────
// Mirrors NftBridgePanel's modalStyles so the AI purchase flow feels
// like the same family of progress modals across the app. Parchment
// palette, identical step-rail look, parchment scrollbar on the body.
const topUpStyles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(20, 12, 4, 0.55)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 320, pointerEvents: 'all', padding: 16,
  },
  panel: {
    width: 380, maxWidth: '100%', maxHeight: '88vh',
    background: '#fdf8e7',
    border: '5px solid #d4c8b0', borderRadius: 18,
    boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'inherit', overflow: 'hidden',
  },
  panelWide: {
    width: 460, maxWidth: '100%', maxHeight: '88vh',
    background: '#fdf8e7',
    border: '5px solid #d4c8b0', borderRadius: 18,
    boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'inherit', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px',
    background: '#d4c8b0', borderBottom: '3px solid #bba882',
  },
  title: { fontSize: 16, fontWeight: 900, color: '#5C3A21' },
  closeBtn: {
    width: 26, height: 26, borderRadius: '50%',
    background: '#E53935', border: '2px solid #fff', color: '#fff',
    cursor: 'pointer', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  body: {
    padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
    overflowY: 'auto',
    scrollbarWidth: 'thin', scrollbarColor: '#bba882 #fdf8e7',
  },

  stepList: {
    listStyle: 'none', margin: 0, padding: 0,
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  stepItem: { display: 'flex', alignItems: 'center', gap: 10 },
  stepBubble: {
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, flexShrink: 0,
    background: '#e8dfc8', color: '#9f8759', border: '2px solid #d4c8b0',
    transition: 'background 0.2s, border-color 0.2s',
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
  stepText: { display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 },
  stepLabel: { fontSize: 13, fontWeight: 800, color: '#7a5a30' },
  stepLabel_active: { color: '#5C3A21' },
  stepLabel_done:   { color: '#5C3A21' },
  stepLabel_error:  { color: '#b71c1c' },
  stepLabel_pending: {},
  stepHint: { fontSize: 11, color: '#9f8759', fontWeight: 700 },

  // Spinner inside the "active" step bubble — same look as the bridge
  // modal's, driven by the local `.hermes-step-spinner` class.
  spinner: {
    width: 12, height: 12, borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'rgba(92,58,33,0.25)',
    borderTopColor: '#5C3A21',
    display: 'inline-block',
  },

  successBox: {
    position: 'relative',
    padding: '14px 12px', borderRadius: 12,
    background: 'linear-gradient(180deg, #f1fbe5 0%, #d9efc0 100%)',
    border: '2px solid #7db85a', color: '#1f3e0a',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 4, overflow: 'visible',
    textAlign: 'center',
  },
  successHeadline: {
    fontSize: 16, fontWeight: 900, color: '#1B5E20',
    textShadow: '0 1px 0 rgba(255,255,255,0.5)',
  },
  successSub: { fontSize: 12, fontWeight: 700, color: '#3a6320' },

  resultBox: {
    padding: '10px 12px', borderRadius: 12,
    background: '#fff6dc', border: '2px solid #d4c8b0',
    color: '#5C3A21',
  },
  resultHeadline: {
    fontSize: 13, fontWeight: 900, color: '#5C3A21', lineHeight: 1.35,
  },
  resultMono: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 12, fontWeight: 800, color: '#3a2810',
  },

  pendingBox: {
    padding: '9px 10px', borderRadius: 10,
    background: '#fffaf0', border: '2px solid #d4c8b0',
    color: '#6d4b23', fontSize: 12, fontWeight: 700, lineHeight: 1.35,
  },

  policyBox: {
    padding: '11px 12px',
    borderRadius: 12,
    background: 'linear-gradient(180deg, #fffaf0 0%, #fff2cf 100%)',
    border: '2px solid #d4c8b0',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  policyHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  policyTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: '#5C3A21',
  },
  policySub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: 700,
    color: '#8b6b3f',
    lineHeight: 1.35,
  },
  policyPill: {
    padding: '4px 8px',
    borderRadius: 999,
    background: '#1B5E20',
    color: '#fff7df',
    fontSize: 10,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  fieldBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 900,
    color: '#c2851b',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 76px auto',
    alignItems: 'center',
    gap: 8,
  },
  range: {
    width: '100%',
    accentColor: '#c2851b',
  },
  numberInput: {
    width: '100%',
    boxSizing: 'border-box',
    border: '2px solid #d4c8b0',
    borderRadius: 8,
    background: '#fffaf0',
    color: '#3a2810',
    padding: '6px 7px',
    fontSize: 12,
    fontWeight: 900,
    outline: 'none',
  },
  unitText: {
    fontSize: 11,
    fontWeight: 900,
    color: '#5C3A21',
  },
  segmented: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
  },
  segmentButton: {
    border: '2px solid #d4c8b0',
    borderRadius: 9,
    background: '#fffaf0',
    color: '#7a5a30',
    padding: '7px 8px',
    fontSize: 11,
    fontWeight: 900,
    cursor: 'pointer',
  },
  segmentButtonActive: {
    border: '2px solid #c2851b',
    background: 'linear-gradient(180deg, #fff2c2 0%, #ffd76a 100%)',
    color: '#3a1f00',
  },
  policySummary: {
    padding: '7px 9px',
    borderRadius: 9,
    background: 'rgba(255,250,240,0.72)',
    border: '1px solid rgba(139,107,63,0.22)',
    color: '#6d4b23',
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.35,
  },

  errorBox: {
    padding: '8px 10px', borderRadius: 10,
    background: '#fdecea', border: '2px solid #E53935', color: '#7a1f1c',
    fontSize: 12, fontWeight: 700,
  },

  infoGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
  },
  infoCard: {
    padding: '9px 10px', borderRadius: 10,
    background: '#fffaf0', border: '2px solid #d4c8b0',
    display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0,
  },
  infoLabel: {
    fontSize: 10, fontWeight: 900, color: '#c2851b',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 12, fontWeight: 800, color: '#5C3A21',
    lineHeight: 1.3, overflowWrap: 'anywhere',
  },
  monoRow: {
    display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
  },
  miniBtn: {
    padding: '4px 7px', borderRadius: 7, fontSize: 10, fontWeight: 900,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer', flexShrink: 0,
  },

  workingHint: {
    fontSize: 11, color: '#7a5a30', fontStyle: 'italic', textAlign: 'center',
  },

  footer: {
    display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
    padding: '10px 14px',
    borderTop: '3px solid #d4c8b0', background: '#f5ecd2',
  },
  primaryBtn: {
    padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 900,
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    border: '2px solid #1f6d34', color: '#fff',
    cursor: 'pointer',
    textShadow: '0 1px 1px rgba(0,0,0,0.35)',
  },
  disabledBtn: {
    opacity: 0.55,
    cursor: 'not-allowed',
    filter: 'grayscale(0.25)',
  },
  secondaryBtn: {
    padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer',
  },
};

export default memo(AiChatPanel);
