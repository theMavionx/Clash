import { STRIKE_APP_URL } from '../../lib/strikeClient';

/** One-tap Strike onboarding: sign Strike's builder consent once to create a trading key. */
export default function StrikeSetup({ connectWithWallet, loading, restoring = false, error, onboardingStep = '', evmAddress = '', feeBps = null, onClose }) {
  const box = { padding: 24, margin: 'auto', maxWidth: 480, color: 'var(--terminal-text)' };
  const button = { width: '100%', boxSizing: 'border-box', padding: 12, marginTop: 12, background: 'var(--terminal-surface)',
    color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
  if (restoring) {
    return <section aria-label="Connect Strike" aria-busy="true" style={{ ...box, textAlign: 'center' }}>
      <div role="status" aria-live="polite" style={{ padding: '40px 0', fontSize: 14, fontWeight: 600 }}>Loading your Strike account…</div>
    </section>;
  }
  return <section aria-label="Connect Strike" style={box}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <img src="/strike-logo.png" alt="" width="32" height="32" style={{ borderRadius: 16 }} />
      <h2 style={{ margin: 0 }}>Connect Strike</h2>
    </div>
    <p>Strike Finance perps: crypto, stocks, indices and commodities. Sign one message with your EVM wallet to create your
      Strike account (first time only) and enable one-tap trading. The trading key can place and cancel orders but cannot
      withdraw. No gas, no transaction.</p>
    <p style={{ fontSize: 13, opacity: 0.8 }}>
      {evmAddress ? `Wallet: ${evmAddress.slice(0, 6)}…${evmAddress.slice(-4)}. ` : 'Connect an EVM wallet first. '}
      Orders go through Clash's builder code{feeBps != null ? ` (builder fee ${Number(feeBps) / 100}% per fill)` : ''}.
    </p>
    <button type="button" onClick={() => connectWithWallet?.()} disabled={loading || !connectWithWallet} style={button}>
      {loading ? (onboardingStep || 'Waiting for signature…') : 'Connect with wallet'}
    </button>
    {error && <p role="alert">{error}</p>}
    <p style={{ fontSize: 12, opacity: 0.75, marginTop: 16 }}>
      After connecting, deposit USDC or ETH from this wallet on Ethereum in the Strike account tab, or on{' '}
      <a href={STRIKE_APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--terminal-orange)' }}>app.strikefinance.org</a>.
    </p>
    {onClose && <button type="button" onClick={onClose} style={{ ...button, background: 'transparent', fontWeight: 400 }}>Back</button>}
  </section>;
}
