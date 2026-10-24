import { THRONE_APP_URL } from '../../lib/throneOrderly';

/** One-tap Throne onboarding: register under broker "throne" (if needed) and enable a trading key. */
export default function ThroneSetup({ connectWithWallet, loading, restoring = false, error, onboardingStep = '', evmAddress = '', onClose }) {
  const box = { padding: 24, margin: 'auto', maxWidth: 480, color: 'var(--terminal-text)' };
  const button = { width: '100%', boxSizing: 'border-box', padding: 12, marginTop: 12, background: 'var(--terminal-surface)',
    color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
  if (restoring) {
    return <section aria-label="Connect Throne" aria-busy="true" style={{ ...box, textAlign: 'center' }}>
      <div role="status" aria-live="polite" style={{ padding: '40px 0', fontSize: 14, fontWeight: 600 }}>Loading your Throne account…</div>
    </section>;
  }
  return <section aria-label="Connect Throne" style={box}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <img src="/throne-logo.png" alt="" width="32" height="32" style={{ borderRadius: 8 }} />
      <h2 style={{ margin: 0 }}>Connect Throne</h2>
    </div>
    <p>Throne runs on Orderly Network. Sign with your EVM wallet to create your Throne account (first time only) and enable one-tap trading.
      The trading key can place and cancel orders but cannot withdraw. No gas, no transaction.</p>
    <p style={{ fontSize: 13, opacity: 0.8 }}>
      {evmAddress ? `Wallet: ${evmAddress.slice(0, 6)}…${evmAddress.slice(-4)}. ` : 'Connect an EVM wallet first. '}
      Orders count toward Throne's board and King Drop.
    </p>
    <button type="button" onClick={() => connectWithWallet?.()} disabled={loading || !connectWithWallet} style={button}>
      {loading ? (onboardingStep || 'Waiting for signature…') : 'Connect with wallet'}
    </button>
    {error && <p role="alert">{error}</p>}
    <p style={{ fontSize: 12, opacity: 0.75, marginTop: 16 }}>
      Fund your account with USDC on <a href={THRONE_APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--terminal-orange)' }}>throne.network</a>; the balance appears here automatically.
    </p>
    {onClose && <button type="button" onClick={onClose} style={{ ...button, background: 'transparent', fontWeight: 400 }}>Back</button>}
  </section>;
}
