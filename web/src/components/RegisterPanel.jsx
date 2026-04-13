import { useState, useEffect, useRef, memo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useSend } from '../hooks/useGodot';
import { useFarcaster } from '../hooks/useFarcaster';
import { colors, cartoonPanel, cartoonBtn } from '../styles/theme';

function RegisterPanel() {
  const { sendToGodot } = useSend();
  const { publicKey, connected, select, wallets, connect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { isInFrame, user: fcUser } = useFarcaster();
  const [name, setName] = useState('');
  const triedWalletLogin = useRef(false);
  const triedFcLogin = useRef(false);

  // Auto-login by wallet when connected (recovers account after cache clear)
  useEffect(() => {
    if (connected && publicKey && !triedWalletLogin.current) {
      triedWalletLogin.current = true;
      sendToGodot('wallet_connected', { wallet: publicKey.toBase58() });
    }
  }, [connected, publicKey, sendToGodot]);

  // Auto-register for Farcaster users.
  // Wait up to 3s for the embedded Solana wallet to connect so we can register
  // WITH the wallet — this is what links the Farcaster session to the same account
  // the user has on desktop (otherwise two separate accounts get created).
  useEffect(() => {
    if (!isInFrame || !fcUser || triedFcLogin.current) return;

    const fcName = String(fcUser.username || fcUser.displayName || 'fc_' + fcUser.fid);

    if (connected && publicKey) {
      triedFcLogin.current = true;
      sendToGodot('register', { name: fcName, wallet: publicKey.toBase58() });
      return;
    }

    // Wallet not ready yet — set a fallback timer so we don't hang forever
    const fallback = setTimeout(() => {
      if (triedFcLogin.current) return;
      triedFcLogin.current = true;
      sendToGodot('register', { name: fcName });
    }, 3000);
    return () => clearTimeout(fallback);
  }, [isInFrame, fcUser, connected, publicKey, sendToGodot]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!connected || !publicKey) return;
    if (name.trim().length < 2) return;
    sendToGodot('register', { name: name.trim(), wallet: publicKey.toBase58() });
  };

  // In Farcaster frame with user — auto-registering, show loading
  if (isInFrame && fcUser) {
    return (
      <div style={styles.overlay}>
        <div style={styles.panel}>
          <div style={styles.icon}>⚔️</div>
          <h2 style={styles.title}>Joining as {fcUser.username || fcUser.displayName}...</h2>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.icon}>⚔️</div>
        <h2 style={styles.title}>Join the Battle</h2>

        {!connected ? (
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
          </>
        ) : (
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
};
