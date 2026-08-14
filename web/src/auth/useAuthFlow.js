// Single source of truth for the register / login flow. Replaces the
// scattered useEffects + tried-flags that used to live in RegisterPanel.
//
// Design:
//   1. Resolver hooks (auth/resolvers.js) watch individual wallet sources
//      and report a candidate whenever their source has an address.
//   2. useAuthFlow picks the highest-priority candidate for the chosen
//      DEX, derives a display-name suggestion, and returns a single
//      `state` field plus an `actions` bag to the UI.
//   3. The UI is pure presentational — it renders based on `state` and
//      calls actions; no auth decisions happen in the component.
//
// States:
//   'booting'         — Farcaster SDK / Privy still resolving
//   'pick_dex'        — DEX picker on screen
//   'auto_connecting' — DEX chosen, waiting for any resolver to fire
//                       (short grace period before offering manual CTAs)
//   'need_name'       — candidate ready but no suggested name → form
//   'registering'     — register POST in flight
//   'manual_connect'  — no auto candidate; show connect buttons
//
// Terminal transitions happen when Godot acks `registered` and the
// parent flips `showRegister=false`, unmounting the panel.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { SolanaMobileWalletAdapterWalletName } from '@solana-mobile/wallet-standard-mobile';
import { useSignMessage as usePrivySolanaSignMessage } from '@privy-io/react-auth/solana';
import { useSend, useUI } from '../hooks/useGodot';
import { isDexAvailableInContext, useDex } from '../contexts/DexContext';
import { useFarcaster, getFarcasterEthProvider } from '../hooks/useFarcaster';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useSolanaMobile } from '../hooks/useSolanaMobile';
import { useSkrHandle } from '../hooks/useSkrHandle';
import { useOptionalPrivy } from '../components/PrivyAuthProvider';
import { writeLastPlayerDexPreference } from '../lib/lastPlayerDex';
import {
  useSolanaAdapterResolver,
  usePrivySolanaResolver,
  useEvmContextResolver,
  usePrivyEvmCandidate,
} from './resolvers';
import {
  readAccountProbeCache,
  walletCacheKey,
  writeAccountProbeCache,
} from './accountProbeCache';
import { addClientBreadcrumb, reportClientEvent } from '../lib/clientLogger';
import { createRegisterAttemptManager } from './registerAttemptManager';
import {
  dispatchGodotRegister,
  GODOT_REGISTER_BRIDGE_TIMEOUT_MS,
} from './godotRegisterBridge';
import {
  authWalletKindForDex,
  EVM_AUTH_DEX_IDS,
  SOLANA_AUTH_DEX_IDS,
} from './walletSelection';

const DEX_PICKED_KEY = 'clash_dex_picked';
const GAME_AUTH_STORAGE_KEY = 'clash_game_auth_v1';
const MANUAL_RECONNECT_KEY = 'clash_manual_reconnect_required';
const REFERRAL_STORAGE_KEY = 'clash_referral_code_v1';
const ACCOUNT_PROBE_TIMEOUT_MS = 10000;
const ACCOUNT_PROBE_MAX_RETRIES = 3;
const ACCOUNT_PROBE_UI_WAIT_MS = 4500;
const MANUAL_RECONNECT_WALLET_WAIT_MS = 8000;
const WALLET_AUTH_PROOF_TIMEOUT_MS = 20000;
const WALLET_AUTH_ACTION = 'wallet-auth';
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;
const EVM_AUTH_DEXES = new Set(EVM_AUTH_DEX_IDS);
const SOLANA_AUTH_DEXES = new Set(SOLANA_AUTH_DEX_IDS);
// How long to wait for an auto-resolver to produce a candidate before
// revealing the manual-connect CTAs. Keeps the spinner short when the
// user isn't authenticated anywhere; keeps the "Joining…" UX intact when
// Privy / FC SDK is still resolving.
const AUTO_CONNECT_GRACE_MS = 3000;

function authErrorMessage(message) {
  const text = String(message || '').trim();
  if (!text) return 'Registration failed. Try again.';
  if (/nickname is already taken/i.test(text)) return 'Nickname is already taken.';
  return text;
}

function readDexPicked() {
  try { return localStorage.getItem(DEX_PICKED_KEY) === '1'; } catch { return false; }
}
function writeDexPicked(v) {
  try {
    if (v) localStorage.setItem(DEX_PICKED_KEY, '1');
    else localStorage.removeItem(DEX_PICKED_KEY);
  } catch { /* storage disabled */ }
}

function readManualReconnectRequired() {
  try { return localStorage.getItem(MANUAL_RECONNECT_KEY) === '1'; } catch { return false; }
}

function writeManualReconnectRequired(v) {
  try {
    if (v) localStorage.setItem(MANUAL_RECONNECT_KEY, '1');
    else localStorage.removeItem(MANUAL_RECONNECT_KEY);
  } catch { /* storage disabled */ }
}

function canonicalWalletAddress(address) {
  const raw = String(address || '').trim();
  if (!raw) return '';
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) return raw.toLowerCase();
  if (/^0x[0-9a-fA-F]{1,64}$/.test(raw)) {
    return `0x${raw.replace(/^0x/i, '').padStart(64, '0').toLowerCase()}`;
  }
  return raw;
}

function walletAddressChainType(wallet) {
  const raw = String(wallet || '').trim();
  if (!raw) return 'unknown';
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) return 'evm';
  if (/^0x[0-9a-fA-F]{1,64}$/.test(raw)) return 'aptos';
  return 'solana';
}

function walletChainTypeForDex(wallet, dex) {
  const walletType = walletAddressChainType(wallet);
  if (walletType !== 'unknown') return walletType;
  return authWalletKindForDex(dex);
}

function walletAuthMessage({ wallet, dex, issuedAt }) {
  return [
    'Clash wallet auth',
    `Action: ${WALLET_AUTH_ACTION}`,
    `Wallet: ${canonicalWalletAddress(wallet)}`,
    `DEX: ${String(dex || '').toLowerCase()}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

function withTimeout(promise, ms, message) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function bytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  let binary = '';
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary);
}

function bytesToHex(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  return `0x${Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')}`;
}

function signatureToHex(signature) {
  if (!signature) return '';
  if (typeof signature === 'string') return signature.startsWith('0x') ? signature : `0x${signature}`;
  if (signature instanceof Uint8Array || Array.isArray(signature)) return bytesToHex(signature);
  if (typeof signature.toUint8Array === 'function') return bytesToHex(signature.toUint8Array());
  if (typeof signature.bcsToBytes === 'function') return bytesToHex(signature.bcsToBytes());
  if (typeof signature.toString === 'function') {
    const text = signature.toString();
    return text.startsWith('0x') ? text : `0x${text}`;
  }
  return '';
}

let cachedFarcasterSolanaProvider = null;
async function signFarcasterSolanaMessage(messageBytes) {
  try {
    if (!cachedFarcasterSolanaProvider) {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      cachedFarcasterSolanaProvider = await sdk.wallet.getSolanaProvider();
    }
    if (!cachedFarcasterSolanaProvider?.signMessage) return null;
    const res = await cachedFarcasterSolanaProvider.signMessage(bytesToBase64(messageBytes));
    if (!res?.signature) return null;
    return Uint8Array.from(atob(res.signature), c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function readStoredAuthWallet() {
  try {
    const raw = localStorage.getItem(GAME_AUTH_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return canonicalWalletAddress(parsed?.wallet || '');
  } catch {
    return '';
  }
}

function normalizeReferralCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\/?r\//, '')
    .split(/[?#]/)[0]
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 48);
}

function readReferralCodeFromLocation() {
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(window.location.href);
    const queryCode = url.searchParams.get('ref') || url.searchParams.get('invite') || '';
    if (queryCode) return normalizeReferralCode(queryCode);
    const match = url.pathname.match(/\/r\/([^/]+)/i);
    return normalizeReferralCode(match?.[1] || '');
  } catch {
    return '';
  }
}

function readStoredReferralCode() {
  try {
    const fromUrl = readReferralCodeFromLocation();
    if (fromUrl) {
      localStorage.setItem(REFERRAL_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return normalizeReferralCode(localStorage.getItem(REFERRAL_STORAGE_KEY) || '');
  } catch {
    return readReferralCodeFromLocation();
  }
}

function hasStoredGameAuth() {
  try {
    if (window._playerToken) return true;
    const raw = localStorage.getItem(GAME_AUTH_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!parsed?.token;
  } catch {
    return false;
  }
}

export function useAuthFlow() {
  const { sendToGodot } = useSend();
  const { dex, setDex } = useDex();
  const { isInFrame, user: fcUser, loading: fcLoading } = useFarcaster();
  // Solana Mobile (Saga / Seeker) detection — used to lock the user into
  // the Solana DEX flow and auto-trigger MWA wallet connection when Privy
  // is not available. `ready`
  // gates the auto-pick effect so we don't briefly render the DEX picker.
  const { isSolanaMobile, ready: smReady } = useSolanaMobile();
  // Direct handle on the Solana wallet adapter so we can fire the MWA
  // `select + connect` programmatically — without it the user would have
  // to tap the wallet picker even though we know exactly which adapter
  // (Mobile Wallet Adapter) we want on Saga/Seeker.
  const solWallet = useSolWallet();
  let privySolanaSignMessage = null;
  if (PRIVY_ENABLED) {
    // VITE_PRIVY_APP_ID is a build-time constant, so this hook order is stable.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signMessage } = usePrivySolanaSignMessage();
    privySolanaSignMessage = signMessage;
  }
  const { showRegister } = useUI();
  const showRegisterRef = useRef(showRegister);
  showRegisterRef.current = showRegister;
  const {
    enabled: privyEnabled,
    ready: privyReady,
    authenticated: privyAuthed,
    login: privyLogin,
    logout: privyLogout,
    solanaWallets: privySolanaWallets,
  } = useOptionalPrivy();
  const evmWallet = useEvmWallet();
  const { setExternalProvider: setEvmProvider, disconnect: evmDisconnect } = evmWallet;

  const [dexPicked, setDexPickedState] = useState(readDexPicked);
  const [manualReconnectRequired, setManualReconnectRequired] = useState(readManualReconnectRequired);
  const referralCodeRef = useRef(readStoredReferralCode());

  // Refs shared across effects below — declared up-front so the
  // session-reset effect can clear them before the resolver machinery
  // attempts to re-use stale state.
  const lastRegisteredRef = useRef(null);
  const registerAttemptManagerRef = useRef(null);
  if (!registerAttemptManagerRef.current) {
    registerAttemptManagerRef.current = createRegisterAttemptManager();
  }
  const fcEvmTriedRef = useRef(false);
  // Set to true by pickDex when the user explicitly switches DEX while
  // already logged in. The session-reset useEffect (which fires on
  // show_register=true) checks this so it skips its dexPicked-reset
  // step — the user picked their new DEX BEFORE the logout was sent, we
  // don't want to bounce them back to the DEX picker after the Godot
  // side fires show_register. Cleared in the same effect after one use.
  const intentionalDexSwitchRef = useRef(false);

  // `readyForRegister` gates the auto-register effect so it can't fire on
  // the SAME render where the session-reset effect detected a show_register
  // transition. Without this gate the register effect sees stale localStorage
  // (`dexPicked=1`) and stale EvmWalletContext (silent-reconnected old
  // wallet) on the first render after admin-delete, fires a register with
  // the stale wallet, and silently re-creates the account the admin just
  // deleted. The gate is lifted in the same reset effect (setReadyForRegister
  // is batched with the state clears, so the NEXT render has both the
  // cleared state AND the gate lifted).
  const [readyForRegister, setReadyForRegister] = useState(false);

  const clearManualReconnectRequired = useCallback(() => {
    writeManualReconnectRequired(false);
    setManualReconnectRequired(false);
  }, []);

  useEffect(() => {
    const manager = registerAttemptManagerRef.current;
    return () => manager.cancelCurrent();
  }, []);

  useEffect(() => {
    if (!showRegister) registerAttemptManagerRef.current?.cancelCurrent();
  }, [showRegister]);

  useEffect(() => {
    const onManualReconnectRequired = () => {
      writeManualReconnectRequired(true);
      setManualReconnectRequired(true);
      lastRegisteredRef.current = null;
      fcEvmTriedRef.current = false;
    };
    window.addEventListener('clash-auth-manual-reconnect-required', onManualReconnectRequired);
    return () => window.removeEventListener('clash-auth-manual-reconnect-required', onManualReconnectRequired);
  }, []);

  // A DEX can be valid globally but unavailable in the current host. Decibel
  // needs an Aptos wallet-standard provider (Petra/etc.), which Farcaster
  // mini apps do not expose, so a cached Decibel choice must fall back to the
  // picker instead of landing on an impossible connect screen. Saga/Seeker
  // is the same story for every non-Solana DEX (no MWA flow for Base /
  // Arbitrum / Aptos / Monad signing).
  useEffect(() => {
    const ctx = { isInFrame, isSolanaMobile };
    if (isDexAvailableInContext(dex, ctx)) return;
    setDex('pacifica');
    writeDexPicked(false);
    setDexPickedState(false);
    lastRegisteredRef.current = null;
    fcEvmTriedRef.current = false;
  }, [dex, isInFrame, isSolanaMobile, setDex]);

  // Saga/Seeker: keep the cached DEX on a Solana-native venue. Now that
  // Phoenix is also Solana-native, we keep the DEX picker available instead
  // of silently locking the device to Pacifica.
  useEffect(() => {
    if (!smReady || !isSolanaMobile) return;
    if (dex !== 'pacifica' && dex !== 'phoenix' && dex !== 'gmtrade' && dex !== 'flash') setDex('pacifica');
  }, [smReady, isSolanaMobile, dex, setDex]);

  // Saga/Seeker auto-connect: once the page settles, programmatically select
  // + connect the Mobile Wallet Adapter. When Privy is enabled, skip the
  // automatic prompt so the login screen can show the email option first.
  // The manual Solana wallet button still opens MWA for users who want it.
  // The OS
  // shows the Seed Vault confirmation; one tap and the user's pubkey is
  // available. Without this the user would still have to open the wallet
  // modal and click MWA themselves. Idempotent — only runs while
  // `solWallet.connecting` is false and we don't already have a pubkey.
  const seekerAutoConnectTriedRef = useRef(false);
  useEffect(() => {
    if (!smReady || !isSolanaMobile) return;
    if (seekerAutoConnectTriedRef.current) return;
    if (!solWallet || solWallet.connected || solWallet.connecting) return;
    if (!solWallet.select || !solWallet.connect) return;
    seekerAutoConnectTriedRef.current = true;
    if (privyEnabled) return;
    addClientBreadcrumb('wallet.connect_start', { source: 'seeker_mwa', dex });
    const mwaNames = [
      SolanaMobileWalletAdapterWalletName,
      'Mobile Wallet Adapter',
      'Remote Mobile Wallet Adapter',
    ];
    const availableMwa = mwaNames.find((name) => (
      Array.isArray(solWallet.wallets)
      && solWallet.wallets.some((wallet) => (
        wallet?.adapter?.name === name
        || wallet?.name === name
      ))
    )) || SolanaMobileWalletAdapterWalletName;
    try { solWallet.select(availableMwa); } catch { /* noop */ }
    Promise.resolve(solWallet.connect()).then(() => {
      addClientBreadcrumb('wallet.connect_success', { source: 'seeker_mwa', dex, adapter: availableMwa });
    }).catch(e => {
      // User dismissed the Seed Vault prompt, or no MWA host actually
      // present (we trusted the readyState check but the device rejected).
      // Don't retry on the same device — they can manually connect via
      // the wallet modal as a fallback.
      addClientBreadcrumb('wallet.connect_fail', {
        source: 'seeker_mwa',
        dex,
        adapter: availableMwa,
        message: e?.message || String(e || ''),
      }, 'warn');
      console.warn('[useAuthFlow] Seeker auto-connect failed:', e?.message || e);
    });
  }, [smReady, isSolanaMobile, solWallet, dex, privyEnabled]);

  // Session-invalidated reset. Godot sends `show_register` in two cases:
  //   (a) brand-new user — nothing to clean, all flags are already clear
  //   (b) existing user whose token became invalid (admin delete, account
  //       purge, token expiry) — stale localStorage still says dexPicked=1
  //       and the silent EVM reconnect may have re-hydrated an old wallet,
  //       so resolvers would fire and silently re-register the user into a
  //       new account they didn't ask for.
  // We detect the transition (showRegister goes from false → true) and wipe
  // the persisted dex + external-EVM state so the user lands on the DEX
  // picker with a clean slate. The initial false→true transition on page
  // load also fires, but the cleanup is idempotent (no-op on fresh state).
  const prevShowRegisterRef = useRef(false);
  const showRegisterBootedRef = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const prev = prevShowRegisterRef.current;
    prevShowRegisterRef.current = showRegister;
    if (!showRegisterBootedRef.current) {
      showRegisterBootedRef.current = true;
      setReadyForRegister(true);
      if (!showRegister || hasStoredGameAuth()) return;
    }
    if (!showRegister || prev) return; // only on false→true
    // Skip the dexPicked-reset path when this show_register was triggered
    // by an intentional DEX switch (pickDex called Godot logout to flip
    // identity to the new (wallet, dex) row). The user already picked
    // their new DEX — bouncing them to the DEX picker would erase that
    // choice. We still let the rest of the cleanup run (clear external
    // wallet rdns, Privy session, register-dedup ref) because we DO want
    // a fresh register to fire against the new DEX.
    const intentional = intentionalDexSwitchRef.current;
    if (intentional) {
      // Intentional DEX switch — keep the user logged in to their wallet
      // (Privy session, MetaMask connection, FC frame provider all stay
      // alive), just need a new player-row register on the new DEX. So
      // we skip the picker-reset, evmDisconnect, and privyLogout.
      intentionalDexSwitchRef.current = false;
    } else {
      // Session invalidated by the server (admin delete, token expiry).
      // Wipe everything so the user lands on the DEX picker with a clean
      // slate and must explicitly re-connect a wallet.
      writeDexPicked(false);
      setDexPickedState(false);
      try { evmDisconnect(); } catch { /* noop */ }
      if (privyEnabled && privyAuthed) {
        Promise.resolve(privyLogout()).catch(() => { /* noop */ });
      }
    }
    // Allow register to fire again for the next candidate.
    lastRegisteredRef.current = null;
    fcEvmTriedRef.current = false;
    // Lift the register gate on the SAME batched render so the next render
    // sees (dexPicked=false, readyForRegister=true). User must pick DEX
    // first; register fires only after an explicit resolver candidate
    // materialises under the new (post-reset) state.
    setReadyForRegister(true);
  }, [showRegister, evmDisconnect, privyEnabled, privyAuthed, privyLogout]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Resolvers: each is a hook that watches one source. useAuthFlow combines.
  const solAdapter = useSolanaAdapterResolver(isInFrame);
  const privySol = usePrivySolanaResolver();
  const evmContext = useEvmContextResolver();
  const privyEvm = usePrivyEvmCandidate();
  // Aptos wallet (Petra) — exposed as a candidate for Decibel registration.
  // Inline rather than a separate resolver hook because there's exactly
  // one source for Aptos right now (the AptosWalletContext) and adding a
  // wrapper would just duplicate its interface.
  const aptosWallet = useAptosWallet();
  const aptosCandidate = useMemo(() => {
    if (!aptosWallet?.address) return null;
    return { wallet: aptosWallet.address, source: 'aptos' };
  }, [aptosWallet?.address]);

  // Farcaster EVM: not a hook (SDK call is imperative). We trigger it once
  // when Avantis is picked + in frame, and feed the resulting provider
  // into EvmWalletContext. Post-push it surfaces via useEvmContextResolver.
  // (fcEvmTriedRef is declared up-front alongside lastRegisteredRef.)
  useEffect(() => {
    if (!isInFrame || !fcUser) return;
    if (dex !== 'avantis') return;
    if (!dexPicked) return;
    if (evmContext) return; // already have a wallet in context
    if (fcEvmTriedRef.current) return;
    fcEvmTriedRef.current = true;

    (async () => {
      const prov = await getFarcasterEthProvider();
      if (!prov) return; // fcNoEvm — manual UI will kick in after grace window
      try {
        addClientBreadcrumb('wallet.connect_start', { source: 'farcaster_evm', dex });
        const accounts = await prov.request({ method: 'eth_requestAccounts' });
        const addr = accounts && accounts[0];
        if (addr) {
          // Don't persist FC provider's rdns — valid only inside the frame.
          setEvmProvider(prov, addr, null, 'farcaster');
          addClientBreadcrumb('wallet.connect_success', { source: 'farcaster_evm', dex });
        }
      } catch (err) {
        addClientBreadcrumb('wallet.connect_fail', {
          source: 'farcaster_evm',
          dex,
          message: err?.message || String(err || ''),
        }, 'warn');
        console.warn('[auth] FC eth_requestAccounts failed:', err?.message || err);
      }
    })();
  }, [isInFrame, fcUser, dex, dexPicked, evmContext, setEvmProvider]);

  // Reset the FC EVM attempt guard when the user logs out or switches DEX
  // away from Avantis, so re-entering Avantis re-attempts the request.
  useEffect(() => {
    if (!dexPicked || dex !== 'avantis' || !isInFrame) fcEvmTriedRef.current = false;
  }, [dexPicked, dex, isInFrame]);

  // Pick the highest-priority candidate for the active DEX.
  // Priority (Avantis): EvmWalletContext (covers FC, external-reconnected,
  //   and Privy-resolved) → Privy EVM candidate (Privy authenticated but
  //   embedded wallet not yet materialised).
  // Priority (Decibel): Petra (only source — no FC/Privy alternative yet).
  // Priority (Pacifica): Solana adapter (covers FC Solana auto-connect
  //   and external-connected) → Privy Solana.
  const storedAuthWallet = useMemo(() => readStoredAuthWallet(), [showRegister, manualReconnectRequired]);
  const rawCandidate = useMemo(() => {
    const candidates = [evmContext, privyEvm, privySol, solAdapter, aptosCandidate].filter(Boolean);
    if (storedAuthWallet) {
      const storedMatch = candidates.find(c => c?.wallet && canonicalWalletAddress(c.wallet) === storedAuthWallet);
      if (storedMatch) return storedMatch;
    }
    if (!dexPicked) return null;
    // Avantis (Base), GMX (Arbitrum), Monad and Hyperliquid all source from the same EVM wallet
    // context. The wallet address is the same on every EVM chain — the chain
    // switch happens at tx time via ensureChain(). Privy embedded EVM works
    // for both because the wallet itself is chain-agnostic; only the
    // walletClient transport gets re-bound per-DEX (see EvmWalletContext
    // .getWalletClient(chainId) — Avantis uses Base, GMX uses Arbitrum).
    if (EVM_AUTH_DEXES.has(dex)) return evmContext || privyEvm || privySol || solAdapter || aptosCandidate || null;
    if (dex === 'decibel') return aptosCandidate || evmContext || privyEvm || privySol || solAdapter || null;
    if (dex === 'pacifica' || dex === 'phoenix' || dex === 'gmtrade' || dex === 'flash') {
      const farcasterSol = solAdapter?.source === 'farcaster' ? solAdapter : null;
      return farcasterSol || privySol || solAdapter || evmContext || privyEvm || aptosCandidate || null;
    }
    return evmContext || privyEvm || privySol || solAdapter || aptosCandidate || null;
  }, [dex, dexPicked, evmContext, privyEvm, aptosCandidate, solAdapter, privySol, storedAuthWallet]);
  const rawCandidateWallet = rawCandidate?.wallet ? canonicalWalletAddress(rawCandidate.wallet) : '';
  const manualReconnectSatisfied = !!(
    manualReconnectRequired &&
    storedAuthWallet &&
    rawCandidateWallet &&
    storedAuthWallet === rawCandidateWallet
  );
  const candidate = manualReconnectRequired && !manualReconnectSatisfied ? null : rawCandidate;
  const [manualReconnectWaitExpired, setManualReconnectWaitExpired] = useState(false);
  const createWalletAuthProof = useCallback(async ({ wallet, dex: proofDex, source }) => {
    if (!wallet || String(wallet).startsWith('local_guest_')) return null;
    const issuedAt = new Date().toISOString();
    const canonicalWallet = canonicalWalletAddress(wallet);
    const chainType = walletChainTypeForDex(canonicalWallet, proofDex);
    const message = walletAuthMessage({ wallet: canonicalWallet, dex: proofDex, issuedAt });
    if (chainType === 'solana') {
      const messageBytes = new TextEncoder().encode(message);
      let sigBytes = null;
      if (source === 'farcaster' || isInFrame) {
        sigBytes = await signFarcasterSolanaMessage(messageBytes);
      }
      if (!sigBytes && source === 'privy' && privySolanaSignMessage) {
        const walletObj = (privySolanaWallets || []).find(w => w?.address === wallet || w?.address === canonicalWallet)
          || (privySolanaWallets || []).find(w => w?.walletClientType === 'privy')
          || (privySolanaWallets || [])[0]
          || null;
        if (walletObj) {
          const result = await privySolanaSignMessage({ message: messageBytes, wallet: walletObj });
          sigBytes = result?.signature || result;
        }
      }
      if (!sigBytes && typeof solWallet?.signMessage === 'function') {
        sigBytes = await solWallet.signMessage(messageBytes);
      }
      if (!sigBytes) throw new Error('Wallet signature required. Connect your Solana wallet again.');
      return {
        action: WALLET_AUTH_ACTION,
        chain_type: chainType,
        wallet: canonicalWallet,
        dex: String(proofDex || '').toLowerCase(),
        issued_at: issuedAt,
        message,
        signature: typeof sigBytes === 'string' ? sigBytes : bytesToBase64(sigBytes),
        signature_encoding: typeof sigBytes === 'string' ? '' : 'base64',
      };
    }
    if (chainType === 'evm') {
      let signature = '';
      if (evmWallet?.walletClient?.signMessage) {
        signature = await evmWallet.walletClient.signMessage({ account: canonicalWallet, message });
      } else if (evmWallet?.provider?.request) {
        signature = await evmWallet.provider.request({
          method: 'personal_sign',
          params: [message, canonicalWallet],
        });
      }
      if (!signature) throw new Error('Wallet signature required. Connect your EVM wallet again.');
      return {
        action: WALLET_AUTH_ACTION,
        chain_type: chainType,
        wallet: canonicalWallet,
        dex: String(proofDex || '').toLowerCase(),
        issued_at: issuedAt,
        message,
        signature,
      };
    }
    if (chainType === 'aptos') {
      if (typeof aptosWallet?.signMessage !== 'function') {
        throw new Error('Wallet signature required. Connect Petra again.');
      }
      if (!aptosWallet?.publicKey) {
        throw new Error('Aptos public key unavailable. Reconnect Petra and try again.');
      }
      const signed = await aptosWallet.signMessage({ message, nonce: issuedAt });
      return {
        action: WALLET_AUTH_ACTION,
        chain_type: chainType,
        wallet: canonicalWallet,
        dex: String(proofDex || '').toLowerCase(),
        issued_at: issuedAt,
        message,
        full_message: signed?.fullMessage || '',
        public_key: aptosWallet.publicKey,
        signature: signatureToHex(signed?.signature),
        signature_encoding: 'hex',
      };
    }
    throw new Error('Unsupported wallet type. Reconnect your wallet.');
  }, [
    aptosWallet,
    evmWallet?.provider,
    evmWallet?.walletClient,
    isInFrame,
    privySolanaSignMessage,
    privySolanaWallets,
    solWallet,
  ]);

  useEffect(() => {
    setManualReconnectWaitExpired(false);
    if (!manualReconnectRequired || manualReconnectSatisfied || rawCandidateWallet || !storedAuthWallet || !dexPicked) {
      return undefined;
    }
    const timer = setTimeout(() => setManualReconnectWaitExpired(true), MANUAL_RECONNECT_WALLET_WAIT_MS);
    return () => clearTimeout(timer);
  }, [manualReconnectRequired, manualReconnectSatisfied, rawCandidateWallet, storedAuthWallet, dexPicked, dex]);

  useEffect(() => {
    if (!manualReconnectSatisfied) return;
    writeManualReconnectRequired(false);
    setManualReconnectRequired(false);
    addClientBreadcrumb('auth.manual_reconnect_satisfied', {
      dex,
      source: rawCandidate?.source || null,
    });
  }, [manualReconnectSatisfied, dex, rawCandidate?.source]);

  // Seeker `.skr` handle — only resolves on Saga/Seeker hardware (the hook
  // gates internally), so on every other host this is a free no-op. We feed
  // the result into `suggestedName` AND expose it to RegisterPanel so the
  // form can render a one-tap "Use my .skr handle" button when the user
  // would prefer to override the default with the bare wallet handle.
  const { handle: seekerHandle } = useSkrHandle(candidate?.wallet);

  // Suggested display name. FC username always wins when present (matches
  // user expectation: "when I'm on Farcaster, use my FC name"). Email
  // prefix is a fallback for Privy flows outside frames.
  //
  // For plain external wallets (no FC, no email) we ALSO derive a placeholder
  // `player_<walletSlice>` so the register flow never stalls on `need_name`
  // for returning users. `js_bridge.gd:_do_register` recognises the
  // `player_` prefix as auto-derived and routes to `login_by_wallet` first —
  // existing accounts resolve to their stored name, brand-new ones land with
  // this default (editable later in the profile). Without this fallback every
  // returning MetaMask / Phantom user sees the name form even though they
  // already have an account server-side.
  //
  // Seeker priority: a Seeker user's `.skr` handle (without the TLD, capped
  // at 20 chars by the server) takes precedence over `player_<hex>` because
  // it's the identity Solana Mobile already issued them. FC still wins inside
  // a frame (FC username is the strongest signal there).
  const suggestedName = useMemo(() => {
    if (fcUser) return String(fcUser.username || fcUser.displayName || 'fc_' + fcUser.fid);
    const email = candidate?.email || privyEvm?.email || privySol?.email;
    if (email) return email.split('@')[0].slice(0, 20);
    if (seekerHandle?.name) return seekerHandle.name.slice(0, 20);
    if (candidate?.wallet) {
      // Strip 0x prefix for EVM; Solana base58 addresses have no prefix.
      const raw = String(candidate.wallet).replace(/^0x/i, '');
      return 'player_' + raw.slice(0, 6).toLowerCase();
    }
    return null;
  }, [fcUser, candidate, privyEvm, privySol, seekerHandle]);

  // (lastRegisteredRef is declared up-front alongside fcEvmTriedRef.)
  // It tracks the last wallet we fired register for; clears on session
  // reset or logout so a new candidate can re-fire register.
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  useEffect(() => {
    setRegisterError('');
  }, [candidate?.wallet, dex]);

  // Silent return-probe: before showing the name form to non-FC users, ask
  // the server whether an account already exists for this wallet. If yes,
  // we can skip the form and auto-register under their stored name (fast-
  // path identical to the pre-fix behaviour). If no, the form appears so
  // the user can pick their own display name instead of being silently
  // saddled with `bobemail` (email prefix) or `player_<hex>`.
  //
  // Keyed by wallet so a wallet switch re-probes. Values:
  //   undefined → not yet probed
  //   null      → probed, no account (show form)
  //   string    → probed, account found with this stored name
  const [probedNameByWallet, setProbedNameByWallet] = useState({});
  const probeInFlightRef = useRef({});
  const probeVerifiedRef = useRef({});
  const probeRetryTimerRef = useRef({});
  const probeRetryCountRef = useRef({});
  useEffect(() => () => {
    Object.values(probeRetryTimerRef.current || {}).forEach((timer) => clearTimeout(timer));
    probeRetryTimerRef.current = {};
    probeRetryCountRef.current = {};
  }, []);
  useEffect(() => {
    if (!candidate?.wallet) return;
    if (fcUser) return; // FC users keep the existing fast-path
    const authDex = dexPicked ? dex : '';
    // Probe is now per-(wallet, dex). The same wallet has a separate
    // account on each DEX, so we re-probe whenever the user switches
    // DEX. Old code keyed by wallet alone and returned the user's
    // Avantis name when they switched to GMX — leading to "I'm logged
    // in as my Avantis account on GMX" confusion.
    const key = walletCacheKey(candidate.wallet, authDex);
    const cached = readAccountProbeCache(candidate.wallet, authDex);
    if (!(key in probedNameByWallet) && cached !== undefined) {
      setProbedNameByWallet(prev => (
        key in prev ? prev : { ...prev, [key]: cached }
      ));
    }
    if (probeVerifiedRef.current[key]) return;
    if (probeInFlightRef.current[key]) return;
    if (probeRetryTimerRef.current[key]) return;
    probeInFlightRef.current[key] = true;
    (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ACCOUNT_PROBE_TIMEOUT_MS);
      let verified = false;
      try {
        const body = { wallet: candidate.wallet, probeOnly: true };
        if (authDex) body.dex = authDex;
        const r = await fetch('/api/players/login-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify(body),
        });
        if (r.ok) {
          const data = await r.json();
          // Sanity-check the dex tag on the returned row. Legacy / older
          // server versions whose VALID_DEXES set didn't yet include the
          // active dex would silently fall through to a wallet-only lookup
          // and hand back a row from a DIFFERENT dex (e.g. user picks
          // Perpl/Monad → server returns their gmx row because 'monad'
          // wasn't in VALID_DEXES). That made the probe cache "exists with
          // name X" when no row for THIS dex actually existed; the auto-
          // register effect then fired without showing the name form and
          // the server's name-collision suffix kicked in (ggkhg → ggkhg1).
          // Treat any cross-dex response as "no account on this dex".
          const name = data?.name || null;
          writeAccountProbeCache(candidate.wallet, authDex, name);
          probeRetryCountRef.current[key] = 0;
          setProbedNameByWallet(prev => ({ ...prev, [key]: name }));
          verified = true;
        } else if (r.status === 404 || r.status === 400) {
          // 404 (no account on THIS DEX) / 400 (invalid wallet) → treat
          // as new user for this DEX. They may have an account on a
          // different DEX with the same wallet — that's fine, switching
          // DEX in the picker will re-probe and find it.
          writeAccountProbeCache(candidate.wallet, authDex, null);
          probeRetryCountRef.current[key] = 0;
          setProbedNameByWallet(prev => ({ ...prev, [key]: null }));
          verified = true;
        } else {
          throw new Error(`/api/players/login-wallet -> ${r.status}`);
        }
      } catch (e) {
        // Network/5xx/timeout errors are not proof that the account is
        // missing. Retry instead of showing the nickname form; otherwise
        // returning users see "enter nickname" and then still log in under
        // their existing server-side name.
        addClientBreadcrumb('auth.probe_retry', {
          dex,
          wallet: candidate.wallet,
          message: e?.message || String(e || ''),
        }, 'warn');
        const retryCount = (probeRetryCountRef.current[key] || 0) + 1;
        probeRetryCountRef.current[key] = retryCount;
        if (retryCount >= ACCOUNT_PROBE_MAX_RETRIES) {
          setRegisterError('Could not verify this wallet account. Go back and reconnect, or try again after the server responds.');
          setProbedNameByWallet(prev => ({ ...prev, [key]: null }));
          verified = true;
          return;
        }
        probeRetryTimerRef.current[key] = setTimeout(() => {
          delete probeRetryTimerRef.current[key];
          probeVerifiedRef.current[key] = false;
          setProbedNameByWallet(prev => ({ ...prev }));
        }, 1200);
      } finally {
        clearTimeout(timer);
        probeVerifiedRef.current[key] = verified;
        probeInFlightRef.current[key] = false;
      }
    })();
  }, [candidate, dex, dexPicked, fcUser, probedNameByWallet]);

  // Resolved existing-account name (or null if none / not yet probed).
  const candidateWalletKey = candidate?.wallet ? walletCacheKey(candidate.wallet, dexPicked ? dex : '') : '';
  const existingAccountName = candidateWalletKey
    ? probedNameByWallet[candidateWalletKey]
    : undefined;
  const isFarcasterCandidate = !!fcUser;
  const [probeWaitExpired, setProbeWaitExpired] = useState(false);
  useEffect(() => {
    setProbeWaitExpired(false);
    if (!candidateWalletKey || existingAccountName !== undefined || isFarcasterCandidate) return undefined;
    const timer = setTimeout(() => setProbeWaitExpired(true), ACCOUNT_PROBE_UI_WAIT_MS);
    return () => clearTimeout(timer);
  }, [candidateWalletKey, existingAccountName, isFarcasterCandidate]);

  // Boot grace — if FC SDK or Privy is still resolving, don't show the
  // manual-connect screen yet. Also a short timer after dex-pick so we
  // give auto-resolvers a chance before offering manual CTAs.
  const booting =
    !smReady ||
    (isInFrame && fcLoading) ||
    (privyEnabled && !privyReady);

  // Grace timer: sync state with the "user just picked a DEX" boundary.
  // We want to delay showing manual-connect CTAs for AUTO_CONNECT_GRACE_MS
  // to give resolvers a chance to fire. Reset whenever dex or dexPicked
  // change — this is an external-boundary-triggered state sync, which is
  // a legitimate useEffect setState (though ESLint's heuristic flags it).
  const [graceExpired, setGraceExpired] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!dexPicked && !candidate?.wallet) { setGraceExpired(true); return; }
    setGraceExpired(false);
    const t = setTimeout(() => setGraceExpired(true), AUTO_CONNECT_GRACE_MS);
    return () => clearTimeout(t);
  }, [dexPicked, dex, candidate?.wallet]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Derive the rendering state.
  //
  // Non-Farcaster candidates follow this flow:
  //   1. Probe `/api/players/login-wallet` (silent, see effect above).
  //   2. If account exists → auto-register under stored name (fast-path,
  //      user doesn't see the form — same UX as before this fix).
  //   3. If no account → `need_name` form so user can pick their display
  //      name instead of being silently saddled with an email-prefix or
  //      `player_<hex>` fallback.
  //
  // Farcaster users always auto-register with their handle.
  //
  // While the probe is in flight we stay in `auto_connecting` so the UI
  // shows the existing "Joining…" spinner rather than flickering into the
  // name form and then straight back out.
  const probeInFlight = candidate?.wallet && !isFarcasterCandidate &&
    existingAccountName === undefined;
  // Do not fall through to the nickname form while the wallet-account probe
  // is still unknown. The timeout is useful for diagnostics, but it is not
  // proof that this is a new account; returning users were seeing `need_name`
  // while `/api/players/login-wallet` was still resolving or retrying.
  const probeBlockingUi = !!probeInFlight;
  const authDebug = useMemo(() => ({
    dex,
    dexPicked,
    booting,
    graceExpired,
    registering,
    hasCandidate: !!candidate,
    candidateSource: candidate?.source || null,
    candidateWallet: candidate?.wallet || null,
    probeInFlight: !!probeInFlight,
    probeBlockingUi: !!probeBlockingUi,
    probeWaitExpired,
    existingAccountState: existingAccountName === undefined
      ? 'unknown'
      : existingAccountName === null
        ? 'missing'
        : 'found',
    hasSuggestedName: !!suggestedName,
    isFarcasterCandidate,
    showRegister,
    readyForRegister,
    privyEnabled,
    privyReady,
    privyAuthed,
    manualReconnectRequired,
    manualReconnectSatisfied,
    manualReconnectWaitExpired,
    storedAuthWalletPresent: !!storedAuthWallet,
    smReady,
    isInFrame,
    fcLoading,
  }), [
    dex, dexPicked, booting, graceExpired, registering, candidate,
    probeInFlight, probeBlockingUi, probeWaitExpired, existingAccountName, suggestedName, isFarcasterCandidate,
    showRegister, readyForRegister, privyEnabled, privyReady, privyAuthed,
    manualReconnectRequired, manualReconnectSatisfied, manualReconnectWaitExpired, storedAuthWallet, smReady, isInFrame, fcLoading,
  ]);

  const state = useMemo(() => {
    if (registerError && candidate) return 'need_name';
    if (registering) return 'registering';
    if (booting) return 'booting';
    // An explicit unpick must always reach the DEX picker. Previously a
    // remembered auth wallet kept this condition false, so CHANGE appeared
    // to do nothing and the same reconnect screen rendered again.
    if (!dexPicked && !manualReconnectRequired) return 'pick_dex';
    if (
      manualReconnectRequired &&
      !manualReconnectSatisfied &&
      storedAuthWallet &&
      dexPicked &&
      !rawCandidateWallet &&
      !manualReconnectWaitExpired
    ) return 'auto_connecting';
    if (manualReconnectRequired && !manualReconnectSatisfied) return 'manual_connect';
    if (!candidate && !dexPicked) return 'manual_connect';
    if (!candidate && dexPicked && !graceExpired) return 'auto_connecting';
    // FC fast-path: auto-register with FC handle.
    if (candidate && suggestedName && isFarcasterCandidate) return 'registering';
    // Non-FC: wait for a definitive probe result, including retrying
    // transient network/server failures.
    if (candidate && probeBlockingUi) return 'auto_connecting';
    // Returning user — server already has an account for this wallet;
    // fire register with their stored name (which is auto-derived-safe so
    // Godot's login_by_wallet fast-path takes over and no rename happens).
    if (candidate && existingAccountName) return 'confirm_login';
    // Brand-new user — prompt for a display name.
    if (candidate) return 'need_name';
    if (!graceExpired) return 'auto_connecting';
    return 'manual_connect';
  }, [registerError, registering, booting, dexPicked, candidate, suggestedName, graceExpired,
      isFarcasterCandidate, probeBlockingUi, existingAccountName, manualReconnectRequired, manualReconnectSatisfied,
      storedAuthWallet, rawCandidateWallet, manualReconnectWaitExpired]);

  const lastAuthStateLogRef = useRef('');
  useEffect(() => {
    const key = JSON.stringify({
      state,
      dex,
      dexPicked,
      booting,
      graceExpired,
      hasCandidate: !!candidate,
      candidateSource: candidate?.source || null,
      probeInFlight: !!probeInFlight,
      existingAccountName: existingAccountName === undefined ? 'unknown' : existingAccountName === null ? 'missing' : 'found',
      registering,
      readyForRegister,
    });
    if (lastAuthStateLogRef.current === key) return;
    lastAuthStateLogRef.current = key;
    const level = state === 'auto_connecting' ? 'warn' : 'info';
    const payload = { state, ...authDebug };
    console[level === 'warn' ? 'warn' : 'log']('[authFlow] state', payload);
    reportClientEvent('auth.state', payload, {
      level,
      source: 'auth.flow',
      message: `auth.state ${state}`,
      flush: state === 'auto_connecting',
    });
  }, [
    state, dex, dexPicked, booting, graceExpired, candidate, probeInFlight,
    existingAccountName, registering, readyForRegister, authDebug,
  ]);

  useEffect(() => {
    if (state !== 'auto_connecting') return undefined;
    const started = Date.now();
    const t = setTimeout(() => {
      const payload = {
        state,
        stuck_ms: Date.now() - started,
        ...authDebug,
      };
      console.warn('[authFlow] auto_connecting still active', payload);
      reportClientEvent('auth.auto_connecting_stuck', payload, {
        level: 'warn',
        source: 'auth.flow',
        message: 'auth.auto_connecting_stuck',
        flush: true,
      });
    }, AUTO_CONNECT_GRACE_MS + 2000);
    return () => clearTimeout(t);
  }, [state, authDebug]);

  useEffect(() => {
    const onAuthError = (event) => {
      registerAttemptManagerRef.current?.cancelCurrent();
      const message = authErrorMessage(event?.detail?.message);
      setRegistering(false);
      setRegisterError(message);
      lastRegisteredRef.current = null;
      if (candidate?.wallet) {
        const key = walletCacheKey(candidate.wallet, dex);
        setProbedNameByWallet(prev => ({ ...prev, [key]: null }));
        writeAccountProbeCache(candidate.wallet, dex, null);
      }
    };
    window.addEventListener('clash-auth-error', onAuthError);
    return () => window.removeEventListener('clash-auth-error', onAuthError);
  }, [candidate?.wallet, dex]);

  // Effect: when we have both a candidate AND a suggested name, fire the
  // register once per (wallet+dex) pair. This is the single register call
  // site for all auto-login paths. The setRegistering(true) here is a
  // transient UI indicator for an external side-effect (Godot bridge), not
  // derived state — ESLint's heuristic flag is acceptable here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!showRegister) return;
    // Gate on readyForRegister — prevents firing on the same render where
    // the session-reset effect detected a transition but hasn't yet flushed
    // the cleared dexPicked / evmContext state. See `readyForRegister`
    // comment near the top.
    if (!readyForRegister) return;
    if (!candidate) return;
    if (registerError) return;
    // Non-FC users gate on the return-probe:
    //   undefined → probe still in flight, bail and wait for it to settle
    //   null      → probe says no account → brand-new user; DO NOT auto-
    //               register — RegisterPanel renders the name form and
    //               `submitName` (an explicit user action) fires the
    //               register call with the name they type. Without this
    //               guard, the effect would fall through to `suggestedName`
    //               (email prefix like `bobemail`) and silently create the
    //               account the user was about to name.
    //   string    → returning user → auto-register with stored name
    // FC users skip the probe entirely (existingAccountName stays undefined
    // for them) and rely on suggestedName derived from their FC handle.
    if (!fcUser) {
      if (existingAccountName === undefined) return;
      if (existingAccountName === null) return;
      return;
    }
    const nameToUse = existingAccountName || suggestedName;
    if (!nameToUse) return;
    // Case-insensitive compare: EVM addresses may arrive as checksummed
    // (0xABcd…) from one resolver and lowercased (0xabcd…) from another,
    // and strict === would fire register twice for the same wallet.
    // Solana base58 is case-sensitive so the lowercasing is harmless
    // there — no Solana address has ambiguous casing.
    // Key the dedup ref on (wallet, dex). Same wallet on different DEXes
    // is now a different account — without `dex` in the key, switching
    // from Avantis to GMX would silently no-op the GMX register because
    // `lastRegisteredRef.current` still pointed at the wallet from the
    // Avantis register, and the user would never get a GMX row created.
    const authDex = dexPicked ? dex : '';
    const candidateKey = `${authDex || 'account'}:${String(candidate.wallet).toLowerCase()}`;
    if (lastRegisteredRef.current === candidateKey) return;
    lastRegisteredRef.current = candidateKey;
    setRegistering(true);
    setRegisterError('');
    const payload = { name: nameToUse, wallet: candidate.wallet };
    if (authDex) payload.dex = authDex;
    if (referralCodeRef.current) payload.referralCode = referralCodeRef.current;
    if (EVM_AUTH_DEXES.has(authDex)) {
      // Chain is dex-driven, NOT taken from candidate.chain — the Privy
      // resolver hard-codes 'base' regardless of which DEX is active, so
      // trusting candidate.chain would mis-tag GMX/Perpl registrations as
      // Base. The wallet address itself is identical on every EVM chain so
      // the server can later look up trade history on the right chain via
      // this tag.
      payload.chain = authDex === 'gmx' || authDex === 'ostium' ? 'arbitrum'
        : authDex === 'monad' ? 'monad'
        : authDex === 'hyperliquid' ? 'arbitrum'
        : authDex === 'risex' ? 'rise'
        : authDex === 'nado' ? 'ink'
        : authDex === 'ondo' ? 'mainnet'
        : authDex === 'hibachi' ? 'base'
        : authDex === 'hotstuff' ? 'mainnet'
        : authDex === 'grvt' ? 'grvt'
        : authDex === 'katana' ? 'katana'
        : authDex === 'lighter' ? 'lighter'
        : authDex === 'rhlighter' ? 'rhlighter'
        : 'base';
      payload.walletSource = candidate.source;
    }
    // Pipe the Farcaster FID into register so the server can adopt a prior
    // `fc_<fid>` placeholder account instead of spawning a duplicate — keeps
    // tutorial_flags, gold and building progress intact across FC→Avantis
    // sign-in paths.
    if (fcUser?.fid) payload.fid = fcUser.fid;
    addClientBreadcrumb('auth.register_start', {
      dex,
      source: candidate.source || null,
      mode: 'auto',
    });
    // Keep the registration attempt independent from this effect's cleanup.
    // Android Farcaster providers update their account/provider state after a
    // successful personal_sign, which changes hook dependencies and reruns this
    // effect. Cancelling in that cleanup discarded the valid signature and also
    // removed the only timeout, leaving the UI on "Finalising" forever.
    const manager = registerAttemptManagerRef.current;
    const attempt = manager.begin(
      candidateKey,
      WALLET_AUTH_PROOF_TIMEOUT_MS + GODOT_REGISTER_BRIDGE_TIMEOUT_MS + 5000,
      () => {
        setRegistering(false);
        setRegisterError('Game login timed out. Wait a moment or press BACK and reconnect.');
        lastRegisteredRef.current = null;
        addClientBreadcrumb('auth.register_timeout', {
          dex,
          source: candidate.source || null,
          mode: 'auto',
        }, 'warn');
      },
    );
    if (!attempt) return;
    (async () => {
      try {
        const authProof = await withTimeout(
          createWalletAuthProof({
            wallet: candidate.wallet,
            dex: authDex,
            source: candidate.source,
          }),
          WALLET_AUTH_PROOF_TIMEOUT_MS,
          'Wallet signature timed out. Reconnect your wallet and try again.'
        );
        if (!manager.isActive(attempt)) return;
        if (authProof) {
          payload.authProof = authProof;
          payload.auth_proof = authProof;
        }
        const dispatched = await dispatchGodotRegister({
          sendToGodot,
          payload,
          isActive: () => manager.isActive(attempt) && showRegisterRef.current,
        });
        if (!dispatched || !manager.isActive(attempt)) return;
        addClientBreadcrumb('auth.register_dispatched', {
          dex,
          source: candidate.source || null,
          mode: 'auto',
        });
      } catch (e) {
        if (!manager.finish(attempt)) return;
        const message = authErrorMessage(e?.message || 'Wallet signature required. Connect again.');
        setRegistering(false);
        setRegisterError(message);
        lastRegisteredRef.current = null;
        addClientBreadcrumb('auth.wallet_proof_failed', {
          dex,
          source: candidate.source || null,
          message,
        }, 'warn');
      }
    })();
  }, [showRegister, readyForRegister, dexPicked, candidate, suggestedName, dex, sendToGodot, fcUser,
      existingAccountName, createWalletAuthProof, registerError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Actions exposed to the UI. All auth decisions flow through here.
  const pickDex = useCallback(async (newDex) => {
    if (!isDexAvailableInContext(newDex, { isInFrame, isSolanaMobile })) return;
    const isLoggedIn = typeof window !== 'undefined' && !!window._playerToken;
    const switching = isLoggedIn && dexPicked && newDex !== dex;
    addClientBreadcrumb('dex.pick', { from: dex, to: newDex, switching });
    setDex(newDex);
    writeLastPlayerDexPreference({ wallet: candidate?.wallet, token: typeof window !== 'undefined' ? window._playerToken : '' }, newDex);
    writeDexPicked(true);
    setDexPickedState(true);
    if (switching) {
      // Per-DEX accounts: switching DEX while logged in means the user is
      // changing identity to the (wallet, newDex) player row. Drop the
      // current session token so the next render's register effect fires
      // against the new DEX. The wallet itself stays connected — we only
      // need a fresh player_row, not a fresh wallet.
      const token = typeof window !== 'undefined' ? window._playerToken : null;
      if (token) {
        try {
          const response = await fetch(`/api/players/dex-accounts/${encodeURIComponent(newDex)}/select`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-token': token },
            body: JSON.stringify({ wallet: candidate?.wallet || '' }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data?.error || `Could not switch DEX (${response.status})`);
          }
          const serverDex = data?.player?.dex || data?.dex || newDex;
          if (serverDex !== newDex) {
            setDex(serverDex);
            writeLastPlayerDexPreference({ wallet: candidate?.wallet, token }, serverDex);
          }
          if (data?.player || data?.token) {
            window.onGodotMessage?.({
              action: 'state',
              data: {
                ...(data?.player || { dex: serverDex }),
                ...(data?.token ? { token: data.token } : {}),
              },
            });
          }
          addClientBreadcrumb('dex.select_success', {
            dex: serverDex,
            switched_account: !!data?.switched_account,
          });
        } catch (e) {
          setDex(dex);
          writeLastPlayerDexPreference({ wallet: candidate?.wallet, token }, dex);
          addClientBreadcrumb('dex.select_failed', {
            from: dex,
            to: newDex,
            message: e?.message || String(e || ''),
          }, 'warn');
          setRegisterError(authErrorMessage(e?.message || 'Could not switch DEX. Try again.'));
          return;
        }
      }
      // If we were on Decibel and we're leaving it, drop the Petra
      // connection — useDecibel keeps polling Aptos REST as long as
      // address is set, which wastes RPC quota and shows ghost balances
      // in stale tabs after the user has logically switched DEX.
      // ProfileModal already calls aptosDisconnect on logout-everything,
      // but the in-place pickDex switch missed it.
      if (dex === 'decibel' && newDex !== 'decibel') {
        try { aptosWallet.disconnect?.(); } catch { /* noop */ }
      }
    }
  }, [dex, dexPicked, isInFrame, isSolanaMobile, setDex, aptosWallet, candidate?.wallet]);

  const unpickDex = useCallback(() => {
    writeDexPicked(false);
    setDexPickedState(false);
    // Also allow the FC EVM attempt to re-run on re-entry.
    fcEvmTriedRef.current = false;
  }, []);

  const changeWallet = useCallback(async () => {
    // This is an explicit account-boundary action. Keep the selected DEX so
    // the user returns to the correct venue setup, but remove every wallet
    // resolver that could immediately re-select the previous account.
    registerAttemptManagerRef.current?.cancelCurrent();
    lastRegisteredRef.current = null;
    fcEvmTriedRef.current = true;
    seekerAutoConnectTriedRef.current = true;
    setRegistering(false);
    setRegisterError('');
    writeManualReconnectRequired(false);
    setManualReconnectRequired(false);
    try {
      localStorage.removeItem(GAME_AUTH_STORAGE_KEY);
      localStorage.removeItem(MANUAL_RECONNECT_KEY);
      if (typeof window !== 'undefined') window._playerToken = null;
    } catch { /* storage disabled */ }

    try { evmDisconnect?.(); } catch { /* idempotent */ }
    const disconnects = [
      () => solWallet?.disconnect?.(),
      () => aptosWallet?.disconnect?.(),
      () => (privyEnabled && privyAuthed ? privyLogout?.() : null),
    ];
    await Promise.allSettled(disconnects.map((disconnect) => Promise.resolve().then(disconnect)));
    addClientBreadcrumb('wallet.change_ready', {
      dex,
      wallet_kind: authWalletKindForDex(dex),
    });
  }, [aptosWallet, dex, evmDisconnect, privyAuthed, privyEnabled, privyLogout, solWallet]);

  const submitName = useCallback(async (name) => {
    if (!showRegister || !candidate || !name || name.trim().length < 2) return;
    // Key the dedup ref on (wallet, dex). Same wallet on different DEXes
    // is now a different account — without `dex` in the key, switching
    // from Avantis to GMX would silently no-op the GMX register because
    // `lastRegisteredRef.current` still pointed at the wallet from the
    // Avantis register, and the user would never get a GMX row created.
    const authDex = dexPicked ? dex : '';
    const candidateKey = `${authDex || 'account'}:${String(candidate.wallet).toLowerCase()}`;
    if (lastRegisteredRef.current === candidateKey) return;
    lastRegisteredRef.current = candidateKey;
    setRegistering(true);
    setRegisterError('');
    const payload = { name: name.trim(), wallet: candidate.wallet };
    if (authDex) payload.dex = authDex;
    if (referralCodeRef.current) payload.referralCode = referralCodeRef.current;
    if (EVM_AUTH_DEXES.has(authDex)) {
      payload.chain = authDex === 'gmx' || authDex === 'ostium' ? 'arbitrum'
        : authDex === 'monad' ? 'monad'
        : authDex === 'hyperliquid' ? 'arbitrum'
        : authDex === 'risex' ? 'rise'
        : authDex === 'nado' ? 'ink'
        : authDex === 'ondo' ? 'mainnet'
        : authDex === 'hibachi' ? 'base'
        : authDex === 'hotstuff' ? 'mainnet'
        : authDex === 'grvt' ? 'grvt'
        : authDex === 'katana' ? 'katana'
        : authDex === 'lighter' ? 'lighter'
        : authDex === 'rhlighter' ? 'rhlighter'
        : 'base';
      payload.walletSource = candidate.source;
    }
    if (fcUser?.fid) payload.fid = fcUser.fid;
    addClientBreadcrumb('auth.register_start', {
      dex,
      source: candidate.source || null,
      mode: 'manual_name',
    });
    try {
      const authProof = await withTimeout(
        createWalletAuthProof({
          wallet: candidate.wallet,
          dex: authDex,
          source: candidate.source,
        }),
        WALLET_AUTH_PROOF_TIMEOUT_MS,
        'Wallet signature timed out. Reconnect your wallet and try again.'
      );
      if (authProof) {
        payload.authProof = authProof;
        payload.auth_proof = authProof;
      }
      const dispatched = await dispatchGodotRegister({
        sendToGodot,
        payload,
        isActive: () => showRegisterRef.current && lastRegisteredRef.current === candidateKey,
      });
      if (!dispatched) return;
      setTimeout(() => setRegistering(false), 10000);
    } catch (e) {
      const message = authErrorMessage(e?.message || 'Wallet signature required. Connect again.');
      setRegistering(false);
      setRegisterError(message);
      lastRegisteredRef.current = null;
      addClientBreadcrumb('auth.wallet_proof_failed', {
        dex,
        source: candidate.source || null,
        message,
      }, 'warn');
    }
  }, [showRegister, candidate, dex, dexPicked, sendToGodot, fcUser, createWalletAuthProof]);

  // Trigger manual Privy login (email) — Privy renders its own modal.
  const confirmLogin = useCallback(() => {
    const name = existingAccountName || suggestedName || '';
    if (!name) return;
    submitName(name);
  }, [existingAccountName, suggestedName, submitName]);

  const loginWithPrivy = useCallback(() => {
    if (!privyEnabled) return;
    clearManualReconnectRequired();
    addClientBreadcrumb('wallet.connect_start', { source: 'privy_email', dex });
    try { privyLogin({ loginMethods: ['email'] }); }
    catch { privyLogin(); }
  }, [clearManualReconnectRequired, privyEnabled, privyLogin, dex]);

  const beginManualWalletConnect = useCallback(() => {
    clearManualReconnectRequired();
  }, [clearManualReconnectRequired]);

  const logout = useCallback(() => {
    registerAttemptManagerRef.current?.cancelCurrent();
    lastRegisteredRef.current = null;
    fcEvmTriedRef.current = false;
    setRegistering(false);
    setRegisterError('');
    writeDexPicked(false);
    setDexPickedState(false);
    writeManualReconnectRequired(true);
    setManualReconnectRequired(true);
    // Clear the global token so DexContext polling / any in-flight fetch
    // stops using a stale identity after logout. Previously only
    // ProfileModal.logoutEverything() cleared it, so useAuthFlow.logout()
    // left _playerToken alive and downstream calls kept using the old
    // session until the GodotProvider itself unmounted.
    try { if (typeof window !== 'undefined') window._playerToken = null; } catch { /* noop */ }
    sendToGodot('logout');
  }, [sendToGodot]);

  return {
    state,
    dex,
    dexPicked,
    isInFrame,
    isSolanaMobile,
    fcUser,
    candidate,
    suggestedName,
    existingAccountName,
    seekerHandle,
    privyEnabled,
    privyAuthed,
    actions: {
      pickDex,
      unpickDex,
      changeWallet,
      submitName,
      confirmLogin,
      clearRegisterError: () => setRegisterError(''),
      loginWithPrivy,
      beginManualWalletConnect,
      logout,
    },
    registerError,
  };
}
