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
          ...(mobile ? { width: 48, height: 48, borderRadius: 16, padding: 4 } : {}),
          background: `conic-gradient(from -90deg, var(--terminal-orange) ${progressPct * 3.6}deg, var(--terminal-surface-muted) ${progressPct * 3.6}deg)`,
        }}>
          <div style={{ ...styles.innerSquare, ...(mobile ? { borderRadius: 12 } : {}) }}>
            <span style={{ ...styles.levelText, ...(mobile ? { fontSize: 22 } : {}) }}>{townHallLevel}</span>
          </div>
        </div>
      </div>

      <div style={styles.infoStack}>
        {playerState.player_name && (
          <span
            style={{ ...styles.name, ...(mobile ? { fontSize: 15 } : {}) }}
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
                <path d="M12 2 L20 5 L20 12 C20 17 16 21 12 22 C8 21 4 17 4 12 L4 5 Z" fill="none" stroke="var(--terminal-info)" strokeWidth="2" />
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

const hudSurface = 'rgba(17,20,27,0.95)';

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
    fontFamily: 'inherit',
  },
  levelCircleContainer: {
    position: 'relative',
    zIndex: 2,
    cursor: 'pointer',
  },
  levelCircle: {
    width: 68,
    height: 68,
    boxSizing: 'border-box',
    borderRadius: 16,
    background: 'var(--terminal-surface-muted)',
    border: '1px solid var(--terminal-border)',
    boxShadow: 'var(--terminal-shadow-card)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 5,
  },
  innerSquare: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    borderRadius: 12,
    background: hudSurface,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  levelText: {
    color: 'var(--terminal-text)',
    fontSize: 28,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textShadow: 'none',
    zIndex: 2,
    letterSpacing: '-0.02em',
  },
  infoStack: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 6,
  },
  name: {
    color: 'var(--terminal-text)',
    fontSize: 18,
    fontWeight: 600,
    textShadow: 'none',
    letterSpacing: 0,
    cursor: 'pointer',
    background: hudSurface,
    border: '1px solid var(--terminal-border)',
    borderRadius: 999,
    padding: '4px 12px',
    lineHeight: 1.2,
  },
  trophyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  trophyContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 40,
    boxSizing: 'border-box',
    padding: '0 14px 0 4px',
    borderRadius: 999,
    background: hudSurface,
    border: '1px solid var(--terminal-border)',
    cursor: 'pointer',
  },
  shieldChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 28,
    boxSizing: 'border-box',
    padding: '0 10px 0 8px',
    borderRadius: 999,
    background: 'var(--terminal-info-soft)',
    border: '1px solid var(--terminal-info-border)',
    color: 'var(--terminal-info)',
    fontWeight: 600,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    textShadow: 'none',
    letterSpacing: 0,
    pointerEvents: 'auto',
    cursor: 'help',
  },
  shieldChipIcon: {
    flexShrink: 0,
  },
  shieldChipText: {
    lineHeight: 1,
  },
  trophyBox: {
    width: 30,
    height: 30,
    borderRadius: 999,
    background: 'var(--terminal-surface-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    position: 'relative',
    flexShrink: 0,
  },
  trophyImg: {
    width: '65%',
    height: '65%',
    objectFit: 'contain',
    filter: 'invert(88%) sepia(87%) saturate(2224%) hue-rotate(334deg) brightness(105%) contrast(106%)',
  },
  trophyBar: {
    minWidth: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  trophiesText: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--terminal-text)',
    fontVariantNumeric: 'tabular-nums',
    textShadow: 'none',
    letterSpacing: 0,
    width: '100%',
    textAlign: 'center',
  },
};
