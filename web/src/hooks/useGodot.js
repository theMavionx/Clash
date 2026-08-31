import { useEffect, useState, useCallback, useRef, createContext, useContext, useMemo, createElement } from 'react';
import { setClientActivity } from '../lib/updateCoordinator';
import { credentialVault } from '../lib/encryptedCredentialStorage';

// Separate contexts so components only re-render when their slice changes
const SendContext = createContext(null);
const ResourcesContext = createContext(null);
const PlayerContext = createContext(null);
const BuildingDefsContext = createContext(null);
const SelectedBuildingContext = createContext(null);
const UIContext = createContext(null);
const TutorialContext = createContext(null);

const TUTORIAL_FLAG_BASE = 1;
const TUTORIAL_FLAG_ARMY = 2;
const TUTORIAL_FLAG_TRADE = 8;
const TUTORIAL_FLAG_VIDEO = 16;

function shallowEqualObject(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key => a[key] === b[key]);
}

const REPLAY_TELEMETRY_ENABLED = false;
const QUEUEABLE_BRIDGE_ACTIONS = new Set(['ui_overlay', 'set_sound_enabled']);
const PENDING_BRIDGE_ACTIONS = new Map();

function isNftBackedTroopName(name) {
  const normalized = String(name || '').trim().toLowerCase().replace(/[_\s-]/g, '');
  return normalized === 'demonking'
    || normalized === 'firedragon'
    || String(name || '').trim().startsWith('DemonKing:')
    || String(name || '').trim().startsWith('FireDragon:');
}

function normalizeTroopLevelKey(name) {
  const normalized = String(name || '').trim().toLowerCase().replace(/[_\s-]/g, '');
  if (normalized === 'demonking') return 'DemonKing';
  if (normalized === 'firedragon') return 'FireDragon';
  if (normalized === 'necromancer' || normalized === 'skeletonmage') return 'Necromancer';
  if (normalized === 'horror' || normalized === 'horrorevolution') return 'Horror';
  if (normalized === 'mechanicaldragon' || normalized === 'mechdragon') return 'MechanicalDragon';
  if (normalized === 'icegolem') return 'IceGolem';
  if (normalized === 'windmage') return 'WindMage';
  if (normalized === 'peashooter') return 'PeaShooter';
  if (normalized === 'knight') return 'Knight';
  if (normalized === 'mage') return 'Mage';
  if (normalized === 'barbarian') return 'Barbarian';
  if (normalized === 'archer') return 'Archer';
  if (normalized === 'mimic') return 'Mimic';
  if (normalized === 'ranger') return 'Ranger';
  return String(name || '').trim();
}

function normalizeTroopLevels(payload) {
  const next = {};
  if (Array.isArray(payload)) {
    payload.forEach((row) => {
      const key = normalizeTroopLevelKey(row?.troop_type || row?.troopName || row?.name);
      if (key) next[key] = Number(row?.level) || 1;
    });
    return next;
  }
  Object.entries(payload || {}).forEach(([name, level]) => {
    const key = normalizeTroopLevelKey(name);
    if (key) next[key] = Number(level) || 1;
  });
  return next;
}

function postReplayTelemetry(data, tokenOverride = null) {
  // Replay telemetry upload is intentionally disabled for now. Godot can still
  // collect local combat diagnostics, but the browser no longer posts the large
  // event payloads to `/api/replay-telemetry`.
  if (!REPLAY_TELEMETRY_ENABLED) return true;

  const token = tokenOverride || window._playerToken;
  if (!token) {
    return false;
  }
  const body = JSON.stringify(data || {});
  fetch('/api/replay-telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-token': token },
    body,
  }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.info('[replay_telemetry] stored', data?.replay || {}, data?.summary || {}, { bytes: body.length });
  }).catch((err) => {
    console.warn('[replay_telemetry] failed', err?.message || err);
  });
  return true;
}

export function GodotProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [playerState, setPlayerState] = useState(null);
  const [resources, setResources] = useState({ gold: 0, wood: 0, ore: 0 });
  const [buildingDefs, setBuildingDefs] = useState({ buildings: {}, troops: {}, placed_counts: {} });
  const [troopLevels, setTroopLevels] = useState({});
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [flamethrowerFacingEditor, setFlamethrowerFacingEditor] = useState({ active: false });
  const [shopOpen, setShopOpen] = useState(false);
  const [enemyMode, setEnemyMode] = useState({ active: false });
  const [error, setError] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [collectibles, setCollectibles] = useState([]);
  const [cloudVisible, setCloudVisible] = useState(false);
  const [cloudMessage, setCloudMessage] = useState('');
  const [futuresOpen, setFuturesOpen] = useState(false);
  const [cannonMode, setCannonMode] = useState(false);
  const [rallyMode, setRallyMode] = useState(false);
  const [medkitMode, setMedkitMode] = useState(false);
  const [freezeMode, setFreezeMode] = useState(false);
  const [rageMode, setRageMode] = useState(false);
  const [skeletonBarrelMode, setSkeletonBarrelMode] = useState(false);
  const [selectedTroopIdx, setSelectedTroopIdx] = useState(0);
  const [battleResult, setBattleResult] = useState(null);
  const [pendingCasualties, setPendingCasualties] = useState(null);
  const [battleTimer, setBattleTimer] = useState(null); // seconds remaining, null = no timer
  const [cannonEnergy, setCannonEnergy] = useState({
    energy: 0,
    nextCost: 1,
    rallyNextCost: 1,
    medkitCost: 6,
    medkitUnlocked: false,
    freezeCost: 5,
    freezeUnlocked: false,
    rageCost: 7,
    rageUnlocked: false,
    skeletonBarrelCost: 8,
    skeletonBarrelUnlocked: false,
  });
  const [fleetInfo, setFleetInfo] = useState(null);
  // Fallback matches TH1 base capacity (server/db.js + building_system.gd).
  // Godot pushes real caps via `resource_caps` on boot; this default only
  // covers the first render before that message lands, so keep it in sync
  // so the HUD never briefly shows a smaller cap than the server enforces.
  const [resourceCaps, setResourceCaps] = useState({ gold: 10000, wood: 10000, ore: 10000 });
  const resourceCapsRef = useRef({ gold: 10000, wood: 10000, ore: 10000 });
  const errorTimerRef = useRef(null);
  const [tutorialFlags, setTutorialFlags] = useState(0xFF); // default all done, server overrides
  const [tutorialPhase, setTutorialPhase] = useState(null); // 'base'|'army'|'attack'|'trade'|'video'|null
  // Remember the token the last fetch was keyed on — re-fetch when it changes
  // (logout→register, account switch, session swap). A boolean "fetched once"
  // flag would miss these transitions and leave a fresh account with the
  // previous account's tutorial flags (0xFF if previous one was completed),
  // so new-account tutorials would never appear.
  const tutorialTokenRef = useRef(null);
  const playerTokenRef = useRef(null);
  const replayTelemetryQueueRef = useRef([]);

  const flushReplayTelemetryQueue = useCallback(() => {
    const token = playerTokenRef.current || window._playerToken;
    if (!token || replayTelemetryQueueRef.current.length === 0) return;
    const queued = replayTelemetryQueueRef.current.splice(0);
    queued.forEach((item) => postReplayTelemetry(item, token));
  }, []);

  useEffect(() => {
    const handlePlayerPatch = (event) => {
      const patch = event?.detail || {};
      if (Object.prototype.hasOwnProperty.call(patch, 'token') && patch.token !== window._playerToken) credentialVault.lock({ revoke: false });
      setPlayerState(prev => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        if (shallowEqualObject(next, prev)) return prev;
        return next;
      });
    };
    window.addEventListener('clash-player-patch', handlePlayerPatch);

    const handleGodotMessage = (msg) => {
      const { action, data } = msg;
      const notifyGodotUiReady = (reason) => {
        try {
          window.dispatchEvent(new CustomEvent('clash-godot-ui-ready', {
            detail: { reason, action, data: data || {} },
          }));
        } catch {
          // Loader recovery is best-effort.
        }
      };
      switch (action) {
        case 'godot_ready':
          notifyGodotUiReady('godot_ready');
          setReady(true);
          break;
        case 'state':
          if (Object.prototype.hasOwnProperty.call(data, 'token') && data.token !== window._playerToken) {
            credentialVault.lock({ revoke: !data.token });
          }
          notifyGodotUiReady('state');
          setPlayerState(prev => {
            const next = { ...(prev || {}), ...data };
            if (shallowEqualObject(next, prev)) return prev;
            return next;
          });
          if (Object.prototype.hasOwnProperty.call(data, 'token')) {
            if (data.token) {
              window._playerToken = data.token;
              playerTokenRef.current = data.token;
              flushReplayTelemetryQueue();
            } else {
              // Logout (js_bridge emits empty token on _do_logout). Do not
              // clear the token for ordinary state patches that omit `token`,
              // such as building sync messages during replay playback.
              window._playerToken = null;
              playerTokenRef.current = null;
              tutorialTokenRef.current = null;
              setTutorialFlags(0xFF);
              setTutorialPhase(null);
              break;
            }
            // Fetch tutorial progress per-token (Godot bridge doesn't include it).
            // Re-fetch when the token CHANGES so logout→register and account
            // switches hydrate the new account's flags; a plain "once" gate
            // would leave a fresh account showing the previous session's
            // completed state and the tutorial would silently be hidden.
            if (tutorialTokenRef.current !== data.token) {
              tutorialTokenRef.current = data.token;
              const tokenForFetch = data.token;
              const doFetch = () => {
                fetch('/api/tutorial', { headers: { 'x-token': tokenForFetch } })
                  .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                  .then(res => {
                    // Stale-response guard: if another token swap happened while
                    // this was in flight, drop the result.
                    if (tutorialTokenRef.current !== tokenForFetch) return;
                    const flags = res.tutorial_flags ?? 0xFF;
                    setTutorialFlags(flags);
                    if (!(flags & TUTORIAL_FLAG_BASE)) setTutorialPhase('base');
                    else if (!(flags & TUTORIAL_FLAG_ARMY)) setTutorialPhase('army');
                    else if (!(flags & TUTORIAL_FLAG_TRADE)) setTutorialPhase('trade');
                    else if (!(flags & TUTORIAL_FLAG_VIDEO)) setTutorialPhase('video');
                    else setTutorialPhase(null);
                  }).catch(() => {});
              };
              // Delay fetch so it doesn't block initial render, but force
              // firing within 800ms so a busy main thread (Godot startup,
              // shader compile) can't indefinitely starve the tutorial load
              // — without the `timeout` option requestIdleCallback may never
              // fire on slow devices and the overlay would never appear.
              if (window.requestIdleCallback) window.requestIdleCallback(doFetch, { timeout: 800 });
              else setTimeout(doFetch, 500);
            }
            // Hydrate server-only purchase/entitlement state. Godot's bridge
            // boot payload is intentionally small, so paid utility unlocks
            // such as the Altar come from /api/state and are pushed back into
            // Godot for client-side placement gating.
            const shieldFetchToken = data.token;
            fetch('/api/state', { headers: { 'x-token': shieldFetchToken } })
              .then(r => r.ok ? r.json() : null)
              .then(state => {
                if (!state) return;
                if (window._playerToken !== shieldFetchToken) return;
                const entitlementPatch = {
                  shield_until: state.shield_until || null,
                  shop_entitlements: state.shop_entitlements || {},
                  building_unlocks: state.building_unlocks || {},
                  altar: state.altar || null,
                };
                setPlayerState(prev => {
                  if (!prev) return prev;
                  const sameShield = prev.shield_until === entitlementPatch.shield_until;
                  const sameShop = JSON.stringify(prev.shop_entitlements || {}) === JSON.stringify(entitlementPatch.shop_entitlements);
                  const sameUnlocks = JSON.stringify(prev.building_unlocks || {}) === JSON.stringify(entitlementPatch.building_unlocks);
                  const sameAltar = JSON.stringify(prev.altar || null) === JSON.stringify(entitlementPatch.altar);
                  if (sameShield && sameShop && sameUnlocks && sameAltar) return prev;
                  return { ...prev, ...entitlementPatch };
                });
                try {
                  window.godotBridge?.(JSON.stringify({ action: 'set_shop_unlocks', data: entitlementPatch }));
                } catch {}
              })
              .catch(() => {});
            fetch('/api/troops', { cache: 'no-store', headers: { 'x-token': shieldFetchToken } })
              .then(r => r.ok ? r.json() : null)
              .then(rows => {
                if (!rows || window._playerToken !== shieldFetchToken) return;
                setTroopLevels(normalizeTroopLevels(rows));
              })
              .catch(() => {});
          }
          break;
        case 'resources':
          setResources(prev => {
            if (prev.gold === data.gold && prev.wood === data.wood && prev.ore === data.ore) return prev;
            return data;
          });
          break;
        case 'resources_add':
          setResources(prev => {
            const caps = resourceCapsRef.current;
            const gold = Math.min(caps.gold, (prev.gold || 0) + (data.gold || 0));
            const wood = Math.min(caps.wood, (prev.wood || 0) + (data.wood || 0));
            const ore = Math.min(caps.ore, (prev.ore || 0) + (data.ore || 0));
            if (gold === prev.gold && wood === prev.wood && ore === prev.ore) return prev;
            return { gold, wood, ore };
          });
          break;
        case 'building_defs':
          setBuildingDefs(data);
          break;
        case 'placed_counts':
          setBuildingDefs(prev => {
            if (shallowEqualObject(prev.placed_counts, data)) return prev;
            return { ...prev, placed_counts: data };
          });
          break;
        case 'troop_levels':
          setTroopLevels(normalizeTroopLevels(data));
          break;
        case 'demon_king_upgrade_required':
          window.dispatchEvent(new CustomEvent('clash-open-nft-shop', {
            detail: { view: 'shop', request: data || {} },
          }));
          break;
        case 'building_selected':
          setSelectedBuilding(data);
          break;
        case 'ship_updated':
          setSelectedBuilding(prev => prev ? {
            ...prev,
            ...data,
            ship_update_nonce: (Number(prev.ship_update_nonce) || 0) + 1,
          } : prev);
          break;
        case 'building_deselected':
          setSelectedBuilding(null);
          break;
        case 'flamethrower_facing_editor':
          setFlamethrowerFacingEditor(data?.active ? data : { active: false });
          break;
        case 'shop_toggled':
          setShopOpen(data.open);
          break;
        case 'enemy_mode':
          setEnemyMode(data);
          setClientActivity({ critical_action: !!data.active });
          if (data.active) {
            setFleetInfo(null);
            setCannonEnergy({
              energy: 0,
              nextCost: 1,
              rallyNextCost: 1,
              medkitCost: 6,
              medkitUnlocked: false,
              freezeCost: 5,
              freezeUnlocked: false,
              rageCost: 7,
              rageUnlocked: false,
              skeletonBarrelCost: 8,
              skeletonBarrelUnlocked: false,
            });
            setBattleResult(null);
            setCannonMode(false);
            setRallyMode(false);
            setMedkitMode(false);
            setFreezeMode(false);
            setRageMode(false);
            setSkeletonBarrelMode(false);
          }
          if (!data.active) {
            setSelectedBuilding(null);
            setCannonMode(false);
            setRallyMode(false);
            setMedkitMode(false);
            setFreezeMode(false);
            setRageMode(false);
            setSkeletonBarrelMode(false);
            setSelectedTroopIdx(0);
            setBattleTimer(null);
            setFleetInfo(null);
          }
          break;
        case 'troop_idx_changed':
          setSelectedTroopIdx(data.idx ?? 0);
          break;
        case 'cannon_mode':
          setCannonMode(data.active);
          break;
        case 'rally_mode':
          setRallyMode(data.active);
          break;
        case 'medkit_mode':
          setMedkitMode(data.active);
          break;
        case 'freeze_mode':
          setFreezeMode(data.active);
          break;
        case 'rage_mode':
          setRageMode(data.active);
          break;
        case 'skeleton_barrel_mode':
          setSkeletonBarrelMode(data.active);
          break;
        case 'battle_result':
          setBattleResult(data);
          setBattleTimer(null);
          setFleetInfo(null);
          setClientActivity({ critical_action: false });
          if (Object.prototype.hasOwnProperty.call(data || {}, 'trophies')) {
            setPlayerState(prev => {
              if (!prev || prev.trophies === data.trophies) return prev;
              return { ...prev, trophies: data.trophies };
            });
          }
          if (data.casualties) {
            const paidCasualties = Object.fromEntries(
              Object.entries(data.casualties).filter(([name, count]) => !isNftBackedTroopName(name) && count > 0),
            );
            setPendingCasualties(Object.values(paidCasualties).some(c => c > 0) ? paidCasualties : null);
          }
          break;
        case 'replay_telemetry':
          if (!postReplayTelemetry(data, playerTokenRef.current || window._playerToken)) {
            replayTelemetryQueueRef.current.push(data);
            if (replayTelemetryQueueRef.current.length > 20) replayTelemetryQueueRef.current.shift();
            console.warn('[replay_telemetry] queued: no player token yet', data?.replay || {});
          }
          break;
        case 'battle_timer':
          setBattleTimer(prev => {
            const next = data.remaining ?? null;
            if (prev === next) return prev;
            return next;
          });
          break;
        case 'troop_died':
          // Casualties are authoritative only in battle_result.casualties.
          // Older Godot builds may still emit troop_died events; ignore them
          // so the reinforcement counter cannot double-count the same match.
          break;
        case 'reinforced':
          setPendingCasualties(null);
          break;
        case 'cannon_energy':
          setCannonEnergy(prev => {
            const energy = data.energy || 0;
            const nextCost = data.next_cost || 1;
            const rallyNextCost = data.rally_next_cost || 1;
            const medkitCost = data.medkit_cost || 6;
            const medkitUnlocked = !!data.medkit_unlocked;
            const freezeCost = data.freeze_cost || 5;
            const freezeUnlocked = !!data.freeze_unlocked;
            const rageCost = data.rage_cost || 7;
            const rageUnlocked = !!data.rage_unlocked;
            const skeletonBarrelCost = data.skeleton_barrel_cost || 8;
            const skeletonBarrelUnlocked = !!data.skeleton_barrel_unlocked;
            if (
              prev.energy === energy
              && prev.nextCost === nextCost
              && prev.rallyNextCost === rallyNextCost
              && prev.medkitCost === medkitCost
              && prev.medkitUnlocked === medkitUnlocked
              && prev.freezeCost === freezeCost
              && prev.freezeUnlocked === freezeUnlocked
              && prev.rageCost === rageCost
              && prev.rageUnlocked === rageUnlocked
              && prev.skeletonBarrelCost === skeletonBarrelCost
              && prev.skeletonBarrelUnlocked === skeletonBarrelUnlocked
            ) return prev;
            return {
              energy,
              nextCost,
              rallyNextCost,
              medkitCost,
              medkitUnlocked,
              freezeCost,
              freezeUnlocked,
              rageCost,
              rageUnlocked,
              skeletonBarrelCost,
              skeletonBarrelUnlocked,
            };
          });
          break;
        case 'fleet_info':
          setFleetInfo(data);
          if (Number.isInteger(Number(data?.selected_group))) {
            setSelectedTroopIdx(Math.max(0, Number(data.selected_group)));
          }
          break;
        case 'resource_caps':
          setResourceCaps(prev => {
            const gold = data.gold || 10000, wood = data.wood || 10000, ore = data.ore || 10000;
            if (prev.gold === gold && prev.wood === wood && prev.ore === ore) return prev;
            const next = { gold, wood, ore };
            resourceCapsRef.current = next;
            return next;
          });
          break;
        case 'th_info':
          setBuildingDefs(prev => {
            const th_level = data.level || 1, th_progress = data.progress || 0, th_progress_total = data.progress_total || 0;
            const th_unlock = data.unlock || {};
            const th_max_counts = data.max_counts || {};
            const th_live_cap = Number(data.live_cap) || 7;
            const sameUnlocks = JSON.stringify(prev.th_unlock || {}) === JSON.stringify(th_unlock);
            const sameMaxCounts = JSON.stringify(prev.th_max_counts || {}) === JSON.stringify(th_max_counts);
            if (prev.th_level === th_level && prev.th_live_cap === th_live_cap && prev.th_progress === th_progress && prev.th_progress_total === th_progress_total && sameUnlocks && sameMaxCounts) return prev;
            return { ...prev, th_level, th_live_cap, th_unlock: data.unlock || {}, th_max_counts: data.max_counts || {}, th_progress, th_progress_total };
          });
          break;
        case 'error':
          setError(data.message);
          if (/nickname is already taken|name must be at least 2 characters/i.test(String(data?.message || ''))) {
            try {
              window.dispatchEvent(new CustomEvent('clash-auth-error', { detail: data || {} }));
            } catch {
              // Global error UI still handles it.
            }
          }
          if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
          errorTimerRef.current = setTimeout(() => setError(null), 3000);
          break;
        case 'auth_error':
          try {
            window.dispatchEvent(new CustomEvent('clash-auth-error', { detail: data || {} }));
          } catch {
            // Event dispatch is best-effort; global error UI still handles it.
          }
          break;
        case 'show_register':
          notifyGodotUiReady('show_register');
          setShowRegister(true);
          break;
        case 'registered':
          notifyGodotUiReady('registered');
          if (data.success) setShowRegister(false);
          break;
        case 'placement_started':
          setShopOpen(false);
          break;
        case 'collectible_resources':
          setCollectibles(prev => {
            const next = data.buildings || [];
            if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) return prev;
            return next;
          });
          break;
        case 'cloud_transition':
          setCloudVisible(data.visible);
          setCloudMessage(data.visible ? (data.message || '') : '');
          break;
        case 'perf':
          // Throttle perf events — Godot sends at frame rate but React only needs ~4/sec
          if (!window._lastPerfDispatch || Date.now() - window._lastPerfDispatch >= 250) {
            window._lastPerfDispatch = Date.now();
            window.dispatchEvent(new CustomEvent('godot-perf', { detail: data }));
          }
          break;
      }
    };
    window.onGodotMessage = handleGodotMessage;
    return () => {
      window.removeEventListener('clash-player-patch', handlePlayerPatch);
      if (window.onGodotMessage === handleGodotMessage) window.onGodotMessage = null;
      if (window._playerToken === tutorialTokenRef.current) window._playerToken = null;
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [flushReplayTelemetryQueue]);

  useEffect(() => {
    const flushPendingBridgeActions = () => {
      if (!window.godotBridge) return;
      for (const [action, data] of PENDING_BRIDGE_ACTIONS) {
        window.godotBridge(JSON.stringify({ action, data }));
      }
      PENDING_BRIDGE_ACTIONS.clear();
    };
    window.addEventListener('clash-godot-bridge-ready', flushPendingBridgeActions);
    flushPendingBridgeActions();
    return () => window.removeEventListener('clash-godot-bridge-ready', flushPendingBridgeActions);
  }, []);

  const sendToGodot = useCallback((action, data = {}) => {
    if (window.godotBridge) {
      window.godotBridge(JSON.stringify({ action, data }));
      return true;
    }
    if (QUEUEABLE_BRIDGE_ACTIONS.has(action)) {
      PENDING_BRIDGE_ACTIONS.set(action, data);
      return true;
    }
    console.warn('[godot] bridge not ready for action', action);
    return false;
  }, []);

  // Stable context objects — only re-created when their specific values change
  const sendCtx = useMemo(() => ({ sendToGodot, setShopOpen, setFuturesOpen }), [sendToGodot, setShopOpen, setFuturesOpen]);
  const playerCtx = useMemo(() => playerState, [playerState]);
  const resourcesCtx = useMemo(() => ({ ...resources, caps: resourceCaps }), [resources, resourceCaps]);
  const buildingDefsCtx = useMemo(() => ({
    buildingDefs, troopLevels,
  }), [buildingDefs, troopLevels]);
  const selectedBuildingCtx = useMemo(() => ({
    selectedBuilding,
  }), [selectedBuilding]);
  const uiCtx = useMemo(() => ({
    ready, shopOpen, enemyMode, error, showRegister, collectibles, cloudVisible, cloudMessage, futuresOpen, cannonMode, rallyMode, medkitMode, freezeMode, rageMode, skeletonBarrelMode, selectedTroopIdx, battleResult, setBattleResult, cannonEnergy, fleetInfo, pendingCasualties, setPendingCasualties, battleTimer, flamethrowerFacingEditor
  }), [ready, shopOpen, enemyMode, error, showRegister, collectibles, cloudVisible, cloudMessage, futuresOpen, cannonMode, rallyMode, medkitMode, freezeMode, rageMode, skeletonBarrelMode, selectedTroopIdx, battleResult, cannonEnergy, fleetInfo, pendingCasualties, battleTimer, flamethrowerFacingEditor]);
  const tutorialCtx = useMemo(() => ({
    tutorialFlags, tutorialPhase, setTutorialFlags, setTutorialPhase
  }), [tutorialFlags, tutorialPhase]);

  // Nested providers using createElement (no JSX needed in .js file)
  return createElement(SendContext.Provider, { value: sendCtx },
    createElement(UIContext.Provider, { value: uiCtx },
      createElement(ResourcesContext.Provider, { value: resourcesCtx },
        createElement(PlayerContext.Provider, { value: playerCtx },
          createElement(BuildingDefsContext.Provider, { value: buildingDefsCtx },
            createElement(SelectedBuildingContext.Provider, { value: selectedBuildingCtx },
              createElement(TutorialContext.Provider, { value: tutorialCtx },
                children
              )
            )
          )
        )
      )
    )
  );
}

// Granular hooks — components subscribe to exactly what they need
export function useSend() { return useContext(SendContext); }
export function useResources() { return useContext(ResourcesContext); }
export function usePlayer() { return useContext(PlayerContext); }
export function useBuildingDefs() { return useContext(BuildingDefsContext); }
export function useSelectedBuilding() { return useContext(SelectedBuildingContext); }
export function useUI() { return useContext(UIContext); }
export function useTutorial() { return useContext(TutorialContext); }
