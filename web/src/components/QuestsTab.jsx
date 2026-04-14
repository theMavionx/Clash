import { useState, useEffect, useCallback, memo } from 'react';
import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';


const GAME_API = import.meta.env.VITE_GAME_API || '/api';

function fmtVal(v, type) {
  if (v == null) return '0';
  if (type === 'volume' || type === 'daily_trade_gold' || type === 'combo_volume_attack') {
    return Math.floor(Number(v)).toLocaleString();
  }
  return String(Math.floor(Number(v)));
}

function describeTask(t) {
  const p = t.params || {};
  const sym = (p.symbol && p.symbol !== 'ANY' && p.symbol !== 'any') ? p.symbol.toUpperCase() : 'any token';
  const side = p.side && p.side !== 'any' ? p.side.toUpperCase() : '';
  switch (t.type) {
    case 'volume':
      return `Trade $${Number(p.target_volume || 0).toLocaleString()} volume on ${sym}${side ? ' (' + side + ')' : ''}`;
    case 'positions':
      return `Open ${p.target_positions || 0} positions on ${sym}${side ? ' (' + side + ')' : ''}`;
    case 'combo_volume_attack':
      return `Trade $${Number(p.target_volume || 0).toLocaleString()} on ${sym} + win ${p.target_wins || 0} attacks`;
    case 'daily_trade_gold':
      return `Earn ${Number(p.target_gold || 0).toLocaleString()} gold from trading in ${p.window_hours || 24}h`;
    default: return '';
  }
}

function QuestCard({ task, onStart, onClaim, loading }) {
  const pct = task.target_value > 0 ? Math.min(1, task.progress_value / task.target_value) : 0;
  const isDone = task.target_value > 0 && task.progress_value >= task.target_value;
  const isClaimed = !!task.claimed_at;
  const canReClaim = isClaimed && task.repeatable;

  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <span style={S.cardTitle}>{task.title}</span>
        {isClaimed && !canReClaim && <span style={S.badgeDone}>Claimed</span>}
        {canReClaim && <span style={S.badgeRepeat}>Repeatable</span>}
      </div>
      {task.description && <div style={S.cardDesc}>{task.description}</div>}
      <div style={S.cardAuto}>{describeTask(task)}</div>

      {task.started && (
        <div style={S.progressWrap}>
          <div style={S.progressBar}>
            <div style={{ ...S.progressFill, width: `${pct * 100}%` }} />
          </div>
          <div style={S.progressText}>
            {fmtVal(task.progress_value, task.type)} / {fmtVal(task.target_value, task.type)}
          </div>
        </div>
      )}

      <div style={S.rewardRow}>
        <div style={S.rewards}>
          {task.reward_gold > 0 && (
            <span style={S.rewardGold}>
              +{task.reward_gold.toLocaleString()}
              <img src={goldIcon} alt="Gold" style={S.rewardIcon} />
            </span>
          )}
          {task.reward_wood > 0 && (
            <span style={S.rewardWood}>
              +{task.reward_wood.toLocaleString()}
              <img src={woodIcon} alt="Wood" style={S.rewardIcon} />
            </span>
          )}
          {task.reward_ore > 0 && (
            <span style={S.rewardOre}>
              +{task.reward_ore.toLocaleString()}
              <img src={stoneIcon} alt="Ore" style={S.rewardIcon} />
            </span>
          )}
        </div>

        {!task.started ? (
          <button style={S.btnStart} onClick={() => onStart(task.id)} disabled={loading}>Start</button>
        ) : isDone && !isClaimed ? (
          <button style={S.btnClaim} onClick={() => onClaim(task.id)} disabled={loading}>Claim</button>
        ) : canReClaim && isClaimed ? (
          <button style={S.btnStart} onClick={() => onStart(task.id)} disabled={loading}>Restart</button>
        ) : isClaimed ? (
          <span style={S.doneLabel}>✓</span>
        ) : (
          <button style={S.btnRefresh} onClick={() => onClaim(task.id)} disabled={loading}>Refresh</button>
        )}
      </div>
    </div>
  );
}

function QuestsTab() {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  const fetchTasks = useCallback(async () => {
    const token = window._playerToken;
    if (!token) return;
    try {
      const r = await fetch(`${GAME_API}/tasks`, { headers: { 'x-token': token } });
      if (!r.ok) throw new Error('status ' + r.status);
      const data = await r.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) { /* swallow */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    fetchTasks();
    const iv = setInterval(fetchTasks, 20000);
    return () => clearInterval(iv);
  }, [fetchTasks]);

  const handleStart = useCallback(async (id) => {
    const token = window._playerToken;
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${GAME_API}/tasks/${id}/start`, {
        method: 'POST',
        headers: { 'x-token': token, 'Content-Type': 'application/json' },
      });
      const j = await r.json();
      if (!r.ok) setError(j.error || 'Failed');
      await fetchTasks();
    } finally { setLoading(false); }
  }, [fetchTasks]);

  const handleClaim = useCallback(async (id) => {
    const token = window._playerToken;
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${GAME_API}/tasks/${id}/claim`, {
        method: 'POST',
        headers: { 'x-token': token, 'Content-Type': 'application/json' },
      });
      const j = await r.json();
      if (j.ok && j.completed) {
        setFlash(`+${(j.reward.gold || 0).toLocaleString()} Gold`);
        setTimeout(() => setFlash(null), 2500);
      } else if (j.ok === false) {
        setError('Not completed yet');
      } else if (!r.ok) {
        setError(j.error || 'Failed');
      }
      await fetchTasks();
    } finally { setLoading(false); }
  }, [fetchTasks]);

  if (!loaded) {
    return (
      <div style={{...S.empty, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12}}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid rgba(92,58,33,0.15)',
          borderTopColor: '#e8b830',
          animation: 'qt-spin 0.9s linear infinite',
        }} />
        <div style={S.emptyTitle}>Loading quests…</div>
        <style>{`@keyframes qt-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>⚔️</div>
        <div style={S.emptyTitle}>No quests available</div>
        <div style={S.emptyDesc}>Check back later for new quests from the admin.</div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      {flash && <div style={S.flash}>{flash}</div>}
      {error && <div style={S.error} onClick={() => setError(null)}>{error}</div>}
      {tasks.map(t => (
        <QuestCard key={t.id} task={t} onStart={handleStart} onClaim={handleClaim} loading={loading} />
      ))}
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3ebd1 100%)',
    border: '2px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex', flexDirection: 'column', gap: 8,
    boxShadow: '0 2px 4px rgba(92, 58, 33, 0.08)',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: 900, color: '#5C3A21' },
  cardDesc: { fontSize: 12, color: '#8a7252', fontWeight: 600 },
  cardAuto: { fontSize: 11, color: '#a3906a', fontStyle: 'italic', fontWeight: 600 },
  progressWrap: { display: 'flex', flexDirection: 'column', gap: 4 },
  progressBar: { height: 8, background: '#e4d9b8', borderRadius: 4, overflow: 'hidden', border: '1px solid #c4b894' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #e8b830 0%, #d49820 100%)', transition: 'width 0.3s' },
  progressText: { fontSize: 11, fontWeight: 700, color: '#5C3A21', textAlign: 'right' },
  rewardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 },
  rewards: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  rewardGold: { fontSize: 12, fontWeight: 900, color: '#b8860b', background: '#fff5cc', padding: '3px 8px', borderRadius: 6, border: '1px solid #e8b830', display: 'flex', alignItems: 'center', gap: 4 },
  rewardWood: { fontSize: 12, fontWeight: 900, color: '#4d7a2e', background: '#e8f5d8', padding: '3px 8px', borderRadius: 6, border: '1px solid #6ab344', display: 'flex', alignItems: 'center', gap: 4 },
  rewardOre: { fontSize: 12, fontWeight: 900, color: '#566878', background: '#dde5ea', padding: '3px 8px', borderRadius: 6, border: '1px solid #8a9aaa', display: 'flex', alignItems: 'center', gap: 4 },
  rewardIcon: { width: 16, height: 16, objectFit: 'contain' },

  btnStart: {
    padding: '6px 14px', background: 'linear-gradient(180deg, #6ab344 0%, #4d7a2e 100%)',
    color: '#fff', fontWeight: 900, fontSize: 12, border: '2px solid #3a5e22', borderRadius: 8,
    cursor: 'pointer', textShadow: '1px 1px 0 rgba(0,0,0,0.3)',
  },
  btnClaim: {
    padding: '6px 14px', background: 'linear-gradient(180deg, #e8b830 0%, #b8860b 100%)',
    color: '#fff', fontWeight: 900, fontSize: 12, border: '2px solid #8a5f00', borderRadius: 8,
    cursor: 'pointer', textShadow: '1px 1px 0 rgba(0,0,0,0.3)', animation: 'pulse-glow 1.5s infinite',
  },
  btnRefresh: {
    padding: '6px 14px', background: '#d4c8b0', color: '#5C3A21',
    fontWeight: 800, fontSize: 12, border: '2px solid #a3906a', borderRadius: 8, cursor: 'pointer',
  },
  doneLabel: { fontSize: 18, fontWeight: 900, color: '#6ab344' },
  badgeDone: { fontSize: 10, fontWeight: 800, color: '#4d7a2e', background: '#e8f5d8', padding: '2px 6px', borderRadius: 4, border: '1px solid #6ab344' },
  badgeRepeat: { fontSize: 10, fontWeight: 800, color: '#5C3A21', background: '#fff5cc', padding: '2px 6px', borderRadius: 4, border: '1px solid #e8b830' },
  empty: { textAlign: 'center', padding: 40, color: '#8a7252' },
  emptyIcon: { fontSize: 48, marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontWeight: 900, color: '#5C3A21', marginBottom: 6 },
  emptyDesc: { fontSize: 12, fontWeight: 600 },
  flash: { background: 'linear-gradient(180deg, #e8b830 0%, #b8860b 100%)', color: '#fff', fontWeight: 900, textAlign: 'center', padding: 10, borderRadius: 8, textShadow: '1px 1px 0 rgba(0,0,0,0.3)' },
  error: { background: '#fee', border: '2px solid #c33', color: '#c33', padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' },
};

export default memo(QuestsTab);
