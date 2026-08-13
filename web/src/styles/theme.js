export const colors = {
  gold: '#FFD700',
  goldDark: '#C59600',
  wood: 'var(--terminal-long)',
  woodDark: 'var(--terminal-long-strong)',
  ore: '#9C27B0',
  oreDark: '#6A1B9A',
  red: 'var(--terminal-short)',
  green: 'var(--terminal-long)',
  blue: 'var(--terminal-info)',
  brown: 'var(--terminal-text)',
  cream: 'var(--terminal-surface)',
  text: 'var(--terminal-on-accent)',
  shadow: 'var(--terminal-shadow)',
};

const UI_BUTTON_VARIANTS = {
  primary: {
    background: 'var(--terminal-orange)',
    borderColor: 'var(--terminal-brand-strong)',
    color: 'var(--terminal-on-accent)',
    iconColor: 'var(--terminal-on-accent)',
  },
  secondary: {
    background: 'var(--terminal-surface)',
    borderColor: 'var(--terminal-border-strong)',
    color: 'var(--terminal-text)',
    iconColor: 'var(--terminal-icon)',
  },
  neutral: {
    background: 'var(--terminal-surface-muted)',
    borderColor: 'var(--terminal-border-strong)',
    color: 'var(--terminal-text-control)',
    iconColor: 'var(--terminal-icon)',
  },
  success: {
    background: 'var(--terminal-long)',
    borderColor: 'var(--terminal-long-strong)',
    color: 'var(--terminal-on-accent)',
    iconColor: 'var(--terminal-on-accent)',
  },
  danger: {
    background: 'var(--terminal-short)',
    borderColor: 'var(--terminal-short-strong)',
    color: 'var(--terminal-on-accent)',
    iconColor: 'var(--terminal-on-accent)',
  },
  warning: {
    background: 'var(--terminal-warning)',
    borderColor: 'var(--terminal-warning-border)',
    color: 'var(--terminal-on-warning)',
    iconColor: 'var(--terminal-on-warning)',
  },
  info: {
    background: 'var(--terminal-info)',
    borderColor: 'var(--terminal-info-border)',
    color: 'var(--terminal-on-accent)',
    iconColor: 'var(--terminal-on-accent)',
  },
  ghost: {
    background: 'transparent',
    borderColor: 'transparent',
    color: 'var(--terminal-text-secondary)',
    iconColor: 'var(--terminal-icon)',
  },
};

export const uiButton = (variant = 'primary', overrides = {}) => {
  const tone = UI_BUTTON_VARIANTS[variant] || UI_BUTTON_VARIANTS.primary;
  const depth = variant === 'ghost' ? 'none' : 'var(--terminal-shadow-control)';
  return {
    minHeight: 40,
    padding: '9px 14px',
    borderRadius: 10,
    border: `1px solid ${tone.borderColor}`,
    background: tone.background,
    color: tone.color,
    '--terminal-button-icon': tone.iconColor,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.15,
    cursor: 'pointer',
    textShadow: 'none',
    boxShadow: depth,
    letterSpacing: 0.1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    gap: 8,
    userSelect: 'none',
    transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
    ...overrides,
  };
};

export const uiIconButton = (variant = 'secondary', size = 36, overrides = {}) => uiButton(variant, {
  width: size,
  height: size,
  minHeight: size,
  padding: 0,
  flexShrink: 0,
  ...overrides,
});

// Shared dimensional action button. The historical name is retained so older
// panels can migrate without changing their event wiring.
export const cartoonBtn = (bg, border) => uiButton('primary', {
  padding: '10px 18px',
  background: bg,
  border: `1px solid ${border}`,
  fontSize: 14,
  letterSpacing: 0.2,
});

export const cartoonPanel = {
  background: 'var(--terminal-surface)',
  border: '1px solid var(--terminal-border)',
  borderRadius: 16,
  padding: 16,
  color: 'var(--terminal-text)',
  boxShadow: 'var(--terminal-shadow-card)',
};
