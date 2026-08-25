import mine from '../assets/buildings/mine.png';
import barn from '../assets/buildings/barn.png';
import port from '../assets/buildings/port.png';
import sawmill from '../assets/buildings/sawmill.png';
import townHall from '../assets/buildings/townhall.png';
import turret from '../assets/buildings/turret.png';
import cannon from '../assets/buildings/cannon.png';
import tombstone from '../assets/buildings/tombstone.png';
import archerTower from '../assets/buildings/archertower.png';
import storage from '../assets/buildings/storage.png';
import mageTower from '../assets/buildings/magetower.png';
import mortar from '../assets/buildings/mortar.png';
import sharkTrap from '../assets/buildings/sharktrap.png';
import harpoon from '../assets/buildings/harpoon.png';
import airBomb from '../assets/buildings/air_bomb.png';
import flamethrower from '../assets/buildings/flamethrower.png';
import hiddenTesla from '../assets/buildings/hidden_tesla_v2.png';
import mainShip from '../assets/buildings/main_ship.png';

import altar from '../assets/units/altar.png';
import knight from '../assets/units/knight.png';
import mage from '../assets/units/mage.png';
import archer from '../assets/units/archer.png';
import arbalet from '../assets/units/arbalet.png';
import mimic from '../assets/units/mimic.png';
import necromancer from '../assets/units/necromancer.png';
import horror from '../assets/units/horror.png';
import mechanicalDragon from '../assets/units/mechanical_dragon.png';
import iceGolem from '../assets/units/ice_golem.png';
import berserk from '../assets/units/berserk.png';
import demonKing from '../assets/units/demonking.png';
import fireDragon from '../assets/units/fire_dragon.png';
import windMage from '../assets/units/wind_mage.png';
import peaShooter from '../assets/units/pea_shooter.png';

function assetKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/gu, '');
}

const BUILDING_ASSETS = {
  mine,
  barn,
  port,
  sawmill,
  townhall: townHall,
  turret,
  cannon,
  tombstone,
  archertower: archerTower,
  storage,
  magetower: mageTower,
  mortar,
  sharktrap: sharkTrap,
  harpoon,
  airbomb: airBomb,
  flamethrower,
  hiddentesla: hiddenTesla,
  mainship: mainShip,
  ship: mainShip,
  altar,
};

const TROOP_ASSETS = {
  knight,
  mage,
  archer,
  arbalet,
  mimic,
  necromancer,
  skeletonmage: necromancer,
  horror,
  horrorevolution: horror,
  mechanicaldragon: mechanicalDragon,
  mechdragon: mechanicalDragon,
  icegolem: iceGolem,
  berserk,
  demonking: demonKing,
  firedragon: fireDragon,
  windmage: windMage,
  peashooter: peaShooter,
};

const TROOP_PORTRAIT_STYLES = {
  knight: { scale: 1.25, offsetY: '15%' },
  mage: { scale: 1.25, offsetY: '15%' },
  archer: { scale: 1.25, offsetY: '15%' },
  arbalet: { scale: 1.25, offsetY: '15%' },
  berserk: { scale: 1.25, offsetY: '15%' },
  peashooter: { scale: 1.1, offsetY: '4%' },
  mimic: { scale: 1.1, offsetY: '4%' },
  necromancer: { scale: 1.12, offsetY: '5%' },
  windmage: { scale: 1.12, offsetY: '5%' },
  horror: { scale: 1.12, offsetY: '5%' },
  mechanicaldragon: { scale: 1.14, offsetY: '7%' },
  icegolem: { scale: 1.12, offsetY: '5%' },
  demonking: { scale: 1.35, offsetY: '10%' },
  firedragon: { scale: 1.2, offsetY: '8%' },
};

function explicitAsset(item) {
  if (!item || typeof item !== 'object') return '';
  return String(item.image || item.image_url || item.icon || item.thumbnail || '').trim();
}

export function buildingAsset(item, id) {
  return explicitAsset(item) || BUILDING_ASSETS[assetKey(id)] || townHall;
}

export function troopAsset(item, id) {
  return explicitAsset(item) || TROOP_ASSETS[assetKey(id)] || knight;
}

export function troopPortraitStyle(id) {
  const style = TROOP_PORTRAIT_STYLES[assetKey(id)] || { scale: 1.12, offsetY: '5%' };
  return { transform: `translateY(${style.offsetY}) scale(${style.scale})` };
}
