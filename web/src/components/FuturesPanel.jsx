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
import { openSolanaWallet } from '../lib/solanaWalletUi';
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

function humanizeTradeError(message) {
  const text = String(message || '');
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
  // Phoenix returns `{"error":"invalid_invite_code"}` for bad/used/expired codes.
  // Check this before the generic "not registered" branch so a wrong code
  // doesn't get reported as "enter a code" (which is what the user already did).
  if (/invalid_invite_code|invite[_\s-]?code[_\s-]?(invalid|expired|used|exhausted)|invalid invite/i.test(text)) {
    return 'That Phoenix code is invalid, already used, or expired. Check the code and try again.';
  }
  if (/Too Many Requests|rate[_\s-]?limit|\b429\b/i.test(text)) {
    return 'Phoenix is rate-limiting requests. Wait a few seconds, then try again.';
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

function getPositionMetrics(pos, prices, leverageSettings = {}) {
  const priceRowMark = numOrNull(prices.find(p => p.symbol === pos.symbol)?.mark);
  const entryP = numOrNull(pos.entry_price) || 0;
  const markP = numOrNull(pos.mark_price) || priceRowMark || 0;
  const amt = numOrNull(pos.amount) || 0;
  const margin = numOrNull(pos.margin) || 0;
  const providedValue = numOrNull(pos.size_usd);
  const posValueUsd = providedValue && providedValue > 0
    ? providedValue
    : (markP ? amt * markP : amt * entryP);
  const providedPnl = numOrNull(pos.pnl_usd);
  const derivedPnl = markP ? (markP - entryP) * amt * (pos.side === 'bid' ? 1 : -1) : 0;
  const pnlVal = cleanSignedZero(providedPnl ?? derivedPnl);
  const rawLev = displayLeverage(pos.leverage);
  const setLev = rawLev && rawLev > 0
    ? rawLev
    : ((margin > 0 && posValueUsd > 0) ? Math.round((posValueUsd / margin) * 10) / 10 : (leverageSettings[pos.symbol] || 1));
  const providedPct = numOrNull(pos.pnl_pct);
  const pnlPct = providedPct ?? (margin > 0
    ? (pnlVal / margin) * 100
    : (entryP && markP ? ((markP - entryP) / entryP * 100 * (pos.side === 'bid' ? 1 : -1) * (typeof setLev === 'number' ? setLev : 1)) : 0));
  const pnlColor = pnlVal >= 0 ? '#4CAF50' : '#E53935';
  return { entryP, markP, amt, margin, pnlVal, setLev, posValueUsd, pnlPct, pnlColor };
}

function getPositionTpsl(pos) {
  const tp = numOrNull(pos?.take_profit ?? pos?.takeProfit ?? pos?.tp ?? pos?.tp_trigger_price ?? pos?.tpTriggerPrice ?? pos?.tp_limit_price ?? pos?.tpLimitPrice);
  const sl = numOrNull(pos?.stop_loss ?? pos?.stopLoss ?? pos?.sl ?? pos?.sl_trigger_price ?? pos?.slTriggerPrice ?? pos?.sl_limit_price ?? pos?.slLimitPrice);
  return {
    tp: tp && tp > 0 ? tp : 0,
    sl: sl && sl > 0 ? sl : 0,
  };
}

function formatTpslInputValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 1 ? String(Number(n.toFixed(2))) : String(Number(n.toFixed(8)));
}

function PositionTpslRow({ pos }) {
  const { tp, sl } = getPositionTpsl(pos);
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
  const market = String(pos?.market_addr || pos?.marketAddress || pos?.market || pos?._raw?.marketAddress || '');
  const subaccount = pos?._phoenixSubaccountIndex ?? pos?.subaccount_index ?? pos?.subaccountIndex ?? '';
  const pair = pos?.pair_index ?? pos?.pairIndex ?? '';
  const trade = pos?.trade_index ?? pos?.tradeIndex ?? '';
  const id = pos?.position_id ?? pos?.positionId ?? pos?.id ?? pos?._raw?.key ?? pos?._raw?.positionKey ?? '';
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
  const price = order?.price ?? order?.ip ?? order?.stop_price ?? order?.sp ?? '';
  const parts = [id, sym, side, type, pair, trade, price];
  return parts.some(part => part !== '' && part != null) ? parts.join('|') : `order:${index}`;
}

function orderPositionSide(order) {
  const direction = String(order?.order_direction || order?.orderDirection || '').toLowerCase();
  if (direction.includes('long')) return 'bid';
  if (direction.includes('short')) return 'ask';
  return order?.side || order?.d || '';
}

function orderSideLabel(order) {
  const direction = String(order?.order_direction || order?.orderDirection || '').trim();
  if (direction) return direction;
  const side = order?.side || order?.d;
  return side === 'bid' ? 'BUY' : 'SELL';
}

function useOpenedSortedPositions(positions) {
  const orderRef = useRef({ map: new Map(), nextSeq: 1 });
  return useMemo(() => {
    const state = orderRef.current;
    const now = Date.now();
    const seen = new Set();
    const rows = (positions || []).map((pos, index) => {
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
    border: '2px solid rgba(92,58,33,0.25)',
    borderTopColor: '#5C3A21',
    animation: 'act-spin 0.9s linear infinite',
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
    return markets.map(m => {
      const p = prices.find(pr => pr.symbol === m.symbol);
      const mark = p ? parseFloat(p.mark) : 0;
      const yest = p ? parseFloat(p.yesterday_price || 0) : 0;
      const change = yest > 0 ? ((mark - yest) / yest) * 100 : 0;
      return {
        symbol: m.symbol,
        // Prefer the human-readable pair ("USD/JPY") when present; falls back
        // to the symbol key for legacy Pacifica markets that only ship base.
        label: m.pair || m.symbol,
        iconSym: m.icon_symbol || m.base || m.symbol,
        maxLev: m.max_leverage,
        mark,
        change,
      };
    }).filter(r => !search || r.label.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.label.localeCompare(b.label));
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
            <col style={{width: '72px'}} />
            <col style={{width: '56px'}} />
          </colgroup>
          <thead><tr>
            <th style={SP.th}>Symbol</th>
            <th style={{...SP.th, textAlign: 'right'}}>Price</th>
            <th style={{...SP.th, textAlign: 'right'}}>24h</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.symbol} onClick={() => onSelect(r.symbol)}
              style={{...SP.row, background: r.symbol === symbol ? '#e8dfc8' : 'transparent', cursor: 'pointer'}}>
              <td style={SP.td}>
                <div style={{display: 'flex', alignItems: 'center', gap: 5}}>
                  <TokenIcon sym={r.iconSym} size={18} />
                  <span style={{fontWeight: 900, color: '#5C3A21'}}>{r.label}</span>
                  <span style={{fontSize: 10, fontWeight: 800, color: '#a3906a'}}>{r.maxLev}x</span>
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

// ==================== ORDERS LIST (mobile/tab card view) ====================
const OrdersList = memo(function OrdersList({ orders, cancelOrder }) {
  if (!orders.length) {
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
      {orders.map((o, i) => {
        const sym = o.symbol || o.s;
        const side = o.side || o.d;
        const rawPrice = parseFloat(o.price || o.ip || 0);
        const stopPrice = parseFloat(o.stop_price || o.sp || 0);
        const price = rawPrice > 0 ? rawPrice : stopPrice;
        const rawAmt = o.initial_amount || o.amount || o.a;
        const amt = parseFloat(rawAmt || 0) > 0 ? rawAmt : 'Full position';
        const type = (o.order_type || o.ot || (stopPrice > 0 ? 'stop' : 'limit')).toUpperCase().replace(/_/g, ' ');
        const isBid = orderPositionSide(o) === 'bid' || side === 'bid';
        const sideLabel = orderSideLabel(o);
        const isTP = type.includes('TAKE') || type.includes('TP');
        const isSL = type.includes('STOP') || type.includes('SL');
        const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
        return (
          <div key={orderStableKey(o, i)} style={S.posCard}>
            <div style={S.row}>
              <span style={{fontSize: 16, fontWeight: 900}}>{sym}</span>
              <span style={{fontSize: 10, fontWeight: 800, color: typeColor, background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{type}</span>
              <span style={{fontSize: 13, fontWeight: 900, color: isBid ? '#4CAF50' : '#E53935'}}>
                {sideLabel}
              </span>
              <button style={S.cancelBtn} onClick={() => cancelOrder(sym, o.order_id || o.i, o.pair_index, o.trade_index)}>✕</button>
            </div>
            <div style={S.row}>
              <span style={S.detail}>Price: ${fmtPrice(parseFloat(price))}</span>
              <span style={S.detail}>Amount: {amt}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

// ==================== POSITIONS LIST (mobile/tab card view) ====================
const PositionsList = memo(function PositionsList({
  positions, prices, dataReady, leverageSettings, marginModes, loading, error,
  closePosition, setTpsl, clearError, isBasic, dex,
}) {
  const [expandedPos, setExpandedPos] = useState(null);
  const [closePct, setClosePct] = useState(100);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');

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
        const { entryP, markP, amt, margin, pnlVal, setLev, posValueUsd, pnlPct, pnlColor } = getPositionMetrics(pos, prices, leverageSettings);
        const posKey = `${pos.symbol}-${pos.side}`;
        const expanded = expandedPos?.startsWith(posKey) ? expandedPos.split(':')[1] : null;

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
                <span style={{fontSize: 11, fontWeight: 800, color: '#a3906a', background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{setLev}x</span>
                <span style={{fontSize: 13, fontWeight: 900, color: pos.side === 'bid' ? '#4CAF50' : '#E53935'}}>
                  {pos.side === 'bid' ? 'LONG' : 'SHORT'}
                </span>
              </div>
            </div>
            <div style={S.row}>
              <span style={S.detail}>Size: {pos.amount} <span style={{color: '#a3906a'}}>(${posValueUsd.toFixed(2)})</span></span>
              <span style={S.detail}>Entry: ${fmtPrice(parseFloat(pos.entry_price))}</span>
            </div>
            <div style={S.row}>
              <span style={S.detail}>Mark: {markP ? `$${markP.toLocaleString()}` : '—'}</span>
              <span style={{fontSize: 14, fontWeight: 900, color: pnlColor}}>
                {pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
              </span>
            </div>
            <PositionTpslRow pos={pos} />

            {/* Action buttons. Basic mode hides TP/SL — risk management
                features are deliberately stripped from the simplified UX. */}
            <div style={{display: 'flex', gap: 6, marginTop: 4}}>
              <button style={S.btnRed} onClick={() => { setClosePct(100); setExpandedPos(expanded === 'close' ? null : `${posKey}:close`); }}>Close</button>
              {!isBasic && (
                <button style={S.btnBlue} onClick={() => {
                  if (expanded === 'tpsl') {
                    setExpandedPos(null);
                    return;
                  }
                  const { tp, sl } = getPositionTpsl(pos);
                  setTpPrice(formatTpslInputValue(tp));
                  setSlPrice(formatTpslInputValue(sl));
                  setExpandedPos(`${posKey}:tpsl`);
                }}>TP/SL</button>
              )}
            </div>

            {/* Close slider */}
            {expanded === 'close' && (
              <div style={S.expandPanel}>
                <div style={S.row}>
                  <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>Close {closePct}%</span>
                  <span style={{fontSize: 11, color: '#a3906a', fontWeight: 700}}>
                    {(parseFloat(pos.amount) * closePct / 100).toFixed(6)} {pos.symbol}
                  </span>
                </div>
                <input type="range" min="5" max="100" step="5" value={closePct} className="grad-slider" onChange={e => setClosePct(Number(e.target.value))} style={{...S.slider, '--val': `${((closePct - 5) / 95) * 100}%`}} />
                <div style={S.sliderLabels}><span>5%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                  <button style={{...S.btnRed, width: '100%'}} onClick={() => closePosition(pos.symbol, pos.side, String((dex === 'avantis' ? parseFloat(pos.margin) : parseFloat(pos.amount)) * closePct / 100), pos.pair_index, pos.trade_index, closePct >= 100)} disabled={loading}>
                  {loading ? <ClosingButtonLabel /> : `Close ${closePct}%`}
                </button>
              </div>
            )}

            {/* TP/SL panel — same isBasic gate so the inputs never reach
                the DOM in Basic mode (and never get accidentally fired). */}
            {!isBasic && expanded === 'tpsl' && (
              <div style={{...S.expandPanel, ...S.row}}>
                <input type="number" placeholder="TP Price" value={tpPrice} onChange={e => setTpPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                <input type="number" placeholder="SL Price" value={slPrice} onChange={e => setSlPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                <button style={S.btnBlue} onClick={async () => {
                  await setTpsl(pos.symbol, pos.side === 'bid' ? 'ask' : 'bid', tpPrice || null, slPrice || null, pos.pair_index, pos.trade_index, pos.amount, pos.market_addr);
                  setTpPrice(''); setSlPrice(''); setExpandedPos(null);
                }} disabled={!tpPrice && !slPrice}>Set</button>
              </div>
            )}
          </div>
        );
      })}

      {error && (
        <div style={S.errorBar} onClick={clearError}>
          <span style={S.errorText}>{humanizeTradeError(error)}</span>
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
  filteredPositions, filteredOrders,
  prices, walletAddr, dataReady, leverageSettings,
  closePosition, cancelOrder, dex, loading, historyAccountAddr, markets,
}) {
  // Avantis has no order-flow history or funding payments exposed via a
  // public API like Pacifica, so we hide those tabs entirely on that DEX.
  const tabs = [
    { id: 'positions', label: `Positions (${filteredPositions.length})` },
    { id: 'orders', label: `Orders (${filteredOrders.length})` },
    ...(dex === 'avantis' ? [] : [
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
                  pnlColor,
                } = getPositionMetrics(p, prices, leverageSettings);
                const { tp, sl } = getPositionTpsl(p);
                return (
                  <tr key={positionStableKey(p) || i} style={S.tr}>
                    <td style={S.td}>{p.symbol}</td>
                    <td style={{...S.td, color: p.side === 'bid' ? '#4CAF50' : '#E53935', fontWeight: 900}}>{p.side === 'bid' ? 'LONG' : 'SHORT'}</td>
                    <td style={S.td}>{p.amount} <span style={{color: '#a3906a', fontSize: 11}}>(${tblPosValue.toFixed(2)})</span></td>
                    <td style={S.td}>${fmtPrice(entryPrice)}</td>
                    <td style={S.td}>{markPrice ? `$${fmtPrice(markPrice)}` : '—'}</td>
                    <td style={{...S.td, color: pnlColor, fontWeight: 900}}>{pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)}</td>
                    <td style={{...S.td, color: pnlColor, fontWeight: 900}}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</td>
                    <td style={S.td}>
                      <span style={{color: tp ? '#4CAF50' : '#a3906a', fontWeight: 800}}>TP {tp ? `$${fmtPrice(tp)}` : '-'}</span>
                      <span style={{color: '#a3906a'}}> / </span>
                      <span style={{color: sl ? '#E53935' : '#a3906a', fontWeight: 800}}>SL {sl ? `$${fmtPrice(sl)}` : '-'}</span>
                    </td>
                    <td style={S.td}>{lev}x</td>
                    <td style={S.td}>
                      <button
                        style={{...S.tblCloseBtn, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer'}}
                        disabled={loading}
                        onClick={() => closePosition(p.symbol, p.side, dex === 'avantis' ? p.margin : p.amount, p.pair_index, p.trade_index, true)}
                      >{loading ? <ClosingButtonLabel text="" /> : 'Close'}</button>
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
                const rawPrice = parseFloat(o.price || o.ip || 0);
                const stopPrice = parseFloat(o.stop_price || o.sp || 0);
                const price = rawPrice > 0 ? rawPrice : stopPrice;
                const rawAmt = o.initial_amount || o.amount || o.a;
                const amt = parseFloat(rawAmt || 0) > 0 ? rawAmt : 'Full';
                const type = (o.order_type || o.ot || (stopPrice > 0 ? 'stop' : 'limit')).toUpperCase().replace(/_/g, ' ');
                const positionSide = orderPositionSide(o);
                const sideLabel = orderSideLabel(o);
                const isTP = type.includes('TAKE') || type.includes('TP');
                const isSL = type.includes('STOP') || type.includes('SL');
                const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
                return (
                  <tr key={orderStableKey(o, i)} style={S.tr}>
                    <td style={S.td}>{sym}</td>
                    <td style={{...S.td, color: positionSide === 'bid' ? '#4CAF50' : '#E53935', fontWeight: 900}}>{sideLabel}</td>
                    <td style={{...S.td, color: typeColor, fontWeight: 700}}>{type}</td>
                    <td style={S.td}>${fmtPrice(price)}</td>
                    <td style={S.td}>{amt}</td>
                    <td style={S.td}>
                      <button style={S.tblCloseBtn} onClick={() => cancelOrder(sym, o.order_id || o.i, o.pair_index, o.trade_index)}>Cancel</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          ) : <div style={{padding: 20, textAlign: 'center', color: '#a3906a'}}>{!dataReady ? 'Loading...' : hasActiveFilters ? 'No orders match filters' : 'No open orders'}</div>
        )}
        {bottomTab === 'history' && dex !== 'avantis' && (
          <TradeHistory
            walletAddr={walletAddr}
            accountAddr={historyAccountAddr}
            dex={dex}
            markets={markets}
            filters={btmFilters}
          />
        )}
        {bottomTab === 'funding' && dex !== 'avantis' && (
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
  const evmConnectChain = dex === 'gmx' || dex === 'hyperliquid'
    ? 'arbitrum'
    : dex === 'monad'
    ? 'monad'
    : dex === 'risex'
    ? 'rise'
    : dex === 'nado'
    ? 'ink'
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
    : pacificaHook;
  const {
    walletAddr, account, positions, orders, prices, markets, walletUsdc, leverageSettings, marginModes, dataReady, accountReady,
    connected: tradingConnected,
    loading, error, clearError, goldEarned, clearGoldEarned, depositStatus, walletUsdcStatus,
    bridgeSourceBalances, bridgeSourceBalanceStatus,
    placeMarketOrder, placeLimitOrder, cancelOrder, setLeverage: setLeverageApi,
    closePosition, depositToPacifica, withdraw, activate, setTpsl, setMarginMode, moveSpotToPerp, switchToRise, switchToInk,
    // Avantis-only — undefined on the Pacifica branch.
    hasReferrer, linkOurReferrer, oneTapTrading, setOneTapTradingEnabled, connectPerpl, walletMismatch, registeredEvmWallet,
    // Pacifica agent-wallet — undefined on Avantis (Pacifica-only feature)
    pacAgent, bindAgent, bindingAgent, bindAgentError,
    // Decibel-only — drives the blocking activation modal + gate screen.
    // setupVerified is the on-chain verification: null=checking,
    // true=delegation confirmed on-chain, false=needs activation.
    // subaccountAddr lets the gate distinguish "fresh user" (no
    // subaccount yet) from "returning user" (subaccount on-chain but
    // delegation missing — usually after rejecting the delegate step).
    activationStep, isReady, setupVerified, subaccountAddr, gasSponsored, apiWalletAddr, inviteStatus,
    bridgeDepositSourceChainId, setBridgeDepositSourceChainId, bridgeDepositSources,
  } = trading;
  const openedSortedPositions = useOpenedSortedPositions(positions);
  // The trading hook owns the active signer. Do not treat a detected adapter
  // or a stored player wallet as "connected" unless the hook resolved the
  // address it will actually use for signing.
  const hasWallet = !!walletAddr;
  const isSolanaDex = dex === 'pacifica' || dex === 'phoenix';
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
  const handleLinkReferrer = useCallback(async () => {
    if (!linkOurReferrer || referralLinking) return;
    setReferralLinking(true);
    try { await linkOurReferrer(); } finally { setReferralLinking(false); }
  }, [linkOurReferrer, referralLinking]);
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
    dex === 'hyperliquid'
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
    if (dex !== 'avantis' && dex !== 'gmx' && dex !== 'monad' && dex !== 'hyperliquid' && dex !== 'risex' && dex !== 'nado') {
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
  const handleToggleOneTapTrading = useCallback(async () => {
    if (dex !== 'hyperliquid') return;
    if (oneTapTrading?.enabled) {
      if (typeof setOneTapTradingEnabled === 'function') setOneTapTradingEnabled(false);
      setLocalAlert('One tap trading disabled. Opening a Hyperliquid order will ask to enable it again.');
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
      else setLocalAlert('One tap trading enabled.');
    } finally {
      setReferralLinking(false);
    }
  }, [dex, oneTapTrading?.enabled, setOneTapTradingEnabled, linkOurReferrer, referralLinking]);
  // Pending-tx state for LONG/SHORT buttons, including pre-wallet prep time.
  const [tradePhase, setTradePhase] = useState(null); // 'preparing' | 'signing' | 'confirming' | null
  const [tradeBusy, setTradeBusy] = useState(false);
  const [amountInUsdc, setAmountInUsdc] = useState(true);
  const [sizePct, setSizePct] = useState(0);
  const [depositAmt, setDepositAmt] = useState('');
  const [perplAccessCode, setPerplAccessCode] = useState('');
  const [phoenixInviteCode, setPhoenixInviteCode] = useState('');
  const [phoenixInviteKind, setPhoenixInviteKind] = useState('access');
  const [risexInviteCode, setRisexInviteCode] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [withdrawTo, setWithdrawTo] = useState('');
  const [fullscreen, setFullscreen] = useState(window.innerWidth < 600);
  // Share-trade modal — shown automatically after a successful close in
  // Basic mode and on demand via the 📤 button next to open positions.
  // Holds a SNAPSHOT of the position because the live `positions` array
  // mutates the moment the close confirms, before the user has a chance
  // to share.
  const [shareTrade, setShareTrade] = useState(null);
  const [bottomTab, setBottomTab] = useState('positions');
  const [expandedPos, setExpandedPos] = useState(null);
  const [closePct, setClosePct] = useState(100);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
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
    return prices.find(p => p.symbol === symbol)?.mark || null;
  }, [prices, symbol]);

  const maxLev = useMemo(() => {
    return markets.find(m => m.symbol === symbol)?.max_leverage || 100;
  }, [markets, symbol]);

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
  const pacBalanceBase = Math.max(0, parseFloat(
    account?.available_to_spend            // Pacifica unified margin (preferred)
      ?? account?.usdc_cross_withdrawable_balance // Decibel
      ?? account?.usdcAvailable                   // Avantis variant
      ?? account?.usdc                            // GMX
      ?? account?.balance                         // last-resort
      ?? 0
  ));
  const pacBalance = dex === 'hyperliquid' ? pacBalanceBase + (hlUnifiedAccount ? 0 : hlSpotAvailable) : pacBalanceBase;
  // Mark-to-market portfolio value. Used for the displayed "balance" number
  // and the no-funds deposit CTA gate so a losing trade doesn't make the UI
  // claim the account has $0 (and pop the deposit prompt) when the position
  // still has equity.
  const pacAccountValueBase = Math.max(0, parseFloat(
    account?.account_equity                // Pacifica unified
      ?? account?.perp_equity_balance      // Decibel
      ?? account?.usdc                     // GMX (acts as equity for cross-margin spec)
      ?? account?.usdcAvailable            // Avantis fallback
      ?? account?.balance                  // last-resort
      ?? 0
  ));
  const pacAccountValue = dex === 'hyperliquid' ? pacAccountValueBase + (hlUnifiedAccount ? 0 : hlSpotAvailable) : pacAccountValueBase;
  const currentMarket = useMemo(() => markets.find(m => m.symbol === symbol), [markets, symbol]);
  const fr = currentMarket ? parseFloat(currentMarket.funding_rate || 0) : 0;
  // Avantis doesn't have a signed funding rate — the number here is the
  // borrow-fee % per hour traders pay LPs. Relabel the badge so users
  // don't read it as the Pacifica-style signed periodic funding rate.
  const fundingLabel = dex === 'avantis' ? 'BORROW/h' : 'FUNDING';

  // Convert USDC amount to token amount, rounded to lot size
  const lotSize = useMemo(() => {
    return markets.find(m => m.symbol === symbol)?.lot_size || '0.00001';
  }, [markets, symbol]);
  const orderSizingPrice = useMemo(() => {
    if (orderType === 'limit' && Number(limitPrice) > 0) return Number(limitPrice);
    return Number(currentPrice) || 0;
  }, [orderType, limitPrice, currentPrice]);
  const pacificaTakerFeeRate = useMemo(() => {
    const fee = Number(account?.taker_fee);
    return Number.isFinite(fee) && fee > 0 ? fee : PACIFICA_DEFAULT_TAKER_FEE_RATE;
  }, [account?.taker_fee]);
  const phoenixTakerFeeRate = useMemo(() => {
    const fee = Number(account?.taker_fee);
    return Number.isFinite(fee) && fee > 0 ? fee : PHOENIX_DEFAULT_TAKER_FEE_RATE;
  }, [account?.taker_fee]);
  const phoenixMaxMargin = useMemo(() => (
    dex === 'phoenix'
      ? phoenixUsableMargin({
          balance: pacBalance,
          leverage,
          orderType,
          takerFeeRate: phoenixTakerFeeRate,
        })
      : pacBalance
  ), [dex, pacBalance, leverage, orderType, phoenixTakerFeeRate]);
  const pacificaMaxMargin = useMemo(() => (
    dex === 'pacifica'
      ? pacificaUsableMargin({ balance: pacBalance })
      : pacBalance
  ), [dex, pacBalance]);
  const sizePctMarginBase = dex === 'phoenix'
    ? phoenixMaxMargin
    : dex === 'pacifica'
    ? pacificaMaxMargin
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
    const sizingPx = Number(orderSizingPrice || currentPrice);
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
    return String(Math.floor(raw / lot) * lot);
  }, [amount, currentPrice, amountInUsdc, lotSize, leverage, dex, orderSizingPrice, orderType, pacificaTakerFeeRate]);

  // Derived display: position size in USDC (margin × leverage). Kept as a
  // number so callers can format or gate on it without re-parsing.
  const positionUsdc = useMemo(() => {
    if (amountInUsdc) {
      if (dex === 'pacifica') {
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
  const maxUsdc = sizePctMarginBase * leverage;
  const hasCurrentSymbolPosition = useMemo(
    () => positions.some(p => String(p.symbol || p.s || '').toUpperCase() === symbol.toUpperCase()),
    [positions, symbol]
  );
  const hasCurrentSymbolOrder = useMemo(
    () => orders.some(o => String(o.symbol || o.s || '').toUpperCase() === symbol.toUpperCase()),
    [orders, symbol]
  );
  const marginModeLocked = dex === 'pacifica' && (hasCurrentSymbolPosition || hasCurrentSymbolOrder);
  const handleMarginModeToggle = useCallback(async () => {
    clearTradeFeedback();
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
    if (dex === 'phoenix') {
      setLocalAlert('Phoenix new orders use cross margin here; existing isolated subaccounts are shown on positions.');
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
    setMarginMode?.(symbol, !marginModes[symbol]);
  }, [clearTradeFeedback, marginModeLocked, hasCurrentSymbolPosition, symbol, setMarginMode, marginModes, dex, pacAgent, bindAgent, bindingAgent]);

  const handleSizePct = useCallback((pct) => {
    clearTradeFeedback();
    setSizePct(pct);
    if (sizePctMarginBase > 0 && currentPrice) {
      // Slider now sets MARGIN (a fraction of the wallet balance), not
      // notional. 100% = full balance committed as collateral, which gives
      // a position = balance × leverage (= old "buying power").
      const marginVal = (sizePctMarginBase * pct / 100).toFixed(2);
      if (amountInUsdc) {
        setAmount(marginVal);
      } else {
        // Token-input mode: convert margin → token qty via leverage.
        const qty = dex === 'pacifica'
          ? pacificaQtyFromMargin({
              margin: marginVal,
              price: orderSizingPrice || currentPrice,
              leverage,
              orderType,
              takerFeeRate: pacificaTakerFeeRate,
            })
          : ((parseFloat(marginVal) * leverage) / parseFloat(orderSizingPrice || currentPrice));
        setAmount(String(qty.toFixed(6)));
      }
    }
  }, [clearTradeFeedback, sizePctMarginBase, currentPrice, amountInUsdc, leverage, dex, orderSizingPrice, orderType, pacificaTakerFeeRate]);

  const levTimerRef = useRef(null);
  const handleLeverageChange = useCallback((val) => {
    clearTradeFeedback();
    const v = Math.min(Number(val), maxLev);
    setLeverage(v);
    // Avantis + GMX take leverage per-trade (passed in placeOrder call),
    // so no leverage tx ever runs from the slider. Skip cleanly.
    if (dex === 'avantis' || dex === 'gmx' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado') return;
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
    try {
      // Pacifica API: 3rd arg is qty in base token (0.0022 BTC).
      // Avantis & Decibel APIs: 3rd arg is COLLATERAL / margin in USDC.
      // The UI's `amount` (in USDC mode) is the MARGIN the user deposits.
      // Guard against missing/NaN currentPrice (feed blip).
      const markPrice = parseFloat(currentPrice);
      const tradePrice = parseFloat(orderSizingPrice || currentPrice);
      const isCollateralDex = dex === 'avantis' || dex === 'decibel' || dex === 'gmx' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado';
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
        const collateralUsdc = amountInUsdc
          ? parseFloat(amount)
          : (tradePrice > 0 ? (parseFloat(tokenAmount) * tradePrice) / leverage : 0);
        if (dex === 'phoenix') {
          const reserve = phoenixMarginReserveDetails({
            balance: pacBalance,
            leverage,
            orderType,
            takerFeeRate: phoenixTakerFeeRate,
          });
          const maxMargin = reserve.usable_margin;
          console.info('[Phoenix UI] margin reserve check', {
            symbol,
            orderType,
            requested_side: side,
            requested_margin: collateralUsdc,
            position_usdc: Number.isFinite(positionUsdc) ? positionUsdc : null,
            amount_mode: amountInUsdc ? 'usdc_margin' : 'token_size',
            ...reserve,
          });
          if (Number.isFinite(collateralUsdc) && collateralUsdc > maxMargin + 1e-6) {
            console.warn('[Phoenix UI] margin blocked by fee/slippage buffer', {
              symbol,
              orderType,
              requested_side: side,
              requested_margin: collateralUsdc,
              max_margin: maxMargin,
              ...reserve,
            });
            setLocalAlert(
              `Phoenix needs fee/slippage buffer at ${leverage}x. Use $${maxMargin.toFixed(2)} margin or less from your $${pacBalance.toFixed(2)} free balance.`
            );
            return;
          }
        }
        qty = String(collateralUsdc.toFixed(6));
      } else {
        qty = amountInUsdc ? tokenAmount : amount;
        if (!qty || !Number.isFinite(parseFloat(qty)) || parseFloat(qty) <= 0) return;
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
      if (dex === 'pacifica' || dex === 'decibel') {
        if (levTimerRef.current) {
          clearTimeout(levTimerRef.current);
          levTimerRef.current = null;
        }
        const serverLev = leverageSettings[symbol];
        const serverLevNum = serverLev != null ? Number(serverLev) : NaN;
        const levMatches = Number.isFinite(serverLevNum) && Math.abs(serverLevNum - leverage) < 0.05;
        if (!levMatches) {
          // Decibel needs isCross alongside leverage; current production
          // mode is cross margin.
          const levOpts = (() => {
            if (dex !== 'decibel') return undefined;
            return { isCross: true };
          })();
          const levRes = await setLeverageApi(symbol, leverage, levOpts);
          if (!levRes || levRes.error) {
            setLocalAlert(levRes?.error || 'Could not set leverage. Close any open position on this symbol first.');
            return;
          }
        }
      }
      setTradePhase('signing');
      let result;
      if (orderType === 'market') {
        // 5th arg (leverage) is only read by useAvantis; usePacifica ignores it.
        result = await placeMarketOrder(symbol, side, qty, '0.5', leverage);
      } else {
        if (!limitPrice) return;
        result = await placeLimitOrder(symbol, side, limitPrice, qty, 'GTC', leverage);
      }
      setTradePhase(null);
      if (result && !result.error) {
        setSuccessMsg(
          orderType === 'market'
            ? `${side.toUpperCase()} ${symbol} opened`
            : `${side.toUpperCase()} ${symbol} limit placed`
        );
        setAmount('');
        setSizePct(0);
      }
    } finally {
      tradeInFlight.current = false;
      setTradeBusy(false);
      setTradePhase(null);
    }
  }, [amount, tokenAmount, positionUsdc, limitPrice, symbol, orderType, amountInUsdc, currentPrice, orderSizingPrice, currentMarket, placeMarketOrder, placeLimitOrder, leverage, leverageSettings, setLeverageApi, dex, pacAgent, bindAgent, bindingAgent, pacBalance, pacificaMaxMargin, pacificaTakerFeeRate, phoenixTakerFeeRate, positions]);

  // ==================== TRADE CONTROLS (reusable) ====================
  // Symbol info bar — token + market data (above chart)
  const curPriceData = useMemo(() => prices.find(p => p.symbol === symbol), [prices, symbol]);
  const change24h = useMemo(() => {
    if (!curPriceData) return 0;
    const yest = parseFloat(curPriceData.yesterday_price || 0);
    const mark = parseFloat(curPriceData.mark || 0);
    return yest > 0 ? ((mark - yest) / yest) * 100 : 0;
  }, [curPriceData]);
  const vol24h = curPriceData ? parseFloat(curPriceData.volume_24h || 0) : 0;
  const oi = curPriceData ? parseFloat(curPriceData.open_interest || 0) : 0;
  const oracle = curPriceData ? parseFloat(curPriceData.oracle || 0) : 0;
  const tradeButtonBusy = loading || tradeBusy || tradePhase != null;
  const tradeButtonPendingLabel = tradePhase === 'confirming'
    ? 'Confirming...'
    : tradePhase === 'signing'
      ? 'Signing...'
      : 'Preparing...';

  const renderSymbolBar = () => (
    <>
      <div style={{...S.symbolBar, ...(fullscreen ? {background: '#e8dfc8', borderBottom: '3px solid #d4c8b0'} : {})}}>
        <button style={{...S.symbolBtn, padding: '6px 10px', gap: 6, whiteSpace: 'nowrap', flexShrink: 0}} onClick={() => setShowSymbolPicker(!showSymbolPicker)} data-nodrag>
          <TokenIcon sym={currentMarket?.icon_symbol || currentMarket?.base || symbol} size={20} />
          <span style={{fontSize: 15, fontWeight: 900}}>{symbol}</span>
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
          {!isMobile && !fullscreen && currentPrice && <span style={{fontSize: 13, color: '#5C3A21', fontWeight: 700}}>${fmtPrice(parseFloat(currentPrice))}</span>}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {fullscreen && !isMobile && (
          <>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Mark</span><span style={S.infoCellValue}>{currentPrice ? fmtPrice(parseFloat(currentPrice)) : '—'}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Oracle</span><span style={S.infoCellValue}>{oracle > 0 ? fmtPrice(oracle) : '—'}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>24h</span><span style={{...S.infoCellValue, color: change24h >= 0 ? '#4CAF50' : '#E53935'}}>{change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Volume</span><span style={S.infoCellValue}>${vol24h >= 1e6 ? (vol24h/1e6).toFixed(1)+'M' : vol24h >= 1e3 ? (vol24h/1e3).toFixed(0)+'K' : vol24h.toFixed(0)}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>OI</span><span style={S.infoCellValue}>${oi >= 1e6 ? (oi/1e6).toFixed(1)+'M' : oi >= 1e3 ? (oi/1e3).toFixed(0)+'K' : oi.toFixed(0)}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>{dex === 'avantis' ? 'Borrow/h' : 'Funding'}</span><span style={{...S.infoCellValue, color: fr >= 0 ? '#4CAF50' : '#E53935'}}>{fr >= 0 ? '+' : ''}{(fr * 100).toFixed(4)}%</span></div>
          </>
        )}
        <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: (isMobile || !fullscreen) ? 4 : 8, flexShrink: 0}}>
          {dex === 'avantis' || dex === 'gmx' || dex === 'decibel' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' ? (
            // Read-only badge for venues where the production margin mode is
            // not user-toggleable in our integration.
            <div
              style={{...S.marginSwapBtn, padding: '6px 10px', fontSize: 12, gap: 4, cursor: 'default', opacity: 0.85}}
              title={dex === 'gmx'
                ? 'GMX V2 uses isolated margin per position (no cross mode)'
                : dex === 'decibel'
                ? 'Decibel currently uses cross margin; isolated margin is not available yet'
                : dex === 'monad'
                ? 'Perpl uses isolated margin per position in this integration'
                : dex === 'phoenix'
                ? 'Phoenix new orders use cross margin; existing isolated subaccounts are shown on positions'
                : dex === 'hyperliquid'
                ? 'Hyperliquid uses cross margin in your Hyperliquid account'
                : dex === 'risex'
                ? 'RISEx uses cross margin in your RISE account'
                : dex === 'nado'
                ? 'Nado uses cross margin in your Ink account'
                : 'Avantis uses isolated margin per trade (no cross mode)'}
            >
              <span style={{color: (dex === 'decibel' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado') ? '#4CAF50' : '#FF9800', fontWeight: 900}}>
                {(dex === 'decibel' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado') ? 'Cross' : 'Isolated'}
              </span>
            </div>
          ) : (
            <button
              style={{
                ...S.marginSwapBtn,
                padding: '6px 10px',
                fontSize: 12,
                gap: 4,
                opacity: marginModeLocked ? 0.65 : 1,
                cursor: marginModeLocked ? 'not-allowed' : 'pointer',
              }}
              onClick={handleMarginModeToggle}
              title={marginModeLocked
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
          <div style={{...S.balBadge, padding: '4px 8px'}}>
            <span style={{fontSize: 8, fontWeight: 700, color: '#a3906a', lineHeight: 1}}>BALANCE</span>
            {/* Use account equity (mark-to-market) so the badge reflects the
                actual portfolio value — including PnL on open positions —
                not raw collateral that can go negative under unified margin. */}
            <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21', lineHeight: 1.1}}>${pacAccountValue.toFixed(2)}</span>
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
      {pacAccountValue < 0.01 && (
        <div style={S.noBalanceHint} onClick={() => setActiveTab('Account')}>
          No balance — go to Account tab to deposit USDC
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
            <span style={S.label}>Limit Price</span>
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
            <input type="number" placeholder={amountInUsdc ? '20' : '0.01'} value={amount}
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
        <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: 11, fontWeight: 700, color: '#a3906a'}}>
              {sizePct}% of ${sizePctMarginBase.toFixed(2)} {(dex === 'phoenix' || dex === 'pacifica') ? 'usable' : 'balance'}
            </span>
            <span style={{fontSize: 11, fontWeight: 700, color: '#5C3A21'}}>
              buying power ${maxUsdc.toFixed(0)}
            </span>
          </div>
          <input type="range" min="0" max="100" step="5" value={sizePct} className="grad-slider"
            onChange={e => handleSizePct(Number(e.target.value))} style={{...S.slider, '--val': `${sizePct}%`}} />
          <div style={S.sliderLabels}>
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>

        {/* Leverage modal */}
        {showLeverage && (
          <>
            <div style={S.levBackdrop} onClick={() => setShowLeverage(false)} />
            <div style={S.levModal}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span style={{fontSize: 16, fontWeight: 900, color: '#5C3A21'}}>Adjust Leverage</span>
                <button style={S.levCloseBtn} onClick={() => setShowLeverage(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{fontSize: 48, fontWeight: 900, color: '#5C3A21', textAlign: 'center', padding: '10px 0'}}>{leverage}x</div>
              <input type="range" min="1" max={maxLev} value={leverage} className="grad-slider" onChange={e => handleLeverageChange(e.target.value)} style={{...S.slider, '--val': `${maxLev > 1 ? ((leverage - 1) / (maxLev - 1)) * 100 : 0}%`}} />
              <div style={S.sliderLabels}><span>1x</span><span>{Math.floor(maxLev/4)}x</span><span>{Math.floor(maxLev/2)}x</span><span>{Math.floor(maxLev*3/4)}x</span><span>{maxLev}x</span></div>
              <div style={{display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap'}}>
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
                      <button key={v} style={leverage === v ? S.levPresetActive : S.levPreset}
                        onClick={() => handleLeverageChange(v)}>{v}x</button>
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

        {error && (
          <div style={S.errorBar} onClick={clearError}>
            <span style={S.errorText}>{humanizeTradeError(error)}</span>
            <span style={S.errorCloseIcon}>✕</span>
          </div>
        )}
        {localAlert && (
          <div style={S.errorBar} onClick={() => setLocalAlert(null)}>
            <span style={S.errorText}>{humanizeTradeError(localAlert)}</span>
            <span style={S.errorCloseIcon}>✕</span>
          </div>
        )}
        {successMsg && (
          <div style={S.successBar} onClick={() => setSuccessMsg(null)}>
            <span>✓ {successMsg}</span>
          </div>
        )}

        <div style={S.row}>
          <button style={{...cartoonBtn('#4CAF50','#2E7D32'), ...S.tradeBtn}} onClick={() => handleTrade('bid')} disabled={tradeButtonBusy}>
            <span style={S.tradeBtnText}>{tradeButtonBusy ? tradeButtonPendingLabel : 'LONG'}</span>
          </button>
          <button style={{...cartoonBtn('#E53935','#B71C1C'), ...S.tradeBtn}} onClick={() => handleTrade('ask')} disabled={tradeButtonBusy}>
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
    let list = orders;
    if (btmFilters.symbol !== 'All') list = list.filter(o => (o.symbol || o.s) === btmFilters.symbol);
    if (btmFilters.side !== 'All') {
      const wantBid = btmFilters.side === 'Long';
      list = list.filter(o => { const s = orderPositionSide(o); return wantBid ? s === 'bid' : s === 'ask'; });
    }
    const dir = btmFilters.sortDir === 'asc' ? 1 : -1;
    if (btmFilters.sortBy === 'symbol') list = [...list].sort((a, b) => dir * (a.symbol || a.s || '').localeCompare(b.symbol || b.s || ''));
    else if (btmFilters.sortBy === 'price') list = [...list].sort((a, b) => dir * (parseFloat(b.price || b.ip || 0) - parseFloat(a.price || a.ip || 0)));
    return list;
  }, [orders, btmFilters]);

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
              border: '6px solid #E7D9BF',
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
  if ((dex === 'avantis' || dex === 'gmx' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado') && walletMismatch) {
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
              Wrong {dex === 'gmx' || dex === 'hyperliquid' ? 'Arbitrum' : dex === 'monad' ? 'Monad' : dex === 'risex' ? 'RISE' : dex === 'nado' ? 'Ink' : dex === 'phoenix' ? 'Solana' : 'Base'} wallet
            </div>
            <div style={{color: '#8a7252', fontSize: 12, fontWeight: 700, maxWidth: 340, lineHeight: 1.45}}>
              This game account is linked to {registeredEvmWallet?.slice(0, 6)}...{registeredEvmWallet?.slice(-4)}, but the connected wallet is {walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)}.
            </div>
            <button
              style={{...cartoonBtn('#0EA5E9', '#0284C7'), padding: '14px 28px'}}
              onClick={() => dex === 'phoenix' ? openWalletModal(true) : setEvmModalOpen(true)}
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
            {dex === 'decibel' ? (
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
                  <span>PHOENIX В· SOLANA MAINNET</span>
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
            {!isRunning && (
              <button data-nodrag onClick={handleClose} style={S.closeBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
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
                  {humanizeTradeError(error || localAlert)}
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
            {!isRunning && (
              <button data-nodrag onClick={handleClose} style={S.closeBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
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
                  {humanizeTradeError(error || localAlert)}
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
            {!isRunning && (
              <button data-nodrag onClick={handleClose} style={S.closeBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
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
                  {humanizeTradeError(error || localAlert)}
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
    const stepLabel = activationStep?.label || (isChecking ? 'Checking RISEx signer' : 'Register RISEx signer');
    const risexSteps = needsRisexCode
      ? [
          { idx: 1, title: 'Redeem RISEx invite code' },
          { idx: 2, title: 'Sign RISEx signer registration' },
          { idx: 3, title: 'Verify signer on RISEx mainnet' },
        ]
      : [
          { idx: 1, title: 'Sign RISEx signer registration' },
          { idx: 2, title: 'Verify signer on RISEx mainnet' },
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
            {!isRunning && (
              <button data-nodrag onClick={handleClose} style={S.closeBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
          <div style={{ ...S.body, alignItems: 'stretch', overflowY: 'auto', overflowX: 'hidden', padding: 0, background: '#fdf8e7' }}>
            <div style={hlGateStyles.frame}>
              <div style={hlGateStyles.titleBlock}>
                <img src={DEX_CONFIG.risex.logo} alt="" style={{width: 56, height: 56, objectFit: 'contain', alignSelf: 'center'}} />
                <span style={hlGateStyles.kicker}>{isChecking ? 'CHECKING' : isRunning ? `STEP ${activationStep?.index || 1} OF ${activationStep?.total || 2}` : 'ACTION REQUIRED'}</span>
                <span style={hlGateStyles.title}>{stepLabel}</span>
                <span style={hlGateStyles.subtitle}>
                  RISEx uses a dedicated browser signer for orders. Your wallet authorizes it once with an EIP-712 signature.
                </span>
              </div>
              <ol style={hlGateStyles.stepList}>
                {risexSteps.map((s) => {
                  const active = isRunning && Number(activationStep?.index || 1) === s.idx;
                  const state = active ? 'active' : 'pending';
                  return (
                    <li key={s.idx} style={hlGateStyles.stepItem}>
                      <span style={{ ...hlGateStyles.stepBubble, ...hlGateStyles[`stepBubble_${state}`] }}>
                        {active ? <span style={hlGateStyles.spinner} /> : s.idx}
                      </span>
                      <span style={hlGateStyles.stepText}>
                        <span style={{ ...hlGateStyles.stepLabel, ...hlGateStyles[`stepLabel_${state}`] }}>{s.title}</span>
                        <span style={hlGateStyles.stepHint}>
                          {needsRisexCode && s.idx === 1
                            ? 'Sign a message to redeem access before trading.'
                            : s.title.includes('Sign')
                            ? 'Approve the wallet popup on RISE.'
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
                disabled={isChecking || loading}
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
                  {humanizeTradeError(error || localAlert)}
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
                <span style={S.errorText}>{humanizeTradeError(error)}</span>
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
    const checkingInvite = setupVerified === null || inviteStatus?.checking;
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
              {checkingInvite ? 'Checking Phoenix access' : whitelisted ? 'Create your Phoenix account' : 'Enter your Phoenix code'}
            </div>
            <div style={{color: '#8a7252', fontSize: 12, fontWeight: 700, maxWidth: 360, lineHeight: 1.45}}>
              {whitelisted
                ? 'This wallet is allowlisted. Create the on-chain trader account, then deposit USDC to trade.'
                : 'Phoenix requires an access code before the trader account can be created.'}
            </div>
            {checkingInvite ? (
              <div style={{width: '100%', maxWidth: 360, minHeight: 108, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10}}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  border: '5px solid rgba(249,115,22,0.22)',
                  borderTopColor: DEX_CONFIG.phoenix.color,
                  animation: 'wallet-spin 0.85s linear infinite',
                }} />
                <div style={{fontSize: 12, color: '#8a7252', fontWeight: 800}}>
                  Checking wallet allowlist...
                </div>
              </div>
            ) : !whitelisted && (
              <div style={{width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 8}}>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                  {[
                    ['access', 'Access code'],
                    ['referral', 'Referral code'],
                  ].map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setPhoenixInviteKind(kind)}
                      style={{
                        ...S.btnSmall,
                        background: phoenixInviteKind === kind ? DEX_CONFIG.phoenix.color : '#F7EBD2',
                        border: `2px solid ${phoenixInviteKind === kind ? DEX_CONFIG.phoenix.borderColor : '#D4C8B0'}`,
                        color: phoenixInviteKind === kind ? '#fff' : '#5C3A21',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder={phoenixInviteKind === 'referral' ? 'Referral code' : 'Access code'}
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
                const ok = await activate({
                  inviteCode: phoenixInviteCode,
                  inviteKind: phoenixInviteKind,
                });
                if (ok) setPhoenixInviteCode('');
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
              }}>{humanizeTradeError(error)}</div>
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
            {/* Close button is hidden while activation is running so the
                user can't bail out mid-signature and end up half-set-up. */}
            {!isRunning && (
              <button data-nodrag onClick={handleClose} style={S.closeBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
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
                  {humanizeTradeError(error)}
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
      <div style={S.fundingOverlay}>
        <span style={S.fundingOLabel}>{fundingLabel}</span>
        <span style={{...S.fundingOValue, color: fr >= 0 ? '#4CAF50' : '#E53935'}}>
          {fr >= 0 ? '+' : ''}{(fr * 100).toFixed(4)}%
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
          <div style={{display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden'}}>
            {renderSymbolBar()}
            {/* Top: chart */}
            <div style={{flex: '0 1 clamp(220px, 38vh, 360px)', position: 'relative', minHeight: 180}}>
              <TradingViewWidget symbol={symbol} pythSymbol={currentMarket?.pyth_symbol} positions={positions} orders={orders} currentPrice={currentPrice} chartOverlay={explainBadge} dex={dex} />
              {fundingBadge}
            </div>

            {/* Bottom: Trade controls */}
            <div style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
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
              <TradingViewWidget symbol={symbol} pythSymbol={currentMarket?.pyth_symbol} positions={positions} orders={orders} currentPrice={currentPrice} chartOverlay={explainBadge} dex={dex} />
            </div>
            {(dex === 'pacifica' || dex === 'phoenix') && (
              <>
                {/* Drag handle: chart ↔ orderbook */}
                <div style={S.dragHandleV} onMouseDown={dragChart} />
                <div style={{flex: `0 0 ${obWidth}px`, minHeight: 0, overflow: 'hidden'}}>
                  {/* OrderBook hits Pacifica's REST API directly. Avantis uses
                      its own SDK (no public order book), Decibel pushes
                      orderbook via WebSocket and we don't render that yet —
                      gate strictly to Pacifica until those are wired. */}
                  <OrderBook symbol={symbol} dex={dex} />
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
            prices={prices}
            walletAddr={walletAddr}
            historyAccountAddr={dex === 'decibel' ? subaccountAddr : walletAddr}
            markets={markets}
            dataReady={dataReady}
            leverageSettings={leverageSettings}
            closePosition={closePosition}
            cancelOrder={cancelOrder}
            dex={dex}
            loading={loading}
          />
        </div>
      );
    }
    // Normal (mobile) layout: symbol bar, chart with funding overlay, controls
    return (
      <>
        {renderSymbolBar()}
        <div style={{...S.chartArea, position: 'relative'}}>
          <TradingViewWidget symbol={symbol} pythSymbol={currentMarket?.pyth_symbol} positions={positions} orders={orders} currentPrice={currentPrice} chartOverlay={explainBadge} dex={dex} />
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
          const { entryP, markP, margin, pnlVal, setLev, posValueUsd, pnlPct, pnlColor } = getPositionMetrics(pos, prices, leverageSettings);
          const posKey = `${pos.symbol}-${pos.side}`;
          const expanded = expandedPos?.startsWith(posKey) ? expandedPos.split(':')[1] : null;

          // Basic mode shows a stripped-down card: ticker + UP/DOWN icon +
          // leverage + dollar PnL + Close. No size, no entry/mark prices,
          // no percentages, no ISO/CROSS badge — those are noise for a
          // first-time trader who just wants "am I winning?".
          if (isBasic) {
            // Snapshot of the trade — captured fresh each render, used by
            // both the share button (open) and the auto-modal (close).
            // Stored as a plain object so it survives the positions[] mutation
            // that close triggers.
            const snapshot = {
              symbol: pos.symbol,
              side: pos.side === 'bid' ? 'long' : 'short',
              leverage: setLev,
              entryPrice: entryP,
              exitPrice: markP,
              pnlUsd: pnlVal,
              pnlPct: pnlPct,
              isOpen: true,
            };
            const handleClose = async () => {
              const finalSnapshot = { ...snapshot, isOpen: false };
              const result = await closePosition(
                pos.symbol, pos.side,
                String(dex === 'avantis' ? parseFloat(pos.margin) : parseFloat(pos.amount)),
                pos.pair_index, pos.trade_index, true,
              );
              // closePosition returns the API response on success and
              // undefined on error (catches internally + sets `error`).
              if (result && !result.error && result.status === 'closed') {
                setShareTrade(finalSnapshot);
              }
            };
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
                    }}>{setLev}×</span>
                  </div>
                  <span style={{
                    fontSize: 18, fontWeight: 900, color: pnlColor,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {pnlVal >= 0 ? '+' : '−'}${Math.abs(pnlVal).toFixed(2)}
                  </span>
                </div>

                {/* Action row: Close (big) + Share (icon-only). Share works
                    on the OPEN snapshot — the user wants to brag now, before
                    the trade resolves. After Close, an auto-modal pops up
                    with the realised result. */}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    style={{...S.btnRed, flex: 1, padding: '10px'}}
                    onClick={handleClose}
                    disabled={loading}
                  >
                    {loading ? <ClosingButtonLabel text="Closing position..." /> : 'Close position'}
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

          // Pro path — same trade snapshot pattern as Basic, used for both
          // the share-icon button (open position) and the auto-modal that
          // pops on a successful close. Captured once per render so a stale
          // positions[] (post-close) can't blank out the share image.
          const proSnapshot = {
            symbol: pos.symbol,
            side: pos.side === 'bid' ? 'long' : 'short',
            leverage: setLev,
            entryPrice: entryP,
            exitPrice: markP,
            pnlUsd: pnlVal,
            pnlPct: pnlPct,
            isOpen: true,
          };
          const handleProClose = async (closeFraction) => {
            const finalSnapshot = { ...proSnapshot, isOpen: false };
            const amount = (dex === 'avantis' ? parseFloat(pos.margin) : parseFloat(pos.amount)) * closeFraction;
            const result = await closePosition(
              pos.symbol, pos.side, String(amount),
              pos.pair_index, pos.trade_index, closeFraction >= 1,
            );
            // closePosition returns the API response on success and undefined
            // on error. Only show the share modal when the close was a FULL
            // exit (closeFraction = 1) — partial closes still leave a position
            // open and showing the modal mid-trade is confusing.
            if (result && !result.error && result.status === 'closed' && closeFraction >= 1) {
              setShareTrade(finalSnapshot);
            }
          };
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
                  <span style={{fontSize: 11, fontWeight: 800, color: '#a3906a', background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{setLev}x</span>
                  <span style={{fontSize: 13, fontWeight: 900, color: pos.side === 'bid' ? '#4CAF50' : '#E53935'}}>
                    {pos.side === 'bid' ? 'LONG' : 'SHORT'}
                  </span>
                </div>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Size: {pos.amount} <span style={{color: '#a3906a'}}>(${posValueUsd.toFixed(2)})</span></span>
                <span style={S.detail}>Entry: ${fmtPrice(parseFloat(pos.entry_price))}</span>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Mark: ${fmtPrice(markP)}</span>
                <span style={{fontSize: 14, fontWeight: 900, color: pnlColor}}>
                  {pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                </span>
              </div>
              {/* Liquidation price row — visible on every venue that ships
                  it through the position normaliser. Reading the figure
                  off the card was raised in the audit as a critical UX
                  hazard for any leveraged trader. We colour it red as a
                  passive warning when the mark sits within ±10% of liq. */}
              {(() => {
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
              <PositionTpslRow pos={pos} />

              {/* Action buttons: Close + TP/SL + Share-icon. Share lives in
                  Pro too (per-user-request) — same icon as Basic for
                  consistency. */}
              <div style={{display: 'flex', gap: 6, marginTop: 4}}>
                <button style={S.btnRed} onClick={() => { setClosePct(100); setExpandedPos(expanded === 'close' ? null : `${posKey}:close`); }}>Close</button>
                {!isBasic && (
                  <button style={S.btnBlue} onClick={() => {
                    if (expanded === 'tpsl') {
                      setExpandedPos(null);
                      return;
                    }
                    const { tp, sl } = getPositionTpsl(pos);
                    setTpPrice(formatTpslInputValue(tp));
                    setSlPrice(formatTpslInputValue(sl));
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
                    <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>Close {closePct}%</span>
                    <span style={{fontSize: 11, color: '#a3906a', fontWeight: 700}}>
                      {(parseFloat(pos.amount) * closePct / 100).toFixed(6)} {pos.symbol}
                    </span>
                  </div>
                  <input type="range" min="5" max="100" step="5" value={closePct} className="grad-slider" onChange={e => setClosePct(Number(e.target.value))} style={{...S.slider, '--val': `${((closePct - 5) / 95) * 100}%`}} />
                  <div style={S.sliderLabels}><span>5%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                  <button style={{...S.btnRed, width: '100%'}} onClick={() => handleProClose(closePct / 100)} disabled={loading}>
                    {loading ? <ClosingButtonLabel /> : `Close ${closePct}%`}
                  </button>
                </div>
              )}

              {/* TP/SL panel — gated on Basic mode (button is hidden too). */}
              {!isBasic && expanded === 'tpsl' && (
                <div style={{...S.expandPanel, ...S.row}}>
                  <input type="number" placeholder="TP Price" value={tpPrice} onChange={e => setTpPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                  <input type="number" placeholder="SL Price" value={slPrice} onChange={e => setSlPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                  <button style={S.btnBlue} onClick={async () => {
                    await setTpsl(pos.symbol, pos.side === 'bid' ? 'ask' : 'bid', tpPrice || null, slPrice || null, pos.pair_index, pos.trade_index, pos.amount, pos.market_addr);
                    setTpPrice(''); setSlPrice(''); setExpandedPos(null);
                  }} disabled={!tpPrice && !slPrice}>Set</button>
                </div>
              )}
            </div>
          );
        })}

        {error && (
          <div style={S.errorBar} onClick={clearError}>
            <span style={S.errorText}>{humanizeTradeError(error)}</span>
            <span style={S.errorCloseIcon}>✕</span>
          </div>
        )}
        {localAlert && (
          <div style={S.errorBar} onClick={() => setLocalAlert(null)}>
            <span style={S.errorText}>{humanizeTradeError(localAlert)}</span>
            <span style={S.errorCloseIcon}>✕</span>
          </div>
        )}
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
    if (!orders.length) {
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
        {orders.map((o, i) => {
          const sym = o.symbol || o.s;
          const side = o.side || o.d;
          const rawPrice = parseFloat(o.price || o.ip || 0);
          const stopPrice = parseFloat(o.stop_price || o.sp || 0);
          const price = rawPrice > 0 ? rawPrice : stopPrice;
          const rawAmt = o.initial_amount || o.amount || o.a;
          const amt = parseFloat(rawAmt || 0) > 0 ? rawAmt : 'Full position';
          const type = (o.order_type || o.ot || (stopPrice > 0 ? 'stop' : 'limit')).toUpperCase().replace(/_/g, ' ');
          const isBid = orderPositionSide(o) === 'bid' || side === 'bid';
          const sideLabel = orderSideLabel(o);
          const isTP = type.includes('TAKE') || type.includes('TP');
          const isSL = type.includes('STOP') || type.includes('SL');
          const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
          return (
            <div key={orderStableKey(o, i)} style={S.posCard}>
              <div style={S.row}>
                <span style={{fontSize: 16, fontWeight: 900}}>{sym}</span>
                <span style={{fontSize: 10, fontWeight: 800, color: typeColor, background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{type}</span>
                <span style={{fontSize: 13, fontWeight: 900, color: isBid ? '#4CAF50' : '#E53935'}}>
                  {sideLabel}
                </span>
                <button style={S.cancelBtn} onClick={() => cancelOrder(sym, o.order_id || o.i, o.pair_index, o.trade_index)}>✕</button>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Price: ${fmtPrice(parseFloat(price))}</span>
                <span style={S.detail}>Amount: {amt}</span>
              </div>
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
    const depositActionBusy = ['preparing', 'switching', 'signing', 'confirming', 'bridging', 'depositing']
      .includes(String(depositStatus?.status || ''));
    const risexDepositBusy = dex === 'risex' && depositActionBusy;
    const depositButtonLabel = (() => {
      if (depositStatus?.status === 'preparing') return 'Preparing...';
      if (depositStatus?.status === 'switching') return 'Switching...';
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
    const nadoWalletValue = (() => {
      if (dex !== 'nado') return walletUsdc !== null ? `$${walletUsdc.toFixed(2)}` : '$--';
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
    const walletBalanceLabel = dex === 'hyperliquid'
      ? 'Arbitrum Wallet USDC'
      : dex === 'risex'
      ? 'RISE Wallet USDC'
      : dex === 'nado'
      ? 'Ink Wallet USDt0'
      : 'Wallet USDC';
    const walletBalanceValue = dex === 'risex' ? risexWalletValue : dex === 'nado' ? nadoWalletValue : `$${walletUsdc !== null ? walletUsdc.toFixed(2) : '--'}`;
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

        {/* Wallet USDC */}
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
            <span style={S.balCardLabel}>{dex === 'hyperliquid' ? 'Available' : 'Free Margin'}</span>
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

        {/* Avantis & GMX are non-custodial — no deposit/withdraw. Show a
            read-only info card that explains funds live in the user's own
            wallet. Per-DEX accent colour + chain copy keeps the brand
            consistent (Avantis blue / Base, GMX purple / Arbitrum). */}
        {(dex === 'avantis' || dex === 'gmx' || dex === 'hyperliquid') ? (() => {
          const isGmx = dex === 'gmx';
          const isHyperliquid = dex === 'hyperliquid';
          const accentLight = isHyperliquid ? '#16A34A' : isGmx ? '#4F46E5' : '#0EA5E9';
          const accentDark = isHyperliquid ? '#166534' : isGmx ? '#3730A3' : '#0369A1';
          const accentBg = isHyperliquid ? 'rgba(22,163,74,0.08)' : isGmx ? 'rgba(79,70,229,0.08)' : 'rgba(14,165,233,0.08)';
          const accentBorder = isHyperliquid ? 'rgba(22,163,74,0.35)' : isGmx ? 'rgba(79,70,229,0.35)' : 'rgba(14,165,233,0.35)';
          const accentBtnBorder = isHyperliquid ? '#15803D' : isGmx ? '#4338CA' : '#0284C7';
          const chainName = isHyperliquid ? 'Arbitrum' : isGmx ? 'Arbitrum' : 'Base';
          const isDepositing = isHyperliquid && depositStatus?.status === 'depositing';
          const isMovingToPerp = isHyperliquid && depositStatus?.status === 'moving_to_perp';
          const isFundingBusy = isDepositing || isMovingToPerp;
          const pendingDepositAmount = Number(depositStatus?.amount);
          const pendingDepositLabel = Number.isFinite(pendingDepositAmount)
            ? pendingDepositAmount.toFixed(2)
            : String(depositStatus?.amount || '');
          return (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: accentLight}}>{isHyperliquid ? 'Hyperliquid funding' : 'Self-custody wallet'}</span>
              {isFundingBusy
                ? <span style={{...S.detail, color: '#15803D'}}>{isMovingToPerp ? 'Moving to trading' : 'Depositing'}{pendingDepositLabel ? ` ${pendingDepositLabel} USDC` : ''}...</span>
                : walletUsdc !== null && <span style={S.detail}>{isHyperliquid ? 'Arbitrum ' : ''}USDC: ${walletUsdc.toFixed(2)}</span>}
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              {!isHyperliquid && (
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
                  : <>Funds stay in YOUR wallet. Each trade prompts a signature. Make sure you have <b>USDC</b> + a small <b>ETH</b> gas float on <b>{chainName}</b>.</>}
              </span>
            </div>
          </div>
          );
        })() : (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#4CAF50'}}>{dex === 'monad' ? 'Deposit AUSD' : dex === 'nado' ? 'Deposit USDt0' : 'Deposit USDC'}</span>
              {dex === 'risex'
                ? (
                  <span style={{...S.detail, color: '#15803D'}}>
                    {risexDepositSource?.name || 'Arbitrum'} USDC: {risexSourceBalanceText}
                  </span>
                )
                : walletUsdc !== null && <span style={S.detail}>Wallet: ${walletUsdc.toFixed(2)} {dex === 'monad' ? 'AUSD' : dex === 'nado' ? 'USDt0' : 'USDC'}</span>}
            </div>
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
              {/* Pacifica enforces a $10 deposit floor. Decibel/Phoenix/Perpl
                  do not have this fixed UI floor here (per-market minSize
                  matters for trading; deposits are free-form). */}
              <input type="number"
                placeholder={dex === 'monad' ? 'Amount (AUSD)' : dex === 'pacifica' ? 'Min 10 USDC' : dex === 'nado' && !account?.exists ? 'Min 5 USDt0' : dex === 'nado' ? 'Amount (USDt0)' : dex === 'risex' ? 'Amount (USDC)' : 'Amount (USDC)'}
                value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}} />
              <button style={{...S.depositBtn, flex: 1, whiteSpace: 'nowrap', padding: '8px 4px'}} onClick={async () => {
                const minDeposit = dex === 'pacifica' ? 10 : (dex === 'nado' && !account?.exists ? 5 : 0);
                const v = parseFloat(depositAmt);
                if (!Number.isFinite(v) || v <= 0 || (minDeposit > 0 && v < minDeposit)) {
                  setLocalAlert(minDeposit > 0 ? `Min deposit ${minDeposit} ${dex === 'nado' ? 'USDt0' : 'USDC'}` : 'Enter a positive amount');
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
                if (dex === 'nado' && walletUsdc !== null && v > walletUsdc + 0.000001) {
                  setLocalAlert(`Ink wallet has ${walletUsdc.toFixed(2)} USDt0`);
                  return;
                }
                const r = await depositToPacifica(depositAmt, dex === 'risex' ? { sourceChainId: risexDepositSource?.id } : undefined);
                if (!r?.error) {
                  setDepositAmt('');
                  if (r?.info) setLocalAlert(r.info);
                }
              }} disabled={loading || depositActionBusy}>
                {depositButtonLabel}
              </button>
            </div>
            <span style={{fontSize: 10, color: '#a3906a', fontWeight: 700}}>
              {dex === 'decibel'
                ? 'Sends USDC from your Aptos wallet to your Decibel trading subaccount. Needs a small APT float for gas.'
                : dex === 'monad'
                ? 'Sends AUSD from your Monad wallet to your Perpl account. Needs a small MON float for gas.'
                : dex === 'phoenix'
                ? 'Sends USDC from your Solana wallet to your Phoenix trader account. Needs a small SOL float for gas.'
                : dex === 'nado'
                ? 'Approves USDt0 on Ink, then deposits it into your Nado default subaccount. Needs a small ETH float on Ink for gas.'
                : dex === 'risex'
                ? (
                  <>
                    Transfers native <b>USDC on {risexDepositSource?.name || 'Arbitrum'}</b> to the RISEx bridge deposit address, then submits the tx to RISEx. Needs source-chain gas.
                  </>
                )
                : 'Sends USDC from your wallet to Pacifica. Needs ~0.005 SOL for gas.'}
            </span>
          </div>
        )}

        {/* Withdraw card. Avantis & GMX are non-custodial → no withdraw.
            Pacifica shows when there's something to take out. Decibel ALWAYS
            shows it so the user sees the action exists from day one (button
            disables when available=0 instead of hiding the whole card). */}
        {dex !== 'avantis' && dex !== 'gmx' && dex !== 'risex' && (dex === 'decibel' || dex === 'hyperliquid' || dex === 'nado' || available > 0) && (
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
                disabled={loading || !withdrawAmt || withdrawMax <= 0}
              >
                {loading ? '...' : (withdrawMax <= 0 ? 'No funds' : 'Withdraw')}
              </button>
            </div>
            <span style={{fontSize: 10, color: '#a3906a', fontWeight: 700}}>
              {dex === 'hyperliquid'
                ? 'Requests a Hyperliquid withdrawal to your connected Arbitrum address. Arrival usually takes a few minutes.'
                : dex === 'decibel'
                ? 'Withdraws from your Decibel trading subaccount back to your Aptos wallet.'
                : dex === 'monad'
                ? 'Withdraws AUSD from Perpl back to your Monad wallet.'
                : dex === 'phoenix'
                ? 'Withdraws USDC from your Phoenix trader account back to your Solana wallet.'
                : dex === 'nado'
                ? 'Withdraws USDt0 from your Nado default subaccount back to your Ink wallet. Nado charges a 1 USDt0 withdrawal fee, so Max subtracts it.'
                : 'Withdraws USDC from Pacifica back to your wallet.'}
            </span>
          </div>
        )}

        {/* Account stats */}
        <div style={S.fullCard}>
          <span style={S.label}>Account Info</span>
          {[
            ['Positions', account?.positions_count || 0],
            ['Open Orders', account?.orders_count || 0],
            ['Fee Tier', account?.fee_level ?? '—'],
            ['Maker Fee', account?.maker_fee ? (parseFloat(account.maker_fee) * 100).toFixed(3) + '%' : '—'],
            ['Taker Fee', account?.taker_fee ? (parseFloat(account.taker_fee) * 100).toFixed(3) + '%' : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{...S.row, padding: '4px 0', borderBottom: '1px solid #d4c8b0'}}>
              <span style={S.detail}>{k}</span>
              <span style={{fontSize: 13, fontWeight: 800, color: '#5C3A21'}}>{v}</span>
            </div>
          ))}
        </div>

        {error && (
          <div style={S.errorBar} onClick={clearError}>
            <span style={S.errorText}>{humanizeTradeError(error)}</span>
            <span style={S.errorCloseIcon}>✕</span>
          </div>
        )}
        {localAlert && (
          <div style={S.errorBar} onClick={() => setLocalAlert(null)}>
            <span style={S.errorText}>{humanizeTradeError(localAlert)}</span>
            <span style={S.errorCloseIcon}>✕</span>
          </div>
        )}
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
                  : dex === 'hyperliquid'
                  ? (oneTapTrading?.approved ? 'One tap trading is ready' : 'Enable Hyperliquid one tap trading')
                  : 'Unlock 5% off every Avantis trade'}
              </span>
              <span style={{fontSize: 10, fontWeight: 700, color: '#8a6914'}}>
                {dex === 'hyperliquid'
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
              {referralLinking ? 'SIGNING...' : (dex === 'decibel' ? 'ACTIVATE' : dex === 'hyperliquid' ? 'ENABLE' : 'UNLOCK')}
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
        <div className="futures-panel-body" style={S.body}>
          <div key={activeTab} style={{animation: 'fadeIn 0.25s ease-out', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0}}>
            {renderContent()}
          </div>
        </div>

        {/* Powered by DEX footer — switches logo + label per active DEX */}
        <div style={S.pacificaFooter}>
          {dex === 'avantis' ? (
            <>
              <span style={S.pacificaText}>Powered by</span>
              <img
                src={DEX_CONFIG.avantis.logo}
                alt="Avantis"
                style={{
                  height: 14, width: 'auto', objectFit: 'contain',
                  // Tint white SVG to Avantis blue on the light footer bg.
                  filter: 'brightness(0) saturate(100%) invert(49%) sepia(88%) saturate(1854%) hue-rotate(173deg) brightness(93%) contrast(97%)',
                }}
              />
            </>
          ) : dex === 'decibel' ? (
            <>
              <img
                src={DEX_CONFIG.decibel.logo}
                alt="Decibel"
                style={{ height: 16, width: 'auto', objectFit: 'contain' }}
              />
              <span style={S.pacificaText}>Powered by</span>
              <span style={{ ...S.pacificaBrand, color: DEX_CONFIG.decibel.colorDark }}>
                Decibel
              </span>
            </>
          ) : dex === 'gmx' ? (
            <>
              <img
                src={DEX_CONFIG.gmx.logo}
                alt="GMX"
                style={{ height: 16, width: 'auto', objectFit: 'contain' }}
              />
              <span style={S.pacificaText}>Powered by</span>
              <span style={{ ...S.pacificaBrand, color: DEX_CONFIG.gmx.colorDark }}>
                GMX
              </span>
            </>
          ) : dex === 'monad' ? (
            <>
              <img
                src={DEX_CONFIG.monad.logo}
                alt="Perpl"
                style={{ height: 16, width: 'auto', objectFit: 'contain' }}
              />
              <span style={S.pacificaText}>Powered by</span>
              <span style={{ ...S.pacificaBrand, color: DEX_CONFIG.monad.colorDark }}>
                Perpl
              </span>
            </>
          ) : dex === 'phoenix' ? (
            <>
              <img
                src={DEX_CONFIG.phoenix.logo}
                alt="Phoenix"
                style={{ height: 16, width: 'auto', objectFit: 'contain' }}
              />
              <span style={S.pacificaText}>Powered by</span>
              <span style={{ ...S.pacificaBrand, color: DEX_CONFIG.phoenix.colorDark }}>
                Phoenix
              </span>
            </>
          ) : dex === 'hyperliquid' ? (
            <>
              <img
                src={DEX_CONFIG.hyperliquid.logo}
                alt="Hyperliquid"
                style={{ height: 16, width: 'auto', objectFit: 'contain' }}
              />
              <span style={S.pacificaText}>Powered by</span>
              <span style={{ ...S.pacificaBrand, color: DEX_CONFIG.hyperliquid.colorDark }}>
                Hyperliquid
              </span>
            </>
          ) : dex === 'risex' ? (
            <>
              <img
                src={DEX_CONFIG.risex.logo}
                alt="RISEx"
                style={{ height: 16, width: 'auto', objectFit: 'contain' }}
              />
              <span style={S.pacificaText}>Powered by</span>
              <span style={{ ...S.pacificaBrand, color: DEX_CONFIG.risex.colorDark }}>
                RISEx
              </span>
            </>
          ) : dex === 'nado' ? (
            <>
              <img
                src={DEX_CONFIG.nado.logo}
                alt="Nado"
                style={{ height: 16, width: 'auto', objectFit: 'contain' }}
              />
              <span style={S.pacificaText}>Powered by</span>
              <span style={{ ...S.pacificaBrand, color: DEX_CONFIG.nado.colorDark }}>
                Nado
              </span>
            </>
          ) : (
            <>
              <img src={pacificaLogo} alt="Pacifica" style={S.pacificaLogo} />
              <span style={S.pacificaText}>Powered by</span>
              <span style={S.pacificaBrand}>Pacifica</span>
            </>
          )}
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
            style={S.goldPopupPosition}
          />
        )}
      </div>
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
  infoCell: { display: 'flex', flexDirection: 'column', gap: 0, width: 90, flexShrink: 0 },
  infoCellLabel: { fontSize: 9, fontWeight: 700, color: '#a3906a', textTransform: 'uppercase', lineHeight: 1 },
  infoCellValue: { fontSize: 13, fontWeight: 900, color: '#5C3A21', fontFamily: 'monospace', whiteSpace: 'nowrap', lineHeight: 1.2 },
  fundingOverlay: {
    position: 'absolute', top: 5, right: 10, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 6,
    pointerEvents: 'none',
  },
  fundingOLabel: { fontSize: 10, fontWeight: 800, color: '#a3906a', letterSpacing: '0.04em' },
  fundingOValue: { fontSize: 11, fontWeight: 900, fontFamily: 'monospace' },
  // Common
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { color: '#5C3A21', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' },
  detail: { fontSize: 12, fontWeight: 700, color: '#77573d' },
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
  balBadge: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    padding: '3px 10px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
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
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300,
  },
  levModal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 320, background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 20,
    padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
    boxShadow: '0 15px 40px rgba(0,0,0,0.4)', zIndex: 301,
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
    border: '2px solid rgba(255,255,255,0.42)',
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
  goldPopupPosition: {
    position: 'absolute', bottom: 12, left: 12, right: 12,
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
