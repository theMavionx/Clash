import { useState, useEffect, useMemo, memo } from 'react';
import elfaLogo from '../assets/elfa.svg';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const PACIFICA_API = 'https://api.pacifica.fi/api/v1';

// Mini sparkline with horizontal reference lines (TP / Entry / Mark / SL).
// Kept dependency-free — pure SVG, recomputes viewBox from data + levels.
function MiniChart({ symbol, entry, tp, sl, mark }) {
  const [candles, setCandles] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const start = now - 24 * 60 * 60 * 1000; // 24h
    fetch(`${PACIFICA_API}/kline?symbol=${symbol}&interval=1h&start_time=${start}&end_time=${now}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        setCandles(Array.isArray(j?.data) ? j.data.map(c => parseFloat(c.c)).filter(Number.isFinite) : []);
      })
      .catch(() => { if (!cancelled) setCandles([]); });
    return () => { cancelled = true; };
  }, [symbol]);

  const view = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    const levels = [entry, tp, sl, mark].filter(v => typeof v === 'number' && isFinite(v));
    const allY = [...candles, ...levels];
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const pad = (maxY - minY) * 0.08 || maxY * 0.02 || 1;
    const yLo = minY - pad;
    const yHi = maxY + pad;
    const W = 100, H = 60; // viewBox units; scales to container
    const y = v => H - ((v - yLo) / (yHi - yLo)) * H;
    const path = candles.map((v, i) => {
      const x = (i / (candles.length - 1 || 1)) * W;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y(v).toFixed(2)}`;
    }).join(' ');
    return { W, H, y, path };
  }, [candles, entry, tp, sl, mark]);

  if (candles === null) {
    return <div style={miniS.loading}>Loading chart…</div>;
  }
  if (!view) {
    return <div style={miniS.loading}>No price data</div>;
  }

  const { W, H, y, path } = view;
  const fmt = (n) => n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(4);
  // Level labels — position a tag at right edge of chart
  const levels = [
    { key: 'tp',    val: tp,    color: '#4CAF50', label: 'TP' },
    { key: 'mark',  val: mark,  color: '#5C3A21', label: 'Mark' },
    { key: 'entry', val: entry, color: '#9c27b0', label: 'Entry' },
    { key: 'sl',    val: sl,    color: '#E53935', label: 'SL' },
  ].filter(l => typeof l.val === 'number' && isFinite(l.val));

  return (
    <div style={miniS.wrap}>
      <svg viewBox={`0 0 ${W + 28} ${H}`} style={miniS.svg} preserveAspectRatio="none">
        {/* Reference lines */}
        {levels.map(l => (
          <line
            key={l.key}
            x1={0} x2={W}
            y1={y(l.val)} y2={y(l.val)}
            stroke={l.color}
            strokeWidth={0.4}
            strokeDasharray={l.key === 'mark' ? '1.5 1' : '2 1.5'}
            opacity={0.75}
          />
        ))}
        {/* Price path */}
        <path d={path} fill="none" stroke="#9c27b0" strokeWidth={0.9} strokeLinejoin="round" />
        {/* Level tags at right edge */}
        {levels.map(l => {
          const ty = Math.max(4, Math.min(H - 2, y(l.val)));
          return (
            <g key={l.key + '-tag'}>
              <rect x={W + 1} y={ty - 3} width={26} height={6} rx={1} fill={l.color} />
              <text
                x={W + 14} y={ty + 1.5}
                textAnchor="middle"
                fontSize={4} fontWeight={900} fill="#fff"
                style={{ fontFamily: 'monospace' }}
              >{fmt(l.val)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const miniS = {
  wrap: {
    background: 'rgba(0,0,0,0.04)',
    border: '1.5px solid rgba(92,58,33,0.2)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
    height: 120,
  },
  svg: { width: '100%', height: '100%', display: 'block' },
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: 120, fontSize: 12, color: '#8a7252', fontWeight: 700,
    background: 'rgba(0,0,0,0.04)', border: '1.5px solid rgba(92,58,33,0.2)',
    borderRadius: 8, marginBottom: 12,
  },
};

function TradeIdeaModal({ symbol, currentPrice, onClose, onApply }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const token = window._playerToken;
    if (!token || !symbol) return;
    setLoading(true);
    setError(null);
    fetch(`${GAME_API}/elfa/trade-idea/${encodeURIComponent(symbol)}`, {
      headers: { 'x-token': token },
    })
      .then(async r => {
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) setError(j.error || 'Failed to load trade idea');
        else setData(j);
      })
      .catch(() => { if (!cancelled) setError('Network error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  const idea = data?.idea;
  const isLong = idea?.side === 'long';
  const sideColor = isLong ? '#4CAF50' : '#E53935';
  const confColor =
    !idea ? '#8a7252'
    : idea.confidence >= 70 ? '#4CAF50'
    : idea.confidence >= 50 ? '#e8b830'
    : '#E53935';

  const fmt = (n) => typeof n === 'number' ? (n >= 100 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(4)) : '—';

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <h3 style={S.title}>Trade Idea · {symbol}</h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading && <div style={S.loading}>Analyzing narrative + price action…</div>}
        {error && <div style={S.error}>{error}</div>}

        {!loading && data && !idea && (
          <div style={S.error}>
            Elfa couldn't produce a trade idea for {symbol} right now. Try the Explain feature for a narrative instead.
          </div>
        )}

        {idea && !loading && (
          <>
            <div style={{...S.sideBadge, background: sideColor}}>
              {isLong ? 'LONG' : 'SHORT'}
            </div>

            <MiniChart
              symbol={symbol}
              entry={idea.entry}
              tp={idea.tp}
              sl={idea.sl}
              mark={typeof currentPrice === 'number' ? currentPrice : null}
            />

            <div style={S.levelsGrid}>
              <LevelRow label="Entry"  value={fmt(idea.entry)} color="#9c27b0" />
              {currentPrice != null && (
                <LevelRow label="Mark" value={fmt(currentPrice)} color="#5C3A21" muted />
              )}
              <LevelRow label="TP"     value={fmt(idea.tp)}    color="#4CAF50" />
              <LevelRow label="SL"     value={fmt(idea.sl)}    color="#E53935" />
            </div>

            <div style={S.metaGrid}>
              <MetaCard label="Confidence" value={`${idea.confidence}%`} color={confColor} />
              <MetaCard label="Risk:Reward" value={idea.rr || '—'} />
              <MetaCard label="Horizon" value={idea.horizon || '—'} />
            </div>

            {idea.reason && (
              <div style={S.reason}>
                <span style={S.reasonLabel}>Why:</span> {idea.reason}
              </div>
            )}

            {onApply && (
              <button
                style={{...S.applyBtn, background: sideColor}}
                onClick={() => { onApply(idea); onClose(); }}
              >
                Apply to order form
              </button>
            )}

            <div style={S.disclaimer}>
              Not financial advice. Numbers are LLM-generated from social data — verify before trading.
            </div>

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

function LevelRow({ label, value, color, muted }) {
  return (
    <div style={{...S.levelRow, opacity: muted ? 0.6 : 1}}>
      <span style={{...S.levelLabel, background: color}}>{label}</span>
      <span style={S.levelValue}>{value}</span>
    </div>
  );
}

function MetaCard({ label, value, color }) {
  return (
    <div style={S.metaCard}>
      <div style={S.metaLabel}>{label}</div>
      <div style={{...S.metaValue, color: color || '#5C3A21'}}>{value}</div>
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
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { fontSize: 16, fontWeight: 900, color: '#5C3A21', flex: 1, margin: 0 },
  closeBtn: {
    background: 'transparent', border: 'none', color: '#5C3A21',
    fontSize: 18, fontWeight: 900, cursor: 'pointer', padding: 4,
  },
  loading: { fontSize: 13, color: '#8a7252', fontWeight: 700, padding: '20px 0', textAlign: 'center' },
  error: { fontSize: 13, color: '#c33', fontWeight: 700, padding: '12px 0' },
  sideBadge: {
    display: 'inline-block', color: '#fff', fontSize: 13, fontWeight: 900,
    padding: '4px 14px', borderRadius: 6, letterSpacing: '1px', marginBottom: 12,
  },
  levelsGrid: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 },
  levelRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', background: 'rgba(255,255,255,0.5)',
    border: '1.5px solid rgba(92,58,33,0.25)', borderRadius: 8,
  },
  levelLabel: {
    color: '#fff', fontSize: 11, fontWeight: 900, padding: '2px 10px',
    borderRadius: 4, letterSpacing: '0.5px', minWidth: 52, textAlign: 'center',
  },
  levelValue: { fontSize: 15, fontWeight: 800, color: '#5C3A21', fontFamily: 'monospace' },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 },
  metaCard: {
    background: 'rgba(255,255,255,0.5)', border: '1.5px solid rgba(92,58,33,0.25)',
    borderRadius: 8, padding: '8px 6px', textAlign: 'center',
  },
  metaLabel: { fontSize: 10, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase', letterSpacing: '0.5px' },
  metaValue: { fontSize: 14, fontWeight: 900, marginTop: 2 },
  reason: {
    fontSize: 13, color: '#5C3A21', lineHeight: 1.4, fontWeight: 600,
    background: 'rgba(255,255,255,0.4)', padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid rgba(92,58,33,0.2)', marginBottom: 12,
  },
  reasonLabel: { fontWeight: 900, color: '#9c27b0', marginRight: 4 },
  applyBtn: {
    width: '100%', color: '#fff', border: 'none', borderRadius: 10,
    padding: '10px', fontSize: 14, fontWeight: 900, cursor: 'pointer',
    boxShadow: '0 3px 0 rgba(0,0,0,0.25)', marginBottom: 10,
    letterSpacing: '0.5px',
  },
  disclaimer: {
    fontSize: 10, color: '#8a7252', textAlign: 'center', fontWeight: 600,
    fontStyle: 'italic', marginBottom: 8,
  },
  poweredBy: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontSize: 10, color: '#a3906a', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
  },
  poweredLogo: { height: 16, width: 'auto', objectFit: 'contain', display: 'block' },
};

export default memo(TradeIdeaModal);
