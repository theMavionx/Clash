import { memo, useCallback } from 'react';
import { useFarcaster } from '../hooks/useFarcaster';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import arbaletImg from '../assets/units/arbalet.png';
import archerImg from '../assets/units/archer.png';
import berserkImg from '../assets/units/berserk.png';

const UNIT_IMAGES = { Knight: knightImg, Mage: mageImg, Archer: archerImg, Ranger: arbaletImg, Barbarian: berserkImg };

const fmt = (n) => (n || 0).toLocaleString().replace(/,/g, ' ');

function isDemonKingTroopName(name) {
  return String(name || '').trim().toLowerCase().replace(/[_\s-]/g, '') === 'demonking'
    || String(name || '').trim().startsWith('DemonKing:');
}

function battleErrorMessage(result) {
  const raw = String(result?.message || result?.error || result?.reason || 'Battle result was not recorded.').trim();
  if (/already attacked this player recently/i.test(raw)) {
    return 'This opponent was already on cooldown. No rewards were applied. Find a new opponent and attack again.';
  }
  if (/battle session is no longer active|session/i.test(raw)) {
    return 'This battle session expired. No rewards were applied. Find a new opponent and attack again.';
  }
  return raw || 'Battle result was not recorded. Find a new opponent and attack again.';
}

function ShareButton({ isVictory, isReplay, isAiOnlineBattle, result }) {
  const { isInFrame, shareCast } = useFarcaster();
  const handleShare = useCallback(() => {
    if (isReplay || isAiOnlineBattle) return;
    const loot = result?.loot;
    const text = isVictory
      ? `I raided a village in Clash of Perps and looted ${loot?.gold || 0} gold! ⚔️`
      : `My troops fell in battle on Clash of Perps! Time to upgrade. 💀`;
    if (isInFrame) {
      shareCast(text);
    } else {
      window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent('https://clashofperps.fun')}`, '_blank');
    }
  }, [isVictory, isReplay, isAiOnlineBattle, result, isInFrame, shareCast]);

  if (isReplay || isAiOnlineBattle) return null;
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
  const isError = result.type === 'error' || !!result.error;
  const isAiOnlineBattle = !!result.ai_online_battle;
  const casualties = isError
    ? []
    : Object.entries(result.casualties || {}).filter(([name, c]) => !isDemonKingTroopName(name) && c > 0);
  const totalCasualties = casualties.reduce((sum, [, c]) => sum + c, 0);
  const totalReinforceCost = totalCasualties * 50;
  const hasLootObject = !!result.loot && typeof result.loot === 'object';
  const hasLootValue = hasLootObject && ['gold', 'wood', 'ore'].some((key) => Number(result.loot?.[key] || 0) > 0);
  const showLootPanel = isVictory && hasLootObject && (hasLootValue || isAiOnlineBattle);
  const trophyDelta = Number(result.trophy_delta || 0);
  const trophyBase = Number(result.trophy_base || 0);
  const trophyBonus = Number(result.trophy_bonus || 0);
  const subtitle = isError
    ? battleErrorMessage(result)
    : isReplay
    ? (result.reason || 'Replay finished')
    : isAiOnlineBattle
      ? (isVictory ? 'Battle complete. Loot and losses are below.' : 'Battle ended. Losses are below.')
      : isVictory
        ? 'This village is free once again!'
        : 'All troops were lost!';

  return (
    <div style={styles.backdrop}>
      <style>{ANIM_CSS}</style>
      <div style={styles.content}>

        {/* Title Group */}
        <div style={styles.titleGroup}>
          <div style={styles.glowBackground}></div>
          <div style={styles.titleText}>
            {isError ? (result.title || 'BATTLE ERROR') : isReplay ? 'REPLAY END' : isVictory ? 'VICTORY' : 'DEFEAT'}
          </div>
          <div style={styles.subtitleText}>
            {subtitle}
          </div>
        </div>

        {isError && (
          <div style={{ ...styles.panel, ...styles.errorPanel }}>
            <div style={styles.panelTitle}>No rewards were applied</div>
            <div style={styles.errorText}>
              Your battle was rejected by the server. Return home and start a fresh raid.
            </div>
          </div>
        )}

        {/* Loot Panel */}
        {!isError && showLootPanel && (
          <div style={styles.panel}>
            <div style={styles.panelTitle}>You received</div>
            <div style={styles.resourceRow}>
               <LootItem icon={goldIcon} value={result.loot.gold} delay={0.7} />
               <LootItem icon={woodIcon} value={result.loot.wood} delay={0.9} />
               <LootItem icon={stoneIcon} value={result.loot.ore} delay={1.1} />
            </div>
          </div>
        )}

        {!isError && isVictory && trophyDelta > 0 && !isReplay && !isAiOnlineBattle && (
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Trophies won</div>
            <div className="loot-pop" style={{ ...styles.trophyReward, animationDelay: '1.15s' }}>
              <img src={trophyIcon} alt="" style={styles.trophyIcon} />
              <span style={styles.trophyValue}>+{fmt(trophyDelta)}</span>
            </div>
            {trophyBonus > 0 && (
              <div style={styles.trophyBreakdown}>
                Base +{trophyBase} · Altar +{trophyBonus}
              </div>
            )}
          </div>
        )}

        {/* Defeat Panel */}
        {!isError && !isVictory && !isReplay && !isAiOnlineBattle && (
           <div style={styles.panel}>
            <div style={styles.panelTitle}>Better luck next time!</div>
            <div style={styles.subtitleText}>
              Upgrade your troops and try again.
            </div>
           </div>
        )}

        {/* Casualties */}
        {casualties.length > 0 && !isReplay && (
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Casualties</div>
            <div style={styles.casualtyRow}>
              {casualties.map(([name, count]) => (
                <div key={name} className="loot-pop" style={{...styles.casualtyItem, animationDelay: '1.2s'}}>
                  <div style={styles.casualtyImgWrap}>
                    {UNIT_IMAGES[name] && <img src={UNIT_IMAGES[name]} alt={name} style={styles.casualtyImg} />}
                    <div style={styles.casualtyCount}>x{count}</div>
                  </div>
                  <span style={styles.casualtyName}>{name}</span>
                </div>
              ))}
            </div>
            <div style={styles.reinforceInfo}>
              <img src={goldIcon} alt="gold" style={{width: 20, height: 20}} />
              <span style={styles.reinforceCost}>{totalReinforceCost} gold to reinforce</span>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          {!isError && <ShareButton isVictory={isVictory} isReplay={isReplay} isAiOnlineBattle={isAiOnlineBattle} result={result} />}
          <div style={styles.btnWrap} onClick={onClose}>
            <span style={styles.btnText}>Return</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LootItem({ icon, value, delay }) {
  if (value === undefined || value === null) return null;
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
    textShadow: '-2px -2px 0 #0a0a0a, 2px -2px 0 #0a0a0a, -2px 2px 0 #0a0a0a, 2px 2px 0 #0a0a0a, 0 4px 0 #0a0a0a, 0 8px 16px rgba(0,0,0,0.8)',
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
  errorPanel: {
    background: 'linear-gradient(180deg, #5a2b24 0%, #3d1d19 100%)',
    border: '3px solid #c66a4b',
  },
  errorText: {
    color: '#fff7df',
    fontSize: 14,
    fontWeight: 800,
    textAlign: 'center',
    lineHeight: 1.4,
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
  trophyReward: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  trophyIcon: {
    width: 52,
    height: 52,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
  },
  trophyValue: {
    fontSize: 30,
    fontWeight: 900,
    color: '#ffd766',
    textShadow: textOutline,
  },
  trophyBreakdown: {
    marginTop: -8,
    color: '#fff7d6',
    fontSize: 13,
    fontWeight: 900,
    textAlign: 'center',
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
  },
  casualtyRow: {
    display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap',
  },
  casualtyItem: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  casualtyImgWrap: {
    position: 'relative', width: 56, height: 56,
  },
  casualtyImg: {
    width: 56, height: 56, objectFit: 'contain',
    filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.5)) grayscale(40%)',
  },
  casualtyCount: {
    position: 'absolute', bottom: -4, right: -6,
    background: '#E53935', color: '#fff', fontSize: 12, fontWeight: 900,
    padding: '1px 6px', borderRadius: 8, lineHeight: '16px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
  },
  casualtyName: {
    fontSize: 11, fontWeight: 800, color: '#ccc', textShadow: textOutline,
  },
  reinforceInfo: {
    display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
  },
  reinforceCost: {
    fontSize: 13, fontWeight: 800, color: '#FFD700', textShadow: textOutline,
  },
};

export default memo(BattleResultOverlay);
