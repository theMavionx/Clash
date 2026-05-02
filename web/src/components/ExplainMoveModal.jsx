import { useState, useEffect, memo } from 'react';
import elfaLogo from '../assets/elfa.svg';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';

function ExplainMoveModal({ symbol, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    let timer = null;
    const token = window._playerToken;
    if (!symbol) {
      setError('No symbol selected');
      setLoading(false);
      return () => { cancelled = true; ctrl.abort(); };
    }
    if (!token) {
      setError('Login is still loading. Close this and try again in a moment.');
      setLoading(false);
      return () => { cancelled = true; ctrl.abort(); };
    }
    setLoading(true);
    setError(null);
    timer = setTimeout(() => ctrl.abort(), 30_000);
    fetch(`${GAME_API}/elfa/explain/${encodeURIComponent(symbol)}`, {
      headers: { 'x-token': token },
      signal: ctrl.signal,
    })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) setError(j.error || 'Failed to load explanation');
        else setData(j);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.name === 'AbortError'
            ? 'Elfa is taking too long right now. Try again in a minute.'
            : 'Network error');
        }
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      ctrl.abort();
    };
  }, [symbol]);

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.brain}>?</span>
          <h3 style={S.title}>What's happening with {symbol}?</h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading && <div style={S.loading}>Analyzing social data…</div>}
        {error && <div style={S.error}>{error}</div>}

        {data && !loading && (
          <>
            <p style={S.text}>{data.explanation}</p>
            <div style={S.poweredBy}>
              <span>Powered by</span>
              <img src={elfaLogo} alt="Elfa" style={S.poweredLogo} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3ebd1 100%)',
    border: '3px solid #5C3A21', borderRadius: 14, padding: 18,
    maxWidth: 460, width: '100%', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  brain: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: '50%',
    background: '#5C3A21', color: '#fff', fontSize: 18, fontWeight: 900,
  },
  title: { fontSize: 16, fontWeight: 900, color: '#5C3A21', flex: 1, margin: 0 },
  closeBtn: {
    background: 'transparent', border: 'none', color: '#5C3A21',
    fontSize: 18, fontWeight: 900, cursor: 'pointer', padding: 4,
  },
  loading: { fontSize: 13, color: '#8a7252', fontWeight: 700, padding: '20px 0', textAlign: 'center' },
  error: { fontSize: 13, color: '#c33', fontWeight: 700, padding: '12px 0' },
  text: { fontSize: 14, color: '#5C3A21', lineHeight: 1.5, fontWeight: 600, marginBottom: 14 },
  poweredBy: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontSize: 10, color: '#a3906a', marginTop: 12, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
  },
  poweredLogo: { height: 16, width: 'auto', objectFit: 'contain', display: 'block' },
};

export default memo(ExplainMoveModal);
