// Inline banner shown on the Confirm step when the user has NOT yet bound
// an agent wallet. One tap → one wallet popup → all subsequent trades are
// silent until they revoke or 7 days pass. Skippable: user can ignore and
// trade with normal multi-popup flow.
//
// Designed as a banner (not a blocking modal) so users who don't trust
// the feature can keep going without friction.

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { colors } from './styles';
import { uiButton } from '../../styles/theme';

function AgentApprovalBanner({ bindAgent, busy, error }) {
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (dismissed) return null;

  const enable = async () => {
    if (submitting || busy) return;
    setSubmitting(true);
    try {
      await bindAgent();
      // Success — banner unmounts because parent re-renders with
      // pacAgent set, hiding this component entirely.
    } catch {
      // Error surfaces in `error` prop; user can retry or dismiss.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      style={S.banner}
    >
      <div style={S.icon}>⚡</div>
      <div style={S.body}>
        <div style={S.title}>1-tap trading</div>
        <div style={S.text}>
          Sign once → no wallet popups for the next 7 days. Trade-only
          permission, can&apos;t move funds. Revoke any time in your profile.
        </div>
        {error && <div style={S.error}>⚠ {error}</div>}
      </div>
      <div style={S.actions}>
        <button
          onClick={enable}
          disabled={submitting || busy}
          style={S.enableBtn}
        >
          {submitting || busy ? 'Signing…' : 'Enable'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          disabled={submitting || busy}
          style={S.dismissBtn}
          title="Continue without 1-tap trading"
        >
          Not now
        </button>
      </div>
    </motion.div>
  );
}

export default memo(AgentApprovalBanner);

const S = {
  banner: {
    display: 'grid', gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center', gap: 10,
    padding: '10px 12px',
    borderRadius: 12,
    background: 'var(--terminal-brand-soft)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--terminal-brand-border)',
    boxSizing: 'border-box',
    fontFamily: '"Inter","Segoe UI",sans-serif',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
  },
  icon: {
    fontSize: 22, lineHeight: 1,
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--terminal-surface)', borderRadius: 10,
    border: '1px solid var(--terminal-brand-border)',
  },
  body: { minWidth: 0, overflow: 'hidden' },
  title: {
    fontSize: 13, fontWeight: 700, color: colors.ink,
    letterSpacing: '0.3px',
  },
  text: {
    fontSize: 11, fontWeight: 600, color: colors.inkSoft,
    lineHeight: 1.4, marginTop: 2,
    overflowWrap: 'anywhere',
  },
  error: {
    fontSize: 11, fontWeight: 700, color: colors.shortDark,
    marginTop: 4,
  },
  actions: {
    display: 'flex', flexDirection: 'column', gap: 4,
    flexShrink: 0,
  },
  enableBtn: uiButton('primary', { minHeight: 34, padding: '6px 12px', fontSize: 11 }),
  dismissBtn: uiButton('ghost', { minHeight: 30, padding: '4px 10px', fontSize: 10, color: colors.inkFaint }),
};
