import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import '../dashboard/dashboard.css';
import './migration.css';
import { targetSymbol, targetRatio } from './target-asset';
import { t, migrationErrorText, migrationStateText } from './strings';
import { expiryMs, formatUnits, formatUtc, validRequest, maxMigrationAmount, maxMigrationHint, canRequoteExpiredDeposit, depositDefinitelyRejected, closingCountdown } from './model';
import { MigrationWalletPicker, MigrationWalletProvider } from './WalletConnection';
import { migrationApi as api, startMigrationPolling } from './transport';

function Migration() {
  const [status, setStatus] = useState(null), [account, setAccount] = useState(null), [session, setSession] = useState(null);
  const [amount, setAmount] = useState(''), [destination, setDestination] = useState(''), [quote, setQuote] = useState(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [now, setNow] = useState(Date.now());
  const [pendingSubmission, setPendingSubmission] = useState(null);
  const [walletMenu, setWalletMenu] = useState(false);
  const [walletPicker, setWalletPicker] = useState(false), [connectedAddress, setConnectedAddress] = useState('');
  const menuRef = useRef(null), menuTrigger = useRef(null);
  const generation = useRef(0), provider = useRef(null), locked = useRef(false), walletCleanup = useRef(() => {});
  const refreshSequence = useRef(0);
  const clear = () => { generation.current++; setSession(null); setAccount(null); setQuote(null); setConfirmed(false); setAmount(''); setPendingSubmission(null); setWalletMenu(false); };
  function showWalletMenu(event) { menuTrigger.current = event.currentTarget; setWalletMenu(true); }
  function closeWalletMenu(restore = true) { setWalletMenu(false); if (restore) menuTrigger.current?.focus(); }
  function chooseWallet() { closeWalletMenu(false); setWalletPicker(true); }
  async function disconnectWallet() { const wallet = provider.current; walletCleanup.current(); provider.current = null; setConnectedAddress(''); clear(); await wallet?.disconnect().catch(() => {}); menuTrigger.current?.focus(); }
  useEffect(() => {
    if (!walletMenu) return;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const outside = event => { if (!menuRef.current?.contains(event.target) && !menuTrigger.current?.contains(event.target)) setWalletMenu(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [walletMenu]);
  function menuKeys(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeWalletMenu(); }
    if (event.key === 'Tab') closeWalletMenu(false);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
      const current = items.indexOf(document.activeElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[index]?.focus();
    }
  }
  function failure(error) { if (error.status === 401) { clear(); setNotice(t('sessionExpired')); } else setNotice(error.migrationSafe ? error.message : error.code === 4001 ? t('verifyFailed') : t('failed')); }
  async function refresh(token = session?.token) {
    const epoch = generation.current, sequence = ++refreshSequence.current;
    // Account history must remain readable even while treasury readiness RPC fails.
    const [state, history] = await Promise.allSettled([api('/status'), token ? api('/account', token) : Promise.resolve(null)]);
    if (epoch !== generation.current || sequence !== refreshSequence.current) return;
    if (state.status === 'fulfilled') setStatus({ ...state.value, clockReceivedAt: performance.now() });
    else setStatus(previous => previous ? { ...previous, ready: false } : null);
    if (token) {
      if (history.status === 'rejected') throw history.reason;
      const info = history.value;
      setAccount(info);
      setQuote(previous => {
        const row = info.requests?.find(item => item.id === previous?.id);
        if (previous && row && row.status !== 'quoted') { setConfirmed(false); setPendingSubmission(null); return null; }
        const restored = info.activeQuote;
        if (restored && expiryMs(restored.expiresAt) > Date.now()) {
          if (previous?.id !== restored.id) setConfirmed(false);
          return restored;
        }
        return previous;
      });
    }
    if (state.status === 'rejected') throw state.reason;
  }
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    const epoch = generation.current;
    return startMigrationPolling(() => refresh(session?.token), {
      onError: error => { if (epoch === generation.current) failure(error); },
    });
  }, [session]); // Wallet verification stays in memory only.
  useEffect(() => { if (session?.expiresAt && expiryMs(session.expiresAt) <= now) { clear(); setNotice(t('sessionExpired')); } }, [session, now]);
  useEffect(() => () => { generation.current++; walletCleanup.current(); }, []);
  async function action(fn) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    try { await fn(); } catch (error) { failure(error); } finally { locked.current = false; setBusy(false); }
  }
  async function connect(wallet) {
    await action(async () => {
      clear();
      setConnectedAddress('');
      walletCleanup.current();
      if (!wallet) return;
      provider.current = wallet;
      const epoch = generation.current;
      let expectedAddress = wallet.publicKey?.toBase58() || '';
      const changed = key => {
        const nextAddress = key?.toBase58() || '';
        if (expectedAddress && nextAddress !== expectedAddress) { clear(); setNotice(t('changed')); }
        expectedAddress = nextAddress; setConnectedAddress(nextAddress);
      };
      const disconnected = () => { clear(); expectedAddress = ''; setConnectedAddress(''); setNotice(t('changed')); };
      wallet.on('connect', changed); wallet.on('disconnect', disconnected);
      walletCleanup.current = () => { wallet.off('connect', changed); wallet.off('disconnect', disconnected); };
      try { await wallet.connect(); } catch { setNotice(t('verifyFailed')); return; }
      const address = wallet.publicKey?.toBase58();
      if (!address || epoch !== generation.current) return;
      expectedAddress = address; setConnectedAddress(address);
      if (!wallet.signMessage || !wallet.signTransaction) { setNotice(t('walletUnsupported')); return; }
      const current = () => epoch === generation.current && wallet.publicKey?.toBase58() === address && provider.current === wallet;
      const challenge = await api('/challenge', null, { wallet: address });
      if (!current()) return;
      let signed;
      try { signed = await wallet.signMessage(new TextEncoder().encode(challenge.message)); }
      catch { if (current()) setNotice(t('verifyFailed')); return; }
      if (!current()) return;
      const auth = await api('/verify', null, { id: challenge.id, signature: Buffer.from(signed.signature || signed).toString('base64') });
      if (!current()) return;
      setSession(auth); await refresh(auth.token);
    });
  }
  async function review(event) {
    event.preventDefault();
    if (!validRequest(amount, destination, account, status.sourceDecimals)) { setNotice(t('invalid')); return; }
    await action(async () => {
      const epoch = generation.current;
      const result = await api('/quote', session.token, { amount, destination, idempotencyKey: crypto.randomUUID() });
      if (epoch === generation.current) { setQuote(result); setConfirmed(false); }
    });
  }
  async function submit() {
    if (!confirmed || !quote || pendingSubmission) return;
    if (!(expiryMs(quote.expiresAt) > Date.now())) { setNotice(t('expired')); return; }
    await action(async () => {
      const epoch = generation.current, active = session, pending = quote;
      if (provider.current?.publicKey?.toBase58() !== active.wallet) { clear(); return; }
      const tx = Transaction.from(Buffer.from(pending.transaction, 'base64'));
      const signed = await provider.current.signTransaction(tx);
      if (epoch !== generation.current || provider.current?.publicKey?.toBase58() !== active.wallet) return;
      if (!(expiryMs(pending.expiresAt) > Date.now())) { setNotice(t('expired')); return; }
      const payload = { id: pending.id, transaction: Buffer.from(signed.serialize({ requireAllSignatures: false })).toString('base64') };
      setPendingSubmission(payload); setConfirmed(false);
      let result;
      try { result = await api('/submit', active.token, payload); }
      catch (error) {
        if (epoch !== generation.current) return;
        if (error.status === 401) throw error;
        if (depositDefinitelyRejected(error)) setPendingSubmission(null);
        setNotice(error.migrationSafe ? error.message : t('checking'));
        await refresh(active.token);
        return;
      }
      if (epoch !== generation.current) return;
      setQuote(null); setPendingSubmission(null); setConfirmed(false); setNotice(result.status === 'expired' ? t('expired') : result.status === 'cancelled' ? migrationStateText('cancelled') : t('submitted')); await refresh(active.token);
    });
  }
  async function retrySubmission() {
    if (!pendingSubmission) return;
    await action(async () => {
      const epoch = generation.current, active = session;
      let result;
      try { result = await api('/submit', active.token, pendingSubmission); }
      catch (error) {
        if (epoch !== generation.current) return;
        if (depositDefinitelyRejected(error)) setPendingSubmission(null);
        throw error;
      }
      if (epoch !== generation.current) return;
      setQuote(null); setPendingSubmission(null); setConfirmed(false); setNotice(result.status === 'expired' ? t('expired') : result.status === 'cancelled' ? migrationStateText('cancelled') : t('submitted')); await refresh();
    });
  }
  async function cancelQuote() {
    await action(async () => {
      const epoch = generation.current;
      await api('/cancel', session.token, { id: quote.id });
      if (epoch !== generation.current) return;
      setQuote(null); setPendingSubmission(null); setConfirmed(false); await refresh();
    });
  }
  const serverNow = Number.isFinite(status?.serverTime) && Number.isFinite(status?.clockReceivedAt)
    ? status.serverTime + Math.max(0, performance.now() - status.clockReceivedAt) : now;
  const countdown = closingCountdown(status?.closesAt, serverNow);
  const available = status?.enabled && status?.ready && !countdown?.closed;
  const maxAmount = maxMigrationAmount(account, status?.sourceDecimals);
  const maxHint = session && !quote ? maxMigrationHint(account) : '';
  const expired = quote && !(expiryMs(quote.expiresAt) > now);
  function startReplacementQuote(row) {
    if (!canRequoteExpiredDeposit(row) || busy || !available || quote || pendingSubmission) return;
    setAmount(formatUnits(row.inputUnits, status?.sourceDecimals));
    setDestination(row.destination);
    setNotice(t('requoteReady'));
    document.getElementById('migration-amount')?.focus();
  }
  return <div className="dashboard-app migration-app">
    <a className="skip-link" href="#migration-main">Skip to migration</a>
    <header className="migration-header"><div className="migration-header-inner"><a className="migration-brand" href="/" aria-label={t('home')}><span className="migration-logo-crop"><img src="/splash-logo.png" alt=""/></span></a><div className="migration-wallet-control"><button className={session ? 'migration-wallet-button' : 'migration-primary'} aria-haspopup={connectedAddress ? 'menu' : 'dialog'} aria-expanded={connectedAddress ? walletMenu : walletPicker} disabled={busy && !connectedAddress} onClick={event => { if (connectedAddress) { if (walletMenu) closeWalletMenu(); else showWalletMenu(event); } else chooseWallet(); }}>{session ? `${session.wallet.slice(0, 5)}…${session.wallet.slice(-4)}` : connectedAddress ? t('verifyWallet') : busy ? t('busy') : t('connectWallet')}<span aria-hidden="true">{connectedAddress ? '⌄' : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8h18M16 13h5"/></svg>}</span></button>{walletMenu && <div ref={menuRef} id="migration-wallet-menu" className="migration-wallet-menu" role="menu" aria-label={t('walletActions')} onKeyDown={menuKeys}><p className="migration-menu-address">{connectedAddress}</p>{!session && <button role="menuitem" disabled={busy} onClick={() => { closeWalletMenu(); connect(provider.current); }}>{t('verifyWallet')}</button>}<button role="menuitem" disabled={busy} onClick={chooseWallet}>{t('changeWallet')}</button><button role="menuitem" onClick={disconnectWallet}>{t('disconnect')}</button></div>}</div></div></header>
    <MigrationWalletPicker open={walletPicker} onClose={() => setWalletPicker(false)} onChoose={connect} returnFocusRef={menuTrigger}/>
    <main id="migration-main" className="migration-shell">
      {countdown && <section className={'migration-countdown' + (countdown.closed ? ' is-closed' : '')} aria-label="Bridge closing time"><span>{countdown.closed ? 'Bridge is closed' : 'Bridge will close in'}</span><strong role="timer" aria-live="off">{countdown.text}</strong></section>}
      <div className="migration-intro"><p className="migration-eyebrow"><span className="migration-network"><img src="/tokens/SOL.svg" width="20" height="20" alt=""/>{t('sourceNetwork')}</span><span aria-hidden="true">→</span><span className="migration-network"><img src="/robinhood.svg" width="20" height="20" alt=""/>{t('destinationNetworkName')}</span></p><h1 className="migration-title"><img src="/icons/icon-192.png" width="48" height="48" alt=""/><span>{t('title')}</span></h1><p className="migration-muted">{t('intro')}</p>{targetSymbol(status?.targetToken) === 'USDG' && <p className="migration-muted">Temporary USDG payout mode: {targetRatio(status?.targetToken, status?.ratio)}. This is a fixed conversion rate, not a live market quote.</p>}</div>
      <div role="status" aria-live="polite" className="migration-notice">{notice}</div>
      <div className="migration-workspace"><section className="migration-card migration-form-card" aria-label="Migration form" aria-busy={busy}>
          <div className="migration-heading"><h2>{t('transfer')}</h2><span className="migration-token">CLASH</span></div>
          {session && <dl className="migration-balances">{['eligible', 'remaining', 'balance'].map((key, i) => <div key={key}><dt>{t(key)}</dt><dd>{formatUnits(account?.[['eligibleUnits','remainingUnits','balanceUnits'][i]], status?.sourceDecimals)} <span>CLASH</span></dd></div>)}</dl>}
          {maxHint && <p id="migration-max-hint" className="migration-muted" role="status">{t(maxHint)}</p>}
          {!quote ? <form onSubmit={review}><div className="migration-amount-control"><label htmlFor="migration-amount">{t('amount')}</label><div className="migration-amount-field"><input id="migration-amount" aria-label={t('amount')} inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required disabled={busy || !available || !session}/><div className="migration-amount-actions"><span aria-hidden="true">CLASH</span><button type="button" className="migration-max" aria-label={t('useMax')} disabled={busy || !available || !session || !maxAmount} onClick={() => setAmount(maxAmount)}>{t('max')}</button></div></div></div><label>{t('destination')}<input spellCheck="false" autoComplete="off" placeholder="0x…" value={destination} onChange={e => setDestination(e.target.value.trim())} required disabled={busy || !available || !session}/></label>{!session ? <><p className="migration-muted migration-connect-hint">{t('connectHint')}</p><button type="button" className="migration-primary migration-submit" disabled={busy} aria-haspopup={connectedAddress ? undefined : 'dialog'} onClick={() => connectedAddress ? connect(provider.current) : chooseWallet()}>{busy ? t('busy') : connectedAddress ? t('verifyWallet') : t('connectWallet')}</button></> : <button className="migration-primary migration-submit" disabled={busy || !available || !account || !validRequest(amount, destination, account, status?.sourceDecimals)}>{busy ? t('busy') : t('review')}</button>}</form> : <div className="migration-review">
            <h2>{t('review')}</h2><dl>{[[t('amount'), formatUnits(quote.inputUnits, status.sourceDecimals) + ' CLASH'], [t('receive'), formatUnits(quote.outputUnits, quote.targetDecimals) + ' ' + targetSymbol(quote.targetToken)], [t('destination'), quote.destination], [t('source'), quote.sourceMint], [t('target'), quote.targetToken], [t('solFee'), formatUnits(quote.feeLamports, 9) + ' SOL'], [t('expires'), new Date(expiryMs(quote.expiresAt)).toLocaleString()]].map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
            <p className="migration-muted">{t('gas')}</p><label className="migration-checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/>{t('confirm')}</label>
            {expired && <p role="alert">{t('expired')}</p>}{pendingSubmission && <p role="status">{t('checking')}</p>}<div className="migration-actions">{pendingSubmission ? <button disabled={busy || !available} onClick={retrySubmission}>{t('retrySubmission')}</button> : <button className="migration-primary" disabled={busy || !confirmed || expired || !available} onClick={submit}>{busy ? t('busy') : t('send')}</button>}<button disabled={busy || !!pendingSubmission} onClick={cancelQuote}>{t('cancel')}</button></div>
          </div>}
      </section>
      <aside className="migration-card migration-details" aria-label="Migration availability"><h2>{t('details')}</h2><p className={'migration-availability' + (available ? ' is-ready' : '')}><span aria-hidden="true"/>{!status ? t('loading') : available ? t('ready') : t('paused')}</p><dl className="migration-facts"><div><dt>{t('ratio')}</dt><dd>{targetRatio(status?.targetToken, status?.ratio || '1')}</dd></div><div><dt>{t('fee')}</dt><dd>${status?.feeUsd || '2'} <span>in SOL</span></dd></div><div><dt>{t('network')}</dt><dd>Robinhood <span>Mainnet</span></dd></div><div><dt>{t(status?.snapshot?.requestedAt != null ? 'snapshotCutoff' : 'snapshot')}</dt><dd>{status?.snapshot?.requestedAt != null ? formatUtc(status.snapshot.requestedAt) : status?.snapshot?.slot || t('unavailable')}</dd></div></dl><p className="migration-muted migration-disclosure">{t('custody')}</p><p className="migration-muted migration-disclosure">{t('gas')}</p></aside></div>
      {session && <section className="migration-card"><div className="migration-heading"><h2>{t('history')}</h2><button disabled={busy} onClick={() => action(() => refresh())}>{t('refresh')}</button></div>{!account?.requests?.length ? <p className="migration-muted">{t('empty')}</p> : account.requests.map(row => <article className="migration-request" key={row.id}><strong>{formatUnits(row.inputUnits, status?.sourceDecimals)} CLASH → {formatUnits(row.outputUnits, row.targetDecimals)} {targetSymbol(row.targetToken)}</strong><p>{migrationStateText(row.status, row.payoutIncludedAt)}</p><code>{row.destination}</code><small>{row.id}</small>{row.depositHash && <a target="_blank" rel="noopener noreferrer" href={'https://solscan.io/tx/' + encodeURIComponent(row.depositHash)}>{t('deposit')}</a>}{row.payoutHash && <p>{t('payout')}: <code>{row.payoutHash}</code></p>}{row.errorCode && <p>{migrationErrorText(row.errorCode)}</p>}{canRequoteExpiredDeposit(row) && <button type="button" disabled={busy || !available || !!quote || !!pendingSubmission} onClick={() => startReplacementQuote(row)}>{t('createNewQuote')}</button>}</article>)}</section>}
      <footer className="migration-footer"><span>Clash of Perps</span><a href="/dashboard">{t('stats')} ↗</a></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('migration-root')).render(<MigrationWalletProvider><Migration/></MigrationWalletProvider>);
