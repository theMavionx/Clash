import { useState, useEffect, useCallback } from 'react';

let sdkInstance = null;
let initPromise = null;

export function isFarcasterFrame() {
  try {
    return window !== window.parent;
  } catch {
    return true;
  }
}

// Start SDK init immediately on module load (but don't call ready() yet)
if (isFarcasterFrame()) {
  initPromise = import('@farcaster/miniapp-sdk').then((mod) => {
    sdkInstance = mod.sdk;
    return mod.sdk;
  }).catch(() => null);
}

export function useFarcaster() {
  const [isInFrame, setIsInFrame] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFarcasterFrame());

  useEffect(() => {
    if (!initPromise) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    initPromise.then(async (sdk) => {
      if (cancelled || !sdk) { setLoading(false); return; }
      setIsInFrame(true);

      try {
        // sdk.context is a Comlink Proxy — MUST await it
        const ctx = await sdk.context;
        if (ctx?.user) {
          setUser({
            fid: Number(ctx.user.fid) || 0,
            username: String(ctx.user.username || ''),
            displayName: String(ctx.user.displayName || ''),
            pfpUrl: String(ctx.user.pfpUrl || ''),
          });
        }
      } catch {}

      // Tell Farcaster the app is ready — hides their splash screen
      try { await sdk.actions.ready(); } catch {}

      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const shareCast = useCallback(async (text) => {
    if (!sdkInstance || !isInFrame) return;
    try {
      await sdkInstance.actions.openUrl(
        `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent('https://clashofperps.fun')}`
      );
    } catch {}
  }, [isInFrame]);

  return { isInFrame, user, loading, shareCast };
}
