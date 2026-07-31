import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useOptionalPrivy } from './PrivyAuthProvider';
import { usePlayer, useSend, useUI } from '../hooks/useGodot';
import { useFarcaster } from '../hooks/useFarcaster';
import { openSolanaWallet } from '../lib/solanaWalletUi';
import { addClientBreadcrumb } from '../lib/clientLogger';
import EvmWalletModal from './EvmWalletModal';

const DEX_PICKED_KEY = 'clash_dex_picked';
const SHOW_AFTER_MS = 1200;

const DEX_WALLET = {
  avantis: { kind: 'evm', chain: 'Base', label: 'Avantis', cta: 'Reconnect Base wallet', targetChain: 'base' },
  gmx: { kind: 'evm', chain: 'Arbitrum', label: 'GMX', cta: 'Reconnect Arbitrum wallet', targetChain: 'arbitrum' },
  ostium: { kind: 'evm', chain: 'Arbitrum', label: 'Ostium', cta: 'Reconnect Arbitrum wallet', targetChain: 'arbitrum' },
  monad: { kind: 'evm', chain: 'Monad', label: 'Perpl', cta: 'Reconnect Monad wallet', targetChain: 'monad' },
  hyperliquid: { kind: 'evm', chain: 'Arbitrum', label: 'Hyperliquid', cta: 'Reconnect Arbitrum wallet', targetChain: 'arbitrum' },
  risex: { kind: 'evm', chain: 'RISE', label: 'RISEx', cta: 'Reconnect RISE wallet', targetChain: 'rise' },
  nado: { kind: 'evm', chain: 'Ink', label: 'Nado', cta: 'Reconnect Ink wallet', targetChain: 'ink' },
  hibachi: { kind: 'evm', chain: 'EVM', label: 'Hibachi', cta: 'Reconnect EVM wallet', targetChain: 'base' },
  hotstuff: { kind: 'evm', chain: 'Ethereum', label: 'Hotstuff', cta: 'Reconnect Ethereum wallet', targetChain: 'mainnet' },
  grvt: { kind: 'evm', chain: 'GRVT Exchange', label: 'GRVT', cta: 'Reconnect GRVT wallet', targetChain: 'grvt' },
  katana: { kind: 'evm', chain: 'Katana', label: 'Katana', cta: 'Reconnect Katana wallet', targetChain: 'katana' },
  lighter: { kind: 'evm', chain: 'Ethereum', label: 'Lighter', cta: 'Reconnect EVM wallet', targetChain: 'mainnet' },
  decibel: { kind: 'aptos', chain: 'Aptos', label: 'Decibel', cta: 'Reconnect Petra wallet' },
  pacifica: { kind: 'solana', chain: 'Solana', label: 'Pacifica', cta: 'Reconnect Solana wallet' },
  phoenix: { kind: 'solana', chain: 'Solana', label: 'Phoenix', cta: 'Reconnect Solana wallet' },
  gmtrade: { kind: 'solana', chain: 'Solana', label: 'GMTrade', cta: 'Reconnect Solana wallet' },
  flash: { kind: 'solana', chain: 'Solana', label: 'Flash Trade', cta: 'Reconnect Solana wallet' },
};
const DEFAULT_WALLET_META = { kind: 'evm', chain: 'EVM', label: 'This exchange', cta: 'Reconnect EVM wallet', targetChain: 'base' };

function dexPicked() {
  try { return localStorage.getItem(DEX_PICKED_KEY) === '1'; } catch { return true; }
}

function isLocalGuestSession(player) {
  if (typeof window === 'undefined') return false;
  const host = String(window.location?.hostname || '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return false;

  let guestRequested = false;
  let guestMarker = false;
  try {
    const guest = new URL(window.location.href).searchParams.get('guest');
    guestRequested = ['1', 'true', 'new'].includes(String(guest || '').toLowerCase());
    guestMarker = !!localStorage.getItem('clash.localGuest');
  } catch {
    // Player identity below remains a safe local-only fallback.
  }

  const wallet = String(player?.wallet || '');
  const name = String(player?.name || player?.player_name || '');
  return guestRequested
    || guestMarker
    || wallet.startsWith('local_guest_')
    || name.startsWith('Guest_');
}

export default function WalletSessionRecovery() {
  const { dex } = useDex();
  const player = usePlayer();
  const ui = useUI();
  const { sendToGodot } = useSend();
  const solWallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const evmWallet = useEvmWallet();
  const aptosWallet = useAptosWallet();
  const privy = useOptionalPrivy();
  const { isInFrame } = useFarcaster();

  const [visible, setVisible] = useState(false);
  const [evmModalOpen, setEvmModalOpen] = useState(false);
  const loggedRef = useRef(null);

  const meta = DEX_WALLET[dex] || DEFAULT_WALLET_META;
  const solAddress = solWallet?.publicKey?.toBase58?.() || null;
  const privySolAddress = (privy.solanaWallets || []).find(w => w?.address)?.address || null;
  const liveWallet = meta.kind === 'evm'
    ? evmWallet?.address
    : meta.kind === 'aptos'
    ? aptosWallet?.address
    : (solAddress || privySolAddress);
  const otherWallet = meta.kind === 'evm'
    ? (solAddress || aptosWallet?.address || privySolAddress || null)
    : meta.kind === 'aptos'
    ? (evmWallet?.address || solAddress || privySolAddress || null)
    : (evmWallet?.address || aptosWallet?.address || null);
  const sessionToken = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
  const playerId = player?.player_id || player?.id || player?.player_name || 'player';
  const linkedWallet = player?.wallet || null;
  const repairKey = `${playerId}:${dex}`;
  const localGuestSession = isLocalGuestSession(player);
  const needsRepair = !!sessionToken
    && !ui?.showRegister
    && dexPicked()
    && !localGuestSession
    && !liveWallet;

  const openSolanaConnect = useCallback(() => {
    openSolanaWallet({
      wallets: solWallet.wallets,
      select: solWallet.select,
      connect: solWallet.connect,
      openWalletModal,
      inFrame: isInFrame,
    });
  }, [solWallet.wallets, solWallet.select, solWallet.connect, openWalletModal, isInFrame]);

  const handleReconnect = useCallback(async () => {
    addClientBreadcrumb('wallet.recovery_reconnect_click', { dex, kind: meta.kind });
    if (dex === 'decibel') {
      await aptosWallet.connect?.();
      return;
    }
    if (meta.kind === 'evm') {
      const restored = await evmWallet.reconnectStoredProvider?.();
      if (!restored && !evmWallet.address) setEvmModalOpen(true);
      return;
    }
    if (meta.kind === 'aptos') {
      await aptosWallet.connect?.();
      return;
    }
    openSolanaConnect();
  }, [aptosWallet, dex, evmWallet, meta.kind, openSolanaConnect]);

  const handleLogout = useCallback(async () => {
    addClientBreadcrumb('wallet.recovery_logout_click', { dex, kind: meta.kind }, 'warn');
    try { localStorage.removeItem(DEX_PICKED_KEY); } catch { /* storage disabled */ }
    try { window._playerToken = null; } catch { /* noop */ }
    try { evmWallet.disconnect?.(); } catch { /* noop */ }
    try { await aptosWallet.disconnect?.(); } catch { /* noop */ }
    try { await solWallet.disconnect?.(); } catch { /* noop */ }
    if (privy.authenticated) {
      try { await privy.logout?.(); } catch { /* noop */ }
    }
    sendToGodot('logout');
    setVisible(false);
  }, [aptosWallet, dex, evmWallet, meta.kind, privy, sendToGodot, solWallet]);

  useEffect(() => {
    if (!needsRepair) {
      setVisible(false);
      return undefined;
    }

    if (meta.kind === 'evm') {
      evmWallet.reconnectStoredProvider?.();
    }

    const timer = setTimeout(() => {
      if (loggedRef.current !== repairKey) {
        loggedRef.current = repairKey;
        addClientBreadcrumb('wallet.session_needs_recovery', {
          dex,
          kind: meta.kind,
          has_other_wallet: !!otherWallet,
        }, 'warn');
      }
      setVisible(true);
    }, SHOW_AFTER_MS);

    return () => clearTimeout(timer);
  }, [dex, evmWallet, meta.kind, needsRepair, otherWallet, repairKey]);

  useEffect(() => {
    if (liveWallet || !sessionToken) setVisible(false);
  }, [liveWallet, sessionToken]);

  useEffect(() => {
    if (!needsRepair) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setVisible(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [needsRepair]);

  const shortOther = useMemo(() => {
    if (!otherWallet) return null;
    return `${String(otherWallet).slice(0, 6)}...${String(otherWallet).slice(-4)}`;
  }, [otherWallet]);

  const shortLinked = useMemo(() => {
    if (!linkedWallet) return null;
    return `${String(linkedWallet).slice(0, 6)}...${String(linkedWallet).slice(-4)}`;
  }, [linkedWallet]);

  if (!visible || !needsRepair) {
    return (
      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        targetChain={meta.targetChain || 'base'}
        onConnected={({ address, provider, rdns }) => {
          setEvmModalOpen(false);
          if (provider && address) evmWallet.setExternalProvider(provider, address, rdns, 'external');
        }}
      />
    );
  }

  return (
    <>
      <div style={S.card}>
        <div style={S.title}>Wallet session needs repair</div>
        <div style={S.text}>
          You are still signed in to the game, but {meta.label} needs a live {meta.chain} wallet to trade.
          {shortLinked ? ` Linked wallet: ${shortLinked}.` : ''}
          {shortOther ? ` A different wallet is active (${shortOther}).` : ''}
        </div>
        <div style={S.actions}>
          <button style={S.primary} onClick={handleReconnect}>{meta.cta}</button>
          <button style={S.secondary} onClick={handleLogout}>Log out</button>
        </div>
      </div>
      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        targetChain={meta.targetChain || 'base'}
        onConnected={({ address, provider, rdns }) => {
          setEvmModalOpen(false);
          if (provider && address) evmWallet.setExternalProvider(provider, address, rdns, 'external');
        }}
      />
    </>
  );
}

const S = {
  card: {
    position: 'fixed',
    left: '50%',
    bottom: 18,
    transform: 'translateX(-50%)',
    width: 'min(430px, calc(100vw - 24px))',
    zIndex: 260,
    pointerEvents: 'auto',
    background: '#fdf8e7',
    border: '4px solid #d4c8b0',
    borderRadius: 18,
    boxShadow: '0 14px 36px rgba(0,0,0,0.42)',
    padding: '14px 14px 12px',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  close: {
    position: 'absolute',
    right: 10,
    top: 8,
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: '2px solid #fff',
    background: '#E53935',
    color: '#fff',
    fontSize: 18,
    fontWeight: 900,
    lineHeight: '18px',
    cursor: 'pointer',
  },
  title: {
    paddingRight: 34,
    color: '#5C3A21',
    fontSize: 15,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  text: {
    marginTop: 6,
    color: '#77573d',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  actions: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  },
  primary: {
    flex: 1,
    border: '3px solid #3720a6',
    borderRadius: 10,
    background: 'linear-gradient(180deg, #6F5CFF 0%, #4530E0 100%)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 900,
    padding: '10px 12px',
    cursor: 'pointer',
    boxShadow: '0 3px 0 #3720a6',
    textShadow: '0 1px 0 rgba(0,0,0,0.35)',
  },
  secondary: {
    border: '3px solid #8b2a2a',
    borderRadius: 10,
    background: 'linear-gradient(180deg, #ef5350 0%, #d32f2f 100%)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 900,
    padding: '10px 12px',
    cursor: 'pointer',
    boxShadow: '0 3px 0 #8b2a2a',
    textShadow: '0 1px 0 rgba(0,0,0,0.35)',
  },
};
