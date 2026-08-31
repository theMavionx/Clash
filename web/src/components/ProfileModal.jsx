import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { credentialVault } from '../lib/encryptedCredentialStorage';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePrivy } from '@privy-io/react-auth';
import { usePlayer, useResources, useBuildingDefs, useSend } from '../hooks/useGodot';
import { usePacifica } from '../hooks/usePacifica';
import { useAvantis } from '../hooks/useAvantis';
import { useDomfi } from '../hooks/useDomfi';
import { useEtoro } from '../hooks/useEtoro';
import { useDecibel } from '../hooks/useDecibel';
import { useGmx } from '../hooks/useGmx';
import { useMonad } from '../hooks/useMonad';
import { usePhoenix } from '../hooks/usePhoenix';
import { useHyperliquid } from '../hooks/useHyperliquid';
import { useRisex } from '../hooks/useRisex';
import { useNado } from '../hooks/useNado';
import { useOndo } from '../hooks/useOndo';
import { useLeverup } from '../hooks/useLeverup';
import { useAster } from '../hooks/useAster';
import { useHibachi } from '../hooks/useHibachi';
import { useHotstuff } from '../hooks/useHotstuff';
import { useGrvt } from '../hooks/useGrvt';
import { useKatana } from '../hooks/useKatana';
import { useLighter, useRhLighter } from '../hooks/useLighter';
import { useOstium } from '../hooks/useOstium';
import { useBulk } from '../hooks/useBulk';
import { useDex, DEX_CONFIG } from '../contexts/DexContext';
import { useFuturesMode } from '../contexts/FuturesModeContext';
import {
  FUTURES_THEME_DARK,
  FUTURES_THEME_LIGHT,
  useFuturesTheme,
} from '../hooks/useFuturesTheme';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useFarcaster } from '../hooks/useFarcaster';
import { useSkrHandle } from '../hooks/useSkrHandle';
import { uiButton, uiIconButton } from '../styles/theme';
import EvmWalletModal from './EvmWalletModal';
import { openSolanaWallet } from '../lib/solanaWalletUi';
import { readSoundEnabled, writeSoundEnabled } from '../lib/soundSettings';
import { writeAccountProbeCache } from '../auth/accountProbeCache';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;
const AI_AGENT_KEYS_ENABLED = false;
const EVM_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const APTOS_WALLET_RE = /^0x[0-9a-fA-F]{1,64}$/;
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function walletChainType(address) {
  const raw = String(address || '').trim();
  if (EVM_WALLET_RE.test(raw)) return 'evm';
  if (APTOS_WALLET_RE.test(raw) && !EVM_WALLET_RE.test(raw)) return 'aptos';
  if (SOLANA_WALLET_RE.test(raw)) return 'solana';
  return 'unknown';
}

function canonicalWallet(address) {
  const raw = String(address || '').trim();
  if (EVM_WALLET_RE.test(raw)) return raw.toLowerCase();
  if (APTOS_WALLET_RE.test(raw) && !EVM_WALLET_RE.test(raw)) {
    return `0x${raw.replace(/^0x/i, '').padStart(64, '0').toLowerCase()}`;
  }
  return raw;
}

function shortWallet(address) {
  const raw = String(address || '');
  return raw ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : '';
}

function chainLabel(chain) {
  if (chain === 'evm') return 'EVM';
  if (chain === 'solana') return 'Solana';
  if (chain === 'aptos') return 'Aptos';
  return 'Wallet';
}

function ProfileModal({ onClose }) {
  const player = usePlayer();
  const resources = useResources();
  const { sendToGodot } = useSend();
  const { publicKey, connected, disconnect, select, wallets, connect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { isInFrame: inFrame } = useFarcaster();
  const { dex, setDex } = useDex();
  const { mode: futuresMode, setMode: setFuturesMode } = useFuturesMode();
  const { theme: futuresTheme, setTheme: setFuturesTheme } = useFuturesTheme();
  const { address: evmAddress, disconnect: evmDisconnect, setExternalProvider: setEvmProvider } = useEvmWallet();
  const { address: aptosAddress, disconnect: aptosDisconnect, connect: aptosConnect } = useAptosWallet();
  const pacificaHook = usePacifica();
  const avantisHook = useAvantis();
  const domfiHook = useDomfi();
  const etoroHook = useEtoro();
  const decibelHook = useDecibel();
  const gmxHook = useGmx();
  const monadHook = useMonad();
  const phoenixHook = usePhoenix();
  const hyperliquidHook = useHyperliquid();
  const risexHook = useRisex();
  const nadoHook = useNado();
  const ondoHook = useOndo();
  const leverupHook = useLeverup();
  const asterHook = useAster();
  const hibachiHook = useHibachi();
  const hotstuffHook = useHotstuff();
  const grvtHook = useGrvt();
  const katanaHook = useKatana();
  const lighterHook = useLighter();
  const rhLighterHook = useRhLighter();
  const ostiumHook = useOstium();
  const bulkHook = useBulk();
  const tradingHook = dex === 'avantis'
    ? avantisHook
    : dex === 'domfi'
    ? domfiHook
    : dex === 'etoro'
    ? etoroHook
    : dex === 'decibel'
    ? decibelHook
    : dex === 'gmx'
    ? gmxHook
    : dex === 'ostium'
    ? ostiumHook
    : dex === 'monad'
    ? monadHook
    : dex === 'phoenix'
    ? phoenixHook
    : dex === 'hyperliquid'
    ? hyperliquidHook
    : dex === 'risex'
    ? risexHook
    : dex === 'nado'
    ? nadoHook
    : dex === 'ondo'
    ? ondoHook
    : dex === 'leverup'
    ? leverupHook
    : dex === 'aster'
    ? asterHook
    : dex === 'hibachi'
    ? hibachiHook
    : dex === 'hotstuff'
    ? hotstuffHook
    : dex === 'grvt'
    ? grvtHook
    : dex === 'katana'
    ? katanaHook
    : dex === 'lighter'
    ? lighterHook
    : dex === 'rhlighter'
    ? rhLighterHook
    : dex === 'bulk'
    ? bulkHook
    : pacificaHook;
  const { account, walletAddr } = tradingHook;
  const [tradingStats, setTradingStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [evmModalOpen, setEvmModalOpen] = useState(false);
  const [aiKeys, setAiKeys] = useState([]);
  const [aiKeyName, setAiKeyName] = useState('Base agent');
  const [newAiKey, setNewAiKey] = useState(null);
  const [aiKeyBusy, setAiKeyBusy] = useState(false);
  const [aiKeyError, setAiKeyError] = useState('');
  const [aiKeyCopied, setAiKeyCopied] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => readSoundEnabled());
  const currentName = player?.player_name || '';
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState('');
  const [accountLinks, setAccountLinks] = useState({ wallets: [], dex_accounts: [], active_dex: '' });
  const [walletActionError, setWalletActionError] = useState('');
  const [walletActionBusy, setWalletActionBusy] = useState('');
  const [referralSummary, setReferralSummary] = useState(player?.referral || null);
  const [credentialAction, setCredentialAction] = useState('');
  const [credentialMessage, setCredentialMessage] = useState('');

  useEffect(() => {
    if (!editingName) setNameDraft(currentName);
  }, [currentName, editingName]);

  // Privy logout — hook only called when provider is mounted (build-time flag).
  let privyLogout = null, privyAuthed = false;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const p = usePrivy();
    privyLogout = p.logout;
    privyAuthed = !!p.authenticated;
  }

  // Unified wallet address — DEX-aware priority. Previously `adapterAddr`
  // (the Solana wallet-adapter address) was first in the chain, which meant
  // that for an Avantis user who still had a Farcaster-Solana adapter
  // auto-connected, the profile would show their Solana address — even
  // though the Avantis account is registered with an EVM wallet. Resolve
  // to the chain-correct address for the active DEX.
  const adapterAddr = (connected && publicKey) ? publicKey.toBase58() : null;
  const liveWallet = (dex === 'avantis' || dex === 'domfi' || dex === 'etoro' || dex === 'gmx' || dex === 'ostium' || dex === 'monad' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'ondo' || dex === 'leverup' || dex === 'aster' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana' || dex === 'lighter' || dex === 'rhlighter')
    ? (walletAddr || null)            // EVM from useAvantis/useGmx/useMonad
    : dex === 'decibel'
    ? (walletAddr || null)            // Aptos from useDecibel
    : dex === 'phoenix'
    ? (walletAddr || null)            // Solana from usePhoenix
    : (adapterAddr || walletAddr || null); // Solana adapter / Privy
  const linkedWallet = player?.wallet || null;
  const activeWallet = liveWallet || linkedWallet;
  const walletSource = (dex === 'avantis' || dex === 'domfi' || dex === 'etoro' || dex === 'gmx' || dex === 'ostium' || dex === 'monad' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'ondo' || dex === 'leverup' || dex === 'aster' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana' || dex === 'lighter' || dex === 'rhlighter')
    ? (liveWallet ? 'evm' : null)
    : dex === 'decibel'
    ? (liveWallet ? 'aptos' : null)
    : dex === 'phoenix'
    ? (liveWallet ? 'solana' : null)
    : (adapterAddr ? 'adapter' : (liveWallet ? 'privy' : null));

  // Seeker `.skr` handle for the active wallet (Solana DEXes only — the
  // hook bails out for EVM / Aptos addresses on its own). Surfaced as a
  // chip next to the truncated wallet address so a Seeker user can see
  // their Solana Mobile identity at a glance.
  const skrLookupWallet = (walletSource === 'adapter' || walletSource === 'privy' || walletSource === 'solana')
    ? activeWallet
    : null;
  const { handle: seekerHandle } = useSkrHandle(skrLookupWallet);

  const refreshAccountLinks = useCallback(async () => {
    const token = player?.token || window._playerToken;
    if (!token) {
      setAccountLinks({ wallets: [], dex_accounts: [], active_dex: '' });
      return;
    }
    try {
      const r = await fetch('/api/players/dex-accounts', { headers: { 'x-token': token } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'Failed to load linked wallets');
      setAccountLinks({
        wallets: Array.isArray(data?.wallets) ? data.wallets : [],
        dex_accounts: Array.isArray(data?.dex_accounts) ? data.dex_accounts : [],
        active_dex: data?.active_dex || '',
      });
    } catch (e) {
      setWalletActionError(e?.message || 'Failed to load linked wallets');
    }
  }, [player?.token]);

  useEffect(() => {
    refreshAccountLinks();
  }, [refreshAccountLinks]);

  const profileWallets = useMemo(() => {
    const byKey = new Map();
    const loginWallet = canonicalWallet(player?.wallet || '');
    const add = (entry = {}) => {
      const address = canonicalWallet(entry.address || entry.wallet_address || '');
      const chain = entry.chain_type || walletChainType(address);
      if (!address || chain === 'unknown') return;
      const key = `${chain}:${address}`;
      const prev = byKey.get(key) || {};
      byKey.set(key, {
        ...prev,
        ...entry,
        address,
        chain_type: chain,
        is_login_wallet: (prev.is_login_wallet || entry.is_login_wallet || (loginWallet && address === loginWallet)) ? 1 : 0,
        linked: prev.linked || entry.linked || false,
        connected: prev.connected || entry.connected || false,
      });
    };
    (accountLinks.wallets || []).forEach((wallet) => add({ ...wallet, linked: true }));
    (accountLinks.dex_accounts || []).forEach((account) => {
      if (!account?.wallet_address) return;
      const isLinkedDexWallet = account.status !== 'disconnected';
      add({
        address: account.wallet_address,
        chain_type: account.chain_type,
        linked: isLinkedDexWallet,
        is_login_wallet: isLinkedDexWallet && account.dex === (accountLinks.active_dex || dex) ? 1 : 0,
        label: `${String(account.dex || '').toUpperCase()} login wallet`,
      });
    });
    if (player?.wallet) add({ address: player.wallet, chain_type: walletChainType(player.wallet), linked: true, is_login_wallet: 1 });
    if (evmAddress) add({ address: evmAddress, chain_type: 'evm', connected: true, label: 'Connected EVM wallet' });
    if (adapterAddr) add({ address: adapterAddr, chain_type: 'solana', connected: true, label: 'Connected Solana wallet' });
    if (aptosAddress) add({ address: aptosAddress, chain_type: 'aptos', connected: true, label: 'Connected Aptos wallet' });
    return Array.from(byKey.values()).sort((a, b) => {
      if (Number(b.is_login_wallet) !== Number(a.is_login_wallet)) return Number(b.is_login_wallet) - Number(a.is_login_wallet);
      if (Number(b.connected) !== Number(a.connected)) return Number(b.connected) - Number(a.connected);
      if (Number(b.linked) !== Number(a.linked)) return Number(b.linked) - Number(a.linked);
      return chainLabel(a.chain_type).localeCompare(chainLabel(b.chain_type));
    });
  }, [accountLinks.active_dex, accountLinks.dex_accounts, accountLinks.wallets, adapterAddr, aptosAddress, dex, evmAddress, player?.wallet]);

  // Switch active DEX. In our model one wallet = one account, so "switching"
  // DEX really means "log out of this account and sign in with the other
  // DEX's wallet" — which may be an existing account on that DEX or a
  // fresh register. So SWITCH = disconnect + reopen the DEX picker. The
  // RegisterPanel then drives the new sign-in flow.
  // Shared logout teardown — covers every identity source. We always call
  // every teardown idempotently rather than branching on walletSource,
  // because branches silently miss hybrid cases (e.g. user is on Avantis
  // but Privy is also authenticated from a prior Pacifica session).
  const logoutEverything = async () => {
    credentialVault.lock();
    try {
      localStorage.setItem('clash_manual_reconnect_required', '1');
      window.dispatchEvent(new CustomEvent('clash-auth-manual-reconnect-required'));
    } catch { /* noop */ }
    sendToGodot('logout');
    try { evmDisconnect(); } catch { /* noop */ }
    try { aptosDisconnect(); } catch { /* noop */ }
    try { disconnect(); } catch { /* noop */ }
    if (privyLogout && privyAuthed) {
      try { await privyLogout(); } catch { /* noop */ }
    }
    window._playerToken = null;
    try {
      window.onGodotMessage?.({ action: 'state', data: { token: '' } });
      window.onGodotMessage?.({ action: 'show_register', data: {} });
    } catch { /* noop */ }
  };

  const switchDex = async () => {
    try {
      window.dispatchEvent(new CustomEvent('clash-open-venue-picker', {
        detail: { source: 'profile', currentDex: dex },
      }));
    } catch { /* noop */ }
    onClose();
  };

  const handleDisconnect = async () => {
    await logoutEverything();
    onClose();
  };

  const disconnectWalletContext = useCallback(async (chain) => {
    if (chain === 'evm') {
      try { evmDisconnect(); } catch { /* noop */ }
    } else if (chain === 'solana') {
      try { await disconnect(); } catch { /* noop */ }
    } else if (chain === 'aptos') {
      try { await aptosDisconnect(); } catch { /* noop */ }
    }
  }, [aptosDisconnect, disconnect, evmDisconnect]);

  const handleWalletDisconnect = useCallback(async (wallet) => {
    if (!wallet?.address || walletActionBusy) return;
    const chain = wallet.chain_type || walletChainType(wallet.address);
    const key = `${chain}:${wallet.address}`;
    const walletAddress = canonicalWallet(wallet.address);
    const loginAddress = canonicalWallet(player?.wallet || '');
    const currentActiveAddress = canonicalWallet(activeWallet || '');
    const isLoginWallet = !!wallet.is_login_wallet
      || (!!loginAddress && walletAddress === loginAddress)
      || (!!currentActiveAddress && walletAddress === currentActiveAddress);
    setWalletActionBusy(key);
    setWalletActionError('');
    try {
      if (wallet.linked) {
        const token = player?.token || window._playerToken;
        if (token) {
          try {
            const r = await fetch(`/api/players/wallets/${encodeURIComponent(chain)}/${encodeURIComponent(wallet.address)}`, {
              method: 'DELETE',
              headers: { 'x-token': token },
            });
            if (!r.ok) {
              const data = await r.json().catch(() => ({}));
              if (r.status === 401 || r.status === 404) {
                console.warn('[profile] wallet unlink skipped before local disconnect:', data?.error || r.status);
              } else {
                console.warn('[profile] wallet unlink failed before logout:', data?.error || r.status);
              }
            }
          } catch (e) {
            console.warn('[profile] wallet unlink request failed before logout:', e?.message || e);
          }
        }
      }
      await disconnectWalletContext(chain);
      if (isLoginWallet) {
        await logoutEverything();
        onClose();
      } else {
        await refreshAccountLinks();
      }
    } catch (e) {
      setWalletActionError(e?.message || 'Failed to disconnect wallet');
    } finally {
      setWalletActionBusy('');
    }
  }, [activeWallet, disconnectWalletContext, logoutEverything, onClose, player?.token, player?.wallet, refreshAccountLinks, walletActionBusy]);

  const handleEvmConnected = ({ address, provider, rdns }) => {
    setEvmModalOpen(false);
    if (provider && address) setEvmProvider(provider, address, rdns, 'external');
  };

  const openSolanaConnect = useCallback(() => {
    openSolanaWallet({ wallets, select, connect, openWalletModal, inFrame });
  }, [wallets, select, connect, openWalletModal, inFrame]);

  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    writeSoundEnabled(next);
    sendToGodot('set_sound_enabled', { enabled: next });
  }, [sendToGodot, soundEnabled]);

  const saveNickname = useCallback(async () => {
    const nextName = nameDraft.trim().replace(/\s+/g, ' ');
    if (nameBusy) return;
    if (nextName === currentName) {
      setEditingName(false);
      setNameError('');
      setNameDraft(currentName);
      return;
    }
    if (nextName.length < 2) {
      setNameError('Nickname must be at least 2 characters');
      return;
    }
    if (nextName.length > 30) {
      setNameError('Nickname must be at most 30 characters');
      return;
    }
    const activeToken = player?.token || window._playerToken;
    if (!activeToken) {
      setNameError('Log in again to change nickname');
      return;
    }
    setNameBusy(true);
    setNameError('');
    try {
      const r = await fetch('/api/players/name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-token': activeToken },
        body: JSON.stringify({ name: nextName }),
      });
      let d = null;
      try { d = await r.json(); } catch { /* non-json error */ }
      if (!r.ok) {
        const message = /nickname is already taken/i.test(String(d?.error || ''))
          ? 'Nickname is already taken.'
          : (d?.error || 'Failed to change nickname');
        throw new Error(message);
      }
      const savedName = d?.name || nextName;
      const cachedWallets = new Set([player?.wallet, activeWallet].filter(Boolean));
      const cachedDexes = new Set([player?.dex, dex].filter(Boolean));
      cachedWallets.forEach((wallet) => {
        cachedDexes.forEach((accountDex) => {
          writeAccountProbeCache(wallet, accountDex, savedName);
        });
      });
      window.dispatchEvent(new CustomEvent('clash-player-patch', {
        detail: { player_name: savedName, name: savedName },
      }));
      sendToGodot('set_player_name_client', { name: savedName });
      setNameDraft(savedName);
      setEditingName(false);
    } catch (e) {
      setNameError(e?.message || 'Failed to change nickname');
    } finally {
      setNameBusy(false);
    }
  }, [activeWallet, currentName, dex, nameBusy, nameDraft, player?.dex, player?.token, player?.wallet, sendToGodot]);

  const { buildingDefs } = useBuildingDefs();
  // Use same source as HUD (PlayerInfo) — buildingDefs.th_level is authoritative.
  // Fall back to player.buildings structure only if buildingDefs isn't ready yet.
  const townHallLevel = buildingDefs?.th_level || player?.buildings?.town_hall?.level || 1;
  // Pacifica unified margin: raw `balance` can go negative when an open
  // position is in drawdown. Use available_to_spend (free margin) for the
  // "Trading Balance" / Free Margin display so we never show a misleading
  // -$X.XX while the account_equity is still positive. Clamp at 0 to
  // hide the negative collateral artifact entirely.
  const pacBalance = Math.max(0, parseFloat(account?.available_to_spend ?? account?.balance ?? 0));
  const pacEquity = Math.max(0, parseFloat(account?.account_equity || 0));

  // Fetch trading reward stats. Keyed on the reactive player token so that
  // if the user switches accounts while this modal is mounted (open in a
  // tab, then logs out / logs back in as a different user), we re-fetch
  // with the NEW token and discard any in-flight response from the old one.
  // Previously this read `window._playerToken` once with an empty dep array,
  // so an open ProfileModal could display Alice's gold_history + trades
  // to Bob after an account switch — or render `{error: "Invalid token"}`
  // as if it were stats after admin-wipe invalidated the token mid-fetch.
  const token = player?.token || null;

  const fetchAiKeys = useCallback(async () => {
    if (!AI_AGENT_KEYS_ENABLED) { setAiKeys([]); setAiKeyError(''); setNewAiKey(null); return; }
    if (!token) { setAiKeys([]); setAiKeyError(''); setNewAiKey(null); return; }
    try {
      const r = await fetch('/api/players/ai-keys', { headers: { 'x-token': token } });
      if (!r.ok) throw new Error('Failed to load AI keys');
      const d = await r.json();
      setAiKeys(Array.isArray(d.keys) ? d.keys : []);
    } catch (e) {
      setAiKeyError(e?.message || 'Failed to load AI keys');
    }
  }, [token]);

  useEffect(() => {
    fetchAiKeys();
  }, [fetchAiKeys]);

  const createAiKey = useCallback(async () => {
    if (!AI_AGENT_KEYS_ENABLED) return;
    if (!token || aiKeyBusy) return;
    setAiKeyBusy(true);
    setAiKeyError('');
    setAiKeyCopied(false);
    try {
      const r = await fetch('/api/players/ai-keys', {
        method: 'POST',
        headers: { 'x-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: aiKeyName || 'Base agent' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Failed to create AI key');
      setNewAiKey(d);
      setAiKeyName('Base agent');
      await fetchAiKeys();
      window.dispatchEvent(new Event('clash-ai-keys-changed'));
    } catch (e) {
      setAiKeyError(e?.message || 'Failed to create AI key');
    } finally {
      setAiKeyBusy(false);
    }
  }, [aiKeyBusy, aiKeyName, fetchAiKeys, token]);

  const revokeAiKey = useCallback(async (id) => {
    if (!AI_AGENT_KEYS_ENABLED) return;
    if (!token || !id || aiKeyBusy) return;
    setAiKeyBusy(true);
    setAiKeyError('');
    try {
      const r = await fetch(`/api/players/ai-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-token': token },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Failed to revoke AI key');
      await fetchAiKeys();
      window.dispatchEvent(new Event('clash-ai-keys-changed'));
    } catch (e) {
      setAiKeyError(e?.message || 'Failed to revoke AI key');
    } finally {
      setAiKeyBusy(false);
    }
  }, [aiKeyBusy, fetchAiKeys, token]);

  useEffect(() => {
    if (!token) { setTradingStats(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/trading/stats', { headers: { 'x-token': token } });
        if (cancelled) return;
        if (!r.ok) return; // leave prior stats cleared above
        const d = await r.json();
        if (!cancelled) setTradingStats(d);
      } catch { /* network error — leave stats null */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    setReferralSummary(player?.referral || null);
  }, [player?.referral]);

  useEffect(() => {
    if (!token) { setReferralSummary(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/players/referral', { headers: { 'x-token': token } });
        const d = await r.json().catch(() => ({}));
        if (!cancelled && r.ok) setReferralSummary(d.referral || null);
      } catch { /* leave state payload */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const referralLink = useMemo(() => {
    const code = referralSummary?.code || referralSummary?.slug || '';
    if (!code || typeof window === 'undefined') return '';
    return `${window.location.origin}/r/${code}`;
  }, [referralSummary?.code, referralSummary?.slug]);

  const money = useCallback((value) => {
    const n = Number(value || 0);
    return `$${n.toFixed(n >= 10 ? 2 : 4)}`;
  }, []);

  const credentialDexes = useMemo(() => ([
    {
      id: 'etoro',
      label: 'eToro',
      details: 'Real money · API key and user key',
      hook: etoroHook,
      walletLabel: 'eToro API account',
    },
    {
      id: 'hibachi',
      label: 'Hibachi',
      details: 'API key, account id, private key',
      hook: hibachiHook,
      walletLabel: 'EVM wallet',
    },
    {
      id: 'hotstuff',
      label: 'Hotstuff',
      details: 'browser trading agent',
      hook: hotstuffHook,
      walletLabel: 'Ethereum wallet',
    },
    {
      id: 'grvt',
      label: 'GRVT',
      details: 'API key, sub-account auto-detect',
      hook: grvtHook,
      walletLabel: 'GRVT EVM wallet',
    },
    {
      id: 'katana',
      label: 'Katana',
      details: 'API key, API secret, delegated signer',
      hook: katanaHook,
      walletLabel: 'Katana EVM wallet',
    },
    {
      id: 'lighter',
      label: 'Lighter',
      details: 'Wallet-approved connection · no manual key entry',
      hook: lighterHook,
      walletLabel: 'EVM wallet',
    },
    {
      id: 'rhlighter',
      label: 'Robinhood Lighter',
      details: 'Wallet-approved connection · separate RH account',
      hook: rhLighterHook,
      walletLabel: 'EVM wallet',
    },
  ]), [etoroHook, grvtHook, hibachiHook, hotstuffHook, katanaHook, lighterHook, rhLighterHook]);

  const switchToCredentialDex = useCallback((dexId) => {
    setDex(dexId);
    try {
      localStorage.setItem('clash_dex_picked', '1');
      window.dispatchEvent(new CustomEvent('clash-dex-switched-from-profile', { detail: { dex: dexId } }));
    } catch { /* noop */ }
    setCredentialMessage('Switched DEX. Reopen profile after the trading panel finishes loading to change API credentials.');
  }, [setDex]);

  const promptCredentialInput = useCallback((dexId) => {
    if (typeof window === 'undefined') return null;
    if (dexId === 'hibachi') {
      const apiKey = window.prompt('Hibachi API key', '');
      if (apiKey == null) return null;
      const accountId = window.prompt('Hibachi account id', '');
      if (accountId == null) return null;
      const privateKey = window.prompt('Hibachi API private key', '');
      if (privateKey == null) return null;
      return { apiKey, accountId, privateKey };
    }
    if (dexId === 'etoro') {
      const apiKey = window.prompt('eToro Real account API key — trading uses real funds', '');
      if (apiKey == null) return null;
      const userKey = window.prompt('eToro Real account user key', '');
      if (userKey == null) return null;
      return { apiKey, userKey, environment: 'real' };
    }
    if (dexId === 'grvt') {
      const apiKey = window.prompt('GRVT API key', '');
      if (apiKey == null) return null;
      const subAccountId = window.prompt('GRVT sub-account id (optional; leave blank to auto-detect)', '');
      if (subAccountId == null) return null;
      const fundingAccountAddress = window.prompt('GRVT funding account address (optional)', '');
      if (fundingAccountAddress == null) return null;
      return { apiKey, subAccountId, fundingAccountAddress };
    }
    if (dexId === 'katana') {
      const apiKey = window.prompt('Katana API key', '');
      if (apiKey == null) return null;
      const apiSecret = window.prompt('Katana API secret', '');
      if (apiSecret == null) return null;
      return { apiKey, apiSecret };
    }
    return null;
  }, []);

  const changeCredentialDex = useCallback(async (row) => {
    if (!row?.id || !row?.hook?.activate || credentialAction) return;
    if (row.id === 'lighter' || row.id === 'rhlighter') {
      switchToCredentialDex(row.id);
      onClose();
      return;
    }
    if (dex !== row.id) {
      switchToCredentialDex(row.id);
      return;
    }
    const needsPrompt = row.id !== 'hibachi' && row.id !== 'hotstuff';
    const input = needsPrompt ? promptCredentialInput(row.id) : null;
    if (needsPrompt && !input) return;
    setCredentialAction(`${row.id}:change`);
    setCredentialMessage('');
    try {
      const result = await row.hook.activate(input);
      if (result?.error) throw new Error(result.error);
      setCredentialMessage(`${row.label} API credentials saved.`);
    } catch (e) {
      setCredentialMessage(e?.message || `Failed to save ${row.label} credentials.`);
    } finally {
      setCredentialAction('');
    }
  }, [credentialAction, dex, onClose, promptCredentialInput, switchToCredentialDex]);

  const clearCredentialDex = useCallback(async (row) => {
    if (!row?.id || !row?.hook?.disconnect || credentialAction) return;
    if (typeof window !== 'undefined' && !window.confirm(`Remove saved ${row.label} credentials on this device and queue server deletion? This does not revoke the API key at ${row.label}.`)) return;
    setCredentialAction(`${row.id}:clear`);
    setCredentialMessage('');
    try {
      await row.hook.disconnect();
      setCredentialMessage(`${row.label} credentials removed on this device. Server deletion is queued if not yet synced. Exchange permissions are unchanged.`);
    } catch (e) {
      setCredentialMessage(e?.message || `Failed to clear ${row.label} credentials.`);
    } finally {
      setCredentialAction('');
    }
  }, [credentialAction]);

  const credentialStatusText = useCallback((row) => {
    if (dex !== row.id) return 'Switch to manage';
    if (row.hook?.setupVerified || row.hook?.accountReady || row.hook?.isReady) return 'Saved';
    return 'Not ready';
  }, [dex]);

  return (
    <>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{display: 'flex', alignItems: 'center', gap: 12, minWidth: 0}}>
            <div style={S.levelBadge}><span style={S.levelNum}>{townHallLevel}</span></div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0}}>
              {editingName ? (
                <div style={S.nameEditWrap}>
                  <input
                    value={nameDraft}
                    onChange={(e) => { setNameDraft(e.target.value); setNameError(''); }}
                    maxLength={30}
                    autoFocus
                    style={S.nameInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveNickname();
                      if (e.key === 'Escape') {
                        setEditingName(false);
                        setNameDraft(currentName);
                        setNameError('');
                      }
                    }}
                    aria-label="Nickname"
                  />
                  <button type="button" style={S.nameSaveBtn} disabled={nameBusy} onClick={saveNickname}>
                    {nameBusy ? '...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    style={S.nameCancelBtn}
                    disabled={nameBusy}
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(currentName);
                      setNameError('');
                    }}
                    aria-label="Cancel nickname edit"
                  >
                    X
                  </button>
                </div>
              ) : (
                <div style={S.nameDisplayWrap}>
                  <span style={{color: 'var(--terminal-text)', fontSize: 20, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis'}}>{currentName}</span>
                  <button
                    type="button"
                    style={S.nameEditBtn}
                    onClick={() => {
                      setEditingName(true);
                      setNameDraft(currentName);
                      setNameError('');
                    }}
                    aria-label="Edit nickname"
                    title="Edit nickname"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                </div>
              )}
              {nameError && <div style={S.nameError}>{nameError}</div>}
              <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
                <img src={trophyIcon} alt="" style={{width: 16, height: 16, filter: 'invert(60%) sepia(90%) saturate(500%) hue-rotate(10deg)'}} />
                <span style={{fontSize: 13, fontWeight: 600, color: 'var(--terminal-text-muted)'}}>{(player?.trophies || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
          <button type="button" style={S.closeBtn} onClick={onClose} aria-label="Close profile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="clash-scroll" style={S.body}>
          {/* DEX selector strip — cartoon-styled, gradient tile with 3D shadow */}
          {(() => {
            const cfg = DEX_CONFIG[dex] || DEX_CONFIG.pacifica;
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 12,
                background: 'var(--terminal-surface-subtle)',
                border: '1px solid var(--terminal-border)',
              }}>
                {/* Official DEX logo — Pacifica pairs icon + text label,
                    Avantis ships the full wordmark. */}
                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  <img
                    src={cfg.logo}
                    alt={cfg.label}
                    style={{
                      height: cfg.logoIsWordmark ? 22 : 26,
                      width: 'auto',
                      objectFit: 'contain',
                      maxWidth: 112,
                    }}
                  />
                  {!cfg.logoIsWordmark && (
                    <span style={{
                      fontSize: 16, fontWeight: 700, color: 'var(--terminal-text)',
                      letterSpacing: '0.6px',
                      textShadow: 'none',
                      textTransform: 'lowercase',
                    }}>{cfg.label.toLowerCase()}</span>
                  )}
                </div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{
                    fontSize: 10, fontWeight: 600,
                    color: 'var(--terminal-text-muted)',
                    letterSpacing: '0.5px',
                    textShadow: 'none',
                  }}>TRADING ON</div>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)',
                    letterSpacing: '0.8px',
                    textShadow: 'none',
                    marginTop: 1,
                  }}>
                    {cfg.chain} · SELF-CUSTODY
                  </div>
                </div>
                <button
                  type="button"
                  onClick={switchDex}
                  style={uiButton('secondary', { minHeight: 32, height: 32, padding: '0 11px', fontSize: 10 })}
                >SWITCH</button>
              </div>
            );
          })()}

          {/* Futures UI mode toggle (basic / pro). Hidden until the user
              has made their first-time choice — once they have, this lets
              them flip back and forth from here. Persists server-side. */}
          {futuresMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 12,
              background: 'var(--terminal-surface-muted)',
              border: '1px solid var(--terminal-surface-muted)',
            }}>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{
                  fontSize: 9, fontWeight: 600, color: 'var(--terminal-text-muted)',
                  letterSpacing: '0.6px',
                }}>FUTURES MODE</div>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)',
                  marginTop: 1,
                }}>
                  {futuresMode === 'pro' ? 'Pro — full feature set' : 'Basic — simplified UI'}
                </div>
              </div>
              <div style={{display: 'flex', gap: 4, flexShrink: 0}}>
                <button
                  type="button"
                  onClick={() => futuresMode !== 'basic' && setFuturesMode('basic')}
                  disabled={futuresMode === 'basic'}
                  style={uiButton(futuresMode === 'basic' ? 'primary' : 'secondary', {
                    minHeight: 32, height: 32, padding: '0 12px', fontSize: 11,
                  })}
                >BASIC</button>
                <button
                  type="button"
                  onClick={() => futuresMode !== 'pro' && setFuturesMode('pro')}
                  disabled={futuresMode === 'pro'}
                  style={uiButton(futuresMode === 'pro' ? 'primary' : 'secondary', {
                    minHeight: 32, height: 32, padding: '0 12px', fontSize: 11,
                  })}
                >PRO</button>
              </div>
            </div>
          )}

          <div style={S.futuresThemeBox}>
            <div style={S.soundInfo}>
              <div style={S.futuresThemeLabel}>Interface theme</div>
              <div style={S.futuresThemeState}>
                {futuresTheme === FUTURES_THEME_DARK ? 'Dark interface' : 'Light interface'}
              </div>
            </div>
            <div role="group" aria-label="Interface color theme" style={S.futuresThemeChoices}>
              <button
                type="button"
                aria-pressed={futuresTheme === FUTURES_THEME_LIGHT}
                onClick={() => setFuturesTheme(FUTURES_THEME_LIGHT)}
                style={{
                  ...S.futuresThemeChoice,
                  ...(futuresTheme === FUTURES_THEME_LIGHT
                    ? S.futuresThemeChoiceActive
                    : S.futuresThemeChoiceIdle),
                }}
              >
                <span aria-hidden="true" style={{ ...S.themeSwatch, background: 'var(--terminal-surface)' }} />
                Light
              </button>
              <button
                type="button"
                aria-pressed={futuresTheme === FUTURES_THEME_DARK}
                onClick={() => setFuturesTheme(FUTURES_THEME_DARK)}
                style={{
                  ...S.futuresThemeChoice,
                  ...(futuresTheme === FUTURES_THEME_DARK
                    ? S.futuresThemeChoiceActive
                    : S.futuresThemeChoiceIdle),
                }}
              >
                <span aria-hidden="true" style={{ ...S.themeSwatch, background: 'var(--terminal-neutral-button)' }} />
                Dark
              </button>
            </div>
          </div>

          <div style={S.soundBox}>
            <div style={S.soundInfo}>
              <div style={S.soundLabel}>Sound</div>
              <div style={S.soundState}>{soundEnabled ? 'Music and effects enabled' : 'Muted for this browser'}</div>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              style={{
                ...S.soundToggle,
                ...(soundEnabled ? S.soundToggleOn : S.soundToggleOff),
              }}
              aria-pressed={!soundEnabled}
              title={soundEnabled ? 'Mute game sound' : 'Turn game sound on'}
            >
              {soundEnabled ? (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="currentColor" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              ) : (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="currentColor" />
                  <line x1="19" y1="9" x2="15" y2="13" />
                  <line x1="15" y1="9" x2="19" y2="13" />
                </svg>
              )}
              <span>{soundEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {referralSummary?.code && referralSummary?.active && (
            <div style={S.referralBox}>
              <div style={S.referralHead}>
                <div>
                  <div style={S.sectionTitle}>Referral</div>
                  <div style={S.referralSub}>{Number(referralSummary.rate_bps || 0) / 100}% of confirmed Clash revenue</div>
                </div>
                <button
                  type="button"
                  style={S.referralCopyBtn}
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(referralLink); } catch {}
                    setCopied('referral-link');
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  disabled={!referralLink}
                >
                  {copied === 'referral-link' ? 'COPIED' : 'COPY'}
                </button>
              </div>
              <div style={S.referralLink}>{referralLink || referralSummary.code}</div>
              {referralSummary.referred_by && (
                <div style={S.referralBy}>Invited by {referralSummary.referred_by.name}</div>
              )}
              <div style={S.referralStats}>
                <div style={S.referralStat}>
                  <span style={S.referralStatLabel}>Invited</span>
                  <strong>{Number(referralSummary.invited_count || 0)}</strong>
                </div>
                <div style={S.referralStat}>
                  <span style={S.referralStatLabel}>Confirmed</span>
                  <strong>{money(referralSummary.confirmed_usd)}</strong>
                </div>
                <div style={S.referralStat}>
                  <span style={S.referralStatLabel}>Pending</span>
                  <strong>{money(referralSummary.pending_usd)}</strong>
                </div>
                <div style={S.referralStat}>
                  <span style={S.referralStatLabel}>Paid</span>
                  <strong>{money(referralSummary.paid_usd)}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Wallets */}
          {profileWallets.length ? (
            <div style={S.walletListBox}>
              <div style={S.walletListTitle}>Wallets</div>
              {walletActionError && <div style={S.walletError}>{walletActionError}</div>}
              {profileWallets.map((wallet) => {
                const isLogin = !!wallet.is_login_wallet;
                const isConnected = !!wallet.connected;
                const key = `${wallet.chain_type}:${wallet.address}`;
                const isBusy = walletActionBusy === key;
                return (
                  <div key={key} style={S.walletRow}>
                    <div style={S.walletRowMain}>
                      <div style={isConnected ? S.dot : S.offlineDot} />
                      <div style={S.walletRowText}>
                        <div style={S.walletRowTop}>
                          <span style={S.walletChain}>{chainLabel(wallet.chain_type)}</span>
                          <span style={S.walletAddress}>{shortWallet(wallet.address)}</span>
                          {isLogin && <span style={S.loginChip}>LOGIN</span>}
                          {isConnected ? <span style={S.connectedChip}>CONNECTED</span> : <span style={S.offlineChip}>LINKED</span>}
                          {seekerHandle?.full && wallet.chain_type === 'solana' && canonicalWallet(wallet.address) === canonicalWallet(activeWallet) && (
                            <span title={`Seeker .skr handle for ${wallet.address}`} style={S.seekerChip}>
                              <span style={{ fontSize: 9, opacity: 0.85 }}>SEEKER</span>
                              <strong>{seekerHandle.full}</strong>
                            </span>
                          )}
                        </div>
                        <div style={S.walletRowSub}>
                          {isLogin ? 'Primary login wallet' : (wallet.linked ? 'Linked to this game account' : 'Connected in browser')}
                        </div>
                      </div>
                    </div>
                    <div style={S.walletRowActions}>
                      <button
                        title="Copy full address"
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(wallet.address); } catch {}
                          setCopied(wallet.address);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                        style={{
                          ...S.copyBtn,
                          background: copied === wallet.address ? 'var(--terminal-long-soft)' : 'var(--terminal-surface-muted)',
                          border: `1px solid ${copied === wallet.address ? 'var(--terminal-long-border)' : 'var(--terminal-border-strong)'}`,
                          color: copied === wallet.address ? 'var(--terminal-long)' : 'var(--terminal-text-secondary)',
                        }}
                      >
                        {copied === wallet.address ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        )}
                      </button>
                      {!inFrame && (
                        <button
                          style={S.disconnectBtn}
                          disabled={isBusy}
                          onClick={() => handleWalletDisconnect(wallet)}
                        >
                          {isBusy ? '...' : 'Disconnect'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : inFrame ? (
            <div style={S.connectedBox}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <div style={S.dot} />
                <span style={{fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: 'var(--terminal-text)'}}>Farcaster Wallet</span>
              </div>
            </div>
          ) : dex === 'avantis' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT BASE WALLET</button>
          ) : dex === 'domfi' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT BASE WALLET</button>
          ) : dex === 'etoro' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT CLASH LOGIN WALLET</button>
          ) : dex === 'gmx' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT ARBITRUM WALLET</button>
          ) : dex === 'ostium' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT OSTIUM WALLET</button>
          ) : dex === 'monad' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT MONAD WALLET</button>
          ) : dex === 'hyperliquid' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT HYPERLIQUID WALLET</button>
          ) : dex === 'decibel' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => aptosConnect?.()}
            >CONNECT PETRA WALLET</button>
          ) : dex === 'risex' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT RISE WALLET</button>
          ) : dex === 'nado' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT INK WALLET</button>
          ) : dex === 'ondo' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT ETHEREUM WALLET</button>
          ) : dex === 'leverup' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT MONAD WALLET</button>
          ) : dex === 'aster' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT ASTER WALLET</button>
          ) : dex === 'hibachi' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT HIBACHI WALLET</button>
          ) : dex === 'hotstuff' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT ETHEREUM WALLET</button>
          ) : dex === 'grvt' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT GRVT WALLET</button>
          ) : dex === 'katana' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT KATANA WALLET</button>
          ) : dex === 'lighter' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT LIGHTER WALLET</button>
          ) : dex === 'rhlighter' ? (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT ROBINHOOD LIGHTER WALLET</button>
          ) : (
            <button
              style={uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px' })}
              onClick={openSolanaConnect}
            >CONNECT WALLET</button>
          )}

          {activeWallet && !liveWallet && (
            <div style={S.walletRepair}>
              <div style={S.walletRepairText}>
                This game session is active, but the signing wallet for the selected DEX is not connected.
              </div>
              <div style={S.walletRepairActions}>
                <button
                  style={S.walletRepairBtn}
                  onClick={() => {
                    if (dex === 'avantis' || dex === 'domfi' || dex === 'etoro' || dex === 'gmx' || dex === 'ostium' || dex === 'monad' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'ondo' || dex === 'leverup' || dex === 'aster' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana' || dex === 'lighter' || dex === 'rhlighter') setEvmModalOpen(true);
                    else if (dex === 'decibel') aptosConnect?.();
                    else openSolanaConnect();
                  }}
                >
                  Reconnect
                </button>
                <button style={S.walletRepairLogout} onClick={handleDisconnect}>Log out</button>
              </div>
            </div>
          )}

          {AI_AGENT_KEYS_ENABLED && token && (
            <div style={S.credentialsBox}>
              <div style={S.credentialsHead}>
                <div>
                  <div style={S.walletListTitle}>DEX API credentials</div>
                  <div style={S.credentialsHint}>Encrypted on this device; encrypted server sync requires wallet verification. Secrets are never displayed here. Sync does not enable bots.</div>
                </div>
              </div>
              {credentialMessage && <div style={S.credentialsMessage}>{credentialMessage}</div>}
              {credentialDexes.map((row) => {
                const isActive = dex === row.id;
                const cfg = DEX_CONFIG[row.id] || {};
                const statusText = credentialStatusText(row);
                const changing = credentialAction === `${row.id}:change`;
                const clearing = credentialAction === `${row.id}:clear`;
                return (
                  <div key={row.id} style={S.credentialRow}>
                    <div style={S.credentialMain}>
                      {cfg.logo && (
                        <img
                          src={cfg.logo}
                          alt=""
                          style={S.credentialLogo}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={S.credentialTitleLine}>
                          <span style={S.credentialName}>{row.label}</span>
                          <span style={isActive ? S.credentialActiveChip : S.credentialIdleChip}>{statusText}</span>
                        </div>
                        <div style={S.credentialSub}>{row.details}</div>
                        {!isActive && <div style={S.credentialSub}>Switch to {row.label} to verify credentials against its API.</div>}
                      </div>
                    </div>
                    <div style={S.credentialActions}>
                      <button
                        type="button"
                        style={S.credentialPrimaryBtn}
                        disabled={!!credentialAction}
                        onClick={() => changeCredentialDex(row)}
                      >
                        {changing ? '...' : isActive ? 'Change' : 'Switch'}
                      </button>
                      {isActive && (
                        <button
                          type="button"
                          style={S.credentialClearBtn}
                          disabled={!!credentialAction}
                          onClick={() => clearCredentialDex(row)}
                        >
                          {clearing ? '...' : 'Clear'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {token && (
            <>
              <div style={S.sectionTitle}>AI Agent</div>
              <div style={S.aiBox}>
                <div style={S.aiCreateRow}>
                  <input
                    value={aiKeyName}
                    onChange={(e) => setAiKeyName(e.target.value)}
                    maxLength={40}
                    placeholder="Key name"
                    style={S.aiInput}
                  />
                  <button style={S.aiPrimaryBtn} disabled={aiKeyBusy} onClick={createAiKey}>
                    {aiKeyBusy ? '...' : 'Create'}
                  </button>
                </div>

                {newAiKey?.key && (
                  <div style={S.aiSecretBox}>
                    <div style={S.aiSecretText}>{newAiKey.key}</div>
                    <button
                      style={S.aiCopyBtn}
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(newAiKey.key); } catch {}
                        setAiKeyCopied(true);
                        setTimeout(() => setAiKeyCopied(false), 1500);
                      }}
                    >
                      {aiKeyCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                <div style={S.aiHint}>MCP: <span style={S.aiMono}>/mcp</span> with <span style={S.aiMono}>Authorization: Bearer key</span></div>

                {aiKeyError && <div style={S.aiError}>{aiKeyError}</div>}
                {aiKeys.length > 0 && (
                  <div style={S.aiKeyList}>
                    {aiKeys.map((k) => (
                      <div key={k.id} style={S.aiKeyRow}>
                        <div style={{minWidth: 0}}>
                          <div style={S.aiKeyName}>{k.name || 'AI Agent'}</div>
                          <div style={S.aiKeyMeta}>
                            {k.key_prefix}...{k.key_suffix}
                            {k.last_used_at ? ` - used ${k.last_used_at.split(' ')[0]}` : ''}
                          </div>
                        </div>
                        <button style={S.aiRevokeBtn} disabled={aiKeyBusy || !!k.revoked_at} onClick={() => revokeAiKey(k.id)}>
                          {k.revoked_at ? 'Revoked' : 'Revoke'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Base self-custody funding callout */}
          {(dex === 'avantis' || dex === 'domfi') && activeWallet && (
            <div style={{
              padding: '12px 14px', borderRadius: 14,
              background: 'var(--terminal-brand-soft)',
              border: '1px solid var(--terminal-brand-border)',
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--terminal-brand-text)',
                letterSpacing: '1px', marginBottom: 4,
              }}>💰 FUND BASE WALLET</div>
              <div style={{
                fontSize: 12, color: 'var(--terminal-text-secondary)', fontWeight: 600,
                lineHeight: 1.4,
              }}>
                Send <b>USDC</b> + a little <b>ETH</b> (for gas, ~0.003 ETH) to the address above on the <b>Base</b> network.
              </div>
            </div>
          )}

          {/* Game resources */}
          <div style={S.sectionTitle}>Game Resources</div>
          <div style={{display: 'flex', gap: 6}}>
            <div style={S.resCard}><span style={{...S.resVal, color: '#e8b830'}}>{resources?.gold || 0}</span><span style={S.resLabel}>Gold</span></div>
            <div style={S.resCard}><span style={{...S.resVal, color: '#6ab344'}}>{resources?.wood || 0}</span><span style={S.resLabel}>Wood</span></div>
            <div style={S.resCard}><span style={{...S.resVal, color: '#8a9aaa'}}>{resources?.ore || 0}</span><span style={S.resLabel}>Ore</span></div>
          </div>

          {/* Game stats */}
          {[
            ['Player Level', townHallLevel],
            ['Trophies', (player?.trophies || 0).toLocaleString()],
          ].map(([label, val]) => (
            <div key={label} style={S.statRow}>
              <span style={S.statLabel}>{label}</span>
              <span style={S.statVal}>{val}</span>
            </div>
          ))}

          {/* Trading stats */}
          {(activeWallet || inFrame) && (
            <>
              <div style={S.sectionTitle}>Trading</div>
              {[
                // Equity = mark-to-market portfolio value (always >= 0).
                // Free Margin = collateral available for new trades.
                // Showing both makes the unified-margin model legible
                // instead of the old "Trading Balance" which silently meant
                // raw collateral and went negative on losing positions.
                ['Equity', `$${pacEquity.toFixed(2)}`],
                ['Free Margin', `$${pacBalance.toFixed(2)}`],
                ['Positions', account?.positions_count || 0],
                ['Orders', account?.orders_count || 0],
              ].map(([label, val]) => (
                <div key={label} style={S.statRow}>
                  <span style={S.statLabel}>{label}</span>
                  <span style={S.statVal}>{val}</span>
                </div>
              ))}
            </>
          )}

          {/* Gold rewards */}
          {tradingStats && tradingStats.total_gold > 0 && (
            <>
              <div style={S.sectionTitle}>Gold from Trading</div>
              <div style={S.goldCard}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <span style={{fontSize: 28}}>🪙</span>
                  <div>
                    <div style={{fontSize: 22, fontWeight: 700, color: 'var(--terminal-text)'}}>{tradingStats.total_gold.toLocaleString()} Gold</div>
                    <div style={{fontSize: 11, color: 'var(--terminal-text-muted)', fontWeight: 700}}>Volume: ${parseFloat(tradingStats.total_volume || 0).toFixed(0)}</div>
                  </div>
                </div>
              </div>

              {/* Gold history */}
              {tradingStats.gold_history?.length > 0 && (
                <>
                  <div style={S.sectionTitle}>Gold History</div>
                  {tradingStats.gold_history.map((h, i) => (
                    <div key={i} style={S.historyRow}>
                      <span style={{fontSize: 14, fontWeight: 700, color: 'var(--terminal-long)'}}>+{h.amount}</span>
                      <span style={{fontSize: 12, fontWeight: 700, color: 'var(--terminal-text-secondary)', flex: 1}}>{h.reason}</span>
                      <span style={{fontSize: 10, color: 'var(--terminal-text-muted)'}}>{h.created_at?.split(' ')[0]}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* Trade history */}
          {tradingStats?.trades?.length > 0 && (
            <>
              <div style={S.sectionTitle}>Trade History</div>
              {tradingStats.trades.slice(0, 20).map((t, i) => (
                <div key={i} style={S.historyRow}>
                  <span style={{fontSize: 13, fontWeight: 700, color: 'var(--terminal-text)', minWidth: 40}}>{t.symbol}</span>
                  <span style={{fontSize: 12, fontWeight: 700, color: 'var(--terminal-text-secondary)', flex: 1}}>{t.amount} @ ${parseFloat(t.price).toLocaleString()}</span>
                  <span style={{fontSize: 10, color: 'var(--terminal-text-muted)'}}>{t.created_at?.split(' ')[0] || '—'}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        targetChain={dex === 'gmx' || dex === 'hyperliquid' || dex === 'ostium' ? 'arbitrum' : dex === 'monad' || dex === 'leverup' ? 'monad' : dex === 'risex' ? 'rise' : dex === 'nado' ? 'ink' : dex === 'grvt' || dex === 'aster' || dex === 'rhlighter' ? 'baseConnect' : dex === 'katana' ? 'katana' : dex === 'hotstuff' || dex === 'ondo' || dex === 'hibachi' || dex === 'lighter' ? 'mainnet' : 'base'}
        onConnected={handleEvmConnected}
      />
    </>
  );
}

export default memo(ProfileModal);

const S = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, pointerEvents: 'auto' },
  modal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: '90%', maxWidth: 370, maxHeight: '85vh', background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
    zIndex: 201, pointerEvents: 'auto', overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: 'var(--terminal-border)', borderBottom: '1px solid var(--terminal-border-strong)',
  },
  levelBadge: {
    width: 44, height: 44, borderRadius: 10,
    background: 'radial-gradient(circle at 30% 30%, #7bd9ff 0%, #46b8e8 70%, #2a9ccb 100%)',
    border: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
    position: 'relative',
    overflow: 'hidden',
  },
  levelNum: { color: 'var(--terminal-on-accent)', fontSize: 22, fontWeight: 700, textShadow: 'none' },
  nameDisplayWrap: {
    display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, maxWidth: 190,
  },
  nameEditWrap: {
    display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: 215,
  },
  nameInput: {
    width: 110, minWidth: 0, height: 30, padding: '0 8px',
    borderRadius: 8, border: '1px solid var(--terminal-border-strong)', background: 'var(--terminal-surface)',
    color: 'var(--terminal-text)', fontSize: 15, fontWeight: 700, outline: 'none',
    boxShadow: 'inset 0 2px 0 rgba(0,0,0,0.08)',
  },
  nameEditBtn: uiIconButton('secondary', 30),
  nameSaveBtn: uiButton('success', { minHeight: 30, height: 30, padding: '0 9px', fontSize: 11 }),
  nameCancelBtn: uiIconButton('secondary', 30, { fontSize: 12 }),
  nameError: {
    maxWidth: 240,
    padding: '5px 8px',
    borderRadius: 8,
    border: '1px solid rgba(198,40,40,0.35)',
    background: 'rgba(198,40,40,0.09)',
    color: 'var(--terminal-short-strong)',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.2,
    marginTop: 2,
  },
  closeBtn: uiIconButton('danger', 30),
  body: { flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' },
  soundBox: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 14,
    background: 'var(--terminal-surface-subtle)',
    border: '1px solid var(--terminal-border)',
  },
  soundInfo: { flex: 1, minWidth: 0 },
  futuresThemeBox: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 14,
    background: 'var(--terminal-surface-subtle)',
    border: '1px solid var(--terminal-border-strong)',
  },
  futuresThemeLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--terminal-text-muted)',
    letterSpacing: '0.7px', textTransform: 'uppercase',
  },
  futuresThemeState: {
    marginTop: 2, fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  futuresThemeChoices: {
    display: 'inline-flex', gap: 3, padding: 3, borderRadius: 10,
    background: 'var(--terminal-border)', flexShrink: 0,
  },
  futuresThemeChoice: {
    minWidth: 66, height: 34, padding: '0 9px', borderRadius: 8,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
  },
  futuresThemeChoiceActive: {
    background: 'var(--terminal-surface)', color: 'var(--terminal-brand-text)', border: '1px solid var(--terminal-orange)',
    boxShadow: '0 1px 3px rgba(17,24,39,0.14)',
  },
  futuresThemeChoiceIdle: {
    background: 'transparent', color: 'var(--terminal-text-secondary)', border: '1px solid transparent',
  },
  themeSwatch: {
    width: 11, height: 11, borderRadius: '50%', border: '1px solid var(--terminal-text-faint)',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
  },
  soundLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--terminal-text-muted)',
    letterSpacing: '0.7px', textTransform: 'uppercase',
  },
  soundState: {
    marginTop: 2, fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  soundToggle: {
    minWidth: 84, height: 42, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    cursor: 'pointer',
    fontSize: 12, fontWeight: 700, letterSpacing: '0.8px',
    textShadow: 'none',
    boxShadow: 'none',
    transition: 'background-color 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out',
  },
  soundToggleOn: {
    background: 'var(--terminal-long)',
    border: '1px solid var(--terminal-long-strong)',
    color: 'var(--terminal-on-accent)',
  },
  soundToggleOff: {
    background: 'var(--terminal-surface-subtle)',
    border: '1px solid var(--terminal-border-strong)',
    color: 'var(--terminal-text-control)',
  },
  referralBox: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: '10px 12px', borderRadius: 14,
    background: 'var(--terminal-long-soft)',
    border: '1px solid var(--terminal-long-border)',
  },
  referralHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  referralSub: {
    marginTop: 2, color: 'var(--terminal-long-strong)', fontSize: 11, fontWeight: 700,
  },
  referralCopyBtn: uiButton('secondary', { minHeight: 34, height: 34, padding: '0 12px', fontSize: 11 }),
  referralLink: {
    padding: '8px 9px', borderRadius: 9,
    background: 'var(--terminal-chip-overlay)',
    border: '1px solid var(--terminal-long-border)',
    color: 'var(--terminal-long-strong)', fontSize: 12, fontWeight: 700,
    fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  referralBy: {
    color: 'var(--terminal-long-strong)', fontSize: 11, fontWeight: 700,
  },
  referralStats: {
    display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6,
  },
  referralStat: {
    display: 'flex', flexDirection: 'column', gap: 2,
    minWidth: 0, padding: '7px 5px', borderRadius: 9,
    background: 'var(--terminal-chip-overlay)',
    border: '1px solid var(--terminal-long-border)',
    color: 'var(--terminal-long-strong)', fontSize: 11, fontWeight: 700,
    textAlign: 'center',
  },
  referralStatLabel: {
    color: 'var(--terminal-long)', fontSize: 9, fontWeight: 700,
    textTransform: 'uppercase',
  },
  connectedBox: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', borderRadius: 12, padding: '10px 14px',
  },
  walletListBox: {
    display: 'flex', flexDirection: 'column', gap: 8,
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border-strong)', borderRadius: 12, padding: 10,
  },
  walletListTitle: {
    color: 'var(--terminal-text-secondary)', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.7,
  },
  walletRow: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8,
    alignItems: 'center', padding: '11px 10px', borderRadius: 10,
    background: 'var(--terminal-surface-raised)', border: '1px solid var(--terminal-border-strong)',
    boxShadow: '0 1px 2px var(--terminal-shadow-soft)',
  },
  walletRowMain: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  walletRowText: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  walletRowTop: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' },
  walletChain: { color: 'var(--terminal-text)', fontSize: 12, fontWeight: 700 },
  walletAddress: { color: 'var(--terminal-text-secondary)', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' },
  walletRowSub: { color: 'var(--terminal-text-secondary)', fontSize: 11, fontWeight: 600, lineHeight: 1.3 },
  walletRowActions: { display: 'flex', alignItems: 'center', gap: 6 },
  copyBtn: uiIconButton('secondary', 28),
  loginChip: {
    padding: '2px 7px', borderRadius: 999,
    background: 'rgba(14,165,233,0.14)', border: '1px solid rgba(2,132,199,0.45)',
    color: '#0369A1', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  connectedChip: {
    padding: '2px 7px', borderRadius: 999,
    background: 'var(--terminal-long-soft)', border: '1px solid var(--terminal-long-border)',
    color: 'var(--terminal-long)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  dot: { width: 10, height: 10, borderRadius: '50%', background: 'var(--terminal-long)', boxShadow: '0 0 6px var(--terminal-long)' },
  offlineDot: { width: 10, height: 10, borderRadius: '50%', background: 'var(--terminal-text-muted)', boxShadow: '0 0 6px rgba(163,144,106,0.5)' },
  offlineChip: {
    padding: '2px 7px', borderRadius: 999,
    background: 'var(--terminal-surface-muted)', border: '1px solid var(--terminal-border-strong)',
    color: 'var(--terminal-text-secondary)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  seekerChip: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '2px 8px', borderRadius: 999,
    background: 'var(--terminal-info-soft)', border: '1px solid var(--terminal-info-border)',
    color: 'var(--terminal-info)', fontSize: 10, fontWeight: 700, letterSpacing: '0.4px',
    textTransform: 'lowercase',
    textShadow: 'none',
  },
  walletError: {
    padding: '6px 8px', borderRadius: 8,
    border: '1px solid rgba(198,40,40,0.35)',
    background: 'rgba(198,40,40,0.09)', color: 'var(--terminal-short-strong)',
    fontSize: 11, fontWeight: 700, lineHeight: 1.25,
  },
  walletRepair: {
    padding: '10px 12px', borderRadius: 12,
    background: 'var(--terminal-warning-soft)',
    border: '1px solid var(--terminal-warning-border)',
  },
  walletRepairText: { color: 'var(--terminal-warning)', fontSize: 11, fontWeight: 600, lineHeight: 1.35 },
  walletRepairActions: { display: 'flex', gap: 8, marginTop: 8 },
  walletRepairBtn: uiButton('primary', { flex: 1, minHeight: 36, padding: '8px 10px', fontSize: 11 }),
  walletRepairLogout: uiButton('danger', { minHeight: 36, padding: '8px 10px', fontSize: 11 }),
  credentialsBox: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: '10px 12px', borderRadius: 12,
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)',
  },
  credentialsHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  credentialsHint: {
    marginTop: 2, color: 'var(--terminal-text-secondary)', fontSize: 10, fontWeight: 600, lineHeight: 1.25,
  },
  credentialsMessage: {
    padding: '6px 8px', borderRadius: 8,
    background: 'var(--terminal-info-soft)', border: '1px solid var(--terminal-info-border)',
    color: 'var(--terminal-info)', fontSize: 11, fontWeight: 700, lineHeight: 1.25,
  },
  credentialRow: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8,
    alignItems: 'center', padding: '8px 9px', borderRadius: 10,
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)',
  },
  credentialMain: {
    display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
  },
  credentialLogo: {
    width: 24, height: 24, objectFit: 'contain', borderRadius: 6, flexShrink: 0,
    background: 'var(--terminal-chip-overlay)',
  },
  credentialTitleLine: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0,
  },
  credentialName: {
    color: 'var(--terminal-text)', fontSize: 12, fontWeight: 700,
  },
  credentialSub: {
    color: 'var(--terminal-text-secondary)', fontSize: 10, fontWeight: 600, lineHeight: 1.2, marginTop: 2,
  },
  credentialActiveChip: {
    padding: '2px 7px', borderRadius: 999,
    background: 'var(--terminal-long-soft)', border: '1px solid var(--terminal-long-border)',
    color: 'var(--terminal-long-strong)', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.35,
  },
  credentialIdleChip: {
    padding: '2px 7px', borderRadius: 999,
    background: 'var(--terminal-surface-muted)', border: '1px solid var(--terminal-border)',
    color: 'var(--terminal-text-secondary)', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.35,
  },
  credentialActions: {
    display: 'flex', alignItems: 'center', gap: 5,
  },
  credentialPrimaryBtn: uiButton('primary', { minHeight: 30, height: 30, padding: '0 10px', fontSize: 10 }),
  credentialClearBtn: uiButton('secondary', { minHeight: 30, height: 30, padding: '0 8px', fontSize: 10 }),
  aiBox: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: '10px 12px', borderRadius: 12,
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)',
  },
  aiCreateRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' },
  aiInput: {
    minWidth: 0, height: 34, borderRadius: 8, border: '1px solid var(--terminal-border)',
    background: 'var(--terminal-surface)', color: 'var(--terminal-text)', padding: '0 10px',
    fontSize: 12, fontWeight: 600, outline: 'none',
  },
  aiPrimaryBtn: uiButton('primary', { minHeight: 34, height: 34, padding: '0 12px', fontSize: 11 }),
  aiSecretBox: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8,
    alignItems: 'center', padding: 8, borderRadius: 8,
    background: 'var(--terminal-surface-muted)', border: '1px solid var(--terminal-border)',
  },
  aiSecretText: {
    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--terminal-text)',
  },
  aiCopyBtn: uiButton('secondary', { minHeight: 30, padding: '6px 9px', fontSize: 10 }),
  aiHint: { fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-secondary)', lineHeight: 1.35 },
  aiMono: { fontFamily: 'monospace', color: 'var(--terminal-text)' },
  aiError: { fontSize: 11, fontWeight: 600, color: 'var(--terminal-short-strong)' },
  aiKeyList: { display: 'flex', flexDirection: 'column', gap: 6 },
  aiKeyRow: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center',
    padding: '7px 8px', borderRadius: 8, background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border)',
  },
  aiKeyName: {
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)',
  },
  aiKeyMeta: {
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontFamily: 'monospace', fontSize: 10, color: 'var(--terminal-text-secondary)', marginTop: 1,
  },
  aiRevokeBtn: uiButton('danger', { minHeight: 30, padding: '5px 8px', fontSize: 10 }),
  disconnectBtn: uiButton('danger', { minHeight: 32, padding: '5px 12px', fontSize: 11 }),
  sectionTitle: {
    fontSize: 12, fontWeight: 600, color: 'var(--terminal-text-muted)', textTransform: 'uppercase',
    marginTop: 6, paddingBottom: 2, borderBottom: '1px solid var(--terminal-surface-subtle)',
  },
  statRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', borderRadius: 10,
  },
  statLabel: { fontSize: 13, fontWeight: 700, color: 'var(--terminal-text-secondary)' },
  statVal: { fontSize: 15, fontWeight: 700, color: 'var(--terminal-text)' },
  resCard: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', borderRadius: 10, padding: 8,
  },
  resVal: { fontSize: 16, fontWeight: 700 },
  resLabel: { fontSize: 10, fontWeight: 700, color: 'var(--terminal-text-muted)', textTransform: 'uppercase' },
  goldCard: {
    background: 'var(--terminal-warning-soft)',
    border: '1px solid var(--terminal-warning-border)', borderRadius: 14, padding: 14,
  },
  goldStat: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    background: 'var(--terminal-chip-overlay)', borderRadius: 8, padding: 6,
  },
  historyRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', borderRadius: 8,
  },
};
