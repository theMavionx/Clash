// Shared ClashBot Light styles for the Basic-mode trade wizard.
import { uiIconButton } from '../../styles/theme';

export const colors = {
  parchment: 'var(--terminal-surface)',
  parchmentDark: 'var(--terminal-surface-subtle)',
  ink: 'var(--terminal-text)',
  inkSoft: 'var(--terminal-text-secondary)',
  inkFaint: 'var(--terminal-text-muted)',
  border: 'var(--terminal-border)',
  borderStrong: 'var(--terminal-border-strong)',
  long: 'var(--terminal-long)',
  longDark: 'var(--terminal-long-strong)',
  short: 'var(--terminal-short)',
  shortDark: 'var(--terminal-short-strong)',
  safe: 'var(--terminal-long)',
  balanced: 'var(--terminal-orange)',
  aggressive: 'var(--terminal-short)',
  blue: 'var(--terminal-orange)',
};

export const shared = {
  page: {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '6px 14px 12px',
    gap: 8,
    // overflow: auto — TokenPicker has 100+ tokens that must scroll. The
    // 4 wizard steps (Direction/Amount/Leverage/Confirm) override this
    // to display:grid with explicit row template, so their content auto-
    // fits the available height and never triggers the scrollbar.
    overflow: 'auto',
    fontFamily: '"Inter","Segoe UI",sans-serif',
    boxSizing: 'border-box',
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    maxWidth: '100%',
    overflowX: 'hidden',
  },
  stepHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginBottom: 4,
  },
  backBtn: uiIconButton('secondary', 36, { fontSize: 20 }),
  stepDots: {
    flex: 1, display: 'flex', gap: 6, justifyContent: 'center',
  },
  dot: {
    width: 8, height: 8, borderRadius: '50%',
    background: 'var(--terminal-border-strong)',
    transition: 'all 0.25s ease',
  },
  dotActive: {
    width: 24,
    background: 'var(--terminal-orange)',
  },
  dotDone: {
    background: colors.safe,
  },
  spacer36: { width: 36, flexShrink: 0 },  // mirrors back button width to keep dots centered
  title: {
    fontSize: 24, fontWeight: 750, color: colors.ink,
    letterSpacing: '0.3px', textAlign: 'center',
    margin: '6px 0 2px',
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 13, fontWeight: 600, color: colors.inkFaint,
    textAlign: 'center', marginBottom: 6,
    lineHeight: 1.4,
  },
};
