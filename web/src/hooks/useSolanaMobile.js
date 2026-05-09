// Solana Mobile (Saga / Seeker) detection.
//
// Reference: https://docs.solanamobile.com/recipes/general/detecting-seeker-users
//
// The official recipe assumes a React Native runtime and recommends
//   `Platform.constants.Model === 'Seeker'`
// (with `Brand: solanamobile`, `Manufacturer: Solana Mobile Inc.`). We're a
// PWA / TWA — `Platform.constants` doesn't exist in the browser, and the
// docs explicitly call out that "the Platform Constants API can be spoofed
// and should not be used for use cases where you need a guaranteed Seeker
// user." The doc's *guaranteed* path is verifying an SGT (Seeker Genesis
// Token) NFT on-chain after a SIWS handshake. That's overkill for this
// surface — we only use the signal to (a) decide whether to mount the
// Mobile Wallet Adapter (avoids "wallet not found" on plain Android) and
// (b) surface the user's `.skr` handle as a nickname suggestion. A spoofer
// gains nothing from a false positive on either path, and a false NEGATIVE
// on a real Seeker just means the user taps MWA themselves and types their
// nickname manually instead of one-tap-applying their `.skr`. Both paths
// are recoverable.
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
// Web-equivalent UA markers — Brand/Manufacturer/Model surface in the
// Android WebView UA string Solana Mobile devices ship:
//   - Saga (OG): "OnePlus" + "Saga" model code
//   - Saga 2 / Seeker: "Seeker" model token, "Solana Mobile" brand token
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
  // ("OnePlus" — original Saga) or one of the Solana Mobile brand tokens.
  // The flagship tokens we look for:
  //   - `Seeker` (the Model field on Seeker firmware MR4+)
  //   - `Solana Mobile` (the Manufacturer field — "Solana Mobile Inc.")
  //   - `solanamobile` (the Brand field — emitted as the lowercase build
  //     fingerprint on Seeker; the spaceless variant won't be caught by
  //     `\bSolana\b.*\bMobile\b` so we add it explicitly)
  const isSagaSeeker =
    /\bSeeker\b/i.test(ua) ||
    /\bSolana\b.*\bMobile\b/i.test(ua) ||
    /solanamobile/i.test(ua) ||
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
