import { useState, useEffect, memo } from 'react';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function ExplainMoveModal({ symbol, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const token = window._playerToken;
    if (!token || !symbol) return;
    setLoading(true);
    setError(null);
    fetch(`${GAME_API}/elfa/explain/${encodeURIComponent(symbol)}`, {
      headers: { 'x-token': token },
    })
      .then(async r => {
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) setError(j.error || 'Failed to load explanation');
        else setData(j);
      })
      .catch(() => { if (!cancelled) setError('Network error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.brain}>🧠</span>
          <h3 style={S.title}>Why is {symbol} moving?</h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading && <div style={S.loading}>Analyzing social data…</div>}
        {error && <div style={S.error}>{error}</div>}

        {data && !loading && (
          <>
            <p style={S.text}>{data.explanation}</p>
            <div style={S.metaRow}>
              <div style={S.metaItem}>
                <span style={S.metaLabel}>Mentions 24h</span>
                <span style={S.metaValue}>{data.mentions_count || 0}</span>
              </div>
              <div style={S.metaItem}>
                <span style={S.metaLabel}>Updated</span>
                <span style={S.metaValue}>{timeAgo(data.updated_at)}</span>
              </div>
              <div style={S.metaItem}>
                <span style={S.metaLabel}>Source</span>
                <span style={S.metaValue}>{data.cached ? 'cached' : 'fresh'}</span>
              </div>
            </div>
            <div style={S.poweredBy}>Powered by Elfa AI</div>
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
  brain: { fontSize: 24 },
  title: { fontSize: 16, fontWeight: 900, color: '#5C3A21', flex: 1, margin: 0 },
  closeBtn: {
    background: 'transparent', border: 'none', color: '#5C3A21',
    fontSize: 18, fontWeight: 900, cursor: 'pointer', padding: 4,
  },
  loading: { fontSize: 13, color: '#8a7252', fontWeight: 700, padding: '20px 0', textAlign: 'center' },
  error: { fontSize: 13, color: '#c33', fontWeight: 700, padding: '12px 0' },
  text: { fontSize: 14, color: '#5C3A21', lineHeight: 1.5, fontWeight: 600, marginBottom: 14 },
  metaRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
    background: '#fff5cc', border: '2px solid #d4c8b0', borderRadius: 8, padding: 10,
  },
  metaItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  metaLabel: { fontSize: 10, color: '#8a7252', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 13, fontWeight: 900, color: '#5C3A21' },
  poweredBy: { fontSize: 10, color: '#a3906a', textAlign: 'center', marginTop: 10, fontStyle: 'italic', fontWeight: 700 },
};

export default memo(ExplainMoveModal);
