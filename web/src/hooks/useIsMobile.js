import { useState, useEffect, useRef } from 'react';

const MOBILE_BREAKPOINT = 600;

// Action-bar buttons (SHOP / ATTACK / TRADE / AI / TOURNAMENT) total a
// fixed pixel width on mobile. On 400+ px phones that fits comfortably,
// but on 360-and-narrower the wrapLeft + AI + wrapRight groups can clip
// each other. Compute a 0-to-1 scale here so all consumers shrink in
// step instead of guessing per-component. Anchored at 400px (1.0) and
// floors at 0.72 so even 320px Galaxy Fold cover screens stay usable.
function computeActionScale(w) {
  if (!Number.isFinite(w) || w >= 400) return 1;
  if (w <= 320) return 0.72;
  // Linear interp between 320 (0.72) and 400 (1.0).
  return 0.72 + ((w - 320) / 80) * 0.28;
}

function getState() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isMobile = w < MOBILE_BREAKPOINT || h < MOBILE_BREAKPOINT;
  return {
    isMobile,
    isLandscape: w > h && h < MOBILE_BREAKPOINT,
    vw: w,
    // Only scale on mobile; desktop always full-size.
    actionScale: isMobile ? computeActionScale(w) : 1,
  };
}

export function useIsMobile() {
  const [isMobile] = useState(() => getState().isMobile);
  // Static — no resize listener. Mobile doesn't change mid-session.
  return isMobile;
}

export function useLayout() {
  const [state, setState] = useState(getState);
  const prevRef = useRef(state);

  useEffect(() => {
    const check = () => {
      const next = getState();
      // Only update if values actually changed — prevents re-renders from
      // Farcaster WebView firing resize events constantly. actionScale is
      // quantized to 2 decimal places so micro-pixel resize wiggles don't
      // ping-pong the scale either.
      const prev = prevRef.current;
      const scaleDelta = Math.abs(next.actionScale - prev.actionScale);
      if (
        next.isMobile !== prev.isMobile
        || next.isLandscape !== prev.isLandscape
        || scaleDelta > 0.01
      ) {
        prevRef.current = next;
        setState(next);
      }
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return state;
}
