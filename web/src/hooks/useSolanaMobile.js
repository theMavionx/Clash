// Solana Mobile (Saga / Seeker) detection.
//
// Why we can't use SolanaMobileWalletAdapter.readyState alone:
// the adapter reports `Loadable` on EVERY Android device (the package's
// own getIsSupported() is just a UA + secureContext check), and only
// flips to `Installed` AFTER a successful connect() call has gone through
// Seed Vault. So at detection time both Seeker and a regular Android
// phone read `Loadable` — indistinguishable from each other. Trusting
// that signal is what produced the "We can't find a wallet" dialog on
// plain Android phones for everyone hitting the Pacifica auto-flow.
//
// Instead we do a UA-based pre-filter for Saga/Seeker markers. False
// positives here (a regular Android with a fake Saga UA) are unlikely
// in practice and recoverable — the user just sees the wallet picker
// and can choose Phantom. False NEGATIVES on real Seekers fall through
// to the same picker — also recoverable, but means the user has to tap
// MWA themselves instead of getting the auto-connect.
//
// UA markers based on Solana Mobile's own detection guidance and
// observed device strings:
//   - Saga (OG): "OnePlus" + "Saga" / Saga model code
//   - Saga 2 / Seeker: "Solana" / "Seeker"
// Vendor rebrands of the next Solana Mobile chassis (Telegram, etc.)
// would need to be added here; keep the regex narrow on purpose.

import { useEffect, useState } from 'react';

let cachedResult = null;        // null = not yet checked, true/false = result

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
  // MWA also needs a secure context to deeplink at all — gate on it
  // mirroring the package's own getIsSupported() check, so we never
  // promise MWA on plain http://localhost or insecure embeds.
  if (!window.isSecureContext) {
    cachedResult = false;
    return false;
  }
  // Saga / Seeker UA markers. "Saga" alone is too generic (matches a few
  // unrelated apps in WebView UAs), so we gate it on either OEM presence
  // ("OnePlus" — original Saga) or "Solana" / "Seeker" tokens which only
  // appear on Solana Mobile devices. Tested against shipping device UAs
  // logged by the Solana Mobile dApp Store.
  const isSagaSeeker =
    /\bSeeker\b/i.test(ua) ||
    /\bSolana\b.*\bMobile\b/i.test(ua) ||
    (/\bSaga\b/i.test(ua) && /OnePlus/i.test(ua));
  cachedResult = isSagaSeeker;
  return isSagaSeeker;
}

// Async wrapper kept for API compatibility — detection itself is
// synchronous now (UA-only), but components await this in a useEffect
// so they don't break if we ever need to add an async probe.
async function detectSolanaMobile() {
  return detectSolanaMobileSync();
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
  // Detection is sync (UA-only) so we run it inside the useState
  // initializer — `ready` is true on the very first render with no
  // useEffect dance. Subsequent hook instances hit the cached result.
  const [state] = useState(() => ({
    ready: true,
    isSolanaMobile: detectSolanaMobileSync(),
  }));
  // Keep async path warm for any tests that still await it.
  useEffect(() => { detectSolanaMobile(); }, []);
  return state;
}

// Synchronous read — used by render-time guards (e.g.
// isDexAvailableInContext). Self-caches on first call, so callers get
// the correct value even if useSolanaMobile() hasn't mounted yet.
export function isSolanaMobileSync() {
  return detectSolanaMobileSync();
}
