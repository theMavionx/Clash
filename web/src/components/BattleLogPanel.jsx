import { memo, useState, useEffect, useCallback } from 'react';
import { useSend, usePlayer } from '../hooks/useGodot';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

const fmt = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

const TROOP_LABELS = {
  knight: 'Knight',
  mage: 'Mage',
  barbarian: 'Barbarian',
  archer: 'Archer',
  peashooter: 'Pea Shooter',
  pea_shooter: 'Pea Shooter',
  'pea-shooter': 'Pea Shooter',
  ranger: 'Ranger',
  windmage: 'Wind Mage',
  wind_mage: 'Wind Mage',
  'wind-mage': 'Wind Mage',
  demonking: 'Demon King',
  demon_king: 'Demon King',
};

function normalizeTroopName(name) {
  const raw = String(name || '').split(':')[0].trim();
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  if (raw === '_SLOT_FILLER_') return null;
  return TROOP_LABELS[raw.toLowerCase()] || raw;
}

function troopsForReplayShip(ship) {
  if (!ship) return [];
  if (Array.isArray(ship.troops)) {
    return ship.troops.map(normalizeTroopName).filter(Boolean);
  }
  const legacy = normalizeTroopName(ship.troopType);
  return legacy ? [legacy] : [];
}

function countReplayTroops(replayData) {
  const ships = (Array.isArray(replayData) ? replayData : []).filter(a => a.type === 'place_ship');
  const troops = {};
  ships.forEach((ship) => {
    troopsForReplayShip(ship).forEach((troop) => {
      troops[troop] = (troops[troop] || 0) + 1;
    });
  });
  return { ships, troops };
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const then = new Date(dateStr + 'Z');
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function BattleLogPanel({ onClose }) {
  const { sendToGodot } = useSend();
  const player = usePlayer();
  const token = player?.token || null;
  const [battles, setBattles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revengeTargets, setRevengeTargets] = useState([]);
  const [revengeLoading, setRevengeLoading] = useState(true);
  const [revengeMessage, setRevengeMessage] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'attack' | 'defense'

  const handleWatchReplay = useCallback((battle) => {
    if (!battle.replay_data || !battle.buildings_snapshot) return;
    const replayLabel = battle.replay_data?.[0]?.ai_agent ? 'AI AGENT ATTACK' : '';
    // Close panel first (unpauses tree), then send replay after a tick
    onClose();
    setTimeout(() => {
      sendToGodot('watch_replay', {
        replay_data: battle.replay_data,
        buildings_snapshot: battle.buildings_snapshot,
        attacker_name: battle.attacker_name || battle.opponent_name,
        base_owner_name: battle.defender_name || battle.opponent_name,
        duration: battle.duration || 0,
        replay_label: replayLabel,
        replay_result: {
          type: battle.result === 'victory' ? 'victory' : 'defeat',
          loot: battle.loot || null,
          opponent_name: battle.opponent_name || battle.defender_name || battle.attacker_name || '',
          duration: battle.duration || 0,
        },
      });
    }, 100);
  }, [sendToGodot, onClose]);

  const handleRevenge = useCallback((target) => {
    if (!target?.can_revenge) {
      setRevengeMessage(target?.reason === 'shield_active'
        ? 'This player is protected by shield.'
        : 'Revenge already used for this attack.');
      return;
    }
    onClose();
    setTimeout(() => {
      sendToGodot('revenge_attack', { battle_id: target.battle_id });
    }, 100);
  }, [sendToGodot, onClose]);

  // Fetch battle log keyed on the reactive token. If an account-switch
  // happens while this panel is open, the cleanup flag prevents the old
  // account's response from landing on the new user's UI; the token
  // dependency re-runs the effect under the new identity.
  useEffect(() => {
    if (!token) {
      setBattles([]);
      setRevengeTargets([]);
      setLoading(false);
      setRevengeLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setRevengeLoading(true);
    setRevengeMessage('');
    (async () => {
      try {
        const [r, revengeRes] = await Promise.all([
          fetch('/api/battle-log', { headers: { 'x-token': token } }),
          fetch('/api/revenge-targets', { headers: { 'x-token': token } }),
        ]);
        if (cancelled) return;
        if (r.ok) {
          const data = await r.json();
          if (!cancelled) setBattles(Array.isArray(data) ? data : []);
        } else {
          setBattles([]);
        }
        if (revengeRes.ok) {
          const revengeData = await revengeRes.json();
          if (!cancelled) setRevengeTargets(Array.isArray(revengeData?.targets) ? revengeData.targets : []);
        } else {
          setRevengeTargets([]);
        }
      } catch { /* network error; fall through to loading=false */ }
      finally {
        if (!cancelled) {
          setLoading(false);
          setRevengeLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const filtered = filter === 'all' ? battles : battles.filter(b => b.side === filter);
  const getRevengeTargetForBattle = useCallback((battle) => {
    if (!battle || battle.side !== 'defense') return null;
    const battleId = Number(battle.id);
    return revengeTargets.find((target) => Number(target.battle_id) === battleId) || null;
  }, [revengeTargets]);

  return (
    <>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.modal}>
        <div style={S.header}>
          <span style={S.headerTitle}>Battle Log</span>
          <button style={S.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div style={S.filterRow}>
          {[['all', 'All'], ['attack', 'My Attacks'], ['defense', 'Defenses']].map(([key, label]) => (
            <button key={key} style={S.filterTab(filter === key)} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        <div style={S.body}>
          {loading && <div style={S.empty}>Loading...</div>}
          {!loading && filtered.length === 0 && (
            <div style={S.empty}>No battles yet</div>
          )}

          {filtered.map((b) => {
            const isAttack = b.side === 'attack';
            const isVictory = b.result === 'victory';
            const isExpanded = expanded === b.id;
            const totalLoot = (b.loot?.gold || 0) + (b.loot?.wood || 0) + (b.loot?.ore || 0);
            const thDmg = b.th_hp_pct != null ? Math.round((1 - b.th_hp_pct) * 100) : null;
            const revengeTarget = getRevengeTargetForBattle(b);
            const revengeDisabled = revengeLoading || !revengeTarget?.can_revenge;
            const revengeLabel = revengeLoading
              ? 'Checking...'
              : revengeTarget?.reason === 'shield_active'
                ? `Shield ${revengeTarget.shield_remaining_minutes || 1}m`
                : revengeTarget?.reason === 'revenge_used'
                  ? 'Used'
                  : revengeTarget
                    ? 'Revenge'
                    : '';

            // Badge logic
            let badgeText, badgeDesc;
            if (isAttack) {
              badgeText = isVictory ? 'VICTORY' : 'DEFEAT';
              badgeDesc = `vs ${b.opponent_name}`;
            } else {
              badgeText = isVictory ? 'RAIDED' : 'DEFENDED';
              badgeDesc = `by ${b.opponent_name}`;
            }

            return (
              <div key={b.id} style={{
                ...S.card,
                borderColor: isAttack ? '#5b9bd5' : '#d4c8b0',
                borderLeftWidth: 4,
                borderLeftColor: isAttack ? '#3b7dd8' : '#E53935',
              }} onClick={() => setExpanded(isExpanded ? null : b.id)}>
                <div style={S.cardRow}>
                  <div style={S.sideBadge(isAttack, isVictory)}>
                    {badgeText}
                  </div>
                  <div style={S.cardInfo}>
                    <span style={S.opponentName}>{badgeDesc}</span>
                    <span style={S.time}>{timeAgo(b.created_at)}</span>
                  </div>
                  <div style={S.trophyTotal}>
                    <img src={trophyIcon} alt="" style={S.trophyMini} />
                    <span style={{ color: (isAttack && isVictory) || (!isAttack && !isVictory) ? '#b45309' : '#E53935', fontWeight: 900, fontSize: 14 }}>
                      {(isAttack && isVictory) || (!isAttack && !isVictory) ? '+30' : '-15'}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={S.details}>
                    {totalLoot > 0 && b.loot && (
                      <div style={S.detailRow}>
                        <span style={S.detailLabel}>{isAttack ? 'Looted' : 'Stolen'}</span>
                        <span style={S.detailVal}>
                          {b.loot.gold > 0 && <span style={{ color: '#e8b830' }}>{fmt(b.loot.gold)} gold </span>}
                          {b.loot.wood > 0 && <span style={{ color: '#6ab344' }}>{fmt(b.loot.wood)} wood </span>}
                          {b.loot.ore > 0 && <span style={{ color: '#8a9aaa' }}>{fmt(b.loot.ore)} ore</span>}
                        </span>
                      </div>
                    )}
                    {thDmg != null && (
                      <div style={S.detailRow}>
                        <span style={S.detailLabel}>Town Hall damage</span>
                        <span style={{ ...S.detailVal, color: thDmg > 50 ? '#E53935' : '#a3906a' }}>{thDmg}%</span>
                      </div>
                    )}
                    {b.buildings_destroyed > 0 && (
                      <div style={S.detailRow}>
                        <span style={S.detailLabel}>Buildings destroyed</span>
                        <span style={S.detailVal}>{b.buildings_destroyed}</span>
                      </div>
                    )}
                    {b.duration > 0 && (
                      <div style={S.detailRow}>
                        <span style={S.detailLabel}>Duration</span>
                        <span style={S.detailVal}>{Math.round(b.duration)}s</span>
                      </div>
                    )}
                    {b.replay_data && (() => {
                      const { ships, troops } = countReplayTroops(b.replay_data);
                      if (ships.length === 0) return null;
                      const troopText = Object.entries(troops).map(([t, c]) => `${t} x${c}`).join(', ');
                      return (
                        <>
                          <div style={S.detailRow}>
                            <span style={S.detailLabel}>Ships</span>
                            <span style={S.detailVal}>{ships.length}</span>
                          </div>
                          <div style={S.detailRow}>
                            <span style={S.detailLabel}>Troops</span>
                            <span style={S.detailVal}>{troopText || '-'}</span>
                          </div>
                        </>
                      );
                    })()}
                    {b.replay_data && b.buildings_snapshot && (
                      <div style={S.actionRow}>
                        <button
                          style={S.watchBtn}
                          onClick={(e) => { e.stopPropagation(); handleWatchReplay(b); }}
                        >
                          Watch Replay
                        </button>
                        {!isAttack && revengeLabel && (
                          <button
                            type="button"
                            style={S.revengeBtn(revengeDisabled)}
                            disabled={revengeDisabled}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRevenge(revengeTarget);
                            }}
                          >
                            {revengeLabel}
                          </button>
                        )}
                      </div>
                    )}
                    {!isAttack && revengeMessage && revengeTarget && (
                      <div style={S.revengeMessage}>{revengeMessage}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default memo(BattleLogPanel);

const S = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, pointerEvents: 'auto' },
  modal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 380, maxHeight: '85vh', background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 24,
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
  filterRow: {
    display: 'flex', gap: 0, borderBottom: '3px solid #d4c8b0',
  },
  filterTab: (active) => ({
    flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 800,
    background: active ? '#fdf8e7' : '#e8dfc8',
    color: active ? '#5C3A21' : '#a3906a',
    borderBottom: active ? '3px solid #5C3A21' : '3px solid transparent',
    marginBottom: -3,
  }),
  body: {
    flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
    overflowY: 'auto', scrollbarWidth: 'none',
  },
  revengeMessage: {
    background: '#f8d6ca',
    border: '2px solid #d8715b',
    color: '#9b2c21',
    borderRadius: 8,
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 900,
  },
  revengeBtn: (disabled) => ({
    flex: '0 0 112px',
    height: 42,
    borderRadius: 9,
    border: `2px solid ${disabled ? '#9d9278' : '#8d421e'}`,
    background: disabled
      ? 'linear-gradient(180deg, #d2c6ad 0%, #b6a78a 100%)'
      : 'linear-gradient(180deg, #ffb13d 0%, #e65f1c 100%)',
    color: disabled ? '#6f6047' : '#fff',
    fontSize: 11,
    fontWeight: 950,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textShadow: disabled ? 'none' : '0 1px 1px rgba(0,0,0,0.35)',
  }),
  empty: { textAlign: 'center', padding: 40, color: '#a3906a', fontWeight: 700, fontSize: 14 },
  card: {
    background: '#e8dfc8',
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: '#d4c8b0',
    borderRadius: 12,
    padding: '10px 12px',
    cursor: 'pointer', transition: 'background 0.15s',
  },
  cardRow: { display: 'flex', alignItems: 'center', gap: 10 },
  sideBadge: (isAttack, isVictory) => ({
    padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 900, letterSpacing: '0.5px',
    background: isAttack
      ? (isVictory ? '#3b7dd8' : '#6a8cba')
      : (isVictory ? '#E53935' : '#43A047'),
    color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.3)', flexShrink: 0,
  }),
  cardInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 1 },
  opponentName: { fontSize: 14, fontWeight: 900, color: '#5C3A21' },
  time: { fontSize: 11, fontWeight: 700, color: '#a3906a' },
  trophyTotal: { display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 },
  trophyMini: { width: 16, height: 16, objectFit: 'contain', filter: 'invert(60%) sepia(90%) saturate(500%) hue-rotate(10deg)' },
  details: {
    marginTop: 8, paddingTop: 8, borderTop: '2px solid #d4c8b0',
    display: 'flex', flexDirection: 'column', gap: 5,
  },
  detailRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 12, fontWeight: 700, color: '#77573d' },
  detailVal: { fontSize: 12, fontWeight: 900, color: '#5C3A21' },
  actionRow: {
    marginTop: 6,
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
  },
  watchBtn: {
    flex: 1,
    minWidth: 0,
    padding: '8px 0',
    background: 'linear-gradient(180deg, #74c4ff 0%, #3ba4f4 100%)',
    border: '2px solid #1a6fb5', borderRadius: 8,
    color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 3px 6px rgba(0,0,0,0.3)',
  },
};
