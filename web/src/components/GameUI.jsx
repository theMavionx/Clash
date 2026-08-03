import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import ResourceBar from './ResourceBar';
import PlayerInfo from './PlayerInfo';
import ActionButtons from './ActionButtons';
import ShopPanel from './ShopPanel';
import BuildingInfoPanel from './BuildingInfoPanel';
import FlamethrowerFacingControls from './FlamethrowerFacingControls';
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
import { useSolanaMobile } from '../hooks/useSolanaMobile';
import { useSkrHandle } from '../hooks/useSkrHandle';
import { getAvailableDexConfigs, isDexAvailableInContext, useDex } from '../contexts/DexContext';
import ChunkErrorBoundary from './ChunkErrorBoundary';
import { addClientBreadcrumb, lazyWithClientReload } from '../lib/clientLogger';
import { readSoundEnabled } from '../lib/soundSettings';
import {
  readLastPlayerDexPreference,
  readLastPlayerDexPreferenceAsync,
  writeLastPlayerDexPreference,
} from '../lib/lastPlayerDex';

// Heavy components are lazy-loaded — their JS only ships to the user
// when they actually open the relevant UI. Saves ~600KB from the
// initial bundle (FuturesPanel pulls in TradingViewWidget +
// lightweight-charts + all wallet-adapter pickers; the three modals
// each have their own animation/data-fetch chunks).
const FuturesPanel = lazy(lazyWithClientReload(() => import('./FuturesPanel'), 'FuturesPanel'));
const ProfileModal = lazy(lazyWithClientReload(() => import('./ProfileModal'), 'ProfileModal'));
const BattleLogPanel = lazy(lazyWithClientReload(() => import('./BattleLogPanel'), 'BattleLogPanel'));
const LeaderboardPanel = lazy(lazyWithClientReload(() => import('./LeaderboardPanel'), 'LeaderboardPanel'));
const MM_BOTS_BUTTON_CONFIGURED = /^(1|true|yes)$/i.test(String(import.meta.env.VITE_MM_BOTS_BUTTON_ENABLED || ''));
const MM_BOTS_BUTTON_ALLOW_ALL = /^(1|true|yes)$/i.test(String(import.meta.env.VITE_MM_BOTS_BUTTON_ALLOW_ALL || ''));

function parseMmBotsWhitelistEnv(...values) {
  const out = new Set();
  for (const value of values) {
    String(value || '')
      .split(/[,;\n\r]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .forEach((part) => out.add(part));
  }
  return out;
}

const MM_BOTS_BUTTON_WHITELIST = parseMmBotsWhitelistEnv(
  import.meta.env.VITE_MM_BOTS_BUTTON_WHITELIST,
  import.meta.env.VITE_MM_BOTS_BUTTON_WHITELIST_NAMES,
  import.meta.env.VITE_MM_BOTS_BUTTON_WHITELIST_WALLETS,
  import.meta.env.VITE_MM_BOTS_WHITELIST,
  import.meta.env.VITE_MM_BOT_WHITELIST,
);
const BotsPanel = lazy(lazyWithClientReload(() => import('./BotsPanel'), 'BotsPanel'));

const LOCAL_GUEST_DEFAULT_DEX = 'pacifica';

function CloudTransitionStatus({ message }) {
  if (!message) return null;
  return (
    <div style={styles.cloudStatusOverlay}>
      <div style={styles.cloudStatusPanel}>
        <span style={styles.cloudStatusSpinner} />
        <span>{message || 'Finding opponent...'}</span>
      </div>
    </div>
  );
}

function playerCanUseMmBots(player, serverAccess) {
  if (serverAccess?.enabled) return true;
  if (!MM_BOTS_BUTTON_CONFIGURED && !MM_BOTS_BUTTON_ALLOW_ALL && MM_BOTS_BUTTON_WHITELIST.size === 0) return false;
  if (MM_BOTS_BUTTON_ALLOW_ALL) return true;
  if (MM_BOTS_BUTTON_WHITELIST.size === 0) return false;
  const candidates = [
    player?.id,
    player?.name,
    player?.player_name,
    player?.username,
    player?.display_name,
    player?.wallet,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  return candidates.some((value) => MM_BOTS_BUTTON_WHITELIST.has(value));
}

function isLocalBrowserHost() {
  if (typeof window === 'undefined') return false;
  const host = String(window.location?.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function currentUrlRequestsLocalGuest() {
  if (typeof window === 'undefined') return false;
  try {
    const value = new URL(window.location.href).searchParams.get('guest');
    return ['1', 'true', 'new'].includes(String(value || '').toLowerCase());
  } catch {
    return false;
  }
}

function localStorageHasLocalGuestMarker() {
  if (typeof window === 'undefined') return false;
  try {
    return !!localStorage.getItem('clash.localGuest');
  } catch {
    return false;
  }
}

function isLocalGuestPlayer(player) {
  const wallet = String(player?.wallet || '');
  const name = String(player?.name || player?.player_name || '');
  return wallet.startsWith('local_guest_') || name.startsWith('Guest_');
}

function shouldBypassVenuePickerForLocalGuest(player) {
  if (!isLocalBrowserHost()) return false;
  return currentUrlRequestsLocalGuest() || localStorageHasLocalGuestMarker() || isLocalGuestPlayer(player);
}

function VenuePickerOverlay({ isSolanaMobile, onPick }) {
  const dexOptions = getAvailableDexConfigs({ isInFrame: false, isSolanaMobile });
  return (
    <div style={venueStyles.overlay}>
      <div style={venueStyles.panel}>
        <div style={venueStyles.header}>CHOOSE TRADING VENUE</div>
        <div style={venueStyles.body}>
          <div style={venueStyles.copy}>
            Your game account is ready. Pick where you want to trade now; you can switch venue later from Trade/Profile without creating a new account.
          </div>
          <div style={venueStyles.grid}>
            {dexOptions.map((cfg) => (
              <button
                key={cfg.id}
                type="button"
                style={{
                  ...venueStyles.card,
                  borderColor: cfg.borderColor,
                  background: `linear-gradient(180deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`,
                }}
                onClick={() => onPick(cfg.id)}
              >
                <span style={{
                  ...venueStyles.logoWrap,
                  ...(cfg.id === 'bulk' ? venueStyles.bulkLogoWrap : null),
                }}>
                  <img
                    src={cfg.logo}
                    alt={cfg.label}
                    style={{
                      ...venueStyles.logo,
                      ...(cfg.id === 'bulk' ? venueStyles.bulkLogo : null),
                    }}
                  />
                </span>
                <span style={venueStyles.cardText}>
                  <strong>{cfg.label}</strong>
                  <small>{cfg.chain}</small>
                </span>
                <span style={venueStyles.chevron}>›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GameUI() {
  const { sendToGodot, setShopOpen } = useSend();
  const { dex, setDex } = useDex();
  const { ready, shopOpen, error, showRegister, cloudVisible, cloudMessage, enemyMode, futuresOpen, battleResult, setBattleResult } = useUI();
  const { tutorialFlags, tutorialPhase, setTutorialFlags, setTutorialPhase } = useTutorial();
  const player = usePlayer();
  const { selectedBuilding } = useSelectedBuilding();
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
  const [showBots, setShowBots] = useState(false);
  const [showVenuePicker, setShowVenuePicker] = useState(false);
  const [mmBotsAccess, setMmBotsAccess] = useState({ loaded: false, enabled: false });
  const canUseMmBots = playerCanUseMmBots(player, mmBotsAccess);

  useEffect(() => {
    const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
    if (!token || showRegister) {
      setMmBotsAccess({ loaded: false, enabled: false });
      return undefined;
    }

    let cancelled = false;
    fetch('/api/mm-bots/access', {
      headers: { 'x-token': token },
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setMmBotsAccess({ loaded: true, enabled: !!data?.enabled });
      })
      .catch((err) => {
        if (cancelled) return;
        addClientBreadcrumb('mm_bots.access_check_failed', { message: err?.message || String(err) });
        setMmBotsAccess({ loaded: true, enabled: false });
      });

    return () => { cancelled = true; };
  }, [player?.id, player?.token, showRegister]);

  useEffect(() => {
    const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
    if (!token || showRegister) return;
    if (!solanaMobileReady) return;
    if (shouldBypassVenuePickerForLocalGuest(player)) {
      setDex(LOCAL_GUEST_DEFAULT_DEX);
      setShowVenuePicker(false);
      addClientBreadcrumb('venue_picker.local_guest_bypass', { dex: LOCAL_GUEST_DEFAULT_DEX });
      return;
    }
    const preferenceOwner = { ...player, token };
    const applySavedDex = (savedDex) => {
      if (!savedDex || !isDexAvailableInContext(savedDex, { isInFrame: false, isSolanaMobile })) return false;
      setDex(savedDex);
      try { localStorage.setItem('clash_dex_picked', '1'); } catch {}
      setShowVenuePicker(false);
      addClientBreadcrumb('venue_picker.skip_saved', { dex: savedDex });
      return true;
    };
    try {
      if (localStorage.getItem('clash_dex_picked') === '1') return;
    } catch {
      // Continue to the saved preference path when storage reads fail.
    }
    if (applySavedDex(readLastPlayerDexPreference(preferenceOwner))) return;
    let cancelled = false;
    readLastPlayerDexPreferenceAsync(preferenceOwner).then((savedDex) => {
      if (cancelled) return;
      if (!applySavedDex(savedDex)) setShowVenuePicker(true);
    });
    return () => { cancelled = true; };
  }, [isSolanaMobile, player, setDex, showRegister, solanaMobileReady]);

  const chooseVenue = useCallback(async (nextDex) => {
    const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
    const previousDex = dex || player?.dex || 'pacifica';
    const preferenceOwner = { ...player, token };
    if (!token) {
      setDex(nextDex);
      writeLastPlayerDexPreference(preferenceOwner, nextDex);
      try { localStorage.setItem('clash_dex_picked', '1'); } catch {}
      setShowVenuePicker(false);
      return;
    }
    try {
      const response = await fetch(`/api/players/dex-accounts/${encodeURIComponent(nextDex)}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Could not switch DEX (${response.status})`);
      }
      const serverDex = data?.player?.dex || data?.dex || nextDex;
      const playerPatch = data?.player && typeof data.player === 'object'
        ? { ...data.player, ...(data?.token ? { token: data.token } : {}) }
        : { dex: serverDex, ...(data?.token ? { token: data.token } : {}) };
      setDex(serverDex);
      writeLastPlayerDexPreference(preferenceOwner, serverDex);
      try { localStorage.setItem('clash_dex_picked', '1'); } catch {}
      window.onGodotMessage?.({ action: 'state', data: playerPatch });
      setShowVenuePicker(false);
      addClientBreadcrumb('venue_picker.select_success', {
        dex: serverDex,
        switched_account: !!data?.switched_account,
      });
    } catch (err) {
      setDex(previousDex);
      writeLastPlayerDexPreference(preferenceOwner, previousDex);
      addClientBreadcrumb('venue_picker.select_failed', {
        requestedDex: nextDex,
        previousDex,
        message: err?.message || String(err || ''),
      }, 'warn');
      window.onGodotMessage?.({
        action: 'error',
        data: { message: err?.message || 'Could not switch DEX. Try again.' },
      });
    }
  }, [dex, player, setDex]);

  useEffect(() => {
    const openVenuePicker = (event) => {
      if (shouldBypassVenuePickerForLocalGuest(player)) {
        setDex(LOCAL_GUEST_DEFAULT_DEX);
        setShowVenuePicker(false);
        addClientBreadcrumb('venue_picker.local_guest_open_blocked', {
          source: event?.detail?.source || 'unknown',
          dex: LOCAL_GUEST_DEFAULT_DEX,
        });
        return;
      }
      addClientBreadcrumb('venue_picker.open', {
        source: event?.detail?.source || 'unknown',
        currentDex: event?.detail?.currentDex || null,
      });
      setShowVenuePicker(true);
    };
    window.addEventListener('clash-open-venue-picker', openVenuePicker);
    return () => window.removeEventListener('clash-open-venue-picker', openVenuePicker);
  }, [player, setDex]);

  useEffect(() => {
    if (!selectedBuilding) setShowTroops(false);
  }, [selectedBuilding]);

  useEffect(() => {
    if (!canUseMmBots && showBots) setShowBots(false);
  }, [canUseMmBots, showBots]);

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
  const barnOpen = showTroops;
  const anyPanelOpen = !!(futuresOpen || shopOpen || barnOpen || showProfile || showBattleLog || showLeaderboard || (canUseMmBots && showBots));
  const showFloatingUtilities = !enemyMode?.active && !anyPanelOpen;
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
    if (showBots) addClientBreadcrumb('ui.panel_open', { panel: 'bots' });
  }, [showBots]);

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

  if (showRegister) {
    return <RegisterPanel />;
  }

  // Hide normal HUD during cloud transition, but keep a small status above
  // the Godot cloud canvas so long waits do not feel frozen.
  if (cloudVisible) return <CloudTransitionStatus message={cloudMessage} />;

  return (
    <div style={styles.overlay}>
      {!enemyMode?.active && <ResourceBar />}
      {!enemyMode?.active && <PlayerInfo onOpenProfile={() => setShowProfile(true)} onOpenLeaderboard={() => setShowLeaderboard(true)} />}
      {showFloatingUtilities && (
        <NftGoldBoostButton placement="side" />
      )}
      {showFloatingUtilities && <FeedbackButton />}
      {showVenuePicker && (
        <VenuePickerOverlay
          isSolanaMobile={isSolanaMobile}
          onPick={chooseVenue}
        />
      )}
      <ActionButtons
        onOpenBattleLog={() => setShowBattleLog(true)}
        onOpenBots={canUseMmBots ? () => setShowBots(true) : null}
      />
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

          {canUseMmBots && showBots && (
            <BotsPanel onClose={() => setShowBots(false)} />
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
      <FlamethrowerFacingControls />
    </div>
  );
}

const venueStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)',
    padding: 12,
  },
  panel: {
    width: 'min(760px, 94vw)',
    maxHeight: 'calc(100vh - 24px)',
    background: '#ebdaba',
    border: '4px solid #377d9f',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 0 0 4px #ebdaba',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    height: 54,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#4ca5d2',
    borderBottom: '4px solid #377d9f',
    color: '#fff',
    fontSize: 22,
    fontStyle: 'italic',
    fontWeight: 900,
    textShadow: '0 2px 4px rgba(0,0,0,0.6)',
  },
  body: {
    padding: 18,
    overflowY: 'auto',
  },
  copy: {
    color: '#5b432c',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.35,
    marginBottom: 14,
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 12,
  },
  card: {
    minHeight: 76,
    border: '3px solid #5C3A21',
    borderRadius: 8,
    padding: '10px 12px',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    boxShadow: '0 5px 0 rgba(0,0,0,0.25), 0 7px 14px rgba(0,0,0,0.25)',
    textAlign: 'left',
  },
  logoWrap: {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
  },
  logo: {
    maxWidth: 44,
    maxHeight: 32,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
  },
  // Bulk publishes a 2:1 wordmark rather than a square icon. Giving it a
  // matching slot keeps the official mark legible instead of shrinking it
  // into the square logo footprint used by the other venues.
  bulkLogoWrap: {
    width: 96,
    height: 40,
    overflow: 'hidden',
  },
  bulkLogo: {
    width: 96,
    height: 32,
    maxWidth: 96,
    maxHeight: 32,
    objectFit: 'cover',
  },
  cardText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    fontWeight: 900,
    textShadow: '0 2px 0 rgba(0,0,0,0.35)',
    flex: 1,
  },
  chevron: {
    fontSize: 36,
    fontWeight: 900,
    lineHeight: 1,
    textShadow: '0 2px 0 rgba(0,0,0,0.35)',
  },
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 5,
  },
  cloudStatusOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 15,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  cloudStatusPanel: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    maxWidth: 'min(360px, 88vw)',
    padding: '10px 16px',
    borderRadius: 8,
    border: '3px solid rgba(92,58,33,0.82)',
    background: 'rgba(246,232,196,0.92)',
    color: '#5C3A21',
    fontSize: 17,
    fontWeight: 900,
    textAlign: 'center',
    textShadow: '0 1px 0 rgba(255,255,255,0.65)',
    boxShadow: '0 6px 18px rgba(0,0,0,0.26)',
  },
  cloudStatusSpinner: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: '3px solid rgba(92,58,33,0.25)',
    borderTopColor: '#5C3A21',
    animation: 'spin 0.8s linear infinite',
    flex: '0 0 auto',
  },
};
