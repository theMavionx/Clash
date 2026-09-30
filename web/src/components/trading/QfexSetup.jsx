import { useState } from 'react';

/** Connect an existing QFEX trading API key without exposing saved secrets. */
export default function QfexSetup({ activate, loading, error, onClose }) {
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [failure, setFailure] = useState('');
  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: 12, marginTop: 6, background: 'var(--terminal-surface)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', borderRadius: 8 };
  const submit = async (event) => {
    event.preventDefault();
    setFailure('');
    const result = await activate({ publicKey, secretKey, accountId });
    if (result?.error) setFailure(result.error);
    else { setPublicKey(''); setSecretKey(''); setAccountId(''); }
  };
  return <section aria-label="Connect QFEX" style={{ padding: 24, margin: 'auto', maxWidth: 480, color: 'var(--terminal-text)' }}>
    <h2 style={{ textAlign: 'center' }}>Connect QFEX</h2>
    <p>Enter an existing QFEX API key with trading permission. Use an API secret, never your wallet private key or recovery phrase.</p>
    <p>Credentials are encrypted and saved for your Clash account. Manage funding and key permissions directly in QFEX.</p>
    <form onSubmit={submit}>
      <label>Public API key<input style={inputStyle} autoComplete="off" value={publicKey} onChange={event => setPublicKey(event.target.value)} required /></label>
      <label style={{ display: 'block', marginTop: 14 }}>API secret<input style={inputStyle} type="password" autoComplete="new-password" value={secretKey} onChange={event => setSecretKey(event.target.value)} required /></label>
      <label style={{ display: 'block', marginTop: 14 }}>Account ID (optional)<input style={inputStyle} autoComplete="off" value={accountId} onChange={event => setAccountId(event.target.value)} /></label>
      {(failure || error) && <p role="alert">{failure || error}</p>}
      <button type="submit" disabled={loading || !publicKey.trim() || !secretKey.trim()} style={{ ...inputStyle, cursor: 'pointer', marginTop: 20 }}>{loading ? 'Checking account…' : 'Connect QFEX'}</button>
      {onClose && <button type="button" onClick={onClose} style={{ ...inputStyle, cursor: 'pointer' }}>Back</button>}
    </form>
  </section>;
}
