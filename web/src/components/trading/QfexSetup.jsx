import { useState } from 'react';

/** Connect QFEX with one wallet signature, or fall back to an existing trading API key. */
export default function QfexSetup({ activate, loading, error, onClose, walletRegistration = false, connectWithWallet, evmAddress = '' }) {
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [failure, setFailure] = useState('');
  const [showKeys, setShowKeys] = useState(!walletRegistration);
  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: 12, marginTop: 6, background: 'var(--terminal-surface)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', borderRadius: 8 };
  const submit = async (event) => {
    event.preventDefault();
    setFailure('');
    const result = await activate({ publicKey, secretKey, accountId });
    if (result?.error) setFailure(result.error);
    else { setPublicKey(''); setSecretKey(''); setAccountId(''); }
  };
  const wallet = async () => {
    setFailure('');
    const result = await connectWithWallet();
    if (result?.error) setFailure(result.error);
  };
  return <section aria-label="Connect QFEX" style={{ padding: 24, margin: 'auto', maxWidth: 480, color: 'var(--terminal-text)' }}>
    <h2 style={{ textAlign: 'center' }}>Connect QFEX</h2>
    {walletRegistration && connectWithWallet && <div>
      <p>Sign one message with your EVM wallet. We create a trading-only QFEX key for you: it can trade but cannot withdraw. No gas, no transaction.</p>
      <p style={{ fontSize: 13, opacity: 0.8 }}>
        {evmAddress ? `Wallet: ${evmAddress.slice(0, 6)}…${evmAddress.slice(-4)}. ` : ''}
        New QFEX accounts must finish QFEX onboarding before trading. Connecting again replaces the previous Clash key for this wallet.
      </p>
      <button type="button" onClick={wallet} disabled={loading} style={{ ...inputStyle, cursor: 'pointer', marginTop: 12, fontWeight: 700 }}>
        {loading ? 'Waiting for signature…' : 'Connect with wallet'}
      </button>
    </div>}
    {!walletRegistration && <>
      <p>Enter an existing QFEX API key with trading permission. Use an API secret, never your wallet private key or recovery phrase.</p>
      <p>Credentials are encrypted and saved for your Clash account. Manage funding and key permissions directly in QFEX.</p>
    </>}
    {walletRegistration && !showKeys && <button type="button" onClick={() => setShowKeys(true)} style={{ ...inputStyle, cursor: 'pointer', marginTop: 12, background: 'transparent' }}>Use an existing API key instead</button>}
    {(failure || error) && <p role="alert">{failure || error}</p>}
    {showKeys && <form onSubmit={submit} style={{ marginTop: walletRegistration ? 16 : 0 }}>
      <label>Public API key<input style={inputStyle} autoComplete="off" value={publicKey} onChange={event => setPublicKey(event.target.value)} required /></label>
      <label style={{ display: 'block', marginTop: 14 }}>API secret<input style={inputStyle} type="password" autoComplete="new-password" value={secretKey} onChange={event => setSecretKey(event.target.value)} required /></label>
      <label style={{ display: 'block', marginTop: 14 }}>Account ID (optional)<input style={inputStyle} autoComplete="off" value={accountId} onChange={event => setAccountId(event.target.value)} /></label>
      <button type="submit" disabled={loading || !publicKey.trim() || !secretKey.trim()} style={{ ...inputStyle, cursor: 'pointer', marginTop: 20 }}>{loading ? 'Checking account…' : 'Connect QFEX'}</button>
    </form>}
    {onClose && <button type="button" onClick={onClose} style={{ ...inputStyle, cursor: 'pointer' }}>Back</button>}
  </section>;
}
