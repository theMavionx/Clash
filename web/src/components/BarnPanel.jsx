import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useSend, useBuildingDefs, usePlayer } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useOptionalPrivy } from './PrivyAuthProvider';
import useHydratedNftPlayer from '../hooks/useHydratedNftPlayer';
import { fetchOwnedNftsForPlayerWallets, nftRarityBadgeStyle, nftRarityCardStyle, nftRarityLabel, normalizeNftRarity, resolveDemonKingPlayerInventorySyncTarget, syncDemonKingNfts } from '../lib/nftV3Client';

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

const dragonImg = '/cdn/nft/dragon/1/default.jpg';

// Module-level CSS — injected once, not re-parsed on every render
const UPGRADE_ANIM_CSS = `
  @keyframes levelUpGlow {
    0% { transform: scale(0.5); opacity: 1; filter: hue-rotate(0deg); }
    50% { transform: scale(1.5); opacity: 0.8; filter: hue-rotate(90deg); }
    100% { transform: scale(2.5); opacity: 0; filter: hue-rotate(180deg); }
  }
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
  .upgrade-anim-glow {
    animation: levelUpGlow 1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
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

function demonKingShipEntry(token) {
  if (!token) return 'DemonKing';
  return `DemonKing:${token.chain}:${token.tokenId}:R${normalizeNftRarity(token.rarity || 'common')}`;
}

function nftBackedShipEntry(troopName, token) {
  const normalized = troopName === 'FireDragon' ? 'FireDragon' : 'DemonKing';
  if (!token) return normalized;
  return `${normalized}:${token.chain}:${token.tokenId}:R${normalizeNftRarity(token.rarity || 'common')}`;
}

function shortTokenId(tokenId) {
  const value = String(tokenId || '');
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
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

const MAX_TROOP_LEVEL = 7;

function requiredBarnLevelForTroopLevel(level) {
  const nextLevel = Math.max(1, Math.trunc(Number(level) || 1));
  return nextLevel >= 5 ? 5 : nextLevel;
}

const TROOP_STATS = {
  Knight: {
    display: "Knight",
    stats: {
      1: { hp: 450, damage: 38, atk_speed: 1.4 },
      2: { hp: 600, damage: 50, atk_speed: 1.3 },
      3: { hp: 780, damage: 66, atk_speed: 1.2 },
      4: { hp: 1000, damage: 86, atk_speed: 1.1 },
      5: { hp: 1260, damage: 112, atk_speed: 1.02 },
      6: { hp: 1560, damage: 145, atk_speed: 0.96 },
      7: { hp: 1900, damage: 185, atk_speed: 0.9 },
    },
    maxStats: { hp: 1900, damage: 185, atk_speed: 1.4 }
  },
  Mage: {
    display: "Mage",
    trait: "Burst Mage: high ranged damage with low HP per slot. Uses 4 ship slots.",
    stats: {
      1: { hp: 450, damage: 203, atk_speed: 1.25 },
      2: { hp: 600, damage: 259, atk_speed: 1.12 },
      3: { hp: 795, damage: 364, atk_speed: 1.0 },
      4: { hp: 1035, damage: 483, atk_speed: 0.9 },
      5: { hp: 1320, damage: 637, atk_speed: 0.82 },
      6: { hp: 1665, damage: 833, atk_speed: 0.76 },
      7: { hp: 2070, damage: 1085, atk_speed: 0.7 },
    },
    maxStats: { hp: 2070, damage: 1085, atk_speed: 1.25 }
  },
  Barbarian: {
    display: "Barbarian",
    stats: {
      1: { hp: 240, damage: 24, atk_speed: 0.6 },
      2: { hp: 320, damage: 32, atk_speed: 0.55 },
      3: { hp: 420, damage: 43, atk_speed: 0.5 },
      4: { hp: 550, damage: 57, atk_speed: 0.46 },
      5: { hp: 705, damage: 75, atk_speed: 0.42 },
      6: { hp: 880, damage: 97, atk_speed: 0.39 },
      7: { hp: 1080, damage: 124, atk_speed: 0.36 },
    },
    maxStats: { hp: 1080, damage: 124, atk_speed: 0.6 }
  },
  Archer: {
    display: "Archer",
    stats: {
      1: { hp: 210, damage: 40, atk_speed: 1.05 },
      2: { hp: 280, damage: 51, atk_speed: 0.95 },
      3: { hp: 310, damage: 58, atk_speed: 0.85 },
      4: { hp: 425, damage: 82, atk_speed: 0.78 },
      5: { hp: 540, damage: 108, atk_speed: 0.72 },
      6: { hp: 680, damage: 140, atk_speed: 0.67 },
      7: { hp: 840, damage: 180, atk_speed: 0.62 },
    },
    maxStats: { hp: 840, damage: 180, atk_speed: 1.05 }
  },
  PeaShooter: {
    display: "Pea Shooter",
    trait: "Burst Sprout: fires three green peas per attack cycle. Uses 5 ship slots.",
    stats: {
      1: { hp: 1250, damage: 110, atk_speed: 1.75 },
      2: { hp: 1650, damage: 150, atk_speed: 1.75 },
      3: { hp: 2150, damage: 205, atk_speed: 1.75 },
      4: { hp: 2800, damage: 280, atk_speed: 1.75 },
      5: { hp: 3550, damage: 380, atk_speed: 1.75 },
      6: { hp: 4450, damage: 510, atk_speed: 1.75 },
      7: { hp: 5500, damage: 680, atk_speed: 1.75 },
    },
    maxStats: { hp: 5500, damage: 680, atk_speed: 1.75 }
  },
  Mimic: {
    display: "Barrel",
    trait: "Trap Runner: defenses ignore it while rolling. Traps trigger without damage. Uses 6 ship slots.",
    stats: {
      1: { hp: 1800, damage: 120, atk_speed: 1.5 },
      2: { hp: 2400, damage: 162, atk_speed: 1.42 },
      3: { hp: 3120, damage: 216, atk_speed: 1.34 },
      4: { hp: 4080, damage: 282, atk_speed: 1.27 },
      5: { hp: 5160, damage: 366, atk_speed: 1.2 },
      6: { hp: 6360, damage: 474, atk_speed: 1.13 },
      7: { hp: 7800, damage: 612, atk_speed: 1.06 },
    },
    maxStats: { hp: 7800, damage: 612, atk_speed: 1.5 }
  },
  Necromancer: {
    display: "Necromancer",
    trait: "Grave Caller: ranged green magic and up to 3 renewable skeleton summons. Uses 15 ship slots.",
    stats: {
      1: { hp: 2640, damage: 510, atk_speed: 1.35 },
      2: { hp: 3480, damage: 660, atk_speed: 1.23 },
      3: { hp: 4560, damage: 930, atk_speed: 1.12 },
      4: { hp: 5880, damage: 1230, atk_speed: 1.02 },
      5: { hp: 7440, damage: 1620, atk_speed: 0.94 },
      6: { hp: 9240, damage: 2130, atk_speed: 0.87 },
      7: { hp: 11280, damage: 2790, atk_speed: 0.81 },
    },
    maxStats: { hp: 11280, damage: 2790, atk_speed: 1.35 }
  },
  WindMage: {
    display: "Wind Mage",
    trait: "Wind Corridor: sweeps a wide lane and summons temporary Windlings.",
    stats: {
      1: { hp: 2200, damage: 430, atk_speed: 2.20 },
      2: { hp: 2900, damage: 560, atk_speed: 2.20 },
      3: { hp: 3800, damage: 740, atk_speed: 2.20 },
      4: { hp: 4900, damage: 980, atk_speed: 2.20 },
      5: { hp: 6200, damage: 1280, atk_speed: 2.20 },
      6: { hp: 7700, damage: 1660, atk_speed: 2.20 },
      7: { hp: 9400, damage: 2140, atk_speed: 2.20 },
    },
    maxStats: { hp: 9400, damage: 2140, atk_speed: 2.20 }
  },
  Horror: {
    display: "Horror",
    trait: "Brood Evolution: uses 20 ship slots. On death it splits into 2 Creepers; each Creeper splits into 2 Lurkers.",
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
    trait: "Chain Siege: lightning jumps to 2 nearby buildings for 65% and 42% damage. Heavy flying unit, uses 4 ship slots.",
    stats: {
      1: { hp: 700, damage: 106, atk_speed: 1.03 },
      2: { hp: 920, damage: 150, atk_speed: 1.03 },
      3: { hp: 1200, damage: 218, atk_speed: 1.03 },
      4: { hp: 1550, damage: 310, atk_speed: 1.03 },
      5: { hp: 1970, damage: 449, atk_speed: 1.03 },
      6: { hp: 2450, damage: 629, atk_speed: 1.03 },
      7: { hp: 3000, damage: 876, atk_speed: 1.03 },
    },
    maxStats: { hp: 3000, damage: 876, atk_speed: 1.03 }
  },
  IceGolem: {
    display: "Ice Golem",
    trait: "Frozen Vanguard: attacks defenses first. On death, freezes nearby defenses for 7 seconds. Uses 10 ship slots.",
    stats: {
      1: { hp: 5250, damage: 195, atk_speed: 1.42 },
      2: { hp: 6750, damage: 263, atk_speed: 1.42 },
      3: { hp: 8750, damage: 358, atk_speed: 1.42 },
      4: { hp: 11125, damage: 488, atk_speed: 1.42 },
      5: { hp: 14000, damage: 658, atk_speed: 1.42 },
      6: { hp: 17250, damage: 878, atk_speed: 1.42 },
      7: { hp: 21000, damage: 1155, atk_speed: 1.42 },
    },
    maxStats: { hp: 21000, damage: 1155, atk_speed: 1.42 }
  },
  Ranger: {
    display: "Ranger",
    stats: {
      1: { hp: 250, damage: 34, atk_speed: 1.0 },
      2: { hp: 330, damage: 45, atk_speed: 0.92 },
      3: { hp: 430, damage: 60, atk_speed: 0.83 },
      4: { hp: 560, damage: 80, atk_speed: 0.76 },
      5: { hp: 710, damage: 106, atk_speed: 0.7 },
      6: { hp: 890, damage: 140, atk_speed: 0.65 },
      7: { hp: 1100, damage: 182, atk_speed: 0.6 },
    },
    maxStats: { hp: 1100, damage: 182, atk_speed: 1.0 }
  },
  DemonKing: {
    display: "Demon King",
    trait: "Heavy Boss: premium melee durability and reach. Uses 5 ship slots.",
    stats: {
      1: { hp: 2700, damage: 228, atk_speed: 1.4 },
      2: { hp: 3600, damage: 300, atk_speed: 1.3 },
      3: { hp: 4680, damage: 396, atk_speed: 1.2 },
      4: { hp: 6000, damage: 516, atk_speed: 1.1 },
      5: { hp: 7560, damage: 672, atk_speed: 1.02 },
      6: { hp: 9360, damage: 870, atk_speed: 0.96 },
      7: { hp: 11400, damage: 1110, atk_speed: 0.9 },
    },
    maxStats: { hp: 11400, damage: 1110, atk_speed: 1.4 }
  },
  FireDragon: {
    display: "Dragon",
    trait: "Flying Boss: ranged fire ignores ground traps. Uses 10 ship slots.",
    stats: {
      1: { hp: 1750, damage: 470, atk_speed: 1.25 },
      2: { hp: 2320, damage: 600, atk_speed: 1.12 },
      3: { hp: 3080, damage: 840, atk_speed: 1.0 },
      4: { hp: 4000, damage: 1115, atk_speed: 0.9 },
      5: { hp: 5100, damage: 1470, atk_speed: 0.82 },
      6: { hp: 6440, damage: 1920, atk_speed: 0.76 },
      7: { hp: 8000, damage: 2500, atk_speed: 0.7 },
    },
    maxStats: { hp: 8000, damage: 2500, atk_speed: 1.25 }
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

function rarityMultiplier(rarity) {
  const key = normalizeNftRarity(rarity || 'common');
  return NFT_RARITY_MULTIPLIERS[key] || NFT_RARITY_MULTIPLIERS.common;
}

function computeNftTroopStats(name, level, troopLevels = {}, rarity = 'common') {
  const sharedLevel = troopLevelFromMap(troopLevels, name, level);
  const stats = TROOP_STATS[name]?.stats?.[sharedLevel] || TROOP_STATS[name]?.stats?.[1];
  if (!stats) return TROOP_STATS[name]?.stats?.[clampLevel(level, 1, MAX_TROOP_LEVEL)];
  const mult = rarityMultiplier(rarity) / NFT_RARITY_MULTIPLIERS.common;
  return {
    hp: Math.ceil((Number(stats.hp) || 0) * mult),
    damage: Math.ceil((Number(stats.damage) || 0) * mult),
    atk_speed: Number(stats.atk_speed) || 1,
  };
}

function getTroopStats(name, level, troopLevels = {}, rarity = 'common') {
  if (NFT_REFERENCE_TROOPS.has(name)) return computeNftTroopStats(name, level, troopLevels, rarity);
  return TROOP_STATS[name]?.stats?.[level];
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

const ProgressBar = ({ label, value, max, gradient, showAsTime = false, valueText = null }) => {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <div style={styles.progressRow}>
      <div style={styles.progressHeader}>
        <span style={styles.progressLabel}>{label}</span>
        <span style={styles.progressValue}>{valueText || `${value}${showAsTime ? 's' : ''}`}</span>
      </div>
      <div style={styles.progressBarBg}>
        <div style={{...styles.progressBarFill, background: gradient, width: `${percentage}%`}} />
      </div>
    </div>
  );
};

function BarnPanel({ building, onClose }) {
  const { sendToGodot } = useSend();
  const playerState = usePlayer();
  const { buildingDefs, troopLevels } = useBuildingDefs();
  const { isMobile: mobile } = useLayout();
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
  
  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => (prev === 0 ? troopNames.length - 1 : prev - 1));
  }, [troopNames.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev === troopNames.length - 1 ? 0 : prev + 1));
  }, [troopNames.length]);

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

  const sphereSize = mobile ? 100 : 200;
  const sliderW = mobile ? 32 : 48;
  const sliderH = mobile ? 52 : 72;
  const reqBoxSize = mobile ? 60 : 90;
  const upgradePending = !!pendingUpgrade && pendingUpgrade.troop === currentTroopName && Number(pendingUpgrade.expectedLevel || 0) === Number(displayLvl || 0);
  const handleMainUpgrade = () => {
    if (upgradePending) return;
    if (!troopUnlocked) return;
    if (!townHallReadyForNextLevel) return;
    if (!barnReadyForNextLevel) return;
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
    <div style={{...styles.overlay, ...(mobile ? { alignItems: 'stretch' } : {})}} onClick={onClose}>
      <style>{UPGRADE_ANIM_CSS}</style>

      <div style={{...styles.panel, ...(mobile ? { width: '100vw', maxWidth: '100vw', height: '100%', maxHeight: 'none', borderRadius: 0 } : {})}} onClick={stopPropagation}>

        <div style={styles.header}>
          <span style={{...styles.headerTitle, fontSize: mobile ? 18 : 24}}>{displayName}</span>
          <button style={styles.closeBtn} onClick={onClose}>✖</button>
        </div>

        <div style={{...styles.contentLayout, flexDirection: mobile ? 'column' : 'row', flexWrap: mobile ? 'nowrap' : 'wrap', padding: mobile ? '16px 16px' : '24px 20px', gap: mobile ? 16 : 24, overflowY: 'auto', minHeight: 0}}>

          {/* Character + Sliders — on mobile show FIRST (above stats) */}
          <div style={{...styles.rightColumn, ...(mobile ? { maxWidth: '100%', width: '100%', flex: 'none', order: -1 } : {})}}>
            <div style={styles.characterDisplayArea}>
              <button style={{...styles.sliderBtn, width: sliderW, height: sliderH, fontSize: mobile ? 24 : 32}} onClick={handlePrev}>❮</button>

              <div style={styles.characterWrapper}>
                <div style={{...styles.characterSphere, width: sphereSize, height: sphereSize}}>
                  <div style={{...styles.upgradeBadge, ...(mobile ? { padding: '2px 10px', top: -6, right: -14 } : {})}}>
                    <div style={styles.badgeBigPart}>
                      <span style={{...styles.badgeLvlText, fontSize: mobile ? 10 : 14}}>Lvl</span>
                      <span style={{...styles.badgeLvlNumber, fontSize: mobile ? 18 : 32}}>{displayLvl}</span>
                    </div>
                  </div>
                  {isAnimatingUpgrade && (
                    <div className="upgrade-anim-glow" style={{ position: 'absolute', width: sphereSize * 2, height: sphereSize * 2, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251, 192, 45, 0.6) 0%, transparent 70%)', zIndex: 4, pointerEvents: 'none' }} />
                  )}
                  {isAnimatingUpgrade && (
                    <div className="upgrade-anim-text" style={{ position: 'absolute', top: '20%', color: '#FBC02D', fontSize: mobile ? 36 : 56, fontWeight: 900, textShadow: '0 4px 20px rgba(251, 192, 45, 0.8), 0 4px 4px #000', zIndex: 20, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                      LEVEL UP!
                    </div>
                  )}
                  {isNftBackedTroop ? (
                    <img
                      src={currentNftTroop.image}
                      alt={currentNftTroop.label}
                      className={isAnimatingUpgrade ? 'upgrade-anim-char' : ''}
                      style={{
                        ...styles.characterImg,
                        transform: `translateY(${CARD_TROOP_STYLE_MAP[currentTroopName]?.offsetY || '10%'}) scale(${CARD_TROOP_STYLE_MAP[currentTroopName]?.scale || 1.35})`,
                      }}
                    />
                  ) : troopNames.map(name => {
                    const isActive = name === currentTroopName;
                    if (!UNIT_IMAGES[name]) {
                      if (!isActive) return null;
                      return (
                        <div
                          key={name}
                          className={isAnimatingUpgrade ? 'upgrade-anim-char' : ''}
                          style={{...styles.characterFallback, opacity: 1}}
                          aria-label="Wind Mage portrait pending"
                        >
                          <span style={{fontSize: mobile ? 24 : 44}}>WM</span>
                          <small style={{fontSize: mobile ? 7 : 10}}>WIND MAGE</small>
                        </div>
                      );
                    }
                    const charStyle = CARD_TROOP_STYLE_MAP[name] || { scale: 1.8, offsetY: '5%' };
                    return (
                      <img
                        key={name} src={UNIT_IMAGES[name]} alt={name} className={isActive && isAnimatingUpgrade ? "upgrade-anim-char" : ""}
                        style={{ ...styles.characterImg, transform: `translateY(${charStyle.offsetY}) scale(${charStyle.scale})`, opacity: isActive ? 1 : 0, pointerEvents: isActive ? 'auto' : 'none' }}
                      />
                    );
                  })}
                </div>
              </div>

              <button style={{...styles.sliderBtn, width: sliderW, height: sliderH, fontSize: mobile ? 24 : 32}} onClick={handleNext}>❯</button>
            </div>
          </div>

          {/* Stats & Resources */}
          <div style={{...styles.leftColumn, ...(mobile ? { maxWidth: '100%', width: '100%', flex: '1 1 100%' } : {})}}>
            <h3 style={{...styles.sectionTitle, fontSize: mobile ? 16 : 20}}>Stats</h3>
            {stats && maxStats && (
              <div style={styles.progressContainer}>
                <ProgressBar label="Health Points" value={stats.hp} max={maxStats.hp} gradient="linear-gradient(90deg, #f59e0b, #fbbf24)" />
                <ProgressBar label="Damage Output" value={stats.damage} max={maxStats.damage} gradient="linear-gradient(90deg, #10b981, #34d399)" />
                <ProgressBar label="Attack Speed" value={stats.atk_speed} max={maxStats.atk_speed} showAsTime={true} gradient="linear-gradient(90deg, #6366f1, #818cf8)" />
                <ProgressBar label="Level Progress" value={displayLvl} max={troopMaxLevel} gradient="linear-gradient(90deg, #8b5cf6, #a78bfa)" />
              </div>
            )}
            {TROOP_STATS[currentTroopName]?.trait && (
              <div style={{
                marginTop: mobile ? 8 : 10,
                padding: mobile ? '8px 10px' : '10px 12px',
                border: '1px solid #c9a95f',
                borderRadius: 6,
                background: '#fff5cf',
                color: '#68431f',
                fontSize: mobile ? 11 : 12,
                fontWeight: 800,
                lineHeight: 1.35,
              }}>
                {TROOP_STATS[currentTroopName].trait}
              </div>
            )}
            {troopLogistics && (
              <div style={{
                marginTop: 6,
                display: 'flex',
                flexWrap: 'wrap',
                gap: mobile ? 5 : 7,
                color: '#1f5968',
                fontSize: mobile ? 10 : 11,
                fontWeight: 900,
              }}>
                <span style={styles.logisticsChip}>TH{troopLogistics.townHallLevel}</span>
                <span style={styles.logisticsChip}>{troopLogistics.slotCost} ship slots</span>
                <span style={styles.logisticsChip}>{troopLogistics.loadCostGold.toLocaleString()} gold to load</span>
              </div>
            )}

            {isNftBackedTroop && (
              <div style={styles.demonInventory}>
                <div style={styles.demonInventoryHeader}>
                  <span>{hasDemonKingWallet ? `${demonKingNfts.length} NFT${demonKingNfts.length === 1 ? '' : 's'} owned` : 'Connect wallet'}</span>
                  {demonKingLoading && <span>Loading...</span>}
                </div>
                {demonKingError && <div style={styles.demonInventoryHint}>{demonKingError}</div>}
                {hasDemonKingWallet && demonKingNfts.length > 0 ? (
                  <div style={styles.demonTokenGrid}>
                    {demonKingNfts.map((token) => {
                      const key = nftBackedShipEntry(currentTroopName, token);
                      const active = key === (selectedDemonKey || nftBackedShipEntry(currentTroopName, selectedDemonNft));
                      const tokenLabel = demonKingDisplayLabel(token, demonKingNfts);
                      const rarityCardStyle = isRarityNftTroop
                        ? nftRarityCardStyle(token.rarity, 1, { active })
                        : {};
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedDemonKey(key)}
                          style={{...styles.demonTokenBtn, ...(active ? styles.demonTokenBtnActive : null), ...rarityCardStyle}}
                        >
                          <span style={isRarityNftTroop ? nftRarityBadgeStyle(token.rarity, 1, { compact: true }) : null}>
                            {isRarityNftTroop ? nftRarityLabel(token.rarity, 1) : 'NFT'}
                          </span>
                          <span>{tokenLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={styles.demonInventoryHint}>
                    {hasDemonKingWallet ? `${currentNftTroop.label} unlocks when a connected wallet owns at least one NFT.` : `Open the NFT shop to connect and load your ${currentNftTroop.label} NFTs.`}
                  </div>
                )}
              </div>
            )}

            <h3 style={{...styles.sectionTitle, marginTop: mobile ? 10 : 16, fontSize: mobile ? 16 : 20}}>Upgrade Resources</h3>
            {!troopUnlocked && (
              <div style={styles.demonInventoryHint}>
                Town Hall Lv {requiredTownHallLevel} unlocks {displayName}.
              </div>
            )}
            {troopUnlocked && !townHallReadyForNextLevel && nextTroopLevel && (
              <div style={styles.demonInventoryHint}>
                Town Hall Lv {nextTroopLevel} unlocks troop Lv {nextTroopLevel}.
              </div>
            )}
            {!barnReadyForNextLevel && (
              <div style={styles.demonInventoryHint}>
                Barn Lv {requiredBarnLevel} unlocks troop Lv {nextTroopLevel}. Upgrade the Barn first.
              </div>
            )}
            <div style={{...styles.reqGrid, ...(mobile ? { flexWrap: 'nowrap', justifyContent: 'center', gap: 8 } : {})}}>
              {nextCost ? Object.entries(nextCost).map(([res, amt]) => {
                if (amt === 0) return null;
                return (
                  <div key={res} style={{...styles.reqBox, width: reqBoxSize, height: reqBoxSize}}>
                    <img src={RES_ICONS[res] || goldIcon} style={{...styles.reqIconImg, width: mobile ? 34 : 44, height: mobile ? 34 : 44}} alt={res} />
                    <span style={{...styles.reqAmt, fontSize: mobile ? 13 : 16}}>{amt}</span>
                  </div>
                );
              }) : (
                <div style={styles.reqBoxMax}>
                  <span style={{color: '#94a3b8', fontSize: 13, fontStyle: 'italic'}}>No Requirements</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Upgrade button — fixed at bottom, outside scroll area */}
        {!isMax && !building.is_enemy && (
          <div style={{ padding: mobile ? '8px 12px 12px' : '12px 20px 16px', display: 'flex', justifyContent: 'center' }}>
            <button
              style={{
                ...styles.actionBtn,
                ...(!troopUnlocked || !townHallReadyForNextLevel || !barnReadyForNextLevel || upgradePending ? styles.actionBtnDisabled : null),
                width: '100%',
                maxWidth: mobile ? '100%' : 240,
                padding: mobile ? '12px 16px' : '14px 20px',
                fontSize: mobile ? 14 : 14,
              }}
              disabled={!troopUnlocked || !townHallReadyForNextLevel || !barnReadyForNextLevel || upgradePending}
              onClick={handleMainUpgrade}
            >
              {upgradePending
                ? 'Upgrading...'
                : !troopUnlocked
                ? `Town Hall Lv ${requiredTownHallLevel} required`
                : !townHallReadyForNextLevel
                ? `Upgrade Town Hall to Lv ${nextTroopLevel}`
                : !barnReadyForNextLevel
                ? `Upgrade Barn to Lv ${requiredBarnLevel}`
                : isNftBackedTroop
                ? (selectedDemonNft ? `Upgrade ${currentNftTroop.label} to Lv` : `Get ${currentNftTroop.label} NFT`)
                : 'Upgrade to Lv'} {upgradePending || !townHallReadyForNextLevel || !barnReadyForNextLevel || (isNftBackedTroop && !selectedDemonNft) ? '' : nextTroopLevel}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default memo(BarnPanel);

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 20, pointerEvents: 'all',
  },
  panel: {
    width: 680, maxWidth: '96vw', maxHeight: '90vh',
    background: '#ebdaba',
    border: '4px solid #377d9f',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 0 0 4px #ebdaba',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
    position: 'relative', cursor: 'default',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    height: 54, background: '#4ca5d2',
    borderBottom: '4px solid #377d9f',
    width: '100%',
  },
  headerTitle: { 
    fontSize: 24, fontStyle: 'italic', fontWeight: 900, color: '#fff', 
    textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.6)', margin: 0,
  },
  closeBtn: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    width: 32, height: 32, background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: 4,
    color: '#1a3c4f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    fontSize: 20, fontWeight: 'bold'
  },
  contentLayout: {
    display: 'flex', width: '100%',
    padding: '24px 20px', justifyContent: 'center', alignItems: 'flex-start',
    flex: 1, overflowY: 'auto', overflowX: 'hidden', gap: 24, flexWrap: 'wrap',
  },
  leftColumn: {
    flex: '1 1 200px', maxWidth: 300,
    display: 'flex', flexDirection: 'column', gap: 16,
    position: 'relative', zIndex: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: '#377d9f',
    marginBottom: 0,
  },
  progressContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  progressRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: '#7692a1',
    textTransform: 'uppercase',
  },
  progressValue: {
    fontSize: 14,
    fontWeight: 900,
    color: '#1a3c4f',
  },
  progressBarBg: {
    height: 8,
    background: 'rgba(0,0,0,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.4s ease-out',
  },
  characterDisplayArea: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    gap: 8,
  },
  sliderBtn: {
    background: 'rgba(0,0,0,0.1)',
    border: 'none',
    borderRadius: 12,
    color: '#1a3c4f',
    fontSize: 32,
    fontWeight: 900,
    width: 48,
    height: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    zIndex: 30,
    flexShrink: 0,
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
    border: '2px solid rgba(0,0,0,0.1)'
  },
  characterImg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    zIndex: 5,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.4))',
    transformOrigin: 'bottom center',
    transition: 'opacity 0.35s ease-in-out',
  },
  characterFallback: {
    position: 'absolute',
    inset: '13%',
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    color: '#2d6f7d',
    background: 'rgba(119, 218, 205, 0.22)',
    border: '1px solid rgba(45, 111, 125, 0.4)',
    borderRadius: '50%',
    fontWeight: 900,
    lineHeight: 1,
    pointerEvents: 'none',
  },
  logisticsChip: {
    padding: '4px 7px',
    border: '1px solid rgba(45, 111, 125, 0.32)',
    borderRadius: 5,
    background: 'rgba(222, 248, 241, 0.72)',
    whiteSpace: 'nowrap',
  },
  demonInventory: {
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(92,58,33,0.18)',
    borderRadius: 8,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  demonInventoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    color: '#5C3A21',
    fontSize: 12,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  demonInventoryHint: {
    color: '#7c633e',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  demonTokenGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 6,
  },
  demonTokenBtn: {
    border: '2px solid rgba(92,58,33,0.25)',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.28)',
    color: '#5C3A21',
    cursor: 'pointer',
    fontWeight: 900,
    padding: '7px 8px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 6,
    fontSize: 12,
  },
  demonTokenBtnActive: {
    background: 'linear-gradient(180deg, #ffe27a 0%, #f59e0b 100%)',
    // Full `border` shorthand — base demonTokenBtn uses `border: '2px
    // solid ...'`, so overriding only borderColor here mixes shorthand
    // + longhand and makes React warn when the selection toggles.
    border: '2px solid #8a4b00',
    color: '#3d250f',
  },
  upgradeBadge: {
    position: 'absolute',
    top: -10,
    right: -20,
    background: 'linear-gradient(135deg, #FBC02D 0%, #F57F17 100%)',
    borderRadius: 24,
    padding: '4px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 8px 16px rgba(245, 127, 23, 0.4), inset 0 2px 0 rgba(255,255,255,0.3)',
    zIndex: 10,
  },
  badgeTopText: {
    fontSize: 10,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    marginTop: 4,
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
    flex: '1 1 280px', maxWidth: 340,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    position: 'relative', zIndex: 10,
  },
  reqGrid: {
    display: 'flex',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  reqBox: {
    background: 'rgba(0, 0, 0, 0.05)',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    borderRadius: 20,
    width: 90,
    height: 90,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
    transition: 'transform 0.2s, background 0.2s',
  },
  reqBoxMax: {
    gridColumn: '1 / -1',
    display: 'flex',
    justifyContent: 'flex-start',
    padding: '10px 0',
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
  actionBtnDisabled: {
    background: 'linear-gradient(180deg, #a8a29e 0%, #78716c 100%)',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.25)',
    cursor: 'not-allowed',
    opacity: 0.86,
  }
};
