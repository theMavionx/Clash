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
import { useSend, useUI } from '../hooks/useGodot';
import { isDexAvailableInContext, useDex } from '../contexts/DexContext';
import { useFarcaster, getFarcasterEthProvider } from '../hooks/useFarcaster';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useSolanaMobile } from '../hooks/useSolanaMobile';
import { useSkrHandle } from '../hooks/useSkrHandle';
import { useOptionalPrivy } from '../components/PrivyAuthProvider';
import {
  useSolanaAdapterResolver,
  usePrivySolanaResolver,
  useEvmContextResolver,
  usePrivyEvmCandidate,
} from './resolvers';
import { addClientBreadcrumb } from '../lib/clientLogger';

const DEX_PICKED_KEY = 'clash_dex_picked';
// v2 cache: keyed by `${wallet}|${dex}` instead of just `wallet`. Per-DEX
// account migration (server-side schema: UNIQUE(wallet, dex)) means a
// wallet can have a different account on each DEX, so the probe answer
// for "wallet=0xABC, dex='avantis'" is independent of "wallet=0xABC,
// dex='gmx'". The old v1 cache (clash_wallet_account_cache_v1) gets a
// new key here so stale wallet-only entries don't accidentally answer
// per-DEX probes with the wrong account name.
const ACCOUNT_PROBE_CACHE_KEY = 'clash_wallet_dex_account_cache_v2';
const ACCOUNT_PROBE_POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_PROBE_NEGATIVE_TTL_MS = 10 * 60 * 1000;
// How long to wait for an auto-resolver to produce a candidate before
// revealing the manual-connect CTAs. Keeps the spinner short when the
// user isn't authenticated anywhere; keeps the "Joining…" UX intact when
// Privy / FC SDK is still resolving.
const AUTO_CONNECT_GRACE_MS = 3000;

function readDexPicked() {
  try { return localStorage.getItem(DEX_PICKED_KEY) === '1'; } catch { return false; }
}
function writeDexPicked(v) {
  try {
    if (v) localStorage.setItem(DEX_PICKED_KEY, '1');
    else localStorage.removeItem(DEX_PICKED_KEY);
  } catch { /* storage disabled */ }
}

function walletCacheKey(wallet, dex) {
  const raw = String(wallet || '').trim();
  const w = raw.startsWith('0x') || raw.startsWith('0X') ? raw.toLowerCase() : raw;
  // Always include DEX in the key — the same wallet can hold a different
  // account per DEX after the migration to UNIQUE(wallet, dex). When dex
  // is undefined (legacy callers, transitional code) we degrade to the
  // wallet-only key so the cache miss surfaces a fresh probe instead of
  // returning the wrong account.
  return dex ? `${w}|${dex}` : w;
}

function readAccountProbeCache(wallet, dex) {
  try {
    const key = walletCacheKey(wallet, dex);
    if (!key) return undefined;
    const raw = localStorage.getItem(ACCOUNT_PROBE_CACHE_KEY);
    if (!raw) return undefined;
    const all = JSON.parse(raw);
    const entry = all?.[key];
    if (!entry || typeof entry.ts !== 'number') return undefined;
    const ttl = entry.exists ? ACCOUNT_PROBE_POSITIVE_TTL_MS : ACCOUNT_PROBE_NEGATIVE_TTL_MS;
    if (Date.now() - entry.ts > ttl) {
      delete all[key];
      localStorage.setItem(ACCOUNT_PROBE_CACHE_KEY, JSON.stringify(all));
      return undefined;
    }
    return entry.exists ? (entry.name || null) : null;
  } catch {
    return undefined;
  }
}

function writeAccountProbeCache(wallet, dex, name) {
  try {
    const key = walletCacheKey(wallet, dex);
    if (!key) return;
    const raw = localStorage.getItem(ACCOUNT_PROBE_CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[key] = {
      exists: !!name,
      name: name || '',
      ts: Date.now(),
    };
    localStorage.setItem(ACCOUNT_PROBE_CACHE_KEY, JSON.stringify(all));
  } catch { /* storage disabled */ }
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
  const { showRegister } = useUI();
  const {
    enabled: privyEnabled,
    ready: privyReady,
    authenticated: privyAuthed,
    login: privyLogin,
    logout: privyLogout,
  } = useOptionalPrivy();
  const { setExternalProvider: setEvmProvider, disconnect: evmDisconnect } = useEvmWallet();

  const [dexPicked, setDexPickedState] = useState(readDexPicked);

  // Refs shared across effects below — declared up-front so the
  // session-reset effect can clear them before the resolver machinery
  // attempts to re-use stale state.
  const lastRegisteredRef = useRef(null);
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
    if (dex !== 'pacifica' && dex !== 'phoenix') setDex('pacifica');
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
    // The adapter name is "Mobile Wallet Adapter". Stable across SDK
    // versions and matches what `SolanaMobileWalletAdapter` registers as.
    try { solWallet.select('Mobile Wallet Adapter'); } catch { /* noop */ }
    Promise.resolve(solWallet.connect()).then(() => {
      addClientBreadcrumb('wallet.connect_success', { source: 'seeker_mwa', dex });
    }).catch(e => {
      // User dismissed the Seed Vault prompt, or no MWA host actually
      // present (we trusted the readyState check but the device rejected).
      // Don't retry on the same device — they can manually connect via
      // the wallet modal as a fallback.
      addClientBreadcrumb('wallet.connect_fail', {
        source: 'seeker_mwa',
        dex,
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
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const prev = prevShowRegisterRef.current;
    prevShowRegisterRef.current = showRegister;
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
  const candidate = useMemo(() => {
    if (!dexPicked) return null;
    // Avantis (Base), GMX (Arbitrum), Monad and Hyperliquid all source from the same EVM wallet
    // context. The wallet address is the same on every EVM chain — the chain
    // switch happens at tx time via ensureChain(). Privy embedded EVM works
    // for both because the wallet itself is chain-agnostic; only the
    // walletClient transport gets re-bound per-DEX (see EvmWalletContext
    // .getWalletClient(chainId) — Avantis uses Base, GMX uses Arbitrum).
    if (dex === 'avantis' || dex === 'gmx' || dex === 'monad' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado') return evmContext || privyEvm || null;
    if (dex === 'decibel') return aptosCandidate || null;
    if (dex === 'pacifica' || dex === 'phoenix') {
      const farcasterSol = solAdapter?.source === 'farcaster' ? solAdapter : null;
      return farcasterSol || privySol || solAdapter || null;
    }
    return privySol || solAdapter || null;
  }, [dex, dexPicked, evmContext, privyEvm, aptosCandidate, solAdapter, privySol]);

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
  useEffect(() => {
    if (!candidate?.wallet) return;
    if (fcUser) return; // FC users keep the existing fast-path
    // Probe is now per-(wallet, dex). The same wallet has a separate
    // account on each DEX, so we re-probe whenever the user switches
    // DEX. Old code keyed by wallet alone and returned the user's
    // Avantis name when they switched to GMX — leading to "I'm logged
    // in as my Avantis account on GMX" confusion.
    const key = walletCacheKey(candidate.wallet, dex);
    const cached = readAccountProbeCache(candidate.wallet, dex);
    if (!(key in probedNameByWallet) && cached !== undefined) {
      setProbedNameByWallet(prev => (
        key in prev ? prev : { ...prev, [key]: cached }
      ));
    }
    if (probeVerifiedRef.current[key]) return;
    if (probeInFlightRef.current[key]) return;
    probeInFlightRef.current[key] = true;
    (async () => {
      try {
        const r = await fetch('/api/players/login-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: candidate.wallet, dex }),
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
          const respondedDex = String(data?.dex || '').toLowerCase();
          const wantedDex = String(dex || '').toLowerCase();
          const name = (respondedDex && wantedDex && respondedDex !== wantedDex)
            ? null
            : (data?.name || null);
          writeAccountProbeCache(candidate.wallet, dex, name);
          setProbedNameByWallet(prev => ({ ...prev, [key]: name }));
        } else {
          // 404 (no account on THIS DEX) / 400 (invalid wallet) → treat
          // as new user for this DEX. They may have an account on a
          // different DEX with the same wallet — that's fine, switching
          // DEX in the picker will re-probe and find it.
          writeAccountProbeCache(candidate.wallet, dex, null);
          setProbedNameByWallet(prev => ({ ...prev, [key]: null }));
        }
      } catch {
        // Network error — treat as new user so the UI doesn't hang on
        // spinner forever. If they're actually returning, the name form
        // with suggested auto-derived default still takes them through
        // login_by_wallet on the Godot side.
        if (cached === undefined) {
          setProbedNameByWallet(prev => ({ ...prev, [key]: null }));
        }
      } finally {
        probeVerifiedRef.current[key] = true;
        probeInFlightRef.current[key] = false;
      }
    })();
  }, [candidate, dex, fcUser, probedNameByWallet]);

  // Resolved existing-account name (or null if none / not yet probed).
  const candidateWalletKey = candidate?.wallet ? walletCacheKey(candidate.wallet, dex) : '';
  const existingAccountName = candidateWalletKey
    ? probedNameByWallet[candidateWalletKey]
    : undefined;

  // Boot grace — if FC SDK or Privy is still resolving, don't show the
  // manual-connect screen yet. Also a short timer after dex-pick so we
  // give auto-resolvers a chance before offering manual CTAs.
  const booting =
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
    if (!dexPicked) { setGraceExpired(false); return; }
    setGraceExpired(false);
    const t = setTimeout(() => setGraceExpired(true), AUTO_CONNECT_GRACE_MS);
    return () => clearTimeout(t);
  }, [dexPicked, dex]);
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
  const isFarcasterCandidate = !!fcUser;
  const probeInFlight = candidate?.wallet && !isFarcasterCandidate &&
    existingAccountName === undefined;
  const state = useMemo(() => {
    if (registering) return 'registering';
    if (booting) return 'booting';
    if (!dexPicked) return 'pick_dex';
    // FC fast-path: auto-register with FC handle.
    if (candidate && suggestedName && isFarcasterCandidate) return 'registering';
    // Non-FC: wait for probe, then branch.
    if (candidate && probeInFlight) return 'auto_connecting';
    // Returning user — server already has an account for this wallet;
    // fire register with their stored name (which is auto-derived-safe so
    // Godot's login_by_wallet fast-path takes over and no rename happens).
    if (candidate && existingAccountName) return 'registering';
    // Brand-new user — prompt for a display name.
    if (candidate) return 'need_name';
    if (!graceExpired) return 'auto_connecting';
    return 'manual_connect';
  }, [registering, booting, dexPicked, candidate, suggestedName, graceExpired,
      isFarcasterCandidate, probeInFlight, existingAccountName]);

  // Effect: when we have both a candidate AND a suggested name, fire the
  // register once per (wallet+dex) pair. This is the single register call
  // site for all auto-login paths. The setRegistering(true) here is a
  // transient UI indicator for an external side-effect (Godot bridge), not
  // derived state — ESLint's heuristic flag is acceptable here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Gate on readyForRegister — prevents firing on the same render where
    // the session-reset effect detected a transition but hasn't yet flushed
    // the cleared dexPicked / evmContext state. See `readyForRegister`
    // comment near the top.
    if (!readyForRegister) return;
    if (!candidate) return;
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
    const candidateKey = `${String(candidate.wallet).toLowerCase()}|${dex}`;
    if (lastRegisteredRef.current === candidateKey) return;
    lastRegisteredRef.current = candidateKey;
    setRegistering(true);
    const payload = { name: nameToUse, wallet: candidate.wallet, dex };
    if (dex === 'avantis' || dex === 'gmx' || dex === 'monad' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado') {
      // Chain is dex-driven, NOT taken from candidate.chain — the Privy
      // resolver hard-codes 'base' regardless of which DEX is active, so
      // trusting candidate.chain would mis-tag GMX/Perpl registrations as
      // Base. The wallet address itself is identical on every EVM chain so
      // the server can later look up trade history on the right chain via
      // this tag.
      payload.chain = dex === 'gmx' ? 'arbitrum'
        : dex === 'monad' ? 'monad'
        : dex === 'hyperliquid' ? 'arbitrum'
        : dex === 'risex' ? 'rise'
        : dex === 'nado' ? 'ink'
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
    sendToGodot('register', payload);
    // Safety: if Godot never acks (network partition), clear the spinner
    // after 10s so the user can retry or pick a different path.
    const t = setTimeout(() => setRegistering(false), 10000);
    return () => clearTimeout(t);
  }, [readyForRegister, candidate, suggestedName, dex, sendToGodot, fcUser,
      existingAccountName]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Actions exposed to the UI. All auth decisions flow through here.
  const pickDex = useCallback((newDex) => {
    if (!isDexAvailableInContext(newDex, { isInFrame, isSolanaMobile })) return;
    const isLoggedIn = typeof window !== 'undefined' && !!window._playerToken;
    const switching = isLoggedIn && dexPicked && newDex !== dex;
    addClientBreadcrumb('dex.pick', { from: dex, to: newDex, switching });
    setDex(newDex);
    writeDexPicked(true);
    setDexPickedState(true);
    if (switching) {
      // Per-DEX accounts: switching DEX while logged in means the user is
      // changing identity to the (wallet, newDex) player row. Drop the
      // current session token so the next render's register effect fires
      // against the new DEX. The wallet itself stays connected — we only
      // need a fresh player_row, not a fresh wallet.
      lastRegisteredRef.current = null;
      setRegistering(false);
      try { window._playerToken = null; } catch { /* noop */ }
      // Tell the session-reset effect to NOT bounce us to the DEX picker
      // when Godot fires show_register=true in response to logout.
      intentionalDexSwitchRef.current = true;
      // If we were on Decibel and we're leaving it, drop the Petra
      // connection — useDecibel keeps polling Aptos REST as long as
      // address is set, which wastes RPC quota and shows ghost balances
      // in stale tabs after the user has logically switched DEX.
      // ProfileModal already calls aptosDisconnect on logout-everything,
      // but the in-place pickDex switch missed it.
      if (dex === 'decibel' && newDex !== 'decibel') {
        try { aptosWallet.disconnect?.(); } catch { /* noop */ }
      }
      sendToGodot('logout');
    }
  }, [dex, dexPicked, isInFrame, isSolanaMobile, setDex, sendToGodot, aptosWallet]);

  const unpickDex = useCallback(() => {
    writeDexPicked(false);
    setDexPickedState(false);
    // Also allow the FC EVM attempt to re-run on re-entry.
    fcEvmTriedRef.current = false;
  }, []);

  const submitName = useCallback((name) => {
    if (!candidate || !name || name.trim().length < 2) return;
    // Key the dedup ref on (wallet, dex). Same wallet on different DEXes
    // is now a different account — without `dex` in the key, switching
    // from Avantis to GMX would silently no-op the GMX register because
    // `lastRegisteredRef.current` still pointed at the wallet from the
    // Avantis register, and the user would never get a GMX row created.
    const candidateKey = `${String(candidate.wallet).toLowerCase()}|${dex}`;
    if (lastRegisteredRef.current === candidateKey) return;
    lastRegisteredRef.current = candidateKey;
    setRegistering(true);
    const payload = { name: name.trim(), wallet: candidate.wallet, dex };
    if (dex === 'avantis' || dex === 'gmx' || dex === 'monad' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado') {
      payload.chain = dex === 'gmx' ? 'arbitrum'
        : dex === 'monad' ? 'monad'
        : dex === 'hyperliquid' ? 'arbitrum'
        : dex === 'risex' ? 'rise'
        : dex === 'nado' ? 'ink'
        : 'base';
      payload.walletSource = candidate.source;
    }
    if (fcUser?.fid) payload.fid = fcUser.fid;
    writeAccountProbeCache(candidate.wallet, dex, name.trim());
    addClientBreadcrumb('auth.register_start', {
      dex,
      source: candidate.source || null,
      mode: 'manual_name',
    });
    sendToGodot('register', payload);
    const t = setTimeout(() => setRegistering(false), 10000);
    return () => clearTimeout(t);
  }, [candidate, dex, sendToGodot, fcUser]);

  // Trigger manual Privy login (email) — Privy renders its own modal.
  const loginWithPrivy = useCallback(() => {
    if (!privyEnabled) return;
    addClientBreadcrumb('wallet.connect_start', { source: 'privy_email', dex });
    try { privyLogin({ loginMethods: ['email'] }); }
    catch { privyLogin(); }
  }, [privyEnabled, privyLogin, dex]);

  const logout = useCallback(() => {
    lastRegisteredRef.current = null;
    fcEvmTriedRef.current = false;
    setRegistering(false);
    writeDexPicked(false);
    setDexPickedState(false);
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
    isInFrame,
    isSolanaMobile,
    fcUser,
    candidate,
    suggestedName,
    seekerHandle,
    privyEnabled,
    privyAuthed,
    actions: {
      pickDex,
      unpickDex,
      submitName,
      loginWithPrivy,
      logout,
    },
  };
}
