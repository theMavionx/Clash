/* Shared component and style-token exports intentionally live together. */
/* eslint-disable react-refresh/only-export-components */
import { memo } from 'react';

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
    border: '3px solid #bfa77b',
    boxShadow: '0 4px 0 #9f8759, 0 7px 14px rgba(54, 38, 20, .2)',
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
    fontWeight: 900,
    color: '#1B5E20',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  kickerBlocked: { color: '#b71c1c' },
  title: {
    fontSize: 'clamp(18px, 2.6vh, 22px)',
    fontWeight: 900,
    color: '#5C3A21',
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#8a7252',
    lineHeight: 1.45,
    maxWidth: 390,
  },
  stepList: {
    listStyle: 'none',
    margin: 0,
    padding: '12px 14px',
    background: '#fffbef',
    border: '1px solid #d4c8b0',
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
    fontWeight: 900,
    flexShrink: 0,
    marginTop: 1,
    background: '#e8dfc8',
    color: '#9f8759',
    border: '2px solid #d4c8b0',
    transition: 'background .2s, border-color .2s, color .2s',
    boxSizing: 'border-box',
  },
  stepBubble_pending: {},
  stepBubble_active: {
    background: '#fff6dc',
    border: '2px solid #c2851b',
    color: '#5C3A21',
    boxShadow: '0 0 0 3px rgba(255,217,122,.4)',
  },
  stepBubble_done: {
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    border: '2px solid #1f6d34',
    color: '#fff',
  },
  stepBubble_error: {
    background: '#E53935',
    border: '2px solid #7f0000',
    color: '#fff',
  },
  stepText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    lineHeight: 1.25,
    flex: 1,
  },
  stepLabel: { fontSize: 13, fontWeight: 800, color: '#7a5a30' },
  stepLabel_active: { color: '#5C3A21' },
  stepLabel_done: { color: '#5C3A21' },
  stepLabel_error: { color: '#b71c1c' },
  stepLabel_pending: {},
  stepHint: {
    fontSize: 11,
    color: '#9f8759',
    fontWeight: 700,
    marginTop: 1,
    overflowWrap: 'anywhere',
  },
  spinner: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'rgba(92,58,33,.25)',
    borderTopColor: '#5C3A21',
    animation: 'trading-setup-spin .9s linear infinite',
    boxSizing: 'border-box',
  },
  bigSpinner: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    borderWidth: 4,
    borderStyle: 'solid',
    borderColor: 'rgba(92,58,33,.18)',
    borderTopColor: '#5C3A21',
    animation: 'trading-setup-spin .9s linear infinite',
    alignSelf: 'center',
    boxSizing: 'border-box',
  },
  workingHint: {
    fontSize: 13,
    fontWeight: 800,
    color: '#5C3A21',
    background: 'linear-gradient(180deg, #fff2c2 0%, #ffd76a 100%)',
    border: '2px solid #c2851b',
    padding: '10px 14px',
    borderRadius: 12,
    textAlign: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45)',
    animation: 'trading-setup-pulse 2.4s ease-in-out infinite',
  },
  statusBox: {
    border: '1px solid #d4c8b0',
    borderRadius: 12,
    padding: '10px 12px',
    background: '#fff8e8',
    color: '#6B4E2E',
    fontSize: 11,
    lineHeight: 1.45,
    fontWeight: 750,
    overflowWrap: 'anywhere',
  },
  blockedBox: {
    border: '2px solid #ef9a9a',
    borderRadius: 12,
    padding: '11px 13px',
    background: '#fdecea',
    color: '#8f1d1d',
    fontSize: 12,
    lineHeight: 1.45,
    fontWeight: 800,
    textAlign: 'center',
  },
  actions: { display: 'flex', flexDirection: 'column', gap: 9 },
  primaryBtn: {
    padding: '12px 18px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 900,
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    border: '2px solid #1f6d34',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: .3,
    textShadow: '0 1px 1px rgba(0,0,0,.35)',
    boxShadow: '0 4px 10px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.4)',
  },
  secondaryBtn: {
    padding: '12px 18px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 900,
    background: '#fffaf0',
    border: '2px solid #bfa77b',
    color: '#5C3A21',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: .3,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.65)',
  },
  primaryBtnBusy: { opacity: .7, cursor: 'not-allowed' },
  errorBox: {
    color: '#7a1f1c',
    background: '#fdecea',
    border: '1px solid #E53935',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 700,
    overflowWrap: 'anywhere',
  },
  footnote: {
    fontSize: 11,
    fontWeight: 700,
    color: '#9f8759',
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
  logoBackground = '#fffaf0',
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
      logoBackground="#111"
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
