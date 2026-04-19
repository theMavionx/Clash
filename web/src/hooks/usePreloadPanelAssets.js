// Preloads every image the BuildingInfoPanel (and related popups) uses so the
// FIRST click on a building doesn't trigger a cascade of network/disk fetches.
// On a cold browser cache this alone accounts for a visible 500-1500ms freeze
// because the panel mounts 17+ <img> tags at once. Fetching each via
// `new Image().src = url` kicks off the cache load asynchronously while the
// player is still staring at the loading screen.

import { useEffect } from 'react';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

import imgMine from '../assets/buildings/mine.png';
import imgBarn from '../assets/buildings/barn.png';
import imgPort from '../assets/buildings/port.png';
import imgSawmill from '../assets/buildings/sawmill.png';
import imgTownHall from '../assets/buildings/townhall.png';
import imgTurret from '../assets/buildings/turret.png';
import imgTombstone from '../assets/buildings/tombstone.png';
import imgArcherTower from '../assets/buildings/archertower.png';
import imgStorage from '../assets/buildings/storage.png';
import imgShip from '../assets/buildings/shipsmall.png';

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import arbaletImg from '../assets/units/arbalet.png';
import archerImg from '../assets/units/archer.png';
import berserkImg from '../assets/units/berserk.png';

const URLS = [
  goldIcon, woodIcon, stoneIcon,
  imgMine, imgBarn, imgPort, imgSawmill, imgTownHall,
  imgTurret, imgTombstone, imgArcherTower, imgStorage, imgShip,
  knightImg, mageImg, arbaletImg, archerImg, berserkImg,
];

export function usePreloadPanelAssets() {
  useEffect(() => {
    // Defer to idle so we never compete with the Godot WASM download.
    const load = () => {
      for (const url of URLS) {
        const img = new Image();
        img.src = url;
      }
    };
    if (typeof window !== 'undefined' && window.requestIdleCallback) {
      window.requestIdleCallback(load, { timeout: 3000 });
    } else {
      setTimeout(load, 1500);
    }
  }, []);
}
