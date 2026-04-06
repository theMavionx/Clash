import { memo, useCallback } from 'react';
import { useFarcaster } from '../hooks/useFarcaster';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const fmt = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

function ShareButton({ isVictory, isReplay, result }) {
  const { isInFrame, shareCast } = useFarcaster();
  const handleShare = useCallback(() => {
    if (isReplay) return;
    const loot = result?.loot;
    const text = isVictory
      ? `I raided a village in Clash of Perps and looted ${loot?.gold || 0} gold! ⚔️`
      : `My troops fell in battle on Clash of Perps! Time to upgrade. 💀`;
    if (isInFrame) {
      shareCast(text);
    } else {
      window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent('https://clashofperps.fun')}`, '_blank');
    }
  }, [isVictory, isReplay, result, isInFrame, shareCast]);

  if (isReplay) return null;
  return (
    <div style={{ ...styles.btnWrap, background: 'linear-gradient(180deg, #8B5CF6 0%, #6D28D9 100%)' }} onClick={handleShare}>
      <span style={styles.btnText}>Share</span>
    </div>
  );
}

function BattleResultOverlay({ result, onClose }) {
  if (!result) return null;

  const isVictory = result.type === 'victory';
  const isReplay = result.type === 'replay_end';

  return (
    <div style={styles.backdrop}>
      <style>{ANIM_CSS}</style>
      <div style={styles.content}>

        {/* Title Group */}
        <div style={styles.titleGroup}>
          <div style={styles.glowBackground}></div>
          <div style={styles.titleText}>
            {isReplay ? 'REPLAY END' : isVictory ? 'VICTORY' : 'DEFEAT'}
          </div>
          <div style={styles.subtitleText}>
            {isReplay ? 'Replay finished' : isVictory ? 'This village is free once again!' : 'All troops were lost!'}
          </div>
        </div>

        {/* Loot Panel */}
        {isVictory && result.loot && (
          <div style={styles.panel}>
            <div style={styles.panelTitle}>You received</div>
            <div style={styles.resourceRow}>
               <LootItem icon={goldIcon} value={result.loot.gold} delay={0.7} />
               <LootItem icon={woodIcon} value={result.loot.wood} delay={0.9} />
               <LootItem icon={stoneIcon} value={result.loot.ore} delay={1.1} />
            </div>
          </div>
        )}

        {/* Defeat Panel */}
        {!isVictory && !isReplay && (
           <div style={styles.panel}>
            <div style={styles.panelTitle}>Better luck next time!</div>
            <div style={styles.subtitleText}>
              Upgrade your troops and try again.
            </div>
           </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <ShareButton isVictory={isVictory} isReplay={isReplay} result={result} />
          <div style={styles.btnWrap} onClick={onClose}>
            <span style={styles.btnText}>Return</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LootItem({ icon, value, delay }) {
  if (!value) return null;
  return (
    <div className="loot-pop" style={{...styles.lootItem, animationDelay: `${delay}s`}}>
      <img src={icon} alt="" style={styles.lootIcon} />
      <span style={styles.lootValue}>{fmt(value)}</span>
    </div>
  );
}

const ANIM_CSS = `
@keyframes popIn {
  0% { transform: scale(0.5) translateY(20px); opacity: 0; }
  60% { transform: scale(1.15) translateY(-5px); opacity: 1; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
.loot-pop {
  animation: popIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
}
@keyframes titleDrop {
  0% { transform: translateY(-40px) scale(0.9); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes panelRise {
  0% { transform: translateY(40px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes btnPop {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
`;

const textOutline = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 3px 6px rgba(0,0,0,0.8)';

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'all',
    animation: 'fadeIn 0.3s ease-out',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: 640,
    gap: 20,
    padding: '0 20px',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 8,
    animation: 'titleDrop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both',
  },
  glowBackground: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 300,
    height: 100,
    background: 'radial-gradient(ellipse at center, rgba(255,215,0,0.8) 0%, rgba(255,215,0,0) 70%)',
    opacity: 0.8,
    zIndex: -1,
    filter: 'blur(16px)',
  },
  titleText: {
    fontSize: 56,
    fontWeight: 900,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontStyle: 'italic',
    WebkitTextStroke: '2px #0a0a0a',
    textShadow: '0 4px 0 #0a0a0a, 0 8px 16px rgba(0,0,0,0.8)',
    lineHeight: 1,
    zIndex: 2,
    textAlign: 'center',
  },
  subtitleText: {
    fontSize: 16,
    fontWeight: 900,
    color: '#fff',
    textShadow: textOutline,
    marginTop: 8,
    textAlign: 'center',
  },
  panel: {
    width: '100%',
    background: '#3c453c', // Dark greenish-grey
    borderRadius: 12,
    padding: '16px 20px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.1), inset 0 -4px 0 rgba(0,0,0,0.3), 0 10px 20px rgba(0,0,0,0.5)',
    animation: 'panelRise 0.5s ease-out 0.2s both',
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: '#fff',
    textShadow: textOutline,
  },
  resourceRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 36,
  },
  lootItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  lootIcon: {
    width: 52,
    height: 52,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transform: 'translateY(0)',
    transition: 'transform 0.2s',
  },
  lootValue: {
    fontSize: 16,
    fontWeight: 900,
    color: '#fff',
    textShadow: textOutline,
  },
  btnWrap: {
    background: 'linear-gradient(180deg, #74c4ff 0%, #3ba4f4 100%)',
    borderRadius: 6,
    padding: '12px 48px',
    cursor: 'pointer',
    marginTop: 12,
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.4), inset 0 -4px 0 #1e70b3, 0 8px 16px rgba(0,0,0,0.3)',
    border: '2px solid #0a0a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'btnPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 1s both',
  },
  btnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 900,
    textShadow: textOutline,
    letterSpacing: '0.5px',
    transform: 'translateY(-1px)',
  }
};

export default memo(BattleResultOverlay);
