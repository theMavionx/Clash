// Shared styles for the Basic-mode trade wizard. Parchment / cartoon
// aesthetic that matches RegisterPanel and FuturesModeSelect.

export const colors = {
  parchment: '#fdf8e7',
  parchmentDark: '#f3ebd1',
  ink: '#5C3A21',
  inkSoft: '#77573d',
  inkFaint: '#a3906a',
  border: '#d4c8b0',
  borderStrong: '#a3906a',
  long: '#43a047',
  longDark: '#2e7d32',
  short: '#e53935',
  shortDark: '#c62828',
  safe: '#6ab344',
  balanced: '#e8b830',
  aggressive: '#ef5350',
  blue: '#0EA5E9',
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
  },
  stepHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginBottom: 4,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    background: 'transparent',
    border: `2px solid ${colors.border}`,
    color: colors.ink,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: 20,
    flexShrink: 0,
  },
  stepDots: {
    flex: 1, display: 'flex', gap: 6, justifyContent: 'center',
  },
  dot: {
    width: 8, height: 8, borderRadius: '50%',
    background: 'rgba(92,58,33,0.18)',
    transition: 'all 0.25s ease',
  },
  dotActive: {
    width: 24,
    background: colors.ink,
  },
  dotDone: {
    background: colors.safe,
  },
  spacer36: { width: 36, flexShrink: 0 },  // mirrors back button width to keep dots centered
  title: {
    fontSize: 24, fontWeight: 900, color: colors.ink,
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
