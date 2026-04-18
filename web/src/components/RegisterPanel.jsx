import { useState, useEffect, useRef, memo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePrivy, useWallets as usePrivyEvmWallets } from '@privy-io/react-auth';
import { useWallets as usePrivySolanaWallets, useCreateWallet } from '@privy-io/react-auth/solana';
import EvmWalletModal from './EvmWalletModal';
import { useEvmWallet } from '../contexts/EvmWalletContext';

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
import { useFarcaster, getFarcasterEthProvider } from '../hooks/useFarcaster';
import { useDex, DEX_CONFIG } from '../contexts/DexContext';
import { colors, cartoonPanel, cartoonBtn } from '../styles/theme';

// Headless — runs the Privy auto-login effect regardless of which UI branch
// RegisterPanel is showing. This prevents deadlocks where the spinner hides
// the login button, so the effect never fires.
//
// Resolves Privy embedded wallet address per DEX:
//   pacifica → useWallets() from @privy-io/react-auth/solana
//   avantis  → useWallets() from @privy-io/react-auth (EVM-only)
//
// NOTE: the EVM useWallets() hook returns only Ethereum wallets — no
// `chainType` field to filter on. Previous `w.chainType === 'ethereum'`
// filter returned empty and caused "stuck on signing in" for Avantis.
function PrivyAutoLogin({ onLoggedIn, onStatus, dex }) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets: solWallets } = usePrivySolanaWallets();
  const { wallets: evmWallets } = usePrivyEvmWallets();
  const { createWallet } = useCreateWallet();
  const fired = useRef(false);
  const createAttempted = useRef(false);

  useEffect(() => { onStatus({ ready, authenticated }); }, [ready, authenticated, onStatus]);

  // Reset guards when Privy logs out OR when DEX changes so the user can
  // pick the other DEX and re-auth without a page reload.
  useEffect(() => {
    if (!authenticated) {
      fired.current = false;
      createAttempted.current = false;
    }
  }, [authenticated]);
  useEffect(() => {
    fired.current = false;
  }, [dex]);

  useEffect(() => {
    if (fired.current) return;
    if (!authenticated) return;

    // Pick wallet based on selected DEX. Prefer embedded (walletClientType='privy')
    // but fall back to any connected wallet of the right chain family.
    const pool = dex === 'avantis' ? (evmWallets || []) : (solWallets || []);
    const picked = pool.find(w => w && w.walletClientType === 'privy') || pool[0];

    if (picked && picked.address) {
      fired.current = true;
      console.log(`[privy] firing onLoggedIn for ${dex} wallet:`, picked.address);
      onLoggedIn({
        wallet: picked.address,
        chain: dex === 'avantis' ? 'base' : 'solana',
        email: user?.email?.address || null,
      });
      return;
    }
    // Email login done but no wallet yet — poke Privy to create an embedded
    // one. The `useCreateWallet` hook from the solana entrypoint creates the
    // Solana wallet; the EVM embedded wallet is auto-created by the provider
    // config (`embeddedWallets.ethereum.createOnLogin`) so we only call it
    // for the Solana path.
    if (dex !== 'avantis' && !createAttempted.current && createWallet) {
      createAttempted.current = true;
      createWallet()
        .catch(err => {
          const msg = err?.message || '';
          if (msg.includes('already has an embedded wallet')) return;
          console.error('[privy] createWallet rejected:', err);
          createAttempted.current = false;
        });
    }
  }, [authenticated, solWallets, evmWallets, user, onLoggedIn, createWallet, dex]);

  return null;
}

// Sub-component that calls Privy hooks. Only rendered when VITE_PRIVY_APP_ID is set,
// so the hooks always find a provider (rules-of-hooks-safe).
//
// variant: 'default' → single "Login with Privy" email button
//          'avantis' → renders two buttons: "Sign in with Email" (Privy) and
//                      "Connect Wallet" (opens custom EvmWalletModal via
//                      onRequestEvmConnect prop — NOT through Privy).
//
// Wallet detection / auto-register is handled by PrivyAutoLogin.
function PrivyLoginButton({ variant = 'default', onRequestEvmConnect }) {
  const { ready, authenticated, login, logout } = usePrivy();

  if (!ready) return null;

  const handleEmail = () => {
    if (authenticated) { logout(); return; }
    try { login({ loginMethods: ['email'] }); } catch { login(); }
  };

  if (variant === 'avantis') {
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 10}}>
        <button
          style={{...cartoonBtn('#e8b830', '#b8860b'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10}}
          onClick={handleEmail}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          {authenticated ? 'LOGOUT' : 'SIGN IN WITH EMAIL'}
        </button>
        {!authenticated && (
          <button
            style={{...cartoonBtn('#0EA5E9', '#0284C7'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10}}
            onClick={onRequestEvmConnect}
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
    );
  }

  return (
    <button
      style={{...cartoonBtn('#e8b830', '#b8860b'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10}}
      onClick={handleEmail}
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
  const { setExternalProvider: setEvmProvider } = useEvmWallet();
  const privyEnabled = !!import.meta.env.VITE_PRIVY_APP_ID;
  const [name, setName] = useState('');
  const [privyStatus, setPrivyStatus] = useState({ ready: !privyEnabled, authenticated: false });
  const [waitingForGodot, setWaitingForGodot] = useState(false);
  const [evmModalOpen, setEvmModalOpen] = useState(false);
  // Holds the Avantis auth result (wallet + email) between the login step
  // and the name-input step. `null` = still on the login screen.
  const [avantisAuth, setAvantisAuth] = useState(null);
  // dexPicked: has the user explicitly chosen a DEX? localStorage['clash_dex_picked']
  // persists across sessions so returning users skip the picker.
  const [dexPicked, setDexPicked] = useState(() => {
    try { return localStorage.getItem('clash_dex_picked') === '1'; } catch { return false; }
  });
  const triedWalletLogin = useRef(false);
  // State (not ref) so `authInProgress` can read it during render without
  // tripping the react-hooks/refs rule. PrivyAutoLogin's own `fired.current`
  // guard prevents the double-fire window where a batched state update would
  // be too slow.
  const [triedPrivyLogin, setTriedPrivyLogin] = useState(false);

  const commitDex = (newDex) => {
    setDex(newDex);
    setDexPicked(true);
    try { localStorage.setItem('clash_dex_picked', '1'); } catch { /* storage disabled */ }
  };

  const handlePrivyLoggedIn = ({ wallet, email, chain }) => {
    if (triedPrivyLogin) return;
    // Avantis: show a name-input step ONLY for new wallets. Returning
    // wallets are auto-logged-in (their name is already set in DB and won't
    // change via register — so asking for it again is pointless UX noise).
    if (dex === 'avantis') {
      checkExistingAndContinue(wallet, {
        email, chain: chain || 'base', source: 'privy',
      });
      return;
    }
    // Pacifica email path: register immediately with derived name — the user
    // already provided trust by connecting a wallet or email account.
    setTriedPrivyLogin(true);
    setWaitingForGodot(true);
    const derivedName = email
      ? email.split('@')[0].slice(0, 20)
      : ('player_' + (wallet || '').slice(0, 6));
    sendToGodot('register', { name: derivedName, wallet, dex: 'pacifica' });
    setTimeout(() => setWaitingForGodot(false), 8000);
  };

  // Helper: probe /players/login-wallet. Pre-fills the name form with the
  // existing account's name (if any) so a returning user can press PLAY to
  // continue, or edit to rename. If no account exists yet, fall back to an
  // email- or wallet-derived suggestion for first-time users.
  const checkExistingAndContinue = async (wallet, { email = null, chain = 'base', source = 'external' } = {}) => {
    let existingName = null;
    try {
      const r = await fetch('/api/players/login-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
      });
      if (r.ok) {
        const existing = await r.json().catch(() => ({}));
        existingName = existing?.name || null;
      }
    } catch { /* network error — treat as new user */ }
    const suggested = existingName
      || (email ? email.split('@')[0].slice(0, 20) : '');
    setAvantisAuth({
      wallet, email, chain, source,
      existingName, // signals UI that this is a rename, not first-time
    });
    setName(suggested);
  };

  // External EVM wallet connected via custom modal (not Privy). Skip name
  // prompt for returning wallets.
  const handleEvmWalletConnected = ({ address, walletName, provider }) => {
    setEvmModalOpen(false);
    // Publish the provider to EvmWalletContext so useAvantis / FuturesPanel
    // can build a viem walletClient and sign trades from this wallet.
    if (provider && address) setEvmProvider(provider, address);
    if (triedPrivyLogin) return;
    checkExistingAndContinue(address, {
      chain: 'base', source: walletName || 'external',
    });
  };

  // Commit the Avantis registration with the name the user typed.
  const submitAvantisRegister = (e) => {
    e?.preventDefault?.();
    if (!avantisAuth) return;
    if (name.trim().length < 2) return;
    setTriedPrivyLogin(true);
    setWaitingForGodot(true);
    sendToGodot('register', {
      name: name.trim(),
      wallet: avantisAuth.wallet,
      dex: 'avantis',
      chain: avantisAuth.chain,
      walletSource: avantisAuth.source,
    });
    setTimeout(() => setWaitingForGodot(false), 8000);
  };

  // Auto-login by wallet when connected (Pacifica-only; Avantis is custodial
  // and doesn't need a browser-side Solana wallet). Guard on `dexPicked` so
  // Farcaster's auto-connected Solana wallet (autoConnect=true in
  // WalletProvider) doesn't secretly log the user in as Pacifica before they
  // choose their DEX.
  useEffect(() => {
    if (dex === 'avantis') return;
    if (!dexPicked) return;
    if (connected && publicKey && !triedWalletLogin.current) {
      triedWalletLogin.current = true;
      sendToGodot('wallet_connected', { wallet: publicKey.toBase58() });
    }
  }, [connected, publicKey, sendToGodot, dex, dexPicked]);

  // Auto-register for Farcaster users. Flow depends on picked DEX:
  //   Pacifica → register with Farcaster's Solana wallet (sign each trade).
  //              If no Solana wallet is exposed within ~3s, we DON'T silently
  //              register a walletless account any more — the UI falls
  //              through to the normal picker so the user can connect an
  //              external wallet or pick a different DEX.
  //   Avantis  → try sdk.wallet.getEthereumProvider() (then legacy
  //              ethProvider). If present, request accounts and register.
  //              If absent (Warpcast variants that don't expose EVM), we
  //              fall through to the normal Avantis login UI (Privy email +
  //              external wallet) instead of a silent walletless register.
  const [fcFallback, setFcFallback] = useState(false); // pacifica FC wallet timeout
  const [fcNoEvm, setFcNoEvm] = useState(false);       // avantis FC EVM unavailable
  const triedFcPacifica = useRef(false);
  const triedFcAvantis = useRef(false);
  useEffect(() => {
    if (!isInFrame || !fcUser) return;
    if (!dexPicked) return;

    const fcName = String(fcUser.username || fcUser.displayName || 'fc_' + fcUser.fid);

    if (dex === 'avantis') {
      if (triedFcAvantis.current) return;
      triedFcAvantis.current = true;
      (async () => {
        const prov = await getFarcasterEthProvider();
        if (prov) {
          try {
            const accounts = await prov.request({ method: 'eth_requestAccounts' });
            const addr = accounts && accounts[0];
            if (addr) {
              setEvmProvider(prov, addr);
              // Surface wallet + rename opportunity instead of silent register.
              // checkExistingAndContinue pre-fills the saved name for returning
              // users; new users pick their display name before PLAY.
              checkExistingAndContinue(addr, {
                chain: 'base', source: 'farcaster',
              });
              return;
            }
          } catch (e) {
            console.warn('[farcaster] eth_requestAccounts failed:', e?.message || e);
          }
        }
        // No EVM provider from Farcaster host → show normal Avantis UI
        // (Privy email + external wallet modal). User can pick how to connect.
        setFcNoEvm(true);
      })();
      return;
    }

    if (triedFcPacifica.current) return;

    if (connected && publicKey) {
      triedFcPacifica.current = true;
      sendToGodot('register', { name: fcName, wallet: publicKey.toBase58(), dex: 'pacifica' });
      return;
    }

    // Pacifica: wait up to 3s for Farcaster's embedded Solana wallet. If it
    // doesn't appear, show the normal connect UI rather than registering a
    // walletless account (previous behaviour left the user unable to trade).
    const fallbackTimer = setTimeout(() => {
      if (triedFcPacifica.current) return;
      setFcFallback(true);
    }, 3000);
    return () => clearTimeout(fallbackTimer);
  }, [isInFrame, fcUser, connected, publicKey, sendToGodot, dex, setEvmProvider, dexPicked]);

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

  // Farcaster + DEX picked: show spinner ONLY while auto-register is in flight.
  // If Farcaster's host doesn't expose a matching wallet (fcNoEvm for Avantis
  // / fcFallback for Pacifica), fall through to the normal UI so the user can
  // connect a wallet themselves. If the Avantis path already resolved and we
  // moved to the name-input step (`avantisAuth` set), also fall through — the
  // avantisAuth branch below renders the wallet badge + name form so the user
  // sees exactly which wallet is being used instead of an opaque spinner.
  if (isInFrame && fcUser && dexPicked && !avantisAuth && !fcNoEvm && !fcFallback) {
    return (
      <div style={styles.overlay}>
        <div style={styles.panel}>
          <Spinner label={`Joining ${dex === 'avantis' ? 'Avantis' : 'Pacifica'} as ${fcUser.username || fcUser.displayName}…`} />
        </div>
      </div>
    );
  }

  // Hide the form while auth is still resolving on page load — prevents the
  // "Join the Battle" flash when a returning user's session is about to restore.
  // For Avantis on the name-input step (`avantisAuth` set), DO NOT count the
  // Privy authenticated state as "in progress" — the user needs to fill the
  // form, we're not waiting on Privy anymore.
  const authInProgress =
    waitingForGodot ||
    connecting ||
    (privyEnabled && !privyStatus.ready) ||
    (privyEnabled && privyStatus.authenticated && !triedPrivyLogin && dex !== 'avantis' && !avantisAuth);

  if (authInProgress) {
    return (
      <>
        {privyEnabled && <PrivyAutoLogin onLoggedIn={handlePrivyLoggedIn} onStatus={setPrivyStatus} dex={dex} />}
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <Spinner label="Signing you in…" />
          </div>
        </div>
      </>
    );
  }

  // Step 1: DEX picker (shown before any wallet/login). Farcaster users also
  // get to choose — earlier we auto-picked Pacifica for them which locked
  // users into one DEX on first open. Returning users (clash_dex_picked=1
  // in localStorage) skip the picker.
  if (!dexPicked) {
    return (
      <div style={styles.overlay}>
        {privyEnabled && <PrivyAutoLogin onLoggedIn={handlePrivyLoggedIn} onStatus={setPrivyStatus} dex={dex} />}
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
                <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                    <img
                      src={cfg.logo}
                      alt={cfg.label}
                      style={{
                        height: cfg.logoIsWordmark ? 24 : 28,
                        width: 'auto',
                        maxWidth: '100%',
                        objectFit: 'contain',
                        objectPosition: 'left center',
                        filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                      }}
                    />
                    {!cfg.logoIsWordmark && (
                      <span style={{
                        fontSize: 20, fontWeight: 900, color: '#fff',
                        letterSpacing: '0.8px',
                        textShadow: '0 2px 0 rgba(0,0,0,0.35)',
                        textTransform: 'lowercase',
                      }}>{cfg.label.toLowerCase()}</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 800,
                    color: 'rgba(255,255,255,0.88)',
                    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
                    letterSpacing: '0.3px',
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
        <img
          src={dexCfg.logo}
          alt={dexCfg.label}
          style={{
            height: dexCfg.logoIsWordmark ? 12 : 14,
            width: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.35))',
          }}
        />
        {!dexCfg.logoIsWordmark && (
          <span style={{
            fontSize: 11, fontWeight: 900, color: '#fff',
            letterSpacing: '0.8px',
            textShadow: '0 1px 0 rgba(0,0,0,0.35)',
          }}>{dexCfg.label}</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => { setDexPicked(false); try { localStorage.removeItem('clash_dex_picked'); } catch { /* storage disabled */ } }}
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
      {privyEnabled && <PrivyAutoLogin onLoggedIn={handlePrivyLoggedIn} onStatus={setPrivyStatus} dex={dex} />}
      <div style={styles.panel}>
        {dexHeader}
        <div style={styles.icon}>⚔️</div>
        <h2 style={styles.title}>Join the Battle</h2>

        {dex === 'avantis' ? (
          // ── AVANTIS PATH: identity required (Privy email OR EVM wallet).
          //    Farcaster now works — the useEffect above auto-requests the
          //    frame's EVM provider. If it fails, user sees the usual CTAs.
          avantisAuth ? (
            // Auth succeeded — user picks a display name before we register.
            // For returning users (existingName set) the name is pre-filled;
            // they can press PLAY unchanged to auto-login, or edit to rename.
            <form onSubmit={submitAvantisRegister} style={styles.form}>
              <div style={styles.walletBadge}>
                <div style={styles.dot} />
                <span style={styles.walletAddr}>
                  {avantisAuth.wallet.slice(0, 6)}…{avantisAuth.wallet.slice(-4)}
                </span>
              </div>
              {avantisAuth.existingName ? (
                <p style={{...styles.desc, margin: 0, fontSize: 12}}>
                  Welcome back — press PLAY to continue, or edit to rename.
                </p>
              ) : (
                <p style={{...styles.desc, margin: 0, fontSize: 12}}>
                  Pick a display name for the leaderboard.
                </p>
              )}
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
              <button
                type="button"
                onClick={() => { setAvantisAuth(null); setName(''); }}
                style={{
                  background: 'transparent', border: 'none', color: '#a3906a',
                  fontSize: 11, fontWeight: 800, letterSpacing: '0.5px',
                  cursor: 'pointer', padding: '4px 8px',
                }}
              >
                ← BACK
              </button>
            </form>
          ) : (
            <>
              <p style={{...styles.desc, marginTop: 0}}>
                Sign in with email or connect a Base (EVM) wallet.<br />
                Trades are signed by your own wallet — we never hold your keys.
              </p>
              {privyEnabled ? (
                <PrivyLoginButton
                  variant="avantis"
                  onRequestEvmConnect={() => setEvmModalOpen(true)}
                />
              ) : (
                // Privy disabled — still allow external wallet connect.
                <button
                  style={{...cartoonBtn('#0EA5E9', '#0284C7'), width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10}}
                  onClick={() => setEvmModalOpen(true)}
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
          )
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
            {privyEnabled && <PrivyLoginButton />}
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
      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        onConnected={handleEvmWalletConnected}
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
  dexLabel: {
    fontSize: 11, fontWeight: 800, color: '#a3906a',
    textTransform: 'uppercase', letterSpacing: '1px', alignSelf: 'flex-start',
  },
  dexSelector: {
    display: 'flex', gap: 10, width: '100%',
  },
};
