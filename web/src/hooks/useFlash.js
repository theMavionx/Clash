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

const FUTURES_API = '/api/futures';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const POLL_MS = 12_000;
const FLASH_WS_INTERVAL_MS = 1000;
const FLASH_DEFAULT_V2_RPC = 'https://flashtrade.magicblock.app';
const FLASH_V2_PROGRAM_ID = 'FTv2RxXarPfNta45HTTMVaGvjzsGg27FXJ3hEKWBhrzV';
const FLASH_ONE_TAP_EXPIRY_MINUTES = Math.max(10, Math.min(24 * 60, Number(import.meta.env.VITE_FLASH_ONE_TAP_EXPIRY_MINUTES || 24 * 60)));
const FLASH_ONE_TAP_TOPUP_LAMPORTS = Math.max(0, Math.min(20_000_000, Number(import.meta.env.VITE_FLASH_ONE_TAP_TOPUP_LAMPORTS || 1_000_000)));
const FLASH_ONE_TAP_MIN_VALID_SECONDS = 60;
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
    ...patch,
  };
}

function flashOneTapIsUsable(agent, owner) {
  if (!agent?.enabled || !agent?.delegated || !agent?.keypair) return false;
  if (publicKeyText(agent.owner) !== publicKeyText(owner)) return false;
  if (!publicKeyText(agent.publicKey) || !publicKeyText(agent.sessionToken)) return false;
  if (agent.targetProgram && publicKeyText(agent.targetProgram) !== FLASH_V2_PROGRAM_ID) return false;
  const validUntil = Number(agent.validUntil || 0);
  return validUntil > Math.ceil(Date.now() / 1000) + FLASH_ONE_TAP_MIN_VALID_SECONDS;
}

function flashSessionTokenPda(sessionSigner, owner) {
  const sessionProgram = GPLSESSION_PROGRAMS['mainnet-beta'];
  const [sessionToken] = PublicKey.findProgramAddressSync([
    Buffer.from('session_token'),
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

function txRequiredSignerKeys(tx) {
  try {
    if (tx instanceof VersionedTransaction) {
      const count = tx.message?.header?.numRequiredSignatures || 0;
      return tx.message.staticAccountKeys.slice(0, count).map(key => key.toBase58());
    }
    return (tx.signatures || []).map(row => row.publicKey?.toBase58?.()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeSymbol(value) {
  return String(value || 'SOL').toUpperCase().replace(/[-/](PERP|USD|USDC)$/i, '').trim();
}

function normalizeTradeType(side) {
  const s = String(side || '').toUpperCase();
  if (s === 'ASK' || s === 'SELL' || s === 'SHORT') return 'SHORT';
  if (s === 'SWAP') return 'SWAP';
  return 'LONG';
}

function flashPositionKey(pos = {}) {
  return String(
    pos.positionKey
    || pos.position_key
    || pos.publicKey
    || pos.pubkey
    || pos.key
    || pos.address
    || ''
  ).trim();
}

function flashPositionSymbol(pos = {}) {
  return normalizeSymbol(pos.outputTokenSymbol || pos.output_token_symbol || pos.token || pos.symbol || pos.market || '');
}

function flashPositionTradeType(pos = {}) {
  return normalizeTradeType(pos.tradeType || pos.trade_type || pos.side || pos.direction || '');
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
    pos.collateral_usd
    ?? pos.collateralUsd
    ?? pos.input_usd_ui
    ?? pos.inputUsdUi
    ?? pos.margin
    ?? 0
  );
  const entry = Number(pos.entry_price ?? pos.entryPrice ?? pos.avgEntryPrice ?? pos.averageEntryPrice ?? pos.price ?? 0);
  const amount = Number(pos.amount ?? pos.size ?? pos.tokenAmount ?? (entry > 0 && notional > 0 ? notional / entry : collateral || notional || 0));
  return {
    ...pos,
    symbol: symbol || pos.symbol,
    side: tradeType === 'SHORT' ? 'ask' : 'bid',
    amount: String(Number.isFinite(amount) && amount > 0 ? amount : collateral || notional || 0),
    margin: String(Number.isFinite(collateral) && collateral > 0 ? collateral : notional || amount || 0),
    size_usd: Number.isFinite(notional) && notional > 0 ? notional : undefined,
    notional_usd: Number.isFinite(notional) && notional > 0 ? notional : Number(pos.notional_usd || 0),
    entry_price: entry || pos.entry_price,
    leverage: collateral > 0 && notional > 0 ? Math.round((notional / collateral) * 10) / 10 : (Number(pos.leverage) || 1),
    positionKey: flashPositionKey(pos),
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
  const ratio = Math.max(0, Math.min(0.95, collateralUsd / sizeUsd));
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

function derivedFlashPnl({ side, entry, mark, amount }) {
  if (!(entry > 0) || !(mark > 0) || !(amount > 0)) return null;
  return (mark - entry) * amount * (side === 'SHORT' ? -1 : 1);
}

function flashMetricPnl({ metric, side, entry, mark, amount }) {
  const apiPnl = numberFromUi(metric.pnlWithoutFeeUsdUi ?? metric.pnlWithFeeUsdUi);
  const derived = derivedFlashPnl({ side, entry, mark, amount });
  if (derived == null) return apiPnl;
  const apiHasOppositeSign = Math.abs(apiPnl) >= 0.01
    && Math.abs(derived) >= 0.01
    && Math.sign(apiPnl) !== Math.sign(derived);
  const apiIsFarFromMarkPnl = Math.abs(apiPnl - derived) > Math.max(0.05, Math.abs(derived) * 3);
  return apiHasOppositeSign || apiIsFarFromMarkPnl ? derived : apiPnl;
}

function flashPositionFromMetric(marketPubkey, metric = {}, priceRows = []) {
  const tradeType = normalizeTradeType(metric.side || metric.sideUi);
  const symbol = normalizeSymbol(metric.marketSymbol || metric.symbol || marketPubkey);
  const priceMap = flashPriceMap(priceRows);
  const collateralUsd = numberFromUi(metric.collateralUsdUi);
  const sizeUsd = numberFromUi(metric.sizeUsdUi);
  const entry = numberFromUi(metric.entryPriceUi);
  const amount = numberFromUi(metric.sizeAmountUi);
  const mark = numberFromUi(priceMap.get(symbol));
  const pnl = flashMetricPnl({ metric, side: tradeType, entry, mark, amount });
  const apiLiq = numberFromUi(metric.liquidationPriceUi);
  const leverage = numberFromUi(metric.leverageUi);
  const isDust = isFlashDustMetric(metric);
  const positionEquity = collateralUsd + pnl;
  const equityLeverage = positionEquity > 0 && sizeUsd > 0 ? sizeUsd / positionEquity : 0;
  const collateralLeverage = collateralUsd > 0 && sizeUsd > 0 ? sizeUsd / collateralUsd : 0;
  const displayLev = equityLeverage > 0 ? equityLeverage : collateralLeverage;
  return {
    marketPubkey,
    marketSymbol: symbol,
    symbol,
    side: tradeType === 'SHORT' ? 'ask' : 'bid',
    side_label: tradeType.toLowerCase(),
    tradeType,
    collateralSymbol: metric.collateralSymbol || 'USDC',
    entryPriceUi: metric.entryPriceUi,
    entry_price: entry || metric.entryPriceUi,
    mark_price: mark || undefined,
    sizeAmountUi: metric.sizeAmountUi,
    amount: metric.sizeAmountUi,
    sizeUsdUi: metric.sizeUsdUi,
    size_usd: sizeUsd,
    notional_usd: sizeUsd,
    collateralUsdUi: metric.collateralUsdUi,
    margin: metric.collateralUsdUi,
    pnlWithFeeUsdUi: metric.pnlWithFeeUsdUi,
    pnlWithoutFeeUsdUi: metric.pnlWithoutFeeUsdUi,
    pnl_usd: isDust ? 0 : pnl,
    pnl_pct: isDust ? 0 : (collateralUsd > 0 ? (pnl / collateralUsd) * 100 : undefined),
    liquidationPriceUi: metric.liquidationPriceUi,
    liquidation_price: isDust ? undefined : (displayLiquidationPrice({ side: tradeType, entry, sizeUsd, collateralUsd, apiLiq }) || metric.liquidationPriceUi),
    leverage: isDust ? undefined : (displayLev > 0 ? Math.round(displayLev * 10) / 10 : (Number.isFinite(leverage) && leverage > 0 ? leverage : 1)),
    effective_leverage: Number.isFinite(leverage) && leverage > 0 ? leverage : undefined,
    inputUsdUi: metric.sizeUsdUi,
    _flashDust: isDust,
    _flashDustUsd: isDust ? sizeUsd : undefined,
    positionKey: `${symbol}:${tradeType}`,
    source: 'flash_v2_ws',
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
  const positions = Object.entries(positionMetrics).map(([marketPubkey, metric]) => (
    flashPositionFromMetric(marketPubkey, metric, priceRows)
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
  const availableUsdc = Math.max(0, hasBalanceSource ? (explicitAvailable ?? accountUsdc) : (existingAvailable ?? accountUsdc));
  const explicitEquity = finiteNumberOrNull(snapshot.account_equity ?? snapshot.equity ?? snapshot.balance);
  const equity = Math.max(0, explicitEquity ?? (availableUsdc + marginUsed + pnlUsd));
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
  return kind === 'setup'
    || /init-|deposit-direct|delegate-basket|request-withdrawal|execute-withdrawal/.test(endpoint)
    || /init-|deposit-direct|delegate-basket|request-withdrawal|execute-withdrawal/.test(builder);
}

function flashUserError(error) {
  const message = String(error?.message || error?.data?.detail || error?.data?.error || error || '');
  if (/user rejected|rejected the request|request blocked|blocked/i.test(message)) {
    return 'Wallet rejected or blocked the Flash transaction. Review the wallet prompt and try again.';
  }
  if (/insufficient|custom program error:\s*0x1/i.test(message)) {
    return 'Insufficient USDC/SOL for the Flash trade or transaction fees.';
  }
  return message || 'Flash order failed';
}

function flashTxBase64(build = {}) {
  return build.transactionBase64 || build.transaction || build.transactions?.[0] || '';
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

export function useFlash() {
  const { dex } = useDex();
  const player = usePlayer();
  const solWallet = useWallet();
  const { connection } = useConnection();
  const isActiveDex = dex === 'flash';
  const token = playerToken(player);
  const walletAddr = isActiveDex ? solanaAddress(solWallet) : '';

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
  const walletUsdcRef = useRef(null);
  const flashApiUrlRef = useRef('https://flashapi.trade');
  const wsReconnectRef = useRef(null);
  const oneTapAgentRef = useRef(null);
  const [oneTapTrading, setOneTapTrading] = useState(() => disabledFlashOneTapState());

  useEffect(() => { pricesRef.current = prices; }, [prices]);
  useEffect(() => { accountRef.current = account; }, [account]);
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

  const walletMismatch = useMemo(() => {
    const solanaLike = registeredDexWallet(player, 'flash', 'solana');
    return !!solanaLike && !!walletAddr && solanaLike !== walletAddr;
  }, [player, walletAddr]);

  useEffect(() => {
    if (!isActiveDex || !token || !walletAddr || walletMismatch) return;
    fetchJson(`${GAME_API}/players/dex-accounts/flash/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-token': token },
      body: JSON.stringify({
        wallet: walletAddr,
        walletSource: solWallet?.wallet?.adapter?.name || 'solana-wallet',
      }),
    }).catch(e => console.warn('[Flash] dex wallet link failed:', e?.message || e));
  }, [isActiveDex, token, walletAddr, walletMismatch, solWallet?.wallet?.adapter?.name]);

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
      if (walletAddr && !walletMismatch) {
        const accountPromise = token
          ? fetchJson(`${FUTURES_API}/flash/account?address=${encodeURIComponent(walletAddr)}`, {
            headers: { 'x-token': token, 'x-dex': 'flash' },
          }).catch(async (e) => {
            if (e?.status !== 401 && e?.status !== 409) throw e;
            return fetchJson(`${FUTURES_API}/account?dex=flash&address=${encodeURIComponent(walletAddr)}`);
          })
          : fetchJson(`${FUTURES_API}/account?dex=flash&address=${encodeURIComponent(walletAddr)}`);
        const acct = await accountPromise;
        const serverUsdc = Number(acct?.wallet_usdc);
        const initialUsdc = Number.isFinite(serverUsdc) ? serverUsdc : null;
        setAccount({
          ...acct,
          balance: acct?.balance ?? acct?.equity ?? 0,
          equity: acct?.equity ?? acct?.balance ?? 0,
          usdc: acct?.usdc ?? acct?.balance ?? 0,
          available_to_spend: acct?.available_to_spend ?? acct?.free_margin ?? 0,
          wallet_usdc: initialUsdc,
        });
        setPositions(rows(acct?.positions).map(normalizeFlashPosition));
        setOrders(rows(acct?.orders));
        setWalletUsdc(initialUsdc);
      } else {
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
        setPositions(prev => prev.map(pos => (
          pos?.metric ? flashPositionFromMetric(pos.marketPubkey || pos.positionKey || pos.symbol, pos.metric, nextPrices) : pos
        )));
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
  }, [account, isActiveDex, markets.length, positions.length, token, walletAddr, walletMismatch]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [isActiveDex, refresh]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch || typeof WebSocket === 'undefined') return undefined;
    let ws = null;
    let closed = false;
    let reconnectMs = 1000;

    const connect = () => {
      if (closed) return;
      const apiUrl = flashApiUrlRef.current || 'https://flashapi.trade';
      ws = new WebSocket(flashWsUrl(apiUrl, walletAddr));
      ws.onopen = () => {
        reconnectMs = 1000;
      };
      ws.onmessage = (event) => {
        let msg = null;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg?.type === 'basket') {
          const normalized = normalizeFlashSnapshot(msg.data || {}, pricesRef.current, accountRef.current || {});
          setAccount(prev => ({
            ...normalized,
            wallet_usdc: normalized.wallet_usdc ?? walletUsdcRef.current ?? prev?.wallet_usdc ?? null,
          }));
          setPositions(normalized.positions);
          setOrders(normalized.orders);
          setError('');
          setLoading(false);
        } else if (msg?.type === 'metrics' && msg.data && typeof msg.data === 'object') {
          setPositions(prev => {
            const metrics = msg.data;
            const next = prev.map(pos => {
              const key = pos.marketPubkey || pos.positionKey || pos.symbol;
              const metric = metrics[key];
              return metric ? flashPositionFromMetric(key, metric, pricesRef.current) : pos;
            });
            const known = new Set(next.map(pos => pos.marketPubkey || pos.positionKey || pos.symbol));
            for (const [marketPubkey, metric] of Object.entries(metrics)) {
              if (!known.has(marketPubkey)) next.push(flashPositionFromMetric(marketPubkey, metric, pricesRef.current));
            }
            const normalized = normalizeFlashSnapshot(
              {
                ...(accountRef.current || {}),
                owner: walletAddr,
                basketPubkey: accountRef.current?.basketPubkey,
                positionMetrics: Object.fromEntries(next.map(pos => [pos.marketPubkey || pos.positionKey || pos.symbol, pos.metric]).filter(([, metric]) => metric)),
                orderMetrics: accountRef.current?.orderMetrics || {},
                source: 'flash_v2_ws_metrics',
              },
              pricesRef.current,
              accountRef.current || {},
              { preserveBalance: true },
            );
            setAccount(prevAccount => ({
              ...normalized,
              wallet_usdc: walletUsdcRef.current ?? prevAccount?.wallet_usdc ?? normalized.wallet_usdc ?? null,
            }));
            return normalized.positions;
          });
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
  }, [isActiveDex, walletAddr, walletMismatch]);

  const claimGold = useCallback(async () => {
    if (!token) return { error: 'Missing game session token' };
    try {
      const data = await fetchJson(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ dex: 'flash' }),
      });
      if (Number(data?.gold || 0) > 0) setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards', ...data });
      return data;
    } catch (e) {
      return { error: e?.message || 'Could not claim Flash gold' };
    }
  }, [token]);

  const confirmSignature = useCallback(async (signature, txConnection = null) => {
    for (let i = 0; i < 30; i += 1) {
      if (txConnection?.getSignatureStatuses) {
        const rpcStatus = await txConnection.getSignatureStatuses([signature]).catch(() => null);
        const value = rpcStatus?.value?.[0];
        if (value?.err) throw new Error(`Flash transaction failed: ${JSON.stringify(value.err)}`);
        if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') return true;
      }
      const status = await fetchJson(`${FUTURES_API}/flash/tx-status?signature=${encodeURIComponent(signature)}`, {
        headers: { 'x-token': token, 'x-dex': 'flash' },
      }).catch(() => null);
      if (status?.found && !status?.err) return true;
      if (status?.err) throw new Error(`Flash transaction failed: ${JSON.stringify(status.err)}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Flash transaction was sent but not confirmed yet');
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

  const oneTapTradeParams = useCallback(async () => {
    const session = await getActiveOneTapSession();
    if (!session) return { params: {}, session: null };
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
    console.info('[Flash tx] decoded', {
      tx: txMessageSummary(tx),
      builder: meta?.builder || 'flash_trade_v2',
      rpc,
      api_blockhash: tx instanceof VersionedTransaction ? tx.message?.recentBlockhash : tx.recentBlockhash,
      magic_router: magicRouter,
      required_signers: requiredSigners,
      one_tap: !!oneTapSession,
    });
    if (!magicRouter && !shouldSkipFlashLocalSimulation(meta)) {
      const simulation = await txConnection.simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: 'confirmed',
      }).catch(e => ({ value: { err: e?.message || String(e) } }));
      if (simulation?.value?.err) {
        throw new Error(`Flash transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
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
    const signature = magicRouter
      ? await (async () => {
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
        return submitted.signature;
      })()
      : await flashTimeout(txConnection.sendRawTransaction(raw, {
        skipPreflight: magicRouter || shouldSkipFlashLocalSimulation(meta),
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      }), 20_000, 'Flash transaction broadcast timed out. Check Phantom activity before retrying.');
    console.info('[Flash tx] raw sent', { signature, rpc, magic_router: magicRouter });
    await confirmSignature(signature, txConnection);
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
        .createSession(
          topUpLamports > 0,
          new anchor.BN(validUntil),
          topUpLamports > 0 ? new anchor.BN(topUpLamports) : null,
        )
        .accounts({
          targetProgram,
          sessionSigner: agent.keypair.publicKey,
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
        target_program: FLASH_V2_PROGRAM_ID,
        valid_until: validUntil,
        top_up_lamports: topUpLamports,
      });
      const setupSignature = await builder.signers([agent.keypair]).rpc();
      await setupConnection.confirmTransaction(setupSignature, 'confirmed').catch(() => null);
      const stored = await markFlashOneTapAgent(walletAddr, {
        enabled: true,
        delegated: true,
        delegatedAt: Date.now(),
        setupSignature,
        sessionToken,
        targetProgram: FLASH_V2_PROGRAM_ID,
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
      const msg = e?.message || 'Flash one tap setup failed';
      console.warn('[Flash one tap] setup failed:', msg, e?.data || '');
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
      const msg = String(e?.message || e?.data?.detail || e?.data?.error || '');
      if (/already|exists|initialized|custom program error:\s*0x0/i.test(msg)) {
        return { skipped: true, reason: msg };
      }
      throw e;
    }
  }, [buildAndSend]);

  const reportTrade = useCallback(async ({ signature, symbol, side, amount, leverage = 1, price, orderType = 'market', notionalUsd, signer = '', sessionToken = '' } = {}) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    try {
      let data = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          data = await fetchJson(`${FUTURES_API}/flash/trade-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'flash' },
            body: JSON.stringify({
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
            }),
          });
          break;
        } catch (e) {
          if (e?.status !== 404 || attempt === 5) throw e;
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }
      if (data?.verified === true) await claimGold();
      return data;
    } catch (e) {
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
    setActionLoading(true);
    try {
      const { params: sessionParams, session: oneTapSession } = await oneTapTradeParams();
      const request = {
        wallet: walletAddr,
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
      return { error: flashUserError(e) };
    } finally {
      setActionLoading(false);
    }
  }, [oneTapTradeParams, refresh, reportTrade, sendBuiltTransaction, token, walletAddr, walletMismatch]);

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
      const build = await fetchJson(`${FUTURES_API}/flash/close-position-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'flash' },
        body: JSON.stringify({
          wallet: walletAddr,
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
      return { error: flashUserError(e) };
    } finally {
      setActionLoading(false);
    }
  }, [oneTapTradeParams, positions, refresh, reportTrade, sendBuiltTransaction, token, walletAddr, walletMismatch]);

  const depositToPacifica = useCallback(async (amount) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered Flash wallet' };
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return { error: 'Enter a positive Flash deposit amount' };
    setActionLoading(true);
    try {
      const hadBasket = !!account?.basketPubkey;
      if (!hadBasket) {
        await tryBuildAndSend('/flash/init-deposit-ledger-tx');
        await tryBuildAndSend('/flash/init-basket-tx');
      }
      const deposit = await buildAndSend('/flash/deposit-direct-tx', { amount: String(value) });
      if (!hadBasket) {
        await buildAndSend('/flash/delegate-basket-tx', { payer: walletAddr });
      }
      window.setTimeout(() => refresh().catch(() => null), 800);
      return {
        ok: true,
        signature: deposit.signature,
        info: 'Flash v2 deposit sent. Basket balance updates after confirmation.',
      };
    } catch (e) {
      return { error: flashUserError(e) };
    } finally {
      setActionLoading(false);
    }
  }, [account?.basketPubkey, buildAndSend, refresh, token, tryBuildAndSend, walletAddr, walletMismatch]);

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
      return { error: flashUserError(e) };
    } finally {
      setActionLoading(false);
    }
  }, [buildAndSend, oneTapTradeParams, positions, refresh, token, walletAddr, walletMismatch]);

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
    registeredEvmWallet: registeredDexWallet(player, 'flash', 'solana') || '',
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
