import { useState, useEffect, useRef } from 'react';

const MOBILE_BREAKPOINT = 600;

function getState() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    isMobile: w < MOBILE_BREAKPOINT || h < MOBILE_BREAKPOINT,
    isLandscape: w > h && h < MOBILE_BREAKPOINT,
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
      // Farcaster WebView firing resize events constantly.
      if (next.isMobile !== prevRef.current.isMobile || next.isLandscape !== prevRef.current.isLandscape) {
        prevRef.current = next;
        setState(next);
      }
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return state;
}
