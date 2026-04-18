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
import { useSend } from '../hooks/useGodot';
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
  const privyEnabled = !!import.meta.env.VITE_PRIVY_APP_ID;
  const { ready: privyReady, authenticated: privyAuthed, login: privyLogin } = usePrivy();
  const { setExternalProvider: setEvmProvider } = useEvmWallet();

  const [dexPicked, setDexPickedState] = useState(readDexPicked);

  // Resolvers: each is a hook that watches one source. useAuthFlow combines.
  const solAdapter = useSolanaAdapterResolver(isInFrame);
  const privySol = usePrivySolanaResolver();
  const evmContext = useEvmContextResolver();
  const privyEvm = usePrivyEvmCandidate();

  // Farcaster EVM: not a hook (SDK call is imperative). We trigger it once
  // when Avantis is picked + in frame, and feed the resulting provider
  // into EvmWalletContext. Post-push it surfaces via useEvmContextResolver.
  const fcEvmTriedRef = useRef(false);
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
  const suggestedName = useMemo(() => {
    if (fcUser) return String(fcUser.username || fcUser.displayName || 'fc_' + fcUser.fid);
    const email = candidate?.email || privyEvm?.email || privySol?.email;
    if (email) return email.split('@')[0].slice(0, 20);
    return null;
  }, [fcUser, candidate, privyEvm, privySol]);

  // Track whether we've already fired a register for the current candidate
  // so resolver updates (address unchanged) don't re-register endlessly.
  // Resets on logout or when the wallet address actually changes.
  const lastRegisteredRef = useRef(null); // last wallet we fired register for
  const [registering, setRegistering] = useState(false);

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
  const state = useMemo(() => {
    if (registering) return 'registering';
    if (booting) return 'booting';
    if (!dexPicked) return 'pick_dex';
    if (candidate && suggestedName) return 'registering'; // about to fire
    if (candidate && !suggestedName) return 'need_name';
    if (!graceExpired) return 'auto_connecting';
    return 'manual_connect';
  }, [registering, booting, dexPicked, candidate, suggestedName, graceExpired]);

  // Effect: when we have both a candidate AND a suggested name, fire the
  // register once per (wallet+dex) pair. This is the single register call
  // site for all auto-login paths. The setRegistering(true) here is a
  // transient UI indicator for an external side-effect (Godot bridge), not
  // derived state — ESLint's heuristic flag is acceptable here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!candidate || !suggestedName) return;
    if (lastRegisteredRef.current === candidate.wallet) return;
    lastRegisteredRef.current = candidate.wallet;
    setRegistering(true);
    const payload = { name: suggestedName, wallet: candidate.wallet, dex };
    if (dex === 'avantis') {
      payload.chain = candidate.chain || 'base';
      payload.walletSource = candidate.source;
    }
    sendToGodot('register', payload);
    // Safety: if Godot never acks (network partition), clear the spinner
    // after 10s so the user can retry or pick a different path.
    const t = setTimeout(() => setRegistering(false), 10000);
    return () => clearTimeout(t);
  }, [candidate, suggestedName, dex, sendToGodot]);
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
    if (lastRegisteredRef.current === candidate.wallet) return;
    lastRegisteredRef.current = candidate.wallet;
    setRegistering(true);
    const payload = { name: name.trim(), wallet: candidate.wallet, dex };
    if (dex === 'avantis') {
      payload.chain = candidate.chain || 'base';
      payload.walletSource = candidate.source;
    }
    sendToGodot('register', payload);
    const t = setTimeout(() => setRegistering(false), 10000);
    return () => clearTimeout(t);
  }, [candidate, dex, sendToGodot]);

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
