import { useCallback, useMemo, useState } from 'react';

const sessionChoices = new Map();
const validSymbol = value => value === 'USDC' || value === 'lvUSD';
const ownerKey = wallet => /^0x[0-9a-f]{40}$/i.test(String(wallet || ''))
  ? `clash:leverup:143:collateral:v1:${wallet.toLowerCase()}` : null;

export function readLeverupCollateral(wallet) {
  const key = ownerKey(wallet);
  if (!key) return 'USDC';
  if (sessionChoices.has(key)) return sessionChoices.get(key);
  try {
    const value = window.localStorage.getItem(key);
    if (validSymbol(value)) { sessionChoices.set(key, value); return value; }
  } catch { /* Storage may be disabled; retain this session's explicit choice. */ }
  return sessionChoices.get(key) || 'USDC';
}

export function saveLeverupCollateral(wallet, symbol) {
  const key = ownerKey(wallet);
  if (!key || !validSymbol(symbol)) return false;
  sessionChoices.set(key, symbol);
  try { window.localStorage.setItem(key, symbol); } catch { /* Session fallback. */ }
  return true;
}

export function useLeverupCollateral(wallet) {
  const owner = String(wallet || '').toLowerCase();
  const restored = useMemo(() => readLeverupCollateral(owner), [owner]);
  const [choice, setChoice] = useState(null);
  // Derive the current wallet's value immediately: never render the previous
  // wallet's asset while waiting for an effect, and never persist defaults.
  const symbol = choice?.owner === owner ? choice.symbol : restored;
  const setSymbol = useCallback(value => {
    if (saveLeverupCollateral(owner, value)) setChoice({ owner, symbol: value });
  }, [owner]);
  return [symbol, setSymbol];
}
