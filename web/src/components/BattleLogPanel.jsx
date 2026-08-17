import { memo, useState, useEffect, useCallback } from 'react';
import { useSend, usePlayer } from '../hooks/useGodot';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';
import { uiButton, uiIconButton } from '../styles/theme';

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

  const handleFilterWheel = useCallback((event) => {
    const row = event.currentTarget;
    if (row.scrollWidth <= row.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    row.scrollLeft += delta;
    if (event.cancelable) event.preventDefault();
  }, []);

  const handleFilterKeyDown = useCallback((event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const keys = ['all', 'attack', 'defense'];
    const currentIndex = Math.max(0, keys.indexOf(filter));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? keys.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
    const next = keys[nextIndex];
    setFilter(next);
    event.currentTarget.parentElement?.querySelector(`[data-filter="${next}"]`)?.focus();
  }, [filter]);

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
      <style>{`
        .battle-log-summary:focus-visible,
        .battle-log-tab:focus-visible,
        .battle-log-close:focus-visible {
          outline: 3px solid var(--terminal-info);
          outline-offset: -3px;
        }
        .battle-log-opponent-name {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        @media (max-width: 360px) {
          .battle-log-modal { border-radius: 16px !important; }
          .battle-log-body { padding: 8px !important; }
          .battle-log-card { padding: 9px 8px !important; }
          .battle-log-summary-grid { column-gap: 7px !important; }
          .battle-log-side-badge {
            padding-inline: 6px !important;
            font-size: 9px !important;
          }
          .battle-log-trophy-value { font-size: 13px !important; }
          .battle-log-detail-row {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 2px !important;
          }
          .battle-log-detail-value { text-align: left !important; }
        }
      `}</style>
      <div style={S.backdrop} onClick={onClose} />
      <div className="battle-log-modal" style={S.modal} role="dialog" aria-modal="true" aria-labelledby="battle-log-title">
        <div style={S.header}>
          <span id="battle-log-title" style={S.headerTitle}>Battle Log</span>
          <button className="battle-log-close" type="button" style={S.closeBtn} onClick={onClose} aria-label="Close battle log">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div
          className="battle-log-filter-row clash-scroll-hidden"
          style={S.filterRow}
          role="tablist"
          aria-label="Battle log filters"
          onWheel={handleFilterWheel}
        >
          {[['all', 'All'], ['attack', 'My Attacks'], ['defense', 'Defenses']].map(([key, label]) => (
            <button
              className="battle-log-tab"
              key={key}
              type="button"
              role="tab"
              data-filter={key}
              aria-selected={filter === key}
              aria-controls="battle-log-results"
              tabIndex={filter === key ? 0 : -1}
              style={S.filterTab(filter === key)}
              onClick={() => setFilter(key)}
              onKeyDown={handleFilterKeyDown}
            >
              {label}
            </button>
          ))}
        </div>

        <div id="battle-log-results" className="battle-log-body clash-scroll" style={S.body} role="tabpanel" tabIndex="0" aria-label="Battle log entries">
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
            let badgeText, relationText;
            if (isAttack) {
              badgeText = isVictory ? 'VICTORY' : 'DEFEAT';
              relationText = 'vs';
            } else {
              badgeText = isVictory ? 'RAIDED' : 'DEFENDED';
              relationText = 'by';
            }
            const opponentName = String(b.opponent_name || 'Unknown player');
            const detailsId = `battle-log-details-${String(b.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
            const isPositiveResult = (isAttack && isVictory) || (!isAttack && !isVictory);
            const trophyDelta = isPositiveResult ? 30 : -15;

            return (
              <article key={b.id} className="battle-log-card" style={{
                ...S.card,
                borderColor: 'var(--terminal-border)',
                borderLeftWidth: 4,
                borderLeftColor: isPositiveResult ? 'var(--terminal-long)' : 'var(--terminal-short)',
              }}>
                <button
                  className="battle-log-summary"
                  type="button"
                  style={S.summaryButton}
                  aria-expanded={isExpanded}
                  aria-controls={detailsId}
                  aria-label={`${badgeText}, ${relationText} ${opponentName}, ${timeAgo(b.created_at)}, trophy change ${trophyDelta > 0 ? 'plus ' : 'minus '}${Math.abs(trophyDelta)}`}
                  onClick={() => setExpanded(isExpanded ? null : b.id)}
                >
                  <div className="battle-log-summary-grid" style={S.summaryGrid}>
                  <span className="battle-log-side-badge" style={S.sideBadge(isPositiveResult)}>
                    {badgeText}
                  </span>
                  <div style={S.cardInfo}>
                    <span style={S.opponentLine}>
                      <span style={S.relationText} aria-hidden="true">{relationText}</span>
                      <span
                        className="battle-log-opponent-name"
                        style={S.opponentName}
                        title={opponentName}
                      >
                        {opponentName}
                      </span>
                    </span>
                    <span style={S.time}>{timeAgo(b.created_at)}</span>
                  </div>
                  <div style={S.trophyTotal}>
                    <img src={trophyIcon} alt="" style={S.trophyMini} />
                    <span className="battle-log-trophy-value" aria-hidden="true" style={{ color: isPositiveResult ? 'var(--terminal-warning)' : 'var(--terminal-short)', fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                      {trophyDelta > 0 ? `+${trophyDelta}` : trophyDelta}
                    </span>
                  </div>
                  </div>
                </button>

                {isExpanded && (
                  <div id={detailsId} style={S.details}>
                    {totalLoot > 0 && b.loot && (
                      <div className="battle-log-detail-row" style={S.detailRow}>
                        <span style={S.detailLabel}>{isAttack ? 'Looted' : 'Stolen'}</span>
                        <span className="battle-log-detail-value" style={S.detailVal}>
                          {b.loot.gold > 0 && <span style={{ color: '#e8b830' }}>{fmt(b.loot.gold)} gold </span>}
                          {b.loot.wood > 0 && <span style={{ color: '#6ab344' }}>{fmt(b.loot.wood)} wood </span>}
                          {b.loot.ore > 0 && <span style={{ color: '#8a9aaa' }}>{fmt(b.loot.ore)} ore</span>}
                        </span>
                      </div>
                    )}
                    {thDmg != null && (
                      <div className="battle-log-detail-row" style={S.detailRow}>
                        <span style={S.detailLabel}>Town Hall damage</span>
                        <span className="battle-log-detail-value" style={{ ...S.detailVal, color: thDmg > 50 ? 'var(--terminal-short)' : 'var(--terminal-text-muted)' }}>{thDmg}%</span>
                      </div>
                    )}
                    {b.buildings_destroyed > 0 && (
                      <div className="battle-log-detail-row" style={S.detailRow}>
                        <span style={S.detailLabel}>Buildings destroyed</span>
                        <span className="battle-log-detail-value" style={S.detailVal}>{b.buildings_destroyed}</span>
                      </div>
                    )}
                    {b.duration > 0 && (
                      <div className="battle-log-detail-row" style={S.detailRow}>
                        <span style={S.detailLabel}>Duration</span>
                        <span className="battle-log-detail-value" style={S.detailVal}>{Math.round(b.duration)}s</span>
                      </div>
                    )}
                    {b.replay_data && (() => {
                      const { ships, troops } = countReplayTroops(b.replay_data);
                      if (ships.length === 0) return null;
                      const troopText = Object.entries(troops).map(([t, c]) => `${t} x${c}`).join(', ');
                      return (
                        <>
                          <div className="battle-log-detail-row" style={S.detailRow}>
                            <span style={S.detailLabel}>Ships</span>
                            <span className="battle-log-detail-value" style={S.detailVal}>{ships.length}</span>
                          </div>
                          <div className="battle-log-detail-row" style={S.detailRow}>
                            <span style={S.detailLabel}>Troops</span>
                            <span className="battle-log-detail-value" style={S.detailVal}>{troopText || '-'}</span>
                          </div>
                        </>
                      );
                    })()}
                    {b.replay_data && b.buildings_snapshot && (
                      <div style={S.actionRow}>
                        <button
                          type="button"
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
              </article>
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
    width: 'min(440px, calc(100dvw - 16px))', maxHeight: 'calc(100dvh - 16px)', boxSizing: 'border-box',
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 20,
    boxShadow: '0 8px 18px rgba(0,0,0,0.34)', display: 'flex', flexDirection: 'column',
    zIndex: 201, pointerEvents: 'auto', overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: 'var(--terminal-border)', borderBottom: '1px solid var(--terminal-border-strong)',
  },
  headerTitle: { fontSize: 18, fontWeight: 700, color: 'var(--terminal-text)' },
  closeBtn: uiIconButton('danger', 44),
  filterRow: {
    display: 'flex', gap: 0, overflowX: 'auto', overscrollBehaviorX: 'contain', touchAction: 'pan-x',
    background: 'var(--terminal-surface-subtle)', flexShrink: 0,
  },
  filterTab: (active) => ({
    flex: '1 0 100px', minHeight: 44, padding: '8px 10px', border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    background: active ? 'var(--terminal-surface)' : 'var(--terminal-surface-subtle)',
    color: active ? 'var(--terminal-text)' : 'var(--terminal-text-muted)',
    boxShadow: active ? 'inset 0 -3px 0 var(--terminal-orange)' : 'none',
  }),
  body: {
    flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
    minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
  },
  revengeMessage: {
    background: 'var(--terminal-short-soft)',
    border: '1px solid #d8715b',
    color: '#9b2c21',
    borderRadius: 8,
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 700,
  },
  revengeBtn: (disabled) => ({
    ...uiButton(disabled ? 'neutral' : 'primary', { minHeight: 44, padding: '8px 12px' }),
    flex: '0 0 112px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  empty: { textAlign: 'center', padding: 40, color: 'var(--terminal-text-muted)', fontWeight: 700, fontSize: 14 },
  card: {
    background: 'var(--terminal-surface-subtle)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--terminal-border)',
    borderRadius: 12,
    padding: '10px 12px',
    boxSizing: 'border-box', minWidth: 0, overflow: 'hidden', flex: '0 0 auto',
    boxShadow: '0 2px 4px rgba(0,0,0,0.16)',
  },
  summaryButton: {
    display: 'block', width: '100%', minWidth: 0, minHeight: 44, padding: 0, margin: 0,
    border: 'none', borderRadius: 8, background: 'transparent', color: 'inherit',
    font: 'inherit', textAlign: 'left', cursor: 'pointer',
  },
  summaryGrid: {
    display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr) max-content',
    alignItems: 'center', columnGap: 10, width: '100%', minWidth: 0,
  },
  sideBadge: (isPositiveResult) => ({
    padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
    background: isPositiveResult ? 'var(--terminal-long)' : 'var(--terminal-short)',
    color: 'var(--terminal-on-accent)', textShadow: 'none', flexShrink: 0,
  }),
  cardInfo: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
  opponentLine: { display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', alignItems: 'start', gap: 4, minWidth: 0 },
  relationText: { fontSize: 14, lineHeight: 1.25, fontWeight: 700, color: 'var(--terminal-text-secondary)' },
  opponentName: { minWidth: 0, fontSize: 14, lineHeight: 1.25, fontWeight: 700, color: 'var(--terminal-text)', overflowWrap: 'anywhere' },
  time: { fontSize: 11, fontWeight: 700, color: 'var(--terminal-text-muted)' },
  trophyTotal: { display: 'flex', alignItems: 'center', gap: 3, minWidth: 'max-content', whiteSpace: 'nowrap', justifySelf: 'end' },
  trophyMini: { width: 16, height: 16, objectFit: 'contain', filter: 'invert(60%) sepia(90%) saturate(500%) hue-rotate(10deg)' },
  details: {
    marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--terminal-border)',
    display: 'flex', flexDirection: 'column', gap: 5,
  },
  detailRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', alignItems: 'start', gap: 8, minWidth: 0 },
  detailLabel: { minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--terminal-text-secondary)', overflowWrap: 'anywhere' },
  detailVal: { minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)', textAlign: 'right', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  actionRow: {
    marginTop: 6,
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
  },
  watchBtn: {
    ...uiButton('info', { minHeight: 44, padding: '8px 12px' }),
    flex: 1,
    minWidth: 0,
  },
};
