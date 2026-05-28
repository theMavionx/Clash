import { useCallback, useMemo, useState } from 'react';
import { usePlayer } from '../hooks/useGodot';

const CONTACT_OPTIONS = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'discord', label: 'Discord' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'email', label: 'Email' },
];

function tokenFromPlayer(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
}

function viewportString() {
  if (typeof window === 'undefined') return '';
  return `${window.innerWidth || 0}x${window.innerHeight || 0}`;
}

export default function FeedbackButton() {
  const player = usePlayer();
  const token = tokenFromPlayer(player);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('problem');
  const [message, setMessage] = useState('');
  const [contactType, setContactType] = useState('telegram');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const canSubmit = useMemo(() => (
    !!token && !busy && message.trim().length >= 6 && contact.trim().length >= 2
  ), [busy, contact, message, token]);

  const resetForm = useCallback(() => {
    setKind('problem');
    setMessage('');
    setContactType('telegram');
    setContact('');
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setNotice(null);
  }, [busy]);

  const submit = useCallback(async (event) => {
    event.preventDefault();
    if (!token) {
      setNotice({ type: 'error', text: 'Session is not ready yet.' });
      return;
    }
    const trimmedMessage = message.trim();
    const trimmedContact = contact.trim();
    if (trimmedMessage.length < 6 || trimmedContact.length < 2) {
      setNotice({ type: 'error', text: 'Add a short message and contact.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-token': token,
        },
        body: JSON.stringify({
          kind,
          message: trimmedMessage,
          contact_type: contactType,
          contact_value: trimmedContact,
          page_url: typeof window !== 'undefined' ? window.location.href : '',
          viewport: viewportString(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Failed to send feedback');
      resetForm();
      setNotice({ type: 'ok', text: 'Sent. We will check it in admin.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Failed to send feedback' });
    } finally {
      setBusy(false);
    }
  }, [contact, contactType, kind, message, resetForm, token]);

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
        title="Send feedback"
        aria-label="Send feedback"
      >
        Feedback
      </button>

      {open && (
        <div style={S.backdrop} onClick={close} role="dialog" aria-modal="true">
          <form style={S.modal} onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <div style={S.header}>
              <div style={S.title}>Feedback</div>
              <button type="button" onClick={close} style={S.close} aria-label="Close">x</button>
            </div>
            <div style={S.body}>
              <div style={S.segmented} aria-label="Feedback type">
                <button
                  type="button"
                  onClick={() => setKind('problem')}
                  style={{ ...S.segment, ...(kind === 'problem' ? S.segmentActive : null) }}
                >
                  Problem
                </button>
                <button
                  type="button"
                  onClick={() => setKind('feedback')}
                  style={{ ...S.segment, ...(kind === 'feedback' ? S.segmentActive : null) }}
                >
                  Feedback
                </button>
              </div>

              <label style={S.field}>
                <span style={S.label}>Message</span>
                <textarea
                  value={message}
                  maxLength={2000}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Describe the issue or idea"
                  style={S.textarea}
                  disabled={busy}
                />
              </label>

              <div style={S.contactRow}>
                <label style={{ ...S.field, flex: '0 0 132px' }}>
                  <span style={S.label}>Contact</span>
                  <select
                    value={contactType}
                    onChange={(event) => setContactType(event.target.value)}
                    style={S.select}
                    disabled={busy}
                  >
                    {CONTACT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label style={{ ...S.field, flex: 1 }}>
                  <span style={S.label}>Handle</span>
                  <input
                    value={contact}
                    maxLength={160}
                    onChange={(event) => setContact(event.target.value)}
                    placeholder="@name or email"
                    style={S.input}
                    disabled={busy}
                  />
                </label>
              </div>

              {notice && (
                <div style={notice.type === 'ok' ? S.noticeOk : S.noticeError}>
                  {notice.text}
                </div>
              )}

              <button type="submit" style={{ ...S.submit, opacity: canSubmit ? 1 : 0.6 }} disabled={!canSubmit}>
                {busy ? 'SENDING...' : 'SEND'}
              </button>
            </div>
          </form>
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
    width: 'min(390px, calc(100vw - 28px))',
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
  segmented: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
  },
  segment: {
    height: 34,
    borderRadius: 7,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#b58b2a',
    background: '#fff9e8',
    color: '#5C3A21',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
  },
  segmentActive: {
    background: 'linear-gradient(180deg, #ffe066, #e6b800)',
    borderColor: '#5C3A21',
    color: '#2e1c10',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  label: {
    fontSize: 11,
    fontWeight: 900,
    color: '#6d5338',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  textarea: {
    minHeight: 106,
    resize: 'vertical',
    borderRadius: 8,
    border: '2px solid #d4c8b0',
    background: '#fffaf0',
    color: '#2f2117',
    padding: 10,
    fontSize: 13,
    lineHeight: 1.35,
    fontFamily: 'inherit',
    outline: 'none',
  },
  contactRow: {
    display: 'flex',
    gap: 8,
  },
  select: {
    height: 38,
    borderRadius: 8,
    border: '2px solid #d4c8b0',
    background: '#fffaf0',
    color: '#2f2117',
    padding: '0 8px',
    fontSize: 13,
    fontWeight: 800,
    outline: 'none',
  },
  input: {
    height: 38,
    borderRadius: 8,
    border: '2px solid #d4c8b0',
    background: '#fffaf0',
    color: '#2f2117',
    padding: '0 10px',
    fontSize: 13,
    fontWeight: 700,
    outline: 'none',
  },
  noticeOk: {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #5fa35a',
    background: '#e9ffd8',
    color: '#186b32',
    fontSize: 12,
    fontWeight: 800,
  },
  noticeError: {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #e7a5a5',
    background: '#ffe4e4',
    color: '#9f1d1d',
    fontSize: 12,
    fontWeight: 800,
  },
  submit: {
    width: '100%',
    height: 42,
    borderRadius: 8,
    border: '3px solid #5C3A21',
    background: 'linear-gradient(180deg, #ffe066, #e6b800)',
    color: '#2e1c10',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 0,
    cursor: 'pointer',
    boxShadow: '0 4px 0 #8a5a1d, 0 7px 12px rgba(0,0,0,0.22)',
  },
};
