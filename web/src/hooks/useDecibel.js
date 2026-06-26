// Decibel perp DEX hook — same public shape as useAvantis() / usePacifica()
// so FuturesPanel can branch on `useDex()` and treat all three identically.
//
// Architecture:
//   • Login wallet (Petra) — signs ONCE per session: api-wallet delegation
//     + builder-fee approval. After that it's idle.
//   • API wallet — server-side Ed25519 signer controlled by server-futures.
//     The browser never stores the raw private key; Petra only signs the
//     one-time delegation that lets this signer place orders.
//   • Decibel server-state (positions, orders, balances) — REST via the SDK
//     read client; same 5 s polling cadence as the Avantis hook.
//   • Builder fee — `approveMaxBuilderFee` once per subaccount. Every order
//     carries `builderAddr` + the configured builder fee from decibel.js.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import {
  BUILDER_ADDR, BUILDER_FEE_BPS, isBuilderConfigured,
  getReadClient, getTimeInForce,
  amountToChainUnits, getPrimarySubaccountAddr,
  DECIBEL_PACKAGE_MAINNET, DECIBEL_USDC_MAINNET,
  REFERRAL_CODE,
} from '../lib/decibel';

// Move function paths for the calls we route through Petra (one-time or
// ownership-related). Verified against `@decibeltrade/sdk/dist/write.js`
// — these are the EXACT strings the SDK uses internally; if Decibel ever
// renames the entry module, the SDK will be updated and so should this.
const MOVE_FN = {
  createSubaccount: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::create_new_subaccount`,
  delegateTrading: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::delegate_trading_to_for_subaccount`,
  approveBuilder: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::approve_max_builder_fee_for_subaccount`,
  deposit: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::deposit_to_subaccount_at`,
  withdraw: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::withdraw_from_cross_collateral`,
};

// APT gas policy for the API wallet when Decibel write txs are NOT sponsored
// by an Aptos Gas Station.
//
// Aptos validators run a static-fee check BEFORE simulation:
// `account_balance >= max_gas_amount * gas_unit_price`. With the
// The server signs Decibel txs with a fixed `max_gas_amount = 200_000` and
// a network-fetched `gas_unit_price` (~100 octa). Threshold
// = 200_000 × 100 = 20_000_000 octa = 0.2 APT.
//
// We top up a little above the current validator threshold for comfort, but
// do NOT use a large buffer as a hard readiness gate. Some users already
// funded enough to pass current validator admission, and forcing 0.5 APT keeps
// them trapped behind Activate even though trading works. If gas is actually
// too low, the trade call fails with a clear refill error and Activate can top
// it up.
const API_WALLET_READY_APT = 0.2;
const API_WALLET_READY_OCTA = BigInt(Math.round(API_WALLET_READY_APT * 1e8));

// SDK's `bpsToChainUnits`: contract uses FEE_PRECISION = 10000 (= 1%), so 1
// basis point = 100 chain units. Replicated here so we don't have to import
// from the SDK's `write.js` (it's not exported — internal helper).
function bpsToChainUnits(bps) { return Math.round(Number(bps) * 100); }

// Decibel's API can be slow under load (Aptos block time ~250ms but the
// indexer can lag a couple of seconds). Cap reads so a stuck request
// doesn't block the polling loop forever.
const READ_TIMEOUT_MS = 8_000;
const ACCOUNT_READ_TIMEOUT_MS = READ_TIMEOUT_MS;
const DECIBEL_STATE_POLL_MS = 45_000;
const DECIBEL_PRICE_POLL_MS = 15_000;
const ACCOUNT_WARN_THROTTLE_MS = 60_000;
const ACCOUNT_BACKOFF_BASE_MS = 10_000;
const ACCOUNT_BACKOFF_MAX_MS = 60_000;
const TX_WAIT_TIMEOUT_MS = 45_000;
const APTOS_FULLNODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const FUTURES_API = '/api/futures';
const DECIBEL_REWARD_CLAIM_DELAY_MS = 1_500;
const DECIBEL_CLOSE_CONFIRM_TIMEOUT_MS = 20_000;
const BUILDER_APPROVAL_VIEW = `${DECIBEL_PACKAGE_MAINNET}::builder_code_registry::get_approved_max_fee`;
const TRADING_DELEGATION_VIEW = `${DECIBEL_PACKAGE_MAINNET}::dex_accounts::view_delegated_permissions`;

// USDC has 6 decimals on Aptos and IS the collateral asset. Used for
// deposits/withdrawals and any USD-denominated balance read.
const USDC_DECIMALS = 6;

function aptosApiKey() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APTOS_NODE_API_KEY) || '';
}

function aptosJsonHeaders() {
  const key = aptosApiKey();
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

async function aptosView(functionId, args = [], typeArguments = []) {
  const r = await fetch(`${APTOS_FULLNODE}/view`, {
    method: 'POST',
    headers: aptosJsonHeaders(),
    body: JSON.stringify({
      function: functionId,
      type_arguments: typeArguments,
      arguments: args,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Aptos view ${functionId} failed: ${r.status} ${body || r.statusText}`);
  }
  return r.json();
}

function timeoutError(ms, label) {
  return new Error(`${label || 'request'} timed out after ${ms}ms`);
}

function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError(ms, label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sameDecibelPosition(position, symbol, side) {
  const normalizeSide = value => {
    const raw = String(value || '').toLowerCase();
    if (raw === 'long') return 'bid';
    if (raw === 'short') return 'ask';
    return raw;
  };
  return String(position?.symbol || '').toUpperCase() === String(symbol || '').toUpperCase()
    && normalizeSide(position?.side) === normalizeSide(side);
}

function isAbortLikeError(e) {
  const name = String(e?.name || '');
  const msg = String(e?.message || e || '');
  return name === 'AbortError' || /aborted|aborterror/i.test(msg);
}

async function withAbortableRead(factory, ms, label) {
  if (typeof AbortController === 'undefined') {
    return withTimeout(factory({}), ms, label);
  }
  const controller = new AbortController();
  let timedOut = false;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError(ms, label));
    }, ms);
  });
  try {
    return await Promise.race([
      factory({ signal: controller.signal }),
      timeout,
    ]);
  } catch (e) {
    if (timedOut || isAbortLikeError(e)) throw timeoutError(ms, label);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    if (!timedOut) controller.abort();
  }
}

function txHashFrom(response) {
  return response?.hash
    || response?.transactionHash
    || response?.tx_hash
    || response?.transaction_hash
    || null;
}

async function waitForAptosTransaction(hash, label = 'transaction') {
  if (!hash) throw new Error(`${label} did not return a transaction hash`);
  const deadline = Date.now() + TX_WAIT_TIMEOUT_MS;
  let lastStatus = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${APTOS_FULLNODE}/transactions/by_hash/${hash}`, {
        headers: aptosJsonHeaders(),
      });
      if (r.ok) {
        const tx = await r.json();
        lastStatus = tx?.vm_status || tx?.type || null;
        if (tx?.type !== 'pending_transaction') {
          if (tx?.success === false) {
            throw new Error(`${label} failed on-chain: ${tx.vm_status || 'unknown VM status'}`);
          }
          return tx;
        }
      } else {
        lastStatus = `${r.status} ${r.statusText}`;
      }
    } catch (e) {
      if (/failed on-chain/i.test(String(e?.message || e))) throw e;
      lastStatus = e?.message || String(e);
    }
    await new Promise(r => setTimeout(r, 750));
  }
  throw new Error(`${label} was submitted but not confirmed after ${Math.round(TX_WAIT_TIMEOUT_MS / 1000)}s${lastStatus ? ` (${lastStatus})` : ''}`);
}

async function submitAndWait(loginSignAndSubmit, payload, label) {
  const response = await loginSignAndSubmit(payload);
  const hash = txHashFrom(response);
  const confirmed = await waitForAptosTransaction(hash, label);
  return { response, hash, confirmed };
}

async function pollUntil(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 750));
  }
  throw new Error(`${label} did not verify in time${lastErr?.message ? `: ${lastErr.message}` : ''}`);
}

// ───── Per-market decimal helpers ─────────────────────────────────────────
// Decibel encodes prices and sizes per-market with `pxDecimals` / `szDecimals`
// from each market's config (per docs/formatting-prices-sizes). A flat 1e6
// scaler is wrong: a 9-decimal market under-scales 1000x and the engine
// either rejects the order or fills at a wildly wrong tick. We always read
// the per-market decimals from the cached market list and apply them here.
function priceToChainUnits(human, market) {
  const d = Number(market?.px_decimals ?? market?.pxDecimals ?? 6);
  // Number, not BigInt: the SDK's `roundToTickSize` does
  // `Math.round(price / tickSize)` and JS throws TypeError on
  // BigInt/Number mixing. Chain-unit prices fit comfortably in
  // Number range (≤ 2^53) for any sane USD-quoted perp.
  return Math.round(Number(human) * Math.pow(10, d));
}
// Returns the market's tick_size in chain units (BigInt), or 0n if missing.
// Decibel REST exposes `tick_size` already in chain units (e.g. 1000 means
// 0.001 USD when px_decimals=6). The SDK's `roundToTickSize` expects the
// same chain-unit form; we forward it via `placeOrder({tickSize})` and the
// SDK rounds price/stopPrice/TP/SL automatically.
function tickSizeChainUnits(market) {
  const t = market?.tick_size ?? market?.tickSize;
  if (t == null) return 0;
  return Number(t);
}
function roundPriceUnitsToTick(priceUnits, market) {
  const p = Number(priceUnits);
  const t = Number(tickSizeChainUnits(market));
  if (!Number.isFinite(p)) throw new Error('Invalid Decibel trigger price');
  if (!Number.isFinite(t) || t <= 0) return Math.max(1, Math.round(p));
  return Math.max(1, Math.floor(p / t) * t);
}
const DECIBEL_TP_LIMIT_BUFFER_BPS = 35;
const DECIBEL_TP_MIN_LIMIT_TICKS = 5;
const DECIBEL_SL_LIMIT_BUFFER_BPS = 500;
const DECIBEL_SL_MIN_LIMIT_TICKS = 50;
function tpslLimitPriceUnits(triggerUnits, market, isLong, kind = 'tp') {
  const tick = Math.max(1, Number(tickSizeChainUnits(market)) || 1);
  const trigger = roundPriceUnitsToTick(triggerUnits, market);
  const isStopLoss = kind === 'sl';
  const bufferBps = isStopLoss ? DECIBEL_SL_LIMIT_BUFFER_BPS : DECIBEL_TP_LIMIT_BUFFER_BPS;
  const minTicks = isStopLoss ? DECIBEL_SL_MIN_LIMIT_TICKS : DECIBEL_TP_MIN_LIMIT_TICKS;
  const pctBuffer = Math.ceil(trigger * bufferBps / 10000);
  const minBuffer = tick * minTicks;
  const buffer = Math.max(minBuffer, pctBuffer);
  // Close-long orders sell, so their limit must be below the trigger. Close-short
  // orders buy, so their limit must be above the trigger. Stop-loss gets a much
  // wider buffer so it behaves closer to a market stop and is less likely to
  // leave a partially-filled position unprotected during a fast move.
  return Math.max(tick, roundPriceUnitsToTick(isLong ? trigger - buffer : trigger + buffer, market));
}
function sizeToChainUnits(human, market) {
  const d = Number(market?.sz_decimals ?? market?.szDecimals ?? 6);
  const raw = BigInt(Math.round(Number(human) * Math.pow(10, d)));
  // Round DOWN to the market's `lot_size` (also in chain units). The
  // engine aborts with `ESIZE_NOT_RESPECTING_LOT_SIZE` if size isn't an
  // exact multiple. SDK doesn't round size for us — we must.
  const lot = market?.lot_size ?? market?.lotSize;
  if (lot == null) return raw;
  const lotN = BigInt(Math.round(Number(lot)));
  if (lotN <= 0n) return raw;
  return (raw / lotN) * lotN;
}
function minSizeChainUnits(market) {
  const min = market?.min_size ?? market?.minSize;
  if (min == null) return 0n;
  try { return BigInt(Math.round(Number(min))); }
  catch { return 0n; }
}
function assertTradableSize(sizeUnits, market) {
  if (sizeUnits <= 0n) throw new Error('Order size is below this market lot size');
  const min = minSizeChainUnits(market);
  if (min > 0n && sizeUnits < min) {
    const humanMin = sizeFromChainUnits(min, market);
    throw new Error(`Order size is below Decibel minimum (${humanMin} ${market?.symbol || 'base'})`);
  }
  return sizeUnits;
}
function priceFromChainUnits(raw, market) {
  const d = Number(market?.px_decimals ?? market?.pxDecimals ?? 6);
  return Number(raw) / Math.pow(10, d);
}
function sizeFromChainUnits(raw, market) {
  const d = Number(market?.sz_decimals ?? market?.szDecimals ?? 6);
  return Number(raw) / Math.pow(10, d);
}

function positiveNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeMaybeChainPrice(value, market) {
  const n = positiveNumberOrNull(value);
  if (n == null) return null;
  if (!market) return n;
  const d = Number(market?.px_decimals ?? market?.pxDecimals ?? 6);
  const threshold = Math.pow(10, Math.max(1, d - 1));
  return Number.isInteger(n) && n >= threshold ? priceFromChainUnits(n, market) : n;
}

function triggerPriceFromCondition(condition) {
  const matches = String(condition || '').match(/\d+(?:\.\d+)?/g);
  if (!matches || !matches.length) return null;
  return positiveNumberOrNull(matches[matches.length - 1]);
}

function orderTypeText(order) {
  return String(order?.order_type ?? order?.orderType ?? order?.ot ?? '');
}

function tpslKindFromOrder(order) {
  const text = `${orderTypeText(order)} ${order?.trigger_condition || order?.triggerCondition || ''}`.toLowerCase();
  if (/\b(take\s*profit|take-profit|tp)\b/.test(text)) return 'tp';
  if (/\b(stop\s*loss|stop-loss|stop|sl)\b/.test(text)) return 'sl';
  return null;
}

function tpslPriceFromOrder(order) {
  const trigger = triggerPriceFromCondition(order?.trigger_condition ?? order?.triggerCondition);
  return trigger
    ?? positiveNumberOrNull(order?.take_profit ?? order?.takeProfit ?? order?.tp)
    ?? positiveNumberOrNull(order?.stop_loss ?? order?.stopLoss ?? order?.sl)
    ?? positiveNumberOrNull(order?.price);
}

// Reads APT balance for an Aptos address as raw octa (1 APT = 1e8 octa).
// Uses the FA `primary_fungible_store::balance` view with metadata 0xa,
// which is correct for both legacy CoinStore and FA-only wallets after
// Aptos's 2024 APT-to-FA migration. Returns 0n if the wallet has no
// primary fungible store yet (= never received APT).
async function fetchAptBalanceOcta(addr) {
  if (!addr) return 0n;
  try {
    const j = await aptosView(
      '0x1::primary_fungible_store::balance',
      [addr, '0xa'],
      ['0x1::fungible_asset::Metadata'],
    );
    const v = Array.isArray(j) ? j[0] : j;
    return v != null ? BigInt(String(v)) : 0n;
  } catch {
    return 0n;
  }
}

function normalizeAptosAddress(addr) {
  const raw = String(addr || '').trim().toLowerCase();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!/^[0-9a-f]+$/.test(hex)) return raw;
  return `0x${hex.padStart(64, '0')}`;
}

function sameAptosAddress(a, b) {
  return !!a && !!b && normalizeAptosAddress(a) === normalizeAptosAddress(b);
}

// ───── Normalisers ────────────────────────────────────────────────────────
// Each one takes the raw API record + the cached markets list (so we know
// the per-market decimals) and projects onto the shape FuturesPanel expects.

function findMarket(markets, identifier) {
  if (!Array.isArray(markets)) return null;
  return markets.find(m =>
    m.market_addr === identifier || m.market_name === identifier ||
    m.symbol === identifier
  ) || null;
}

function normalizePosition(p, markets) {
  // Decibel REST `/api/v1/user_positions` shape (zod-verified against the
  // SDK's UserPositionSchema):
  //   market: addr (NOT market_name — the readable name lives only in
  //           the markets list, so we resolve via findMarket)
  //   size:   signed Number, positive = long, negative = short. Already in
  //           HUMAN units (= 75.0 means 75 FARTCOIN), NOT chain units.
  //   entry_price: HUMAN USD (= 0.19941, NOT 199410)
  //   estimated_liquidation_price: HUMAN USD
  //   user_leverage: integer (3, 5, 10…)
  //   unrealized_funding: cumulative funding cost paid/earned, NOT pnl
  //   is_isolated: bool
  //
  // No marginUsed / unrealized_pnl fields — we compute:
  //   notional = |size| * entry → margin = notional / leverage
  //   unrealized pnl = (markPx - entry) * size  (signed in size's sign)
  // Mark price comes from the cached `prices` array via the symbol; if
  // we don't have it yet we leave pnl=0 until the next poll.
  const marketAddr = p.market || p.marketAddr || p.market_addr || '';
  const m = findMarket(markets, marketAddr);
  const symbol = m ? m.symbol : String(marketAddr).slice(0, 6).toUpperCase();

  const sizeSigned = Number(p.size ?? 0);
  const isLong = sizeSigned >= 0;
  const sizeAbs = Math.abs(sizeSigned);
  const entry = Number(p.entry_price ?? 0);
  const liq = Number(p.estimated_liquidation_price ?? 0);
  const lev = Number(p.user_leverage ?? 1) || 1;
  const notional = sizeAbs * entry;
  const margin = lev > 0 ? notional / lev : 0;
  const tpTrigger = normalizeMaybeChainPrice(p.tp_trigger_price ?? p.tpTriggerPrice ?? p.take_profit ?? p.takeProfit ?? p.tp, m);
  const tpLimit = normalizeMaybeChainPrice(p.tp_limit_price ?? p.tpLimitPrice, m);
  const slTrigger = normalizeMaybeChainPrice(p.sl_trigger_price ?? p.slTriggerPrice ?? p.stop_loss ?? p.stopLoss ?? p.sl, m);
  const slLimit = normalizeMaybeChainPrice(p.sl_limit_price ?? p.slLimitPrice, m);
  // Mark-to-market PnL is derived by FuturesPanel from live prices. Keep this
  // null so a synthetic zero does not override the live formula.
  return {
    symbol,
    side: isLong ? 'bid' : 'ask',
    amount: String(sizeAbs),
    entry_price: String(entry),
    margin: String(margin),
    leverage: String(lev),
    liquidation_price: String(liq),
    pnl: null,
    market_addr: marketAddr || (m && m.market_addr) || null,
    is_isolated: !!p.is_isolated,
    tp_order_id: p.tp_order_id ?? p.tpOrderId ?? null,
    tp_trigger_price: tpTrigger == null ? null : String(tpTrigger),
    tp_limit_price: tpLimit == null ? null : String(tpLimit),
    take_profit: tpTrigger == null ? null : String(tpTrigger),
    tp: tpTrigger == null ? null : String(tpTrigger),
    sl_order_id: p.sl_order_id ?? p.slOrderId ?? null,
    sl_trigger_price: slTrigger == null ? null : String(slTrigger),
    sl_limit_price: slLimit == null ? null : String(slLimit),
    stop_loss: slTrigger == null ? null : String(slTrigger),
    sl: slTrigger == null ? null : String(slTrigger),
    has_fixed_sized_tpsls: !!p.has_fixed_sized_tpsls,
  };
}

function normalizeOrder(o, markets) {
  const marketId = o.market || o.marketAddr || o.market_addr || '';
  const marketName = o.marketName || o.market_name || '';
  const m = findMarket(markets, marketId) || findMarket(markets, marketName);
  const symbol = m
    ? m.symbol
    : (String(o.symbol || o.s || marketName || '').split(/[-/]/)[0].toUpperCase()
      || String(marketId || '').slice(0, 8).toUpperCase());
  const isBuy = o.isBuy ?? o.is_buy ?? false;
  const sizeRaw = o.remaining_size ?? o.orig_size ?? o.size_delta ?? o.size ?? 0;
  const type = orderTypeText(o) || (o.isTrigger || o.is_trigger ? 'STOP_LIMIT' : 'LIMIT');
  const kind = tpslKindFromOrder({ ...o, order_type: type });
  const triggerPrice = kind ? tpslPriceFromOrder(o) : null;
  const price = positiveNumberOrNull(o.price)
    ?? normalizeMaybeChainPrice(o.limit_price ?? o.limitPrice, m)
    ?? triggerPrice
    ?? 0;
  const size = positiveNumberOrNull(sizeRaw) ?? 0;
  return {
    symbol,
    side: isBuy ? 'bid' : 'ask',
    amount: String(size),
    initial_amount: String(size),
    price: String(price),
    stop_price: triggerPrice == null ? '' : String(triggerPrice),
    leverage: String(o.leverage ?? 1),
    order_type: type,
    reduce_only: !!(o.reduce_only ?? o.reduceOnly ?? o.is_reduce_only),
    is_tpsl: !!(o.is_tpsl ?? o.isTpsl) || !!kind,
    trigger_condition: o.trigger_condition ?? o.triggerCondition ?? '',
    order_direction: o.order_direction ?? o.orderDirection ?? '',
    take_profit: kind === 'tp' && triggerPrice != null ? String(triggerPrice) : null,
    stop_loss: kind === 'sl' && triggerPrice != null ? String(triggerPrice) : null,
    tif: String(o.timeInForce || o.time_in_force || 'GTC'),
    order_id: String(o.orderId ?? o.order_id ?? o.id ?? ''),
    market_addr: marketId || (m && m.market_addr) || null,
    market_name: marketName || (m && m.market_name) || '',
    client_order_id: o.client_order_id ?? o.clientOrderId ?? null,
  };
}

function orderMatchesPosition(order, position) {
  if (!order || !position || !tpslKindFromOrder(order)) return false;
  if (order.symbol && position.symbol && order.symbol !== position.symbol) return false;
  if (order.market_addr && position.market_addr && !sameAptosAddress(order.market_addr, position.market_addr)) return false;
  const direction = String(order.order_direction || '').toLowerCase();
  if (direction.includes('close long') && position.side !== 'bid') return false;
  if (direction.includes('close short') && position.side !== 'ask') return false;
  return true;
}

function mergeTpslOrdersIntoPositions(positions, orders) {
  if (!Array.isArray(positions) || !positions.length || !Array.isArray(orders) || !orders.length) {
    return positions;
  }
  return positions.map(position => {
    let next = position;
    for (const order of orders) {
      if (!orderMatchesPosition(order, position)) continue;
      const kind = tpslKindFromOrder(order);
      const price = tpslPriceFromOrder(order);
      if (price == null) continue;
      if (next === position) next = { ...position };
      if (kind === 'tp') {
        next.tp_order_id = order.order_id || next.tp_order_id || null;
        next.tp_trigger_price = String(price);
        next.take_profit = String(price);
        next.tp = String(price);
      } else if (kind === 'sl') {
        next.sl_order_id = order.order_id || next.sl_order_id || null;
        next.sl_trigger_price = String(price);
        next.stop_loss = String(price);
        next.sl = String(price);
      }
    }
    return next;
  });
}

function normalizeMarket(raw, idx) {
  // Markets carry the canonical name like "BTC-USD" / "APT-USD" plus
  // per-market scaling info — we cache pxDecimals/szDecimals on the
  // normalized record so subsequent normalizers for that market can find
  // them by symbol or address lookup.
  const name = String(raw.name || raw.marketName || raw.market_name || '');
  const [base, quote = 'USD'] = name.split(/[-/]/);
  return {
    symbol: (base || name).toUpperCase(),
    pair: `${base}/${quote}`.toUpperCase(),
    base: (base || '').toUpperCase(),
    quote: quote.toUpperCase(),
    index: idx,
    pair_index: idx,
    market_addr: raw.address || raw.marketAddr || raw.market_addr || null,
    market_name: name,                                // exact string the SDK wants
    px_decimals: Number(raw.pxDecimals ?? raw.px_decimals ?? 6),
    sz_decimals: Number(raw.szDecimals ?? raw.sz_decimals ?? 6),
    max_leverage: String(raw.maxLeverage ?? raw.max_leverage ?? 50),
    min_leverage: '1',
    lot_size: String(raw.lotSize ?? raw.lot_size ?? '0.0001'),
    tick_size: String(raw.tickSize ?? raw.tick_size ?? '0.01'),
    min_size: String(raw.minSize ?? raw.min_size ?? '0'),
    funding_rate: String(raw.fundingRate ?? raw.funding_rate ?? 0),
    mode: raw.mode || 'Open',
    _raw: raw,
  };
}

function normalizePrice(p, markets) {
  // Decibel `/api/v1/prices` returns rows keyed by `market` (= market_addr),
  // NOT `marketName`. We resolve the market by address to derive the
  // symbol, then take `mark_px` etc. directly — these come from the API
  // already in human-readable form (e.g. `40.495` for HYPE), NOT chain
  // units. So no `priceFromChainUnits` divide here.
  const addr = p.market || p.market_addr || p.marketAddr || '';
  const name = p.marketName || p.market_name || p.name || '';
  const m = findMarket(markets, addr) || findMarket(markets, name);
  const symbol = m
    ? m.symbol
    : String(name || '').split(/[-/]/)[0].toUpperCase();
  const mark = Number(p.mark_px ?? p.markPrice ?? p.mark_price ?? p.mid_px ?? p.oracle_px ?? p.price ?? 0);
  const yest = Number(p.yesterday_px ?? p.yesterdayPrice ?? p.yesterday_price ?? p.openPrice24h ?? p.open_price_24h ?? 0);
  return {
    symbol,
    mark: String(mark),
    yesterday_price: String(yest),
  };
}

// ───── Verbose logging ────────────────────────────────────────────────────
// All Decibel-specific console output goes through these helpers so it's
// trivial to filter ("[Decibel]" in DevTools) and we can globally hush
// noisy categories without touching every call site. The `D.debug` call
// is explicit (not console.debug) because some browsers hide debug-level
// logs by default — we want every step visible in `default` filter mode.
const D = {
  log: (...args) => console.log('[Decibel]', ...args),
  step: (...args) => console.log('%c[Decibel]%c', 'color:#DAA520;font-weight:700', '', ...args),
  warn: (...args) => console.warn('[Decibel]', ...args),
  err: (...args) => console.error('[Decibel]', ...args),
  group: (label) => { try { console.groupCollapsed('[Decibel] ' + label); } catch { /* noop */ } },
  groupEnd: () => { try { console.groupEnd(); } catch { /* noop */ } },
};

const BUILDER_APPROVAL_PREFIX = 'clash_decibel_builder_approval:';
const SUBACCOUNT_CACHE_PREFIX = 'clash_decibel_subaccount:';
const SUBACCOUNT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function builderApprovalKey(owner, sub, builder) {
  return `${BUILDER_APPROVAL_PREFIX}${normalizeAptosAddress(owner)}:${normalizeAptosAddress(sub)}:${normalizeAptosAddress(builder)}:${BUILDER_FEE_BPS}`;
}

function legacyBuilderApprovalKey(owner, sub, builder) {
  return `${BUILDER_APPROVAL_PREFIX}${String(owner || '').toLowerCase()}:${String(sub || '').toLowerCase()}:${String(builder || '').toLowerCase()}:${BUILDER_FEE_BPS}`;
}

function hasLocalBuilderApproval(owner, sub, builder) {
  if (!owner || !sub || !builder) return false;
  try {
    const canonicalKey = builderApprovalKey(owner, sub, builder);
    if (localStorage.getItem(canonicalKey) === '1') return true;
    const legacyKey = legacyBuilderApprovalKey(owner, sub, builder);
    if (legacyKey !== canonicalKey && localStorage.getItem(legacyKey) === '1') {
      try { localStorage.setItem(canonicalKey, '1'); } catch {}
      return true;
    }
    return false;
  }
  catch { return false; }
}

function markLocalBuilderApproval(owner, sub, builder) {
  if (!owner || !sub || !builder) return;
  try { localStorage.setItem(builderApprovalKey(owner, sub, builder), '1'); }
  catch { /* storage unavailable: activation still relies on tx success */ }
}

function subaccountCacheKey(owner) {
  return `${SUBACCOUNT_CACHE_PREFIX}${normalizeAptosAddress(owner)}`;
}

function readLocalSubaccount(owner) {
  if (!owner) return null;
  try {
    const raw = localStorage.getItem(subaccountCacheKey(owner));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sub || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > SUBACCOUNT_CACHE_TTL_MS) {
      localStorage.removeItem(subaccountCacheKey(owner));
      return null;
    }
    return normalizeAptosAddress(parsed.sub);
  } catch {
    return null;
  }
}

function markLocalSubaccount(owner, sub) {
  if (!owner || !sub) return;
  try {
    localStorage.setItem(subaccountCacheKey(owner), JSON.stringify({
      sub: normalizeAptosAddress(sub),
      ts: Date.now(),
    }));
  } catch { /* storage unavailable: subaccount will be probed on-chain */ }
}

function moveOptionValue(viewResult) {
  const first = Array.isArray(viewResult) ? viewResult[0] : viewResult;
  if (first == null) return null;
  if (Array.isArray(first?.vec)) return first.vec.length ? first.vec[0] : null;
  if (Array.isArray(first?.value?.vec)) return first.value.vec.length ? first.value.vec[0] : null;
  if (Array.isArray(first)) return first.length ? first[0] : null;
  return first;
}

function orderedMapEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.entries)) return value.entries;
  if (Array.isArray(value.value?.entries)) return value.value.entries;
  return [];
}

function moveVariantName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value.__variant__ || value.variant || value.type || '');
}

function findExpirySecs(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return null;
  for (const [key, raw] of Object.entries(value)) {
    if (/expir|valid_until|until/i.test(key)) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n > 10_000_000_000 ? n / 1000 : n;
    }
  }
  for (const raw of Object.values(value)) {
    const nested = findExpirySecs(raw, depth + 1);
    if (nested != null) return nested;
  }
  return null;
}

async function fetchBuilderApprovalOnChain(sub, builder) {
  if (!sub || !builder) return false;
  const result = await aptosView(BUILDER_APPROVAL_VIEW, [
    normalizeAptosAddress(sub),
    normalizeAptosAddress(builder),
  ]);
  const raw = moveOptionValue(result);
  if (raw == null) return false;
  const cap = Number(raw);
  return Number.isFinite(cap) && cap === bpsToChainUnits(BUILDER_FEE_BPS);
}

async function fetchTradingDelegationOnChain(sub, apiAddr) {
  if (!sub || !apiAddr) return false;
  const result = await aptosView(TRADING_DELEGATION_VIEW, [
    normalizeAptosAddress(sub),
  ]);
  const targetAddr = normalizeAptosAddress(apiAddr);
  const nowSecs = Date.now() / 1000;
  const permissionsMap = Array.isArray(result) ? result[0] : result;
  const delegateEntry = orderedMapEntries(permissionsMap).find(entry =>
    normalizeAptosAddress(entry?.key || entry?.[0] || '') === targetAddr
  );
  if (!delegateEntry) return false;
  const delegatedPermissions = delegateEntry.value || delegateEntry[1] || {};
  const perms = delegatedPermissions.perms || delegatedPermissions.permissions || delegatedPermissions.value?.perms;
  return orderedMapEntries(perms).some(entry => {
    const key = entry?.key ?? entry?.[0];
    const permissionName = moveVariantName(key) || JSON.stringify(key || {});
    if (!/tradeperps|tradevault|trade/i.test(permissionName)) return false;
    const expiry = findExpirySecs(entry?.value ?? entry?.[1]);
    return expiry == null || expiry > nowSecs + 30;
  });
}

async function fetchDelegations(sub) {
  const read = await getReadClient();
  const list = await withAbortableRead(
    fetchOptions => read.delegations.getAll({ subAddr: sub, fetchOptions }),
    READ_TIMEOUT_MS,
    'delegations',
  );
  return Array.isArray(list) ? list : (list?.data || []);
}

async function hasTradingDelegation(sub, apiAddr) {
  if (!sub || !apiAddr) return false;
  try {
    return await fetchTradingDelegationOnChain(sub, apiAddr);
  } catch (e) {
    D.warn('delegation on-chain view failed; falling back to Decibel REST:', e?.message || e);
  }
  const arr = await fetchDelegations(sub);
  const targetAddr = normalizeAptosAddress(apiAddr);
  const nowSecs = Date.now() / 1000;
  return arr.some(d => {
    const target = normalizeAptosAddress(d.delegated_account || d.delegate || '');
    const perm = String(d.permission_type || d.permission || '').toLowerCase();
    const expRaw = d.expiration_time_s ?? d.expirationTimestampSecs ?? d.expiration ?? null;
    const exp = expRaw == null ? null : Number(expRaw);
    const expSecs = exp == null || !Number.isFinite(exp)
      ? null
      : (exp > 10_000_000_000 ? exp / 1000 : exp);
    const notExpired = expSecs == null || expSecs > nowSecs + 30;
    return target === targetAddr && /tradeperps|tradevault|trade/i.test(perm) && notExpired;
  });
}

function assertWriteSuccess(result, label) {
  if (result?.success === false) {
    throw new Error(result.error || `${label || 'Decibel transaction'} failed`);
  }
  const hash = txHashFrom(result);
  if (!hash) throw new Error(`${label || 'Decibel transaction'} did not return a transaction hash`);
  return hash;
}

// ───── Hook ────────────────────────────────────────────────────────────────

export function useDecibel() {
  const { address, isOnMainnet, loginSignAndSubmit, connect } = useAptosWallet();
  const { dex } = useDex();
  const isActiveDex = dex === 'decibel';

  const player = usePlayer();
  const tokenRef = useRef(null);
  useEffect(() => {
    tokenRef.current = player?.token || null;
  }, [player?.token]);

  // ───── State ─────
  const [account, setAccount] = useState(null);
  const [subaccountAddr, setSubaccountAddr] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [walletApt, setWalletApt] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  // null = unknown / loading. true = builder fee already approved (or no
  // builder configured globally). false = approval needed.
  const [builderApproved, setBuilderApproved] = useState(null);
  // null = server signer not available yet. string = server-side API wallet
  // address that has delegated trading rights on the user's subaccount.
  const [apiWalletAddr, setApiWalletAddr] = useState(null);
  const [apiWalletDelegated, setApiWalletDelegated] = useState(null);
  // ON-CHAIN trading-readiness. The activate gate is gated on this, NOT on
  // browser storage alone. Three values:
  //   null  -> we haven't checked yet (still polling Aptos for delegations).
  //           UI should show a "Checking..." state, NOT the activate CTA.
  //   true  -> subaccount exists, server signer is configured,
  //           gas is ready (unless sponsored), trading delegation is live,
  //           and builder fee routing has been approved on-chain.
  //   false -> at least one of the above is missing -> activate flow needed.
  const [setupVerified, setSetupVerified] = useState(null);
  // Activation progress for the blocking modal in FuturesPanel. Shape:
  //   null              → no activation in progress (overlay hidden)
  //   {index,total,label} → step `index/total` is awaiting Petra signature
  //                         (or running). Overlay shows label, blocks UI.
  // Cleared when activation finishes (success OR error).
  const [activationStep, setActivationStep] = useState(null);

  const marketsRef = useRef([]);
  const positionsRef = useRef([]);
  const ordersRef = useRef([]);
  const claimGoldRef = useRef(null);
  const closeInFlightRef = useRef(new Set());
  const activationInFlightRef = useRef(false);
  // Builder subaccount cache (deterministic, but resolution touches REST +
  // SDK helpers so we avoid repeating the work on every trade).
  const builderSubRef = useRef(null);
  const accountFetchRef = useRef({
    promise: null,
    failCount: 0,
    nextAllowedAt: 0,
    lastWarnAt: 0,
  });

  const decibelServerRequest = useCallback(async (path, body, method = 'POST') => {
    const token = tokenRef.current || window._playerToken;
    if (!token) {
      const err = new Error('Game session token is not ready yet');
      err.code = 'TOKEN_MISSING';
      throw err;
    }
    const res = await fetch(`${FUTURES_API}/decibel${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-dex': 'decibel',
        'x-token': token,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || `Decibel server request failed (${res.status})`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }, []);

  const fetchServerSigner = useCallback(async () => {
    const info = await decibelServerRequest('/signer', null, 'GET');
    const signer = normalizeAptosAddress(info?.public_key);
    if (!signer) throw new Error('Decibel server signer is not configured');
    setApiWalletAddr(signer);
    return { ...info, public_key: signer };
  }, [decibelServerRequest]);

  // Resolves the builder's primary subaccount address. Returns null if the
  // builder hasn't onboarded yet (no Subaccount object on-chain).
  //
  // The ON-CHAIN function `approve_max_builder_fee_for_subaccount` and all
  // per-trade `place_order` builder-attribution paths take the builder's
  // SUBACCOUNT address as `builderAddr`, NOT the builder's master/EOA
  // address. The SDK's `builderAddr` parameter is misleadingly named — it
  // gets passed straight into the entry function which assumes a subaccount.
  // Empirical check: passing master → abort 0x1 EBUILDER_SUBACCOUNT_NOT_FOUND;
  // passing subaccount → simulation succeeds.
  const resolveBuilderSubaccount = useCallback(async () => {
    if (builderSubRef.current) {
      D.log('resolveBuilderSubaccount: cache hit', builderSubRef.current);
      return builderSubRef.current;
    }
    if (!isBuilderConfigured()) {
      D.log('resolveBuilderSubaccount: builder not configured');
      return null;
    }
    D.log('resolveBuilderSubaccount: resolving for', BUILDER_ADDR);
    try {
      // Fast path — REST `/api/v1/subaccounts?owner=<master>`. If indexed,
      // returns the canonical subaccount the contract knows about.
      const read = await getReadClient();
      try {
        const list = await withAbortableRead(
          fetchOptions => read.userSubaccounts.getByAddr({ ownerAddr: BUILDER_ADDR, fetchOptions }),
          READ_TIMEOUT_MS,
          'builder-subaccounts'
        );
        const arr = Array.isArray(list) ? list : (list?.data || []);
        const primary = arr.find(s => s?.is_primary && s?.is_active !== false)
          || arr.find(s => s?.is_active !== false);
        const sub = primary?.subaccount_address || primary?.address || null;
        if (sub) {
          D.log('resolveBuilderSubaccount: REST returned', sub);
          builderSubRef.current = sub;
          return sub;
        }
      } catch (e) {
        D.warn('resolveBuilderSubaccount: REST hiccup, trying deterministic probe', e?.message || e);
      }
      // Slow path — derive deterministically and verify the resource exists.
      const derived = await getPrimarySubaccountAddr(BUILDER_ADDR);
      if (!derived) {
        D.warn('resolveBuilderSubaccount: deterministic derivation returned null');
        return null;
      }
      D.log('resolveBuilderSubaccount: derived', derived, '— verifying on-chain…');
      try {
        const acct = await withAbortableRead(
          fetchOptions => read.accountOverview.getByAddr({ subAddr: derived, fetchOptions }),
          READ_TIMEOUT_MS,
          'builder-overview'
        );
        if (acct && typeof acct === 'object') {
          D.log('resolveBuilderSubaccount: derived addr verified ✓');
          builderSubRef.current = derived;
          return derived;
        }
      } catch (e) {
        D.warn('resolveBuilderSubaccount: derived addr probe failed', e?.message || e);
      }
      D.warn('resolveBuilderSubaccount: builder has no subaccount on-chain');
      return null;
    } catch (e) {
      D.warn('resolveBuilderSubaccount fatal:', e?.message || e);
      return null;
    }
  }, []);

  // ───── Auto-clear error ─────
  useEffect(() => {
    if (!error) return;
    D.warn('error surfaced to UI:', error);
    const t = setTimeout(() => setError(null), 10_000);
    return () => clearTimeout(t);
  }, [error]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  // Wallet generation guard. Bumped on every Petra address change so an
  // in-flight closure that started before the user swapped accounts will
  // bail out cleanly instead of trading from the wrong wallet.
  const walletGenRef = useRef(0);
  useEffect(() => {
    walletGenRef.current += 1;
    setAccount(null);
    setSubaccountAddr(null);
    setPositions([]);
    setOrders([]);
    positionsRef.current = [];
    ordersRef.current = [];
    setPrices([]);
    setWalletUsdc(null);
    setWalletApt(null);
    setDataReady(false);
    setAccountReady(false);
    setBuilderApproved(null);
    setApiWalletAddr(null);
    setApiWalletDelegated(null);
    setSetupVerified(null);
    setActivationStep(null);
    activationInFlightRef.current = false;
    accountFetchRef.current = {
      promise: null,
      failCount: 0,
      nextAllowedAt: 0,
      lastWarnAt: 0,
    };
    if (isActiveDex) {
      if (address) D.log('Petra wallet connected:', address);
      else D.log('Petra wallet disconnected');
    }
  }, [address, isActiveDex]);

  // ───── Read paths ─────

  const fetchMarkets = useCallback(async () => {
    try {
      const read = await getReadClient();
      const list = await withAbortableRead(
        fetchOptions => read.markets.getAll({ fetchOptions }),
        READ_TIMEOUT_MS,
        'markets',
      );
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const norm = arr.map((m, i) => normalizeMarket(m, i));
      D.log(`fetchMarkets: ${norm.length} markets loaded`);
      setMarkets(norm);
      marketsRef.current = norm;
    } catch (e) {
      D.warn('fetchMarkets failed:', e?.message || e);
    }
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const read = await getReadClient();
      const list = await withAbortableRead(
        fetchOptions => read.marketPrices.getAll({ fetchOptions }),
        READ_TIMEOUT_MS,
        'prices',
      );
      const arr = Array.isArray(list) ? list : (list?.data || []);
      const norm = arr.map(p => normalizePrice(p, marketsRef.current));
      setPrices(prev => {
        if (!norm.length) return prev;
        const byKey = new Map((prev || []).map(p => [p.symbol, p]));
        for (const p of norm) byKey.set(p.symbol, p);
        return Array.from(byKey.values());
      });
    } catch (e) {
      D.warn('fetchPrices failed:', e?.message || e);
    }
  }, []);

  // Resolves the user's primary subaccount address.
  //
  // Decibel's `user_subaccounts` REST is INDEXER-lagged: it can return
  // an empty list for several minutes after `create_new_subaccount` lands
  // on-chain, even though the subaccount object is fully usable. So we
  // compute the deterministic primary address via `getPrimarySubaccountAddr`
  // (same helper the SDK uses internally) and verify it exists by reading
  // `accountOverview` — `accountOverview` is consistent because it queries
  // by the address we computed, not by an indexer-derived owner mapping.
  // Returns null only if the subaccount object hasn't been created at all.
  const ensureSubaccount = useCallback(async () => {
    if (!address) return null;
    try {
      const derived = await getPrimarySubaccountAddr(address);
      if (!derived) {
        D.warn('ensureSubaccount: deterministic derivation returned null');
        return null;
      }
      if (subaccountAddr && sameAptosAddress(subaccountAddr, derived)) {
        return subaccountAddr;
      }
      const cached = readLocalSubaccount(address);
      if (cached && sameAptosAddress(cached, derived)) {
        D.log('ensureSubaccount: local cache hit', cached);
        setSubaccountAddr(cached);
        return cached;
      }
      D.log('ensureSubaccount: derived', derived, '— probing on-chain…');
      const read = await getReadClient();
      let exists = false;
      try {
        const acct = await withAbortableRead(
          fetchOptions => read.accountOverview.getByAddr({ subAddr: derived, fetchOptions }),
          READ_TIMEOUT_MS,
          'subaccount-probe',
        );
        exists = !!acct && typeof acct === 'object';
      } catch (e) {
        D.log('ensureSubaccount: probe failed (subaccount not created yet)', e?.message || e);
        exists = false;
      }
      if (exists) {
        D.log('ensureSubaccount: subaccount confirmed ✓', derived);
        markLocalSubaccount(address, derived);
        setSubaccountAddr(derived);
        return derived;
      }
      return null;
    } catch (e) {
      D.warn('ensureSubaccount fatal:', e?.message || e);
      return null;
    }
  }, [address, subaccountAddr]);

  // accountOverview is per-SUBACCOUNT, not per-master. Calling it with the
  // master address returns an empty/error response, which the previous
  // code was silently treating as "no balance". Gate on having resolved a
  // subaccount first; before activation there's just no account to read.
  const fetchAccount = useCallback(async (options = {}) => {
    if (!address) return null;
    const force = !!options?.force;
    const quiet = !!options?.quiet;
    const state = accountFetchRef.current;
    if (state.promise) return state.promise;
    if (!force && state.nextAllowedAt && Date.now() < state.nextAllowedAt) return null;
    const gen = walletGenRef.current;

    const run = (async () => {
      try {
        const sub = await ensureSubaccount();
        if (walletGenRef.current !== gen) return null;
        if (!sub) {
          setAccount(null);
          setAccountReady(false);
          accountFetchRef.current.failCount = 0;
          accountFetchRef.current.nextAllowedAt = 0;
          return null;
        }
        const read = await getReadClient();
        const acct = await withAbortableRead(
          fetchOptions => read.accountOverview.getByAddr({ subAddr: sub, fetchOptions }),
          ACCOUNT_READ_TIMEOUT_MS,
          'account'
        );
        if (walletGenRef.current !== gen) return null;
        accountFetchRef.current.failCount = 0;
        accountFetchRef.current.nextAllowedAt = 0;
        accountFetchRef.current.lastWarnAt = 0;

        const hasBalanceFields = acct && typeof acct === 'object' && (
          Object.prototype.hasOwnProperty.call(acct, 'perp_equity_balance')
          || Object.prototype.hasOwnProperty.call(acct, 'usdc_cross_withdrawable_balance')
          || Object.prototype.hasOwnProperty.call(acct, 'usdc_isolated_withdrawable_balance')
        );
        if (!hasBalanceFields) {
          D.warn('fetchAccount: overview loaded without balance fields; keeping account unreadable for UI gate');
          setAccountReady(false);
          return acct || null;
        }
        const equity = Number(acct?.perp_equity_balance ?? 0);
        const cross = Number(acct?.usdc_cross_withdrawable_balance ?? 0);
        D.log(`fetchAccount: equity=$${equity.toFixed(4)} cross=$${cross.toFixed(4)}`);
        setAccount(acct);
        setAccountReady(true);
        return acct;
      } catch (e) {
        if (walletGenRef.current !== gen) return null;
        const msg = e?.message || String(e);
        const current = accountFetchRef.current;
        current.failCount = (current.failCount || 0) + 1;
        const retryInMs = Math.min(
          ACCOUNT_BACKOFF_MAX_MS,
          ACCOUNT_BACKOFF_BASE_MS * Math.pow(2, Math.min(current.failCount - 1, 3)),
        );
        const now = Date.now();
        current.nextAllowedAt = now + retryInMs;
        if (!quiet && (current.failCount === 1 || now - (current.lastWarnAt || 0) > ACCOUNT_WARN_THROTTLE_MS)) {
          D.warn('fetchAccount failed:', msg, {
            failures: current.failCount,
            retry_in_ms: retryInMs,
          });
          current.lastWarnAt = now;
        }
        return null;
      }
    })();

    accountFetchRef.current.promise = run;
    run.finally(() => {
      if (accountFetchRef.current.promise === run) {
        accountFetchRef.current.promise = null;
      }
    });
    return run;
  }, [address, ensureSubaccount]);

  // Mirror the most recent positions list into a ref so callbacks like
  // setMarginMode can read current state without inflating their dep
  // array (and the consequent re-creation chain). Updated alongside
  // setPositions inside fetchPositions.
  const fetchPositions = useCallback(async () => {
    if (!address) return [];
    try {
      const sub = await ensureSubaccount();
      if (!sub) {
        setPositions([]);
        positionsRef.current = [];
        setDataReady(true);
        return [];
      }
      let list;
      try {
        const read = await getReadClient();
        list = await withAbortableRead(
          fetchOptions => read.userPositions.getByAddr({ subAddr: sub, fetchOptions }),
          READ_TIMEOUT_MS,
          'positions'
        );
      } catch (readError) {
        D.warn('fetchPositions direct Decibel read failed; falling back to server:', readError?.message || readError);
        list = await decibelServerRequest(`/positions?subaccountAddr=${encodeURIComponent(sub)}`, null, 'GET');
      }
      const raw = Array.isArray(list) ? list : (list?.data || []);
      const norm = mergeTpslOrdersIntoPositions(
        raw.map(p => normalizePosition(p, marketsRef.current)),
        ordersRef.current
      );
      if (norm.length) {
        D.log(`fetchPositions: ${norm.length} open`,
          norm.map(p => `${p.symbol} ${p.side} ${p.amount}@$${p.entry_price}`).join(' | '));
      }
      setPositions(norm);
      positionsRef.current = norm;
      setDataReady(true);
      window._openPositionsCount = norm.length;
      return norm;
    } catch (e) {
      D.warn('fetchPositions failed:', e?.message || e);
      return null;
    }
  }, [address, ensureSubaccount, decibelServerRequest]);

  const waitForCloseSettlement = useCallback(async ({ symbol, side, beforeAmount, closeAmount }) => {
    const before = Number(beforeAmount);
    const closing = Number(closeAmount);
    const fullClose = !(before > 0) || closing >= before * 0.995;
    const minReduction = Math.max(1e-8, Math.min(Math.max(closing * 0.25, before * 0.05), before));
    const deadline = Date.now() + DECIBEL_CLOSE_CONFIRM_TIMEOUT_MS;
    let delayMs = 700;

    while (Date.now() <= deadline) {
      const latest = await fetchPositions();
      const list = Array.isArray(latest) ? latest : positionsRef.current;
      const match = (list || []).find(p => sameDecibelPosition(p, symbol, side));
      if (!match) return { settled: true, closed: true };

      const remaining = Number(match.amount);
      if (!fullClose && Number.isFinite(before) && Number.isFinite(remaining) && remaining <= before - minReduction) {
        return { settled: true, closed: false };
      }

      await sleep(delayMs);
      delayMs = Math.min(2_000, Math.round(delayMs * 1.25));
    }

    return { settled: false, closed: false };
  }, [fetchPositions]);

  const fetchOrders = useCallback(async () => {
    if (!address) return;
    try {
      const sub = await ensureSubaccount();
      if (!sub) { setOrders([]); ordersRef.current = []; return; }
      let list;
      try {
        list = await decibelServerRequest(`/orders?subaccountAddr=${encodeURIComponent(sub)}&limit=100`, null, 'GET');
      } catch (serverError) {
        D.warn('fetchOrders server Decibel read failed; falling back to direct SDK:', serverError?.message || serverError);
        const read = await getReadClient();
        list = await withAbortableRead(
          fetchOptions => read.userOpenOrders.getByAddr({ subAddr: sub, fetchOptions }),
          READ_TIMEOUT_MS,
          'orders'
        );
      }
      const raw = Array.isArray(list) ? list : (list?.data || []);
      const norm = raw.map(o => normalizeOrder(o, marketsRef.current));
      ordersRef.current = norm;
      setOrders(norm);
      setPositions(prev => {
        const merged = mergeTpslOrdersIntoPositions(prev, norm);
        positionsRef.current = merged;
        return merged;
      });
    } catch (e) {
      console.warn('[useDecibel] fetchOrders:', e?.message || e);
    }
  }, [address, ensureSubaccount, decibelServerRequest]);

  // Wallet-level balances:
  //   walletUsdc  ← USDC sitting on the MASTER wallet (= what user can
  //                 still deposit; queried via FA `primary_fungible_store`
  //                 against the canonical Decibel USDC metadata address)
  //   walletApt   ← APT for gas, also via FA (metadata 0xa)
  //
  // The trading-subaccount USDC balance is exposed separately through the
  // `account` state, read by FuturesPanel's renderAccount via the
  // `usdc_cross_withdrawable_balance` field — that one drives "available
  // to withdraw" and the withdraw card.
  const fetchBalance = useCallback(async () => {
    if (!address) return;
    // USDC on master wallet — Decibel-canonical native FA at
    // 0xbae207...46f3b. NOT bridged USDC variants (LZ/Wh) which Decibel
    // can't accept anyway.
    try {
      const r = await fetch(`${APTOS_FULLNODE}/view`, {
        method: 'POST',
        headers: aptosJsonHeaders(),
        body: JSON.stringify({
          function: '0x1::primary_fungible_store::balance',
          type_arguments: ['0x1::fungible_asset::Metadata'],
          arguments: [address, DECIBEL_USDC_MAINNET],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const v = Array.isArray(j) ? j[0] : j;
        setWalletUsdc(v != null ? Number(BigInt(String(v))) / 1e6 : 0);
      } else if (r.status === 400 || r.status === 404) {
        // Wallet has no USDC FA store yet (never received any). Show 0.
        setWalletUsdc(0);
      }
    } catch (e) {
      console.warn('[useDecibel] fetchBalance usdc:', e?.message || e);
    }
    // APT balance via the same FA view endpoint, just with metadata 0xa
    // (the canonical APT FA object). Aptos migrated APT to FA in 2024 so
    // the legacy `coin::CoinStore<AptosCoin>` resource is missing on most
    // CEX-funded wallets — probing it was just 404 console noise.
    try {
      const r = await fetch(`${APTOS_FULLNODE}/view`, {
        method: 'POST',
        headers: aptosJsonHeaders(),
        body: JSON.stringify({
          function: '0x1::primary_fungible_store::balance',
          type_arguments: ['0x1::fungible_asset::Metadata'],
          arguments: [address, '0xa'],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const v = Array.isArray(j) ? j[0] : j;
        setWalletApt(v != null ? Number(BigInt(String(v))) / 1e8 : 0);
      }
    } catch { /* tolerate transient RPC errors — keep prior value */ }
  }, [address]);

  // ───── Builder fee linkage ─────
  // We treat builder approvals as a one-shot on-chain cap, but require it to
  // exactly match the current fee. Otherwise old 10 bps approvals would keep
  // passing after lowering Clash's Decibel fee to 1 bps.
  const fetchBuilderApproval = useCallback(async () => {
    if (!isBuilderConfigured()) {
      setBuilderApproved(true);
      return true;
    }
    if (!address) { setBuilderApproved(null); return null; }
    try {
      const sub = await ensureSubaccount();
      if (!sub) { setBuilderApproved(false); return false; }
      const builderSub = await resolveBuilderSubaccount();
      if (!builderSub) { setBuilderApproved(null); return null; }
      const hadLocalApproval = hasLocalBuilderApproval(address, sub, builderSub);

      const ok = await fetchBuilderApprovalOnChain(sub, builderSub);
      if (ok) {
        markLocalBuilderApproval(address, sub, builderSub);
        D.log('builder approval verified on-chain ✓');
        setBuilderApproved(true);
        return true;
      }
      if (hadLocalApproval) D.warn('local builder approval marker is stale; on-chain cap is missing or mismatched');
      setBuilderApproved(false);
      return false;
    } catch (e) {
      console.warn('[useDecibel] fetchBuilderApproval:', e?.message || e);
      // Network failure — preserve the previous answer rather than flipping
      // false (which would re-trigger the "Activate" CTA every poll).
      return null;
    }
  }, [address, ensureSubaccount, resolveBuilderSubaccount]);

  // ───── API-wallet activation flow ─────
  // Activation is deliberately strict: every Petra tx is waited to finality,
  // then the expected post-condition is read back before the next step starts.
  // Trading stays gated until subaccount + gas + delegation + builder routing
  // are all known-good for the current Petra address.
  const activateApiWallet = useCallback(async () => {
    if (activationInFlightRef.current) {
      D.log('activate: already running, ignoring duplicate request');
      return { status: 'pending' };
    }
    activationInFlightRef.current = true;
    setError(null);
    D.group('🚀 Activate trading');
    D.step('start: address =', address);
    if (!address) {
      D.warn('activate aborted: no Petra address');
      D.groupEnd();
      setError('Connect Petra first');
      activationInFlightRef.current = false;
      return { error: 'NO_LOGIN_WALLET' };
    }
    setActivationStep({ index: 0, total: 0, label: 'Preparing activation…' });
    try {
      // ───── Pre-flight ─────
      D.step('preflight: redeeming referral code', REFERRAL_CODE, 'for', address);
      try {
        const read = await getReadClient();
        await read.referrals.redeemCode({ referralCode: REFERRAL_CODE, account: address });
        D.log('referral redeem: OK');
      } catch (e) {
        D.warn('referral redeem (non-fatal):', e?.message || e);
      }

      let sub = await ensureSubaccount();

      // Server-side API wallet: the private key lives on server-futures
      // (env / secret manager), never in browser storage. The user only
      // grants this signer trading delegation on their Decibel subaccount.
      const signerInfo = await fetchServerSigner();
      const apiAddrPre = normalizeAptosAddress(signerInfo.public_key);
      const apiAptOcta = BigInt(String(signerInfo.apt_balance_octa || '0'));
      const gasSponsored = !!signerInfo.gas_sponsored;
      if (!gasSponsored && signerInfo.gas_ok === false) {
        throw new Error('Decibel server signer needs APT for gas. Fund the server API wallet or enable gas sponsorship.');
      }
      const builderSubPre = isBuilderConfigured() ? await resolveBuilderSubaccount() : null;
      if (isBuilderConfigured() && !builderSubPre) {
        throw new Error('Builder wallet is not ready on Decibel yet; cannot enable fee routing');
      }
      const alreadyDelegated = sub ? await hasTradingDelegation(sub, apiAddrPre).catch(() => false) : false;
      let builderOkPre = false;
      if (sub && builderSubPre) {
        builderOkPre = await fetchBuilderApprovalOnChain(sub, builderSubPre).catch(e => {
          D.warn('preflight builder approval read failed:', e?.message || e);
          return false;
        });
        if (builderOkPre) markLocalBuilderApproval(address, sub, builderSubPre);
      }
      D.step('preflight summary:',
        '\n  subaccount      =', sub || '(none — will create)',
        '\n  server signer   =', apiAddrPre,
        '\n  signer APT      =', gasSponsored ? 'sponsored by gas station' : `${(Number(apiAptOcta) / 1e8).toFixed(4)} APT`,
        '\n  delegated       =', alreadyDelegated ? 'YES' : 'NO',
        '\n  builder subacct =', builderSubPre || '(not configured)',
        '\n  builder approval=', builderOkPre ? 'YES' : 'NO');

      const needCreate = !sub;
      const needFund = false;
      const needDelegate = !alreadyDelegated;
      const needApproveBuilder = !!builderSubPre && !builderOkPre;
      const total = (needCreate ? 1 : 0)
        + (needFund ? 1 : 0)
        + (needDelegate ? 1 : 0)
        + (needApproveBuilder ? 1 : 0);
      D.step(`will request ${total} Petra signatures:`,
        '\n  1) create subaccount =', needCreate ? 'YES' : 'skip (already exists)',
        '\n  2) fund api-wallet   =', 'skip (server signer is funded server-side)',
        '\n  3) delegate trading  =', needDelegate ? 'YES' : 'skip',
        '\n  4) approve builder   =', needApproveBuilder ? 'YES' : 'skip (builder not onboarded)');

      let stepIdx = 0;
      const tick = (label) => {
        stepIdx += 1;
        D.step(`▶ STEP ${stepIdx}/${total}: ${label}`);
        setActivationStep({ index: stepIdx, total, label });
      };

      if (total === 0) {
        setActivationStep({ index: 0, total: 0, label: 'Finalising…' });
      }

      // STEP A — create subaccount if missing.
      if (needCreate) {
        tick('Create trading account');
        D.log('signing create_new_subaccount with Petra…');
        try {
          await submitAndWait(loginSignAndSubmit, {
            data: {
              function: MOVE_FN.createSubaccount,
              typeArguments: [],
              functionArguments: [],
            },
          }, 'create trading account');
          D.log('create_new_subaccount: confirmed ✓');
        } catch (e) {
          const msg = String(e?.message || e);
          D.err('create_new_subaccount failed:', msg);
          if (/insufficient|balance|gas/i.test(msg)) {
            throw new Error('Wallet has no APT for gas — fund this address with at least 0.05 APT and try again');
          }
          throw e;
        }
        const fresh = await pollUntil(
          () => ensureSubaccount(),
          20_000,
          'Subaccount creation',
        );
        sub = fresh;
        D.log('subaccount visible on-chain ✓', sub);
      }
      const finalSub = sub;

      // Use the server signer address resolved during preflight. We still
      // wait for delegation before treating setup as trading-ready.
      const apiAddr = apiAddrPre;
      D.log('server api-wallet address:', apiAddr);

      // STEP D — delegate trading rights to the server-side API wallet.
      // This grants trade-only authority for the user's Decibel subaccount;
      // funds still move only through Petra-signed deposit/withdraw calls.
      if (needDelegate) {
        tick('Authorize fast trading');
        D.log('signing delegate_trading_to_for_subaccount(', finalSub, ',', apiAddr, ', null)…');
        await submitAndWait(loginSignAndSubmit, {
          data: {
            function: MOVE_FN.delegateTrading,
            typeArguments: [],
            functionArguments: [finalSub, apiAddr, null],
          },
        }, 'authorize fast trading');
        await pollUntil(
          () => hasTradingDelegation(finalSub, apiAddr),
          20_000,
          'Trading delegation',
        );
        D.log('delegate_trading_to_for_subaccount: confirmed + delegation verified ✓');
        setApiWalletAddr(apiAddr);
        setApiWalletDelegated(true);
      }

      // STEP E — approve builder fee.
      if (needApproveBuilder) {
        tick('Enable builder fee routing');
        D.log(`signing approve_max_builder_fee_for_subaccount(${finalSub}, ${builderSubPre}, ${bpsToChainUnits(BUILDER_FEE_BPS)})…`);
        try {
          await submitAndWait(loginSignAndSubmit, {
            data: {
              function: MOVE_FN.approveBuilder,
              typeArguments: [],
              functionArguments: [finalSub, builderSubPre, bpsToChainUnits(BUILDER_FEE_BPS)],
            },
          }, 'enable builder fee routing');
        } catch (e) {
          const msg = String(e?.message || e);
          // If another tab/device already approved the cap, the chain read
          // below will confirm it. Do not trust a local marker here.
          if (!/already|exists|duplicate|EALREADY|EEXISTS|E.*APPROV/i.test(msg)) throw e;
          D.warn('approve builder returned an already-approved-style error; verifying on-chain:', msg);
        }
        await pollUntil(
          () => fetchBuilderApprovalOnChain(finalSub, builderSubPre),
          20_000,
          'Builder fee approval',
        );
        markLocalBuilderApproval(address, finalSub, builderSubPre);
        setBuilderApproved(true);
        D.log('approve_max_builder_fee_for_subaccount: confirmed + cap verified ✓');
      }

      setActivationStep({ index: total, total, label: 'Finalising…' });
      D.step('finalising — re-fetching account state…');
      const finalGasOk = !!signerInfo.gas_sponsored || (await fetchAptBalanceOcta(apiAddr)) >= API_WALLET_READY_OCTA;
      const finalDelegationOk = await hasTradingDelegation(finalSub, apiAddr);
      const finalBuilderOk = !isBuilderConfigured()
        || await fetchBuilderApproval();
      if (!finalGasOk) throw new Error('Decibel server signer gas balance did not verify');
      if (!finalDelegationOk) throw new Error('Trading delegation did not verify on-chain');
      if (isBuilderConfigured() && finalBuilderOk !== true) throw new Error('Builder fee routing did not verify');
      await Promise.all([
        fetchAccount({ force: true, quiet: true }),
        fetchBuilderApproval(),
      ]);
      setApiWalletAddr(apiAddr);
      setApiWalletDelegated(true);
      setSetupVerified(true);
      setActivationStep(null);
      D.step('✅ activation complete');
      D.groupEnd();
      activationInFlightRef.current = false;
      return { status: 'activated', apiAddr, sub: finalSub };
    } catch (e) {
      setActivationStep(null);
      D.err('activation failed/aborted:', e?.message || e);
      D.groupEnd();
      const msg = decodeTradeError(e, 'Activation failed');
      setError(msg.slice(0, 300));
      activationInFlightRef.current = false;
      return { error: msg };
    }
  }, [address, loginSignAndSubmit, ensureSubaccount, fetchBuilderApproval, fetchAccount, resolveBuilderSubaccount, fetchServerSigner]);

  // Ensures the browser has completed the Petra-side setup required for the
  // server signer to place Decibel orders.
  const requireServerSigner = useCallback(() => {
    if (!address) throw new Error('Connect Petra wallet to trade on Decibel');
    if (!isOnMainnet) throw new Error('Switch Petra to Aptos mainnet');
    if (setupVerified !== true) {
      const err = new Error('Finish Decibel activation before trading');
      err.code = 'API_WALLET_MISSING';
      throw err;
    }
    if (!apiWalletAddr) {
      const err = new Error('Decibel server signer is not ready — retry activation');
      err.code = 'API_WALLET_MISSING';
      throw err;
    }
    return true;
  }, [address, isOnMainnet, setupVerified, apiWalletAddr]);

  // ───── Trade reporting (server-side gold rewards) ─────

  const reportTrade = useCallback(async ({ tx_hash, symbol, side, amount, leverage, price, order_type = 'market', dedup_key }) => {
    if (!address) return;
    // The server requires (tx_hash, symbol, side, amount) — when an
    // on-chain submit fails (e.g. INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE)
    // we still get past the SDK call but with a falsy tx_hash. Posting
    // anyway results in a noisy 400 in console. Guard here.
    if (!tx_hash || !symbol || !side || amount == null) {
      console.warn('[useDecibel] reportTrade skipped — missing required fields', {
        tx_hash, symbol, side, amount,
      });
      return;
    }
    try {
      const notional = Number(amount) * Number(leverage);
      const token = tokenRef.current || window._playerToken;
      if (!token) {
        console.warn('[useDecibel] reportTrade skipped — no token');
        return;
      }
      const res = await fetch('/api/futures/trade-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dex': 'decibel',
          'x-token': token,
        },
        body: JSON.stringify({
          address, tx_hash, symbol, side,
          amount: Number(amount), leverage: Number(leverage), price: price || 0,
          notional_usd: notional, order_type,
          ...(dedup_key ? { dedup_key } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.warn('[useDecibel] trade-report failed:', res.status, body?.error || '(no body)');
      }
    } catch (e) {
      console.warn('[useDecibel] trade-report network error:', e?.message || e);
    }
  }, [address]);

  // ───── Trade primitives ─────

  // Per-trade builder fields. Empty when builder isn't configured OR hasn't
  // onboarded a subaccount yet — the on-chain entry takes a builder
  // SUBACCOUNT address (see resolveBuilderSubaccount). Caching means this is
  // a synchronous read after the first activation/poll.
  const builderFields = useCallback(async () => {
    if (!isBuilderConfigured()) return {};
    if (builderApproved !== true) {
      throw new Error('Builder fee not yet approved - tap "Activate" to authorise fee routing');
    }
    const builderSub = await resolveBuilderSubaccount();
    if (!builderSub) throw new Error('Builder wallet is not ready on Decibel');
    return { builderAddr: builderSub, builderFee: BUILDER_FEE_BPS };
  }, [builderApproved, resolveBuilderSubaccount]);

  const placeOrderOnServer = useCallback((payload) => decibelServerRequest('/orders/place', {
    owner: address,
    ...payload,
  }), [address, decibelServerRequest]);

  const cancelOrderOnServer = useCallback((payload) => decibelServerRequest('/orders/cancel', {
    owner: address,
    ...payload,
  }), [address, decibelServerRequest]);

  const tpslOnServer = useCallback((payload) => decibelServerRequest('/tpsl', {
    owner: address,
    ...payload,
  }), [address, decibelServerRequest]);

  const leverageOnServer = useCallback((payload) => decibelServerRequest('/leverage', {
    owner: address,
    ...payload,
  }), [address, decibelServerRequest]);

  const scheduleClaim = useCallback((delayMs = DECIBEL_REWARD_CLAIM_DELAY_MS) => {
    const t = setTimeout(() => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn();
    }, delayMs);
    return () => clearTimeout(t);
  }, []);

  // `amount` here is COLLATERAL in USDC (matching the Avantis/UI contract).
  // Position size = collateral × leverage / mark, computed locally so the
  // chain-units `size` we send to the SDK is correct per-market scaling.
  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage, leverage) => {
    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    const gen = walletGenRef.current;
    const checkGen = () => {
      if (walletGenRef.current !== gen) {
        const err = new Error('Wallet changed during trade — please retry');
        err.code = 'WALLET_CHANGED';
        throw err;
      }
    };
    try {
      requireServerSigner();
      const collateral = Number(amount);
      if (!Number.isFinite(collateral) || collateral <= 0) throw new Error('Invalid amount');
      const lev = Math.min(Math.max(Number(leverage) || 1, 1), 50);
      const market = marketsRef.current.find(m => m.symbol === symbol);
      if (!market) throw new Error(`Unknown market: ${symbol}`);

      const sub = await ensureSubaccount(); checkGen();
      if (!sub) throw new Error('Trading account not yet provisioned — tap "Activate trading"');
      const TimeInForce = await getTimeInForce(); checkGen();

      const livePrice = (() => {
        const p = prices.find(x => x.symbol === symbol);
        return p ? Number(p.mark) : 0;
      })();
      if (!(livePrice > 0)) throw new Error('Price feed unavailable — try again in a moment');

      const slip = Math.max(0.001, Math.min(0.5, Number(slippage) / 100 || 0.005));
      const isBuy = sideIsBuy(side);
      const limitPrice = isBuy ? livePrice * (1 + slip) : livePrice * (1 - slip);
      const sizeBase = (collateral * lev) / livePrice;
      const size = assertTradableSize(sizeToChainUnits(sizeBase, market), market);

      const builderArgs = await builderFields(); checkGen();
      const result = await placeOrderOnServer({
        marketName: market.market_name,
        price: priceToChainUnits(limitPrice, market),
        size: size.toString(),
        isBuy,
        timeInForce: TimeInForce.ImmediateOrCancel,
        isReduceOnly: false,
        subaccountAddr: sub,
        // SDK rounds price/stop/TP/SL down to tickSize when provided.
        // Without this the engine aborts EPRICE_NOT_RESPECTING_TICKER_SIZE.
        tickSize: tickSizeChainUnits(market),
        pxDecimals: market.px_decimals,
        szDecimals: market.sz_decimals,
        rewardSymbol: symbol,
        rewardOrderType: 'market',
        rewardLeverage: lev,
        rewardNotionalUsd: collateral * lev,
        ...builderArgs,
      });
      checkGen();
      D.log('market order server returned', {
        ms: Math.round(performance.now() - startedAt),
        tx_ms: result?.timings?.total_ms,
        tx_wait_ms: result?.timings?.wait_ms,
        verification: result?.verification?.effect,
        verify_attempts: result?.verification?.attempts,
      });

      const txHash = assertWriteSuccess(result, 'Market order');
      const dedup = `decibel:open:${address.toLowerCase()}:${market.market_name}:${result?.orderId || Date.now()}`;
      const requestedNotional = collateral * lev;
      const filledNotional = Number(result?.verification?.trade_fill?.notional_usd);
      const hasFilledNotional = Number.isFinite(filledNotional) && filledNotional > 0;
      const formatUsd = (value) => `$${Number(value).toFixed(Number(value) >= 100 ? 0 : 2)}`;
      const fillInfo = hasFilledNotional
        ? Math.abs(filledNotional - requestedNotional) / Math.max(requestedNotional, 1) > 0.03
          ? `${(isBuy ? 'LONG' : 'SHORT')} ${symbol} filled ${formatUsd(filledNotional)} of ~${formatUsd(requestedNotional)}`
          : `${(isBuy ? 'LONG' : 'SHORT')} ${symbol} opened ${formatUsd(filledNotional)}`
        : null;
      void reportTrade({
        tx_hash: txHash, symbol, side: isBuy ? 'long' : 'short',
        amount: collateral, leverage: lev, order_type: 'market',
        price: livePrice, dedup_key: dedup,
      });

      fetchPositions();
      fetchAccount({ force: true });
      fetchBalance();
      scheduleClaim();
      return { tx_hash: txHash, status: 'submitted', info: fillInfo || undefined, filled_notional_usd: hasFilledNotional ? filledNotional : undefined };
    } catch (e) {
      const msg = decodeTradeError(e, 'Trade failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    } finally {
      setLoading(false);
    }
  }, [requireServerSigner, address, ensureSubaccount, builderFields, prices, reportTrade, fetchPositions, fetchAccount, fetchBalance, scheduleClaim, placeOrderOnServer]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif, leverage) => {
    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    const gen = walletGenRef.current;
    const checkGen = () => {
      if (walletGenRef.current !== gen) {
        const err = new Error('Wallet changed during order — please retry');
        err.code = 'WALLET_CHANGED';
        throw err;
      }
    };
    try {
      requireServerSigner();
      const collateral = Number(amount);
      const priceN = Number(price);
      if (!Number.isFinite(collateral) || collateral <= 0) throw new Error('Invalid amount');
      if (!Number.isFinite(priceN) || priceN <= 0) throw new Error('Invalid limit price');
      const lev = Math.min(Math.max(Number(leverage) || 1, 1), 50);
      const market = marketsRef.current.find(m => m.symbol === symbol);
      if (!market) throw new Error(`Unknown market: ${symbol}`);

      const sub = await ensureSubaccount(); checkGen();
      if (!sub) throw new Error('Trading account not yet provisioned — tap "Activate trading"');
      const TimeInForce = await getTimeInForce(); checkGen();
      const isBuy = sideIsBuy(side);
      const sizeBase = (collateral * lev) / priceN;
      const size = assertTradableSize(sizeToChainUnits(sizeBase, market), market);

      const builderArgs = await builderFields(); checkGen();
      const result = await placeOrderOnServer({
        marketName: market.market_name,
        price: priceToChainUnits(priceN, market),
        size: size.toString(),
        isBuy,
        timeInForce: TimeInForce.GoodTillCanceled,
        isReduceOnly: false,
        subaccountAddr: sub,
        tickSize: tickSizeChainUnits(market),
        pxDecimals: market.px_decimals,
        szDecimals: market.sz_decimals,
        rewardSymbol: symbol,
        rewardOrderType: 'limit',
        rewardLeverage: lev,
        rewardNotionalUsd: collateral * lev,
        ...builderArgs,
      });
      checkGen();
      D.log('limit order server returned', {
        ms: Math.round(performance.now() - startedAt),
        tx_ms: result?.timings?.total_ms,
        tx_wait_ms: result?.timings?.wait_ms,
        verification: result?.verification?.effect,
        verify_attempts: result?.verification?.attempts,
      });

      const txHash = assertWriteSuccess(result, 'Limit order');
      const dedup = `decibel:open:${address.toLowerCase()}:${market.market_name}:${result?.orderId || Date.now()}`;
      void reportTrade({
        tx_hash: txHash, symbol, side: isBuy ? 'long' : 'short',
        amount: collateral, leverage: lev, price: priceN, order_type: 'limit',
        dedup_key: dedup,
      });

      fetchOrders();
      fetchAccount({ force: true });
      fetchBalance();
      scheduleClaim();
      return { tx_hash: txHash, status: 'open' };
    } catch (e) {
      const msg = decodeTradeError(e, 'Limit order failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    } finally {
      setLoading(false);
    }
  }, [requireServerSigner, address, ensureSubaccount, builderFields, reportTrade, fetchOrders, fetchAccount, fetchBalance, scheduleClaim, placeOrderOnServer]);

  // Close = reduceOnly IOC at slipped live mark. `amount` is base units
  // (the position's quantity to close, NOT collateral) — same semantics as
  // Pacifica. FuturesPanel passes `pos.amount` for non-Avantis branches.
  const closePosition = useCallback(async (symbol, side, amount, slippagePct = 1) => {
    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    const closeLockKey = `${String(symbol || '').toUpperCase()}:${String(side || '').toLowerCase()}`;
    if (closeInFlightRef.current.has(closeLockKey)) {
      const msg = 'Close is already processing - wait for Decibel to settle it.';
      setLoading(false);
      setError(msg);
      return { error: msg, code: 'CLOSE_SETTLING' };
    }
    closeInFlightRef.current.add(closeLockKey);
    try {
      requireServerSigner();
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid close amount');
      const market = marketsRef.current.find(m => m.symbol === symbol);
      if (!market) throw new Error(`Unknown market: ${symbol}`);
      const existingPosition = (positionsRef.current || []).find(p => sameDecibelPosition(p, symbol, side));
      const beforeAmount = Number(existingPosition?.amount);

      const sub = await ensureSubaccount();
      if (!sub) throw new Error('Trading account not yet provisioned');
      const TimeInForce = await getTimeInForce();
      const closingLong = String(side).toLowerCase() === 'long' || String(side).toLowerCase() === 'bid';
      const closeIsBuy = !closingLong;

      const livePrice = (() => {
        const p = prices.find(x => x.symbol === symbol);
        return p ? Number(p.mark) : 0;
      })();
      if (!(livePrice > 0)) throw new Error('Price feed unavailable — try again in a moment');
      // Slippage: previously hardcoded ±1% for every close. On a fast-moving
      // alt with 5%+ legitimate slip needs the order would always abort
      // with EORDER_SIZE_TOO_SMALL_OR_PRICE_OUT_OF_BOUND and the user got
      // stuck on a losing position. Now accepts caller-provided pct,
      // clamped to [0.1%, 50%]. Default 1% preserves prior behaviour for
      // callers that don't pass it.
      const slipBp = Math.max(0.1, Math.min(50, Number(slippagePct) || 1)) / 100;
      const slipPrice = closeIsBuy ? livePrice * (1 + slipBp) : livePrice * (1 - slipBp);
      const size = assertTradableSize(sizeToChainUnits(amt, market), market);

      const builderArgs = await builderFields();
      const result = await placeOrderOnServer({
        marketName: market.market_name,
        price: priceToChainUnits(slipPrice, market),
        size: size.toString(),
        isBuy: closeIsBuy,
        timeInForce: TimeInForce.ImmediateOrCancel,
        isReduceOnly: true,
        subaccountAddr: sub,
        tickSize: tickSizeChainUnits(market),
        pxDecimals: market.px_decimals,
        szDecimals: market.sz_decimals,
        rewardSymbol: symbol,
        rewardOrderType: 'close',
        rewardLeverage: 1,
        rewardNotionalUsd: amt * slipPrice,
        ...builderArgs,
      });
      D.log('close order server returned', {
        ms: Math.round(performance.now() - startedAt),
        tx_ms: result?.timings?.total_ms,
        tx_wait_ms: result?.timings?.wait_ms,
        verification: result?.verification?.effect,
        verify_attempts: result?.verification?.attempts,
      });
      const txHash = assertWriteSuccess(result, 'Close order');
      const dedupKey = `decibel:close:${address.toLowerCase()}:${market.market_name}:${result?.orderId || Date.now()}`;
      void reportTrade({
        tx_hash: txHash, symbol,
        side: closingLong ? 'close_long' : 'close_short',
        amount: amt, leverage: 1, order_type: 'close', dedup_key: dedupKey,
      });

      const closeSettlement = await waitForCloseSettlement({
        symbol,
        side,
        beforeAmount: Number.isFinite(beforeAmount) ? beforeAmount : amt,
        closeAmount: amt,
      });
      fetchAccount({ force: true });
      fetchBalance();
      scheduleClaim(500);
      scheduleClaim(3_000);
      return {
        tx_hash: txHash,
        status: closeSettlement.settled ? 'closed' : 'submitted',
        close_settled: closeSettlement.settled,
      };
    } catch (e) {
      const msg = decodeTradeError(e, 'Close failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    } finally {
      closeInFlightRef.current.delete(closeLockKey);
      setLoading(false);
    }
  }, [requireServerSigner, address, ensureSubaccount, builderFields, prices, reportTrade, waitForCloseSettlement, fetchAccount, fetchBalance, scheduleClaim, placeOrderOnServer]);

  const cancelOrder = useCallback(async (symbol, orderId) => {
    try {
      requireServerSigner();
      const sub = await ensureSubaccount();
      const market = marketsRef.current.find(m => m.symbol === symbol);
      if (!market) throw new Error(`Unknown market for cancel: ${symbol}`);
      const res = await cancelOrderOnServer({
        orderId,
        marketName: market.market_name,
        ...(sub ? { subaccountAddr: sub } : {}),
      });
      if (res?.noop || res?.status === 'not_found') {
        fetchOrders();
        return { status: 'not_found', noop: true };
      }
      const txHash = assertWriteSuccess(res, 'Cancel order');
      fetchOrders();
      return { tx_hash: txHash, status: 'cancelled' };
    } catch (e) {
      const msg = decodeTradeError(e, 'Cancel failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    }
  }, [requireServerSigner, ensureSubaccount, fetchOrders, cancelOrderOnServer]);

  const setTpsl = useCallback(async (symbol, _side, takeProfit, stopLoss, _pairIndex, _tradeIndex, positionAmount, marketAddrHint) => {
    setLoading(true);
    setError(null);
    try {
      requireServerSigner();
      const target = String(symbol || '').toUpperCase();
      const market = marketsRef.current.find(m =>
        m.symbol === target ||
        (marketAddrHint && sameAptosAddress(m.market_addr, marketAddrHint))
      );
      if (!market || !market.market_addr) throw new Error('Market address unavailable for TP/SL');
      const sub = await ensureSubaccount();
      if (!sub) throw new Error('Trading account not yet provisioned');

      const position = (positionsRef.current || []).find(p =>
        p.symbol === target &&
        (!market.market_addr || !p.market_addr || sameAptosAddress(p.market_addr, market.market_addr))
      ) || (positionsRef.current || []).find(p => p.symbol === target) || null;
      if (!position && !(Number(positionAmount) > 0)) {
        throw new Error(`No open ${target} position to attach TP/SL to`);
      }

      const tp = Number(takeProfit);
      const sl = Number(stopLoss);
      if (!(tp > 0) && !(sl > 0)) return { success: true, skipped: true };

      const isLong = position ? position.side === 'bid' : !String(_side || '').toLowerCase().includes('bid');
      const sizeHuman = Number(position?.amount ?? positionAmount);
      const size = assertTradableSize(sizeToChainUnits(sizeHuman, market), market);
      const sizeStr = size.toString();
      const mark = Number(prices.find(p => p.symbol === target)?.mark || 0);
      const refPrice = mark > 0 ? mark : Number(position?.entry_price || 0);
      if (refPrice > 0) {
        if (tp > 0 && ((isLong && tp <= refPrice) || (!isLong && tp >= refPrice))) {
          throw new Error(isLong ? 'Take profit must be above current price' : 'Take profit must be below current price');
        }
        if (sl > 0 && ((isLong && sl >= refPrice) || (!isLong && sl <= refPrice))) {
          throw new Error(isLong ? 'Stop loss must be below current price' : 'Stop loss must be above current price');
        }
      }

      const tpTrigger = tp > 0 ? priceToChainUnits(tp, market) : null;
      const slTrigger = sl > 0 ? priceToChainUnits(sl, market) : null;
      const builderArgs = await builderFields();
      const res = await tpslOnServer({
        marketAddr: market.market_addr,
        tpOrderId: position?.tp_order_id || undefined,
        slOrderId: position?.sl_order_id || undefined,
        ...(tp > 0 ? {
          tpTriggerPrice: tpTrigger,
          tpLimitPrice: tpslLimitPriceUnits(tpTrigger, market, isLong, 'tp'),
          tpSize: sizeStr,
        } : {}),
        ...(sl > 0 ? {
          slTriggerPrice: slTrigger,
          slLimitPrice: tpslLimitPriceUnits(slTrigger, market, isLong, 'sl'),
          slSize: sizeStr,
        } : {}),
        tickSize: tickSizeChainUnits(market),
        szDecimals: market.sz_decimals ?? market.szDecimals,
        lotSize: market.lot_size ?? market.lotSize,
        minSize: market.min_size ?? market.minSize,
        fullPosition: true,
        ...(sub ? { subaccountAddr: sub } : {}),
        ...builderArgs,
      });
      const txHash = assertWriteSuccess(res, 'TP/SL update');
      fetchPositions();
      fetchOrders();
      return { tx_hash: txHash, status: 'updated' };
    } catch (e) {
      const msg = decodeTradeError(e, 'TP/SL update failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    } finally {
      setLoading(false);
    }
  }, [requireServerSigner, ensureSubaccount, builderFields, prices, fetchPositions, fetchOrders, tpslOnServer]);

  // Decibel `configureUserSettingsForMarket` stores leverage together with
  // the cross-margin flag. Isolated margin is not currently exposed as a
  // live trader feature, so this hook always configures cross margin and
  // only caches duplicate leverage updates.
  const lastAppliedSettingsRef = useRef(new Map()); // symbol -> {lev, isCross}
  const setLeverage = useCallback(async (symbol, lev) => {
    try {
      requireServerSigner();
      const market = marketsRef.current.find(m => m.symbol === symbol);
      if (!market || !market.market_addr) return { ok: true };
      const sub = await ensureSubaccount();
      if (!sub) return { ok: true };
      const userLev = Math.max(1, Math.min(50, Number(lev) || 1));
      // Decibel currently uses cross margin in production; isolated margin is
      // still under discussion in the public trader docs.
      const isCross = true;
      // Skip if we already pushed this exact (lev, isCross) for this
      // symbol within the same session. The server config-tx is
      // idempotent — re-sending wastes builder gas + Aptos sequencer
      // capacity for nothing.
      const cached = lastAppliedSettingsRef.current.get(symbol);
      if (cached && cached.lev === userLev && cached.isCross === isCross) {
        return { ok: true, cached: true };
      }
      const res = await leverageOnServer({
        marketAddr: market.market_addr,
        subaccountAddr: sub,
        isCross,
        userLeverage: userLev,
      });
      lastAppliedSettingsRef.current.set(symbol, { lev: userLev, isCross });
      return { ok: true, ...res };
    } catch (e) {
      console.warn('[useDecibel] setLeverage:', e?.message || e);
      return { ok: false, error: e?.message };
    }
  }, [requireServerSigner, ensureSubaccount, leverageOnServer]);

  // Read-only protocol mode: the UI can render Decibel as Cross, but should
  // not offer a switch to isolated until Decibel enables it publicly.
  const setMarginMode = useCallback(async () => ({
    ok: false,
    error: 'Decibel currently supports cross margin only. Isolated margin is not available yet.',
  }), []);

  // Deposit / withdraw flow uses Petra directly (login wallet → trading
  // subaccount). We can't use the api wallet here — moving funds is an
  // owner-action, not a delegated trade.
  const depositToTradingAccount = useCallback(async (amount) => {
    try {
      if (!address) throw new Error('Connect Petra first');
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid deposit amount');
      let sub = await ensureSubaccount();
      // If the player hasn't activated yet we walk them through it: that
      // also creates a subaccount as part of the bootstrap. After activation
      // their next deposit click goes straight through.
      if (!sub) {
        const r = await activateApiWallet();
        if (r?.error) return r;
        sub = r.sub || await ensureSubaccount();
      }
      const usdcRaw = await amountToChainUnits(amt, USDC_DECIMALS);
      const result = await submitAndWait(loginSignAndSubmit, {
        data: {
          function: MOVE_FN.deposit,
          typeArguments: [],
          // SDK args: [subaccountAddr, usdcAddr, amount]. The middle one is
          // the USDC fungible-asset metadata address — without it the
          // contract can't tell which collateral asset you're funding.
          functionArguments: [sub, DECIBEL_USDC_MAINNET, usdcRaw.toString()],
        },
      }, 'deposit USDC');
      fetchAccount({ force: true });
      fetchBalance();
      return { tx_hash: result.hash, status: 'deposited' };
    } catch (e) {
      const msg = decodeTradeError(e, 'Deposit failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    }
  }, [address, loginSignAndSubmit, ensureSubaccount, activateApiWallet, fetchAccount, fetchBalance]);

  const withdraw = useCallback(async (amount) => {
    try {
      if (!address) throw new Error('Connect Petra first');
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid withdraw amount');
      const sub = await ensureSubaccount();
      if (!sub) throw new Error('No trading account to withdraw from');
      const usdcRaw = await amountToChainUnits(amt, USDC_DECIMALS);
      const result = await submitAndWait(loginSignAndSubmit, {
        data: {
          function: MOVE_FN.withdraw,
          typeArguments: [],
          functionArguments: [sub, DECIBEL_USDC_MAINNET, usdcRaw.toString()],
        },
      }, 'withdraw USDC');
      fetchAccount({ force: true });
      fetchBalance();
      return { tx_hash: result.hash, status: 'withdrawn' };
    } catch (e) {
      const msg = decodeTradeError(e, 'Withdraw failed');
      setError(msg.slice(0, 300));
      return { error: msg, code: e?.code };
    }
  }, [address, loginSignAndSubmit, ensureSubaccount, fetchAccount, fetchBalance]);

  const activate = useCallback(async () => {
    const r = await activateApiWallet();
    return r?.error ? { success: false, error: r.error } : { success: true };
  }, [activateApiWallet]);
  const depositToPacifica = depositToTradingAccount;

  // ───── Gold rewards ─────

  const claimGold = useCallback(async () => {
    if (!address) return null;
    const token = tokenRef.current || window._playerToken;
    if (!token) {
      console.warn('[useDecibel] claimGold skipped — no token yet');
      return null;
    }
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: address, dex: 'decibel' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[useDecibel] claim-gold failed:', res.status, data?.error || '(no body)');
        return data;
      }
      if (Number(data.retry_after_ms) > 0 && !(Number(data.gold) > 0)) {
        scheduleClaim(Math.min(Math.max(Number(data.retry_after_ms), 1000), 60_000));
      }
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      return data;
    } catch (e) {
      console.warn('[useDecibel] claim-gold network error:', e?.message || e);
      return null;
    }
  }, [address, scheduleClaim]);

  claimGoldRef.current = claimGold;

  // ───── Effects ─────

  // Gate fetchMarkets on the active DEX. FuturesPanel mounts ALL three
  // hooks (Pacifica + Avantis + Decibel + GMX) for the cross-DEX branch
  // pattern, so without this gate Decibel was loading 26 markets via
  // Aptos SDK every time a GMX/Avantis user opened the panel — wasteful
  // network calls + Aptos node API quota burn. Same pattern usePacifica
  // and useGmx already use.
  useEffect(() => { if (isActiveDex) fetchMarkets(); }, [isActiveDex, fetchMarkets]);

  useEffect(() => {
    if (!address || !isActiveDex) return;
    const tickState = () => {
      fetchAccount({ quiet: true });
      fetchPositions();
      fetchOrders();
      fetchBalance();
    };
    const tickPrices = () => {
      fetchPrices();
    };
    tickState();
    tickPrices();
    const stateIv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      tickState();
    }, DECIBEL_STATE_POLL_MS);
    const priceIv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      tickPrices();
    }, DECIBEL_PRICE_POLL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        tickState();
        tickPrices();
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(stateIv);
      clearInterval(priceIv);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [address, isActiveDex, fetchAccount, fetchPositions, fetchOrders, fetchPrices, fetchBalance]);

  useEffect(() => {
    if (!isActiveDex || !address) return;
    fetchBuilderApproval();
  }, [isActiveDex, address, fetchBuilderApproval]);

  // Hydrate the server-side API wallet address on mount/address change.
  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setApiWalletAddr(null);
      setApiWalletDelegated(null);
      return () => { cancelled = true; };
    }
    if (!isActiveDex) return () => { cancelled = true; };
    fetchServerSigner()
      .then(info => { if (!cancelled) setApiWalletAddr(info.public_key); })
      .catch(e => {
        D.warn('server signer hydrate failed:', e?.message || e);
        if (!cancelled) setApiWalletAddr(null);
      });
    return () => { cancelled = true; };
  }, [address, isActiveDex, fetchServerSigner, player?.token]);

  useEffect(() => {
    if (!address || !isActiveDex) return;
    const fire = () => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn();
    };
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fire();
    }, 60_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [address, isActiveDex]);

  // ───── On-chain setup verification ─────
  // The gate logic must verify the on-chain state before exposing `isReady`:
  // subaccount, delegation to the server signer, signer gas, and builder cap.
  // Re-runs whenever the wallet, subaccount, or delegated state flips —
  // covers fresh mount and post-activation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!address) { setSetupVerified(null); return; }
      if (!isActiveDex) return;
      const sub = await ensureSubaccount();
      if (!sub) {
        D.log('verify: no subaccount on-chain → not ready');
        if (!cancelled) setSetupVerified(false);
        return;
      }
      try {
        const signerInfo = await fetchServerSigner();
        const myAddr = normalizeAptosAddress(signerInfo.public_key);
        const delegatedOk = await hasTradingDelegation(sub, myAddr);
        const apiGasOcta = BigInt(String(signerInfo.apt_balance_octa || '0'));
        const gasOk = !!signerInfo.gas_sponsored || apiGasOcta >= API_WALLET_READY_OCTA;
        const builderOk = await fetchBuilderApproval();
        const builderReady = !isBuilderConfigured() || builderOk === true;
        if (cancelled) return;
        D.log(
          `verify: server signer ${myAddr.slice(0, 10)}…`,
          `delegation=${delegatedOk ? 'YES' : 'NO'}`,
          `gas=${gasOk ? 'YES' : `LOW (${(Number(apiGasOcta) / 1e8).toFixed(4)} APT)`}`,
          `builder=${builderOk === true ? 'YES' : builderOk === false ? 'NO' : 'UNKNOWN'}`,
        );
        setApiWalletDelegated(delegatedOk);
        if (builderOk === true) setBuilderApproved(true);
        else if (builderOk === false) setBuilderApproved(false);
        else setBuilderApproved(null);
        setSetupVerified(delegatedOk && gasOk && builderReady);
      } catch (e) {
      D.warn('verify: setup check failed', e?.message || e);
        if (!cancelled) setSetupVerified(prev => (prev === true ? true : null));
      }
    })();
    return () => { cancelled = true; };
    // Re-run on each activation step change so the gate falls away
    // immediately after the delegate tx lands without waiting for the
    // 5-second poll timer.
  }, [address, isActiveDex, ensureSubaccount, fetchBuilderApproval, fetchServerSigner, activationStep, apiWalletAddr, player?.token]);

  const marginModes = useMemo(() => ({}), []);
  // Surface the on-chain leverage per symbol so the order panel's slider
  // initializes from chain truth, not from a 20× UI default. Without this,
  // a user with sticky chain leverage (e.g. 40× from a previous session)
  // would see "20×" in the dropdown but the position would record at 40×
  // because configureUserSettingsForMarket was never called by the slider.
  // Open positions take priority — they ARE the on-chain truth — and we
  // fall back to lastAppliedSettingsRef so the symbol's last user-applied
  // value persists across symbol switches in the same session.
  const leverageSettings = useMemo(() => {
    const out = {};
    for (const [sym, cached] of lastAppliedSettingsRef.current.entries()) {
      if (cached?.lev) out[sym] = cached.lev;
    }
    for (const p of positions) {
      const lev = Number(p.leverage);
      if (p.symbol && Number.isFinite(lev) && lev > 0) out[p.symbol] = lev;
    }
    return out;
  }, [positions]);

  return useMemo(() => ({
    connected: !!address,
    walletAddr: address,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    walletEth: walletApt,           // FuturesPanel naming compatibility
    leverageSettings,
    marginModes,
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
    // Decibel-specific extras
    decibelDepositAddress: address,
    decibelChain: 'aptos',
    isSelfCustody: true,
    // Builder fee — same shape as Avantis's hasReferrer / linkOurReferrer
    // so the FuturesPanel banner UI works without branching.
    hasReferrer: builderApproved,
    linkOurReferrer: activateApiWallet,
    // Server API wallet introspection — FuturesPanel can show "Activate"
    // until this signer is delegated and verified.
    apiWalletAddr,
    apiWalletDelegated,
    // FuturesPanel reads this to render a blocking modal that walks the
    // user through every Petra signature (Create / Fund gas / Delegate /
    // Approve builder). null = no activation in progress.
    activationStep,
    // True only when the full setup matches the server signer.
    isReady: !!address && setupVerified === true,
    // Tri-state for the gate's "checking on-chain" loading row.
    //   null  → still verifying (show spinner state in gate)
    //   true  → activated (gate hidden)
    //   false → not activated (show CTA in gate)
    setupVerified,
    // Exposes the on-chain subaccount address (or null if none yet). The
    // gate uses this to differentiate "first-time user" from "returning
    // user with existing account" — copy + step count differ.
    subaccountAddr,
    gasSponsored: false,
    connectWallet: connect,
  }), [
    address, account, positions, orders, prices, markets, walletUsdc, walletApt,
    dataReady, accountReady, loading, error, clearError, goldEarned, clearGoldEarned,
    leverageSettings, marginModes,
    depositToPacifica, withdraw, activate, claimGold, placeMarketOrder,
    placeLimitOrder, closePosition, cancelOrder, setTpsl, setLeverage, setMarginMode,
    builderApproved, activateApiWallet, apiWalletAddr, apiWalletDelegated,
    activationStep, setupVerified, subaccountAddr, connect,
  ]);
}

// ───── Local helpers ───────────────────────────────────────────────────────

function sideIsBuy(side) {
  const s = String(side || '').toLowerCase();
  return s === 'long' || s === 'buy' || s === 'bid';
}

function decodeTradeError(e, fallback) {
  if (!e) return fallback || 'Trade failed';
  const chain = [e, e.cause, e.cause?.cause].filter(Boolean);
  for (const err of chain) {
    if (err.code === 'WALLET_CHANGED' || err.code === 'API_WALLET_MISSING') return err.message;
    const reason = err.vmError || err.reason || err.shortMessage || err.message;
    if (reason) {
      // Decibel's perp_engine has a finite set of named aborts. The most
      // common one for new users is 0xe `EACCOUNT_WITHOUT_REFERRER_OR_IN_ALLOW_LIST`
      // — surfacing a generic "Move abort" string here would be useless.
      if (/EACCOUNT_WITHOUT_REFERRER|abort 0xe\b|abort 14\b/i.test(reason)) {
        return 'Account needs a Decibel referrer redeemed first — tap "Activate" to redeem.';
      }
      // INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE — server signer has no APT
      // for gas. Specific to Aptos's tx-fee validation, NOT a USDC issue.
      // Test the more specific message first so we don't mis-route it to
      // the USDC-insufficient branch below.
      if (/INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE|insufficient.*(?:gas|fee)/i.test(reason)) {
        return 'Decibel server signer ran out of APT for gas. Fund the server API wallet or enable gas sponsorship.';
      }
      if (/insufficient/i.test(reason)) return 'Insufficient USDC in trading account';
      if (/EINVALID_TP_SL_SIZE|EINVALID_TP_SL_PARAMETERS|TP\/SL/i.test(reason)) {
        return 'Invalid Decibel TP/SL - check price direction and position size';
      }
      if (/reject|cancel|denied/i.test(reason)) return 'Signature cancelled';
      if (/slippage|price/i.test(reason)) return 'Price moved past slippage — widen slippage or retry';
      if (/builderFee must be/i.test(reason)) {
        return `Decibel builder fee config mismatch: ${String(reason)}`;
      }
      if (/builderAddr is not an approved Clash builder subaccount/i.test(reason)) {
        return 'Decibel builder address config mismatch on the server';
      }
      if (/builder/i.test(reason)) return 'Builder fee not yet approved — tap "Activate" to authorise';
      if (/delegat/i.test(reason)) return 'Trading delegation expired — tap "Activate" to refresh';
      return String(reason);
    }
  }
  return String(e.message || fallback || 'Trade failed').slice(0, 300);
}
