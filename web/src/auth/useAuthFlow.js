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
import { useSend, useUI } from '../hooks/useGodot';
import { useDex } from '../contexts/DexContext';
import { useFarcaster, getFarcasterEthProvider } from '../hooks/useFarcaster';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePrivy } from '@privy-io/react-auth';
import {
  useSolanaAdapterResolver,
  usePrivySolanaResolver,
  useEvmContextResolver,
  usePrivyEvmCandidate,
} from './resolvers';

const DEX_PICKED_KEY = 'clash_dex_picked';
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

export function useAuthFlow() {
  const { sendToGodot } = useSend();
  const { dex, setDex } = useDex();
  const { isInFrame, user: fcUser, loading: fcLoading } = useFarcaster();
  const { showRegister } = useUI();
  const privyEnabled = !!import.meta.env.VITE_PRIVY_APP_ID;
  const { ready: privyReady, authenticated: privyAuthed, login: privyLogin, logout: privyLogout } = usePrivy();
  const { setExternalProvider: setEvmProvider, disconnect: evmDisconnect } = useEvmWallet();

  const [dexPicked, setDexPickedState] = useState(readDexPicked);

  // Refs shared across effects below — declared up-front so the
  // session-reset effect can clear them before the resolver machinery
  // attempts to re-use stale state.
  const lastRegisteredRef = useRef(null);
  const fcEvmTriedRef = useRef(false);

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
    // Clear picker skip so user explicitly re-chooses DEX.
    writeDexPicked(false);
    setDexPickedState(false);
    // Clear any silent-reconnected external EVM wallet + its rdns memo.
    try { evmDisconnect(); } catch { /* noop */ }
    // Also end the Privy session. Without this, a user who was previously
    // email-logged-in to Privy would have `privyAuthed=true` on next render,
    // usePrivyEvmCandidate / usePrivySolanaResolver would immediately surface
    // their old Privy wallet, and the register effect would silently re-
    // create the account they just had invalidated. Let Privy promise settle
    // asynchronously — we don't await because the session reset is a UI
    // transition, not a gated operation.
    if (privyEnabled && privyAuthed) {
      Promise.resolve(privyLogout()).catch(() => { /* noop */ });
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
        const accounts = await prov.request({ method: 'eth_requestAccounts' });
        const addr = accounts && accounts[0];
        if (addr) {
          // Don't persist FC provider's rdns — valid only inside the frame.
          setEvmProvider(prov, addr, null, 'farcaster');
        }
      } catch (err) {
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
  // Priority (Pacifica): Solana adapter (covers FC Solana auto-connect
  //   and external-connected) → Privy Solana.
  const candidate = useMemo(() => {
    if (!dexPicked) return null;
    if (dex === 'avantis') return evmContext || privyEvm || null;
    return solAdapter || privySol || null;
  }, [dex, dexPicked, evmContext, privyEvm, solAdapter, privySol]);

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
  const suggestedName = useMemo(() => {
    if (fcUser) return String(fcUser.username || fcUser.displayName || 'fc_' + fcUser.fid);
    const email = candidate?.email || privyEvm?.email || privySol?.email;
    if (email) return email.split('@')[0].slice(0, 20);
    if (candidate?.wallet) {
      // Strip 0x prefix for EVM; Solana base58 addresses have no prefix.
      const raw = String(candidate.wallet).replace(/^0x/i, '');
      return 'player_' + raw.slice(0, 6).toLowerCase();
    }
    return null;
  }, [fcUser, candidate, privyEvm, privySol]);

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
  useEffect(() => {
    if (!candidate?.wallet) return;
    if (fcUser) return; // FC users keep the existing fast-path
    const key = String(candidate.wallet);
    if (key in probedNameByWallet) return;
    if (probeInFlightRef.current[key]) return;
    probeInFlightRef.current[key] = true;
    (async () => {
      try {
        const r = await fetch('/api/players/login-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: candidate.wallet }),
        });
        if (r.ok) {
          const data = await r.json();
          setProbedNameByWallet(prev => ({ ...prev, [key]: data?.name || null }));
        } else {
          // 404 (no account) / 400 (invalid wallet) → treat as new user.
          setProbedNameByWallet(prev => ({ ...prev, [key]: null }));
        }
      } catch {
        // Network error — treat as new user so the UI doesn't hang on
        // spinner forever. If they're actually returning, the name form
        // with suggested auto-derived default still takes them through
        // login_by_wallet on the Godot side.
        setProbedNameByWallet(prev => ({ ...prev, [key]: null }));
      } finally {
        probeInFlightRef.current[key] = false;
      }
    })();
  }, [candidate, fcUser, probedNameByWallet]);

  // Resolved existing-account name (or null if none / not yet probed).
  const existingAccountName = candidate?.wallet
    ? probedNameByWallet[String(candidate.wallet)]
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
    // Gate: for non-FC users we need to wait for the return-probe before
    // deciding which name to register with. If existingAccountName is a
    // string → returning user (use stored name). If null → brand-new user
    // but we still need a suggested display name. If undefined → probe
    // still in flight; bail and let it re-run when it settles.
    // FC users skip the probe entirely (existingAccountName stays undefined
    // for them) and rely on suggestedName derived from their FC handle.
    if (!fcUser && existingAccountName === undefined) return;
    const nameToUse = existingAccountName || suggestedName;
    if (!nameToUse) return;
    // Case-insensitive compare: EVM addresses may arrive as checksummed
    // (0xABcd…) from one resolver and lowercased (0xabcd…) from another,
    // and strict === would fire register twice for the same wallet.
    // Solana base58 is case-sensitive so the lowercasing is harmless
    // there — no Solana address has ambiguous casing.
    const candidateKey = String(candidate.wallet).toLowerCase();
    if (lastRegisteredRef.current === candidateKey) return;
    lastRegisteredRef.current = candidateKey;
    setRegistering(true);
    const payload = { name: nameToUse, wallet: candidate.wallet, dex };
    if (dex === 'avantis') {
      payload.chain = candidate.chain || 'base';
      payload.walletSource = candidate.source;
    }
    // Pipe the Farcaster FID into register so the server can adopt a prior
    // `fc_<fid>` placeholder account instead of spawning a duplicate — keeps
    // tutorial_flags, gold and building progress intact across FC→Avantis
    // sign-in paths.
    if (fcUser?.fid) payload.fid = fcUser.fid;
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
    setDex(newDex);
    writeDexPicked(true);
    setDexPickedState(true);
  }, [setDex]);

  const unpickDex = useCallback(() => {
    writeDexPicked(false);
    setDexPickedState(false);
    // Also allow the FC EVM attempt to re-run on re-entry.
    fcEvmTriedRef.current = false;
  }, []);

  const submitName = useCallback((name) => {
    if (!candidate || !name || name.trim().length < 2) return;
    const candidateKey = String(candidate.wallet).toLowerCase();
    if (lastRegisteredRef.current === candidateKey) return;
    lastRegisteredRef.current = candidateKey;
    setRegistering(true);
    const payload = { name: name.trim(), wallet: candidate.wallet, dex };
    if (dex === 'avantis') {
      payload.chain = candidate.chain || 'base';
      payload.walletSource = candidate.source;
    }
    if (fcUser?.fid) payload.fid = fcUser.fid;
    sendToGodot('register', payload);
    const t = setTimeout(() => setRegistering(false), 10000);
    return () => clearTimeout(t);
  }, [candidate, dex, sendToGodot, fcUser]);

  // Trigger manual Privy login (email) — Privy renders its own modal.
  const loginWithPrivy = useCallback(() => {
    if (!privyEnabled) return;
    try { privyLogin({ loginMethods: ['email'] }); }
    catch { privyLogin(); }
  }, [privyEnabled, privyLogin]);

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
    fcUser,
    candidate,
    suggestedName,
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
