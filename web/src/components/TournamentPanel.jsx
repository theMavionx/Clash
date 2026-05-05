// Player-facing tournament view.
//
// Matches the cartoon parchment style of LeaderboardPanel / BattleLogPanel:
// fdf8e7 paper, d4c8b0 stitched border, brown title, red round close button,
// e8dfc8 rows. Three states (no tournament / not joined / joined) share the
// same paper modal so the visual language is consistent across the game.
import { memo, useState, useMemo } from 'react';
import { useTournament, useTournamentLeaderboard } from '../hooks/useTournament';
import { usePlayer } from '../hooks/useGodot';
import { useDex } from '../contexts/DexContext';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

const fmt = (n) => (Number(n) || 0).toLocaleString().replace(/,/g, ' ');

function fmtUsd(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return '$' + Math.round(v).toLocaleString().replace(/,/g, ' ');
  return '$' + v.toFixed(2);
}

function fmtDate(s) {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function TournamentPanel({ onClose }) {
  const { me, join, leave } = useTournament({ active: true });
  const player = usePlayer();
  const { dex } = useDex();
  const t = me?.tournament || null;
  const joined = !!me?.joined;
  const myStats = me?.me || null;
  const { board } = useTournamentLeaderboard(t?.id, { active: !!t });
  const [busy, setBusy] = useState(false);

  const myRank = useMemo(() => {
    if (!board || !player?.player_id) return null;
    const row = board.leaderboard.find(r => r.player_id === player.player_id);
    return row ? row.rank : null;
  }, [board, player?.player_id]);

  const handleJoin = async () => {
    if (!t || busy) return;
    setBusy(true);
    await join(t.id);
    setBusy(false);
  };
  const handleLeave = async () => {
    if (!t || busy) return;
    if (!confirm('Leave tournament? Your tournament trophies and stats will reset if you re-join later.')) return;
    setBusy(true);
    await leave(t.id);
    setBusy(false);
  };

  return (
    <>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={trophyIcon} alt="" style={S.headerIcon} />
            <span style={S.headerTitle}>Tournament</span>
          </div>
          <button style={S.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={S.body}>
          {!t && (
            <div style={S.empty}>
              <div style={S.emptyIcon}>🏆</div>
              <div style={S.emptyTitle}>No tournament running</div>
              <div style={S.emptySub}>
                There's no live tournament for {String(dex || '').toUpperCase()} right now.<br />
                Check back soon!
              </div>
            </div>
          )}

          {t && (
            <>
              <div style={S.tCard}>
                <div style={S.tName}>{t.name}</div>
                {t.description && <div style={S.tDesc}>{t.description}</div>}
                <div style={S.tagRow}>
                  <span style={S.tag}>Sort: {t.sort_by}</span>
                  {Number(t.gold_boost) !== 1 && <span style={S.boostTag}>×{t.gold_boost} GOLD</span>}
                  {Number(t.trophy_boost) !== 1 && <span style={S.boostTag}>×{t.trophy_boost} TROPHY</span>}
                  {t.end_at && <span style={S.tag}>Ends {fmtDate(t.end_at)}</span>}
                </div>
              </div>

              {!joined && (
                <button style={S.joinBtn} onClick={handleJoin} disabled={busy}>
                  {busy ? 'JOINING…' : 'JOIN TOURNAMENT'}
                </button>
              )}

              {joined && myStats && (
                <div style={S.myCard}>
                  <div style={S.myCardHeader}>
                    <span style={S.myCardLabel}>Your standing</span>
                    {myRank && <span style={S.myCardRank}>#{myRank}</span>}
                  </div>
                  <div style={S.statRow}>
                    <Stat label="Trophies" value={fmt(myStats.trophies)} />
                    <Stat label="Gold" value={fmt(myStats.gold)} />
                    <Stat label="Trades" value={myStats.trades_count} />
                    <Stat label="Volume" value={fmtUsd(myStats.volume_usd)} />
                    <Stat
                      label="PnL"
                      value={fmtUsd(myStats.pnl_usd)}
                      color={(myStats.pnl_usd || 0) >= 0 ? '#15803d' : '#b91c1c'}
                    />
                  </div>
                  <div style={S.freezeNote}>
                    Main trophies are <strong>frozen</strong> while joined. Battle wins/losses count
                    only toward this tournament. Quests &amp; gold credit normally.
                  </div>
                  <button style={S.leaveBtn} onClick={handleLeave} disabled={busy}>
                    {busy ? 'Leaving…' : 'Leave tournament'}
                  </button>
                </div>
              )}

              <div style={S.lbHeader}>Leaderboard</div>
              <div style={S.lbList}>
                {!board && <div style={S.empty}>Loading…</div>}
                {board && board.leaderboard.length === 0 && (
                  <div style={S.empty}>No players yet — be the first to join</div>
                )}
                {board && board.leaderboard.map((r) => {
                  const isMe = r.player_id === player?.player_id;
                  const medalColor = r.rank === 1 ? '#FFD700' : r.rank === 2 ? '#C0C0C0' : r.rank === 3 ? '#CD7F32' : null;
                  const sortKey = board.sort_by;
                  const featured = sortKey === 'trophies' ? fmt(r.trophies)
                    : sortKey === 'gold' ? fmt(r.gold)
                    : sortKey === 'volume_usd' ? fmtUsd(r.volume_usd)
                    : fmtUsd(r.pnl_usd);
                  const featuredColor = sortKey === 'pnl_usd'
                    ? ((r.pnl_usd || 0) >= 0 ? '#15803d' : '#b91c1c')
                    : '#b45309';
                  return (
                    <div
                      key={r.player_id}
                      style={{
                        ...S.row,
                        background: isMe ? '#d4c8b0' : '#e8dfc8',
                        border: isMe ? '3px solid #f59e0b' : '3px solid #d4c8b0',
                      }}
                    >
                      <div
                        style={{
                          ...S.rank,
                          background: medalColor || '#a3906a',
                          color: medalColor ? '#000' : '#fff',
                        }}
                      >
                        {r.rank}
                      </div>
                      <div style={S.info}>
                        <span style={{ ...S.name, color: isMe ? '#b45309' : '#5C3A21' }}>
                          {r.name || (r.wallet || '').slice(0, 6) + '…'}{isMe ? ' (you)' : ''}
                        </span>
                        <span style={S.subRow}>
                          {fmt(r.trophies)} 🏆 · {r.trades_count} trades · {fmtUsd(r.volume_usd)} vol
                        </span>
                      </div>
                      <span style={{ ...S.featured, color: featuredColor }}>{featured}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={S.stat}>
      <div style={{ ...S.statValue, color: color || '#b45309' }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

export default memo(TournamentPanel);

const S = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 250, pointerEvents: 'auto' },
  modal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 380, maxWidth: '94vw', maxHeight: '88vh',
    background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column',
    zIndex: 251, pointerEvents: 'auto', overflow: 'hidden',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
  },
  headerIcon: {
    width: 22, height: 22, objectFit: 'contain',
    filter: 'invert(60%) sepia(90%) saturate(500%) hue-rotate(10deg)',
  },
  headerTitle: { fontSize: 18, fontWeight: 900, color: '#5C3A21' },
  closeBtn: {
    width: 30, height: 30, borderRadius: '50%', background: '#E53935', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  body: { flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', scrollbarWidth: 'none' },
  empty: { textAlign: 'center', padding: 28, color: '#a3906a', fontWeight: 700, fontSize: 13 },
  emptyIcon: { fontSize: 44, marginBottom: 6 },
  emptyTitle: { fontSize: 16, fontWeight: 900, color: '#5C3A21', marginBottom: 4 },
  emptySub: { fontSize: 12, color: '#a3906a', lineHeight: 1.5 },

  tCard: {
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 14, padding: 12,
  },
  tName: { fontSize: 16, fontWeight: 900, color: '#5C3A21', marginBottom: 4 },
  tDesc: { fontSize: 12, color: '#7c5a3a', lineHeight: 1.4, marginBottom: 8 },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  tag: {
    fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 6,
    background: '#fdf8e7', border: '2px solid #d4c8b0', color: '#7c5a3a',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  boostTag: {
    fontSize: 10, fontWeight: 900, padding: '3px 7px', borderRadius: 6,
    background: '#f59e0b', border: '2px solid #b45309', color: '#fff',
    textTransform: 'uppercase', letterSpacing: 0.4,
    textShadow: '0 1px 0 rgba(0,0,0,0.25)',
  },

  joinBtn: {
    width: '100%', padding: '12px 16px', borderRadius: 14,
    background: 'linear-gradient(180deg, #4CAF50 0%, #2E7D32 100%)',
    border: '3px solid #2E7D32',
    color: '#fff', fontSize: 16, fontWeight: 900, letterSpacing: 0.6,
    cursor: 'pointer',
    textShadow: '0 2px 0 rgba(0,0,0,0.3)',
    boxShadow: '0 4px 0 #1B5E20, 0 6px 12px rgba(0,0,0,0.25)',
  },

  myCard: {
    background: '#fef3c7', border: '3px solid #f59e0b', borderRadius: 14, padding: 12,
  },
  myCardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8,
  },
  myCardLabel: { fontSize: 11, fontWeight: 800, color: '#7c5a3a', textTransform: 'uppercase', letterSpacing: 0.5 },
  myCardRank: { fontSize: 22, fontWeight: 900, color: '#b45309' },
  statRow: { display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 },
  stat: {
    flex: '1 1 56px', minWidth: 56, textAlign: 'center', background: '#fdf8e7',
    border: '2px solid #d4c8b0', borderRadius: 8, padding: '6px 4px',
  },
  statValue: { fontSize: 14, fontWeight: 900, lineHeight: 1.2 },
  statLabel: { fontSize: 9, color: '#a3906a', textTransform: 'uppercase', marginTop: 2, fontWeight: 700, letterSpacing: 0.4 },
  freezeNote: {
    fontSize: 11, color: '#7c5a3a', lineHeight: 1.4, padding: '6px 4px',
    background: '#fdf8e7', borderRadius: 8, marginBottom: 8,
  },
  leaveBtn: {
    width: '100%', padding: '6px', background: 'transparent', border: '2px solid #a3906a',
    color: '#7c5a3a', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
  },

  lbHeader: { fontSize: 13, fontWeight: 900, color: '#5C3A21', textTransform: 'uppercase', letterSpacing: 0.6, padding: '4px 2px 0' },
  lbList: { display: 'flex', flexDirection: 'column', gap: 5 },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 12 },
  rank: {
    width: 26, height: 26, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 900, flexShrink: 0,
  },
  info: { flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  subRow: { fontSize: 10, fontWeight: 700, color: '#a3906a' },
  featured: { fontSize: 14, fontWeight: 900, flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
};
