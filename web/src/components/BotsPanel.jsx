import { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useLayout } from '../hooks/useIsMobile';
import { cartoonBtn } from '../styles/theme';
import { colors, shared } from './basic/styles';
import { usePlayer } from '../hooks/useGodot';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { DEX_CONFIG, getAvailableDexConfigs } from '../contexts/DexContext';
import {
  authorizeGrvtBuilderForGame,
  probeExchangeBalance,
  saveGrvtOneTapSigner,
  saveKatanaOneTapSigner,
  saveKatanaBotCredentials,
  saveHotstuffAgent,
  saveAvantisDelegate,
  saveHibachiBotCredentials,
  saveRisexSessionSigner,
  saveNadoLinkedSigner,
  savePhoenixBotSigner,
  saveThenSyncGameAccount,
  scanGameCredentialStatuses,
  setupAndSyncGameAccount,
  reconnectGameAccountToPhantom,
  supportsGameWalletSync,
  syncGameAccountToPhantom,
} from '../lib/botGameCredentials';
import { botApiUrl, botAuthHeaders, botWsUrl, fetchBotApiJson, botApiPathCandidates } from '../lib/botApiClient';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import buttonBg from '../assets/resources/file_00000000a6f87246844c6271b76cd436.png';
import { keccak256 } from 'js-sha3';

function keccak256Array(key) {
  const hex = keccak256(key);
  const bytes = [];
  for (let i = 0; i < 32; i++) {
    bytes.push(parseInt(hex.substr(i * 2, 2), 16));
  }
  return bytes;
}

function encryptSecret(plain, key) {
  const keyBytes = keccak256Array(key);
  const enc = [];
  for (let i = 0; i < plain.length; i++) {
    const b = plain.charCodeAt(i);
    enc.push(b ^ keyBytes[i % 32]);
  }
  return 'encrypted:' + enc.map(x => x.toString(16).padStart(2, '0')).join('');
}


const BOT_TYPES = [
  {
    id: 'delta_neutral',
    name: 'Delta Neutral',
    code: 'delta_neutral',
    accent: '#1E88E5',
    accentDark: '#1565C0',
    tagline: 'Keeps market exposure close to zero.',
    description: 'Places offsetting long and short exposure so the bot focuses on spread capture instead of directional bets.',
    bestFor: 'Sideways markets, inventory control, lower directional risk.',
    cadence: 'Hedges every fill',
  },
  {
    id: 'symmetric_mm',
    name: 'Symmetric MM',
    code: 'symmetric_mm',
    accent: '#43A047',
    accentDark: '#2E7D32',
    tagline: 'Quotes both sides evenly around mid price.',
    description: 'Keeps balanced bid and ask orders with equal sizing. It is the classic market-maker shape for simple spread capture.',
    bestFor: 'Liquid pairs, stable spreads, balanced inventory.',
    cadence: 'Requotes on drift',
  },
  {
    id: 'ping_pong',
    name: 'Ping Pong',
    code: 'ping_pong',
    accent: '#E8B830',
    accentDark: '#B88712',
    tagline: 'Alternates buy and sell orders after fills.',
    description: 'Buys near the lower band, then waits to sell higher. After a sell, it looks for the next buy setup.',
    bestFor: 'Range-bound chop, small repeatable moves, simple execution.',
    cadence: 'One leg at a time',
  },
];

const LAUNCH_BOT_TYPES = ['symmetric_mm', 'delta_neutral']
  .map((id) => BOT_TYPES.find((bot) => bot.id === id))
  .filter(Boolean);

const PRESETS = {
  calm: {
    label: 'Calm',
    title: 'Calm preset',
    copy: 'Slower refresh, tighter inventory guardrails, fewer order changes.',
  },
  aggressive: {
    label: 'Aggressive',
    title: 'Aggressive preset',
    copy: 'Faster refresh, wider working range, more quote updates.',
  },
};

const DEFAULT_HISTORY = [
  { id: 'h-1', time: '12:00', bot: 'System', event: 'MM Bot controller initialized', value: 'Ready' },
];

const STEPS = ['exchange', 'strategy', 'settings', 'review'];
const STEP_LABELS = {
  exchange: 'Exchange',
  strategy: 'Strategy',
  settings: 'Settings',
  review: 'Review',
};

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function signedMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function getBotType(type) {
  return BOT_TYPES.find((bot) => bot.id === type)
    || BOT_TYPES.find((bot) => bot.id === 'symmetric_mm');
}

function formatApiError(error, fallback = 'unknown error') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message) return error.message;
  if (typeof error.code === 'string' && error.code) return error.code;
  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
}

/** Strip `{tenant}:` prefix — ids are `{wallet}:symmetric_mm:hyperliquid:BTC-USD`. */
function stripTenantPrefix(id) {
  const kinds = ['symmetric_mm', 'delta_neutral', 'ping_pong'];
  for (const kind of kinds) {
    const idx = id.indexOf(`${kind}:`);
    if (idx >= 0) return id.slice(idx);
  }
  return id;
}

function parseStrategyInstanceId(id) {
  const bare = stripTenantPrefix(id);
  if (bare.startsWith('delta_neutral:')) {
    const rest = bare.slice('delta_neutral:'.length);
    const colon = rest.lastIndexOf(':');
    if (colon < 0) return { kind: 'delta_neutral', exchanges: [], symbols: [] };
    const pair = rest.slice(0, colon);
    const symbol = rest.slice(colon + 1);
    const [longEx, shortEx] = pair.split('<->');
    return {
      kind: 'delta_neutral',
      exchanges: [longEx, shortEx].filter(Boolean),
      symbols: symbol ? [symbol] : [],
    };
  }
  const match = bare.match(/^(symmetric_mm|ping_pong):([^:]+):(.+)$/);
  if (match) {
    return {
      kind: match[1],
      exchanges: [match[2]],
      symbols: match[3].split(',').filter(Boolean),
    };
  }
  return { kind: '', exchanges: [], symbols: [] };
}

function parseDecimalField(value) {
  if (value == null || value === '') return null;
  const n = Number(typeof value === 'string' ? value : value);
  return Number.isFinite(n) ? n : null;
}

const BALANCE_CLIENT_CACHE_MS = 45_000;
const balanceClientCache = { map: {}, ts: {} };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClientCachedBalance(ex) {
  const ts = balanceClientCache.ts[ex];
  if (ts && Date.now() - ts < BALANCE_CLIENT_CACHE_MS) {
    return balanceClientCache.map[ex];
  }
  return null;
}

function setClientCachedBalance(ex, bal) {
  if (!bal) return;
  const hasFunds = (bal.available ?? 0) > 0 || (bal.equity ?? 0) > 0;
  if (!hasFunds && !bal.error && !bal.staleWarning) return;
  balanceClientCache.map[ex] = bal;
  balanceClientCache.ts[ex] = Date.now();
}

function getUsableClientCachedBalance(ex) {
  const cached = getClientCachedBalance(ex);
  if (!cached) return null;
  const hasFunds = (cached.available ?? 0) > 0 || (cached.equity ?? 0) > 0;
  if (hasFunds || cached.error || cached.staleWarning) return cached;
  return null;
}

function normalizeBalanceError(msg) {
  const t = String(msg || '').trim();
  if (!t) return { error: null, staleWarning: null };
  if (t.startsWith('cached (rate limited)')) {
    return { error: null, staleWarning: t };
  }
  return { error: t, staleWarning: null };
}

function mergeExchangeBalance(prev, incoming) {
  if (!incoming) return prev;
  if (!prev) return incoming;
  const prevHasFunds = (prev.available ?? 0) > 0 || (prev.equity ?? 0) > 0;
  const incomingHasFunds = (incoming.available ?? 0) > 0 || (incoming.equity ?? 0) > 0;
  if (prevHasFunds && !incomingHasFunds && incoming.error) {
    return {
      ...prev,
      error: incoming.error,
      staleWarning: incoming.staleWarning ?? prev.staleWarning ?? null,
    };
  }
  if (!incomingHasFunds && prevHasFunds && !incoming.error) {
    return prev;
  }
  return incoming;
}

function getExchangeKey(id) {
  const parsed = parseStrategyInstanceId(id);
  return String(parsed.exchanges[0] || '').toLowerCase();
}

function shortenError(msg, max = 80) {
  const t = String(msg || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'unknown error';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function formatExchangeBalance(bal) {
  if (!bal) return { label: 'not synced', tone: 'muted', detail: null };
  const avail = bal.available;
  const equity = bal.equity;
  const hasAmount = avail != null || equity != null;
  if (bal.error && !hasAmount) {
    return { label: 'API error', tone: 'error', detail: shortenError(bal.error) };
  }
  if (avail == null && equity == null) return { label: '—', tone: 'muted', detail: null };
  const a = avail ?? 0;
  const e = equity ?? a;
  const staleNote = bal.staleWarning || (bal.error?.startsWith?.('cached (rate limited)') ? bal.error : null);
  if (a === 0 && e === 0 && bal.error && !staleNote) {
    return { label: 'API error', tone: 'error', detail: shortenError(bal.error) };
  }
  if (a === 0 && e === 0 && !bal.error && !staleNote) {
    return {
      label: '$0.00',
      tone: 'warn',
      detail: 'zero balance — deposit margin or reconnect this exchange when launching a bot',
    };
  }
  let detail = staleNote ? shortenError(staleNote) : null;
  if (e !== a) detail = detail ? `${detail} · equity $${e.toFixed(2)}` : `equity $${e.toFixed(2)}`;
  if (bal.unrealized != null && bal.unrealized !== 0) {
    const unr = `uPnL ${bal.unrealized >= 0 ? '+' : ''}$${bal.unrealized.toFixed(2)}`;
    detail = detail ? `${detail} · ${unr}` : unr;
  }
  const tone = staleNote ? 'warn' : 'ok';
  return { label: `$${a.toFixed(2)}`, tone, detail };
}

function countFillsForExchange(orderHistory, exchangeDisplay) {
  const ex = String(exchangeDisplay).toUpperCase();
  return orderHistory.filter((row) => {
    const bot = String(row.bot || '').toUpperCase();
    const val = String(row.value || '').toLowerCase();
    return bot === ex && val.includes('filled');
  }).length;
}

function formatInventory(rt) {
  const inv = rt?.inventory;
  if (!inv || typeof inv !== 'object') return null;
  const entries = Object.entries(inv);
  if (entries.length === 0) return '0';
  if (entries.length === 1) return String(entries[0][1]);
  return entries.map(([sym, qty]) => `${sym}: ${qty}`).join(', ');
}

function accountActiveForExchange(accounts, exchange) {
  const needle = String(exchange).toLowerCase();
  return accounts.some(
    (acc) => acc.exchange?.toLowerCase() === needle && acc.status === 'active',
  );
}

const getBotConfigDetails = (id) => {
  const key = String(id || '');
  if (key.includes('grvt') && key.includes('ping_pong')) return { tradeSize: 10, maxPosition: 100, preset: 'calm' };
  if (key.includes('grvt')) return { tradeSize: 10, maxPosition: 100, preset: 'calm' };
  if (key.includes('hyperliquid') && key.includes('symmetric_mm')) return { tradeSize: 10, maxPosition: 50, preset: 'aggressive' };
  if (key.includes('pacifica')) return { tradeSize: 50, maxPosition: 50, preset: 'calm' };
  if (key.includes('avantis')) return { tradeSize: 2000, maxPosition: 20000, preset: 'calm' };
  if (key.includes('avantis')) return { tradeSize: 1500, maxPosition: 15000, preset: 'calm' };
  if (key.includes('mock')) return { tradeSize: 50, maxPosition: 500, preset: 'calm' };
  return { tradeSize: 200, maxPosition: 2000, preset: 'calm' };
};

const matchPositionToBot = (botId, posExchange, posSymbol) => {
  const parsed = parseStrategyInstanceId(botId);
  const ex = String(posExchange).toLowerCase();
  const sym = String(posSymbol).toLowerCase();
  return parsed.exchanges.some((e) => e.toLowerCase() === ex)
    || parsed.symbols.some((s) => s.toLowerCase() === sym);
};

const getExchangeName = (id) => {
  if (!id) return '';
  const parsed = parseStrategyInstanceId(id);
  if (parsed.kind === 'delta_neutral' && parsed.exchanges.length === 2) {
    return `${parsed.exchanges[0].toUpperCase()} / ${parsed.exchanges[1].toUpperCase()}`;
  }
  if (parsed.exchanges[0]) return parsed.exchanges[0].toUpperCase();
  return 'Unknown';
};

const mapHandleToBot = (
  handle,
  runningList,
  runtime = {},
  activeOrdersGlobal = 0,
  overrides = {},
  exchangeBalances = {},
  orderHistory = [],
) => {
  const details = getBotConfigDetails(handle.id);
  const ov = overrides[handle.id] || {};
  const tradeSize = ov.order_size_usd != null && ov.order_size_usd !== ''
    ? Number(ov.order_size_usd)
    : details.tradeSize;
  const maxPosition = ov.max_inventory_usd != null && ov.max_inventory_usd !== ''
    ? Number(ov.max_inventory_usd)
    : details.maxPosition;
  const spreadBps = ov.spread_bps != null ? Number(ov.spread_bps) : null;
  const preset = spreadBps != null
    ? (spreadBps <= 5 ? 'aggressive' : 'calm')
    : details.preset;
  const spread = spreadBps != null
    ? `${(spreadBps / 100).toFixed(2)}%`
    : (handle.kind === 'ping_pong' ? '0.22%' : '0.14%');
  const isRunning = runningList.some((r) => r.id === handle.id);
  const rt = runtime[handle.id] || {};
  const cycles = Number(rt.cycles) || 0;
  const openQuotes = Number(rt.open_quotes) || 0;
  const backoffSymbols = Array.isArray(rt.backoff_symbols) ? rt.backoff_symbols : [];
  const inBackoff = rt.in_backoff === true || backoffSymbols.length > 0;
  const market = (Array.isArray(handle.symbols) ? handle.symbols : [])
    .map((s) => String(s).toUpperCase())
    .join(', ');
  const exchange = getExchangeName(handle.id);
  const exchangeKey = getExchangeKey(handle.id);
  const bal = exchangeBalances[exchangeKey];
  const balFmt = formatExchangeBalance(bal);
  const fills = countFillsForExchange(orderHistory, exchange);
  const inventory = formatInventory(rt);
  const unrealizedPnl = bal?.unrealized != null ? bal.unrealized : null;

  const hasSavedConfig = Object.prototype.hasOwnProperty.call(overrides, handle.id);
  let status = isRunning ? 'Running' : (hasSavedConfig ? 'Stopped' : 'Template');
  if (isRunning && inBackoff) status = 'Paused';

  let lastAction;
  if (!isRunning && hasSavedConfig) {
    lastAction = 'Ready to start with your saved settings';
  } else if (!isRunning) {
    lastAction = 'Connect an active exchange account before starting';
  } else if (inBackoff) {
    const parts = backoffSymbols.map(
      (s) => `${s.symbol} (~${s.pause_secs_remaining ?? '?'}s)`,
    );
    lastAction = `Circuit breaker active${parts.length ? `: ${parts.join(', ')}` : ''}. `
      + 'Fix API keys / margin, then wait for cooldown.';
  } else if (bal?.error && (bal.available ?? 0) <= 0 && (bal.equity ?? 0) <= 0) {
    lastAction = `Exchange balance error: ${shortenError(bal.error)}`;
  } else if (openQuotes > 0) {
    lastAction = `${openQuotes} quote(s) on exchange · cycle ${cycles}`;
  } else if (cycles > 0) {
    if (String(exchange).toUpperCase().includes('GRVT') && handle.kind === 'ping_pong') {
      lastAction = 'Ping Pong active — after fill bot drains position; low margin until close is normal';
    } else if (String(exchange).toUpperCase().includes('GRVT')) {
      lastAction = 'Bot runs but GRVT has 0 quotes — min ~$130/order; need margin + builder auth';
    } else if (exchangeKey === 'katana') {
      lastAction = 'Katana: 0 quotes — reconnect API key/secret + one-tap signer from Launch New Bot';
    } else if (balFmt.tone === 'warn') {
      lastAction = 'Bot runs but account balance is $0 — deposit margin before quoting';
    } else {
      lastAction = `Bot runs but ${exchange} has 0 quotes — check margin, min notional, leverage`;
    }
  } else {
    lastAction = 'Worker spawned, waiting for first cycle';
  }

  return {
    id: handle.id,
    type: handle.kind,
    market: market,
    exchange: exchange,
    exchangeKey,
    status,
    tradeSize: Number.isFinite(tradeSize) ? tradeSize : details.tradeSize,
    maxPosition: Number.isFinite(maxPosition) ? maxPosition : details.maxPosition,
    preset,
    spreadBps,
    pnl: unrealizedPnl,
    pnlLabel: unrealizedPnl != null ? 'uPnL' : 'uPnL',
    balanceLabel: balFmt.label,
    balanceDetail: balFmt.detail,
    balanceTone: balFmt.tone,
    inventory: inventory ?? '—',
    spread,
    fills,
    cycles,
    openQuotes,
    inBackoff,
    backoffSymbols,
    uptime: isRunning
      ? (inBackoff
        ? `Paused · ${cycles} cycles`
        : (cycles > 0 ? `${cycles} cycles` : 'Starting…'))
      : (hasSavedConfig ? 'Stopped' : 'Not started'),
    lastAction,
    isTemplate: !isRunning && !hasSavedConfig,
    activeOrdersGlobal,
  };
};

function RobotGlyph({ size = 28, color = '#5C3A21' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3v4" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="3.5" r="2" fill="#E8B830" stroke={color} strokeWidth="1.6" />
      <rect x="6" y="8" width="20" height="17" rx="5" fill="#FDF8E7" stroke={color} strokeWidth="2.4" />
      <path d="M8 14h16" stroke="#D4C8B0" strokeWidth="2" />
      <circle cx="12" cy="16" r="2.2" fill="#1E88E5" />
      <circle cx="20" cy="16" r="2.2" fill="#43A047" />
      <path d="M12 22h8" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M3.5 15.5v4M28.5 15.5v4" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function RobotButtonMark({ size = 48 }) {
  return (
    <div style={{ ...S.buttonMark, width: size, height: size }}>
      <div style={{ ...S.buttonMarkBg, backgroundImage: `url(${buttonBg})` }} />
      <div style={S.buttonMarkIcon}>
        <RobotGlyph size={Math.round(size * 0.56)} color="#fff" />
      </div>
    </div>
  );
}

function StepDots({ activeStep }) {
  const index = Math.max(0, STEPS.indexOf(activeStep));
  return (
    <ol style={S.stepTrack} aria-label="Bot launch progress">
      {STEPS.map((step, i) => (
        <li
          key={step}
          style={{ ...S.stepTrackItem, ...(i <= index ? S.stepTrackItemActive : {}) }}
          aria-current={i === index ? 'step' : undefined}
        >
          <span style={{ ...S.stepNumber, ...(i <= index ? S.stepNumberActive : {}) }}>
            {i < index ? '✓' : i + 1}
          </span>
          <span style={S.stepLabel}>{STEP_LABELS[step]}</span>
        </li>
      ))}
    </ol>
  );
}

function ExchangeDropdown({ options, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listboxRef = useRef(null);
  const selected = options.find((option) => option.dex.id === value) || null;

  const findNextReady = useCallback((start, direction) => {
    if (options.length === 0) return -1;
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (start + direction * offset + options.length) % options.length;
      if (options[index]?.strategyAvailable) return index;
    }
    return -1;
  }, [options]);

  const openListbox = useCallback(() => {
    if (disabled) return;
    const selectedIndex = options.findIndex((option) => option.dex.id === value && option.strategyAvailable);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : findNextReady(0, 1));
    setOpen(true);
  }, [disabled, findNextReady, options, value]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    const frame = requestAnimationFrame(() => listboxRef.current?.focus());
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      cancelAnimationFrame(frame);
    };
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(`bot-exchange-option-${options[activeIndex]?.dex.id}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, options]);

  const handleListKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => rootRef.current?.querySelector('button')?.focus());
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => findNextReady(current + direction, direction));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(findNextReady(event.key === 'Home' ? 0 : options.length - 1, event.key === 'Home' ? 1 : -1));
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && options[activeIndex]?.strategyAvailable) {
      event.preventDefault();
      onChange(options[activeIndex].dex.id);
      setOpen(false);
      requestAnimationFrame(() => rootRef.current?.querySelector('button')?.focus());
    }
  };

  return (
    <div ref={rootRef} style={S.exchangeDropdownRoot}>
      <button
        type="button"
        className="bots-focusable"
        style={S.exchangeDropdownTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="bot-exchange-listbox"
        aria-describedby="bot-exchange-status"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openListbox())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            openListbox();
          }
        }}
      >
        {selected ? <img src={selected.dex.logo} alt="" style={S.exchangeTriggerLogo} /> : <RobotGlyph size={24} />}
        <span style={S.exchangeTriggerText}>
          <strong>{selected?.dex.label || 'Select an exchange'}</strong>
          <small>{selected ? `${selected.dex.chain} · ${selected.status}` : 'Configured venues and connections'}</small>
        </span>
        <span style={{ ...S.exchangeChevron, transform: open ? 'rotate(180deg)' : 'none' }} aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          id="bot-exchange-listbox"
          ref={listboxRef}
          role="listbox"
          tabIndex={0}
          className="bots-focusable"
          style={S.exchangeListbox}
          aria-label="Exchange"
          aria-activedescendant={activeIndex >= 0 ? `bot-exchange-option-${options[activeIndex].dex.id}` : undefined}
          onKeyDown={handleListKeyDown}
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
          }}
        >
          {options.map((option, index) => (
            <div
              id={`bot-exchange-option-${option.dex.id}`}
              key={option.dex.id}
              role="option"
              aria-selected={value === option.dex.id}
              aria-disabled={!option.strategyAvailable}
              style={{
                ...S.exchangeOption,
                ...(index === activeIndex ? S.exchangeOptionActive : {}),
                ...(!option.strategyAvailable ? S.exchangeOptionDisabled : {}),
              }}
              onMouseEnter={() => option.strategyAvailable && setActiveIndex(index)}
              onClick={() => {
                if (!option.strategyAvailable) return;
                onChange(option.dex.id);
                setOpen(false);
              }}
            >
              <img src={option.dex.logo} alt="" style={S.exchangeOptionLogo} />
              <span style={S.exchangeOptionText}>
                <strong>{option.dex.label}</strong>
                <small>{option.dex.chain} · {option.dex.description}</small>
              </span>
              <span style={{ ...S.exchangeOptionStatus, ...(option.readyForLaunch ? S.exchangeOptionStatusReady : {}) }}>
                {option.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Bounded slider card matching premium styling
function SliderField({ label, value, min, max, step, onChange, defaultValue }) {
  return (
    <div style={S.sliderCard}>
      <div style={S.sliderTop}>
        <span style={S.label}>{label}</span>
        <strong style={S.sliderValue}>{money(value)}</strong>
      </div>
      <input
        className="bots-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
      <div style={S.sliderLabels}>
        <span>{money(min)}</span>
        <span>Default {money(defaultValue)}</span>
        <span>{money(max)}</span>
      </div>
    </div>
  );
}

function BotCard({ bot, expanded, onToggle, onStart, onStop }) {
  const type = getBotType(bot.type);
  const pnlKnown = bot.pnl != null && Number.isFinite(Number(bot.pnl));
  const pnlPositive = !pnlKnown || Number(bot.pnl) >= 0;
  const isRunning = bot.status === 'Running' || bot.status === 'Paused';
  const statusStyle = bot.status === 'Running'
    ? S.statusRunning
    : bot.status === 'Paused'
      ? S.statusPaused
      : bot.status === 'Stopped'
        ? S.statusStopped
      : bot.status === 'Template'
        ? S.statusTemplate
        : S.statusPaused;
  return (
    <div style={{ ...S.botCard, ...(expanded ? S.botCardExpanded : {}) }}>
      <button type="button" style={S.cardMainButton} onClick={() => onToggle(bot.id)} aria-expanded={expanded}>
        <div style={S.cardTop}>
          <div style={{ ...S.botAvatar, background: `linear-gradient(180deg, ${type.accent} 0%, ${type.accentDark} 100%)` }}>
            <RobotGlyph size={26} color="#fff" />
          </div>
          <div style={S.cardTitleBlock}>
            <div style={S.cardTitleRow}>
              <strong style={S.cardTitle}>{type.name}</strong>
              <span style={{ ...S.statusPill, ...statusStyle }}>
                {bot.status}
              </span>
            </div>
            <span style={S.cardSub}>{bot.market} on <strong>{bot.exchange}</strong> / {type.code}</span>
          </div>
          <span style={S.expandIcon}>{expanded ? '−' : '+'}</span>
        </div>
        <div style={S.metricGrid}>
          <div style={S.metric}>
            <span style={S.metricLabel}>{bot.pnlLabel || 'uPnL'}</span>
            <strong style={{
              ...S.metricValue,
              color: pnlKnown ? (pnlPositive ? colors.long : colors.short) : '#78909C',
            }}>
              {pnlKnown ? signedMoney(bot.pnl) : '—'}
            </strong>
          </div>
          <div style={S.metric}>
            <span style={S.metricLabel}>Margin</span>
            <strong style={{
              ...S.metricValue,
              color: bot.balanceTone === 'error' ? colors.short
                : bot.balanceTone === 'warn' ? '#E65100' : undefined,
            }}>
              {bot.balanceLabel || '—'}
            </strong>
          </div>
          <div style={S.metric}>
            <span style={S.metricLabel}>Trade Size</span>
            <strong style={S.metricValue}>{money(bot.tradeSize)}</strong>
          </div>
        </div>
        {!expanded && isRunning && (
          <div style={S.collapsedRuntime}>
            Cycles <strong>{bot.cycles ?? 0}</strong>
            {' · '}
            Open quotes <strong>{bot.openQuotes ?? 0}</strong>
            {bot.inBackoff ? (
              <> · <strong style={{ color: '#E65100' }}>backoff</strong></>
            ) : null}
          </div>
        )}
      </button>
      {!expanded && (
        <div style={S.collapsedActions}>
          {isRunning ? (
            <button
              type="button"
              style={{ ...cartoonBtn('#E53935', '#C62828'), padding: '6px 14px', fontSize: 12, borderRadius: 8 }}
              onClick={(e) => { e.stopPropagation(); onStop(bot.id); }}
            >
              Stop Bot
            </button>
          ) : (
            <button
              type="button"
              style={{ ...cartoonBtn('#43A047', '#2E7D32'), padding: '6px 14px', fontSize: 12, borderRadius: 8 }}
              onClick={(e) => { e.stopPropagation(); onStart(bot.id); }}
            >
              ▶ Start Bot
            </button>
          )}
        </div>
      )}
      {expanded && (
        <div className="bots-expand-panel" style={S.expandPanel}>
          <div style={S.detailGrid}>
            <div style={S.detailCard}>
              <span style={S.metricLabel}>Strategy intent</span>
              <strong style={S.detailTitle}>{type.tagline}</strong>
              <p style={S.detailCopy}>{type.description}</p>
            </div>
            <div style={S.detailCard}>
              <span style={S.metricLabel}>Account</span>
              <div style={S.detailRows}>
                <span>Margin <strong>{bot.balanceLabel || '—'}</strong></span>
                {bot.balanceDetail ? (
                  <span style={{ fontSize: 11, color: '#6b5340' }}>{bot.balanceDetail}</span>
                ) : null}
                <span>Max position <strong>{money(bot.maxPosition)}</strong></span>
              </div>
            </div>
            <div style={S.detailCard}>
              <span style={S.metricLabel}>Runtime</span>
              <div style={S.detailRows}>
                <span>Cycles <strong>{bot.cycles ?? 0}</strong></span>
                <span>Open quotes <strong>{bot.openQuotes ?? 0}</strong></span>
                <span>Fills <strong>{bot.fills}</strong></span>
                <span>Inventory <strong>{bot.inventory}</strong></span>
              </div>
            </div>
            <div style={S.detailCard}>
              <span style={S.metricLabel}>Preset</span>
              <strong style={S.detailTitle}>{PRESETS[bot.preset]?.label || 'Calm'}</strong>
              <p style={S.detailCopy}>{PRESETS[bot.preset]?.copy || PRESETS.calm.copy}</p>
            </div>
          </div>
          <div style={S.lastAction}>
            <span>Last bot action</span>
            <strong>{bot.lastAction}</strong>
          </div>
          <div style={S.actionsRow}>
            {isRunning ? (
              <button
                type="button"
                style={{ ...cartoonBtn('#E53935', '#C62828'), padding: '8px 16px', fontSize: 13, borderRadius: 10 }}
                onClick={(e) => { e.stopPropagation(); onStop(bot.id); }}
              >
                Stop Bot
              </button>
            ) : (
              <button
                type="button"
                style={{ ...cartoonBtn('#43A047', '#2E7D32'), padding: '8px 16px', fontSize: 13, borderRadius: 10 }}
                onClick={(e) => { e.stopPropagation(); onStart(bot.id); }}
              >
                Start Bot
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BotsPanel({ onClose }) {
  const { isMobile } = useLayout();
  const player = usePlayer();
  const token = player?.token || null;
  const evmWallet = useEvmWallet();
  const solWallet = useWallet();
  const solanaSignMessage = solWallet?.signMessage || null;
  const solanaWalletAddress = solWallet?.publicKey?.toBase58?.() || null;

  const gameSyncWalletCtx = useMemo(() => ({
    evmProvider: evmWallet?.provider,
    evmWalletAddress: evmWallet?.address?.toLowerCase?.() || evmWallet?.address || null,
    walletAddress: evmWallet?.address?.toLowerCase?.() || evmWallet?.address || null,
    walletClient: evmWallet?.walletClient || null,
    publicClient: evmWallet?.publicClient || null,
    ensureChain: evmWallet?.ensureChain || null,
    solanaSignMessage,
    solanaWalletAddress,
  }), [
    evmWallet?.provider,
    evmWallet?.address,
    evmWallet?.walletClient,
    evmWallet?.publicClient,
    evmWallet?.ensureChain,
    solanaSignMessage,
    solanaWalletAddress,
  ]);

  const gameSetupSyncOpts = useMemo(() => ({
    evmProvider: evmWallet?.provider,
    walletAddress: evmWallet?.address,
    walletClient: evmWallet?.walletClient,
    publicClient: evmWallet?.publicClient,
    getWalletClient: evmWallet?.getWalletClient,
    getPublicClient: evmWallet?.getPublicClient,
    ensureChain: evmWallet?.ensureChain,
    solanaSignMessage,
    solanaWalletAddress,
    solWallet,
  }), [
    evmWallet?.provider,
    evmWallet?.address,
    evmWallet?.walletClient,
    evmWallet?.publicClient,
    evmWallet?.getWalletClient,
    evmWallet?.getPublicClient,
    evmWallet?.ensureChain,
    solanaSignMessage,
    solanaWalletAddress,
    solWallet,
  ]);

  const [view, setView] = useState('dashboard');
  const [step, setStep] = useState('exchange');
  const [history, setHistory] = useState(DEFAULT_HISTORY);
  const [orderHistory, setOrderHistory] = useState([]);
  const [expandedBotId, setExpandedBotId] = useState(null);
  const userCollapsedRef = useRef(false);
  const portfolioFetchInFlight = useRef(false);
  const balanceFallbackAt = useRef(0);
  const [selectedType, setSelectedType] = useState('symmetric_mm');
  const [tradeSize, setTradeSize] = useState(20);
  const [maxPosition, setMaxPosition] = useState(200);
  const [preset, setPreset] = useState('calm');
  const [notice, setNotice] = useState('');
  const [totalPnl, setTotalPnl] = useState(0);
  const [fillsCount, setFillsCount] = useState(0);

  const [configuredInstances, setConfiguredInstances] = useState([]);
  const [runningInstances, setRunningInstances] = useState([]);
  const [runtimeById, setRuntimeById] = useState({});
  const [globalActiveOrders, setGlobalActiveOrders] = useState(0);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [selectedExchangeId, setSelectedExchangeId] = useState('');
  const [instancesLoading, setInstancesLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const stepHeadingRef = useRef(null);

  const [syncedAccounts, setSyncedAccounts] = useState([]);
  const [newAccExchange, setNewAccExchange] = useState('hyperliquid');
  const [newAccLabel, setNewAccLabel] = useState('My Live Account');
  const [newAccSubId, setNewAccSubId] = useState('0');
  const [newAccPrivateKey, setNewAccPrivateKey] = useState('');
  const [keyTransMethod, setKeyTransMethod] = useState('encrypt');
  const [hlBalanceUsd, setHlBalanceUsd] = useState(null);
  const [grvtBalanceUsd, setGrvtBalanceUsd] = useState(null);
  /** Per-exchange balance from GET /api/v1/portfolio/summary */
  const [exchangeBalances, setExchangeBalances] = useState({});
  const [portfolioPnl, setPortfolioPnl] = useState(null);
  const [portfolioTotals, setPortfolioTotals] = useState(null);
  const [overridesById, setOverridesById] = useState({});
  const [gameAuthRows, setGameAuthRows] = useState([]);
  const [gameAuthScanning, setGameAuthScanning] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const gameAuthScanIdRef = useRef(0);
  const [grvtOneTapInput, setGrvtOneTapInput] = useState('');
  const [katanaOneTapInput, setKatanaOneTapInput] = useState('');
  const [katanaApiKeyInput, setKatanaApiKeyInput] = useState('');
  const [katanaApiSecretInput, setKatanaApiSecretInput] = useState('');
  const [katanaWalletInput, setKatanaWalletInput] = useState('');
  const [hotstuffAgentInput, setHotstuffAgentInput] = useState('');
  const [avantisDelegateInput, setAvantisDelegateInput] = useState('');
  const [hibachiApiKeyInput, setHibachiApiKeyInput] = useState('');
  const [hibachiAccountIdInput, setHibachiAccountIdInput] = useState('');
  const [hibachiPrivateKeyInput, setHibachiPrivateKeyInput] = useState('');
  const [risexSessionInput, setRisexSessionInput] = useState('');
  const [nadoLinkedInput, setNadoLinkedInput] = useState('');
  const [phoenixSecretInput, setPhoenixSecretInput] = useState('');
  const [gameAuthBusy, setGameAuthBusy] = useState(false);
  const [gameAuthProbing, setGameAuthProbing] = useState(null);
  const [playerDexAccounts, setPlayerDexAccounts] = useState([]);

  const playerForBots = useMemo(() => {
    if (!player) return player;
    const dexAccounts = Array.isArray(playerDexAccounts) && playerDexAccounts.length > 0
      ? playerDexAccounts
      : player.dex_accounts;
    if (dexAccounts === player.dex_accounts) return player;
    return { ...player, dex_accounts: dexAccounts };
  }, [player, playerDexAccounts]);

  const exchangeOptions = useMemo(() => getAvailableDexConfigs().map((dex) => {
    const instances = configuredInstances.filter((inst) => {
      if (inst.kind !== 'symmetric_mm') return false;
      return parseStrategyInstanceId(inst.id).exchanges.some(
        (exchange) => exchange.toLowerCase() === dex.id.toLowerCase(),
      );
    });
    const accountActive = accountActiveForExchange(syncedAccounts, dex.id);
    const setupSupported = supportsGameWalletSync(dex.id);
    return {
      dex,
      instances,
      strategyAvailable: instances.length > 0 && (setupSupported || accountActive),
      readyForLaunch: instances.length > 0 && accountActive,
      setupSupported,
      status: instances.length === 0 || (!setupSupported && !accountActive) ? 'UNAVAILABLE' : accountActive ? 'READY' : 'NOT CONNECTED',
    };
  }), [configuredInstances, syncedAccounts]);

  const selectedExchangeOption = useMemo(
    () => exchangeOptions.find((option) => option.dex.id === selectedExchangeId) || null,
    [exchangeOptions, selectedExchangeId],
  );

  const selectedExchangeInstances = selectedExchangeOption?.instances || [];
  const selectedSyncedAccount = syncedAccounts.find(
    (account) => account.exchange?.toLowerCase() === selectedExchangeId,
  ) || null;
  const selectedGameAuthRow = useMemo(() => (
    gameAuthRows.find((row) => row.exchange === selectedExchangeId)
      || (selectedSyncedAccount ? {
        exchange: selectedExchangeId,
        label: DEX_CONFIG[selectedExchangeId]?.label || selectedExchangeId.toUpperCase(),
        synced: true,
        ready: false,
        partial: false,
      } : null)
  ), [gameAuthRows, selectedExchangeId, selectedSyncedAccount]);

  const selectedConnectionState = useMemo(() => {
    if (gameAuthScanning || !scanCompleted) {
      return { id: 'checking', label: 'CHECKING', hint: 'Checking browser credentials and synced account…', style: S.connectionChecking };
    }
    if (selectedExchangeOption?.readyForLaunch || selectedSyncedAccount?.status === 'active') {
      return { id: 'active', label: 'ACTIVE', hint: 'Account is active. Continue when you are ready.', style: S.connectionActive };
    }
    if (selectedSyncedAccount) {
      return { id: 'inactive', label: 'INACTIVE', hint: 'This synced account is disabled. Enable it to continue.', style: S.connectionInactive };
    }
    if (selectedGameAuthRow?.ready) {
      return { id: 'ready', label: 'READY TO SYNC', hint: selectedGameAuthRow.hint || 'Credentials found. Connect the bot to sync them.', style: S.connectionReady };
    }
    if (selectedGameAuthRow?.partial) {
      return { id: 'partial', label: 'PARTIAL', hint: selectedGameAuthRow.error || 'Complete the missing credential below.', style: S.connectionPartial };
    }
    return { id: 'missing', label: 'MISSING', hint: selectedGameAuthRow?.error || 'No credentials found. Complete setup below.', style: S.connectionMissing };
  }, [gameAuthScanning, scanCompleted, selectedExchangeOption, selectedSyncedAccount, selectedGameAuthRow]);

  const handleExchangeSelect = useCallback((exchangeId) => {
    const option = exchangeOptions.find((candidate) => candidate.dex.id === exchangeId);
    if (!option?.strategyAvailable) return;
    setScanCompleted(false);
    setSelectedExchangeId(exchangeId);
    setNewAccExchange(exchangeId);
    setSelectedInstanceId(option.instances.length === 1 ? option.instances[0].id : '');
  }, [exchangeOptions]);

  useEffect(() => {
    if (view !== 'launch') return undefined;
    const frame = requestAnimationFrame(() => stepHeadingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [step, view]);

  useEffect(() => {
    setConfiguredInstances([]);
    setRunningInstances([]);
    setRuntimeById({});
    setOverridesById({});
    setGlobalActiveOrders(0);
    setExpandedBotId(null);
    setInstancesLoading(Boolean(token));
  }, [token]);

  const selectedBot = useMemo(() => getBotType(selectedType), [selectedType]);

  const bots = useMemo(() => {
    const allHandles = [...configuredInstances];
    runningInstances.forEach((r) => {
      if (!allHandles.some((h) => h.id === r.id)) {
        allHandles.push(r);
      }
    });
    Object.keys(overridesById).forEach((id) => {
      if (allHandles.some((handle) => handle.id === id)) return;
      const parsed = parseStrategyInstanceId(id);
      allHandles.push({ id, kind: parsed.kind, symbols: parsed.symbols });
    });
    const userBotIds = new Set([
      ...runningInstances.map((instance) => instance.id),
      ...Object.keys(overridesById),
    ]);
    return allHandles.filter((handle) => userBotIds.has(handle.id)).map((h) => mapHandleToBot(
      h,
      runningInstances,
      runtimeById,
      globalActiveOrders,
      overridesById,
      exchangeBalances,
      orderHistory,
    ));
  }, [
    configuredInstances,
    runningInstances,
    runtimeById,
    globalActiveOrders,
    overridesById,
    exchangeBalances,
    orderHistory,
  ]);

  const activeCount = bots.filter((bot) => bot.status === 'Running' || bot.status === 'Paused').length;
  const mockPnl = portfolioPnl != null ? portfolioPnl : totalPnl;
  const resetLaunch = useCallback(() => {
    setStep('exchange');
    setSelectedType('symmetric_mm');
    setTradeSize(20);
    setMaxPosition(200);
    setPreset('calm');
    setSelectedInstanceId('');
    setSelectedExchangeId('');
  }, []);

  const openLaunch = useCallback(() => {
    setNotice('');
    resetLaunch();
    setView('launch');
  }, [resetLaunch]);

  const applyPortfolioPayload = useCallback((data) => {
    if (!data) return;
    setExchangeBalances((prev) => {
      const map = { ...prev };
      for (const row of data.exchanges || []) {
        const ex = String(row.exchange || '').toLowerCase();
        if (!ex) continue;
        const { error, staleWarning } = normalizeBalanceError(row.balance_error);
        const incoming = {
          available: parseDecimalField(
            row.balance?.available_margin_usd ?? row.balance?.equity_usd,
          ),
          equity: parseDecimalField(row.balance?.equity_usd),
          error,
          staleWarning,
          unrealized: parseDecimalField(row.unrealized_pnl_usd),
        };
        map[ex] = mergeExchangeBalance(prev[ex], incoming);
        if (incoming.available != null || incoming.equity != null) {
          setClientCachedBalance(ex, map[ex]);
        }
      }
      return map;
    });
    setHlBalanceUsd((prev) => {
      const row = (data.exchanges || []).find((r) => String(r.exchange).toLowerCase() === 'hyperliquid');
      const v = parseDecimalField(row?.balance?.available_margin_usd ?? row?.balance?.equity_usd);
      return v != null ? v : prev;
    });
    setGrvtBalanceUsd((prev) => {
      const row = (data.exchanges || []).find((r) => String(r.exchange).toLowerCase() === 'grvt');
      const v = parseDecimalField(row?.balance?.available_margin_usd ?? row?.balance?.equity_usd);
      return v != null ? v : prev;
    });
    const sumAvailable = (data.exchanges || []).reduce((acc, row) => {
      const v = parseDecimalField(row.balance?.available_margin_usd ?? row.balance?.equity_usd);
      return acc + (v ?? 0);
    }, 0);
    const sumEquity = (data.exchanges || []).reduce((acc, row) => {
      const v = parseDecimalField(row.balance?.equity_usd);
      return acc + (v ?? 0);
    }, 0);
    const totalAvail = parseDecimalField(data.total_available_usd);
    const totalEq = parseDecimalField(data.total_equity_usd);
    setPortfolioTotals((prev) => ({
      equity: totalEq != null ? totalEq : (sumEquity > 0 ? sumEquity : prev?.equity ?? null),
      available: totalAvail != null ? totalAvail : (sumAvailable > 0 ? sumAvailable : prev?.available ?? null),
      unrealized: parseDecimalField(data.total_unrealized_pnl_usd) ?? prev?.unrealized ?? null,
    }));
    if (data.net_pnl_usd != null) {
      const net = parseDecimalField(data.net_pnl_usd);
      setPortfolioPnl(net);
      setTotalPnl(net);
    }
  }, []);

  const fetchExchangeBalanceFallback = useCallback(async (exchanges) => {
    if (!token || !Array.isArray(exchanges) || exchanges.length === 0) return;
    const active = exchanges.filter((acc) => acc.status === 'active');
    const results = [];
    for (let i = 0; i < active.length; i += 1) {
      const acc = active[i];
      const ex = String(acc.exchange || '').toLowerCase();
      if (!ex) continue;
      const cached = getUsableClientCachedBalance(ex);
      if (cached) {
        results.push({ ex, ...cached });
        continue;
      }
      if (i > 0) await sleep(650);
      try {
        let row = null;
        let lastErr = null;
        for (const balancePath of botApiPathCandidates(`/exchanges/${ex}/balance`)) {
          const r = await fetch(botApiUrl(balancePath), { headers: botAuthHeaders(token) });
          const body = await r.json().catch(() => ({}));
          if (r.ok && body?.success !== false && body?.data) {
            const b = body.data;
            row = {
              available: parseDecimalField(b.available_margin_usd ?? b.equity_usd),
              equity: parseDecimalField(b.equity_usd),
              error: null,
              staleWarning: null,
              unrealized: null,
            };
            break;
          }
          lastErr = body?.error?.message || body?.error?.code || `HTTP ${r.status}`;
        }
        if (row) {
          setClientCachedBalance(ex, row);
          results.push({ ex, ...row });
        } else {
          results.push({ ex, error: lastErr || 'balance unavailable' });
        }
      } catch (err) {
        results.push({ ex, error: err?.message || String(err) });
      }
    }
    const map = {};
    let totalEquity = 0;
    let totalAvailable = 0;
    for (const row of results) {
      if (!row?.ex) continue;
      const { error, staleWarning } = normalizeBalanceError(row.error);
      map[row.ex] = {
        available: row.available,
        equity: row.equity,
        error,
        staleWarning,
        unrealized: row.unrealized,
      };
      if (row.available != null) totalAvailable += row.available;
      if (row.equity != null) totalEquity += row.equity;
    }
    if (Object.keys(map).length === 0) return;
    setExchangeBalances((prev) => {
      const next = { ...prev };
      for (const [ex, incoming] of Object.entries(map)) {
        next[ex] = mergeExchangeBalance(prev[ex], incoming);
      }
      return next;
    });
    setHlBalanceUsd((prev) => {
      const v = map.hyperliquid?.available;
      return v != null && v > 0 ? v : prev;
    });
    setGrvtBalanceUsd((prev) => {
      const v = map.grvt?.available;
      return v != null && v > 0 ? v : prev;
    });
    setPortfolioTotals((prev) => ({
      equity: totalEquity > 0 ? totalEquity : prev?.equity ?? null,
      available: totalAvailable > 0 ? totalAvailable : prev?.available ?? null,
      unrealized: prev?.unrealized ?? null,
    }));
  }, [token]);

  const fetchPortfolio = useCallback(async () => {
    if (!token || portfolioFetchInFlight.current) return;
    portfolioFetchInFlight.current = true;
    try {
      const portfolioRes = await fetchBotApiJson('/portfolio/summary', token);
      if (portfolioRes.ok) {
        applyPortfolioPayload(portfolioRes.data);
        return;
      }
      console.warn('portfolio summary:', portfolioRes.error);
      const accountsRes = await fetchBotApiJson('/accounts', token);
      if (accountsRes.ok) {
        const rows = Array.isArray(accountsRes.data) ? accountsRes.data : [];
        await fetchExchangeBalanceFallback(rows);
      } else {
        console.error('portfolio fallback via accounts failed:', accountsRes.error);
      }
    } catch (err) {
      console.error('fetch portfolio failed:', err);
    } finally {
      portfolioFetchInFlight.current = false;
    }
  }, [token, applyPortfolioPayload, fetchExchangeBalanceFallback]);

  const fetchAccounts = useCallback(async () => {
    if (!token) return;
    const res = await fetchBotApiJson('/accounts', token);
    if (!res.ok) {
      console.error('fetch accounts failed:', res.error);
      return;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    setSyncedAccounts(rows);
    const now = Date.now();
    if (rows.length > 0 && now - balanceFallbackAt.current > 45000) {
      balanceFallbackAt.current = now;
      fetchExchangeBalanceFallback(rows).catch((err) => {
        console.warn('balance fallback after accounts:', err);
      });
    }
  }, [token, fetchExchangeBalanceFallback]);

  const authorizeGrvtBuilder = useCallback(async ({ silent = false } = {}) => {
    if (!token) return { ok: false, error: 'no token' };
    if (!silent) setNotice('GRVT: confirm Authorize Builder in your wallet…');
    const result = await authorizeGrvtBuilderForGame({
      playerToken: token,
      evmProvider: evmWallet?.provider,
      walletAddress: evmWallet?.address,
      player: playerForBots,
    });
    if (!result.ok) {
      if (!silent) setNotice(result.error);
      return result;
    }
    if (!silent) setNotice('GRVT builder authorized — you can Launch/Start the bot.');
    return result;
  }, [token, evmWallet?.provider, evmWallet?.address, playerForBots]);

  const addAccount = useCallback(() => {
    if (!token) return;
    if (!newAccPrivateKey.trim()) {
      setNotice('Please enter a private key or address.');
      return;
    }
    
    let secretRef = 'literal:';
    const rawKey = newAccPrivateKey.trim();
    if (rawKey) {
      if (keyTransMethod === 'encrypt') {
        const key = 'default-clash-key'; // matches Rust CLASH_WALLET_ENCRYPTION_KEY fallback or override
        secretRef = encryptSecret(rawKey, key);
      } else {
        secretRef = 'literal:' + rawKey;
      }
    }

    fetch(botApiUrl('/api/v1/accounts'), {
      method: 'POST',
      headers: botAuthHeaders(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        exchange: newAccExchange,
        sub_account: newAccSubId,
        label: newAccLabel,
        secret_ref: secretRef,
        metadata: {}
      })
    })
      .then((r) => r.json())
      .then((res) => {
        if (res && res.data) {
          setNotice('Account synced successfully!');
          setNewAccPrivateKey('');
          fetchAccounts();
          fetch(botApiUrl(`/api/v1/exchanges/${newAccExchange}/enable`), {
            method: 'POST',
            headers: botAuthHeaders(token)
          }).then(() => fetchAccounts());
        } else {
          setNotice(`Failed to sync account: ${res.error?.message || 'unknown error'}`);
        }
      })
      .catch((err) => {
        console.error('add account failed:', err);
        setNotice('Network error syncing account');
      });
  }, [token, newAccExchange, newAccSubId, newAccLabel, newAccPrivateKey, keyTransMethod, fetchAccounts]);

  const refreshGameAuthScan = useCallback(async () => {
    const scanId = gameAuthScanIdRef.current + 1;
    gameAuthScanIdRef.current = scanId;
    setGameAuthScanning(true);
    if (!playerForBots) {
      setGameAuthRows([]);
      setScanCompleted(true);
      setGameAuthScanning(false);
      return;
    }
    try {
      const rows = await scanGameCredentialStatuses(playerForBots, syncedAccounts, gameSyncWalletCtx);
      if (scanId === gameAuthScanIdRef.current) setGameAuthRows(rows);
    } catch (err) {
      console.error('game auth scan failed:', err);
    } finally {
      if (scanId === gameAuthScanIdRef.current) {
        setScanCompleted(true);
        setGameAuthScanning(false);
      }
    }
  }, [playerForBots, syncedAccounts, gameSyncWalletCtx]);

  useEffect(() => {
    if (view !== 'launch' || step !== 'exchange') return;
    if (selectedExchangeId) setNewAccExchange(selectedExchangeId);
    refreshGameAuthScan();
  }, [view, step, selectedExchangeId, refreshGameAuthScan, playerDexAccounts]);

  const formatSetupResultNotice = useCallback((result, exchangeLabel) => {
    if (!result?.ok) return result?.error || 'Setup failed';
    const parts = [`${exchangeLabel} — sync OK`];
    if (result.balance != null && result.balance !== '') {
      const bal = Number(result.balance);
      parts.push(`balance ${Number.isFinite(bal) ? `$${bal.toFixed(2)}` : result.balance}`);
    }
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const builderNote = warnings.find((w) => /grvt builder/i.test(String(w)));
    if (builderNote) {
      parts.push(builderNote.replace(/^GRVT builder:\s*/i, 'builder: '));
    } else if (String(exchangeLabel).toUpperCase() === 'GRVT') {
      parts.push('builder authorized');
    } else if (warnings.length > 0) {
      parts.push(warnings[0]);
    }
    return parts.join(' · ');
  }, []);

  const runGrvtConnectWizard = useCallback(async () => {
    if (!token || gameAuthBusy) return { ok: false };
    const secret = grvtOneTapInput.trim();
    if (!secret) {
      setNotice('Paste GRVT Secret Private Key (from grvt.io when creating API key), then click Connect bot.');
      return { ok: false };
    }
    setGameAuthBusy(true);
    setNotice('GRVT: saving one-tap key, syncing account, and authorizing builder…');
    try {
      await saveGrvtOneTapSigner(secret);
      setGrvtOneTapInput('');
      const result = await setupAndSyncGameAccount({
        token,
        exchangeId: 'grvt',
        player: playerForBots,
        encryptSecret,
        keyTransMethod,
        probeBalance: true,
        ...gameSetupSyncOpts,
      });
      setNotice(formatSetupResultNotice(result, 'GRVT'));
      await fetchAccounts();
      await refreshGameAuthScan();
      return result;
    } catch (err) {
      console.error('GRVT connect wizard failed:', err);
      setNotice(err?.message || 'GRVT connect failed.');
      return { ok: false, error: err?.message };
    } finally {
      setGameAuthBusy(false);
    }
  }, [
    token,
    gameAuthBusy,
    grvtOneTapInput,
    playerForBots,
    keyTransMethod,
    gameSetupSyncOpts,
    fetchAccounts,
    refreshGameAuthScan,
    formatSetupResultNotice,
  ]);

  const connectGameWalletAccount = useCallback(async (exchangeOverride) => {
    if (!token) return;
    const target = String(exchangeOverride || newAccExchange || '').toLowerCase();
    if (!target) return;
    const authRow = gameAuthRows.find((row) => row.exchange === target);
    if (target === 'grvt' && authRow?.partial && !authRow?.synced) {
      await runGrvtConnectWizard();
      return;
    }
    setGameAuthBusy(true);
    const label = target === 'katana' && authRow?.partial
      ? 'Katana: enable one-tap and sync…'
      : `Setup & Sync ${target.toUpperCase()}…`;
    setNotice(label);
    try {
      const result = await setupAndSyncGameAccount({
        token,
        exchangeId: target,
        player: playerForBots,
        encryptSecret,
        keyTransMethod,
        label: newAccLabel,
        subAccount: newAccSubId,
        probeBalance: true,
        ...gameSetupSyncOpts,
      });
      setNotice(formatSetupResultNotice(result, target.toUpperCase()));
      if (result.ok) setNewAccPrivateKey('');
      await fetchAccounts();
      try {
        await refreshGameAuthScan();
      } catch (scanErr) {
        console.error('post-sync scan failed:', scanErr);
      }
    } catch (err) {
      console.error('connect game wallet failed:', err);
      const msg = String(err?.message || err || '').trim();
      if (/failed to fetch|network error|fetch failed/i.test(msg)) {
        setNotice('Phantom bot unavailable (check it is running on :8080). Try again in 10s.');
      } else {
        setNotice(msg || 'Setup & Sync failed.');
      }
    } finally {
      setGameAuthBusy(false);
    }
  }, [
    token,
    newAccExchange,
    newAccSubId,
    newAccLabel,
    keyTransMethod,
    playerForBots,
    gameSetupSyncOpts,
    gameAuthRows,
    runGrvtConnectWizard,
    fetchAccounts,
    refreshGameAuthScan,
    formatSetupResultNotice,
  ]);

  const reconnectGameWalletAccount = useCallback(async (exchangeOverride) => {
    if (!token) return;
    const target = String(exchangeOverride || '').toLowerCase();
    if (!target) return;
    setGameAuthBusy(true);
    setNotice(`Reconnect ${target.toUpperCase()}…`);
    try {
      const result = await reconnectGameAccountToPhantom({
        token,
        exchangeId: target,
        player: playerForBots,
        encryptSecret,
        keyTransMethod,
        label: newAccLabel,
        subAccount: newAccSubId,
        ...gameSetupSyncOpts,
      });
      if (result.ok) {
        setNotice(`${target.toUpperCase()} reconnected — credentials re-synced.`);
      } else {
        setNotice(result.error || 'Reconnect failed.');
      }
      await fetchAccounts();
      try {
        await refreshGameAuthScan();
      } catch (scanErr) {
        console.error('post-reconnect scan failed:', scanErr);
      }
    } catch (err) {
      console.error('reconnect game wallet failed:', err);
      const msg = String(err?.message || err || '').trim();
      setNotice(msg || 'Reconnect failed.');
    } finally {
      setGameAuthBusy(false);
    }
  }, [
    token,
    newAccSubId,
    newAccLabel,
    keyTransMethod,
    playerForBots,
    gameSetupSyncOpts,
    fetchAccounts,
    refreshGameAuthScan,
  ]);

  const resolveEvmWallet = useCallback((dex = '') => {
    const fromCtx = String(evmWallet?.address || '').trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(fromCtx)) return fromCtx;
    return registeredDexWallet(playerForBots, dex, 'evm')
      || registeredDexWallet(playerForBots, '', 'evm')
      || '';
  }, [evmWallet?.address, playerForBots]);

  const resolveSolWallet = useCallback((dex = '') => {
    const fromCtx = String(solanaWalletAddress || '').trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(fromCtx)) return fromCtx;
    return registeredDexWallet(playerForBots, dex, 'solana')
      || registeredDexWallet(playerForBots, '', 'solana')
      || '';
  }, [solanaWalletAddress, playerForBots]);

  const completeManualExchangeAndSync = useCallback(async (exchangeId, saveFn, label) => {
    if (!token || gameAuthBusy) return;
    setGameAuthBusy(true);
    setNotice(`Saving ${label} and syncing to Phantom…`);
    try {
      const result = await saveThenSyncGameAccount({
        token,
        exchangeId,
        player: playerForBots,
        walletCtx: {
          evmProvider: evmWallet?.provider,
          evmWalletAddress: evmWallet?.address,
          walletAddress: evmWallet?.address,
          solanaSignMessage,
          solanaWalletAddress,
        },
        encryptSecret,
        keyTransMethod,
        label,
        saveFn,
        probeBalance: true,
      });
      setNotice(formatSetupResultNotice(result, label));
      await fetchAccounts();
      await refreshGameAuthScan();
    } catch (err) {
      console.error(`${exchangeId} manual sync failed:`, err);
      setNotice(err?.message || `Failed to save ${label}.`);
    } finally {
      setGameAuthBusy(false);
    }
  }, [
    token,
    gameAuthBusy,
    playerForBots,
    keyTransMethod,
    evmWallet?.provider,
    evmWallet?.address,
    solanaSignMessage,
    solanaWalletAddress,
    fetchAccounts,
    refreshGameAuthScan,
    formatSetupResultNotice,
  ]);

  const completeKatanaFullAndSync = useCallback(() => {
    const wallet = katanaWalletInput.trim() || resolveEvmWallet('katana');
    if (!katanaApiKeyInput.trim() || !katanaApiSecretInput.trim() || !katanaOneTapInput.trim()) {
      setNotice('Katana: API key, API secret, and delegated private key are required.');
      return;
    }
    if (!wallet) {
      setNotice('Enter Katana wallet (0x…) or connect EVM wallet.');
      return;
    }
    return completeManualExchangeAndSync(
      'katana',
      () => saveKatanaBotCredentials({
        apiKey: katanaApiKeyInput,
        apiSecret: katanaApiSecretInput,
        wallet,
        oneTapPrivateKey: katanaOneTapInput,
      }),
      'KATANA',
    ).then(() => {
      setKatanaApiKeyInput('');
      setKatanaApiSecretInput('');
      setKatanaWalletInput('');
      setKatanaOneTapInput('');
    });
  }, [
    completeManualExchangeAndSync,
    katanaApiKeyInput,
    katanaApiSecretInput,
    katanaWalletInput,
    katanaOneTapInput,
    resolveEvmWallet,
  ]);

  const completeHotstuffAndSync = useCallback(() => {
    const wallet = resolveEvmWallet('hotstuff');
    if (!hotstuffAgentInput.trim()) {
      setNotice('Paste Hotstuff agent private key.');
      return;
    }
    if (!wallet) {
      setNotice('Connect EVM wallet for Hotstuff.');
      return;
    }
    completeManualExchangeAndSync(
      'hotstuff',
      () => saveHotstuffAgent(hotstuffAgentInput, wallet),
      'HOTSTUFF',
    ).then(() => setHotstuffAgentInput(''));
  }, [completeManualExchangeAndSync, hotstuffAgentInput, resolveEvmWallet]);

  const completeAvantisAndSync = useCallback(() => {
    const wallet = resolveEvmWallet('avantis');
    if (!avantisDelegateInput.trim()) {
      setNotice('Paste Avantis delegate private key.');
      return;
    }
    if (!wallet) {
      setNotice('Connect Base wallet for Avantis.');
      return;
    }
    completeManualExchangeAndSync(
      'avantis',
      () => Promise.resolve(saveAvantisDelegate(avantisDelegateInput, wallet)),
      'AVANTIS',
    ).then(() => setAvantisDelegateInput(''));
  }, [completeManualExchangeAndSync, avantisDelegateInput, resolveEvmWallet]);

  const completeHibachiAndSync = useCallback(() => {
    if (!hibachiApiKeyInput.trim() || !hibachiAccountIdInput.trim() || !hibachiPrivateKeyInput.trim()) {
      setNotice('Fill in Hibachi API key, account id, and signing key.');
      return;
    }
    completeManualExchangeAndSync(
      'hibachi',
      () => saveHibachiBotCredentials({
        apiKey: hibachiApiKeyInput,
        accountId: hibachiAccountIdInput,
        privateKey: hibachiPrivateKeyInput,
      }),
      'HIBACHI',
    ).then(() => {
      setHibachiApiKeyInput('');
      setHibachiAccountIdInput('');
      setHibachiPrivateKeyInput('');
    });
  }, [
    completeManualExchangeAndSync,
    hibachiApiKeyInput,
    hibachiAccountIdInput,
    hibachiPrivateKeyInput,
  ]);

  const completeRisexAndSync = useCallback(() => {
    const wallet = resolveEvmWallet('risex');
    if (!risexSessionInput.trim()) {
      setNotice('Paste RISEx session private key.');
      return;
    }
    if (!wallet) {
      setNotice('Connect EVM wallet for RISEx.');
      return;
    }
    completeManualExchangeAndSync(
      'risex',
      () => Promise.resolve(saveRisexSessionSigner(risexSessionInput, wallet)),
      'RISEX',
    ).then(() => setRisexSessionInput(''));
  }, [completeManualExchangeAndSync, risexSessionInput, resolveEvmWallet]);

  const completeNadoAndSync = useCallback(() => {
    const wallet = resolveEvmWallet('nado');
    if (!nadoLinkedInput.trim()) {
      setNotice('Paste Nado linked signer private key.');
      return;
    }
    if (!wallet) {
      setNotice('Connect EVM wallet for Nado.');
      return;
    }
    completeManualExchangeAndSync(
      'nado',
      () => Promise.resolve(saveNadoLinkedSigner(nadoLinkedInput, wallet)),
      'NADO',
    ).then(() => setNadoLinkedInput(''));
  }, [completeManualExchangeAndSync, nadoLinkedInput, resolveEvmWallet]);

  const completePhoenixAndSync = useCallback(() => {
    const sol = resolveSolWallet('phoenix');
    if (!phoenixSecretInput.trim()) {
      setNotice('Paste Phoenix one-tap Solana secret (base58).');
      return;
    }
    if (!sol) {
      setNotice('Connect Solana wallet for Phoenix.');
      return;
    }
    completeManualExchangeAndSync(
      'phoenix',
      () => Promise.resolve(savePhoenixBotSigner(phoenixSecretInput, sol)),
      'PHOENIX',
    ).then(() => setPhoenixSecretInput(''));
  }, [completeManualExchangeAndSync, phoenixSecretInput, resolveSolWallet]);

  const authorizeGrvtBuilderClick = useCallback(async () => {
    if (!token || gameAuthBusy) return;
    setGameAuthBusy(true);
    try {
      await authorizeGrvtBuilder();
    } finally {
      setGameAuthBusy(false);
    }
  }, [token, gameAuthBusy, authorizeGrvtBuilder]);

  const testGameExchangeBalance = useCallback(async (exchangeId) => {
    if (!token) return;
    const ex = String(exchangeId || '').toLowerCase();
    setGameAuthProbing(ex);
    try {
      const result = await probeExchangeBalance(token, ex);
      if (!result.ok) {
        setNotice(`${ex.toUpperCase()} balance: ${result.error}`);
        return;
      }
      const bal = Number(result.balance);
      const text = Number.isFinite(bal) ? `$${bal.toFixed(2)}` : String(result.balance ?? '—');
      setNotice(`${ex.toUpperCase()} balance probe OK: ${text}`);
    } catch (err) {
      console.error('balance probe failed:', err);
      setNotice(`Balance probe failed for ${ex.toUpperCase()}`);
    } finally {
      setGameAuthProbing(null);
    }
  }, [token]);

  const toggleExchangeActive = useCallback((exchangeId, active) => {
    if (!token) return;
    const endpoint = botApiUrl(`/api/v1/exchanges/${exchangeId}/${active ? 'enable' : 'disable'}`);
    fetch(endpoint, {
      method: 'POST',
      headers: botAuthHeaders(token)
    })
      .then((r) => r.json())
      .then(() => {
        setNotice(`Exchange ${exchangeId} ${active ? 'enabled' : 'disabled'}.`);
        fetchAccounts();
      })
      .catch((err) => console.error('toggle exchange active failed:', err));
  }, [token, fetchAccounts]);

  const handleToggleBot = useCallback((id) => {
    setExpandedBotId((current) => {
      const next = current === id ? null : id;
      userCollapsedRef.current = next === null;
      return next;
    });
  }, []);

  const fetchOrderHistory = useCallback(() => {
    if (!token) return;
    fetch(botApiUrl('/api/v1/orders/history'), { headers: botAuthHeaders(token) })
      .then((r) => r.json())
      .then((res) => {
        const rows = res?.data?.orders;
        if (!Array.isArray(rows)) return;
        setOrderHistory(rows.map((o) => ({
          id: `ord-${o.exchange_order_id}`,
          time: new Date(Number(o.updated_at_ms) || Date.now()).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          }),
          bot: String(o.exchange || 'HL').toUpperCase(),
          event: `${String(o.side || '').replace('Buy', 'BUY').replace('Sell', 'SELL')} ${o.symbol}`,
          value: `${String(o.status || '').replace(/[^\w]/g, ' ').trim()} · #${String(o.exchange_order_id).slice(-6)}`,
        })));
      })
      .catch((err) => console.error('fetch order history failed:', err));
  }, [token]);

  const fetchInstances = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchBotApiJson('/strategies/instances', token);
      if (!res.ok || !res.data) {
        setNotice(formatApiError(res.body?.error, 'Could not load bot strategies. Check the configured bot API is reachable.'));
        return;
      }
      const {
        running = [],
        configured = [],
        runtime = {},
        overrides = {},
        active_orders: activeOrders = 0,
      } = res.data;
      setConfiguredInstances(configured);
      setRunningInstances(running);
      setRuntimeById(runtime || {});
      setOverridesById(overrides || {});
      setGlobalActiveOrders(Number(activeOrders) || 0);
      if (res.data.exchange_balances) {
        applyPortfolioPayload({
          exchanges: (res.data.exchange_balances.exchanges || []).map((row) => ({
            exchange: row.exchange,
            balance: row.balance,
            balance_error: row.balance_error,
            unrealized_pnl_usd: 0,
          })),
          total_equity_usd: res.data.exchange_balances.total_equity_usd,
          total_available_usd: res.data.exchange_balances.total_available_usd,
          total_unrealized_pnl_usd: 0,
        });
      }
      setExpandedBotId((current) => {
        if (current && (configured.some((h) => h.id === current) || running.some((h) => h.id === current))) {
          return current;
        }
        if (userCollapsedRef.current) {
          return null;
        }
        const allIds = [...configured, ...running];
        const firstRunning = allIds.find((h) => running.some((r) => r.id === h.id));
        if (firstRunning) return firstRunning.id;
        if (configured.length > 0) return configured[0].id;
        return null;
      });
    } catch (err) {
      console.error('fetch instances failed:', err);
      setNotice('Cannot reach bot API — check the configured bot endpoint is reachable.');
    } finally {
      setInstancesLoading(false);
    }
  }, [token, applyPortfolioPayload]);

  const appendHistory = useCallback((event, value, botLabel = 'System') => {
    const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    setHistory((prev) => [
      { id: `h-${Date.now()}`, time, bot: botLabel, event, value },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const handleStartBot = useCallback(async (id) => {
    if (!token) {
      setNotice('Not logged in — refresh the game and try again.');
      return;
    }
    const parsed = parseStrategyInstanceId(id);
    const missing = parsed.exchanges.filter((ex) => !accountActiveForExchange(syncedAccounts, ex));
    if (missing.length > 0) {
      setNotice(`Connect an active ${missing.map((e) => e.toUpperCase()).join(' + ')} account from Launch New Bot first.`);
      return;
    }
    if (parsed.exchanges.some((ex) => ex.toLowerCase() === 'grvt')) {
      const auth = await authorizeGrvtBuilder({ silent: true });
      if (!auth.ok) {
        setNotice(`Authorize Builder required before Start on GRVT: ${auth.error}`);
        return;
      }
    }
    fetch(botApiUrl(`/api/v1/strategies/${encodeURIComponent(id)}/start`), {
      method: 'POST',
      headers: botAuthHeaders(token)
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.status === 'started' || res?.data?.action === 'start_all') {
          setNotice('Bot started successfully!');
          appendHistory('Strategy started', getExchangeName(id), getBotType(parseStrategyInstanceId(id).kind).name);
          fetchInstances();
        } else {
          setNotice(`Failed to start bot: ${formatApiError(res?.error)}`);
        }
      })
      .catch((err) => {
        console.error('start bot failed:', err);
        setNotice('Network error starting bot — check the configured bot endpoint.');
      });
  }, [token, fetchInstances, syncedAccounts, appendHistory, authorizeGrvtBuilder]);

  const handleStopBot = useCallback((id) => {
    if (!token) return;
    fetch(botApiUrl(`/api/v1/strategies/${encodeURIComponent(id)}/stop`), {
      method: 'POST',
      headers: botAuthHeaders(token)
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.status === 'stopped' || res?.data?.action === 'stop_all') {
          setNotice('Bot stopped successfully.');
          appendHistory('Strategy stopped', getExchangeName(id), getBotType(parseStrategyInstanceId(id).kind).name);
          fetchInstances();
        } else {
          setNotice(`Failed to stop bot: ${formatApiError(res?.error)}`);
        }
      })
      .catch((err) => {
        console.error('stop bot failed:', err);
        setNotice('Network error stopping bot — check the configured bot endpoint.');
      });
  }, [token, fetchInstances, appendHistory]);

  const launchBot = useCallback(async () => {
    if (launching) return;
    if (!token || !selectedInstanceId) {
      setNotice('Please select a strategy and exchange instance first.');
      return;
    }
    setLaunching(true);
    const parsed = parseStrategyInstanceId(selectedInstanceId);
    const missing = parsed.exchanges.filter((ex) => !accountActiveForExchange(syncedAccounts, ex));
    if (missing.length > 0) {
      setNotice(`Connect ${missing.map((e) => e.toUpperCase()).join(' + ')} in the Exchange step before launch.`);
      setLaunching(false);
      return;
    }
    if (parsed.exchanges.some((ex) => ex.toLowerCase() === 'grvt')) {
      try {
        const auth = await authorizeGrvtBuilder({ silent: true });
        if (!auth.ok) {
          setNotice(`Authorize Builder required before Launch on GRVT: ${auth.error}`);
          setLaunching(false);
          return;
        }
      } catch (error) {
        setNotice(`Authorize Builder required before Launch on GRVT: ${formatApiError(error)}`);
        setLaunching(false);
        return;
      }
    }
    const spreadBps = preset === 'aggressive' ? 4 : 8;
    try {
      const configResponse = await fetch(botApiUrl(`/api/v1/strategies/${encodeURIComponent(selectedInstanceId)}/config`), {
        method: 'PUT',
        headers: botAuthHeaders(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({
          order_size_usd: String(tradeSize),
          position_size_usd: String(maxPosition),
          spread_bps: spreadBps,
          min_funding_diff_bps: spreadBps,
        }),
      });
      const cfgRes = await configResponse.json();
      if (!cfgRes?.success) {
        throw new Error(formatApiError(cfgRes?.error, 'config save failed'));
      }

      const startResponse = await fetch(botApiUrl(`/api/v1/strategies/${encodeURIComponent(selectedInstanceId)}/start`), {
        method: 'POST',
        headers: botAuthHeaders(token),
      });
      const res = await startResponse.json();
      if (res?.data?.status !== 'started') {
        setNotice(`Launch failed: ${formatApiError(res?.error)}`);
        return;
      }

      const cfgNote = cfgRes?.data?.updated
        ? ` Config: $${tradeSize} trade, spread ${spreadBps} bps.`
        : '';
      setNotice(`Launched ${getBotType(selectedType).name} on ${getExchangeName(selectedInstanceId)} successfully!${cfgNote}`);
      appendHistory('Strategy started', getExchangeName(selectedInstanceId), getBotType(selectedType).name);
      userCollapsedRef.current = false;
      setExpandedBotId(selectedInstanceId);
      setView('dashboard');
      fetchInstances();
      fetchOrderHistory();
      resetLaunch();
    } catch (err) {
      console.error('launch failed:', err);
      setNotice('Network error launching strategy');
    } finally {
      setLaunching(false);
    }
  }, [launching, selectedInstanceId, token, tradeSize, maxPosition, preset, selectedType, fetchInstances, fetchOrderHistory, resetLaunch, syncedAccounts, appendHistory, authorizeGrvtBuilder]);

  // Real-time WebSocket updates via Clash game backend mediator
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch('/api/players/dex-accounts', { headers: { 'x-token': token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.dex_accounts)) setPlayerDexAccounts(data.dex_accounts);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchInstances();
    fetchAccounts();
    fetchOrderHistory();
    fetchPortfolio();

    // Fallback polling every 5 s — keeps UI in sync even when WS is down
    const pollInterval = setInterval(() => {
      fetchInstances();
      fetchAccounts();
      fetchOrderHistory();
    }, 5000);
    const portfolioInterval = setInterval(() => {
      fetchPortfolio();
    }, 15000);

    const wsParams = new URLSearchParams({
      token,
      authorization: `Bearer ${token}`,
    });
    const wsUrl = `${botWsUrl('/api/v1/bot/ws')}?${wsParams.toString()}`;
    let ws;
    let reconnectTimer;
    let pingTimer;
    let reconnectDelayMs = 3000;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        console.warn('[bot-ws] connect failed:', err);
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWs, reconnectDelayMs);
        reconnectDelayMs = Math.min(Math.round(reconnectDelayMs * 1.5), 30000);
        return;
      }

      ws.onopen = () => {
        reconnectDelayMs = 3000;
        setWsConnected(true);
        ws.send(JSON.stringify({
          action: 'subscribe',
          channels: ['strategies', 'orders', 'positions', 'pnl', 'volume_stats', 'alerts']
        }));
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'strategy_event') {
            fetchInstances();
            const ev = msg.data || {};
            const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            setHistory((prev) => [
              {
                id: `h-${Date.now()}`,
                time,
                bot: ev.strategy_id?.split(':')[0].replace('_', ' ').toUpperCase() || 'BOT',
                event: ev.type || 'Lifecycle event',
                value: ev.reason || ev.message || 'state change'
              },
              ...prev.slice(0, 49)
            ]);
            if (ev.type === 'order_filled' || ev.type === 'order_updated') {
              const ord = ev.response || ev;
              const status = ev.type === 'order_filled' ? 'Filled' : String(ord.status || 'update');
              if (status === 'Filled' || status === 'PartiallyFilled') {
                fetchOrderHistory();
                fetchPortfolio();
              }
            }
            if (ev.type === 'position_updated' || ev.type === 'position_opened') {
              fetchInstances();
              fetchPortfolio();
            }
          } else if (msg.type === 'pnl_snapshot') {
            setTotalPnl(Number(msg.data?.net_pnl_usd) || 0);
            setPortfolioPnl(Number(msg.data?.net_pnl_usd) || 0);
          } else if (msg.type === 'volume_stats') {
            setFillsCount(Number(msg.data?.total_volume_usd_24h) || 0);
          } else if (msg.type === 'position_update') {
            fetchInstances();
            fetchPortfolio();
          } else if (msg.type === 'order_update') {
            const ord = msg.data;
            const status = String(ord.status || 'update');
            const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            const sideLabel = String(ord.side || '').toUpperCase();
            if (status === 'Filled' || status === 'PartiallyFilled') {
              fetchInstances();
              fetchPortfolio();
              fetchOrderHistory();

              const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              setHistory((prev) => [
                {
                  id: `h-${Date.now()}`,
                  time,
                  bot: ord.exchange.toUpperCase(),
                  event: `Filled ${ord.symbol}`,
                  value: `${ord.filled_size} @ ${ord.avg_fill_price || 'mkt'}`
                },
                ...prev.slice(0, 49)
              ]);
            } else if (status === 'Open' || status.includes('Rejected') || status === 'Cancelled') {
              setHistory((prev) => [
                {
                  id: `h-${Date.now()}`,
                  time,
                  bot: String(ord.exchange || 'HL').toUpperCase(),
                  event: `${sideLabel || 'ORDER'} ${ord.symbol}`,
                  value: status.includes('Rejected') ? `Rejected · ${ord.exchange_order_id || ''}` : `${status} · #${String(ord.exchange_order_id || '').slice(-6)}`,
                },
                ...prev.slice(0, 49),
              ]);
              fetchOrderHistory();
            }
          }
        } catch (err) {
          console.warn('[bot-ws] parse failed:', err);
        }
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWs, reconnectDelayMs);
        reconnectDelayMs = Math.min(Math.round(reconnectDelayMs * 1.5), 30000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      clearInterval(pollInterval);
      clearInterval(portfolioInterval);
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [token, fetchInstances, fetchAccounts, fetchOrderHistory, fetchPortfolio]);

  const goBack = useCallback(() => {
    const index = STEPS.indexOf(step);
    if (index <= 0) {
      setView('dashboard');
      return;
    }
    setStep(STEPS[index - 1]);
  }, [step]);

  const renderDashboard = () => (
    <>
      {notice && (
        <button type="button" style={S.notice} onClick={() => setNotice('')}>
          {notice}
          <span style={S.noticeClose}>x</span>
        </button>
      )}

      <div style={S.toolbar}>
        <div style={S.segment}>
          <button type="button" style={{ ...S.segmentButton, ...S.segmentActive }} onClick={() => setView('dashboard')}>
            Dashboard
          </button>
          <button type="button" style={S.segmentButton} onClick={() => setView('history')}>
            History
          </button>
        </div>
        <button type="button" style={{ ...cartoonBtn('#43A047', '#2E7D32'), ...S.launchButton }} onClick={openLaunch}>
          <RobotGlyph size={22} color="#fff" />
          Launch New Bot
        </button>
      </div>

      {instancesLoading ? (
        <div style={S.dashboardLoading} role="status" aria-live="polite">
          <span className="bots-spinner" style={S.loadingSpinner} aria-hidden="true" />
          <strong>Loading your bots…</strong>
          <span>Syncing saved settings and live status.</span>
        </div>
      ) : (
        <>
      <div style={S.summaryGrid} aria-label="Bot summary">
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>My Bots</span>
          <strong style={S.summaryValue}>{bots.length}</strong>
        </div>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Running</span>
          <strong style={S.summaryValue}>{activeCount}</strong>
        </div>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Open Quotes</span>
          <strong style={S.summaryValue}>{globalActiveOrders}</strong>
        </div>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Net PnL</span>
          <strong style={{ ...S.summaryValue, color: mockPnl >= 0 ? colors.long : colors.short }}>
            {portfolioPnl != null ? signedMoney(mockPnl) : '—'}
          </strong>
        </div>
      </div>

      {bots.length > 0 ? (
        <section aria-labelledby="my-bots-heading">
          <h3 id="my-bots-heading" style={S.myBotsTitle}>My Bots</h3>
          <div style={S.botGrid}>
            {bots.map((bot) => (
              <BotCard
                key={bot.id}
                bot={bot}
                expanded={expandedBotId === bot.id}
                onToggle={handleToggleBot}
                onStart={handleStartBot}
                onStop={handleStopBot}
              />
            ))}
          </div>
        </section>
      ) : (
        <div style={S.emptyLaunchState}>
          <div style={S.emptyLaunchIcon}><RobotGlyph size={40} color="#5C3A21" /></div>
          <h3 style={S.emptyLaunchTitle}>Launch your first market maker</h3>
          <p style={S.emptyLaunchCopy}>Choose an exchange, set your limits, and your bot will appear here.</p>
          <button type="button" style={{ ...cartoonBtn('#43A047', '#2E7D32'), ...S.emptyLaunchButton }} onClick={openLaunch}>
            Launch New Bot
          </button>
        </div>
      )}
        </>
      )}
    </>
  );

  const renderHistory = () => {
    const merged = [
      ...history.map((item) => ({ ...item, section: 'lifecycle' })),
      ...orderHistory.map((item) => ({ ...item, section: 'order' })),
    ];
    return (
    <>
      <div style={S.toolbar}>
        <div style={S.segment}>
          <button
            type="button"
            style={S.segmentButton}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            style={{ ...S.segmentButton, ...S.segmentActive }}
            onClick={() => setView('history')}
          >
            History
          </button>
        </div>
        <button type="button" style={{ ...cartoonBtn('#43A047', '#2E7D32'), ...S.launchButton }} onClick={openLaunch}>
          <RobotGlyph size={22} color="#fff" />
          Launch New Bot
        </button>
      </div>
      <p style={S.blockedHint}>
        Lifecycle = start/stop. Orders = live quotes tracked by Phantom (refreshes every 5s).
      </p>
      {orderHistory.length > 0 && (
        <>
          <h3 style={S.sectionTitle}>Orders ({orderHistory.length})</h3>
          <div style={S.historyList}>
            {orderHistory.map((item) => (
              <div key={item.id} style={S.historyRow}>
                <div style={S.historyTime}>{item.time}</div>
                <div style={S.historyMain}>
                  <strong>{item.bot}</strong>
                  <span>{item.event}</span>
                </div>
                <strong style={S.historyValue}>{item.value}</strong>
              </div>
            ))}
          </div>
        </>
      )}
      <h3 style={S.sectionTitle}>Lifecycle ({history.length})</h3>
      <div style={S.historyList}>
        {merged.filter((i) => i.section === 'lifecycle').map((item) => (
          <div key={item.id} style={S.historyRow}>
            <div style={S.historyTime}>{item.time}</div>
            <div style={S.historyMain}>
              <strong>{item.bot}</strong>
              <span>{item.event}</span>
            </div>
            <strong style={S.historyValue}>{item.value}</strong>
          </div>
        ))}
      </div>
    </>
    );
  };

  const renderInlineAccountSetup = () => (
      <div className="bots-inline-setup" style={S.inlineSetupBody} role="region" aria-label="Exchange bot connection" aria-busy={gameAuthBusy || gameAuthScanning}>
          <div style={S.inlineSetupToolbar}>
            <span style={S.sectionDesc}>{selectedConnectionState.hint}</span>
              <button
                type="button"
                disabled={gameAuthBusy || gameAuthScanning}
                onClick={refreshGameAuthScan}
                style={{ ...cartoonBtn('#8D6E63', '#6D4C41'), fontSize: 11, padding: '6px 10px' }}
              >
                {gameAuthScanning ? 'Checking…' : 'Scan'}
              </button>
          </div>
          {gameAuthBusy && (
            <div style={S.inlineBusyRow} role="status" aria-live="polite">
              <span className="bots-spinner" style={S.inlineBusySpinner} aria-hidden="true" />
              <span>{notice || `Working on ${DEX_CONFIG[selectedExchangeId]?.label || 'exchange'} setup…`}</span>
            </div>
          )}
          <div style={S.gameAuthList}>
            {!scanCompleted || gameAuthScanning ? (
              <div style={S.emptyState}>Checking connection…</div>
            ) : !selectedGameAuthRow ? (
              <div style={S.emptyState}>No browser credentials found yet. Complete setup below or scan again.</div>
            ) : (
              [selectedGameAuthRow].map((row) => {
                const syncedAccount = syncedAccounts.find((account) => account.exchange?.toLowerCase() === row.exchange);
                const isActive = syncedAccount?.status === 'active';
                return (
                  <div key={row.exchange} style={S.inlineSetupSection}>
                    <div style={S.gameAuthRowHint}>
                      {selectedConnectionState.hint}
                    </div>
                    {row.exchange === 'hotstuff' && !row.synced && !row.ready && (
                      <div className="bots-inline-row" style={S.grvtOneTapRow}>
                        <input
                          type="password"
                          aria-label="Hotstuff agent private key"
                          value={hotstuffAgentInput}
                          onChange={(e) => setHotstuffAgentInput(e.target.value)}
                          placeholder="Hotstuff agent private key (0x…)"
                          style={{ ...S.credentialInput, ...S.credentialInputInRow }}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          disabled={gameAuthBusy || !hotstuffAgentInput.trim()}
                          onClick={completeHotstuffAndSync}
                          style={{ ...cartoonBtn('#5D4037', '#3E2723'), fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
                        >
                          Save + Sync
                        </button>
                      </div>
                    )}
                    {row.exchange === 'avantis' && !row.synced && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        <button
                          type="button"
                          disabled={gameAuthBusy || !evmWallet?.isReady}
                          onClick={() => connectGameWalletAccount('avantis')}
                          style={{ ...cartoonBtn('#7B1FA2', '#6A1B9A'), fontSize: 11, padding: '6px 8px', width: '100%' }}
                        >
                          Smart Wallet + Sync
                        </button>
                        <div style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.35 }}>
                          One click: setDelegate + USDC approve (same as Futures). Delegate key stays in the browser — the bot trades without your signature.
                        </div>
                        <details>
                          <summary style={{ fontSize: 10, cursor: 'pointer', opacity: 0.8 }}>
                            Fallback: paste delegate key manually
                          </summary>
                          <div style={{ ...S.grvtOneTapRow, marginTop: 6 }}>
                            <input
                              type="password"
                              aria-label="Avantis smart-wallet delegate key"
                              value={avantisDelegateInput}
                              onChange={(e) => setAvantisDelegateInput(e.target.value)}
                              placeholder="Avantis smart-wallet delegate key (0x…)"
                              style={{ ...S.credentialInput, ...S.credentialInputInRow }}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              disabled={gameAuthBusy || !avantisDelegateInput.trim()}
                              onClick={completeAvantisAndSync}
                              style={{ ...cartoonBtn('#00897B', '#00695C'), fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
                            >
                              Save + Sync
                            </button>
                          </div>
                        </details>
                      </div>
                    )}
                    {row.exchange === 'flash' && !row.synced && !row.ready && (
                      <div style={{ marginTop: 6, fontSize: 10, opacity: 0.8, lineHeight: 1.35 }}>
                        Connect Solana Phantom, then click Connect bot — Flash one-tap will be enabled (same GPL session as Futures).
                        {' '}Keep ~0.005 SOL in Phantom for one-time session rent + fee (not USDC on Flash).
                      </div>
                    )}
                    {row.exchange === 'flash' && !row.synced && row.ready && (
                      <div style={{ marginTop: 6, fontSize: 10, opacity: 0.85, lineHeight: 1.35, color: '#166534' }}>
                        Flash session ready in browser — click Connect bot to sync.
                      </div>
                    )}
                    {row.exchange === 'decibel' && !row.synced && (
                      <div style={{ marginTop: 6, fontSize: 10, opacity: 0.8, lineHeight: 1.35 }}>
                        Signing via server API wallet on VPS (not your private key). First Futures → Decibel → enable fast trading, then Setup & Sync.
                      </div>
                    )}
                    {row.exchange === 'hibachi' && !row.synced && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        <input
                          type="password"
                          aria-label="Hibachi API key"
                          value={hibachiApiKeyInput}
                          onChange={(e) => setHibachiApiKeyInput(e.target.value)}
                          placeholder="Hibachi API key"
                          style={S.credentialInput}
                          autoComplete="off"
                        />
                        <input
                          type="text"
                          aria-label="Hibachi account id"
                          value={hibachiAccountIdInput}
                          onChange={(e) => setHibachiAccountIdInput(e.target.value)}
                          placeholder="Hibachi account id"
                          style={S.credentialInput}
                          autoComplete="off"
                        />
                        <div className="bots-inline-row" style={S.grvtOneTapRow}>
                          <input
                            type="password"
                            aria-label="Hibachi signing private key"
                            value={hibachiPrivateKeyInput}
                            onChange={(e) => setHibachiPrivateKeyInput(e.target.value)}
                            placeholder="Hibachi signing private key (0x…)"
                            style={{ ...S.credentialInput, ...S.credentialInputInRow }}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            disabled={gameAuthBusy || !hibachiApiKeyInput.trim() || !hibachiAccountIdInput.trim() || !hibachiPrivateKeyInput.trim()}
                            onClick={completeHibachiAndSync}
                            style={{ ...cartoonBtn('#C62828', '#B71C1C'), fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
                          >
                            Save + Sync
                          </button>
                        </div>
                      </div>
                    )}
                    {row.exchange === 'risex' && !row.synced && (
                      <div className="bots-inline-row" style={S.grvtOneTapRow}>
                        <input
                          type="password"
                          aria-label="RISEx session private key"
                          value={risexSessionInput}
                          onChange={(e) => setRisexSessionInput(e.target.value)}
                          placeholder="RISEx session private key (0x…)"
                          style={{ ...S.credentialInput, ...S.credentialInputInRow }}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          disabled={gameAuthBusy || !risexSessionInput.trim()}
                          onClick={completeRisexAndSync}
                          style={{ ...cartoonBtn('#6A1B9A', '#4A148C'), fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
                        >
                          Save + Sync
                        </button>
                      </div>
                    )}
                    {row.exchange === 'katana' && !row.synced && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        {row.partial ? (
                          <p style={{ ...S.sectionDesc, margin: 0, fontSize: 11 }}>
                            Katana API credentials found. Click <strong>Connect bot</strong> — your wallet will sign one-tap enable (no key paste).
                          </p>
                        ) : (
                          <>
                            <input
                              type="password"
                              aria-label="Katana API key"
                              value={katanaApiKeyInput}
                              onChange={(e) => setKatanaApiKeyInput(e.target.value)}
                              placeholder="Katana API key"
                              style={S.credentialInput}
                              autoComplete="off"
                            />
                            <input
                              type="password"
                              aria-label="Katana API secret"
                              value={katanaApiSecretInput}
                              onChange={(e) => setKatanaApiSecretInput(e.target.value)}
                              placeholder="Katana API secret"
                              style={S.credentialInput}
                              autoComplete="off"
                            />
                            <input
                              type="text"
                              aria-label="Katana wallet address"
                              value={katanaWalletInput}
                              onChange={(e) => setKatanaWalletInput(e.target.value)}
                              placeholder={`Katana wallet (0x…) ${resolveEvmWallet('katana') ? `— default ${resolveEvmWallet('katana').slice(0, 8)}…` : ''}`}
                              style={S.credentialInput}
                              autoComplete="off"
                            />
                            <div className="bots-inline-row" style={S.grvtOneTapRow}>
                              <input
                                type="password"
                                aria-label="Katana delegated private key"
                                value={katanaOneTapInput}
                                onChange={(e) => setKatanaOneTapInput(e.target.value)}
                                placeholder="Katana delegated private key (one-tap)"
                                style={{ ...S.credentialInput, ...S.credentialInputInRow }}
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                disabled={gameAuthBusy || !katanaApiKeyInput.trim() || !katanaApiSecretInput.trim() || !katanaOneTapInput.trim()}
                                onClick={completeKatanaFullAndSync}
                                style={{ ...cartoonBtn('#E65100', '#BF360C'), fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
                              >
                                Save + Sync
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {row.exchange === 'nado' && !row.synced && !row.ready && (
                      <div className="bots-inline-row" style={S.grvtOneTapRow}>
                        <input
                          type="password"
                          aria-label="Nado linked signer private key"
                          value={nadoLinkedInput}
                          onChange={(e) => setNadoLinkedInput(e.target.value)}
                          placeholder="Nado linked signer private key (0x…)"
                          style={{ ...S.credentialInput, ...S.credentialInputInRow }}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          disabled={gameAuthBusy || !nadoLinkedInput.trim()}
                          onClick={completeNadoAndSync}
                          style={{ ...cartoonBtn('#0277BD', '#01579B'), fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
                        >
                          Save + Sync
                        </button>
                      </div>
                    )}
                    {row.exchange === 'phoenix' && !row.synced && (
                      <div className="bots-inline-row" style={S.grvtOneTapRow}>
                        <input
                          type="password"
                          aria-label="Phoenix one-tap Solana secret"
                          value={phoenixSecretInput}
                          onChange={(e) => setPhoenixSecretInput(e.target.value)}
                          placeholder="Phoenix one-tap Solana secret (base58)"
                          style={{ ...S.credentialInput, ...S.credentialInputInRow }}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          disabled={gameAuthBusy || !phoenixSecretInput.trim()}
                          onClick={completePhoenixAndSync}
                          style={{ ...cartoonBtn('#AD1457', '#880E4F'), fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
                        >
                          Save + Sync
                        </button>
                      </div>
                    )}
                    {row.exchange === 'grvt' && row.partial && !row.synced && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        <input
                          type="password"
                          aria-label="GRVT secret private key"
                          value={grvtOneTapInput}
                          onChange={(e) => setGrvtOneTapInput(e.target.value)}
                          placeholder="GRVT Secret Private Key (from grvt.io)"
                          style={S.credentialInput}
                          autoComplete="off"
                        />
                        <p style={{ ...S.sectionDesc, margin: 0, fontSize: 11 }}>
                          Paste the secret key from API key creation, then click <strong>Connect bot</strong> — sync + builder authorization in one step.
                        </p>
                      </div>
                    )}
                    {row.exchange === 'grvt' && row.synced && (
                      <button
                        type="button"
                        disabled={gameAuthBusy}
                        onClick={authorizeGrvtBuilderClick}
                        style={{ ...cartoonBtn('#7B1FA2', '#6A1B9A'), fontSize: 11, padding: '5px 8px', marginTop: 6, width: '100%' }}
                      >
                        Retry builder authorization
                      </button>
                    )}
                    <div className="bots-inline-actions" style={S.gameAuthRowActions}>
                      {!(row.synced || syncedAccount) && (
                      <button
                        type="button"
                        disabled={gameAuthBusy}
                        onClick={() => connectGameWalletAccount(row.exchange)}
                        style={{ ...cartoonBtn('#43A047', '#2E7D32'), fontSize: 11, padding: '5px 8px' }}
                      >
                        {(row.ready && !row.synced) || (row.partial && (row.exchange === 'grvt' || row.exchange === 'katana'))
                          ? 'Connect bot'
                          : 'Setup & Sync'}
                      </button>
                      )}
                      {syncedAccount && !isActive && (
                        <button
                          type="button"
                          disabled={gameAuthBusy}
                          onClick={() => toggleExchangeActive(row.exchange, true)}
                          style={{ ...cartoonBtn('#43A047', '#2E7D32'), fontSize: 11, padding: '5px 8px' }}
                        >
                          Enable
                        </button>
                      )}
                      {(row.synced || syncedAccount) && (
                        <button
                          type="button"
                          disabled={gameAuthBusy}
                          onClick={() => reconnectGameWalletAccount(row.exchange)}
                          style={{ ...cartoonBtn('#1E88E5', '#1565C0'), fontSize: 11, padding: '5px 8px' }}
                          title="Clear Phantom cache and re-sync credentials from the game"
                        >
                          Reconnect
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!(row.synced || syncedAccount) || gameAuthProbing === row.exchange}
                        onClick={() => testGameExchangeBalance(row.exchange)}
                        style={{ ...cartoonBtn('#F9A825', '#F57F17'), fontSize: 11, padding: '5px 8px' }}
                      >
                        {gameAuthProbing === row.exchange ? '…' : 'Balance'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        {!selectedSyncedAccount && scanCompleted && !gameAuthScanning && (
        <>
        <div style={S.inlineManualSection}>
          <strong style={S.sectionTitle}>Manual key (fallback)</strong>
          <p style={S.sectionDesc}>
            Use this only when the guided setup above cannot read your existing credentials.
          </p>
          <div className="bots-inline-form-grid" style={S.formGrid}>
            <div style={S.formField}>
              <label htmlFor="bot-account-label" style={S.label}>Account Label</label>
              <input
                id="bot-account-label"
                type="text"
                placeholder="My Trading Wallet"
                value={newAccLabel}
                onChange={(e) => setNewAccLabel(e.target.value)}
                style={S.formInput}
              />
            </div>
            <div style={S.formField}>
              <label htmlFor="bot-subaccount" style={S.label}>Sub-Account ID (0 = main wallet)</label>
              <input
                id="bot-subaccount"
                type="text"
                placeholder="0"
                value={newAccSubId}
                onChange={(e) => setNewAccSubId(e.target.value)}
                style={S.formInput}
              />
            </div>
            <div style={S.formField}>
              <label htmlFor="bot-transmission" style={S.label}>Transmission Method</label>
              <select
                id="bot-transmission"
                value={keyTransMethod}
                onChange={(e) => setKeyTransMethod(e.target.value)}
                style={S.formSelect}
              >
                <option value="encrypt">XOR Encrypted (Recommended)</option>
                <option value="raw">Literal (Plain Text)</option>
              </select>
            </div>
          </div>
          <div style={{ ...S.formField, marginTop: 10 }}>
            <label htmlFor="bot-manual-secret" style={S.label}>Private Key / Secret API Key</label>
            <input
              id="bot-manual-secret"
              type="password"
              placeholder="0x... or EVM private key"
              value={newAccPrivateKey}
              onChange={(e) => setNewAccPrivateKey(e.target.value)}
              style={S.formInput}
            />
          </div>
          <button
            type="button"
            disabled={gameAuthBusy || !newAccPrivateKey.trim()}
            onClick={addAccount}
            style={{ ...cartoonBtn('#43A047', '#2E7D32'), marginTop: 12, width: '100%', py: 2, borderRadius: 12 }}
          >
            Connect & Sync Account
          </button>
        </div>
        </>
        )}
      </div>
  );

  const noticeIsError = /fail|error|missing|cannot|could not|required|network|invalid/i.test(String(notice || ''));

  const renderLaunch = () => (
    <div style={S.launchShell}>
      <div style={S.visuallyHidden} aria-live="polite" aria-atomic="true">
        Step {STEPS.indexOf(step) + 1} of {STEPS.length}: {STEP_LABELS[step]}
      </div>
      {notice && <div style={{ ...S.notice, ...(noticeIsError ? S.noticeError : {}) }} role="alert" aria-live="assertive">{notice}</div>}
      <div style={S.launchHeader}>
        <button type="button" className="bots-focusable" style={S.backButton} onClick={goBack} aria-label="Back" disabled={launching}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <StepDots activeStep={step} />
        <div style={shared.spacer36} />
      </div>

      {step === 'exchange' && (
        <div className="bots-step-page" style={S.stepPage}>
          <div>
            <h2 ref={stepHeadingRef} tabIndex={-1} style={S.stepTitle}>Choose Exchange</h2>
            <p style={S.stepCopy}>Select where your market-making bot will trade.</p>
          </div>
          <div style={S.exchangePickerCard}>
            <span style={S.label}>Exchange</span>
            <ExchangeDropdown
              options={exchangeOptions}
              value={selectedExchangeId}
              onChange={handleExchangeSelect}
              disabled={launching}
            />
            <div id="bot-exchange-status" style={S.exchangeStatus} aria-live="polite">
              {selectedExchangeOption ? (
                <>
                  <span style={{ ...S.exchangeStatusDot, background: selectedExchangeOption.readyForLaunch ? '#43A047' : '#A3906A' }} />
                  <span>
                    <strong>{selectedExchangeOption.dex.label}</strong>
                    {' · '}{selectedExchangeOption.dex.description}
                  </span>
                </>
              ) : (
                <span>Select a supported exchange with a configured Symmetric strategy.</span>
              )}
            </div>
          </div>
          {selectedExchangeOption?.strategyAvailable && selectedExchangeOption.setupSupported && (
            <div style={S.inlineConnectionCard}>
              <div style={S.inlineConnectionHeader}>
                <img src={selectedExchangeOption.dex.logo} alt="" style={S.exchangeOptionLogo} />
                <div style={S.exchangeTriggerText}>
                  <strong>{selectedExchangeOption.dex.label}</strong>
                  <small>{selectedExchangeOption.dex.chain}</small>
                </div>
                <span style={{ ...S.connectionPill, ...selectedConnectionState.style }}>
                  {selectedConnectionState.label}
                </span>
              </div>
              {renderInlineAccountSetup()}
            </div>
          )}
          <button
            type="button"
            className="bots-focusable"
            disabled={!selectedExchangeOption?.readyForLaunch}
            style={{
              ...cartoonBtn(selectedExchangeOption?.readyForLaunch ? '#1E88E5' : '#A3906A', selectedExchangeOption?.readyForLaunch ? '#1565C0' : '#8C7D5C'),
              ...S.nextButton,
              ...(!selectedExchangeOption?.readyForLaunch ? S.disabledButton : {}),
            }}
            onClick={() => setStep('strategy')}
          >
            Continue to Strategy
          </button>
        </div>
      )}

      {step === 'strategy' && (
        <div className="bots-step-page" style={S.stepPage}>
          <div>
            <h2 ref={stepHeadingRef} tabIndex={-1} style={S.stepTitle}>Choose Strategy</h2>
            <p style={S.stepCopy}>Pick how the bot manages quotes and market exposure.</p>
          </div>
          <div style={S.strategyGrid}>
            {LAUNCH_BOT_TYPES.map((bot) => {
              const active = selectedType === bot.id;
              const disabled = bot.id === 'delta_neutral';
              return (
                <button
                  key={bot.id}
                  type="button"
                  className="bots-focusable"
                  disabled={disabled}
                  aria-pressed={!disabled && active}
                  style={{
                    ...S.strategyCard,
                    ...(active ? S.strategyCardActive : {}),
                    ...(disabled ? S.strategyCardDisabled : {}),
                  }}
                  onClick={() => !disabled && setSelectedType(bot.id)}
                >
                  <div style={{ ...S.botAvatar, background: disabled ? '#B8B1A4' : `linear-gradient(180deg, ${bot.accent} 0%, ${bot.accentDark} 100%)` }}>
                    <RobotGlyph size={28} color="#fff" />
                  </div>
                  <div style={S.strategyText}>
                    <div style={S.strategyTitleRow}>
                      <strong>{bot.name}</strong>
                      {disabled && <span style={S.soonBadge}>Soon</span>}
                    </div>
                    <span>{bot.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="bots-focusable"
            style={{ ...cartoonBtn('#1E88E5', '#1565C0'), ...S.nextButton }}
            onClick={() => setStep('settings')}
          >
            Continue to Settings
          </button>
        </div>
      )}

      {step === 'settings' && (
        <div className="bots-step-page" style={S.stepPage}>
          <div>
            <h2 ref={stepHeadingRef} tabIndex={-1} style={S.stepTitle}>Bot Settings</h2>
            <p style={S.stepCopy}>Set position limits and choose how actively the bot quotes.</p>
          </div>
          {selectedExchangeInstances.length > 1 && (
            <div style={S.marketPickerCard}>
              <label htmlFor="bot-market" style={S.label}>Market</label>
              <select
                id="bot-market"
                className="bots-market-select bots-focusable"
                value={selectedInstanceId}
                onChange={(event) => setSelectedInstanceId(event.target.value)}
              >
                <option value="">Select a market</option>
                {selectedExchangeInstances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {(instance.symbols || []).map((symbol) => String(symbol).toUpperCase()).join(', ') || instance.id}
                  </option>
                ))}
              </select>
              <span style={S.marketPickerHint}>Each market launches its exact configured bot instance.</span>
            </div>
          )}
          <SliderField
            label="Trade Size"
            min={5}
            max={500}
            step={5}
            value={tradeSize}
            defaultValue={20}
            onChange={setTradeSize}
          />
          <SliderField
            label="Maximum Position"
            min={50}
            max={5000}
            step={50}
            value={maxPosition}
            defaultValue={200}
            onChange={setMaxPosition}
          />
          <div style={S.presetCard}>
            <span style={S.label}>Bot Behavior</span>
            <div style={S.presetToggle}>
              {Object.entries(PRESETS).map(([id, option]) => (
                <button
                  key={id}
                  type="button"
                  className="bots-focusable"
                  style={{ ...S.presetButton, ...(preset === id ? S.presetActive : {}) }}
                  onClick={() => setPreset(id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <strong style={S.detailTitle}>{PRESETS[preset].title}</strong>
            <p style={S.detailCopy}>{PRESETS[preset].copy}</p>
          </div>
          <button
            type="button"
            className="bots-focusable"
            disabled={!selectedInstanceId}
            style={{ ...cartoonBtn(selectedInstanceId ? '#1E88E5' : '#A3906A', selectedInstanceId ? '#1565C0' : '#8C7D5C'), ...S.nextButton, ...(!selectedInstanceId ? S.disabledButton : {}) }}
            onClick={() => setStep('review')}
          >
            Review Bot
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="bots-step-page" style={S.stepPage}>
          <div>
            <h2 ref={stepHeadingRef} tabIndex={-1} style={S.stepTitle}>Review and Launch</h2>
            <p style={S.stepCopy}>Check your setup before starting the bot.</p>
          </div>
          <div style={S.reviewCard}>
            <div style={S.cardTop}>
              <div style={{ ...S.botAvatar, background: `linear-gradient(180deg, ${selectedBot.accent} 0%, ${selectedBot.accentDark} 100%)` }}>
                <RobotGlyph size={30} color="#fff" />
              </div>
              <div style={S.cardTitleBlock}>
                <strong style={S.cardTitle}>{selectedBot.name}</strong>
                <span style={S.cardSub}>{selectedBot.code}</span>
              </div>
            </div>
            <p style={S.detailCopy}>{selectedBot.description}</p>
            <div style={S.reviewRows}>
              <span>Exchange <strong>{DEX_CONFIG[selectedExchangeId]?.label || getExchangeName(selectedInstanceId)}</strong></span>
              <span>Market <strong>{configuredInstances.find(i => i.id === selectedInstanceId)?.symbols?.join(', ') || ''}</strong></span>
              <span>Trade Size <strong>{money(tradeSize)}</strong></span>
              <span>Maximum Position <strong>{money(maxPosition)}</strong></span>
              <span>Preset <strong>{PRESETS[preset].label}</strong></span>
              <span>Status <strong>Ready to launch</strong></span>
            </div>
          </div>
          <button
            type="button"
            className="bots-focusable"
            disabled={launching || !selectedInstanceId}
            aria-busy={launching}
            style={{ ...cartoonBtn('#43A047', '#2E7D32'), ...S.nextButton, ...(launching ? S.disabledButton : {}) }}
            onClick={launchBot}
          >
            {launching ? 'Launching…' : 'Launch Bot'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ ...S.panel, ...(isMobile ? S.panelMobile : {}) }}>
      <style>{STYLE}</style>
      <div style={S.header}>
        <div style={S.headerBrand}>
          <RobotButtonMark size={46} />
          <div>
            <div style={S.headerTitle}>Bots</div>
            <div style={S.headerSub}>MM Bot control room</div>
          </div>
        </div>
        <button type="button" style={S.closeButton} onClick={onClose} aria-label="Close Bots panel">
          x
        </button>
      </div>
      <div style={S.body}>
        {view === 'launch' ? renderLaunch() : view === 'history' ? renderHistory() : renderDashboard()}
      </div>
    </div>
  );
}

export default memo(BotsPanel);

const STYLE = `
  .bots-range {
    width: 100%;
    accent-color: #1E88E5;
    cursor: pointer;
  }
  .bots-range::-webkit-slider-thumb {
    box-shadow: 0 2px 0 rgba(0,0,0,0.28);
  }
  .bots-market-select {
    width: 100%;
    min-height: 44px;
    border: 2px solid #BBA882;
    border-radius: 10px;
    background: #FDF8E7;
    color: #5C3A21;
    cursor: pointer;
    font: 900 14px/1.2 "Inter", "Segoe UI", sans-serif;
    padding: 0 10px;
  }
  .bots-focusable:focus-visible,
  .bots-step-page h2:focus-visible {
    outline: 3px solid #1E88E5 !important;
    outline-offset: 3px;
  }
  .bots-inline-setup button,
  .bots-inline-setup input,
  .bots-inline-setup select {
    min-height: 44px;
  }
  .bots-inline-setup button:focus-visible,
  .bots-inline-setup input:focus-visible,
  .bots-inline-setup select:focus-visible {
    outline: 3px solid #1E88E5 !important;
    outline-offset: 2px;
  }
  .bots-spinner {
    animation: botsSpin 0.8s linear infinite;
  }
  @keyframes botsSpin { to { transform: rotate(360deg); } }
  @media (max-width: 560px) {
    .bots-market-select { font-size: 13px; }
    .bots-inline-form-grid {
      grid-template-columns: 1fr !important;
    }
    .bots-inline-row,
    .bots-inline-actions {
      display: grid !important;
      grid-template-columns: 1fr !important;
      width: 100%;
    }
    .bots-inline-row > *,
    .bots-inline-actions > * {
      width: 100% !important;
      box-sizing: border-box;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bots-step-page,
    .bots-expand-panel,
    .bots-spinner {
      animation: none !important;
      transition: none !important;
    }
  }
`;

const S = {
  panel: {
    position: 'fixed',
    top: 'clamp(12px, 1.25vw, 24px)',
    right: 'clamp(12px, 1.25vw, 24px)',
    bottom: 118,
    width: 'min(760px, calc(100vw - 32px))',
    background: '#e8dfc8',
    border: '6px solid #d4c8b0',
    borderRadius: 24,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'auto',
    overflow: 'hidden',
    zIndex: 101,
    boxShadow: '0 14px 36px rgba(0,0,0,0.45)',
    fontFamily: '"Inter","Segoe UI",sans-serif',
    boxSizing: 'border-box',
  },
  panelMobile: {
    inset: 0,
    width: '100%',
    bottom: 0,
    borderRadius: 0,
    borderWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: '#d4c8b0',
    borderBottom: '4px solid #bba882',
    flexShrink: 0,
  },
  headerBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  buttonMark: {
    position: 'relative',
    flexShrink: 0,
  },
  buttonMarkBg: {
    position: 'absolute',
    inset: 0,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.34))',
  },
  buttonMarkIcon: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 2,
    filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: '#5C3A21',
    lineHeight: 1,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: 800,
    color: '#77573d',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#E53935',
    border: '3px solid #fff',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    fontSize: 16,
    fontWeight: 900,
    boxShadow: '0 3px 5px rgba(0,0,0,0.3)',
    lineHeight: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    overflowY: 'auto',
    overflowX: 'hidden',
    background: '#fdf8e7',
  },
  notice: {
    border: '2px solid #43A047',
    borderRadius: 10,
    background: 'rgba(67,160,71,0.14)',
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: 800,
    padding: '8px 10px',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    cursor: 'pointer',
  },
  noticeClose: {
    fontWeight: 900,
    opacity: 0.7,
  },
  noticeError: {
    borderColor: '#D98B8B',
    background: '#FBE2E2',
    color: '#9F2D2D',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 8,
  },
  summaryCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '9px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  summaryValue: {
    color: '#5C3A21',
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1,
  },
  dashboardLoading: {
    flex: 1,
    minHeight: 250,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    color: '#77573D',
    textAlign: 'center',
  },
  loadingSpinner: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: '4px solid #D4C8B0',
    borderTopColor: '#43A047',
    marginBottom: 5,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  segment: {
    display: 'flex',
    gap: 4,
    padding: 4,
    background: '#e8dfc8',
    border: '2px solid #d4c8b0',
    borderRadius: 12,
  },
  segmentButton: {
    border: '2px solid transparent',
    background: 'transparent',
    color: '#77573d',
    fontSize: 12,
    fontWeight: 900,
    borderRadius: 8,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  segmentActive: {
    background: '#fdf8e7',
    borderColor: '#bba882',
    color: '#5C3A21',
    boxShadow: '0 2px 0 #bba882',
  },
  launchButton: {
    minHeight: 38,
    padding: '8px 12px',
    borderRadius: 12,
    fontSize: 13,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  botGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 10,
    alignItems: 'start',
  },
  myBotsTitle: {
    margin: '12px 0 8px',
    color: '#5C3A21',
    fontSize: 17,
    fontWeight: 900,
  },
  emptyLaunchState: {
    flex: 1,
    minHeight: 250,
    padding: '32px 18px',
    border: '2px dashed #C9B896',
    borderRadius: 16,
    background: 'linear-gradient(180deg, rgba(232,223,200,0.42), rgba(253,248,231,0.75))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  emptyLaunchIcon: {
    width: 68,
    height: 68,
    borderRadius: 18,
    background: '#E8DFC8',
    border: '3px solid #D4C8B0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyLaunchTitle: {
    margin: 0,
    color: '#5C3A21',
    fontSize: 20,
    fontWeight: 900,
  },
  emptyLaunchCopy: {
    maxWidth: 380,
    margin: '7px 0 18px',
    color: '#77573D',
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.45,
  },
  emptyLaunchButton: {
    minHeight: 44,
    padding: '10px 18px',
    borderRadius: 13,
    fontSize: 14,
  },
  botCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    minWidth: 0,
  },
  botCardExpanded: {
    gridColumn: '1 / -1',
    background: 'linear-gradient(180deg, #e8dfc8 0%, #f3ebd1 100%)',
  },
  collapsedRuntime: {
    marginTop: 6,
    fontSize: 12,
    color: '#5C3A21',
    opacity: 0.85,
  },
  collapsedActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: 2,
  },
  templateHint: {
    margin: '0 0 8px',
    padding: '8px 10px',
    fontSize: 12,
    lineHeight: 1.45,
    color: '#5C3A21',
    background: 'rgba(255,255,255,0.35)',
    border: '1px solid #d4c8b0',
    borderRadius: 8,
  },
  blockedHint: {
    margin: '0 0 8px',
    fontSize: 12,
    color: '#8b4513',
    fontWeight: 700,
  },
  blockedCard: {
    opacity: 0.72,
  },
  cardMainButton: {
    border: 0,
    background: 'transparent',
    padding: 0,
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: 'inherit',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    minWidth: 0,
  },
  botAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    border: '3px solid rgba(92,58,33,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 0 rgba(0,0,0,0.22)',
    flexShrink: 0,
  },
  cardTitleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
    flex: 1,
  },
  cardTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: '#5C3A21',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardSub: {
    fontSize: 11,
    fontWeight: 800,
    color: '#8b7655',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusPill: {
    borderRadius: 999,
    padding: '3px 7px',
    fontSize: 10,
    fontWeight: 900,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  statusRunning: {
    background: 'rgba(67,160,71,0.16)',
    color: '#2E7D32',
    border: '1px solid rgba(67,160,71,0.45)',
  },
  statusPaused: {
    background: 'rgba(232,184,48,0.22)',
    color: '#8B6500',
    border: '1px solid rgba(232,184,48,0.65)',
  },
  statusStopped: {
    background: 'rgba(120,144,156,0.14)',
    color: '#455A64',
    border: '1px solid rgba(120,144,156,0.38)',
  },
  statusTemplate: {
    background: 'rgba(120,144,156,0.18)',
    color: '#455A64',
    border: '1px solid rgba(120,144,156,0.45)',
  },
  sectionTitle: {
    margin: '14px 0 8px',
    fontSize: 13,
    fontWeight: 800,
    color: '#5C3A21',
    letterSpacing: '0.02em',
  },
  expandIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: '#fdf8e7',
    border: '2px solid #d4c8b0',
    color: '#5C3A21',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 900,
    flexShrink: 0,
  },
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 7,
    marginTop: 9,
  },
  metric: {
    background: '#fdf8e7',
    border: '2px solid #d4c8b0',
    borderRadius: 10,
    padding: '7px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: 900,
    color: '#a3906a',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: 900,
    color: '#5C3A21',
    lineHeight: 1.1,
  },
  expandPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 5,
    animation: 'slideDown 0.2s ease-out',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: 8,
  },
  detailCard: {
    background: '#fdf8e7',
    border: '2px solid #d4c8b0',
    borderRadius: 10,
    padding: 10,
    minWidth: 0,
  },
  detailTitle: {
    display: 'block',
    color: '#5C3A21',
    fontSize: 14,
    fontWeight: 900,
    marginTop: 3,
  },
  detailCopy: {
    color: '#77573d',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.35,
    margin: '6px 0 0',
  },
  detailRows: {
    display: 'grid',
    gap: 5,
    marginTop: 5,
    color: '#77573d',
    fontSize: 12,
    fontWeight: 800,
  },
  lastAction: {
    background: 'rgba(30,136,229,0.1)',
    border: '2px solid rgba(30,136,229,0.25)',
    borderRadius: 10,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    color: '#1565C0',
    fontSize: 12,
    fontWeight: 800,
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  historyRow: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '10px 12px',
    display: 'grid',
    gridTemplateColumns: '52px minmax(0, 1fr) auto',
    gap: 10,
    alignItems: 'center',
  },
  historyTime: {
    color: '#a3906a',
    fontSize: 12,
    fontWeight: 900,
    fontFamily: 'monospace',
  },
  historyMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    color: '#77573d',
    fontSize: 12,
    fontWeight: 700,
    minWidth: 0,
  },
  historyValue: {
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  launchShell: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  launchHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '4px 2px 10px',
    flexShrink: 0,
  },
  stepTrack: {
    flex: 1,
    minWidth: 0,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 4,
  },
  stepTrackItem: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    color: '#A3906A',
  },
  stepTrackItemActive: {
    color: '#5C3A21',
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '2px solid #C9B896',
    background: '#E8DFC8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 900,
    boxSizing: 'border-box',
  },
  stepNumberActive: {
    borderColor: '#43A047',
    background: '#43A047',
    color: '#FFF',
  },
  stepLabel: {
    maxWidth: '100%',
    fontSize: 9,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'transparent',
    border: `2px solid ${colors.border}`,
    color: colors.ink,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
  },
  stepPage: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    overflowY: 'auto',
    overflowX: 'hidden',
    animation: 'fadeIn 0.2s ease-out',
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 900,
    color: '#5C3A21',
    textAlign: 'center',
    margin: '2px 0 3px',
    lineHeight: 1.15,
  },
  stepCopy: {
    fontSize: 13,
    fontWeight: 700,
    color: '#8b7655',
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.35,
  },
  strategyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 9,
  },
  strategyCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 10,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 9,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    minWidth: 0,
    color: '#5C3A21',
  },
  strategyCardActive: {
    borderColor: '#43A047',
    background: '#F4EEDC',
    boxShadow: '0 0 0 3px rgba(67,160,71,0.12), 0 4px 0 #D4C8B0',
  },
  strategyCardDisabled: {
    cursor: 'not-allowed',
    opacity: 0.68,
    filter: 'grayscale(0.8)',
  },
  strategyTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  soonBadge: {
    borderRadius: 999,
    background: '#7A746B',
    color: '#FFF',
    padding: '3px 7px',
    fontSize: 9,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  strategyText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  exchangePickerCard: {
    background: '#E8DFC8',
    border: '3px solid #D4C8B0',
    borderRadius: 14,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  exchangeDropdownRoot: {
    position: 'relative',
  },
  exchangeDropdownTrigger: {
    width: '100%',
    minHeight: 56,
    border: '2px solid #BBA882',
    borderRadius: 12,
    background: '#FDF8E7',
    color: '#5C3A21',
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  exchangeTriggerLogo: {
    width: 32,
    height: 32,
    objectFit: 'contain',
    flexShrink: 0,
  },
  exchangeTriggerText: {
    minWidth: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontSize: 14,
  },
  exchangeChevron: {
    color: '#77573D',
    fontSize: 20,
    fontWeight: 900,
    transition: 'transform 0.16s ease',
  },
  exchangeListbox: {
    position: 'absolute',
    zIndex: 20,
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    maxHeight: 280,
    overflowY: 'auto',
    padding: 6,
    border: '2px solid #BBA882',
    borderRadius: 12,
    background: '#FDF8E7',
    boxShadow: '0 12px 26px rgba(92,58,33,0.24)',
  },
  exchangeOption: {
    minHeight: 48,
    borderRadius: 9,
    padding: '7px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    color: '#5C3A21',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  exchangeOptionActive: {
    background: 'rgba(30,136,229,0.12)',
    boxShadow: 'inset 0 0 0 2px rgba(30,136,229,0.32)',
  },
  exchangeOptionDisabled: {
    opacity: 0.58,
    cursor: 'not-allowed',
  },
  exchangeOptionLogo: {
    width: 30,
    height: 30,
    objectFit: 'contain',
    flexShrink: 0,
  },
  exchangeOptionText: {
    minWidth: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontSize: 12,
  },
  exchangeOptionStatus: {
    flexShrink: 0,
    borderRadius: 999,
    padding: '3px 6px',
    background: '#DDD5C4',
    color: '#6E655A',
    fontSize: 9,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  exchangeOptionStatusReady: {
    background: 'rgba(67,160,71,0.16)',
    color: '#2E7D32',
  },
  exchangeStatus: {
    minHeight: 18,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    color: '#77573D',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  exchangeStatusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  inlineConnectionCard: {
    background: '#F4EEDC',
    border: '2px solid #C9B896',
    borderRadius: 14,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  inlineConnectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '2px 2px 6px',
    borderBottom: '1px solid #D4C8B0',
  },
  connectionPill: {
    flexShrink: 0,
    borderRadius: 999,
    padding: '4px 7px',
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 0.35,
  },
  connectionChecking: {
    background: '#E4DED2',
    color: '#655E54',
  },
  connectionActive: {
    background: 'rgba(67,160,71,0.16)',
    color: '#2E7D32',
  },
  connectionInactive: {
    background: 'rgba(232,184,48,0.22)',
    color: '#795A00',
  },
  connectionReady: {
    background: 'rgba(30,136,229,0.14)',
    color: '#1565C0',
  },
  connectionPartial: {
    background: 'rgba(249,168,37,0.18)',
    color: '#9A4D00',
  },
  connectionMissing: {
    background: '#FBE2E2',
    color: '#9F2D2D',
  },
  inlineSetupBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  inlineSetupSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    padding: '4px 0',
  },
  inlineManualSection: {
    paddingTop: 10,
    borderTop: '1px solid #D4C8B0',
  },
  inlineSetupToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  inlineBusyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 10,
    background: 'rgba(30,136,229,0.1)',
    color: '#1565C0',
    fontSize: 11,
    fontWeight: 800,
  },
  inlineBusySpinner: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '2px solid rgba(30,136,229,0.25)',
    borderTopColor: '#1E88E5',
    flexShrink: 0,
  },
  disabledButton: {
    opacity: 0.58,
    cursor: 'not-allowed',
  },
  marketPickerCard: {
    background: '#E8DFC8',
    border: '3px solid #D4C8B0',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  marketPickerHint: {
    color: '#77573D',
    fontSize: 11,
    fontWeight: 700,
  },
  sliderCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  sliderTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    color: '#5C3A21',
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sliderValue: {
    color: '#5C3A21',
    fontSize: 18,
    fontWeight: 900,
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#a3906a',
    fontSize: 11,
    fontWeight: 800,
    gap: 8,
  },
  presetCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  presetToggle: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 7,
  },
  presetButton: {
    border: '2px solid #bba882',
    background: '#d4c8b0',
    borderRadius: 10,
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 900,
    padding: '9px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  presetActive: {
    background: '#fdf8e7',
    borderColor: '#1E88E5',
    color: '#1565C0',
    boxShadow: '0 2px 0 #bba882',
  },
  reviewCard: {
    background: 'linear-gradient(180deg, #e8dfc8 0%, #f3ebd1 100%)',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  reviewRows: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 8,
    color: '#77573d',
    fontSize: 12,
    fontWeight: 800,
  },
  nextButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    fontSize: 16,
    marginTop: 'auto',
  },
  actionsRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  accountsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 10,
  },
  gameAuthCard: {
    background: '#efe6cf',
    border: '3px solid #c9b896',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxSizing: 'border-box',
  },
  gameAuthHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    flexWrap: 'wrap',
  },
  gameAuthActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  gameAuthList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  gameAuthRow: {
    background: '#f8f1df',
    border: '2px solid #d9cdb4',
    borderRadius: 10,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  gameAuthRowMain: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  gameAuthRowHint: {
    fontSize: 11,
    fontWeight: 700,
    color: '#8b7655',
    lineHeight: 1.35,
  },
  gameAuthRowActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  gameAuthStatusPill: {
    fontSize: 10,
    fontWeight: 900,
    padding: '3px 8px',
    borderRadius: 999,
    border: '2px solid #fff',
    letterSpacing: 0.4,
  },
  gameAuthStatusReady: {
    background: '#1E88E5',
    color: '#fff',
  },
  gameAuthStatusSynced: {
    background: '#43A047',
    color: '#fff',
  },
  gameAuthStatusMissing: {
    background: '#B0BEC5',
    color: '#37474F',
  },
  gameAuthStatusPartial: {
    background: '#FB8C00',
    color: '#fff',
  },
  grvtOneTapRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  credentialInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 10px',
    borderRadius: 8,
    border: '2px solid #d4c8b0',
    fontSize: 12,
    fontFamily: 'monospace',
    background: '#fffaf0',
    color: '#5C3A21',
    lineHeight: 1.35,
    minHeight: 0,
  },
  credentialInputInRow: {
    flex: '1 1 180px',
    minWidth: 0,
    width: 'auto',
  },
  accountFormCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  },
  accountsListCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  },
  sectionDesc: {
    fontSize: 12,
    fontWeight: 700,
    color: '#8b7655',
    margin: '3px 0 10px 0',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 8,
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  formSelect: {
    border: '2px solid #bba882',
    background: '#fdf8e7',
    borderRadius: 10,
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 800,
    padding: '8px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    outline: 'none',
  },
  formInput: {
    border: '2px solid #bba882',
    background: '#fdf8e7',
    borderRadius: 10,
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 800,
    padding: '8px 10px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  },
  syncedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  accountRow: {
    background: '#fdf8e7',
    border: '2px solid #d4c8b0',
    borderRadius: 10,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  accountRowActive: {
    background: '#fdf8e7',
    border: '2px solid #43A047',
    borderRadius: 10,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  accountAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: '2px solid rgba(92,58,33,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e8dfc8',
  },
  accountDetails: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  accountStatus: {
    display: 'flex',
    alignItems: 'center',
  },
  emptyState: {
    fontSize: 12,
    fontWeight: 800,
    color: '#8b7655',
    textAlign: 'center',
    padding: '20px 0',
  },
};
