import { memo } from 'react';
import { usePlayer, useBuilding } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { colors } from '../styles/theme';
import { useDex, DexBadge } from '../contexts/DexContext';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

const formatNumber = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

function PlayerInfo({ onOpenProfile, onOpenLeaderboard }) {
  const playerState = usePlayer();
  const { buildingDefs } = useBuilding();
  const { isMobile: mobile, isLandscape } = useLayout();
  const { dex } = useDex();
  if (!playerState) return null;

  const townHallLevel = buildingDefs?.th_level || 1;
  const thProgress = buildingDefs?.th_progress || 0;
  const thTotal = buildingDefs?.th_progress_total || 0;
  const progressPct = thTotal > 0 ? Math.min(100, (thProgress / thTotal) * 100) : 0;

  return (
    <div style={{ ...styles.wrap, ...(mobile ? { top: 8, left: 8, gap: 8 } : {}) }} onClick={onOpenProfile}>
      <div style={styles.levelCircleContainer}>
        <div style={{
          ...styles.levelCircle,
          ...(mobile ? { width: 48, height: 48, borderRadius: 10, padding: 5 } : {}),
          background: `conic-gradient(from -90deg, #fff ${progressPct * 3.6}deg, #1a1a1a ${progressPct * 3.6}deg)`,
        }}>
          <div style={{ ...styles.innerSquare, ...(mobile ? { borderRadius: 7 } : {}) }}>
            <span style={{ ...styles.levelText, ...(mobile ? { fontSize: 24 } : {}) }}>{townHallLevel}</span>
          </div>
        </div>
      </div>

      <div style={styles.infoStack}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...styles.name, ...(mobile ? { fontSize: 18 } : {}) }}>{playerState.player_name}</span>
          <DexBadge dexId={dex} size={mobile ? 'sm' : 'lg'} />
        </div>

        <div style={styles.trophyContainer} onClick={(e) => { e.stopPropagation(); onOpenLeaderboard?.(); }}>
          <div style={styles.trophyBox}>
            <img src={trophyIcon} alt="trophy" style={styles.trophyImg} />
          </div>
          <div style={styles.trophyBar}>
            <span style={styles.trophiesText}>
              {formatNumber(playerState.trophies)}
            </span>
          </div>
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
    cursor: 'pointer',
    zIndex: 10,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  levelCircleContainer: {
    position: 'relative',
    zIndex: 2,
  },
  levelCircle: {
    width: 68,
    height: 68,
    borderRadius: 14,
    background: '#1a1a1a',
    border: '3.5px solid #0a0a0a',
    boxShadow: '0 4px 10px rgba(0,0,0,0.7)',
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
    boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3)',
  },
  levelText: {
    color: '#fff',
    fontSize: 34,
    fontWeight: 900,
    textShadow: '-2px -2px 0 #0a0a0a, 2px -2px 0 #0a0a0a, -2px 2px 0 #0a0a0a, 2px 2px 0 #0a0a0a, 0 0 4px #0a0a0a, 0 3px 3px rgba(0,0,0,1)',
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
    color: '#fff',
    fontSize: 24,
    fontWeight: 900,
    textShadow: '-1px -1px 0 #1a1a1a, 1px -1px 0 #1a1a1a, -1px 1px 0 #1a1a1a, 1px 1px 0 #1a1a1a, 0 2px 2px rgba(0,0,0,0.8)',
    marginLeft: 4,
    letterSpacing: '0.5px',
  },
  trophyContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: 40,
    marginLeft: 4,
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
    fontWeight: 900,
    color: '#fff',
    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 1px rgba(0,0,0,1)',
    letterSpacing: '0.5px',
    width: '100%',
    textAlign: 'center',
  },
};
