import { useState, useEffect, useCallback } from 'react';

let sdkModule = null;
let sdkReady = false;

// Detect if we're running inside a Farcaster client (Warpcast)
function isFarcasterFrame() {
  try {
    return window !== window.parent || window.location.search.includes('fc_');
  } catch {
    return true; // cross-origin iframe = likely Farcaster
  }
}

export function useFarcaster() {
  const [isInFrame, setIsInFrame] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFarcasterFrame()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        // Dynamic import — only load SDK when inside Farcaster
        if (!sdkModule) {
          sdkModule = await import('@farcaster/miniapp-sdk');
        }
        const { sdk } = sdkModule;

        if (!sdkReady) {
          // Signal to Farcaster client that app is ready (dismisses splash)
          await sdk.actions.ready();
          sdkReady = true;
        }

        if (cancelled) return;
        setIsInFrame(true);

        // Get user context
        if (sdk.context?.user) {
          setUser({
            fid: sdk.context.user.fid,
            username: sdk.context.user.username,
            displayName: sdk.context.user.displayName,
            pfpUrl: sdk.context.user.pfpUrl,
          });
        }
      } catch (e) {
        console.warn('Farcaster SDK init failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Share a cast (post) to Farcaster
  const shareCast = useCallback(async (text) => {
    if (!sdkModule || !isInFrame) return;
    try {
      const { sdk } = sdkModule;
      await sdk.actions.openUrl(
        `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent('https://clashofperps.fun')}`
      );
    } catch {}
  }, [isInFrame]);

  return { isInFrame, user, loading, shareCast };
}
