import { memo, useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { usePlayer, useResources, useSend, useSelectedBuilding } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useOptionalPrivy } from './PrivyAuthProvider';
import { nftLevelImageUrl, resolveDemonKingInventorySyncTarget, syncDemonKingNfts } from '../lib/nftV3Client';

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
import imgMageTower from '../assets/buildings/magetower.png';
import imgAltar from '../assets/units/altar.png';

import knightImg from '../assets/units/knight.png';
import mageImg from '../assets/units/mage.png';
import arbaletImg from '../assets/units/arbalet.png';
import archerImg from '../assets/units/archer.png';
import berserkImg from '../assets/units/berserk.png';
import demonKingImg from '../assets/units/demonking.png';

const ICONS = { gold: goldIcon, wood: woodIcon, ore: stoneIcon };
const DEMON_KING_PORT_FORCE_SYNC_MS = 60_000;

const UNIT_IMAGES = {
  Knight: knightImg,
  Mage: mageImg,
  Archer: archerImg,
  Ranger: arbaletImg,
  Barbarian: berserkImg,
  DemonKing: demonKingImg,
};

const TROOP_STYLE_MAP = {
  Knight: { scale: 2.2, offsetY: '35%' },
  Mage: { scale: 2.5, offsetY: '50%' },
  Barbarian: { scale: 1.9, offsetY: '25%' },
  Archer: { scale: 1.9, offsetY: '25%' },
  Ranger: { scale: 1.9, offsetY: '25%' },
  DemonKing: { scale: 1.3, offsetY: '10%' },
};

const CARD_TROOP_STYLE_MAP = {
  Knight: { scale: 1.35, offsetY: '0%' },
  Mage: { scale: 1.45, offsetY: '0%' },
  Barbarian: { scale: 1.05, offsetY: '0%' },
  Archer: { scale: 1.05, offsetY: '0%' },
  Ranger: { scale: 1.05, offsetY: '0%' },
  // Demon King renders with the same full-bleed `troopImg` treatment as
  // the other troops (cover + top-center) — bumped a touch larger so the
  // boss portrait reads as the centerpiece it is.
  DemonKing: { scale: 1.3, offsetY: '0%' },
};

const TROOP_COST = 100; // gold per unit
const SLOT_FILLER = '_SLOT_FILLER_';

const THUMBNAIL_MAP = {
  mine: imgMine,
  barn: imgBarn,
  port: imgPort,
  sawmill: imgSawmill,
  town_hall: imgTownHall,
  turret: imgTurret,
  tombstone: imgTombstone,
  archtower: imgArcherTower,
  archer_tower: imgArcherTower,
  archertower: imgArcherTower,
  mage_tower: imgMageTower,
  storage: imgStorage,
  altar: imgAltar,
};

const DESC_MAP = {
  mine: 'Mines produce ore over time.',
  sawmill: 'Sawmills produce wood over time.',
  barn: 'Trains troops.',
  port: 'Deploy ships to attack.',
  town_hall: 'The heart of your village.',
  turret: 'Targets ground enemies.',
  tombstone: 'Spawns skeletons to defend.',
  archtower: 'Ranged defense against invaders.',
  archer_tower: 'Ranged defense against invaders.',
  archertower: 'Ranged defense against invaders.',
  mage_tower: 'Casts splash magic at groups of enemy troops.',
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
      { wood: 80000, ore: 80000, gold: 20000 },
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
      { wood: 120000, ore: 60000, gold: 20000 },
    ],
  },
  glory: {
    label: 'Glory',
    title: 'Cup Offering',
    bonus: 'bonus trophies on attack win',
    bonusType: 'range',
    minValue: 1,
    values: [5, 7, 10],
    costs: [
      { wood: 12000, ore: 12000, gold: 3000 },
      { wood: 36000, ore: 36000, gold: 9000 },
      { wood: 90000, ore: 90000, gold: 24000 },
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
  return `+${max}% ${skill.bonus}`;
}

function troopBaseName(name) {
  const base = String(name || '').split(':')[0];
  const lower = base.toLowerCase();
  if (lower === 'demonking' || lower === 'demon_king') return 'DemonKing';
  if (lower === 'knight') return 'Knight';
  if (lower === 'mage') return 'Mage';
  if (lower === 'barbarian') return 'Barbarian';
  if (lower === 'archer') return 'Archer';
  if (lower === 'ranger') return 'Ranger';
  return base;
}

function troopSlotCost(name) {
  return troopBaseName(name) === 'DemonKing' ? 2 : 1;
}

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
    return !(replacementBase === 'DemonKing' && troopBaseName(list[span.start]) === 'DemonKing');
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
  if (!token) return 'DemonKing';
  return `DemonKing:${token.chain}:${token.tokenId}:L${Number(token.level || 1)}`;
}

function demonKingTokenKey(token) {
  if (!token) return '';
  return `${String(token.chain || '').toLowerCase()}:${String(token.tokenId || token.id || '')}`;
}

function demonKingEntryTokenKey(entry) {
  const parts = String(entry || '').split(':');
  if (parts[0] !== 'DemonKing' || parts.length < 3) return '';
  return `${String(parts[1] || '').toLowerCase()}:${String(parts[2] || '')}`;
}

function demonKingEntryTokenId(entry) {
  const parts = String(entry || '').split(':');
  if (parts[0] !== 'DemonKing' || parts.length < 3) return '';
  return String(parts[2] || '');
}

function shortTokenId(tokenId) {
  const value = String(tokenId || '');
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isEvmDemonKingChain(chain) {
  return ['base', 'arbitrum', 'monad'].includes(String(chain || '').toLowerCase());
}

function isEvmWalletAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

function isSolanaWalletAddress(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || '').trim());
}

function isAptosWalletAddress(value) {
  const text = String(value || '').trim();
  return /^0x[0-9a-fA-F]{1,64}$/.test(text) && !isEvmWalletAddress(text);
}

function linkedDemonKingWalletHints(playerState) {
  const hints = { evmAddress: null, solAddress: null, aptosAddress: null };
  const candidates = [
    playerState?.wallet,
    playerState?.nft_gold_boost_wallet,
  ];
  for (const raw of candidates) {
    const wallet = String(raw || '').trim();
    if (!wallet) continue;
    if (!hints.evmAddress && isEvmWalletAddress(wallet)) hints.evmAddress = wallet;
    else if (!hints.solAddress && isSolanaWalletAddress(wallet)) hints.solAddress = wallet;
    else if (!hints.aptosAddress && isAptosWalletAddress(wallet)) hints.aptosAddress = wallet;
  }
  return hints;
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
  const uriMatch = text.match(/\/api\/nft\/(?:base|arbitrum|monad|aptos|solana)\/(?:token2022\/)?(\d{1,10})(?:[/?#]|$)/i);
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
  const key = demonKingEntryTokenKey(entry);
  const token = tokens.find((item) => demonKingTokenKey(item) === key);
  if (token) return demonKingDisplayIdFromToken(token, tokens);
  const parts = String(entry || '').split(':');
  const chain = String(parts[1] || '').toLowerCase();
  const tokenId = demonKingEntryTokenId(entry);
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

function BuildingInfoPanel({ onOpenTroops }) {
  const { sendToGodot } = useSend();
  const { selectedBuilding: building } = useSelectedBuilding();
  const player = usePlayer();
  const resources = useResources();
  const { isMobile } = useLayout();
  const evmWallet = useEvmWallet();
  const linkedDemonKingWallets = useMemo(() => linkedDemonKingWalletHints(player), [
    player?.wallet,
    player?.nft_gold_boost_wallet,
  ]);
  const evmAddress = evmWallet?.address || linkedDemonKingWallets.evmAddress || null;
  const solWallet = useSolWallet();
  const optionalPrivy = useOptionalPrivy();
  const solAddress = solWallet?.publicKey?.toBase58?.()
    || (optionalPrivy.solanaWallets || []).find((wallet) => wallet?.address)?.address
    || linkedDemonKingWallets.solAddress
    || null;
  const aptosWallet = useAptosWallet();
  const aptosAddress = aptosWallet?.address || linkedDemonKingWallets.aptosAddress || null;
  const demonKingSyncTarget = useMemo(() => resolveDemonKingInventorySyncTarget({
    evmAddress,
    solAddress,
    aptosAddress,
  }), [aptosAddress, evmAddress, solAddress]);
  const hasDemonKingWallet = !!demonKingSyncTarget;
  
  const [view, setView] = useState('ACTIONS');
  const [swapSlot, setSwapSlot] = useState(null);
  const [localTroops, setLocalTroops] = useState(null);
  const [demonKingNfts, setDemonKingNfts] = useState([]);
  const [demonKingNftLoading, setDemonKingNftLoading] = useState(false);
  const [demonKingNftError, setDemonKingNftError] = useState(null);
  const [altarTab, setAltarTab] = useState('prosperity');
  const [altarLevels, setAltarLevels] = useState({ prosperity: 0, ward: 0, glory: 0 });
  const [altarBusy, setAltarBusy] = useState(false);
  const [altarError, setAltarError] = useState('');
  const demonKingPortForceSyncRef = useRef(new Map());

  useEffect(() => {
    if (building?.open_load_troops) {
      setView('LOAD_TROOPS');
    } else {
      setView('ACTIONS');
    }
  }, [building?.id, building?.open_load_troops]);

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
  }, [serverTroopsKey]);

  useEffect(() => {
    if (view !== 'LOAD_TROOPS' || !hasDemonKingWallet) {
      if (!hasDemonKingWallet) setDemonKingNfts([]);
      return undefined;
    }
    const applyOwnedDemonKingTokens = (ownedJson) => {
      const tokens = [];
      (ownedJson?.tokens || []).forEach((token) => {
        tokens.push({
          ...token,
          chain: token.chain || 'base',
          tokenId: String(token.tokenId || token.id || ''),
          level: Number(token.level || 1),
          imageUrl: token.imageUrl || nftLevelImageUrl(token.level || 1, token.tokenId || token.id || ''),
        });
      });
      tokens.sort((a, b) => (
        (b.level || 1) - (a.level || 1)
        || String(a.chain).localeCompare(String(b.chain))
        || String(a.tokenId).localeCompare(String(b.tokenId), undefined, { numeric: true })
      ));
      setDemonKingNfts(tokens.filter((token) => token.tokenId));
    };
    const syncWalletKey = demonKingSyncTarget?.wallets
      ? Object.entries(demonKingSyncTarget.wallets)
        .map(([key, value]) => `${key}:${value}`)
        .join('|')
      : demonKingSyncTarget?.wallet || '';
    const syncKey = `${syncWalletKey}:${(demonKingSyncTarget?.chains || []).join(',')}`;
    const lastForcedAt = demonKingPortForceSyncRef.current.get(syncKey) || 0;
    const shouldForceRefresh = syncKey && Date.now() - lastForcedAt > DEMON_KING_PORT_FORCE_SYNC_MS;
    const controller = new AbortController();
    let appliedCachedResult = false;
    setDemonKingNftLoading(true);
    setDemonKingNftError(null);
    syncDemonKingNfts({
      ...demonKingSyncTarget,
      signal: controller.signal,
    })
      .then(async (ownedJson) => {
        if (controller.signal.aborted) return;
        applyOwnedDemonKingTokens(ownedJson);
        appliedCachedResult = true;
        if (!shouldForceRefresh) return;
        demonKingPortForceSyncRef.current.set(syncKey, Date.now());
        try {
          const freshJson = await syncDemonKingNfts({
            ...demonKingSyncTarget,
            force: true,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) applyOwnedDemonKingTokens(freshJson);
        } catch (err) {
          if (!appliedCachedResult) throw err;
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setDemonKingNftError((err?.message || 'Could not read Demon King NFTs').slice(0, 120));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDemonKingNftLoading(false);
      });
    return () => controller.abort();
  }, [demonKingSyncTarget, hasDemonKingWallet, view]);

  const handleDeselect = useCallback(() => sendToGodot('deselect_building'), [sendToGodot]);
  const handleUpgrade = useCallback(() => {
    sendToGodot('upgrade_building');
    setView('ACTIONS'); // Close after upgrading
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

  if (!building) return null;

  const isMaxLevel = building.level >= building.max_level;
  const upgHealth = Math.floor(building.max_hp * 0.2);

  const renderActions = () => (
    <div style={{ ...styles.actionsWrap, ...isMobile && { bottom: 130, gap: 16 } }}>
      <div style={styles.actionLabel}>
        <span style={styles.actionName}>{building.name}</span>
        <span style={styles.actionLevel}>Level {building.level}</span>
      </div>
      {(building.is_enemy || building.id === 'altar' || (isMaxLevel && building.id !== 'altar')) && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnInfo }}
          onClick={() => setView('INFO')}
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

      {building.id === 'port' && !building.is_enemy && building.has_ship && (
        <button
          style={{ ...styles.circleBtn, ...styles.btnTroops }}
          onClick={() => setView('LOAD_TROOPS')}
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
      style={building.id === 'altar' ? { ...styles.characterImg, ...styles.altarStaticImg } : styles.characterImg}
    />
  ) : (
    <div style={{...styles.characterImg, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 150}}>🏠</div>
  );

  const renderInfo = () => {
    const description = DESC_MAP[building.id];
    const leftContent = (
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

  const renderUpgrade = () => {
    const leftContent = (
      <>
        <StatBox label="Health" current={building.max_hp} upgradeTo={building.max_hp + upgHealth} />
        <StatBox label="Level" current={building.level} upgradeTo={building.level + 1} />
      </>
    );
    const rightContent = <ResourceReqs costObj={building.upgrade_cost} title="Upgrade Cost" />;

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
                          <span style={{ ...styles.altarTreeNodeValue, ...(isMobile ? styles.altarTreeNodeValueMobile : null) }}>{active.bonusType === 'range' ? `+${active.minValue}-${active.values[level - 1]}` : `+${active.values[level - 1]}%`}</span>
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
    const shipCost = building.ship_cost || { gold: 1500, wood: 1000 };
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
    const shipLevel = building.ship_level || 1;
    const shipTroops = localTroops || building.ship_troops || [];
    const capacity = building.ship_capacity || shipLevel * 3;
    const portNumber = Number(building.port_number || 0);
    const troopLvls = building.troop_levels || {};
    const getTroopLvl = (name) => {
      const base = troopBaseName(name);
      return troopLvls[base] || troopLvls[base.toLowerCase()] || troopLvls[name] || troopLvls[String(name || '').toLowerCase()] || 1;
    };
    const allTroops = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger'];
    const selectedSpan = swapSlot !== null ? troopUnitSpanAt(shipTroops, swapSlot) : null;
    const demonKeysFromTroops = (troops, skipSpan = null) => {
      const keys = [];
      (Array.isArray(troops) ? troops : []).forEach((entry, index) => {
        if (skipSpan && index >= skipSpan.start && index < skipSpan.end) return;
        const key = demonKingEntryTokenKey(entry);
        if (key) keys.push(key);
      });
      return keys;
    };
    const currentShipId = building.server_id ?? building.id;
    const fleetShipTroops = Array.isArray(building.fleet_ship_troops) ? building.fleet_ship_troops : [];
    const loadedDemonEntries = new Set([
      ...demonKeysFromTroops(shipTroops, selectedSpan),
      ...fleetShipTroops.flatMap((ship) => {
        const shipId = ship?.server_id ?? ship?.id;
        if (String(shipId) === String(currentShipId)) return [];
        return demonKeysFromTroops(ship?.ship_troops);
      }),
    ]);
    const availableDemonNfts = demonKingNfts.filter((token) => !loadedDemonEntries.has(demonKingTokenKey(token)));
    const demonKingInUseCount = Math.max(0, demonKingNfts.length - availableDemonNfts.length);
    const demonKingUseRatio = demonKingNfts.length ? `${demonKingInUseCount}/${demonKingNfts.length}` : '0/0';
    const demonKingOwnerForEntry = (entry) => {
      const key = demonKingEntryTokenKey(entry);
      const token = demonKingNfts.find((item) => demonKingTokenKey(item) === key);
      if (!token) return evmAddress || solAddress || aptosAddress || undefined;
      return token.wallet
        || (token.chain === 'solana' ? solAddress : token.chain === 'aptos' ? aptosAddress : evmAddress)
        || undefined;
    };
    const openNftShop = () => {
      window.dispatchEvent(new CustomEvent('clash-open-nft-shop', { detail: { view: demonKingNfts.length ? 'upgrade' : 'shop' } }));
    };

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
          sendToGodot('load_troop', { troop_name: name, nft_owner: base === 'DemonKing' ? demonKingOwnerForEntry(name) : undefined });
          setSwapSlot(null);
          return;
        }
        const updated = [...shipTroops];
        updated.splice(placement.start, placement.end - placement.start, ...replacement);
        setLocalTroops(updated);
        sendToGodot('swap_troop', { slot: swapSlot, troop_name: name, nft_owner: base === 'DemonKing' ? demonKingOwnerForEntry(name) : undefined });
        setSwapSlot(null);
      } else {
        const nextTroops = [...shipTroops, ...replacement];
        setLocalTroops(nextTroops);
        sendToGodot('load_troop', { troop_name: name, nft_owner: base === 'DemonKing' ? demonKingOwnerForEntry(name) : undefined });
      }
    };

    const handleRemoveTroop = () => {
      if (swapSlot === null) return;
      const span = troopUnitSpanAt(shipTroops, swapSlot);
      if (!span) return;
      const updated = [...shipTroops];
      updated.splice(span.start, span.end - span.start);
      setLocalTroops(updated);
      sendToGodot('remove_troop', { slot: span.start });
      setSwapSlot(null);
    };

    const canPlaceTroop = (name) => {
      if (swapSlot === null) return shipTroops.length + troopSlotCost(name) <= capacity;
      return !!troopSwapPlacement(shipTroops, swapSlot, name, capacity);
    };

    const handleClose = () => { setSwapSlot(null); setView('ACTIONS'); };

    const slotW = isMobile ? 52 : (capacity > 6 ? 58 : 78);
    const slotH = isMobile ? 66 : (capacity > 6 ? 74 : 100);
    const cardW = isMobile ? 'clamp(84px, 27%, 102px)' : 100;
    const mobileLoadedBarStyle = isMobile ? {
      justifyContent: 'center',
      alignContent: 'center',
    } : null;
    return (
      <div style={{...LT.overlay, ...(isMobile ? { alignItems: 'stretch' } : {})}} onClick={handleClose}>
        <div style={{...LT.panel, ...(isMobile ? { width: '100vw', maxWidth: '100vw', height: '100%', maxHeight: 'none', borderRadius: 0 } : {})}} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{...LT.header, height: isMobile ? 44 : 54}}>
            <span style={{...LT.headerTitle, fontSize: isMobile ? 18 : 24}}>
              {portNumber ? `Choose Troops - P${portNumber}` : 'Choose Troops'}
            </span>
            <button style={LT.closeBtn} onClick={handleClose}>X</button>
          </div>

          {/* Loaded troops slots */}
          <div style={{...LT.loadedBar, padding: isMobile ? '11px 10px' : '12px 16px', flexWrap: 'wrap', gap: isMobile ? 7 : 8, ...(mobileLoadedBarStyle || {})}}>
            {Array.from({ length: capacity }).map((_, i) => {
              const t = shipTroops[i];
              const isSwapping = swapSlot === i;
              if (t) {
                if (t === SLOT_FILLER) {
                  return (
                    <div key={i} style={{...LT.emptySlot, width: slotW, height: slotH, opacity: 0.6}}>
                    <span style={{fontSize: isMobile ? 11 : 12, fontWeight: 900}}>2/2</span>
                    </div>
                  );
                }
                const base = troopBaseName(t);
                const level = getTroopLvl(t);
                const imgSrc = base === 'DemonKing' ? demonKingImg : UNIT_IMAGES[base];
                const demonTokenLabel = base === 'DemonKing'
                  ? demonKingDisplayLabel(demonKingDisplayIdFromEntry(t, demonKingNfts))
                  : '';
                return (
                  <div
                    key={i}
                    style={{ ...LT.loadedSlot, width: slotW, height: slotH, ...(isSwapping ? LT.loadedSlotActive : {}) }}
                    onClick={() => setSwapSlot(isSwapping ? null : i)}
                  >
                    <div style={{ ...LT.troopImgWrap, paddingBottom: 0 }}>
                      {imgSrc && (
                        <div key={`${t}-${i}`} style={{ animation: 'swapFlash 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards', width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
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
                    {demonTokenLabel && (
                      <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), fontSize: isMobile ? 11 : 9}}>
                        {demonTokenLabel}
                      </div>
                    )}
                    {isSwapping && <div style={LT.swapBadge}>SWAP</div>}
                  </div>
                );
              }
              return (
                <div key={`empty-${i}`} style={{...LT.emptySlot, width: slotW, height: slotH}} onClick={() => setSwapSlot(i)}>?</div>
              );
            })}
          </div>

          {swapSlot !== null && (
            <div style={{...LT.swapActionBar, ...(isMobile ? { flexDirection: 'column', gap: 6, padding: '8px 10px' } : {})}}>
              <div style={{...LT.swapHint, fontSize: isMobile ? 12 : 14}}>
                {selectedSpan ? `Slot ${selectedSpan.start + 1} selected` : `Select a troop below for slot ${swapSlot + 1}`}
              </div>
              {selectedSpan && (
                <button type="button" style={LT.removeTroopBtn} onClick={handleRemoveTroop}>
                  REMOVE
                </button>
              )}
            </div>
          )}

          {/* Troop selection grid */}
          <div style={{...LT.grid, padding: isMobile ? '8px 8px' : '14px 18px', gap: isMobile ? 8 : 10, flexDirection: 'column', flexWrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'center'}}>
            <div style={{...LT.normalTroopGrid, gap: isMobile ? 6 : 10}}>
            {allTroops.map(name => {
              const lvl = getTroopLvl(name);
              return (
                <button
                  key={name}
                  style={{...LT.troopCard, width: cardW, flexShrink: isMobile ? 1 : 0}}
                  onClick={() => {
                    if (!canPlaceTroop(name)) {
                      return;
                    } else {
                      handleLoadTroop(name);
                    }
                  }}
                >
                  <div style={{...LT.troopLvlBadge, fontSize: isMobile ? 12 : 16}}>Lvl {lvl}</div>
                  <div style={LT.troopImgWrap}>
                    {UNIT_IMAGES[name] && (
                      <img src={UNIT_IMAGES[name]} alt={name} style={{ ...LT.troopImg, transform: `scale(${CARD_TROOP_STYLE_MAP[name]?.scale || 1}) translateY(${CARD_TROOP_STYLE_MAP[name]?.offsetY || '0%'})` }} />
                    )}
                  </div>
                  <div style={{...LT.bottomOverlay, height: isMobile ? 28 : 34}}>
                    <span style={{...LT.bottomLabel, fontSize: isMobile ? 8 : 10}}>{name.toUpperCase()}</span>
                    <img src={goldIcon} alt="gold" style={LT.costIcon} />
                    <span style={{...LT.costText, fontSize: isMobile ? 11 : 13}}>{TROOP_COST}</span>
                  </div>
                </button>
              );
            })}
            </div>
            <div style={{...LT.demonKingRow, gap: isMobile ? 6 : 10}}>
            {demonKingNftLoading && (
              <button type="button" style={{...LT.troopCard, ...LT.troopCardMuted, width: cardW, flexShrink: isMobile ? 1 : 0}}>
                <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), fontSize: isMobile ? 9 : 11}}>
                  SYNC
                </div>
                <div style={{...LT.troopLvlBadge, fontSize: isMobile ? 12 : 16}}>NFT</div>
                  <div style={LT.troopImgWrap}>
                  <img src={demonKingImg} alt="Demon King" style={{ ...LT.troopImg, ...LT.troopImgMuted, transform: `scale(${CARD_TROOP_STYLE_MAP.DemonKing.scale}) translateY(${CARD_TROOP_STYLE_MAP.DemonKing.offsetY})` }} />
                </div>
                <div style={{...LT.bottomOverlay, height: isMobile ? 30 : 38}}>
                  <span style={{...LT.bottomLabel, fontSize: isMobile ? 7 : 9}}>DEMON KING</span>
                  <span style={{...LT.costText, fontSize: isMobile ? 9 : 11}}>SYNCING</span>
                </div>
              </button>
            )}
            {!demonKingNftLoading && availableDemonNfts.map((token) => {
              const entry = demonKingShipEntry(token);
              const demonTokenLabel = demonKingDisplayLabel(token, demonKingNfts);
              const disabled = swapSlot === null
                ? shipTroops.length + 2 > capacity
                : (() => {
                    return !troopSwapPlacement(shipTroops, swapSlot, entry, capacity);
                  })();
              return (
                <button
                  key={entry}
                  type="button"
                  disabled={disabled}
                  style={{...LT.troopCard, width: cardW, flexShrink: isMobile ? 1 : 0, ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null)}}
                  onClick={() => {
                    if (!disabled) handleLoadTroop(entry);
                  }}
                >
                  <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), fontSize: isMobile ? 9 : 11}}>
                    {demonTokenLabel}
                  </div>
                  <div style={{...LT.demonUseBadge, fontSize: isMobile ? 9 : 10}}>
                    {demonKingUseRatio}
                  </div>
                  <div style={{...LT.troopLvlBadge, fontSize: isMobile ? 12 : 16}}>Lvl {token.level || 1}</div>
                  <div style={LT.troopImgWrap}>
                    <img src={demonKingImg} alt="Demon King" style={{ ...LT.troopImg, transform: `scale(${CARD_TROOP_STYLE_MAP.DemonKing.scale}) translateY(${CARD_TROOP_STYLE_MAP.DemonKing.offsetY})` }} />
                  </div>
                  <div style={{...LT.bottomOverlay, height: isMobile ? 30 : 38}}>
                    <span style={{...LT.bottomLabel, fontSize: isMobile ? 7 : 9}}>KING {demonTokenLabel}</span>
                    <span style={{...LT.costText, fontSize: isMobile ? 10 : 12}}>FREE · 2</span>
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
                <div style={{...LT.demonIdBadge, ...(isMobile ? LT.demonIdBadgeMobile : null), fontSize: isMobile ? 9 : 11}}>
                  {demonKingUseRatio}
                </div>
                <div style={{...LT.troopLvlBadge, fontSize: isMobile ? 12 : 16}}>NFT</div>
                <div style={LT.troopImgWrap}>
                  <img src={demonKingImg} alt="Demon King" style={{ ...LT.troopImg, ...LT.troopImgMuted, transform: `scale(${CARD_TROOP_STYLE_MAP.DemonKing.scale}) translateY(${CARD_TROOP_STYLE_MAP.DemonKing.offsetY})` }} />
                </div>
                <div style={{...LT.bottomOverlay, height: isMobile ? 30 : 38}}>
                  <span style={{...LT.bottomLabel, fontSize: isMobile ? 7 : 9}}>DEMON KING</span>
                  <span style={{...LT.costText, fontSize: isMobile ? 9 : 11}}>
                    {hasDemonKingWallet ? (demonKingNftError || (demonKingNfts.length ? 'ALL USED' : 'NEED NFT')) : 'CONNECT'}
                  </span>
                </div>
              </button>
            )}
            </div>
          </div>
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
    border: '4px solid #84dfff',
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
    overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
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
  emptySlot: {
    width: 70, height: 90, background: 'rgba(0,0,0,0.05)', border: '2px dashed #928d81', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#928d81', fontSize: 24, fontWeight: 900, cursor: 'pointer',
    transition: 'filter 0.1s',
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
  demonIdBadge: {
    position: 'absolute', top: 6, left: 6, zIndex: 12,
    maxWidth: '58%', padding: '3px 5px', borderRadius: 5,
    background: 'rgba(32, 20, 12, 0.78)', color: '#fff4c7',
    border: '1px solid rgba(255, 229, 145, 0.65)',
    fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
    textShadow: '0 1px 2px rgba(0,0,0,0.9)',
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
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, zIndex: 10,
    padding: '0 4px',
  },
  bottomLabel: { 
    fontSize: 10, fontWeight: 900, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: 0.5,
  },
  costIcon: { width: 14, height: 14, objectFit: 'contain', filter: 'drop-shadow(0 1px 1px black)' },
  costText: { fontSize: 13, fontWeight: 900, color: '#FFD700', textShadow: '0 1px 2px rgba(0,0,0,0.8)' },
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
};
