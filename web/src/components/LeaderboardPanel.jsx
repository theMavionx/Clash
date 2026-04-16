import { memo, useState, useEffect } from 'react';
import { usePlayer } from '../hooks/useGodot';
import { useDex, DexBadge } from '../contexts/DexContext';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

const fmt = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

function LeaderboardPanel({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();
  const { dex } = useDex();

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => { setRows(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const myName = player?.player_name;

  return (
    <>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={trophyIcon} alt="" style={{ width: 22, height: 22, filter: 'invert(60%) sepia(90%) saturate(500%) hue-rotate(10deg)' }} />
            <span style={S.headerTitle}>Leaderboard</span>
          </div>
          <button style={S.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={S.body}>
          {loading && <div style={S.empty}>Loading...</div>}
          {!loading && rows.length === 0 && (
            <div style={S.empty}>No players on the leaderboard yet</div>
          )}

          {rows.map((r, i) => {
            const isMe = r.name === myName;
            const rank = i + 1;
            const medalColor = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : null;

            return (
              <div key={r.name} style={{
                ...S.row,
                background: isMe ? '#d4c8b0' : '#e8dfc8',
                border: isMe ? '3px solid #f59e0b' : '3px solid #d4c8b0',
              }}>
                <div style={{
                  ...S.rank,
                  background: medalColor || '#a3906a',
                  color: medalColor ? '#000' : '#fff',
                }}>
                  {rank}
                </div>
                <div style={S.info}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ ...S.name, color: isMe ? '#b45309' : '#5C3A21' }}>
                      {r.name}{isMe ? ' (you)' : ''}
                    </span>
                    {/* Show badge for current player (their choice stored locally);
                        show server-provided dex for other players if available */}
                    <DexBadge dexId={isMe ? dex : (r.dex || null)} size="sm" />
                  </div>
                  <span style={S.level}>TH {r.level}</span>
                </div>
                <div style={S.trophyWrap}>
                  <img src={trophyIcon} alt="" style={S.trophyIcon} />
                  <span style={S.trophyNum}>{fmt(r.trophies)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default memo(LeaderboardPanel);

const S = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, pointerEvents: 'auto' },
  modal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 360, maxHeight: '85vh', background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
    zIndex: 201, pointerEvents: 'auto', overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
  },
  headerTitle: { fontSize: 18, fontWeight: 900, color: '#5C3A21' },
  closeBtn: {
    width: 30, height: 30, borderRadius: '50%', background: '#E53935', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  body: {
    flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
    overflowY: 'auto', scrollbarWidth: 'none',
  },
  empty: { textAlign: 'center', padding: 40, color: '#a3906a', fontWeight: 700, fontSize: 14 },
  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', borderRadius: 12,
  },
  rank: {
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, flexShrink: 0,
  },
  info: { flex: 1, display: 'flex', flexDirection: 'column', gap: 1 },
  name: { fontSize: 14, fontWeight: 900 },
  level: { fontSize: 11, fontWeight: 700, color: '#a3906a' },
  trophyWrap: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  trophyIcon: {
    width: 18, height: 18, objectFit: 'contain',
    filter: 'invert(60%) sepia(90%) saturate(500%) hue-rotate(10deg)',
  },
  trophyNum: { fontSize: 16, fontWeight: 900, color: '#b45309' },
};
