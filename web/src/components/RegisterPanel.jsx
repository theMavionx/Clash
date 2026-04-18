import { memo, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import EvmWalletModal from './EvmWalletModal';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { DEX_CONFIG } from '../contexts/DexContext';
import { useAuthFlow } from '../auth/useAuthFlow';
import { colors, cartoonPanel, cartoonBtn } from '../styles/theme';

// RegisterPanel is purely presentational now — all auth decisions live in
// useAuthFlow. The component renders one of a handful of states and wires
// user actions back through `actions`. Adding a new wallet source means
// adding a resolver in auth/resolvers.js; nothing here should change.

function Spinner({ label }) {
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14}}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        border: '4px solid rgba(92,58,33,0.15)',
        borderTopColor: '#e8b830',
        animation: 'rp-spin 0.9s linear infinite',
      }} />
      {label && <div style={{fontSize: 14, fontWeight: 800, color: '#a3906a'}}>{label}</div>}
      <style>{`@keyframes rp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function DexPicker({ onPick }) {
  return (
    <>
      <div style={styles.icon}>⚔️</div>
      <h2 style={styles.title}>Choose your Perp DEX</h2>
      <p style={styles.desc}>
        Your trading venue for the whole campaign.<br />
        You can switch any time in your profile.
      </p>
      <div style={{width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4}}>
        {Object.values(DEX_CONFIG).map(cfg => (
          <button
            key={cfg.id}
            type="button"
            onClick={() => onPick(cfg.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 16,
              border: `3px solid ${cfg.borderColor}`,
              background: `linear-gradient(180deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`,
              boxShadow: `0 5px 0 ${cfg.borderColor}, 0 7px 14px rgba(0,0,0,0.45)`,
              cursor: 'pointer', outline: 'none', textAlign: 'left', color: '#fff',
              fontFamily: 'inherit',
            }}
          >
            <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <img
                  src={cfg.logo}
                  alt={cfg.label}
                  style={{
                    height: cfg.logoIsWordmark ? 24 : 28,
                    width: 'auto', objectFit: 'contain', objectPosition: 'left center',
                    filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                  }}
                />
                {!cfg.logoIsWordmark && (
                  <span style={{
                    fontSize: 20, fontWeight: 900, color: '#fff',
                    letterSpacing: '0.8px', textShadow: '0 2px 0 rgba(0,0,0,0.35)',
                    textTransform: 'lowercase',
                  }}>{cfg.label.toLowerCase()}</span>
                )}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 800,
                color: 'rgba(255,255,255,0.88)',
                textShadow: '0 1px 0 rgba(0,0,0,0.3)', letterSpacing: '0.3px',
              }}>
                {cfg.chain} · {cfg.id === 'avantis' ? 'SELF-CUSTODY · EVM' : 'SELF-CUSTODY · SOLANA'}
              </div>
            </div>
            <span style={{fontSize: 26, color: '#fff', fontWeight: 900, textShadow: '0 2px 0 rgba(0,0,0,0.3)'}}>›</span>
          </button>
        ))}
      </div>
    </>
  );
}

function DexHeader({ dex, onChange }) {
  const cfg = DEX_CONFIG[dex] || DEX_CONFIG.pacifica;
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'stretch', justifyContent: 'space-between'}}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 10,
        background: `linear-gradient(180deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`,
        border: `2px solid ${cfg.borderColor}`,
        boxShadow: `0 2px 0 ${cfg.borderColor}`,
      }}>
        <img
          src={cfg.logo}
          alt={cfg.label}
          style={{
            height: cfg.logoIsWordmark ? 12 : 14,
            width: 'auto', objectFit: 'contain',
            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.35))',
          }}
        />
        {!cfg.logoIsWordmark && (
          <span style={{
            fontSize: 11, fontWeight: 900, color: '#fff',
            letterSpacing: '0.8px', textShadow: '0 1px 0 rgba(0,0,0,0.35)',
          }}>{cfg.label}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onChange}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1.5px solid #6D4C2A',
          color: '#e8b830',
          fontSize: 10, fontWeight: 900, letterSpacing: '0.5px',
          cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
          textShadow: '0 1px 0 rgba(0,0,0,0.35)',
        }}
      >← CHANGE</button>
    </div>
  );
}

function NameForm({ wallet, suggested, onSubmit }) {
  const [name, setName] = useState(suggested || '');
  const submit = (e) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    onSubmit(name);
  };
  return (
    <form onSubmit={submit} style={styles.form}>
      <div style={styles.walletBadge}>
        <div style={styles.dot} />
        <span style={styles.walletAddr}>
          {wallet.slice(0, 6)}…{wallet.slice(-4)}
        </span>
      </div>
      <p style={{...styles.desc, margin: 0, fontSize: 12}}>
        Pick a display name for the leaderboard.
      </p>
      <input
        style={styles.input}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Enter your name..."
        maxLength={20}
        autoFocus
      />
      <button
        type="submit"
        style={{...cartoonBtn('#43A047', '#2E7D32'), width: '100%', textAlign: 'center', opacity: name.trim().length < 2 ? 0.5 : 1}}
        disabled={name.trim().length < 2}
      >
        PLAY
      </button>
    </form>
  );
}

function ConnectPacifica({ onOpenWalletModal, onPrivyLogin, privyEnabled, privyAuthed }) {
  return (
    <>
      <p style={styles.desc}>Connect your Solana wallet to start playing</p>
      <button
        style={{...cartoonBtn('#9945FF', '#7B36CC'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10}}
        onClick={onOpenWalletModal}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <rect x="2" y="6" width="20" height="14" rx="3"/>
          <path d="M16 14h.01"/>
          <path d="M2 10h20"/>
        </svg>
        CONNECT WALLET
      </button>
      {privyEnabled && (
        <button
          style={{...cartoonBtn('#e8b830', '#b8860b'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10}}
          onClick={onPrivyLogin}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          {privyAuthed ? 'LOGOUT PRIVY' : 'LOGIN WITH PRIVY'}
        </button>
      )}
    </>
  );
}

function ConnectAvantis({ onOpenEvmModal, onPrivyLogin, privyEnabled, privyAuthed }) {
  return (
    <>
      <p style={{...styles.desc, marginTop: 0}}>
        Sign in with email or connect a Base (EVM) wallet.<br />
        Trades are signed by your own wallet — we never hold your keys.
      </p>
      {privyEnabled ? (
        <div style={{display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 10}}>
          <button
            style={{...cartoonBtn('#e8b830', '#b8860b'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10}}
            onClick={onPrivyLogin}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            {privyAuthed ? 'LOGOUT' : 'SIGN IN WITH EMAIL'}
          </button>
          {!privyAuthed && (
            <button
              style={{...cartoonBtn('#0EA5E9', '#0284C7'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10}}
              onClick={onOpenEvmModal}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="14" rx="3"/>
                <path d="M16 14h.01"/>
                <path d="M2 10h20"/>
              </svg>
              CONNECT WALLET
            </button>
          )}
        </div>
      ) : (
        <button
          style={{...cartoonBtn('#0EA5E9', '#0284C7'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10}}
          onClick={onOpenEvmModal}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="14" rx="3"/>
            <path d="M16 14h.01"/>
            <path d="M2 10h20"/>
          </svg>
          CONNECT WALLET
        </button>
      )}
    </>
  );
}

function RegisterPanel() {
  const {
    state, dex, isInFrame, fcUser, candidate, suggestedName,
    privyEnabled, privyAuthed, actions,
  } = useAuthFlow();

  // Wallet adapter — for the Solana connect modal + Farcaster Solana auto-select.
  const { select, wallets, connect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { setExternalProvider: setEvmProvider } = useEvmWallet();

  // EvmWalletModal is a one-shot dialog; local UI state only.
  const [evmModalOpen, setEvmModalOpen] = useState(false);
  const handleEvmConnected = useCallback(({ address, provider, rdns }) => {
    setEvmModalOpen(false);
    if (provider && address) setEvmProvider(provider, address, rdns, 'external');
    // useAuthFlow watches EvmWalletContext; it will pick up the new address
    // on the next render and fire register automatically.
  }, [setEvmProvider]);

  const openSolanaConnect = useCallback(() => {
    // Inside a Farcaster frame, prefer the FC Solana adapter if available;
    // otherwise fall back to the generic wallet-adapter modal.
    if (isInFrame) {
      const fc = (wallets || []).find(w => w.adapter.name === 'Farcaster');
      if (fc) { select(fc.adapter.name); setTimeout(() => connect().catch(() => {}), 100); return; }
    }
    openWalletModal(true);
  }, [isInFrame, wallets, select, connect, openWalletModal]);

  // Render by state.
  const body = (() => {
    switch (state) {
      case 'booting':
        return <Spinner label="Loading…" />;

      case 'pick_dex':
        return <DexPicker onPick={actions.pickDex} />;

      case 'auto_connecting':
        return (
          <Spinner
            label={isInFrame && fcUser
              ? `Joining ${dex === 'avantis' ? 'Avantis' : 'Pacifica'} as ${fcUser.username || fcUser.displayName}…`
              : 'Signing you in…'}
          />
        );

      case 'registering':
        return <Spinner label="Finalising…" />;

      case 'need_name':
        return (
          <NameForm
            wallet={candidate.wallet}
            suggested={suggestedName || ''}
            onSubmit={actions.submitName}
          />
        );

      case 'manual_connect':
      default:
        return dex === 'avantis' ? (
          <ConnectAvantis
            onOpenEvmModal={() => setEvmModalOpen(true)}
            onPrivyLogin={actions.loginWithPrivy}
            privyEnabled={privyEnabled}
            privyAuthed={privyAuthed}
          />
        ) : (
          <ConnectPacifica
            onOpenWalletModal={openSolanaConnect}
            onPrivyLogin={actions.loginWithPrivy}
            privyEnabled={privyEnabled}
            privyAuthed={privyAuthed}
          />
        );
    }
  })();

  // The DEX header (tag + "CHANGE" pill) shows once the user has picked a
  // DEX and is past the picker. Hidden during register submission so we
  // don't offer a "change" button mid-register.
  const showDexHeader =
    state === 'manual_connect' ||
    state === 'need_name' ||
    (state === 'auto_connecting' && !(isInFrame && fcUser));

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        {showDexHeader && <DexHeader dex={dex} onChange={actions.unpickDex} />}
        {body}
      </div>
      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        onConnected={handleEvmConnected}
      />
    </div>
  );
}

export default memo(RegisterPanel);

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 30, pointerEvents: 'all',
  },
  panel: {
    ...cartoonPanel,
    width: 340, display: 'flex', flexDirection: 'column',
    gap: 16, alignItems: 'center', padding: 28,
  },
  icon: { fontSize: 48 },
  title: {
    margin: 0, fontSize: 24, fontWeight: 900,
    color: colors.gold, textShadow: '0 2px 0 rgba(0,0,0,0.4)',
  },
  desc: {
    margin: 0, fontSize: 14, color: '#aaa', textAlign: 'center', fontWeight: 600,
  },
  form: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center',
  },
  walletBadge: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 16px', background: 'rgba(255,255,255,0.08)',
    borderRadius: 12, border: '2px solid #6D4C2A',
  },
  dot: {
    width: 10, height: 10, borderRadius: '50%',
    background: '#4CAF50', boxShadow: '0 0 6px #4CAF50',
  },
  walletAddr: {
    fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: '#ccc',
  },
  input: {
    width: '100%', padding: '12px 16px', borderRadius: 14,
    border: '3px solid #6D4C2A', background: '#1a1008',
    color: '#fff', fontSize: 18, fontWeight: 700,
    textAlign: 'center', outline: 'none', boxSizing: 'border-box',
  },
};
