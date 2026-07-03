import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { isFarcasterFrame } from './useFarcaster';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { usePacificaAgent } from './usePacificaAgent';
import { pacificaNow, setPacificaServerTimeFromResponse } from '../lib/pacificaTime';
import { PACIFICA_WS_URL, pacificaFetch, pacificaRequest } from '../lib/pacificaClient';
import { reportDiag } from '../lib/diagReporter';
import { sendSolanaInstructionsWithMobileSupport } from '../lib/phoenixTx';
import { SOLANA_RPC_URLS } from '../lib/solanaRpc';
// Privy hooks — called only when VITE_PRIVY_APP_ID is set. That env var is a
// build-time constant, so the conditional call is stable per build (safe under
// rules-of-hooks even though ESLint can't statically prove it).
import { useSignMessage as usePrivySignMessage, useSignAndSendTransaction as usePrivySignAndSend, useSignTransaction as usePrivySignTransaction } from '@privy-io/react-auth/solana';
import { useWallets as usePrivyWallets } from '@privy-io/react-auth/solana';

// ---------- Farcaster direct signing ----------
// The @farcaster/mini-app-solana wallet passes UTF-8 strings to provider.signMessage(),
// but Warpcast native expects base64-encoded bytes. We bypass the wallet-standard adapter
// and call the provider directly with base64.
let _fcProvider = null;
async function getFcProvider() {
  if (_fcProvider) return _fcProvider;
  try {
    const { sdk } = await import('@farcaster/miniapp-sdk');
    _fcProvider = await sdk.wallet.getSolanaProvider();
  } catch {}
  return _fcProvider;
}

async function fcSignMessage(msgBytes) {
  const provider = await getFcProvider();
  if (!provider) return null;
  try {
    const msgB64 = btoa(Array.from(msgBytes, b => String.fromCharCode(b)).join(''));
    const res = await provider.signMessage(msgB64);
    if (!res?.signature) return null;
    return Uint8Array.from(atob(res.signature), c => c.charCodeAt(0));
  } catch { return null; }
}

// ---------- Pacifica Config ----------
const BUILDER_CODE = 'clashofperps';
const REFERRAL_CODE = BUILDER_CODE;
const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const ACTIVATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFERRAL_CLAIM_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFERRAL_CLAIM_RETRY_TTL_MS = 24 * 60 * 60 * 1000;
const PACIFICA_SIGN_EXPIRY_WINDOW_MS = 30_000;
const PACIFICA_AGENT_REQUIRED_MESSAGE = 'Enable 1-tap trading, then try again. Pacifica rejected the direct wallet signature for this account setting.';
const AGENT_SIGNED_TYPES = new Set([
  'create_market_order',
  'create_order',
  'cancel_order',
  'set_position_tpsl',
  'update_leverage',
  'update_margin_mode',
]);

function activationCacheKey(walletAddr) {
  return walletAddr ? `clash_pacifica_activated:${walletAddr}` : null;
}

function referralClaimCacheKey(walletAddr) {
  return walletAddr ? `clash_pacifica_referral:${walletAddr}:${REFERRAL_CODE}` : null;
}

function readActivationCache(walletAddr) {
  const key = activationCacheKey(walletAddr);
  if (!key || typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const entry = JSON.parse(raw);
    if (!entry?.ts || Date.now() - entry.ts > ACTIVATION_CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function writeActivationCache(walletAddr) {
  const key = activationCacheKey(walletAddr);
  if (!key || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now() })); } catch {}
}

function clearActivationCache(walletAddr) {
  const key = activationCacheKey(walletAddr);
  if (!key || typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(key); } catch {}
}

function readReferralClaimCache(walletAddr) {
  const key = referralClaimCacheKey(walletAddr);
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const ttl = entry?.status === 'retry_later'
      ? REFERRAL_CLAIM_RETRY_TTL_MS
      : REFERRAL_CLAIM_CACHE_TTL_MS;
    if (!entry?.ts || Date.now() - entry.ts > ttl) {
      localStorage.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeReferralClaimCache(walletAddr, status, reason = '') {
  const key = referralClaimCacheKey(walletAddr);
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify({
      ts: Date.now(),
      status,
      reason: String(reason || '').slice(0, 160),
    }));
  } catch {}
}

function pacificaErrorText(res) {
  if (!res) return '';
  if (typeof res === 'string') return res;
  return String(res.error || res.message || res.reason || res.code || '');
}

function pacificaSignedResponseOk(res) {
  return !!res && res.success !== false && !res.error && !(Number(res.code) >= 400);
}

function referralClaimTerminalStatus(res) {
  const text = pacificaErrorText(res);
  if (!text) return null;
  if (/must have registered|first deposit|deposit/i.test(text)) return null;
  if (/already|referr|invite|another|different|existing|used|claimed|bound|attached|cannot.*change/i.test(text)) {
    return 'skipped_existing';
  }
  if (/invalid message|signature|verification|unauthorized/i.test(text)) return 'retry_later';
  return null;
}

// Gold rewards are calculated server-side via POST /trading/claim-gold

// Round to lot size. Opens use floor so we never submit more size than the UI
// showed. Full closes use ceil with a tiny epsilon; Pacifica positions can
// arrive as 0.119999999 for a 0.12 lot-aligned position, and floor would close
// 0.11 then leave dust that needs another signed reduce-only order.
function roundToLot(amount, lotSize, mode = 'floor') {
  if (!lotSize) return String(amount);
  const n = parseFloat(amount);
  const lot = parseFloat(lotSize);
  if (!Number.isFinite(n) || !Number.isFinite(lot) || lot <= 0) return String(amount);
  const decimals = (lotSize.toString().split('.')[1] || '').length;
  const units = n / lot;
  const nearestUnits = Math.round(units);
  const roundedUnits = Math.abs(units - nearestUnits) <= 1e-6
    ? nearestUnits
    : mode === 'ceil'
      ? Math.ceil(units)
      : Math.floor(units);
  return (roundedUnits * lot).toFixed(decimals);
}

// Pacifica on-chain deposit constants
const PACIFICA_PROGRAM = new PublicKey('PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH');
const CENTRAL_STATE = new PublicKey('9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY');
const VAULT_TOKEN = new PublicKey('72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// ---------- Signing helpers ----------
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const s = {};
    for (const k of Object.keys(v).sort()) s[k] = sortKeys(v[k]);
    return s;
  }
  return v;
}

function buildMessage(type, payload) {
  const header = { type, timestamp: pacificaNow(), expiry_window: PACIFICA_SIGN_EXPIRY_WINDOW_MS };
  return JSON.stringify(sortKeys({ ...header, data: payload }));
}

function getATA(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOC_TOKEN_PROGRAM
  )[0];
}

// ---------- Hook ----------
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;

// Wallets whose signMessage is incompatible with Pacifica's Ed25519 verifier.
// MetaMask Solana Snap pre-wraps the message before signing (adds prefix /
// re-encodes), so the resulting signature never verifies against the raw
// JSON bytes Pacifica reconstructs server-side. Same pain Hyperliquid/Drift
// hit — the only fix is to refuse the wallet and route the user to Phantom.
const PACIFICA_INCOMPATIBLE_WALLETS = new Set(['MetaMask']);

export function usePacifica() {
  const solWallet = useWallet();
  const { publicKey, signMessage, sendTransaction, signTransaction, connected, wallet } = solWallet;
  const { connection } = useConnection();
  const adapterName = wallet?.adapter?.name || '';
  const isIncompatibleWallet = PACIFICA_INCOMPATIBLE_WALLETS.has(adapterName);

  // One-shot diagnostic on every wallet change — visible in remote consoles
  // so we can see EXACTLY which wallet a user is on without asking.
  useEffect(() => {
    if (!adapterName && !publicKey) return;
    console.log(`[Pacifica] Wallet detected: adapter="${adapterName || '(none)'}" pubkey=${publicKey?.toBase58() || '(none)'} compatible=${!isIncompatibleWallet}`);
  }, [adapterName, publicKey, isIncompatibleWallet]);

  // Privy embedded-wallet integration. When PRIVY_ENABLED is false (no app id),
  // skip these hooks entirely — the provider isn't mounted, so calling them
  // would throw.
  let privySignMessage = null;
  let privyWalletObj = null;
  let privySendTx = null;
  let privySignTx = null;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signMessage: pSign } = usePrivySignMessage();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { wallets: pWallets } = usePrivyWallets();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signAndSendTransaction: pSend } = usePrivySignAndSend();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signTransaction: pSignTx } = usePrivySignTransaction();
    privySignMessage = pSign;
    privySendTx = pSend;
    privySignTx = pSignTx;
    privyWalletObj = (pWallets || []).find(w => w && w.walletClientType === 'privy') || (pWallets || [])[0] || null;
  }
  const privyAddr = privyWalletObj?.address || null;
  const adapterAddr = publicKey?.toBase58() || null;
  const inFarcasterFrame = isFarcasterFrame();
  const privyActive = !!privyAddr && (!inFarcasterFrame || !adapterAddr);

  // Gate WS + polling on DEX. FuturesPanel instantiates BOTH hooks but only
  // one is shown — without this gate Pacifica WS would stay subscribed and
  // Pacifica HTTP polls would run while the user is trading on Avantis.
  const { dex } = useDex();
  const isActiveDex = dex === 'pacifica';

  const [account, setAccount] = useState(null);
  const [positions, _setPositionsRaw] = useState([]);
  const setPositions = (v) => {
    _setPositionsRaw(v);
    const list = typeof v === 'function' ? null : v;
    if (list) window._openPositionsCount = list.length;
  };
  const [orders, setOrders] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [leverageSettings, setLeverageSettings] = useState({});
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null); // flash notification
  const wsRef = useRef(null);
  const marketsRef = useRef([]);
  const withdrawTimerRef = useRef(null);
  const claimGoldTimersRef = useRef([]);
  const signedOpInFlightRef = useRef(new Map());
  const agentSyncInFlightRef = useRef(new Map());
  const activatedRef = useRef(false);
  const activatingRef = useRef(null);
  const referralClaimInFlightRef = useRef(null);
  const [builderApproved, setBuilderApproved] = useState(false);
  const [activationStep, setActivationStep] = useState(null);
  // Re-bind reentry guard for signedRequest. If Pacifica rejects a stored
  // agent key (cleared cache, server-side revoke), we forget+rebind+retry
  // exactly once per request to avoid infinite popup loops.
  const rebindInFlightRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const walletAddr = privyActive ? privyAddr : (adapterAddr || privyAddr);

  const clearScheduledClaimGold = useCallback(() => {
    for (const timer of claimGoldTimersRef.current) clearTimeout(timer);
    claimGoldTimersRef.current = [];
  }, []);

  useEffect(() => {
    const cached = readActivationCache(walletAddr);
    activatedRef.current = cached;
    setBuilderApproved(cached);
  }, [walletAddr]);

  const runSignedOnce = useCallback((key, fn, holdMs = 0) => {
    const map = signedOpInFlightRef.current;
    if (map.has(key)) {
      console.warn(`[Pacifica] duplicate signed op ignored while pending: ${key}`);
      return map.get(key);
    }
    const p = Promise.resolve()
      .then(fn)
      .finally(() => {
        const clear = () => {
          if (map.get(key) === p) map.delete(key);
        };
        if (holdMs > 0) setTimeout(clear, holdMs);
        else clear();
      });
    map.set(key, p);
    return p;
  }, []);

  // Master-wallet sign helper used by the agent-wallet hook for the ONE
  // popup the user ever sees: bind / revoke. Uses the same priority chain
  // as `signedRequest` below (FC → Privy → adapter) so any wallet type
  // can authorise the agent.
  const masterSign = useCallback(async (msgBytes) => {
    if (!privyActive && isFarcasterFrame()) {
      const sig = await fcSignMessage(msgBytes);
      if (sig) return sig;
    }
    if (privyActive && privySignMessage && privyWalletObj) {
      const result = await privySignMessage({ message: msgBytes, wallet: privyWalletObj });
      return result?.signature || result;
    }
    if (publicKey && signMessage) {
      return await signMessage(msgBytes);
    }
    throw new Error('No wallet available to sign');
  }, [publicKey, signMessage, privyActive, privySignMessage, privyWalletObj]);

  const {
    agent: pacAgent,
    bindAgent,
    signWithAgentKey,
    forgetLocally: forgetAgentLocally,
    revokeOnServer: revokeAgentOnServer,
    binding: bindingAgent,
    bindError: bindAgentError,
  } = usePacificaAgent({ walletAddr, masterSign });

  // Reactive player token — kept in a ref so callbacks that are declared with
  // `[walletAddr]` deps (like claimGold) don't need to recreate every time
  // the token updates. The token itself updates via the GodotProvider state
  // message on register/login/account-switch; `window._playerToken` is set
  // there as well but can go briefly null during logout transitions, so this
  // ref + window fallback is the most robust read.
  const player = usePlayer();
  const tokenRef = useRef(null);
  useEffect(() => {
    tokenRef.current = player?.token || null;
  }, [player?.token]);

  const syncPacificaAgentToServer = useCallback(async () => {
    if (!walletAddr || !signWithAgentKey) return false;
    const token = tokenRef.current || window._playerToken || null;
    if (!token) {
      console.warn('[Pacifica] agent sync skipped: no game token');
      return false;
    }
    const proof = signWithAgentKey('clash_agent_sync', { account: walletAddr });
    if (!proof?.agent_wallet || !proof?.signature) return false;
    const key = `${walletAddr}:${proof.agent_wallet}:${token}`;
    const existing = agentSyncInFlightRef.current.get(key);
    if (existing) return existing;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const run = fetch(`${GAME_API}/pacifica/agent/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'pacifica' },
      body: JSON.stringify(proof),
      signal: controller.signal,
    }).then(async (res) => {
      if (res.ok) {
        console.log(`[Pacifica] agent sync OK agent=${String(proof.agent_wallet || '').slice(0, 8)}...`);
        return true;
      }
      let text = '';
      try { text = await res.text(); } catch {}
      console.warn(`[Pacifica] agent sync failed ${res.status}`, {
        body: text.slice(0, 300),
        agent: proof.agent_wallet,
      });
      return false;
    }).catch((e) => {
      console.warn('[Pacifica] agent sync error', {
        error: e?.message || String(e),
        agent: proof.agent_wallet,
      });
      return false;
    }).finally(() => {
      clearTimeout(timeout);
      setTimeout(() => {
        if (agentSyncInFlightRef.current.get(key) === run) agentSyncInFlightRef.current.delete(key);
      }, 10000);
    });
    agentSyncInFlightRef.current.set(key, run);
    return run;
  }, [walletAddr, signWithAgentKey]);

  // Hydrate the builder_code activation flag from server state. localStorage
  // is the primary cache (faster, sticks across reloads on this device),
  // but if it gets cleared (incognito, browser cleanup, Privy iframe reset)
  // the server-persisted flag tells us not to re-pop the approve_builder_code
  // popup — we already approved on a prior session.
  useEffect(() => {
    if (!walletAddr) return;
    if (activatedRef.current) {
      setBuilderApproved(true);
      return;
    }
    if (player?.pacifica_builder_approved) {
      activatedRef.current = true;
      setBuilderApproved(true);
      writeActivationCache(walletAddr);
    }
  }, [walletAddr, player?.pacifica_builder_approved]);

  // Claim gold from game server (server verifies trades via Pacifica API).
  // Uses the reactive `player.token` — `window._playerToken` can be stale
  // (empty or belonging to a logged-out previous account) right after an
  // account switch or Farcaster auto-login, causing the server to reject
  // with 401 and the user silently seeing zero gold for trades that DO
  // exist on Pacifica's side.
  const claimGold = useCallback(async () => {
    if (!walletAddr) return;
    const token = tokenRef.current || window._playerToken;
    if (!token) {
      console.warn('[usePacifica] claimGold skipped — no token yet (account still loading)');
      return;
    }
    // Force Pacifica for players whose account-level default dex points at
    // another exchange. The server still uses req.player.wallet from auth and
    // pacifica_agents (signature-verified ledger) for fan-out; agent_wallet is
    // only written by /pacifica/agent after checking the master signature.
    try {
      await syncPacificaAgentToServer();
      const res = await fetch(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'pacifica' },
        body: JSON.stringify({ wallet: walletAddr, dex: 'pacifica' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the server's error reason instead of swallowing. The most
        // common one observed on new-account flows is 401 "Invalid token"
        // (stale token) or 400 "wallet required" (walletAddr not propagated).
        console.warn('[usePacifica] claim-gold failed:', res.status, data?.error || data?.reason || '(no body)');
        return data;
      }
      const refreshResources = async () => {
        try {
          const rr = await fetch(`${GAME_API}/resources`, { headers: { 'x-token': token } });
          if (!rr.ok) return;
          const resources = await rr.json();
          const nextResources = {
            gold: Number(resources.gold || 0),
            wood: Number(resources.wood || 0),
            ore: Number(resources.ore || 0),
          };
          window.onGodotMessage?.({ action: 'resources', data: nextResources });
          window.godotBridge?.(JSON.stringify({ action: 'set_resources', data: nextResources }));
        } catch {}
      };
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        // Update React resource bar immediately
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      window.dispatchEvent?.(new CustomEvent('clash:trading-reward-claimed', {
        detail: { dex: 'pacifica', gold: Number(data.gold || 0), reason: data.reason || '' },
      }));
      await refreshResources();
      return data;
    } catch (e) {
      console.warn('[usePacifica] claim-gold network error:', e?.message || e);
      return null;
    }
  }, [walletAddr, syncPacificaAgentToServer]);

  const scheduleClaimGold = useCallback(() => {
    // Pacifica trade history can lag the order response by a moment. Claim
    // several times so market opens/closes and delayed limit fills still
    // credit gold + tournaments even if the first history read races ahead
    // of Pacifica's public trade-history index.
    clearScheduledClaimGold();
    for (const delay of [1500, 6000, 15000, 30000]) {
      const timer = setTimeout(() => {
        claimGoldTimersRef.current = claimGoldTimersRef.current.filter(id => id !== timer);
        claimGold();
      }, delay);
      claimGoldTimersRef.current.push(timer);
    }
  }, [claimGold, clearScheduledClaimGold]);

  // Fetch wallet USDC balance — try connection first, fallback to direct RPC
  const fetchWalletUsdc = useCallback(async () => {
    if (!walletAddr) return;
    const ownerPk = new PublicKey(walletAddr);
    const ata = getATA(ownerPk, USDC_MINT);

    // Try main connection
    try {
      const bal = await connection.getTokenAccountBalance(ata);
      setWalletUsdc(parseFloat(bal.value.uiAmount || 0));
      return;
    } catch {}

    // Fallback RPCs
    for (const url of SOLANA_RPC_URLS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'getTokenAccountBalance',
            params: [ata.toBase58()],
          }),
        });
        const data = await res.json();
        if (data.result?.value) {
          setWalletUsdc(parseFloat(data.result.value.uiAmount || 0));
          return;
        }
      } catch {}
    }
    setWalletUsdc(0);
  }, [walletAddr, connection]);

  // Sign & send to Pacifica API.
  //
  // Fast path: if the user has bound an agent wallet, sign locally with
  // the agent's private key (no popup). Trade-class endpoints support
  // agent-signed requests by including `agent_wallet: <pubkey>` in the
  // body — Pacifica verifies the signature against that pubkey rather
  // than the master.
  //
  // Bind, revoke, and other master-only operations bypass the agent path
  // by calling `masterSign` directly elsewhere in this file.
  const signedRequest = useCallback(async (method, endpoint, type, payload) => {
    // Diagnostic: log the FULL sign-context so remote-debugged users have a
    // breadcrumb at every Pacifica call. Captures every routing decision
    // (wallet kind, agent presence, sign sub-path) plus body+errors.
    const inFC = isFarcasterFrame();
    const walletKind = privyActive ? `privy:${privyWalletObj?.walletClientType || '?'}`
      : inFC ? 'farcaster'
      : adapterName ? `adapter:${adapterName}`
      : 'none';
    const canUseAgent = AGENT_SIGNED_TYPES.has(type);
    const hasAgentSecret = !!(canUseAgent && signWithAgentKey && signWithAgentKey('__probe__', {}));
    console.log(`[Pacifica] signedRequest START`, {
      type, endpoint,
      walletKind,
      adapterName: adapterName || null,
      pubkey: walletAddr || null,
      hasAdapter: !!(!privyActive && publicKey && signMessage),
      hasPrivy: !!(privyActive && privySignMessage && privyWalletObj),
      inFarcaster: inFC,
      hasAgentSecret,
      isIncompatibleWallet,
    });
    // Try agent-key fast path first — covers the hot endpoints (orders,
    // positions/tpsl, account/leverage, account/margin) without prompting.
    if (canUseAgent && signWithAgentKey) {
      const tryAgent = async (label) => {
        const headerBag = signWithAgentKey(type, payload);
        if (!headerBag) {
          console.log(`[Pacifica] agent-path SKIP (${label}): signWithAgentKey returned null — no local agent secret`);
          return null;
        }
        const body = { ...headerBag, ...payload };
        console.log(`[Pacifica] ${type} → ${endpoint} (path=agent, attempt=${label}, agent=${String(headerBag.agent_wallet || '').slice(0,8)}…)`);
        await syncPacificaAgentToServer();
        let res, text, parsed = null;
        try {
          const result = await pacificaRequest(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            onResponse: response => setPacificaServerTimeFromResponse(response, `${type}:agent`),
          });
          res = result.response;
          text = result.text;
          parsed = result.data && typeof result.data === 'object' ? result.data : null;
        } catch (netErr) {
          console.error(`[Pacifica] ${type} agent-path NETWORK ERROR`, { error: netErr?.message, sent: body });
          throw netErr;
        }
        if (!res.ok || parsed?.error || parsed?.code >= 400) {
          console.warn(`[Pacifica] ${type} agent-path FAIL status=${res.status} reason="${parsed?.error || text || '(empty)'}"`, {
            responseBody: parsed ?? text,
            responseHeaders: Object.fromEntries(res.headers.entries()),
            sentBodyJSON: JSON.stringify(body),
            sentBodyObj: body,
          });
          // Encrypted upload of the failing trace so we can debug
          // without asking the user to copy/paste console logs.
          // Captures ONLY public data (signed message, sig, pubkey,
          // Pacifica error body) — never the agent secret or wallet
          // private key. See lib/diagReporter.js for the threat model.
          reportDiag({
            path: 'agent',
            type, endpoint, attempt: label,
            adapter: adapterName || 'agent',
            account: walletAddr || null,
            agent_pubkey: String(headerBag.agent_wallet || '') || null,
            status: res.status,
            error_kind: String(parsed?.error || text || `HTTP ${res.status}`).slice(0, 120),
            response_body: parsed ?? text,
            response_headers: Object.fromEntries(res.headers.entries()),
            sent_body: body,
          });
        } else {
          console.log(`[Pacifica] ${type} agent-path OK status=${res.status}`);
        }
        return { res, text, parsed };
      };

      let attempt = await tryAgent('first');
      if (attempt) {
        // Server-side agent invalidation: stored secret no longer matches a
        // bound agent (cleared cache, server revoke, key rotation). Detect
        // 401 or signature/agent error, then forget + rebind + retry ONCE.
        // The rebind ref guards against infinite popup loops if rebind fails.
        const errStr = String(attempt.parsed?.error || attempt.text || '');
        const agentRejected =
          attempt.res.status === 401 ||
          /verification failed|invalid signature|agent[_ ]?wallet|invalid agent/i.test(errStr);
        if (agentRejected) {
          console.warn(`[Pacifica] agent rejected by server (status=${attempt.res.status}, err="${errStr}")`);
          let retried = null;
          if (rebindInFlightRef.current) {
            console.warn(`[Pacifica] rebind SKIPPED — already in flight`);
          } else if (!bindAgent) {
            console.warn(`[Pacifica] rebind SKIPPED — bindAgent unavailable`);
          } else {
            rebindInFlightRef.current = true;
            try {
              forgetAgentLocally();
              console.log(`[Pacifica] rebind: calling bindAgent (master-wallet popup expected)`);
              await bindAgent();
              console.log(`[Pacifica] rebind: bind OK, retrying ${type}`);
              retried = await tryAgent('after-rebind');
            } catch (rebindErr) {
              console.warn(`[Pacifica] rebind FAILED — falling through to master sign`, { error: rebindErr?.message, name: rebindErr?.name });
            } finally { rebindInFlightRef.current = false; }
          }
          const retryErrStr = String(retried?.parsed?.error || retried?.text || '');
          const retryRejected = retried && (
            retried.res.status === 401 ||
            /verification failed|invalid signature|agent[_ ]?wallet|invalid agent/i.test(retryErrStr)
          );
          attempt = retried && !retryRejected ? retried : null;
        }
        if (attempt) {
          if (attempt.parsed !== null) return attempt.parsed;
          throw new Error(attempt.text || `API error ${attempt.res.status}`);
        }
      }
    } else if (!canUseAgent) {
      console.log(`[Pacifica] agent-path SKIP: ${type} requires master signature`);
    } else {
      console.log(`[Pacifica] agent-path SKIP: signWithAgentKey not exposed (hook not ready or no wallet)`);
    }

    const hasAdapter = !!(!privyActive && publicKey && signMessage);
    const hasPrivy = !!(privyActive && privySignMessage && privyWalletObj);
    if (!hasAdapter && !hasPrivy) {
      console.error(`[Pacifica] master-path ABORT: no signing method available`, { hasAdapter, hasPrivy, adapterName, privyActive, inFC });
      throw new Error('Wallet not connected');
    }
    if (hasAdapter && !hasPrivy && PACIFICA_INCOMPATIBLE_WALLETS.has(adapterName)) {
      console.error(`[Pacifica] master-path ABORT: incompatible adapter "${adapterName}". Pacifica's Ed25519 verifier cannot verify signatures from this wallet.`);
      throw new Error(`${adapterName} on Solana is not supported by Pacifica. Please connect Phantom or Solflare.`);
    }

    const account = walletAddr;
    const message = buildMessage(type, payload);
    const msgBytes = new TextEncoder().encode(message);
    let sigBytes;
    let signSubpath = null;

    // In Farcaster frame: sign via SDK provider with base64 (bypasses broken UTF-8 path)
    if (inFC) {
      signSubpath = 'farcaster-sdk';
      console.log(`[Pacifica] master-path: signing via Farcaster SDK`);
      try {
        sigBytes = await fcSignMessage(msgBytes);
      } catch (e) {
        console.error(`[Pacifica] Farcaster signMessage threw`, { error: e?.message, name: e?.name });
        throw e;
      }
    }

    // Privy embedded wallet path (email login, no adapter)
    if (!sigBytes && privyActive && privySignMessage && privyWalletObj) {
      signSubpath = 'privy';
      console.log(`[Pacifica] master-path: signing via Privy embedded (silent — no popup)`);
      try {
        const result = await privySignMessage({ message: msgBytes, wallet: privyWalletObj });
        sigBytes = result?.signature || result;
      } catch (e) {
        console.error(`[Pacifica] Privy signMessage threw`, { error: e?.message, name: e?.name });
        if (e?.message?.includes('rejected') || e?.message?.includes('cancelled')) {
          throw new Error('Signature rejected');
        }
        throw e;
      }
    }

    // Standard wallet-adapter signMessage (Phantom, etc.)
    if (!sigBytes && hasAdapter) {
      signSubpath = `adapter:${adapterName}`;
      console.log(`[Pacifica] master-path: signing via adapter "${adapterName}" (popup EXPECTED — user must Approve)`);
      try {
        sigBytes = await signMessage(msgBytes);
        console.log(`[Pacifica] master-path: adapter returned signature, ${sigBytes?.length || 0} bytes`);
      } catch (e) {
        console.error(`[Pacifica] adapter signMessage threw`, { error: e?.message, name: e?.name, code: e?.code, stack: e?.stack?.split('\n').slice(0,3) });
        if (e.message?.includes('UserKeyring') || e.message?.includes('rejected') || e.message?.includes('Approval Denied') || e.message?.includes('User rejected')) {
          throw new Error('You declined the wallet signature. Tap Approve in your wallet to enable trading.');
        }
        throw e;
      }
    }
    if (!sigBytes) {
      console.error(`[Pacifica] master-path: NO signature produced (subpath=${signSubpath})`);
      throw new Error('No signature produced');
    }

    const signature = bs58.encode(sigBytes);

    const body = {
      account,
      agent_wallet: null,
      signature,
      timestamp: JSON.parse(message).timestamp,
      expiry_window: PACIFICA_SIGN_EXPIRY_WINDOW_MS,
      ...payload,
    };

    // Diagnostic: dump the EXACT bytes signed and the encoded signature so we
    // can compare what the wallet signed vs. what Pacifica reconstructs server-
    // side. Critical for diagnosing wallets (Backpack, MetaMask Snap, …) that
    // wrap the message before signing.
    console.log(`[Pacifica] ${type} master-path SIGNED`, {
      signedMessage: message,
      signedMessageLength: msgBytes.length,
      signatureBase58: signature,
      signatureLength: sigBytes.length,
      account,
      adapter: signSubpath,
    });
    console.log(`[Pacifica] ${type} → ${endpoint} (path=master, wallet=${walletKind})`);
    const result = await pacificaRequest(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      onResponse: response => setPacificaServerTimeFromResponse(response, `${type}:master`),
    });
    const res = result.response;
    const text = result.text;
    const responseHeaders = Object.fromEntries(res.headers.entries());
    try {
      const json = result.data && typeof result.data === 'object'
        ? result.data
        : JSON.parse(text);
      if (!res.ok || json?.error || json?.code >= 400) {
        console.warn(`[Pacifica] ${type} master-path FAIL ${res.status}`, {
          responseBody: json,
          responseHeaders,
          sentBodyJSON: JSON.stringify(body),
          sentBodyObj: body,
          signedMessage: message,
        });
        reportDiag({
          path: 'master',
          type, endpoint,
          adapter: signSubpath || `adapter:${adapterName}`,
          account,
          status: res.status,
          error_kind: String(json?.error || `HTTP ${res.status}`).slice(0, 120),
          signed_message: message,
          signed_message_length: msgBytes.length,
          signature_b58: signature,
          signature_length: sigBytes.length,
          response_body: json,
          response_headers: responseHeaders,
          sent_body: body,
        });
      }
      return json;
    } catch {
      console.warn(`[Pacifica] ${type} master-path non-JSON ${res.status}`, {
        responseBody: text,
        responseHeaders,
        sentBodyJSON: JSON.stringify(body),
        sentBodyObj: body,
        signedMessage: message,
      });
      // Same as above but text response (Pacifica sometimes returns
      // plain "Invalid message" with no JSON wrapper). This is the
      // failure path the user was hitting on Solflare — capturing the
      // exact signed bytes + signature here is what lets us figure out
      // why server-side verification rejects.
      reportDiag({
        path: 'master',
        type, endpoint,
        adapter: signSubpath || `adapter:${adapterName}`,
        account,
        status: res.status,
        error_kind: String(text || `HTTP ${res.status}`).slice(0, 120),
        signed_message: message,
        signed_message_length: msgBytes.length,
        signature_b58: signature,
        signature_length: sigBytes.length,
        response_text: text,
        response_headers: responseHeaders,
        sent_body: body,
      });
      // Farcaster wallet signMessage is not compatible with Pacifica verification
      if (text.includes('erification failed')) {
        throw new Error('Signature verification failed. Connect Phantom or another Solana wallet to trade.');
      }
      // Pacifica sometimes responds with plain-text "Invalid message" (status
      // 400) instead of structured JSON when the signed payload fails an
      // upstream check — e.g. unapproved builder_code, clock-skewed timestamp,
      // missing referral. Surface a synthetic JSON-shaped error so the
      // activation/retry layer above can react to it instead of bailing.
      return { error: text || `API error ${res.status}`, code: res.status, _nonJson: true };
    }
  }, [publicKey, signMessage, privyActive, privySignMessage, privyWalletObj, privyAddr, walletAddr, signWithAgentKey, syncPacificaAgentToServer, bindAgent, forgetAgentLocally, adapterName, isIncompatibleWallet]);

  const fetchAccountForReferralClaim = useCallback(async () => {
    if (!walletAddr) return null;
    try {
      const result = await pacificaRequest(`/account?account=${encodeURIComponent(walletAddr)}`, {
        cache: 'no-store',
        onResponse: response => setPacificaServerTimeFromResponse(response, 'referral-account-check'),
      });
      if (result.ok && result.data?.data) return result.data.data;
      if (result.status === 404) return null;
      console.info('[Pacifica] referral claim skipped: account check failed', {
        status: result.status,
        error: result.data?.error || result.text || null,
      });
    } catch (e) {
      console.info('[Pacifica] referral claim skipped: account check error', e?.message || e);
    }
    return null;
  }, [walletAddr]);

  const ensurePacificaReferralClaim = useCallback(async ({
    accountSnapshot = null,
    force = false,
    showStep = false,
  } = {}) => {
    if (!walletAddr) return { skipped: 'no-wallet' };
    const cached = readReferralClaimCache(walletAddr);
    if (cached && (!force || cached.status !== 'retry_later')) {
      return { skipped: cached.status, cached: true };
    }
    if (referralClaimInFlightRef.current) return referralClaimInFlightRef.current;

    const run = (async () => {
      let snapshot = accountSnapshot;
      if (!snapshot) snapshot = await fetchAccountForReferralClaim();
      if (!snapshot) {
        // No Pacifica account yet means no first deposit. Do not ask for a
        // wallet signature; the next account fetch after deposit can retry.
        return { skipped: 'no-deposit' };
      }

      if (showStep) setActivationStep({ label: 'Claim referral code', index: 1, total: 2 });
      try {
        const res = await signedRequest('POST', '/referral/user/code/claim', 'claim_referral_code', {
          code: REFERRAL_CODE,
        });
        if (pacificaSignedResponseOk(res)) {
          writeReferralClaimCache(walletAddr, 'claimed');
          console.info('[Pacifica] referral claim OK', { code: REFERRAL_CODE });
          return { claimed: true };
        }

        const text = pacificaErrorText(res);
        if (/must have registered|first deposit|deposit/i.test(text)) {
          console.info('[Pacifica] referral claim skipped: first deposit required');
          return { skipped: 'no-deposit' };
        }
        const terminalStatus = referralClaimTerminalStatus(res);
        if (terminalStatus) writeReferralClaimCache(walletAddr, terminalStatus, text);
        else writeReferralClaimCache(walletAddr, 'retry_later', text);
        console.info('[Pacifica] referral claim skipped/failed', {
          status: res?.code || null,
          reason: text || 'unknown',
        });
        return { error: text || 'Pacifica referral claim failed' };
      } catch (e) {
        const text = e?.message || String(e);
        const terminalStatus = referralClaimTerminalStatus({ error: text });
        writeReferralClaimCache(walletAddr, terminalStatus || 'retry_later', text);
        console.info('[Pacifica] referral claim error', text);
        return { error: text };
      }
    })().finally(() => {
      if (referralClaimInFlightRef.current === run) referralClaimInFlightRef.current = null;
    });

    referralClaimInFlightRef.current = run;
    return run;
  }, [walletAddr, signedRequest, fetchAccountForReferralClaim]);

  // Onboarding activation — must be defined before signedRequestWithActivation
  const activate = useCallback(async () => {
    if (!walletAddr) return false;
    // Referral attribution is best-effort. It only runs after Pacifica account
    // creation (first deposit) and never blocks builder-code approval/trading.
    try {
      await ensurePacificaReferralClaim({ force: true, showStep: true });
      setActivationStep({ label: 'Approve builder code', index: 2, total: 2 });
      const res = await signedRequest('POST', '/account/builder_codes/approve', 'approve_builder_code', {
        builder_code: BUILDER_CODE, max_fee_rate: '0.001',
      });
      const approveText = String(res?.error || '');
      const ok = (!res?.error && !(res?.code >= 400))
        || /already approved|builder code already/i.test(approveText);
      if (ok) {
        activatedRef.current = true;
        setBuilderApproved(true);
        writeActivationCache(walletAddr);
        // Mirror to server so we don't re-approve on the next session if
        // localStorage is cleared (incognito, browser cleanup, Privy iframe
        // context resets). The server stores `pacifica_builder_approved=1`
        // on the player row and the client hydrates activatedRef from it
        // via player_state on init.
        try {
          const token = tokenRef.current || window._playerToken;
          if (token) {
            fetch(`${GAME_API}/pacifica/builder-approved`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-token': token },
            }).catch(() => { /* non-fatal */ });
          }
        } catch {}
      }
      else {
        setBuilderApproved(false);
        clearActivationCache(walletAddr);
        if (res?.error) setError(res.error);
      }
      return ok;
    } catch (e) {
      setBuilderApproved(false);
      clearActivationCache(walletAddr);
      setError(e?.message || 'Pacifica builder-code approval failed');
    } finally {
      setActivationStep(null);
    }
    return false;
  }, [walletAddr, signedRequest, ensurePacificaReferralClaim]);

  // Auto-activate: every signed Pacifica request that carries our builder_code
  // must be preceded by master-wallet approval. Reduce-only closes still create
  // orders, so they must not bypass fee-routing approval.
  // If Pacifica still replies "not approved" / "Invalid message", reactively
  // approve once and retry.
  const signedRequestWithActivation = useCallback(async (method, endpoint, type, payload) => {
    // Preflight: ensure builder_code + referral are claimed before the real
    // request. Skip for the activation requests themselves to avoid recursion.
    const isActivationCall = type === 'claim_referral_code' || type === 'approve_builder_code';
    const needsBuilderActivation = payload?.builder_code === BUILDER_CODE;
    if (!isActivationCall && needsBuilderActivation && !activatedRef.current) {
      if (!activatingRef.current) {
        console.log(`[Pacifica] preflight activate() — first signed call (${type})`);
        activatingRef.current = (async () => {
          try {
            const ok = await activate();
            activatedRef.current = ok || readActivationCache(walletAddr);
            setBuilderApproved(activatedRef.current);
          }
          finally { activatingRef.current = null; }
        })();
      }
      await activatingRef.current;
    }

    const res = await signedRequest(method, endpoint, type, payload);
    if (!res?.error && !(res?.code >= 400) && needsBuilderActivation) {
      activatedRef.current = true;
      setBuilderApproved(true);
      writeActivationCache(walletAddr);
    }
    // Reactive safety net — if for some reason preflight didn't cover it
    // (race with cached activatedRef from prior session, server-side state
    // diff, etc.), still react to a 403/not-approved/builder-code reply.
    const errStr = String(res?.error || '');
    const needsRetryActivation =
      res?.code === 403 ||
      /not approved|builder code/i.test(errStr) ||
      (res?._nonJson && res?.code === 400 && /invalid message/i.test(errStr));
    if (needsRetryActivation && !isActivationCall) {
      clearActivationCache(walletAddr);
      activatedRef.current = false;
      setBuilderApproved(false);
      console.log(`[Pacifica] reactive activate() retry — ${type} returned ${res?.code} "${errStr}"`);
      const ok = await activate();
      activatedRef.current = ok || readActivationCache(walletAddr);
      setBuilderApproved(activatedRef.current);
      return signedRequest(method, endpoint, type, payload);
    }
    return res;
  }, [signedRequest, activate, walletAddr]);

  // ---------- Market Data (public) ----------
  const fetchMarkets = useCallback(async () => {
    try {
      const result = await pacificaRequest('/info', {
        cache: 'no-store',
        onResponse: response => setPacificaServerTimeFromResponse(response, 'info'),
      });
      // Warm the clock-skew offset BEFORE any signed request fires. fetchMarkets
      // runs on mount, so by the time the user clicks LONG/SHORT we already
      // have an accurate Pacifica-clock baseline even if their local clock is
      // unsynced.
      const res = result.data;
      if (res.data) { setMarkets(res.data); marketsRef.current = res.data; }
    } catch {}
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await pacificaFetch('/info/prices');
      if (res.data) setPrices(res.data);
    } catch {}
  }, []);

  // ---------- Account Data ----------
  const fetchAccount = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await pacificaFetch(`/account?account=${encodeURIComponent(walletAddr)}`);
      if (res.data) setAccount(res.data);
    } catch {}
  }, [walletAddr]);

  useEffect(() => {
    if (!walletAddr || !isActiveDex || !account) return;
    ensurePacificaReferralClaim().catch(() => {});
  }, [walletAddr, isActiveDex, account, ensurePacificaReferralClaim]);

  const fetchPositions = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await pacificaFetch(`/positions?account=${encodeURIComponent(walletAddr)}`);
      if (res.data) { setPositions(res.data); setDataReady(true); }
    } catch {}
  }, [walletAddr]);

  const fetchOrders = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await pacificaFetch(`/orders?account=${encodeURIComponent(walletAddr)}`);
      if (res.data) setOrders(res.data);
    } catch {}
  }, [walletAddr]);

  const [marginModes, setMarginModes] = useState({}); // { BTC: false (cross), ETH: true (isolated) }

  const fetchLeverageSettings = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await pacificaFetch(`/account/settings?account=${encodeURIComponent(walletAddr)}`);
      if (res.data?.margin_settings) {
        const levMap = {};
        const marginMap = {};
        for (const s of res.data.margin_settings) {
          levMap[s.symbol] = s.leverage;
          marginMap[s.symbol] = s.isolated;
        }
        setLeverageSettings(levMap);
        setMarginModes(marginMap);
      }
    } catch {}
  }, [walletAddr]);


  // ---------- Deposit (on-chain) ----------
  const depositToPacifica = useCallback(async (amountUsdc) => {
    const ownerPk = walletAddr ? new PublicKey(walletAddr) : null;
    if (!ownerPk) { setError('Wallet not connected'); return; }
    const canSendAdapter = !privyActive && !!publicKey && !!sendTransaction;
    const canSendPrivy = privyActive && !!privySendTx && !!privyWalletObj;
    if (!canSendAdapter && !canSendPrivy) { setError('Wallet cannot send transactions'); return; }

    setLoading(true);
    setError(null);
    try {
      const amountRaw = Math.floor(parseFloat(amountUsdc) * 1e6);
      if (amountRaw < 10e6) throw new Error('Minimum Pacifica deposit is 10 USDC.');

      // Check SOL balance for gas fees
      let solBal = 0;
      try { solBal = await connection.getBalance(ownerPk); } catch {}
      if (solBal < 5000000) throw new Error('Not enough SOL for gas fees (need ~0.005 SOL)');

      // Check USDC balance
      const depositorAta = getATA(ownerPk, USDC_MINT);
      let usdcBal = 0;
      try {
        const tokenBal = await connection.getTokenAccountBalance(depositorAta);
        usdcBal = Math.floor(parseFloat(tokenBal.value.uiAmount || 0) * 1e6);
      } catch {}
      if (usdcBal < amountRaw) throw new Error(`Not enough USDC (have ${(usdcBal / 1e6).toFixed(2)}, need ${amountUsdc})`);
      const [eventAuth] = PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], PACIFICA_PROGRAM);

      // Discriminator for "deposit"
      const disc = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:deposit'))).slice(0, 8);
      const amtBuf = new ArrayBuffer(8);
      new DataView(amtBuf).setBigUint64(0, BigInt(amountRaw), true);
      const data = new Uint8Array([...disc, ...new Uint8Array(amtBuf)]);

      const ix = new TransactionInstruction({
        programId: PACIFICA_PROGRAM,
        keys: [
          { pubkey: ownerPk, isSigner: true, isWritable: true },
          { pubkey: depositorAta, isSigner: false, isWritable: true },
          { pubkey: CENTRAL_STATE, isSigner: false, isWritable: true },
          { pubkey: VAULT_TOKEN, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: ASSOC_TOKEN_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: USDC_MINT, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: eventAuth, isSigner: false, isWritable: false },
          { pubkey: PACIFICA_PROGRAM, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(data),
      });

      const sig = await sendSolanaInstructionsWithMobileSupport({
        instructions: [ix],
        ownerPk,
        connection,
        sendTransaction,
        signTransaction,
        solWallet,
        privyActive,
        privySendTx,
        privySignTx,
        privyWalletObj,
        preferPrivySignAndSend: true,
        preferWalletSendTransaction: true,
        venueLabel: 'Pacifica',
        label: 'pacifica.deposit',
      });
      /*

        // Privy's useSignAndSendTransaction expects a serialized Uint8Array, not
        // a Transaction object. Partial-sign=false so Privy signs fully.
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const result = await privySendTx({
          transaction: new Uint8Array(serialized),
          wallet: privyWalletObj,
        });
        const sigBytes = result?.signature || result;
        // Signature is Uint8Array — encode to base58 for confirmTransaction
        sig = typeof sigBytes === 'string' ? sigBytes : bs58.encode(sigBytes);
      }
      await connection.confirmTransaction(sig, 'confirmed');
      */

      // Auto-activate after first deposit
      await activate();
      fetchAccount();
      fetchWalletUsdc();

      // First deposit gold is handled server-side via POST /trading/claim-gold
      claimGold();

      return { success: true, signature: sig };
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, publicKey, sendTransaction, signTransaction, solWallet, connection, activate, fetchAccount, fetchWalletUsdc, privyActive, privySendTx, privySignTx, privyWalletObj, claimGold]);

  // ---------- Trading ----------
  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage) => {
    if (!walletAddr) return;
    const opKey = `open-market:${walletAddr}:${symbol}:${side}:${amount}:${slippage || '0.5'}`;
    return runSignedOnce(opKey, async () => {
      setLoading(true);
      setError(null);
      try {
        const lot = marketsRef.current.find(m => m.symbol === symbol)?.lot_size;
        const res = await signedRequestWithActivation('POST', '/orders/create_market', 'create_market_order', {
          symbol, side, amount: roundToLot(amount, lot),
          slippage_percent: String(slippage || '0.5'),
          reduce_only: false,
          builder_code: BUILDER_CODE,
        });
        if (res.error) throw new Error(res.error);
        fetchPositions();
        fetchOrders();
        fetchAccount();
        scheduleClaimGold();
        return res;
      } catch (e) {
        setError(e.message);
        return { error: e.message };
      } finally {
        setLoading(false);
      }
    });
  }, [walletAddr, signedRequestWithActivation, fetchPositions, fetchOrders, fetchAccount, scheduleClaimGold, runSignedOnce]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif) => {
    if (!walletAddr) return;
    const opKey = `open-limit:${walletAddr}:${symbol}:${side}:${price}:${amount}:${tif || 'GTC'}`;
    return runSignedOnce(opKey, async () => {
      setLoading(true);
      setError(null);
      try {
        const lot = marketsRef.current.find(m => m.symbol === symbol)?.lot_size;
        const tick = marketsRef.current.find(m => m.symbol === symbol)?.tick_size;
        const res = await signedRequestWithActivation('POST', '/orders/create', 'create_order', {
          symbol, side, price: tick ? roundToLot(price, tick) : String(price), amount: roundToLot(amount, lot),
          tif: tif || 'GTC', reduce_only: false,
          builder_code: BUILDER_CODE,
        });
        if (res.error) throw new Error(res.error);
        fetchOrders();
        fetchAccount();
        scheduleClaimGold();
        return res;
      } catch (e) {
        setError(e.message);
        return { error: e.message };
      } finally {
        setLoading(false);
      }
    });
  }, [walletAddr, signedRequestWithActivation, fetchOrders, fetchAccount, scheduleClaimGold, runSignedOnce]);

  const closePosition = useCallback(async (symbol, side, amount, _pairIndex, _tradeIndex, fullClose = false) => {
    if (!walletAddr) return;
    const opKey = `close:${walletAddr}:${symbol}:${side}`;
    if (signedOpInFlightRef.current.has(opKey)) {
      return { error: 'Close already in progress' };
    }
    return runSignedOnce(opKey, async () => {
      setLoading(true);
      setError(null);
      try {
        const closeSide = side === 'bid' ? 'ask' : 'bid';
        const lot = marketsRef.current.find(m => m.symbol === symbol)?.lot_size;
        const roundedAmount = roundToLot(amount, lot, fullClose ? 'ceil' : 'floor');
        if (!Number.isFinite(Number(roundedAmount)) || Number(roundedAmount) <= 0) {
          throw new Error('Close amount is below this market lot size');
        }
        const res = await signedRequestWithActivation('POST', '/orders/create_market', 'create_market_order', {
          symbol, side: closeSide, amount: roundedAmount,
          slippage_percent: '1', reduce_only: true,
          builder_code: BUILDER_CODE,
        });
        if (res.error) throw new Error(res.error);
        fetchPositions();
        fetchAccount();
        scheduleClaimGold();
        return res;
      } catch (e) {
        setError(e.message);
        return { error: e.message };
      } finally {
        setLoading(false);
      }
    }, 8000);
  }, [walletAddr, signedRequestWithActivation, fetchPositions, fetchAccount, scheduleClaimGold, runSignedOnce]);

  const cancelOrder = useCallback(async (symbol, orderId) => {
    if (!walletAddr) return;
    return runSignedOnce(`cancel:${walletAddr}:${symbol}:${orderId}`, async () => {
      try {
        const res = await signedRequestWithActivation('POST', '/orders/cancel', 'cancel_order', { symbol, order_id: orderId });
        if (res.error) throw new Error(res.error);
        fetchOrders();
        return res;
      } catch (e) { setError(e.message); return { error: e.message }; }
    }, 3000);
  }, [walletAddr, signedRequestWithActivation, fetchOrders, runSignedOnce]);

  const setTpsl = useCallback(async (symbol, side, takeProfit, stopLoss) => {
    if (!walletAddr) return;
    return runSignedOnce(`tpsl:${walletAddr}:${symbol}:${side}`, async () => {
      try {
        const payload = { symbol, side, builder_code: BUILDER_CODE };
        if (takeProfit) payload.take_profit = { stop_price: takeProfit };
        if (stopLoss) payload.stop_loss = { stop_price: stopLoss };
        const res = await signedRequestWithActivation('POST', '/positions/tpsl', 'set_position_tpsl', payload);
        if (res.error) throw new Error(res.error);
        return res;
      } catch (e) { setError(e.message); return { error: e.message }; }
    });
  }, [walletAddr, signedRequestWithActivation, runSignedOnce]);

  const setLeverage = useCallback(async (symbol, leverage) => {
    if (!walletAddr) return;
    return runSignedOnce(`leverage:${walletAddr}:${symbol}`, async () => {
      try {
        // Cap at symbol's actual max (Pacifica rejects otherwise with InvalidLeverage).
        const mkt = marketsRef.current.find(m => m.symbol === symbol);
        const maxLev = mkt?.max_leverage ? Number(mkt.max_leverage) : 50;
        const capped = Math.max(1, Math.min(Number(leverage), maxLev));
        const res = await signedRequestWithActivation('POST', '/account/leverage', 'update_leverage', {
          symbol, leverage: capped,
        });
        if (res.error) {
          if (res.code === 422) throw new Error('Close your ' + symbol + ' position first (can only increase leverage)');
          if (/InvalidLeverage/i.test(res.error)) {
            throw new Error(`Leverage ${capped}x not accepted by Pacifica (max for ${symbol} is ${maxLev}x). Close open position first.`);
          }
          if (res.code === 400 && /Invalid message/i.test(res.error)) {
            throw new Error(PACIFICA_AGENT_REQUIRED_MESSAGE);
          }
          throw new Error(res.error);
        }
        fetchLeverageSettings();
        return res;
      } catch (e) { setError(e.message); return { error: e.message }; }
    });
  }, [walletAddr, signedRequestWithActivation, fetchLeverageSettings, runSignedOnce]);

  const setMarginMode = useCallback(async (symbol, isIsolated) => {
    if (!walletAddr) return;
    return runSignedOnce(`margin:${walletAddr}:${symbol}`, async () => {
      try {
        const res = await signedRequestWithActivation('POST', '/account/margin', 'update_margin_mode', {
          symbol, is_isolated: isIsolated,
        });
        if (res.error) {
          if (res.code === 422) throw new Error('Close your ' + symbol + ' position first to change margin mode');
          if (res.code === 400 && /Invalid message/i.test(res.error)) {
            throw new Error(PACIFICA_AGENT_REQUIRED_MESSAGE);
          }
          throw new Error(res.error);
        }
        fetchLeverageSettings();
        return res;
      } catch (e) { setError(e.message); return { error: e.message }; }
    });
  }, [walletAddr, signedRequestWithActivation, fetchLeverageSettings, runSignedOnce]);

  const withdraw = useCallback(async (amount) => {
    if (!walletAddr) return;
    setLoading(true);
    setError(null);
    try {
      const res = await signedRequestWithActivation('POST', '/account/withdraw', 'withdraw', { amount: String(amount) });
      if (res.error) throw new Error(res.error);
      fetchAccount();
      clearTimeout(withdrawTimerRef.current);
      withdrawTimerRef.current = setTimeout(fetchWalletUsdc, 5000); // refresh after settlement
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, signedRequestWithActivation, fetchAccount, fetchWalletUsdc]);

  // ---------- WebSocket ----------
  const wsHandlersRef = useRef({});
  useEffect(() => {
    wsHandlersRef.current = {
      fetchPrices,
      fetchAccount,
      fetchPositions,
      fetchOrders,
      fetchWalletUsdc,
      fetchLeverageSettings,
      claimGold,
    };
  }, [fetchPrices, fetchAccount, fetchPositions, fetchOrders, fetchWalletUsdc, fetchLeverageSettings, claimGold]);

  useEffect(() => {
    if (!walletAddr || !isActiveDex) return;

    let ws, reconnectTimer, pingTimer, pongTimer, restFallbackTimer;
    let latestPrices = null;
    let priceThrottleTimer = null;
    let retryCount = 0;
    const PING_INTERVAL = 15000;
    const PONG_TIMEOUT = 5000;
    const MAX_BACKOFF = 30000;

    function refetchAll() {
      const h = wsHandlersRef.current;
      h.fetchPrices?.();
      if (walletAddr) {
        h.fetchAccount?.();
        h.fetchPositions?.();
        h.fetchOrders?.();
        h.fetchLeverageSettings?.();
        h.claimGold?.();
      }
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF);
      retryCount++;
      reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(PACIFICA_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount = 0;
        ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'prices' } }));
        if (walletAddr) {
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_positions', account: walletAddr } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_order_updates', account: walletAddr } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_info', account: walletAddr } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_trades', account: walletAddr } }));
        }
        // Refetch via REST to close any gap from disconnect period
        refetchAll();

        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }));
            // Start pong timeout — if no pong received, force reconnect
            clearTimeout(pongTimer);
            pongTimer = setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) ws.close();
            }, PONG_TIMEOUT);
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          // Pong received — clear timeout
          if (msg.channel === 'pong' || msg.method === 'pong' || msg.pong) {
            clearTimeout(pongTimer);
            return;
          }

          if (msg.channel === 'prices') {
            latestPrices = msg.data;
            if (!priceThrottleTimer) {
              priceThrottleTimer = setTimeout(() => {
                setPrices(latestPrices);
                priceThrottleTimer = null;
              }, 1000);
            }
          }
          if (msg.channel === 'account_positions') {
            // WS positions use short keys: s=symbol, d=side, a=amount, p=entry_price, m=margin, f=funding, i=isolated
            const raw = Array.isArray(msg.data) ? msg.data : [];
            const incoming = raw.map(p => ({
              symbol: p.symbol || p.s,
              side: p.side || p.d,
              amount: p.amount || p.a,
              entry_price: p.entry_price || p.p,
              margin: p.margin || p.m || '0',
              funding: p.funding || p.f || '0',
              isolated: p.isolated ?? p.i ?? false,
              liquidation_price: p.liquidation_price || p.l,
            }));
            setPositions(prev => {
              // Empty array = all positions closed
              if (incoming.length === 0) return [];
              // Merge incoming with existing positions by symbol:side key
              const key = (p) => `${p.symbol}:${p.side}`;
              const map = new Map(prev.map(p => [key(p), p]));
              for (const p of incoming) {
                if (parseFloat(p.amount) === 0) map.delete(key(p));
                else map.set(key(p), p);
              }
              return [...map.values()];
            });
          }
          if (msg.channel === 'account_info') {
            // WS uses short keys — normalize to match REST format
            const d = msg.data;
            setAccount(prev => ({
              ...prev,
              balance: d.balance || d.b || prev?.balance || '0',
              account_equity: d.account_equity || d.ae || prev?.account_equity || '0',
              available_to_spend: d.available_to_spend || d.as || prev?.available_to_spend || '0',
              available_to_withdraw: d.available_to_withdraw || d.aw || prev?.available_to_withdraw || '0',
              total_margin_used: d.total_margin_used || d.mu || prev?.total_margin_used || '0',
              positions_count: d.positions_count ?? d.pc ?? prev?.positions_count ?? 0,
              orders_count: d.orders_count ?? d.oc ?? prev?.orders_count ?? 0,
              fee_level: d.fee_level ?? d.f ?? prev?.fee_level,
              maker_fee: prev?.maker_fee,
              taker_fee: prev?.taker_fee,
            }));
          }
          if (msg.channel === 'account_order_updates' && msg.data) {
            setOrders(prev => {
              const map = new Map(prev.map(o => [o.i || o.order_id, o]));
              const items = Array.isArray(msg.data) ? msg.data : [msg.data];
              for (const o of items) {
                const id = o.i || o.order_id;
                if (o.os === 'filled' || o.os === 'cancelled') map.delete(id);
                else map.set(id, o);
              }
              return [...map.values()];
            });
          }
            // Real-time: when trade happens, claim gold from server
            if (msg.channel === 'account_trades' && msg.data) {
              scheduleClaimGold();
            }
        } catch {}
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        clearTimeout(pongTimer);
        refetchAll();
        scheduleReconnect();
      };
      ws.onerror = () => {
        if (!cancelled) {
          refetchAll();
          ws.close();
        }
      };
    }

    let cancelled = false;

    // Online/offline listeners — pause reconnect when offline, resume when back
    function handleOnline() {
      if (cancelled) return;
      clearTimeout(reconnectTimer);
      retryCount = 0;
      if (!ws || ws.readyState !== WebSocket.OPEN) connect();
    }
    function handleOffline() {
      clearTimeout(reconnectTimer);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    connect();
    restFallbackTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) refetchAll();
    }, 15000);
    const h = wsHandlersRef.current;
    h.fetchPrices?.();
    if (walletAddr) {
      h.fetchAccount?.();
      h.fetchPositions?.();
      h.fetchOrders?.();
      h.fetchWalletUsdc?.();
      h.fetchLeverageSettings?.();
    }

    return () => {
      cancelled = true;
      clearInterval(pingTimer);
      clearTimeout(pongTimer);
      clearTimeout(reconnectTimer);
      clearInterval(restFallbackTimer);
      clearTimeout(priceThrottleTimer);
      clearScheduledClaimGold();
      clearTimeout(withdrawTimerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); }
    };
  }, [walletAddr, isActiveDex, scheduleClaimGold, clearScheduledClaimGold]);

  // Safety net for fills missed by Pacifica websocket delivery or indexed
  // after the short post-order claim window. Runs only for the active
  // Pacifica tab and only while visible, so it keeps reward credit reliable
  // without turning every mounted hook into a background poller.
  useEffect(() => {
    if (!walletAddr || !isActiveDex) return;
    const fire = () => claimGold();
    const kickoff = setTimeout(fire, 5000);
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fire();
    }, 60_000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(iv);
    };
  }, [walletAddr, isActiveDex, claimGold]);

  // Fetch markets once
  useEffect(() => { fetchMarkets(); }, [fetchMarkets]);

  return {
    connected: !!walletAddr, walletAddr, account, positions, orders, prices, markets, walletUsdc, leverageSettings, marginModes, dataReady,
    loading, error, clearError, goldEarned, clearGoldEarned,
    depositToPacifica, withdraw, activate, claimGold,
    hasReferrer: builderApproved,
    linkOurReferrer: activate,
    setupVerified: walletAddr ? builderApproved : false,
    isReady: !!walletAddr && builderApproved,
    activationStep,
    placeMarketOrder, placeLimitOrder, closePosition, cancelOrder,
    setTpsl, setLeverage, setMarginMode,
    fetchAccount, fetchPositions, fetchOrders,
    // Agent wallet — opt-in 1-tap trading. `pacAgent` is null until the
    // user calls `bindAgent` (one master-wallet popup) — afterwards every
    // signed request goes through the agent key silently.
    pacAgent, bindAgent, bindingAgent, bindAgentError,
    forgetAgentLocally, revokeAgentOnServer,
  };
}
