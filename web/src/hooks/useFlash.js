import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import * as anchor from '@coral-xyz/anchor';
import { GPLSESSION_PROGRAMS, SessionTokenManager } from '@magicblock-labs/gum-sdk';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import {
  clearFlashOneTapAgent,
  getFlashOneTapAgent,
  getOrCreateFlashOneTapAgent,
  markFlashOneTapAgent,
} from '../lib/flashOneTap';
import {
  createSolanaConnection,
  createSolanaFallbackConnection,
  selectFreshSolanaRpcUrl,
  SOLANA_RPC_URLS,
  SAME_ORIGIN_SOLANA_ALCHEMY_URL,
  SAME_ORIGIN_SOLANA_RPC_URL,
  solanaRpcFallbackUrls,
  solanaRpcHost,
} from '../lib/solanaRpc';
import {
  buildSolanaWalletTxOptions,
  isSolanaMobileWalletAdapter,
  solanaWalletAdapterName as mobileSolanaWalletAdapterName,
} from '../lib/solanaSeekerTx';

const FUTURES_API = '/api/futures';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const POLL_MS = 60_000;
const FLASH_WS_INTERVAL_MS = 1000;
const FLASH_DEFAULT_V2_RPC = 'https://flash.magicblock.xyz';
const FLASH_V2_PROGRAM_ID = 'FTv2RxXarPfNta45HTTMVaGvjzsGg27FXJ3hEKWBhrzV';
const FLASH_DELEGATION_PROGRAM_ID = 'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh';
const FLASH_ONE_TAP_EXPIRY_MINUTES = Math.max(10, Math.min(24 * 60, Number(import.meta.env.VITE_FLASH_ONE_TAP_EXPIRY_MINUTES || 24 * 60)));
const FLASH_ONE_TAP_TOPUP_LAMPORTS = Math.max(0, Math.min(20_000_000, Number(import.meta.env.VITE_FLASH_ONE_TAP_TOPUP_LAMPORTS || 0)));
const FLASH_ONE_TAP_MIN_VALID_SECONDS = 60;
const FLASH_REQUIRE_ONE_TAP_TRADING = import.meta.env.VITE_FLASH_REQUIRE_ONE_TAP_TRADING !== 'false';
const FLASH_CONFIRM_ATTEMPTS = Math.max(30, Math.min(120, Number(import.meta.env.VITE_FLASH_CONFIRM_ATTEMPTS || 75)));
const FLASH_DUST_POSITION_USD = Math.max(0.01, Math.min(1, Number(import.meta.env.VITE_FLASH_DUST_POSITION_USD || 0.10)));
const FLASH_DUST_COLLATERAL_USD = Math.max(0, Math.min(0.05, Number(import.meta.env.VITE_FLASH_DUST_COLLATERAL_USD || 0.01)));
const FLASH_SOLANA_RPC_URLS = [
  SAME_ORIGIN_SOLANA_ALCHEMY_URL,
  SAME_ORIGIN_SOLANA_RPC_URL,
  ...SOLANA_RPC_URLS,
].filter((url, index, list) => url && list.indexOf(url) === index);
const FLASH_ONE_TAP_DISABLED = {
  enabled: false,
  approved: false,
  delegated: false,
  publicKey: '',
  signer: '',
  sessionToken: '',
  setupSignature: '',
  validUntil: 0,
  required: FLASH_REQUIRE_ONE_TAP_TRADING,
};

const FLASH_PROGRAM_ERROR_MESSAGES = {
  6020: 'Flash rejected the order because price moved beyond the allowed slippage. Refresh the quote and try again.',
  6021: 'Flash rejected the order because leverage is above the market leverage cap. Lower leverage and retry.',
  6022: 'Flash rejected this order because leverage is above the market initial leverage cap. Lower leverage and retry.',
  6023: 'Flash rejected the order because leverage is below the market minimum.',
  6031: 'Flash does not allow this action for the market right now.',
  6033: 'This Flash market is in close-only mode. You can close positions, but not open new ones.',
  6034: 'Flash rejected the order because collateral is below the market minimum. Increase margin and retry.',
  6046: 'Flash rejected this wallet for access rules on this market.',
  6049: 'Flash rejected the stop-loss price. Check the SL level and retry.',
  6050: 'Flash rejected the take-profit price. Check the TP level and retry.',
  6051: 'Flash rejected the order because market exposure limit was reached.',
  6054: 'Flash rejected the order because the open-order limit was reached.',
  6057: 'Flash rejected the limit price. Check the price and retry.',
  6064: 'Flash rejected the order because initial leverage is below the market minimum.',
  6065: 'Flash rejected the order because the position size is too small.',
  6078: 'Insufficient Flash balance for this operation.',
  6079: 'Insufficient Flash available balance. Deposited funds minus open positions/orders are not enough for this trade. Reduce margin or close/cancel existing exposure.',
  6081: 'Flash rejected the order because the account has too many open orders.',
  6083: 'Flash could not find this order. Refresh positions/orders and try again.',
  6084: 'Flash rejected the order because the limit price condition is not met.',
  6085: 'Flash rejected the order because collateral is insufficient for the position.',
  6086: 'Flash rejected the order because max position size was exceeded.',
  6087: 'Flash rejected the order because max exposure was exceeded.',
  6090: 'Flash rejected the order because the trigger price condition is not met.',
};

function playerToken(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const detail = data?.detail || data?.data?.detail || data?.data?.error || data?.data?.message || data?.message || '';
    const base = data?.error || `Flash request failed (${res.status})`;
    const err = new Error(detail && detail !== base ? `${base}: ${detail}` : (base || detail));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.markets)) return payload.markets;
  if (payload && typeof payload === 'object') return Object.values(payload).filter(v => v && typeof v === 'object');
  return [];
}

function flashSessionLabel(session) {
  const text = String(session || '').trim();
  if (!text) return 'unknown session';
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function flashSessionAllowsTrade(session) {
  const key = String(session || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!key) return true;
  return !['closed', 'halted', 'paused', 'suspended'].includes(key);
}

function flashMarketUnavailableMessage(symbol, market = {}) {
  const marketSession = market.market_session || market.marketSession || market.session || '';
  if (market.trade_init_allowed === false || market.tradeInitAllowed === false) {
    return `${normalizeSymbol(symbol)} is not accepting new Flash positions right now.`;
  }
  return `${normalizeSymbol(symbol)} is not open for Flash trading right now (${flashSessionLabel(market.market_status || marketSession)}).`;
}

function flashMarketCanOpen(market = {}) {
  if (!market || typeof market !== 'object') return true;
  if (market.trade_init_allowed === false || market.tradeInitAllowed === false) return false;
  const session = market.market_session || market.marketSession || market.session || '';
  const sessionAllowsTrade = flashSessionAllowsTrade(session);
  if (!sessionAllowsTrade) return false;
  if ((market.is_market_open === false || market.isMarketOpen === false) && !session) return false;
  return true;
}

function solanaAddress(wallet) {
  return wallet?.publicKey?.toBase58?.() || '';
}

function publicKeyText(value) {
  try {
    if (!value) return '';
    return new PublicKey(value).toBase58();
  } catch {
    return '';
  }
}

function disabledFlashOneTapState(patch = {}) {
  return { ...FLASH_ONE_TAP_DISABLED, ...patch };
}

function flashOneTapState(agent, patch = {}) {
  const publicKey = publicKeyText(agent?.publicKey);
  return {
    enabled: !!agent?.enabled,
    approved: !!agent?.enabled && !!agent?.delegated && !!agent?.sessionToken,
    delegated: !!agent?.delegated,
    publicKey,
    signer: publicKey,
    sessionToken: publicKeyText(agent?.sessionToken),
    setupSignature: agent?.setupSignature || '',
    validUntil: Number(agent?.validUntil || 0),
    required: FLASH_REQUIRE_ONE_TAP_TRADING,
    ...patch,
  };
}

function flashOneTapRequiredError() {
  return 'Flash one tap trading is required for Flash v2 trades. Press ENABLE on Flash one tap, sign the one-time session setup, then try the trade again.';
}

function extractSolanaSignatureFromError(error) {
  const candidates = [
    error?.signature,
    error?.txid,
    error?.transactionSignature,
    error?.data?.signature,
    error?.data?.txid,
    error?.message,
    String(error || ''),
  ];
  for (const candidate of candidates) {
    const text = String(candidate || '');
    const match = text.match(/\b[1-9A-HJ-NP-Za-km-z]{64,100}\b/u);
    if (match?.[0]) return match[0];
  }
  return '';
}

function flashOneTapIsUsable(agent, owner) {
  if (!agent?.enabled || !agent?.delegated || !agent?.keypair) return false;
  if (publicKeyText(agent.owner) !== publicKeyText(owner)) return false;
  if (!publicKeyText(agent.publicKey) || !publicKeyText(agent.sessionToken)) return false;
  if (agent.targetProgram && publicKeyText(agent.targetProgram) !== FLASH_V2_PROGRAM_ID) return false;
  try {
    if (publicKeyText(agent.sessionToken) !== flashSessionTokenPda(agent.publicKey, owner).toBase58()) return false;
  } catch {
    return false;
  }
  const validUntil = Number(agent.validUntil || 0);
  return validUntil > Math.ceil(Date.now() / 1000) + FLASH_ONE_TAP_MIN_VALID_SECONDS;
}

function flashSessionTokenPda(sessionSigner, owner) {
  const sessionProgram = GPLSESSION_PROGRAMS['mainnet-beta'];
  const [sessionToken] = PublicKey.findProgramAddressSync([
    Buffer.from('session_token_v2'),
    new PublicKey(FLASH_V2_PROGRAM_ID).toBuffer(),
    new PublicKey(sessionSigner).toBuffer(),
    new PublicKey(owner).toBuffer(),
  ], sessionProgram);
  return sessionToken;
}

function makeAnchorWallet(solWallet) {
  if (!solWallet?.publicKey || !solWallet?.signTransaction) return null;
  const signTransaction = solWallet.signTransaction.bind(solWallet);
  return {
    publicKey: solWallet.publicKey,
    signTransaction,
    signAllTransactions: solWallet.signAllTransactions
      ? solWallet.signAllTransactions.bind(solWallet)
      : async (transactions) => Promise.all(transactions.map(tx => signTransaction(tx))),
  };
}

function solWalletAdapterName(solWallet) {
  return String(
    solWallet?.wallet?.adapter?.name
    || solWallet?.wallet?.adapter?.constructor?.name
    || solWallet?.adapter?.name
    || '',
  );
}

function isPhantomSolWallet(solWallet) {
  const adapter = solWallet?.wallet?.adapter || solWallet?.adapter || {};
  const text = [
    solWalletAdapterName(solWallet),
    adapter?.url,
    adapter?.icon,
    adapter?.standardAdapter?.name,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  if (text.includes('phantom')) return true;
  try {
    const provider = typeof window !== 'undefined' ? window?.phantom?.solana : null;
    if (!provider?.isPhantom || !solWallet?.publicKey) return false;
    const providerKey = publicKeyText(provider.publicKey);
    return !providerKey || providerKey === publicKeyText(solWallet.publicKey);
  } catch {
    return false;
  }
}

function txRequiredSignerKeys(tx) {
  try {
    if (tx instanceof VersionedTransaction) {
      const count = tx.message?.header?.numRequiredSignatures || 0;
      return tx.message.staticAccountKeys.slice(0, count).map(key => key.toBase58());
    }
    if (typeof tx?.compileMessage === 'function') {
      const message = tx.compileMessage();
      const count = message?.header?.numRequiredSignatures || 0;
      return rows(message?.accountKeys).slice(0, count).map(key => key.toBase58()).filter(Boolean);
    }
    return (tx.signatures || []).map(row => row.publicKey?.toBase58?.()).filter(Boolean);
  } catch {
    return [];
  }
}

function demoteDuplicateSignerMetas(tx, signer) {
  const signerText = publicKeyText(signer);
  if (!signerText || !(tx instanceof Transaction)) return 0;
  let changed = 0;
  for (const ix of tx.instructions || []) {
    let seenSigner = false;
    for (const meta of ix.keys || []) {
      if (publicKeyText(meta?.pubkey) !== signerText) continue;
      if (!seenSigner) {
        seenSigner = true;
        continue;
      }
      if (meta.isSigner || meta.isWritable) changed += 1;
      meta.isSigner = false;
      meta.isWritable = false;
    }
  }
  return changed;
}

function normalizeSymbol(value) {
  return String(value || 'SOL').toUpperCase().replace(/[-/](PERP|USD|USDC)$/i, '').trim();
}

function normalizeOptionalSymbol(value) {
  const raw = String(value || '').trim();
  return raw ? normalizeSymbol(raw) : '';
}

function normalizeTradeType(side) {
  const s = String(side || '').toUpperCase();
  if (s === 'ASK' || s === 'SELL' || s === 'SHORT') return 'SHORT';
  if (s === 'SWAP') return 'SWAP';
  return 'LONG';
}

function flashPositionIdentity(pos = {}) {
  const symbol = normalizeOptionalSymbol(
    pos.marketSymbol
    || pos.market_symbol
    || pos.outputTokenSymbol
    || pos.output_token_symbol
    || pos.token
    || pos.symbol
    || pos.metric?.marketSymbol
    || pos.metric?.symbol
  );
  const tradeType = normalizeTradeType(
    pos.tradeType
    || pos.trade_type
    || pos.sideUi
    || pos.side
    || pos.direction
    || pos.metric?.sideUi
    || pos.metric?.side
  );
  return symbol ? `${symbol}:${tradeType}` : '';
}

function flashPositionKey(pos = {}) {
  return String(
    pos.positionKey
    || pos.position_key
    || pos.marketPubkey
    || pos.market_pubkey
    || pos.publicKey
    || pos.pubkey
    || pos.key
    || pos.address
    || flashPositionIdentity(pos)
    || ''
  ).trim();
}

function flashPositionSymbol(pos = {}) {
  return normalizeSymbol(
    pos.marketSymbol
    || pos.market_symbol
    || pos.outputTokenSymbol
    || pos.output_token_symbol
    || pos.token
    || pos.symbol
    || pos.metric?.marketSymbol
    || pos.metric?.symbol
    || pos.market
    || ''
  );
}

function flashPositionTradeType(pos = {}) {
  return normalizeTradeType(pos.tradeType || pos.trade_type || pos.sideUi || pos.side || pos.direction || pos.metric?.sideUi || pos.metric?.side || '');
}

function flashPositionCloseUsd(pos = {}, fallbackAmount) {
  const candidates = [
    pos.inputUsdUi,
    pos.input_usd_ui,
    pos.sizeUsd,
    pos.size_usd,
    pos.notionalUsd,
    pos.notional_usd,
    pos.positionUsd,
    pos.position_usd,
    pos.collateralUsd,
    pos.collateral_usd,
    pos.amountUsd,
    pos.amount_usd,
    fallbackAmount,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return String(n);
  }
  return '';
}

function normalizeFlashPosition(pos = {}) {
  const tradeType = flashPositionTradeType(pos);
  const symbol = flashPositionSymbol(pos);
  const positionKey = flashPositionIdentity({ ...pos, symbol, tradeType }) || flashPositionKey(pos);
  const notional = Number(
    pos.notional_usd
    ?? pos.notionalUsd
    ?? pos.size_usd
    ?? pos.sizeUsd
    ?? pos.sizeUsdUi
    ?? pos.position_usd
    ?? pos.positionUsd
    ?? 0
  );
  const collateral = Number(
    pos.collateralUsdUi
    ?? pos.collateral_usd_ui
    ?? pos.collateral_usd
    ?? pos.collateralUsd
    ?? pos.margin
    ?? pos.input_usd_ui
    ?? pos.inputUsdUi
    ?? 0
  );
  const entry = Number(pos.entry_price ?? pos.entryPrice ?? pos.avgEntryPrice ?? pos.averageEntryPrice ?? pos.price ?? 0);
  const amount = Number(pos.amount ?? pos.size ?? pos.tokenAmount ?? (entry > 0 && notional > 0 ? notional / entry : collateral || notional || 0));
  const isDust = !!pos?._flashDust
    || isFlashDustMetric(pos?.metric || {})
    || isFlashDustValues(notional, collateral, amount);
  const dustUsd = Number(pos._flashDustUsd ?? pos.sizeUsdUi ?? pos.inputUsdUi ?? notional);
  const providedLeverage = numberFromUi(pos.leverage);
  return {
    ...pos,
    symbol: symbol || pos.symbol,
    side: tradeType === 'SHORT' ? 'ask' : 'bid',
    tradeType,
    amount: String(Number.isFinite(amount) && amount > 0 ? amount : collateral || notional || 0),
    margin: String(Number.isFinite(collateral) && collateral > 0 ? collateral : 0),
    size_usd: Number.isFinite(notional) && notional > 0 ? notional : undefined,
    notional_usd: Number.isFinite(notional) && notional > 0 ? notional : Number(pos.notional_usd || 0),
    entry_price: entry || pos.entry_price,
    leverage: isDust ? undefined : (collateral > 0 && notional > 0 ? Math.round((notional / collateral) * 10) / 10 : (providedLeverage > 0 ? providedLeverage : undefined)),
    liquidation_price: isDust ? undefined : pos.liquidation_price,
    pnl_usd: isDust ? 0 : pos.pnl_usd,
    pnl_pct: isDust ? 0 : pos.pnl_pct,
    marketPubkey: pos.marketPubkey || pos.market_pubkey || '',
    positionKey,
    source: pos.source || 'flash_v2_basket',
    _flashDust: isDust,
    _flashDustUsd: isDust && Number.isFinite(dustUsd) ? dustUsd : pos._flashDustUsd,
    _flash: pos,
  };
}

function numberFromUi(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isFlashDustMetric(metric = {}) {
  const sizeUsd = numberFromUi(metric.sizeUsdUi ?? metric.size_usd_ui ?? metric.sizeUsd ?? metric.size_usd);
  const collateralUsd = numberFromUi(metric.collateralUsdUi ?? metric.collateral_usd_ui ?? metric.collateralUsd ?? metric.collateral_usd);
  const amount = numberFromUi(metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount);
  return isFlashDustValues(sizeUsd, collateralUsd, amount);
}

function isFlashDustValues(sizeUsdRaw, collateralUsdRaw, amountRaw) {
  const sizeUsd = numberFromUi(sizeUsdRaw);
  const collateralUsd = numberFromUi(collateralUsdRaw);
  const amount = numberFromUi(amountRaw);
  return sizeUsd > 0
    && sizeUsd < FLASH_DUST_POSITION_USD
    && collateralUsd <= FLASH_DUST_COLLATERAL_USD
    && amount <= 0.000001;
}

function isFlashDustPosition(pos = {}) {
  return !!pos?._flashDust || isFlashDustMetric(pos?.metric || pos);
}

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function flashPriceMap(priceRows = []) {
  return new Map(rows(priceRows).map(row => [
    normalizeSymbol(row?.symbol),
    Number(row?.price ?? row?.mark ?? row?.price_ui ?? row?.priceUi ?? 0),
  ]));
}

function displayLiquidationPrice({ side, entry, sizeUsd, collateralUsd, apiLiq }) {
  if (!(entry > 0) || !(sizeUsd > 0) || !(collateralUsd > 0)) return apiLiq || 0;
  const ratio = Math.max(0, Math.min(0.95, collateralUsd / sizeUsd)) * 0.92;
  const derived = side === 'SHORT' ? entry * (1 + ratio) : entry * (1 - ratio);
  if (!(derived > 0)) return apiLiq || 0;
  if (!(apiLiq > 0)) return derived;
  const apiDistanceRatio = Math.abs(apiLiq - entry) / entry;
  const expectedDistanceRatio = Math.abs(derived - entry) / entry;
  const distanceMismatch = expectedDistanceRatio > 0
    && Math.abs(apiDistanceRatio - expectedDistanceRatio) / expectedDistanceRatio > 0.35;
  if (side === 'LONG' && (apiLiq >= entry * 0.995 || distanceMismatch)) return derived;
  if (side === 'SHORT' && (apiLiq <= entry * 1.005 || distanceMismatch)) return derived;
  return apiLiq;
}

function rawFlashUsd(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

function flashMetricPnlView({ metric = {}, side, entry, mark, sizeUsd, amount, collateralUsd }) {
  const dir = side === 'SHORT' ? -1 : 1;
  const notional = sizeUsd > 0 ? sizeUsd : (entry > 0 && amount > 0 ? entry * amount : 0);
  const pnlWithoutFees = mark > 0 && entry > 0 && notional > 0
    ? ((mark - entry) / entry) * notional * dir
    : numberFromUi(metric.pnlWithoutFeeUsdUi ?? metric.pnlWithFeeUsdUi);
  const feesUsd = rawFlashUsd(metric.exitFeeUsd) + rawFlashUsd(metric.borrowFeeUsd);
  const pnlWithFees = pnlWithoutFees - feesUsd;
  return {
    pnlWithoutFees,
    pnlWithFees,
    pnlPctWithoutFees: collateralUsd > 0 ? (pnlWithoutFees / collateralUsd) * 100 : undefined,
    pnlPctWithFees: collateralUsd > 0 ? (pnlWithFees / collateralUsd) * 100 : undefined,
    feesUsd,
  };
}

const FLASH_METRIC_POSITIVE_FIELDS = new Set([
  'entryPriceUi',
  'sizeAmountUi',
  'sizeUsdUi',
  'collateralAmountUi',
  'collateralUsdUi',
  'liquidationPriceUi',
]);

function mergeFlashMetric(previous = {}, next = {}) {
  const merged = { ...(previous || {}) };
  for (const [key, value] of Object.entries(next || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (FLASH_METRIC_POSITIVE_FIELDS.has(key)) {
      const prev = numberFromUi(merged[key]);
      const incoming = numberFromUi(value);
      if (prev > 0 && !(incoming > 0)) continue;
    }
    merged[key] = value;
  }
  return merged;
}

function flashPositionLookupKeys(pos = {}) {
  const keys = new Set();
  const marketPubkey = String(pos.marketPubkey || pos.market_pubkey || '').trim();
  const positionKey = String(pos.positionKey || pos.position_key || '').trim();
  const identity = flashPositionIdentity(pos);
  const symbol = normalizeOptionalSymbol(pos.marketSymbol || pos.symbol || pos.metric?.marketSymbol || pos.metric?.symbol || '');
  const tradeType = normalizeTradeType(pos.tradeType || pos.side || pos.metric?.side || pos.metric?.sideUi || '');
  if (marketPubkey) keys.add(marketPubkey);
  if (positionKey) keys.add(positionKey);
  if (identity) keys.add(identity);
  if (symbol) {
    keys.add(symbol);
    keys.add(`${symbol}:${tradeType}`);
  }
  return [...keys].filter(Boolean);
}

function flashExistingPositionMap(existing = {}) {
  const map = new Map();
  for (const pos of rows(existing.positions)) {
    for (const key of flashPositionLookupKeys(pos)) {
      if (!map.has(key)) map.set(key, pos);
    }
  }
  return map;
}

function flashExistingPositionForMetric(existingMap, marketPubkey, metric = {}) {
  const symbol = normalizeOptionalSymbol(metric.marketSymbol || metric.symbol);
  const tradeType = normalizeTradeType(metric.side || metric.sideUi);
  return existingMap.get(marketPubkey)
    || existingMap.get(`${symbol}:${tradeType}`)
    || existingMap.get(symbol)
    || null;
}

function flashPositionMetricStorageKey(pos = {}) {
  return String(pos.marketPubkey || pos.market_pubkey || '').trim()
    || String(pos.positionKey || pos.position_key || '').trim()
    || flashPositionIdentity(pos)
    || flashPositionKey(pos);
}

function flashMetricMatchesPosition(metric = {}, marketPubkey = '', pos = {}) {
  const posKeys = new Set(flashPositionLookupKeys(pos));
  if (marketPubkey && posKeys.has(marketPubkey)) return true;
  const symbol = normalizeSymbol(metric.marketSymbol || metric.symbol || marketPubkey);
  const tradeType = normalizeTradeType(metric.side || metric.sideUi);
  return (symbol && tradeType && posKeys.has(`${symbol}:${tradeType}`))
    || (symbol && posKeys.has(symbol));
}

function flashMetricsWithExistingPositions(metrics = {}, existing = {}) {
  const combined = {};
  for (const pos of rows(existing.positions)) {
    const key = flashPositionMetricStorageKey(pos);
    if (key && pos?.metric && typeof pos.metric === 'object') {
      combined[key] = { ...pos.metric };
    }
  }
  for (const [marketPubkey, metric] of Object.entries(metrics || {})) {
    const existingPosition = rows(existing.positions).find(pos => flashMetricMatchesPosition(metric, marketPubkey, pos));
    if (!existingPosition) continue;
    const key = flashPositionMetricStorageKey(existingPosition);
    if (key) combined[key] = mergeFlashMetric(combined[key], metric);
  }
  return combined;
}

function flashPositionFromMetric(marketPubkey, metric = {}, priceRows = [], existingPosition = null) {
  const mergedMetric = mergeFlashMetric(existingPosition?.metric || {}, metric);
  metric = mergedMetric;
  const tradeType = normalizeTradeType(metric.side || metric.sideUi || existingPosition?.tradeType || existingPosition?.side);
  const symbol = normalizeSymbol(metric.marketSymbol || metric.symbol || existingPosition?.marketSymbol || existingPosition?.symbol || marketPubkey);
  const priceMap = flashPriceMap(priceRows);
  const collateralUsd = numberFromUi(metric.collateralUsdUi ?? existingPosition?.collateralUsdUi ?? existingPosition?.margin);
  const sizeUsd = numberFromUi(metric.sizeUsdUi ?? existingPosition?.sizeUsdUi ?? existingPosition?.size_usd);
  const entry = numberFromUi(metric.entryPriceUi ?? existingPosition?.entryPriceUi ?? existingPosition?.entry_price);
  const amount = numberFromUi(metric.sizeAmountUi ?? existingPosition?.sizeAmountUi ?? existingPosition?.amount);
  const mark = numberFromUi(priceMap.get(symbol) ?? existingPosition?.mark_price);
  const sizeAmountUi = metric.sizeAmountUi ?? existingPosition?.sizeAmountUi ?? existingPosition?.amount;
  const sizeUsdUi = metric.sizeUsdUi ?? existingPosition?.sizeUsdUi ?? existingPosition?.size_usd;
  const collateralUsdUi = metric.collateralUsdUi ?? existingPosition?.collateralUsdUi ?? existingPosition?.margin;
  const entryPriceUi = metric.entryPriceUi ?? existingPosition?.entryPriceUi ?? existingPosition?.entry_price;
  const liquidationPriceUi = metric.liquidationPriceUi ?? existingPosition?.liquidationPriceUi ?? existingPosition?.liquidation_price;
  const pnlView = flashMetricPnlView({ metric, side: tradeType, entry, mark, sizeUsd, amount, collateralUsd });
  const apiLiq = numberFromUi(metric.liquidationPriceUi);
  const leverage = numberFromUi(metric.leverageUi);
  const isDust = isFlashDustMetric(metric);
  const collateralLeverage = collateralUsd > 0 && sizeUsd > 0 ? sizeUsd / collateralUsd : 0;
  const existingLeverage = numberFromUi(existingPosition?.leverage);
  const displayLev = collateralLeverage > 0 ? collateralLeverage : existingLeverage;
  return {
    ...(existingPosition || {}),
    marketPubkey,
    marketSymbol: symbol,
    symbol,
    side: tradeType === 'SHORT' ? 'ask' : 'bid',
    side_label: tradeType.toLowerCase(),
    tradeType,
    collateralSymbol: metric.collateralSymbol || existingPosition?.collateralSymbol || 'USDC',
    entryPriceUi,
    entry_price: entry || entryPriceUi,
    mark_price: mark || undefined,
    sizeAmountUi,
    amount: sizeAmountUi,
    sizeUsdUi,
    size_usd: sizeUsd,
    notional_usd: sizeUsd,
    collateralUsdUi,
    margin: collateralUsdUi,
    pnlWithFeeUsdUi: metric.pnlWithFeeUsdUi,
    pnlWithoutFeeUsdUi: metric.pnlWithoutFeeUsdUi,
    pnl_usd: isDust ? 0 : pnlView.pnlWithoutFees,
    pnl_pct: isDust ? 0 : pnlView.pnlPctWithoutFees,
    pnl_without_fees_usd: isDust ? 0 : pnlView.pnlWithoutFees,
    pnl_without_fees_pct: isDust ? 0 : pnlView.pnlPctWithoutFees,
    pnl_with_fees_usd: isDust ? 0 : pnlView.pnlWithFees,
    pnl_with_fees_pct: isDust ? 0 : pnlView.pnlPctWithFees,
    flash_position_fees_usd: isDust ? 0 : pnlView.feesUsd,
    pnl_source: 'flash_mark_price_without_fees',
    liquidationPriceUi,
    liquidation_price: isDust ? undefined : (displayLiquidationPrice({ side: tradeType, entry, sizeUsd, collateralUsd, apiLiq }) || liquidationPriceUi),
    leverage: isDust ? undefined : (displayLev > 0 ? Math.round(displayLev * 10) / 10 : undefined),
    effective_leverage: Number.isFinite(leverage) && leverage > 0 ? leverage : undefined,
    inputUsdUi: sizeUsdUi,
    _flashDust: isDust,
    _flashDustUsd: isDust ? sizeUsd : undefined,
    positionKey: `${symbol}:${tradeType}`,
    source: existingPosition?.source || 'flash_v2_ws',
    metric,
  };
}

function flashOrderFromMetric(marketPubkey, metric = {}, parent = {}) {
  const tradeType = normalizeTradeType(metric.side || metric.sideUi || parent.side || parent.sideUi);
  const symbol = normalizeSymbol(metric.marketSymbol || metric.symbol || parent.marketSymbol || parent.symbol || marketPubkey);
  const triggerPriceUi = metric.triggerPriceUi ?? metric.trigger_price_ui;
  const limitPriceUi = metric.entryPriceUi ?? metric.entry_price_ui ?? metric.limitPriceUi ?? metric.limit_price_ui;
  return {
    ...metric,
    marketPubkey,
    marketSymbol: symbol,
    symbol,
    side: tradeType === 'SHORT' ? 'ask' : 'bid',
    tradeType,
    orderId: metric.orderId ?? metric.order_id ?? metric.id,
    order_id: metric.orderId ?? metric.order_id ?? metric.id,
    order_type: metric.order_type || metric.orderType || metric.type || (triggerPriceUi ? 'TRIGGER' : 'LIMIT'),
    type: metric.type || metric.order_type || metric.orderType || (triggerPriceUi ? 'TRIGGER' : 'LIMIT'),
    triggerPriceUi,
    trigger_price: triggerPriceUi,
    price: triggerPriceUi ?? limitPriceUi ?? metric.price,
    amount: metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount,
    initial_amount: metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount,
    _readOnly: true,
    source: 'flash_v2_ws',
  };
}

function flashOrdersFromMetricBundle(marketPubkey, metric = {}) {
  if (!metric || typeof metric !== 'object') return [];
  if (Array.isArray(metric)) return metric.flatMap(row => flashOrdersFromMetricBundle(marketPubkey, row));
  const rows = [];
  const pushRows = (items, type) => {
    for (const row of Array.isArray(items) ? items : []) {
      rows.push(flashOrderFromMetric(marketPubkey, { ...row, type: row?.type || type }, metric));
    }
  };
  pushRows(metric.limitOrders || metric.limit_orders, 'LIMIT');
  pushRows(metric.takeProfitOrders || metric.take_profit_orders, 'TP');
  pushRows(metric.stopLossOrders || metric.stop_loss_orders, 'SL');
  if (rows.length) return rows;
  return [flashOrderFromMetric(marketPubkey, metric)];
}

function normalizeFlashSnapshot(snapshot = {}, priceRows = [], existing = {}, options = {}) {
  const positionMetrics = snapshot.positionMetrics || {};
  const orderMetrics = snapshot.orderMetrics || {};
  const existingMap = flashExistingPositionMap(existing);
  const positions = Object.entries(positionMetrics).map(([marketPubkey, metric]) => (
    flashPositionFromMetric(marketPubkey, metric, priceRows, flashExistingPositionForMetric(existingMap, marketPubkey, metric))
  ));
  const activePositions = positions.filter(pos => !isFlashDustPosition(pos));
  const orders = Object.entries(orderMetrics).flatMap(([marketPubkey, metric]) => flashOrdersFromMetricBundle(marketPubkey, metric));
  const marginUsed = activePositions.reduce((sum, p) => sum + numberFromUi(p.collateralUsdUi), 0);
  const pnlUsd = activePositions.reduce((sum, p) => sum + numberFromUi(p.pnl_usd), 0);
  const explicitSnapshotUsdc = finiteNumberOrNull(
    snapshot.account_balance_usdc
    ?? snapshot.flash_usdc_balance
    ?? snapshot.available_to_withdraw
    ?? snapshot.withdrawable
    ?? snapshot.available_to_spend
  );
  const snapshotUsdc = explicitSnapshotUsdc;
  const existingUsdc = finiteNumberOrNull(
    existing.account_balance_usdc
    ?? existing.flash_usdc_balance
    ?? existing.available_to_withdraw
    ?? existing.withdrawable
    ?? existing.available_to_spend
  );
  const hasBalanceSource = options.preserveBalance !== true && snapshotUsdc != null;
  const accountUsdc = hasBalanceSource ? snapshotUsdc : (existingUsdc ?? 0);
  const hasAccountUsdc = hasBalanceSource || existingUsdc != null;
  const explicitAvailable = finiteNumberOrNull(
    snapshot.available_to_spend
    ?? snapshot.availableToSpend
    ?? snapshot.available_to_withdraw
    ?? snapshot.availableToWithdraw
    ?? snapshot.withdrawable
    ?? snapshot.free_margin
  );
  const existingAvailable = finiteNumberOrNull(
    existing.available_to_spend
    ?? existing.availableToSpend
    ?? existing.available_to_withdraw
    ?? existing.availableToWithdraw
    ?? existing.withdrawable
    ?? existing.free_margin
  );
  const derivedAvailable = Math.max(0, accountUsdc - marginUsed);
  const availableUsdc = Math.max(0, hasBalanceSource
    ? (explicitAvailable ?? derivedAvailable)
    : (hasAccountUsdc ? derivedAvailable : (existingAvailable ?? 0)));
  const explicitEquity = finiteNumberOrNull(snapshot.account_equity ?? snapshot.equity ?? snapshot.balance);
  const equity = Math.max(0, explicitEquity ?? (accountUsdc + pnlUsd));
  return {
    ...existing,
    ...snapshot,
    dex: 'flash',
    positions,
    orders,
    balance: equity,
    equity,
    account_equity: equity,
    flash_usdc_balance: accountUsdc,
    flash_in_basket_usdc: accountUsdc,
    account_balance_usdc: accountUsdc,
    flash_balance_source: hasBalanceSource
      ? (snapshot.flash_balance_source || 'flash_v2_snapshot')
      : (existing.flash_balance_source || 'preserved'),
    margin_used: marginUsed,
    total_margin_used: marginUsed,
    free_margin: availableUsdc,
    available_to_spend: availableUsdc,
    available_to_withdraw: availableUsdc,
    withdrawable: availableUsdc,
    total_position_size_usd: activePositions.reduce((sum, p) => sum + numberFromUi(p.sizeUsdUi), 0),
    positions_count: activePositions.length,
    dust_positions_count: positions.length - activePositions.length,
    orders_count: orders.length,
    source: snapshot.source || 'flash_v2_ws',
  };
}

function flashAvailableBalanceFromAccount(acct = {}) {
  const value = finiteNumberOrNull(
    acct.available_to_spend
    ?? acct.availableToSpend
    ?? acct.free_margin
    ?? acct.available_to_withdraw
    ?? acct.availableToWithdraw
    ?? acct.withdrawable
  );
  return value == null ? null : Math.max(0, value);
}

function flashWsUrl(apiUrl, owner) {
  const base = String(apiUrl || 'https://flashapi.trade').replace(/\/+$/, '');
  const wsBase = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  return `${wsBase}/v2/owner/${encodeURIComponent(owner)}/ws?updateIntervalMs=${FLASH_WS_INTERVAL_MS}`;
}

function base64ToBytes(value) {
  if (typeof atob === 'function') return Uint8Array.from(atob(String(value || '')), c => c.charCodeAt(0));
  return Uint8Array.from(Buffer.from(String(value || ''), 'base64'));
}

function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function decodeTransaction(base64) {
  const bytes = base64ToBytes(base64);
  try { return Transaction.from(bytes); } catch { return VersionedTransaction.deserialize(bytes); }
}

function txMessageSummary(tx) {
  try {
    if (tx instanceof VersionedTransaction) {
      return {
        kind: 'versioned',
        version: tx.version,
        required_signatures: tx.message?.header?.numRequiredSignatures || 0,
        static_accounts: tx.message?.staticAccountKeys?.length || 0,
        instructions: tx.message?.compiledInstructions?.length || 0,
        recent_blockhash: tx.message?.recentBlockhash || '',
      };
    }
    return {
      kind: 'legacy',
      required_signatures: tx.signatures?.length || 0,
      instructions: tx.instructions?.length || 0,
      fee_payer: tx.feePayer?.toBase58?.() || '',
      recent_blockhash: tx.recentBlockhash || '',
    };
  } catch (e) {
    return { kind: 'unknown', error: e?.message || String(e) };
  }
}

function flashSimulationLogs(value) {
  return Array.isArray(value?.logs) ? value.logs.slice(-12) : [];
}

function flashCustomErrorCode(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const hex = value.match(/custom program error:\s*0x([0-9a-f]+)/i);
    if (hex?.[1]) return parseInt(hex[1], 16);
    const custom = value.match(/\bCustom["']?\s*[:=]\s*(\d{4,})\b/i);
    if (custom?.[1]) return Number(custom[1]);
    const flashCode = value.match(/\b(60\d{2}|61\d{2})\b/);
    return flashCode?.[1] ? Number(flashCode[1]) : null;
  }
  if (Array.isArray(value)) {
    if (value.length >= 2) {
      const nested = flashCustomErrorCode(value[1]);
      if (nested != null) return nested;
    }
    for (const item of value) {
      const code = flashCustomErrorCode(item);
      if (code != null) return code;
    }
    return null;
  }
  if (typeof value === 'object') {
    if (Number.isFinite(Number(value.code)) && Number(value.code) > 0) return Number(value.code);
    if (Number.isFinite(Number(value.Custom))) return Number(value.Custom);
    if (Number.isFinite(Number(value.custom))) return Number(value.custom);
    if (value.InstructionError) return flashCustomErrorCode(value.InstructionError);
    if (value.instructionError) return flashCustomErrorCode(value.instructionError);
    for (const key of ['program_error', 'err', 'error', 'message', 'data']) {
      const code = flashCustomErrorCode(value[key]);
      if (code != null) return code;
    }
  }
  return null;
}

function flashProgramErrorMessage(err, fallback = 'Flash transaction failed', logs = [], status = null) {
  const serverProgramError = status?.program_error || status?.programError || null;
  const code = flashCustomErrorCode(serverProgramError) ?? flashCustomErrorCode(err) ?? flashCustomErrorCode(logs);
  if (code != null) {
    const serverMessage = serverProgramError?.message || serverProgramError?.msg || status?.error_message || status?.errorMessage || '';
    const message = FLASH_PROGRAM_ERROR_MESSAGES[code] || serverMessage || `Flash program error ${code}`;
    return `${fallback}: ${message} (code ${code})`;
  }
  const programError = logs.find(line => /custom program error|error|failed/i.test(String(line || '')));
  return `${fallback}${err ? `: ${JSON.stringify(err)}` : ''}${programError ? ` (${programError})` : ''}`;
}

function flashSimulationErrorMessage(value, fallback = 'Flash transaction simulation failed') {
  const err = value?.err;
  const logs = flashSimulationLogs(value);
  return flashProgramErrorMessage(err, fallback, logs, value);
}

async function simulateUnsignedLegacyTransaction(connection, tx, label = 'Flash transaction') {
  if (!(tx instanceof Transaction)) return null;
  const encoded = bytesToBase64(tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }));
  const config = {
    encoding: 'base64',
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: 'confirmed',
  };
  const args = [encoded, config];
  const payload = typeof connection?._rpcRequest === 'function'
    ? await connection._rpcRequest('simulateTransaction', args)
    : await fetch(connection?.rpcEndpoint || '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'simulateTransaction',
        params: args,
      }),
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) return { error: { message: `HTTP ${res.status}`, data } };
      return data;
    });
  if (payload?.error) {
    const error = new Error(`${label} simulation RPC failed: ${payload.error.message || 'unknown error'}`);
    error.data = payload.error;
    throw error;
  }
  const value = payload?.result?.value;
  console.info('[Flash one tap] setup pre-simulation', {
    err: value?.err || null,
    units_consumed: value?.unitsConsumed || null,
    logs: flashSimulationLogs(value),
  });
  if (value?.err) {
    const error = new Error(flashSimulationErrorMessage(value, `${label} simulation failed`));
    error.simulation = value;
    throw error;
  }
  return value;
}

function connectionRpcDiagnostics(connection) {
  try {
    return {
      endpoint: connection?.rpcEndpoint || '',
      host: solanaRpcHost(connection?.rpcEndpoint || ''),
    };
  } catch {
    return { endpoint: '', host: '' };
  }
}

function isFlashTradingTx(meta = {}) {
  return String(meta?.txKind || meta?.tx_kind || '').toLowerCase() === 'trading';
}

function shouldSkipFlashLocalSimulation(meta = {}) {
  const kind = String(meta?.txKind || meta?.tx_kind || '').toLowerCase();
  const endpoint = String(meta?.endpoint || meta?.route || meta?.builderEndpoint || '').toLowerCase();
  const builder = String(meta?.builder || '').toLowerCase();
  return kind === 'trading'
    || kind === 'setup'
    || /init-|deposit-direct|delegate-basket|request-withdrawal|execute-withdrawal/.test(endpoint)
    || /init-|deposit-direct|delegate-basket|request-withdrawal|execute-withdrawal/.test(builder);
}

function isWalletBlockedOrRejected(error) {
  const message = String(
    error?.message
    || error?.data?.message
    || error?.cause?.message
    || error
    || ''
  );
  return /user rejected|rejected the request|request blocked|blocked|denied|cancelled|canceled|danger|risk/i.test(message);
}

function isFlashMissingDelegationError(error) {
  let dataText = '';
  try {
    dataText = error?.data ? JSON.stringify(error.data) : '';
  } catch {
    dataText = '';
  }
  const message = [
    error?.message,
    error?.data?.detail,
    error?.data?.error,
    error?.data?.message,
    dataText,
    error,
  ].map(value => String(value || '')).join(' ');
  return /InvalidWritableAccount|illegally used as writable/i.test(message);
}

function flashUserError(error) {
  const message = String(error?.message || error?.data?.detail || error?.data?.error || error || '');
  const flashCode = flashCustomErrorCode(error?.data?.program_error || error?.data?.err || error?.data || message);
  if (flashCode != null) {
    const decoded = flashProgramErrorMessage(error?.data?.err || error?.data || message, '', error?.data?.logs || [], error?.data || null);
    return decoded.replace(/^Flash transaction failed:\s*/i, '').replace(/^:\s*/, '') || message;
  }
  if (isWalletBlockedOrRejected(error)) {
    return 'Wallet rejected or blocked the Flash transaction. Review the wallet prompt and try again.';
  }
  if (isFlashMissingDelegationError(error)) {
    return 'Flash basket is not delegated for trading yet. Confirm the one-time Flash delegation and retry the trade.';
  }
  if (/insufficient|custom program error:\s*0x1/i.test(message)) {
    return 'Insufficient USDC/SOL for the Flash trade or transaction fees.';
  }
  if (/6022|MaxInitLeverage|initial leverage/i.test(message)) {
    return 'Flash rejected this order because leverage is above the market initial leverage cap. Lower leverage and retry.';
  }
  return message || 'Flash order failed';
}

function flashOneTapSetupUserError(error, solWallet) {
  const message = String(error?.message || error?.data?.detail || error?.data?.error || error || '');
  if (isWalletBlockedOrRejected(error) && isPhantomSolWallet(solWallet)) {
    return 'Phantom blocked Flash one tap setup after the transaction passed local simulation. Flash now uses Phantom-first signTransaction for this multi-signer setup; if Phantom still shows "This dApp could be malicious", the connected domain must be reviewed by Phantom/Blowfish or allowed manually in Phantom.';
  }
  if (isWalletBlockedOrRejected(error)) {
    return 'Wallet rejected or blocked Flash one tap setup. Review the wallet prompt and try again.';
  }
  return message || 'Flash one tap setup failed';
}

function flashTxBase64(build = {}) {
  return build.transactionBase64 || build.transaction || build.transactions?.[0] || '';
}

function isFlashInitEndpoint(endpoint = '') {
  return /init-(deposit-ledger|basket)/i.test(String(endpoint || ''));
}

function isFlashIdempotentSetupEndpoint(endpoint = '') {
  return isFlashInitEndpoint(endpoint) || /delegate-basket/i.test(String(endpoint || ''));
}

function flashInitAccountPubkey(tx, endpoint = '') {
  if (!isFlashInitEndpoint(endpoint)) return null;
  try {
    if (tx instanceof VersionedTransaction) {
      const keys = tx.message?.staticAccountKeys || [];
      const ix = (tx.message?.compiledInstructions || []).find(item => (
        keys[item.programIdIndex]?.toBase58?.() === FLASH_V2_PROGRAM_ID
      ));
      const initAccountIndex = ix?.accountKeyIndexes?.[2];
      return typeof initAccountIndex === 'number' ? keys[initAccountIndex] || null : null;
    }
    const ix = (tx.instructions || []).find(item => item.programId?.toBase58?.() === FLASH_V2_PROGRAM_ID);
    return ix?.keys?.[2]?.pubkey || null;
  } catch {
    return null;
  }
}

function isFlashAlreadyInitializedError(error) {
  if (error?.flashAlreadyInitialized) return true;
  let dataText = '';
  try {
    dataText = error?.data ? JSON.stringify(error.data) : '';
  } catch {
    dataText = '';
  }
  const text = [
    error?.message,
    error?.data?.detail,
    error?.data?.error,
    error?.data?.message,
    dataText,
  ].map(value => String(value || '')).join(' ');
  return /already|exists|initialized|account.*in use|custom program error:\s*0x0|InstructionError.*Custom["']?\s*:?\s*0/i.test(text);
}

function flashTimeout(promise, timeoutMs, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

function flashDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function flashDelegationStorageKey(owner) {
  const key = publicKeyText(owner);
  return key ? `clash_flash_v2_delegated:${key}` : '';
}

function readFlashDelegationReady(owner) {
  if (typeof window === 'undefined') return false;
  const key = flashDelegationStorageKey(owner);
  if (!key) return false;
  try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
}

function markFlashDelegationReady(owner) {
  if (typeof window === 'undefined') return;
  const key = flashDelegationStorageKey(owner);
  if (!key) return;
  try { window.localStorage.setItem(key, '1'); } catch {}
}

function clearFlashDelegationReady(owner) {
  if (typeof window === 'undefined') return;
  const key = flashDelegationStorageKey(owner);
  if (!key) return;
  try { window.localStorage.removeItem(key); } catch {}
}

export function useFlash() {
  const { dex } = useDex();
  const player = usePlayer();
  const solWallet = useWallet();
  const { connection } = useConnection();
  const isActiveDex = dex === 'flash';
  const token = playerToken(player);
  const connectedWalletAddr = isActiveDex ? solanaAddress(solWallet) : '';
  const registeredFlashWallet = isActiveDex ? (registeredDexWallet(player, 'flash', 'solana') || '') : '';
  const accountOwner = registeredFlashWallet || connectedWalletAddr;
  const walletAddr = connectedWalletAddr;

  const [config, setConfig] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [goldEarned, setGoldEarned] = useState(null);
  const pricesRef = useRef([]);
  const accountRef = useRef(null);
  const positionsRef = useRef([]);
  const walletUsdcRef = useRef(null);
  const flashApiUrlRef = useRef('https://flashapi.trade');
  const wsReconnectRef = useRef(null);
  const refreshRef = useRef(null);
  const oneTapAgentRef = useRef(null);
  const [oneTapTrading, setOneTapTrading] = useState(() => disabledFlashOneTapState());

  useEffect(() => { pricesRef.current = prices; }, [prices]);
  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { walletUsdcRef.current = walletUsdc; }, [walletUsdc]);
  useEffect(() => { flashApiUrlRef.current = config?.api || 'https://flashapi.trade'; }, [config?.api]);
  const flashV2RpcUrl = config?.v2_rpc_url || config?.v2RpcUrl || FLASH_DEFAULT_V2_RPC;

  useEffect(() => {
    let cancelled = false;
    if (!isActiveDex || !walletAddr) {
      oneTapAgentRef.current = null;
      setOneTapTrading(disabledFlashOneTapState());
      return undefined;
    }
    getFlashOneTapAgent(walletAddr).then((agent) => {
      if (cancelled) return;
      if (flashOneTapIsUsable(agent, walletAddr)) {
        oneTapAgentRef.current = agent;
        setOneTapTrading(flashOneTapState(agent));
      } else {
        oneTapAgentRef.current = null;
        setOneTapTrading(disabledFlashOneTapState());
      }
    }).catch((e) => {
      if (!cancelled) {
        console.warn('[Flash one tap] load failed:', e?.message || e);
        oneTapAgentRef.current = null;
        setOneTapTrading(disabledFlashOneTapState());
      }
    });
    return () => { cancelled = true; };
  }, [isActiveDex, walletAddr]);

  const walletMismatch = !!registeredFlashWallet
    && !!connectedWalletAddr
    && publicKeyText(registeredFlashWallet) !== publicKeyText(connectedWalletAddr);

  useEffect(() => {
    if (!isActiveDex || !token || !connectedWalletAddr || registeredFlashWallet || walletMismatch) return;
    fetchJson(`${GAME_API}/players/dex-accounts/flash/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-token': token },
      body: JSON.stringify({
        wallet: connectedWalletAddr,
        walletSource: solWallet?.wallet?.adapter?.name || 'solana-wallet',
      }),
    }).catch(e => console.warn('[Flash] dex wallet link failed:', e?.message || e));
  }, [connectedWalletAddr, isActiveDex, registeredFlashWallet, token, walletMismatch, solWallet?.wallet?.adapter?.name]);

  const refresh = useCallback(async () => {
    if (!isActiveDex) return;
    const needsInitialData = !account && positions.length === 0 && markets.length === 0;
    setLoading(prev => prev || needsInitialData);
    try {
      const publicDataPromise = Promise.allSettled([
        fetchJson(`${FUTURES_API}/flash/health`),
        fetchJson(`${FUTURES_API}/markets?dex=flash`),
        fetchJson(`${FUTURES_API}/prices?dex=flash`),
      ]);
      if (accountOwner) {
        const accountPromise = token
          ? fetchJson(`${FUTURES_API}/flash/account?address=${encodeURIComponent(accountOwner)}`, {
            headers: { 'x-token': token, 'x-dex': 'flash' },
          }).catch(async (e) => {
            if (e?.status !== 401 && e?.status !== 409) throw e;
            return fetchJson(`${FUTURES_API}/account?dex=flash&address=${encodeURIComponent(accountOwner)}`);
          })
          : fetchJson(`${FUTURES_API}/account?dex=flash&address=${encodeURIComponent(accountOwner)}`);
        const acct = await accountPromise;
        const serverUsdc = Number(acct?.wallet_usdc);
        const initialUsdc = Number.isFinite(serverUsdc) ? serverUsdc : null;
        const nextPositions = rows(acct?.positions).map(normalizeFlashPosition);
        const committedPositions = nextPositions;
        const nextOrders = rows(acct?.orders);
        const nextAccount = {
          ...acct,
          positions: committedPositions,
          orders: nextOrders,
          balance: acct?.balance ?? acct?.equity ?? 0,
          equity: acct?.equity ?? acct?.balance ?? 0,
          usdc: acct?.usdc ?? acct?.balance ?? 0,
          available_to_spend: acct?.available_to_spend ?? acct?.free_margin ?? 0,
          wallet_usdc: initialUsdc,
          positions_count: acct?.positions_count,
        };
        accountRef.current = nextAccount;
        positionsRef.current = committedPositions;
        setAccount(nextAccount);
        setPositions(committedPositions);
        setOrders(nextOrders);
        setWalletUsdc(initialUsdc);
      } else {
        accountRef.current = null;
        positionsRef.current = [];
        setAccount(null);
        setPositions([]);
        setOrders([]);
        setWalletUsdc(null);
      }
      const [cfgResult, marketResult, priceResult] = await publicDataPromise;
      if (cfgResult.status === 'fulfilled') setConfig(cfgResult.value);
      if (marketResult.status === 'fulfilled') setMarkets(rows(marketResult.value));
      if (priceResult.status === 'fulfilled') {
        const nextPrices = rows(priceResult.value);
        pricesRef.current = nextPrices;
        setPrices(nextPrices);
        setPositions(prev => {
          const nextPositions = prev.map(pos => (
            pos?.metric ? flashPositionFromMetric(pos.marketPubkey || pos.positionKey || pos.symbol, pos.metric, nextPrices, pos) : pos
          ));
          positionsRef.current = nextPositions;
          accountRef.current = accountRef.current ? { ...accountRef.current, positions: nextPositions } : accountRef.current;
          return nextPositions;
        });
      }
      const publicError = [cfgResult, marketResult, priceResult].find(result => result.status === 'rejected')?.reason;
      if (publicError && !account && positions.length === 0) {
        console.warn('[Flash] public data refresh failed:', publicError?.message || publicError);
      }
      setError('');
    } catch (e) {
      setError(e?.message || 'Flash data unavailable');
    } finally {
      setLoading(false);
    }
  }, [account, accountOwner, isActiveDex, markets.length, positions.length, token]);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refresh();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [isActiveDex, refresh]);

  useEffect(() => {
    if (!isActiveDex || !accountOwner || typeof WebSocket === 'undefined') return undefined;
    let ws = null;
    let closed = false;
    let reconnectMs = 1000;

    const connect = () => {
      if (closed) return;
      const apiUrl = flashApiUrlRef.current || 'https://flashapi.trade';
      ws = new WebSocket(flashWsUrl(apiUrl, accountOwner));
      ws.onopen = () => {
        reconnectMs = 1000;
      };
      ws.onmessage = (event) => {
        let msg = null;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg?.type === 'basket') {
          const existingAccount = {
            ...(accountRef.current || {}),
            positions: positionsRef.current,
          };
          const normalized = normalizeFlashSnapshot(msg.data || {}, pricesRef.current, existingAccount);
          const nextAccount = {
            ...normalized,
            wallet_usdc: normalized.wallet_usdc ?? walletUsdcRef.current ?? accountRef.current?.wallet_usdc ?? null,
          };
          accountRef.current = nextAccount;
          positionsRef.current = normalized.positions;
          setAccount(nextAccount);
          setPositions(normalized.positions);
          setOrders(normalized.orders);
          setError('');
          setLoading(false);
        } else if (msg?.type === 'metrics' && msg.data && typeof msg.data === 'object') {
          if (Object.keys(msg.data).length === 0) return;
          const existingAccount = {
            ...(accountRef.current || {}),
            positions: positionsRef.current,
          };
          const combinedPositionMetrics = flashMetricsWithExistingPositions(msg.data, existingAccount);
          const normalized = normalizeFlashSnapshot(
            {
              ...existingAccount,
              owner: accountOwner,
              basketPubkey: existingAccount.basketPubkey,
              basketData: existingAccount.basketData,
              positionMetrics: combinedPositionMetrics,
              orderMetrics: existingAccount.orderMetrics || {},
              source: 'flash_v2_ws_metrics',
            },
            pricesRef.current,
            existingAccount,
            { preserveBalance: true },
          );
          const nextAccount = {
            ...normalized,
            wallet_usdc: walletUsdcRef.current ?? accountRef.current?.wallet_usdc ?? normalized.wallet_usdc ?? null,
          };
          accountRef.current = nextAccount;
          positionsRef.current = normalized.positions;
          setAccount(nextAccount);
          setPositions(normalized.positions);
          setError('');
          setLoading(false);
        }
      };
      ws.onerror = () => {
        console.warn('[Flash] websocket error');
      };
      ws.onclose = () => {
        if (closed) return;
        wsReconnectRef.current = window.setTimeout(connect, reconnectMs);
        reconnectMs = Math.min(10_000, reconnectMs * 1.7);
      };
    };

    connect();
    return () => {
      closed = true;
      if (wsReconnectRef.current) {
        window.clearTimeout(wsReconnectRef.current);
        wsReconnectRef.current = null;
      }
      try { ws?.close(); } catch {}
    };
  }, [accountOwner, isActiveDex]);

  const claimGold = useCallback(async () => {
    if (!token) return { error: 'Missing game session token' };
    try {
      const data = await fetchJson(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ dex: 'flash' }),
      });
      if (Number(data?.gold || 0) > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards', ...data });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: Number(data.gold || 0), wood: 0, ore: 0 } });
      }
      return data;
    } catch (e) {
      return { error: e?.message || 'Could not claim Flash gold' };
    }
  }, [token]);

  const confirmSignature = useCallback(async (signature, txConnection = null, options = {}) => {
    const preferBackend = options?.preferBackend === true;
    const acceptProcessed = options?.acceptProcessed === true;
    const loadBackendStatus = async () => fetchJson(`${FUTURES_API}/flash/tx-status?signature=${encodeURIComponent(signature)}`, {
      headers: { 'x-token': token, 'x-dex': 'flash' },
    }).catch(() => null);
    const throwFlashTxError = (err, status = null) => {
      const error = new Error(flashProgramErrorMessage(err, 'Flash transaction failed', status?.logs || [], status));
      error.data = status || { err };
      throw error;
    };
    const checkBackendStatus = async () => {
      const status = await loadBackendStatus();
      if (status?.err) throwFlashTxError(status.err, status);
      return status?.found && !status?.err;
    };
    const checkRpcStatus = async () => {
      if (!txConnection?.getSignatureStatuses) return false;
      const rpcStatus = await txConnection.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null);
      const value = rpcStatus?.value?.[0];
      if (value?.err) throwFlashTxError(value.err, await loadBackendStatus());
      if (acceptProcessed && value) return true;
      return value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized';
    };
    for (let i = 0; i < FLASH_CONFIRM_ATTEMPTS; i += 1) {
      if (preferBackend) {
        if (await checkBackendStatus()) return true;
        if (await checkRpcStatus()) return true;
      } else {
        if (await checkRpcStatus()) return true;
        if (await checkBackendStatus()) return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(`Flash transaction was sent but not confirmed yet. Check signature ${signature}.`);
  }, [token]);

  const selectTxConnection = useCallback(async (meta = {}) => {
    if (isFlashTradingTx(meta)) {
      return {
        connection: createSolanaConnection(Connection, flashV2RpcUrl, 'confirmed'),
        magicRouter: true,
      };
    }
    const selection = await selectFreshSolanaRpcUrl(FLASH_SOLANA_RPC_URLS);
    const selectedUrl = selection?.selected?.url || '';
    if (selectedUrl) {
      return {
        connection: createSolanaFallbackConnection(Connection, solanaRpcFallbackUrls(selectedUrl, FLASH_SOLANA_RPC_URLS), 'confirmed'),
        magicRouter: false,
      };
    }
    if (connection) return { connection, magicRouter: false };
    throw new Error('Solana RPC connection is unavailable');
  }, [connection, flashV2RpcUrl]);

  const getActiveOneTapSession = useCallback(async () => {
    if (!walletAddr) return null;
    const cached = oneTapAgentRef.current;
    if (flashOneTapIsUsable(cached, walletAddr)) return cached;
    const loaded = await getFlashOneTapAgent(walletAddr).catch(() => null);
    if (flashOneTapIsUsable(loaded, walletAddr)) {
      oneTapAgentRef.current = loaded;
      setOneTapTrading(flashOneTapState(loaded));
      return loaded;
    }
    oneTapAgentRef.current = null;
    if (loaded?.enabled) setOneTapTrading(disabledFlashOneTapState());
    return null;
  }, [walletAddr]);

  const oneTapTradeParams = useCallback(async ({ requireReady = FLASH_REQUIRE_ONE_TAP_TRADING } = {}) => {
    const session = await getActiveOneTapSession();
    if (!session) {
      if (requireReady) throw new Error(flashOneTapRequiredError());
      return { params: {}, session: null };
    }
    return {
      session,
      params: {
        signer: session.publicKey,
        sessionToken: session.sessionToken,
      },
    };
  }, [getActiveOneTapSession]);

  const sendBuiltTransaction = useCallback(async (base64, meta = {}) => {
    const { connection: txConnection, magicRouter } = await selectTxConnection(meta);
    if (!solWallet?.publicKey) throw new Error('Connect a Solana wallet first');
    const tx = decodeTransaction(base64);
    const rpc = connectionRpcDiagnostics(txConnection);
    const requiredSigners = txRequiredSignerKeys(tx);
    const oneTapSession = meta?.oneTap ? await getActiveOneTapSession() : null;
    const mobileWalletAdapter = !oneTapSession && isSolanaMobileWalletAdapter(solWallet);
    if (meta?.oneTap && !oneTapSession) {
      throw new Error('Flash one tap session expired or was removed. Enable Flash one tap again before trading.');
    }
    if (isFlashTradingTx(meta) && FLASH_REQUIRE_ONE_TAP_TRADING && !oneTapSession) {
      throw new Error(flashOneTapRequiredError());
    }
    console.info('[Flash tx] decoded', {
      tx: txMessageSummary(tx),
      builder: meta?.builder || 'flash_trade_v2',
      rpc,
      api_blockhash: tx instanceof VersionedTransaction ? tx.message?.recentBlockhash : tx.recentBlockhash,
      magic_router: magicRouter,
      required_signers: requiredSigners,
      one_tap: !!oneTapSession,
      mobile_wallet_adapter: !!mobileWalletAdapter,
      wallet_adapter: mobileWalletAdapter ? mobileSolanaWalletAdapterName(solWallet) : solWalletAdapterName(solWallet),
    });
    const initAccount = flashInitAccountPubkey(tx, meta?.endpoint || meta?.builder || '');
    if (initAccount) {
      const existingInitAccount = await txConnection.getAccountInfo(initAccount).catch(() => null);
      if (existingInitAccount) {
        const endpoint = String(meta?.endpoint || meta?.builder || 'init');
        console.info('[Flash tx] init account already exists; skipping setup tx', {
          endpoint,
          account: initAccount.toBase58(),
          owner: solWallet.publicKey.toBase58(),
        });
        const err = new Error(`Flash ${endpoint} account already exists: ${initAccount.toBase58()}`);
        err.flashAlreadyInitialized = true;
        throw err;
      }
    }
    const skipPreflight = magicRouter || shouldSkipFlashLocalSimulation(meta);
    if (mobileWalletAdapter) {
      const ownerSigner = solWallet.publicKey.toBase58();
      const foreignSigner = requiredSigners.find(key => key !== ownerSigner);
      if (foreignSigner) {
        throw new Error(`Flash mobile wallet transaction requires an unexpected signer: ${foreignSigner}`);
      }
      const walletTxOptions = buildSolanaWalletTxOptions({
        solWallet,
        owner: ownerSigner,
        label: `flash.${String(meta?.endpoint || meta?.builder || 'tx').replace(/^\/+/, '').replace(/[^a-z0-9_.-]+/gi, '_')}`,
        venueLabel: 'Flash',
        forceMobileVersionedTransaction: false,
      });
      if (!walletTxOptions?.sendTransaction) {
        throw new Error('This Seeker wallet cannot send Flash transactions.');
      }
      const mobileSkipPreflight = magicRouter ? true : false;
      console.info('[Flash tx] mobile wallet send start', {
        tx: txMessageSummary(tx),
        rpc,
        wallet_path: walletTxOptions.walletPathOverride || 'mwa_sign_and_send',
        wallet_adapter: walletTxOptions.adapterName,
        skip_preflight: mobileSkipPreflight,
        magic_router: magicRouter,
        required_signers: requiredSigners,
      });
      const signature = await flashTimeout(
        walletTxOptions.sendTransaction(tx, txConnection, {
          skipPreflight: mobileSkipPreflight,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        }),
        60_000,
        'Flash Seeker wallet transaction timed out. Reopen the wallet prompt and try again.',
      );
      console.info('[Flash tx] mobile wallet send done', {
        signature,
        rpc,
        wallet_path: walletTxOptions.walletPathOverride || 'mwa_sign_and_send',
        magic_router: magicRouter,
      });
      await confirmSignature(signature, txConnection, { preferBackend: false, acceptProcessed: magicRouter || isFlashTradingTx(meta) });
      return signature;
    }
    let signed = tx;
    if (oneTapSession) {
      const sessionSigner = publicKeyText(oneTapSession.publicKey);
      const ownerSigner = solWallet.publicKey.toBase58();
      if (!requiredSigners.includes(sessionSigner)) {
        if (requiredSigners.includes(ownerSigner)) {
          throw new Error('Flash one tap is enabled, but the v2 builder returned an owner-signed transaction. Re-enable one tap and try again.');
        }
        throw new Error('Flash one tap transaction was built without the session signer.');
      }
      const foreignSigner = requiredSigners.find(key => key !== sessionSigner);
      if (foreignSigner) {
        throw new Error(`Flash one tap transaction requires an unexpected signer: ${foreignSigner}`);
      }
      if (tx instanceof VersionedTransaction) {
        console.info('[Flash tx] local session sign start', {
          rpc,
          wallet_path: 'flash_one_tap_session_v0',
          magic_router: magicRouter,
          signer: sessionSigner,
          session_token: oneTapSession.sessionToken,
        });
        tx.sign([oneTapSession.keypair]);
      } else {
        console.info('[Flash tx] local session sign start', {
          rpc,
          wallet_path: 'flash_one_tap_session_legacy',
          magic_router: magicRouter,
          signer: sessionSigner,
          session_token: oneTapSession.sessionToken,
        });
        tx.partialSign(oneTapSession.keypair);
      }
      signed = tx;
    } else if (tx instanceof VersionedTransaction) {
      if (!solWallet.signTransaction) throw new Error('This Solana wallet cannot sign Flash versioned transactions');
      console.info('[Flash tx] wallet sign start', { rpc, wallet_path: 'adapter_sign_raw_v0', magic_router: magicRouter });
      signed = await flashTimeout(
        solWallet.signTransaction(tx),
        45_000,
        'Flash wallet signature timed out. Reopen Phantom and try again.',
      );
    } else if (solWallet.signTransaction) {
      console.info('[Flash tx] wallet sign start', { rpc, wallet_path: 'adapter_sign_raw_legacy', magic_router: magicRouter });
      signed = await flashTimeout(
        solWallet.signTransaction(tx),
        45_000,
        'Flash wallet signature timed out. Reopen Phantom and try again.',
      );
    } else {
      throw new Error('This Solana wallet cannot sign Flash transactions');
    }
    const raw = signed.serialize();
    console.info('[Flash tx] signed, sending raw', {
      tx: txMessageSummary(signed),
      rpc,
      raw_bytes: raw.length,
      magic_router: magicRouter,
      one_tap: !!oneTapSession,
    });
    let signature = '';
    if (magicRouter) {
      try {
        console.info('[Flash tx] browser submit start', { rpc, raw_bytes: raw.length, magic_router: magicRouter });
        signature = await flashTimeout(txConnection.sendRawTransaction(raw, {
          skipPreflight: true,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        }), 12_000, 'Flash direct broadcast timed out.');
        console.info('[Flash tx] browser submit done', { signature, rpc, magic_router: magicRouter });
      } catch (directError) {
        console.warn('[Flash tx] browser submit failed, using backend fallback', {
          rpc,
          message: directError?.message || String(directError || ''),
          magic_router: magicRouter,
        });
        console.info('[Flash tx] backend submit start', { rpc, raw_bytes: raw.length, magic_router: magicRouter });
        const submitted = await fetchJson(`${FUTURES_API}/flash/submit-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'flash' },
          body: JSON.stringify({
            rawTransactionBase64: bytesToBase64(raw),
            skipPreflight: true,
            preflightCommitment: 'confirmed',
            maxRetries: 3,
          }),
        });
        console.info('[Flash tx] backend submit done', {
          signature: submitted?.signature,
          endpoint: submitted?.endpoint,
          submitted_ms: submitted?.submitted_ms,
          tx: submitted?.tx,
        });
        if (!submitted?.signature) throw new Error('Flash backend returned no transaction signature');
        signature = submitted.signature;
      }
    } else {
      signature = await flashTimeout(txConnection.sendRawTransaction(raw, {
        skipPreflight,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      }), 20_000, 'Flash transaction broadcast timed out. Check Phantom activity before retrying.');
    }
    console.info('[Flash tx] raw sent', { signature, rpc, magic_router: magicRouter });
    await confirmSignature(signature, txConnection, { preferBackend: false, acceptProcessed: magicRouter || isFlashTradingTx(meta) });
    return signature;
  }, [confirmSignature, getActiveOneTapSession, selectTxConnection, solWallet, token]);

  const buildAndSend = useCallback(async (endpoint, body = {}) => {
    const { _flashOneTapSession, ...wireBody } = body || {};
    const build = await fetchJson(`${FUTURES_API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'flash' },
      body: JSON.stringify({ wallet: walletAddr, ...wireBody }),
    });
    const tx = flashTxBase64(build);
    if (!tx) throw new Error('Flash v2 builder returned no transactionBase64');
    const signature = await sendBuiltTransaction(tx, {
      ...build,
      endpoint,
      oneTap: !!_flashOneTapSession,
      oneTapSigner: _flashOneTapSession?.publicKey || '',
      sessionToken: _flashOneTapSession?.sessionToken || '',
    });
    return { ...build, signature };
  }, [sendBuiltTransaction, token, walletAddr]);

  const readFlashAccountSnapshot = useCallback(async () => {
    if (!accountOwner) return null;
    const primary = token
      ? fetchJson(`${FUTURES_API}/flash/account?address=${encodeURIComponent(accountOwner)}`, {
        headers: { 'x-token': token, 'x-dex': 'flash' },
      }).catch(async (e) => {
        if (e?.status !== 401 && e?.status !== 409) throw e;
        return fetchJson(`${FUTURES_API}/account?dex=flash&address=${encodeURIComponent(accountOwner)}`);
      })
      : fetchJson(`${FUTURES_API}/account?dex=flash&address=${encodeURIComponent(accountOwner)}`);
    return primary;
  }, [accountOwner, token]);

  const waitForFlashBasket = useCallback(async (onProgress = null) => {
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const snapshot = await readFlashAccountSnapshot().catch(() => null);
      if (snapshot?.basketPubkey) return snapshot;
      if (typeof onProgress === 'function') {
        onProgress({
          step: 'basket_wait',
          status: 'active',
          label: 'Waiting for Flash account',
          hint: 'Flash is indexing the new basket before the deposit transaction is built.',
          attempt: attempt + 1,
        });
      }
      await flashDelay(attempt < 4 ? 750 : 1000);
    }
    throw new Error('Flash account setup landed, but the basket is not visible yet. Wait a few seconds and retry deposit.');
  }, [readFlashAccountSnapshot]);

  const setOneTapTradingEnabled = useCallback(async (nextEnabled = true) => {
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered Flash wallet' };
    if (!nextEnabled) {
      await clearFlashOneTapAgent(walletAddr).catch(() => null);
      oneTapAgentRef.current = null;
      setOneTapTrading(disabledFlashOneTapState());
      return { ok: true, enabled: false };
    }
    if (!solWallet?.publicKey || !solWallet?.signTransaction) {
      return { error: 'This Solana wallet cannot create a Flash one tap session.' };
    }
    setActionLoading(true);
    try {
      const existing = await getFlashOneTapAgent(walletAddr).catch(() => null);
      if (flashOneTapIsUsable(existing, walletAddr)) {
        oneTapAgentRef.current = existing;
        setOneTapTrading(flashOneTapState(existing));
        return { ok: true, enabled: true, signer: existing.publicKey, sessionToken: existing.sessionToken, already_ready: true };
      }
      if (existing) await clearFlashOneTapAgent(walletAddr).catch(() => null);
      const agent = await getOrCreateFlashOneTapAgent(walletAddr);
      const anchorWallet = makeAnchorWallet(solWallet);
      if (!anchorWallet) throw new Error('This Solana wallet cannot sign the Flash session setup transaction.');
      const { connection: setupConnection } = await selectTxConnection({ txKind: 'account', endpoint: 'flash-session-setup' });
      const manager = new SessionTokenManager(anchorWallet, setupConnection);
      const targetProgram = new PublicKey(FLASH_V2_PROGRAM_ID);
      const validUntil = Math.ceil((Date.now() + FLASH_ONE_TAP_EXPIRY_MINUTES * 60_000) / 1000);
      const topUpLamports = FLASH_ONE_TAP_TOPUP_LAMPORTS;
      const builder = manager.program.methods
        .createSessionV2(
          topUpLamports > 0,
          new anchor.BN(validUntil),
          topUpLamports > 0 ? new anchor.BN(topUpLamports) : null,
        )
        .accounts({
          targetProgram,
          sessionSigner: agent.keypair.publicKey,
          feePayer: solWallet.publicKey,
          authority: solWallet.publicKey,
        });
      const pubKeys = await builder.pubkeys();
      const derivedSessionToken = flashSessionTokenPda(agent.publicKey, walletAddr).toBase58();
      const sessionToken = pubKeys?.sessionToken?.toBase58?.() || derivedSessionToken;
      if (sessionToken !== derivedSessionToken) {
        throw new Error('Flash one tap session token derivation mismatch.');
      }
      console.info('[Flash one tap] create session start', {
        owner: walletAddr,
        signer: agent.publicKey,
        session_token: sessionToken,
        session_token_version: 2,
        target_program: FLASH_V2_PROGRAM_ID,
        valid_until: validUntil,
        top_up_lamports: topUpLamports,
      });
      let setupSignature = '';
      try {
        const setupTx = await builder.transaction();
        if (!setupTx?.partialSign || !setupTx?.serialize) {
          throw new Error('Flash one tap setup returned an unsupported transaction type.');
        }
        const latest = await setupConnection.getLatestBlockhash('confirmed');
        setupTx.feePayer = solWallet.publicKey;
        setupTx.recentBlockhash = latest.blockhash;
        const demotedDuplicateSignerMetas = demoteDuplicateSignerMetas(setupTx, solWallet.publicKey);
        const requiredSetupSigners = txRequiredSignerKeys(setupTx);
        if (!requiredSetupSigners.includes(solWallet.publicKey.toBase58())) {
          throw new Error('Flash one tap setup transaction does not require the connected wallet signature.');
        }
        if (!requiredSetupSigners.includes(agent.keypair.publicKey.toBase58())) {
          throw new Error('Flash one tap setup transaction does not require the local session signer.');
        }
        await simulateUnsignedLegacyTransaction(setupConnection, setupTx, 'Flash one tap setup');
        const phantomWallet = isPhantomSolWallet(solWallet);
        const walletAdapterName = solWalletAdapterName(solWallet);
        if (!setupSignature) {
          if (!phantomWallet && typeof solWallet.sendTransaction === 'function') {
            console.info('[Flash one tap] setup wallet send start', {
              owner: walletAddr,
              signer: agent.publicKey,
              wallet_path: 'adapter_send_transaction_with_session_signer',
              wallet_adapter: walletAdapterName,
              phantom_wallet: phantomWallet,
              rpc: connectionRpcDiagnostics(setupConnection),
              required_signers: requiredSetupSigners,
              top_up_lamports: topUpLamports,
              demoted_duplicate_signer_metas: demotedDuplicateSignerMetas,
              note: 'Non-Phantom path: wallet adapter partial-signs the local session signer, then wallet signs and submits.',
            });
            try {
              setupSignature = await flashTimeout(
                solWallet.sendTransaction(setupTx, setupConnection, {
                  signers: [agent.keypair],
                  skipPreflight: false,
                  preflightCommitment: 'confirmed',
                  maxRetries: 3,
                }),
                45_000,
                'Flash one tap wallet send timed out. Reopen Phantom and try again.',
              );
              console.info('[Flash one tap] setup wallet send done', {
                owner: walletAddr,
                signer: agent.publicKey,
                setup_signature: setupSignature,
                wallet_path: 'adapter_send_transaction_with_session_signer',
                wallet_adapter: walletAdapterName,
                phantom_wallet: phantomWallet,
              });
            } catch (sendError) {
              if (isWalletBlockedOrRejected(sendError)) throw sendError;
              console.warn('[Flash one tap] setup wallet send failed, falling back to raw sign path', {
                owner: walletAddr,
                signer: agent.publicKey,
                message: sendError?.message || String(sendError || ''),
              });
            }
          }
          if (!setupSignature) {
            let signedSetupTx = null;
            console.info('[Flash one tap] setup wallet sign start', {
              owner: walletAddr,
              signer: agent.publicKey,
              wallet_path: phantomWallet ? 'adapter_sign_owner_first_multi_signer_phantom' : 'adapter_sign_owner_first_multi_signer',
              wallet_adapter: walletAdapterName,
              phantom_wallet: phantomWallet,
              rpc: connectionRpcDiagnostics(setupConnection),
              required_signers: requiredSetupSigners,
              top_up_lamports: topUpLamports,
              demoted_duplicate_signer_metas: demotedDuplicateSignerMetas,
              note: 'Owner wallet signs first, then Clash adds the local session signer and broadcasts raw.',
            });
            signedSetupTx = await flashTimeout(
              solWallet.signTransaction(setupTx),
              45_000,
              'Flash one tap wallet signature timed out. Reopen Phantom and try again.',
            );
            const ownerSignature = signedSetupTx.signatures?.find(sig => sig.publicKey?.equals?.(solWallet.publicKey));
            if (!ownerSignature?.signature) {
              throw new Error('Flash one tap setup was not signed by the connected wallet.');
            }
            signedSetupTx.partialSign(agent.keypair);
            const agentSignature = signedSetupTx.signatures?.find(sig => sig.publicKey?.equals?.(agent.keypair.publicKey));
            if (!agentSignature?.signature) {
              throw new Error('Flash one tap setup lost the local session signer signature.');
            }
            const raw = signedSetupTx.serialize({ requireAllSignatures: true, verifySignatures: true });
            console.info('[Flash one tap] setup signed, sending raw', {
              owner: walletAddr,
              signer: agent.publicKey,
              wallet_path: 'adapter_sign_owner_first_then_session_raw',
              rpc: connectionRpcDiagnostics(setupConnection),
              raw_bytes: raw.length,
            });
            setupSignature = await flashTimeout(
              setupConnection.sendRawTransaction(raw, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 3,
              }),
              20_000,
              'Flash one tap setup broadcast timed out. Check Phantom activity before retrying.',
            );
          }
        }
      } catch (setupError) {
        const landedSignature = extractSolanaSignatureFromError(setupError);
        if (!landedSignature) throw setupError;
        console.warn('[Flash one tap] setup broadcast timed out, checking signature status', {
          owner: walletAddr,
          signer: agent.publicKey,
          signature: landedSignature,
          message: setupError?.message || String(setupError || ''),
        });
        await confirmSignature(landedSignature, setupConnection);
        setupSignature = landedSignature;
      }
      await confirmSignature(setupSignature, setupConnection);
      const stored = await markFlashOneTapAgent(walletAddr, {
        enabled: true,
        delegated: true,
        delegatedAt: Date.now(),
        setupSignature,
        sessionToken,
        targetProgram: FLASH_V2_PROGRAM_ID,
        sessionTokenVersion: 2,
        cluster: 'mainnet-beta',
        validUntil,
      });
      oneTapAgentRef.current = stored;
      setOneTapTrading(flashOneTapState(stored));
      console.info('[Flash one tap] create session done', {
        owner: walletAddr,
        signer: stored?.publicKey,
        session_token: stored?.sessionToken,
        setup_signature: setupSignature,
      });
      return { ok: true, enabled: true, signer: stored?.publicKey, sessionToken: stored?.sessionToken, setupSignature };
    } catch (e) {
      const msg = flashOneTapSetupUserError(e, solWallet);
      console.warn('[Flash one tap] setup failed:', msg, {
        wallet_adapter: solWalletAdapterName(solWallet),
        phantom_wallet: isPhantomSolWallet(solWallet),
        raw_message: e?.message || String(e || ''),
        data: e?.data || '',
      });
      await clearFlashOneTapAgent(walletAddr).catch(() => null);
      oneTapAgentRef.current = null;
      setOneTapTrading(disabledFlashOneTapState({ enabled: false, approved: false }));
      return { error: msg };
    } finally {
      setActionLoading(false);
    }
  }, [selectTxConnection, solWallet, walletAddr, walletMismatch]);

  const tryBuildAndSend = useCallback(async (endpoint, body = {}) => {
    try {
      return await buildAndSend(endpoint, body);
    } catch (e) {
      if (isFlashIdempotentSetupEndpoint(endpoint) && isFlashAlreadyInitializedError(e)) {
        return { skipped: true, reason: e?.message || e?.data?.detail || e?.data?.error || 'already initialized' };
      }
      throw e;
    }
  }, [buildAndSend]);

  const isBasketDelegatedOnChain = useCallback(async (basketPubkey) => {
    const basket = publicKeyText(basketPubkey);
    if (!basket) return false;
    try {
      const { connection: solanaConnection } = await selectTxConnection({ txKind: 'account', endpoint: '/flash/delegate-basket-tx' });
      const info = await solanaConnection.getAccountInfo(new PublicKey(basket), 'confirmed');
      const owner = info?.owner?.toBase58?.() || '';
      const delegated = owner === FLASH_DELEGATION_PROGRAM_ID;
      console.info('[Flash delegation] basket owner check', {
        basket,
        owner,
        delegated,
      });
      return delegated;
    } catch (e) {
      console.warn('[Flash delegation] basket owner check failed:', e?.message || String(e || ''), { basket });
      return false;
    }
  }, [selectTxConnection]);

  const ensureFlashBasketDelegated = useCallback(async ({ force = false } = {}) => {
    if (!walletAddr) throw new Error('Connect a Solana wallet first');
    let snapshot = account?.basketPubkey ? account : null;
    if (!snapshot?.basketPubkey) {
      snapshot = await waitForFlashBasket().catch(() => null);
    }
    if (!snapshot?.basketPubkey) {
      throw new Error('Flash basket is not ready yet. Deposit USDC once so Flash can initialize the basket, then trade again.');
    }
    if (!force && readFlashDelegationReady(walletAddr)) {
      return { ok: true, skipped: true, reason: 'delegation cached' };
    }
    if (!force && await isBasketDelegatedOnChain(snapshot.basketPubkey)) {
      markFlashDelegationReady(walletAddr);
      return { ok: true, skipped: true, reason: 'delegation on-chain' };
    }
    const delegated = await tryBuildAndSend('/flash/delegate-basket-tx', { payer: walletAddr });
    markFlashDelegationReady(walletAddr);
    return { ok: true, ...delegated };
  }, [account, isBasketDelegatedOnChain, tryBuildAndSend, waitForFlashBasket, walletAddr]);

  const reportTrade = useCallback(async ({ signature, symbol, side, amount, leverage = 1, price, orderType = 'market', notionalUsd, signer = '', sessionToken = '', deferred = false } = {}) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    const retryArgs = { signature, symbol, side, amount, leverage, price, orderType, notionalUsd, signer, sessionToken };
    const reportPayload = {
      signature,
      tx_hash: signature,
      wallet: walletAddr,
      symbol: normalizeSymbol(symbol),
      side,
      amount,
      leverage,
      price,
      order_type: orderType,
      notional_usd: notionalUsd,
      signer,
      sessionToken,
    };
    try {
      let data = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          data = await fetchJson(`${FUTURES_API}/flash/trade-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'flash' },
            body: JSON.stringify(reportPayload),
          });
          break;
        } catch (e) {
          if (e?.status !== 404 || attempt === 5) throw e;
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }
      if (data?.verified === true || data?.duplicate === true) {
        await claimGold();
        window.setTimeout(() => claimGold().catch(() => null), 5000);
      }
      return data;
    } catch (e) {
      if (!deferred && (e?.status === 404 || /not found/i.test(String(e?.message || '')))) {
        for (const delayMs of [8_000, 25_000]) {
          window.setTimeout(() => {
            reportTrade({ ...retryArgs, deferred: true }).catch(() => null);
          }, delayMs);
        }
      }
      return { error: e?.message || 'Flash trade verification failed' };
    }
  }, [claimGold, token, walletAddr]);

  const placeMarketOrder = useCallback(async (symbol, side, qty, slippage = '0.5', lev = 1, options = {}) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered Flash wallet' };
    const leverage = Number(lev || 1);
    const amount = Number(options?.collateral_delta_usd ?? options?.collateralDeltaUsd ?? qty ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter a Flash collateral amount before placing the order' };
    const wantedSymbol = normalizeSymbol(symbol);
    const market = markets.find(row => normalizeSymbol(row?.symbol) === wantedSymbol);
    if (market && !flashMarketCanOpen(market)) {
      return { error: flashMarketUnavailableMessage(wantedSymbol, market) };
    }
    const maxInitialLeverage = Number(market?.max_initial_leverage || market?.maxInitialLeverage || market?.max_leverage || market?.maxLeverage || 0);
    if (Number.isFinite(maxInitialLeverage) && maxInitialLeverage > 0 && leverage > maxInitialLeverage + 1e-9) {
      return { error: `${wantedSymbol} max initial leverage on Flash is ${maxInitialLeverage}x. Lower leverage and retry.` };
    }
    setActionLoading(true);
    try {
      const requestedMargin = Number(amount);
      if (Number.isFinite(requestedMargin) && requestedMargin > 0 && accountOwner) {
        const latestAccount = await fetchJson(`${FUTURES_API}/flash/account?address=${encodeURIComponent(accountOwner)}`, {
          headers: { 'x-token': token, 'x-dex': 'flash' },
        }).catch((e) => {
          console.warn('[Flash] latest balance gate failed:', e?.message || e);
          return null;
        });
        const latestAvailable = flashAvailableBalanceFromAccount(latestAccount);
        if (latestAvailable != null && requestedMargin > latestAvailable + 1e-6) {
          window.setTimeout(() => refresh().catch(() => null), 0);
          return {
            error: `Insufficient Flash available balance. Requested $${requestedMargin.toFixed(2)} margin, available $${latestAvailable.toFixed(2)} after open positions/orders. Reduce margin or close/cancel existing exposure.`,
          };
        }
      }
      const { params: sessionParams, session: oneTapSession } = await oneTapTradeParams();
      await ensureFlashBasketDelegated();
      const request = {
        wallet: accountOwner,
        inputTokenSymbol: options?.inputTokenSymbol || 'USDC',
        outputTokenSymbol: normalizeSymbol(symbol),
        inputAmountUi: String(amount),
        leverage,
        tradeType: normalizeTradeType(side),
        orderType: String(options?.order_type || options?.orderType || 'MARKET').toUpperCase(),
        limitPrice: options?.limitPrice || options?.limit_price || options?.price,
        slippagePercentage: String(slippage || '0.5'),
        takeProfit: options?.take_profit || options?.takeProfit,
        stopLoss: options?.stop_loss || options?.stopLoss,
        ...sessionParams,
      };
      const build = await fetchJson(`${FUTURES_API}/flash/open-position-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'flash' },
        body: JSON.stringify(request),
      });
      const tx = flashTxBase64(build);
      if (!tx) throw new Error('Flash v2 builder returned no transactionBase64');
      const signature = await sendBuiltTransaction(tx, {
        ...build,
        oneTap: !!oneTapSession,
        oneTapSigner: oneTapSession?.publicKey || '',
        sessionToken: oneTapSession?.sessionToken || '',
      });
      const notionalUsd = Number(build.youRecieveUsdUi || build.youReceiveUsdUi || amount * leverage);
      const imported = await reportTrade({
        signature,
        symbol,
        side: request.tradeType,
        amount,
        leverage,
        price: build.newEntryPrice,
        orderType: String(request.orderType || 'MARKET').toLowerCase(),
        notionalUsd,
        signer: oneTapSession?.publicKey || '',
        sessionToken: oneTapSession?.sessionToken || '',
      });
      window.setTimeout(() => refresh().catch(() => null), 400);
      return imported?.error
        ? { ok: true, signature, status: 'submitted', warning: imported.error }
        : { ok: true, signature, ...imported };
    } catch (e) {
      if (isFlashMissingDelegationError(e)) clearFlashDelegationReady(walletAddr);
      return { error: flashUserError(e) };
    } finally {
      setActionLoading(false);
    }
  }, [accountOwner, ensureFlashBasketDelegated, markets, oneTapTradeParams, refresh, reportTrade, sendBuiltTransaction, token, walletAddr, walletMismatch]);

  const placeLimitOrder = useCallback(async (symbol, side, price, qty, _tif, lev = 1, options = {}) => (
    placeMarketOrder(symbol, side, qty, '0.5', lev, {
      ...options,
      price,
      order_type: 'limit',
    })
  ), [placeMarketOrder]);

  const closePosition = useCallback(async (symbol, side, amount, _pairIndex, _tradeIndex, fullClose = true, options = {}) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered Flash wallet' };
    const wantedSymbol = normalizeSymbol(symbol);
    const wantedSide = normalizeTradeType(side);
    const explicitPosition = options?.position || options?.pos || null;
    const matched = explicitPosition || positions.find(pos => (
      flashPositionSymbol(pos) === wantedSymbol
      && flashPositionTradeType(pos) === wantedSide
    )) || positions.find(pos => flashPositionSymbol(pos) === wantedSymbol);
    const inputUsdUi = String(options?.inputUsdUi || options?.input_usd_ui || flashPositionCloseUsd(matched, amount)).trim();
    if (!inputUsdUi) {
      return { error: 'Flash close requires a USD close amount from the Flash v2 basket.' };
    }
    setActionLoading(true);
    try {
      const { params: sessionParams, session: oneTapSession } = await oneTapTradeParams();
      await ensureFlashBasketDelegated();
      const build = await fetchJson(`${FUTURES_API}/flash/close-position-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'flash' },
        body: JSON.stringify({
          wallet: accountOwner,
          marketSymbol: wantedSymbol,
          side: wantedSide,
          inputUsdUi,
          withdrawTokenSymbol: options?.withdrawTokenSymbol || options?.withdraw_token_symbol || 'USDC',
          slippagePercentage: String(options?.slippage || options?.slippagePercentage || '0.5'),
          ...sessionParams,
        }),
      });
      const tx = flashTxBase64(build);
      if (!tx) throw new Error('Flash v2 builder returned no transactionBase64');
      const signature = await sendBuiltTransaction(tx, {
        ...build,
        oneTap: !!oneTapSession,
        oneTapSigner: oneTapSession?.publicKey || '',
        sessionToken: oneTapSession?.sessionToken || '',
      });
      const imported = await reportTrade({
        signature,
        symbol,
        side: wantedSide === 'SHORT' ? 'close_short' : 'close_long',
        amount: Number(inputUsdUi) || 0,
        leverage: Number(matched?.leverage || 1) || 1,
        price: build.price || build.closePrice || build.exitPrice,
        orderType: 'close',
        notionalUsd: Number(inputUsdUi) || undefined,
        signer: oneTapSession?.publicKey || '',
        sessionToken: oneTapSession?.sessionToken || '',
      });
      window.setTimeout(() => refresh().catch(() => null), 400);
      return imported?.error
        ? { ok: true, signature, status: 'submitted', warning: imported.error }
        : { ok: true, signature, ...imported };
    } catch (e) {
      if (isFlashMissingDelegationError(e)) clearFlashDelegationReady(walletAddr);
      return { error: flashUserError(e) };
    } finally {
      setActionLoading(false);
    }
  }, [accountOwner, ensureFlashBasketDelegated, oneTapTradeParams, positions, refresh, reportTrade, sendBuiltTransaction, token, walletAddr, walletMismatch]);

  const depositToPacifica = useCallback(async (amount, options = {}) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered Flash wallet' };
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return { error: 'Enter a positive Flash deposit amount' };
    const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
    const emit = (patch) => {
      if (!onProgress) return;
      try {
        onProgress({
          dex: 'flash',
          amount: String(value),
          ...patch,
        });
      } catch {
        // UI progress is best-effort; never break the wallet flow.
      }
    };
    setActionLoading(true);
    try {
      const hadBasket = !!account?.basketPubkey;
      const delegationKnown = readFlashDelegationReady(walletAddr);
      const shouldDelegate = !delegationKnown || !hadBasket;
      emit({
        step: 'prepare',
        status: 'active',
        label: 'Preparing Flash funding',
        hint: hadBasket
          ? 'Flash account is ready. Next signature sends USDC into Flash.'
          : 'Checking one-time Flash account setup before the deposit.',
      });
      if (!hadBasket) {
        emit({
          step: 'ledger',
          status: 'active',
          label: 'Checking deposit ledger',
          hint: 'Approve only if Flash needs to create the ledger for this wallet.',
        });
        const ledger = await tryBuildAndSend('/flash/init-deposit-ledger-tx');
        emit({
          step: 'ledger',
          status: 'done',
          signature: ledger?.signature || '',
          skipped: !!ledger?.skipped,
          label: ledger?.skipped ? 'Deposit ledger ready' : 'Deposit ledger confirmed',
          hint: ledger?.skipped ? 'The ledger already exists, so no wallet signature was needed.' : 'Ledger transaction confirmed on Solana.',
        });
        emit({
          step: 'basket',
          status: 'active',
          label: 'Confirm Flash account',
          hint: 'Approve the one-time basket setup. This is required before Flash can credit the deposit.',
        });
        const basket = await tryBuildAndSend('/flash/init-basket-tx');
        emit({
          step: 'basket',
          status: 'done',
          signature: basket?.signature || '',
          skipped: !!basket?.skipped,
          label: basket?.skipped ? 'Flash account ready' : 'Flash account confirmed',
          hint: basket?.skipped ? 'The basket already exists.' : 'Basket setup confirmed. Waiting until Flash sees it.',
        });
        await waitForFlashBasket(emit);
        emit({
          step: 'basket_wait',
          status: 'done',
          label: 'Flash account indexed',
          hint: 'Flash owner snapshot now sees the basket.',
        });
      } else {
        emit({
          step: 'ledger',
          status: 'done',
          skipped: true,
          label: 'Deposit ledger ready',
          hint: 'Existing Flash account detected.',
        });
        emit({
          step: 'basket',
          status: 'done',
          skipped: true,
          label: 'Flash account ready',
          hint: 'Basket already exists for this wallet.',
        });
        emit({
          step: 'basket_wait',
          status: 'done',
          skipped: true,
          label: 'Flash account indexed',
          hint: 'Basket is already visible in Flash.',
        });
      }
      emit({
        step: 'deposit',
        status: 'active',
        label: 'Confirm deposit',
        hint: 'Approve the USDC deposit from your connected Solana wallet to Flash.',
      });
      const deposit = await buildAndSend('/flash/deposit-direct-tx', { amount: String(value) });
      emit({
        step: 'deposit',
        status: 'done',
        signature: deposit?.signature || '',
        label: 'Deposit confirmed',
        hint: 'USDC deposit transaction was confirmed.',
      });
      if (shouldDelegate) {
        emit({
          step: 'delegate',
          status: 'active',
          label: 'Confirm delegation',
          hint: 'Approve the one-time Flash basket delegation so trading works after funding.',
        });
        const delegated = await tryBuildAndSend('/flash/delegate-basket-tx', { payer: walletAddr });
        markFlashDelegationReady(walletAddr);
        emit({
          step: 'delegate',
          status: 'done',
          signature: delegated?.signature || '',
          skipped: !!delegated?.skipped,
          label: 'Delegation confirmed',
          hint: delegated?.skipped ? 'Flash basket was already delegated.' : 'Flash basket is delegated for trading.',
        });
      } else {
        emit({
          step: 'delegate',
          status: 'done',
          skipped: true,
          label: 'Delegation ready',
          hint: 'Delegation was already confirmed for this browser wallet.',
        });
      }
      emit({
        step: 'refresh',
        status: 'active',
        label: 'Waiting for balance',
        hint: 'Refreshing Flash balance after the confirmed transactions.',
      });
      window.setTimeout(() => refresh().catch(() => null), 800);
      emit({
        step: 'complete',
        status: 'done',
        label: 'Flash deposit complete',
        hint: 'Balance will finish updating as Flash streams the latest account state.',
        signature: deposit.signature,
      });
      return {
        ok: true,
        signature: deposit.signature,
        info: 'Flash v2 deposit sent. Basket balance updates after confirmation.',
      };
    } catch (e) {
      const msg = flashUserError(e);
      emit({
        step: 'error',
        status: 'error',
        label: 'Flash deposit stopped',
        hint: msg,
        error: msg,
      });
      return { error: msg };
    } finally {
      setActionLoading(false);
    }
  }, [account?.basketPubkey, buildAndSend, refresh, token, tryBuildAndSend, waitForFlashBasket, walletAddr, walletMismatch]);

  const withdraw = useCallback(async (amount, options = {}) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered Flash wallet' };
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return { error: 'Enter a positive Flash withdrawal amount' };
    setActionLoading(true);
    try {
      const build = await buildAndSend('/flash/request-withdrawal-tx', {
        amount: String(value),
        includeCustodySettlement: options?.includeCustodySettlement !== false,
      });
      window.setTimeout(() => refresh().catch(() => null), 1200);
      return {
        ok: true,
        signature: build.signature,
        info: 'Flash v2 withdrawal request sent. If it stalls, recover with execute-withdrawal in Flash.',
      };
    } catch (e) {
      return { error: flashUserError(e) };
    } finally {
      setActionLoading(false);
    }
  }, [buildAndSend, refresh, token, walletAddr, walletMismatch]);

  const setTpsl = useCallback(async (symbol, _side, tpPrice = null, slPrice = null, _pairIndex, _tradeIndex, amount = null) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered Flash wallet' };
    const wantedSymbol = normalizeSymbol(symbol);
    const live = positions.find(pos => flashPositionSymbol(pos) === wantedSymbol) || positions.find(pos => normalizeSymbol(pos?.symbol) === wantedSymbol);
    if (!live) return { error: 'Flash position not found. Refresh positions before setting TP/SL.' };
    const takeProfitUi = String(tpPrice || '').trim();
    const stopLossUi = String(slPrice || '').trim();
    if (!takeProfitUi && !stopLossUi) return { error: 'Enter a TP or SL price first.' };
    const sizeAmountUi = String(
      amount
      || live.sizeAmountUi
      || live.size_amount_ui
      || live.amount
      || live.size
      || ''
    ).trim();
    if (!sizeAmountUi || !(Number(sizeAmountUi) > 0)) {
      return { error: 'Flash TP/SL requires the position size from the v2 basket. Refresh positions and try again.' };
    }
    setActionLoading(true);
    try {
      const { params: sessionParams, session: oneTapSession } = await oneTapTradeParams();
      await ensureFlashBasketDelegated();
      const build = await buildAndSend('/flash/tpsl-tx', {
        marketSymbol: wantedSymbol,
        side: flashPositionTradeType(live),
        sizeAmountUi,
        takeProfitUi,
        stopLossUi,
        ...sessionParams,
        _flashOneTapSession: oneTapSession,
      });
      window.setTimeout(() => refresh().catch(() => null), 800);
      return {
        ok: true,
        signature: build.signature,
        info: 'Flash TP/SL transaction sent.',
      };
    } catch (e) {
      if (isFlashMissingDelegationError(e)) clearFlashDelegationReady(walletAddr);
      return { error: flashUserError(e) };
    } finally {
      setActionLoading(false);
    }
  }, [buildAndSend, ensureFlashBasketDelegated, oneTapTradeParams, positions, refresh, token, walletAddr, walletMismatch]);

  const clearError = useCallback(() => setError(''), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  return {
    dex: 'flash',
    connected: !!walletAddr,
    hasWallet: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    spotUsdc: null,
    dataReady: !loading,
    accountReady: !!walletAddr,
    loading: loading || actionLoading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    walletMismatch,
    registeredEvmWallet: registeredFlashWallet,
    apiWalletAddr: accountOwner,
    hasReferrer: true,
    referralUrl: config?.app_url || 'https://flash.trade',
    oneTapTrading,
    setOneTapTradingEnabled,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder: async () => ({ error: 'Flash cancel order is not wired yet. Use Flash Trade directly for order management.' }),
    closePosition,
    setLeverage: async () => ({ ok: true }),
    depositToPacifica,
    withdraw,
    activate: async () => ({ ok: true }),
    disconnect: async () => ({ ok: true }),
    setTpsl,
    setMarginMode: async () => ({ ok: true }),
    moveSpotToPerp: async () => ({ error: 'Flash uses wallet collateral directly.' }),
  };
}
