import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';

function AiChatPanel({ onClose }) {
  const { isMobile } = useLayout();
  const player = usePlayer();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Ready when you are.' },
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/ai-chat/status', { headers: { 'x-token': token } })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!cancelled && !r.ok && data?.error) setError(data.error);
      })
      .catch(() => {
        if (!cancelled) setError('AI chat is not reachable yet.');
      });
    return () => { cancelled = true; };
  }, [token]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || status === 'sending') return;
    if (!token) {
      setError('Game session is not ready yet.');
      return;
    }
    setInput('');
    setError('');
    setStatus('sending');
    setMessages((rows) => [...rows, { role: 'user', text }]);
    try {
      const r = await fetch('/api/ai-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ message: text }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'AI request failed');
      setMessages((rows) => [...rows, {
        role: 'assistant',
        text: data?.message || 'Done.',
        meta: data?.fallback ? `Fallback model: ${data.model || 'active'}` : data?.model || '',
      }]);
    } catch (err) {
      const msg = err?.message || 'AI request failed';
      setError(msg);
      setMessages((rows) => [...rows, { role: 'assistant', text: msg }]);
    } finally {
      setStatus('idle');
    }
  }, [input, status, token]);

  const onKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }, [send]);

  // On desktop the chat is a sidebar — it must not dim the game or steal
  // clicks from buildings underneath. Make the backdrop transparent and
  // non-interactive; only the panel itself catches pointer events. On
  // mobile keep the dim full-screen overlay because the chat fills the
  // screen and there's nothing useful to interact with behind it.
  const backdropStyle = isMobile
    ? styles.backdrop
    : { ...styles.backdrop, background: 'transparent', pointerEvents: 'none' };
  const panelStyle = isMobile
    ? styles.panel
    : { ...styles.panel, pointerEvents: 'auto' };

  return (
    <div style={backdropStyle}>
      <section style={panelStyle}>
        <header style={styles.header}>
          <div>
            <div style={styles.title}>AI Agent</div>
            <div style={styles.sub}>
              <span style={styles.onlineDot} />
              Online
            </div>
          </div>
          <button style={styles.close} onClick={onClose} aria-label="Close AI chat">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div ref={listRef} style={styles.messages}>
          {messages.map((m, idx) => (
            <div key={idx} style={{ ...styles.bubble, ...(m.role === 'user' ? styles.userBubble : styles.aiBubble) }}>
              <div style={styles.role}>{m.role === 'user' ? 'You' : 'Agent'}</div>
              <div style={styles.text}>{m.text}</div>
              {m.meta && <div style={styles.meta}>{m.meta}</div>}
            </div>
          ))}
          {status === 'sending' && (
            <div style={{ ...styles.bubble, ...styles.aiBubble }}>
              <div style={styles.role}>Agent</div>
              <div style={styles.text}>Thinking and checking tools...</div>
            </div>
          )}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.composer}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message..."
            style={styles.input}
            rows={2}
          />
          <button style={styles.send} onClick={send} disabled={status === 'sending' || !input.trim()}>
            Send
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Parchment palette ────────────────────────────────────────────────
// Matches the Battle Shop / NFT panels: cream parchment `#fdf8e7` body,
// brown borders, gold accents, red close pill. Same visual language as
// the rest of the in-game UI so the AI panel doesn't feel like a
// foreign element.
const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 80,
    pointerEvents: 'auto',
    background: 'rgba(20, 12, 4, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '16px',
  },
  panel: {
    width: 'min(420px, calc(100vw - 24px))',
    height: 'min(640px, calc(100vh - 32px))',
    background: '#fdf8e7',
    border: '6px solid #d4c8b0',
    borderRadius: 22,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    color: '#5C3A21',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    background: '#d4c8b0',
    borderBottom: '4px solid #bba882',
    flex: '0 0 auto',
  },
  title: {
    fontSize: 18, fontWeight: 900, color: '#5C3A21',
    letterSpacing: 0,
    textShadow: '0 1px 0 rgba(255,255,255,0.4)',
  },
  sub: {
    fontSize: 11, fontWeight: 800, color: '#1B5E20',
    textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2,
    display: 'inline-flex', alignItems: 'center', gap: 5,
  },
  onlineDot: {
    display: 'inline-block',
    width: 8, height: 8, borderRadius: '50%',
    background: '#4caf50',
    boxShadow: '0 0 6px rgba(76,175,80,0.7)',
  },
  close: {
    width: 32, height: 32, borderRadius: '50%',
    background: '#E53935', border: '3px solid #fff', color: '#fff',
    cursor: 'pointer', padding: 0,
    fontSize: 16, fontWeight: 900, lineHeight: '26px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  messages: {
    flex: 1, minHeight: 0,
    padding: 14,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fdf8e7',
  },
  bubble: {
    borderRadius: 12,
    padding: '8px 12px',
    border: '2px solid #d4c8b0',
    lineHeight: 1.4,
    boxShadow: '0 2px 4px rgba(95,58,33,0.08)',
  },
  userBubble: {
    alignSelf: 'flex-end',
    // Gold-on-gold gradient mirrors the "primary action" tone used on
    // mint/list buttons elsewhere — feels like the player's own voice.
    background: 'linear-gradient(180deg, #fff2c2 0%, #ffd76a 100%)',
    border: '2px solid #c2851b',
    color: '#3a1f00',
    maxWidth: '86%',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    background: '#fff6dc',
    color: '#5C3A21',
    maxWidth: '92%',
  },
  role: {
    fontSize: 10, color: '#8b6b3f', fontWeight: 900,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
  },
  text: { fontSize: 13, fontWeight: 600, whiteSpace: 'pre-wrap' },
  meta: { fontSize: 10, color: '#9f8759', marginTop: 6, fontStyle: 'italic' },
  error: {
    margin: '0 14px 10px',
    color: '#7a1f1c',
    background: '#fdecea',
    border: '2px solid #E53935',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12, fontWeight: 700,
  },
  composer: {
    display: 'flex',
    gap: 8,
    padding: 12,
    borderTop: '3px solid #d4c8b0',
    background: '#f5ecd2',
    flex: '0 0 auto',
  },
  input: {
    flex: 1,
    resize: 'none',
    border: '2px solid #d4c8b0',
    borderRadius: 10,
    background: '#fff',
    color: '#3a2810',
    padding: '8px 10px',
    outline: 'none',
    fontSize: 13,
    fontFamily: 'inherit',
    minWidth: 0,
  },
  send: {
    minWidth: 76,
    padding: '0 14px',
    border: '2px solid #1f6d34',
    borderRadius: 10,
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    color: '#fff',
    fontSize: 13, fontWeight: 900,
    cursor: 'pointer',
    textShadow: '0 1px 1px rgba(0,0,0,0.35)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.4)',
  },
};

export default memo(AiChatPanel);
