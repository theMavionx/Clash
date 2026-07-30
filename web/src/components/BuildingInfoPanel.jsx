import { memo, useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useBuildingDefs, usePlayer, useResources, useSend, useSelectedBuilding } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useOptionalPrivy } from './PrivyAuthProvider';
import { useFarcaster } from '../hooks/useFarcaster';
import useHydratedNftPlayer from '../hooks/useHydratedNftPlayer';
import { fetchOwnedNftsForPlayerWallets, nftLevelImageUrl, nftRarityBadgeStyle, nftRarityCardStyle, nftRarityLabel, normalizeNftRarity, resolveDemonKingPlayerInventorySyncTarget, syncDemonKingNfts } from '../lib/nftV3Client';
import { buySolanaShopItem } from '../lib/gameShop';
import { makePrivySolanaWallet, pickPrivySolanaWallet } from '../lib/privySolanaWallet';
import { openSolanaWallet } from '../lib/solanaWalletUi';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

import imgMine from '../assets/buildings/mine.png';
import imgBarn from '../assets/buildings/barn.png';
import imgPort from '../assets/buildings/port.png';
import imgSawmill from '../assets/buildings/sawmill.png';
import imgTownHall from '../assets/buildings/townhall.png';
import imgTurret from '../assets/buildings/turret.png';
import imgCannon from '../assets/buildings/cannon.png';
import imgTombstone from '../assets/buildings/tombstone.png';
import imgArcherTower from '../assets/buildings/archertower.png';
import imgStorage from '../assets/buildings/storage.png';
import imgShip from '../assets/buildings/main_ship.png';
import imgMageTower from '../assets/buildings/magetower.png';
import imgMortar from '../assets/buildings/mortar.png';
import imgSharkTrap from '../assets/buildings/sharktrap.png';
import imgAltar from '../assets/units/altar.png';

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import archerImg from '../assets/units/archer.png';
import mimicImg from '../assets/units/mimic.png';
import necromancerImg from '../assets/units/necromancer.png';
import horrorImg from '../assets/units/horror.png';
import mechanicalDragonImg from '../assets/units/mechanical_dragon.png';
import iceGolemImg from '../assets/units/ice_golem.png';
import arbaletImg from '../assets/units/arbalet.png';
import berserkImg from '../assets/units/berserk.png';
import demonKingImg from '../assets/units/demonking.png';
import fireDragonImg from '../assets/units/fire_dragon.png';
import windMageImg from '../assets/units/wind_mage.png';
import peaShooterImg from '../assets/units/pea_shooter.png';

const ICONS = { gold: goldIcon, wood: woodIcon, ore: stoneIcon };
const DEMON_KING_PORT_FORCE_SYNC_MS = 60_000;
const dragonImg = '/cdn/nft/dragon/1/default.jpg';

const UNIT_IMAGES = {
  Knight: knightImg,
  Mage: mageImg,
  Archer: archerImg,
  PeaShooter: peaShooterImg,
  Mimic: mimicImg,
  Necromancer: necromancerImg,
  WindMage: windMageImg,
  Horror: horrorImg,
  MechanicalDragon: mechanicalDragonImg,
  IceGolem: iceGolemImg,
  Ranger: arbaletImg,
  Barbarian: berserkImg,
  DemonKing: demonKingImg,
  FireDragon: fireDragonImg,
};

const MAIN_SHIP_ABILITY_FLAGS = [
  ['ship_medkit_unlocked', 'Healing Field'],
  ['ship_freeze_unlocked', 'Freeze Orb'],
  ['ship_rage_unlocked', 'Rage Field'],
  ['ship_skeleton_barrel_unlocked', 'Skeleton Barrel'],
];

const mainShipAbilityLabels = (building = {}) => {
  if (Array.isArray(building.ship_unlocked_abilities)) {
    return building.ship_unlocked_abilities.filter(Boolean);
  }
  return MAIN_SHIP_ABILITY_FLAGS
    .filter(([flag]) => !!building[flag])
    .map(([, label]) => label);
};

const TROOP_STYLE_MAP = {
  Knight: { scale: 1.9, offsetY: '25%' },
  Mage: { scale: 1.9, offsetY: '25%' },
  Barbarian: { scale: 1.9, offsetY: '25%' },
  Archer: { scale: 1.9, offsetY: '25%' },
  PeaShooter: { scale: 1.35, offsetY: '7%' },
  Mimic: { scale: 1.35, offsetY: '7%' },
  Necromancer: { scale: 1.32, offsetY: '7%' },
  WindMage: { scale: 1.32, offsetY: '7%' },
  Horror: { scale: 1.32, offsetY: '7%' },
  MechanicalDragon: { scale: 1.22, offsetY: '7%' },
  IceGolem: { scale: 1.22, offsetY: '6%' },
  Ranger: { scale: 1.9, offsetY: '25%' },
  DemonKing: { scale: 1.3, offsetY: '10%' },
  FireDragon: { scale: 1.05, offsetY: '0%' },
};

const CARD_TROOP_STYLE_MAP = {
  Knight: { scale: 1.05, offsetY: '0%' },
  Mage: { scale: 1.05, offsetY: '0%' },
  Barbarian: { scale: 1.05, offsetY: '0%' },
  Archer: { scale: 1.05, offsetY: '0%' },
  PeaShooter: { scale: 1.08, offsetY: '2%' },
  Mimic: { scale: 1.18, offsetY: '0%' },
  Necromancer: { scale: 1.10, offsetY: '3%' },
  WindMage: { scale: 1.10, offsetY: '3%' },
  Horror: { scale: 1.10, offsetY: '3%' },
  MechanicalDragon: { scale: 1.08, offsetY: '3%' },
  IceGolem: { scale: 1.08, offsetY: '2%' },
  Ranger: { scale: 1.05, offsetY: '0%' },
  // Demon King renders with the same full-bleed `troopImg` treatment as
  // the other troops (cover + top-center) — bumped a touch larger so the
  // boss portrait reads as the centerpiece it is.
  DemonKing: { scale: 1.3, offsetY: '0%' },
  FireDragon: { scale: 1.02, offsetY: '0%' },
};

const SLOT_FILLER = '_SLOT_FILLER_';
const TOWN_HALL_FLAG_SKU = 'town_hall_flag';
const TOWN_HALL_FLAG_CANVAS_SIZE = 256;
// Display-only mirror of server/raid_trophy_progression.js.
const RAID_WIN_TROPHIES_BY_TOWN_HALL = Object.freeze({
  1: 6,
  2: 12,
  3: 18,
  4: 22,
  5: 30,
});
const raidWinTrophiesForTownHall = (level) => {
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  return RAID_WIN_TROPHIES_BY_TOWN_HALL[Math.min(5, normalizedLevel)];
};

const THUMBNAIL_MAP = {
  mine: imgMine,
  barn: imgBarn,
  port: imgPort,
  sawmill: imgSawmill,
  town_hall: imgTownHall,
  turret: imgTurret,
  cannon: imgCannon,
  tombstone: imgTombstone,
  archtower: imgArcherTower,
  archer_tower: imgArcherTower,
  archertower: imgArcherTower,
  mage_tower: imgMageTower,
  mortar: imgMortar,
  shark_trap: imgSharkTrap,
  storage: imgStorage,
  altar: imgAltar,
  main_ship: imgShip,
};

const THUMBNAIL_STYLE_MAP = {
  mortar: {
    left: '53%',
    top: '50%',
    transform: 'translate(-50%, -50%) scale(1.2)',
    transformOrigin: 'center center',
    objectPosition: 'center center',
  },
};

const DESC_MAP = {
  mine: 'Mines produce ore over time.',
  sawmill: 'Sawmills produce wood over time.',
  barn: 'Trains troops.',
  port: 'Deploy ships to attack.',
  main_ship: 'Carries your army into battle. Upgrades add capacity and battle energy; level 6 unlocks the healing field.',
  town_hall: 'The heart of your village.',
  turret: 'Targets ground enemies.',
  cannon: 'A heavy ground-only defense with powerful single-target shots.',
  tombstone: 'Spawns skeletons to defend.',
  archtower: 'Ranged defense against invaders.',
  archer_tower: 'Ranged defense against invaders.',
  archertower: 'Ranged defense against invaders.',
  mage_tower: 'Casts splash magic at groups of enemy troops.',
  mortar: 'Long-range splash defense with a minimum firing range.',
  shark_trap: 'A hidden 2 x 2 trap that eliminates the first ordinary ground troop. Higher levels deal more damage to Demon King.',
  residence: 'Residences produce gold.',
};

const ALTAR_SKILLS = {
  prosperity: {
    label: 'Prosperity',
    title: 'Resource Blessing',
    bonus: 'gold, wood, and ore gains',
    values: [10, 20, 30],
    costs: [
      { wood: 10000, ore: 10000, gold: 2500 },
      { wood: 30000, ore: 30000, gold: 7500 },
      { wood: 70000, ore: 70000, gold: 20000 },
    ],
  },
  ward: {
    label: 'Ward',
    title: 'Stone Ward',
    bonus: 'defense HP and damage',
    values: [5, 10, 15],
    costs: [
      { wood: 15000, ore: 8000, gold: 2500 },
      { wood: 45000, ore: 25000, gold: 7500 },
      { wood: 70000, ore: 60000, gold: 20000 },
    ],
  },
  glory: {
    label: 'Glory',
    title: 'Cup Offering',
    bonus: 'bonus trophies on attack win',
    bonusType: 'flat',
    values: [5, 7, 10],
    costs: [
      { wood: 12000, ore: 12000, gold: 3000 },
      { wood: 36000, ore: 36000, gold: 9000 },
      { wood: 70000, ore: 70000, gold: 24000 },
    ],
  },
};
const ALTAR_SKILL_ORDER = ['prosperity', 'ward', 'glory'];

function formatAltarSkillBonus(skill, level) {
  if (!skill || !level) return `+0 ${skill?.bonus || ''}`.trim();
  const max = Number(skill.values?.[level - 1] || 0);
  if (skill.bonusType === 'range') {
    return `+${Number(skill.minValue || 1)}-${max} ${skill.bonus}`;
  }
  if (skill.bonusType === 'flat') {
    return `+${max} ${skill.bonus}`;
  }
  return `+${max}% ${skill.bonus}`;
}

function troopBaseName(name) {
  const base = String(name || '').split(':')[0];
  const lower = base.toLowerCase();
  if (lower === 'demonking' || lower === 'demon_king') return 'DemonKing';
  if (lower === 'firedragon' || lower === 'fire_dragon' || lower === 'dragon') return 'FireDragon';
  if (lower === 'knight') return 'Knight';
  if (lower === 'mage') return 'Mage';
  if (lower === 'barbarian') return 'Barbarian';
  if (lower === 'archer') return 'Archer';
  if (lower === 'peashooter' || lower === 'pea_shooter' || lower === 'pea-shooter') return 'PeaShooter';
  if (lower === 'mimic') return 'Mimic';
  if (lower === 'necromancer' || lower === 'skeletonmage' || lower === 'skeleton_mage') return 'Necromancer';
  if (lower === 'windmage' || lower === 'wind_mage' || lower === 'wind-mage') return 'WindMage';
  if (lower === 'horror' || lower === 'horrorevolution' || lower === 'horror_evolution') return 'Horror';
  if (lower === 'mechanicaldragon' || lower === 'mechanical_dragon' || lower === 'mechdragon') return 'MechanicalDragon';
  if (lower === 'icegolem' || lower === 'ice_golem') return 'IceGolem';
  if (lower === 'ranger') return 'Ranger';
  return base;
}

function troopDisplayName(name) {
  const base = troopBaseName(name);
  if (base === 'Mimic') return 'Barrel';
  if (base === 'Horror') return 'Horror';
  if (base === 'MechanicalDragon') return 'Mech Dragon';
  if (base === 'IceGolem') return 'Ice Golem';
  if (base === 'WindMage') return 'Wind Mage';
  if (base === 'PeaShooter') return 'Pea Shooter';
  return base;
}

function troopSlotCost(name) {
  const costs = {
    Knight: 1,
    Archer: 1,
    PeaShooter: 5,
    Mage: 4,
    Mimic: 6,
    MechanicalDragon: 4,
    DemonKing: 5,
    IceGolem: 10,
    FireDragon: 10,
    Necromancer: 15,
    WindMage: 15,
    Horror: 20,
  };
  return costs[troopBaseName(name)] || 1;
}

const TROOP_INFO = {
  Knight: {
    role: 'Frontline fighter',
    description: 'A reliable melee unit with balanced health and damage. Use Knights to protect ranged troops.',
  },
  Mage: {
    role: 'Ranged damage',
    description: 'A powerful ranged spellcaster. Mages deal strong damage but work best behind tougher frontline units.',
  },
  Archer: {
    role: 'Long-range attacker',
    description: 'A precise ranged unit that attacks from a safe distance and stays behind your frontline.',
  },
  PeaShooter: {
    role: 'Sustained ranged damage',
    description: 'Fires a steady stream of green projectiles from range. Strong when protected by durable troops.',
  },
  Mimic: {
    role: 'Trap runner',
    description: 'Rolls past defensive targeting and activates traps without taking trap damage until it stops rolling.',
  },
  Necromancer: {
    role: 'Summoner',
    description: 'Fires green magic and summons three skeletons. A new group rises after the previous skeletons are defeated.',
  },
  WindMage: {
    role: 'Lane control',
    description: 'Sweeps a long, widening lane with wind and summons temporary Windlings inside the attack path.',
  },
  Horror: {
    role: 'Swarm evolution',
    description: 'Splits into two Creepers when defeated. Each Creeper can split again into two smaller Lurkers.',
  },
  MechanicalDragon: {
    role: 'Chain siege',
    description: 'A heavy flying attacker whose lightning chains from its first target to nearby buildings.',
  },
  IceGolem: {
    role: 'Defense breaker',
    description: 'Targets defensive buildings first. When defeated, it freezes nearby defenses for 7 seconds.',
  },
  DemonKing: {
    role: 'NFT champion',
    description: 'A durable NFT-backed ground champion with powerful melee damage.',
  },
  FireDragon: {
    role: 'NFT flying siege',
    description: 'An NFT-backed flying attacker that breathes sustained fire over enemy buildings.',
  },
  Ranger: {
    role: 'Long-range attacker',
    description: 'A ranged specialist that attacks enemy buildings from a safe distance.',
  },
  Barbarian: {
    role: 'Melee fighter',
    description: 'A close-range attacker built for straightforward frontline pressure.',
  },
};

function troopReplacementEntries(name) {
  const entries = [name];
  for (let i = 1; i < troopSlotCost(name); i += 1) entries.push(SLOT_FILLER);
  return entries;
}

function troopUnitSpanAt(troops, index) {
  if (!Array.isArray(troops) || index < 0 || index >= troops.length) return null;
  let start = index;
  if (troops[start] === SLOT_FILLER) {
    while (start > 0 && troops[start] === SLOT_FILLER) start -= 1;
    if (troops[start] === SLOT_FILLER) return null;
  }
  let end = start + 1;
  while (end < troops.length && troops[end] === SLOT_FILLER) end += 1;
  return { start, end };
}

function loadedTroopGroups(troops) {
  const list = Array.isArray(troops) ? troops : [];
  const byKey = new Map();
  const groups = [];
  let index = 0;
  while (index < list.length) {
    const entry = list[index];
    if (!entry || entry === SLOT_FILLER) {
      index += 1;
      continue;
    }
    const span = troopUnitSpanAt(list, index) || { start: index, end: index + 1 };
    const base = troopBaseName(entry);
    const isTokenBacked = !!nftBackedTroopConfig(base);
    const key = isTokenBacked ? `${base}:${String(entry)}` : base;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        entry,
        base,
        count: 0,
        slots: 0,
        start: span.start,
        end: span.end,
        spans: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.count += 1;
    group.slots += Math.max(1, span.end - span.start);
    group.end = span.end;
    group.spans.push(span);
    index = span.end;
  }
  return groups.sort((a, b) => a.start - b.start);
}

function loadedTroopGroupForSlot(groups, slot) {
  if (!Array.isArray(groups) || slot === null || slot === undefined) return null;
  return groups.find((group) => group.spans.some((span) => slot >= span.start && slot < span.end)) || null;
}

function troopSwapPlacement(troops, slot, replacementName, capacity) {
  const list = Array.isArray(troops) ? troops : [];
  const replacementCost = troopSlotCost(replacementName);
  const replacementBase = troopBaseName(replacementName);
  if (!Number.isInteger(slot) || slot < 0) return null;
  if (slot >= list.length) {
    return list.length + replacementCost <= capacity
      ? { mode: 'append', start: list.length, end: list.length }
      : null;
  }
  if (list[slot] === SLOT_FILLER) return null;
  const selected = troopUnitSpanAt(list, slot);
  if (!selected) return null;

  let start = selected.start;
  let end = selected.end;
  const nextLength = () => list.length - (end - start) + replacementCost;
  const canAutoRemove = (span) => {
    if (!span) return false;
    return !(nftBackedTroopConfig(replacementBase) && troopBaseName(list[span.start]) === replacementBase);
  };

  while (nextLength() > capacity) {
    const right = troopUnitSpanAt(list, end);
    if (canAutoRemove(right) && right.start === end) {
      end = right.end;
      continue;
    }
    const left = troopUnitSpanAt(list, start - 1);
    if (canAutoRemove(left) && left.end === start) {
      start = left.start;
      continue;
    }
    return null;
  }
  return { mode: 'replace', start, end };
}

function demonKingShipEntry(token) {
  return nftBackedShipEntry('DemonKing', token);
}

function nftBackedTroopConfig(base) {
  if (base === 'DemonKing') {
    return {
      troop: 'DemonKing',
      collection: 'demonking',
      label: 'Demon King',
      shortLabel: 'KING',
      image: demonKingImg,
    };
  }
  if (base === 'FireDragon') {
    return {
      troop: 'FireDragon',
      collection: 'dragon',
      label: 'Dragon',
      shortLabel: 'DRAGON',
      image: fireDragonImg,
    };
  }
  return null;
}

function nftBackedShipEntry(troopName, token) {
  const cfg = nftBackedTroopConfig(troopBaseName(troopName));
  if (!cfg || !token) return cfg?.troop || troopName;
  return `${cfg.troop}:${token.chain}:${token.tokenId}:R${normalizeNftRarity(token.rarity || 'common')}`;
}

function demonKingTokenKey(token) {
  if (!token) return '';
  return `${String(token.chain || '').toLowerCase()}:${String(token.tokenId || token.id || '')}`;
}

function demonKingEntryTokenKey(entry) {
  return nftBackedEntryTokenKey(entry, 'DemonKing');
}

function nftBackedEntryTokenKey(entry, expectedBase = null) {
  const parts = String(entry || '').split(':');
  if (expectedBase && parts[0] !== expectedBase) return '';
  if (!nftBackedTroopConfig(parts[0]) || parts.length < 3) return '';
  return `${String(parts[1] || '').toLowerCase()}:${String(parts[2] || '')}`;
}

function demonKingEntryTokenId(entry) {
  return nftBackedEntryTokenId(entry, 'DemonKing');
}

function nftBackedEntryTokenId(entry, expectedBase = null) {
  const parts = String(entry || '').split(':');
  if (expectedBase && parts[0] !== expectedBase) return '';
  if (!nftBackedTroopConfig(parts[0]) || parts.length < 3) return '';
  return String(parts[2] || '');
}

function shortTokenId(tokenId) {
  const value = String(tokenId || '');
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isEvmDemonKingChain(chain) {
  return ['base', 'arbitrum', 'monad', 'ink'].includes(String(chain || '').toLowerCase());
}

function demonKingTokenSortValue(token) {
  const tokenId = String(token?.tokenId || token?.id || '').trim();
  if (/^\d+$/.test(tokenId)) return tokenId.padStart(20, '0');
  return tokenId.toLowerCase();
}

function demonKingDisplayIdFromText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const hashMatch = text.match(/#\s*(\d{1,10})\b/);
  if (hashMatch) return hashMatch[1];
  const namedMatch = text.match(/\b(?:demon\s*king|king)\s+(?:no\.?\s*)?#?\s*(\d{1,10})\b/i);
  if (namedMatch) return namedMatch[1];
  const fieldMatch = text.match(/\b(?:token|id|index|serial|number)[\s:_-]*#?\s*(\d{1,10})\b/i);
  if (fieldMatch) return fieldMatch[1];
  const uriMatch = text.match(/\/api\/nft\/(?:base|arbitrum|monad|ink|aptos|solana)\/(?:token2022\/)?(\d{1,10})(?:[/?#]|$)/i);
  if (uriMatch) return uriMatch[1];
  return '';
}

function demonKingOrdinalDisplayId(token, tokens = []) {
  if (!token || isEvmDemonKingChain(token.chain)) return '';
  const key = demonKingTokenKey(token);
  if (!key) return '';
  const chain = String(token.chain || '').toLowerCase();
  const sameChain = (Array.isArray(tokens) ? tokens : [])
    .filter((item) => String(item?.chain || '').toLowerCase() === chain && demonKingTokenKey(item))
    .sort((a, b) => demonKingTokenSortValue(a).localeCompare(demonKingTokenSortValue(b)));
  const index = sameChain.findIndex((item) => demonKingTokenKey(item) === key);
  return index >= 0 ? String(index + 1) : '';
}

function demonKingDisplayIdFromToken(token, tokens = []) {
  if (!token) return '';
  const direct = [
    token.displayId,
    token.display_id,
    token.tokenIndex,
    token.token_index,
    token.sourceTokenId,
    token.source_token_id,
    token.originalTokenId,
    token.original_token_id,
    token.serial,
    token.number,
  ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  if (direct !== undefined && direct !== null) {
    return String(direct).trim().replace(/^#/, '');
  }
  const parsed = [
    token.name,
    token.title,
    token.uri,
    token.tokenUri,
    token.metadataUri,
    token.json_uri,
    token.imageUrl,
    token.metadata?.name,
    token.metadata?.uri,
    token.content?.metadata?.name,
    token.content?.json_uri,
  ].map(demonKingDisplayIdFromText).find(Boolean) || '';
  if (parsed) return parsed;

  const tokenId = String(token.tokenId || token.id || '').trim();
  if (isEvmDemonKingChain(token.chain) && /^\d+$/.test(tokenId)) return tokenId;
  return demonKingOrdinalDisplayId(token, tokens);
}

function demonKingDisplayIdFromEntry(entry, tokens = []) {
  const key = nftBackedEntryTokenKey(entry);
  const token = tokens.find((item) => demonKingTokenKey(item) === key);
  if (token) return demonKingDisplayIdFromToken(token, tokens);
  const parts = String(entry || '').split(':');
  const chain = String(parts[1] || '').toLowerCase();
  const tokenId = nftBackedEntryTokenId(entry);
  if (isEvmDemonKingChain(chain) && /^\d+$/.test(tokenId)) return tokenId;
  return '';
}

function demonKingDisplayLabel(value, tokens = []) {
  const resolved = value && typeof value === 'object'
    ? demonKingDisplayIdFromToken(value, tokens)
    : value;
  const text = String(resolved || '').trim().replace(/^#/, '');
  return text ? `#${text}` : '';
}

function loadTownHallFlagImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read flag image'));
    };
    img.src = url;
  });
}

async function prepareTownHallFlagImage(file) {
  if (!file) throw new Error('Choose a flag image');
  const type = String(file.type || '').toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) {
    throw new Error('Use PNG, JPG, or WEBP');
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new Error('Image is too large');
  }
  const img = await loadTownHallFlagImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = TOWN_HALL_FLAG_CANVAS_SIZE;
  canvas.height = TOWN_HALL_FLAG_CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image resize is unavailable');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  const w = Math.max(1, img.naturalWidth * scale);
  const h = Math.max(1, img.naturalHeight * scale);
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;
  ctx.drawImage(img, x, y, w, h);
  return canvas.toDataURL('image/png');
}

function BuildingInfoPanel({ onOpenTroops }) {
  const { sendToGodot } = useSend();
  const { selectedBuilding: building } = useSelectedBuilding();
  const player = usePlayer();
  const resources = useResources();
  const { buildingDefs } = useBuildingDefs();
  const { isMobile } = useLayout();
  const nftPlayer = useHydratedNftPlayer(player);
  const evmWallet = useEvmWallet();
  const evmAddress = evmWallet?.address || null;
  const solWallet = useSolWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { isInFrame } = useFarcaster();
  const optionalPrivy = useOptionalPrivy();
  const privySolanaWalletObj = pickPrivySolanaWallet(optionalPrivy);
  const privySolWallet = useMemo(
    () => makePrivySolanaWallet(privySolanaWalletObj, optionalPrivy.solanaSignTransaction),
    [privySolanaWalletObj, optionalPrivy.solanaSignTransaction],
  );
  const paymentSolWallet = solWallet?.publicKey ? solWallet : (privySolWallet || solWallet);
  const solAddress = paymentSolWallet?.publicKey?.toBase58?.() || null;
  const aptosWallet = useAptosWallet();
  const aptosAddress = aptosWallet?.address || null;
  const demonKingSyncTarget = useMemo(() => resolveDemonKingPlayerInventorySyncTarget({
    player: nftPlayer,
    evmAddress,
    solAddress,
    aptosAddress,
  }), [aptosAddress, evmAddress, nftPlayer, solAddress]);
  const hasDemonKingWallet = !!demonKingSyncTarget;
  
  const [view, setView] = useState('ACTIONS');
  const [swapSlot, setSwapSlot] = useState(null);
  const [troopAction, setTroopAction] = useState(null);
  const [troopActionPending, setTroopActionPending] = useState(null);
  const [troopInfo, setTroopInfo] = useState(null);
  const [localTroops, setLocalTroops] = useState(null);
  const [demonKingNfts, setDemonKingNfts] = useState([]);
  const [demonKingNftLoading, setDemonKingNftLoading] = useState(false);
  const [demonKingNftError, setDemonKingNftError] = useState(null);
  const [dragonNfts, setDragonNfts] = useState([]);
  const [dragonNftLoading, setDragonNftLoading] = useState(false);
  const [dragonNftError, setDragonNftError] = useState(null);
  const [altarTab, setAltarTab] = useState('prosperity');
  const [altarLevels, setAltarLevels] = useState({ prosperity: 0, ward: 0, glory: 0 });
  const [altarBusy, setAltarBusy] = useState(false);
  const [altarError, setAltarError] = useState('');
  const [flagFile, setFlagFile] = useState(null);
  const [flagPreview, setFlagPreview] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagStatus, setFlagStatus] = useState('');
  const demonKingPortForceSyncRef = useRef(new Map());

  const openSolanaConnect = useCallback(() => {
    openSolanaWallet({
      wallets: solWallet.wallets,
      select: solWallet.select,
      connect: solWallet.connect,
      openWalletModal,
      inFrame: isInFrame,
    });
  }, [isInFrame, openWalletModal, solWallet.connect, solWallet.select, solWallet.wallets]);

  useEffect(() => {
    if (building?.open_load_troops) {
      setView('LOAD_TROOPS');
    } else {
      setView('ACTIONS');
    }
    setFlagFile(null);
    setFlagPreview('');
    setFlagStatus('');
    setTroopInfo(null);
  }, [building?.id, building?.server_id, building?.open_load_troops]);

  useEffect(() => {
    if (building?.altar_skills) {
      setAltarLevels({
        prosperity: Number(building.altar_skills.prosperity || 0),
        ward: Number(building.altar_skills.ward || 0),
        glory: Number(building.altar_skills.glory || 0),
      });
    }
  }, [building?.altar_skills]);

  useEffect(() => {
    const token = player?.token || window._playerToken;
    if (building?.id !== 'altar' || !token) return undefined;
    const controller = new AbortController();
    fetch('/api/altar/skills', {
      headers: { 'x-token': token },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.levels || controller.signal.aborted) return;
        setAltarLevels({
          prosperity: Number(json.levels.prosperity || 0),
          ward: Number(json.levels.ward || 0),
          glory: Number(json.levels.glory || 0),
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [building?.id, player?.token]);

  // Reset optimistic troops when server data arrives. Compare full content
  // (not just length) so swaps also trigger a reset — otherwise a failed swap
  // leaves optimistic state visible forever.
  const serverTroopsKey = `${building?.server_id ?? building?.id ?? ''}:${building?.ship_troops ? building.ship_troops.join('|') : ''}:${building?.ship_update_nonce || 0}`;
  useEffect(() => {
    setLocalTroops(null);
    setTroopActionPending(null);
  }, [serverTroopsKey]);

  useEffect(() => {
    if (!troopActionPending) return undefined;
    const timeout = window.setTimeout(() => setTroopActionPending(null), 10000);
    return () => window.clearTimeout(timeout);
  }, [troopActionPending]);

  useEffect(() => {
    if (view !== 'LOAD_TROOPS' || !hasDemonKingWallet) {
      if (!hasDemonKingWallet) {
        setDemonKingNfts([]);
        setDragonNfts([]);
      }
      return undefined;
    }
    const normalizeOwnedNftTokens = (ownedJson, collection) => {
      const tokens = [];
      (ownedJson?.tokens || []).forEach((token) => {
        tokens.push({
          ...token,
          chain: token.chain || 'base',
          tokenId: String(token.tokenId || token.id || ''),
          imageUrl: token.imageUrl || (collection === 'dragon' ? dragonImg : nftLevelImageUrl(1, token.tokenId || token.id || '')),
        });
      });
      tokens.sort((a, b) => (
        String(a.chain).localeCompare(String(b.chain))
        || String(a.tokenId).localeCompare(String(b.tokenId), undefined, { numeric: true })
      ));
      return tokens.filter((token) => token.tokenId);
    };
    const syncWalletKey = demonKingSyncTarget?.wallets
      ? Object.entries(demonKingSyncTarget.wallets)
        .map(([key, value]) => `${key}:${value}`)
        .join('|')
      : demonKingSyncTarget?.wallet || '';
    const controllers = [];
    const syncCollection = ({
      collection,
      setTokens,
      setLoading,
      setError,
      label,
    }) => {
      const syncKey = `${collection}:${syncWalletKey}:${(demonKingSyncTarget?.chains || []).join(',')}`;
      const lastForcedAt = demonKingPortForceSyncRef.current.get(syncKey) || 0;
      const shouldForceRefresh = syncKey && Date.now() - lastForcedAt > DEMON_KING_PORT_FORCE_SYNC_MS;
      const controller = new AbortController();
      controllers.push(controller);
      let appliedOwnedResult = false;
      const applyOwnedJson = (ownedJson) => {
        const tokens = normalizeOwnedNftTokens(ownedJson, collection);
        setTokens(tokens);
        appliedOwnedResult = true;
        return tokens;
      };
      const runBackgroundSync = (force = false) => {
        syncDemonKingNfts({
          ...demonKingSyncTarget,
          collection,
          force,
          signal: controller.signal,
        })
          .then((ownedJson) => {
            if (!controller.signal.aborted) applyOwnedJson(ownedJson);
          })
          .catch((err) => {
            if (!controller.signal.aborted && !appliedOwnedResult) {
              setError((err?.message || `Could not sync ${label} NFTs`).slice(0, 120));
            }
          });
      };
      setLoading(true);
      setError(null);
      fetchOwnedNftsForPlayerWallets({
        ...demonKingSyncTarget,
        collection,
        signal: controller.signal,
      })
        .then((ownedJson) => {
          if (controller.signal.aborted) return;
          const tokens = applyOwnedJson(ownedJson);
          if (tokens.length) {
            if (syncKey && shouldForceRefresh) demonKingPortForceSyncRef.current.set(syncKey, Date.now());
            runBackgroundSync(Boolean(shouldForceRefresh));
          }
        })
        .catch(async (err) => {
          if (controller.signal.aborted) return;
          try {
            const ownedJson = await syncDemonKingNfts({
              ...demonKingSyncTarget,
              collection,
              signal: controller.signal,
            });
            if (!controller.signal.aborted) applyOwnedJson(ownedJson);
          } catch (syncErr) {
            if (!controller.signal.aborted) {
              setError((err?.message || syncErr?.message || `Could not read ${label} NFTs`).slice(0, 120));
            }
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    };
    syncCollection({
      collection: 'demonking',
      setTokens: setDemonKingNfts,
      setLoading: setDemonKingNftLoading,
      setError: setDemonKingNftError,
      label: 'Demon King',
    });
    syncCollection({
      collection: 'dragon',
      setTokens: setDragonNfts,
      setLoading: setDragonNftLoading,
      setError: setDragonNftError,
      label: 'Dragon',
    });
    return () => controllers.forEach((controller) => controller.abort());
  }, [demonKingSyncTarget, hasDemonKingWallet, view]);

  const handleDeselect = useCallback(() => sendToGodot('deselect_building'), [sendToGodot]);
  const handleUpgrade = useCallback(() => {
    sendToGodot('upgrade_building');
    setView('ACTIONS'); // Close after upgrading
  }, [sendToGodot]);

  const handleMainShipUpgrade = useCallback(() => {
    sendToGodot('upgrade_main_ship');
    setView('ACTIONS');
  }, [sendToGodot]);

  const handleBuyShip = useCallback(() => {
    sendToGodot('buy_ship');
    setView('ACTIONS'); // Close after upgrading
  }, [sendToGodot]);

  const canAffordAltarCost = useCallback((cost = {}) => (
    (resources?.gold || 0) >= (cost.gold || 0)
    && (resources?.wood || 0) >= (cost.wood || 0)
    && (resources?.ore || 0) >= (cost.ore || 0)
  ), [resources]);

  const handleAltarUpgrade = useCallback(async (skillId) => {
    if (altarBusy) return;
    const token = player?.token || window._playerToken;
    if (!token) {
      setAltarError('Login required');
      return;
    }
    const current = Number(altarLevels[skillId] || 0);
    const cost = ALTAR_SKILLS[skillId]?.costs?.[current] || {};
    if (current >= 3) return;
    if (!canAffordAltarCost(cost)) {
      setAltarError('Not enough resources');
    }
    setAltarBusy(true);
    setAltarError(canAffordAltarCost(cost) ? '' : 'Trying server upgrade...');
    try {
      const res = await fetch(`/api/altar/skills/${skillId}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: '{}',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      if (json.resources) {
        window.onGodotMessage?.({ action: 'resources', data: json.resources });
        sendToGodot('set_resources', json.resources);
      }
      if (json.altar_skills) {
        const nextLevels = {
          prosperity: Number(json.altar_skills.prosperity || 0),
          ward: Number(json.altar_skills.ward || 0),
          glory: Number(json.altar_skills.glory || 0),
        };
        setAltarLevels(nextLevels);
        sendToGodot('set_altar_skills', nextLevels);
        window.onGodotMessage?.({
          action: 'building_selected',
          data: { ...building, altar_skills: nextLevels },
        });
      }
    } catch (err) {
      setAltarError((err?.message || 'Upgrade failed').slice(0, 120));
    } finally {
      setAltarBusy(false);
    }
  }, [altarBusy, altarLevels, building, canAffordAltarCost, player?.token, sendToGodot]);

  const handleTownHallFlagFile = useCallback(async (event) => {
    const file = event?.target?.files?.[0] || null;
    setFlagFile(file);
    setFlagStatus('');
    setFlagPreview('');
    if (!file) return;
    try {
      const dataUrl = await prepareTownHallFlagImage(file);
      setFlagPreview(dataUrl);
    } catch (err) {
      setFlagFile(null);
      setFlagStatus((err?.message || 'Could not prepare image').slice(0, 120));
    }
  }, []);

  const applyTownHallFlagLocal = useCallback((url, flagData = null) => {
    const nextUrl = String(url || '').trim();
    const nextBuilding = { ...building, town_hall_flag_url: nextUrl, flag_url: nextUrl };
    window.onGodotMessage?.({ action: 'building_selected', data: nextBuilding });
    window.dispatchEvent(new CustomEvent('clash-player-patch', {
      detail: {
        town_hall_flag: flagData,
        buildings: Array.isArray(player?.buildings)
          ? player.buildings.map((row) => {
              const type = row?.type || row?.id;
              return type === 'town_hall' ? { ...row, town_hall_flag_url: nextUrl, flag_url: nextUrl } : row;
            })
          : player?.buildings,
      },
    }));
    sendToGodot('set_town_hall_flag', { url: nextUrl });
  }, [building, player?.buildings, sendToGodot]);

  const handleTownHallFlagUpload = useCallback(async () => {
    if (flagBusy) return;
    const token = player?.token || window._playerToken;
    if (!token) {
      setFlagStatus('Login required');
      return;
    }
    if (!flagFile) {
      setFlagStatus('Choose a flag image');
      return;
    }
    const buyer = paymentSolWallet?.publicKey?.toBase58?.() || '';
    if (!buyer) {
      setFlagStatus('Connect a Solana wallet to pay with CLASH');
      openSolanaConnect();
      return;
    }
    setFlagBusy(true);
    setFlagStatus('Preparing image...');
    try {
      const imageData = flagPreview || await prepareTownHallFlagImage(flagFile);
      setFlagPreview(imageData);
      setFlagStatus('Confirm CLASH payment...');
      const payment = await buySolanaShopItem({
        solWallet: paymentSolWallet,
        buyer,
        token,
        sku: TOWN_HALL_FLAG_SKU,
        payment: 'clash',
        quantity: 1,
      });
      setFlagStatus('Uploading flag...');
      const res = await fetch('/api/town-hall-flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({
          txSignature: payment.signature,
          imageData,
          mimeType: 'image/png',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      const url = json.town_hall_flag_url || json.town_hall_flag?.image_url;
      if (!url) throw new Error('Server did not return flag URL');
      applyTownHallFlagLocal(url, json.town_hall_flag || { image_url: url });
      setFlagStatus('Flag updated');
    } catch (err) {
      setFlagStatus((err?.shortMessage || err?.message || 'Flag upload failed').slice(0, 180));
    } finally {
      setFlagBusy(false);
    }
  }, [applyTownHallFlagLocal, flagBusy, flagFile, flagPreview, openSolanaConnect, paymentSolWallet, player?.token]);

  const handleTownHallFlagReset = useCallback(async () => {
    if (flagBusy) return;
    const token = player?.token || window._playerToken;
    if (!token) {
      setFlagStatus('Login required');
      return;
    }
    setFlagBusy(true);
    setFlagStatus('Restoring standard flag...');
    try {
      const res = await fetch('/api/town-hall-flag', {
        method: 'DELETE',
        headers: { 'x-token': token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setFlagFile(null);
      setFlagPreview('');
      applyTownHallFlagLocal('', null);
      setFlagStatus('Standard flag restored');
    } catch (err) {
      setFlagStatus((err?.message || 'Flag reset failed').slice(0, 180));
    } finally {
      setFlagBusy(false);
    }
  }, [applyTownHallFlagLocal, flagBusy, player?.token]);

  if (!building) return null;

  const isMaxLevel = building.level >= building.max_level;
  const upgHealth = Math.floor(Number(building.max_hp || 0) * 0.2);

  const renderActions = () => (
    <div style={{ ...styles.actionsWrap, ...isMobile && { bottom: 130, gap: 16 } }}>
      <div style={styles.actionLabel}>
        <span style={styles.actionName}>{building.name}</span>
        <span style={styles.actionLevel}>Level {building.level}</span>
      </div>
      {(building.is_enemy || building.id === 'altar' || building.id === 'main_ship' || (isMaxLevel && building.id !== 'altar')) && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnInfo }}
          onClick={() => setView('INFO')}
          title="Info"
          aria-label="Info"
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <span style={styles.iconLarge}>i</span>
        </button>
      )}

      {(building.id === 'barn' || building.is_barn) && !building.is_enemy && (
        <button 
          style={{ ...styles.circleBtn, ...styles.btnTroops }} 
          onClick={onOpenTroops}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </button>
      )}

      {building.id === 'altar' && !building.is_enemy && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnAltar }}
          onClick={() => setView('ALTAR_SKILLS')}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width={isMobile ? 32 : 40} height={isMobile ? 32 : 40} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      )}

      {building.id === 'town_hall' && !building.is_enemy && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnFlag }}
          onClick={() => setView('FLAG')}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width={isMobile ? 32 : 38} height={isMobile ? 32 : 38} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 22V4"></path>
            <path d="M5 4h12l-2 4 2 4H5"></path>
          </svg>
        </button>
      )}

      {building.id === 'port' && !building.is_enemy && !building.has_ship && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnTroops }}
          onClick={() => setView('BUY_SHIP')}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="3"></circle>
            <line x1="12" y1="22" x2="12" y2="8"></line>
            <path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>
          </svg>
        </button>
      )}

      {(building.id === 'main_ship' || (building.id === 'port' && building.has_ship)) && !building.is_enemy && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnTroops }}
          onClick={() => setView('LOAD_TROOPS')}
          title="Add Troops"
          aria-label="Add Troops"
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <line x1="19" y1="8" x2="19" y2="14"></line>
            <line x1="22" y1="11" x2="16" y2="11"></line>
          </svg>
        </button>
      )}

      {!building.is_enemy && !isMaxLevel && (
        <button 
          style={{ ...styles.circleBtn, ...styles.btnUpgrade, ...isMobile && { width: 56, height: 56 } }} 
          onClick={() => setView('UPGRADE')}
          title="Upgrade"
          aria-label="Upgrade"
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
        >
          <svg width={isMobile ? 32 : 40} height={isMobile ? 32 : 40} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      )}
    </div>
  );

  const renderModal = (title, level, leftContent, centerImg, rightContent, mainActionText, onMainAction) => {
    const isAltarModal = title === 'ALTAR';
    return (
    <div style={{...LT.overlay, ...(isMobile ? { alignItems: 'stretch' } : {})}} onClick={handleDeselect}>
      <div style={{...LT.panel, ...(isAltarModal && !isMobile ? { width: 1010, maxWidth: '94vw' } : {}), ...(isMobile ? { width: '100vw', maxWidth: '100vw', height: '100%', maxHeight: 'none', borderRadius: 0 } : {})}} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{...LT.header, height: isMobile ? 44 : 54}}>
          <span style={{...LT.headerTitle, fontSize: isMobile ? 18 : 24}}>{title}</span>
          <button style={LT.closeBtn} onClick={handleDeselect}>X</button>
        </div>

        {/* Scrollable content area */}
        <div style={{ ...styles.contentLayout, marginTop: isMobile ? 8 : 12, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'nowrap', gap: isMobile ? 12 : (isAltarModal ? 34 : 20), minHeight: 0, padding: isMobile ? '8px 12px 22px' : (isAltarModal ? '0 20px 26px' : undefined) }}>

          {/* Image column (on mobile: first, smaller) */}
          <div style={{ flex: isMobile ? 'none' : (isAltarModal ? '0 0 460px' : 1), display: 'flex', flexDirection: 'column', alignItems: 'center', ...isMobile && { order: 1 } }}>
             <div style={styles.characterWrapper}>
               {level && (
                 <div style={styles.upgradeBadge}>
                   <div style={styles.badgeBigPart}>
                     <span style={styles.badgeLvlText}>Lvl</span>
                     <span style={{...styles.badgeLvlNumber, fontSize: isMobile ? 22 : undefined}}>{level}</span>
                   </div>
                 </div>
               )}
               <div style={{ ...styles.characterSphere, ...(isAltarModal && !isMobile ? { width: 280, height: 280 } : {}), ...(isMobile ? { width: 110, height: 110 } : {})}}>
                  {centerImg}
               </div>
             </div>
          </div>

          {/* Stats & Cost column */}
          <div style={{...styles.leftColumn, ...(isAltarModal && !isMobile ? { width: 410 } : {}), ...isMobile && { width: '100%', order: 2, marginTop: 4 }}}>
             <h3 style={{...styles.sectionTitle, marginTop: 0, fontSize: isMobile ? 16 : undefined}}>Stats</h3>
             <div style={styles.statsContainer}>
                {leftContent}
             </div>
             {rightContent && (
               <div style={{ marginTop: isMobile ? 12 : 20 }}>
                 {rightContent}
               </div>
             )}
          </div>
        </div>

        {/* Action button — always at bottom, outside scroll area */}
        {mainActionText && (
          <div style={{ padding: isMobile ? '8px 12px 12px' : '12px 20px 16px', display: 'flex', justifyContent: 'center' }}>
            <button
              style={{...styles.actionBtn, width: '100%', maxWidth: isMobile ? '100%' : 240}}
              onClick={onMainAction}
            >
               {mainActionText}
            </button>
          </div>
        )}
      </div>
    </div>
    );
  };

  const StatBox = ({ label, current, upgradeTo }) => (
    <div style={styles.statBox}>
      <div style={styles.statBoxLabel}>{label}</div>
      <div style={styles.statBoxValues}>
        <span style={styles.statCurrent}>{current}</span>
        {upgradeTo && (
           <>
             <span style={styles.statArrow}>→</span>
             <span style={styles.statUpgraded}>{upgradeTo}</span>
           </>
        )}
      </div>
    </div>
  );

  const ResourceReqs = ({ costObj, title }) => (
    <>
      <h3 style={styles.sectionTitle}>{title || "Resource Cost"}</h3>
      <div style={styles.reqGrid}>
        {costObj && Object.keys(costObj).length > 0 ? Object.entries(costObj).map(([res, amt]) => {
          if (amt === 0) return null;
          return (
            <div key={res} style={styles.reqBox}>
              <img src={ICONS[res] || goldIcon} style={styles.reqIconImg} alt={res} />
              <span style={styles.reqAmt}>{amt.toLocaleString()}</span>
            </div>
          );
        }) : (
          <div style={styles.reqBoxMax}>
            <span style={{color: '#94a3b8', fontSize: 13}}>No Requirements</span>
          </div>
        )}
      </div>
    </>
  );

  const buildingImg = THUMBNAIL_MAP[building.id] ? (
    <img
      src={THUMBNAIL_MAP[building.id]}
      alt={building.name}
      style={building.id === 'altar'
        ? { ...styles.characterImg, ...styles.altarStaticImg }
        : { ...styles.characterImg, ...(THUMBNAIL_STYLE_MAP[building.id] || {}) }}
    />
  ) : (
    <div style={{...styles.characterImg, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 150}}>🏠</div>
  );

  const renderInfo = () => {
    const description = DESC_MAP[building.id];
    if (building.id === 'main_ship') {
      const capacity = Number(building.ship_capacity || 0);
      const loaded = Array.isArray(building.ship_troops) ? building.ship_troops.length : 0;
      const energy = Number(building.ship_energy || 4);
      const cannonDamage = Number(building.ship_cannon_damage || 500);
      const cannonCost = Number(building.ship_cannon_base_cost || 1);
      const unlockedAbilities = mainShipAbilityLabels(building);
      const leftContent = (
        <>
          <StatBox label="Troop Capacity" current={capacity} />
          <StatBox label="Loaded Slots" current={loaded} />
          <StatBox label="Battle Energy" current={energy} />
          <StatBox label="Cannon Damage" current={cannonDamage.toLocaleString()} />
          <StatBox label="First Cannon Cost" current={cannonCost} />
          <StatBox label="Tactical Abilities" current={`${unlockedAbilities.length} / 4`} />
          <StatBox label="Level" current={building.ship_level || building.level} />
        </>
      );
      const rightContent = (
        <>
          <h3 style={styles.sectionTitle}>Description</h3>
          <div style={styles.descriptionBox}>
            <span style={styles.descriptionText}>{description}</span>
          </div>
          <h3 style={styles.sectionTitle}>Status</h3>
          <div style={{...styles.reqBoxMax, padding: 16, background: 'rgba(0, 0, 0, 0.05)', borderRadius: 8, border: '1px solid rgba(0, 0, 0, 0.1)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)'}}>
            <span style={{color: '#377d9f', fontSize: 16, fontWeight: 800}}>
              {unlockedAbilities.length > 0 ? unlockedAbilities.join(' · ') : 'Basic cannon and rally'}
            </span>
          </div>
        </>
      );
      return renderModal('MAIN SHIP', building.ship_level || building.level, leftContent, buildingImg, rightContent, null, null);
    }
    const leftContent = building.id === 'shark_trap' ? (
      <>
        <StatBox label="Damage" current={building.damage} />
        <StatBox label="Level" current={building.level} />
      </>
    ) : building.id === 'cannon' ? (
      <>
        <StatBox label="Damage" current={building.damage} />
        <StatBox label="Health" current={building.max_hp} />
        <StatBox label="Level" current={building.level} />
      </>
    ) : (
      <>
        <StatBox label="Health" current={building.max_hp} />
        <StatBox label="Level" current={building.level} />
      </>
    );
    if (building.id === 'altar') {
      return renderModal('ALTAR', building.level, leftContent, buildingImg, null, null, null);
    }
    const rightContent = (
      <>
         {description && (
           <>
             <h3 style={styles.sectionTitle}>Description</h3>
             <div style={styles.descriptionBox}>
               <span style={styles.descriptionText}>{description}</span>
             </div>
           </>
         )}
         <h3 style={styles.sectionTitle}>Status</h3>
         <div style={{...styles.reqBoxMax, padding: 16, background: 'rgba(0, 0, 0, 0.05)', borderRadius: 16, border: '1px solid rgba(0, 0, 0, 0.1)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)'}}>
           <span style={{color: '#377d9f', fontSize: 16, fontWeight: 800}}>Functional</span>
         </div>
      </>
    );
    return renderModal(building.name.toUpperCase(), building.level, leftContent, buildingImg, rightContent, null, null);
  };

  const renderTownHallFlag = () => {
    const currentFlag = building.town_hall_flag_url || building.flag_url || player?.town_hall_flag?.image_url || '';
    const preview = flagPreview || currentFlag;
    const hasCustomFlag = !!currentFlag;
    const hasSolanaPaymentWallet = !!solWallet?.publicKey?.toBase58?.();
    return (
      <div style={{ ...LT.overlay, ...(isMobile ? { alignItems: 'stretch' } : {}) }} onClick={handleDeselect}>
        <div style={{ ...LT.panel, ...(isMobile ? { width: '100vw', maxWidth: '100vw', height: '100%', maxHeight: 'none', borderRadius: 0 } : { width: 560 }) }} onClick={e => e.stopPropagation()}>
          <div style={{ ...LT.header, height: isMobile ? 44 : 54 }}>
            <span style={{ ...LT.headerTitle, fontSize: isMobile ? 18 : 24 }}>TOWN HALL FLAG</span>
            <button style={LT.closeBtn} onClick={handleDeselect}>X</button>
          </div>
          <div style={{ padding: isMobile ? '14px 16px 18px' : '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={styles.flagLibraryHeader}>Library</div>
            <div style={{ ...styles.flagLibraryGrid, ...(isMobile ? styles.flagLibraryGridMobile : null) }}>
              <button
                type="button"
                style={{
                  ...styles.flagLibraryCard,
                  ...(!hasCustomFlag && !flagPreview ? styles.flagLibraryCardActive : null),
                }}
                onClick={() => {
                  if (hasCustomFlag) {
                    handleTownHallFlagReset();
                    return;
                  }
                  setFlagFile(null);
                  setFlagPreview('');
                  setFlagStatus('Standard flag selected');
                }}
                disabled={flagBusy}
              >
                <div style={styles.flagDefaultThumb}>
                  <span style={styles.flagDefaultMark}>II</span>
                </div>
                <div style={styles.flagLibraryTitle}>Standard</div>
                <div style={styles.flagLibrarySub}>{hasCustomFlag ? 'Restore original' : 'Current flag'}</div>
              </button>
              <div style={{
                ...styles.flagLibraryCard,
                ...(hasCustomFlag || flagPreview ? styles.flagLibraryCardActive : null),
              }}>
                <div style={styles.flagLibraryImageWrap}>
                  {preview ? (
                    <img src={preview} alt="Custom Town Hall flag" style={styles.flagLibraryImage} />
                  ) : (
                    <span style={styles.flagLibraryEmpty}>+</span>
                  )}
                </div>
                <div style={styles.flagLibraryTitle}>Custom</div>
                <div style={styles.flagLibrarySub}>{hasCustomFlag ? 'Your uploaded flag' : 'Upload slot'}</div>
              </div>
            </div>
            <div style={styles.flagCopy}>
              Standard is free to restore anytime. Uploading a custom square flag costs $5 in CLASH on Solana and is visible to every player who sees your base.
            </div>
            <label style={styles.flagFileLabel}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleTownHallFlagFile}
                disabled={flagBusy}
                style={styles.flagFileInput}
              />
              {flagFile ? flagFile.name : 'Choose image'}
            </label>
            {flagStatus && (
              <div style={{
                ...styles.flagStatus,
                ...(['Flag updated', 'Standard flag restored', 'Standard flag selected'].includes(flagStatus) ? styles.flagStatusOk : styles.flagStatusError),
              }}>
                {flagStatus}
              </div>
            )}
            <button
              type="button"
              style={{
                ...styles.actionBtn,
                width: '100%',
                opacity: flagBusy || !flagFile ? 0.65 : 1,
                cursor: flagBusy || !flagFile ? 'not-allowed' : 'pointer',
              }}
              disabled={flagBusy || !flagFile}
              onClick={handleTownHallFlagUpload}
            >
              {flagBusy ? 'Processing...' : hasSolanaPaymentWallet ? 'Pay $5 CLASH & Upload' : 'Connect Solana Wallet'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderUpgrade = () => {
    if (building.id === 'main_ship') {
      const currentLevel = Number(building.ship_level || building.level || 1);
      const maxLevel = Number(building.max_level || building.ship_max_level || 10);
      const currentCapacity = Number(building.ship_capacity || 0);
      const nextCapacity = Number(building.ship_next_capacity || currentCapacity);
      const currentEnergy = Number(building.ship_energy || 4);
      const nextEnergy = Number(building.ship_next_energy || currentEnergy);
      const currentCannonDamage = Number(building.ship_cannon_damage || 500);
      const nextCannonDamage = Number(building.ship_next_cannon_damage || currentCannonDamage);
      const currentCannonCost = Number(building.ship_cannon_base_cost || 1);
      const nextCannonCost = Number(building.ship_next_cannon_base_cost || currentCannonCost);
      const nextUnlocks = Array.isArray(building.ship_next_unlocks)
        ? building.ship_next_unlocks.filter(Boolean)
        : [];
      const shipUpgradeCost = building.ship_upgrade_cost || {};
      const leftContent = (
        <>
          <StatBox label="Troop Capacity" current={currentCapacity} upgradeTo={nextCapacity} />
          <StatBox label="Battle Energy" current={currentEnergy} upgradeTo={nextEnergy} />
          <StatBox label="Cannon Damage" current={currentCannonDamage.toLocaleString()} upgradeTo={nextCannonDamage.toLocaleString()} />
          <StatBox label="First Cannon Cost" current={currentCannonCost} upgradeTo={nextCannonCost} />
          <StatBox label="New Unlock" current={nextUnlocks.length > 0 ? nextUnlocks.join(', ') : 'Energy reserve'} />
          <StatBox label="Level" current={currentLevel} upgradeTo={currentLevel < maxLevel ? currentLevel + 1 : null} />
        </>
      );
      const rightContent = <ResourceReqs costObj={shipUpgradeCost} title="Upgrade Cost" />;
      return renderModal(
        'UPGRADE MAIN SHIP',
        currentLevel,
        leftContent,
        buildingImg,
        rightContent,
        'Upgrade Now',
        handleMainShipUpgrade,
      );
    }
    const isTownHallUpgrade = building.id === 'town_hall';
    const currentTownHallTrophies = raidWinTrophiesForTownHall(building.level);
    const nextTownHallTrophies = raidWinTrophiesForTownHall(Number(building.level || 1) + 1);
    const trophyRewardIncreases = nextTownHallTrophies > currentTownHallTrophies;
    const leftContent = building.id === 'shark_trap' ? (
      <>
        <StatBox label="Damage" current={building.damage} upgradeTo={building.next_damage} />
        <StatBox label="Level" current={building.level} upgradeTo={building.level + 1} />
      </>
    ) : building.id === 'cannon' ? (
      <>
        <StatBox label="Damage" current={building.damage} upgradeTo={building.next_damage} />
        <StatBox label="Health" current={building.max_hp} upgradeTo={building.next_hp} />
        <StatBox label="Level" current={building.level} upgradeTo={building.level + 1} />
      </>
    ) : (
      <>
        <StatBox label="Health" current={building.max_hp} upgradeTo={building.max_hp + upgHealth} />
        <StatBox label="Level" current={building.level} upgradeTo={building.level + 1} />
      </>
    );
    const rightContent = (
      <>
        <ResourceReqs costObj={building.upgrade_cost} title="Upgrade Cost" />
        {isTownHallUpgrade && (
          <div style={styles.trophyUpgradeNotice}>
            <img src={trophyIcon} alt="" style={styles.trophyUpgradeIcon} />
            <div style={styles.trophyUpgradeCopy}>
              <strong style={styles.trophyUpgradeTitle}>
                {trophyRewardIncreases ? 'Trophy reward increases' : 'Maximum trophy reward unlocked'}
              </strong>
              <span style={styles.trophyUpgradeText}>
                {trophyRewardIncreases
                  ? `New Town Hall tier: +${currentTownHallTrophies} to +${nextTownHallTrophies}. Victories over bases at this tier award the higher base reward.`
                  : `This Town Hall tier keeps the maximum base victory reward of +${currentTownHallTrophies} trophies.`}
              </span>
            </div>
          </div>
        )}
      </>
    );

    return renderModal(
      `UPGRADE ${building.name.toUpperCase()}`, 
      building.level, 
      leftContent, 
      buildingImg, 
      rightContent, 
      "Upgrade Now", 
      handleUpgrade
    );
  };

  const AltarResourceCards = ({ cost = {} }) => (
    <div style={{ ...styles.altarReqGrid, ...(isMobile ? styles.altarReqGridMobile : null) }}>
      {['gold', 'ore', 'wood'].map((res) => {
        const amt = Number(cost[res] || 0);
        if (amt <= 0) return null;
        const amountLabel = amt.toLocaleString().replace(/,/g, ' ');
        return (
          <div key={res} style={{ ...styles.altarReqBox, ...(isMobile ? styles.altarReqBoxMobile : null) }}>
            <img src={ICONS[res] || goldIcon} style={{ ...styles.altarReqIcon, ...(isMobile ? styles.altarReqIconMobile : null) }} alt={res} />
            <span style={{ ...styles.altarReqAmt, ...(isMobile ? styles.altarReqAmtMobile : null) }}>{amountLabel}</span>
          </div>
        );
      })}
    </div>
  );

  const formatCost = (cost = {}) => (
    ['gold', 'ore', 'wood']
      .filter((key) => Number(cost[key] || 0) > 0)
      .map((key) => Number(cost[key]).toLocaleString())
      .join(' / ')
  );

  const renderAltarSkills = () => {
    const active = ALTAR_SKILLS[altarTab] || ALTAR_SKILLS.prosperity;
    const current = Number(altarLevels[altarTab] || 0);
    const nextCost = active.costs[current] || null;
    const canAffordUpgrade = !!nextCost && canAffordAltarCost(nextCost);
    const canClickUpgrade = current < 3 && nextCost && !altarBusy;

    const CompactCost = ({ cost = {} }) => (
      <div style={{ ...styles.altarTreeCostList, ...(isMobile ? styles.altarTreeCostListMobile : null) }}>
        {['gold', 'ore', 'wood'].map((res) => {
          const amt = Number(cost[res] || 0);
          if (amt <= 0) return null;
          return (
            <div key={res} style={{ ...styles.altarTreeCostPill, ...(isMobile ? styles.altarTreeCostPillMobile : null) }}>
              <img src={ICONS[res] || goldIcon} style={{ ...styles.altarTreeCostIcon, ...(isMobile ? styles.altarTreeCostIconMobile : null) }} alt={res} />
              <span>{amt.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    );

    return (
      <div style={{ ...LT.overlay, ...(isMobile ? { alignItems: 'stretch' } : {}) }} onClick={handleDeselect}>
        <div style={{ ...LT.panel, ...styles.altarTreePanel, ...(isMobile ? styles.altarTreePanelMobile : null) }} onClick={e => e.stopPropagation()}>
          <div style={{ ...LT.header, height: isMobile ? 44 : 54 }}>
            <span style={{ ...LT.headerTitle, fontSize: isMobile ? 18 : 24 }}>ALTAR UPGRADES</span>
            <button style={LT.closeBtn} onClick={handleDeselect}>X</button>
          </div>

          <div style={{ ...styles.altarTabs, ...styles.altarTreeTabs, ...(isMobile ? styles.altarTreeTabsMobile : null) }}>
            {ALTAR_SKILL_ORDER.map((skillId) => {
              const selected = altarTab === skillId;
              return (
                <button
                  key={skillId}
                  style={{ ...styles.altarTab, ...(isMobile ? styles.altarTabMobile : null), ...(selected ? styles.altarTabActive : null) }}
                  onClick={() => { setAltarTab(skillId); setAltarError(''); }}
                >
                  <span>{ALTAR_SKILLS[skillId].label}</span>
                  <b>Lv {Number(altarLevels[skillId] || 0)}/3</b>
                </button>
              );
            })}
          </div>

          <div style={{ ...styles.altarTreeBody, ...(isMobile ? styles.altarTreeBodyMobile : null) }}>
            <div style={{ ...styles.altarTreeCanvas, ...(isMobile ? styles.altarTreeCanvasMobile : null) }}>
              <div style={{ ...styles.altarTreeBranchTitle, ...(isMobile ? styles.altarTreeBranchTitleMobile : null) }}>{active.title}</div>
              <div style={{ ...styles.altarTreeBranchSub, ...(isMobile ? styles.altarTreeBranchSubMobile : null) }}>Current: {formatAltarSkillBonus(active, current)}</div>
              <div style={{ ...styles.altarTreePath, ...(isMobile ? styles.altarTreePathMobile : null) }}>
                {[1, 2, 3].map((level) => {
                  const unlocked = level <= current;
                  const isNext = level === current + 1;
                  return (
                    <div key={level} style={{ ...styles.altarTreeRow, ...(isMobile ? styles.altarTreeRowMobile : null) }}>
                      <div style={{ ...styles.altarTreeNodeWrap, ...(isMobile ? styles.altarTreeNodeWrapMobile : null) }}>
                        {level < 3 && <div style={{ ...styles.altarTreeLine, ...(isMobile ? styles.altarTreeLineMobile : null) }} />}
                        <div style={{ ...styles.altarTreeNode, ...(isMobile ? styles.altarTreeNodeMobile : null), ...(unlocked ? styles.altarTreeNodeUnlocked : null), ...(isNext ? styles.altarTreeNodeNext : null) }}>
                          <span style={{ ...styles.altarTreeNodeLevel, ...(isMobile ? styles.altarTreeNodeLevelMobile : null) }}>Lv{level}</span>
                          <span style={{ ...styles.altarTreeNodeValue, ...(isMobile ? styles.altarTreeNodeValueMobile : null) }}>
                            {active.bonusType === 'range'
                              ? `+${active.minValue}-${active.values[level - 1]}`
                              : active.bonusType === 'flat'
                                ? `+${active.values[level - 1]}`
                                : `+${active.values[level - 1]}%`}
                          </span>
                        </div>
                      </div>
                      <div style={{ ...styles.altarTreeNodeInfo, ...(isMobile ? styles.altarTreeNodeInfoMobile : null), ...(unlocked ? styles.altarTreeNodeInfoUnlocked : null) }}>
                        <div style={{ ...styles.altarTreeNodeName, ...(isMobile ? styles.altarTreeNodeNameMobile : null) }}>
                          {active.label} {level}{unlocked ? ' ACTIVE' : isNext ? ' NEXT' : ''}
                        </div>
                        <div style={{ ...styles.altarTreeNodeBonus, ...(isMobile ? styles.altarTreeNodeBonusMobile : null) }}>{formatAltarSkillBonus(active, level)}</div>
                        <CompactCost cost={active.costs[level - 1]} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ ...styles.altarTreeSide, ...(isMobile ? styles.altarTreeSideMobile : null) }}>
              <div style={{ ...styles.altarTreeSideTitle, ...(isMobile ? styles.altarTreeSideTitleMobile : null) }}>{current >= 3 ? 'Branch Complete' : `Upgrade to Lv.${current + 1}`}</div>
              <div style={{ ...styles.altarTreeSideText, ...(isMobile ? styles.altarTreeSideTextMobile : null) }}>
                {current >= 3 ? formatAltarSkillBonus(active, 3) : `Next bonus: ${formatAltarSkillBonus(active, current + 1)}`}
              </div>
              {nextCost ? <AltarResourceCards cost={nextCost} /> : <div style={styles.altarTreeDone}>MAX LEVEL</div>}
              {altarError && <div style={styles.altarError}>{altarError}</div>}
              <button
                style={{ ...styles.actionBtn, width: '100%', marginTop: isMobile ? 10 : 16, minHeight: isMobile ? 46 : undefined, opacity: canClickUpgrade ? (canAffordUpgrade ? 1 : 0.82) : 0.55 }}
                disabled={!canClickUpgrade}
                onClick={() => handleAltarUpgrade(altarTab)}
              >
                {current >= 3 ? 'MAX LEVEL' : altarBusy ? 'UPGRADING...' : 'UPGRADE NOW'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBuyShip = () => {
    const shipCost = building.ship_cost || { gold: 250 };
    const leftContent = (
      <>
        <StatBox label="Troop Capacity" current={0} upgradeTo={(building.level || 1) * 3} />
        <StatBox label="Barrage / Artillery" current={"None"} upgradeTo={250} />
      </>
    );
    const rightContent = <ResourceReqs costObj={shipCost} title="Unlock Cost" />;
    
    const shipImg = <img src={imgShip} alt="Ship" style={styles.characterImg} />;

    return renderModal(
      "UNLOCK GUNBOAT", 
      null, 
      leftContent, 
      shipImg, 
      rightContent, 
      "Unlock Ship", 
      handleBuyShip
    );
  };

  const renderLoadTroops = () => {
    const shipLevel = Number(building.ship_level || 1);
    const shipTroops = localTroops || building.ship_troops || [];
    const capacity = building.ship_capacity || shipLevel * 3;
    const shipEnergy = Number(building.ship_energy || 4);
    const nextShipEnergy = Number(building.ship_next_energy || shipEnergy);
    const shipCannonDamage = Number(building.ship_cannon_damage || 500);
    const nextShipCannonDamage = Number(building.ship_next_cannon_damage || shipCannonDamage);
    const shipCannonCost = Number(building.ship_cannon_base_cost || 1);
    const nextShipCannonCost = Number(building.ship_next_cannon_base_cost || shipCannonCost);
    const isMainShip = building.id === 'main_ship';
    const shipMaxLevel = Number(building.max_level || building.ship_max_level || 10);
    const shipUnlockedAbilities = mainShipAbilityLabels(building);
    const shipNextUnlocks = Array.isArray(building.ship_next_unlocks)
      ? building.ship_next_unlocks.filter(Boolean)
      : [];
    const shipNextTownHall = Number(building.ship_next_town_hall || 1);
    const shipUpgradeCost = building.ship_upgrade_cost || {};
    const canAffordShipUpgrade = ['gold', 'wood', 'ore'].every((key) => Number(resources?.[key] || 0) >= Number(shipUpgradeCost?.[key] || 0));
    const portNumber = Number(building.port_number || 0);
    const troopLvls = building.troop_levels || {};
    const getTroopLvl = (name) => {
      const base = troopBaseName(name);
      return troopLvls[base] || troopLvls[base.toLowerCase()] || troopLvls[name] || troopLvls[String(name || '').toLowerCase()] || 1;
    };
    const allTroops = ['Knight', 'Mage', 'Archer', 'PeaShooter', 'Mimic', 'Necromancer', 'WindMage', 'Horror', 'MechanicalDragon', 'IceGolem'];
    const currentTownHallLevel = Number(buildingDefs?.th_level || buildingDefs?.town_hall_level || 1) || 1;
    const troopDefinitions = buildingDefs?.troops || {};
    const troopUnlock = (name) => {
      const base = troopBaseName(name);
      const snakeCase = base.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      const definition = troopDefinitions?.[name]
        || troopDefinitions?.[base]
        || troopDefinitions?.[base.toLowerCase()]
        || troopDefinitions?.[snakeCase]
        || {};
      const required = Math.max(1, Number(definition.min_town_hall_level || 1) || 1);
      return { required, unlocked: currentTownHallLevel >= required };
    };
    const loadedGroups = loadedTroopGroups(shipTroops);
    const selectedSpan = swapSlot !== null ? troopUnitSpanAt(shipTroops, swapSlot) : null;
    const selectedGroup = troopAction
      ? loadedGroups.find((group) => group.key === troopAction.key) || null
      : loadedTroopGroupForSlot(loadedGroups, swapSlot);
    const freeSlots = Math.max(0, capacity - shipTroops.length);
    const nftKeysFromTroops = (troops, base, skipSpan = null) => {
      const keys = [];
      (Array.isArray(troops) ? troops : []).forEach((entry, index) => {
        if (skipSpan && index >= skipSpan.start && index < skipSpan.end) return;
        const key = nftBackedEntryTokenKey(entry, base);
        if (key) keys.push(key);
      });
      return keys;
    };
    const currentShipId = building.server_id ?? building.id;
    const fleetShipTroops = Array.isArray(building.fleet_ship_troops) ? building.fleet_ship_troops : [];
    const loadedNftKeysForBase = (base) => new Set([
      ...nftKeysFromTroops(shipTroops, base, selectedSpan),
      ...fleetShipTroops.flatMap((ship) => {
        const shipId = ship?.server_id ?? ship?.id;
        if (String(shipId) === String(currentShipId)) return [];
        return nftKeysFromTroops(ship?.ship_troops, base);
      }),
    ]);
    const loadedDemonEntries = loadedNftKeysForBase('DemonKing');
    const loadedDragonEntries = loadedNftKeysForBase('FireDragon');
    const availableDemonNfts = demonKingNfts.filter((token) => !loadedDemonEntries.has(demonKingTokenKey(token)));
    const availableDragonNfts = dragonNfts.filter((token) => !loadedDragonEntries.has(demonKingTokenKey(token)));
    const demonKingInUseCount = Math.max(0, demonKingNfts.length - availableDemonNfts.length);
    const demonKingUseRatio = demonKingNfts.length ? `${demonKingInUseCount}/${demonKingNfts.length}` : '0/0';
    const dragonInUseCount = Math.max(0, dragonNfts.length - availableDragonNfts.length);
    const dragonUseRatio = dragonNfts.length ? `${dragonInUseCount}/${dragonNfts.length}` : '0/0';
    const nftOwnerForEntry = (entry) => {
      const base = troopBaseName(entry);
      const tokens = base === 'FireDragon' ? dragonNfts : base === 'DemonKing' ? demonKingNfts : [];
      const key = nftBackedEntryTokenKey(entry, base);
      const token = tokens.find((item) => demonKingTokenKey(item) === key);
      if (!token) return evmAddress || solAddress || aptosAddress || undefined;
      return token.wallet
        || (token.chain === 'solana' ? solAddress : token.chain === 'aptos' ? aptosAddress : evmAddress)
        || undefined;
    };
    const openNftShop = (collection = 'demonking') => {
      const safeCollection = typeof collection === 'string' ? collection : 'demonking';
      window.dispatchEvent(new CustomEvent('clash-open-nft-shop', {
        detail: {
          view: 'shop',
          collection: safeCollection,
        },
      }));
    };

    const openTroopInfo = (event, details) => {
      event.preventDefault();
      event.stopPropagation();
      setTroopInfo(details);
    };

    const renderTroopInfoButton = (details) => (
      <span
        role="button"
        tabIndex={0}
        aria-label={`View ${troopDisplayName(details.name)} details`}
        title="Unit details"
        style={{...LT.troopInfoButton, ...(isMobile ? LT.troopInfoButtonMobile : null)}}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => openTroopInfo(event, details)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          openTroopInfo(event, details);
        }}
      >
        i
      </span>
    );

    const handleLoadTroop = (name) => {
      const base = troopBaseName(name);
      const slotCost = troopSlotCost(name);
      if (swapSlot === null && shipTroops.length + slotCost > capacity) return;
      const replacement = troopReplacementEntries(name);
      if (swapSlot !== null) {
        const placement = troopSwapPlacement(shipTroops, swapSlot, name, capacity);
        if (!placement) return;
        if (placement.mode === 'append') {
          const nextTroops = [...shipTroops, ...replacement];
          setLocalTroops(nextTroops);
          sendToGodot('load_troop', { troop_name: name, nft_owner: nftBackedTroopConfig(base) ? nftOwnerForEntry(name) : undefined });
          setSwapSlot(null);
          setTroopAction(null);
          return;
        }
        const updated = [...shipTroops];
        updated.splice(placement.start, placement.end - placement.start, ...replacement);
        setLocalTroops(updated);
        sendToGodot('swap_troop', { slot: swapSlot, troop_name: name, nft_owner: nftBackedTroopConfig(base) ? nftOwnerForEntry(name) : undefined });
        const replacementGroup = loadedTroopGroupForSlot(loadedTroopGroups(updated), placement.start);
        setSwapSlot(replacementGroup?.start ?? null);
        setTroopAction(replacementGroup ? { key: replacementGroup.key, base: replacementGroup.base } : null);
      } else {
        const nextTroops = [...shipTroops, ...replacement];
        setLocalTroops(nextTroops);
        sendToGodot('load_troop', { troop_name: name, nft_owner: nftBackedTroopConfig(base) ? nftOwnerForEntry(name) : undefined });
      }
    };

    const renderNftTroopCards = ({
      base,
      tokens,
      availableTokens,
      loading,
      error,
      useRatio,
    }) => {
      const cfg = nftBackedTroopConfig(base);
      if (!cfg) return null;
      const image = cfg.image || UNIT_IMAGES[base];
      return (
        <>
          {loading && (
            <button type="button" style={{...LT.troopCard, ...LT.troopCardMuted, width: cardW, flexShrink: isMobile ? 1 : 0}}>
              {renderTroopInfoButton({ name: base, level: 1, status: 'Syncing NFT ownership' })}
              <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), ...LT.demonIdBadgeWithInfo, fontSize: isMobile ? 9 : 11}}>
                SYNC
              </div>
              <div style={{...LT.troopLvlBadge, fontSize: isMobile ? 12 : 16}}>NFT</div>
              <div style={LT.troopImgWrap}>
                <img src={image} alt={cfg.label} style={{ ...LT.troopImg, ...LT.troopImgMuted, transform: `scale(${CARD_TROOP_STYLE_MAP[base]?.scale || 1}) translateY(${CARD_TROOP_STYLE_MAP[base]?.offsetY || '0%'})` }} />
              </div>
              <div style={{...LT.bottomOverlay, height: isMobile ? 26 : 30}}>
                <span style={{...LT.costText, fontSize: isMobile ? 9 : 11}}>SYNCING</span>
              </div>
            </button>
          )}
          {!loading && availableTokens.map((token) => {
            const entry = nftBackedShipEntry(base, token);
            const tokenLabel = demonKingDisplayLabel(token, tokens);
            const usesRarity = base === 'DemonKing' || base === 'FireDragon';
            const rarityStyle = usesRarity
              ? nftRarityCardStyle(token.rarity, 1)
              : {};
            const rarityBadgeStyle = usesRarity
              ? nftRarityBadgeStyle(token.rarity, 1, { compact: true })
              : {};
            const disabled = swapSlot === null
              ? shipTroops.length + troopSlotCost(entry) > capacity
              : !troopSwapPlacement(shipTroops, swapSlot, entry, capacity);
            return (
              <button
                key={entry}
                type="button"
                aria-disabled={disabled}
                style={{...LT.troopCard, ...rarityStyle, width: cardW, flexShrink: isMobile ? 1 : 0, ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null)}}
                onClick={() => {
                  if (!disabled) handleLoadTroop(entry);
                }}
              >
                {renderTroopInfoButton({
                  name: entry,
                  level: Number(token.level || 1),
                  tokenLabel,
                  rarity: usesRarity ? nftRarityLabel(token.rarity, 1) : '',
                })}
                <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), ...LT.demonIdBadgeWithInfo, fontSize: isMobile ? 9 : 11}}>
                  {tokenLabel}
                </div>
                <div style={{...LT.demonUseBadge, fontSize: isMobile ? 9 : 10}}>
                  {useRatio}
                </div>
                <div style={{...LT.troopLvlBadge, ...rarityBadgeStyle, fontSize: isMobile ? 12 : 16}}>
                  {usesRarity ? nftRarityLabel(token.rarity, 1) : `Lvl ${token.level || 1}`}
                </div>
                <div style={LT.troopImgWrap}>
                  <img src={image} alt={cfg.label} style={{ ...LT.troopImg, transform: `scale(${CARD_TROOP_STYLE_MAP[base]?.scale || 1}) translateY(${CARD_TROOP_STYLE_MAP[base]?.offsetY || '0%'})` }} />
                </div>
                <div style={{...LT.bottomOverlay, height: isMobile ? 26 : 30}}>
                  <span style={{...LT.costText, fontSize: isMobile ? 10 : 12}}>
                    {troopSlotCost(base)} SLOTS
                  </span>
                </div>
              </button>
            );
          })}
          {!loading && availableTokens.length === 0 && (
            <button
              type="button"
              style={{...LT.troopCard, ...LT.troopCardMuted, width: cardW, flexShrink: isMobile ? 1 : 0}}
              onClick={() => openNftShop(cfg.collection)}
            >
              {renderTroopInfoButton({
                name: base,
                level: 1,
                status: hasDemonKingWallet ? (error || (tokens.length ? 'All owned NFTs are loaded' : 'NFT required')) : 'Connect a supported wallet',
              })}
              <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), ...LT.demonIdBadgeWithInfo, fontSize: isMobile ? 9 : 11}}>
                {useRatio}
              </div>
              <div style={{...LT.troopLvlBadge, fontSize: isMobile ? 12 : 16}}>NFT</div>
              <div style={LT.troopImgWrap}>
                <img src={image} alt={cfg.label} style={{ ...LT.troopImg, ...LT.troopImgMuted, transform: `scale(${CARD_TROOP_STYLE_MAP[base]?.scale || 1}) translateY(${CARD_TROOP_STYLE_MAP[base]?.offsetY || '0%'})` }} />
              </div>
              <div style={{...LT.bottomOverlay, height: isMobile ? 26 : 30}}>
                <span style={{...LT.costText, fontSize: isMobile ? 9 : 11}}>
                  {hasDemonKingWallet ? (error || (tokens.length ? 'ALL USED' : 'NEED NFT')) : 'CONNECT'}
                </span>
              </div>
            </button>
          )}
        </>
      );
    };

    const handleRemoveTroop = () => {
      if (!selectedGroup || troopActionPending) return;
      const span = selectedSpan
        && selectedGroup.spans.some((item) => item.start === selectedSpan.start)
        ? selectedSpan
        : selectedGroup.spans[0];
      if (!span) return;
      const updated = [...shipTroops];
      updated.splice(span.start, span.end - span.start);
      setLocalTroops(updated);
      setTroopActionPending('one');
      sendToGodot('remove_troop', { slot: span.start });
      const remainingGroup = loadedTroopGroups(updated).find((group) => group.key === selectedGroup.key);
      setSwapSlot(remainingGroup?.start ?? null);
    };

    const handleRemoveTroopGroup = () => {
      if (!selectedGroup || troopActionPending) return;
      const updated = [...shipTroops];
      [...selectedGroup.spans]
        .sort((a, b) => b.start - a.start)
        .forEach((span) => updated.splice(span.start, span.end - span.start));
      setLocalTroops(updated);
      setTroopActionPending('all');
      sendToGodot('remove_troop_group', { slot: selectedGroup.start });
      setSwapSlot(null);
    };

    const canPlaceTroop = (name) => {
      if (swapSlot === null) return shipTroops.length + troopSlotCost(name) <= capacity;
      return !!troopSwapPlacement(shipTroops, swapSlot, name, capacity);
    };

    const closeTroopAction = () => {
      setSwapSlot(null);
      setTroopAction(null);
      setTroopActionPending(null);
    };
    const handleClose = () => {
      closeTroopAction();
      setView('ACTIONS');
    };

    const slotW = isMobile ? 52 : (capacity > 6 ? 58 : 78);
    const slotH = isMobile ? 66 : (capacity > 6 ? 74 : 100);
    const cardW = isMobile ? 'clamp(84px, 27%, 102px)' : 100;
    const mobileLoadedBarStyle = isMobile ? {
      justifyContent: 'center',
      alignContent: 'center',
    } : null;
    const troopInfoBase = troopInfo ? troopBaseName(troopInfo.name) : '';
    const troopInfoCopy = troopInfoBase
      ? (TROOP_INFO[troopInfoBase] || {
          role: 'Combat unit',
          description: 'Deploy this unit from the main ship during an attack.',
        })
      : null;
    const troopInfoNft = troopInfoBase ? nftBackedTroopConfig(troopInfoBase) : null;
    const troopInfoSlots = troopInfoBase ? troopSlotCost(troopInfoBase) : 0;
    const troopInfoImage = troopInfoBase ? (troopInfoNft?.image || UNIT_IMAGES[troopInfoBase]) : null;
    return (
      <div style={{...LT.overlay, ...(isMobile ? { alignItems: 'stretch' } : {})}}>
        <div style={{...LT.panel, ...(isMobile ? { width: '100vw', maxWidth: '100vw', height: '100%', maxHeight: 'none', borderRadius: 0 } : {})}} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{...LT.header, height: isMobile ? 44 : 54}}>
            <span style={{...LT.headerTitle, fontSize: isMobile ? 18 : 24}}>
              {isMainShip ? `Main Ship Lv.${shipLevel}` : portNumber ? `Choose Troops - P${portNumber}` : 'Choose Troops'}
            </span>
            <button style={LT.closeBtn} onClick={handleClose}>X</button>
          </div>

          {isMainShip && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: isMobile ? '8px 10px' : '10px 16px', background: '#efe3c8', borderBottom: '2px solid #cbb98f' }}>
              <div style={{ color: '#5C3A21', fontWeight: 900, fontSize: isMobile ? 11 : 13 }}>
                Capacity {capacity}{shipLevel >= 5 ? ' · MAX CAPACITY' : ` · Next ${Number(building.ship_next_capacity || capacity)}`}
                <div style={{ color: '#6b552f', fontSize: isMobile ? 9 : 10, marginTop: 2 }}>
                  Battle energy {shipEnergy}{shipLevel < shipMaxLevel ? ` · Next ${nextShipEnergy}` : ' · MAX LEVEL'}
                </div>
                <div style={{ color: '#6b552f', fontSize: isMobile ? 9 : 10, marginTop: 2 }}>
                  Cannon {shipCannonDamage.toLocaleString()} dmg · {shipCannonCost} energy
                  {shipLevel < shipMaxLevel && (
                    <> · Next {nextShipCannonDamage.toLocaleString()} dmg / {nextShipCannonCost} energy</>
                  )}
                </div>
                {shipUnlockedAbilities.length > 0 && (
                  <div style={{ color: '#1c8b4d', fontSize: isMobile ? 9 : 10, marginTop: 2 }}>
                    {shipUnlockedAbilities.join(' · ')}
                  </div>
                )}
                {shipLevel < shipMaxLevel && (
                  <>
                    <div style={{ color: '#9b5d14', fontSize: isMobile ? 9 : 10, marginTop: 2 }}>
                      Next: {shipNextUnlocks.length > 0 ? shipNextUnlocks.join(', ') : '+2 battle energy'} · TH{shipNextTownHall}
                    </div>
                    <div style={{ color: '#8b6b3f', fontSize: isMobile ? 9 : 10, marginTop: 2 }}>
                      {Object.entries(shipUpgradeCost).map(([key, value]) => `${value} ${key}`).join(' · ')}
                    </div>
                  </>
                )}
              </div>
              {shipLevel < shipMaxLevel && <button type="button" disabled={!canAffordShipUpgrade} onClick={() => sendToGodot('upgrade_main_ship')} style={{ padding: isMobile ? '8px 12px' : '10px 16px', border: '2px solid #7d5d24', borderRadius: 7, background: canAffordShipUpgrade ? '#f3ba35' : '#c8baa0', color: '#4b2b16', fontWeight: 900, cursor: canAffordShipUpgrade ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>UPGRADE</button>}
            </div>
          )}

          {/* Loaded troops slots */}
          <div style={{...LT.loadedBar, padding: isMobile ? '11px 10px' : '12px 16px', flexWrap: 'wrap', gap: isMobile ? 7 : 8, ...(mobileLoadedBarStyle || {})}}>
            {loadedGroups.map((group) => {
              const t = group.entry;
              const base = group.base;
              const isSwapping = troopAction?.key === group.key;
              const nftCfg = nftBackedTroopConfig(base);
              const nftTokens = base === 'FireDragon' ? dragonNfts : demonKingNfts;
              const imgSrc = nftCfg?.image || UNIT_IMAGES[base];
              const nftTokenLabel = nftCfg
                ? demonKingDisplayLabel(demonKingDisplayIdFromEntry(t, nftTokens))
                : '';
              return (
                <div
                  key={group.key}
                  style={{ ...LT.loadedSlot, width: slotW, height: slotH, ...(isSwapping ? LT.loadedSlotActive : {}) }}
                  onClick={() => {
                    setSwapSlot(group.start);
                    setTroopAction({ key: group.key, base: group.base });
                  }}
                >
                  {renderTroopInfoButton({
                    name: t,
                    level: getTroopLvl(base),
                    tokenLabel: nftTokenLabel,
                    status: `${group.count} loaded`,
                  })}
                  <div style={{ ...LT.troopImgWrap, paddingBottom: 0 }}>
                    {imgSrc && (
                      <div key={`${t}-${group.count}-${group.slots}`} style={{ animation: 'swapFlash 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards', width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <img
                          src={imgSrc}
                          alt={base}
                          style={{
                            ...LT.loadedSlotImg,
                            transform: `scale(${CARD_TROOP_STYLE_MAP[base]?.scale || 1}) translateY(${CARD_TROOP_STYLE_MAP[base]?.offsetY || '0%'})`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {nftTokenLabel && (
                    <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), ...LT.demonIdBadgeWithInfo, fontSize: isMobile ? 11 : 9}}>
                      {nftTokenLabel}
                    </div>
                  )}
                  {group.count > 1 && (
                    <div style={{...LT.loadedCountBadge, fontSize: isMobile ? 11 : 12}}>
                      x{group.count}
                    </div>
                  )}
                  {isSwapping && <div style={LT.swapBadge}>SWAP</div>}
                </div>
              );
            })}
            <div
              key="free-slots"
              style={{
                ...LT.freeSlotSummary,
                width: Math.max(slotW, isMobile ? 74 : 86),
                height: slotH,
                ...(freeSlots <= 0 ? LT.freeSlotSummaryFull : null),
              }}
              onClick={() => {
                if (freeSlots > 0) {
                  setTroopAction(null);
                  setSwapSlot(shipTroops.length);
                }
              }}
            >
              <span style={{...LT.freeSlotNumber, fontSize: isMobile ? 20 : 24}}>{freeSlots}</span>
              <span style={{...LT.freeSlotText, fontSize: isMobile ? 9 : 10}}>
                {freeSlots > 0 ? 'FREE SLOTS' : 'FULL'}
              </span>
            </div>
          </div>

          {(troopAction || swapSlot !== null) && (
            <div style={{...LT.swapActionBar, ...(isMobile ? { gap: 6, padding: '7px 8px', flexWrap: 'wrap' } : {})}}>
              <div style={{...LT.swapHint, fontSize: isMobile ? 12 : 14}}>
                {selectedGroup
                  ? `${troopDisplayName(selectedGroup.base)}${selectedGroup.count > 1 ? ` x${selectedGroup.count}` : ''} selected`
                  : troopAction
                    ? `${troopDisplayName(troopAction.base)} is no longer loaded`
                    : selectedSpan ? `Slot ${selectedSpan.start + 1} selected` : `Select a troop below for slot ${swapSlot + 1}`}
              </div>
              {troopAction && (
                <button type="button" style={{...LT.removeTroopBtn, ...(selectedGroup && !troopActionPending ? null : LT.actionBtnDisabled)}} disabled={!selectedGroup || !!troopActionPending} onClick={handleRemoveTroop}>
                  {troopActionPending === 'one' ? 'REMOVING...' : 'REMOVE'}
                </button>
              )}
              {troopAction && (
                <button type="button" style={{...LT.removeAllTroopsBtn, ...(selectedGroup && !troopActionPending ? null : LT.actionBtnDisabled)}} disabled={!selectedGroup || !!troopActionPending} onClick={handleRemoveTroopGroup}>
                  {troopActionPending === 'all' ? 'REMOVING...' : 'REMOVE ALL'}
                </button>
              )}
              <button type="button" title="Close troop actions" aria-label="Close troop actions" style={LT.troopActionCloseBtn} onClick={closeTroopAction}>
                X
              </button>
            </div>
          )}

          {/* Troop selection grid */}
          <div style={{...LT.grid, padding: isMobile ? '8px 8px' : '14px 18px', gap: isMobile ? 8 : 10, flexDirection: 'column', flexWrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'center'}}>
            <div style={{...LT.troopPriceNote, fontSize: isMobile ? 9 : 11}}>
              Non-NFT troops cost 100 gold per occupied ship slot.
            </div>
            <div style={{...LT.normalTroopGrid, gap: isMobile ? 6 : 10}}>
            {allTroops.map(name => {
              const lvl = getTroopLvl(name);
              const unlock = troopUnlock(name);
              const occupiedSlots = troopSlotCost(name);
              return (
                <button
                  key={name}
                  aria-disabled={!unlock.unlocked}
                  title={!unlock.unlocked ? `Town Hall Lv ${unlock.required} required` : undefined}
                  style={{...LT.troopCard, width: cardW, flexShrink: isMobile ? 1 : 0, ...(!unlock.unlocked ? { opacity: 0.5, cursor: 'not-allowed' } : null)}}
                  onClick={() => {
                    if (!unlock.unlocked || !canPlaceTroop(name)) {
                      return;
                    } else {
                      handleLoadTroop(name);
                    }
                  }}
                >
                  {renderTroopInfoButton({
                    name,
                    level: lvl,
                    requiredTownHall: unlock.required,
                    unlocked: unlock.unlocked,
                  })}
                  <div style={{...LT.troopLvlBadge, fontSize: isMobile ? 12 : 16}}>Lvl {lvl}</div>
                  <div style={LT.troopImgWrap}>
                    {UNIT_IMAGES[name] && (
                      <img src={UNIT_IMAGES[name]} alt={name} style={{ ...LT.troopImg, transform: `scale(${CARD_TROOP_STYLE_MAP[name]?.scale || 1}) translateY(${CARD_TROOP_STYLE_MAP[name]?.offsetY || '0%'})` }} />
                    )}
                  </div>
                  <div style={{...LT.bottomOverlay, height: isMobile ? 24 : 28}}>
                    <span style={{...LT.costText, fontSize: isMobile ? 11 : 13}}>
                      {unlock.unlocked
                        ? `${occupiedSlots} ${occupiedSlots === 1 ? 'SLOT' : 'SLOTS'}`
                        : `TH${unlock.required}`}
                    </span>
                  </div>
                </button>
              );
            })}
            </div>
            <div style={{...LT.demonKingRow, gap: isMobile ? 6 : 10}}>
            {demonKingNftLoading && (
              <button type="button" style={{...LT.troopCard, ...LT.troopCardMuted, width: cardW, flexShrink: isMobile ? 1 : 0}}>
                {renderTroopInfoButton({ name: 'DemonKing', level: 1, status: 'Syncing NFT ownership' })}
                <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), ...LT.demonIdBadgeWithInfo, fontSize: isMobile ? 9 : 11}}>
                  SYNC
                </div>
                <div style={{...LT.troopLvlBadge, fontSize: isMobile ? 12 : 16}}>NFT</div>
                  <div style={LT.troopImgWrap}>
                  <img src={demonKingImg} alt="Demon King" style={{ ...LT.troopImg, ...LT.troopImgMuted, transform: `scale(${CARD_TROOP_STYLE_MAP.DemonKing.scale}) translateY(${CARD_TROOP_STYLE_MAP.DemonKing.offsetY})` }} />
                </div>
                <div style={{...LT.bottomOverlay, height: isMobile ? 26 : 30}}>
                  <span style={{...LT.costText, fontSize: isMobile ? 9 : 11}}>SYNCING</span>
                </div>
              </button>
            )}
            {!demonKingNftLoading && availableDemonNfts.map((token) => {
              const entry = demonKingShipEntry(token);
              const demonTokenLabel = demonKingDisplayLabel(token, demonKingNfts);
              const rarityStyle = nftRarityCardStyle(token.rarity, 1);
              const rarityBadgeStyle = nftRarityBadgeStyle(token.rarity, 1, { compact: true });
              const disabled = swapSlot === null
                ? shipTroops.length + troopSlotCost(entry) > capacity
                : (() => {
                    return !troopSwapPlacement(shipTroops, swapSlot, entry, capacity);
                  })();
              return (
                <button
                  key={entry}
                  type="button"
                  aria-disabled={disabled}
                  style={{...LT.troopCard, ...rarityStyle, width: cardW, flexShrink: isMobile ? 1 : 0, ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null)}}
                  onClick={() => {
                    if (!disabled) handleLoadTroop(entry);
                  }}
                >
                  {renderTroopInfoButton({
                    name: entry,
                    level: Number(token.level || 1),
                    tokenLabel: demonTokenLabel,
                    rarity: nftRarityLabel(token.rarity, 1),
                  })}
                  <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), ...LT.demonIdBadgeWithInfo, fontSize: isMobile ? 9 : 11}}>
                    {demonTokenLabel}
                  </div>
                  <div style={{...LT.demonUseBadge, fontSize: isMobile ? 9 : 10}}>
                    {demonKingUseRatio}
                  </div>
                  <div style={{...LT.troopLvlBadge, ...rarityBadgeStyle, fontSize: isMobile ? 12 : 16}}>{nftRarityLabel(token.rarity, 1)}</div>
                  <div style={LT.troopImgWrap}>
                    <img src={demonKingImg} alt="Demon King" style={{ ...LT.troopImg, transform: `scale(${CARD_TROOP_STYLE_MAP.DemonKing.scale}) translateY(${CARD_TROOP_STYLE_MAP.DemonKing.offsetY})` }} />
                  </div>
                  <div style={{...LT.bottomOverlay, height: isMobile ? 26 : 30}}>
                    <span style={{...LT.costText, fontSize: isMobile ? 10 : 12}}>
                      {troopSlotCost(entry)} SLOTS
                    </span>
                  </div>
                </button>
              );
            })}
            {!demonKingNftLoading && availableDemonNfts.length === 0 && (
              <button
                type="button"
                style={{...LT.troopCard, ...LT.troopCardMuted, width: cardW, flexShrink: isMobile ? 1 : 0}}
                onClick={openNftShop}
              >
                {renderTroopInfoButton({
                  name: 'DemonKing',
                  level: 1,
                  status: hasDemonKingWallet
                    ? (demonKingNftError || (demonKingNfts.length ? 'All owned NFTs are loaded' : 'NFT required'))
                    : 'Connect a supported wallet',
                })}
                <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), ...LT.demonIdBadgeWithInfo, fontSize: isMobile ? 9 : 11}}>
                  {demonKingUseRatio}
                </div>
                <div style={{...LT.troopLvlBadge, fontSize: isMobile ? 12 : 16}}>NFT</div>
                <div style={LT.troopImgWrap}>
                  <img src={demonKingImg} alt="Demon King" style={{ ...LT.troopImg, ...LT.troopImgMuted, transform: `scale(${CARD_TROOP_STYLE_MAP.DemonKing.scale}) translateY(${CARD_TROOP_STYLE_MAP.DemonKing.offsetY})` }} />
                </div>
                <div style={{...LT.bottomOverlay, height: isMobile ? 26 : 30}}>
                  <span style={{...LT.costText, fontSize: isMobile ? 9 : 11}}>
                    {hasDemonKingWallet ? (demonKingNftError || (demonKingNfts.length ? 'ALL USED' : 'NEED NFT')) : 'CONNECT'}
                  </span>
                </div>
              </button>
            )}
            {renderNftTroopCards({
              base: 'FireDragon',
              tokens: dragonNfts,
              availableTokens: availableDragonNfts,
              loading: dragonNftLoading,
              error: dragonNftError,
              useRatio: dragonUseRatio,
            })}
            </div>
          </div>
          {troopInfo && troopInfoCopy && (
            <div style={LT.troopInfoBackdrop} onClick={() => setTroopInfo(null)}>
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="troop-info-title"
                style={{...LT.troopInfoDialog, ...(isMobile ? LT.troopInfoDialogMobile : null)}}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  aria-label="Close unit details"
                  title="Close"
                  style={LT.troopInfoCloseButton}
                  onClick={() => setTroopInfo(null)}
                >
                  X
                </button>
                <div style={LT.troopInfoHeader}>
                  <div style={LT.troopInfoPortrait}>
                    {troopInfoImage && (
                      <img
                        src={troopInfoImage}
                        alt=""
                        style={{
                          ...LT.troopInfoPortraitImage,
                          transform: `scale(${CARD_TROOP_STYLE_MAP[troopInfoBase]?.scale || 1}) translateY(${CARD_TROOP_STYLE_MAP[troopInfoBase]?.offsetY || '0%'})`,
                        }}
                      />
                    )}
                  </div>
                  <div style={LT.troopInfoHeading}>
                    <h3 id="troop-info-title" style={LT.troopInfoTitle}>{troopDisplayName(troopInfoBase)}</h3>
                    <div style={LT.troopInfoRole}>{troopInfoCopy.role}</div>
                    {(troopInfo.tokenLabel || troopInfo.rarity) && (
                      <div style={LT.troopInfoToken}>
                        {[troopInfo.tokenLabel, troopInfo.rarity].filter(Boolean).join(' - ')}
                      </div>
                    )}
                  </div>
                </div>
                <p style={LT.troopInfoDescription}>{troopInfoCopy.description}</p>
                <div style={LT.troopInfoStats}>
                  <div style={LT.troopInfoStat}>
                    <span style={LT.troopInfoStatLabel}>LEVEL</span>
                    <strong style={LT.troopInfoStatValue}>{Math.max(1, Number(troopInfo.level || 1))}</strong>
                  </div>
                  <div style={LT.troopInfoStat}>
                    <span style={LT.troopInfoStatLabel}>SHIP SPACE</span>
                    <strong style={LT.troopInfoStatValue}>{troopInfoSlots}</strong>
                  </div>
                  <div style={LT.troopInfoStat}>
                    <span style={LT.troopInfoStatLabel}>RECRUITMENT</span>
                    <strong style={LT.troopInfoStatValue}>
                      {troopInfoNft ? 'Owned NFT' : `${troopInfoSlots * 100} gold`}
                    </strong>
                  </div>
                  <div style={LT.troopInfoStat}>
                    <span style={LT.troopInfoStatLabel}>UNLOCK</span>
                    <strong style={LT.troopInfoStatValue}>
                      {troopInfoNft
                        ? 'NFT'
                        : `Town Hall ${Math.max(1, Number(troopInfo.requiredTownHall || troopUnlock(troopInfoBase).required))}`}
                    </strong>
                  </div>
                </div>
                {troopInfo.status && <div style={LT.troopInfoStatus}>{troopInfo.status}</div>}
              </section>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes altarFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-5px) scale(1.018); }
        }
        @keyframes altarGlowPulse {
          0%, 100% { opacity: 0.42; transform: translate(-50%, -50%) scale(0.92); }
          50% { opacity: 0.78; transform: translate(-50%, -50%) scale(1.06); }
        }
        @keyframes altarRingPulse {
          0%, 100% { opacity: 0.22; transform: translate(-50%, -50%) scale(0.92) rotate(0deg); }
          50% { opacity: 0.62; transform: translate(-50%, -50%) scale(1.04) rotate(12deg); }
        }
        @keyframes altarRingSpin {
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes altarStreakFlash {
          0%, 82%, 100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--r)) scaleX(0.45); }
          86% { opacity: 0.9; transform: translate(-50%, -50%) rotate(var(--r)) scaleX(1.18); }
          91% { opacity: 0.25; transform: translate(-50%, -50%) rotate(var(--r)) scaleX(0.72); }
        }
        .altar-magic-wrap {
          overflow: visible;
          animation: altarFloat 2.7s ease-in-out infinite;
        }
        .altar-magic-img {
          animation: altarFloat 3.1s ease-in-out infinite reverse;
        }
        .altar-magic-core {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 72%;
          height: 72%;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(36,214,255,0.42), rgba(36,214,255,0.12) 42%, rgba(36,214,255,0) 72%);
          filter: blur(2px);
          animation: altarGlowPulse 1.65s ease-in-out infinite;
          z-index: 1;
          pointer-events: none;
        }
        .altar-magic-ring {
          position: absolute;
          left: 50%;
          top: 58%;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          border: 3px dashed rgba(34, 205, 255, 0.58);
          box-shadow: 0 0 14px rgba(34, 205, 255, 0.45), inset 0 0 10px rgba(34, 205, 255, 0.25);
          z-index: 2;
          pointer-events: none;
        }
        .altar-magic-ring-outer {
          width: 82%;
          height: 38%;
          animation: altarRingSpin 8.5s linear infinite, altarRingPulse 2.1s ease-in-out infinite;
        }
        .altar-magic-ring-inner {
          width: 56%;
          height: 25%;
          border-width: 2px;
          opacity: 0.45;
          animation: altarRingSpin 5.2s linear infinite reverse, altarRingPulse 1.7s ease-in-out infinite;
        }
        .altar-magic-streak {
          position: absolute;
          left: 50%;
          top: 45%;
          width: 34%;
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(43,216,255,0), rgba(43,216,255,0.92), rgba(255,255,255,0.95), rgba(43,216,255,0));
          box-shadow: 0 0 12px rgba(43,216,255,0.9);
          transform-origin: center;
          opacity: 0;
          z-index: 6;
          pointer-events: none;
          animation: altarStreakFlash 2.35s ease-in-out infinite;
        }
        .altar-magic-streak-0 { --r: 8deg; top: 30%; left: 61%; animation-delay: 0s; }
        .altar-magic-streak-1 { --r: 62deg; top: 42%; left: 71%; animation-delay: 0.28s; }
        .altar-magic-streak-2 { --r: 118deg; top: 58%; left: 66%; animation-delay: 0.56s; }
        .altar-magic-streak-3 { --r: 188deg; top: 63%; left: 42%; animation-delay: 0.84s; }
        .altar-magic-streak-4 { --r: 238deg; top: 45%; left: 30%; animation-delay: 1.12s; }
        .altar-magic-streak-5 { --r: 305deg; top: 28%; left: 40%; animation-delay: 1.4s; }
      `}</style>
      {view === 'ACTIONS' && renderActions()}
      {view === 'INFO' && renderInfo()}
      {view === 'FLAG' && renderTownHallFlag()}
      {view === 'UPGRADE' && renderUpgrade()}
      {view === 'ALTAR_SKILLS' && renderAltarSkills()}
      {view === 'BUY_SHIP' && renderBuyShip()}
      {view === 'LOAD_TROOPS' && renderLoadTroops()}
    </>
  );
}

export default memo(BuildingInfoPanel);

const styles = {
  // ACTIONS VIEW
  actionLabel: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  actionName: {
    fontSize: 18,
    fontWeight: 900,
    color: '#fff',
    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.8)',
    whiteSpace: 'nowrap',
  },
  actionLevel: {
    fontSize: 14,
    fontWeight: 800,
    color: '#FFD700',
    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
    whiteSpace: 'nowrap',
  },
  actionsWrap: {
    position: 'fixed',
    bottom: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 32,
    zIndex: 10,
    pointerEvents: 'none',
  },
  circleBtn: {
    width: 68,
    height: 68,
    borderRadius: '50%',
    border: '4px solid #fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    pointerEvents: 'all',
    boxShadow: '0 6px 0 rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.5)',
    color: '#fff',
    outline: 'none',
    transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  btnInfo: {
    background: 'linear-gradient(180deg, #4aa6ef, #1e70b9)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
  },
  btnUpgrade: {
    background: 'linear-gradient(180deg, #7ad23f, #479a1f)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
  },
  btnTroops: {
    background: 'linear-gradient(180deg, #ffca28, #f57f17)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
  },
  btnAltar: {
    background: 'linear-gradient(180deg, #68d132, #3fa51f)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
    boxShadow: '0 6px 0 rgba(12, 71, 33, 0.55), 0 10px 18px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.38)',
  },
  btnFlag: {
    background: 'linear-gradient(180deg, #ff9148, #d44a18)',
    textShadow: '0 2px 2px rgba(0,0,0,0.4)',
    boxShadow: '0 6px 0 rgba(99, 39, 15, 0.55), 0 10px 18px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.38)',
  },
  iconLarge: {
    fontSize: 48,
    fontWeight: 'bold',
    fontStyle: 'italic',
    lineHeight: 1,
  },

  // MODAL / SHARED STYLE
  contentLayout: {
    display: 'flex',
    width: '100%',
    padding: '0 20px',
    justifyContent: 'center',
    alignItems: 'stretch',
    flex: 1,
    flexWrap: 'wrap',
    overflowY: 'auto',
  },
  leftColumn: {
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    position: 'relative',
    zIndex: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: '#377d9f',
    marginBottom: 8,
  },
  statsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  statBox: {
    background: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 16,
    padding: '12px 16px',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
  },
  descriptionBox: {
    background: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 16,
    padding: '12px 16px',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
  },
  descriptionText: {
    color: '#1a3c4f',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.35,
  },
  statBoxLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: '#7692a1',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  statBoxValues: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  statCurrent: {
    fontSize: 24,
    fontWeight: 800,
    color: '#1a3c4f',
  },
  statArrow: {
    fontSize: 16,
    color: '#1a3c4f',
    opacity: 0.7,
  },
  statUpgraded: {
    fontSize: 24,
    fontWeight: 900,
    color: '#479a1f',
  },
  altarTabs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
    marginBottom: 12,
  },
  altarTab: {
    border: '1px solid rgba(55, 125, 159, 0.28)',
    borderRadius: 14,
    background: 'rgba(0,0,0,0.05)',
    color: '#1a3c4f',
    padding: '9px 10px',
    fontWeight: 900,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  altarTabActive: {
    background: 'linear-gradient(180deg, #4aa6d3, #277ba5)',
    color: '#fff',
    boxShadow: '0 8px 18px rgba(39,123,165,0.24)',
  },
  altarSkillPanel: {
    minWidth: 330,
  },
  altarTreePanel: {
    width: 1000,
    maxWidth: '94vw',
    minHeight: 640,
    overflow: 'hidden',
  },
  altarTreePanelMobile: {
    width: '100vw',
    maxWidth: '100vw',
    height: '100%',
    maxHeight: 'none',
    borderRadius: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  altarTreeTabs: {
    padding: '16px 22px 0',
    marginBottom: 0,
  },
  altarTreeTabsMobile: {
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 5,
    padding: '8px 8px 0',
  },
  altarTabMobile: {
    borderRadius: 8,
    padding: '7px 3px',
    minHeight: 44,
    fontSize: 11,
    lineHeight: 1.05,
    gap: 2,
  },
  altarTreeBody: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 310px',
    gap: 18,
    padding: '16px 22px 24px',
  },
  altarTreeBodyMobile: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: 10,
    minHeight: 0,
    overflowY: 'auto',
    padding: '8px 10px 14px',
  },
  altarTreeCanvas: {
    minHeight: 500,
    borderRadius: 8,
    background: 'transparent',
    position: 'relative',
    padding: '22px 22px 18px',
    overflow: 'hidden',
  },
  altarTreeCanvasMobile: {
    minHeight: 'auto',
    padding: '6px 0 0',
    overflow: 'visible',
  },
  altarTreeBranchTitle: {
    color: '#1a3c4f',
    fontSize: 26,
    fontWeight: 900,
    textShadow: '0 2px 0 rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  altarTreeBranchTitleMobile: {
    fontSize: 18,
    lineHeight: 1.08,
  },
  altarTreeBranchSub: {
    color: '#377d9f',
    fontSize: 14,
    fontWeight: 900,
    textAlign: 'center',
    marginTop: 4,
  },
  altarTreeBranchSubMobile: {
    fontSize: 12,
    marginTop: 2,
  },
  altarTreePath: {
    margin: '20px auto 0',
    width: 'min(100%, 620px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  altarTreePathMobile: {
    margin: '10px auto 0',
    width: '100%',
    gap: 8,
  },
  altarTreeRow: {
    display: 'grid',
    gridTemplateColumns: '120px minmax(0, 1fr)',
    alignItems: 'center',
    minHeight: 116,
  },
  altarTreeRowMobile: {
    gridTemplateColumns: '70px minmax(0, 1fr)',
    minHeight: 74,
  },
  altarTreeNodeWrap: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: 116,
  },
  altarTreeNodeWrapMobile: {
    height: 74,
  },
  altarTreeLine: {
    position: 'absolute',
    left: '50%',
    top: 78,
    width: 5,
    height: 76,
    transform: 'translateX(-50%)',
    background: 'linear-gradient(180deg, #67d7ff, #2d8bc9)',
    boxShadow: '0 0 10px rgba(103, 215, 255, 0.55)',
  },
  altarTreeLineMobile: {
    top: 54,
    width: 3,
    height: 38,
    boxShadow: '0 0 6px rgba(103, 215, 255, 0.45)',
  },
  altarTreeNode: {
    width: 88,
    height: 88,
    borderRadius: 18,
    borderWidth: 4,
    borderStyle: 'solid',
    borderColor: '#84dfff',
    background: 'linear-gradient(180deg, #1cc9ff, #1182d5)',
    boxShadow: '0 8px 0 rgba(2, 30, 54, 0.55), 0 10px 20px rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.45)',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  altarTreeNodeMobile: {
    width: 58,
    height: 58,
    borderRadius: 12,
    borderWidth: 3,
    boxShadow: '0 5px 0 rgba(2, 30, 54, 0.48), 0 7px 12px rgba(0,0,0,0.26), inset 0 2px 0 rgba(255,255,255,0.42)',
  },
  altarTreeNodeUnlocked: {
    borderColor: '#dfffe4',
    background: 'linear-gradient(180deg, #6edc3a, #36a825)',
  },
  altarTreeNodeNext: {
    borderColor: '#ffe391',
    boxShadow: '0 8px 0 rgba(2, 30, 54, 0.55), 0 10px 20px rgba(0,0,0,0.35), 0 0 18px rgba(255, 213, 80, 0.75), inset 0 2px 0 rgba(255,255,255,0.45)',
  },
  altarTreeNodeLevel: {
    fontSize: 22,
    fontWeight: 900,
    textShadow: '0 2px 0 rgba(0,0,0,0.35)',
  },
  altarTreeNodeLevelMobile: {
    fontSize: 15,
  },
  altarTreeNodeValue: {
    fontSize: 16,
    fontWeight: 900,
    opacity: 0.95,
  },
  altarTreeNodeValueMobile: {
    fontSize: 12,
  },
  altarTreeNodeInfo: {
    borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'rgba(0,0,0,0.05)',
    padding: '12px 14px',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.55)',
  },
  altarTreeNodeInfoMobile: {
    padding: '7px 8px',
  },
  altarTreeNodeInfoUnlocked: {
    background: 'rgba(203, 245, 224, 0.48)',
  },
  altarTreeNodeName: {
    color: '#1a3c4f',
    fontSize: 17,
    fontWeight: 900,
    textShadow: '0 1px 0 rgba(255,255,255,0.65)',
  },
  altarTreeNodeNameMobile: {
    fontSize: 13,
  },
  altarTreeNodeBonus: {
    color: '#377d9f',
    fontSize: 13,
    fontWeight: 900,
    marginTop: 2,
  },
  altarTreeNodeBonusMobile: {
    fontSize: 11,
    lineHeight: 1.15,
  },
  altarTreeCostList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  altarTreeCostListMobile: {
    gap: 4,
    marginTop: 5,
  },
  altarTreeCostPill: {
    minWidth: 78,
    height: 30,
    borderRadius: 8,
    background: 'rgba(0,0,0,0.06)',
    border: '1px solid rgba(0,0,0,0.12)',
    color: '#1a3c4f',
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    fontSize: 13,
  },
  altarTreeCostPillMobile: {
    minWidth: 0,
    height: 23,
    padding: '0 5px',
    borderRadius: 6,
    gap: 3,
    fontSize: 10,
  },
  altarTreeCostIcon: {
    width: 22,
    height: 20,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.28))',
  },
  altarTreeCostIconMobile: {
    width: 15,
    height: 14,
  },
  altarTreeSide: {
    borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.13)',
    background: 'rgba(0,0,0,0.05)',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.55)',
    padding: 14,
    alignSelf: 'stretch',
  },
  altarTreeSideMobile: {
    padding: 10,
    flexShrink: 0,
  },
  altarTreeSideTitle: {
    color: '#1a3c4f',
    fontSize: 21,
    fontWeight: 900,
    marginBottom: 5,
  },
  altarTreeSideTitleMobile: {
    fontSize: 16,
    marginBottom: 3,
  },
  altarTreeSideText: {
    color: '#377d9f',
    fontSize: 14,
    fontWeight: 900,
    lineHeight: 1.35,
    marginBottom: 12,
  },
  altarTreeSideTextMobile: {
    fontSize: 12,
    marginBottom: 8,
  },
  altarTreeDone: {
    borderRadius: 8,
    padding: 18,
    textAlign: 'center',
    color: '#1a3c4f',
    fontSize: 22,
    fontWeight: 900,
    background: 'rgba(203, 245, 224, 0.48)',
    border: '2px solid #2f9e6f',
  },
  altarBranchInfo: {
    background: 'rgba(0,0,0,0.05)',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 16,
    padding: '12px 14px',
    marginBottom: 12,
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
  },
  altarBranchTitle: {
    color: '#1a3c4f',
    fontSize: 17,
    fontWeight: 900,
    marginBottom: 4,
  },
  altarHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 14,
  },
  altarSubtext: {
    color: '#1a3c4f',
    fontSize: 14,
    fontWeight: 800,
  },
  altarResourceHint: {
    color: '#5f7280',
    fontSize: 12,
    fontWeight: 900,
    textAlign: 'right',
    lineHeight: 1.4,
  },
  altarLevelGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(104px, 1fr))',
    gap: 10,
  },
  altarLevelCard: {
    minHeight: 196,
    borderRadius: 18,
    padding: 10,
    background: 'rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.12)',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.55)',
  },
  altarLevelCardActive: {
    border: '2px solid #2f9e6f',
    background: 'rgba(203, 245, 224, 0.48)',
  },
  altarLevelTitle: {
    color: '#1a3c4f',
    fontSize: 16,
    fontWeight: 900,
    marginBottom: 10,
  },
  altarBonus: {
    color: '#377d9f',
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1.3,
    minHeight: 34,
  },
  altarReqGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  altarReqGridMobile: {
    gap: 6,
    marginTop: 6,
  },
  altarReqBox: {
    width: 78,
    height: 70,
    borderRadius: 16,
    background: 'rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.11)',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.55)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  altarReqBoxMobile: {
    width: 68,
    height: 52,
    borderRadius: 10,
  },
  altarReqIcon: {
    width: 34,
    height: 30,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.28))',
  },
  altarReqIconMobile: {
    width: 25,
    height: 22,
  },
  altarReqAmt: {
    color: '#1a3c4f',
    fontSize: 18,
    fontWeight: 900,
  },
  altarReqAmtMobile: {
    fontSize: 13,
  },
  altarError: {
    marginTop: 12,
    color: '#b42318',
    fontWeight: 900,
    textAlign: 'center',
  },

  centerColumn: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  characterWrapper: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  characterSphere: {
    width: 200,
    height: 200,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 30% 30%, #d4caa8 0%, #b8af8c 100%)',
    borderRadius: '50%',
    boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.3)',
    border: '2px solid rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  characterImg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    zIndex: 5,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.4))',
  },
  altarStaticImg: {
    width: '88%',
    height: '88%',
    objectFit: 'contain',
  },
  upgradeBadge: {
    position: 'absolute',
    top: 0,
    right: 20,
    background: 'linear-gradient(135deg, #FBC02D 0%, #F57F17 100%)',
    borderRadius: 24,
    padding: '4px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 8px 24px rgba(245, 127, 23, 0.4), inset 0 2px 0 rgba(255,255,255,0.3)',
    zIndex: 10,
  },
  badgeBigPart: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 2,
  },
  badgeLvlText: {
    fontSize: 14,
    fontWeight: 800,
    color: '#fff',
  },
  badgeLvlNumber: {
    fontSize: 32,
    fontWeight: 900,
    color: '#cbd5e1',
  },

  rightColumn: {
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 20,
    position: 'relative',
    zIndex: 10,
  },
  reqGrid: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  reqBox: {
    background: 'rgba(0, 0, 0, 0.05)',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
    borderRadius: 20,
    width: 90,
    height: 90,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    transition: 'transform 0.2s, background 0.2s',
  },
  reqBoxMax: {
    gridColumn: '1 / -1',
    display: 'flex',
    justifyContent: 'center',
  },
  reqIconImg: {
    width: 44,
    height: 44,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
    marginBottom: 4,
  },
  reqAmt: {
    fontSize: 16,
    fontWeight: 900,
    color: '#1a3c4f',
  },
  trophyUpgradeNotice: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 12px',
    boxSizing: 'border-box',
    borderRadius: 8,
    border: '2px solid #c89b2b',
    background: 'linear-gradient(180deg, #fff6c9 0%, #f5dfa0 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 4px rgba(89,57,18,0.16)',
  },
  trophyUpgradeIcon: {
    width: 34,
    height: 34,
    flex: '0 0 34px',
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 1px rgba(84,55,15,0.28))',
  },
  trophyUpgradeCopy: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: 2,
  },
  trophyUpgradeTitle: {
    color: '#6d431b',
    fontSize: 13,
    lineHeight: 1.15,
  },
  trophyUpgradeText: {
    color: '#785b31',
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.3,
  },
  flagLibraryHeader: {
    color: '#6d4a2e',
    fontSize: 13,
    fontWeight: 1000,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  flagLibraryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
  },
  flagLibraryGridMobile: {
    gap: 9,
  },
  flagLibraryCard: {
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: '#b89455',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.3)',
    boxShadow: '0 4px 0 rgba(90,54,22,0.18), inset 0 2px 0 rgba(255,255,255,0.52)',
    padding: 10,
    minHeight: 150,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
    color: '#6d4a2e',
    fontFamily: 'inherit',
  },
  flagLibraryCardActive: {
    borderColor: '#2f9dcc',
    background: 'rgba(76, 169, 210, 0.13)',
    boxShadow: '0 4px 0 rgba(30, 90, 125, 0.2), 0 0 0 2px rgba(47,157,204,0.16)',
  },
  flagLibraryImageWrap: {
    width: 84,
    height: 84,
    borderRadius: 9,
    overflow: 'hidden',
    background: '#fff4d8',
    border: '2px solid rgba(109,74,46,0.24)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagLibraryImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  flagLibraryEmpty: {
    fontSize: 36,
    fontWeight: 1000,
    color: '#b89455',
    lineHeight: 1,
  },
  flagDefaultThumb: {
    width: 84,
    height: 84,
    borderRadius: 9,
    background: 'linear-gradient(135deg, #ff6d22 0%, #f24d13 100%)',
    border: '2px solid rgba(109,74,46,0.24)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.25)',
  },
  flagDefaultMark: {
    color: '#111',
    fontSize: 46,
    fontWeight: 1000,
    lineHeight: 1,
    fontFamily: 'Georgia, serif',
    transform: 'scaleX(1.35)',
  },
  flagLibraryTitle: {
    fontSize: 14,
    fontWeight: 1000,
    lineHeight: 1.05,
    textAlign: 'center',
  },
  flagLibrarySub: {
    fontSize: 11,
    fontWeight: 800,
    color: '#8a6a45',
    textAlign: 'center',
    lineHeight: 1.15,
  },
  flagPreviewWrap: {
    width: 148,
    height: 148,
    alignSelf: 'center',
    borderRadius: 12,
    border: '4px solid #b89455',
    background: '#fff4d8',
    boxShadow: '0 6px 0 rgba(90,54,22,0.22), inset 0 2px 0 rgba(255,255,255,0.65)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagPreviewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  flagPreviewEmpty: {
    color: '#7b5b34',
    fontWeight: 900,
    fontSize: 22,
  },
  flagCopy: {
    color: '#6d4a2e',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.35,
    textAlign: 'center',
  },
  flagFileLabel: {
    minHeight: 46,
    borderRadius: 10,
    border: '2px dashed #b89455',
    background: 'rgba(255,255,255,0.34)',
    color: '#6d4a2e',
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 14px',
    cursor: 'pointer',
    textAlign: 'center',
    wordBreak: 'break-word',
  },
  flagFileInput: {
    display: 'none',
  },
  flagStatus: {
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 900,
    textAlign: 'center',
  },
  flagStatusOk: {
    color: '#116234',
    background: 'rgba(67, 190, 108, 0.18)',
    border: '1px solid rgba(22, 121, 61, 0.28)',
  },
  flagStatusError: {
    color: '#8c241a',
    background: 'rgba(255, 91, 65, 0.12)',
    border: '1px solid rgba(150, 45, 32, 0.24)',
  },
  actionBtn: {
    background: 'linear-gradient(180deg, #FBC02D 0%, #F57F17 100%)',
    border: 'none',
    boxShadow: '0 8px 20px rgba(245, 127, 23, 0.3), inset 0 2px 0 rgba(255,255,255,0.4)',
    borderRadius: 20,
    padding: '14px 20px',
    color: '#fff',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textShadow: '0 2px 2px rgba(0,0,0,0.3)',
    transition: 'transform 0.1s',
  },
};

// Load troops modal styles
const LT = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 30, pointerEvents: 'all',
  },
  panel: {
    width: 680, maxWidth: '98vw', maxHeight: '90vh',
    background: '#ebdaba',
    border: '4px solid #377d9f',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 0 0 4px #ebdaba',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', position: 'relative', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    height: 54, background: '#4ca5d2',
    borderBottom: '4px solid #377d9f',
  },
  headerTitle: { 
    fontSize: 24, fontStyle: 'italic', fontWeight: 900, color: '#fff', 
    textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.6)' 
  },
  closeBtn: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    width: 32, height: 32, background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: 4,
    color: '#1a3c4f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    fontSize: 20, fontWeight: 'bold'
  },
  loadedBar: {
    display: 'flex', gap: 6, padding: '12px 14px',
    justifyContent: 'center', background: 'rgba(0,0,0,0.06)', borderBottom: '2px solid rgba(0,0,0,0.06)',
  },
  loadedSlot: {
    width: 70, height: 90, borderRadius: 8,
    background: 'linear-gradient(180deg, #d4d2c8 0%, #a5a398 100%)', border: '1px solid #727068',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden', cursor: 'pointer',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.2)',
    transition: 'filter 0.1s',
  },
  loadedSlotImg: { 
    width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transformOrigin: 'top center',
  },
  loadedSlotActive: { border: '2px solid #E53935', filter: 'brightness(1.15)', transform: 'scale(1.05)', zIndex: 10 },
  loadedCountBadge: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    minWidth: 24,
    padding: '3px 6px',
    borderRadius: 999,
    background: 'linear-gradient(180deg, #ffd95a 0%, #f39b15 100%)',
    border: '1px solid rgba(101, 58, 13, 0.45)',
    color: '#4a2f1c',
    fontWeight: 900,
    lineHeight: 1,
    textAlign: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.35)',
    zIndex: 18,
  },
  loadedSlotUseBadge: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    padding: '3px 5px',
    borderRadius: 5,
    background: 'rgba(32, 20, 12, 0.72)',
    color: '#fff4c7',
    border: '1px solid rgba(255, 229, 145, 0.45)',
    fontWeight: 900,
    lineHeight: 1,
    textTransform: 'uppercase',
    textShadow: '0 1px 2px rgba(0,0,0,0.9)',
    zIndex: 18,
  },
  emptySlot: {
    width: 70, height: 90, background: 'rgba(0,0,0,0.05)', border: '2px dashed #928d81', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#928d81', fontSize: 24, fontWeight: 900, cursor: 'pointer',
    transition: 'filter 0.1s',
  },
  freeSlotSummary: {
    width: 86,
    height: 90,
    borderRadius: 8,
    background: 'rgba(0,0,0,0.05)',
    border: '2px dashed #928d81',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#786f60',
    fontWeight: 900,
    cursor: 'pointer',
    textAlign: 'center',
    gap: 4,
    transition: 'filter 0.1s',
  },
  freeSlotSummaryFull: {
    opacity: 0.58,
    cursor: 'default',
  },
  freeSlotNumber: {
    color: '#5f4b35',
    fontWeight: 900,
    lineHeight: 1,
  },
  freeSlotText: {
    maxWidth: '100%',
    padding: '0 4px',
    color: '#928d81',
    fontWeight: 900,
    lineHeight: 1.05,
    textTransform: 'uppercase',
  },
  grid: {
    display: 'flex', flexWrap: 'wrap', gap: 10,
    padding: '16px 20px', justifyContent: 'center',
    overflowY: 'auto', flex: 1, minHeight: 0,
  },
  normalTroopGrid: {
    width: '100%',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  demonKingRow: {
    width: '100%',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    minHeight: 108,
  },
  nftSectionHeader: {
    width: '100%',
    margin: '4px 4px 0',
    padding: '7px 10px',
    borderRadius: 8,
    background: 'rgba(55, 125, 159, 0.14)',
    border: '1px solid rgba(55, 125, 159, 0.28)',
    color: '#5b3a24',
    fontWeight: 900,
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  troopCard: {
    width: 108, flexShrink: 0, aspectRatio: '3/4', borderRadius: 8,
    background: 'linear-gradient(180deg, #d4d2c8 0%, #a5a398 100%)', border: '1px solid #727068',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', position: 'relative', overflow: 'hidden',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.15)',
    transition: 'filter 0.1s', padding: 0,
  },
  troopCardMuted: {
    opacity: 0.72,
    cursor: 'pointer',
    background: 'linear-gradient(180deg, #d0cec3 0%, #8f8c80 100%)',
  },
  troopLvlBadge: {
    position: 'absolute', top: 6, right: 8, zIndex: 10,
    fontSize: 16, fontStyle: 'italic', fontWeight: 900, color: '#fff', 
    textShadow: '0 2px 3px rgba(0,0,0,0.9), 0 -1px 2px rgba(0,0,0,1), 1px 0 2px rgba(0,0,0,1), -1px 0 2px rgba(0,0,0,1)',
  },
  troopInfoButton: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 24,
    width: 23,
    height: 23,
    borderRadius: '50%',
    border: '2px solid rgba(72, 49, 28, 0.75)',
    background: 'rgba(255, 248, 225, 0.94)',
    color: '#5d4027',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Georgia, serif',
    fontSize: 15,
    fontStyle: 'italic',
    fontWeight: 900,
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.32)',
  },
  troopInfoButtonMobile: {
    top: 4,
    left: 4,
    width: 21,
    height: 21,
    fontSize: 13,
  },
  demonIdBadge: {
    position: 'absolute', top: 6, left: 6, zIndex: 12,
    maxWidth: '58%', padding: '3px 5px', borderRadius: 5,
    background: 'rgba(32, 20, 12, 0.78)', color: '#fff4c7',
    border: '1px solid rgba(255, 229, 145, 0.65)',
    fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
    textShadow: '0 1px 2px rgba(0,0,0,0.9)',
  },
  demonIdBadgeWithInfo: {
    left: 34,
    maxWidth: '42%',
  },
  demonIdBadgeMobile: {
    top: 4,
    left: 4,
    maxWidth: '72%',
    padding: '3px 5px',
    borderRadius: 6,
  },
  demonUseBadge: {
    position: 'absolute',
    top: 26,
    left: 6,
    zIndex: 12,
    padding: '3px 5px',
    borderRadius: 5,
    background: 'rgba(255, 214, 77, 0.92)',
    color: '#4a2f1c',
    border: '1px solid rgba(92, 56, 22, 0.35)',
    fontWeight: 900,
    lineHeight: 1,
    textShadow: 'none',
  },
  troopImgWrap: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 16,
  },
  troopImg: {
    width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transformOrigin: 'top center',
  },
  troopImgMuted: {
    filter: 'grayscale(1) saturate(0.45) brightness(0.82) drop-shadow(0 4px 6px rgba(0,0,0,0.45))',
  },
  bottomOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 34, background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.8) 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
    padding: '0 4px',
  },
  costText: { fontSize: 13, fontWeight: 900, color: '#FFD700', textShadow: '0 1px 2px rgba(0,0,0,0.8)' },
  troopInfoBackdrop: {
    position: 'absolute',
    inset: 0,
    zIndex: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    background: 'rgba(22, 17, 12, 0.64)',
  },
  troopInfoDialog: {
    position: 'relative',
    width: 430,
    maxWidth: '100%',
    maxHeight: '100%',
    overflowY: 'auto',
    padding: 18,
    border: '3px solid #377d9f',
    borderRadius: 8,
    background: '#fff7e4',
    color: '#5c3a21',
    boxShadow: '0 14px 34px rgba(0,0,0,0.48)',
  },
  troopInfoDialogMobile: {
    width: '100%',
    padding: 14,
  },
  troopInfoCloseButton: {
    position: 'absolute',
    top: 9,
    right: 9,
    zIndex: 3,
    width: 30,
    height: 30,
    border: '2px solid #8f6b43',
    borderRadius: '50%',
    background: '#f7ead0',
    color: '#5c3a21',
    fontSize: 14,
    fontWeight: 900,
    lineHeight: 1,
    cursor: 'pointer',
  },
  troopInfoHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    paddingRight: 34,
  },
  troopInfoPortrait: {
    position: 'relative',
    flex: '0 0 86px',
    width: 86,
    height: 94,
    overflow: 'hidden',
    border: '2px solid #9b815d',
    borderRadius: 7,
    background: 'linear-gradient(180deg, #d9d6cb 0%, #aaa79c 100%)',
  },
  troopInfoPortraitImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'top center',
    transformOrigin: 'top center',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.35))',
  },
  troopInfoHeading: {
    minWidth: 0,
  },
  troopInfoTitle: {
    margin: 0,
    color: '#4e2f1b',
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  troopInfoRole: {
    marginTop: 5,
    color: '#287da5',
    fontSize: 13,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  troopInfoToken: {
    marginTop: 6,
    color: '#7b5b34',
    fontSize: 12,
    fontWeight: 800,
    overflowWrap: 'anywhere',
  },
  troopInfoDescription: {
    margin: '14px 0 12px',
    color: '#64482f',
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.4,
  },
  troopInfoStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  troopInfoStat: {
    minWidth: 0,
    padding: '9px 10px',
    border: '1px solid #d2bd96',
    borderRadius: 6,
    background: '#f1e4c9',
  },
  troopInfoStatLabel: {
    display: 'block',
    color: '#8a704d',
    fontSize: 9,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  troopInfoStatValue: {
    display: 'block',
    marginTop: 3,
    color: '#4e2f1b',
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1.2,
    overflowWrap: 'anywhere',
  },
  troopInfoStatus: {
    marginTop: 10,
    padding: '8px 10px',
    border: '1px solid #d0a641',
    borderRadius: 6,
    background: '#fff0b8',
    color: '#674514',
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1.3,
    textAlign: 'center',
    overflowWrap: 'anywhere',
  },
  troopPriceNote: {
    width: '100%',
    color: '#6f512f',
    fontWeight: 900,
    textAlign: 'center',
    lineHeight: 1.25,
  },
  swapBadge: {
    position: 'absolute', top: -2, right: -2,
    background: '#E53935', color: '#fff', fontSize: 10, fontWeight: 900,
    padding: '2px 5px', borderRadius: 4, lineHeight: 1, boxShadow: '0 2px 4px rgba(0,0,0,0.4)', zIndex: 20
  },
  swapHint: {
    textAlign: 'center', fontSize: 14, fontWeight: 900, color: '#E53935',
    background: 'transparent',
  },
  swapActionBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
    padding: '8px 16px', background: 'rgba(229,57,53,0.08)', borderBottom: '2px solid rgba(0,0,0,0.06)',
  },
  removeTroopBtn: {
    border: '2px solid #8b211b', borderRadius: 7,
    background: 'linear-gradient(180deg, #ff675f 0%, #cf2f27 100%)',
    color: '#fff', fontSize: 12, fontWeight: 900, padding: '7px 14px',
    cursor: 'pointer', boxShadow: '0 2px 0 #7d211c, 0 3px 6px rgba(0,0,0,0.25)',
    letterSpacing: 0,
  },
  removeAllTroopsBtn: {
    border: '2px solid #6b1712', borderRadius: 7,
    background: 'linear-gradient(180deg, #e84940 0%, #a9221b 100%)',
    color: '#fff', fontSize: 12, fontWeight: 900, padding: '7px 14px',
    cursor: 'pointer', boxShadow: '0 2px 0 #5d1713, 0 3px 6px rgba(0,0,0,0.25)',
    letterSpacing: 0,
  },
  troopActionCloseBtn: {
    width: 30, height: 30, flex: '0 0 30px',
    border: '2px solid #927650', borderRadius: '50%',
    background: '#fff8e7', color: '#6f512f', fontSize: 15, fontWeight: 900,
    cursor: 'pointer', lineHeight: 1, padding: 0,
  },
  actionBtnDisabled: {
    opacity: 0.45,
    cursor: 'default',
    boxShadow: 'none',
  },
};
