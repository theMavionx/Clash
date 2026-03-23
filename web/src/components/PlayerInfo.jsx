import { memo } from 'react';
import { usePlayer } from '../hooks/useGodot';
import { colors } from '../styles/theme';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

const formatNumber = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

function PlayerInfo() {
  const playerState = usePlayer();
  if (!playerState) return null;

  const townHallLevel = playerState.buildings?.town_hall?.level || 1;

  return (
    <div style={styles.wrap}>
      <div style={styles.levelCircleContainer}>
        <div style={styles.levelCircle}>
          <div style={styles.innerCircle}>
            <div style={styles.gloss} />
            <span style={styles.levelText}>{townHallLevel}</span>
          </div>
        </div>
      </div>

      <div style={styles.infoStack}>
        <span style={styles.name}>{playerState.player_name}</span>

        <div style={styles.trophyContainer}>
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
    pointerEvents: 'none',
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
    borderRadius: '50%',
    background: 'conic-gradient(#ffffff 0% 65%, #2c333a 65% 100%)',
    border: '3.5px solid #1a1a1a',
    boxShadow: '0 4px 8px rgba(0,0,0,0.6), inset 0 2px 2px rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  innerCircle: {
    width: '74%',
    height: '74%',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, #7bd9ff 0%, #46b8e8 70%, #2a9ccb 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #1a1a1a',
    boxShadow: 'inset 0 4px 6px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)',
    position: 'relative',
    overflow: 'hidden',
  },
  gloss: {
    position: 'absolute',
    top: '-30%',
    left: '-10%',
    width: '120%',
    height: '60%',
    backgroundColor: 'rgba(255,255,255,0.25)',
    transform: 'rotate(-25deg)',
    pointerEvents: 'none',
  },
  levelText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: 900,
    WebkitTextStroke: '2px #0a0a0a',
    textShadow: '0 3px 2px rgba(0,0,0,0.9)',
    zIndex: 2,
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
    WebkitTextStroke: '1px #1a1a1a',
    textShadow: '0 2px 2px rgba(0,0,0,0.8)',
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
    borderRadius: '0 13px 13px 0',
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
    WebkitTextStroke: '1px #000',
    textShadow: '0 2px 1px rgba(0,0,0,1)',
    letterSpacing: '0.5px',
    width: '100%',
    textAlign: 'center',
  },
};
