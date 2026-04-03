import { useEffect, useState, useCallback, useRef, createContext, useContext, useMemo, createElement } from 'react';

// Separate contexts so components only re-render when their slice changes
const SendContext = createContext(null);
const ResourcesContext = createContext(null);
const PlayerContext = createContext(null);
const BuildingContext = createContext(null);
const UIContext = createContext(null);

export function GodotProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [playerState, setPlayerState] = useState(null);
  const [resources, setResources] = useState({ gold: 0, wood: 0, ore: 0 });
  const [buildingDefs, setBuildingDefs] = useState({ buildings: {}, troops: {} });
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
  const [cannonEnergy, setCannonEnergy] = useState({ energy: 10, nextCost: 1 });
  const [resourceCaps, setResourceCaps] = useState({ gold: 5000, wood: 5000, ore: 5000 });
  const errorTimerRef = useRef(null);

  useEffect(() => {
    window.onGodotMessage = (msg) => {
      const { action, data } = msg;
      switch (action) {
        case 'godot_ready':
          setReady(true);
          break;
        case 'state':
          setPlayerState(prev => ({ ...(prev || {}), ...data }));
          if (data.token) window._playerToken = data.token;
          break;
        case 'resources':
          setResources(data);
          break;
        case 'resources_add':
          setResources(prev => ({
            gold: (prev.gold || 0) + (data.gold || 0),
            wood: (prev.wood || 0) + (data.wood || 0),
            ore: (prev.ore || 0) + (data.ore || 0),
          }));
          break;
        case 'building_defs':
          setBuildingDefs(data);
          break;
        case 'placed_counts':
          setBuildingDefs(prev => ({ ...prev, placed_counts: data }));
          break;
        case 'troop_levels':
          setTroopLevels(data);
          break;
        case 'building_selected':
          setSelectedBuilding(data);
          break;
        case 'building_deselected':
          setSelectedBuilding(null);
          break;
        case 'shop_toggled':
          setShopOpen(data.open);
          break;
        case 'enemy_mode':
          setEnemyMode(data);
          if (data.active) { setCannonEnergy({ energy: 10, nextCost: 1 }); setBattleResult(null); }
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
          break;
        case 'cannon_energy':
          setCannonEnergy({ energy: data.energy || 0, nextCost: data.next_cost || 1 });
          break;
        case 'resource_caps':
          setResourceCaps({ gold: data.gold || 5000, wood: data.wood || 5000, ore: data.ore || 5000 });
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
          setCollectibles(data.buildings || []);
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
    ready, shopOpen, enemyMode, error, showRegister, collectibles, cloudVisible, futuresOpen, cannonMode, selectedTroopIdx, battleResult, setBattleResult, cannonEnergy
  }), [ready, shopOpen, enemyMode, error, showRegister, collectibles, cloudVisible, futuresOpen, cannonMode, selectedTroopIdx, battleResult, cannonEnergy]);

  // Nested providers using createElement (no JSX needed in .js file)
  return createElement(SendContext.Provider, { value: sendCtx },
    createElement(UIContext.Provider, { value: uiCtx },
      createElement(ResourcesContext.Provider, { value: resourcesCtx },
        createElement(PlayerContext.Provider, { value: playerCtx },
          createElement(BuildingContext.Provider, { value: buildingCtx },
            children
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
