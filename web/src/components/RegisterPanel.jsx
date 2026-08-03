import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import EvmWalletModal from './EvmWalletModal';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { DEX_CONFIG, getAvailableDexConfigs } from '../contexts/DexContext';
import { useAuthFlow } from '../auth/useAuthFlow';
import { openSolanaWallet } from '../lib/solanaWalletUi';

const GAME_AUTH_STORAGE_KEY = 'clash_game_auth_v1';
const DEX_PICKED_KEY = 'clash_dex_picked';
const MANUAL_RECONNECT_KEY = 'clash_manual_reconnect_required';

function readStoredAuthRecord() {
  try {
    const raw = localStorage.getItem(GAME_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const wallet = String(parsed?.wallet || '').trim();
    if (!wallet || wallet.startsWith('local_guest_')) return null;
    return {
      wallet,
      name: String(parsed?.name || '').trim(),
      playerId: String(parsed?.player_id || '').trim(),
    };
  } catch {
    return null;
  }
}

function shortWallet(address) {
  const raw = String(address || '');
  return raw ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : '';
}

function walletKind(address) {
  const raw = String(address || '').trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) return 'evm';
  if (/^0x[a-fA-F0-9]{64}$/.test(raw)) return 'aptos';
  if (raw) return 'solana';
  return 'unknown';
}

// Styled to match the project's dominant Clash-of-Clans modal look (parchment
// body + blue header + yellow action button — see BuildingInfoPanel LT styles
// for the reference). Previously used the older dark "cartoonPanel" look that
// didn't match the rest of the game.

function Spinner({ label }) {
  return (
    <div style={S.spinnerWrap}>
      <div style={S.spinner} />
      {label && <div style={S.spinnerLabel}>{label}</div>}
      <style>{`@keyframes rp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function DexPicker({ onPick, isInFrame, isSolanaMobile }) {
  const dexOptions = getAvailableDexConfigs({ isInFrame, isSolanaMobile });
  const isDesktopGrid = useMediaQuery('(min-width: 900px) and (min-height: 620px)');
  return (
    <div style={S.bodyStack}>
      <h3 style={S.sectionTitle}>CHOOSE YOUR DEX</h3>
      <p style={S.subtle}>
        Your trading venue for the whole campaign. You can switch any time in profile.
      </p>
      <div style={isDesktopGrid ? { ...S.dexList, ...S.dexListDesktop } : S.dexList}>
        {dexOptions.map(cfg => (
          <button
            key={cfg.id}
            type="button"
            onClick={() => onPick(cfg.id)}
            style={{
              ...S.dexCard,
              ...(isDesktopGrid ? S.dexCardDesktop : null),
              border: `3px solid ${cfg.borderColor}`,
              background: `linear-gradient(180deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`,
              boxShadow: `0 5px 0 ${cfg.borderColor}, 0 7px 14px rgba(0,0,0,0.25)`,
            }}
          >
            <div style={S.dexCardBody}>
              <div style={S.dexCardTitleRow}>
                <img
                  src={cfg.logo}
                  alt={cfg.label}
                  style={{
                    height: cfg.id === 'bulk' ? 32 : (cfg.logoIsWordmark ? 24 : 28),
                    width: cfg.id === 'bulk' ? 110 : 'auto',
                    objectFit: cfg.id === 'bulk' ? 'cover' : 'contain',
                    objectPosition: 'left center',
                    filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                  }}
                />
                {!cfg.logoIsWordmark && (
                  <span style={isDesktopGrid ? { ...S.dexCardLabel, ...S.dexCardLabelDesktop } : S.dexCardLabel}>{cfg.label.toLowerCase()}</span>
                )}
              </div>
              <div style={isDesktopGrid ? { ...S.dexCardSubtitle, ...S.dexCardSubtitleDesktop } : S.dexCardSubtitle}>
                {cfg.chain} · {
                  cfg.id === 'avantis' ? 'SELF-CUSTODY · EVM' :
                  cfg.id === 'gmx' ? 'SELF-CUSTODY · EVM' :
                  cfg.id === 'ostium' ? 'SELF-CUSTODY · EVM' :
                  cfg.id === 'hyperliquid' ? 'SELF-CUSTODY · EVM' :
                  cfg.id === 'risex' ? 'SELF-CUSTODY · RISE' :
                  cfg.id === 'nado' ? 'SELF-CUSTODY · INK' :
                  cfg.id === 'hibachi' ? 'SELF-CUSTODY · EVM' :
                  cfg.id === 'hotstuff' ? 'SELF-CUSTODY · HOT' :
                  cfg.id === 'grvt' ? 'SELF-CUSTODY · GRVT' :
                  cfg.id === 'katana' ? 'SELF-CUSTODY · KATANA' :
                  cfg.id === 'gmtrade' ? 'SELF-CUSTODY · SOLANA' :
                  cfg.id === 'flash' ? 'SELF-CUSTODY · SOLANA' :
                  cfg.id === 'monad' ? 'SELF-CUSTODY · MONAD' :
                  cfg.id === 'decibel' ? 'SELF-CUSTODY · APTOS' :
                  'SELF-CUSTODY · SOLANA'
                }
              </div>
            </div>
            <span style={S.dexCardChevron}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function useMediaQuery(query) {
  const getMatches = useCallback(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  ), [query]);
  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [query]);

  return matches;
}

function DexBadge({ dex, onChange }) {
  const cfg = DEX_CONFIG[dex] || DEX_CONFIG.pacifica;
  return (
    <div style={S.dexBadgeRow}>
      <div
        style={{
          ...S.dexBadge,
          background: `linear-gradient(180deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`,
          border: `2px solid ${cfg.borderColor}`,
          boxShadow: `0 2px 0 ${cfg.borderColor}`,
        }}
      >
        <img
          src={cfg.logo}
          alt={cfg.label}
          style={{
            height: cfg.id === 'bulk' ? 15 : (cfg.logoIsWordmark ? 12 : 14),
            width: cfg.id === 'bulk' ? 52 : 'auto',
            objectFit: cfg.id === 'bulk' ? 'cover' : 'contain',
            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.35))',
          }}
        />
        {!cfg.logoIsWordmark && (
          <span style={S.dexBadgeLabel}>{cfg.label}</span>
        )}
      </div>
      <button type="button" onClick={onChange} style={S.changeBtn}>← CHANGE</button>
    </div>
  );
}

function NameForm({ wallet, suggested, seekerHandle, error, onBack, onClearError, onSubmit }) {
  const [name, setName] = useState(suggested || '');
  // Track whether the user has manually typed in the field. We want the
  // input to track late-arriving `suggested` updates (the Seeker `.skr`
  // lookup is async — the form may mount with a `player_<hex>` placeholder
  // and then need to refresh once the handle resolves a beat later) WITHOUT
  // clobbering whatever the user is actively typing.
  const editedRef = useRef(false);
  const onChangeName = useCallback(e => {
    editedRef.current = true;
    onClearError?.();
    setName(e.target.value);
  }, [onClearError]);
  useEffect(() => {
    if (editedRef.current) return;
    if (!suggested) return;
    setName(suggested);
  }, [suggested]);

  const submit = e => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    onClearError?.();
    onSubmit(name);
  };
  const valid = name.trim().length >= 2;

  // One-tap "use my .skr name". Only renders on Seeker (the hook never
  // returns a handle off-device) AND when the input doesn't already match
  // the .skr name — if it does, the chip would be a no-op.
  const skrName = seekerHandle?.name?.slice(0, 20) || '';
  const skrFull = seekerHandle?.full || '';
  const showSkrChip = skrName && name.trim().toLowerCase() !== skrName.toLowerCase();
  const applySkr = useCallback(() => {
    editedRef.current = false; // treat as auto-fill, not manual edit
    setName(skrName);
  }, [skrName]);

  return (
    <form onSubmit={submit} style={S.bodyStack}>
      <button type="button" style={S.backBtn} onClick={onBack}>
        &larr; BACK
      </button>
      <h3 style={S.sectionTitle}>PICK A NAME</h3>
      <div style={S.walletPill}>
        <span style={S.walletDot} />
        <span style={S.walletAddr}>{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
      </div>
      <input
        style={S.input}
        value={name}
        onChange={onChangeName}
        placeholder="Your display name"
        maxLength={20}
        autoFocus
      />
      {error && <div style={S.nameError}>{error}</div>}
      {showSkrChip && (
        <button
          type="button"
          onClick={applySkr}
          style={S.skrChip}
          title={`Use your Seeker handle (${skrFull})`}
        >
          <span style={S.skrChipIcon}>S</span>
          <span style={S.skrChipText}>
            Use my Seeker handle: <strong>{skrFull}</strong>
          </span>
        </button>
      )}
      <button
        type="submit"
        style={{ ...S.primaryBtn, opacity: valid ? 1 : 0.5 }}
        disabled={!valid}
      >
        PLAY
      </button>
    </form>
  );
}

function ContinueAccount({ wallet, name, error, onContinue }) {
  return (
    <div style={S.bodyStack}>
      <h3 style={S.sectionTitle}>WELCOME BACK</h3>
      <div style={S.walletPill}>
        <span style={S.walletDot} />
        <span style={S.walletAddr}>{wallet.slice(0, 6)}...{wallet.slice(-4)}</span>
      </div>
      {name && <p style={S.subtle}>{name}</p>}
      {error && <div style={S.nameError}>{error}</div>}
      <button type="button" style={S.primaryBtn} onClick={onContinue}>
        CONTINUE
      </button>
    </div>
  );
}

function ConnectPacifica({ onOpenWalletModal, onPrivyLogin, privyEnabled, privyAuthed, dex = 'pacifica' }) {
  const venue = dex === 'bulk' ? 'BULK' : dex === 'flash' ? 'FLASH TRADE' : dex === 'gmtrade' ? 'GMTRADE' : dex === 'phoenix' ? 'PHOENIX' : 'PACIFICA';
  const connectCopy = dex === 'bulk'
    ? 'Connect your Solana wallet to start playing. Bulk orders are signed by your own wallet, include the Clash builder code, and never expose your private key.'
    : dex === 'gmtrade'
    ? 'Connect your Solana wallet to start playing. Please accept our referral code in Clash to receive a GMTrade fee discount. Trades are signed by your own wallet - we never hold your keys.'
    : dex === 'flash'
      ? 'Connect your Solana wallet to start playing. Flash Trade transactions are built by the Flash v2 transaction builder and signed by your own wallet - we never hold your keys.'
    : 'Connect your Solana wallet to start playing. Trades are signed by your own wallet - we never hold your keys.';
  return (
    <div style={S.bodyStack}>
      <h3 style={S.sectionTitle}>CONNECT TO {venue}</h3>
      <p style={S.subtle}>
        {connectCopy}
      </p>
      {privyEnabled && (
        <button style={S.primaryBtn} onClick={onPrivyLogin}>
          <EmailIcon /> {privyAuthed ? 'CONTINUE WITH EMAIL' : 'SIGN IN WITH EMAIL'}
        </button>
      )}
      <button style={privyEnabled ? S.secondaryBtn : S.primaryBtn} onClick={onOpenWalletModal}>
        <WalletIcon /> CONNECT SOLANA WALLET
      </button>
    </div>
  );
}

function ConnectLinkedWallet({
  dex = 'pacifica',
  wallet,
  onOpenWalletModal,
  onOpenEvmModal,
  onConnectAptos,
  aptosConnecting,
  aptosHasProvider,
  onPrivyLogin,
  privyEnabled,
  privyAuthed,
}) {
  const cfg = DEX_CONFIG[dex] || DEX_CONFIG.pacifica;
  const kind = walletKind(wallet);
  const cta = kind === 'evm'
    ? 'CONNECT EVM WALLET'
    : kind === 'aptos'
      ? (aptosConnecting ? 'CONNECTING...' : (aptosHasProvider ? 'CONNECT APTOS WALLET' : 'INSTALL PETRA'))
      : kind === 'solana'
        ? 'CONNECT SOLANA WALLET'
        : 'CONNECT WALLET';
  const onClick = kind === 'evm'
    ? onOpenEvmModal
    : kind === 'aptos'
      ? () => {
          if (!aptosHasProvider) {
            try { window.open('https://petra.app/', '_blank', 'noopener,noreferrer'); } catch {}
            return;
          }
          onConnectAptos();
        }
      : onOpenWalletModal;

  return (
    <div style={S.bodyStack}>
      <h3 style={S.sectionTitle}>CONNECT TO {String(cfg.label || 'CLASH').toUpperCase()}</h3>
      <p style={S.subtle}>
        Reconnect the wallet linked to this game account to continue. You can connect a separate trading wallet after login if this venue needs another chain.
      </p>
      {privyEnabled && (
        <button style={S.primaryBtn} onClick={onPrivyLogin}>
          <EmailIcon /> {privyAuthed ? 'CONTINUE WITH EMAIL' : 'SIGN IN WITH EMAIL'}
        </button>
      )}
      <button
        style={privyEnabled ? S.secondaryBtn : S.primaryBtn}
        onClick={onClick}
        disabled={kind === 'aptos' && aptosConnecting}
      >
        <WalletIcon /> {cta}
      </button>
    </div>
  );
}

function ConnectAccount({ onOpenWalletModal, onOpenEvmModal, onConnectAptos, aptosConnecting, aptosHasProvider, onPrivyLogin, privyEnabled, privyAuthed }) {
  return (
    <div style={S.bodyStack}>
      <h3 style={S.sectionTitle}>CREATE YOUR ACCOUNT</h3>
      <p style={S.subtle}>
        Sign in once, then choose any supported perp venue. You can switch venues later without losing your village, quests, or tournament progress.
      </p>
      {privyEnabled && (
        <button style={S.primaryBtn} onClick={onPrivyLogin}>
          <EmailIcon /> {privyAuthed ? 'CONTINUE WITH EMAIL' : 'EMAIL / PASSWORD'}
        </button>
      )}
      <button style={privyEnabled ? S.secondaryBtn : S.primaryBtn} onClick={onOpenEvmModal}>
        <WalletIcon /> CONNECT EVM WALLET
      </button>
      <button style={S.secondaryBtn} onClick={onOpenWalletModal}>
        <WalletIcon /> CONNECT SOLANA WALLET
      </button>
      <button
        style={S.secondaryBtn}
        onClick={() => {
          if (!aptosHasProvider) {
            try { window.open('https://petra.app/', '_blank', 'noopener,noreferrer'); } catch {}
            return;
          }
          onConnectAptos();
        }}
        disabled={aptosConnecting}
      >
        <WalletIcon /> {aptosConnecting ? 'CONNECTING...' : (aptosHasProvider ? 'CONNECT APTOS WALLET' : 'INSTALL PETRA')}
      </button>
    </div>
  );
}

function StoredWalletNotice({ record, onDisconnect }) {
  if (!record?.wallet) return null;
  return (
    <div style={S.storedWalletBox}>
      <div style={S.storedWalletText}>
        <span style={S.storedWalletLabel}>LINKED WALLET</span>
        <span style={S.storedWalletAddress}>{shortWallet(record.wallet)}</span>
        {record.name && <span style={S.storedWalletName}>{record.name}</span>}
      </div>
      <button type="button" style={S.storedWalletDisconnect} onClick={onDisconnect}>
        DISCONNECT
      </button>
    </div>
  );
}

function ConnectAvantis({ onOpenEvmModal, onPrivyLogin, privyEnabled, privyAuthed, dex = 'avantis' }) {
  // Avantis (Base), GMX (Arbitrum), Perpl (Monad), and Hyperliquid all flow through the
  // same EVM modal + Privy email path. Privy's embedded wallet is chain-
  // agnostic at the address level — the same 0xABC… works on every EVM
  // chain; we just ensureChain(targetId) before each tx. So one panel,
  // venue labels.
  const venue = dex === 'gmx' ? 'GMX'
    : dex === 'ostium' ? 'OSTIUM'
    : dex === 'monad' ? 'PERPL'
    : dex === 'hyperliquid' ? 'HYPERLIQUID'
    : dex === 'risex' ? 'RISEX'
    : dex === 'nado' ? 'NADO'
    : dex === 'hibachi' ? 'HIBACHI'
    : dex === 'hotstuff' ? 'HOTSTUFF'
    : dex === 'grvt' ? 'GRVT'
    : dex === 'katana' ? 'KATANA'
    : dex === 'lighter' ? 'LIGHTER'
    : dex === 'gmtrade' ? 'GMTRADE'
    : dex === 'flash' ? 'FLASH TRADE'
    : 'AVANTIS';
  const chainName = dex === 'gmx' || dex === 'ostium' ? 'Arbitrum'
    : dex === 'monad' ? 'Monad'
    : dex === 'hyperliquid' ? 'EVM'
    : dex === 'risex' ? 'RISE'
    : dex === 'nado' ? 'Ink'
    : dex === 'hibachi' ? 'EVM'
    : dex === 'hotstuff' ? 'Hotstuff L1'
    : dex === 'grvt' ? 'GRVT Exchange'
    : dex === 'katana' ? 'Katana'
    : dex === 'lighter' ? 'EVM'
    : dex === 'gmtrade' ? 'Solana'
    : dex === 'flash' ? 'Solana'
    : 'Base';
  return (
    <div style={S.bodyStack}>
      <h3 style={S.sectionTitle}>CONNECT TO {venue}</h3>
      <p style={S.subtle}>
        Sign in with email or connect a {chainName} wallet. Trades are signed by your own wallet - we never hold your keys.
      </p>
      {privyEnabled && (
        <button style={S.primaryBtn} onClick={onPrivyLogin}>
          <EmailIcon /> {privyAuthed ? 'CONTINUE WITH EMAIL' : 'SIGN IN WITH EMAIL'}
        </button>
      )}
      <button style={privyEnabled ? S.secondaryBtn : S.primaryBtn} onClick={onOpenEvmModal}>
        <WalletIcon /> CONNECT WALLET
      </button>
    </div>
  );
}

// Decibel uses Petra (Aptos Wallet Standard) — no Privy email path because
// Privy doesn't currently support generating embedded Aptos wallets, so we
// only offer the explicit Petra connect.
function ConnectDecibel({ onConnectAptos, isConnecting, hasProvider, error }) {
  // When no Petra provider is detected, the CTA should send the user to
  // the install page — clicking onConnectAptos in that state was a no-op
  // / threw, leaving the user on a dead button.
  const handleClick = () => {
    if (!hasProvider) {
      try { window.open('https://petra.app/', '_blank', 'noopener,noreferrer'); } catch {}
      return;
    }
    onConnectAptos();
  };
  return (
    <div style={S.bodyStack}>
      <h3 style={S.sectionTitle}>CONNECT TO DECIBEL</h3>
      <p style={S.subtle}>
        Connect your Aptos wallet (Petra) to start playing. Trades are signed by an
        api-wallet on this device — you sign once, then trade silently.
      </p>
      <button
        style={S.primaryBtn}
        onClick={handleClick}
        disabled={isConnecting}
      >
        <WalletIcon />
        {isConnecting ? 'CONNECTING…' : (hasProvider ? 'CONNECT PETRA' : 'INSTALL PETRA')}
      </button>
      {error && (
        <div style={{ color: '#B71C1C', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="14" rx="3" />
      <path d="M16 14h.01" />
      <path d="M2 10h20" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function RegisterPanel() {
  const {
    state, dex, dexPicked, isInFrame, isSolanaMobile, fcUser, candidate, suggestedName, seekerHandle,
    existingAccountName, privyEnabled, privyAuthed, actions, registerError,
  } = useAuthFlow();

  const { select, wallets, connect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { setExternalProvider: setEvmProvider } = useEvmWallet();
  const aptos = useAptosWallet();

  const [evmModalOpen, setEvmModalOpen] = useState(false);
  const [storedAuthRecord, setStoredAuthRecord] = useState(readStoredAuthRecord);
  const handleEvmConnected = useCallback(({ address, provider, rdns }) => {
    setEvmModalOpen(false);
    if (provider && address) setEvmProvider(provider, address, rdns, 'external');
  }, [setEvmProvider]);

  const openSolanaConnect = useCallback(() => {
    actions.beginManualWalletConnect?.();
    openSolanaWallet({ wallets, select, connect, openWalletModal, inFrame: isInFrame });
  }, [actions, isInFrame, wallets, select, connect, openWalletModal]);

  const openEvmConnect = useCallback(() => {
    actions.beginManualWalletConnect?.();
    setEvmModalOpen(true);
  }, [actions]);

  const connectAptos = useCallback(() => {
    actions.beginManualWalletConnect?.();
    return aptos.connect?.();
  }, [actions, aptos]);

  const disconnectStoredWallet = useCallback(() => {
    try {
      localStorage.removeItem(GAME_AUTH_STORAGE_KEY);
      localStorage.removeItem(DEX_PICKED_KEY);
      localStorage.removeItem(MANUAL_RECONNECT_KEY);
      window._playerToken = null;
    } catch { /* storage disabled */ }
    setStoredAuthRecord(null);
    actions.unpickDex?.();
  }, [actions]);

  const backFromName = useCallback(() => {
    actions.clearRegisterError?.();
    actions.unpickDex?.();
  }, [actions]);

  const body = (() => {
    switch (state) {
      case 'booting':
        return <Spinner label="Loading…" />;
      case 'pick_dex':
        return <DexPicker onPick={actions.pickDex} isInFrame={isInFrame} isSolanaMobile={isSolanaMobile} />;
      case 'auto_connecting':
        return (
          <Spinner
            label={isInFrame && fcUser
              ? `Joining ${
                  dex === 'avantis' ? 'Avantis' :
                  dex === 'decibel' ? 'Decibel' :
                  dex === 'gmx' ? 'GMX' :
                  dex === 'ostium' ? 'Ostium' :
                  dex === 'monad' ? 'Perpl' :
                  dex === 'hyperliquid' ? 'Hyperliquid' :
                  dex === 'risex' ? 'RISEx' :
                  dex === 'nado' ? 'Nado' :
                  dex === 'hibachi' ? 'Hibachi' :
                  dex === 'hotstuff' ? 'Hotstuff' :
                  dex === 'grvt' ? 'GRVT' :
                  dex === 'katana' ? 'Katana' :
                  dex === 'gmtrade' ? 'GMTrade' :
                  dex === 'flash' ? 'Flash Trade' :
                  dex === 'phoenix' ? 'Phoenix' :
                  'Pacifica'
                } as ${fcUser.username || fcUser.displayName}…`
              : 'Signing you in…'}
          />
        );
      case 'registering':
        return <Spinner label="Finalising…" />;
      case 'confirm_login':
        return (
          <ContinueAccount
            wallet={candidate.wallet}
            name={existingAccountName || suggestedName || ''}
            error={registerError}
            onContinue={actions.confirmLogin}
          />
        );
      case 'need_name':
        return (
          <NameForm
            wallet={candidate.wallet}
            suggested={suggestedName || ''}
            seekerHandle={seekerHandle}
            error={registerError}
            onBack={backFromName}
            onClearError={actions.clearRegisterError}
            onSubmit={actions.submitName}
          />
        );
      case 'manual_connect':
      default:
        if (storedAuthRecord?.wallet) {
          return (
            <ConnectLinkedWallet
              dex={dex}
              wallet={storedAuthRecord.wallet}
              onOpenWalletModal={openSolanaConnect}
              onOpenEvmModal={openEvmConnect}
              onConnectAptos={connectAptos}
              aptosConnecting={aptos.isConnecting}
              aptosHasProvider={aptos.hasProvider}
              onPrivyLogin={actions.loginWithPrivy}
              privyEnabled={privyEnabled}
              privyAuthed={privyAuthed}
            />
          );
        }
        if (!dexPicked) {
          return (
            <ConnectAccount
              onOpenWalletModal={openSolanaConnect}
              onOpenEvmModal={openEvmConnect}
              onConnectAptos={connectAptos}
              aptosConnecting={aptos.isConnecting}
              aptosHasProvider={aptos.hasProvider}
              onPrivyLogin={actions.loginWithPrivy}
              privyEnabled={privyEnabled}
              privyAuthed={privyAuthed}
            />
          );
        }
        if (dex === 'avantis' || dex === 'gmx' || dex === 'ostium' || dex === 'monad' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana' || dex === 'lighter') {
          return (
            <ConnectAvantis
              dex={dex}
              onOpenEvmModal={openEvmConnect}
              onPrivyLogin={actions.loginWithPrivy}
              privyEnabled={privyEnabled}
              privyAuthed={privyAuthed}
            />
          );
        }
        if (dex === 'decibel') {
          return (
            <ConnectDecibel
              onConnectAptos={connectAptos}
              isConnecting={aptos.isConnecting}
              hasProvider={aptos.hasProvider}
              error={aptos.error}
            />
          );
        }
        return (
          <ConnectPacifica
            dex={dex}
            onOpenWalletModal={openSolanaConnect}
            onPrivyLogin={actions.loginWithPrivy}
            privyEnabled={privyEnabled}
            privyAuthed={privyAuthed}
          />
        );
    }
  })();

  const showDexBadge =
    dexPicked && (
    state === 'manual_connect' ||
    state === 'confirm_login' ||
    state === 'need_name' ||
    (state === 'auto_connecting' && !(isInFrame && fcUser))
    );

  const headerTitle = (() => {
    if (state === 'pick_dex') return 'WELCOME';
    if (!dexPicked && state === 'manual_connect') return 'CLASH ACCOUNT';
    if (state === 'confirm_login') return 'WELCOME BACK';
    if (state === 'need_name') return 'YOUR NAME';
    if (state === 'registering' || state === 'auto_connecting' || state === 'booting') return 'LOADING';
    if (dex === 'avantis') return 'AVANTIS LOGIN';
    if (dex === 'decibel') return 'DECIBEL LOGIN';
    if (dex === 'gmx') return 'GMX LOGIN';
    if (dex === 'ostium') return 'OSTIUM LOGIN';
    if (dex === 'monad') return 'PERPL LOGIN';
    if (dex === 'hyperliquid') return 'HYPERLIQUID LOGIN';
    if (dex === 'risex') return 'RISEX LOGIN';
    if (dex === 'nado') return 'NADO LOGIN';
    if (dex === 'hibachi') return 'HIBACHI LOGIN';
    if (dex === 'hotstuff') return 'HOTSTUFF LOGIN';
    if (dex === 'grvt') return 'GRVT LOGIN';
    if (dex === 'katana') return 'KATANA LOGIN';
    if (dex === 'lighter') return 'LIGHTER LOGIN';
    if (dex === 'gmtrade') return 'GMTRADE LOGIN';
    if (dex === 'flash') return 'FLASH TRADE LOGIN';
    if (dex === 'bulk') return 'BULK LOGIN';
    if (dex === 'phoenix') return 'PHOENIX LOGIN';
    return 'PACIFICA LOGIN';
  })();

  return (
    <div style={S.overlay}>
      <div style={state === 'pick_dex' ? { ...S.panel, ...S.dexPickerPanel } : S.panel}>
        <div style={S.header}>
          <span style={S.headerTitle}>{headerTitle}</span>
        </div>
        <div className="shop-scroll" style={S.content}>
          {showDexBadge && <DexBadge dex={dex} onChange={actions.unpickDex} />}
          {state === 'manual_connect' && (
            <StoredWalletNotice record={storedAuthRecord} onDisconnect={disconnectStoredWallet} />
          )}
          {body}
        </div>
      </div>
      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        targetChain={!dexPicked ? 'baseConnect' : dex === 'gmx' || dex === 'ostium' || dex === 'hyperliquid' ? 'arbitrum' : dex === 'monad' ? 'monad' : dex === 'risex' ? 'rise' : dex === 'nado' ? 'ink' : dex === 'hibachi' ? 'base' : dex === 'grvt' ? 'baseConnect' : dex === 'katana' ? 'katana' : dex === 'hotstuff' ? 'mainnet' : dex === 'lighter' ? 'baseConnect' : 'base'}
        onConnected={handleEvmConnected}
      />
    </div>
  );
}

export default memo(RegisterPanel);

// ──────────────────────────────────────────────────────────────────────
// Styles — mirror the BuildingInfoPanel LT modal style (#ebdaba parchment
// + #377d9f blue header + yellow primary button). Kept in one object so
// the whole file's style sits in one scrolling place.
// ──────────────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '10px',
    zIndex: 30, pointerEvents: 'all',
  },
  panel: {
    width: 420, maxWidth: '94vw',
    maxHeight: 'calc(100vh - 20px)',
    background: '#ebdaba',
    border: '4px solid #377d9f',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 0 0 4px #ebdaba',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  dexPickerPanel: {
    width: 'min(760px, 94vw)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: 54, background: '#4ca5d2',
    borderBottom: '4px solid #377d9f',
  },
  headerTitle: {
    fontSize: 24, fontStyle: 'italic', fontWeight: 900, color: '#fff',
    textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.6)',
    letterSpacing: 1,
  },
  content: {
    padding: '18px 22px 22px',
    display: 'flex', flexDirection: 'column', gap: 14,
    flex: 1, minHeight: 0,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
  },
  bodyStack: {
    display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'stretch',
    minHeight: 0,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18, fontWeight: 900, color: '#377d9f',
    textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center',
  },
  subtle: {
    margin: 0, fontSize: 13, fontWeight: 600, color: '#5d6d75',
    textAlign: 'center', lineHeight: 1.45,
  },

  // DEX picker cards (keep the original colored buttons — they're the DEX's
  // brand identity, not the parchment theme).
  dexList: {
    display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4, paddingBottom: 6,
  },
  dexListDesktop: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
    alignItems: 'stretch',
  },
  dexCard: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 16px', borderRadius: 16,
    cursor: 'pointer', outline: 'none', textAlign: 'left', color: '#fff',
    fontFamily: 'inherit',
  },
  dexCardDesktop: {
    minHeight: 86,
    padding: '12px 14px',
    boxSizing: 'border-box',
  },
  dexCardBody: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4,
  },
  dexCardTitleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  dexCardLabel: {
    fontSize: 20, fontWeight: 900, color: '#fff',
    letterSpacing: '0.8px', textShadow: '0 2px 0 rgba(0,0,0,0.35)',
    textTransform: 'lowercase',
  },
  dexCardLabelDesktop: {
    fontSize: 18,
    letterSpacing: '0.4px',
  },
  dexCardSubtitle: {
    fontSize: 11, fontWeight: 800,
    color: 'rgba(255,255,255,0.88)',
    textShadow: '0 1px 0 rgba(0,0,0,0.3)', letterSpacing: '0.3px',
  },
  dexCardSubtitleDesktop: {
    fontSize: 10,
    lineHeight: 1.25,
  },
  dexCardChevron: {
    fontSize: 26, color: '#fff', fontWeight: 900,
    textShadow: '0 2px 0 rgba(0,0,0,0.3)',
  },

  // DEX badge (shown after picker — a compact pill + CHANGE button).
  dexBadgeRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8,
  },
  dexBadge: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 10px', borderRadius: 10,
  },
  dexBadgeLabel: {
    fontSize: 11, fontWeight: 900, color: '#fff',
    letterSpacing: '0.8px', textShadow: '0 1px 0 rgba(0,0,0,0.35)',
  },
  changeBtn: {
    background: 'rgba(26, 60, 79, 0.08)',
    border: '1.5px solid #377d9f',
    color: '#377d9f',
    fontSize: 10, fontWeight: 900, letterSpacing: '0.5px',
    cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
  },
  backBtn: {
    alignSelf: 'flex-start',
    background: 'rgba(26, 60, 79, 0.08)',
    border: '1.5px solid #377d9f',
    color: '#377d9f',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: '0.5px',
    cursor: 'pointer',
    padding: '6px 11px',
    borderRadius: 9,
    fontFamily: 'inherit',
  },

  storedWalletBox: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: 'rgba(26, 60, 79, 0.08)',
    border: '2px solid #377d9f',
    borderRadius: 12,
  },
  storedWalletText: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  storedWalletLabel: {
    color: '#377d9f',
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: '0.7px',
  },
  storedWalletAddress: {
    color: '#1a3c4f',
    fontSize: 14,
    fontWeight: 900,
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  storedWalletName: {
    color: '#5d6d75',
    fontSize: 11,
    fontWeight: 800,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  storedWalletDisconnect: {
    border: '2px solid #8b2a2a',
    borderRadius: 9,
    background: 'linear-gradient(180deg, #ef5350 0%, #d32f2f 100%)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 900,
    padding: '8px 9px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // Wallet pill shown before name form.
  walletPill: {
    alignSelf: 'center',
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 16px',
    background: 'rgba(26, 60, 79, 0.08)',
    border: '1.5px solid #377d9f',
    borderRadius: 12,
  },
  walletDot: {
    width: 10, height: 10, borderRadius: '50%',
    background: '#479a1f', boxShadow: '0 0 6px rgba(71,154,31,0.7)',
  },
  walletAddr: {
    fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: '#1a3c4f',
  },

  input: {
    width: '100%', padding: '12px 16px', borderRadius: 14,
    border: '2px solid #377d9f',
    background: '#fff',
    color: '#1a3c4f', fontSize: 17, fontWeight: 700,
    textAlign: 'center', outline: 'none', boxSizing: 'border-box',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
    fontFamily: 'inherit',
  },
  nameError: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 12px',
    borderRadius: 12,
    border: '2px solid #E53935',
    background: 'rgba(229, 57, 53, 0.1)',
    color: '#B71C1C',
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1.3,
    textAlign: 'center',
  },
  skrChip: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', boxSizing: 'border-box',
    padding: '10px 14px', borderRadius: 12,
    background: 'linear-gradient(180deg, rgba(168,116,255,0.18) 0%, rgba(120,80,220,0.22) 100%)',
    border: '2px solid #8B5CF6',
    boxShadow: '0 2px 0 #6D28D9, inset 0 1px 0 rgba(255,255,255,0.25)',
    color: '#3F1B8C',
    fontSize: 12, fontWeight: 800, letterSpacing: '0.4px',
    cursor: 'pointer', textAlign: 'left',
    fontFamily: 'inherit',
  },
  skrChipIcon: {
    flexShrink: 0,
    width: 22, height: 22, borderRadius: 6,
    background: 'linear-gradient(180deg, #A78BFA 0%, #6D28D9 100%)',
    color: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 900,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 0 rgba(0,0,0,0.25)',
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
  skrChipText: { lineHeight: 1.3 },

  // Matches BuildingInfoPanel.styles.actionBtn (yellow gradient).
  primaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    background: 'linear-gradient(180deg, #FBC02D 0%, #F57F17 100%)',
    border: 'none',
    boxShadow: '0 6px 16px rgba(245, 127, 23, 0.35), inset 0 2px 0 rgba(255,255,255,0.4)',
    borderRadius: 16,
    padding: '13px 20px',
    color: '#fff',
    fontSize: 15, fontWeight: 900,
    cursor: 'pointer', width: '100%',
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1,
    textShadow: '0 2px 2px rgba(0,0,0,0.3)',
    fontFamily: 'inherit',
  },
  secondaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    background: 'linear-gradient(180deg, #4ca5d2 0%, #377d9f 100%)',
    border: 'none',
    boxShadow: '0 5px 14px rgba(55, 125, 159, 0.35), inset 0 2px 0 rgba(255,255,255,0.3)',
    borderRadius: 16,
    padding: '12px 20px',
    color: '#fff',
    fontSize: 14, fontWeight: 900,
    cursor: 'pointer', width: '100%',
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1,
    textShadow: '0 2px 2px rgba(0,0,0,0.3)',
    fontFamily: 'inherit',
  },

  // Spinner (Clash-style yellow ring on parchment).
  spinnerWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    padding: '12px 0',
  },
  spinner: {
    width: 44, height: 44, borderRadius: '50%',
    borderWidth: 4,
    borderStyle: 'solid',
    borderColor: 'rgba(55,125,159,0.2)',
    borderTopColor: '#F57F17',
    animation: 'rp-spin 0.9s linear infinite',
  },
  spinnerLabel: {
    fontSize: 14, fontWeight: 800, color: '#377d9f',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
};
