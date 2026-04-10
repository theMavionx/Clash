import { useState, useEffect } from 'react';

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
  const [state, setState] = useState(getState);

  useEffect(() => {
    const check = () => setState(getState());
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return state.isMobile;
}

export function useLayout() {
  const [state, setState] = useState(getState);

  useEffect(() => {
    const check = () => setState(getState());
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return state;
}
