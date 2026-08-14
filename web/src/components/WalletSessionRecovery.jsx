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
import { uiButton, uiIconButton } from '../styles/theme';

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
  ondo: { kind: 'evm', chain: 'Ethereum', label: 'Ondo Perps', cta: 'Reconnect Ethereum wallet', targetChain: 'mainnet' },
  leverup: { kind: 'evm', chain: 'Monad', label: 'LeverUp V2', cta: 'Reconnect Monad wallet', targetChain: 'monad' },
  aster: { kind: 'evm', chain: 'Aster', label: 'Aster', cta: 'Reconnect EVM wallet', targetChain: 'baseConnect' },
  hibachi: { kind: 'evm', chain: 'EVM', label: 'Hibachi', cta: 'Reconnect EVM wallet', targetChain: 'base' },
  hotstuff: { kind: 'evm', chain: 'Ethereum', label: 'Hotstuff', cta: 'Reconnect Ethereum wallet', targetChain: 'mainnet' },
  grvt: { kind: 'evm', chain: 'GRVT Exchange', label: 'GRVT', cta: 'Reconnect GRVT wallet', targetChain: 'grvt' },
  katana: { kind: 'evm', chain: 'Katana', label: 'Katana', cta: 'Reconnect Katana wallet', targetChain: 'katana' },
  lighter: { kind: 'evm', chain: 'Ethereum', label: 'Lighter', cta: 'Reconnect EVM wallet', targetChain: 'mainnet' },
  rhlighter: { kind: 'evm', chain: 'Robinhood Lighter', label: 'Robinhood Lighter', cta: 'Reconnect EVM wallet', targetChain: 'baseConnect' },
  decibel: { kind: 'aptos', chain: 'Aptos', label: 'Decibel', cta: 'Reconnect Petra wallet' },
  pacifica: { kind: 'solana', chain: 'Solana', label: 'Pacifica', cta: 'Reconnect Solana wallet' },
  phoenix: { kind: 'solana', chain: 'Solana', label: 'Phoenix', cta: 'Reconnect Solana wallet' },
  gmtrade: { kind: 'solana', chain: 'Solana', label: 'GMTrade', cta: 'Reconnect Solana wallet' },
  flash: { kind: 'solana', chain: 'Solana', label: 'Flash Trade', cta: 'Reconnect Solana wallet' },
  bulk: { kind: 'solana', chain: 'Solana', label: 'Bulk', cta: 'Reconnect Solana wallet' },
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
      <style>{`
        .wallet-session-recovery button:focus-visible {
          outline: 3px solid rgba(242, 101, 34, 0.28);
          outline-offset: 2px;
        }
      `}</style>
      <div
        className="wallet-session-recovery"
        role="region"
        aria-live="polite"
        aria-labelledby="wallet-recovery-title"
        aria-describedby="wallet-recovery-description"
        style={S.card}
      >
        <div id="wallet-recovery-title" style={S.title}>Wallet session needs repair</div>
        <div id="wallet-recovery-description" style={S.text}>
          You are still signed in to the game, but {meta.label} needs a live {meta.chain} wallet to trade.
          {shortLinked ? ` Linked wallet: ${shortLinked}.` : ''}
          {shortOther ? ` A different wallet is active (${shortOther}).` : ''}
        </div>
        <div style={S.actions}>
          <button type="button" style={S.primary} onClick={handleReconnect}>{meta.cta}</button>
          <button type="button" style={S.secondary} onClick={handleLogout}>Log out</button>
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
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
    transform: 'translateX(-50%)',
    width: 'min(460px, calc(100vw - 24px))',
    zIndex: 260,
    pointerEvents: 'auto',
    background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 16,
    boxShadow: '0 16px 40px var(--terminal-shadow)',
    padding: 16,
    boxSizing: 'border-box',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  close: {
    ...uiIconButton('secondary', 36),
    position: 'absolute',
    right: 10,
    top: 8,
    fontSize: 18,
    lineHeight: 1,
  },
  title: {
    color: 'var(--terminal-text)',
    fontSize: 16,
    fontWeight: 750,
    letterSpacing: '-0.01em',
  },
  text: {
    marginTop: 6,
    color: 'var(--terminal-text-muted)',
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.5,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  primary: {
    ...uiButton('primary', { minHeight: 44, padding: '10px 14px' }),
    flex: '1 1 220px',
    fontFamily: 'inherit',
  },
  secondary: {
    ...uiButton('danger', { minHeight: 44, padding: '10px 14px' }),
    flex: '1 1 96px',
    fontFamily: 'inherit',
  },
};
