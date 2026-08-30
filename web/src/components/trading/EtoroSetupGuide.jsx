import { ETORO_TRADING_SETTINGS_URL } from '../../lib/etoroClient';

const linkStyle = { color: 'var(--terminal-brand-strong)', textDecoration: 'underline' };

export default function EtoroSetupGuide() {
  return (
    <details style={{
      background: 'var(--terminal-surface-subtle)',
      border: '1px solid var(--terminal-border)',
      borderRadius: 12,
      padding: '12px 14px',
      color: 'var(--terminal-text-muted)',
      fontSize: 12,
      lineHeight: 1.5,
    }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--terminal-text)' }}>
        How to create your eToro user key
      </summary>
      <ol style={{ margin: '12px 0', paddingLeft: 20, display: 'grid', gap: 10 }}>
        <li>
          Log in to eToro and open{' '}
          <a href={ETORO_TRADING_SETTINGS_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            Settings → Trading
          </a>.
        </li>
        <li>Under API Key Management, select Create New Key.</li>
        <li>
          Choose a key name (for example, Clash of Perps), set Environment to <strong>Real</strong>,
          and enable <strong>Write</strong> permission for trading. Read-only permission cannot
          place orders. IP whitelist and expiration are optional. Select Generate Key.
        </li>
        <li>
          Complete verification on eToro using the code sent to your phone. If the SMS has not
          arrived after about 10 seconds, choose Try via Phone Call.
        </li>
        <li>
          In Generated Keys, copy the new ETORO_USER_KEY and paste it into the eToro user key
          field below. This is separate from the application API key (x-api-key).
        </li>
      </ol>
      <div style={{ fontSize: 11 }}>
        Never enter your SMS verification code in Clash.{' '}
        <a
          href="https://api-portal.etoro.com/core/getting-started/authentication"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          Official eToro guide
        </a>
      </div>
    </details>
  );
}
