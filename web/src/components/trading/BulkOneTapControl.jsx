import { useState } from 'react';
import PositionActionDialog from './PositionActionDialog';

export default function BulkOneTapControl({ state, setEnabled, revoke, reload }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [running, setRunning] = useState(false);
  const busy = running || state?.busy;
  const run = async action => {
    setRunning(true); setFeedback('');
    try { const result = await action(); if (result?.error) setFeedback(result.error); }
    catch (error) { setFeedback(error.message || 'Bulk one-tap request failed.'); }
    finally { setRunning(false); }
  };
  const button = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--terminal-border)',
    background: 'var(--terminal-surface)', color: 'var(--terminal-text)', cursor: busy ? 'wait' : 'pointer', fontWeight: 700 };
  return <>
    <button type="button" onClick={() => setOpen(true)} style={{ ...button, alignSelf: 'flex-end', padding: '5px 9px', fontSize: 11 }}>
      ⚡ One tap · {state?.enabled ? 'ON' : 'OFF'}
    </button>
    {open && <PositionActionDialog title="BULK one-tap trading" onClose={() => setOpen(false)} feedback={feedback || state?.message}>
      <p style={{ marginTop: 0 }}>Approve a dedicated trading key once with your wallet. Then open, close and cancel orders without a wallet popup for every action.</p>
      <p style={{ color: 'var(--terminal-text-muted)', fontSize: 12 }}>The key is saved in your encrypted Clash vault for this wallet and network. Trading can lose funds. Transfers and permission changes still require your main wallet.</p>
      {state?.signer && <p style={{ fontSize: 12 }}>Trading key: {state.signer.slice(0, 6)}…{state.signer.slice(-6)} · {state.approved ? 'Authorized' : 'Not confirmed'}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" style={button} disabled={busy || !state?.ready} onClick={() => run(() => setEnabled(!state?.enabled))}>
          {busy ? 'Checking / awaiting wallet…' : state?.enabled ? 'Pause one-tap' : 'Enable one-tap'}
        </button>
        {state?.saved && <button type="button" style={button} disabled={busy} onClick={() => run(revoke)}>Revoke key with wallet</button>}
        <button type="button" style={button} disabled={busy} onClick={() => run(reload)}>Refresh permission status</button>
      </div>
      <p style={{ color: 'var(--terminal-text-muted)', fontSize: 11, marginBottom: 0 }}>Pause uses wallet signing again. Revoke removes this key’s BULK permission. BULK grants do not have a configured expiry; revoke keys you no longer use. Other trading keys are untouched.</p>
    </PositionActionDialog>}
  </>;
}
