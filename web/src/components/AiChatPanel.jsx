import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { arbitrum, base } from 'viem/chains';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePlayer } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import EvmWalletModal from './EvmWalletModal';
import { BASE_CHAIN_ID, ensureBaseChain } from '../lib/avantisContract';
import { ARBITRUM_CHAIN_ID, ensureArbitrumChain } from '../lib/gmxConfig';
import { MONAD_CHAIN_ID, ensureMonadChain, monadChain } from '../lib/monadConfig';
import { fetchGameShopConfig, buyGameShopItem, buySolanaShopItem, buyEvmShopItem, buyAptosShopItem } from '../lib/gameShop';

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

const aiShopBasePublicClient = createPublicClient({ chain: base, transport: http() });
const aiShopArbitrumPublicClient = createPublicClient({ chain: arbitrum, transport: http() });
const aiShopMonadPublicClient = createPublicClient({ chain: monadChain, transport: http() });
const AI_SHOP_EVM_PUBLIC_CLIENTS = {
  [BASE_CHAIN_ID]: aiShopBasePublicClient,
  [ARBITRUM_CHAIN_ID]: aiShopArbitrumPublicClient,
  [MONAD_CHAIN_ID]: aiShopMonadPublicClient,
};
const AI_SHOP_EVM_CHAINS = {
  [BASE_CHAIN_ID]: base,
  [ARBITRUM_CHAIN_ID]: arbitrum,
  [MONAD_CHAIN_ID]: monadChain,
};
const AI_SHOP_CHAIN_IDS = {
  base: BASE_CHAIN_ID,
  arbitrum: ARBITRUM_CHAIN_ID,
  monad: MONAD_CHAIN_ID,
};
const AI_SHOP_CHAIN_OPTIONS = [
  { id: 'base', label: 'Base', sub: 'USDC / ETH / CoP' },
  { id: 'solana', label: 'Solana', sub: 'USDC / SOL / SKR' },
  { id: 'arbitrum', label: 'Arbitrum', sub: 'USDC / ETH' },
  { id: 'monad', label: 'Monad', sub: 'USDC / MON' },
  { id: 'aptos', label: 'Aptos', sub: 'USDC / APT' },
];
const AI_SHOP_PAYMENTS_BY_CHAIN = {
  base: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'eth', label: 'ETH', sub: 'Native' },
    { id: 'cop', label: 'CoP', sub: 'AI bonus' },
  ],
  solana: [
    { id: 'usdc', label: 'USDC', sub: 'Stable' },
    { id: 'sol', label: 'SOL', sub: 'Native' },
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
// glyph, ETH = Ethereum diamond, CoP = our app icon, etc).
const AI_TOKEN_LOGO = {
  usdc: '/tokens/USDC.svg',
  eth:  '/tokens/ETH.svg',
  cop:  '/icons/icon-192.png',
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
/* Confetti burst on a successful AI top-up. Each shard gets its own
   rotation + translation via custom properties set inline (--tx/--ty/--rot)
   so we can scatter 16 shards from one keyframe block. */
@keyframes hermesConfettiBurst {
  0%   { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  10%  { opacity: 1; }
  100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); opacity: 0; }
}
.hermes-confetti-shard {
  position: absolute; top: 50%; left: 50%;
  width: 8px; height: 14px;
  border-radius: 2px;
  animation: hermesConfettiBurst 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  pointer-events: none;
}
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
  const player = usePlayer();
  const tradingEvmWallet = useEvmWallet();
  const solWallet = useSolWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const aptosWallet = useAptosWallet();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
  const storageKey = useMemo(() => getChatStorageKey(player, token), [player, token]);
  const skipNextPersist = useRef(true);
  const mountedRef = useRef(true);
  const [messages, setMessages] = useState(() => loadChatMessages(storageKey));
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [progressText, setProgressText] = useState('');
  // Shop is now a separate modal layered on top of the chat panel —
  // earlier it was a tab inside the same chat body which duplicated the
  // header quota and crammed the buy flow into a narrow column. The
  // chat itself always renders the message list + composer; this flag
  // just toggles the shop overlay.
  const [shopOpen, setShopOpen] = useState(false);
  const [quota, setQuota] = useState(null);
  const [shopConfig, setShopConfig] = useState(null);
  const [shopChain, setShopChain] = useState(() => aiShopChainForDex(dex));
  const [shopPayment, setShopPayment] = useState('usdc');
  const [shopBusy, setShopBusy] = useState(null);
  const [shopNotice, setShopNotice] = useState('');
  // Bridge-style purchase modal — drives a 3-step rail (sign → confirm
  // → credit) on top of the shop while a buy is in flight, then flips
  // to success + confetti when the server credits messages.
  // Shape: { status, product, granted, pass, error }.
  //   status ∈ 'signing'|'confirming'|'crediting'|'success'|'error'
  const [topUpFlow, setTopUpFlow] = useState(null);
  const topUpTimers = useRef([]);
  const [localEvmWalletState, setLocalEvmWalletState] = useState(null);
  const [evmModalOpen, setEvmModalOpen] = useState(false);

  useEffect(() => () => {
    mountedRef.current = false;
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
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const localEvmWallet = useMemo(
    () => makeAiChatEvmWallet(localEvmWalletState?.provider, localEvmWalletState?.address),
    [localEvmWalletState?.provider, localEvmWalletState?.address],
  );
  const evmWallet = localEvmWallet || tradingEvmWallet;
  const evmAddress = evmWallet?.address || null;
  const solAddress = solWallet?.publicKey?.toBase58?.() || null;
  const aptosAddress = aptosWallet?.address || null;

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
    fetch('/api/ai-chat/status', { headers: { 'x-token': token } })
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
        const r = await fetch('/api/ai-chat/status', { headers: { 'x-token': token } });
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
      removePendingRequest(storageKey, traceId);
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
        removePendingRequest(storageKey, traceId);
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
        if (mountedRef.current) setMessages(loadChatMessages(storageKey));
      }
      if (mountedRef.current) setError(msg);
    } finally {
      if (mountedRef.current) {
        setStatus('idle');
        setProgressText('');
      }
    }
  }, [input, messages, status, storageKey, token]);

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
    if (shopChain === 'base' || shopChain === 'arbitrum' || shopChain === 'monad') {
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
        result = shopPayment === 'cop'
          ? await buyGameShopItem({
              evmWallet,
              buyer: evmAddress,
              token,
              sku: product.sku,
              quantity: 1,
            })
          : await buyEvmShopItem({
              evmWallet,
              buyer: evmAddress,
              token,
              chain: shopChain,
              sku: product.sku,
              payment: shopPayment,
              quantity: 1,
            });
      } else if (shopChain === 'arbitrum' || shopChain === 'monad') {
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
    .filter((payment) => payment.id !== 'skr' || !!shopConfig?.solana?.skrReady);

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
                <div style={styles.quotaChip}>{formatQuotaLine(quota)}</div>
              </div>
            </div>
            <div data-nodrag style={styles.headerActions}>
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
                <div style={styles.quotaChip}>{formatQuotaLine(quota)}</div>
              </div>
            </div>
            <button
              type="button"
              style={styles.shopToggle}
              onClick={() => setShopOpen(true)}
              title="Top up messages"
            >
              Top up
            </button>
          </div>
        )}

        {!isMobile && <AiQuotaSummary quota={quota} />}

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

      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        targetChain={shopChain === 'arbitrum' || shopChain === 'monad' ? shopChain : 'base'}
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
// flight; flips to a success card with a confetti burst when the
// server credits messages, or to an error card with the failure
// reason. zIndex 320 so it sits above both chat (80) and shop (90).
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

  // Deterministic confetti — 18 shards in alternating brand colors,
  // each with a unique angle/distance so the burst looks scattered
  // rather than mechanical. CSS vars feed the keyframe.
  const CONFETTI_COLORS = ['#ffd76a', '#c2851b', '#91df7d', '#3b9b41', '#04DF83', '#5C3A21'];
  const confetti = [];
  if (status === 'success') {
    for (let i = 0; i < 18; i++) {
      const ang = (Math.PI * 2 * i) / 18 + (i * 0.31);
      const dist = 90 + (i % 4) * 18;
      confetti.push({
        key: i,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        tx: Math.cos(ang) * dist + 'px',
        ty: Math.sin(ang) * dist + 'px',
        rot: ((i * 53) % 720 - 360) + 'deg',
        delay: (i * 22) + 'ms',
      });
    }
  }

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
              {/* Confetti container — absolute-positioned shards burst
                  out from the center of this card on mount. */}
              <div style={topUpStyles.confettiLayer} aria-hidden="true">
                {confetti.map((c) => (
                  <span
                    key={c.key}
                    className="hermes-confetti-shard"
                    style={{
                      background: c.color,
                      animationDelay: c.delay,
                      '--tx': c.tx,
                      '--ty': c.ty,
                      '--rot': c.rot,
                    }}
                  />
                ))}
              </div>
              <div style={topUpStyles.successHeadline}>
                {pass ? '🎉 Lifetime AI Pass active' : `🎉 ${granted} AI messages added`}
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
              const paidWithCop = chain === 'base' && payment === 'cop';
              const credits = paidWithCop && product.copBonusCredits ? product.copBonusCredits : product.messageCredits;
              const price = paidWithCop && product.copPriceUsd ? product.copPriceUsd : product.priceUsd;
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

                  {/* Stack the CoP-bonus chip directly above the Buy CTA
                      so it reads as a label on the action (not buried in
                      the price meta). When CoP isn't selected the column
                      still holds the button as before. */}
                  <div style={styles.aiProductActionCol}>
                    {paidWithCop && (
                      <span style={styles.aiProductBonus}>
                        {isPack ? '+50% with CoP' : '−$10 with CoP'}
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
  quotaChip: {
    fontSize: 10,
    fontWeight: 800,
    color: '#1B5E20',
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 260,
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
  // approach as NftMintPanel.optionBadge so USDC/ETH/CoP/etc all read
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

  // Column that stacks the optional CoP-bonus chip on top of the Buy
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
    borderColor: '#c2851b',
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
    borderColor: '#1f6d34',
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
    background: '#fff6dc', borderColor: '#c2851b', color: '#5C3A21',
    boxShadow: '0 0 0 3px rgba(255,217,122,0.4)',
  },
  stepBubble_done: {
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    borderColor: '#1f6d34', color: '#fff',
  },
  stepBubble_error: {
    background: '#E53935', borderColor: '#7f0000', color: '#fff',
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
    border: '2px solid rgba(92,58,33,0.25)',
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
  // Confetti layer fills the success box and lets shards burst out of
  // its bounds. `overflow: visible` on the parent keeps shards from
  // being clipped by the rounded corners.
  confettiLayer: {
    position: 'absolute', inset: 0,
    pointerEvents: 'none',
    overflow: 'visible',
  },
  successHeadline: {
    fontSize: 16, fontWeight: 900, color: '#1B5E20',
    textShadow: '0 1px 0 rgba(255,255,255,0.5)',
  },
  successSub: { fontSize: 12, fontWeight: 700, color: '#3a6320' },

  errorBox: {
    padding: '8px 10px', borderRadius: 10,
    background: '#fdecea', border: '2px solid #E53935', color: '#7a1f1c',
    fontSize: 12, fontWeight: 700,
  },

  workingHint: {
    fontSize: 11, color: '#7a5a30', fontStyle: 'italic', textAlign: 'center',
  },

  footer: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
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
  secondaryBtn: {
    padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer',
  },
};

export default memo(AiChatPanel);
