import { useState, useEffect, useRef, memo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as usePrivySolanaWallets, useCreateWallet } from '@privy-io/react-auth/solana';

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
import { useSend } from '../hooks/useGodot';
import { useFarcaster } from '../hooks/useFarcaster';
import { useDex, DEX_CONFIG } from '../contexts/DexContext';
import { colors, cartoonPanel, cartoonBtn } from '../styles/theme';

// Headless — runs the Privy auto-login effect regardless of which UI branch
// RegisterPanel is showing. This prevents deadlocks where the spinner hides
// the login button, so the effect never fires.
function PrivyAutoLogin({ onLoggedIn, onStatus }) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets: solWallets } = usePrivySolanaWallets();
  const { createWallet } = useCreateWallet();
  const fired = useRef(false);
  const createAttempted = useRef(false);

  useEffect(() => { onStatus({ ready, authenticated }); }, [ready, authenticated, onStatus]);

  // Reset guards when Privy logs out so re-login works without a page reload.
  useEffect(() => {
    if (!authenticated) {
      fired.current = false;
      createAttempted.current = false;
    }
  }, [authenticated]);

  useEffect(() => {
    if (fired.current) return;
    if (!authenticated) return;
    const w = (solWallets || []).find(x => x && x.walletClientType === 'privy') || (solWallets || [])[0];
    if (w && w.address) {
      fired.current = true;
      console.log('[privy] ✅ firing onLoggedIn with wallet:', w.address);
      onLoggedIn({ wallet: w.address, email: user?.email?.address || null });
      return;
    }
    if (!createAttempted.current && createWallet) {
      createAttempted.current = true;
      console.log('[privy] 🔨 calling createWallet()...');
      createWallet()
        .then(result => console.log('[privy] ✅ createWallet resolved:', result))
        .catch(err => {
          const msg = err?.message || '';
          if (msg.includes('already has an embedded wallet')) return;
          console.error('[privy] ❌ createWallet rejected:', err);
          createAttempted.current = false;
        });
    }
  }, [authenticated, solWallets, user, onLoggedIn, createWallet]);

  return null;
}

// Sub-component that calls Privy hooks. Only rendered when VITE_PRIVY_APP_ID is set,
// so the hooks always find a provider (rules-of-hooks-safe).
function PrivyLoginButton({ onLoggedIn }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets: solWallets } = usePrivySolanaWallets();
  const { createWallet } = useCreateWallet();
  const fired = useRef(false);
  const createAttempted = useRef(false);

  // Full state log — fires on every re-render of this component
  console.log('[privy] render', {
    ready,
    authenticated,
    hasCreateWallet: typeof createWallet === 'function',
    userId: user?.id || null,
    userEmail: user?.email?.address || null,
    linkedAccountsCount: user?.linkedAccounts?.length || 0,
    linkedAccountTypes: (user?.linkedAccounts || []).map(a => a.type),
    solWalletsCount: solWallets?.length || 0,
    solWallets: (solWallets || []).map(w => ({ addr: w?.address, type: w?.walletClientType })),
    firedOnce: fired.current,
    createAttempted: createAttempted.current,
  });

  useEffect(() => {
    console.log('[privy] effect run', { authenticated, solWalletsCount: solWallets?.length, fired: fired.current, createAttempted: createAttempted.current });
    if (fired.current) { console.log('[privy] already fired, skip'); return; }
    if (!authenticated) { console.log('[privy] not authenticated, skip'); return; }

    const w = solWallets.find(x => x && x.walletClientType === 'privy') || solWallets[0];
    console.log('[privy] wallet lookup result:', w ? { addr: w.address, type: w.walletClientType } : 'none');

    if (w && w.address) {
      fired.current = true;
      console.log('[privy] ✅ firing onLoggedIn with wallet:', w.address);
      onLoggedIn({ wallet: w.address, email: user?.email?.address || null });
      return;
    }

    if (!createAttempted.current && createWallet) {
      createAttempted.current = true;
      console.log('[privy] 🔨 calling createWallet()...');
      createWallet()
        .then(result => {
          console.log('[privy] ✅ createWallet resolved:', result);
        })
        .catch(err => {
          // Returning users already have an embedded wallet — not an error,
          // the existing wallet was already surfaced via useWallets().
          const msg = err?.message || '';
          if (msg.includes('already has an embedded wallet')) return;
          console.error('[privy] ❌ createWallet rejected:', err);
          createAttempted.current = false;
        });
    } else if (!createWallet) {
      console.warn('[privy] createWallet hook returned undefined');
    } else {
      console.log('[privy] createWallet already attempted, waiting for wallet to appear in useWallets()...');
    }
  }, [authenticated, solWallets, user, onLoggedIn, createWallet]);

  if (!ready) return null;
  return (
    <button
      style={{...cartoonBtn('#e8b830', '#b8860b'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10}}
      onClick={() => {
        if (authenticated) {
          logout();
          fired.current = false;
        } else {
          login();
        }
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
      {authenticated ? 'LOGOUT PRIVY' : 'LOGIN WITH PRIVY'}
    </button>
  );
}

function RegisterPanel() {
  const { sendToGodot } = useSend();
  const { publicKey, connected, connecting, select, wallets, connect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { isInFrame, user: fcUser } = useFarcaster();
  const { dex, setDex } = useDex();
  const privyEnabled = !!import.meta.env.VITE_PRIVY_APP_ID;
  const [name, setName] = useState('');
  const [privyStatus, setPrivyStatus] = useState({ ready: !privyEnabled, authenticated: false });
  const [waitingForGodot, setWaitingForGodot] = useState(false);
  // dexPicked: has the user explicitly chosen a DEX? localStorage['clash_dex_picked']
  // persists across sessions so returning users skip the picker.
  const [dexPicked, setDexPicked] = useState(() => {
    try { return localStorage.getItem('clash_dex_picked') === '1'; } catch { return false; }
  });
  const triedWalletLogin = useRef(false);
  const triedFcLogin = useRef(false);
  const triedPrivyLogin = useRef(false);

  const commitDex = (newDex) => {
    setDex(newDex);
    setDexPicked(true);
    try { localStorage.setItem('clash_dex_picked', '1'); } catch {}
  };

  const handlePrivyLoggedIn = ({ wallet, email }) => {
    if (triedPrivyLogin.current) return;
    triedPrivyLogin.current = true;
    setWaitingForGodot(true);
    // For Avantis (custodial) we don't send the Privy-Solana wallet — it would
    // just get linked to an account the user can never trade from. Pacifica
    // path keeps linking the Solana wallet so trading signatures work.
    const derivedName = email ? email.split('@')[0].slice(0, 20) : ('player_' + wallet.slice(0, 6));
    const payload = dex === 'avantis'
      ? { name: derivedName, dex: 'avantis' }
      : { name: derivedName, wallet, dex: 'pacifica' };
    sendToGodot('register', payload);
    // Safety: drop the spinner after 8s if Godot never fires `registered` —
    // otherwise a silent failure traps the user forever.
    setTimeout(() => setWaitingForGodot(false), 8000);
  };

  // Auto-login by wallet when connected (Pacifica-only; Avantis is custodial
  // and doesn't need a browser-side Solana wallet).
  useEffect(() => {
    if (dex === 'avantis') return;
    if (connected && publicKey && !triedWalletLogin.current) {
      triedWalletLogin.current = true;
      sendToGodot('wallet_connected', { wallet: publicKey.toBase58() });
    }
  }, [connected, publicKey, sendToGodot, dex]);

  // Auto-register for Farcaster users. Flow depends on picked DEX:
  //   Pacifica → register with Farcaster's Solana wallet (used for trading)
  //   Avantis  → register without wallet (server creates custodial Base addr)
  useEffect(() => {
    if (!isInFrame || !fcUser || triedFcLogin.current) return;

    const fcName = String(fcUser.username || fcUser.displayName || 'fc_' + fcUser.fid);

    if (dex === 'avantis') {
      triedFcLogin.current = true;
      sendToGodot('register', { name: fcName, dex: 'avantis' });
      return;
    }

    if (connected && publicKey) {
      triedFcLogin.current = true;
      sendToGodot('register', { name: fcName, wallet: publicKey.toBase58(), dex: 'pacifica' });
      return;
    }

    // Pacifica: wait up to 3s for Farcaster's embedded Solana wallet, then
    // fall back to registering without a wallet.
    const fallback = setTimeout(() => {
      if (triedFcLogin.current) return;
      triedFcLogin.current = true;
      sendToGodot('register', { name: fcName, dex: 'pacifica' });
    }, 3000);
    return () => clearTimeout(fallback);
  }, [isInFrame, fcUser, connected, publicKey, sendToGodot, dex]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    // Pacifica path requires a connected Solana wallet for trading signatures.
    if (dex === 'pacifica') {
      if (!connected || !publicKey) return;
      sendToGodot('register', { name: name.trim(), wallet: publicKey.toBase58(), dex: 'pacifica' });
      return;
    }
    // Avantis path: backend generates a custodial Base wallet. Optionally
    // include the Solana/Privy wallet for identity but don't require it.
    const payload = { name: name.trim(), dex: 'avantis' };
    if (connected && publicKey) payload.wallet = publicKey.toBase58();
    sendToGodot('register', payload);
  };

  // In Farcaster frame with user — auto-registering, show loading
  if (isInFrame && fcUser) {
    return (
      <div style={styles.overlay}>
        <div style={styles.panel}>
          <Spinner label={`Joining as ${fcUser.username || fcUser.displayName}…`} />
        </div>
      </div>
    );
  }

  // Hide the form while auth is still resolving on page load — prevents the
  // "Join the Battle" flash when a returning user's session is about to restore.
  const authInProgress =
    waitingForGodot ||
    connecting ||
    (privyEnabled && !privyStatus.ready) ||
    (privyEnabled && privyStatus.authenticated && !triedPrivyLogin.current);

  if (authInProgress) {
    return (
      <>
        {privyEnabled && <PrivyAutoLogin onLoggedIn={handlePrivyLoggedIn} onStatus={setPrivyStatus} />}
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <Spinner label="Signing you in…" />
          </div>
        </div>
      </>
    );
  }

  // Step 1: DEX picker (shown before any wallet/login). Farcaster auto-flow
  // skips this — picks default 'pacifica' unless localStorage says otherwise.
  if (!dexPicked && !(isInFrame && fcUser)) {
    return (
      <div style={styles.overlay}>
        {privyEnabled && <PrivyAutoLogin onLoggedIn={handlePrivyLoggedIn} onStatus={setPrivyStatus} />}
        <div style={{...styles.panel, width: 360}}>
          <div style={styles.icon}>⚔️</div>
          <h2 style={styles.title}>Choose your Perp DEX</h2>
          <p style={styles.desc}>Your trading venue for the whole campaign.<br />You can switch any time in your profile.</p>
          <div style={{width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4}}>
            {Object.values(DEX_CONFIG).map(cfg => (
              <button
                key={cfg.id}
                type="button"
                onClick={() => commitDex(cfg.id)}
                onMouseDown={e => { e.currentTarget.style.transform = 'translateY(2px)'; e.currentTarget.style.boxShadow = `0 2px 0 ${cfg.borderColor}, 0 3px 6px rgba(0,0,0,0.4)`; }}
                onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 5px 0 ${cfg.borderColor}, 0 7px 14px rgba(0,0,0,0.45)`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 5px 0 ${cfg.borderColor}, 0 7px 14px rgba(0,0,0,0.45)`; }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 16,
                  border: `3px solid ${cfg.borderColor}`,
                  background: `linear-gradient(180deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`,
                  boxShadow: `0 5px 0 ${cfg.borderColor}, 0 7px 14px rgba(0,0,0,0.45)`,
                  cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.1s',
                  outline: 'none', textAlign: 'left', color: '#fff',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  fontSize: 32,
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>{cfg.emoji}</span>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{
                    fontSize: 17, fontWeight: 900, color: '#fff',
                    letterSpacing: '0.8px',
                    textShadow: '0 2px 0 rgba(0,0,0,0.35)',
                  }}>{cfg.label}</div>
                  <div style={{
                    fontSize: 11, fontWeight: 800,
                    color: 'rgba(255,255,255,0.88)',
                    marginTop: 2,
                    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
                  }}>
                    {cfg.chain} · {cfg.id === 'avantis' ? 'CUSTODIAL · EMAIL' : 'SELF-CUSTODY · WALLET'}
                  </div>
                </div>
                <span style={{
                  fontSize: 26, color: '#fff', fontWeight: 900,
                  textShadow: '0 2px 0 rgba(0,0,0,0.3)',
                }}>›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Either Pacifica (wallet-connect path) or Avantis (custodial path).
  const dexCfg = DEX_CONFIG[dex] || DEX_CONFIG.pacifica;

  // Small "change DEX" pill for the second screen — matches cartoon panel style
  const dexHeader = (
    <div style={{display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'stretch', justifyContent: 'space-between'}}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 10,
        background: `linear-gradient(180deg, ${dexCfg.color} 0%, ${dexCfg.colorDark} 100%)`,
        border: `2px solid ${dexCfg.borderColor}`,
        boxShadow: `0 2px 0 ${dexCfg.borderColor}`,
      }}>
        <span style={{fontSize: 14, filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.35))'}}>{dexCfg.emoji}</span>
        <span style={{
          fontSize: 11, fontWeight: 900, color: '#fff',
          letterSpacing: '0.8px',
          textShadow: '0 1px 0 rgba(0,0,0,0.35)',
        }}>{dexCfg.label}</span>
      </div>
      <button
        type="button"
        onClick={() => { setDexPicked(false); try { localStorage.removeItem('clash_dex_picked'); } catch {} }}
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

  return (
    <div style={styles.overlay}>
      {privyEnabled && <PrivyAutoLogin onLoggedIn={handlePrivyLoggedIn} onStatus={setPrivyStatus} />}
      <div style={styles.panel}>
        {dexHeader}
        <div style={styles.icon}>⚔️</div>
        <h2 style={styles.title}>Join the Battle</h2>

        {dex === 'avantis' ? (
          // ── AVANTIS PATH: custodial, no Solana wallet required ──
          <form onSubmit={handleSubmit} style={styles.form}>
            <p style={{...styles.desc, marginTop: 0}}>
              Enter a nickname. A custodial Base wallet will be created for your perps trading.
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
            {privyEnabled && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', margin: '2px 0',
                }}>
                  <div style={{flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #6D4C2A, transparent)'}} />
                  <span style={{
                    fontSize: 10, color: '#e8b830', fontWeight: 900,
                    letterSpacing: '1px', textShadow: '0 1px 0 rgba(0,0,0,0.5)',
                  }}>OR EMAIL</span>
                  <div style={{flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #6D4C2A, transparent)'}} />
                </div>
                <PrivyLoginButton onLoggedIn={handlePrivyLoggedIn} />
              </>
            )}
          </form>
        ) : !connected ? (
          // ── PACIFICA PATH, step 1: wallet not connected ──
          <>
            <p style={styles.desc}>Connect your Solana wallet to start playing</p>
            <button
              style={{...cartoonBtn('#9945FF', '#7B36CC'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10}}
              onClick={() => {
                if (isInFrame) {
                  const fc = wallets.find(w => w.adapter.name === 'Farcaster');
                  if (fc) { select(fc.adapter.name); setTimeout(() => connect().catch(() => {}), 100); }
                  else openWalletModal(true);
                } else {
                  openWalletModal(true);
                }
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="2" y="6" width="20" height="14" rx="3"/><path d="M16 14h.01"/><path d="M2 10h20"/></svg>
              CONNECT WALLET
            </button>
            {privyEnabled && <PrivyLoginButton onLoggedIn={handlePrivyLoggedIn} />}
          </>
        ) : (
          // ── PACIFICA PATH, step 2: wallet connected, ask name ──
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.walletBadge}>
              <div style={styles.dot} />
              <span style={styles.walletAddr}>
                {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-4)}
              </span>
            </div>

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
        )}
      </div>
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
  dexLabel: {
    fontSize: 11, fontWeight: 800, color: '#a3906a',
    textTransform: 'uppercase', letterSpacing: '1px', alignSelf: 'flex-start',
  },
  dexSelector: {
    display: 'flex', gap: 10, width: '100%',
  },
};
