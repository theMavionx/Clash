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
  const townHallLevel = Math.max(
    1,
    Number(enemyMode.town_hall_level ?? enemyMode.level) || 1,
  );
  const reward = {
    gold: rewardValue(enemyMode, 'gold'),
    wood: rewardValue(enemyMode, 'wood'),
    ore: rewardValue(enemyMode, 'ore'),
  };

  return (
    <div style={compact ? { ...styles.container, ...styles.containerReplayMobile } : styles.container}>
      {/* Player Header - Styled like PlayerInfo */}
      <div style={compact ? { ...styles.headerWrap, gap: 8 } : styles.headerWrap}>
        <div style={styles.levelCircleContainer}>
          <div style={compact ? { ...styles.levelCircle, ...styles.levelCircleMobile } : styles.levelCircle}>
            <div style={compact ? { ...styles.innerSquare, borderRadius: 10 } : styles.innerSquare}>
              <span style={compact ? { ...styles.levelText, ...styles.levelTextMobile } : styles.levelText}>{townHallLevel}</span>
            </div>
          </div>
        </div>

        <div style={styles.infoStack}>
          <span
            data-enemy-name
            title={enemyMode.name}
            style={{
              ...styles.playerName,
              ...(mobile ? styles.playerNameMobile : null),
              ...(compact ? styles.playerNameReplayMobile : null),
            }}
          >
            {enemyMode.name}
          </span>

          {enemyMode.trophies !== undefined && (
            <div style={compact ? { ...styles.trophyContainer, height: 26, marginLeft: 2 } : styles.trophyContainer}>
              <div style={compact ? { ...styles.trophyBox, width: 22, height: 22 } : styles.trophyBox}>
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
      {(reward.gold > 0 || reward.wood > 0 || reward.ore > 0) && (
        <div style={styles.rewardsSection}>
          <div style={styles.rewardsTitle}>Victory reward</div>
          <div style={styles.resourceList}>
            {reward.gold > 0 && <ResourceRow icon={goldIcon} value={reward.gold} />}
            {reward.wood > 0 && <ResourceRow icon={woodIcon} value={reward.wood} />}
            {reward.ore > 0 && <ResourceRow icon={stoneIcon} value={reward.ore} />}
          </div>
        </div>
      )}
    </div>
  );
}

function rewardValue(enemyMode, resource) {
  const preview = Number(enemyMode?.loot_preview?.[resource]);
  if (Number.isFinite(preview)) return Math.max(0, Math.floor(preview));
  return Math.max(0, Math.floor((Number(enemyMode?.[resource]) || 0) * LOOT_PERCENT));
}

function ResourceRow({ icon, value }) {
  return (
    <div style={styles.resourceRow}>
      <img src={icon} alt="" style={styles.resourceIcon} />
      <span style={styles.resourceText}>{fmt(value)}</span>
    </div>
  );
}

const hudSurface = 'rgba(17,20,27,0.95)';

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
    fontFamily: 'inherit',
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
  levelCircleMobile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    padding: 4,
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
    fontSize: 26,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    textShadow: 'none',
    zIndex: 2,
    letterSpacing: '-0.02em',
  },
  levelTextMobile: {
    fontSize: 22,
  },
  infoStack: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  playerName: {
    color: 'var(--terminal-text)',
    fontSize: 17,
    fontWeight: 600,
    textShadow: 'none',
    letterSpacing: 0,
    background: hudSurface,
    border: '1px solid var(--terminal-border)',
    borderRadius: 999,
    padding: '4px 12px',
    lineHeight: 1.2,
  },
  playerNameMobile: {
    display: 'block',
    maxWidth: 'min(44vw, calc(100vw - 180px), 320px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    letterSpacing: 0,
  },
  playerNameReplayMobile: {
    maxWidth: 'calc(100vw - 178px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 15,
    letterSpacing: 0,
  },
  trophyContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 32,
    boxSizing: 'border-box',
    padding: '0 12px 0 3px',
    borderRadius: 999,
    background: hudSurface,
    border: '1px solid var(--terminal-border)',
  },
  trophyBox: {
    width: 24,
    height: 24,
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
    minWidth: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  trophiesText: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--terminal-text)',
    fontVariantNumeric: 'tabular-nums',
    textShadow: 'none',
    letterSpacing: 0,
    width: '100%',
    textAlign: 'center',
  },
  rewardsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 4,
    padding: '10px 14px',
    borderRadius: 16,
    background: hudSurface,
    border: '1px solid var(--terminal-border)',
    boxShadow: 'var(--terminal-shadow-card)',
  },
  rewardsTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--terminal-text-muted)',
    textShadow: 'none',
    letterSpacing: 0,
  },
  resourceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  resourceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  resourceIcon: {
    width: 24,
    height: 24,
    objectFit: 'contain',
  },
  resourceText: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--terminal-text)',
    fontVariantNumeric: 'tabular-nums',
    textShadow: 'none',
  },
};

export default memo(EnemyHeader);
