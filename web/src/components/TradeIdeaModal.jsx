import { useState, useEffect, useMemo, memo } from 'react';
import elfaLogo from '../assets/elfa.svg';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const PACIFICA_API = 'https://api.pacifica.fi/api/v1';

// Live mark price from Pacifica — polled every 5s while modal open.
function useLiveMark(symbol) {
  const [mark, setMark] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    const fetchMark = async () => {
      try {
        const r = await fetch(`${PACIFICA_API}/info/prices`);
        const j = await r.json();
        if (cancelled) return;
        const row = Array.isArray(j?.data) ? j.data.find(p => p.symbol === symbol) : null;
        const v = row ? parseFloat(row.mark) : null;
        if (Number.isFinite(v)) setMark(v);
      } catch {}
    };
    fetchMark();
    const iv = setInterval(fetchMark, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [symbol]);
  return mark;
}

// Candlestick mini-chart with horizontal reference lines (TP / Entry / Mark / SL).
// Dependency-free SVG. Scales to container via viewBox.
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
        const parsed = Array.isArray(j?.data) ? j.data.map(c => ({
          o: parseFloat(c.o), h: parseFloat(c.h), l: parseFloat(c.l), c: parseFloat(c.c),
        })).filter(x => Number.isFinite(x.o) && Number.isFinite(x.c)) : [];
        setCandles(parsed);
      })
      .catch(() => { if (!cancelled) setCandles([]); });
    return () => { cancelled = true; };
  }, [symbol]);

  const view = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    const levels = [entry, tp, sl, mark].filter(v => typeof v === 'number' && isFinite(v));
    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    const minY = Math.min(...lows, ...levels);
    const maxY = Math.max(...highs, ...levels);
    const pad = (maxY - minY) * 0.05 || maxY * 0.01 || 1;
    const yLo = minY - pad;
    const yHi = maxY + pad;
    // Native-pixel viewBox keeps text + strokes crisp at any container width.
    const W = 600, H = 270;
    const y = v => H - ((v - yLo) / (yHi - yLo)) * H;
    const barW = (W / candles.length) * 0.62;
    return { W, H, y, barW, candles };
  }, [candles, entry, tp, sl, mark]);

  if (candles === null) return <div style={miniS.loading}>Loading chart…</div>;
  if (!view) return <div style={miniS.loading}>No price data</div>;

  const { W, H, y, barW } = view;
  const fmt = (n) => n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(4);
  const levelsRaw = [
    { key: 'tp',    val: tp,    color: '#4CAF50', label: 'TP' },
    { key: 'mark',  val: mark,  color: '#5C3A21', label: 'Mark' },
    { key: 'entry', val: entry, color: '#9c27b0', label: 'Entry' },
    { key: 'sl',    val: sl,    color: '#E53935', label: 'SL' },
  ].filter(l => typeof l.val === 'number' && isFinite(l.val));

  const tagW = 78;
  const tagH = 18;

  // Collision resolution for right-edge price tags. When two levels (e.g. Mark
  // and Entry) sit within `tagH` of each other the tags would overlap and the
  // numbers get unreadable. Strategy:
  //  1. Each tag keeps its natural y (drawn on the real level line).
  //  2. After sorting top→bottom, enforce a minimum vertical gap; push the
  //     lower tag down when needed, then re-sweep bottom→top to stay inside H.
  //  3. Draw a short elbow connector from the level line to the displaced tag
  //     so the user can still tell which number belongs to which line.
  const minGap = tagH + 2;
  const placed = levelsRaw
    .map(l => ({ ...l, yLine: y(l.val), yTag: y(l.val) }))
    .sort((a, b) => a.yLine - b.yLine);
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1];
    if (placed[i].yTag < prev.yTag + minGap) {
      placed[i].yTag = prev.yTag + minGap;
    }
  }
  // Push back into [pad, H - pad] by sweeping upward from the last one.
  const pad = tagH / 2 + 2;
  if (placed.length > 0 && placed[placed.length - 1].yTag > H - pad) {
    placed[placed.length - 1].yTag = H - pad;
    for (let i = placed.length - 2; i >= 0; i--) {
      if (placed[i].yTag > placed[i + 1].yTag - minGap) {
        placed[i].yTag = placed[i + 1].yTag - minGap;
      }
    }
  }
  if (placed.length > 0 && placed[0].yTag < pad) {
    placed[0].yTag = pad;
    for (let i = 1; i < placed.length; i++) {
      if (placed[i].yTag < placed[i - 1].yTag + minGap) {
        placed[i].yTag = placed[i - 1].yTag + minGap;
      }
    }
  }

  return (
    <div style={miniS.wrap}>
      <svg viewBox={`0 0 ${W + tagW} ${H}`} style={miniS.svg} preserveAspectRatio="none">
        {/* Horizontal reference lines */}
        {levelsRaw.map(l => (
          <line
            key={l.key}
            x1={0} x2={W}
            y1={y(l.val)} y2={y(l.val)}
            stroke={l.color}
            strokeWidth={1.5}
            strokeDasharray={l.key === 'mark' ? '4 4' : '6 4'}
            opacity={0.8}
          />
        ))}
        {/* Candlesticks */}
        {view.candles.map((c, i) => {
          const cx = ((i + 0.5) / view.candles.length) * W;
          const yOpen = y(c.o), yClose = y(c.c);
          const yHigh = y(c.h), yLow = y(c.l);
          const up = c.c >= c.o;
          const color = up ? '#4CAF50' : '#E53935';
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1.3} />
              <rect x={cx - barW / 2} y={bodyTop} width={barW} height={bodyH} fill={color} />
            </g>
          );
        })}
        {/* Level tags at right edge — de-overlapped with connectors */}
        {placed.map(l => {
          const displaced = Math.abs(l.yTag - l.yLine) > 0.5;
          return (
            <g key={l.key + '-tag'}>
              {displaced && (
                <path
                  d={`M${W},${l.yLine} L${W + 4},${l.yLine} L${W + 6},${l.yTag} L${W + 4},${l.yTag}`}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={1}
                  opacity={0.8}
                />
              )}
              <rect x={W + 4} y={l.yTag - tagH / 2} width={tagW - 8} height={tagH} rx={3} fill={l.color} />
              <text
                x={W + tagW / 2} y={l.yTag + 5}
                textAnchor="middle"
                fontSize={13} fontWeight={900} fill="#fff"
                style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
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
    padding: 6,
    marginBottom: 12,
    height: 140,
  },
  svg: { width: '100%', height: '100%', display: 'block' },
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: 140, fontSize: 12, color: '#8a7252', fontWeight: 700,
    background: 'rgba(0,0,0,0.04)', border: '1.5px solid rgba(92,58,33,0.2)',
    borderRadius: 8, marginBottom: 12,
  },
};

function TradeIdeaModal({ symbol, currentPrice, onClose, onApply }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Always pull live mark from Pacifica so it's never stale/null.
  const liveMark = useLiveMark(symbol);
  const mark = (typeof currentPrice === 'number' && isFinite(currentPrice)) ? currentPrice : liveMark;

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
            Elfa isn't responding right now — we tried {data.attempts || 3} times.
            Please try again in a minute or pick another symbol.
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
              mark={mark}
            />

            <div style={S.levelsGrid}>
              <LevelRow label="Entry"  value={fmt(idea.entry)} color="#9c27b0" />
              {mark != null && (
                <LevelRow label="Mark" value={fmt(mark)} color="#5C3A21" muted />
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
                Got it
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
    zIndex: 10000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '16px 16px', overflowY: 'auto',
  },
  modal: {
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3ebd1 100%)',
    border: '3px solid #5C3A21', borderRadius: 14, padding: 14,
    maxWidth: 460, width: '100%', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
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
    padding: '7px 10px', background: 'rgba(255,255,255,0.5)',
    border: '1.5px solid rgba(92,58,33,0.25)', borderRadius: 8, gap: 8,
  },
  levelLabel: {
    color: '#fff', fontSize: 11, fontWeight: 900, padding: '2px 10px',
    borderRadius: 4, letterSpacing: '0.5px', minWidth: 52, textAlign: 'center', flexShrink: 0,
  },
  levelValue: { fontSize: 15, fontWeight: 800, color: '#5C3A21', fontFamily: 'monospace', whiteSpace: 'nowrap' },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 },
  metaCard: {
    background: 'rgba(255,255,255,0.5)', border: '1.5px solid rgba(92,58,33,0.25)',
    borderRadius: 8, padding: '8px 4px', textAlign: 'center', minWidth: 0,
  },
  metaLabel: { fontSize: 9, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' },
  metaValue: { fontSize: 13, fontWeight: 900, marginTop: 2, whiteSpace: 'nowrap' },
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
