import { useState, useEffect, useCallback } from 'react';

let sdkInstance = null;
let initPromise = null;
let _resolved = false;
let _inMiniApp = false;
let _cachedContext = null;
let _resolveDetect;
const detectPromise = new Promise((r) => { _resolveDetect = r; });

function _log(level, message) {
  fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message, ua: navigator.userAgent, url: location.href }),
  }).catch(() => {});
}

// Always init SDK and call ready()
initPromise = import('@farcaster/miniapp-sdk').then(async (mod) => {
  sdkInstance = mod.sdk;
  _log('info', 'SDK imported, calling ready()');
  await mod.sdk.actions.ready({ disableNativeGestures: true });
  _log('info', 'ready() done');

  // Check if we're actually inside a mini app — cache context for useFarcaster hook
  try {
    const ctx = await mod.sdk.context;
    _cachedContext = ctx;
    if (ctx?.user) {
      _inMiniApp = true;
      _log('info', `Detected mini app: fid=${ctx.user.fid}, platform=${ctx?.client?.platformType || '?'}`);
    }
  } catch { /* ctx unavailable — treat as non-miniapp */ }

  _resolved = true;
  _resolveDetect(_inMiniApp);
  return mod.sdk;
}).catch((err) => {
  _log('error', `SDK init failed: ${err}`);
  _resolved = true;
  _resolveDetect(false);
  return null;
});

/**
 * Synchronous check — returns true if we already know we're in a mini app.
 * Falls back to iframe check if SDK hasn't resolved yet.
 */
export function isFarcasterFrame() {
  if (_inMiniApp) return true;
  if (_resolved) return false;
  // SDK not resolved yet — use iframe check as temporary guess
  try { return window !== window.parent; } catch { return true; }
}

/**
 * Async version — waits for SDK detection to complete.
 * Use this in WalletProvider to properly wait.
 */
export { detectPromise as farcasterDetectPromise };

// Returns the EIP-1193 provider from the Farcaster frame host (Warpcast /
// Coinbase Wallet / other FC clients). Used to sign Avantis trades without
// leaving the frame. Resolves to null when not in a frame OR when the host
// client hasn't exposed an EVM provider (Warpcast mobile WebView on some
// OS/versions). Callers must handle null gracefully — don't silently register
// a walletless account.
export async function getFarcasterEthProvider() {
  const sdk = await initPromise;
  if (!sdk) return null;
  // Current SDK: getEthereumProvider() (async, may return null).
  // Legacy: sdk.wallet.ethProvider direct property. Warpcast still ships
  // the legacy property for back-compat — try both.
  try {
    const w = sdk?.wallet;
    if (!w) return null;
    if (typeof w.getEthereumProvider === 'function') {
      const prov = await w.getEthereumProvider();
      if (prov) return prov;
    }
    return w.ethProvider || null;
  } catch { return null; }
}

export function useFarcaster() {
  const [isInFrame, setIsInFrame] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    initPromise.then((sdk) => {
      if (cancelled || !sdk) { setLoading(false); return; }

      // Use cached context from module init — no second await
      const ctx = _cachedContext;
      if (ctx?.user && !cancelled) {
        setIsInFrame(true);
        setUser({
          fid: Number(ctx.user.fid) || 0,
          username: String(ctx.user.username || ''),
          displayName: String(ctx.user.displayName || ''),
          pfpUrl: String(ctx.user.pfpUrl || ''),
        });
      }

      if (!cancelled) setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const shareCast = useCallback(async (text) => {
    if (!sdkInstance || !isInFrame) return;
    try {
      await sdkInstance.actions.openUrl(
        `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent('https://clashofperps.fun')}`
      );
    } catch { /* openUrl unsupported on this host */ }
  }, [isInFrame]);

  return { isInFrame, user, loading, shareCast };
}
