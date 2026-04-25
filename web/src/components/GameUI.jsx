import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import ResourceBar from './ResourceBar';
import PlayerInfo from './PlayerInfo';
import ActionButtons from './ActionButtons';
import ShopPanel from './ShopPanel';
import BuildingInfoPanel from './BuildingInfoPanel';
import BarracksPanel from './BarracksPanel';
import RegisterPanel from './RegisterPanel';
import ErrorToast from './ErrorToast';
import FpsTracker from './FpsTracker';
import EnemyHeader from './EnemyHeader';
import BattleResultOverlay from './BattleResultOverlay';
import TutorialOverlay from './TutorialOverlay';
import { useSend, useUI, useSelectedBuilding, useTutorial } from '../hooks/useGodot';

// Heavy components are lazy-loaded — their JS only ships to the user
// when they actually open the relevant UI. Saves ~600KB from the
// initial bundle (FuturesPanel pulls in TradingViewWidget +
// lightweight-charts + all wallet-adapter pickers; the three modals
// each have their own animation/data-fetch chunks).
const FuturesPanel = lazy(() => import('./FuturesPanel'));
const ProfileModal = lazy(() => import('./ProfileModal'));
const BattleLogPanel = lazy(() => import('./BattleLogPanel'));
const LeaderboardPanel = lazy(() => import('./LeaderboardPanel'));

export default function GameUI() {
  const { sendToGodot, setShopOpen } = useSend();
  const { ready, shopOpen, error, showRegister, cloudVisible, enemyMode, futuresOpen, battleResult, setBattleResult } = useUI();
  const { tutorialFlags, tutorialPhase, setTutorialFlags, setTutorialPhase } = useTutorial();
  const { selectedBuilding } = useSelectedBuilding();

  const [showTroops, setShowTroops] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showBattleLog, setShowBattleLog] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    if (!selectedBuilding) setShowTroops(false);
  }, [selectedBuilding]);

  // Trigger attack tutorial on first enemy mode
  useEffect(() => {
    if (enemyMode?.active && tutorialFlags !== null && !(tutorialFlags & 4)) {
      setTutorialPhase('attack');
    }
  }, [enemyMode?.active]);

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

  // Tutorial: mark phase complete on server and advance to next
  const handleTutorialComplete = useCallback((flag) => {
    const newFlags = (tutorialFlags || 0) | flag;
    setTutorialFlags(newFlags);
    setTutorialPhase(null);
    // Persist to server (fire-and-forget)
    const token = window._playerToken;
    if (token) {
      fetch('/api/tutorial/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ flag }),
      }).catch(() => {});
    }
    // Auto-advance to next uncompleted phase after short delay
    setTimeout(() => {
      if (!(newFlags & 2)) setTutorialPhase('army');
      else if (!(newFlags & 8)) setTutorialPhase('trade');
    }, 500);
  }, [tutorialFlags, setTutorialFlags, setTutorialPhase]);

  const handleTutorialSkip = useCallback((flag) => {
    // Skip marks as complete too
    handleTutorialComplete(flag);
  }, [handleTutorialComplete]);



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

      {/* Lazy-loaded panels — Suspense boundary renders nothing while
          the chunk fetches (typically <100ms on a warm cache). The user
          opened the panel deliberately so a tiny pause is acceptable. */}
      <Suspense fallback={null}>
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
      </Suspense>

      {tutorialPhase && (
        <TutorialOverlay
          tutorialFlags={tutorialFlags}
          phase={tutorialPhase}
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkip}
        />
      )}

      {!enemyMode?.active && showTroops && selectedBuilding && (selectedBuilding.id === 'barn' || selectedBuilding.is_barracks) && !selectedBuilding.is_enemy ? (
        <BarracksPanel
          building={{ ...selectedBuilding, is_barracks: true }}
          onClose={handleCloseTroops}
        />
      ) : !enemyMode?.active && selectedBuilding ? (
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
