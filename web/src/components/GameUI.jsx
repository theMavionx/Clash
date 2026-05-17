import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import ResourceBar from './ResourceBar';
import PlayerInfo from './PlayerInfo';
import ActionButtons from './ActionButtons';
import ShopPanel from './ShopPanel';
import BuildingInfoPanel from './BuildingInfoPanel';
import BarnPanel from './BarnPanel';
import RegisterPanel from './RegisterPanel';
import ErrorToast from './ErrorToast';
import FpsTracker from './FpsTracker';
import EnemyHeader from './EnemyHeader';
import BattleResultOverlay from './BattleResultOverlay';
import TutorialOverlay from './TutorialOverlay';
import { useSend, useUI, useSelectedBuilding, useTutorial } from '../hooks/useGodot';
import { useAgentActions } from '../hooks/useAgentActions';
import { useLayout } from '../hooks/useIsMobile';
import ChunkErrorBoundary from './ChunkErrorBoundary';
import { addClientBreadcrumb, lazyWithClientReload } from '../lib/clientLogger';

// Heavy components are lazy-loaded — their JS only ships to the user
// when they actually open the relevant UI. Saves ~600KB from the
// initial bundle (FuturesPanel pulls in TradingViewWidget +
// lightweight-charts + all wallet-adapter pickers; the three modals
// each have their own animation/data-fetch chunks).
const FuturesPanel = lazy(lazyWithClientReload(() => import('./FuturesPanel'), 'FuturesPanel'));
const ProfileModal = lazy(lazyWithClientReload(() => import('./ProfileModal'), 'ProfileModal'));
const BattleLogPanel = lazy(lazyWithClientReload(() => import('./BattleLogPanel'), 'BattleLogPanel'));
const LeaderboardPanel = lazy(lazyWithClientReload(() => import('./LeaderboardPanel'), 'LeaderboardPanel'));
const AiChatPanel = lazy(lazyWithClientReload(() => import('./AiChatPanel'), 'AiChatPanel'));

export default function GameUI() {
  const { sendToGodot, setShopOpen } = useSend();
  const { ready, shopOpen, error, showRegister, cloudVisible, enemyMode, futuresOpen, battleResult, setBattleResult } = useUI();
  const { tutorialFlags, tutorialPhase, setTutorialFlags, setTutorialPhase } = useTutorial();
  const { selectedBuilding } = useSelectedBuilding();
  const { isMobile } = useLayout();
  useAgentActions();

  const [showTroops, setShowTroops] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showBattleLog, setShowBattleLog] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);

  useEffect(() => {
    if (!selectedBuilding) setShowTroops(false);
  }, [selectedBuilding]);

  // Trigger attack tutorial on first enemy mode
  useEffect(() => {
    if (enemyMode?.active && tutorialFlags !== null && !(tutorialFlags & 4)) {
      setTutorialPhase('attack');
    }
  }, [enemyMode?.active]);

  // Pause island when heavy overlay panels are open (futures, shop, barn, profile).
  // AiChatPanel is intentionally excluded — on desktop it's a non-blocking
  // sidebar that should leave the game live so the player can keep
  // building/attacking while chatting with the agent. On mobile the chat
  // covers the screen but Godot pausing isn't necessary either since
  // input can't reach the canvas through the panel anyway.
  const barnOpen = showTroops;
  const anyPanelOpen = !!(futuresOpen || shopOpen || barnOpen || showProfile || showBattleLog || showLeaderboard);
  useEffect(() => {
    sendToGodot('ui_overlay', { active: anyPanelOpen });
  }, [anyPanelOpen, sendToGodot]);

  useEffect(() => {
    if (futuresOpen) addClientBreadcrumb('ui.panel_open', { panel: 'futures' });
  }, [futuresOpen]);
  useEffect(() => {
    if (showProfile) addClientBreadcrumb('ui.panel_open', { panel: 'profile' });
  }, [showProfile]);
  useEffect(() => {
    if (showBattleLog) addClientBreadcrumb('ui.panel_open', { panel: 'battle_log' });
  }, [showBattleLog]);
  useEffect(() => {
    if (showLeaderboard) addClientBreadcrumb('ui.panel_open', { panel: 'leaderboard' });
  }, [showLeaderboard]);
  useEffect(() => {
    if (showAiChat) addClientBreadcrumb('ui.panel_open', { panel: 'ai_chat' });
  }, [showAiChat]);

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
      {!enemyMode?.active && (
        <button
          style={{
            ...styles.aiChatButton,
            // Anchor to the bottom-right action group: TRADE button is the
            // rightmost ~140px (110 on mobile) inside ActionButtons.wrapRight,
            // so we offset by its width + the wrapRight gap (12 / 8) to land
            // just to the left of TRADE, bottoms aligned ("on the same level").
            bottom: isMobile ? 8 : 12,
            right: isMobile ? (8 + 110 + 8) : (12 + 140 + 12),
            top: 'auto',
            left: 'auto',
          }}
          onClick={() => setShowAiChat(true)}
          title="Open AI agent chat"
          aria-label="Open AI agent chat"
        >
          AI
        </button>
      )}
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
      <ChunkErrorBoundary name="GameUI.lazy_panels" fallback={null}>
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

          {showAiChat && (
            <AiChatPanel onClose={() => setShowAiChat(false)} />
          )}
        </Suspense>
      </ChunkErrorBoundary>

      {tutorialPhase && (
        <TutorialOverlay
          tutorialFlags={tutorialFlags}
          phase={tutorialPhase}
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkip}
        />
      )}

      {!enemyMode?.active && showTroops && selectedBuilding && (selectedBuilding.id === 'barn' || selectedBuilding.is_barn) && !selectedBuilding.is_enemy ? (
        <BarnPanel
          building={{ ...selectedBuilding, is_barn: true }}
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
  // AI chat trigger — anchored to the bottom-right action group via
  // inline `bottom`/`right` overrides in the render. Parchment palette
  // (gold-on-brown) so it visually pairs with TRADE / NFT / TOURNAMENT
  // rather than the old blue chat-bubble look.
  aiChatButton: {
    position: 'fixed',
    width: 54, height: 54,
    pointerEvents: 'auto',
    zIndex: 20,
    borderRadius: 14,
    border: '3px solid #5C3A21',
    background: 'linear-gradient(180deg, #ffd76a 0%, #c2851b 100%)',
    boxShadow: '0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
    color: '#3a1f00',
    fontSize: 18,
    fontWeight: 950,
    letterSpacing: 0.5,
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
