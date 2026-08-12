import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useSend, useBuildingDefs, usePlayer, useResources } from '../hooks/useGodot';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useOptionalPrivy } from './PrivyAuthProvider';
import useHydratedNftPlayer from '../hooks/useHydratedNftPlayer';
import { fetchOwnedNftsForPlayerWallets, nftRarityBadgeStyle, nftRarityCardStyle, nftRarityLabel, normalizeNftRarity, resolveDemonKingPlayerInventorySyncTarget, syncDemonKingNfts } from '../lib/nftV3Client';
import './BarnPanel.css';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import arbaletImg from '../assets/units/arbalet.png';
import archerImg from '../assets/units/archer.png';
import mimicImg from '../assets/units/mimic.png';
import necromancerImg from '../assets/units/necromancer.png';
import horrorImg from '../assets/units/horror.png';
import mechanicalDragonImg from '../assets/units/mechanical_dragon.png';
import iceGolemImg from '../assets/units/ice_golem.png';
import berserkImg from '../assets/units/berserk.png';
import demonKingImg from '../assets/units/demonking.png';
import fireDragonImg from '../assets/units/fire_dragon.png';
import windMageImg from '../assets/units/wind_mage.png';
import peaShooterImg from '../assets/units/pea_shooter.png';

// Module-level CSS — injected once, not re-parsed on every render
const UPGRADE_ANIM_CSS = `
  @keyframes levelUpPop {
    0% { transform: scale(1); }
    30% { transform: scale(1.15) translateY(-20px); filter: brightness(1.5); }
    100% { transform: scale(1) translateY(0); filter: brightness(1); }
  }
  @keyframes levelUpText {
    0% { transform: translateY(0) scale(0.5); opacity: 0; }
    20% { transform: translateY(-40px) scale(1.2); opacity: 1; }
    80% { transform: translateY(-100px) scale(1); opacity: 1; }
    100% { transform: translateY(-120px) scale(0.8); opacity: 0; }
  }
  .upgrade-anim-char {
    animation: levelUpPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .upgrade-anim-text {
    animation: levelUpText 1.5s ease-out forwards;
  }
`;

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

const CARD_TROOP_STYLE_MAP = {
  Knight: { scale: 1.25, offsetY: '15%' },
  Mage: { scale: 1.25, offsetY: '15%' },
  Barbarian: { scale: 1.25, offsetY: '15%' },
  Archer: { scale: 1.25, offsetY: '15%' },
  PeaShooter: { scale: 1.10, offsetY: '4%' },
  Mimic: { scale: 1.1, offsetY: '4%' },
  Necromancer: { scale: 1.12, offsetY: '5%' },
  WindMage: { scale: 1.12, offsetY: '5%' },
  Horror: { scale: 1.12, offsetY: '5%' },
  MechanicalDragon: { scale: 1.14, offsetY: '7%' },
  IceGolem: { scale: 1.12, offsetY: '5%' },
  Ranger: { scale: 1.25, offsetY: '15%' },
  DemonKing: { scale: 1.35, offsetY: '10%' },
  FireDragon: { scale: 1.2, offsetY: '8%' },
};

const RES_ICONS = {
  gold: goldIcon,
  wood: woodIcon,
  ore: stoneIcon,
};

const stopPropagation = (e) => e.stopPropagation();

function nftBackedShipEntry(troopName, token) {
  const normalized = troopName === 'FireDragon' ? 'FireDragon' : 'DemonKing';
  if (!token) return normalized;
  return `${normalized}:${token.chain}:${token.tokenId}:R${normalizeNftRarity(token.rarity || 'common')}`;
}

function isEvmDemonKingChain(chain) {
  return ['base', 'arbitrum', 'monad', 'ink'].includes(String(chain || '').toLowerCase());
}

function demonKingTokenKey(token) {
  if (!token) return '';
  return `${String(token.chain || '').toLowerCase()}:${String(token.tokenId || token.id || '')}`;
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

function demonKingDisplayLabel(token, tokens = []) {
  const value = demonKingDisplayIdFromToken(token, tokens);
  const text = String(value || '').trim().replace(/^#/, '');
  return text ? `#${text}` : '';
}

const MAX_TROOP_LEVEL = 9;

function requiredBarnLevelForTroopLevel(level) {
  return Math.max(1, Math.trunc(Number(level) || 1));
}

const TROOP_STATS = {
  Knight: {
    display: "Knight",
    stats: {
      1: { hp: 450, damage: 38, atk_speed: 1.4 },
      2: { hp: 600, damage: 54, atk_speed: 1.4 },
      3: { hp: 780, damage: 77, atk_speed: 1.4 },
      4: { hp: 1000, damage: 109, atk_speed: 1.4 },
      5: { hp: 1248, damage: 152, atk_speed: 1.4 },
      6: { hp: 1716, damage: 232, atk_speed: 1.4 },
      7: { hp: 2076, damage: 314, atk_speed: 1.4 },
    },
    maxStats: { hp: 2076, damage: 314, atk_speed: 1.4 }
  },
  Mage: {
    display: "Mage",
    trait: "Burst Mage: high ranged damage with low HP per slot. Uses 6 ship slots.",
    stats: {
      1: { hp: 450, damage: 203, atk_speed: 1.25 },
      2: { hp: 600, damage: 289, atk_speed: 1.25 },
      3: { hp: 795, damage: 455, atk_speed: 1.25 },
      4: { hp: 1035, damage: 671, atk_speed: 1.25 },
      5: { hp: 2430, damage: 1655, atk_speed: 1.25 },
      6: { hp: 2830, damage: 2329, atk_speed: 1.25 },
      7: { hp: 4554, damage: 4263, atk_speed: 1.25 },
    },
    maxStats: { hp: 4554, damage: 4263, atk_speed: 1.25 }
  },
  Barbarian: {
    display: "Barbarian",
    stats: {
      1: { hp: 240, damage: 24, atk_speed: 0.6 },
      2: { hp: 320, damage: 35, atk_speed: 0.6 },
      3: { hp: 420, damage: 52, atk_speed: 0.6 },
      4: { hp: 550, damage: 74, atk_speed: 0.6 },
      5: { hp: 705, damage: 107, atk_speed: 0.6 },
      6: { hp: 880, damage: 149, atk_speed: 0.6 },
      7: { hp: 1080, damage: 207, atk_speed: 0.6 },
    },
    maxStats: { hp: 1080, damage: 207, atk_speed: 0.6 }
  },
  Archer: {
    display: "Archer",
    stats: {
      1: { hp: 210, damage: 40, atk_speed: 1.05 },
      2: { hp: 280, damage: 56, atk_speed: 1.05 },
      3: { hp: 310, damage: 72, atk_speed: 1.05 },
      4: { hp: 425, damage: 110, atk_speed: 1.05 },
      5: { hp: 624, damage: 182, atk_speed: 1.05 },
      6: { hp: 750, damage: 241, atk_speed: 1.05 },
      7: { hp: 1164, damage: 423, atk_speed: 1.05 },
    },
    maxStats: { hp: 1164, damage: 423, atk_speed: 1.05 }
  },
  PeaShooter: {
    display: "Pea Shooter",
    trait: "Burst Sprout: fires three green peas per attack cycle. Uses 5 ship slots.",
    stats: {
      1: { hp: 1250, damage: 110, atk_speed: 1.75 },
      2: { hp: 1650, damage: 150, atk_speed: 1.75 },
      3: { hp: 2150, damage: 195, atk_speed: 1.75 },
      4: { hp: 2800, damage: 280, atk_speed: 1.75 },
      5: { hp: 3905, damage: 418, atk_speed: 1.75 },
      6: { hp: 4670, damage: 536, atk_speed: 1.75 },
      7: { hp: 6700, damage: 825, atk_speed: 1.75 },
    },
    maxStats: { hp: 6700, damage: 825, atk_speed: 1.75 }
  },
  Mimic: {
    display: "Barrel",
    trait: "Trap Runner: defenses ignore it while rolling. Traps trigger without damage. Uses 8 ship slots.",
    stats: {
      1: { hp: 1800, damage: 120, atk_speed: 1.5 },
      2: { hp: 2400, damage: 171, atk_speed: 1.5 },
      3: { hp: 3120, damage: 242, atk_speed: 1.5 },
      4: { hp: 4080, damage: 333, atk_speed: 1.5 },
      5: { hp: 6244, damage: 554, atk_speed: 1.5 },
      6: { hp: 9540, damage: 944, atk_speed: 1.5 },
      7: { hp: 11200, damage: 1231, atk_speed: 1.5 },
    },
    maxStats: { hp: 11200, damage: 1231, atk_speed: 1.5 }
  },
  Necromancer: {
    display: "Necromancer",
    trait: "Grave Caller: ranged green magic and up to 3 renewable skeleton summons. Uses 18 ship slots.",
    stats: {
      1: { hp: 2640, damage: 510, atk_speed: 1.35 },
      2: { hp: 3480, damage: 724, atk_speed: 1.35 },
      3: { hp: 4560, damage: 1121, atk_speed: 1.35 },
      4: { hp: 5880, damage: 1628, atk_speed: 1.35 },
      5: { hp: 7440, damage: 2327, atk_speed: 1.35 },
      6: { hp: 9240, damage: 3305, atk_speed: 1.35 },
      7: { hp: 20700, damage: 8533, atk_speed: 1.35 },
    },
    maxStats: { hp: 20700, damage: 8533, atk_speed: 1.35 }
  },
  WindMage: {
    display: "Wind Mage",
    trait: "Wind Corridor: sweeps a wide lane and summons temporary Windlings. Uses 18 ship slots.",
    stats: {
      1: { hp: 2200, damage: 430, atk_speed: 2.20 },
      2: { hp: 2900, damage: 560, atk_speed: 2.20 },
      3: { hp: 3800, damage: 740, atk_speed: 2.20 },
      4: { hp: 4900, damage: 980, atk_speed: 2.20 },
      5: { hp: 6200, damage: 1280, atk_speed: 2.20 },
      6: { hp: 7700, damage: 1660, atk_speed: 2.20 },
      7: { hp: 12000, damage: 3000, atk_speed: 2.20 },
    },
    maxStats: { hp: 12000, damage: 3000, atk_speed: 2.20 }
  },
  Horror: {
    display: "Horror",
    trait: "Brood Evolution: uses 22 ship slots. On death it splits into 2 Creepers; each Creeper splits into 2 Lurkers.",
    stats: {
      1: { hp: 4533, damage: 453, atk_speed: 1.24 },
      2: { hp: 5967, damage: 607, atk_speed: 1.24 },
      3: { hp: 7800, damage: 813, atk_speed: 1.24 },
      4: { hp: 10067, damage: 1100, atk_speed: 1.24 },
      5: { hp: 12800, damage: 1480, atk_speed: 1.24 },
      6: { hp: 15933, damage: 1973, atk_speed: 1.24 },
      7: { hp: 19533, damage: 2600, atk_speed: 1.24 },
    },
    maxStats: { hp: 19533, damage: 2600, atk_speed: 1.24 }
  },
  MechanicalDragon: {
    display: "Mechanical Dragon",
    trait: "Chain Siege: lightning jumps to 2 nearby buildings for 65% and 42% damage. Heavy flying unit, uses 5 ship slots.",
    stats: {
      1: { hp: 700, damage: 106, atk_speed: 1.03 },
      2: { hp: 920, damage: 150, atk_speed: 1.03 },
      3: { hp: 1200, damage: 218, atk_speed: 1.03 },
      4: { hp: 1550, damage: 310, atk_speed: 1.03 },
      5: { hp: 1970, damage: 449, atk_speed: 1.03 },
      6: { hp: 2450, damage: 629, atk_speed: 1.03 },
      7: { hp: 3278, damage: 957, atk_speed: 1.03 },
    },
    maxStats: { hp: 3278, damage: 957, atk_speed: 1.03 }
  },
  IceGolem: {
    display: "Ice Golem",
    trait: "Frozen Vanguard: attacks defenses first. On death, freezes nearby defenses for 7 seconds. Uses 11 ship slots.",
    stats: {
      1: { hp: 5250, damage: 195, atk_speed: 1.42 },
      2: { hp: 6750, damage: 263, atk_speed: 1.42 },
      3: { hp: 8750, damage: 358, atk_speed: 1.42 },
      4: { hp: 11125, damage: 488, atk_speed: 1.42 },
      5: { hp: 14000, damage: 658, atk_speed: 1.42 },
      6: { hp: 17250, damage: 878, atk_speed: 1.42 },
      7: { hp: 21840, damage: 1200, atk_speed: 1.42 },
    },
    maxStats: { hp: 21840, damage: 1200, atk_speed: 1.42 }
  },
  Ranger: {
    display: "Ranger",
    stats: {
      1: { hp: 250, damage: 34, atk_speed: 1.0 },
      2: { hp: 330, damage: 49, atk_speed: 1.0 },
      3: { hp: 430, damage: 72, atk_speed: 1.0 },
      4: { hp: 560, damage: 105, atk_speed: 1.0 },
      5: { hp: 710, damage: 151, atk_speed: 1.0 },
      6: { hp: 890, damage: 215, atk_speed: 1.0 },
      7: { hp: 1100, damage: 303, atk_speed: 1.0 },
    },
    maxStats: { hp: 1100, damage: 303, atk_speed: 1.0 }
  },
  DemonKing: {
    display: "Demon King",
    trait: "Heavy Boss: premium melee durability and reach. Uses 6 ship slots.",
    stats: {
      1: { hp: 2700, damage: 228, atk_speed: 1.4 },
      2: { hp: 3600, damage: 323, atk_speed: 1.4 },
      3: { hp: 4680, damage: 462, atk_speed: 1.4 },
      4: { hp: 6000, damage: 657, atk_speed: 1.4 },
      5: { hp: 6800, damage: 837, atk_speed: 1.4 },
      6: { hp: 9000, damage: 1240, atk_speed: 1.4 },
      7: { hp: 10700, damage: 1618, atk_speed: 1.4 },
    },
    maxStats: { hp: 10700, damage: 1618, atk_speed: 1.4 }
  },
  FireDragon: {
    display: "Dragon",
    trait: "Flying Boss: ranged fire ignores ground traps. Uses 11 ship slots.",
    stats: {
      1: { hp: 1750, damage: 470, atk_speed: 1.25 },
      2: { hp: 2320, damage: 670, atk_speed: 1.25 },
      3: { hp: 3080, damage: 1050, atk_speed: 1.25 },
      4: { hp: 4000, damage: 1549, atk_speed: 1.25 },
      5: { hp: 5049, damage: 2218, atk_speed: 1.25 },
      6: { hp: 6440, damage: 3158, atk_speed: 1.25 },
      7: { hp: 8740, damage: 4879, atk_speed: 1.25 },
    },
    maxStats: { hp: 8740, damage: 4879, atk_speed: 1.25 }
  }
};

const ACTIVE_TROOP_NAMES = [
  'Knight', 'Mage', 'Archer', 'PeaShooter', 'Mimic', 'Necromancer', 'Horror',
  'MechanicalDragon', 'IceGolem', 'WindMage', 'DemonKing', 'FireDragon',
];
const TROOP_LOGISTICS = {
  PeaShooter: {
    townHallLevel: 4,
    slotCost: 5,
    loadCostGold: 500,
  },
  WindMage: {
    townHallLevel: 6,
    slotCost: 15,
    loadCostGold: 1500,
  },
};
const NFT_RARITY_MULTIPLIERS = {
  common: 1.2,
  epic: 1.3,
  legendary: 1.5,
  unrevealed: 1.2,
};
const NFT_REFERENCE_TROOPS = new Set(['DemonKing', 'FireDragon']);
const TROOP_LEVEL_KEYS = {
  Knight: ['Knight', 'knight'],
  Mage: ['Mage', 'mage'],
  Barbarian: ['Barbarian', 'barbarian'],
  Archer: ['Archer', 'archer'],
  PeaShooter: ['PeaShooter', 'pea_shooter', 'peashooter', 'Pea Shooter', 'pea-shooter'],
  Mimic: ['Mimic', 'mimic'],
  Necromancer: ['Necromancer', 'necromancer', 'SkeletonMage', 'skeleton_mage'],
  WindMage: ['WindMage', 'wind_mage', 'windmage', 'Wind Mage', 'wind-mage'],
  Horror: ['Horror', 'horror', 'HorrorEvolution', 'horror_evolution'],
  MechanicalDragon: ['MechanicalDragon', 'mechanical_dragon', 'mechanicaldragon', 'mechdragon'],
  IceGolem: ['IceGolem', 'ice_golem', 'icegolem'],
  Ranger: ['Ranger', 'ranger'],
  DemonKing: ['DemonKing', 'demon_king', 'demonking'],
  FireDragon: ['FireDragon', 'fire_dragon', 'firedragon'],
};

function troopDefinitionFromMap(definitions = {}, troopName) {
  const keys = TROOP_LEVEL_KEYS[troopName] || [troopName, troopName.toLowerCase()];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(definitions, key)) return definitions[key];
  }
  return null;
}

const NFT_BACKED_TROOPS = {
  DemonKing: {
    collection: 'demonking',
    serverType: 'demon_king',
    label: 'Demon King',
    image: demonKingImg,
  },
  FireDragon: {
    collection: 'dragon',
    serverType: 'fire_dragon',
    label: 'Dragon',
    image: fireDragonImg,
  },
};

function nftBackedTroopConfig(name) {
  return NFT_BACKED_TROOPS[name] || null;
}

function upgradeStatusMatchesTroop(status, nftTroopConfig) {
  if (!status || !nftTroopConfig?.serverType) return false;
  const rawType = String(status.troop_type || status.troopType || '').trim().toLowerCase().replace(/[\s-]/g, '_');
  return rawType === nftTroopConfig.serverType;
}

function positiveIntOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function clampLevel(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function troopLevelFromMap(levels = {}, troopName, fallbackLevel = 1) {
  const keys = TROOP_LEVEL_KEYS[troopName] || [troopName, troopName.toLowerCase()];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(levels, key)) {
      return clampLevel(levels[key], 1, MAX_TROOP_LEVEL);
    }
  }
  return clampLevel(fallbackLevel, 1, MAX_TROOP_LEVEL);
}

function troopStatsAtOrBelow(name, level) {
  const statsByLevel = TROOP_STATS[name]?.stats || {};
  const requestedLevel = clampLevel(level, 1, MAX_TROOP_LEVEL);
  if (statsByLevel[requestedLevel]) return statsByLevel[requestedLevel];
  const authoredLevel = Math.max(
    1,
    ...Object.keys(statsByLevel)
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value) && value <= requestedLevel),
  );
  return statsByLevel[authoredLevel] || null;
}

function rarityMultiplier(rarity) {
  const key = normalizeNftRarity(rarity || 'common');
  return NFT_RARITY_MULTIPLIERS[key] || NFT_RARITY_MULTIPLIERS.common;
}

function computeNftTroopStats(name, level, troopLevels = {}, rarity = 'common') {
  const sharedLevel = troopLevelFromMap(troopLevels, name, level);
  const stats = troopStatsAtOrBelow(name, sharedLevel) || troopStatsAtOrBelow(name, level);
  if (!stats) return null;
  const mult = rarityMultiplier(rarity) / NFT_RARITY_MULTIPLIERS.common;
  return {
    hp: Math.ceil((Number(stats.hp) || 0) * mult),
    damage: Math.ceil((Number(stats.damage) || 0) * mult),
    atk_speed: Number(stats.atk_speed) || 1,
  };
}

function getTroopStats(name, level, troopLevels = {}, rarity = 'common') {
  if (NFT_REFERENCE_TROOPS.has(name)) return computeNftTroopStats(name, level, troopLevels, rarity);
  return troopStatsAtOrBelow(name, level);
}

function getTroopMaxStats(name, troopLevels = {}, rarity = 'common') {
  const maxLevel = Math.max(
    1,
    ...Object.keys(TROOP_STATS[name]?.stats || {})
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value)),
  );
  if (NFT_REFERENCE_TROOPS.has(name)) {
    return computeNftTroopStats(name, maxLevel, { ...(troopLevels || {}), [name]: maxLevel }, rarity);
  }
  return TROOP_STATS[name]?.maxStats || TROOP_STATS[name]?.stats?.[maxLevel];
}

const ProgressBar = ({ label, value, max, showAsTime = false, valueText = null }) => {
  const percentage = Math.min((Number(value) / Math.max(1, Number(max))) * 100, 100);
  return (
    <div className="barn-unit-stat">
      <div className="barn-unit-stat__header">
        <span>{label}</span>
        <strong>{valueText || `${value}${showAsTime ? 's' : ''}`}</strong>
      </div>
      <div
        className="barn-unit-stat__track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Number(value)}
        aria-valuemin="0"
        aria-valuemax={Number(max)}
      >
        <div className="barn-unit-stat__fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

function BarnPanel({ building, onClose }) {
  const { sendToGodot } = useSend();
  const playerState = usePlayer();
  const resources = useResources();
  const { buildingDefs, troopLevels } = useBuildingDefs();
  const nftPlayerState = useHydratedNftPlayer(playerState);
  const evmWallet = useEvmWallet();
  const evmAddress = evmWallet?.address || null;
  const solWallet = useSolWallet();
  const optionalPrivy = useOptionalPrivy();
  const solAddress = solWallet?.publicKey?.toBase58?.()
    || (optionalPrivy.solanaWallets || []).find((wallet) => wallet?.address)?.address
    || null;
  const aptosWallet = useAptosWallet();
  const aptosAddress = aptosWallet?.address || null;
  const demonKingSyncTarget = useMemo(() => resolveDemonKingPlayerInventorySyncTarget({
    player: nftPlayerState,
    evmAddress,
    solAddress,
    aptosAddress,
  }), [aptosAddress, evmAddress, nftPlayerState, solAddress]);
  const hasDemonKingWallet = !!demonKingSyncTarget;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimatingUpgrade, setIsAnimatingUpgrade] = useState(false);
  const [demonKingNfts, setDemonKingNfts] = useState([]);
  const [selectedDemonKey, setSelectedDemonKey] = useState('');
  const [demonKingStatus, setDemonKingStatus] = useState(null);
  const [demonKingLoading, setDemonKingLoading] = useState(false);
  const [demonKingError, setDemonKingError] = useState(null);
  const [pendingUpgrade, setPendingUpgrade] = useState(null);
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const troops = buildingDefs?.troops || {};
  const currentTownHallLevel = Number(buildingDefs?.th_level || buildingDefs?.town_hall_level || 1) || 1;
  const troopNames = ACTIVE_TROOP_NAMES.filter((name) => troopDefinitionFromMap(troops, name));
  const safeIndex = troopNames.length ? Math.min(currentIndex, troopNames.length - 1) : 0;
  const currentTroopName = troopNames[safeIndex];
  const currentNftTroop = nftBackedTroopConfig(currentTroopName);
  const tdef = currentTroopName ? troopDefinitionFromMap(troops, currentTroopName) : null;
  const troopLogistics = TROOP_LOGISTICS[currentTroopName] || null;
  const requiredTownHallLevel = Math.max(
    1,
    Number(tdef?.min_town_hall_level || troopLogistics?.townHallLevel || 1) || 1,
  );
  const troopUnlocked = currentTownHallLevel >= requiredTownHallLevel;
  const lvl = currentTroopName ? troopLevelFromMap(troopLevels, currentTroopName, 1) : 1;
  const prevLvlRef = useRef(lvl);
  const prevTroopRef = useRef(currentTroopName);

  // Fetch authoritative troop levels from server when panel opens
  useEffect(() => {
    sendToGodot('refresh_troops');
  }, [sendToGodot]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => {
      const focusable = dialog?.querySelectorAll(focusableSelector);
      (focusable?.[0] || dialog)?.focus?.();
    };
    const animationFrame = window.requestAnimationFrame(focusFirst);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('keydown', handleKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (!currentNftTroop) return undefined;
    const controller = new AbortController();
    const token = typeof window !== 'undefined' ? window._playerToken : null;
    setDemonKingLoading(true);
    setDemonKingError(null);
    const label = currentNftTroop.label;
    const statusPromise = fetch(`/api/troops/${currentNftTroop.serverType}/upgrade-status`, {
      cache: 'no-store',
      headers: token ? { 'x-token': token } : {},
      signal: controller.signal,
    }).then((res) => res.json().catch(() => ({}))).catch(() => null);
    const ownedPromise = demonKingSyncTarget
      ? fetchOwnedNftsForPlayerWallets({
          ...demonKingSyncTarget,
          collection: currentNftTroop.collection,
          signal: controller.signal,
        })
          .then((ownedJson) => {
            if ((ownedJson?.tokens || []).length) {
              syncDemonKingNfts({
                ...demonKingSyncTarget,
                collection: currentNftTroop.collection,
                signal: controller.signal,
              }).catch(() => {});
            }
            return ownedJson;
          })
          .catch(async (err) => {
            try {
              return await syncDemonKingNfts({
                ...demonKingSyncTarget,
                collection: currentNftTroop.collection,
                signal: controller.signal,
              });
            } catch {
              return { error: err, tokens: [] };
            }
          })
      : Promise.resolve({ tokens: [] });

    Promise.all([statusPromise, ownedPromise])
      .then(([statusJson, ownedJson]) => {
        if (controller.signal.aborted) return;
        if (statusJson) setDemonKingStatus(statusJson);
        const tokens = [];
        (ownedJson?.tokens || []).forEach((item) => {
          const tokenId = String(item.tokenId || item.id || '');
          if (!tokenId) return;
          tokens.push({
            ...item,
            chain: item.chain || 'base',
            tokenId,
            imageUrl: item.imageUrl || currentNftTroop.image,
          });
        });
        tokens.sort((a, b) => (
          String(a.chain).localeCompare(String(b.chain))
          || String(a.tokenId).localeCompare(String(b.tokenId), undefined, { numeric: true })
        ));
        setDemonKingNfts(tokens);
        if (ownedJson?.error) setDemonKingError((ownedJson.error?.message || `Could not load ${label} NFTs`).slice(0, 140));
        setSelectedDemonKey((prev) => {
          if (prev && tokens.some((item) => nftBackedShipEntry(currentTroopName, item) === prev)) return prev;
          return tokens[0] ? nftBackedShipEntry(currentTroopName, tokens[0]) : '';
        });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setDemonKingError((err?.message || `Could not load ${label} NFTs`).slice(0, 140));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDemonKingLoading(false);
      });
    return () => controller.abort();
  }, [currentTroopName, currentNftTroop, demonKingSyncTarget]);

  useEffect(() => {
    if (!currentNftTroop) return undefined;
    const selectedToken = demonKingNfts.find((token) => nftBackedShipEntry(currentTroopName, token) === selectedDemonKey) || demonKingNfts[0] || null;
    if (!selectedToken?.chain || !selectedToken?.tokenId) return undefined;

    const controller = new AbortController();
    const token = typeof window !== 'undefined' ? window._playerToken : null;
    const params = new URLSearchParams({
      chain: selectedToken.chain,
      tokenId: String(selectedToken.tokenId),
    });
    fetch(`/api/troops/${currentNftTroop.serverType}/upgrade-status?${params.toString()}`, {
      cache: 'no-store',
      headers: token ? { 'x-token': token } : {},
      signal: controller.signal,
    })
      .then((res) => res.json().catch(() => ({})))
      .then((json) => {
        if (!controller.signal.aborted && json && !json.error) setDemonKingStatus(json);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [currentTroopName, currentNftTroop, demonKingNfts, selectedDemonKey]);

  const handleUpgradeTroop = useCallback((name, expectedLevel) => {
    const normalizedExpected = Number(expectedLevel || 0);
    setPendingUpgrade({ troop: name, expectedLevel: normalizedExpected, at: Date.now() });
    sendToGodot('upgrade_troop', {
      troop_name: name,
      ...(normalizedExpected > 0 ? { expected_level: normalizedExpected } : {}),
    });
  }, [sendToGodot]);

  useEffect(() => {
    if (!pendingUpgrade) return undefined;
    if (pendingUpgrade.troop !== currentTroopName || Number(lvl || 0) !== Number(pendingUpgrade.expectedLevel || 0)) {
      setPendingUpgrade(null);
      return undefined;
    }
    const timeoutId = setTimeout(() => setPendingUpgrade(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [currentTroopName, lvl, pendingUpgrade]);
  
  const handlePrev = () => {
    if (troopNames.length < 2) return;
    setCurrentIndex(currentIndex === 0 ? troopNames.length - 1 : currentIndex - 1);
  };

  const handleNext = () => {
    if (troopNames.length < 2) return;
    setCurrentIndex(currentIndex === troopNames.length - 1 ? 0 : currentIndex + 1);
  };

  useEffect(() => {
    if (troopNames.length > 0 && currentIndex >= troopNames.length) setCurrentIndex(0);
  }, [currentIndex, troopNames.length]);

  useEffect(() => {
    if (!currentTroopName) return;
    let timeoutId = null;
    if (prevTroopRef.current === currentTroopName) {
      if (lvl > prevLvlRef.current && prevLvlRef.current !== 0) {
        setIsAnimatingUpgrade(true);
        timeoutId = setTimeout(() => setIsAnimatingUpgrade(false), 2000);
      }
    }
    prevLvlRef.current = lvl;
    prevTroopRef.current = currentTroopName;
    if (timeoutId) return () => clearTimeout(timeoutId);
  }, [lvl, currentTroopName]);

  if (!building || !building.is_barn) return null;
  
  if (troopNames.length === 0) return null;
  
  const maxLevelFromCosts = Math.max(
    1,
    ...Object.keys(tdef?.costs || {})
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value)),
  );
  const maxLevelFromStats = Math.max(
    1,
    ...Object.keys(TROOP_STATS[currentTroopName]?.stats || {})
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value)),
  );
  const troopMaxLevel = Math.max(1, Number(tdef?.max_level) || maxLevelFromCosts, maxLevelFromStats);
  const troopTownHallLevelCap = Math.min(troopMaxLevel, Math.max(1, currentTownHallLevel));
  const isNftBackedTroop = !!currentNftTroop;
  const isDemonKingNftTroop = currentNftTroop?.collection === 'demonking' || currentNftTroop?.collection === 'demon_king';
  const isRarityNftTroop = isDemonKingNftTroop || currentNftTroop?.collection === 'dragon';
  const authoritativeNftStatus = upgradeStatusMatchesTroop(demonKingStatus, currentNftTroop)
    ? demonKingStatus
    : null;
  const selectedDemonNft = isNftBackedTroop
    ? demonKingNfts.find((token) => nftBackedShipEntry(currentTroopName, token) === selectedDemonKey) || demonKingNfts[0] || null
    : null;
  const selectedNftRarity = normalizeNftRarity(selectedDemonNft?.rarity || 'common');
  const statusCurrentLevel = positiveIntOrNull(authoritativeNftStatus?.current_level ?? authoritativeNftStatus?.currentLevel);
  const displayLvl = statusCurrentLevel ? clampLevel(statusCurrentLevel, 1, troopMaxLevel) : lvl;
  const isMax = displayLvl >= troopMaxLevel;
  const localBarnLevel = Math.max(1, Number(building?.level || 1));
  const statusBarnLevel = positiveIntOrNull(authoritativeNftStatus?.current_barn_level ?? authoritativeNftStatus?.currentBarnLevel);
  const barnLevel = statusBarnLevel || localBarnLevel;
  const hasStatusNextLevel = !!authoritativeNftStatus && (
    Object.prototype.hasOwnProperty.call(authoritativeNftStatus, 'next_level')
    || Object.prototype.hasOwnProperty.call(authoritativeNftStatus, 'nextLevel')
  );
  const statusNextLevel = hasStatusNextLevel
    ? positiveIntOrNull(authoritativeNftStatus.next_level ?? authoritativeNftStatus.nextLevel)
    : null;
  const nextTroopLevel = isMax ? null : (hasStatusNextLevel ? statusNextLevel : displayLvl + 1);
  const townHallReadyForNextLevel = !nextTroopLevel || (
    typeof authoritativeNftStatus?.town_hall_ready === 'boolean'
      ? authoritativeNftStatus.town_hall_ready
      : nextTroopLevel <= troopTownHallLevelCap
  );
  const statusRequiredBarnLevel = positiveIntOrNull(authoritativeNftStatus?.required_barn_level ?? authoritativeNftStatus?.requiredBarnLevel);
  const requiredBarnLevel = nextTroopLevel
    ? (statusRequiredBarnLevel || requiredBarnLevelForTroopLevel(nextTroopLevel))
    : null;
  const barnReadyForNextLevel = !nextTroopLevel || (
    typeof authoritativeNftStatus?.barn_ready === 'boolean'
      ? authoritativeNftStatus.barn_ready
      : barnLevel >= requiredBarnLevel
  );
  // costs key = current level (cost to upgrade FROM that level)
  const nextCost = !isMax && tdef?.costs?.[String(displayLvl)];
  const stats = getTroopStats(currentTroopName, displayLvl, troopLevels, selectedNftRarity);
  const maxStats = getTroopMaxStats(currentTroopName, troopLevels, selectedNftRarity);
  const displayName = TROOP_STATS[currentTroopName]?.display || tdef?.display || currentTroopName;

  const upgradePending = !!pendingUpgrade && pendingUpgrade.troop === currentTroopName && Number(pendingUpgrade.expectedLevel || 0) === Number(displayLvl || 0);
  const resourceEntries = nextCost
    ? Object.entries(nextCost).filter(([, amount]) => Number(amount) > 0)
    : [];
  const resourceShortfalls = resourceEntries
    .map(([resource, amount]) => ({
      resource,
      required: Number(amount),
      available: Number(resources?.[resource] || 0),
    }))
    .map((entry) => ({ ...entry, shortfall: Math.max(0, entry.required - entry.available) }))
    .filter((entry) => entry.shortfall > 0);
  const ctaBlocker = building.is_enemy
    ? 'Enemy units cannot be upgraded'
    : upgradePending
      ? 'Upgrade pending…'
      : isMax
        ? 'Maximum level reached'
        : !troopUnlocked
          ? `Town Hall Level ${requiredTownHallLevel} required`
          : !townHallReadyForNextLevel
            ? `Upgrade Town Hall to Level ${nextTroopLevel}`
            : !barnReadyForNextLevel
              ? `Upgrade Barn to Level ${requiredBarnLevel}`
              : isNftBackedTroop && demonKingLoading
                ? `Checking ${currentNftTroop.label} ownership…`
                : isNftBackedTroop && !selectedDemonNft
                  ? `${currentNftTroop.label} NFT required`
                  : resourceShortfalls.length > 0
                    ? `Need ${resourceShortfalls.map(({ resource, shortfall }) => `${shortfall.toLocaleString()} ${resource}`).join(', ')}`
                    : '';
  const upgradeDisabled = !!ctaBlocker;
  const handleMainUpgrade = () => {
    if (upgradeDisabled) return;
    if (!isNftBackedTroop) {
      handleUpgradeTroop(currentTroopName, displayLvl);
      return;
    }
    if (!selectedDemonNft) {
      window.dispatchEvent(new CustomEvent('clash-open-nft-shop', {
        detail: {
          view: 'shop',
          request: {
            ...(demonKingStatus || {}),
            collection: currentNftTroop.collection,
          },
        },
      }));
      return;
    }
    handleUpgradeTroop(currentTroopName, displayLvl);
  };

  return (
    <div className="barn-unit-modal__overlay" onClick={onClose}>
      <style>{UPGRADE_ANIM_CSS}</style>
      <section
        ref={dialogRef}
        className="barn-unit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="barn-unit-modal-title"
        tabIndex={-1}
        onClick={stopPropagation}
      >
        <header className="barn-unit-modal__header">
          <h2 id="barn-unit-modal-title" className="barn-unit-modal__title">{displayName}</h2>
          <button type="button" className="barn-unit-modal__close" onClick={onClose} aria-label={`Close ${displayName}`}>
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div
          className="barn-unit-modal__body clash-scroll"
          role="region"
          aria-label={`${displayName} upgrade details`}
          tabIndex={0}
        >
          <div className="barn-unit-modal__layout">
            <aside className="barn-unit-preview" aria-label={`${displayName} preview`}>
              <div className="barn-unit-preview__selector">
                <button
                  type="button"
                  className="barn-unit-preview__nav"
                  onClick={handlePrev}
                  disabled={troopNames.length < 2}
                  aria-label="Previous unit"
                >
                  <span aria-hidden="true">&lsaquo;</span>
                </button>
                <div className="barn-unit-preview__sphere">
                  {isAnimatingUpgrade && <div className="barn-unit-preview__level-up upgrade-anim-text">Level up</div>}
                  {isNftBackedTroop ? (
                    <img
                      src={currentNftTroop.image}
                      alt={currentNftTroop.label}
                      className={`barn-unit-preview__image${isAnimatingUpgrade ? ' upgrade-anim-char' : ''}`}
                      style={{ transform: `translateY(${CARD_TROOP_STYLE_MAP[currentTroopName]?.offsetY || '10%'}) scale(${CARD_TROOP_STYLE_MAP[currentTroopName]?.scale || 1.35})` }}
                    />
                  ) : troopNames.map(name => {
                    const isActive = name === currentTroopName;
                    if (!UNIT_IMAGES[name]) {
                      if (!isActive) return null;
                      return (
                        <div key={name} className={`barn-unit-preview__fallback${isAnimatingUpgrade ? ' upgrade-anim-char' : ''}`} aria-label={`${displayName} portrait pending`}>
                          <strong>WM</strong>
                          <small>Wind Mage</small>
                        </div>
                      );
                    }
                    const charStyle = CARD_TROOP_STYLE_MAP[name] || { scale: 1.8, offsetY: '5%' };
                    return (
                      <img
                        key={name}
                        src={UNIT_IMAGES[name]}
                        alt={isActive ? name : ''}
                        aria-hidden={!isActive}
                        className={`barn-unit-preview__image${isActive && isAnimatingUpgrade ? ' upgrade-anim-char' : ''}`}
                        style={{ transform: `translateY(${charStyle.offsetY}) scale(${charStyle.scale})`, opacity: isActive ? 1 : 0 }}
                      />
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="barn-unit-preview__nav"
                  onClick={handleNext}
                  disabled={troopNames.length < 2}
                  aria-label="Next unit"
                >
                  <span aria-hidden="true">&rsaquo;</span>
                </button>
              </div>
              <div className="barn-unit-preview__level" aria-label={nextTroopLevel ? `Level ${displayLvl} to ${nextTroopLevel}` : `Level ${displayLvl}, maximum`}>
                <span>Level</span>
                <strong>{displayLvl}</strong>
                {nextTroopLevel && (
                  <>
                    <span aria-hidden="true">&rarr;</span>
                    <strong className="barn-unit-preview__next-level">{nextTroopLevel}</strong>
                  </>
                )}
              </div>
              <span className="barn-unit-preview__count">{safeIndex + 1} / {troopNames.length}</span>
            </aside>

            <div className="barn-unit-details">
              <section className="barn-unit-section" aria-labelledby="barn-unit-stats-title">
                <h3 id="barn-unit-stats-title" className="barn-unit-section__title">Stats</h3>
                {stats && maxStats && (
                  <div className="barn-unit-stats">
                    <ProgressBar label="Health Points" value={stats.hp} max={maxStats.hp} />
                    <ProgressBar label="Damage Output" value={stats.damage} max={maxStats.damage} />
                    <ProgressBar label="Attack Speed" value={stats.atk_speed} max={maxStats.atk_speed} showAsTime />
                    <ProgressBar label="Level Progress" value={displayLvl} max={troopMaxLevel} />
                  </div>
                )}
                {TROOP_STATS[currentTroopName]?.trait && (
                  <div className="barn-unit-trait">{TROOP_STATS[currentTroopName].trait}</div>
                )}
                {troopLogistics && (
                  <div className="barn-unit-logistics" aria-label="Unit logistics">
                    <span>TH {troopLogistics.townHallLevel}</span>
                    <span>{troopLogistics.slotCost} ship slots</span>
                    <span>{troopLogistics.loadCostGold.toLocaleString()} gold to load</span>
                  </div>
                )}
              </section>

              {isNftBackedTroop && (
                <section className="barn-unit-nft" aria-labelledby="barn-unit-nft-title">
                  <div className="barn-unit-nft__header">
                    <h3 id="barn-unit-nft-title" className="barn-unit-section__title">NFT unit</h3>
                    <span>{hasDemonKingWallet ? `${demonKingNfts.length} owned` : 'Wallet required'}</span>
                  </div>
                  {demonKingLoading && <div className="barn-unit-hint" role="status">Loading NFT inventory…</div>}
                  {demonKingError && <div className="barn-unit-hint barn-unit-hint--error">{demonKingError}</div>}
                  {hasDemonKingWallet && demonKingNfts.length > 0 ? (
                    <div className="barn-unit-nft__grid">
                      {demonKingNfts.map((token) => {
                        const key = nftBackedShipEntry(currentTroopName, token);
                        const active = key === (selectedDemonKey || nftBackedShipEntry(currentTroopName, selectedDemonNft));
                        const tokenLabel = demonKingDisplayLabel(token, demonKingNfts);
                        const rarityCardStyle = isRarityNftTroop ? nftRarityCardStyle(token.rarity, 1, { active }) : {};
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`barn-unit-nft__token${active ? ' barn-unit-nft__token--active' : ''}`}
                            aria-pressed={active}
                            onClick={() => setSelectedDemonKey(key)}
                            style={rarityCardStyle}
                          >
                            <span style={isRarityNftTroop ? nftRarityBadgeStyle(token.rarity, 1, { compact: true }) : null}>
                              {isRarityNftTroop ? nftRarityLabel(token.rarity, 1) : 'NFT'}
                            </span>
                            <span>{tokenLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : !demonKingLoading && (
                    <div className="barn-unit-hint">
                      {hasDemonKingWallet ? `${currentNftTroop.label} requires an owned NFT.` : `Connect a supported wallet to load ${currentNftTroop.label} NFTs.`}
                    </div>
                  )}
                </section>
              )}

              <section className="barn-unit-section" aria-labelledby="barn-unit-cost-title">
                <h3 id="barn-unit-cost-title" className="barn-unit-section__title">Upgrade resources</h3>
                {ctaBlocker && <div className="barn-unit-blocker" role="status">{ctaBlocker}</div>}
                <div className="barn-unit-costs">
                  {resourceEntries.length > 0 ? resourceEntries.map(([resource, amount]) => {
                    const required = Number(amount);
                    const available = Number(resources?.[resource] || 0);
                    const shortfall = Math.max(0, required - available);
                    return (
                      <div
                        key={resource}
                        className={`barn-unit-cost${shortfall > 0 ? ' barn-unit-cost--short' : ''}`}
                        aria-label={`${resource}: ${required.toLocaleString()} required, ${available.toLocaleString()} available${shortfall > 0 ? `, ${shortfall.toLocaleString()} short` : ''}`}
                      >
                        <img src={RES_ICONS[resource] || goldIcon} alt="" />
                        <div aria-hidden="true">
                          <span>Required</span>
                          <strong>{required.toLocaleString()}</strong>
                          <small>
                            {available.toLocaleString()} available{shortfall > 0 ? ` / ${shortfall.toLocaleString()} short` : ''}
                          </small>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="barn-unit-costs__empty">No requirements</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>

        <footer className="barn-unit-modal__footer">
          <button type="button" className="barn-unit-modal__action" disabled={upgradeDisabled} aria-busy={upgradePending || undefined} onClick={handleMainUpgrade}>
            {ctaBlocker || `Upgrade to Level ${nextTroopLevel}`}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default memo(BarnPanel);
