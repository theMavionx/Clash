import { qfexSyncMessage } from '../../lib/qfexClient';

/** Persistent reward-sync status; account/price refreshes must not dismiss failures. */
export default function QfexSyncStatus({ status, onRetry }) {
  if (!status) return null;
  const warning = !!status.error || status.builder_configured === false || status.unmatched_executions > 0 || status.unverified_fills > 0;
  return <div role={status.error ? 'alert' : 'status'} aria-live="polite" style={{
    padding: '10px 12px', borderRadius: 12, border: '1px solid var(--terminal-border)',
    background: 'var(--terminal-surface-muted)', color: warning ? 'var(--terminal-warning)' : 'var(--terminal-text-secondary)',
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, lineHeight: 1.5,
  }}>
    <span style={{ flex: '1 1 240px' }}>{qfexSyncMessage(status)}</span>
    {onRetry && <button type="button" disabled={!!status.syncing} onClick={onRetry} style={{
      border: '1px solid var(--terminal-border)', borderRadius: 999, padding: '7px 12px',
      background: 'var(--terminal-surface)', color: 'var(--terminal-text)',
      cursor: status.syncing ? 'wait' : 'pointer', font: 'inherit', fontWeight: 600, whiteSpace: 'nowrap',
    }}>{status.syncing ? 'Syncing…' : status.error ? 'Retry sync' : 'Refresh sync'}</button>}
  </div>;
}
