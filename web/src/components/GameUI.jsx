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
import { useSend, useUI, useBuilding } from '../hooks/useGodot';

export default function GameUI() {
  const { sendToGodot, setShopOpen } = useSend();
  const { ready, shopOpen, error, showRegister } = useUI();
  const { selectedBuilding } = useBuilding();

  const [showTroops, setShowTroops] = useState(false);

  useEffect(() => {
    if (!selectedBuilding) setShowTroops(false);
  }, [selectedBuilding]);

  const handleCloseShop = useCallback(() => {
    setShopOpen(false);
    sendToGodot('close_shop');
  }, [setShopOpen, sendToGodot]);

  const handleCloseTroops = useCallback(() => setShowTroops(false), []);
  const handleDeselectBuilding = useCallback(() => sendToGodot('deselect_building'), [sendToGodot]);
  const handleOpenTroops = useCallback(() => setShowTroops(true), []);

  const barnAsTroops = useMemo(() => {
    if (showTroops && selectedBuilding?.id === 'barn') {
      return { ...selectedBuilding, is_barracks: true };
    }
    return null;
  }, [showTroops, selectedBuilding]);

  if (!ready) return null;

  if (showRegister) {
    return <RegisterPanel />;
  }

  return (
    <div style={styles.overlay}>
      <ResourceBar />
      <PlayerInfo />
      <ActionButtons />
      <ErrorToast message={error} />
      <FpsTracker />

      {shopOpen && (
        <ShopPanel onClose={handleCloseShop} />
      )}

      {barnAsTroops ? (
        <BarracksPanel
          building={barnAsTroops}
          onClose={handleCloseTroops}
        />
      ) : selectedBuilding && selectedBuilding.is_barracks && !selectedBuilding.is_enemy ? (
        <BarracksPanel
          building={selectedBuilding}
          onClose={handleDeselectBuilding}
        />
      ) : (
        <BuildingInfoPanel onOpenTroops={handleOpenTroops} />
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
