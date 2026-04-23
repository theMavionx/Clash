import { useEffect, useState, useCallback, useRef, createContext, useContext, useMemo, createElement } from 'react';

// Separate contexts so components only re-render when their slice changes
const SendContext = createContext(null);
const ResourcesContext = createContext(null);
const PlayerContext = createContext(null);
const BuildingDefsContext = createContext(null);
const SelectedBuildingContext = createContext(null);
const UIContext = createContext(null);
const TutorialContext = createContext(null);

export function GodotProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [playerState, setPlayerState] = useState(null);
  const [resources, setResources] = useState({ gold: 0, wood: 0, ore: 0 });
  const [buildingDefs, setBuildingDefs] = useState({ buildings: {}, troops: {}, placed_counts: {} });
  const [troopLevels, setTroopLevels] = useState({});
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [enemyMode, setEnemyMode] = useState({ active: false });
  const [error, setError] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [collectibles, setCollectibles] = useState([]);
  const [cloudVisible, setCloudVisible] = useState(false);
  const [futuresOpen, setFuturesOpen] = useState(false);
  const [cannonMode, setCannonMode] = useState(false);
  const [selectedTroopIdx, setSelectedTroopIdx] = useState(0);
  const [battleResult, setBattleResult] = useState(null);
  const [pendingCasualties, setPendingCasualties] = useState(null);
  const [battleTimer, setBattleTimer] = useState(null); // seconds remaining, null = no timer
  const [cannonEnergy, setCannonEnergy] = useState({ energy: 10, nextCost: 1 });
  const [fleetInfo, setFleetInfo] = useState(null);
  // Fallback matches TH1 base capacity (server/db.js + building_system.gd).
  // Godot pushes real caps via `resource_caps` on boot; this default only
  // covers the first render before that message lands, so keep it in sync
  // so the HUD never briefly shows a smaller cap than the server enforces.
  const [resourceCaps, setResourceCaps] = useState({ gold: 10000, wood: 10000, ore: 10000 });
  const resourceCapsRef = useRef({ gold: 10000, wood: 10000, ore: 10000 });
  const errorTimerRef = useRef(null);
  const [tutorialFlags, setTutorialFlags] = useState(0xFF); // default all done, server overrides
  const [tutorialPhase, setTutorialPhase] = useState(null); // 'base'|'army'|'attack'|'trade'|null
  // Remember the token the last fetch was keyed on — re-fetch when it changes
  // (logout→register, account switch, session swap). A boolean "fetched once"
  // flag would miss these transitions and leave a fresh account with the
  // previous account's tutorial flags (0xFF if previous one was completed),
  // so new-account tutorials would never appear.
  const tutorialTokenRef = useRef(null);

  useEffect(() => {
    window.onGodotMessage = (msg) => {
      const { action, data } = msg;
      switch (action) {
        case 'godot_ready':
          setReady(true);
          break;
        case 'state':
          setPlayerState(prev => {
            const next = { ...(prev || {}), ...data };
            if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
            return next;
          });
          if (data.token) {
            window._playerToken = data.token;
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
                    if (!(flags & 1)) setTutorialPhase('base');
                    else if (!(flags & 2)) setTutorialPhase('army');
                    else if (!(flags & 8)) setTutorialPhase('trade');
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
          } else {
            // Logout (js_bridge emits empty token on _do_logout). Clear the
            // guard + reset tutorial state so the next account's token starts
            // fresh rather than inheriting whatever was on screen last.
            window._playerToken = null;
            tutorialTokenRef.current = null;
            setTutorialFlags(0xFF);
            setTutorialPhase(null);
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
            if (JSON.stringify(prev.placed_counts) === JSON.stringify(data)) return prev;
            return { ...prev, placed_counts: data };
          });
          break;
        case 'troop_levels':
          setTroopLevels(data);
          break;
        case 'building_selected':
          setSelectedBuilding(data);
          break;
        case 'ship_updated':
          setSelectedBuilding(prev => prev ? { ...prev, ...data } : prev);
          break;
        case 'building_deselected':
          setSelectedBuilding(null);
          break;
        case 'shop_toggled':
          setShopOpen(data.open);
          break;
        case 'enemy_mode':
          setEnemyMode(data);
          if (data.active) {
            setCannonEnergy({ energy: 10, nextCost: 1 }); setBattleResult(null);
          }
          if (!data.active) { setSelectedBuilding(null); setCannonMode(false); setSelectedTroopIdx(0); }
          break;
        case 'troop_idx_changed':
          setSelectedTroopIdx(data.idx ?? 0);
          break;
        case 'cannon_mode':
          setCannonMode(data.active);
          break;
        case 'battle_result':
          setBattleResult(data);
          if (data.casualties && Object.values(data.casualties).some(c => c > 0)) {
            setPendingCasualties(data.casualties);
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
          setPendingCasualties(prev => {
            const c = { ...(prev || {}) };
            c[data.troop_name] = (c[data.troop_name] || 0) + 1;
            return c;
          });
          break;
        case 'reinforced':
          setPendingCasualties(null);
          break;
        case 'cannon_energy':
          setCannonEnergy(prev => {
            const energy = data.energy || 0;
            const nextCost = data.next_cost || 1;
            if (prev.energy === energy && prev.nextCost === nextCost) return prev;
            return { energy, nextCost };
          });
          break;
        case 'fleet_info':
          setFleetInfo(data);
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
            if (prev.th_level === th_level && prev.th_progress === th_progress && prev.th_progress_total === th_progress_total) return prev;
            return { ...prev, th_level, th_unlock: data.unlock || {}, th_max_counts: data.max_counts || {}, th_progress, th_progress_total };
          });
          break;
        case 'error':
          setError(data.message);
          if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
          errorTimerRef.current = setTimeout(() => setError(null), 3000);
          break;
        case 'show_register':
          setShowRegister(true);
          break;
        case 'registered':
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
    return () => {
      window.onGodotMessage = null;
      window._playerToken = null;
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const sendToGodot = useCallback((action, data = {}) => {
    if (window.godotBridge) {
      window.godotBridge(JSON.stringify({ action, data }));
    }
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
    ready, shopOpen, enemyMode, error, showRegister, collectibles, cloudVisible, futuresOpen, cannonMode, selectedTroopIdx, battleResult, setBattleResult, cannonEnergy, fleetInfo, pendingCasualties, setPendingCasualties, battleTimer
  }), [ready, shopOpen, enemyMode, error, showRegister, collectibles, cloudVisible, futuresOpen, cannonMode, selectedTroopIdx, battleResult, cannonEnergy, fleetInfo, pendingCasualties, battleTimer]);
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
