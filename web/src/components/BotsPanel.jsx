import { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useLayout } from '../hooks/useIsMobile';
import { cartoonBtn } from '../styles/theme';
import { colors, shared } from './basic/styles';
import { usePlayer } from '../hooks/useGodot';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useWallet } from '@solana/wallet-adapter-react';
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
  supportsGameWalletSync,
  syncGameAccountToPhantom,
  UNSUPPORTED_GAME_WALLET_EXCHANGES,
} from '../lib/botGameCredentials';
import { botApiUrl, botAuthHeaders, botWsUrl } from '../lib/botApiClient';
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

const STEPS = ['strategy', 'risk', 'review'];

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
  return BOT_TYPES.find((bot) => bot.id === type) || BOT_TYPES[0];
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

function accountActiveForExchange(accounts, exchange) {
  const needle = String(exchange).toLowerCase();
  return accounts.some(
    (acc) => acc.exchange?.toLowerCase() === needle && acc.status === 'active',
  );
}

function canStartBot(bot, syncedAccounts) {
  const parsed = parseStrategyInstanceId(bot.id);
  if (parsed.exchanges.length === 0) return false;
  if (parsed.kind === 'delta_neutral') {
    return parsed.exchanges.every((ex) => accountActiveForExchange(syncedAccounts, ex));
  }
  return parsed.exchanges.some((ex) => accountActiveForExchange(syncedAccounts, ex));
}

function missingExchangesForBot(bot, syncedAccounts) {
  const parsed = parseStrategyInstanceId(bot.id);
  if (parsed.kind === 'delta_neutral') {
    return parsed.exchanges.filter((ex) => !accountActiveForExchange(syncedAccounts, ex));
  }
  if (parsed.exchanges.some((ex) => accountActiveForExchange(syncedAccounts, ex))) {
    return [];
  }
  return parsed.exchanges;
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

const mapHandleToBot = (handle, runningList, runtime = {}, activeOrdersGlobal = 0, overrides = {}) => {
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
  const isRunning = runningList.some(r => r.id === handle.id);
  const rt = runtime[handle.id] || {};
  const cycles = Number(rt.cycles) || 0;
  const openQuotes = Number(rt.open_quotes) || 0;
  const market = (Array.isArray(handle.symbols) ? handle.symbols : [])
    .map((s) => String(s).toUpperCase())
    .join(', ');
  const exchange = getExchangeName(handle.id);
  return {
    id: handle.id,
    type: handle.kind,
    market: market,
    exchange: exchange,
    status: isRunning ? 'Running' : 'Template',
    tradeSize: Number.isFinite(tradeSize) ? tradeSize : details.tradeSize,
    maxPosition: Number.isFinite(maxPosition) ? maxPosition : details.maxPosition,
    preset,
    spreadBps,
    pnl: 0,
    inventory: '0.00',
    spread,
    fills: 0,
    cycles,
    openQuotes,
    uptime: isRunning ? (cycles > 0 ? `${cycles} cycles` : 'Starting…') : 'Not started',
    lastAction: isRunning
      ? (openQuotes > 0
        ? `${openQuotes} quote(s) on exchange · cycle ${cycles}`
          : cycles > 0
          ? (String(exchange).toUpperCase().includes('GRVT')
            ? `Bot runs but GRVT has 0 quotes — min ~$130/order on GRVT; need ~$15–30 free margin, builder auth, leverage`
            : `Bot runs but ${exchange} has 0 quotes — check free margin, min notional, leverage`)
          : 'Worker spawned, waiting for first cycle')
      : 'Press ▶ Start — only works if exchange account is ACTIVE',
    isTemplate: !isRunning,
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
    <div style={shared.stepDots}>
      {STEPS.map((step, i) => (
        <div
          key={step}
          style={{
            ...shared.dot,
            ...(i === index ? shared.dotActive : {}),
            ...(i < index ? shared.dotDone : {}),
          }}
        />
      ))}
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
  const pnlPositive = Number(bot.pnl) >= 0;
  const isRunning = bot.status === 'Running';
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
              <span style={{
                ...S.statusPill,
                ...(bot.status === 'Running' ? S.statusRunning : bot.status === 'Template' ? S.statusTemplate : S.statusPaused),
              }}>
                {bot.status}
              </span>
            </div>
            <span style={S.cardSub}>{bot.market} on <strong>{bot.exchange}</strong> / {type.code}</span>
          </div>
          <span style={S.expandIcon}>{expanded ? '−' : '+'}</span>
        </div>
        <div style={S.metricGrid}>
          <div style={S.metric}>
            <span style={S.metricLabel}>Real PnL</span>
            <strong style={{ ...S.metricValue, color: pnlPositive ? colors.long : colors.short }}>
              {signedMoney(bot.pnl)}
            </strong>
          </div>
          <div style={S.metric}>
            <span style={S.metricLabel}>Trade Size</span>
            <strong style={S.metricValue}>{money(bot.tradeSize)}</strong>
          </div>
          <div style={S.metric}>
            <span style={S.metricLabel}>Max Position</span>
            <strong style={S.metricValue}>{money(bot.maxPosition)}</strong>
          </div>
        </div>
        {!expanded && isRunning && (
          <div style={S.collapsedRuntime}>
            Cycles <strong>{bot.cycles ?? 0}</strong>
            {' · '}
            Open quotes <strong>{bot.openQuotes ?? 0}</strong>
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
        <div style={S.expandPanel}>
          <div style={S.detailGrid}>
            <div style={S.detailCard}>
              <span style={S.metricLabel}>Strategy intent</span>
              <strong style={S.detailTitle}>{type.tagline}</strong>
              <p style={S.detailCopy}>{type.description}</p>
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
            {bot.status === 'Running' ? (
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
  const [step, setStep] = useState('strategy');
  const [bots, setBots] = useState([]);
  const [history, setHistory] = useState(DEFAULT_HISTORY);
  const [orderHistory, setOrderHistory] = useState([]);
  const [expandedBotId, setExpandedBotId] = useState(null);
  const userCollapsedRef = useRef(false);
  const [selectedType, setSelectedType] = useState('delta_neutral');
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
  const [configuredCount, setConfiguredCount] = useState(0);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');

  const [syncedAccounts, setSyncedAccounts] = useState([]);
  const [availableExchanges, setAvailableExchanges] = useState([
    { id: 'hyperliquid', name: 'Hyperliquid' },
    { id: 'hotstuff', name: 'Hotstuff' },
    { id: 'grvt', name: 'GRVT' },
    { id: 'nado', name: 'Nado' },
    { id: 'pacifica', name: 'Pacifica' },
    { id: 'flash', name: 'Flash Trade' },
    { id: 'katana', name: 'Katana' },
    { id: 'hibachi', name: 'Hibachi' },
    { id: 'avantis', name: 'Avantis' },
    { id: 'decibel', name: 'Decibel' },
    { id: 'mock', name: 'Mock' },
  ]);
  const [newAccExchange, setNewAccExchange] = useState('hyperliquid');
  const [newAccLabel, setNewAccLabel] = useState('My Live Account');
  const [newAccSubId, setNewAccSubId] = useState('0');
  const [newAccPrivateKey, setNewAccPrivateKey] = useState('');
  const [keyTransMethod, setKeyTransMethod] = useState('encrypt');
  const [hlBalanceUsd, setHlBalanceUsd] = useState(null);
  const [grvtBalanceUsd, setGrvtBalanceUsd] = useState(null);
  const [overridesById, setOverridesById] = useState({});
  const [gameAuthRows, setGameAuthRows] = useState([]);
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

  const instancesForSelectedType = useMemo(
    () => configuredInstances.filter((inst) => inst.kind === selectedType),
    [configuredInstances, selectedType],
  );

  const filteredInstances = useMemo(() => {
    return instancesForSelectedType.filter((inst) => {
      const parsed = parseStrategyInstanceId(inst.id);
      if (parsed.exchanges.length === 0) return false;
      if (inst.kind === 'delta_neutral') {
        return parsed.exchanges.every((ex) => accountActiveForExchange(syncedAccounts, ex));
      }
      return parsed.exchanges.some((ex) => accountActiveForExchange(syncedAccounts, ex));
    });
  }, [instancesForSelectedType, syncedAccounts]);

  useEffect(() => {
    if (instancesForSelectedType.length > 0) {
      const preferred = filteredInstances.find((inst) => inst.id === selectedInstanceId)
        || filteredInstances[0]
        || instancesForSelectedType[0];
      if (preferred && preferred.id !== selectedInstanceId) {
        setSelectedInstanceId(preferred.id);
      }
    } else {
      setSelectedInstanceId('');
    }
  }, [selectedType, filteredInstances, instancesForSelectedType, selectedInstanceId]);

  const selectedBot = useMemo(() => getBotType(selectedType), [selectedType]);
  const activeCount = runningInstances.length || bots.filter((bot) => bot.status === 'Running').length;
  const mockPnl = totalPnl !== 0 ? totalPnl : bots.reduce((sum, bot) => sum + Number(bot.pnl || 0), 0);
  const totalFills = bots.reduce((sum, bot) => sum + Number(bot.fills || 0), 0);
  const runningBots = bots.filter((b) => b.status === 'Running');
  const templateBots = bots.filter((b) => b.status === 'Template');
  const startableTemplates = templateBots.filter((b) => canStartBot(b, syncedAccounts));
  const blockedTemplates = templateBots.filter((b) => !canStartBot(b, syncedAccounts));

  const resetLaunch = useCallback(() => {
    setStep('strategy');
    setSelectedType('delta_neutral');
    setTradeSize(20);
    setMaxPosition(200);
    setPreset('calm');
    setSelectedInstanceId('');
  }, []);

  const openLaunch = useCallback(() => {
    setNotice('');
    resetLaunch();
    setView('launch');
  }, [resetLaunch]);

  const fetchExchanges = useCallback(() => {
    if (!token) return;
    fetch(botApiUrl('/api/v1/exchanges'), { headers: botAuthHeaders(token) })
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
          setAvailableExchanges(
            res.data.map((ex) => ({ id: ex.id, name: ex.name || ex.id })),
          );
        }
      })
      .catch((err) => console.error('fetch exchanges failed:', err));
  }, [token]);

  const fetchAccounts = useCallback(() => {
    if (!token) return;
    fetch(botApiUrl('/api/v1/accounts'), {
      headers: botAuthHeaders(token)
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, status: r.status, body })))
      .then((res) => {
        if (!res.ok || res.body?.success === false) {
          const msg = res.body?.error?.message || res.body?.error?.code || `HTTP ${res.status}`;
          console.error('fetch accounts failed:', msg);
          return;
        }
        const rows = Array.isArray(res.body?.data) ? res.body.data : [];
        setSyncedAccounts(rows);
        const hasHl = rows.some((acc) => acc.exchange?.toLowerCase() === 'hyperliquid' && acc.status === 'active');
        if (hasHl) {
          fetch(botApiUrl('/api/v1/exchanges/hyperliquid/balance'), { headers: botAuthHeaders(token) })
            .then((br) => br.json())
            .then((bal) => {
              if (bal?.success === false) {
                console.error('HL balance:', bal?.error?.message || bal?.error?.code);
                setHlBalanceUsd(null);
                return;
              }
              const available = parseDecimalField(
                bal?.data?.available_margin_usd ?? bal?.data?.equity_usd,
              );
              setHlBalanceUsd(available);
            })
            .catch(() => setHlBalanceUsd(null));
        } else {
          setHlBalanceUsd(null);
        }
        const hasGrvt = rows.some((acc) => acc.exchange?.toLowerCase() === 'grvt' && acc.status === 'active');
        if (hasGrvt) {
          fetch(botApiUrl('/api/v1/exchanges/grvt/balance'), { headers: botAuthHeaders(token) })
            .then((br) => br.json())
            .then((bal) => {
              if (bal?.success === false) {
                console.error('GRVT balance:', bal?.error?.message || bal?.error?.code);
                setGrvtBalanceUsd(null);
                return;
              }
              const available = parseDecimalField(
                bal?.data?.available_margin_usd ?? bal?.data?.equity_usd,
              );
              setGrvtBalanceUsd(available);
            })
            .catch(() => setGrvtBalanceUsd(null));
        } else {
          setGrvtBalanceUsd(null);
        }
      })
      .catch((err) => console.error('fetch accounts failed:', err));
  }, [token]);

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
    if (!playerForBots) {
      setGameAuthRows([]);
      return;
    }
    try {
      const rows = await scanGameCredentialStatuses(playerForBots, syncedAccounts, gameSyncWalletCtx);
      setGameAuthRows(rows);
    } catch (err) {
      console.error('game auth scan failed:', err);
    }
  }, [playerForBots, syncedAccounts, gameSyncWalletCtx]);

  useEffect(() => {
    if (view !== 'accounts') return;
    refreshGameAuthScan();
  }, [view, refreshGameAuthScan, playerDexAccounts]);

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

  const syncAllReadyGameAccounts = useCallback(async () => {
    if (!token || gameAuthBusy) return;
    const ready = gameAuthRows.filter((row) => row.ready && !row.synced);
    const partial = gameAuthRows.filter((row) => row.partial && !row.synced);
    if (ready.length === 0) {
      if (partial.length > 0) {
        const names = partial.map((row) => row.label).join(', ');
        setNotice(
          `Partial setup (${names}): add credentials manually in the exchange row (Save + Sync).`,
        );
      } else {
        const missing = gameAuthRows.filter((row) => !row.synced && !row.ready && !row.partial);
        if (missing.length > 0) {
          const names = missing.map((row) => row.label).join(', ');
          setNotice(
            `No browser credentials for: ${names}. Paste credentials manually in the exchange row or complete setup in Futures again.`,
          );
        } else {
        const hasSynced = gameAuthRows.some((row) => row.synced);
        const hasReadyUnsynced = gameAuthRows.some((row) => row.ready && !row.synced);
        setNotice(
          hasSynced && !hasReadyUnsynced
            ? 'All ready exchanges are already synced to Phantom.'
            : 'No new ready exchanges to sync — paste keys manually or complete setup in Futures.',
        );
        }
      }
      return;
    }
    setGameAuthBusy(true);
    let ok = 0;
    const failed = [];
    for (const row of ready) {
      const result = await setupAndSyncGameAccount({
        token,
        exchangeId: row.exchange,
        player: playerForBots,
        encryptSecret,
        keyTransMethod,
        probeBalance: false,
        ...gameSetupSyncOpts,
      });
      if (result.ok) ok += 1;
      else failed.push(`${row.label}: ${result.error}`);
    }
    await fetchAccounts();
    await refreshGameAuthScan();
    setGameAuthBusy(false);
    if (failed.length === 0) {
      setNotice(`Synced ${ok} exchange(s) from the game.`);
    } else {
      setNotice(`Sync: ${ok} ok, ${failed.length} fail. ${failed[0]}`);
    }
  }, [token, gameAuthBusy, gameAuthRows, playerForBots, keyTransMethod, gameSetupSyncOpts, fetchAccounts, refreshGameAuthScan]);

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

  const fetchInstances = useCallback(() => {
    if (!token) return;
    fetch(botApiUrl('/api/v1/strategies/instances'), {
      headers: botAuthHeaders(token)
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res?.success || !res.data) {
          setNotice(formatApiError(res?.error, 'Could not load bot strategies. Check the configured bot API is reachable.'));
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
        setConfiguredCount(Number(res.data.configured_count) || configured.length);
        const allHandles = [...configured];
        running.forEach((r) => {
          if (!allHandles.some((h) => h.id === r.id)) {
            allHandles.push(r);
          }
        });
        const mappedBots = allHandles.map((h) => mapHandleToBot(h, running, runtime, activeOrders, overrides));
        setBots(mappedBots);
        setExpandedBotId((current) => {
          if (current && mappedBots.some((b) => b.id === current)) {
            return current;
          }
          if (userCollapsedRef.current) {
            return null;
          }
          const firstRunning = mappedBots.find((b) => b.status === 'Running');
          if (firstRunning) return firstRunning.id;
          if (mappedBots.length > 0) return mappedBots[0].id;
          return null;
        });
      })
      .catch((err) => {
        console.error('fetch instances failed:', err);
        setNotice('Cannot reach bot API — check the configured bot endpoint is reachable.');
      });
  }, [token]);

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
      setNotice(`Connect an active ${missing.map((e) => e.toUpperCase()).join(' + ')} account in Accounts first.`);
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
    if (!token || !selectedInstanceId) {
      setNotice('Please select a strategy and exchange instance first.');
      return;
    }
    const parsed = parseStrategyInstanceId(selectedInstanceId);
    const missing = parsed.exchanges.filter((ex) => !accountActiveForExchange(syncedAccounts, ex));
    if (missing.length > 0) {
      setNotice(`Connect ${missing.map((e) => e.toUpperCase()).join(' + ')} in Accounts before launch.`);
      return;
    }
    if (parsed.exchanges.some((ex) => ex.toLowerCase() === 'grvt')) {
      const auth = await authorizeGrvtBuilder({ silent: true });
      if (!auth.ok) {
        setNotice(`Authorize Builder required before Launch on GRVT: ${auth.error}`);
        return;
      }
    }
    const spreadBps = preset === 'aggressive' ? 4 : 8;

    fetch(botApiUrl(`/api/v1/strategies/${encodeURIComponent(selectedInstanceId)}/config`), {
      method: 'PUT',
      headers: botAuthHeaders(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        order_size_usd: String(tradeSize),
        position_size_usd: String(maxPosition),
        spread_bps: spreadBps,
        min_funding_diff_bps: spreadBps,
      })
    })
      .then((r) => r.json())
      .then((cfgRes) => {
        if (!cfgRes?.success) {
          throw new Error(formatApiError(cfgRes?.error, 'config save failed'));
        }
        return fetch(botApiUrl(`/api/v1/strategies/${encodeURIComponent(selectedInstanceId)}/start`), {
          method: 'POST',
          headers: botAuthHeaders(token)
        }).then((r) => r.json()).then((startRes) => ({ cfgRes, startRes }));
      })
      .then(({ cfgRes, startRes: res }) => {
        if (res?.data?.status === 'started') {
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
        } else {
          setNotice(`Launch failed: ${formatApiError(res?.error)}`);
        }
      })
      .catch((err) => {
        console.error('launch failed:', err);
        setNotice('Network error launching strategy');
      });
  }, [selectedInstanceId, token, tradeSize, maxPosition, preset, selectedType, fetchInstances, fetchOrderHistory, resetLaunch, syncedAccounts, appendHistory, authorizeGrvtBuilder]);

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
    fetchExchanges();
    fetchOrderHistory();

    // Fallback polling every 5 s — keeps UI in sync even when WS is down
    const pollInterval = setInterval(() => {
      fetchInstances();
      fetchAccounts();
      fetchOrderHistory();
    }, 5000);

    const wsParams = new URLSearchParams({
      token,
      authorization: `Bearer ${token}`,
    });
    const wsUrl = `${botWsUrl('/api/v1/bot/ws')}?${wsParams.toString()}`;
    let ws;
    let reconnectTimer;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        console.warn('[bot-ws] connect failed:', err);
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWs, 3000);
        return;
      }

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({
          action: 'subscribe',
          channels: ['strategies', 'orders', 'positions', 'pnl', 'volume_stats', 'alerts']
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'strategy_event') {
            fetchInstances();
            const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            setHistory((prev) => [
              {
                id: `h-${Date.now()}`,
                time,
                bot: msg.data.strategy_id?.split(':')[0].replace('_', ' ').toUpperCase() || 'BOT',
                event: msg.data.type || 'Lifecycle event',
                value: msg.data.reason || 'state change'
              },
              ...prev.slice(0, 49)
            ]);
          } else if (msg.type === 'pnl_snapshot') {
            setTotalPnl(Number(msg.data.net_pnl_usd) || 0);
          } else if (msg.type === 'volume_stats') {
            setFillsCount(Number(msg.data.total_volume_usd_24h) || 0);
          } else if (msg.type === 'position_update') {
            const pos = msg.data;
            setBots((currentBots) => currentBots.map((b) => {
              if (matchPositionToBot(b.id, pos.exchange, pos.symbol)) {
                return {
                  ...b,
                  inventory: `${pos.size >= 0 ? '+' : ''}${Number(pos.size).toFixed(3)}`,
                  pnl: Number(pos.unrealized_pnl) || 0,
                  lastAction: `Position updated: size=${pos.size}`
                };
              }
              return b;
            }));
          } else if (msg.type === 'order_update') {
            const ord = msg.data;
            const status = String(ord.status || 'update');
            const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            const sideLabel = String(ord.side || '').toUpperCase();
            if (status === 'Filled' || status === 'PartiallyFilled') {
              setBots((currentBots) => currentBots.map((b) => {
                const parsed = parseStrategyInstanceId(b.id);
                const matches = parsed.exchanges.includes(String(ord.exchange).toLowerCase())
                  && parsed.symbols.includes(String(ord.symbol).toLowerCase());
                if (matches) {
                  return {
                    ...b,
                    fills: b.fills + 1,
                    lastAction: `Order filled: ${ord.filled_size} @ ${ord.avg_fill_price || 'mkt'}`
                  };
                }
                return b;
              }));

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
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      clearInterval(pollInterval);
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [token, fetchInstances, fetchAccounts, fetchExchanges, fetchOrderHistory]);

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
      <p style={S.templateHint}>
        These are not 5 separate bots — they are <strong>5 templates</strong> from <code>strategies.toml</code>.
        Launch/Start <strong>does not add a new row</strong> — it only runs one template for your wallet.
        After Launch the card shows <strong>your</strong> trade size and spread (saved in Phantom).
        Templates cannot be removed from the UI. A new bot type requires a server config change.
        {hlBalanceUsd != null && (
          <> Hyperliquid: <strong>${hlBalanceUsd.toFixed(2)}</strong>.</>
        )}
        {grvtBalanceUsd != null && (
          <> GRVT free margin: <strong>${grvtBalanceUsd.toFixed(2)}</strong> (what the bot uses for quotes).</>
        )}
        {(hlBalanceUsd != null || grvtBalanceUsd != null) && (
          <> GRVT MM needs ~$130 min notional per order (leverage auto-raised). $10–15 accounts are tight — deposit $30+ for reliable quotes.</>
        )}
      </p>
      <div style={S.summaryGrid}>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Running</span>
          <strong style={S.summaryValue}>{activeCount}</strong>
        </div>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Templates</span>
          <strong style={S.summaryValue}>{configuredCount || configuredInstances.length}</strong>
        </div>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Open Quotes</span>
          <strong style={S.summaryValue}>{globalActiveOrders}</strong>
        </div>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Real PnL</span>
          <strong style={{ ...S.summaryValue, color: mockPnl >= 0 ? colors.long : colors.short }}>
            {signedMoney(mockPnl)}
          </strong>
        </div>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Fills Today</span>
          <strong style={S.summaryValue}>{totalFills}</strong>
        </div>
        <div style={{ ...S.summaryCard, borderColor: wsConnected ? '#43A047' : '#E53935' }}>
          <span style={S.metricLabel}>Live Feed</span>
          <strong style={{ ...S.summaryValue, fontSize: 12, color: wsConnected ? '#43A047' : '#E53935' }}>
            {wsConnected ? '● Connected' : '○ Polling (WS offline)'}
          </strong>
        </div>
      </div>

      <p style={{
        margin: '0 0 10px',
        fontSize: 12,
        fontWeight: 700,
        color: '#6b5340',
        lineHeight: 1.45,
      }}>
        Configured = fixed templates from <code style={{ fontSize: 11 }}>strategies.toml</code> (always 5 for your wallet).
        Launch/Start activates one template — it does not add a new row. Running bots show live cycle counts from Phantom backend.
        {globalActiveOrders > 0 ? ` Phantom tracks ${globalActiveOrders} open order(s) right now.` : ' No open orders tracked yet.'}
      </p>

      <div style={S.toolbar}>
        <div style={S.segment}>
          <button
            type="button"
            style={{ ...S.segmentButton, ...(view === 'dashboard' ? S.segmentActive : {}) }}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            style={{ ...S.segmentButton, ...(view === 'accounts' ? S.segmentActive : {}) }}
            onClick={() => setView('accounts')}
          >
            Accounts
          </button>
          <button
            type="button"
            style={{ ...S.segmentButton, ...(view === 'history' ? S.segmentActive : {}) }}
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

      {runningBots.length > 0 && (
        <>
          <h3 style={S.sectionTitle}>Running now ({runningBots.length})</h3>
          <div style={S.botGrid}>
            {runningBots.map((bot) => (
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
        </>
      )}

      {startableTemplates.length > 0 && (
        <>
          <h3 style={S.sectionTitle}>Ready to start now ({startableTemplates.length})</h3>
          <div style={S.botGrid}>
            {startableTemplates.map((bot) => (
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
        </>
      )}

      {blockedTemplates.length > 0 && (
        <>
          <h3 style={S.sectionTitle}>Needs another account ({blockedTemplates.length})</h3>
          <p style={S.blockedHint}>These templates will not start until you connect the matching exchange in Accounts.</p>
          <div style={S.botGrid}>
            {blockedTemplates.map((bot) => (
              <div key={bot.id} style={S.blockedCard}>
                <BotCard
                  bot={{
                    ...bot,
                    lastAction: `Needs: ${missingExchangesForBot(bot, syncedAccounts).map((e) => e.toUpperCase()).join(' + ') || 'account'}`,
                  }}
                  expanded={false}
                  onToggle={() => setView('accounts')}
                  onStart={() => setView('accounts')}
                  onStop={() => {}}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {startableTemplates.length === 0 && blockedTemplates.length === 0 && templateBots.length > 0 && (
        <>
          <h3 style={S.sectionTitle}>Available templates ({templateBots.length})</h3>
          <div style={S.botGrid}>
            {templateBots.map((bot) => (
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
        </>
      )}

      {bots.length === 0 && (
        <div style={S.emptyState}>No strategy templates loaded from Phantom API.</div>
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

  const renderAccounts = () => (
    <>
      {notice && (
        <button type="button" style={S.notice} onClick={() => setNotice('')}>
          {notice}
          <span style={S.noticeClose}>x</span>
        </button>
      )}
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
            onClick={() => setView('accounts')}
          >
            Accounts
          </button>
          <button
            type="button"
            style={S.segmentButton}
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

      <div style={S.accountsContainer}>
        <div style={S.gameAuthCard}>
          <div style={S.gameAuthHeader}>
            <div>
              <strong style={S.sectionTitle}>Auto-auth from game (Futures)</strong>
              <p style={S.sectionDesc}>
                One Connect bot button: read credentials from Futures browser storage, or run the same wallet one-tap flow inline → sync to Phantom → (GRVT: builder auth) → balance probe.
              </p>
            </div>
            <div style={S.gameAuthActions}>
              <button
                type="button"
                disabled={gameAuthBusy}
                onClick={refreshGameAuthScan}
                style={{ ...cartoonBtn('#8D6E63', '#6D4C41'), fontSize: 11, padding: '6px 10px' }}
              >
                Scan
              </button>
              <button
                type="button"
                disabled={gameAuthBusy}
                onClick={syncAllReadyGameAccounts}
                style={{ ...cartoonBtn('#1E88E5', '#1565C0'), fontSize: 11, padding: '6px 10px' }}
              >
                Sync all ready
              </button>
            </div>
          </div>
          <p style={{ ...S.sectionDesc, margin: '0 0 10px', fontSize: 11 }}>
            If Sync cannot find keys after Futures setup — paste credentials manually in the exchange row (Save + Sync).
            {' '}Stage C: Phoenix (one-tap from Futures).
            {UNSUPPORTED_GAME_WALLET_EXCHANGES.length > 0 && (
              <> Temporarily disabled in Bots: {UNSUPPORTED_GAME_WALLET_EXCHANGES.map((row) => row.label).join(', ')}.</>
            )}
          </p>
          <div style={S.gameAuthList}>
            {gameAuthRows.length === 0 ? (
              <div style={S.emptyState}>Open Futures in the game, complete exchange setup, then click Scan.</div>
            ) : (
              gameAuthRows.map((row) => {
                const status = row.synced
                  ? 'synced'
                  : row.ready
                    ? 'ready'
                    : row.partial
                      ? 'partial'
                      : 'missing';
                const statusStyle = status === 'synced'
                  ? S.gameAuthStatusSynced
                  : status === 'ready'
                    ? S.gameAuthStatusReady
                    : status === 'partial'
                      ? S.gameAuthStatusPartial
                      : S.gameAuthStatusMissing;
                const statusLabel = status === 'synced'
                  ? 'SYNCED'
                  : status === 'ready'
                    ? 'READY'
                    : status === 'partial'
                      ? 'PARTIAL'
                      : 'MISSING';
                return (
                  <div key={row.exchange} style={S.gameAuthRow}>
                    <div style={S.gameAuthRowMain}>
                      <strong style={{ color: '#5C3A21', fontSize: 13 }}>{row.label}</strong>
                      <span style={{ ...S.gameAuthStatusPill, ...statusStyle }}>{statusLabel}</span>
                    </div>
                    <div style={S.gameAuthRowHint}>
                      {row.synced
                        ? 'Account already in Phantom — you can test balance and Launch.'
                        : row.ready
                          ? (row.hint || 'Credentials found in browser.')
                          : (row.error || 'Complete setup in Futures.')}
                    </div>
                    {row.exchange === 'hotstuff' && !row.synced && !row.ready && (
                      <div style={S.grvtOneTapRow}>
                        <input
                          type="password"
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
                          value={hibachiApiKeyInput}
                          onChange={(e) => setHibachiApiKeyInput(e.target.value)}
                          placeholder="Hibachi API key"
                          style={S.credentialInput}
                          autoComplete="off"
                        />
                        <input
                          type="text"
                          value={hibachiAccountIdInput}
                          onChange={(e) => setHibachiAccountIdInput(e.target.value)}
                          placeholder="Hibachi account id"
                          style={S.credentialInput}
                          autoComplete="off"
                        />
                        <div style={S.grvtOneTapRow}>
                          <input
                            type="password"
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
                      <div style={S.grvtOneTapRow}>
                        <input
                          type="password"
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
                              value={katanaApiKeyInput}
                              onChange={(e) => setKatanaApiKeyInput(e.target.value)}
                              placeholder="Katana API key"
                              style={S.credentialInput}
                              autoComplete="off"
                            />
                            <input
                              type="password"
                              value={katanaApiSecretInput}
                              onChange={(e) => setKatanaApiSecretInput(e.target.value)}
                              placeholder="Katana API secret"
                              style={S.credentialInput}
                              autoComplete="off"
                            />
                            <input
                              type="text"
                              value={katanaWalletInput}
                              onChange={(e) => setKatanaWalletInput(e.target.value)}
                              placeholder={`Katana wallet (0x…) ${resolveEvmWallet('katana') ? `— default ${resolveEvmWallet('katana').slice(0, 8)}…` : ''}`}
                              style={S.credentialInput}
                              autoComplete="off"
                            />
                            <div style={S.grvtOneTapRow}>
                              <input
                                type="password"
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
                      <div style={S.grvtOneTapRow}>
                        <input
                          type="password"
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
                      <div style={S.grvtOneTapRow}>
                        <input
                          type="password"
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
                    <div style={S.gameAuthRowActions}>
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
                      <button
                        type="button"
                        disabled={!row.synced || gameAuthProbing === row.exchange}
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
        </div>

        {/* Form to add/sync new account */}
        <div style={S.accountFormCard}>
          <strong style={S.sectionTitle}>Manual key (fallback)</strong>
          <p style={S.sectionDesc}>
            Manual key — for any exchange. Or sync credentials from Futures (one-tap / API key) if you already completed setup in the game.
          </p>
          {supportsGameWalletSync(newAccExchange) && (
            <button
              type="button"
              onClick={() => connectGameWalletAccount(newAccExchange)}
              style={{ ...cartoonBtn('#1E88E5', '#1565C0'), marginBottom: 12, width: '100%', py: 2, borderRadius: 12 }}
            >
              Use game wallet — Setup & Sync ({newAccExchange.toUpperCase()})
            </button>
          )}
          <div style={S.formGrid}>
            <div style={S.formField}>
              <span style={S.label}>Exchange Venue</span>
              <select
                value={newAccExchange}
                onChange={(e) => setNewAccExchange(e.target.value)}
                style={S.formSelect}
              >
                {availableExchanges.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
            </div>
            <div style={S.formField}>
              <span style={S.label}>Account Label</span>
              <input
                type="text"
                placeholder="My Trading Wallet"
                value={newAccLabel}
                onChange={(e) => setNewAccLabel(e.target.value)}
                style={S.formInput}
              />
            </div>
            <div style={S.formField}>
              <span style={S.label}>Sub-Account ID (0 = main wallet with your USDC)</span>
              <input
                type="text"
                placeholder="0"
                value={newAccSubId}
                onChange={(e) => setNewAccSubId(e.target.value)}
                style={S.formInput}
              />
            </div>
            <div style={S.formField}>
              <span style={S.label}>Transmission Method</span>
              <select
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
            <span style={S.label}>Private Key / Secret API Key</span>
            <input
              type="password"
              placeholder="0x... or EVM private key"
              value={newAccPrivateKey}
              onChange={(e) => setNewAccPrivateKey(e.target.value)}
              style={S.formInput}
            />
          </div>
          <button
            type="button"
            onClick={addAccount}
            style={{ ...cartoonBtn('#43A047', '#2E7D32'), marginTop: 12, width: '100%', py: 2, borderRadius: 12 }}
          >
            Connect & Sync Account
          </button>
        </div>

        {/* List of synced accounts */}
        <div style={S.accountsListCard}>
          <strong style={S.sectionTitle}>Synced Wallets & API Keys</strong>
          <p style={S.sectionDesc}>Active exchange keys matching your player tenant ID.</p>
          <div style={S.syncedList}>
            {syncedAccounts.length === 0 ? (
              <div style={S.emptyState}>No synced accounts found. Add one above.</div>
            ) : (
              syncedAccounts.map((acc) => (
                <div key={acc.id} style={acc.status === 'active' ? S.accountRowActive : S.accountRow}>
                  <div style={S.accountAvatar}>
                    <RobotGlyph size={22} color="#5C3A21" />
                  </div>
                  <div style={S.accountDetails}>
                    <strong style={{ color: '#5C3A21' }}>{acc.label || 'Unnamed Account'}</strong>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#8b7655' }}>
                      {acc.exchange.toUpperCase()} (Sub #{acc.sub_account})
                    </span>
                  </div>
                  <div style={S.accountStatus}>
                    <span
                      style={{
                        ...S.statusPill,
                        ...(acc.status === 'active' ? S.statusRunning : S.statusPaused),
                      }}
                    >
                      {acc.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExchangeActive(acc.exchange, acc.status !== 'active')}
                      style={{
                        background: acc.status === 'active' ? '#E53935' : '#43A047',
                        border: '2px solid #fff',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 900,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        marginLeft: 8,
                      }}
                    >
                      {acc.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );

  const renderLaunch = () => (
    <div style={S.launchShell}>
      <div style={S.launchHeader}>
        <button type="button" style={S.backButton} onClick={goBack} aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <StepDots activeStep={step} />
        <div style={shared.spacer36} />
      </div>

      {step === 'strategy' && (
        <div style={S.stepPage}>
          <div>
            <h2 style={S.stepTitle}>Choose Bot Strategy</h2>
            <p style={S.stepCopy}>Select the market-making strategy kind you want to coordinate.</p>
          </div>
          <div style={S.strategyGrid}>
            {BOT_TYPES.map((bot) => {
              const active = selectedType === bot.id;
              return (
                <button
                  key={bot.id}
                  type="button"
                  style={{ ...S.strategyCard, ...(active ? { borderColor: bot.accent, boxShadow: `0 0 0 3px ${bot.accent}22, 0 4px 0 #d4c8b0` } : {}) }}
                  onClick={() => setSelectedType(bot.id)}
                >
                  <div style={{ ...S.botAvatar, background: `linear-gradient(180deg, ${bot.accent} 0%, ${bot.accentDark} 100%)` }}>
                    <RobotGlyph size={28} color="#fff" />
                  </div>
                  <div style={S.strategyText}>
                    <strong>{bot.name}</strong>
                    <code>{bot.code}</code>
                    <span>{bot.description}</span>
                    <small>{bot.bestFor}</small>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedType && instancesForSelectedType.length > 0 && (
            <div style={{
              background: '#e8dfc8',
              border: '3px solid #d4c8b0',
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 12,
              boxSizing: 'border-box',
            }}>
              <span style={S.label}>Select Exchange Venue</span>
              <select
                value={selectedInstanceId}
                onChange={(e) => setSelectedInstanceId(e.target.value)}
                style={{
                  border: '2px solid #bba882',
                  background: '#fdf8e7',
                  borderRadius: 10,
                  color: '#5C3A21',
                  fontSize: 14,
                  fontWeight: 900,
                  padding: '9px 10px',
                  cursor: 'pointer',
                  width: '100%',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              >
                {filteredInstances.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {getExchangeName(inst.id)} ({inst.symbols.join(', ')})
                  </option>
                ))}
              </select>
              {filteredInstances.length === 0 && instancesForSelectedType.length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#8a6d3b' }}>
                  Templates exist in strategies.toml but no synced account for this exchange. Accounts → Setup & Sync.
                </span>
              )}
              {filteredInstances.length === 0 && instancesForSelectedType.length === 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#8a6d3b' }}>
                  No venue for this strategy in strategies.toml (restart Phantom bot after config change).
                </span>
              )}
              {filteredInstances.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#8a6d3b' }}>
                  Showing only exchanges with an active account in Accounts.
                </span>
              )}
            </div>
          )}
          {selectedType && instancesForSelectedType.length === 0 && (
            <div style={{
              background: '#f8d7da',
              border: '3px solid #f5c6cb',
              borderRadius: 12,
              padding: 12,
              color: '#721c24',
              fontSize: 13,
              fontWeight: 800,
              marginTop: 12,
              boxSizing: 'border-box',
            }}>
              {!token
                ? 'Sign in to the game first — bot strategies load after wallet login.'
                : configuredInstances.length === 0
                  ? 'Could not load strategies from the bot API. Ensure Clash server (:4000) and Phantom (:8080) are running.'
                  : 'No configured exchange instances for this strategy found in strategies.toml.'}
            </div>
          )}
          <button
            type="button"
            disabled={!selectedInstanceId || filteredInstances.length === 0}
            style={{
              ...cartoonBtn(selectedInstanceId ? '#1E88E5' : '#a3906a', selectedInstanceId ? '#1565C0' : '#8c7d5c'),
              ...S.nextButton,
              opacity: (selectedInstanceId && filteredInstances.length > 0) ? 1 : 0.6,
              cursor: (selectedInstanceId && filteredInstances.length > 0) ? 'pointer' : 'not-allowed',
            }}
            onClick={() => setStep('risk')}
          >
            Continue
          </button>
        </div>
      )}

      {step === 'risk' && (
        <div style={S.stepPage}>
          <div>
            <h2 style={S.stepTitle}>Set Risk Limits</h2>
            <p style={S.stepCopy}>Configure controls: deal size, maximum position, and behavior preset.</p>
          </div>
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
            <span style={S.label}>Preset</span>
            <div style={S.presetToggle}>
              {Object.entries(PRESETS).map(([id, option]) => (
                <button
                  key={id}
                  type="button"
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
          <button type="button" style={{ ...cartoonBtn('#1E88E5', '#1565C0'), ...S.nextButton }} onClick={() => setStep('review')}>
            Review Bot
          </button>
        </div>
      )}

      {step === 'review' && (
        <div style={S.stepPage}>
          <div>
            <h2 style={S.stepTitle}>Review and Launch</h2>
            <p style={S.stepCopy}>Review your strategy parameters before spinning up the MM bots.</p>
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
              <span>Exchange <strong>{getExchangeName(selectedInstanceId)}</strong></span>
              <span>Market <strong>{configuredInstances.find(i => i.id === selectedInstanceId)?.symbols?.join(', ') || ''}</strong></span>
              <span>Trade Size <strong>{money(tradeSize)}</strong></span>
              <span>Maximum Position <strong>{money(maxPosition)}</strong></span>
              <span>Preset <strong>{PRESETS[preset].label}</strong></span>
              <span>Status <strong>Ready to launch</strong></span>
            </div>
          </div>
          <button type="button" style={{ ...cartoonBtn('#43A047', '#2E7D32'), ...S.nextButton }} onClick={launchBot}>
            Launch Bot
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
        {view === 'launch' ? renderLaunch() : view === 'history' ? renderHistory() : view === 'accounts' ? renderAccounts() : renderDashboard()}
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
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
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
  launchHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '4px 2px 10px',
    flexShrink: 0,
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
  strategyText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: '#5C3A21',
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
