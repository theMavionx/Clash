/* Shared component and style-token exports intentionally live together. */
/* eslint-disable react-refresh/only-export-components */
import { memo } from 'react';
import { uiButton } from '../../styles/theme';

const SPINNER_CSS = `
  @keyframes trading-setup-spin { to { transform: rotate(360deg); } }
  @keyframes trading-setup-pulse { 0%, 100% { opacity: .76; } 50% { opacity: 1; } }
`;

export const tradingSetupStyles = {
  frame: {
    margin: '0 auto',
    width: '100%',
    maxWidth: 460,
    padding: 'clamp(14px, 3vh, 24px) clamp(14px, 4vw, 24px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(10px, 2vh, 16px)',
    fontFamily: '"Inter","Segoe UI",sans-serif',
    boxSizing: 'border-box',
    color: 'var(--terminal-text)',
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignSelf: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    border: '1px solid var(--terminal-border)',
    boxShadow: '0 8px 20px rgba(17,24,39,.10)',
  },
  logo: {
    width: '82%',
    height: '82%',
    objectFit: 'contain',
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
    textAlign: 'center',
  },
  kicker: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--terminal-orange)',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  kickerBlocked: { color: 'var(--terminal-short)' },
  title: {
    fontSize: 'clamp(18px, 2.6vh, 22px)',
    fontWeight: 750,
    color: 'var(--terminal-text)',
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--terminal-text-muted)',
    lineHeight: 1.45,
    maxWidth: 390,
  },
  stepList: {
    listStyle: 'none',
    margin: 0,
    padding: '12px 14px',
    background: 'var(--terminal-surface-subtle)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  stepItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 11,
  },
  stepBubble: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
    background: 'var(--terminal-surface-muted)',
    color: 'var(--terminal-text-faint)',
    border: '1px solid var(--terminal-border)',
    transition: 'background .2s, border-color .2s, color .2s',
    boxSizing: 'border-box',
  },
  stepBubble_pending: {},
  stepBubble_active: {
    background: 'var(--terminal-brand-soft)',
    border: '1px solid var(--terminal-orange)',
    color: 'var(--terminal-brand-strong)',
    boxShadow: '0 0 0 3px rgba(242,101,34,.12)',
  },
  stepBubble_done: {
    background: 'var(--terminal-long)',
    border: '1px solid var(--terminal-long)',
    color: 'var(--terminal-on-accent)',
  },
  stepBubble_error: {
    background: 'var(--terminal-short)',
    border: '1px solid var(--terminal-short)',
    color: 'var(--terminal-on-accent)',
  },
  stepText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    lineHeight: 1.25,
    flex: 1,
  },
  stepLabel: { fontSize: 13, fontWeight: 700, color: 'var(--terminal-text-muted)' },
  stepLabel_active: { color: 'var(--terminal-text)' },
  stepLabel_done: { color: 'var(--terminal-text)' },
  stepLabel_error: { color: 'var(--terminal-short)' },
  stepLabel_pending: {},
  stepHint: {
    fontSize: 11,
    color: 'var(--terminal-text-faint)',
    fontWeight: 600,
    marginTop: 1,
    overflowWrap: 'anywhere',
  },
  spinner: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--terminal-border)',
    borderTopColor: 'var(--terminal-orange)',
    animation: 'trading-setup-spin .9s linear infinite',
    boxSizing: 'border-box',
  },
  bigSpinner: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--terminal-border)',
    borderTopColor: 'var(--terminal-orange)',
    animation: 'trading-setup-spin .9s linear infinite',
    alignSelf: 'center',
    boxSizing: 'border-box',
  },
  workingHint: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--terminal-brand-text)',
    background: 'var(--terminal-brand-soft)',
    border: '1px solid var(--terminal-brand-border)',
    padding: '10px 14px',
    borderRadius: 12,
    textAlign: 'center',
    boxShadow: 'none',
    animation: 'trading-setup-pulse 2.4s ease-in-out infinite',
  },
  statusBox: {
    border: '1px solid var(--terminal-border)',
    borderRadius: 12,
    padding: '10px 12px',
    background: 'var(--terminal-surface-subtle)',
    color: 'var(--terminal-text-secondary)',
    fontSize: 11,
    lineHeight: 1.45,
    fontWeight: 750,
    overflowWrap: 'anywhere',
  },
  blockedBox: {
    border: '1px solid var(--terminal-short-border)',
    borderRadius: 12,
    padding: '11px 13px',
    background: 'var(--terminal-short-soft)',
    color: 'var(--terminal-short-strong)',
    fontSize: 12,
    lineHeight: 1.45,
    fontWeight: 600,
    textAlign: 'center',
  },
  actions: { display: 'flex', flexDirection: 'column', gap: 9 },
  primaryBtn: uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 18px', fontSize: 14 }),
  secondaryBtn: uiButton('secondary', { width: '100%', minHeight: 44, padding: '12px 18px', fontSize: 14 }),
  primaryBtnBusy: { opacity: .7, cursor: 'not-allowed' },
  errorBox: {
    color: 'var(--terminal-short-strong)',
    background: 'var(--terminal-short-soft)',
    border: '1px solid var(--terminal-short-border)',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 700,
    overflowWrap: 'anywhere',
  },
  footnote: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--terminal-text-muted)',
    textAlign: 'center',
    lineHeight: 1.4,
  },
};

function stepStyles(status) {
  const safeStatus = ['active', 'done', 'error'].includes(status) ? status : 'pending';
  return {
    bubble: { ...tradingSetupStyles.stepBubble, ...tradingSetupStyles[`stepBubble_${safeStatus}`] },
    label: { ...tradingSetupStyles.stepLabel, ...tradingSetupStyles[`stepLabel_${safeStatus}`] },
  };
}

export const TradingSetupGate = memo(function TradingSetupGate({
  kicker = 'ACTION REQUIRED',
  title,
  subtitle,
  logo,
  logoAlt = '',
  logoBackground = 'var(--terminal-surface)',
  steps = [],
  working = false,
  workingText = '',
  error = '',
  statusContent = null,
  primaryAction = null,
  secondaryAction = null,
  actions = null,
  children = null,
  footnote = null,
  tone = 'default',
  style = null,
}) {
  const actionItems = Array.isArray(actions)
    ? actions.filter(Boolean)
    : [primaryAction, secondaryAction].filter(Boolean);
  return (
    <div style={{ ...tradingSetupStyles.frame, ...style }}>
      <style>{SPINNER_CSS}</style>
      {logo && (
        <div style={{ ...tradingSetupStyles.logoBadge, background: logoBackground }}>
          <img src={logo} alt={logoAlt} style={tradingSetupStyles.logo} />
        </div>
      )}
      <div style={tradingSetupStyles.titleBlock}>
        <div style={{
          ...tradingSetupStyles.kicker,
          ...(tone === 'blocked' ? tradingSetupStyles.kickerBlocked : null),
        }}>
          {kicker}
        </div>
        <div style={tradingSetupStyles.title}>{title}</div>
        {subtitle && <div style={tradingSetupStyles.subtitle}>{subtitle}</div>}
      </div>

      {steps.length > 0 && (
        <ol style={tradingSetupStyles.stepList}>
          {steps.map((step, index) => {
            const visual = stepStyles(step.status);
            return (
              <li key={step.id || `${step.label}-${index}`} style={tradingSetupStyles.stepItem}>
                <span style={visual.bubble}>
                  {step.status === 'active' && working
                    ? <span style={tradingSetupStyles.spinner} />
                    : step.status === 'done'
                      ? '✓'
                      : step.status === 'error'
                        ? '!'
                        : (step.number || index + 1)}
                </span>
                <span style={tradingSetupStyles.stepText}>
                  <span style={visual.label}>{step.label}</span>
                  {step.hint && <span style={tradingSetupStyles.stepHint}>{step.hint}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {working && workingText && <div style={tradingSetupStyles.workingHint}>{workingText}</div>}
      {statusContent && <div style={tone === 'blocked' ? tradingSetupStyles.blockedBox : tradingSetupStyles.statusBox}>{statusContent}</div>}
      {children}
      {error && <div role="alert" style={tradingSetupStyles.errorBox}>{error}</div>}
      {actionItems.length > 0 && (
        <div style={tradingSetupStyles.actions}>
          {actionItems.map((action, index) => {
            const secondary = index > 0 || action.variant === 'secondary';
            return (
              <button
                key={action.key || action.label}
                type={action.type || 'button'}
                data-nodrag
                onClick={action.onClick}
                disabled={action.disabled}
                style={{
                  ...(secondary ? tradingSetupStyles.secondaryBtn : tradingSetupStyles.primaryBtn),
                  ...(action.disabled ? tradingSetupStyles.primaryBtnBusy : null),
                  ...action.style,
                }}
              >
                {action.icon}{action.icon ? ' ' : ''}{action.label}
              </button>
            );
          })}
        </div>
      )}
      {footnote && <div style={tradingSetupStyles.footnote}>{footnote}</div>}
    </div>
  );
});

function readableCountry(access) {
  const code = String(access?.country || access?.countryCode || '').trim().toUpperCase();
  return code && code !== 'UNKNOWN' ? code : '';
}

export const TradingRegionGate = memo(function TradingRegionGate({
  venueName,
  logo,
  access,
  onRetry,
  onBack,
}) {
  const checking = !access || access.status === 'idle' || access.status === 'checking';
  const blocked = access?.status === 'blocked';
  const unavailable = access?.status === 'unavailable';
  const country = readableCountry(access);
  const title = checking
    ? `Checking ${venueName} access`
    : blocked
      ? `Your IP region is blocked for ${venueName}`
      : `Could not verify ${venueName} access`;
  const subtitle = checking
    ? 'Clash is checking whether this exchange is available from your current IP region.'
    : blocked
      ? `This exchange cannot be opened through Clash from the detected region${country ? ` (${country})` : ''}.`
      : (access?.message || 'The regional check did not complete, so access stays locked for safety.');

  return (
    <TradingSetupGate
      kicker={checking ? 'VERIFYING REGION' : blocked ? 'ACCESS BLOCKED' : 'CHECK REQUIRED'}
      title={title}
      subtitle={subtitle}
      logo={logo}
      logoAlt={venueName}
      logoBackground="var(--terminal-text)"
      tone={blocked || unavailable ? 'blocked' : 'default'}
      working={checking}
      workingText={checking ? 'Checking your current IP region...' : ''}
      statusContent={!checking ? (
        blocked
          ? `Wallet sign-in, account data, deposits, withdrawals and orders for ${venueName} are disabled through Clash from this IP region. This does not affect other exchanges.`
          : `Clash could not safely confirm your region. ${venueName} remains locked until the check succeeds.`
      ) : null}
      primaryAction={unavailable && onRetry ? { label: 'RETRY REGION CHECK', onClick: onRetry } : null}
      secondaryAction={!checking && onBack ? { label: 'CHOOSE ANOTHER EXCHANGE', onClick: onBack, variant: 'secondary' } : null}
      footnote={blocked ? 'Restricted regions include the United States, Canada, U.S. territories and sanctioned jurisdictions.' : null}
    />
  );
});
