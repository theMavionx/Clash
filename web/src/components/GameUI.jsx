import { useState, useEffect } from 'react';
import ResourceBar from './ResourceBar';
import PlayerInfo from './PlayerInfo';
import ActionButtons from './ActionButtons';
import ShopPanel from './ShopPanel';
import BuildingInfoPanel from './BuildingInfoPanel';
import BarracksPanel from './BarracksPanel';
import RegisterPanel from './RegisterPanel';
import ErrorToast from './ErrorToast';

export default function GameUI({
  ready, playerState, resources, buildingDefs, troopLevels,
  selectedBuilding, shopOpen, enemyMode, error, showRegister,
  sendToGodot, setShopOpen,
}) {
  const [showTroops, setShowTroops] = useState(false);

  // Reset troops panel when building is deselected
  useEffect(() => {
    if (!selectedBuilding) setShowTroops(false);
  }, [selectedBuilding]);

  if (!ready) return null;

  if (showRegister) {
    return <RegisterPanel sendToGodot={sendToGodot} />;
  }

  const barnAsTroops = showTroops && selectedBuilding?.id === 'barn'
    ? { ...selectedBuilding, is_barracks: true }
    : null;

  return (
    <div style={styles.overlay}>
      <ResourceBar resources={resources} sendToGodot={sendToGodot} />
      <PlayerInfo playerState={playerState} />
      <ActionButtons enemyMode={enemyMode} sendToGodot={sendToGodot} />
      <ErrorToast message={error} />

      {shopOpen && (
        <ShopPanel
          buildingDefs={buildingDefs}
          sendToGodot={sendToGodot}
          onClose={() => {
            setShopOpen(false);
            sendToGodot('close_shop');
          }}
        />
      )}

      {barnAsTroops ? (
        <BarracksPanel
          building={barnAsTroops}
          buildingDefs={buildingDefs}
          troopLevels={troopLevels}
          sendToGodot={sendToGodot}
          onClose={() => setShowTroops(false)}
        />
      ) : selectedBuilding && selectedBuilding.is_barracks && !selectedBuilding.is_enemy ? (
        <BarracksPanel
          building={selectedBuilding}
          buildingDefs={buildingDefs}
          troopLevels={troopLevels}
          sendToGodot={sendToGodot}
          onClose={() => sendToGodot('deselect_building')}
        />
      ) : (
        <BuildingInfoPanel
          building={selectedBuilding}
          sendToGodot={sendToGodot}
          onOpenTroops={() => setShowTroops(true)}
        />
      )}
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
