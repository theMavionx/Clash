import { useEffect, useState, useCallback, useRef, createContext, useContext, useMemo, createElement } from 'react';

// Separate contexts so components only re-render when their slice changes
const SendContext = createContext(null);
const ResourcesContext = createContext(null);
const PlayerContext = createContext(null);
const BuildingContext = createContext(null);
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
  const [resourceCaps, setResourceCaps] = useState({ gold: 5000, wood: 5000, ore: 5000 });
  const resourceCapsRef = useRef({ gold: 5000, wood: 5000, ore: 5000 });
  const errorTimerRef = useRef(null);
  const [tutorialFlags, setTutorialFlags] = useState(0xFF); // default all done, server overrides
  const [tutorialPhase, setTutorialPhase] = useState(null); // 'base'|'army'|'attack'|'trade'|null
  const tutorialFetchedRef = useRef(false);

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
            // Fetch tutorial progress once (Godot bridge doesn't include it).
            // Deferred to avoid blocking render. Uses requestIdleCallback where available.
            if (!tutorialFetchedRef.current) {
              tutorialFetchedRef.current = true;
              const doFetch = () => {
                fetch('/api/tutorial', { headers: { 'x-token': data.token } })
                  .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                  .then(res => {
                    const flags = res.tutorial_flags ?? 0xFF;
                    if (flags === 0xFF) return;
                    setTutorialFlags(flags);
                    if (!(flags & 1)) setTutorialPhase('base');
                    else if (!(flags & 2)) setTutorialPhase('army');
                    else if (!(flags & 8)) setTutorialPhase('trade');
                  }).catch(() => {});
              };
              // Delay fetch so it doesn't block initial render
              if (window.requestIdleCallback) window.requestIdleCallback(doFetch);
              else setTimeout(doFetch, 2000);
            }
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
            const gold = data.gold || 5000, wood = data.wood || 5000, ore = data.ore || 5000;
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
  const buildingCtx = useMemo(() => ({
    buildingDefs, troopLevels, selectedBuilding,
  }), [buildingDefs, troopLevels, selectedBuilding]);
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
          createElement(BuildingContext.Provider, { value: buildingCtx },
            createElement(TutorialContext.Provider, { value: tutorialCtx },
              children
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
export function useBuilding() { return useContext(BuildingContext); }
export function useUI() { return useContext(UIContext); }
export function useTutorial() { return useContext(TutorialContext); }
