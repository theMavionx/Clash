import { useState } from 'react';

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
          border: 2px solid #5C3A21;
          border-radius: 8px;
          background: #fff6dc;
          color: #3a2818;
          box-shadow: 0 5px 12px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.55);
          font-family: inherit;
          font-size: 12px;
          font-weight: 900;
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
    borderRadius: 8,
    border: '3px solid #5C3A21',
    background: '#fff4d4',
    color: '#2f2117',
    overflow: 'hidden',
    boxShadow: '0 18px 38px rgba(0,0,0,0.45)',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  header: {
    height: 44,
    background: 'linear-gradient(180deg, #f7c85a, #d89c2d)',
    borderBottom: '2px solid #5C3A21',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 10px 0 14px',
  },
  title: {
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 0,
    color: '#321f12',
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: '2px solid #5C3A21',
    background: '#fff4d4',
    color: '#321f12',
    fontSize: 15,
    fontWeight: 900,
    lineHeight: '20px',
    cursor: 'pointer',
  },
  body: {
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  text: {
    fontSize: 13,
    lineHeight: 1.35,
    fontWeight: 800,
    color: '#6d5338',
  },
  linkButton: {
    width: '100%',
    height: 42,
    borderRadius: 8,
    border: '3px solid #5C3A21',
    color: '#fff',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 0,
    cursor: 'pointer',
    boxShadow: '0 4px 0 #5C3A21, 0 7px 12px rgba(0,0,0,0.22)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    boxSizing: 'border-box',
  },
  discord: {
    background: 'linear-gradient(180deg, #7289da, #4752c4)',
  },
  telegram: {
    background: 'linear-gradient(180deg, #35aee2, #168ac2)',
  },
};
