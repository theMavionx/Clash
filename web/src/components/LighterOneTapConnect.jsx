import { useRef, useState } from 'react';

const STATUS = {
  accounts: 'Finding your accounts…', prepare: 'Preparing your API key…',
  signature: 'Confirm in your wallet…', confirm: 'Confirming the same key on Lighter…',
  verify: 'Verifying account access…', referral: 'Confirming referral…',
  integrator: 'Approve Clash in your wallet…',
};

export default function LighterOneTapConnect({ label = 'Lighter', wallet, connect, status, disabled, referralCode, feeBps = 1, onConnected }) {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const start = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await connect({ accountIndex: selected === '' ? undefined : Number(selected) });
      if (result?.requiresAccountSelection) { setAccounts(result.accounts); return; }
      onConnected?.();
    } catch (e) {
      const cancelled = Number(e?.code ?? e?.cause?.code) === 4001 || /user rejected|user denied|request rejected/iu.test(e?.message || '');
      setError(cancelled ? 'Signature cancelled. You can retry when ready.' : e?.message || 'Connection failed. Retry to check the same key.');
    } finally { running.current = false; setBusy(false); }
  };
  const locked = busy || disabled;
  return (
    <section aria-label={'Connect ' + label + ' with wallet'} style={{display: 'grid', gap: 12, width: '100%', textAlign: 'center'}}>
      <div style={{fontSize: 13, lineHeight: 1.5, color: 'var(--terminal-text-muted)'}}>
        No API key to copy. Confirm a dedicated key with your EVM wallet.
        <div style={{fontSize: 12, marginTop: 5, overflowWrap: 'anywhere'}}>{wallet?.slice(0, 6)}…{wallet?.slice(-4)}</div>
      </div>
      {accounts.length > 1 && (
        <label style={{display: 'grid', gap: 6, textAlign: 'left', fontSize: 13}}>
          Choose your {label} account
          <select aria-label={label + ' account'} value={selected} onChange={e => setSelected(e.target.value)} disabled={locked}
            style={{padding: 12, minHeight: 44, width: '100%', borderRadius: 10, color: 'var(--terminal-text)', background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)'}}>
            <option value="">Select an account</option>
            {accounts.map(row => <option key={row.accountIndex} value={row.accountIndex}>Account {row.accountIndex} · {row.kind}</option>)}
          </select>
        </label>
      )}
      <button type="button" onClick={start} disabled={locked || (accounts.length > 1 && selected === '')}
        style={{minHeight: 48, width: '100%', padding: '13px 16px', border: 0, borderRadius: 12, background: '#ff7b29', color: '#fff', fontSize: 15, fontWeight: 800, cursor: locked ? 'wait' : 'pointer', opacity: locked ? 0.65 : 1}}>
        {busy ? (STATUS[status] || 'Connecting…') : 'Connect ' + label + ' with wallet'}
      </button>
      <div style={{fontSize: 11, lineHeight: 1.5, color: 'var(--terminal-text-faint)'}}>
        Existing keys and referrals stay unchanged. {referralCode ? `If no referral exists, this connects with ${referralCode}. ` : ''}
        Clash routing approval is {feeBps} bps and may require another wallet confirmation.
        The generated key is encrypted in this browser; it is not stored in the Clash database.
      </div>
      {error && <div role="alert" style={{padding: 12, borderRadius: 10, fontSize: 12, lineHeight: 1.5, color: 'var(--terminal-danger, #ff7777)', background: 'var(--terminal-danger-soft, #4b2222)'}}>{error}</div>}
    </section>
  );
}
