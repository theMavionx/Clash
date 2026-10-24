import { useEffect, useId, useRef, useState } from 'react';
import { venueLogo, venueName } from './constants';

/* ---------- icons (inline, stroke = currentColor) ---------- */
const ICON_PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm10 17-5.2-5.2',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  close: 'M6 6l12 12M18 6 6 18',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  sort: 'M8 9l4-4 4 4M8 15l4 4 4-4',
  chart: 'M4 19h16M7 16V10M12 16V6M17 16v-4',
  copy: 'M7 17 17 7M9 7h8v8',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  check: 'M5 12l5 5 9-10',
  bot: 'M12 3v3M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Zm2 5h0M15 13h0M9 17h6',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
  alert: 'M12 4 2.5 20h19L12 4Zm0 6v4m0 3h0',
  info: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 7v5m0-8h0',
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5l11 7-11 7V5Z',
  stop: 'M7 7h10v10H7z',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  shield: 'M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
};

export function Icon({ name, size = 16, strokeWidth = 2, style, filled = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, ...style }}
    >
      <path d={ICON_PATHS[name] || ''} />
    </svg>
  );
}

/* ---------- buttons ---------- */
export function Btn({ variant = 'secondary', size = 'md', icon, iconRight, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`ct-btn ct-btn--${variant} ct-btn--${size} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

export function IconButton({ icon, label, variant = 'ghost', size = 36, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`ct-icon-btn ct-btn--${variant}`}
      style={{ width: size, height: size }}
      {...props}
    >
      <Icon name={icon} size={Math.round(size * 0.46)} />
    </button>
  );
}

/* ---------- segmented control ---------- */
export function Segmented({ value, options, onChange, label, size = 'md' }) {
  return (
    <div className={`ct-segmented ct-segmented--${size}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`ct-segment ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} size={14} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- form controls ---------- */
export function Field({ label, hint, error, children, htmlFor, wide = false }) {
  return (
    <div className={`ct-field ${wide ? 'ct-field--wide' : ''}`}>
      {label && <label className="ct-field-label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="ct-field-error" role="alert">{error}</span> : hint ? <span className="ct-field-hint">{hint}</span> : null}
    </div>
  );
}

export function Select({ label, value, options, onChange, hint, error, wide, disabled }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} wide={wide}>
      <span className="ct-select-wrap">
        <select id={id} className="ct-input ct-select" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
          ))}
        </select>
        <Icon name="chevronDown" size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--terminal-text-muted)' }} />
      </span>
    </Field>
  );
}

export function NumberField({ label, value, onChange, prefix, suffix, hint, error, step = 'any', min, max, wide, placeholder }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} wide={wide}>
      <span className={`ct-input ct-affix ${error ? 'is-invalid' : ''}`}>
        {prefix && <span className="ct-affix-text">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value}
          placeholder={placeholder}
          aria-invalid={Boolean(error) || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && <span className="ct-affix-text">{suffix}</span>}
      </span>
    </Field>
  );
}

export function TextField({ label, value, onChange, hint, error, placeholder, wide, mono = false, autoComplete = 'off' }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} wide={wide}>
      <input
        id={id}
        className={`ct-input ${mono ? 'ct-mono' : ''} ${error ? 'is-invalid' : ''}`}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error) || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description, disabled = false, badge }) {
  const id = useId();
  return (
    <div className={`ct-toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <div style={{ minWidth: 0 }}>
        <label htmlFor={id} className="ct-toggle-label">
          {label}
          {badge && <span className="ct-chip ct-chip--muted" style={{ marginLeft: 8 }}>{badge}</span>}
        </label>
        {description && <p className="ct-toggle-desc">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`ct-switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="ct-switch-knob" />
      </button>
    </div>
  );
}

/* ---------- venue logo ---------- */
export function VenueLogo({ venue, size = 20 }) {
  const src = venueLogo(venue);
  const [failed, setFailed] = useState('');
  const showImage = src && failed !== src;
  return (
    <span className="ct-venue-logo" style={{ width: size, height: size }} role="img" aria-label={`${venueName(venue)} logo`}>
      {showImage ? (
        <img src={src} alt="" width={size} height={size} draggable={false} onError={() => setFailed(src)} />
      ) : (
        <span style={{ fontSize: Math.max(8, size * 0.36) }}>{venueName(venue).slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

/* ---------- states ---------- */
export function StateBlock({ tone = 'neutral', icon = 'info', title, children, action }) {
  return (
    <div className="ct-state" role={tone === 'error' ? 'alert' : undefined}>
      <span className={`ct-state-icon ct-tone--${tone}`}><Icon name={icon} size={16} /></span>
      <strong className="ct-state-title">{title}</strong>
      {children && <p className="ct-state-text">{children}</p>}
      {action}
    </div>
  );
}

export function Notice({ tone = 'info', children, icon }) {
  return (
    <div className={`ct-notice ct-notice--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name={icon || (tone === 'error' || tone === 'warning' ? 'alert' : 'info')} size={14} style={{ marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return <span className="ct-spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

/* ---------- modal ---------- */
export function Modal({ title, subtitle, onClose, children, footer, size = 'md', labelledBy, headerExtra, closeLabel = 'Close' }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      if (previous && typeof previous.focus === 'function' && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <div className="ct-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || titleId}
        tabIndex={-1}
        className={`ct-modal ct-modal--${size}`}
      >
        <header className="ct-modal-header">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id={titleId} className="ct-modal-title">{title}</h2>
            {subtitle && <p className="ct-modal-subtitle">{subtitle}</p>}
          </div>
          {headerExtra}
          <IconButton icon="close" label={closeLabel} onClick={onClose} />
        </header>
        <div className="ct-modal-body">{children}</div>
        {footer && <footer className="ct-modal-footer">{footer}</footer>}
      </section>
    </div>
  );
}
