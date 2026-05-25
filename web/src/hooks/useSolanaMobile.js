// Solana Mobile (Saga / Seeker) detection.
//
// Reference: https://docs.solanamobile.com/recipes/general/detecting-seeker-users
//
// The official recipe checks React Native Platform constants:
//   Platform.constants.Model === 'Seeker'
// with Brand=solanamobile and Manufacturer=Solana Mobile Inc. We run in a
// browser/PWA/TWA, so Platform.constants is unavailable. We mirror that signal
// with narrow UA markers first, then with browser User-Agent Client Hints
// (`model`, `platform`, etc.) when Chrome exposes them.
//
// This is a soft UI signal only. The docs call out that device constants can be
// spoofed; use on-chain SGT verification for high-value gated rewards.
//
// Why we can't use SolanaMobileWalletAdapter.readyState alone:
// @solana-mobile/wallet-adapter-mobile reports Loadable on every Android
// secure-context page because its getIsSupported() check is only Android UA +
// secureContext. That would hide non-Solana DEXes on ordinary Android phones.

import { useEffect, useState } from 'react';

let cachedResult = null; // null = not yet checked, true/false = final result
let pendingAsyncDetection = null;

function hasSolanaMobileMarkers(value) {
  const text = String(value || '');
  return (
    /\bSeeker\b/i.test(text) ||
    /\bSolana\b.*\bMobile\b/i.test(text) ||
    /solanamobile/i.test(text) ||
    (/\bSaga\b/i.test(text) && /OnePlus/i.test(text))
  );
}

function canProbeUserAgentData() {
  return (
    typeof navigator !== 'undefined' &&
    navigator.userAgentData &&
    typeof navigator.userAgentData.getHighEntropyValues === 'function'
  );
}

function detectSolanaMobileSync() {
  if (cachedResult !== null) return cachedResult;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    cachedResult = false;
    return false;
  }
  const ua = navigator.userAgent || '';
  if (!/android/i.test(ua)) {
    cachedResult = false;
    return false;
  }
  if (!window.isSecureContext) {
    cachedResult = false;
    return false;
  }

  const isSagaSeeker = hasSolanaMobileMarkers(ua);
  if (isSagaSeeker) cachedResult = true;
  return isSagaSeeker;
}

async function detectSolanaMobile() {
  if (detectSolanaMobileSync()) return true;
  if (!canProbeUserAgentData()) {
    cachedResult = false;
    return false;
  }
  if (pendingAsyncDetection) return pendingAsyncDetection;

  pendingAsyncDetection = navigator.userAgentData
    .getHighEntropyValues(['model', 'platform', 'platformVersion', 'fullVersionList'])
    .then(values => {
      const signals = [
        values?.model,
        values?.platform,
        values?.platformVersion,
        values?.fullVersionList?.map(v => `${v.brand} ${v.version}`).join(' '),
      ].join(' ');
      const detected = hasSolanaMobileMarkers(signals);
      cachedResult = detected;
      return detected;
    })
    .catch(() => {
      cachedResult = false;
      return false;
    })
    .finally(() => { pendingAsyncDetection = null; });

  return pendingAsyncDetection;
}

/**
 * Hook returning `{ isSolanaMobile, ready }`.
 * `isSolanaMobile` is true only for Saga/Seeker-like devices. Ordinary phones
 * stay false and keep the full DEX picker.
 */
export function useSolanaMobile() {
  const [state, setState] = useState(() => {
    const syncDetected = detectSolanaMobileSync();
    const hasFinalSyncResult = cachedResult !== null;
    return {
      ready: syncDetected || hasFinalSyncResult || !canProbeUserAgentData(),
      isSolanaMobile: syncDetected,
    };
  });

  useEffect(() => {
    if (state.ready) return;
    let cancelled = false;
    detectSolanaMobile().then(detected => {
      if (cancelled) return;
      setState({ ready: true, isSolanaMobile: detected });
    });
    return () => { cancelled = true; };
  }, [state.ready]);

  return state;
}

// Synchronous read used by render-time guards. It can only use cheap markers;
// components that need UA Client Hints should use the hook and respect `ready`.
export function isSolanaMobileSync() {
  return detectSolanaMobileSync();
}
