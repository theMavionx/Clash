import { useState } from 'react';
import { uiButton, uiIconButton } from '../styles/theme';

const DISCORD_URL = 'https://discord.gg/wSNuupRSw';
const TELEGRAM_URL = 'https://t.me/clashofperps';

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <style>{`
        .clash-feedback-button {
          position: fixed;
          left: 14px;
          top: calc(env(safe-area-inset-top, 0px) + 94px);
          z-index: 27;
          pointer-events: auto;
          height: 34px;
          padding: 0 12px;
          border: 1px solid var(--terminal-border-strong);
          border-radius: 10px;
          background: var(--terminal-surface);
          color: var(--terminal-text);
          box-shadow: none;
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0;
          cursor: pointer;
        }
        .clash-feedback-button:hover { filter: brightness(1.04); }
        @media (max-width: 720px) {
          .clash-feedback-button {
            left: 10px;
            top: calc(env(safe-area-inset-top, 0px) + 150px);
            height: 30px;
            padding: 0 9px;
            font-size: 11px;
          }
        }
      `}</style>
      <button
        type="button"
        className="clash-feedback-button"
        onClick={() => setOpen(true)}
        title="Feedback"
        aria-label="Feedback"
      >
        Feedback
      </button>

      {open && (
        <div style={S.backdrop} onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div style={S.modal} onClick={(event) => event.stopPropagation()}>
            <div style={S.header}>
              <div style={S.title}>Feedback</div>
              <button type="button" onClick={() => setOpen(false)} style={S.close} aria-label="Close">x</button>
            </div>
            <div style={S.body}>
              <div style={S.text}>Send bug reports and feedback in our community channels.</div>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer" style={{ ...S.linkButton, ...S.discord }}>
                Discord
              </a>
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{ ...S.linkButton, ...S.telegram }}>
                Telegram
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const S = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1200,
    pointerEvents: 'auto',
    background: 'rgba(0,0,0,0.52)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  modal: {
    width: 'min(360px, calc(100vw - 28px))',
    borderRadius: 20,
    border: '1px solid var(--terminal-border)',
    background: 'var(--terminal-surface)',
    color: 'var(--terminal-text)',
    overflow: 'hidden',
    boxShadow: '0 18px 38px rgba(0,0,0,0.45)',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  header: {
    height: 44,
    background: 'var(--terminal-surface-subtle)',
    borderBottom: '1px solid var(--terminal-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 10px 0 14px',
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0,
    color: 'var(--terminal-text)',
  },
  close: uiIconButton('secondary', 30, { fontSize: 15 }),
  body: {
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  text: {
    fontSize: 13,
    lineHeight: 1.35,
    fontWeight: 600,
    color: 'var(--terminal-text-muted)',
  },
  linkButton: {
    ...uiButton('secondary', { width: '100%', minHeight: 42, fontSize: 14 }),
    textDecoration: 'none',
    boxSizing: 'border-box',
  },
  discord: {
    borderColor: 'var(--terminal-border-strong)',
  },
  telegram: {
    borderColor: 'var(--terminal-border-strong)',
  },
};
