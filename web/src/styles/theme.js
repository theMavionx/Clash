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

// ClashBot button system (see docs/design/clashbot-ui-spec.md and
// styles/clashbot.css). Each tone carries its resting and hover colours:
//   primary   bg-[#F26522] text-white shadow-sm, hover bg-[#E05A1A]
//   neutral   bg-gray-900 text-white, hover bg-gray-800 ("Connect Wallet")
//   secondary border-gray-200 bg-white text-gray-700,
//             hover border-orange-200 text-[#D95618] ("Filters")
//   ghost     text-gray-500, hover bg-gray-100 text-gray-900 ("Cancel")
//   danger    bg-red-600 text-white, hover bg-red-700 ("Confirm stop")
//   soft      bg-gray-100 text-gray-500, hover bg-gray-200 text-gray-900 (close)
const UI_BUTTON_VARIANTS = {
  primary: {
    background: 'var(--cb-accent)', borderColor: 'var(--cb-accent)', color: '#ffffff', iconColor: '#ffffff',
    hoverBackground: 'var(--cb-accent-hover)', hoverBorder: 'var(--cb-accent-hover)', hoverColor: '#ffffff',
    shadow: 'var(--cb-shadow-sm)',
  },
  secondary: {
    background: 'var(--terminal-surface)', borderColor: 'var(--terminal-border)', color: 'var(--terminal-text-control)', iconColor: 'var(--terminal-icon)',
    hoverBackground: 'var(--terminal-surface)', hoverBorder: 'var(--cb-accent-border)', hoverColor: 'var(--cb-accent-hover-text)',
  },
  neutral: {
    background: 'var(--cb-neutral)', borderColor: 'var(--cb-neutral)', color: '#ffffff', iconColor: '#ffffff',
    hoverBackground: 'var(--cb-neutral-hover)', hoverBorder: 'var(--cb-neutral-hover)', hoverColor: '#ffffff',
  },
  success: {
    background: 'var(--terminal-long-soft)', borderColor: 'var(--terminal-long-border)', color: 'var(--terminal-long)', iconColor: 'var(--terminal-long)',
    hoverBackground: 'var(--terminal-long-soft)', hoverBorder: 'var(--terminal-long)', hoverColor: 'var(--terminal-long)',
  },
  danger: {
    background: 'var(--cb-danger)', borderColor: 'var(--cb-danger)', color: '#ffffff', iconColor: '#ffffff',
    hoverBackground: 'var(--cb-danger-hover)', hoverBorder: 'var(--cb-danger-hover)', hoverColor: '#ffffff',
  },
  warning: {
    background: 'var(--terminal-warning-soft)', borderColor: 'var(--terminal-warning-border)', color: 'var(--terminal-warning)', iconColor: 'var(--terminal-warning)',
    hoverBackground: 'var(--terminal-warning-soft)', hoverBorder: 'var(--terminal-warning)', hoverColor: 'var(--terminal-warning)',
  },
  info: {
    background: 'var(--terminal-info-soft)', borderColor: 'var(--terminal-info-border)', color: 'var(--terminal-info)', iconColor: 'var(--terminal-info)',
    hoverBackground: 'var(--terminal-info-soft)', hoverBorder: 'var(--terminal-info)', hoverColor: 'var(--terminal-info)',
  },
  ghost: {
    background: 'transparent', borderColor: 'transparent', color: 'var(--terminal-text-muted)', iconColor: 'var(--terminal-icon)',
    hoverBackground: 'var(--cb-ghost-hover)', hoverBorder: 'transparent', hoverColor: 'var(--terminal-text)',
  },
  soft: {
    background: 'var(--cb-soft)', borderColor: 'transparent', color: 'var(--terminal-text-muted)', iconColor: 'var(--terminal-text-muted)',
    hoverBackground: 'var(--cb-soft-hover)', hoverBorder: 'transparent', hoverColor: 'var(--terminal-text)',
  },
};

// Icon-only controls: secondary is the ThemeToggle treatment (hairline,
// surface, shadow-sm, hover orange icon); destructive icons use the tinted
// ClashBot treatment (bg-red-50 text-red-600) rather than a solid red disc.
const UI_ICON_VARIANTS = {
  ...UI_BUTTON_VARIANTS,
  secondary: {
    ...UI_BUTTON_VARIANTS.secondary,
    color: 'var(--terminal-text-secondary)',
    hoverColor: 'var(--cb-accent)',
    shadow: 'var(--cb-shadow-sm)',
  },
  danger: {
    background: 'var(--terminal-short-soft)', borderColor: 'transparent', color: 'var(--terminal-short)', iconColor: 'var(--terminal-short)',
    hoverBackground: 'var(--terminal-short-soft)', hoverBorder: 'var(--terminal-short-border)', hoverColor: 'var(--terminal-short)',
  },
};

// Button sizes: sm = compact chips / confirm actions, md = default h-10,
// lg = page CTA ("Create New Bot", 14px medium).
const UI_BUTTON_SIZES = {
  sm: { minHeight: 32, padding: '0 16px', fontSize: 11, fontWeight: 600 },
  md: { minHeight: 40, padding: '0 20px', fontSize: 12, fontWeight: 600 },
  lg: { minHeight: 44, padding: '0 24px', fontSize: 14, fontWeight: 500 },
};

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

// Hover colours are published as custom properties. clashbot.css swaps them
// in only while the inline background/border/colour still reference the tone
// variables, so callers that override `background` (for an active state, a
// semantic colour, …) keep that look on hover.
const buildButton = (tone, { size = 'md', ...overrides } = {}) => ({
  ...(UI_BUTTON_SIZES[size] || UI_BUTTON_SIZES.md),
  '--cb-btn-bg': tone.background,
  '--cb-btn-border': tone.borderColor,
  '--cb-btn-fg': tone.color,
  '--cb-btn-bg-hover': tone.hoverBackground,
  '--cb-btn-border-hover': tone.hoverBorder,
  '--cb-btn-fg-hover': tone.hoverColor,
  '--terminal-button-icon': tone.iconColor,
  borderRadius: 999,
  border: '1px solid var(--cb-btn-border)',
  background: 'var(--cb-btn-bg)',
  color: 'var(--cb-btn-fg)',
  lineHeight: 1.15,
  cursor: 'pointer',
  textShadow: 'none',
  textTransform: 'none',
  boxShadow: tone.shadow || 'none',
  letterSpacing: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  gap: 8,
  userSelect: 'none',
  transition: `background-color 150ms ${EASE}, border-color 150ms ${EASE}, color 150ms ${EASE}`,
  ...overrides,
});

export const uiButton = (variant = 'primary', overrides = {}) => (
  buildButton(UI_BUTTON_VARIANTS[variant] || UI_BUTTON_VARIANTS.primary, overrides)
);

export const uiIconButton = (variant = 'secondary', size = 36, overrides = {}) => buildButton(
  UI_ICON_VARIANTS[variant] || UI_ICON_VARIANTS.secondary,
  {
    width: size,
    height: size,
    minHeight: size,
    padding: 0,
    flexShrink: 0,
    ...overrides,
  },
);

// ClashBot close control: 36px gray-100 circle with a gray-500 icon.
export const uiCloseButton = (size = 36, overrides = {}) => uiIconButton('soft', size, overrides);

// Shared shape/elevation tokens for inline styles (mirror clashbot.css).
export const radius = {
  xs: 4, sm: 8, md: 12, lg: 16, card: 20, section: 22, xl: 24, modal: 26, sheet: 28, dialog: 30, pill: 999,
};

export const shadow = {
  xs: 'var(--cb-shadow-xs)',
  sm: 'var(--cb-shadow-sm)',
  md: 'var(--cb-shadow-md)',
  lg: 'var(--cb-shadow-lg)',
  xl: 'var(--cb-shadow-xl)',
  xxl: 'var(--cb-shadow-2xl)',
  menu: 'var(--cb-shadow-menu)',
  popover: 'var(--cb-shadow-popover)',
  dialog: 'var(--cb-shadow-dialog)',
  sheet: 'var(--cb-shadow-sheet)',
  focus: 'var(--cb-ring-focus)',
  selected: 'var(--cb-ring-selected)',
};

// Overlay + dialog surfaces.
export const uiScrim = (overrides = {}) => ({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'var(--cb-scrim)',
  backdropFilter: 'blur(var(--cb-scrim-blur))',
  WebkitBackdropFilter: 'blur(var(--cb-scrim-blur))',
  ...overrides,
});

export const uiModal = (overrides = {}) => ({
  boxSizing: 'border-box',
  width: '100%',
  maxHeight: 'calc(100dvh - 16px)',
  border: '1px solid var(--terminal-border)',
  borderRadius: radius.sheet,
  background: 'var(--terminal-surface)',
  color: 'var(--terminal-text)',
  boxShadow: shadow.dialog,
  ...overrides,
});

export const uiModalTitle = {
  margin: 0,
  color: 'var(--terminal-text)',
  fontSize: 18,
  fontWeight: 600,
  letterSpacing: '-0.025em',
  lineHeight: 1.25,
};

// Form controls.
export const uiInput = (overrides = {}) => ({
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 44,
  padding: '0 12px',
  border: '1px solid var(--terminal-border)',
  borderRadius: radius.md,
  background: 'var(--terminal-input)',
  color: 'var(--terminal-text)',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  outline: 'none',
  ...overrides,
});

export const uiLabel = {
  display: 'block',
  color: 'var(--terminal-text-muted)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
};

export const uiCaption = {
  color: 'var(--terminal-text-faint)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

// Surfaces.
export const uiCard = (overrides = {}) => ({
  border: '1px solid var(--terminal-border)',
  borderRadius: radius.card,
  background: 'var(--terminal-surface)',
  color: 'var(--terminal-text)',
  boxShadow: shadow.sm,
  ...overrides,
});

export const uiTile = (overrides = {}) => ({
  padding: '12px 16px',
  border: '1px solid var(--terminal-border)',
  borderRadius: radius.lg,
  background: 'var(--terminal-surface-muted)',
  ...overrides,
});

// Segmented control: gray-100 track, selected segment solid gray-900 pill.
export const uiSegmented = (overrides = {}) => ({
  display: 'inline-flex',
  padding: 4,
  gap: 0,
  borderRadius: radius.pill,
  background: 'var(--cb-soft)',
  ...overrides,
});

export const uiSegment = (active, overrides = {}) => ({
  minHeight: 32,
  padding: '0 16px',
  border: 0,
  borderRadius: radius.pill,
  background: active ? 'var(--cb-neutral)' : 'transparent',
  color: active ? '#ffffff' : 'var(--terminal-text-muted)',
  boxShadow: active ? shadow.sm : 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  ...overrides,
});

// Badge/pill: 9px semibold uppercase, tinted by tone.
const BADGE_TONES = {
  neutral: { background: 'var(--cb-soft)', color: 'var(--terminal-text-muted)' },
  long: { background: 'var(--terminal-long-soft)', color: 'var(--terminal-long)' },
  success: { background: 'var(--terminal-long-soft)', color: 'var(--terminal-long)' },
  short: { background: 'var(--terminal-short-soft)', color: 'var(--terminal-short)' },
  danger: { background: 'var(--terminal-short-soft)', color: 'var(--terminal-short)' },
  warning: { background: 'var(--terminal-warning-soft)', color: 'var(--terminal-warning)' },
  info: { background: 'var(--terminal-info-soft)', color: 'var(--terminal-info)' },
  accent: { background: 'var(--cb-accent-tint)', color: 'var(--terminal-brand-text)' },
};

export const uiBadge = (tone = 'neutral', overrides = {}) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  borderRadius: radius.pill,
  ...(BADGE_TONES[tone] || BADGE_TONES.neutral),
  fontSize: 9,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  ...overrides,
});

// Switch track/knob (h-6 w-11 track, 16px knob, translate 4px -> 24px).
export const uiSwitchTrack = (checked, overrides = {}) => ({
  position: 'relative',
  display: 'inline-block',
  flexShrink: 0,
  width: 44,
  height: 24,
  minHeight: 24,
  padding: 0,
  border: 0,
  borderRadius: radius.pill,
  background: checked ? 'var(--cb-accent)' : 'var(--cb-switch-off)',
  boxShadow: 'none',
  transition: `background-color 150ms ${EASE}`,
  cursor: 'pointer',
  ...overrides,
});

export const uiSwitchKnob = (checked, overrides = {}) => ({
  position: 'absolute',
  top: 4,
  left: 0,
  width: 16,
  height: 16,
  borderRadius: radius.pill,
  background: 'var(--cb-switch-knob)',
  boxShadow: shadow.sm,
  transform: `translateX(${checked ? 24 : 4}px)`,
  transition: `transform 150ms ${EASE}`,
  ...overrides,
});

// Native range fill: style={{ ...rangeProgress(value, min, max) }}.
export const rangeProgress = (value, min = 0, max = 100) => {
  const lo = Number(min);
  const hi = Number(max);
  const v = Number(value);
  const pct = hi > lo && Number.isFinite(v) ? Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) : 0;
  return { '--range-progress': `${pct}%` };
};

// Shared dimensional action button. The historical name is retained so older
// panels can migrate without changing their event wiring.
export const cartoonBtn = (bg, border) => uiButton('primary', {
  padding: '10px 18px',
  background: bg,
  border: `1px solid ${border}`,
  fontSize: 14,
});

export const cartoonPanel = {
  background: 'var(--terminal-surface)',
  border: '1px solid var(--terminal-border)',
  borderRadius: 20,
  padding: 16,
  color: 'var(--terminal-text)',
  boxShadow: 'var(--cb-shadow-sm)',
};
