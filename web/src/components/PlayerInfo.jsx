import { memo, useEffect, useState } from 'react';
import { usePlayer, useBuildingDefs } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { colors } from '../styles/theme';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

const formatNumber = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

function activateOnKeyboard(event, action) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.stopPropagation();
  action?.();
}

function formatShieldRemaining(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin >= 60) {
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (totalMin > 0) return `${totalMin}m`;
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${sec}s`;
}

function PlayerInfo({ onOpenProfile, onOpenLeaderboard }) {
  const playerState = usePlayer();
  const { buildingDefs } = useBuildingDefs();
  const { isMobile: mobile, isLandscape } = useLayout();
  const [now, setNow] = useState(() => Date.now());

  const shieldEndMs = playerState?.shield_until
    ? new Date(playerState.shield_until + 'Z').getTime()
    : 0;
  const shieldRemainingMs = shieldEndMs ? shieldEndMs - now : 0;
  const shieldActive = shieldRemainingMs > 0;

  useEffect(() => {
    if (!shieldActive) return;
    // Tick every 30s — minute resolution is enough for the chip and we save
    // re-renders. Drops to 1s in the final minute so the countdown reads live.
    const tickMs = shieldRemainingMs <= 60_000 ? 1000 : 30_000;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [shieldActive, shieldRemainingMs]);

  if (!playerState) return null;

  const townHallLevel = buildingDefs?.th_level || 1;
  const thProgress = buildingDefs?.th_progress || 0;
  const thTotal = buildingDefs?.th_progress_total || 0;
  const progressPct = thTotal > 0 ? Math.min(100, (thProgress / thTotal) * 100) : 0;

  return (
    <div
      style={{ ...styles.wrap, ...(mobile ? { top: 8, left: 8, gap: 8 } : {}) }}
    >
      <div
        style={styles.levelCircleContainer}
        onClick={onOpenProfile}
        onKeyDown={(event) => activateOnKeyboard(event, onOpenProfile)}
        role="button"
        tabIndex={0}
        aria-label="Open profile"
      >
        <div style={{
          ...styles.levelCircle,
          ...(mobile ? { width: 48, height: 48, borderRadius: 10, padding: 5 } : {}),
          background: `conic-gradient(from -90deg, var(--terminal-surface) ${progressPct * 3.6}deg, #1a1a1a ${progressPct * 3.6}deg)`,
        }}>
          <div style={{ ...styles.innerSquare, ...(mobile ? { borderRadius: 7 } : {}) }}>
            <span style={{ ...styles.levelText, ...(mobile ? { fontSize: 24 } : {}) }}>{townHallLevel}</span>
          </div>
        </div>
      </div>

      <div style={styles.infoStack}>
        {playerState.player_name && (
          <span
            style={{ ...styles.name, ...(mobile ? { fontSize: 18 } : {}) }}
            onClick={onOpenProfile}
            onKeyDown={(event) => activateOnKeyboard(event, onOpenProfile)}
            role="button"
            tabIndex={0}
            aria-label="Open profile"
          >
            {playerState.player_name}
          </span>
        )}

        <div style={styles.trophyRow}>
          <div
            style={styles.trophyContainer}
            onClick={(event) => { event.stopPropagation(); onOpenLeaderboard?.(); }}
            onKeyDown={(event) => activateOnKeyboard(event, onOpenLeaderboard)}
            role="button"
            tabIndex={0}
            aria-label="Open leaderboard"
          >
            <div style={styles.trophyBox}>
              <img src={trophyIcon} alt="trophy" style={styles.trophyImg} />
            </div>
            <div style={styles.trophyBar}>
              <span style={styles.trophiesText}>
                {formatNumber(playerState.trophies)}
              </span>
            </div>
          </div>

          {shieldActive && (
            <div
              style={styles.shieldChip}
              title={`Shield protects your base for ${formatShieldRemaining(shieldRemainingMs)}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={styles.shieldChipIcon}>
                <path d="M12 2 L20 5 L20 12 C20 17 16 21 12 22 C8 21 4 17 4 12 L4 5 Z" fill="var(--terminal-surface)" stroke="var(--terminal-info)" strokeWidth="2" />
                <path d="M9 12 L11 14 L15 9" stroke="var(--terminal-info)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span style={styles.shieldChipText}>{formatShieldRemaining(shieldRemainingMs)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(PlayerInfo);

const styles = {
  wrap: {
    position: 'fixed',
    top: 16,
    left: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    pointerEvents: 'auto',
    zIndex: 10,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  levelCircleContainer: {
    position: 'relative',
    zIndex: 2,
    cursor: 'pointer',
  },
  levelCircle: {
    width: 68,
    height: 68,
    borderRadius: 14,
    background: '#1a1a1a',
    border: '3.5px solid #0a0a0a',
    boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.34), 0 0 0 2px rgba(255,255,255,0.86), 0 5px 12px rgba(0,0,0,0.62)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 7,
  },
  innerSquare: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    background: 'linear-gradient(180deg, #5899ff 0%, #3d86ef 100%)',
    border: '2.5px solid #0a0a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: 'inset 0 2px 3px var(--terminal-chip-overlay), 0 2px 4px rgba(0,0,0,0.3)',
  },
  levelText: {
    color: 'var(--terminal-on-accent)',
    fontSize: 34,
    fontWeight: 700,
    textShadow: 'none',
    zIndex: 2,
    transform: 'translateY(-1px)',
    letterSpacing: '-1px',
  },
  infoStack: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 2,
  },
  name: {
    color: 'var(--terminal-on-accent)',
    fontSize: 24,
    fontWeight: 700,
    textShadow: 'none',
    marginLeft: 4,
    letterSpacing: '0.5px',
    cursor: 'pointer',
  },
  trophyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 4,
  },
  trophyContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: 40,
  },
  shieldChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    height: 26,
    padding: '0 9px 0 7px',
    borderRadius: 13,
    background: 'linear-gradient(180deg, #5cabff 0%, #2c6ed8 100%)',
    border: '1px solid #0a0a0a',
    boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.45), 0 2px 4px rgba(0,0,0,0.45)',
    color: 'var(--terminal-on-accent)',
    fontWeight: 700,
    fontSize: 12,
    textShadow: 'none',
    letterSpacing: 0.3,
    pointerEvents: 'auto',
    cursor: 'help',
  },
  shieldChipIcon: {
    flexShrink: 0,
    filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
  },
  shieldChipText: {
    lineHeight: 1,
  },
  trophyBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: 'linear-gradient(180deg, #ffa22a 0%, #d87b1c 100%)',
    border: '2.5px solid #1a1a1a',
    boxShadow: 'inset 0 1.5px 1px rgba(255, 255, 255, 0.7), 0 3px 4px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    position: 'relative',
  },
  trophyImg: {
    width: '75%',
    height: '75%',
    objectFit: 'contain',
    filter: 'invert(88%) sepia(87%) saturate(2224%) hue-rotate(334deg) brightness(105%) contrast(106%) drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
  },
  trophyBar: {
    height: 26,
    minWidth: 80,
    background: 'rgba(0, 0, 0, 0.35)',
    border: '1.5px solid #1a1a1a',
    borderRadius: '0 6px 6px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
    padding: '0 12px 0 12px',
    zIndex: 2,
    boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
  },
  trophiesText: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--terminal-on-accent)',
    textShadow: 'none',
    letterSpacing: '0.5px',
    width: '100%',
    textAlign: 'center',
  },
};
