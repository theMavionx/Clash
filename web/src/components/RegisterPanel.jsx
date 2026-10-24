import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { credentialVault } from '../lib/encryptedCredentialStorage';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import EvmWalletModal from './EvmWalletModal';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { DEX_CONFIG, getAvailableDexConfigs } from '../contexts/DexContext';
import { useAuthFlow } from '../auth/useAuthFlow';
import { authWalletKindForDex } from '../auth/walletSelection';
import { useOndoRegionAccess } from '../hooks/useOndoRegionAccess';
import { openSolanaWallet } from '../lib/solanaWalletUi';
import {
  TradingRegionGate,
  TradingSetupGate,
} from './trading/TradingSetupGate';
import { uiButton } from '../styles/theme';

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
  const [showOndoGate, setShowOndoGate] = useState(false);
  const { regionAccess, checkRegionAccess, retryRegionAccess } = useOndoRegionAccess(true);
  if (showOndoGate) {
    return (
      <OndoRegionGate
        access={regionAccess}
        onRetry={async () => {
          const access = await retryRegionAccess();
          if (access.allowed) {
            setShowOndoGate(false);
            onPick('ondo');
          }
        }}
        onBack={() => setShowOndoGate(false)}
      />
    );
  }
  return (
    <div style={S.bodyStack}>
      <h3 style={S.sectionTitle}>Choose your DEX</h3>
      <p style={S.subtle}>
        Your trading venue for the whole campaign. You can switch any time in profile.
      </p>
      <div style={isDesktopGrid ? { ...S.dexList, ...S.dexListDesktop } : S.dexList}>
        {dexOptions.map(cfg => (
          <button
            key={cfg.id}
            type="button"
            className="register-panel__dex-card"
            onClick={async () => {
              if (cfg.id !== 'ondo' || regionAccess.status === 'allowed') {
                onPick(cfg.id);
                return;
              }
              setShowOndoGate(true);
              if (regionAccess.status === 'idle' || regionAccess.status === 'checking') {
                const access = await checkRegionAccess();
                if (access.allowed) {
                  setShowOndoGate(false);
                  onPick('ondo');
                }
              }
            }}
            style={{
              ...S.dexCard,
              ...(isDesktopGrid ? S.dexCardDesktop : null),
            }}
          >
            <div style={S.dexCardBody}>
              <div style={S.dexCardTitleRow}>
                <img
                  src={cfg.logo}
                  alt={cfg.label}
                  style={{
                    height: cfg.logoIsWordmark ? 24 : 28,
                    width: 'auto',
                    objectFit: 'contain',
                    objectPosition: 'left center',
                  }}
                />
                {!cfg.logoIsWordmark && (
                  <span style={isDesktopGrid ? { ...S.dexCardLabel, ...S.dexCardLabelDesktop } : S.dexCardLabel}>{cfg.label.toLowerCase()}</span>
                )}
              </div>
              <div style={isDesktopGrid ? { ...S.dexCardSubtitle, ...S.dexCardSubtitleDesktop } : S.dexCardSubtitle}>
                {cfg.chain} · {
                  cfg.id === 'avantis' || cfg.id === 'domfi' ? 'Self-custody · EVM' :
                  cfg.id === 'etoro' ? 'API account · CEX' :
                  cfg.id === 'qfex' ? 'API account' :
                  cfg.id === 'gmx' ? 'Self-custody · EVM' :
                  cfg.id === 'ostium' ? 'Self-custody · EVM' :
                  cfg.id === 'hyperliquid' ? 'Self-custody · EVM' :
                  cfg.id === 'risex' ? 'Self-custody · RISE' :
                  cfg.id === 'nado' ? 'Self-custody · Ink' :
                  cfg.id === 'ondo' ? 'Self-custody · EVM' :
                  cfg.id === 'leverup' ? 'Self-custody · Monad' :
                  cfg.id === 'aster' ? 'Self-custody · EVM' :
                  cfg.id === 'hibachi' ? 'Self-custody · EVM' :
                  cfg.id === 'throne' ? 'Orderly · EVM' :
                  cfg.id === 'hotstuff' ? 'Self-custody · HOT' :
                  cfg.id === 'grvt' ? 'Self-custody · GRVT' :
                  cfg.id === 'katana' ? 'Self-custody · Katana' :
                  cfg.id === 'lighter' || cfg.id === 'rhlighter' ? 'Self-custody · EVM' :
                  cfg.id === 'gmtrade' ? 'Self-custody · Solana' :
                  cfg.id === 'flash' ? 'Self-custody · Solana' :
                  cfg.id === 'monad' ? 'Self-custody · Monad' :
                  cfg.id === 'decibel' ? 'Self-custody · Aptos' :
                  'Self-custody · Solana'
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

function OndoRegionGate({ access, onRetry, onBack }) {
  return (
    <TradingRegionGate
      venueName="Ondo Perps"
      logo={DEX_CONFIG.ondo.logo}
      access={access}
      onRetry={onRetry}
      onBack={onBack}
    />
  );
}

function ConnectOndo(props) {
  const { regionAccess, retryRegionAccess } = useOndoRegionAccess(true);
  if (regionAccess.status !== 'allowed') {
    return (
      <OndoRegionGate
        access={regionAccess}
        onRetry={retryRegionAccess}
        onBack={props.onBack}
      />
    );
  }
  return <ConnectAvantis {...props} dex="ondo" />;
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

function DexBadge({ dex, onChangeWallet, onChangeDex }) {
  const cfg = DEX_CONFIG[dex] || DEX_CONFIG.pacifica;
  return (
    <div style={S.dexBadgeRow}>
      <div
        style={{
          ...S.dexBadge,
        }}
      >
        <img
          src={cfg.logo}
          alt={cfg.label}
          style={{
            height: cfg.logoIsWordmark ? 12 : 14,
            width: 'auto',
            objectFit: 'contain',
          }}
        />
        {!cfg.logoIsWordmark && (
          <span style={S.dexBadgeLabel}>{cfg.label}</span>
        )}
      </div>
      <div style={S.dexBadgeActions}>
        <button type="button" onClick={onChangeWallet} style={S.changeBtn}>Change wallet</button>
        <button type="button" onClick={onChangeDex} style={S.changeDexBtn}>Change DEX</button>
      </div>
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
        &larr; Back to wallets
      </button>
      <h3 style={S.sectionTitle}>Pick a name</h3>
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
      <h3 style={S.sectionTitle}>Welcome back</h3>
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

function ConnectVenueGate({
  dex,
  kicker = 'Secure connection',
  title,
  subtitle,
  steps,
  actions,
  error = '',
  footnote = 'Self-custody stays enabled: Clash never receives your wallet private key.',
}) {
  const cfg = dex ? (DEX_CONFIG[dex] || DEX_CONFIG.pacifica) : null;
  return (
    <TradingSetupGate
      kicker={kicker}
      title={title}
      subtitle={subtitle}
      logo={cfg?.logo}
      logoAlt={cfg?.label || ''}
      logoBackground="var(--terminal-surface)"
      steps={steps}
      actions={actions}
      error={error}
      footnote={footnote}
      style={{ paddingTop: 4, paddingBottom: 4 }}
    />
  );
}

function ConnectPacifica({ onOpenWalletModal, onPrivyLogin, privyEnabled, privyAuthed, dex = 'pacifica' }) {
  const venue = dex === 'imperial' ? 'Imperial' : dex === 'bulk' ? 'Bulk' : dex === 'flash' ? 'Flash Trade' : dex === 'gmtrade' ? 'GMTrade' : dex === 'phoenix' ? 'Phoenix' : 'Pacifica';
  const connectCopy = dex === 'imperial'
    ? 'Connect your Solana wallet to browse Imperial markets and create a signed mobile session. Clash routes orders through Imperial with the CLASH builder code; your private key never leaves your wallet.'
    : dex === 'bulk'
    ? 'Connect your Solana wallet to start playing. Bulk orders are signed by your own wallet, include the Clash builder code, and never expose your private key.'
    : dex === 'gmtrade'
    ? 'Connect your Solana wallet to start playing. Please accept our referral code in Clash to receive a GMTrade fee discount. Trades are signed by your own wallet - we never hold your keys.'
    : dex === 'flash'
      ? 'Connect your Solana wallet to start playing. Flash Trade transactions are built by the Flash v2 transaction builder and signed by your own wallet - we never hold your keys.'
    : 'Connect your Solana wallet to start playing. Trades are signed by your own wallet - we never hold your keys.';
  const steps = [
    { id: 'wallet', label: 'Connect a Solana wallet', hint: 'Choose email or a wallet app. The connected wallet remains self-custodial.', status: 'active' },
    { id: 'venue', label: `Verify ${venue} access`, hint: dex === 'imperial' ? 'Clash verifies the Imperial session, routing and CLASH builder status.' : dex === 'bulk' ? 'Clash verifies the Bulk mainnet account and supported signing mode.' : 'Clash verifies the venue account and required attribution.', status: 'pending' },
    { id: 'ready', label: 'Unlock trading', hint: 'Balances and markets load only after the venue setup succeeds.', status: 'pending' },
  ];
  const actions = [];
  if (privyEnabled) actions.push({
    label: privyAuthed ? 'Continue with email' : 'Sign in with email',
    onClick: onPrivyLogin,
    icon: <EmailIcon />,
  });
  actions.push({
    label: 'Connect Solana wallet',
    onClick: onOpenWalletModal,
    icon: <WalletIcon />,
    variant: privyEnabled ? 'secondary' : 'primary',
  });
  return (
    <ConnectVenueGate
      dex={dex}
      title={`Connect to ${venue}`}
      subtitle={connectCopy}
      steps={steps}
      actions={actions}
    />
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
    ? 'Connect EVM wallet'
    : kind === 'aptos'
      ? (aptosConnecting ? 'Connecting...' : (aptosHasProvider ? 'Connect Aptos wallet' : 'Install Petra'))
      : kind === 'solana'
        ? 'Connect Solana wallet'
        : 'Connect wallet';
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

  const actions = [];
  if (privyEnabled) actions.push({
    label: privyAuthed ? 'Continue with email' : 'Sign in with email',
    onClick: onPrivyLogin,
    icon: <EmailIcon />,
  });
  actions.push({
    label: cta,
    onClick,
    disabled: kind === 'aptos' && aptosConnecting,
    icon: <WalletIcon />,
    variant: privyEnabled ? 'secondary' : 'primary',
  });
  return (
    <ConnectVenueGate
      dex={dex}
      kicker="Linked wallet required"
      title={`Reconnect to ${String(cfg.label || 'Clash')}`}
      subtitle="Reconnect the wallet already linked to this game account. A separate trading wallet can be connected after login when the venue needs another chain."
      steps={[
        { id: 'match', label: 'Reconnect the linked wallet', hint: `${shortWallet(wallet)} must approve this game session.`, status: 'active' },
        { id: 'verify', label: 'Verify account ownership', hint: 'Clash checks that the connected address matches the saved account.', status: 'pending' },
        { id: 'venue', label: 'Continue venue setup', hint: 'Venue-specific builder, referral, or signer checks follow next.', status: 'pending' },
      ]}
      actions={actions}
    />
  );
}

function ConnectAccount({ onOpenWalletModal, onOpenEvmModal, onConnectAptos, aptosConnecting, aptosHasProvider, onPrivyLogin, privyEnabled, privyAuthed }) {
  const actions = [];
  if (privyEnabled) actions.push({
    label: privyAuthed ? 'Continue with email' : 'Email / password',
    onClick: onPrivyLogin,
    icon: <EmailIcon />,
  });
  actions.push(
    { label: 'Connect EVM wallet', onClick: onOpenEvmModal, icon: <WalletIcon />, variant: privyEnabled ? 'secondary' : 'primary' },
    { label: 'Connect Solana wallet', onClick: onOpenWalletModal, icon: <WalletIcon />, variant: 'secondary' },
    {
      label: aptosConnecting ? 'Connecting...' : (aptosHasProvider ? 'Connect Aptos wallet' : 'Install Petra'),
      disabled: aptosConnecting,
      icon: <WalletIcon />,
      variant: 'secondary',
      onClick: () => {
        if (!aptosHasProvider) {
          try { window.open('https://petra.app/', '_blank', 'noopener,noreferrer'); } catch {}
          return;
        }
        onConnectAptos();
      },
    },
  );
  return (
    <ConnectVenueGate
      kicker="One game account"
      title="Create your Clash account"
      subtitle="Sign in once, then use any supported perp venue without losing your village, quests, or tournament progress."
      steps={[
        { id: 'login', label: 'Choose a secure sign-in', hint: 'Email, EVM, Solana, and Aptos are supported.', status: 'active' },
        { id: 'profile', label: 'Create your game profile', hint: 'Your village and tournament progress attach to this account.', status: 'pending' },
        { id: 'exchange', label: 'Choose an exchange', hint: 'Each venue then shows the same clear setup checklist.', status: 'pending' },
      ]}
      actions={actions}
      footnote="You can switch exchanges later without creating another game account."
    />
  );
}

function StoredWalletNotice({ record, onDisconnect }) {
  if (!record?.wallet) return null;
  return (
    <div style={S.storedWalletBox}>
      <div style={S.storedWalletText}>
        <span style={S.storedWalletLabel}>Linked wallet</span>
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
  // Base venues, GMX (Arbitrum), Perpl (Monad), and Hyperliquid all flow through the
  // same EVM modal + Privy email path. Privy's embedded wallet is chain-
  // agnostic at the address level — the same 0xABC… works on every EVM
  // chain; we just ensureChain(targetId) before each tx. So one panel,
  // venue labels.
  const venue = dex === 'domfi' ? 'DomFi'
    : dex === 'etoro' ? 'eToro'
    : dex === 'gmx' ? 'GMX'
    : dex === 'ostium' ? 'Ostium'
    : dex === 'monad' ? 'Perpl'
    : dex === 'hyperliquid' ? 'Hyperliquid'
    : dex === 'risex' ? 'RISEx'
    : dex === 'nado' ? 'Nado'
    : dex === 'ondo' ? 'Ondo Perps'
    : dex === 'leverup' ? 'LeverUp V2'
    : dex === 'aster' ? 'Aster'
    : dex === 'hibachi' ? 'Hibachi'
    : dex === 'throne' ? 'Throne'
    : dex === 'hotstuff' ? 'Hotstuff'
    : dex === 'grvt' ? 'GRVT'
    : dex === 'katana' ? 'Katana'
    : dex === 'lighter' ? 'Lighter'
    : dex === 'rhlighter' ? 'RH Lighter'
    : dex === 'gmtrade' ? 'GMTrade'
    : dex === 'flash' ? 'Flash Trade'
    : 'Avantis';
  const chainName = dex === 'gmx' || dex === 'ostium' ? 'Arbitrum'
    : dex === 'etoro' ? 'EVM'
    : dex === 'monad' ? 'Monad'
    : dex === 'hyperliquid' ? 'EVM'
    : dex === 'risex' ? 'RISE'
    : dex === 'nado' ? 'Ink'
    : dex === 'ondo' ? 'Ethereum'
    : dex === 'leverup' ? 'Monad'
    : dex === 'aster' ? 'EVM'
    : dex === 'hibachi' ? 'EVM'
    : dex === 'throne' ? 'EVM'
    : dex === 'hotstuff' ? 'Hotstuff L1'
    : dex === 'grvt' ? 'GRVT Exchange'
    : dex === 'katana' ? 'Katana'
    : dex === 'lighter' || dex === 'rhlighter' ? 'EVM'
    : dex === 'gmtrade' ? 'Solana'
    : dex === 'flash' ? 'Solana'
    : 'Base';
  const chainArticle = chainName === 'EVM' || chainName === 'Ethereum' ? 'an' : 'a';
  const venueSetupStep = dex === 'domfi'
    ? {
        label: 'Check DomFi referral',
        hint: 'Clash preserves an existing referral; otherwise the first open attaches CLASHOFPERPS automatically.',
      }
    : dex === 'etoro'
    ? {
        label: 'Add eToro API credentials',
        hint: 'After Clash login, choose Demo or Real and verify your eToro API key plus user key in the trading panel.',
      }
    : dex === 'ondo'
    ? {
        label: 'Accept Clash builder code',
        hint: 'After wallet connection, accept builder code clashofperps at 1 bps.',
      }
    : dex === 'aster'
      ? { label: 'Approve Clash builder', hint: 'Aster trading unlocks after the Clash builder address and configured builder fee are approved.' }
    : dex === 'nado'
      ? { label: 'Verify Nado referral', hint: 'Clash checks the wallet referral before allowing new positions.' }
    : dex === 'rhlighter'
      ? { label: 'Verify Clash referral and partner', hint: 'Clash preserves an existing RH referral or applies CLASSHOFPERPS, then verifies integrator approval for account 3156.' }
      : { label: `Verify ${venue} setup`, hint: 'Clash checks the required account, referral, builder, and signer permissions.' };
  const actions = [];
  if (privyEnabled) actions.push({
    label: privyAuthed ? 'Continue with email' : 'Sign in with email',
    onClick: onPrivyLogin,
    icon: <EmailIcon />,
  });
  actions.push({
    label: `Connect ${chainName} wallet`,
    onClick: onOpenEvmModal,
    icon: <WalletIcon />,
    variant: privyEnabled ? 'secondary' : 'primary',
  });
  return (
    <ConnectVenueGate
      dex={dex}
      title={`Connect to ${venue}`}
      subtitle={dex === 'etoro'
        ? 'Sign in to Clash with email or an EVM wallet, then connect your separate eToro API account.'
        : `Sign in with email or connect ${chainArticle} ${chainName} wallet. Trades stay self-custodial.`}
      steps={[
        { id: 'wallet', label: `Connect ${chainName} wallet`, hint: 'Choose email or your preferred wallet app.', status: 'active' },
        { id: 'setup', ...venueSetupStep, status: 'pending' },
        { id: 'ready', label: dex === 'domfi' ? 'Unlock wallet-signed trading' : dex === 'etoro' ? 'Unlock API trading' : 'Unlock one-tap trading', hint: 'The trading panel opens only after every required check succeeds.', status: 'pending' },
      ]}
      actions={actions}
      footnote="Every venue keeps its own authorization rules; the checklist and status language stay consistent."
    />
  );
}

// Decibel uses Petra (Aptos Wallet Standard) — no Privy email path because
// Privy doesn't currently support generating embedded Aptos wallets, so we
// only offer the explicit Petra connect.
function ConnectDecibel({ onConnectAptos, isConnecting, hasProvider, error }) {
  const handleClick = () => {
    if (!hasProvider) {
      try { window.open('https://petra.app/', '_blank', 'noopener,noreferrer'); } catch {}
      return;
    }
    onConnectAptos();
  };
  return (
    <ConnectVenueGate
      dex="decibel"
      title="Connect to Decibel"
      subtitle="Connect Petra once. Decibel then guides you through the delegated signer and builder approval in the same setup checklist."
      steps={[
        { id: 'wallet', label: 'Connect Aptos wallet', hint: 'Petra proves ownership of the trading account.', status: 'active' },
        { id: 'signer', label: 'Authorize fast trading', hint: 'A delegated API wallet signs orders without exposing your main key.', status: 'pending' },
        { id: 'builder', label: 'Verify builder fee routing', hint: 'Trading unlocks only after the builder approval is visible on-chain.', status: 'pending' },
      ]}
      actions={[{
        label: isConnecting ? 'Connecting...' : (hasProvider ? 'Connect Petra' : 'Install Petra'),
        onClick: handleClick,
        disabled: isConnecting,
        icon: <WalletIcon />,
      }]}
      error={error}
      footnote="The delegated signer can place orders but cannot withdraw funds."
    />
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
    credentialVault.lock();
    try {
      localStorage.removeItem(GAME_AUTH_STORAGE_KEY);
      localStorage.removeItem(DEX_PICKED_KEY);
      localStorage.removeItem(MANUAL_RECONNECT_KEY);
      window._playerToken = null;
    } catch { /* storage disabled */ }
    setStoredAuthRecord(null);
    actions.unpickDex?.();
  }, [actions]);

  const chooseDifferentWallet = useCallback(async () => {
    actions.clearRegisterError?.();
    setStoredAuthRecord(null);
    await actions.changeWallet?.();

    const kind = authWalletKindForDex(dex);
    if (kind === 'evm') {
      setEvmModalOpen(true);
      return;
    }
    if (kind === 'aptos') {
      await aptos.connect?.();
      return;
    }
    openSolanaWallet({ wallets, select, connect, openWalletModal, inFrame: isInFrame });
  }, [actions, aptos, connect, dex, isInFrame, openWalletModal, select, wallets]);

  const backFromName = useCallback(() => {
    void chooseDifferentWallet();
  }, [chooseDifferentWallet]);

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
                  dex === 'domfi' ? 'DomFi' :
                  dex === 'etoro' ? 'eToro' :
                  dex === 'decibel' ? 'Decibel' :
                  dex === 'gmx' ? 'GMX' :
                  dex === 'ostium' ? 'Ostium' :
                  dex === 'monad' ? 'Perpl' :
                  dex === 'hyperliquid' ? 'Hyperliquid' :
                  dex === 'risex' ? 'RISEx' :
                  dex === 'nado' ? 'Nado' :
                  dex === 'ondo' ? 'Ondo Perps' :
                  dex === 'leverup' ? 'LeverUp V2' :
                  dex === 'aster' ? 'Aster' :
                  dex === 'hibachi' ? 'Hibachi' :
                  dex === 'throne' ? 'Throne' :
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
        if (!dexPicked || dex === 'qfex') {
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
        if (dex === 'ondo') {
          return (
            <ConnectOndo
              onBack={actions.unpickDex}
              onOpenEvmModal={openEvmConnect}
              onPrivyLogin={actions.loginWithPrivy}
              privyEnabled={privyEnabled}
              privyAuthed={privyAuthed}
            />
          );
        }
        if (dex === 'avantis' || dex === 'domfi' || dex === 'etoro' || dex === 'gmx' || dex === 'ostium' || dex === 'monad' || dex === 'leverup' || dex === 'aster' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'throne' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana' || dex === 'lighter' || dex === 'rhlighter') {
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
    if (state === 'pick_dex') return 'Welcome';
    if (!dexPicked && state === 'manual_connect') return 'Clash account';
    if (state === 'confirm_login') return 'Welcome back';
    if (state === 'need_name') return 'Your name';
    if (state === 'registering' || state === 'auto_connecting' || state === 'booting') return 'Loading';
    if (dex === 'avantis') return 'Avantis login';
    if (dex === 'domfi') return 'DomFi login';
    if (dex === 'etoro') return 'eToro login';
    if (dex === 'qfex') return 'QFEX · Clash login';
    if (dex === 'decibel') return 'Decibel login';
    if (dex === 'gmx') return 'GMX login';
    if (dex === 'ostium') return 'Ostium login';
    if (dex === 'monad') return 'Perpl login';
    if (dex === 'hyperliquid') return 'Hyperliquid login';
    if (dex === 'risex') return 'RISEx login';
    if (dex === 'nado') return 'Nado login';
    if (dex === 'ondo') return 'Ondo Perps login';
    if (dex === 'leverup') return 'LeverUp V2 login';
    if (dex === 'aster') return 'Aster login';
    if (dex === 'hibachi') return 'Hibachi login';
    if (dex === 'throne') return 'Throne login';
    if (dex === 'hotstuff') return 'Hotstuff login';
    if (dex === 'grvt') return 'GRVT login';
    if (dex === 'katana') return 'Katana login';
    if (dex === 'lighter') return 'Lighter login';
    if (dex === 'rhlighter') return 'RH Lighter login';
    if (dex === 'gmtrade') return 'GMTrade login';
    if (dex === 'flash') return 'Flash Trade login';
    if (dex === 'bulk') return 'Bulk login';
    if (dex === 'imperial') return 'Imperial login';
    if (dex === 'phoenix') return 'Phoenix login';
    return 'Pacifica login';
  })();

  return (
    <div className="register-panel" style={S.overlay}>
      <style>{`
        .register-panel button:focus-visible,
        .register-panel input:focus-visible {
          outline: 3px solid var(--terminal-brand-ring);
          outline-offset: 2px;
        }
        .register-panel__dex-card { transition: background-color 160ms ease-out, border-color 160ms ease-out; }
        .register-panel__dex-card:hover { background: var(--terminal-surface-raised) !important; border-color: var(--terminal-border-strong) !important; }
        @media (max-width: 767px) {
          .register-panel { align-items: stretch !important; padding: 0 !important; }
          .register-panel__dialog { width: 100% !important; max-width: none !important; max-height: 100dvh !important; border-radius: 0 !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .register-panel * { scroll-behavior: auto !important; }
        }
      `}</style>
      <div
        className="register-panel__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-panel-title"
        style={state === 'pick_dex' ? { ...S.panel, ...S.dexPickerPanel } : S.panel}
      >
        <div style={S.header}>
          <span id="register-panel-title" style={S.headerTitle}>{headerTitle}</span>
        </div>
        <div className="shop-scroll" style={S.content}>
          {showDexBadge && (
            <DexBadge
              dex={dex}
              onChangeWallet={() => { void chooseDifferentWallet(); }}
              onChangeDex={actions.unpickDex}
            />
          )}
          {state === 'manual_connect' && (
            <StoredWalletNotice record={storedAuthRecord} onDisconnect={disconnectStoredWallet} />
          )}
          {body}
        </div>
      </div>
      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        targetChain={!dexPicked || dex === 'qfex' ? 'baseConnect' : dex === 'gmx' || dex === 'ostium' || dex === 'hyperliquid' ? 'arbitrum' : dex === 'monad' || dex === 'leverup' ? 'monad' : dex === 'risex' ? 'rise' : dex === 'nado' ? 'ink' : dex === 'hibachi' ? 'base' : dex === 'grvt' || dex === 'aster' || dex === 'throne' ? 'baseConnect' : dex === 'katana' ? 'katana' : dex === 'hotstuff' || dex === 'ondo' ? 'mainnet' : dex === 'lighter' || dex === 'rhlighter' ? 'baseConnect' : 'base'}
        onConnected={handleEvmConnected}
      />
    </div>
  );
}

export default memo(RegisterPanel);

// ──────────────────────────────────────────────────────────────────────
// ClashBot Light Terminal styles shared by every auth and wallet state.
// ──────────────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'var(--terminal-overlay)', backdropFilter: 'blur(var(--cb-scrim-blur))', WebkitBackdropFilter: 'blur(var(--cb-scrim-blur))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
    zIndex: 30, pointerEvents: 'all',
  },
  panel: {
    width: 420, maxWidth: '94vw',
    maxHeight: 'calc(100dvh - 32px)',
    background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 24,
    boxShadow: 'var(--cb-shadow-dialog)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: 'inherit',
    color: 'var(--terminal-text)',
  },
  dexPickerPanel: {
    width: 'min(760px, 94vw)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 56, background: 'var(--terminal-surface)',
    borderBottom: '1px solid var(--terminal-border)', padding: '0 20px',
  },
  headerTitle: {
    fontSize: 18, fontWeight: 600, color: 'var(--terminal-text)',
    letterSpacing: '-0.01em',
  },
  content: {
    padding: '20px clamp(16px, 5vw, 24px) 24px',
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
    fontSize: 18, fontWeight: 600, color: 'var(--terminal-text)',
    letterSpacing: '-0.01em', textAlign: 'center',
  },
  subtle: {
    margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--terminal-text-muted)',
    textAlign: 'center', lineHeight: 1.5,
  },

  // DEX logos preserve venue identity inside neutral terminal controls.
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
    minHeight: 64, padding: '14px 16px', borderRadius: 16,
    border: '1px solid var(--terminal-border)', background: 'var(--terminal-surface)',
    boxShadow: 'none',
    cursor: 'pointer', outline: 'none', textAlign: 'left', color: 'var(--terminal-text)',
    fontFamily: 'inherit',
  },
  dexCardDesktop: {
    minHeight: 86,
    padding: '14px 16px',
    boxSizing: 'border-box',
  },
  dexCardBody: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4,
  },
  dexCardTitleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  dexCardLabel: {
    fontSize: 18, fontWeight: 600, color: 'var(--terminal-text)',
    letterSpacing: '-0.01em',
    textTransform: 'lowercase',
  },
  dexCardLabelDesktop: {
    fontSize: 18,
  },
  dexCardSubtitle: {
    fontSize: 12, fontWeight: 500,
    color: 'var(--terminal-text-muted)',
  },
  dexCardSubtitleDesktop: {
    fontSize: 12,
    lineHeight: 1.25,
  },
  dexCardChevron: {
    fontSize: 22, color: 'var(--terminal-text-faint)', fontWeight: 500,
  },

  // DEX badge (shown after picker — a compact pill + CHANGE button).
  dexBadgeRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8,
  },
  dexBadge: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 12px', borderRadius: 999,
    background: 'var(--terminal-surface-muted)', border: '1px solid var(--terminal-border)',
  },
  dexBadgeLabel: {
    fontSize: 12, fontWeight: 600, color: 'var(--terminal-text)',
  },
  dexBadgeActions: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    flexWrap: 'wrap', gap: 6,
  },
  changeBtn: uiButton('secondary', { minHeight: 40, fontSize: 12, padding: '8px 12px' }),
  changeDexBtn: uiButton('ghost', { minHeight: 40, fontSize: 12, padding: '8px 10px' }),
  backBtn: uiButton('secondary', {
    alignSelf: 'flex-start',
    minHeight: 40, fontSize: 12, padding: '8px 12px',
  }),

  storedWalletBox: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: 'var(--terminal-surface-muted)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 16,
  },
  storedWalletText: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  storedWalletLabel: {
    color: 'var(--terminal-text-muted)',
    fontSize: 12,
    fontWeight: 500,
  },
  storedWalletAddress: {
    color: 'var(--terminal-text)',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: '"SFMono-Regular",Consolas,monospace',
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  storedWalletName: {
    color: 'var(--terminal-text-muted)',
    fontSize: 12,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  storedWalletDisconnect: uiButton('secondary', { minHeight: 40, fontSize: 12, padding: '8px 12px' }),

  // Wallet pill shown before name form.
  walletPill: {
    alignSelf: 'center',
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 16px',
    background: 'var(--terminal-surface-muted)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 999,
  },
  walletDot: {
    width: 10, height: 10, borderRadius: '50%',
    background: 'var(--terminal-long)',
  },
  walletAddr: {
    fontSize: 14, fontWeight: 600, fontFamily: '"SFMono-Regular",Consolas,monospace',
    fontVariantNumeric: 'tabular-nums', color: 'var(--terminal-text)',
  },

  input: {
    width: '100%', minHeight: 44, padding: '11px 14px', borderRadius: 12,
    border: '1px solid var(--terminal-border)',
    background: 'var(--terminal-input)',
    color: 'var(--terminal-text)', fontSize: 16, fontWeight: 500,
    textAlign: 'center', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  nameError: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 12px',
    borderRadius: 12,
    border: '1px solid var(--terminal-short-border)',
    background: 'var(--terminal-short-soft)',
    color: 'var(--terminal-short)',
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.3,
    textAlign: 'center',
  },
  skrChip: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', boxSizing: 'border-box',
    padding: '10px 14px', borderRadius: 12,
    background: 'var(--terminal-brand-soft)',
    border: '1px solid var(--terminal-brand-border)',
    color: 'var(--terminal-brand-text)',
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer', textAlign: 'left',
    fontFamily: 'inherit',
  },
  skrChipIcon: {
    flexShrink: 0,
    width: 22, height: 22, borderRadius: 999,
    background: 'var(--terminal-orange)',
    color: '#ffffff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 600,
  },
  skrChipText: { lineHeight: 1.3 },

  primaryBtn: uiButton('primary', { minHeight: 46, padding: '12px 20px', fontSize: 14, width: '100%' }),
  secondaryBtn: uiButton('secondary', { minHeight: 46, padding: '12px 20px', fontSize: 14, width: '100%' }),

  // Spinner (Clash-style yellow ring on parchment).
  spinnerWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    padding: '12px 0',
  },
  spinner: {
    width: 34, height: 34, borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'var(--terminal-border)',
    borderTopColor: 'var(--terminal-orange)',
    animation: 'rp-spin 0.9s linear infinite',
  },
  spinnerLabel: {
    fontSize: 13, fontWeight: 500, color: 'var(--terminal-text-muted)',
  },
};
