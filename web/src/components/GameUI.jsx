import { useState, useEffect, useCallback, useMemo } from 'react';
import ResourceBar from './ResourceBar';
import PlayerInfo from './PlayerInfo';
import ActionButtons from './ActionButtons';
import ShopPanel from './ShopPanel';
import BuildingInfoPanel from './BuildingInfoPanel';
import BarracksPanel from './BarracksPanel';
import RegisterPanel from './RegisterPanel';
import ErrorToast from './ErrorToast';
import FpsTracker from './FpsTracker';
import FuturesPanel from './FuturesPanel';
import ProfileModal from './ProfileModal';
import EnemyHeader from './EnemyHeader';
import BattleResultOverlay from './BattleResultOverlay';
import BattleLogPanel from './BattleLogPanel';
import LeaderboardPanel from './LeaderboardPanel';
import { useSend, useUI, useBuilding } from '../hooks/useGodot';

export default function GameUI() {
  const { sendToGodot, setShopOpen } = useSend();
  const { ready, shopOpen, error, showRegister, cloudVisible, enemyMode, futuresOpen, battleResult, setBattleResult } = useUI();
  const { selectedBuilding } = useBuilding();

  const [showTroops, setShowTroops] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showBattleLog, setShowBattleLog] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    if (!selectedBuilding) setShowTroops(false);
  }, [selectedBuilding]);

  // Pause island when heavy overlay panels are open (futures, shop, barracks, profile)
  const barracksOpen = showTroops;
  const anyPanelOpen = !!(futuresOpen || shopOpen || barracksOpen || showProfile || showBattleLog || showLeaderboard);
  useEffect(() => {
    sendToGodot('ui_overlay', { active: anyPanelOpen });
  }, [anyPanelOpen, sendToGodot]);

  const handleCloseShop = useCallback(() => {
    setShopOpen(false);
    sendToGodot('close_shop');
  }, [setShopOpen, sendToGodot]);

  const handleCloseTroops = useCallback(() => setShowTroops(false), []);
  const handleDeselectBuilding = useCallback(() => sendToGodot('deselect_building'), [sendToGodot]);
  const handleOpenTroops = useCallback(() => setShowTroops(true), []);



  if (!ready) return null;

  if (showRegister) {
    return <RegisterPanel />;
  }

  // Hide all UI during cloud transition
  if (cloudVisible) return null;

  return (
    <div style={styles.overlay}>
      {!enemyMode?.active && <ResourceBar />}
      {!enemyMode?.active && <PlayerInfo onOpenProfile={() => setShowProfile(true)} onOpenLeaderboard={() => setShowLeaderboard(true)} />}
      <ActionButtons onOpenBattleLog={() => setShowBattleLog(true)} />
      <ErrorToast message={error} />
      <FpsTracker />
      <EnemyHeader />
      <BattleResultOverlay result={battleResult} onClose={() => {
        setBattleResult(null);
        sendToGodot('return_home');
      }} />

      {shopOpen && (
        <ShopPanel onClose={handleCloseShop} />
      )}

      {futuresOpen && (
        <FuturesPanel />
      )}

      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}

      {showBattleLog && (
        <BattleLogPanel onClose={() => setShowBattleLog(false)} />
      )}

      {showLeaderboard && (
        <LeaderboardPanel onClose={() => setShowLeaderboard(false)} />
      )}

      {showTroops && selectedBuilding && (selectedBuilding.id === 'barn' || selectedBuilding.is_barracks) && !selectedBuilding.is_enemy ? (
        <BarracksPanel
          building={{ ...selectedBuilding, is_barracks: true }}
          onClose={handleCloseTroops}
        />
      ) : selectedBuilding ? (
        <BuildingInfoPanel onOpenTroops={handleOpenTroops} />
      ) : null}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 5,
  },
};
