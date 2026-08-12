import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePlayer } from '../hooks/useGodot';
import { useOptionalPrivy } from './PrivyAuthProvider';
import { uiButton, uiIconButton } from '../styles/theme';
import { makePrivySolanaWallet, pickPrivySolanaWallet } from '../lib/privySolanaWallet';
import {
  createClashSolOrder,
  decodeSanctumTransaction,
  executeClashSolOrder,
  formatTokenAtomics,
  getClashSolStatus,
  serializeSignedSanctumTransaction,
} from '../lib/sanctumLst';

const SANCTUM_LAUNCH_DOCS = 'https://learn.sanctum.so/docs/creating-your-own-lst-with-sanctum/the-setup-process-launching-your-lst';

function shortAddress(value) {
  const text = String(value || '');
  return text.length > 13 ? `${text.slice(0, 5)}…${text.slice(-5)}` : text;
}

function displayApy(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return `${(number <= 1 ? number * 100 : number).toFixed(2)}%`;
}

function SanctumLstPanel({ open, onClose }) {
  const externalWallet = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const privy = useOptionalPrivy();
  const player = usePlayer() || {};
  const [status, setStatus] = useState(null);
  const [amount, setAmount] = useState('0.1');
  const [order, setOrder] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [signature, setSignature] = useState('');

  const privyWalletRecord = useMemo(() => pickPrivySolanaWallet(privy), [privy]);
  const embeddedWallet = useMemo(
    () => makePrivySolanaWallet(privyWalletRecord, privy.solanaSignTransaction),
    [privyWalletRecord, privy.solanaSignTransaction],
  );
  const wallet = externalWallet?.connected && externalWallet?.publicKey && externalWallet?.signTransaction
    ? externalWallet
    : embeddedWallet;
  const walletAddress = wallet?.publicKey?.toBase58?.() || '';
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setStatus(null);
    setError('');
    setOrder(null);
    setSignature('');
    setPhase('idle');
    getClashSolStatus({ signal: controller.signal })
      .then(setStatus)
      .catch(fetchError => {
        if (fetchError?.name !== 'AbortError') setError(fetchError?.message || 'Could not load clashSOL status');
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    setOrder(null);
    setSignature('');
    setPhase('idle');
  }, [amount, walletAddress]);

  const resetQuoteIfExpired = useCallback(() => {
    if (order && Number(order.expiresAtMs) <= Date.now()) {
      setOrder(null);
      setPhase('idle');
      setError('Quote expired. Review the current rate again.');
      return true;
    }
    return false;
  }, [order]);

  const reviewOrder = useCallback(async () => {
    if (!walletAddress) {
      setWalletModalVisible(true);
      return;
    }
    if (!token) {
      setError('Game session is not ready. Reopen the shop and try again.');
      return;
    }
    setError('');
    setSignature('');
    setPhase('quoting');
    try {
      const nextOrder = await createClashSolOrder({
        wallet: walletAddress,
        amountSol: amount,
        slippageBps: 30,
        token,
      });
      setOrder(nextOrder);
      setPhase('review');
    } catch (orderError) {
      setPhase('idle');
      setError(orderError?.message || 'Could not create a Sanctum quote');
    }
  }, [amount, setWalletModalVisible, token, walletAddress]);

  const confirmOrder = useCallback(async () => {
    if (!order || !wallet?.signTransaction || resetQuoteIfExpired()) return;
    setError('');
    setPhase('signing');
    try {
      const unsigned = decodeSanctumTransaction(order.transaction);
      const signed = await wallet.signTransaction(unsigned);
      setPhase('submitting');
      const result = await executeClashSolOrder({
        orderId: order.orderId,
        signedTransaction: serializeSignedSanctumTransaction(signed),
        token,
      });
      setSignature(result.signature);
      setPhase('success');
    } catch (executeError) {
      setPhase('review');
      const rejected = /reject|declin|cancel/i.test(String(executeError?.message || ''));
      setError(rejected ? 'Transaction was cancelled in the wallet.' : (executeError?.message || 'Could not submit the clashSOL transaction'));
    }
  }, [order, resetQuoteIfExpired, token, wallet]);

  const connectWallet = useCallback(() => setWalletModalVisible(true), [setWalletModalVisible]);

  if (!open) return null;
  const apy = displayApy(status?.apy);
  const available = status?.available === true;
  const busy = ['quoting', 'signing', 'submitting'].includes(phase);

  return (
    <div style={styles.overlay} onClick={onClose} role="presentation">
      <section style={styles.panel} onClick={event => event.stopPropagation()} aria-label="clashSOL staking">
        <button type="button" style={styles.close} onClick={onClose} aria-label="Close clashSOL panel">×</button>
        <header style={styles.hero}>
          <div style={styles.logoStack}>
            <img src="/tokens/SOL.svg" alt="Solana" style={styles.solLogo} />
            <img src="/icons/icon-512.png" alt="Clash" style={styles.clashLogo} />
          </div>
          <div>
            <div style={styles.eyebrow}>POWERED BY SANCTUM</div>
            <h2 style={styles.title}>Stake SOL. Receive clashSOL.</h2>
            <p style={styles.subtitle}>Liquid staking for the Clash community — keep a transferable token while SOL earns staking yield.</p>
          </div>
        </header>

        {!status && !error && (
          <div style={styles.centerState}><span style={styles.spinner} />Checking clashSOL launch status…</div>
        )}

        {status && !available && (
          <div style={styles.pendingCard}>
            <div style={styles.pendingBadge}>LAUNCH PREPARATION</div>
            <h3 style={styles.pendingTitle}>clashSOL is being deployed with Sanctum</h3>
            <p style={styles.pendingCopy}>
              Sanctum reviews and deploys new LST pools before swaps can go live. This shop card will unlock automatically after the clashSOL mint is active.
            </p>
            <div style={styles.factGrid}>
              <div style={styles.fact}><strong>1</strong><span>Deposit SOL</span></div>
              <div style={styles.fact}><strong>2</strong><span>Receive clashSOL</span></div>
              <div style={styles.fact}><strong>3</strong><span>Stay liquid</span></div>
            </div>
            <a href={SANCTUM_LAUNCH_DOCS} target="_blank" rel="noreferrer" style={styles.docsLink}>How Sanctum LST launches work ↗</a>
          </div>
        )}

        {status && available && (
          <div style={styles.liveArea}>
            <div style={styles.marketStrip}>
              <span><b>clashSOL</b>{status.mint ? ` · ${shortAddress(status.mint)}` : ''}</span>
              <span style={styles.liveBadge}>LIVE</span>
              {apy && <span style={styles.apy}>{apy} APY</span>}
            </div>

            <label style={styles.inputLabel} htmlFor="clashsol-amount">You stake</label>
            <div style={styles.amountBox}>
              <input
                id="clashsol-amount"
                value={amount}
                onChange={event => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                style={styles.amountInput}
                disabled={busy || phase === 'success'}
                aria-label="SOL amount"
              />
              <span style={styles.currency}><img src="/tokens/SOL.svg" alt="" />SOL</span>
            </div>
            <div style={styles.presets}>
              {['0.1', '0.5', '1'].map(value => (
                <button type="button" key={value} style={styles.preset} disabled={busy || phase === 'success'} onClick={() => setAmount(value)}>{value} SOL</button>
              ))}
            </div>

            {order && (
              <div style={styles.quoteCard}>
                <div style={styles.quoteRow}><span>You receive</span><strong>≈ {formatTokenAtomics(order.outputAmount)} clashSOL</strong></div>
                <div style={styles.quoteRow}><span>Slippage</span><strong>{(Number(order.slippageBps) / 100).toFixed(2)}%</strong></div>
                <div style={styles.quoteRow}><span>Wallet</span><strong>{shortAddress(walletAddress)}</strong></div>
              </div>
            )}

            {!walletAddress && (
              <div style={styles.walletChoices}>
                <button type="button" style={styles.primaryButton} onClick={connectWallet}>Connect Solana wallet</button>
                {privy.enabled && !privy.authenticated && (
                  <button type="button" style={styles.secondaryButton} onClick={() => privy.login?.()}>Use email wallet</button>
                )}
              </div>
            )}
            {walletAddress && !order && phase !== 'success' && (
              <button type="button" style={styles.primaryButton} disabled={busy} onClick={reviewOrder}>
                {phase === 'quoting' ? 'Getting Sanctum quote…' : 'Review stake'}
              </button>
            )}
            {walletAddress && order && phase !== 'success' && (
              <button type="button" style={styles.primaryButton} disabled={busy} onClick={confirmOrder}>
                {phase === 'signing' ? 'Confirm in wallet…' : phase === 'submitting' ? 'Submitting…' : 'Stake SOL for clashSOL'}
              </button>
            )}
            {phase === 'success' && (
              <div style={styles.successCard}>
                <strong>clashSOL transaction submitted</strong>
                <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer">View on Solscan ↗</a>
              </div>
            )}
            <p style={styles.disclosure}>Rate and output come directly from Sanctum. Your wallet signs the exact reviewed transaction; Clash never receives your private key.</p>
          </div>
        )}

        {error && <div style={styles.error} role="alert">{error}</div>}
      </section>
    </div>
  );
}

export default SanctumLstPanel;

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1180, padding: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--terminal-overlay)', backdropFilter: 'blur(5px)', pointerEvents: 'all',
  },
  panel: {
    position: 'relative', width: 'min(560px, 100%)', maxHeight: 'min(760px, 92dvh)', overflowY: 'auto',
    padding: 'clamp(20px, 5vw, 32px)', borderRadius: 20, color: 'var(--terminal-text)',
    background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border)', boxShadow: '0 20px 60px var(--terminal-shadow)',
    fontFamily: '"Inter", "Segoe UI", sans-serif', boxSizing: 'border-box',
  },
  close: {
    ...uiIconButton('danger', 36), position: 'absolute', top: 12, right: 12, zIndex: 2,
    fontSize: 22, lineHeight: 1,
  },
  hero: { display: 'grid', gridTemplateColumns: '82px 1fr', gap: 18, alignItems: 'center', paddingRight: 28 },
  logoStack: { position: 'relative', width: 78, height: 78 },
  solLogo: { position: 'absolute', inset: 0, width: 62, height: 62, padding: 8, borderRadius: 16, background: '#171717', boxShadow: 'var(--terminal-shadow-card)' },
  clashLogo: { position: 'absolute', right: -2, bottom: -2, width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--terminal-border)', background: 'var(--terminal-surface)' },
  eyebrow: { color: 'var(--terminal-brand-text)', fontSize: 11, fontWeight: 700, letterSpacing: 1.1 },
  title: { margin: '5px 0 4px', fontSize: 'clamp(21px, 5vw, 29px)', lineHeight: 1.05, color: 'var(--terminal-text)' },
  subtitle: { margin: 0, fontSize: 13, lineHeight: 1.4, color: 'var(--terminal-text-secondary)', fontWeight: 600 },
  centerState: { minHeight: 210, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', color: 'var(--terminal-text-muted)', fontWeight: 600 },
  spinner: { width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--terminal-border-strong)', borderTopColor: 'var(--terminal-brand)', animation: 'spin 1s linear infinite' },
  pendingCard: { marginTop: 24, padding: 20, borderRadius: 16, background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', textAlign: 'center' },
  pendingBadge: { display: 'inline-block', padding: '5px 9px', borderRadius: 999, background: 'var(--terminal-brand-soft)', color: 'var(--terminal-brand-text)', fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  pendingTitle: { margin: '12px 0 7px', fontSize: 20, color: 'var(--terminal-text)' },
  pendingCopy: { margin: '0 auto', maxWidth: 440, color: 'var(--terminal-text-secondary)', fontSize: 13, fontWeight: 600, lineHeight: 1.45 },
  factGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 17 },
  fact: { padding: '11px 5px', borderRadius: 10, background: 'var(--terminal-surface-muted)', border: '1px solid var(--terminal-border)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--terminal-text-secondary)' },
  docsLink: { display: 'inline-block', marginTop: 16, color: 'var(--terminal-brand-text)', fontSize: 12, fontWeight: 600 },
  liveArea: { marginTop: 24 },
  marketStrip: { display: 'flex', alignItems: 'center', gap: 9, minHeight: 38, padding: '0 12px', borderRadius: 10, background: 'var(--terminal-surface-muted)', border: '1px solid var(--terminal-border)', fontSize: 12 },
  liveBadge: { padding: '3px 7px', borderRadius: 999, color: 'var(--terminal-long)', background: 'var(--terminal-long-soft)', fontWeight: 700, fontSize: 9 },
  apy: { marginLeft: 'auto', color: 'var(--terminal-long)', fontWeight: 700 },
  inputLabel: { display: 'block', margin: '18px 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--terminal-text-secondary)' },
  amountBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border-strong)', borderRadius: 10 },
  amountInput: { width: '100%', minWidth: 0, border: 0, outline: 0, background: 'transparent', fontSize: 27, fontWeight: 700, color: 'var(--terminal-text)' },
  currency: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' },
  presets: { display: 'flex', gap: 7, marginTop: 8 },
  preset: { ...uiButton('secondary', { flex: 1, minHeight: 34, height: 34, padding: '0 8px', fontSize: 11 }) },
  quoteCard: { marginTop: 14, padding: '11px 13px', borderRadius: 10, background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', display: 'grid', gap: 7 },
  quoteRow: { display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--terminal-text-secondary)', fontSize: 12 },
  primaryButton: { ...uiButton('primary', { width: '100%', minHeight: 44, marginTop: 15, padding: '12px 16px', fontSize: 14 }) },
  secondaryButton: { ...uiButton('secondary', { width: '100%', marginTop: 9, padding: 12 }) },
  walletChoices: { display: 'grid' },
  successCard: { marginTop: 15, padding: 15, borderRadius: 10, background: 'var(--terminal-long-soft)', color: 'var(--terminal-long)', border: '1px solid var(--terminal-long-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 13 },
  disclosure: { margin: '13px 3px 0', color: 'var(--terminal-text-muted)', fontSize: 11, fontWeight: 600, lineHeight: 1.35, textAlign: 'center' },
  error: { marginTop: 14, padding: '10px 12px', borderRadius: 10, color: 'var(--terminal-short-strong)', background: 'var(--terminal-short-soft)', border: '1px solid var(--terminal-short-border)', fontSize: 12, fontWeight: 600 },
};
