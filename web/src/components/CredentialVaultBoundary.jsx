import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePlayer } from '../hooks/useGodot';
import { useCredentialVaultUnlock } from '../hooks/useCredentialVaultUnlock';
import { credentialVault } from '../lib/encryptedCredentialStorage';
import { clearTradePrefetchCache } from '../lib/tradePrefetch';

const box = { background: 'var(--terminal-surface)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', borderRadius: 16, padding: 18, boxShadow: 'var(--terminal-shadow-card)' };
const button = { background: 'var(--terminal-neutral-button)', border: '1px solid var(--terminal-neutral-button)', borderRadius: 999, color: '#ffffff', padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' };
const closeButton = { width: 32, height: 32, padding: 0, borderRadius: 999, border: '1px solid transparent', background: 'transparent', color: 'var(--terminal-text-secondary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 };
const short = value => value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '';

export default function CredentialVaultBoundary({ children }) {
  const player = usePlayer();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
  const playerId = player?.player_id || player?.id ? String(player.player_id || player.id) : null;
  const guest = !!player?.is_guest || String(player?.wallet || '').startsWith('local_guest_');
  const state = useSyncExternalStore(credentialVault.subscribe, credentialVault.getSnapshot, credentialVault.getSnapshot);
  const [open, setOpen] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const { unlock, busy, error: unlockError } = useCredentialVaultUnlock({ token, playerId,
    onUnlocked: async () => { await credentialVault.refresh(); setNeedsReload(true); } });
  useEffect(() => {
    clearTradePrefetchCache();
    setOpen(false); setError(''); setNeedsReload(false);
    if (!token || !playerId || guest) { credentialVault.lock({ revoke: false }); return; }
    void credentialVault.begin({ token, playerId });
  }, [token, playerId, guest]);
  useEffect(() => {
    // A new API key may select another exchange account for the same game login.
    // Do not reuse account data fetched with the previous key after sync/save.
    clearTradePrefetchCache();
  }, [state.epoch, state.pending]);
  async function run(action) {
    setWorking(true); setError('');
    try { await action(); setNeedsReload(true); }
    catch (failure) { setError(failure?.message || 'Secure key sync failed.'); }
    finally { setWorking(false); }
  }
  if (!token || !playerId || guest) return children;
  const hydrated = state.playerId === playerId && (state.ready || state.phase === 'error');
  // Healthy login-time sync is deliberately invisible. Keep the recovery
  // surface only when an upload/conflict/error really needs the player's
  // attention (and always in development for the isolated vault fixture).
  const needsAttention = state.pending > 0
    || state.candidates.length > 0
    || state.conflicts.length > 0
    || !!state.error;
  const showManager = import.meta.env.DEV || needsAttention;
  // GodotCanvas remains mounted outside this boundary. Old account hooks cannot
  // run while this player's secrets are loading, even for a single render.
  return <>
    {/* Sync runs in the background and never blocks the UI. Children remount once
        when hydration finishes so hooks reload the synced keys; writes made before
        then are rejected by the vault scope check ("Wait for secure trading storage"). */}
    <div key={`${playerId}:${state.epoch}:${hydrated ? 'ready' : 'sync'}`} style={{ display: 'contents' }}>{children}</div>
    {state.playerId === playerId && state.phase === 'error' &&
      <div role="status" style={{ ...box, position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1200 }}>
        Trading key sync needs attention.
        <button type="button" style={{ ...button, marginLeft: 10 }} onClick={() => run(() => credentialVault.refresh())}>Retry</button>
      </div>}
    {showManager && <button type="button" style={{ ...button, position: 'fixed', left: '50%', bottom: 9, transform: 'translateX(-50%)',
      zIndex: 1100, background: 'var(--terminal-surface)', color: 'var(--terminal-text)', fontSize: 11, padding: '6px 12px', border: '1px solid var(--terminal-border)' }}
      onClick={() => setOpen(true)}>{needsAttention ? 'Trading key sync · action needed' : 'Manage trading key sync'}</button>}
    {open && <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--terminal-overlay)', backdropFilter: 'blur(var(--cb-scrim-blur))', WebkitBackdropFilter: 'blur(var(--cb-scrim-blur))', display: 'grid', placeItems: 'center', padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="vault-title" style={{ ...box, width: 'min(520px, 100%)', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="vault-title" style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Secure trading keys</h2>
          <button type="button" aria-label="Close secure trading keys" onClick={() => setOpen(false)} style={closeButton}>×</button>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>Exchange API keys and delegated trading signers sync to your Clash account, encrypted on our server. Main wallet keys and seed phrases are never uploaded. This does not authorize a bot to trade.</p>
        <p style={{ fontSize: 13 }}>{state.count} saved on this device · {state.pending} waiting to sync</p>
        {!state.unlocked && <>
          <p style={{ fontSize: 13 }}>Confirm your account wallet once to restore or back up trading keys. The signature is not a transaction.</p>
          {state.unlockWallets.map(item => {
            const wallet = typeof item === 'string' ? item : item.wallet;
            return <button key={wallet} type="button" disabled={busy || working} style={{ ...button, margin: '4px 6px 4px 0' }}
              onClick={() => run(() => unlock(wallet))}>Verify {short(wallet)}</button>;
          })}
        </>}
        {state.candidates.length > 0 && <>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Older keys on this browser</h3>
          <p style={{ fontSize: 12 }}>Import only keys that belong to this Clash account. Shared-browser keys cannot be assigned automatically.</p>
          {state.candidates.map(row => <div key={row.name} style={{ borderTop: '1px solid var(--terminal-border)', padding: '10px 0' }}>
            <span>{row.label} {row.owner ? short(row.owner) : '(account not verified)'}</span>{' '}
            <button type="button" disabled={!state.unlocked || busy || working} style={button}
              onClick={() => run(() => credentialVault.approveLegacy(row.name))}>Import to this account</button>
          </div>)}
        </>}
        {state.conflicts.map(row => <div key={row.key} style={{ borderTop: '1px solid var(--terminal-border)', padding: '10px 0' }}>
          <p style={{ fontSize: 12 }}>{row.label}: a newer key or deletion exists on the server. Your conflicting local {row.deleted ? 'deletion' : 'key'} is preserved encrypted.</p>
          <button type="button" disabled={!state.unlocked || busy || working} style={button}
            onClick={() => run(() => credentialVault.useConflict(row.key))}>Replace server version with local {row.deleted ? 'deletion' : 'key'}</button>
        </div>)}
        {(error || unlockError || state.error) && <p role="alert" style={{ color: 'var(--terminal-short)', fontSize: 13 }}>{error || unlockError || state.error}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" disabled={busy || working} style={button} onClick={() => run(() => credentialVault.refresh())}>Retry sync</button>
          {needsReload && <button type="button" style={button} onClick={() => window.location.reload()}>Reload to reconnect venues</button>}
        </div>
        {needsReload && <p style={{ fontSize: 12 }}>Reload after your battle to use restored keys in already-open trading panels.</p>}
      </section>
    </div>}
  </>;
}
