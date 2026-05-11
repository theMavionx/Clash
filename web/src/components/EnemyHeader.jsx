import { memo } from 'react';
import { useUI } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

const fmt = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');
const LOOT_PERCENT = 0.15;

function EnemyHeader() {
  const { enemyMode } = useUI();
  const { isMobile: mobile } = useLayout();

  if (!enemyMode?.active) return null;

  const isReplay = !!enemyMode.is_replay;
  const compact = mobile && isReplay;

  return (
    <div style={compact ? { ...styles.container, ...styles.containerReplayMobile } : styles.container}>
      {/* Player Header - Styled like PlayerInfo */}
      <div style={compact ? { ...styles.headerWrap, gap: 8 } : styles.headerWrap}>
        <div style={styles.levelCircleContainer}>
          <div style={compact ? { ...styles.levelCircle, ...styles.levelCircleMobile } : styles.levelCircle}>
            <div style={compact ? { ...styles.innerSquare, borderRadius: 6 } : styles.innerSquare}>
              <span style={compact ? { ...styles.levelText, ...styles.levelTextMobile } : styles.levelText}>{enemyMode.level || 1}</span>
            </div>
          </div>
        </div>

        <div style={styles.infoStack}>
          <span style={compact ? { ...styles.playerName, ...styles.playerNameReplayMobile } : styles.playerName}>{enemyMode.name}</span>

          {enemyMode.trophies !== undefined && (
            <div style={compact ? { ...styles.trophyContainer, height: 26, marginLeft: 2 } : styles.trophyContainer}>
              <div style={compact ? { ...styles.trophyBox, width: 24, height: 24, borderRadius: 5 } : styles.trophyBox}>
                <img src={trophyIcon} alt="trophy" style={styles.trophyImg} />
              </div>
              <div style={compact ? { ...styles.trophyBar, height: 18, minWidth: 54, padding: '0 8px' } : styles.trophyBar}>
                <span style={compact ? { ...styles.trophiesText, fontSize: 12 } : styles.trophiesText}>
                  {fmt(enemyMode.trophies)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rewards Section */}
      {(enemyMode.gold > 0 || enemyMode.wood > 0 || enemyMode.ore > 0) && (
        <div style={styles.rewardsSection}>
          <div style={styles.rewardsTitle}>Victory Reward:</div>
          <div style={styles.resourceList}>
            {enemyMode.gold > 0 && <ResourceRow icon={goldIcon} value={enemyMode.gold} />}
            {enemyMode.wood > 0 && <ResourceRow icon={woodIcon} value={enemyMode.wood} />}
            {enemyMode.ore > 0 && <ResourceRow icon={stoneIcon} value={enemyMode.ore} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceRow({ icon, value }) {
  const loot = Math.floor(value * LOOT_PERCENT);
  return (
    <div style={styles.resourceRow}>
      <img src={icon} alt="" style={styles.resourceIcon} />
      <span style={styles.resourceText}>{fmt(loot)}</span>
    </div>
  );
}

const textOutline = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 3px 6px rgba(0,0,0,0.8)';

const styles = {
  container: {
    position: 'fixed',
    top: 16,
    left: 16,
    zIndex: 100,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    gap: 8,
  },
  containerReplayMobile: {
    top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
    left: 10,
    gap: 4,
  },
  headerWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  levelCircleContainer: {
    position: 'relative',
    zIndex: 2,
  },
  levelCircle: {
    width: 60,
    height: 60,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #1a1a1a 50%, #fff 50%)',
    border: '3px solid #0a0a0a',
    boxShadow: '0 4px 10px rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 6,
  },
  levelCircleMobile: {
    width: 48,
    height: 48,
    borderRadius: 10,
    padding: 5,
  },
  innerSquare: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    background: 'linear-gradient(180deg, #5899ff 0%, #3d86ef 100%)',
    border: '2px solid #0a0a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3)',
  },
  levelText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 900,
    textShadow: '-2px -2px 0 #0a0a0a, 2px -2px 0 #0a0a0a, -2px 2px 0 #0a0a0a, 2px 2px 0 #0a0a0a, 0 2px 2px rgba(0,0,0,1)',
    zIndex: 2,
    transform: 'translateY(-1px)',
    letterSpacing: '-1px',
  },
  levelTextMobile: {
    fontSize: 24,
  },
  infoStack: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 2,
  },
  playerName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 900,
    textShadow: '-1px -1px 0 #1a1a1a, 1px -1px 0 #1a1a1a, -1px 1px 0 #1a1a1a, 1px 1px 0 #1a1a1a, 0 2px 2px rgba(0,0,0,0.8)',
    marginLeft: 4,
    letterSpacing: '0.5px',
  },
  playerNameReplayMobile: {
    maxWidth: 'calc(100vw - 178px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 18,
    marginLeft: 2,
    letterSpacing: 0,
  },
  trophyContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: 32,
    marginLeft: 4,
  },
  trophyBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: 'linear-gradient(180deg, #ffa22a 0%, #d87b1c 100%)',
    border: '2px solid #1a1a1a',
    boxShadow: 'inset 0 1.5px 1px rgba(255, 255, 255, 0.7), 0 2px 3px rgba(0, 0, 0, 0.5)',
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
    height: 22,
    minWidth: 70,
    background: 'rgba(0, 0, 0, 0.35)',
    border: '1.5px solid #1a1a1a',
    borderRadius: '0 6px 6px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
    padding: '0 10px',
    zIndex: 2,
    boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
  },
  trophiesText: {
    fontSize: 14,
    fontWeight: 900,
    color: '#fff',
    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 1px rgba(0,0,0,1)',
    letterSpacing: '0.5px',
    width: '100%',
    textAlign: 'center',
  },
  rewardsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingLeft: 4,
    marginTop: 4,
  },
  rewardsTitle: {
    fontSize: 14,
    fontWeight: 900,
    color: '#fff',
    textShadow: textOutline,
    letterSpacing: '0.3px',
  },
  resourceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  resourceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  resourceIcon: {
    width: 24,
    height: 24,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.8))',
  },
  resourceText: {
    fontSize: 15,
    fontWeight: 900,
    color: '#fff',
    textShadow: textOutline,
  },
};

export default memo(EnemyHeader);
