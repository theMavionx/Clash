import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
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
import TutorialOverlay, { FLAG_ARMY, FLAG_ATTACK, FLAG_TRADE, FLAG_VIDEO } from './TutorialOverlay';
import NftGoldBoostButton from './NftGoldBoostButton';
import FeedbackButton from './FeedbackButton';
import { useSend, useUI, useSelectedBuilding, useTutorial, usePlayer } from '../hooks/useGodot';
import { useAgentActions } from '../hooks/useAgentActions';
import { useLayout } from '../hooks/useIsMobile';
import { useSolanaMobile } from '../hooks/useSolanaMobile';
import { useSkrHandle } from '../hooks/useSkrHandle';
import ChunkErrorBoundary from './ChunkErrorBoundary';
import { addClientBreadcrumb, lazyWithClientReload } from '../lib/clientLogger';
import { readSoundEnabled } from '../lib/soundSettings';

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

function isLocalAuthBypassEnabled() {
  if (import.meta.env.VITE_DISABLE_LOCAL_AUTH_BYPASS === '1') return false;
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export default function GameUI() {
  const { sendToGodot, setShopOpen } = useSend();
  const { ready, shopOpen, error, showRegister, cloudVisible, enemyMode, futuresOpen, battleResult, setBattleResult } = useUI();
  const { tutorialFlags, tutorialPhase, setTutorialFlags, setTutorialPhase } = useTutorial();
  const player = usePlayer();
  const { selectedBuilding } = useSelectedBuilding();
  const { isMobile, actionScale } = useLayout();
  const { isSolanaMobile, ready: solanaMobileReady } = useSolanaMobile();
  const { handle: seekerHandle } = useSkrHandle(player?.wallet);
  const seekerMarkRef = useRef('');
  const guideAudioMutedRef = useRef(false);
  const guideAudioRestoreTimerRef = useRef(null);
  useAgentActions();

  const [showTroops, setShowTroops] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showBattleLog, setShowBattleLog] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const canShowAiChatButton = !enemyMode?.active || !!enemyMode?.is_replay;

  useEffect(() => {
    if (!selectedBuilding) setShowTroops(false);
  }, [selectedBuilding]);

  useEffect(() => {
    if (!ready) return;
    sendToGodot('set_sound_enabled', { enabled: readSoundEnabled() });
  }, [ready, sendToGodot]);

  useEffect(() => {
    if (!ready) return undefined;
    if (tutorialPhase) {
      if (guideAudioRestoreTimerRef.current) {
        clearTimeout(guideAudioRestoreTimerRef.current);
        guideAudioRestoreTimerRef.current = null;
      }
      if (!guideAudioMutedRef.current) {
        guideAudioMutedRef.current = true;
        sendToGodot('set_sound_enabled', { enabled: false });
      }
      return undefined;
    }
    if (guideAudioMutedRef.current && !guideAudioRestoreTimerRef.current) {
      guideAudioRestoreTimerRef.current = setTimeout(() => {
        guideAudioRestoreTimerRef.current = null;
        if (!guideAudioMutedRef.current) return;
        guideAudioMutedRef.current = false;
        sendToGodot('set_sound_enabled', { enabled: readSoundEnabled() });
      }, 750);
    }
    return undefined;
  }, [ready, sendToGodot, tutorialPhase]);

  useEffect(() => () => {
    if (guideAudioRestoreTimerRef.current) {
      clearTimeout(guideAudioRestoreTimerRef.current);
      guideAudioRestoreTimerRef.current = null;
    }
    if (guideAudioMutedRef.current) {
      guideAudioMutedRef.current = false;
      sendToGodot('set_sound_enabled', { enabled: readSoundEnabled() });
    }
  }, [sendToGodot]);

  // Trigger attack tutorial on first enemy mode
  useEffect(() => {
    if (enemyMode?.active && tutorialFlags !== null && !(tutorialFlags & FLAG_ATTACK)) {
      setTutorialPhase('attack');
    }
  }, [enemyMode?.active, setTutorialPhase, tutorialFlags]);

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

  useEffect(() => {
    if (!solanaMobileReady || !isSolanaMobile) return;
    const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
    if (!token) return;
    const key = `${token}|${seekerHandle?.full || ''}`;
    if (seekerMarkRef.current === key) return;
    seekerMarkRef.current = key;
    fetch('/api/players/device-capability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-token': token },
      body: JSON.stringify({
        is_seeker: true,
        seeker_source: 'solana_mobile',
        seeker_id: seekerHandle?.full || seekerHandle?.name || '',
      }),
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((data) => {
      addClientBreadcrumb('seeker.capability_marked', {
        seeker_id: data?.seeker_id || seekerHandle?.full || null,
      });
    }).catch((e) => {
      seekerMarkRef.current = '';
      console.warn('[GameUI] Seeker capability mark failed:', e?.message || e);
    });
  }, [solanaMobileReady, isSolanaMobile, player?.token, seekerHandle?.full, seekerHandle?.name]);

  const handleCloseShop = useCallback(() => {
    setShopOpen(false);
    sendToGodot('close_shop');
  }, [setShopOpen, sendToGodot]);

  const handleCloseTroops = useCallback(() => setShowTroops(false), []);
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
      if (flag === FLAG_ATTACK || enemyMode?.active) return;
      if (!(newFlags & FLAG_ARMY)) setTutorialPhase('army');
      else if (!(newFlags & FLAG_TRADE)) setTutorialPhase('trade');
      else if (!(newFlags & FLAG_VIDEO)) setTutorialPhase('video');
    }, 500);
  }, [enemyMode?.active, tutorialFlags, setTutorialFlags, setTutorialPhase]);

  const handleTutorialSkip = useCallback((flag) => {
    // Skip marks as complete too
    handleTutorialComplete(flag);
  }, [handleTutorialComplete]);



  if (!ready) return null;

  if (showRegister && !isLocalAuthBypassEnabled()) {
    return <RegisterPanel />;
  }

  // Hide all UI during cloud transition
  if (cloudVisible) return null;

  return (
    <div style={styles.overlay}>
      {!enemyMode?.active && <ResourceBar />}
      {!enemyMode?.active && <PlayerInfo onOpenProfile={() => setShowProfile(true)} onOpenLeaderboard={() => setShowLeaderboard(true)} />}
      {!enemyMode?.active && (
        <NftGoldBoostButton placement="side" />
      )}
      {!enemyMode?.active && <FeedbackButton />}
      {canShowAiChatButton && (() => {
        // Mirror ActionButtons sizing so we land cleanly between the
        // SHOP / TRADE columns regardless of which phone the player has.
        // btnSize/btnSmall here match ActionButtons.jsx exactly.
        const baseAnchor = isMobile ? 8 : 12;
        const baseGap = isMobile ? 8 : 12;
        const tradeSize = Math.round((isMobile ? 110 : 140) * actionScale);
        const sideSize = Math.round((isMobile ? 88 : 110) * actionScale);
        const aiSize = Math.round(54 * actionScale);
        // Vertical center of the side buttons (SHOP / Tournament etc):
        //   sideBottom + sideSize/2
        // Match AI center to it: aiBottom + aiSize/2 = sideBottom + sideSize/2
        const aiBottom = baseAnchor + Math.round((sideSize - aiSize) / 2);
        const aiRight = baseAnchor + tradeSize + baseGap;
        return (
          <button
            style={{
              ...styles.aiChatButton,
              width: aiSize,
              height: aiSize,
              bottom: aiBottom,
              right: aiRight,
              top: 'auto',
              left: 'auto',
            }}
            onClick={() => setShowAiChat(true)}
            title="Open ClashHermes chat"
            aria-label="Open ClashHermes chat"
          >
            <img
              src="/icons/ai-agent.png"
              alt=""
              style={styles.aiChatButtonImg}
              draggable={false}
            />
          </button>
        );
      })()}
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
  // inline `bottom`/`right` overrides in the render. Brown frame with a
  // custom AI-agent portrait inside, sized to pair with the 54px
  // TOURNAMENT / NFT side buttons.
  aiChatButton: {
    position: 'fixed',
    // Size is set inline so it tracks isMobile / matches btnSmall in
    // ActionButtons. No hard width/height here.
    pointerEvents: 'auto',
    zIndex: 20,
    borderRadius: 14,
    border: '3px solid #5C3A21',
    background: '#fff6dc',
    boxShadow: '0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
    padding: 0,
    overflow: 'hidden',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiChatButtonImg: {
    width: '100%', height: '100%',
    objectFit: 'cover',
    display: 'block',
    // Inner radius matches the button after the 3px border subtraction
    // so the image hugs the frame cleanly without a visible seam.
    borderRadius: 11,
    userSelect: 'none',
    pointerEvents: 'none',
  },
};
