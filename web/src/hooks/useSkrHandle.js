// React hook wrapping `lib/skrName.js`. Resolves a Seeker `.skr` handle for
// the active wallet so the register flow can suggest it as a nickname and
// the profile UI can surface it next to the address.
//
// Gating logic:
//   - Only fires when `useSolanaMobile()` says we're on Saga/Seeker. Off-
//     device users wouldn't typically have a `.skr` and the lookup would
//     just spin RPC quota for negatives.
//   - Only fires for Solana base58 addresses (32–44 chars, no `0x`). EVM /
//     Aptos wallets can't own `.skr` — early-return null without an RPC hit.
//   - Re-runs whenever the wallet string changes; otherwise uses the
//     localStorage cache built into `resolveSkrName`.

import { useEffect, useRef, useState } from 'react';
import { resolveSkrName } from '../lib/skrName';
import { useSolanaMobile } from './useSolanaMobile';

function looksLikeSolanaAddress(s) {
  if (typeof s !== 'string') return false;
  if (s.startsWith('0x') || s.startsWith('0X')) return false;
  return s.length >= 32 && s.length <= 48;
}

/**
 * @param {string|null|undefined} wallet — base58 Solana address.
 * @returns {{ handle: { name: string, full: string } | null, loading: boolean }}
 *   `handle.full` is `"alice.skr"`; null when the wallet has no primary `.skr`
 *   or while the lookup is in flight.
 */
export function useSkrHandle(wallet) {
  const { isSolanaMobile, ready: smReady } = useSolanaMobile();
  const [state, setState] = useState({ handle: null, loading: false });
  const lastWalletRef = useRef(null);

  useEffect(() => {
    if (!smReady) return;
    if (!isSolanaMobile) {
      // Non-Seeker: don't probe. Clears stale state if user switched away.
      setState({ handle: null, loading: false });
      lastWalletRef.current = null;
      return;
    }
    if (!looksLikeSolanaAddress(wallet)) {
      setState({ handle: null, loading: false });
      lastWalletRef.current = null;
      return;
    }
    if (lastWalletRef.current === wallet) return;
    lastWalletRef.current = wallet;

    let cancelled = false;
    setState(s => ({ handle: s.handle, loading: true }));
    (async () => {
      const handle = await resolveSkrName(wallet);
      if (cancelled) return;
      setState({ handle, loading: false });
    })();
    return () => { cancelled = true; };
  }, [wallet, isSolanaMobile, smReady]);

  return state;
}
