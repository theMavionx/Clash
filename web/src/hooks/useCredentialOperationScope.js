import { useCallback, useLayoutEffect, useRef } from 'react';
import { assertCredentialScope, captureCredentialScope } from '../lib/encryptedCredentialStorage';

/** Bind asynchronous setup/revocation to the login and wallet that started it. */
export function useCredentialOperationScope({ player, wallet, dex, token } = {}) {
  const playerId = String(player?.player_id || player?.id || '');
  const expectedToken = token ?? player?.token ?? null;
  const owner = String(wallet || '');
  const venue = String(dex || '');
  const latest = useRef(null);
  useLayoutEffect(() => {
    // Restore on StrictMode effect replay; cleanup also invalidates retained callbacks.
    latest.current = { playerId, token: expectedToken, owner, venue };
    return () => { latest.current = null; };
  }, [playerId, expectedToken, owner, venue]);

  const assert = useCallback(scope => {
    assertCredentialScope(scope);
    const current = latest.current;
    if (!current || !playerId || String(scope?.playerId) !== playerId
      || current.playerId !== playerId || current.token !== expectedToken
      || current.owner !== owner || current.venue !== venue
      || (expectedToken && typeof window !== 'undefined' && window._playerToken !== expectedToken)) {
      throw new Error('Trading account or wallet changed. Reopen this exchange to continue.');
    }
    return scope;
  }, [playerId, expectedToken, owner, venue]);
  const capture = useCallback(() => assert(captureCredentialScope()), [assert]);
  return { capture, assert };
}
