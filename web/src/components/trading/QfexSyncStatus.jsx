import { qfexSyncMessage } from '../../lib/qfexClient';

/** Persistent reward-sync status; account/price refreshes must not dismiss failures. */
export default function QfexSyncStatus({ status, onRetry }) {
  if (!status) return null;
  const warning = !!status.error || status.builder_configured === false || status.unmatched_executions > 0 || status.unverified_fills > 0;
  return <div role={status.error ? 'alert' : 'status'} aria-live="polite" style={{
    padding: '10px 12px', borderRadius: 10, border: '1px solid var(--terminal-border, #ffffff12)',
    background: 'var(--terminal-input-bg, #1A1B1E)', color: warning ? 'var(--terminal-orange, #fb7c29)' : 'var(--terminal-text-secondary, #979899)',
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, lineHeight: 1.5,
  }}>
    <span style={{ flex: '1 1 240px' }}>{qfexSyncMessage(status)}</span>
    {onRetry && <button type="button" disabled={!!status.syncing} onClick={onRetry} style={{
      border: '1px solid var(--terminal-border, #ffffff12)', borderRadius: 7, padding: '7px 10px',
      background: 'var(--terminal-panel-bg, #111112)', color: 'var(--terminal-text, #E8E9EF)',
      cursor: status.syncing ? 'wait' : 'pointer', font: 'inherit', whiteSpace: 'nowrap',
    }}>{status.syncing ? 'Syncing…' : status.error ? 'Retry sync' : 'Refresh sync'}</button>}
  </div>;
}
