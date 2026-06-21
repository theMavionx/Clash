import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useSend, useBuildingDefs, usePlayer } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useOptionalPrivy } from './PrivyAuthProvider';
import { nftRarityBadgeStyle, nftRarityCardStyle, nftRarityLabel, normalizeNftRarity, resolveDemonKingPlayerInventorySyncTarget, syncDemonKingNfts } from '../lib/nftV3Client';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import arbaletImg from '../assets/units/arbalet.png';
import archerImg from '../assets/units/archer.png';
import berserkImg from '../assets/units/berserk.png';
import demonKingImg from '../assets/units/demonking.png';

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
  Ranger: arbaletImg,
  Barbarian: berserkImg,
  DemonKing: demonKingImg,
  FireDragon: dragonImg,
};

const CARD_TROOP_STYLE_MAP = {
  Knight: { scale: 1.8, offsetY: '35%' },
  Mage: { scale: 1.85, offsetY: '45%' },
  Barbarian: { scale: 1.25, offsetY: '15%' },
  Archer: { scale: 1.25, offsetY: '15%' },
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
    stats: {
      1: { hp: 150, damage: 58, atk_speed: 1.25 },
      2: { hp: 200, damage: 74, atk_speed: 1.12 },
      3: { hp: 265, damage: 104, atk_speed: 1.0 },
      4: { hp: 345, damage: 138, atk_speed: 0.9 },
      5: { hp: 440, damage: 182, atk_speed: 0.82 },
      6: { hp: 555, damage: 238, atk_speed: 0.76 },
      7: { hp: 690, damage: 310, atk_speed: 0.7 },
    },
    maxStats: { hp: 690, damage: 310, atk_speed: 1.25 }
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
    stats: {
      1: { hp: 1080, damage: 92, atk_speed: 1.4 },
      2: { hp: 1440, damage: 120, atk_speed: 1.3 },
      3: { hp: 1872, damage: 159, atk_speed: 1.2 },
      4: { hp: 2400, damage: 207, atk_speed: 1.1 },
      5: { hp: 3024, damage: 269, atk_speed: 1.02 },
      6: { hp: 3744, damage: 348, atk_speed: 0.96 },
      7: { hp: 4560, damage: 444, atk_speed: 0.9 },
    },
    maxStats: { hp: 4560, damage: 444, atk_speed: 1.4 }
  },
  FireDragon: {
    display: "Dragon",
    stats: {
      1: { hp: 360, damage: 140, atk_speed: 1.25 },
      2: { hp: 480, damage: 178, atk_speed: 1.12 },
      3: { hp: 636, damage: 250, atk_speed: 1.0 },
      4: { hp: 828, damage: 332, atk_speed: 0.9 },
      5: { hp: 1056, damage: 437, atk_speed: 0.82 },
      6: { hp: 1332, damage: 572, atk_speed: 0.76 },
      7: { hp: 1656, damage: 744, atk_speed: 0.7 },
    },
    maxStats: { hp: 1656, damage: 744, atk_speed: 1.25 }
  }
};

const ACTIVE_TROOP_NAMES = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger', 'DemonKing', 'FireDragon'];
const NFT_TROOP_SLOT_COUNT = 2;
const NFT_RARITY_MULTIPLIERS = {
  common: 1.2,
  epic: 1.3,
  legendary: 1.5,
  unrevealed: 1.2,
};
const NFT_REFERENCE_TROOPS = {
  DemonKing: 'Knight',
  FireDragon: 'Mage',
};
const TROOP_LEVEL_KEYS = {
  Knight: ['Knight', 'knight'],
  Mage: ['Mage', 'mage'],
  Barbarian: ['Barbarian', 'barbarian'],
  Archer: ['Archer', 'archer'],
  Ranger: ['Ranger', 'ranger'],
  DemonKing: ['DemonKing', 'demon_king', 'demonking'],
  FireDragon: ['FireDragon', 'fire_dragon', 'firedragon'],
};

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
    image: dragonImg,
  },
};

function nftBackedTroopConfig(name) {
  return NFT_BACKED_TROOPS[name] || null;
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
  const referenceName = NFT_REFERENCE_TROOPS[name];
  const sharedLevel = troopLevelFromMap(troopLevels, name, level);
  const stats = TROOP_STATS[referenceName]?.stats?.[sharedLevel] || TROOP_STATS[referenceName]?.stats?.[1];
  if (!stats) return TROOP_STATS[name]?.stats?.[clampLevel(level, 1, MAX_TROOP_LEVEL)];
  const mult = rarityMultiplier(rarity);
  return {
    hp: Math.ceil((Number(stats.hp) || 0) * NFT_TROOP_SLOT_COUNT * mult),
    damage: Math.ceil((Number(stats.damage) || 0) * NFT_TROOP_SLOT_COUNT * mult),
    atk_speed: Number(stats.atk_speed) || 1,
  };
}

function getTroopStats(name, level, troopLevels = {}, rarity = 'common') {
  if (NFT_REFERENCE_TROOPS[name]) return computeNftTroopStats(name, level, troopLevels, rarity);
  return TROOP_STATS[name]?.stats?.[level];
}

function getTroopMaxStats(name, troopLevels = {}, rarity = 'common') {
  const maxLevel = Math.max(
    1,
    ...Object.keys(TROOP_STATS[name]?.stats || {})
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value)),
  );
  if (NFT_REFERENCE_TROOPS[name]) {
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
    player: playerState,
    evmAddress,
    solAddress,
    aptosAddress,
  }), [aptosAddress, evmAddress, playerState, solAddress]);
  const hasDemonKingWallet = !!demonKingSyncTarget;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimatingUpgrade, setIsAnimatingUpgrade] = useState(false);
  const [demonKingNfts, setDemonKingNfts] = useState([]);
  const [selectedDemonKey, setSelectedDemonKey] = useState('');
  const [demonKingStatus, setDemonKingStatus] = useState(null);
  const [demonKingLoading, setDemonKingLoading] = useState(false);
  const [demonKingError, setDemonKingError] = useState(null);
  const troops = buildingDefs?.troops || {};
  const troopNames = ACTIVE_TROOP_NAMES.filter((name) => troops[name]);
  const safeIndex = troopNames.length ? Math.min(currentIndex, troopNames.length - 1) : 0;
  const currentTroopName = troopNames[safeIndex];
  const currentNftTroop = nftBackedTroopConfig(currentTroopName);
  const tdef = currentTroopName ? troops[currentTroopName] : null;
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
      ? syncDemonKingNfts({
          ...demonKingSyncTarget,
          collection: currentNftTroop.collection,
          signal: controller.signal,
        }).catch((err) => ({ error: err, tokens: [] }))
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

  const handleUpgradeTroop = useCallback((name) => sendToGodot('upgrade_troop', { troop_name: name }), [sendToGodot]);
  
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
  const troopMaxLevel = Math.max(1, Number(tdef?.max_level) || maxLevelFromCosts);
  const isNftBackedTroop = !!currentNftTroop;
  const isDemonKingNftTroop = currentNftTroop?.collection === 'demonking' || currentNftTroop?.collection === 'demon_king';
  const isRarityNftTroop = isDemonKingNftTroop || currentNftTroop?.collection === 'dragon';
  const selectedDemonNft = isNftBackedTroop
    ? demonKingNfts.find((token) => nftBackedShipEntry(currentTroopName, token) === selectedDemonKey) || demonKingNfts[0] || null
    : null;
  const selectedNftRarity = normalizeNftRarity(selectedDemonNft?.rarity || 'common');
  const displayLvl = lvl;
  const isMax = displayLvl >= troopMaxLevel;
  // costs key = current level (cost to upgrade FROM that level)
  const nextCost = !isMax && tdef?.costs?.[String(displayLvl)];
  const stats = getTroopStats(currentTroopName, displayLvl, troopLevels, selectedNftRarity);
  const maxStats = getTroopMaxStats(currentTroopName, troopLevels, selectedNftRarity);
  const displayName = TROOP_STATS[currentTroopName]?.display || tdef?.display || currentTroopName;
  const hasImage = !!UNIT_IMAGES[currentTroopName];

  const sphereSize = mobile ? 100 : 200;
  const sliderW = mobile ? 32 : 48;
  const sliderH = mobile ? 52 : 72;
  const reqBoxSize = mobile ? 60 : 90;
  const handleMainUpgrade = () => {
    if (!isNftBackedTroop) {
      handleUpgradeTroop(currentTroopName);
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
    handleUpgradeTroop(currentTroopName);
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
                    if (!UNIT_IMAGES[name]) return null;
                    const isActive = name === currentTroopName;
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
            <button style={{...styles.actionBtn, width: '100%', maxWidth: mobile ? '100%' : 240, padding: mobile ? '12px 16px' : '14px 20px', fontSize: mobile ? 14 : 14}} onClick={handleMainUpgrade}>
              {isNftBackedTroop
                ? (selectedDemonNft ? `Upgrade ${currentNftTroop.label} to Lv` : `Get ${currentNftTroop.label} NFT`)
                : 'Upgrade to Lv'} {isNftBackedTroop && !selectedDemonNft ? '' : displayLvl + 1}
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
  }
};
