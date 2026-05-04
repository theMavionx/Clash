// Solana Mobile (Saga / Seeker) detection.
//
// We detect the host by attempting to instantiate the Mobile Wallet Adapter
// and checking its `readyState`. The adapter resolves to Installed/Loadable
// only when running inside an Android WebView/Chrome on a device that has
// the Solana Mobile Stack intent handler — i.e. Saga or Seeker. On every
// other browser (desktop, iOS, plain Android, Farcaster mini-apps) the
// adapter reports NotDetected and our hook returns false.
//
// Why not user-agent sniffing: Saga's UA contains "OnePlus" + "Saga" but
// Seeker's is "Solana Seeker" with different OEM rebadges. Adapter-based
// detection is the intent-system check Solana Mobile themselves recommend
// — it's stable across firmware revisions and rebrands.
//
// Cached at module scope so we don't re-instantiate the adapter on every
// hook call. Detection runs once on first hook mount; subsequent renders
// read the cached result.

import { useEffect, useState } from 'react';
import { WalletReadyState } from '@solana/wallet-adapter-base';

let cachedResult = null;        // null = not yet checked, true/false = result
let inFlightPromise = null;     // dedupes parallel detection calls

async function detectSolanaMobile() {
  if (cachedResult !== null) return cachedResult;
  if (inFlightPromise) return inFlightPromise;

  inFlightPromise = (async () => {
    // Server-side rendering / SSR — bail out early. The adapter constructor
    // touches `window` and would throw on Node.
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      cachedResult = false;
      return false;
    }
    // Plain Android (non-Solana phones) reports as Android in UA but doesn't
    // have the SMS intent handler — the adapter resolves NotDetected. Still
    // worth gating UA-side as a fast no-op for desktop / iOS so we don't
    // load the adapter package at all.
    const ua = navigator.userAgent || '';
    if (!/android/i.test(ua)) {
      cachedResult = false;
      return false;
    }
    try {
      const mod = await import('@solana-mobile/wallet-adapter-mobile');
      const {
        SolanaMobileWalletAdapter,
        createDefaultAuthorizationResultCache,
        createDefaultAddressSelector,
        createDefaultWalletNotFoundHandler,
      } = mod;
      const adapter = new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'Clash of Perps',
          uri: 'https://clashofperps.fun',
          icon: '/icons/icon-512.png',
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        chain: 'solana:mainnet',
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      });
      // `readyState` is sync after construction. Installed = native MWA
      // intent handler present (Saga/Seeker). Loadable = handler advertised
      // but lazy. NotDetected = generic Android, no MWA.
      const state = adapter.readyState;
      const isMobile = state === WalletReadyState.Installed
        || state === WalletReadyState.Loadable;
      cachedResult = isMobile;
      return isMobile;
    } catch {
      cachedResult = false;
      return false;
    }
  })();
  return inFlightPromise;
}

/**
 * Hook returning `{ isSolanaMobile, ready }`.
 *   - `ready: false` while detection is in flight (typically <50ms).
 *   - `isSolanaMobile: true` ONLY when running on Saga/Seeker.
 *
 * Callers gate UI on `ready` so they don't show "DEX picker" then
 * yank it away one frame later. The auth flow auto-picks Pacifica
 * the moment `isSolanaMobile` resolves to true.
 */
export function useSolanaMobile() {
  const [state, setState] = useState(() => ({
    ready: cachedResult !== null,
    isSolanaMobile: cachedResult === true,
  }));

  useEffect(() => {
    if (cachedResult !== null) return;
    let cancelled = false;
    detectSolanaMobile().then(result => {
      if (cancelled) return;
      setState({ ready: true, isSolanaMobile: result });
    });
    return () => { cancelled = true; };
  }, []);

  return state;
}

// Synchronous read — only valid after `useSolanaMobile()` has settled at
// least once on the page. Used by sync-only code paths (e.g. inside
// `isDexAvailableInContext` which is called in render-time guards).
// Returns false if detection hasn't run yet — safer to over-show DEXes
// than hide them.
export function isSolanaMobileSync() {
  return cachedResult === true;
}
